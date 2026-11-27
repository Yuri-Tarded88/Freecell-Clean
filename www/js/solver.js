/* FreeCell solver used for hints. Weighted best-first search over canonical states.
   Needs rules.js loaded first. Runs in a Web Worker (see solver-worker.js), or in Node for tests. */
(function (root) {
  'use strict';
  const FC = root.FC;
  const COL = FC.COL, FREE = FC.FREE, FOUND = FC.FOUND;
  const safe = FC.safeToFoundation;

  const CH = [];
  for (let i = 0; i < 64; i++) CH.push(String.fromCharCode(48 + i));
  const colKey = (a) => { let s = ''; for (let i = 0; i < a.length; i++) s += CH[a[i]]; return s; };
  const stack = (onto, card) => (onto >> 2) === (card >> 2) + 1 && (((onto & 3) ^ ((onto & 3) >> 1)) & 1) !== (((card & 3) ^ ((card & 3) >> 1)) & 1);
  const red = (c) => ((c & 3) ^ ((c & 3) >> 1)) & 1;

  // search weights: f = G * g + H * h. Different weightings crack different deals,
  // so solve() tries a small portfolio of them with growing budgets.
  const BASE = { G: 1, H: 4, cards: 10, blocked: 2, buried: 3, cell: 3, empty: 5 };
  const PORTFOLIO = [
    {},
    { H: 1 },
    { H: 2 },
    { blocked: 0, buried: 6 },
    { cards: 5, cell: 1.5, empty: 2 },
    { cards: 4, blocked: 5, buried: 1, cell: 2, empty: 3 },
    { H: 12, buried: 1 }
  ].map((o) => Object.assign({}, BASE, o));
  const BUDGETS = [8000, 40000, 150000];
  let P = PORTFOLIO[0];

  function fromUi(st) {
    const cols = st.cols.map((c) => { const a = c.slice(); a.k = colKey(a); return a; });
    return { cols: cols, free: st.free.filter((c) => c >= 0).sort((a, b) => a - b), found: st.found.slice() };
  }
  function keyOf(s) {
    const ks = new Array(8);
    for (let i = 0; i < 8; i++) ks[i] = s.cols[i].k;
    ks.sort();
    let f = '';
    for (let i = 0; i < s.free.length; i++) f += CH[s.free[i]];
    return f + '|' + CH[s.found[0]] + CH[s.found[1]] + CH[s.found[2]] + CH[s.found[3]] + '|' + ks.join(',');
  }

  // apply every safe foundation move (the closure is order independent)
  function normalize(s) {
    let ownF = false, ownFr = false;
    for (;;) {
      let moved = false;
      for (let i = 0; i < 8; i++) {
        const a = s.cols[i], n = a.length;
        if (n && safe(s.found, a[n - 1])) {
          if (!ownF) { s.found = s.found.slice(); ownF = true; }
          s.found[a[n - 1] & 3]++;
          const na = a.slice(0, n - 1);
          na.k = a.k.slice(0, n - 1);
          s.cols[i] = na;
          moved = true;
        }
      }
      for (let k = s.free.length - 1; k >= 0; k--) {
        if (safe(s.found, s.free[k])) {
          if (!ownF) { s.found = s.found.slice(); ownF = true; }
          s.found[s.free[k] & 3]++;
          if (!ownFr) { s.free = s.free.slice(); ownFr = true; }
          s.free.splice(k, 1);
          moved = true;
        }
      }
      if (!moved) return s;
    }
  }

  function heur(s) {
    const f = s.found, cols = s.cols;
    let h = (52 - f[0] - f[1] - f[2] - f[3]) * P.cards + s.free.length * P.cell;
    let blocked = 0, buried = 0, empty = 0;
    for (let c = 0; c < 8; c++) {
      const a = cols[c], n = a.length;
      if (!n) { empty++; continue; }
      let maxBelow = -1;
      for (let i = n - 1; i >= 0; i--) {
        const card = a[i], r = card >> 2;
        if (maxBelow > r) blocked++;
        if (r > maxBelow) maxBelow = r;
        if (r === f[card & 3]) buried += n - 1 - i;
      }
    }
    return h + blocked * P.blocked + buried * P.buried - empty * P.empty;
  }

  const encode = (fz, fi, tz, ti, n) => fz | (fi << 2) | (tz << 8) | (ti << 10) | (n << 14);
  function decode(e) {
    const m = { from: { z: e & 3, i: (e >> 2) & 63 }, to: { z: (e >> 8) & 3, i: (e >> 10) & 15 }, n: (e >> 14) & 31 };
    if (m.from.z === FREE) m.from.card = m.from.i;
    return m;
  }

  function insertSorted(free, card) {
    const nf = free.slice();
    let i = nf.length;
    nf.push(card);
    while (i > 0 && nf[i - 1] > card) { nf[i] = nf[i - 1]; i--; }
    nf[i] = card;
    return nf;
  }
  function withoutIndex(free, k) { const nf = free.slice(); nf.splice(k, 1); return nf; }

  function expand(s, emit) {
    const cols = s.cols, free = s.free, found = s.found;
    const nFree = 4 - free.length;
    let nEmpty = 0, firstEmpty = -1;
    for (let i = 0; i < 8; i++) if (!cols[i].length) { nEmpty++; if (firstEmpty < 0) firstEmpty = i; }

    for (let i = 0; i < 8; i++) {
      const a = cols[i], n = a.length;
      if (!n) continue;
      const card = a[n - 1], su = card & 3;
      // to foundation (only the not-quite-safe ones are left after normalizing)
      if (found[su] === (card >> 2)) {
        const nc = cols.slice(), na = a.slice(0, n - 1);
        na.k = a.k.slice(0, n - 1);
        nc[i] = na;
        const nfd = found.slice();
        nfd[su]++;
        emit({ cols: nc, free: free, found: nfd }, encode(COL, i, FOUND, su, 1));
      }
      // longest ordered run at the bottom of this column
      let run = 1;
      while (run < n && stack(a[n - run - 1], a[n - run])) run++;
      const br = card >> 2;
      for (let j = 0; j < 8; j++) {
        if (j === i) continue;
        const d = cols[j];
        let k = 0, lim = 0;
        if (d.length) {
          const t = d[d.length - 1];
          k = (t >> 2) - br;
          if (k < 1 || k > run || red(a[n - k]) === red(t) || k > ((nFree + 1) << nEmpty)) continue;
          lim = k;
        } else if (j === firstEmpty) {
          k = 1;
          lim = Math.min(run, (nFree + 1) << (nEmpty - 1), n - 1);
        } else continue;
        for (; k <= lim; k++) {
          const nc = cols.slice(), na = a.slice(0, n - k), nd = d.concat(a.slice(n - k));
          na.k = a.k.slice(0, n - k);
          nd.k = d.k + a.k.slice(n - k);
          nc[i] = na; nc[j] = nd;
          emit({ cols: nc, free: free, found: found }, encode(COL, i, COL, j, k));
        }
      }
      // to a free cell
      if (nFree > 0) {
        const nc = cols.slice(), na = a.slice(0, n - 1);
        na.k = a.k.slice(0, n - 1);
        nc[i] = na;
        emit({ cols: nc, free: insertSorted(free, card), found: found }, encode(COL, i, FREE, 0, 1));
      }
    }
    for (let k = 0; k < free.length; k++) {
      const card = free[k], su = card & 3;
      if (found[su] === (card >> 2)) {
        const nfd = found.slice();
        nfd[su]++;
        emit({ cols: cols.slice(), free: withoutIndex(free, k), found: nfd }, encode(FREE, card, FOUND, su, 1));
      }
      for (let j = 0; j < 8; j++) {
        const d = cols[j];
        if (d.length ? !stack(d[d.length - 1], card) : j !== firstEmpty) continue;
        const nc = cols.slice(), nd = d.concat(card);
        nd.k = d.k + CH[card];
        nc[j] = nd;
        emit({ cols: nc, free: withoutIndex(free, k), found: found }, encode(FREE, card, COL, j, 1));
      }
    }
  }

  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(x) {
      const a = this.a;
      let i = a.length;
      a.push(x);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p].f <= x.f) break;
        a[i] = a[p]; i = p;
      }
      a[i] = x;
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        let i = 0;
        const n = a.length;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && a[c + 1].f < a[c].f) c++;
          if (a[c].f >= last.f) break;
          a[i] = a[c]; i = c;
        }
        a[i] = last;
      }
      return top;
    }
  }

  function solveOnce(st, params, maxNodes, deadline) {
    P = params;
    const t0 = Date.now();
    const start = normalize(fromUi(st));
    const seen = new Map([[keyOf(start), 0]]);
    const parent = [-1], moveOf = [0];
    const heap = new Heap();
    const h0 = heur(start);
    heap.push({ f: h0 * P.H, h: h0, g: 0, s: start, id: 0 });
    let best = { h: h0, id: 0 }, nodes = 0, solvedId = -1;

    const path = (id) => {
      const out = [];
      for (; id > 0; id = parent[id]) out.push(decode(moveOf[id]));
      return out.reverse();
    };

    while (heap.size) {
      const cur = heap.pop();
      nodes++;
      const f = cur.s.found;
      if (f[0] + f[1] + f[2] + f[3] === 52) { solvedId = cur.id; break; }
      if (cur.h < best.h) best = { h: cur.h, id: cur.id };
      if (nodes >= maxNodes || ((nodes & 127) === 0 && Date.now() > deadline)) break;
      expand(cur.s, (child, enc) => {
        normalize(child);
        const key = keyOf(child);
        if (seen.has(key)) return;
        const id = parent.length;
        seen.set(key, id);
        parent.push(cur.id);
        moveOf.push(enc);
        const g = cur.g + 1, h = heur(child);
        heap.push({ f: P.G * g + P.H * h, h: h, g: g, s: child, id: id });
      });
      cur.s = null;
    }
    const ms = Date.now() - t0;
    if (solvedId >= 0) return { status: 'solved', moves: path(solvedId), nodes: nodes, ms: ms };
    if (!heap.size) return { status: 'unsolvable', moves: [], nodes: nodes, ms: ms };
    const p = path(best.id);
    return { status: p.length ? 'partial' : 'none', moves: p, nodes: nodes, ms: ms };
  }

  /* solve(state, {maxNodes, maxMs}) ->
       { status: 'solved' | 'partial' | 'unsolvable' | 'none', moves: [main moves], nodes, ms }
     'unsolvable' is exact: the whole reachable space was searched.
     'partial' means the budget ran out; moves lead to the most promising position found. */
  function solve(st, opts) {
    opts = opts || {};
    const maxNodes = opts.maxNodes || 300000;
    const t0 = Date.now(), deadline = t0 + (opts.maxMs || 8000);
    let used = 0, fallback = null;
    for (let round = 0; used < maxNodes && Date.now() < deadline; round++) {
      const budget = BUDGETS[Math.min(round, BUDGETS.length - 1)];
      for (let k = 0; k < PORTFOLIO.length && used < maxNodes && Date.now() < deadline; k++) {
        const r = solveOnce(st, PORTFOLIO[k], Math.min(budget, maxNodes - used), deadline);
        used += r.nodes;
        if (r.status === 'solved' || r.status === 'unsolvable') { r.nodes = used; r.ms = Date.now() - t0; return r; }
        if (k === 0) fallback = r;
      }
    }
    fallback = fallback || { status: 'none', moves: [] };
    fallback.nodes = used;
    fallback.ms = Date.now() - t0;
    return fallback;
  }

  FC.solve = solve;
  if (typeof module !== 'undefined' && module.exports) module.exports = FC;
})(typeof self !== 'undefined' ? self : globalThis);
