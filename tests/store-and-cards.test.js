const test = require('node:test');
const assert = require('node:assert/strict');
const FC = require('../www/js/rules.js');
require('../www/js/cards.js');
require('../www/js/store.js');
const S = FC.store;

test('every card has artwork with the right rank and no gaps', () => {
  for (let c = 0; c < 52; c++) {
    const svg = FC.cardSVG(c);
    assert.ok(svg.startsWith('<svg') && !svg.includes('undefined') && !svg.includes('NaN'), 'card ' + c);
    assert.ok(svg.includes('>' + FC.RANKS[c >> 2] + '<'), 'rank label of card ' + c);
  }
  assert.equal((FC.SPRITE.match(/<symbol id="s-/g) || []).length, 4);
});

test('validState accepts a fresh deal and rejects damaged saves', () => {
  const st = FC.newState(FC.deal(7));
  assert.ok(S.validState(st));
  const dup = FC.clone(st); dup.cols[0][0] = dup.cols[1][0];
  assert.ok(!S.validState(dup));
  const missing = FC.clone(st); missing.cols[0].pop();
  assert.ok(!S.validState(missing));
  const bad = FC.clone(st); bad.found[0] = 14;
  assert.ok(!S.validState(bad));
  assert.ok(!S.validState(null));
  assert.ok(!S.validState({ cols: [], free: [], found: [] }));
  const finished = { cols: [[], [], [], [], [], [], [], []], free: [-1, -1, -1, -1], found: [13, 13, 13, 13] };
  assert.ok(S.validState(finished));
});

test('statistics: wins, losses, streaks and records', () => {
  const stats = S.newStats();
  let r = S.recordWin(stats, { number: 1, elapsed: 120000, moves: 90 });
  assert.equal(stats.won, 1); assert.equal(stats.streak, 1);
  assert.equal(r.newBestTime, false);                       // the very first win is not "new"
  r = S.recordWin(stats, { number: 2, elapsed: 90000, moves: 95 });
  assert.equal(stats.bestTime, 90000); assert.ok(r.newBestTime); assert.ok(!r.newBestMoves);
  assert.equal(stats.bestMoves, 90); assert.equal(stats.best, 2);
  S.recordLoss(stats, { number: 3, elapsed: 30000, moves: 12 });
  assert.equal(stats.streak, 0); assert.equal(stats.best, 2);
  assert.equal(stats.played, 3); assert.equal(stats.played - stats.won, 1);
  assert.equal(stats.winTime / stats.won, 105000);
  assert.deepEqual(stats.recent.map((x) => x.w), [0, 1, 1]);
  for (let i = 0; i < 30; i++) S.recordLoss(stats, { number: i, elapsed: 1, moves: 1 });
  assert.equal(stats.recent.length, 12);
});
