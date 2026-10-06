// Hardware key → action, per modifier. Overrides apply in Base-N and Complex modes.
//   n: plain, s: after SHIFT, a: after ALPHA, b: Base-N plain, c: Complex plain, cs: Complex after SHIFT
export const KEYMAP = {
  UP: { n: 'up' }, DOWN: { n: 'down' }, LEFT: { n: 'left' }, RIGHT: { n: 'right' },
  MENU: { n: 'menu', s: 'setup' },
  ON: { n: 'on' },
  OPTN: { n: 'optn', s: 'qr' },
  CALC: { n: 'calc', s: 'solve', a: 'tok:=' },
  INT: { n: 'tpl:int', s: 'tpl:diff', a: 'tok::' },
  X: { n: 'var:x', s: 'tpl:sum' },
  FRAC: { n: 'tpl:frac', s: 'tpl:mixed' },
  SQRT: { n: 'tpl:sqrt', s: 'tpl:cbrt' },
  SQR: { n: 'tok:²', s: 'tok:³', b: 'base:dec' },
  POW: { n: 'tpl:pow', s: 'tpl:root', b: 'base:hex' },
  LOG: { n: 'tpl:logab', s: 'tpl:pow10', b: 'base:bin' },
  LN: { n: 'tok:ln(', s: 'tpl:exp', b: 'base:oct' },
  NEG: { n: 'tok:neg', s: 'tok:log(', a: 'var:A', b: 'hex:A' },
  DMS: { n: 'dms', s: 'fact', a: 'var:B', b: 'hex:B' },
  INV: { n: 'tok:⁻¹', s: 'tok:!', a: 'var:C', b: 'hex:C' },
  SIN: { n: 'tok:sin(', s: 'tok:asin(', a: 'var:D', b: 'hex:D' },
  COS: { n: 'tok:cos(', s: 'tok:acos(', a: 'var:E', b: 'hex:E' },
  TAN: { n: 'tok:tan(', s: 'tok:atan(', a: 'var:F', b: 'hex:F' },
  STO: { n: 'sto', s: 'recall' },
  ENG: { n: 'eng', s: 'engleft', c: 'tok:i', cs: 'tok:∠' },
  LP: { n: 'tok:(', s: 'tpl:abs' },
  RP: { n: 'tok:)', s: 'tok:,', a: 'var:x' },
  SD: { n: 'sd', s: 'mixed', a: 'var:y' },
  MPLUS: { n: 'm+', s: 'm-', a: 'var:M' },
  7: { n: 'tok:7', s: 'const' },
  8: { n: 'tok:8', s: 'conv' },
  9: { n: 'tok:9', s: 'reset' },
  DEL: { n: 'del', s: 'ins', a: 'undo' },
  AC: { n: 'ac', s: 'off' },
  4: { n: 'tok:4', s: 'atomic' }, 5: { n: 'tok:5' }, 6: { n: 'tok:6' },
  1: { n: 'tok:1' }, 2: { n: 'tok:2' }, 3: { n: 'tok:3' },
  0: { n: 'tok:0', s: 'tok:Rnd(' },
  MUL: { n: 'tok:×', s: 'tok:P' },
  DIV: { n: 'tok:÷', s: 'tok:C' },
  ADD: { n: 'tok:+', s: 'tok:Pol(' },
  SUB: { n: 'tok:-', s: 'tok:Rec(' },
  DOT: { n: 'tok:.', s: 'tok:Ran#', a: 'tok:RanInt#(', b: 'noop' }, // Base-N takes no decimals
  EXP: { n: 'exp', s: 'tok:π', a: 'tok:e', b: 'noop' }, // nor exponents
  ANS: { n: 'tok:Ans', s: 'tok:%' },
  EQ: { n: 'eq', s: 'approx' },
};

/** The key whose ALPHA label is a variable, used after STO and on the RECALL screen. */
export const VARIABLE_KEYS = { NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', RP: 'x', X: 'x', SD: 'y' };

/** Menu selection keys: digits, then the letter keys A–F, M and x. */
export const MENU_KEY = { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 0: '0', NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D', COS: 'E', TAN: 'F', MPLUS: 'M', X: 'x' };

export function resolveKey(key, { shift, alpha, mode }) {
  const m = KEYMAP[key];
  if (!m) return null;
  if (mode === 'base' && !shift && !alpha && m.b) return m.b;
  if (mode === 'cmplx' && m.c) {
    if (shift && m.cs) return m.cs;
    if (!shift && !alpha) return m.c;
  }
  if (shift && m.s) return m.s;
  if (alpha && m.a) return m.a;
  return m.n;
}
