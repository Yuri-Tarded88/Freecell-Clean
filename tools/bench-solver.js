// Usage: node tools/bench-solver.js [from] [to] [maxNodes]   (dev tool, not part of npm test)
const FC = require('../www/js/rules.js');
require('../www/js/solver.js');
const from = +process.argv[2] || 1, to = +process.argv[3] || 60, maxNodes = +process.argv[4] || 200000;
let solved = 0, tot = 0, worst = 0, nodesSum = 0, lenSum = 0, bad = 0;
const times = [];
for (let n = from; n <= to; n++) {
  const st = FC.newState(FC.deal(n));
  const r = FC.solve(st, { maxNodes, maxMs: 20000 });
  tot++; nodesSum += r.nodes; times.push(r.ms); worst = Math.max(worst, r.ms);
  if (r.status === 'solved') {
    solved++;
    const plan = FC.planToMoves(st, r.moves);
    let cur = st, ok = true;
    for (const m of plan) { const why = FC.check(cur, m); if (why) { ok = false; break; } cur = FC.apply(cur, m); }
    if (!ok || !FC.isWon(cur)) { bad++; console.log('INVALID PLAN for deal', n); }
    lenSum += plan.length;
  } else console.log('deal', n, r.status, 'nodes', r.nodes, 'ms', r.ms);
}
times.sort((a, b) => a - b);

console.log(`solved ${solved}/${tot}  invalid ${bad}  avgNodes ${Math.round(nodesSum / tot)}  avgPlan ${Math.round(lenSum / Math.max(1, solved))}  median ${times[times.length >> 1]}ms  p90 ${times[Math.floor(times.length * 0.9)]}ms  worst ${worst}ms`);
