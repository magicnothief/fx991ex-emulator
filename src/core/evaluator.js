// Evaluates parsed expression trees.
//
// ctx = {
//   angle: 'deg'|'rad'|'gra', complex: bool, baseMode: null|'dec'|'hex'|'bin'|'oct', numFormat,
//   vars: { A..F, M, x, y }, ans, mats: { A, B, C, D, Ans }, vcts: { ... },
//   stats: Stats|null, cell(ref), range(fn, a, b), setVar(name, value)
// }
import * as N from './num.js';
import * as Q from './rational.js';
import * as V from './values.js';
import { ERR, fail, CalcError } from './errors.js';
import { tokenInfo } from './tokens.js';
import { CONSTANTS, CONVERSIONS } from './constants.js';
import { integrate, derivative } from './numerics.js';
import * as Dist from './dist.js';
import { ELEMENTS } from './elements.js';

const E_VALUE = N.fromDec(new N.D('2.71828182845904'));
const ratExpr = (s) => s.split('/').map(Q.parseDecimal).reduce(Q.div);

/** Evaluates one statement. Pol/Rec return { pair: true, labels, values } at top level. */
export function evaluate(ast, ctx) {
  if (ast.t === 'eq') fail(ERR.SYNTAX);
  const v = ev(ast, { ...ctx, top: true });
  return ctx.baseMode ? baseResult(v) : v;
}

/** Evaluates with x bound to a JS number and returns a JS number (for numerical methods). */
export function evalAt(ast, ctx, name, x) {
  const v = ev(ast, { ...ctx, top: false, local: { ...(ctx.local || {}), [name]: N.fromDec(new N.D(x)) } });
  return V.real(v).d.toNumber();
}

function ev(node, ctx) {
  const sub = (n) => ev(n, ctx.top ? { ...ctx, top: false } : ctx);
  switch (node.t) {
    case 'num': return node.v;
    case 'var': {
      if (ctx.local && node.name in ctx.local) return ctx.local[node.name];
      return ctx.vars[node.name] ?? N.ZERO;
    }
    case 'val': return valueOf(node.id, ctx);
    case 'cell': return ctx.cell ? ctx.cell(node) : fail(ERR.SYNTAX);
    case 'neg': return base(ctx, V.neg(sub(node.a)));
    case 'dms': {
      const [d, m = N.ZERO, s = N.ZERO] = node.parts.map((p) => V.real(sub(p)));
      return N.dms(d, m, s);
    }
    case 'frac': {
      const a = sub(node.a), b = sub(node.b);
      const r = V.div(a, b);
      return fracFormat(r, a, b);
    }
    case 'mixed': {
      const w = V.real(sub(node.w)), a = V.real(sub(node.a)), b = V.real(sub(node.b));
      const f = N.div(a, b);
      const r = N.sign(w) < 0 ? N.sub(w, f) : N.add(w, f);
      return fracFormat(r, w, a, b);
    }
    case 'pow': {
      const a = sub(node.a), b = sub(node.b);
      if (V.isMat(a) || V.isVec(a)) fail(ERR.SYNTAX); // matrices use x², x³, x⁻¹ only
      return base(ctx, V.pow(a, real(b)));
    }
    case 'bin': return binary(node, ctx, sub);
    case 'post': return postfix(node, ctx, sub);
    case 'call': return call(node, ctx, sub);
    case 'range': fail(ERR.SYNTAX);
    default: fail(ERR.SYNTAX);
  }
}

const real = (v) => V.real(v);

/** Fraction-input results keep the fraction display attribute (LineI/LineO). */
function fracFormat(r, ...parts) {
  if (!V.isReal(r)) return r;
  return parts.every((p) => V.isReal(p) && p.f !== 'dec') && N.ratOf(r) ? { ...r, f: 'frac' } : r;
}

function valueOf(id, ctx) {
  switch (id) {
    case 'Ans': return ctx.ans ?? N.ZERO;
    case 'π': return N.fromPi(Q.ONE);
    case 'e': return E_VALUE;
    case 'i':
      if (!ctx.complex) fail(ERR.SYNTAX);
      return V.I;
    case 'Ran#': return N.ranHash();
    default: break;
  }
  if (id.startsWith('Mat')) {
    const m = ctx.mats?.[id.slice(3)];
    if (!m) fail(ERR.DIMENSION);
    return m;
  }
  if (id.startsWith('Vct')) {
    const v = ctx.vcts?.[id.slice(3)];
    if (!v) fail(ERR.DIMENSION);
    return v;
  }
  const info = tokenInfo(id);
  if (info.constId) return N.fromDec(new N.D(CONSTANTS[info.constId].value));
  if (info.statId) {
    if (!ctx.stats) fail(ERR.SYNTAX);
    return ctx.stats.value(info.statId);
  }
  fail(ERR.SYNTAX);
}

// ---------------------------------------------------------------- Base-N integers

const INT_MIN = -2147483648n, INT_MAX = 2147483647n;

function toInt32(v) {
  const r = V.real(v);
  const q = N.ratOrDec(r);
  const t = q.n / q.d; // truncates toward zero (fractional part cut off)
  if (t < INT_MIN || t > INT_MAX) fail(ERR.MATH);
  return t;
}

const fromInt32 = (n) => N.fromRat(Q.rat(n), 'int');

function base(ctx, v) {
  return ctx.baseMode ? fromInt32(toInt32(v)) : v;
}

function baseResult(v) {
  if (v.pair) fail(ERR.SYNTAX);
  return fromInt32(toInt32(v));
}

const u32 = (n) => (n < 0n ? n + 0x100000000n : n);
const s32 = (n) => { n &= 0xffffffffn; return n >= 0x80000000n ? n - 0x100000000n : n; };

function logic(op, a, b) {
  const x = u32(a), y = u32(b);
  switch (op) {
    case 'and': return s32(x & y);
    case 'or': return s32(x | y);
    case 'xor': return s32(x ^ y);
    case 'xnor': return s32(~(x ^ y));
    default: fail(ERR.SYNTAX);
  }
}

// ---------------------------------------------------------------- operators

function binary(node, ctx, sub) {
  const { op } = node;
  if (['and', 'or', 'xor', 'xnor'].includes(op)) {
    if (!ctx.baseMode) fail(ERR.SYNTAX);
    return fromInt32(logic(op, toInt32(sub(node.a)), toInt32(sub(node.b))));
  }
  const a = sub(node.a), b = sub(node.b);
  if (a.pair || b.pair) fail(ERR.SYNTAX);
  switch (op) {
    case '+': return base(ctx, V.add(a, b));
    case '-': return base(ctx, V.sub(a, b));
    case '×': case 'imul': return base(ctx, V.mul(a, b));
    case '÷':
      if (ctx.baseMode && N.isZero(V.real(b))) fail(ERR.MATH);
      return base(ctx, V.div(a, b));
    case '∠':
      if (!ctx.complex) fail(ERR.SYNTAX);
      return V.polar(real(a), real(b), ctx.angle);
    case 'P': return N.nPr(real(a), real(b));
    case 'C': return N.nCr(real(a), real(b));
    case '•': return V.dot(a, b);
    default: fail(ERR.SYNTAX);
  }
}

function postfix(node, ctx, sub) {
  const { op } = node;
  const a = sub(node.a);
  const info = tokenInfo(op);
  if (info.eng) return N.scale10(real(a), N.ENG_SYMBOLS[info.eng]);
  if (info.convId) {
    const c = CONVERSIONS[info.convId];
    // conversion results are decimal-type (User's Guide p.37: 5 cm▸in = 1.968503937)
    const shifted = N.add(real(a), N.fromRat(ratExpr(c.offset)));
    return N.fromDec(N.mul(shifted, N.fromRat(ratExpr(c.factor))).d);
  }
  switch (op) {
    case '²': return base(ctx, V.isMat(a) ? V.pow(a, N.fromInt(2)) : V.mul(a, a));
    case '³': return base(ctx, V.isMat(a) ? V.pow(a, N.fromInt(3)) : V.mul(V.mul(a, a), a));
    case '⁻¹':
      if (V.isMat(a)) return V.matInverse(a);
      return base(ctx, V.div(N.ONE, a));
    case '!': return N.factorial(real(a));
    case '%': return N.percent(real(a));
    case '°u': return N.convertAngle(real(a), N.DEG, ctx.angle);
    case 'ʳ': return N.convertAngle(real(a), N.RAD, ctx.angle);
    case 'ᵍ': return N.convertAngle(real(a), N.GRA, ctx.angle);
    case '►t': return statsOf(ctx).tValue(real(a));
    case 'x̂': case 'ŷ': case 'x̂1': case 'x̂2': return statsOf(ctx).estimate(op, real(a));
    case '►r∠θ': case '►a+bi':
      if (!ctx.complex || !ctx.top) fail(ERR.SYNTAX);
      return { view: op === '►r∠θ' ? 'polar' : 'rect', value: a };
    default: fail(ERR.SYNTAX);
  }
}

const statsOf = (ctx) => ctx.stats || fail(ERR.SYNTAX);

// ---------------------------------------------------------------- functions

function call(node, ctx, sub) {
  const { fn, args } = node;
  const arg = (i) => sub(args[i]);
  const r = (i) => real(arg(i));
  const unit = ctx.angle;
  const realOnly = () => { if (ctx.baseMode) fail(ERR.SYNTAX); };
  switch (fn) {
    case 'sin': realOnly(); return N.sin(r(0), unit);
    case 'cos': realOnly(); return N.cos(r(0), unit);
    case 'tan': realOnly(); return N.tan(r(0), unit);
    case 'asin': realOnly(); return N.asin(r(0), unit);
    case 'acos': realOnly(); return N.acos(r(0), unit);
    case 'atan': realOnly(); return N.atan(r(0), unit);
    case 'sinh': return N.sinh(r(0));
    case 'cosh': return N.cosh(r(0));
    case 'tanh': return N.tanh(r(0));
    case 'asinh': return N.asinh(r(0));
    case 'acosh': return N.acosh(r(0));
    case 'atanh': return N.atanh(r(0));
    case 'log': return args.length === 2 ? N.logab(r(0), r(1)) : N.log10(r(0));
    case 'ln': return N.ln(r(0));
    case '10^': return N.exp10(r(0));
    case 'e^': return N.exp(r(0));
    case '√': {
      const a = arg(0);
      if (V.isMat(a) || V.isVec(a)) fail(ERR.SYNTAX);
      return V.sqrt(a, ctx.complex);
    }
    case '∛': return N.cbrt(r(0));
    case 'root': return N.xroot(r(0), r(1));
    case 'Abs': {
      const a = arg(0);
      return base(ctx, V.abs(a));
    }
    case 'Pol': case 'Rec': {
      if (!ctx.top || ctx.calculus) fail(ERR.SYNTAX);
      // Pol/Rec results are decimal-type (Radian Pol(1;1): r=1,414213562; θ=0,7853981634)
      const [p, q] = (fn === 'Pol' ? Object.values(N.pol(r(0), r(1), unit)) : Object.values(N.rec(r(0), r(1), unit)))
        .map((v) => N.fromDec(v.d));
      ctx.setVar?.('x', p);
      ctx.setVar?.('y', q);
      return { pair: true, labels: fn === 'Pol' ? ['r', 'θ'] : ['x', 'y'], values: [p, q] };
    }
    case 'Rnd': return N.rnd(r(0), ctx.numFormat);
    case 'AtWt': {
      if (ctx.baseMode) fail(ERR.SYNTAX);
      const z = r(0);
      if (!N.isInt(z) || z.d.lt(1) || z.d.gt(ELEMENTS.length)) fail(ERR.SYNTAX);
      return N.fromDec(new N.D(ELEMENTS[N.toNumber(z) - 1].weight));
    }
    case 'RanInt#': return N.ranInt(r(0), r(1));
    case '∫': return calculus(node, ctx, 'int');
    case 'd/dx': return calculus(node, ctx, 'diff');
    case 'Σ': return calculus(node, ctx, 'sum');
    case 'Arg': return V.arg(arg(0), unit);
    case 'Conjg': return V.conj(arg(0));
    case 'ReP': return V.realPart(arg(0));
    case 'ImP': return V.imagPart(arg(0));
    case 'Det': return V.det(arg(0));
    case 'Trn': {
      const m = arg(0);
      if (!V.isMat(m)) fail(ERR.SYNTAX);
      return V.transpose(m);
    }
    case 'Identity': {
      const n = r(0);
      if (!N.isInt(n) || n.d.lt(1) || n.d.gt(4)) fail(ERR.ARGUMENT);
      return V.identity(N.toNumber(n));
    }
    case 'Angle': return V.vecAngle(arg(0), arg(1), unit);
    case 'UnitV': return V.unitVector(arg(0));
    case 'Not': if (!ctx.baseMode) fail(ERR.SYNTAX); return fromInt32(s32(~u32(toInt32(arg(0)))));
    case 'Neg': if (!ctx.baseMode) fail(ERR.SYNTAX); return fromInt32(s32(-toInt32(arg(0))));
    // P(, Q(, R( results are given to five decimal places (User's Guide: P(Ans) = 0.19324)
    case 'P': return N.fromDec(new N.D(Dist.P(r(0).d.toNumber())).toDecimalPlaces(5));
    case 'Q': return N.fromDec(new N.D(Dist.Qf(r(0).d.toNumber())).toDecimalPlaces(5));
    case 'R': return N.fromDec(new N.D(Dist.R(r(0).d.toNumber())).toDecimalPlaces(5));
    case 'Min': case 'Max': case 'Mean': case 'Sum':
      if (!ctx.range) fail(ERR.SYNTAX);
      return ctx.range(fn, args[0].a, args[0].b);
    default: fail(ERR.SYNTAX);
  }
}

function calculus(node, ctx, kind) {
  if (ctx.calculus) fail(ERR.SYNTAX); // ∫, d/dx and Σ cannot be nested
  const inner = { ...ctx, calculus: true, top: false };
  const [fAst, ...rest] = node.args;
  const num = (a) => V.real(ev(a, inner));
  if (kind === 'sum') {
    const a = num(rest[0]), b = num(rest[1]);
    if (!N.isInt(a) || !N.isInt(b)) fail(ERR.ARGUMENT); // Σ limits must be integers (Argumentum HIBA)
    if (a.d.gt(b.d) || a.d.abs().gte(1e10) || b.d.abs().gte(1e10)) fail(ERR.MATH);
    const lo = N.toBigInt(a), hi = N.toBigInt(b);
    if (hi - lo > 1000000n) fail(ERR.TIME_OUT);
    let s = N.ZERO;
    for (let k = lo; k <= hi; k++) {
      s = V.add(s, ev(fAst, { ...inner, local: { ...(ctx.local || {}), x: N.fromRat(Q.rat(k), 'int') } }));
    }
    return s;
  }
  const f = (x) => evalAt(fAst, inner, 'x', x);
  const guard = (fn) => {
    try { return fn(); } catch (e) { if (e instanceof CalcError) throw e; throw new CalcError(ERR.MATH); }
  };
  if (kind === 'int') {
    const a = num(rest[0]).d.toNumber(), b = num(rest[1]).d.toNumber();
    const tol = rest[2] ? num(rest[2]).d.toNumber() : 1e-5;
    if (!(tol > 0)) fail(ERR.MATH);
    const v = guard(() => integrate(f, a, b, tol));
    return N.recognize(N.fromDec(new N.D(v).toSD(15)));
  }
  const x0 = num(rest[0]).d.toNumber();
  const tol = rest[1] ? num(rest[1]).d.toNumber() : 1e-10;
  const v = guard(() => derivative(f, x0, tol));
  return N.fromDec(new N.D(v).toSD(15));
}
