/* Runs the hint solver off the UI thread. */
importScripts('rules.js', 'solver.js');
self.onmessage = function (e) {
  var d = e.data;
  var result = self.FC.solve(d.state, { maxNodes: d.maxNodes, maxMs: d.maxMs });
  self.postMessage({ id: d.id, result: result });
};
