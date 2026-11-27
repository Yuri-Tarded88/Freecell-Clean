const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');

test('www/js/capacitor.js matches the installed @capacitor/core (run: npm run vendor)', () => {
  const vendored = fs.readFileSync(path.join(root, 'www/js/capacitor.js'), 'utf8');
  const installed = fs.readFileSync(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), 'utf8');
  assert.equal(vendored, installed);
});

test('index.html loads every script it needs, in a sensible order', () => {
  const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(scripts, ['js/capacitor.js', 'js/version.js', 'js/rules.js', 'js/cards.js', 'js/solver.js', 'js/store.js', 'js/ui.js', 'js/app.js']);
  for (const s of scripts) assert.ok(fs.existsSync(path.join(root, 'www', s)), s + ' exists');
  assert.ok(fs.existsSync(path.join(root, 'www/js/solver-worker.js')));
});
