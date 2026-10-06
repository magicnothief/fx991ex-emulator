// Builds the fx-991CE X keypad. Key ids are the hardware keys; the calculator resolves SHIFT/ALPHA.
const box = '<span class="ico-box"></span>';
const fill = '<span class="ico-fill"></span>';
const fracIcon = `<span class="ico-frac">${fill}<span class="bar"></span>${box}</span>`;

// [id, face html, labels: { s: shift, a: alpha, b: Base-N, c: complex, ab: alpha in Base-N bracket }]
const FN_ROWS = [
  [
    ['OPTN', 'OPTN', { s: 'QR' }],
    ['CALC', 'CALC', { s: 'SOLVE', a: '=' }],
    null,
    null,
    ['INT', `∫<span class="small">${box}</span>${fill}`, { s: 'd/dx▪', a: ':' }],
    ['X', '<span class="it">x</span>', { s: 'Σ▪' }],
  ],
  [
    ['FRAC', fracIcon, { s: '▪▭⁄▭' }],
    ['SQRT', `√${fill}`, { s: '∛▪' }],
    ['SQR', '<span class="it">x</span><sup>2</sup>', { s: 'x³', b: 'DEC' }],
    ['POW', `<span class="it">x</span><sup>${fill}</sup>`, { s: '▪√▫', b: 'HEX' }],
    ['LOG', `log<span class="small">${fill}${box}</span>`, { s: '10▪', b: 'BIN' }],
    ['LN', 'ln', { s: 'e▪', b: 'OCT' }],
  ],
  [
    ['NEG', '(−)', { s: 'log', ab: 'A' }],
    ['DMS', '° ’ ”', { s: 'FACT', ab: 'B' }],
    ['INV', '<span class="it">x</span><sup>−1</sup>', { s: 'x!', ab: 'C' }],
    ['SIN', 'sin', { s: 'sin⁻¹', ab: 'D' }],
    ['COS', 'cos', { s: 'cos⁻¹', ab: 'E' }],
    ['TAN', 'tg', { s: 'tg⁻¹', ab: 'F' }],
  ],
  [
    ['STO', 'STO', { s: 'RECALL' }],
    ['ENG', 'ENG', { cb: '∠', s: '←', c: 'i' }],
    ['LP', '(', { s: 'Abs' }],
    ['RP', ')', { s: ';', a: 'x' }],
    ['SD', 'S⇔D', { s: 'a<small>b</small>⁄<small>c</small>⇔<small>d</small>⁄<small>c</small>', a: 'y' }],
    ['MPLUS', 'M+', { s: 'M−', a: 'M' }],
  ],
];

const NUM_ROWS = [
  [['7', '7', { s: 'CONST' }], ['8', '8', { s: 'CONV' }], ['9', '9', { s: 'RESET' }], ['DEL', 'DEL', { s: 'INS', a: 'UNDO' }, 'blue'], ['AC', 'AC', { s: 'OFF' }, 'blue']],
  [['4', '4', { s: 'ATOMIC' }], ['5', '5', {}], ['6', '6', {}], ['MUL', '×', { s: 'nPr' }], ['DIV', '÷', { s: 'nCr' }]],
  [['1', '1', {}], ['2', '2', {}], ['3', '3', {}], ['ADD', '+', { s: 'Pol' }], ['SUB', '−', { s: 'Rec' }]],
  [['0', '0', { s: 'Rnd' }], ['DOT', ',', { s: 'Ran#', a: 'RanInt' }], ['EXP', '×10<sup class="it">x</sup>', { s: 'π', a: 'e' }], ['ANS', 'Ans', { s: '%' }], ['EQ', '=', { s: '≈' }]],
];

function labelsHtml(l) {
  const parts = [];
  if (l.cb) parts.push(`<span class="cbracket">${l.cb}</span>`);
  if (l.s) parts.push(`<span class="s">${l.s}</span>`);
  if (l.c) parts.push(`<span class="c">${l.c}</span>`);
  if (l.b) parts.push(`<span class="b">${l.b}</span>`);
  if (l.a) parts.push(`<span class="a">${l.a}</span>`);
  if (l.ab) parts.push(`<span class="bracket">${l.ab}</span>`);
  if (parts.length === 1) return parts[0].replace('class="', 'class="only ');
  return parts.join('');
}

function keyCell(def, kind) {
  const [id, face, labels, variant] = def;
  const cell = document.createElement('div');
  cell.className = 'kcell';
  cell.innerHTML = `<div class="labels">${labelsHtml(labels)}</div>`;
  const btn = document.createElement('button');
  btn.className = `key ${variant || kind}`;
  btn.dataset.key = id;
  btn.innerHTML = face;
  btn.setAttribute('aria-label', id);
  cell.append(btn);
  return cell;
}

/** Renders the keypad into `root`; calls onKey(id) on presses. Returns a function that flashes a key. */
export function buildKeypad(root, onKey) {
  const ctl = document.createElement('div');
  ctl.className = 'ctl-row';
  ctl.innerHTML = `
    <div class="slot"><div class="ctl-label" style="color:var(--shift)">SHIFT</div><button class="round-key" data-key="SHIFT" aria-label="SHIFT"></button></div>
    <div class="slot"><div class="ctl-label" style="color:var(--alpha)">ALPHA</div><button class="round-key" data-key="ALPHA" aria-label="ALPHA"></button></div>
    <div class="dpad">
      <button class="up" data-key="UP" aria-label="up"></button>
      <button class="left" data-key="LEFT" aria-label="left"></button>
      <button class="right" data-key="RIGHT" aria-label="right"></button>
      <button class="down" data-key="DOWN" aria-label="down"></button>
    </div>
    <div class="slot"><div class="ctl-label"><span style="color:#eee">MENU</span> <span style="color:var(--shift)">SETUP</span></div><button class="round-key" data-key="MENU" aria-label="MENU"></button></div>
    <div class="slot"><div class="ctl-label" style="color:#eee">ON</div><button class="round-key" data-key="ON" aria-label="ON"></button></div>`;
  root.append(ctl);

  FN_ROWS.forEach((row, i) => {
    const r = document.createElement('div');
    r.className = `krow ${i === 0 ? 'f4' : 'f6'}`;
    for (const def of row) {
      if (!def) {
        const s = document.createElement('div');
        s.className = 'spacer';
        r.append(s);
      } else r.append(keyCell(def, 'fn'));
    }
    root.append(r);
  });
  const gap = document.createElement('div');
  gap.style.height = '8px';
  root.append(gap);
  for (const row of NUM_ROWS) {
    const r = document.createElement('div');
    r.className = 'krow n5';
    for (const def of row) r.append(keyCell(def, 'num'));
    root.append(r);
  }

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
  ['s c t', 'sin cos tan'], ['l', 'ln'], ['q', '√'], ['x', 'x'], ['a', 'Ans'], ['e', '×10ˣ'], ['Ctrl+C', 'copy result'],
];
