// Input tokens. Each entry: [id, display text, parser kind, extra]
// kinds: digit point var value func(open paren) open close comma colon eq binop rel prefix postfix
//        frac(line ⌟) exp(line ×10) conv base cell dollar
const T = (id, text, kind, extra = {}) => [id, { id, text, kind, ...extra }];

const list = [
  ...'0123456789'.split('').map((d) => T(d, d, 'digit')),
  ...'ABCDEF'.split('').map((h) => T(`h${h}`, h, 'digit', { hex: true })),
  T('.', ',', 'point'), // fx-991CE X: decimal comma
  T('E', '×₁₀', 'exp'),
  // variables and values
  ...['A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y'].map((v) => T(`v${v}`, v, 'var', { name: v })),
  T('Ans', 'Ans', 'value'),
  T('π', 'π', 'value'),
  T('e', 'e', 'value'),
  T('i', 'i', 'value'),
  T('Ran#', 'Ran#', 'value'),
  ...['A', 'B', 'C', 'D', 'Ans'].map((m) => T(`Mat${m}`, `Mat${m}`, 'value')),
  ...['A', 'B', 'C', 'D', 'Ans'].map((m) => T(`Vct${m}`, `Vct${m}`, 'value')),
  // operators
  T('+', '+', 'binop'),
  T('-', '−', 'binop'),
  T('×', '×', 'binop'),
  T('÷', '÷', 'binop'),
  T('neg', '-', 'prefix'),
  T('(', '(', 'open'),
  T(')', ')', 'close'),
  T(',', ';', 'comma'), // argument separator shown as ';' (comma is the decimal mark)
  T(':', ':', 'colon'),
  T('=', '=', 'eq'),
  T('⌟', '⌟', 'frac'),
  T('∠', '∠', 'binop'),
  T('P', 'P', 'binop'),
  T('C', 'C', 'binop'),
  T('•', '•', 'binop'),
  T('and', ' and ', 'binop'),
  T('or', ' or ', 'binop'),
  T('xor', ' xor ', 'binop'),
  T('xnor', ' xnor ', 'binop'),
  T('$', '$', 'dollar'),
  T('AtWt', 'AtWt ', 'prefix', { atwt: true }), // atomic weight of the following atomic number (fx-991CE X)
  // postfix
  T('²', '²', 'postfix'),
  T('³', '³', 'postfix'),
  T('⁻¹', '⁻¹', 'postfix'),
  T('!', '!', 'postfix'),
  T('%', '%', 'postfix'),
  T('°u', '°', 'postfix'),
  T('ʳ', 'ʳ', 'postfix'),
  T('ᵍ', 'ᵍ', 'postfix'),
  T('dms', '°', 'postfix'),
  T('►t', '▸t', 'postfix'),
  T('x̂', 'x̂', 'postfix'),
  T('ŷ', 'ŷ', 'postfix'),
  T('x̂1', 'x̂₁', 'postfix'),
  T('x̂2', 'x̂₂', 'postfix'),
  T('►r∠θ', '▸r∠θ', 'postfix'),
  T('►a+bi', '▸a+bi', 'postfix'),
  ...['m', 'μ', 'n', 'p', 'f', 'k', 'M', 'G', 'T', 'P', 'E'].map((s) => T(`eng${s}`, s, 'postfix', { eng: s })),
  // base-n prefixes
  ...['d', 'h', 'b', 'o'].map((b) => T(`base${b}`, b, 'prefix', { base: b })),
  // functions that open a parenthesis
  ...[
    ['sin(', 'sin('], ['cos(', 'cos('], ['tan(', 'tg('],
    ['asin(', 'sin⁻¹('], ['acos(', 'cos⁻¹('], ['atan(', 'tg⁻¹('],
    ['sinh(', 'sinh('], ['cosh(', 'cosh('], ['tanh(', 'tgh('],
    ['asinh(', 'sinh⁻¹('], ['acosh(', 'cosh⁻¹('], ['atanh(', 'tgh⁻¹('],
    ['log(', 'log('], ['ln(', 'ln('], ['10^(', '10^('], ['e^(', 'e^('],
    ['√(', '√('], ['∛(', '³√('], ['^(', '^('], ['xroot(', 'ˣ√('],
    ['Abs(', 'Abs('], ['Pol(', 'Pol('], ['Rec(', 'Rec('], ['Rnd(', 'Rnd('],
    ['RanInt#(', 'RanInt#('], ['∫(', '∫('], ['d/dx(', 'd/dx('], ['Σ(', 'Σ('],
    ['Arg(', 'Arg('], ['Conjg(', 'Conjg('], ['ReP(', 'ReP('], ['ImP(', 'ImP('],
    ['Det(', 'Det('], ['Trn(', 'Trn('], ['Identity(', 'Identity('],
    ['Angle(', 'Angle('], ['UnitV(', 'UnitV('],
    ['Not(', 'Not('], ['Neg(', 'Neg('],
    ['P(', 'P('], ['Q(', 'Q('], ['R(', 'R('],
    ['Min(', 'Min('], ['Max(', 'Max('], ['Mean(', 'Mean('], ['Sum(', 'Sum('],
  ].map(([id, text]) => T(id, text, 'func')),
];

export const TOKENS = Object.fromEntries(list);

/** Tokens created on the fly: scientific constants, conversions, statistics variables. */
export function dynamicToken(id) {
  if (TOKENS[id]) return TOKENS[id];
  const [kind, key, text] = id.split('|');
  if (kind === 'const') return { id, text, kind: 'value', constId: key };
  if (kind === 'conv') return { id, text, kind: 'postfix', convId: key };
  if (kind === 'stat') return { id, text, kind: 'value', statId: key };
  throw new Error(`unknown token ${id}`);
}

export const tokenInfo = (id) => TOKENS[id] ?? dynamicToken(id);

// Natural Display templates and their slot counts.
export const TEMPLATES = {
  frac: 2,   // [numerator, denominator]
  mixed: 3,  // [whole, numerator, denominator]
  sqrt: 1,
  cbrt: 1,
  root: 2,   // [index, radicand]
  pow: 1,    // exponent; base is the preceding element
  pow10: 1,  // 10^□
  exp: 1,    // e^□
  e10: 1,    // ×10^□ (scientific notation input)
  logab: 2,  // [base, argument]
  abs: 1,
  int: 3,    // [f(x), lower, upper]
  diff: 2,   // [f(x), x value]
  sum: 3,    // [f(x), lower, upper]
};
