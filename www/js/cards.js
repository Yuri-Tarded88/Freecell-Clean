/* Card artwork: suit shapes, pip layouts and face cards, all as inline SVG. */
(function (root) {
  'use strict';
  const FC = (root.FC = root.FC || {});

  // Suit order: 0 clubs, 1 diamonds, 2 hearts, 3 spades. Each shape fits a 100 x 100 box.
  const SUIT_PATHS = [
    // clubs
    '<circle cx="50" cy="28" r="22"/><circle cx="25" cy="62" r="22"/><circle cx="75" cy="62" r="22"/><circle cx="50" cy="55" r="14"/>' +
      '<path d="M50 52 C50 74 47 88 35 97 L65 97 C53 88 50 74 50 52Z"/>',
    // diamonds
    '<path d="M50 2 C56 22 72 40 91 50 C72 60 56 78 50 98 C44 78 28 60 9 50 C28 40 44 22 50 2Z"/>',
    // hearts
    '<path d="M50 95 C50 95 4 63 4 33 C4 17 16 6 30 6 C40 6 47 11 50 20 C53 11 60 6 70 6 C84 6 96 17 96 33 C96 63 50 95 50 95Z"/>',
    // spades
    '<path d="M50 3 C50 3 5 38 5 63 C5 78 16 87 29 87 C37 87 44 83 48 77 C47 87 43 93 33 97 L67 97 C57 93 53 87 52 77 C56 83 63 87 71 87 C84 87 95 78 95 63 C95 38 50 3 50 3Z"/>'
  ];
  const SUIT_IDS = ['clubs', 'diamonds', 'hearts', 'spades'];

  FC.SPRITE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    SUIT_PATHS.map((p, i) => '<symbol id="s-' + SUIT_IDS[i] + '" viewBox="0 0 100 100" fill="currentColor">' + p + '</symbol>').join('') +
    '<symbol id="crown" viewBox="0 0 40 26" fill="currentColor"><path d="M2 24 L0 6 L10 14 L20 1 L30 14 L40 6 L38 24Z"/></symbol>' +
    '</defs></svg>';

  const L = 30, C = 50, R = 70;
  const PIPS = {
    1: [[C, 92]],
    2: [[C, 62], [C, 122]],
    3: [[C, 62], [C, 92], [C, 122]],
    4: [[L, 62], [R, 62], [L, 122], [R, 122]],
    5: [[L, 62], [R, 62], [C, 92], [L, 122], [R, 122]],
    6: [[L, 62], [R, 62], [L, 92], [R, 92], [L, 122], [R, 122]],
    7: [[L, 62], [R, 62], [C, 77], [L, 92], [R, 92], [L, 122], [R, 122]],
    8: [[L, 62], [R, 62], [C, 77], [L, 92], [R, 92], [C, 107], [L, 122], [R, 122]],
    9: [[L, 62], [R, 62], [L, 82], [R, 82], [C, 92], [L, 102], [R, 102], [L, 122], [R, 122]],
    10: [[L, 62], [R, 62], [C, 72], [L, 82], [R, 82], [L, 102], [R, 102], [C, 112], [L, 122], [R, 122]]
  };
  const PIP_SIZE = [0, 54, 26, 26, 26, 26, 26, 21, 21, 18, 18];

  const use = (suit, x, y, s, flip) =>
    '<use href="#s-' + SUIT_IDS[suit] + '" x="' + (x - s / 2) + '" y="' + (y - s / 2) + '" width="' + s + '" height="' + s + '"' +
    (flip ? ' transform="rotate(180 ' + x + ' ' + y + ')"' : '') + '/>';

  const cache = [];
  function cardSVG(card) {
    if (cache[card]) return cache[card];
    const r = card >> 2, s = card & 3, label = FC.RANKS[r];
    let g = '<text class="rk" x="25" y="35">' + label + '</text>' + use(s, 63, 24, 27);
    if (r <= 9) {
      const n = r + 1, size = PIP_SIZE[n];
      for (const p of PIPS[n]) g += use(s, p[0], p[1], size, p[1] > 92);
    } else {
      // J, Q, K: framed monogram
      g += '<rect class="frame" x="19" y="52" width="62" height="82" rx="6"/>';
      if (r === 12 || r === 11) g += '<use class="crown" href="#crown" x="36" y="62" width="28" height="18"/>';
      g += '<text class="fl" x="50" y="122">' + label + '</text>';
      g += use(s, 31, 67, 12) + use(s, 69, 119, 12, true);
    }
    cache[card] = '<svg viewBox="0 0 100 142" aria-hidden="true">' + g + '</svg>';
    return cache[card];
  }

  // small inline suit icon for text (hints, stats)
  const suitIcon = (suit) => '<svg class="si s' + suit + '" viewBox="0 0 100 100" aria-hidden="true"><use href="#s-' + SUIT_IDS[suit] + '"/></svg>';
  const cardLabel = (card) => '<span class="cl s' + (card & 3) + '">' + FC.RANKS[card >> 2] + suitIcon(card & 3) + '</span>';

  FC.SUIT_IDS = SUIT_IDS;
  FC.cardSVG = cardSVG;
  FC.suitIcon = suitIcon;
  FC.cardLabel = cardLabel;
  if (typeof module !== 'undefined' && module.exports) module.exports = FC;
})(typeof self !== 'undefined' ? self : globalThis);
