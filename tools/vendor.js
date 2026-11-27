// Copies Capacitor's script-tag build into the web app (the app has no bundler).
// Run after upgrading @capacitor/core:  npm run vendor
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'node_modules', '@capacitor', 'core', 'dist', 'capacitor.js');
const dst = path.join(__dirname, '..', 'www', 'js', 'capacitor.js');
fs.copyFileSync(src, dst);
console.log('www/js/capacitor.js updated (' + fs.statSync(dst).size + ' bytes)');
