// Regenerates the launcher icons and splash images from the artwork below.
// Optional dev tool:  npm i --no-save sharp  &&  node tools/make-icons.js
const fs = require('fs'), path = require('path');
const sharp = require('sharp');
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const FELT = '#12433f', NIGHT = '#0c1318';

const SPADE = 'M50 3C50 3 5 38 5 63C5 78 16 87 29 87C37 87 44 83 48 77C47 87 43 93 33 97L67 97C57 93 53 87 52 77C56 83 63 87 71 87C84 87 95 78 95 63C95 38 50 3 50 3Z';
const HEART = 'M50 95C50 95 4 63 4 33C4 17 16 6 30 6C40 6 47 11 50 20C53 11 60 6 70 6C84 6 96 17 96 33C96 63 50 95 50 95Z';

// two playing cards, drawn on a 108 x 108 canvas (the Android adaptive-icon grid)
const cards = `
  <defs><filter id="sh" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.5" flood-color="#000" flood-opacity=".42"/></filter></defs>
  <g transform="translate(12 -2) rotate(19 54 54)" filter="url(#sh)">
    <rect x="36" y="29" width="36" height="50" rx="4.2" fill="#d6cdb4"/>
    <svg x="52" y="32.5" width="16" height="16" viewBox="0 0 100 100"><path d="${HEART}" fill="#c42f3c"/></svg>
  </g>
  <g transform="translate(-4 1) rotate(-9 54 54)" filter="url(#sh)">
    <rect x="36" y="29" width="36" height="50" rx="4.2" fill="#f7f2e6"/>
    <svg x="41" y="41" width="26" height="26" viewBox="0 0 100 100"><path d="${SPADE}" fill="#1a2230"/></svg>
    <svg x="38.6" y="31.2" width="7" height="7" viewBox="0 0 100 100"><path d="${SPADE}" fill="#1a2230"/></svg>
  </g>`;
const svg = (inner, vb) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`);
const feltBg = (vb, shape) => `<defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1f6a62"/><stop offset="1" stop-color="#0a2a2a"/></radialGradient></defs>${shape}`;

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
(async () => {
  for (const [d, k] of Object.entries(DENS)) {
    const dir = path.join(RES, 'mipmap-' + d);
    // adaptive foreground (108dp) - transparent
    await sharp(svg(cards, '0 0 108 108')).resize(Math.round(108 * k)).png().toFile(path.join(dir, 'ic_launcher_foreground.png'));
    // legacy icons (48dp): the central 72dp of the adaptive grid
    const px = Math.round(48 * k);
    const square = feltBg('', '<rect width="108" height="108" fill="url(#g)"/>') + cards;
    const round = feltBg('', '<circle cx="54" cy="54" r="54" fill="url(#g)"/>') + cards;
    const rounded = `<clipPath id="r"><rect x="18" y="18" width="72" height="72" rx="16"/></clipPath><g clip-path="url(#r)">${square}</g>`;
    await sharp(svg(rounded, '18 18 72 72')).resize(px).png().toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(svg(`<clipPath id="c"><circle cx="54" cy="54" r="36"/></clipPath><g clip-path="url(#c)">${round}</g>`, '18 18 72 72')).resize(px).png().toFile(path.join(dir, 'ic_launcher_round.png'));
  }
  fs.writeFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${FELT}</color>\n</resources>\n`);

  // splash (Android 11 and older): dark screen with the icon in the middle
  const logo = svg(feltBg('', '<rect width="108" height="108" rx="24" fill="url(#g)"/>') + cards, '0 0 108 108');
  const dirs = fs.readdirSync(RES).filter((n) => /^drawable.*$/.test(n) && fs.existsSync(path.join(RES, n, 'splash.png')));
  for (const n of dirs) {
    const f = path.join(RES, n, 'splash.png'), { width, height } = await sharp(f).metadata();
    const s = Math.round(Math.min(width, height) * 0.34);
    const icon = await sharp(logo).resize(s).png().toBuffer();
    await sharp({ create: { width, height, channels: 3, background: NIGHT } }).composite([{ input: icon, gravity: 'center' }]).png().toFile(f + '.tmp');
    fs.renameSync(f + '.tmp', f);
  }
  // preview
  await sharp(svg(feltBg('', '<rect width="108" height="108" rx="24" fill="url(#g)"/>') + cards, '0 0 108 108')).resize(512).png().toFile('/tmp/icon-preview.png');
  console.log('icons + splash written');
})();
