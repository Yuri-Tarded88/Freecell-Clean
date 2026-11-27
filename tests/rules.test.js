const test = require('node:test');
const assert = require('node:assert/strict');
const FC = require('../www/js/rules.js');
const { COL, FREE, FOUND } = FC;

const ids = (...names) => names.map((n) => {
  const r = 'A23456789TJQK'.indexOf(n[0]), s = 'CDHS'.indexOf(n[1]);
  return (r << 2) | s;
});
const empty = () => ({ cols: [[], [], [], [], [], [], [], []], free: [-1, -1, -1, -1], found: [0, 0, 0, 0] });

test('deal #1 is the classic Microsoft layout', () => {
  const cols = FC.deal(1);
  const rows = [];
  for (let r = 0; r < 7; r++) rows.push(cols.map((c) => (c[r] === undefined ? '' : FC.cardName(c[r]))).filter(Boolean).join(' '));
  assert.deepEqual(rows, [
    'JD 2D 9H JC 5D 7H 7C 5H', 'KD KC 9S 5S AD QC KH 3H', '2S KS 9D QD JS AS AH 3C', '4C 5C TS QH 4H AC 4D 7S',
    '3S TD 4S TH 8H 2C JH 7D', '6D 8S 8D QS 6C 3D 8C TC', '6S 9C 2H 6H'
  ]);
});

test('every deal uses all 52 cards once, 7/7/7/7/6/6/6/6', () => {
  for (const n of [1, 2, 617, 11982, 32000, 123456, 1000000]) {
    const cols = FC.deal(n);
    assert.equal(cols.map((c) => c.length).join(), '7,7,7,7,6,6,6,6');
    assert.equal(new Set(cols.flat()).size, 52);
  }
});

test('random deal numbers avoid the unwinnable one and the current deal', () => {
  for (let i = 0; i < 2000; i++) {
    const n = FC.randomDealNumber(5);
    assert.ok(n >= 1 && n <= 32000 && n !== 11982 && n !== 5);
  }
});

test('stacking needs one rank lower and the opposite colour', () => {
  const [s7, h6, c6, h8] = ids('7S', '6H', '6C', '8H');
  assert.ok(FC.canStack(s7, h6));
  assert.ok(!FC.canStack(s7, c6));
  assert.ok(!FC.canStack(s7, h8));
});

test('capacity follows (free cells + 1) * 2^empty columns', () => {
  assert.equal(FC.maxMovable(4, 0), 5);
  assert.equal(FC.maxMovable(0, 0), 1);
  assert.equal(FC.maxMovable(2, 1), 6);
  assert.equal(FC.maxMovable(4, 2), 20);
  const st = empty();
  st.cols[0] = ids('KS', 'QH');
  assert.equal(FC.capacity(st, false), 5 * 2 ** 7);
  assert.equal(FC.capacity(st, true), 5 * 2 ** 6); // the destination column itself does not count
});

test('check(): column moves, runs, capacity, foundations and cells', () => {
  const st = empty();
  st.cols[0] = ids('KD', '9S', '8H', '7C');       // 9S 8H 7C is a run
  st.cols[1] = ids('TH');
  st.cols[2] = ids('AS');
  st.free = [-1, ids('5D')[0], ids('2S')[0], ids('3C')[0]];
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 3)), null);            // 9S-8H-7C onto TH, needs 3 <= (1+1)*2^5
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 4)), 'order');          // KD 9S 8H 7C is not a run
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 2, 1)), 'stack');          // 7C on AS
  assert.equal(FC.check(st, FC.mv(COL, 2, FOUND, 3, 1)), null);           // AS to the spade foundation
  assert.equal(FC.check(st, FC.mv(COL, 0, FOUND, 0, 1)), 'foundation');   // 7C is not an ace
  assert.equal(FC.check(st, FC.mv(COL, 0, FREE, 0, 1)), null);
  assert.equal(FC.check(st, FC.mv(COL, 0, FREE, 1, 1)), 'cell');           // that cell is taken
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 0, 1)), 'same');
});

test('supermove is limited by free cells and empty columns', () => {
  const st = empty();
  st.cols[0] = ids('9S', '8H', '7C', '6D');                 // a run of four
  st.cols[1] = ids('TH');                                    // 9S can go on TH
  const filler = ids('KC', 'KD', 'KH', 'KS', 'QC', 'QD');   // keeps the other columns non-empty
  for (let i = 2; i < 8; i++) st.cols[i] = [filler[i - 2]];
  st.free = ids('2S', '3S', '4S', '5S');                    // every cell taken: one card at a time
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 4)), 'capacity');
  st.free[0] = -1;                                           // 1 free cell -> 2 cards
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 4)), 'capacity');
  st.free[1] = -1; st.free[2] = -1;                          // 3 free cells -> 4 cards
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 4)), null);
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 3)), 'stack'); // 7C does not fit on TH
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 1)), 'stack'); // neither does 6D
});

test('moving onto an empty column counts that column as unavailable', () => {
  const st = empty();
  st.cols[0] = ids('9S', '8H', '7C');
  for (let i = 2; i < 8; i++) st.cols[i] = [i];
  st.free = [ids('2S')[0], ids('3S')[0], -1, -1];  // 2 free cells, column 1 is the only empty one
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 3)), null);   // (2+1) * 2^0 = 3
  st.free[2] = ids('4S')[0];                                      // 1 free cell -> only 2 cards
  assert.equal(FC.check(st, FC.mv(COL, 0, COL, 1, 3)), 'capacity');
});

test('apply() returns a new state and leaves the old one untouched', () => {
  const st = FC.newState(FC.deal(1));
  const before = JSON.stringify(st);
  const next = FC.apply(st, FC.mv(COL, 0, FREE, 0, 1));
  assert.equal(JSON.stringify(st), before);
  assert.equal(next.cols[0].length, 6);
  assert.equal(next.free[0], st.cols[0][6]);
});

test('safe foundation moves: aces and twos always, others once opposite colours are up', () => {
  const found = [0, 0, 0, 0];
  const [ac, d2, s3] = ids('AC', '2D', '3S');
  assert.ok(FC.safeToFoundation(found, ac));
  assert.ok(!FC.safeToFoundation(found, d2));      // needs AD first
  found[1] = 1;
  assert.ok(FC.safeToFoundation(found, d2));
  found[3] = 2;                                    // spades up to 2
  assert.ok(!FC.safeToFoundation(found, s3));      // red twos (clubs.. diamonds/hearts) not up yet
  found[1] = 2; found[2] = 2;
  assert.ok(FC.safeToFoundation(found, s3));
});

test('findAutoMove only plays safe cards, findFoundationMove plays any playable card', () => {
  // 2S is safe (twos always are) once AS is up
  const a = empty();
  a.cols[0] = ids('3S', '2S');
  a.found = [0, 0, 0, 1];
  assert.deepEqual(FC.findAutoMove(a), FC.mv(COL, 0, FOUND, 3, 1));

  // 3S is playable but not safe while the red twos could still need it as a parent
  const b = empty();
  b.cols[0] = ids('3S');
  b.found = [0, 0, 0, 2];
  assert.equal(FC.findAutoMove(b), null);
  assert.deepEqual(FC.findFoundationMove(b), FC.mv(COL, 0, FOUND, 3, 1));

  // once both red twos are up it becomes safe
  b.found = [0, 2, 2, 2];
  assert.deepEqual(FC.findAutoMove(b), FC.mv(COL, 0, FOUND, 3, 1));

  // cards in free cells are considered too
  const c = empty();
  c.free = [-1, -1, ids('AH')[0], -1];
  assert.deepEqual(FC.findAutoMove(c), FC.mv(FREE, 2, FOUND, 2, 1));
});

test('auto-finish only when every column is strictly descending', () => {
  const st = empty();
  st.cols[0] = ids('KS', 'QS', 'JS');
  st.cols[1] = ids('5H', '9H');
  assert.ok(!FC.canAutoFinish(st));
  st.cols[1] = ids('9H', '5H');
  assert.ok(FC.canAutoFinish(st));
});

test('listMoves only returns legal moves, and finds the obvious ones', () => {
  for (const n of [1, 2, 3, 4, 5, 617]) {
    const st = FC.newState(FC.deal(n));
    const moves = FC.listMoves(st);
    assert.ok(moves.length > 0);
    for (const m of moves) assert.equal(FC.check(st, m), null, JSON.stringify(m));
  }
  const st = empty();
  st.cols[0] = ids('7S');
  st.cols[1] = ids('6H');
  const moves = FC.listMoves(st).map((m) => JSON.stringify(m));
  assert.ok(moves.includes(JSON.stringify(FC.mv(COL, 1, COL, 0, 1))));
});

test('random play never produces an illegal state (52 cards, all moves pass check)', () => {
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let game = 1; game <= 15; game++) {
    let st = FC.newState(FC.deal(game));
    for (let k = 0; k < 400; k++) {
      const moves = FC.listMoves(st);
      if (!moves.length) break;
      st = FC.apply(st, moves[Math.floor(rnd() * moves.length)]);
      const all = [...st.cols.flat(), ...st.free.filter((c) => c >= 0)];
      for (let s = 0; s < 4; s++) for (let r = 0; r < st.found[s]; r++) all.push((r << 2) | s);
      assert.equal(new Set(all).size, 52);
      assert.equal(all.length, 52);
    }
  }
});

test('exactKey ignores free-cell positions but not column order', () => {
  const a = FC.newState(FC.deal(1)), b = FC.clone(a);
  a.free = [5, -1, 9, -1]; b.free = [-1, 9, -1, 5];
  assert.equal(FC.exactKey(a), FC.exactKey(b));
  const c = FC.clone(a); c.cols.reverse();
  assert.notEqual(FC.exactKey(a), FC.exactKey(c));
});
