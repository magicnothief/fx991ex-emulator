// Test helpers: build editor nodes from compact strings and evaluate them like the Calculate mode does.
import { tok, tpl } from '../src/core/editor.js';
import { TOKENS } from '../src/core/tokens.js';
import { parseStatements } from '../src/core/parser.js';
import { evaluate } from '../src/core/evaluator.js';
import { formatReal, modelText } from '../src/core/format.js';
import * as V from '../src/core/values.js';

const IDS = Object.keys(TOKENS).sort((a, b) => b.length - a.length);
const ALIASES = { '−': '-', '~': 'neg' };

/** Line-input string → token nodes. "~" is the (-) key; "@A" is variable A (A–F, M, x, y). */
export function line(s) {
  const out = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') { i++; continue; }
    if (ALIASES[ch]) { out.push(tok(ALIASES[ch])); i++; continue; }
    if (ch === '@') { out.push(tok(`v${s[i + 1]}`)); i += 2; continue; }
    const id = IDS.find((k) => s.startsWith(k, i));
    if (!id) throw new Error(`cannot tokenize at ${s.slice(i)}`);
    out.push(tok(id));
    i += id.length;
  }
  return out;
}

export { tok, tpl };

export const SETUP = Object.freeze({
  io: 'mm', angle: 'deg', numFormat: { mode: 'norm', digits: 1 }, engSymbol: false, fracResult: 'improper',
});

export function ctx(over = {}) {
  return { angle: 'deg', complex: false, baseMode: null, numFormat: SETUP.numFormat, vars: {}, ans: undefined, ...over };
}

/** Evaluates nodes and formats the (real or complex) result as plain text. */
export function calc(nodes, { setup = {}, context = {}, view = {} } = {}) {
  const s = { ...SETUP, ...setup };
  const c = ctx({ angle: s.angle, ...context });
  const stmts = parseStatements(nodes, { baseMode: c.baseMode });
  let v;
  for (const st of stmts) v = evaluate(st, c);
  return show(v, s, view);
}

export function show(v, s = SETUP, view = {}) {
  if (v.pair) return v.labels.map((l, i) => `${l}=${modelText(formatReal(v.values[i], s, view))}`).join(', ');
  if (V.isCx(v)) {
    const re = modelText(formatReal(v.re, s, view));
    const im = modelText(formatReal(v.im, s, view));
    return `${re}${im.startsWith('-') ? '' : '+'}${im}i`;
  }
  return modelText(formatReal(v, s, view));
}
