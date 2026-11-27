const test = require('node:test');
const assert = require('node:assert/strict');
const FC = require('../www/js/rules.js');
require('../www/js/solver.js');

// replay a hint plan with the independent rules engine
function replay(st, plan) {
  let cur = st;
  for (const m of plan) {
    assert.equal(FC.check(cur, m), null, 'illegal move in plan: ' + JSON.stringify(m));
    cur = FC.apply(cur, m);
  }
  return cur;
}

test('solves a spread of deals and every plan replays to a win', () => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 25, 100, 491, 982, 1941, 7623, 28000]) {
    const st = FC.newState(FC.deal(n));
    const r = FC.solve(st, { maxNodes: 300000, maxMs: 20000 });
    assert.equal(r.status, 'solved', 'deal ' + n);
    assert.ok(FC.isWon(replay(st, FC.planToMoves(st, r.moves))), 'deal ' + n);
  }
});

test('solves from the middle of a game too', () => {
  let st = FC.newState(FC.deal(3));
  const first = FC.solve(st, {});
  const plan = FC.planToMoves(st, first.moves);
  for (let i = 0; i < 25; i++) st = FC.apply(st, plan[i]);
  const r = FC.solve(st, {});
  assert.equal(r.status, 'solved');
  assert.ok(FC.isWon(replay(st, FC.planToMoves(st, r.moves))));
});

test('free-cell positions in the live state do not confuse the plan', () => {
  let st = FC.newState(FC.deal(8));
  st = FC.apply(st, FC.mv(0, 3, 1, 2, 1)); // put a card in the third free cell
  const r = FC.solve(st, {});
  assert.equal(r.status, 'solved');
  assert.ok(FC.isWon(replay(st, FC.planToMoves(st, r.moves))));
});

test('a position with no legal moves is reported unsolvable', () => {
  let found = null, seed = 99;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let deal = 1; deal < 600 && !found; deal++) {
    let st = FC.newState(FC.deal(deal));
    for (let k = 0; k < 600; k++) {
      const moves = FC.listMoves(st);
      if (!moves.length) { found = st; break; }
      st = FC.apply(st, moves[Math.floor(rnd() * moves.length)]);
    }
  }
  assert.ok(found, 'expected to reach a dead end by random play');
  assert.equal(FC.solve(found, {}).status, 'unsolvable');
});

test('deal #11982, the one unwinnable classic deal, is never reported as solved', () => {
  const r = FC.solve(FC.newState(FC.deal(11982)), { maxNodes: 60000, maxMs: 15000 });
  assert.notEqual(r.status, 'solved');
});

test('a tiny budget still returns a legal first move', () => {
  const st = FC.newState(FC.deal(617));
  const r = FC.solve(st, { maxNodes: 30, maxMs: 1000 });
  assert.ok(['partial', 'solved'].includes(r.status));
  const plan = FC.planToMoves(st, r.moves);
  assert.ok(plan.length > 0);
  replay(st, plan);
});
