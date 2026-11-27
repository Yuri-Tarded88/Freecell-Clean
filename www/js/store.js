/* Persistence: localStorage for settings / stats / the saved game, IndexedDB for the background photo. */
(function (root) {
  'use strict';
  const FC = (root.FC = root.FC || {});
  const PREFIX = 'fc.';

  const LS = {
    get(key, fallback) {
      try { const v = localStorage.getItem(PREFIX + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ } }
  };

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      let rq;
      try { rq = indexedDB.open('freecell', 1); } catch (e) { reject(e); return; }
      rq.onupgradeneeded = () => rq.result.createObjectStore('blobs');
      rq.onerror = () => reject(rq.error);
      rq.onsuccess = () => {
        const db = rq.result, tx = db.transaction('blobs', mode), req = fn(tx.objectStore('blobs'));
        tx.oncomplete = () => { db.close(); resolve(req && req.result); };
        tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }
  const Blobs = {
    get: (k) => idb('readonly', (s) => s.get(k)),
    set: (k, b) => idb('readwrite', (s) => s.put(b, k)),
    del: (k) => idb('readwrite', (s) => s.delete(k))
  };

  const newStats = () => ({ played: 0, won: 0, streak: 0, best: 0, bestTime: 0, bestMoves: 0, winTime: 0, winMoves: 0, playTime: 0, hints: 0, undos: 0, recent: [] });

  function loadStats() { return Object.assign(newStats(), LS.get('stats', {})); }

  function pushRecent(stats, entry) {
    stats.recent.unshift(entry);
    if (stats.recent.length > 12) stats.recent.length = 12;
  }
  // returns { newBestTime, newBestMoves }
  function recordWin(stats, game) {
    const t = game.elapsed, out = { newBestTime: false, newBestMoves: false };
    stats.played++; stats.won++; stats.streak++;
    stats.best = Math.max(stats.best, stats.streak);
    if (!stats.bestTime || t < stats.bestTime) { stats.bestTime = t; out.newBestTime = stats.won > 1; }
    if (!stats.bestMoves || game.moves < stats.bestMoves) { stats.bestMoves = game.moves; out.newBestMoves = stats.won > 1; }
    stats.winTime += t; stats.winMoves += game.moves; stats.playTime += t;
    pushRecent(stats, { n: game.number, w: 1, t: t, m: game.moves, d: Date.now() });
    return out;
  }
  function recordLoss(stats, game) {
    stats.played++; stats.streak = 0; stats.playTime += game.elapsed;
    pushRecent(stats, { n: game.number, w: 0, t: game.elapsed, m: game.moves, d: Date.now() });
  }

  // a saved game is only trusted if it is a complete, consistent deal
  function validState(st) {
    if (!st || !Array.isArray(st.cols) || st.cols.length !== 8 || !Array.isArray(st.free) || st.free.length !== 4 || !Array.isArray(st.found) || st.found.length !== 4) return false;
    const seen = new Set();
    const add = (c) => { if (!Number.isInteger(c) || c < 0 || c > 51 || seen.has(c)) return false; seen.add(c); return true; };
    for (const col of st.cols) { if (!Array.isArray(col)) return false; for (const c of col) if (!add(c)) return false; }
    for (const c of st.free) if (c !== -1 && !add(c)) return false;
    for (let s = 0; s < 4; s++) {
      if (!Number.isInteger(st.found[s]) || st.found[s] < 0 || st.found[s] > 13) return false;
      for (let r = 0; r < st.found[s]; r++) if (!add((r << 2) | s)) return false;
    }
    return seen.size === 52;
  }

  FC.store = { LS, Blobs, newStats, loadStats, recordWin, recordLoss, validState };
  if (typeof module !== 'undefined' && module.exports) module.exports = FC;
})(typeof self !== 'undefined' ? self : globalThis);
