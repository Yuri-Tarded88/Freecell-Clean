/* FreeCell rules: pure logic, no DOM. Runs in the page, in a Web Worker and in Node. */
(function (root) {
  'use strict';
  const FC = (root.FC = root.FC || {});

  // zones
  const COL = 0, FREE = 1, FOUND = 2;
  // suit order follows the Microsoft deal: 0 clubs, 1 diamonds, 2 hearts, 3 spades
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
  // Games from the 32,000 Microsoft deals are all winnable except #11982.
  const MAX_DEAL = 32000, UNWINNABLE = 11982;

  const rank = (c) => c >> 2;
  const suit = (c) => c & 3;
  const isRed = (c) => { const s = c & 3; return s === 1 || s === 2; };
  const canStack = (onto, card) => rank(onto) === rank(card) + 1 && isRed(onto) !== isRed(card);
  const cardName = (c) => (RANKS[rank(c)] === '10' ? 'T' : RANKS[rank(c)]) + 'CDHS'[suit(c)];
  const mv = (fz, fi, tz, ti, n) => ({ from: { z: fz, i: fi }, to: { z: tz, i: ti }, n: n });

  // Microsoft FreeCell deal. Returns 8 columns of card ids (rank * 4 + suit).
  function deal(num) {
    const deck = [];
    for (let i = 0; i < 52; i++) deck.push(i);
    let seed = num >>> 0;
    const cols = [[], [], [], [], [], [], [], []];
    let left = 52;
    for (let i = 0; i < 52; i++) {
      seed = (Math.imul(seed, 214013) + 2531011) >>> 0;
      const j = ((seed >>> 16) & 0x7fff) % left;
      cols[i % 8].push(deck[j]);
      deck[j] = deck[--left];
    }
    return cols;
  }

  function randomDealNumber(avoid) {
    let n;
    do { n = 1 + Math.floor(Math.random() * MAX_DEAL); } while (n === UNWINNABLE || n === avoid);
    return n;
  }

  const newState = (cols) => ({ cols: cols.map((c) => c.slice()), free: [-1, -1, -1, -1], found: [0, 0, 0, 0] });
  const clone = (st) => ({ cols: st.cols.map((c) => c.slice()), free: st.free.slice(), found: st.found.slice() });
  const isWon = (st) => st.found[0] + st.found[1] + st.found[2] + st.found[3] === 52;

  function runLength(col) {
    const n = col.length;
    if (!n) return 0;
    let k = 1;
    while (k < n && canStack(col[n - k - 1], col[n - k])) k++;
    return k;
  }
  const countFree = (st) => st.free.reduce((a, c) => a + (c < 0 ? 1 : 0), 0);
  const countEmptyCols = (st) => st.cols.reduce((a, c) => a + (c.length ? 0 : 1), 0);
  // How many cards can be carried in one go: (free cells + 1) * 2^(empty columns)
  const maxMovable = (freeCells, emptyCols) => (freeCells + 1) * (1 << emptyCols);
  const capacity = (st, toEmptyCol) => maxMovable(countFree(st), countEmptyCols(st) - (toEmptyCol ? 1 : 0));

  // Returns null when the move is legal, otherwise a short reason code.
  function check(st, m) {
    const from = m.from, to = m.to, n = m.n;
    let first;
    if (from.z === COL) {
      const col = st.cols[from.i];
      if (!col || n < 1 || n > col.length) return 'invalid';
      if (n > runLength(col)) return 'order';
      first = col[col.length - n];
    } else if (from.z === FREE) {
      first = st.free[from.i];
      if (first == null || first < 0 || n !== 1) return 'invalid';
    } else return 'invalid';

    if (to.z === FOUND) {
      return n === 1 && suit(first) === to.i && st.found[to.i] === rank(first) ? null : 'foundation';
    }
    if (to.z === FREE) return n === 1 && st.free[to.i] === -1 ? null : 'cell';
    if (to.z === COL) {
      if (from.z === COL && from.i === to.i) return 'same';
      const dest = st.cols[to.i];
      if (dest.length && !canStack(dest[dest.length - 1], first)) return 'stack';
      if (n > capacity(st, dest.length === 0)) return 'capacity';
      return null;
    }
    return 'invalid';
  }

  // Returns a NEW state (states are treated as immutable by the app).
  function apply(st, m) {
    const s = clone(st);
    let cards;
    if (m.from.z === COL) {
      const col = s.cols[m.from.i];
      cards = col.splice(col.length - m.n, m.n);
    } else {
      cards = [s.free[m.from.i]];
      s.free[m.from.i] = -1;
    }
    if (m.to.z === COL) for (const c of cards) s.cols[m.to.i].push(c);
    else if (m.to.z === FREE) s.free[m.to.i] = cards[0];
    else s.found[m.to.i]++;
    return s;
  }

  // Can this card go to its foundation right now, and is it certain nobody needs it
  // as a parent in the tableau any more? Aces and twos are always safe.
  function safeToFoundation(found, card) {
    const r = rank(card);
    if (found[suit(card)] !== r) return false;
    if (r <= 1) return true;
    const red = isRed(card);
    return found[red ? 0 : 1] >= r && found[red ? 3 : 2] >= r;
  }

  function findAutoMove(st, safeOnly) {
    const ok = (card) => (safeOnly === false ? st.found[suit(card)] === rank(card) : safeToFoundation(st.found, card));
    for (let i = 0; i < 8; i++) {
      const c = st.cols[i];
      if (c.length && ok(c[c.length - 1])) return mv(COL, i, FOUND, suit(c[c.length - 1]), 1);
    }
    for (let i = 0; i < 4; i++) {
      const card = st.free[i];
      if (card >= 0 && ok(card)) return mv(FREE, i, FOUND, suit(card), 1);
    }
    return null;
  }
  const findFoundationMove = (st) => findAutoMove(st, false);

  // When every column is strictly descending from top to bottom the deal is won:
  // the next card each foundation needs is always on the bottom of a column or in a cell.
  function canAutoFinish(st) {
    for (const col of st.cols) for (let k = 1; k < col.length; k++) if (rank(col[k]) > rank(col[k - 1])) return false;
    return true;
  }

  function listMoves(st) {
    const out = [];
    const freeIdx = st.free.indexOf(-1);
    const emptyCol = st.cols.findIndex((c) => c.length === 0);
    for (let i = 0; i < 8; i++) {
      const c = st.cols[i];
      if (c.length) { const card = c[c.length - 1]; if (st.found[suit(card)] === rank(card)) out.push(mv(COL, i, FOUND, suit(card), 1)); }
    }
    for (let i = 0; i < 4; i++) {
      const card = st.free[i];
      if (card < 0) continue;
      if (st.found[suit(card)] === rank(card)) out.push(mv(FREE, i, FOUND, suit(card), 1));
      for (let j = 0; j < 8; j++) {
        const d = st.cols[j];
        if (d.length ? canStack(d[d.length - 1], card) : j === emptyCol) out.push(mv(FREE, i, COL, j, 1));
      }
    }
    for (let i = 0; i < 8; i++) {
      const s = st.cols[i];
      if (!s.length) continue;
      const run = runLength(s);
      for (let j = 0; j < 8; j++) {
        if (j === i) continue;
        const d = st.cols[j];
        if (d.length) {
          const t = d[d.length - 1], cap = capacity(st, false);
          for (let n = 1; n <= run && n <= cap; n++) if (canStack(t, s[s.length - n])) { out.push(mv(COL, i, COL, j, n)); break; }
        } else if (j === emptyCol) {
          const cap = capacity(st, true);
          for (let n = 1; n <= run && n <= cap; n++) if (n < s.length) out.push(mv(COL, i, COL, j, n));
        }
      }
      if (freeIdx >= 0) out.push(mv(COL, i, FREE, freeIdx, 1));
    }
    return out;
  }
  const hasMoves = (st) => listMoves(st).length > 0;

  // Position-exact key (column order matters) used to follow a cached solution.
  function exactKey(st) {
    return st.cols.map((c) => c.join('.')).join('|') + '#' + st.free.filter((c) => c >= 0).sort((a, b) => a - b).join('.') + '#' + st.found.join('.');
  }

  // Turn the solver's main moves into the full list of single moves the player will see,
  // including the safe foundation moves that follow each one.
  function planToMoves(st, mains) {
    const out = [];
    let cur = st;
    const flush = () => { let m; while ((m = findAutoMove(cur))) { out.push(m); cur = apply(cur, m); } };
    flush();
    for (const m of mains) {
      const r = mv(m.from.z, m.from.i, m.to.z, m.to.i, m.n);
      if (m.from.z === FREE) r.from.i = cur.free.indexOf(m.from.card);
      if (m.to.z === FREE) r.to.i = cur.free.indexOf(-1);
      out.push(r);
      cur = apply(cur, r);
      flush();
    }
    return out;
  }

  Object.assign(FC, {
    COL, FREE, FOUND, RANKS, SUITS, MAX_DEAL, UNWINNABLE,
    rank, suit, isRed, canStack, cardName, mv,
    deal, randomDealNumber, newState, clone, isWon, runLength, countFree, countEmptyCols,
    maxMovable, capacity, check, apply, safeToFoundation, findAutoMove, findFoundationMove,
    canAutoFinish, listMoves, hasMoves, exactKey, planToMoves
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = FC;
})(typeof self !== 'undefined' ? self : globalThis);
