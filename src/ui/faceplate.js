// Builds the fx-991CE X keypad. Key ids are the hardware keys; the calculator resolves SHIFT/ALPHA.
// Positions are measured from CASIO's photograph of the fx-991CE X (Rövid Útmutató p.1), scaled to the
// 460×960 design size; key faces and labels use the template symbols printed on the keys (■ is the
// part entered first, □ the other boxes).

// ---------------------------------------------------------------- symbols (1 unit = 0.1em)

const svg = (w, h, body, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 ${w} ${h}" style="width:${w / 10}em;height:${h / 10}em" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">${body}</svg>`;
const fill = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor" stroke="none"/>`;
const box = (x, y, w, h, sw = 0.9) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke-width="${sw}"/>`;
const radical = (x, h) => `<path d="M${x} ${h * 0.62} l1.3 -0.5 l2 ${h * 0.38 - 0.4} l2.6 ${-h * 0.9} h${h}"/>`;

const ICON = {
  frac: svg(8, 11, `${fill(0.6, 0.4, 6.8, 3.4)}<path d="M0 5.5 h8"/>${box(1.1, 7, 5.8, 3.5)}`),
  mixed: svg(12, 10, `${fill(0.4, 3.2, 4, 3.8)}${box(6.6, 0.5, 4.6, 3.4, 0.8)}<path d="M5.6 5.1 h6.4"/>${box(6.6, 6.2, 4.6, 3.3, 0.8)}`),
  sqrt: svg(12, 10, `${radical(0.4, 7.2)}${fill(6.4, 3.4, 4.6, 5)}`),
  cbrt: svg(13, 10, `<text x="0" y="4.2" font-size="4.6" fill="currentColor" stroke="none" font-family="Bahnschrift, Segoe UI, sans-serif">3</text>${radical(1.4, 7.4)}${fill(7.6, 3.6, 4.4, 4.8)}`),
  root: svg(14, 10, `${fill(0.3, 1.2, 3, 2.6)}${radical(1.6, 7.4)}${box(8.5, 3.6, 4.4, 5, 0.9)}`),
  powFill: svg(5, 10, fill(0.5, 0.6, 4, 3.6)),
  logArgs: svg(9, 10, `${fill(0.2, 6.2, 2.8, 3.4)}${box(4, 2.2, 4.2, 7, 1)}`),
  int: svg(17, 12, `<path d="M4.6 1.6 C3.6 0, 2.6 1, 2.6 3 V9 C2.6 11, 1.6 12, 0.6 10.4" stroke-width="1.2"/>${box(5.2, 0.6, 2.6, 2.6, 0.8)}${box(5.2, 8.6, 2.6, 2.6, 0.8)}${fill(9.6, 4.6, 6.6, 3.4)}`),
  sum: svg(12, 10, `<path d="M4.6 2 H0.6 L3 5 L0.6 8 H4.6" stroke-width="0.9"/>${box(1.2, 0, 2.2, 1.4, 0.6)}${box(1.2, 8.6, 2.2, 1.4, 0.6)}${fill(6.4, 2.6, 5, 3.6)}`),
};

const it = (s) => `<span class="it">${s}</span>`;
const sup = (s) => `<sup>${s}</sup>`;

// ---------------------------------------------------------------- key definitions
// [id, face html, labels]; labels: { s: SHIFT (gold), a: ALPHA (pink), b: Base-N (blue), ab: ALPHA letter in
// the blue Base-N bracket, cx: html of the purple complex bracket }

const OPTN_ROW = [
  ['OPTN', 'OPTN', { s: 'QR' }],
  ['CALC', 'CALC', { s: 'SOLVE', a: '=' }],
  null,
  null,
  ['INT', ICON.int, { s: `<span class="lfrac"><span>d</span><span>dx</span></span>${ICON.powFill}`, a: ':' }],
  ['X', it('x'), { s: `Σ${ICON.powFill}` }],
];

const FN_ROWS = [
  [
    ['FRAC', ICON.frac, { s: ICON.mixed }],
    ['SQRT', ICON.sqrt, { s: ICON.cbrt }],
    ['SQR', `${it('x')}${sup('2')}`, { s: `${it('x')}${sup('3')}`, b: 'DEC' }],
    ['POW', `${it('x')}${sup(ICON.powFill)}`, { s: ICON.root, b: 'HEX' }],
    ['LOG', `log${ICON.logArgs}`, { s: `10${sup(ICON.powFill)}`, b: 'BIN' }],
    ['LN', 'ln', { s: `${it('e')}${sup(ICON.powFill)}`, b: 'OCT' }],
  ],
  [
    ['NEG', '(−)', { s: 'log', ab: 'A' }],
    ['DMS', '°&thinsp;’&thinsp;”', { s: 'FACT', ab: 'B' }],
    ['INV', `${it('x')}${sup('−1')}`, { s: `${it('x')}!`, ab: 'C' }],
    ['SIN', 'sin', { s: `sin${sup('−1')}`, ab: 'D' }],
    ['COS', 'cos', { s: `cos${sup('−1')}`, ab: 'E' }],
    ['TAN', 'tg', { s: `tg${sup('−1')}`, ab: 'F' }],
  ],
  [
    ['STO', 'STO', { s: 'RECALL' }],
    ['ENG', 'ENG', { cx: '∠ <span class="s">←</span> i' }],
    ['LP', '(', { s: 'Abs' }],
    ['RP', ')', { s: ';', a: it('x') }],
    ['SD', 'S⇔D', { s: `a<span class="lfrac"><span>b</span><span>c</span></span>⇔<span class="lfrac"><span>d</span><span>c</span></span>`, a: it('y') }],
    ['MPLUS', 'M+', { s: 'M−', a: 'M' }],
  ],
];

const NUM_ROWS = [
  [['7', '7', { s: 'CONST' }], ['8', '8', { s: 'CONV' }], ['9', '9', { s: 'RESET' }], ['DEL', 'DEL', { s: 'INS', a: 'UNDO' }, 'blue'], ['AC', 'AC', { s: 'OFF' }, 'blue']],
  [['4', '4', { s: 'ATOMIC' }], ['5', '5', {}], ['6', '6', {}], ['MUL', '×', { s: 'nPr' }], ['DIV', '÷', { s: 'nCr' }]],
  [['1', '1', {}], ['2', '2', {}], ['3', '3', {}], ['ADD', '+', { s: 'Pol' }], ['SUB', '−', { s: 'Rec' }]],
  [['0', '0', { s: 'Rnd' }], ['DOT', ',', { s: 'Ran#', a: 'RanInt' }], ['EXP', `×10${sup(it('x'))}`, { s: 'π', a: it('e') }], ['ANS', 'Ans', { s: '%' }], ['EQ', '=', { s: '≈' }]],
];

// ---------------------------------------------------------------- geometry (design px)

const FN = { x: [64.6, 131.8, 199, 266.2, 333.5, 400.7], w: 53, h: 37, top: [505, 559, 614], optnTop: 450, pitch: 67 };
const NUM = { x: [67.2, 147.9, 228.5, 309.2, 389.8], w: 66, h: 45, top: [673, 740, 807, 874], pitch: 80 };
const ROUND = { x: [59.5, 120.5, 337.5, 398.5], y: 389, d: 36 };
const PAD = { x: 157, y: 364, w: 148, h: 104 };

function labelsHtml(l) {
  const parts = [];
  if (l.cx) parts.push(`<span class="cbracket">${l.cx}</span>`);
  if (l.s) parts.push(`<span class="s">${l.s}</span>`);
  if (l.b) parts.push(`<span class="b">${l.b}</span>`);
  if (l.a) parts.push(`<span class="a">${l.a}</span>`);
  if (l.ab) parts.push(`<span class="bracket">${l.ab}</span>`);
  if (parts.length === 1) return parts[0].replace('class="', 'class="only ');
  return parts.join('');
}

function place(el, x, y, w, h) {
  Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  return el;
}

function key(def, kind, cx, top, w, h, pitch) {
  const [id, face, labels, variant] = def;
  const frag = document.createDocumentFragment();
  const lab = place(document.createElement('div'), cx - pitch / 2, top - 15, pitch, 14);
  lab.className = 'labels';
  lab.innerHTML = labelsHtml(labels);
  const btn = place(document.createElement('button'), cx - w / 2, top, w, h);
  btn.className = `key ${variant || kind}`;
  btn.dataset.key = id;
  btn.innerHTML = face;
  btn.setAttribute('aria-label', id);
  frag.append(lab, btn);
  return frag;
}

/** The cursor pad: a rounded diamond split by an X into four keys around a dark centre. */
function dpad() {
  const { w, h } = PAD;
  const cx = w / 2, cy = h / 2;
  const shape = (a, b, n = 1.35, steps = 160) => Array.from({ length: steps }, (_, i) => {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    return [cx + a * Math.sign(c) * Math.abs(c) ** (2 / n), cy + b * Math.sign(s) * Math.abs(s) ** (2 / n)];
  });
  const path = (pts) => `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
  const outer = shape(w / 2 - 1, h / 2 - 1);
  const inner = shape(w / 2 - 5, h / 2 - 5);
  const diag = Math.atan2(h / 2, w / 2);
  const angle = ([x, y]) => Math.atan2(y - cy, x - cx);
  // the inner outline from angle `from` round to `to`, in order, closed through the centre
  const wedge = (from, to) => {
    const rel = (p) => (angle(p) - from + Math.PI * 4) % (Math.PI * 2);
    const pts = inner.filter((p) => rel(p) <= to - from).sort((p, q) => rel(p) - rel(q));
    return [[cx, cy], ...pts];
  };
  const keys = [
    ['UP', -Math.PI + diag, -diag],
    ['RIGHT', -diag, diag],
    ['DOWN', diag, Math.PI - diag],
    ['LEFT', Math.PI - diag, Math.PI + diag],
  ];
  // separators: from the centre to the rim along the four diagonals
  const rimAt = (a) => outer.reduce((best, p) => (Math.abs(Math.sin(angle(p) - a)) < Math.abs(Math.sin(angle(best) - a)) && Math.cos(angle(p) - a) > 0 ? p : best));
  const ends = [-Math.PI + diag, -diag, diag, Math.PI - diag].map((a) => {
    const [x, y] = rimAt(a);
    return `M${cx} ${cy}L${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join('');
  const el = place(document.createElement('div'), PAD.x, PAD.y, w, h);
  el.className = 'dpad';
  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <path class="rim" d="${path(outer)}"/>
    ${keys.map(([id, a, b]) => `<path class="pad-key" data-key="${id}" aria-label="${id.toLowerCase()}" d="${path(wedge(a, b))}"/>`).join('')}
    <path class="gap" d="${ends}"/>
    <path class="hub" d="${path(shape(31, 21))}"/>
  </svg>`;
  return el;
}

/** Renders the keypad into `root`; calls onKey(id) on presses. Returns a function that flashes a key. */
export function buildKeypad(root, onKey) {
  const roundLabels = [
    '<span class="s">SHIFT</span>', '<span class="a">ALPHA</span>',
    '<span class="w">MENU</span> <span class="s">SETUP</span>', '<span class="w">ON</span>',
  ];
  ['SHIFT', 'ALPHA', 'MENU', 'ON'].forEach((id, i) => {
    const x = ROUND.x[i];
    const lab = place(document.createElement('div'), x - 40, ROUND.y - ROUND.d / 2 - 17, 80, 14);
    lab.className = 'labels round-label';
    lab.innerHTML = roundLabels[i];
    const btn = place(document.createElement('button'), x - ROUND.d / 2, ROUND.y - ROUND.d / 2, ROUND.d, ROUND.d);
    btn.className = 'round-key';
    btn.dataset.key = id;
    btn.setAttribute('aria-label', id);
    root.append(lab, btn);
  });
  root.append(dpad());
  OPTN_ROW.forEach((def, c) => { if (def) root.append(key(def, 'fn', FN.x[c], FN.optnTop, FN.w, FN.h, FN.pitch)); });
  FN_ROWS.forEach((row, r) => row.forEach((def, c) => root.append(key(def, 'fn', FN.x[c], FN.top[r], FN.w, FN.h, FN.pitch))));
  NUM_ROWS.forEach((row, r) => row.forEach((def, c) => root.append(key(def, 'num', NUM.x[c], NUM.top[r], NUM.w, NUM.h, NUM.pitch))));

  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    e.preventDefault();
    onKey(b.dataset.key);
  });

  return (id) => {
    const b = root.querySelector(`[data-key="${id}"]`);
    if (!b) return;
    b.classList.add('pressed');
    setTimeout(() => b.classList.remove('pressed'), 120);
  };
}

// PC keyboard shortcuts (F1 shows this list in the app).
export const KEYBOARD = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '.': 'DOT', ',': 'DOT', ';': 'RP', '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '(': 'LP', ')': 'RP', '^': 'POW',
  Enter: 'EQ', '=': 'EQ', Backspace: 'DEL', Delete: 'DEL', Escape: 'AC',
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  F2: 'SHIFT', F3: 'ALPHA', F4: 'MENU', F5: 'OPTN', F6: 'CALC',
  s: 'SIN', c: 'COS', t: 'TAN', l: 'LN', q: 'SQRT', r: 'SQRT', x: 'X', a: 'ANS', e: 'EXP',
};

export const KEYBOARD_HELP = [
  ['0–9 . + − × ÷ ( )', 'same keys'], ['Enter', '='], ['Backspace', 'DEL'], ['Esc', 'AC'], ['Arrows', 'cursor pad'],
  ['F2', 'SHIFT'], ['F3', 'ALPHA'], ['F4', 'MENU'], ['F5', 'OPTN'], ['F6', 'CALC'], ['^', 'x▪'],
  ['s c t', 'sin cos tg'], ['l', 'ln'], ['q', '√'], ['x', 'x'], ['a', 'Ans'], ['e', '×10ˣ'], ['Ctrl+C', 'copy result'],
];
