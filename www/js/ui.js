/* Board: draws the 52 cards, lays them out for the current state, handles drag and tap. */
(function (root) {
  'use strict';
  const FC = root.FC;
  const COL = FC.COL, FREE = FC.FREE, FOUND = FC.FOUND;
  const FOUND_ORDER = [3, 2, 0, 1]; // foundation slots left to right: spades, hearts, clubs, diamonds
  const FOUND_SLOT = [2, 3, 1, 0];  // suit -> slot index

  const Board = { el: null, h: {}, cards: [], slots: { free: [], found: [], col: [] }, m: null, state: null, pos: [], off: [], locked: false, drag: null, hintEls: [] };

  const overlap = (ax, ay, aw, ah, bx, by, bw, bh) => {
    const w = Math.min(ax + aw, bx + bw) - Math.max(ax, bx), h = Math.min(ay + ah, by + bh) - Math.max(ay, by);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const put = (el, x, y) => { el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; };

  Board.init = function (el, handlers) {
    this.el = el;
    this.h = handlers || {};
    const slot = (cls, suit) => {
      const d = document.createElement('div');
      d.className = 'slot ' + cls;
      if (suit != null) d.innerHTML = '<span class="ghost">' + FC.suitIcon(suit) + '</span>';
      el.appendChild(d);
      return d;
    };
    for (let i = 0; i < 4; i++) this.slots.free.push(slot('free'));
    for (let k = 0; k < 4; k++) this.slots.found[FOUND_ORDER[k]] = slot('found', FOUND_ORDER[k]);
    for (let i = 0; i < 8; i++) this.slots.col.push(slot('col'));
    for (let c = 0; c < 52; c++) {
      const d = document.createElement('div');
      d.className = 'card s' + (c & 3);
      d.dataset.id = c;
      d.innerHTML = FC.cardSVG(c);
      el.appendChild(d);
      this.cards[c] = d;
    }
    this.bind();
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(el);
    window.addEventListener('resize', () => this.resize());
  };

  Board.colX = function (i) { return this.m.x0 + i * (this.m.cw + this.m.gap); };

  Board.resize = function () {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (!W || !H) return;
    if (this.m && this.m.W === W && this.m.H === H) return;
    const gap = Math.max(3, Math.min(12, Math.round(W * 0.013)));
    let cw = Math.min(Math.floor((W - gap * 9) / 8), 132);
    const fits = (w) => { const h = Math.round(w * 1.42); return gap + h + gap * 2.2 + h + 12 * Math.max(15, h * 0.2) <= H; };
    while (cw > 26 && !fits(cw)) cw--;
    const ch = Math.round(cw * 1.42);
    const m = (this.m = { W: W, H: H, gap: gap, cw: cw, ch: ch, x0: Math.round((W - (8 * cw + 7 * gap)) / 2), topY: gap, tabY: Math.round(gap + ch + gap * 2.2) });
    this.el.style.setProperty('--cw', cw + 'px');
    this.el.style.setProperty('--ch', ch + 'px');
    this.slots.free.forEach((s, i) => put(s, this.colX(i), m.topY));
    for (let s = 0; s < 4; s++) put(this.slots.found[s], this.colX(4 + FOUND_SLOT[s]), m.topY);
    this.slots.col.forEach((s, i) => put(s, this.colX(i), m.tabY));
    if (this.state) this.layout(this.state, { instant: true });
  };

  Board.layout = function (st, opts) {
    opts = opts || {};
    this.state = st;
    const m = this.m;
    if (!m) return;
    const board = this.el, pos = this.pos, still = opts.instant;
    if (still) board.classList.add('noanim');
    const place = (card, x, y, z, delay) => {
      const el = this.cards[card], p = pos[card];
      el.style.transitionDelay = delay ? delay + 'ms' : '';
      if (p && p.x === x && p.y === y) { if (p.z !== z) { p.z = z; el.style.zIndex = z; } return; }
      pos[card] = { x: x, y: y, z: z };
      put(el, x, y);
      if (p && !still && !opts.deal) {
        el.style.zIndex = 300 + z; // keep a moving card above the piles it passes over
        clearTimeout(el._zt);
        el._zt = setTimeout(() => { el.style.zIndex = pos[card].z; }, 340);
      } else el.style.zIndex = z;
    };
    for (let i = 0; i < 4; i++) if (st.free[i] >= 0) place(st.free[i], this.colX(i), m.topY, 10, 0);
    for (let s = 0; s < 4; s++) for (let r = 0; r < st.found[s]; r++) place((r << 2) | s, this.colX(4 + FOUND_SLOT[s]), m.topY, 10 + r, 0);
    const avail = m.H - m.tabY - m.ch - 4, maxOff = Math.round(m.ch * 0.55);
    for (let i = 0; i < 8; i++) {
      const col = st.cols[i], n = col.length;
      const off = (this.off[i] = n > 1 ? Math.max(8, Math.min(maxOff, Math.floor(avail / (n - 1)))) : maxOff);
      for (let j = 0; j < n; j++) place(col[j], this.colX(i), m.tabY + j * off, 20 + j, opts.deal ? (j * 8 + i) * 16 : 0);
    }
    if (still) { void board.offsetWidth; board.classList.remove('noanim'); }
  };

  // Cards fly in from above the board, one by one, in dealing order.
  Board.deal = function (st) {
    const m = this.m;
    if (!m) { this.state = st; return; }
    this.el.classList.add('noanim');
    for (let c = 0; c < 52; c++) {
      const el = this.cards[c];
      el.style.transitionDelay = '';
      this.pos[c] = { x: Math.round(m.W / 2 - m.cw / 2), y: -m.ch - 10, z: 0 };
      put(el, this.pos[c].x, this.pos[c].y);
    }
    void this.el.offsetWidth;
    this.el.classList.remove('noanim');
    this.layout(st, { deal: true });
  };

  Board.locate = function (card) {
    const st = this.state;
    for (let i = 0; i < 8; i++) { const p = st.cols[i].indexOf(card); if (p >= 0) return { z: COL, i: i, p: p }; }
    const f = st.free.indexOf(card);
    if (f >= 0) return { z: FREE, i: f };
    return st.found[card & 3] > (card >> 2) ? { z: FOUND, i: card & 3 } : null;
  };

  Board.findDrop = function (group, dx, dy) {
    const m = this.m, st = this.state, n = group.length, loc = this.locate(group[0]);
    const p0 = this.pos[group[0]], rx = p0.x + dx, ry = p0.y + dy;
    const from = { z: loc.z, i: loc.i };
    let best = null, bestA = 0, fail = null, failA = 0;
    const consider = (to, x, y, w, h) => {
      const a = overlap(rx, ry, m.cw, m.ch, x, y, w, h);
      if (!a) return;
      const mv = { from: from, to: to, n: n }, why = FC.check(st, mv);
      if (!why) { if (a > bestA) { bestA = a; best = mv; } } else if (a > failA) { failA = a; fail = why; }
    };
    if (n === 1) {
      for (let i = 0; i < 4; i++) consider({ z: FREE, i: i }, this.colX(i), m.topY, m.cw, m.ch);
      for (let s = 0; s < 4; s++) consider({ z: FOUND, i: s }, this.colX(4 + FOUND_SLOT[s]), m.topY, m.cw, m.ch);
    }
    for (let j = 0; j < 8; j++) consider({ z: COL, i: j }, this.colX(j), m.tabY, m.cw, m.H - m.tabY);
    const need = m.cw * m.ch * 0.2;
    if (best && bestA >= need) return { move: best };
    return failA >= need * 1.5 ? { fail: fail, n: n } : null;
  };

  Board.snapBack = function (group) {
    group.forEach((c) => {
      const el = this.cards[c], p = this.pos[c];
      el.classList.remove('dragging');
      put(el, p.x, p.y);
      el.style.zIndex = 300 + p.z;
      clearTimeout(el._zt);
      el._zt = setTimeout(() => { el.style.zIndex = p.z; }, 340);
    });
  };

  Board.bind = function () {
    const el = this.el;
    el.addEventListener('pointerdown', (e) => {
      if (this.locked || this.drag || e.button > 0) return;
      const t = e.target.closest ? e.target.closest('.card') : null;
      if (this.h.onBlank) this.h.onBlank();
      if (!t) return;
      const card = +t.dataset.id, loc = this.locate(card);
      if (!loc) return;
      let group = null;
      if (loc.z === COL) {
        const col = this.state.cols[loc.i];
        if (col.length - loc.p <= FC.runLength(col)) group = col.slice(loc.p);
      } else if (loc.z === FREE) group = [card];
      this.drag = { id: e.pointerId, card: card, loc: loc, group: group, sx: e.clientX, sy: e.clientY, on: false, dx: 0, dy: 0 };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    el.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!d.on) {
        if (!d.group || Math.hypot(dx, dy) < 8) return;
        d.on = true;
        d.group.forEach((c, k) => { const n = this.cards[c]; n.classList.add('dragging'); n.style.zIndex = 1000 + k; clearTimeout(n._zt); });
      }
      d.dx = dx; d.dy = dy;
      d.group.forEach((c) => { const p = this.pos[c]; put(this.cards[c], p.x + dx, p.y + dy); });
      e.preventDefault();
    });
    const end = (e, cancel) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      try { el.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (!d.on) { if (!cancel && this.h.onTap) this.h.onTap(d.loc, d.group, d.card); return; }
      const res = cancel ? null : this.findDrop(d.group, d.dx, d.dy);
      if (res && res.move) {
        d.group.forEach((c) => this.cards[c].classList.remove('dragging'));
        this.h.onMove(res.move);
      } else {
        this.snapBack(d.group);
        if (res && res.fail && this.h.onFail) this.h.onFail(res);
      }
    };
    el.addEventListener('pointerup', (e) => end(e, false));
    el.addEventListener('pointercancel', (e) => end(e, true));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  };

  // ---- feedback -----------------------------------------------------------------------------
  Board.clearHint = function () {
    this.hintEls.forEach((n) => n.classList.remove('hint-src', 'hint-dst'));
    this.hintEls = [];
  };
  Board.showHint = function (st, mv) {
    this.clearHint();
    const mark = (n, cls) => { n.classList.add(cls); this.hintEls.push(n); };
    const src = mv.from.z === COL ? st.cols[mv.from.i].slice(st.cols[mv.from.i].length - mv.n) : [st.free[mv.from.i]];
    src.forEach((c) => mark(this.cards[c], 'hint-src'));
    if (mv.to.z === COL) {
      const d = st.cols[mv.to.i];
      mark(d.length ? this.cards[d[d.length - 1]] : this.slots.col[mv.to.i], 'hint-dst');
    } else if (mv.to.z === FREE) mark(this.slots.free[mv.to.i], 'hint-dst');
    else {
      const f = st.found[mv.to.i];
      mark(f ? this.cards[((f - 1) << 2) | mv.to.i] : this.slots.found[mv.to.i], 'hint-dst');
    }
  };
  Board.shake = function (ids) {
    ids.forEach((c) => {
      const el = this.cards[c];
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      setTimeout(() => el.classList.remove('shake'), 420);
    });
  };

  FC.Board = Board;
})(window);
