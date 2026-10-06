// Parses editor nodes into an expression tree following the fx-991EX priority sequence:
//  1 parentheses  2 functions with "("  3 postfix/powers/roots  4 fractions  5 (-) and base prefixes
//  6 conversions and x̂/ŷ  7 implied multiplication  8 nPr nCr ∠  9 •  10 × ÷  11 + −  12 and  13 or xor xnor
import { CalcError, ERR } from './errors.js';
import { tokenInfo } from './tokens.js';
import * as N from './num.js';
import * as Q from './rational.js';

const BASES = { d: 10, h: 16, b: 2, o: 8 };
const BASE_OF_MODE = { dec: 10, hex: 16, bin: 2, oct: 8 };

const syntax = (pos = null) => new CalcError(ERR.SYNTAX, pos);

/**
 * opts: { baseMode: null|'dec'|'hex'|'bin'|'oct', cells: bool }
 * Returns a list of statements separated by ':'; each statement may be an equation { t: 'eq', a, b }.
 */
export function parseStatements(nodes, opts = {}) {
  const parts = [[]];
  for (const nd of nodes) {
    if (nd.k === 'tok' && nd.id === ':') parts.push([]);
    else parts[parts.length - 1].push(nd);
  }
  return parts.map((p) => parseEquation(p, opts));
}

export function parseEquation(nodes, opts = {}) {
  const i = nodes.findIndex((nd) => nd.k === 'tok' && nd.id === '=');
  if (i < 0) return parseExpression(nodes, opts);
  if (nodes.slice(i + 1).some((nd) => nd.k === 'tok' && nd.id === '=')) throw syntax(i);
  return { t: 'eq', a: parseExpression(nodes.slice(0, i), opts), b: parseExpression(nodes.slice(i + 1), opts) };
}

const FORMAT_COMMANDS = new Set(['►r∠θ', '►a+bi']);

export function parseExpression(nodes, opts = {}) {
  // ▸r∠θ / ▸a+bi at the end applies to the whole expression (Complex mode output format)
  const last = nodes[nodes.length - 1];
  if (last && last.k === 'tok' && FORMAT_COMMANDS.has(last.id)) {
    return { t: 'post', op: last.id, a: parseExpression(nodes.slice(0, -1), opts) };
  }
  const items = lex(nodes, opts);
  if (items.length === 0) throw syntax(0);
  const p = new Parser(items, opts);
  const ast = p.expr();
  if (p.i < items.length) throw syntax(items[p.i].pos);
  return ast;
}

// ---------------------------------------------------------------- lexer

function lex(nodes, opts) {
  const out = [];
  const baseDefault = opts.baseMode ? BASE_OF_MODE[opts.baseMode] : 10;
  let i = 0;
  while (i < nodes.length) {
    const nd = nodes[i];
    if (nd.k === 'tpl') {
      if (nd.id === 'e10') {
        // ×10^n without a preceding number means 1×10^n
        out.push({ ty: 'num', v: scaleLiteral(N.ONE, nd, opts), pos: i });
      } else {
        out.push({ ty: 'tpl', id: nd.id, slots: nd.s.map((s, k) => parseSlot(nd.id, k, s, opts)), pos: i });
      }
      i++;
      continue;
    }
    const info = tokenInfo(nd.id);
    // base prefix followed by digits: literal in that base
    if (info.base && opts.baseMode) {
      const j = i + 1;
      const { text, next } = readDigits(nodes, j, true);
      if (!text) throw syntax(i);
      out.push({ ty: 'num', v: baseLiteral(text, BASES[info.base], i), pos: i });
      i = next;
      continue;
    }
    if (info.kind === 'digit' || info.kind === 'point') {
      const start = i;
      const { text, next } = readDigits(nodes, i, !!opts.baseMode);
      let v;
      if (opts.baseMode) v = baseLiteral(text, baseDefault, i);
      else {
        if (info.hex) throw syntax(i);
        if ((text.match(/\./g) || []).length > 1 || text === '.') throw syntax(i);
        v = N.fromLiteral(text.startsWith('.') ? `0${text}` : text);
      }
      i = next;
      // scientific notation: Line "E" token or Math ×10^□ template
      if (i < nodes.length && nodes[i].k === 'tpl' && nodes[i].id === 'e10') {
        v = scaleLiteral(v, nodes[i], opts);
        i++;
      } else if (i < nodes.length && nodes[i].k === 'tok' && nodes[i].id === 'E') {
        const r = readExponent(nodes, i + 1);
        v = N.scale10(v, r.e);
        v = { ...v, f: 'dec' };
        i = r.next;
      }
      out.push({ ty: 'num', v, pos: start });
      continue;
    }
    if (info.kind === 'exp') {
      const r = readExponent(nodes, i + 1);
      out.push({ ty: 'num', v: N.scale10(N.ONE, r.e), pos: i });
      i = r.next;
      continue;
    }
    if (opts.cells && info.kind === 'var' && 'ABCDE'.includes(info.name) || opts.cells && info.kind === 'dollar') {
      const cell = readCell(nodes, i);
      if (cell) {
        out.push({ ty: 'cell', ...cell.ref, pos: i });
        i = cell.next;
        continue;
      }
    }
    out.push({ ty: 'tok', id: nd.id, info, pos: i });
    i++;
  }
  return out;
}

function readDigits(nodes, i, allowHex) {
  let text = '';
  while (i < nodes.length && nodes[i].k === 'tok') {
    const info = tokenInfo(nodes[i].id);
    if (info.kind === 'digit' && (!info.hex || allowHex)) text += info.text;
    else if (info.kind === 'point') text += '.';
    else break;
    i++;
  }
  return { text, next: i };
}

function readExponent(nodes, i) {
  let sign = 1;
  if (i < nodes.length && nodes[i].k === 'tok' && (nodes[i].id === 'neg' || nodes[i].id === '-')) { sign = -1; i++; }
  let text = '';
  while (i < nodes.length && nodes[i].k === 'tok' && tokenInfo(nodes[i].id).kind === 'digit' && !tokenInfo(nodes[i].id).hex) {
    text += nodes[i].id;
    i++;
  }
  if (!text || text.length > 2) throw syntax(i);
  return { e: sign * parseInt(text, 10), next: i };
}

function scaleLiteral(v, tplNode, opts) {
  const slot = tplNode.s[0];
  let sign = 1, j = 0;
  if (slot[0] && slot[0].k === 'tok' && (slot[0].id === 'neg' || slot[0].id === '-')) { sign = -1; j = 1; }
  const digits = slot.slice(j).map((nd) => (nd.k === 'tok' && /^\d$/.test(nd.id) ? nd.id : null));
  if (!digits.length || digits.includes(null) || digits.length > 2) throw syntax();
  return { ...N.scale10(v, sign * parseInt(digits.join(''), 10)), f: 'dec' };
}

function baseLiteral(text, base, pos) {
  if (text.includes('.')) throw syntax(pos);
  const valid = '0123456789ABCDEF'.slice(0, base);
  if (![...text].every((c) => valid.includes(c))) throw syntax(pos);
  let n = BigInt(0);
  for (const c of text) n = n * BigInt(base) + BigInt(valid.indexOf(c));
  if (base === 10) {
    if (n > 2147483648n) throw new CalcError(ERR.MATH, pos);
  } else {
    if (n > 0xffffffffn) throw new CalcError(ERR.MATH, pos);
    if (n >= 0x80000000n) n -= 0x100000000n; // two's complement
  }
  return N.fromRat(Q.rat(n), 'int');
}

function readCell(nodes, i) {
  let absCol = false, absRow = false;
  let j = i;
  const isTok = (k, id) => k < nodes.length && nodes[k].k === 'tok' && (id ? nodes[k].id === id : true);
  if (isTok(j, '$')) { absCol = true; j++; }
  if (!isTok(j) || tokenInfo(nodes[j].id).kind !== 'var' || !'ABCDE'.includes(tokenInfo(nodes[j].id).name)) return null;
  const col = tokenInfo(nodes[j].id).name;
  j++;
  if (isTok(j, '$')) { absRow = true; j++; }
  let text = '';
  while (isTok(j) && /^\d$/.test(nodes[j].id)) { text += nodes[j].id; j++; }
  if (!text) return null;
  return { ref: { col, row: parseInt(text, 10), absCol, absRow }, next: j };
}

/** Parses one template slot. Empty slots are a syntax error, except optional ones. */
function parseSlot(id, k, slot, opts) {
  if (slot.length === 0) {
    if (id === 'logab' && k === 0) return null;
    throw syntax();
  }
  return parseExpression(slot, opts);
}

// ---------------------------------------------------------------- recursive descent

const STARTS_OPERAND = new Set(['var', 'value', 'open', 'func', 'prefix', 'digit', 'point']);

class Parser {
  constructor(items, opts) {
    this.items = items;
    this.i = 0;
    this.opts = opts;
  }

  peek() { return this.items[this.i]; }
  peekId() { const it = this.items[this.i]; return it && it.ty === 'tok' ? it.id : null; }
  peekKind() { const it = this.items[this.i]; return it ? (it.ty === 'tok' ? it.info.kind : it.ty) : null; }
  next() { return this.items[this.i++]; }
  posHere() { const it = this.items[this.i]; return it ? it.pos : this.items.length ? this.items[this.items.length - 1].pos + 1 : 0; }

  expr() { return this.logicOr(); }

  binaryLevel(sub, ops) {
    let a = sub();
    while (ops.includes(this.peekId())) {
      const op = this.next().id;
      a = { t: 'bin', op, a, b: sub() };
    }
    return a;
  }

  logicOr() { return this.binaryLevel(() => this.logicAnd(), ['or', 'xor', 'xnor']); }
  logicAnd() { return this.binaryLevel(() => this.additive(), ['and']); }
  additive() { return this.binaryLevel(() => this.multiplicative(), ['+', '-']); }
  multiplicative() { return this.binaryLevel(() => this.dot(), ['×', '÷']); }
  dot() { return this.binaryLevel(() => this.perm(), ['•']); }
  perm() { return this.binaryLevel(() => this.implicit(), ['P', 'C', '∠']); }

  startsOperand() {
    const it = this.peek();
    if (!it) return false;
    if (it.ty === 'num' || it.ty === 'tpl' || it.ty === 'cell') return true;
    return STARTS_OPERAND.has(it.info.kind);
  }

  implicit() {
    let a = this.conversion();
    while (this.startsOperand()) {
      // a template that only extends the previous operand (powers) never starts a new one
      if (this.peek().ty === 'tpl' && this.peek().id === 'pow') throw syntax(this.posHere());
      a = { t: 'bin', op: 'imul', a, b: this.conversion() };
    }
    return a;
  }

  conversion() {
    let a = this.negation();
    for (;;) {
      const it = this.peek();
      if (it && it.ty === 'tok' && (it.info.convId || ['x̂', 'ŷ', 'x̂1', 'x̂2'].includes(it.id))) {
        this.next();
        a = { t: 'post', op: it.id, a };
      } else return a;
    }
  }

  negation() {
    const it = this.peek();
    if (it && it.ty === 'tok' && it.id === 'neg') {
      this.next();
      return { t: 'neg', a: this.negation() };
    }
    if (it && it.ty === 'tok' && it.info.base) throw syntax(it.pos); // prefix outside Base-N
    return this.fraction();
  }

  fraction() {
    const a = this.power();
    if (this.peekId() !== '⌟') return a;
    this.next();
    const b = this.power();
    if (this.peekId() !== '⌟') return { t: 'frac', a, b };
    this.next();
    const c = this.power();
    return { t: 'mixed', w: a, a: b, b: c };
  }

  power() {
    let a = this.primary();
    for (;;) {
      const it = this.peek();
      if (!it) return a;
      if (it.ty === 'tpl' && it.id === 'pow') {
        this.next();
        a = { t: 'pow', a, b: it.slots[0] };
        continue;
      }
      if (it.ty !== 'tok') return a;
      if (it.id === 'dms') {
        // degrees°minutes°seconds° is one sexagesimal value
        this.next();
        const parts = [a];
        while (parts.length < 3 && this.peek()?.ty === 'num' && this.items[this.i + 1]?.ty === 'tok' && this.items[this.i + 1].id === 'dms') {
          parts.push({ t: 'num', v: this.next().v });
          this.next();
        }
        a = { t: 'dms', parts };
        continue;
      }
      if (it.info.kind === 'postfix' && !it.info.convId && !['x̂', 'ŷ', 'x̂1', 'x̂2', '►r∠θ', '►a+bi'].includes(it.id)) {
        this.next();
        a = { t: 'post', op: it.id, a };
        continue;
      }
      if (it.id === '^(') {
        this.next();
        a = { t: 'pow', a, b: this.closedArgs(1)[0] };
        continue;
      }
      if (it.id === 'xroot(') {
        this.next();
        a = { t: 'call', fn: 'root', args: [a, this.closedArgs(1)[0]] };
        continue;
      }
      return a;
    }
  }

  /** Arguments up to ')' — the closing parenthesis may be omitted at the end of the expression. */
  closedArgs(min, max = min) {
    const args = [this.expr()];
    while (this.peekId() === ',') {
      this.next();
      args.push(this.expr());
    }
    if (this.peekId() === ')') this.next();
    else if (this.i < this.items.length) throw syntax(this.posHere());
    if (args.length < min || args.length > max) throw syntax(this.posHere());
    return args;
  }

  primary() {
    const it = this.next();
    if (!it) throw syntax(this.posHere());
    if (it.ty === 'num') return { t: 'num', v: it.v };
    if (it.ty === 'cell') return { t: 'cell', col: it.col, row: it.row, absCol: it.absCol, absRow: it.absRow };
    if (it.ty === 'tpl') return templateNode(it);
    const { info } = it;
    switch (info.kind) {
      case 'var': return { t: 'var', name: info.name };
      case 'value': return { t: 'val', id: it.id };
      case 'open': {
        const a = this.expr();
        if (this.peekId() === ')') this.next();
        else if (this.i < this.items.length) throw syntax(this.posHere());
        return a;
      }
      case 'func': return this.funcCall(it);
      default: throw syntax(it.pos);
    }
  }

  funcCall(it) {
    const fn = it.id.slice(0, -1);
    const arity = {
      Pol: [2, 2], Rec: [2, 2], 'RanInt#': [2, 2], log: [1, 2], '∫': [3, 4], 'd/dx': [2, 3], 'Σ': [3, 3],
      Angle: [2, 2], Min: [1, 1], Max: [1, 1], Mean: [1, 1], Sum: [1, 1],
    }[fn] ?? [1, 1];
    if (['Min', 'Max', 'Mean', 'Sum'].includes(fn)) return { t: 'call', fn, args: [this.cellRange()] };
    const args = this.closedArgs(arity[0], arity[1]);
    return { t: 'call', fn, args };
  }

  cellRange() {
    const a = this.next();
    if (!a || a.ty !== 'cell' || this.peekId() !== ':') throw syntax(this.posHere());
    this.next();
    const b = this.next();
    if (!b || b.ty !== 'cell') throw syntax(this.posHere());
    if (this.peekId() === ')') this.next();
    return { t: 'range', a, b };
  }
}

function templateNode(it) {
  const [s0, s1, s2] = it.slots;
  switch (it.id) {
    case 'frac': return { t: 'frac', a: s0, b: s1 };
    case 'mixed': return { t: 'mixed', w: s0, a: s1, b: s2 };
    case 'sqrt': return { t: 'call', fn: '√', args: [s0] };
    case 'cbrt': return { t: 'call', fn: '∛', args: [s0] };
    case 'root': return { t: 'call', fn: 'root', args: [s0, s1] };
    case 'pow10': return { t: 'call', fn: '10^', args: [s0] };
    case 'exp': return { t: 'call', fn: 'e^', args: [s0] };
    case 'logab': return { t: 'call', fn: 'log', args: s0 ? [s0, s1] : [s1] };
    case 'abs': return { t: 'call', fn: 'Abs', args: [s0] };
    case 'int': return { t: 'call', fn: '∫', args: [s0, s1, s2] };
    case 'diff': return { t: 'call', fn: 'd/dx', args: [s0, s1] };
    case 'sum': return { t: 'call', fn: 'Σ', args: [s0, s1, s2] };
    default: throw syntax(it.pos);
  }
}

/** Variables referenced by an expression tree (for CALC and SOLVE prompts), in order of appearance. */
export function variablesOf(ast, out = []) {
  if (!ast || typeof ast !== 'object') return out;
  if (ast.t === 'var' && !out.includes(ast.name)) out.push(ast.name);
  for (const k of ['a', 'b', 'w']) if (ast[k]) variablesOf(ast[k], out);
  if (ast.args) for (const x of ast.args) variablesOf(x, out);
  return out;
}
