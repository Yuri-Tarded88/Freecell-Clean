/* App controller: game flow, undo, hint, statistics, settings, dialogs. */
(function () {
  'use strict';
  const FC = window.FC, Board = FC.Board, Store = FC.store, LS = Store.LS;
  const COL = FC.COL, FREE = FC.FREE, FOUND = FC.FOUND;
  const $ = (s, r) => (r || document).querySelector(s);
  const VERSION = window.APP_VERSION || 'dev';

  const BGS = [
    { id: 'felt', name: 'Felt', css: 'radial-gradient(120% 90% at 50% 30%, #1a5650, #0d3433 55%, #07191c)' },
    { id: 'ink', name: 'Ink', css: 'radial-gradient(120% 90% at 50% 30%, #243247, #121b29 55%, #090e15)' },
    { id: 'wine', name: 'Wine', css: 'radial-gradient(120% 90% at 50% 30%, #63202f, #381120 55%, #1b0a11)' },
    { id: 'slate', name: 'Slate', css: 'linear-gradient(160deg, #343c45, #171b20)' },
    { id: 'black', name: 'Black', css: 'linear-gradient(#000, #000)' }
  ];
  const DEFAULTS = { autoMove: true, fourColor: false, darkCards: false, bg: 'felt', dim: 0, blur: 0 };
  let settings = Object.assign({}, DEFAULTS, LS.get('settings', {}));
  let stats = Store.loadStats();
  let game = null, busy = false, autoTimer = 0, plan = null, thinking = false;
  let tickStart = 0, hintTimer = 0, toastTimer = 0, worker = null, solveId = 0, photoUrl = null;
  const modals = [];

  // ---- helpers -----------------------------------------------------------------------------
  const pad = (n) => (n < 10 ? '0' : '') + n;
  function fmtTime(ms) {
    const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return h ? h + ':' + pad(m) + ':' + pad(s % 60) : m + ':' + pad(s % 60);
  }
  function toast(html, ms) {
    const t = $('#toast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2600);
  }
  const saveSettings = () => LS.set('settings', settings);
  const saveStats = () => LS.set('stats', stats);
  const lock = (on) => { busy = on; Board.locked = on; };
  const inProgress = () => !!game && game.moves > 0 && !game.won && !game.counted;

  // ---- clock -------------------------------------------------------------------------------
  const elapsedMs = () => game.elapsed + (tickStart ? Date.now() - tickStart : 0);
  function startClock() { if (game && game.started && !game.won && !tickStart && !modals.length && !document.hidden) tickStart = Date.now(); }
  function stopClock() { if (tickStart) { game.elapsed += Date.now() - tickStart; tickStart = 0; } }
  setInterval(() => { if (game) $('#time').textContent = fmtTime(elapsedMs()); }, 500);

  // ---- persistence -------------------------------------------------------------------------
  function save() {
    if (!game) return;
    LS.set('game', { v: 1, number: game.number, state: game.state, history: game.history.slice(-400), moves: game.moves, elapsed: elapsedMs(), started: game.started, hints: game.hints, undos: game.undos, won: game.won, counted: game.counted });
  }
  function restore() {
    const s = LS.get('game', null);
    if (!s || !Number.isInteger(s.number) || !Store.validState(s.state) || !Array.isArray(s.history)) return false;
    if (!s.history.every((h) => h && Store.validState(h.state) && Number.isInteger(h.moves))) return false;
    game = { number: s.number, state: s.state, history: s.history, moves: s.moves | 0, elapsed: +s.elapsed || 0, started: !!s.started, hints: s.hints | 0, undos: s.undos | 0, won: !!s.won, counted: !!s.counted };
    return true;
  }

  // ---- modals (stack, Android back button, Esc) ---------------------------------------------
  function openModal(o) {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = '<div class="sheet ' + (o.cls || '') + '" role="dialog" aria-modal="true"><h2>' + o.title + '</h2><div class="body">' + (o.html || '') + '</div><div class="actions"></div></div>';
    const bar = $('.actions', wrap);
    (o.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || '');
      b.textContent = a.label;
      b.onclick = () => { if (a.close !== false) closeModal(wrap); if (a.onClick) a.onClick(wrap); };
      bar.appendChild(b);
    });
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) closeModal(wrap); });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    modals.push(wrap);
    if (game) { stopClock(); save(); }
    if (o.onOpen) o.onOpen(wrap);
    return wrap;
  }
  function closeModal(wrap) {
    const i = modals.indexOf(wrap);
    if (i < 0) return false;
    modals.splice(i, 1);
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 240);
    if (!modals.length) startClock();
    return true;
  }
  const closeTopModal = () => (modals.length ? closeModal(modals[modals.length - 1]) : false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTopModal(); });
  // Android Back button: close the top dialog first, only leave the app when none is open.
  // (capacitor.js is loaded as a plain script, so the App plugin is reached through registerPlugin.)
  const Cap = window.Capacitor, register = Cap && (Cap.registerPlugin || (window.capacitorExports && window.capacitorExports.registerPlugin));
  if (Cap && Cap.isNativePlatform && Cap.isNativePlatform() && register) {
    try {
      const AppPlugin = register('App');
      AppPlugin.addListener('backButton', () => { if (!closeTopModal()) AppPlugin.exitApp(); });
    } catch (e) { /* the Back button then keeps its default behaviour */ }
  }

  // ---- HUD / buttons -----------------------------------------------------------------------
  function hud() {
    $('#gameNo').textContent = '#' + game.number;
    $('#moves').textContent = game.moves;
    $('#time').textContent = fmtTime(elapsedMs());
  }
  function buttons() {
    $('#btnUndo').disabled = !game || game.won || !game.history.length;
    $('#btnHint').disabled = !game || game.won;
  }
  function setThinking(on) { thinking = on; $('#btnHint').classList.toggle('busy', on); }

  // ---- settings / look ---------------------------------------------------------------------
  function applyLook() {
    document.body.classList.toggle('fourcolor', settings.fourColor);
    document.body.classList.toggle('darkcards', settings.darkCards);
  }
  async function loadPhoto() {
    try {
      const blob = await Store.Blobs.get('bg');
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      photoUrl = blob ? URL.createObjectURL(blob) : null;
    } catch (e) { photoUrl = null; }
  }
  function applyBackground() {
    const bg = $('#bg');
    bg.style.backgroundImage = settings.bg === 'photo' && photoUrl ? 'url("' + photoUrl + '")' : (BGS.find((b) => b.id === settings.bg) || BGS[0]).css;
    bg.style.filter = settings.blur ? 'blur(' + settings.blur + 'px)' : '';
    bg.style.transform = settings.blur ? 'scale(1.12)' : '';
    $('#shade').style.opacity = settings.dim / 100;
  }
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  async function importPhoto(file) {
    try {
      const img = await loadImage(file);
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
      cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.87));
      if (!blob) throw new Error('encode');
      await Store.Blobs.set('bg', blob);
      await loadPhoto();
      settings.bg = 'photo';
      saveSettings();
      applyBackground();
      return true;
    } catch (e) {
      toast('Couldn’t use that picture. Try another one.');
      return false;
    }
  }

  function showSettings() {
    const sw = (id, label, sub) => '<label class="row"><span><b>' + label + '</b><small>' + sub + '</small></span><input type="checkbox" id="' + id + '" class="switch"></label>';
    openModal({
      title: 'Settings', cls: 'tall',
      html: sw('sAuto', 'Auto-move to foundation', 'Plays cards that are safely out of the way') +
        sw('s4c', 'Four-colour suits', 'Green clubs, blue diamonds') +
        sw('sDark', 'Dark cards', 'Charcoal card faces') +
        '<h3>Table</h3><div class="swatches" id="swatches"></div>' +
        '<div class="photo-actions"><button class="btn small" id="pickPhoto">Choose photo…</button><button class="btn small ghost" id="rmPhoto">Remove photo</button></div>' +
        '<input type="file" id="fileBg" accept="image/*" hidden>' +
        '<div class="row slider"><span>Dim</span><input type="range" id="sDim" min="0" max="85"></div>' +
        '<div class="row slider"><span>Blur</span><input type="range" id="sBlur" min="0" max="14"></div>' +
        '<p class="about">FreeCell ' + VERSION + ' · plays fully offline · no ads, no tracking</p>',
      actions: [{ label: 'Done', kind: 'primary' }],
      onOpen: (w) => {
        const check = (sel, key) => { const i = $(sel, w); i.checked = !!settings[key]; i.onchange = () => { settings[key] = i.checked; saveSettings(); applyLook(); }; };
        check('#sAuto', 'autoMove'); check('#s4c', 'fourColor'); check('#sDark', 'darkCards');
        const range = (sel, key) => { const i = $(sel, w); i.value = settings[key]; i.oninput = () => { settings[key] = +i.value; applyBackground(); }; i.onchange = saveSettings; };
        range('#sDim', 'dim'); range('#sBlur', 'blur');
        const draw = () => {
          const box = $('#swatches', w);
          box.innerHTML = '';
          BGS.concat([{ id: 'photo', name: 'Photo' }]).forEach((b) => {
            const el = document.createElement('button');
            el.className = 'swatch' + (settings.bg === b.id ? ' on' : '') + (b.id === 'photo' ? ' photo' : '');
            el.setAttribute('aria-label', b.name);
            if (b.id === 'photo') { if (photoUrl) el.style.backgroundImage = 'url("' + photoUrl + '")'; else el.textContent = '+'; } else el.style.background = b.css;
            el.innerHTML += '<span>' + b.name + '</span>';
            el.onclick = () => {
              if (b.id === 'photo' && !photoUrl) { $('#fileBg', w).click(); return; }
              settings.bg = b.id; saveSettings(); applyBackground(); draw();
            };
            box.appendChild(el);
          });
          $('#rmPhoto', w).style.display = photoUrl ? '' : 'none';
        };
        draw();
        $('#pickPhoto', w).onclick = () => $('#fileBg', w).click();
        $('#fileBg', w).onchange = async (e) => { const f = e.target.files && e.target.files[0]; if (f) { await importPhoto(f); draw(); } e.target.value = ''; };
        $('#rmPhoto', w).onclick = async () => {
          try { await Store.Blobs.del('bg'); } catch (e) { /* ignore */ }
          await loadPhoto();
          if (settings.bg === 'photo') settings.bg = 'felt';
          saveSettings(); applyBackground(); draw();
        };
      }
    });
  }

  // ---- game flow ---------------------------------------------------------------------------
  function startGame(number) {
    clearTimeout(autoTimer); autoTimer = 0; cancelSolve(); Board.clearHint(); plan = null;
    if (game) stopClock();
    game = { number: number, state: FC.newState(FC.deal(number)), history: [], moves: 0, elapsed: 0, started: false, hints: 0, undos: 0, won: false, counted: false };
    tickStart = 0;
    hud(); buttons();
    lock(true);
    Board.deal(game.state);
    setTimeout(() => lock(false), 1250);
    save();
  }
  function abandon() {
    if (!inProgress()) return;
    stopClock();
    Store.recordLoss(stats, game);
    game.counted = true;
    saveStats();
  }
  const newRandom = () => { abandon(); startGame(FC.randomDealNumber(game && game.number)); };
  const replayNumber = (n) => { abandon(); startGame(n); };

  function onNew() {
    if (busy && !game.won) return;
    if (!inProgress()) { startGame(FC.randomDealNumber(game.number)); return; }
    openModal({
      title: 'New game',
      html: '<p class="note">This deal is in progress. Starting another one counts as a loss.</p>',
      actions: [
        { label: 'New random deal', kind: 'primary', onClick: newRandom },
        { label: 'Choose deal number…', onClick: askNumber },
        { label: 'Restart this deal', onClick: () => startGame(game.number) },
        { label: 'Cancel', kind: 'ghost' }
      ]
    });
  }
  function askNumber() {
    openModal({
      title: 'Choose a deal',
      html: '<p class="note">Deals are numbered like classic Windows FreeCell. Every deal from 1 to 32,000 can be won, except #11982.</p><input id="dealNo" class="field" type="number" inputmode="numeric" min="1" max="1000000" placeholder="1 – 1,000,000">',
      actions: [
        { label: 'Play', kind: 'primary', close: false, onClick: (w) => {
          const f = $('#dealNo', w), v = parseInt(f.value, 10);
          if (!(v >= 1 && v <= 1000000)) { f.classList.add('bad'); return; }
          closeModal(w); replayNumber(v);
        } },
        { label: 'Cancel', kind: 'ghost' }
      ],
      onOpen: (w) => setTimeout(() => $('#dealNo', w).focus(), 260)
    });
  }

  function doMove(mv, auto) {
    if (!game || FC.check(game.state, mv)) return; // never apply an illegal (for example stale) move
    if (!auto) { cancelSolve(); Board.clearHint(); clearTimeout(hintTimer); $('#toast').classList.remove('show'); }
    if (!game.started) { game.started = true; startClock(); }
    if (!auto) game.history.push({ state: game.state, moves: game.moves });
    game.state = FC.apply(game.state, mv);
    game.moves++;
    Board.layout(game.state);
    hud(); buttons(); save();
    afterMove();
  }
  function afterMove() {
    if (FC.isWon(game.state)) { win(); return; }
    let next = settings.autoMove ? FC.findAutoMove(game.state) : null;
    const finishing = !next && FC.canAutoFinish(game.state);
    if (finishing) next = FC.findFoundationMove(game.state);
    if (next) {
      lock(true);
      autoTimer = setTimeout(() => { autoTimer = 0; doMove(next, true); }, finishing ? 110 : 170);
      return;
    }
    lock(false);
    if (!FC.hasMoves(game.state)) setTimeout(stuck, 350);
  }
  function undo() {
    if (!game || game.won) return;
    if (!game.history.length) { toast('Nothing to undo'); return; }
    if (busy && !autoTimer) return;
    clearTimeout(autoTimer); autoTimer = 0; lock(false); cancelSolve(); Board.clearHint();
    const h = game.history.pop();
    game.state = h.state; game.moves = h.moves; game.undos++; stats.undos++;
    Board.layout(game.state);
    hud(); buttons(); save(); saveStats();
  }

  function win() {
    stopClock();
    game.won = true;
    lock(false);
    const rec = Store.recordWin(stats, game);
    game.counted = true;
    saveStats(); save(); buttons();
    setTimeout(() => showWin(rec), 700);
  }
  function showWin(rec) {
    const cell = (v, l) => '<div><b>' + v + '</b><span>' + l + '</span></div>';
    const notes = [rec.newBestTime ? 'New best time!' : '', rec.newBestMoves ? 'New fewest moves!' : '', stats.streak > 1 ? 'Win streak: ' + stats.streak : ''].filter(Boolean);
    openModal({
      title: 'Deal cleared', cls: 'win',
      html: '<div class="winstats">' + cell(fmtTime(game.elapsed), 'Time') + cell(game.moves, 'Moves') + cell('#' + game.number, 'Deal') + '</div>' + (notes.length ? '<p class="note ok">' + notes.join(' · ') + '</p>' : ''),
      actions: [
        { label: 'New game', kind: 'primary', onClick: () => startGame(FC.randomDealNumber(game.number)) },
        { label: 'Statistics', onClick: showStats },
        { label: 'Close', kind: 'ghost' }
      ]
    });
  }
  function stuck() {
    if (!game || game.won || modals.length || FC.hasMoves(game.state)) return;
    openModal({
      title: 'No moves left',
      html: '<p class="note">There are no legal moves from here. Undo a few moves, or start a new deal.</p>',
      actions: [{ label: 'Undo', kind: 'primary', onClick: undo }, { label: 'New deal', onClick: newRandom }, { label: 'Close', kind: 'ghost' }]
    });
  }

  // ---- taps and drops ----------------------------------------------------------------------
  // best place for a tapped card or run: foundation, then a column, then a free cell, then an empty column
  function smartMove(st, loc, n) {
    const from = { z: loc.z, i: loc.i };
    const card = loc.z === COL ? st.cols[loc.i][st.cols[loc.i].length - n] : st.free[loc.i];
    const tries = [];
    if (n === 1) tries.push({ z: FOUND, i: card & 3 });
    for (let j = 0; j < 8; j++) if (st.cols[j].length && !(loc.z === COL && loc.i === j)) tries.push({ z: COL, i: j });
    if (n === 1 && loc.z === COL) { const f = st.free.indexOf(-1); if (f >= 0) tries.push({ z: FREE, i: f }); }
    const e = st.cols.findIndex((c) => !c.length);
    if (e >= 0 && !(loc.z === COL && st.cols[loc.i].length === n)) tries.push({ z: COL, i: e });
    for (const to of tries) { const mv = { from: from, to: to, n: n }; if (!FC.check(st, mv)) return mv; }
    return null;
  }
  function onTap(loc, group, card) {
    if (busy || !game || game.won) return;
    if (loc.z === FOUND) return;
    if (!group) { Board.shake([card]); return; }
    const mv = smartMove(game.state, loc, group.length);
    if (mv) { doMove(mv, false); return; }
    Board.shake(group);
    const cap = FC.capacity(game.state, false);
    if (group.length > cap) toast('You can move up to ' + cap + ' card' + (cap > 1 ? 's' : '') + ' at once right now');
  }
  function onFail(res) {
    const cap = FC.capacity(game.state, false);
    const msg = {
      capacity: 'You can move up to ' + cap + ' card' + (cap > 1 ? 's' : '') + ' at once right now',
      stack: 'Cards stack in descending order, alternating colours',
      foundation: 'Foundations build up in one suit, starting with the ace',
      cell: 'That free cell is taken'
    }[res.fail];
    if (msg) toast(msg);
  }
  function onBlank() { Board.clearHint(); clearTimeout(hintTimer); }

  // ---- hint --------------------------------------------------------------------------------
  function cancelSolve() {
    solveId++;
    if (worker) { worker.terminate(); worker = null; }
    setThinking(false);
  }
  function solveAsync(state) {
    const id = ++solveId;
    return new Promise((resolve) => {
      const sync = () => setTimeout(() => resolve(id === solveId ? FC.solve(state, { maxNodes: 90000, maxMs: 4000 }) : null), 30);
      try {
        worker = new Worker('js/solver-worker.js');
        worker.onmessage = (e) => { if (e.data.id === id) resolve(e.data.result); };
        worker.onerror = () => { if (worker) { worker.terminate(); worker = null; } sync(); };
        worker.postMessage({ id: id, state: state, maxNodes: 400000, maxMs: 9000 });
      } catch (e) { worker = null; sync(); }
    });
  }
  function buildPlan(st, moves, partial) {
    const states = [st], keys = [FC.exactKey(st)];
    let cur = st;
    for (const m of moves) { cur = FC.apply(cur, m); states.push(cur); keys.push(FC.exactKey(cur)); }
    return { moves: moves, states: states, keys: keys, partial: partial };
  }
  // still on the cached solution? then the next hint is instant
  function fromPlan(st) {
    if (!plan) return null;
    const i = plan.keys.indexOf(FC.exactKey(st));
    if (i < 0 || i >= plan.moves.length) { plan = null; return null; }
    const m = plan.moves[i], r = { from: { z: m.from.z, i: m.from.i }, to: { z: m.to.z, i: m.to.i }, n: m.n };
    if (m.from.z === FREE) r.from.i = st.free.indexOf(plan.states[i].free[m.from.i]);
    if (m.to.z === FREE) r.to.i = st.free.indexOf(-1);
    return FC.check(st, r) ? null : r;
  }
  function describe(st, mv) {
    const first = mv.from.z === COL ? st.cols[mv.from.i][st.cols[mv.from.i].length - mv.n] : st.free[mv.from.i];
    const name = FC.cardLabel(first), what = mv.n > 1 ? mv.n + ' cards from ' + name : name;
    if (mv.to.z === FOUND) return 'Move ' + name + ' to the foundation';
    if (mv.to.z === FREE) return 'Move ' + name + ' to a free cell';
    const d = st.cols[mv.to.i];
    return d.length ? 'Move ' + what + ' onto ' + FC.cardLabel(d[d.length - 1]) : 'Move ' + what + ' to the empty column';
  }
  async function hint() {
    if (!game || game.won || busy || thinking) return;
    onBlank();
    const st = game.state;
    let mv = fromPlan(st), prefix = '';
    if (!mv) {
      setThinking(true);
      toast('Looking for a winning line…', 12000);
      const mine = solveId + 1;
      const res = await solveAsync(st);
      if (!res || mine !== solveId || game.state !== st) return;
      setThinking(false);
      if (res.status === 'unsolvable') { toast('This position can’t be won any more. Try undoing a few moves.', 4800); return; }
      if (!res.moves.length) { toast('No moves available.'); return; }
      plan = buildPlan(st, FC.planToMoves(st, res.moves), res.status !== 'solved');
      mv = plan.moves[0];
    }
    if (plan && plan.partial) prefix = 'Best guess: ';
    game.hints++; stats.hints++; saveStats();
    Board.showHint(st, mv);
    toast(prefix + describe(st, mv), 5000);
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => Board.clearHint(), 6000);
  }

  // ---- statistics --------------------------------------------------------------------------
  function showStats() {
    const s = stats, cell = (v, l) => '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>';
    let html = '<div class="stats">' +
      cell(s.played, 'Played') + cell(s.won, 'Won') + cell(s.played - s.won, 'Lost') +
      cell(s.played ? Math.round((100 * s.won) / s.played) + '%' : '–', 'Win rate') + cell(s.streak, 'Streak') + cell(s.best, 'Best streak') +
      cell(s.bestTime ? fmtTime(s.bestTime) : '–', 'Best time') + cell(s.won ? fmtTime(s.winTime / s.won) : '–', 'Avg win') + cell(s.bestMoves || '–', 'Fewest moves') +
      cell(fmtTime(s.playTime), 'Time played') + cell(s.hints, 'Hints used') + cell(s.undos, 'Undos used') + '</div>';
    if (s.recent.length) {
      html += '<h3>Recent deals</h3><ul class="recent">' + s.recent.map((r) =>
        '<li class="' + (r.w ? 'w' : 'l') + '"><span class="badge">' + (r.w ? 'Won' : 'Lost') + '</span><span class="rn">#' + r.n + '</span><span>' + fmtTime(r.t) + '</span><span>' + r.m + ' moves</span></li>').join('') + '</ul>';
    }
    openModal({
      title: 'Statistics', cls: 'tall', html: html,
      actions: [
        { label: 'Close', kind: 'primary' },
        { label: 'Reset statistics', kind: 'danger', close: false, onClick: (w) => openModal({
          title: 'Reset statistics?', html: '<p class="note">All wins, losses, streaks and records will be erased.</p>',
          actions: [{ label: 'Reset', kind: 'danger', onClick: () => { stats = Store.newStats(); saveStats(); closeModal(w); toast('Statistics reset'); } }, { label: 'Cancel', kind: 'ghost' }]
        }) }
      ]
    });
  }

  // ---- start -------------------------------------------------------------------------------
  function init() {
    document.body.insertAdjacentHTML('afterbegin', FC.SPRITE);
    Board.init($('#board'), { onTap: onTap, onMove: (mv) => doMove(mv, false), onFail: onFail, onBlank: onBlank });
    applyLook();
    applyBackground();
    loadPhoto().then(() => {
      if (settings.bg === 'photo' && !photoUrl) { settings.bg = 'felt'; saveSettings(); } // photo vanished (storage cleared)
      applyBackground();
    });
    $('#btnNew').onclick = onNew;
    $('#btnUndo').onclick = undo;
    $('#btnHint').onclick = hint;
    $('#btnStats').onclick = showStats;
    $('#btnSettings').onclick = showSettings;
    $('#gameBtn').onclick = () => { if (!busy) askNumber(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden) { stopClock(); save(); } else startClock(); });
    window.addEventListener('pagehide', () => { stopClock(); save(); });
    Board.resize();
    if (restore()) {
      Board.layout(game.state, { instant: true });
      hud(); buttons(); startClock();
      if (game.moves > 0 && !game.won && !FC.isWon(game.state)) setTimeout(afterMove, 400);
    } else startGame(FC.randomDealNumber());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  FC.app = { get busy() { return busy; }, get game() { return game; }, get stats() { return stats; }, get settings() { return settings; }, doMove: doMove, undo: undo, hint: hint, startGame: startGame, smartMove: smartMove };
})();
