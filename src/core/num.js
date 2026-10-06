// Real numbers as the fx-991EX handles them: a 15-digit internal decimal plus, when possible,
// an exact form (rational, √ form, or π form) used for Natural Display output.
//
// Num = { d: D, x: Exact|null, f: 'int'|'frac'|'dec', dms: boolean }
//   Exact = { k: 's', t: [[radicand, Rat], ...] }  sum of q·√r, sorted by r, r squarefree (r = 1 is rational)
//         | { k: 'p', c: Rat }                     c·π
//   f     = display-format attribute used by LineI/LineO (fraction input vs decimal input)
//   dms   = result should be shown in sexagesimal form
import Decimal from './decimal.js';
import * as Q from './rational.js';
import { ERR, fail } from './errors.js';

export const D = Decimal.clone({ precision: 15, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -200, toExpPos: 200 });
export const H = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -200, toExpPos: 200 });
export const PI_H = H.acos(-1);
const LIMIT = new D('1e100');
const TINY = new D('1e-99');

// ---------------------------------------------------------------- construction

function finish(d, x, f = 'dec', dms = false) {
  if (!d.isFinite()) fail(ERR.MATH);
  if (d.abs().gte(LIMIT)) fail(ERR.MATH);
  if (!d.isZero() && d.abs().lt(TINY)) return { d: new D(0), x: { k: 's', t: [] }, f, dms };
  return { d, x, f, dms };
}

// decimal.js constructors keep every digit; round explicitly to the 15-digit internal precision.
const toD = (h) => new D(h.toString()).toSD(15);

export function fromRat(q, f = Q.isInt(q) ? 'int' : 'frac') {
  const h = new H(q.n.toString()).div(q.d.toString());
  if (Q.tooBig(q)) return finish(toD(h), null, 'dec');
  return finish(toD(h), q.n === 0n ? { k: 's', t: [] } : { k: 's', t: [[1n, q]] }, f);
}

export const fromInt = (n) => fromRat(Q.rat(BigInt(n)), 'int');
export const fromDec = (d, f = 'dec') => finish(toD(d), null, f);
export const ZERO = fromInt(0);
export const ONE = fromInt(1);

/** A typed numeric literal such as "12.5" — finite decimals are exact rationals. */
export function fromLiteral(text) {
  const q = Q.parseDecimal(text);
  return fromRat(q, /[.]/.test(text) ? 'dec' : Q.isInt(q) ? 'int' : 'dec');
}

export function fromPi(c, f = 'dec') {
  const h = PI_H.mul(c.n.toString()).div(c.d.toString());
  if (c.n === 0n) return fromRat(Q.ZERO);
  const ok = h.abs().lt(1e6) && Q.digits(c.n) + Q.digits(c.d) <= 10;
  return finish(toD(h), ok ? { k: 'p', c } : null, f);
}

/** Exact value from √ terms when it fits the calculator's √ form, otherwise its decimal. */
function fromSurd(terms, f = 'dec') {
  const t = surdNorm(terms);
  if (t.length === 0) return fromRat(Q.ZERO, f);
  if (t.length === 1 && t[0][0] === 1n) return fromRat(t[0][1], f);
  const h = surdValue(t);
  return finish(toD(h), surdOk(t) ? { k: 's', t } : null, 'dec');
}

// ---------------------------------------------------------------- √ form algebra

function surdNorm(terms) {
  const m = new Map();
  for (const [r, q] of terms) {
    if (q.n === 0n) continue;
    const k = r.toString();
    m.set(k, m.has(k) ? Q.add(m.get(k), q) : q);
  }
  return [...m.entries()]
    .filter(([, q]) => q.n !== 0n)
    .map(([k, q]) => [BigInt(k), q])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function surdValue(t) {
  let s = new H(0);
  for (const [r, q] of t) s = s.add(new H(r.toString()).sqrt().mul(q.n.toString()).div(q.d.toString()));
  return s;
}

/** The fx-991EX √ form: at most two terms, |a|,c,f < 100 and radicands < 1000. */
function surdOk(t) {
  if (t.length > 2) return false;
  for (const [r, q] of t) {
    if (Q.abs(q).n >= 100n || q.d >= 100n || r >= 1000n) return false;
  }
  return true;
}

const surdOf = (a) => (a.x && a.x.k === 's' ? a.x.t : null);
const piOf = (a) => (a.x && a.x.k === 'p' ? a.x.c : null);

/** Exact rational value of a, or null. */
export function ratOf(a) {
  const t = surdOf(a);
  if (!t) return null;
  if (t.length === 0) return Q.ZERO;
  if (t.length === 1 && t[0][0] === 1n) return t[0][1];
  return null;
}

function surdMulTerms(t1, t2) {
  const out = [];
  for (const [r1, q1] of t1) {
    for (const [r2, q2] of t2) {
      const sf = Q.squareFree(r1 * r2);
      if (!sf) return null;
      out.push([sf[1], Q.mul(Q.mul(q1, q2), Q.rat(sf[0]))]);
    }
  }
  return surdNorm(out);
}

/** 1/t for a √ form with at most two terms, by rationalising the denominator. */
function surdInvTerms(t) {
  if (t.length === 1) {
    const [r, q] = t[0];
    return [[r, Q.div(Q.ONE, Q.mul(q, Q.rat(r)))]];
  }
  if (t.length !== 2) return null;
  const [[r1, q1], [r2, q2]] = t;
  const den = Q.sub(Q.mul(Q.mul(q1, q1), Q.rat(r1)), Q.mul(Q.mul(q2, q2), Q.rat(r2)));
  if (den.n === 0n) return null;
  return [[r1, Q.div(q1, den)], [r2, Q.div(Q.neg(q2), den)]];
}

/** Exact √q for a rational q >= 0. */
function sqrtRatTerms(q) {
  if (q.n === 0n) return [];
  const sf = Q.squareFree(q.n * q.d);
  if (!sf) return null;
  return [[sf[1], Q.rat(sf[0], q.d)]];
}

const negTerms = (t) => t.map(([r, q]) => [r, Q.neg(q)]);

// ---------------------------------------------------------------- format attribute

function fmix(a, b) {
  if (a.f === 'dec' || b.f === 'dec') return 'dec';
  if (a.f === 'frac' || b.f === 'frac') return 'frac';
  return 'int';
}

// ---------------------------------------------------------------- arithmetic

export function neg(a) {
  const t = surdOf(a);
  const c = piOf(a);
  const x = t ? { k: 's', t: negTerms(t) } : c ? { k: 'p', c: Q.neg(c) } : null;
  return finish(a.d.neg(), x, a.f, a.dms);
}

export function add(a, b) {
  const f = fmix(a, b);
  const dms = a.dms && b.dms;
  const ta = surdOf(a), tb = surdOf(b);
  if (ta && tb) return withDms(fromSurd([...ta, ...tb], f), dms);
  const ca = piOf(a), cb = piOf(b);
  if (ca && cb) return withDms(fromPi(Q.add(ca, cb)), dms);
  if (ca && isZero(b)) return a;
  if (cb && isZero(a)) return b;
  return finish(a.d.add(b.d), null, 'dec', dms);
}

export const sub = (a, b) => add(a, neg(b));

export function mul(a, b) {
  const f = fmix(a, b);
  const dms = a.dms || b.dms;
  const ta = surdOf(a), tb = surdOf(b);
  if (ta && tb) {
    const t = surdMulTerms(ta, tb);
    if (t) return withDms(fromSurd(t, f), dms);
  }
  const ca = piOf(a), cb = piOf(b);
  const qa = ratOf(a), qb = ratOf(b);
  if (ca && qb) return withDms(fromPi(Q.mul(ca, qb)), dms);
  if (cb && qa) return withDms(fromPi(Q.mul(cb, qa)), dms);
  return finish(a.d.mul(b.d), null, 'dec', dms);
}

export function div(a, b) {
  if (isZero(b)) fail(ERR.MATH);
  const f = a.f === 'dec' || b.f === 'dec' ? 'dec' : a.f === 'frac' || b.f === 'frac' ? 'frac' : 'dec';
  const dms = a.dms && !b.dms;
  const ta = surdOf(a), tb = surdOf(b);
  if (ta && tb) {
    const inv = surdInvTerms(tb);
    const t = inv && surdMulTerms(ta, inv);
    if (t) {
      const r = fromSurd(t, f);
      // integer ÷ integer giving an integer keeps integer format (6÷3 = 2)
      return withDms(f === 'dec' && a.f === 'int' && b.f === 'int' && isIntExact(r) ? { ...r, f: 'int' } : r, dms);
    }
  }
  const ca = piOf(a), cb = piOf(b);
  const qa = ratOf(a), qb = ratOf(b);
  if (ca && qb) return withDms(fromPi(Q.div(ca, qb)), dms);
  if (ca && cb) return withDms(fromRat(Q.div(ca, cb)), dms);
  if (qa && qa.n === 0n) return ZERO;
  return finish(a.d.div(b.d), null, 'dec', dms);
}

const withDms = (n, dms) => (n.dms === dms ? n : { ...n, dms });
export const clearDms = (n) => (n.dms ? { ...n, dms: false } : n);
export const asDms = (n) => ({ ...n, dms: true });
export const asDec = (n) => ({ ...n, f: 'dec' });

// ---------------------------------------------------------------- predicates & conversions

export const isZero = (a) => a.d.isZero();
export const sign = (a) => a.d.s * (a.d.isZero() ? 0 : 1);
export const isIntExact = (a) => { const q = ratOf(a); return q ? Q.isInt(q) : false; };
export const isInt = (a) => a.d.isInteger();
export const cmp = (a, b) => a.d.cmp(b.d);
export const eq = (a, b) => a.d.eq(b.d);
export const toNumber = (a) => a.d.toNumber();

/** Exact rational of a, treating its 15-digit decimal as exact when no exact form exists. */
export function ratOrDec(a) {
  return ratOf(a) ?? Q.parseDecimal(a.d.toFixed());
}

export function toBigInt(a) {
  if (!a.d.isInteger()) fail(ERR.MATH);
  return BigInt(a.d.toFixed(0));
}

export function abs(a) { return sign(a) < 0 ? neg(a) : a; }

// ---------------------------------------------------------------- powers and roots

export function sqrt(a) {
  if (sign(a) < 0) fail(ERR.MATH);
  const q = ratOf(a);
  if (q) {
    const t = sqrtRatTerms(q);
    if (t) return fromSurd(t, 'dec');
  }
  return finish(toD(new H(a.d.toString()).sqrt()), null);
}

export function square(a) { return mul(a, a); }
export function cube(a) { return mul(mul(a, a), a); }
export function inv(a) { return div(ONE, a); }

function powIntExact(a, n) {
  if (n === 0) {
    if (isZero(a)) fail(ERR.MATH);
    return fromRat(Q.ONE, a.f === 'dec' ? 'int' : a.f);
  }
  const q = ratOf(a);
  if (q) {
    if (Q.digits(q.n) * Math.abs(n) > 120 || Q.digits(q.d) * Math.abs(n) > 120) return null;
    if (q.n === 0n && n < 0) fail(ERR.MATH);
    const f = a.f === 'dec' ? 'dec' : n < 0 && a.f === 'int' ? 'dec' : a.f;
    return fromRat(Q.powInt(q, n), f);
  }
  const t = surdOf(a);
  if (t && Math.abs(n) <= 64) {
    let acc = [[1n, Q.ONE]];
    for (let i = 0; i < Math.abs(n); i++) {
      acc = surdMulTerms(acc, t);
      if (!acc || acc.length > 2) return null;
    }
    if (n < 0) acc = surdInvTerms(acc);
    return acc ? fromSurd(acc) : null;
  }
  if (piOf(a) && n === 1) return a;
  return null;
}

function rootRatExact(q, k) {
  const neg = q.n < 0n;
  if (neg && k % 2 === 0) return null;
  const n = neg ? -q.n : q.n;
  const rn = Q.iroot(n, k), rd = Q.iroot(q.d, k);
  if (rn ** BigInt(k) !== n || rd ** BigInt(k) !== q.d) return null;
  return Q.rat(neg ? -rn : rn, rd);
}

function powRatExact(a, e) {
  const q = ratOf(a);
  if (!q) return null;
  const k = Number(e.d);
  if (k > 64) return null;
  const root = rootRatExact(q, k);
  if (root) return powIntExact(fromRat(root, a.f), Number(e.n));
  if (k === 2 && q.n > 0n) {
    // q^(p/2) = q^((p-1)/2) · √q
    const p = Number(e.n);
    const base = powIntExact(a, (p - 1) / 2);
    const s = sqrtRatTerms(q);
    if (base && s) return mul(base, fromSurd(s));
  }
  return null;
}

export function pow(a, b) {
  const e = ratOf(b);
  if (e && (a.x || isZero(a))) {
    if (Q.isInt(e) && Q.abs(e).n <= 100000n) {
      const r = powIntExact(a, Number(e.n));
      if (r) return r;
    } else if (!Q.isInt(e)) {
      const r = powRatExact(a, e);
      if (r) return r;
    }
  }
  return powDec(a, b);
}

function powDec(a, b) {
  const x = new H(a.d.toString());
  const y = new H(b.d.toString());
  if (x.isZero()) {
    if (y.gt(0)) return ZERO;
    fail(ERR.MATH);
  }
  let negative = false;
  if (x.lt(0)) {
    if (y.isInteger()) negative = y.mod(2).abs().eq(1);
    else {
      const e = ratOrDec(b);
      if (e.d % 2n === 0n) fail(ERR.MATH);
      negative = e.n % 2n !== 0n;
    }
  }
  const lg = y.mul(x.abs().log(10));
  if (lg.gte(100)) fail(ERR.MATH);
  if (lg.lte(-100)) return ZERO;
  let r = x.abs().pow(y);
  if (negative) r = r.neg();
  return finish(toD(r), null);
}

export function cbrt(a) {
  const q = ratOf(a);
  if (q) {
    const r = rootRatExact(q, 3);
    if (r) return fromRat(r, 'dec');
  }
  const x = new H(a.d.toString());
  return finish(toD(x.abs().cbrt().mul(x.s)), null);
}

/** x-th root of y (the ⁿ√ template). */
export function xroot(x, y) {
  if (isZero(x)) fail(ERR.MATH);
  return pow(y, inv(x));
}

// ---------------------------------------------------------------- exponentials and logarithms

export function exp(a) {
  if (isZero(a)) return ONE;
  if (a.d.gt(230.2585092994045)) fail(ERR.MATH);
  return finish(toD(new H(a.d.toString()).exp()), null);
}

export function exp10(a) { return pow(fromInt(10), a); }

export function ln(a) {
  if (sign(a) <= 0) fail(ERR.MATH);
  const q = ratOf(a);
  if (q && Q.eq(q, Q.ONE)) return ZERO;
  return finish(toD(new H(a.d.toString()).ln()), null);
}

export function log10(a) { return logab(fromInt(10), a); }

export function logab(base, a) {
  if (sign(a) <= 0 || sign(base) <= 0) fail(ERR.MATH);
  const lb = new H(base.d.toString()).ln();
  if (lb.isZero()) fail(ERR.MATH);
  const v = new H(a.d.toString()).ln().div(lb);
  const qb = ratOf(base), qa = ratOf(a);
  if (qb && qa) {
    // exact when a = base^(p/k) for a small k
    for (let k = 1; k <= 6; k++) {
      const p = v.mul(k).round();
      if (p.minus(v.mul(k)).abs().gt(1e-9) || p.abs().gt(400)) continue;
      const pn = Number(p.toFixed(0));
      if (Q.digits(qb.n) * Math.abs(pn) > 400) continue;
      const lhs = Q.powInt(qb, pn), rhs = Q.powInt(qa, k);
      if (Q.eq(lhs, rhs)) return fromRat(Q.rat(BigInt(pn), BigInt(k)));
    }
  }
  return finish(toD(v), null);
}

// ---------------------------------------------------------------- angles and trigonometry

export const DEG = 'deg', RAD = 'rad', GRA = 'gra';

const q2 = (n, d) => Q.rat(BigInt(n), BigInt(d));
const SIN_TABLE = {
  0: [],
  15: [[2n, q2(-1, 4)], [6n, q2(1, 4)]],
  18: [[1n, q2(-1, 4)], [5n, q2(1, 4)]],
  30: [[1n, q2(1, 2)]],
  45: [[2n, q2(1, 2)]],
  54: [[1n, q2(1, 4)], [5n, q2(1, 4)]],
  60: [[3n, q2(1, 2)]],
  75: [[2n, q2(1, 4)], [6n, q2(1, 4)]],
  90: [[1n, Q.ONE]],
};
const TABLE_ANGLES = [0, 15, 18, 30, 45, 54, 60, 75, 90];

/** sin of an integer number of degrees in [0, 360) as exact terms, or null. */
function sinTab(a) {
  let s = 1;
  if (a >= 180) { a -= 180; s = -1; }
  if (a > 90) a = 180 - a;
  const t = SIN_TABLE[a];
  if (!t) return null;
  return s < 0 ? negTerms(t) : t;
}
const cosTab = (a) => sinTab((a + 90) % 360);

/** Angle as exact degrees (Rat), or null. */
function exactDegrees(a, unit) {
  if (unit === RAD) {
    const c = piOf(a);
    if (c) return Q.mul(c, Q.rat(180n));
    return isZero(a) ? Q.ZERO : null;
  }
  const q = ratOrDec(a);
  return unit === DEG ? q : Q.mul(q, q2(9, 10));
}

function tableDegrees(a, unit) {
  const deg = exactDegrees(a, unit);
  if (!deg || !Q.isInt(deg)) return null;
  let n = Number(deg.n % 360n);
  if (n < 0) n += 360;
  return n;
}

function toRadiansH(a, unit) {
  const x = new H(a.d.toString());
  if (unit === DEG) return x.mod(360).mul(PI_H).div(180);
  if (unit === GRA) return x.mod(400).mul(PI_H).div(200);
  return x.mod(PI_H.mul(2));
}

function checkTrigRange(a, unit) {
  const x = a.d.abs();
  if (unit === DEG && x.gte(9e9)) fail(ERR.MATH);
  if (unit === RAD && x.gte(157079632.7)) fail(ERR.MATH);
  if (unit === GRA && x.gte(1e10)) fail(ERR.MATH);
}

export function sin(a, unit) {
  checkTrigRange(a, unit);
  const n = tableDegrees(a, unit);
  const t = n !== null ? sinTab(n) : null;
  if (t) return fromSurd(t);
  return finish(toD(toRadiansH(a, unit).sin()), null);
}

export function cos(a, unit) {
  checkTrigRange(a, unit);
  const n = tableDegrees(a, unit);
  if (n !== null && cosTab(n)) return fromSurd(cosTab(n));
  return finish(toD(toRadiansH(a, unit).cos()), null);
}

export function tan(a, unit) {
  checkTrigRange(a, unit);
  const n = tableDegrees(a, unit);
  if (n !== null && n % 180 === 90) fail(ERR.MATH);
  if (n !== null) {
    const s = sinTab(n), c = cosTab(n);
    if (s && c) return div(fromSurd(s), fromSurd(c));
  }
  return finish(toD(toRadiansH(a, unit).tan()), null);
}

const sameTerms = (t1, t2) =>
  t1.length === t2.length && t1.every(([r, q], i) => r === t2[i][0] && Q.eq(q, t2[i][1]));

/** Exact degrees result → Num in the current angle unit. */
function fromDegrees(deg, unit) {
  if (unit === DEG) return fromRat(deg);
  if (unit === GRA) return fromRat(Q.mul(deg, q2(10, 9)));
  return deg.n === 0n ? ZERO : fromPi(Q.div(deg, Q.rat(180n)));
}

function fromRadiansH(r, unit) {
  if (unit === DEG) r = r.mul(180).div(PI_H);
  else if (unit === GRA) r = r.mul(200).div(PI_H);
  return finish(toD(r), null);
}

function asinTable(t) {
  for (const a of TABLE_ANGLES) {
    if (sameTerms(SIN_TABLE[a], t)) return a;
    if (a && sameTerms(negTerms(SIN_TABLE[a]), surdNorm(t))) return -a;
  }
  return null;
}

export function asin(a, unit) {
  if (a.d.abs().gt(1)) fail(ERR.MATH);
  const t = surdOf(a);
  const deg = t ? asinTable(t) : null;
  if (deg !== null) return fromDegrees(Q.rat(BigInt(deg)), unit);
  return fromRadiansH(new H(a.d.toString()).asin(), unit);
}

export function acos(a, unit) {
  if (a.d.abs().gt(1)) fail(ERR.MATH);
  const t = surdOf(a);
  const deg = t ? asinTable(t) : null;
  if (deg !== null) return fromDegrees(Q.rat(BigInt(90 - deg)), unit);
  return fromRadiansH(new H(a.d.toString()).acos(), unit);
}

export function atan(a, unit) {
  const t = surdOf(a);
  if (t) {
    for (const deg of [0, 15, 30, 45, 60, 75]) {
      const tv = div(fromSurd(SIN_TABLE[deg]), fromSurd(cosTab(deg)));
      const tt = surdOf(tv);
      if (!tt) continue;
      if (sameTerms(tt, t)) return fromDegrees(Q.rat(BigInt(deg)), unit);
      if (deg && sameTerms(negTerms(tt), t)) return fromDegrees(Q.rat(BigInt(-deg)), unit);
    }
  }
  return fromRadiansH(new H(a.d.toString()).atan(), unit);
}

/** Converts an angle given in unit `from` to the current unit (°, ʳ, ᵍ postfix operators). */
export function convertAngle(a, from, to) {
  if (from === to) return a;
  const deg = exactDegrees(a, from);
  if (deg) return fromDegrees(deg, to);
  let r = new H(a.d.toString());
  if (from === DEG) r = r.mul(PI_H).div(180);
  else if (from === GRA) r = r.mul(PI_H).div(200);
  return fromRadiansH(r, to);
}

// ---------------------------------------------------------------- hyperbolic

const hyp = (fn, guard) => (a) => {
  if (guard) guard(a);
  if (isZero(a) && fn !== 'cosh') return ZERO;
  return finish(toD(new H(a.d.toString())[fn]()), null);
};
export const sinh = hyp('sinh', (a) => a.d.abs().gt(230.2585092994045) && fail(ERR.MATH));
export const cosh = hyp('cosh', (a) => a.d.abs().gt(230.2585092994045) && fail(ERR.MATH));
export const tanh = hyp('tanh');
export const asinh = hyp('asinh');
export const acosh = (a) => {
  if (a.d.lt(1)) fail(ERR.MATH);
  if (a.d.eq(1)) return ZERO;
  return finish(toD(new H(a.d.toString()).acosh()), null);
};
export const atanh = hyp('atanh', (a) => a.d.abs().gte(1) && fail(ERR.MATH));

// ---------------------------------------------------------------- integer functions

const BIG_LIMIT = 10n ** 100n;

export function factorial(a) {
  if (!isInt(a) || sign(a) < 0 || a.d.gt(69)) fail(ERR.MATH);
  let r = 1n;
  for (let i = 2n; i <= toBigInt(a); i++) r *= i;
  return fromRat(Q.rat(r), 'int');
}

function fallingFactorial(n, k) {
  let r = 1n;
  for (let i = 0n; i < k; i++) {
    r *= n - i;
    if (r >= BIG_LIMIT) return null;
  }
  return r;
}

function checkPerm(n, r) {
  if (!isInt(n) || !isInt(r)) fail(ERR.MATH);
  const N = toBigInt(n), R = toBigInt(r);
  if (N < 0n || R < 0n || R > N || N >= 10n ** 10n) fail(ERR.MATH);
  return [N, R];
}

export function nPr(n, r) {
  const [N, R] = checkPerm(n, r);
  const v = fallingFactorial(N, R);
  if (v === null) fail(ERR.MATH);
  return fromRat(Q.rat(v), 'int');
}

export function nCr(n, r) {
  const [N, R] = checkPerm(n, r);
  // Valid when n!/(n-r)! or n!/r! is below 10^100 (fx-991EX input range).
  const a = fallingFactorial(N, R);
  if (a !== null) return fromRat(Q.rat(a / fallingFactorial(R, R)), 'int');
  const b = fallingFactorial(N, N - R);
  if (b !== null) return fromRat(Q.rat(b / fallingFactorial(N - R, N - R)), 'int');
  fail(ERR.MATH);
}

export function percent(a) { return div(a, fromInt(100)); }

export function ranHash() {
  return { ...fromRat(Q.rat(BigInt(Math.floor(Math.random() * 1000)), 1000n)), f: 'dec' };
}

export function ranInt(a, b) {
  if (!isInt(a) || !isInt(b) || a.d.gte(b.d)) fail(ERR.MATH);
  if (a.d.abs().gte(1e10) || b.d.abs().gte(1e10) || b.d.sub(a.d).gte(1e10)) fail(ERR.MATH);
  const lo = toNumber(a), hi = toNumber(b);
  return fromInt(lo + Math.floor(Math.random() * (hi - lo + 1)));
}

/** Rnd: rounds to the current display format (Norm rounds at the 11th mantissa digit). */
export function rnd(a, fmt) {
  let d;
  if (fmt.mode === 'fix') d = a.d.toDecimalPlaces(fmt.digits, Decimal.ROUND_HALF_UP);
  else d = a.d.toSignificantDigits(fmt.mode === 'sci' ? fmt.digits || 10 : 10, Decimal.ROUND_HALF_UP);
  return fromRat(Q.parseDecimal(d.toFixed()), 'dec');
}

// ---------------------------------------------------------------- coordinate conversion

export function pol(x, y, unit) {
  const r = sqrt(add(square(x), square(y)));
  return { r, theta: atan2(y, x, unit) };
}

export function atan2(y, x, unit) {
  const half = fromDegrees(Q.rat(180n), unit);
  if (isZero(x)) {
    if (isZero(y)) return ZERO;
    const q = fromDegrees(Q.rat(90n), unit);
    return sign(y) > 0 ? q : neg(q);
  }
  const base = atan(div(y, x), unit);
  if (sign(x) > 0) return base;
  return sign(y) >= 0 ? add(base, half) : sub(base, half);
}

export function rec(r, theta, unit) {
  return { x: mul(r, cos(theta, unit)), y: mul(r, sin(theta, unit)) };
}

// ---------------------------------------------------------------- engineering symbols

export const ENG_SYMBOLS = { m: -3, μ: -6, n: -9, p: -12, f: -15, k: 3, M: 6, G: 9, T: 12, P: 15, E: 18 };

export function scale10(a, e) {
  return mul(a, fromRat(e >= 0 ? Q.rat(10n ** BigInt(e)) : Q.rat(1n, 10n ** BigInt(-e)), 'int'));
}

// ---------------------------------------------------------------- sexagesimal

export function dms(d, m, s) {
  const r = add(add(d, div(m, fromInt(60))), div(s, fromInt(3600)));
  return { ...r, dms: true };
}

/** Decimal degrees → [sign, degrees, minutes, seconds(Decimal)] for sexagesimal display. */
export function toDms(a) {
  const x = new H(a.d.toString());
  const s = x.s;
  let v = x.abs();
  if (v.gte(1e7)) return null;
  let deg = v.floor();
  let rest = v.sub(deg).mul(60);
  let min = rest.floor();
  let sec = rest.sub(min).mul(60);
  return { sign: s, deg, min, sec };
}
