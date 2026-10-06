// Value kinds beyond real numbers, and arithmetic dispatch across kinds.
//   real:    Num (see num.js)
//   complex: { cx: true, re: Num, im: Num }
//   matrix:  { mat: true, r, c, a: Num[r][c] }
//   vector:  { vec: true, n, a: Num[n] }
import * as N from './num.js';
import { ERR, fail } from './errors.js';

export const isCx = (v) => !!v && v.cx === true;
export const isMat = (v) => !!v && v.mat === true;
export const isVec = (v) => !!v && v.vec === true;
export const isReal = (v) => !!v && v.d !== undefined;

export const cx = (re, im) => ({ cx: true, re, im });
export const I = cx(N.ZERO, N.ONE);

/** Collapses a complex number with zero imaginary part to a real. */
export function simplify(v) {
  if (isCx(v) && N.isZero(v.im)) return v.re;
  return v;
}

const re = (v) => (isCx(v) ? v.re : v);
const im = (v) => (isCx(v) ? v.im : N.ZERO);

export function mat(r, c, fill = N.ZERO) {
  return { mat: true, r, c, a: Array.from({ length: r }, () => Array.from({ length: c }, () => fill)) };
}
export const vec = (a) => ({ vec: true, n: a.length, a });

/** Independent copy of a matrix or vector (entries are immutable numbers; only the arrays are shared state). */
export function copyArray(v) {
  return isMat(v) ? { ...v, a: v.a.map((row) => [...row]) } : vec([...v.a]);
}

const scalar = (v) => isReal(v) || isCx(v);

// ---------------------------------------------------------------- arithmetic

export function add(a, b) {
  if (isReal(a) && isReal(b)) return N.add(a, b);
  if (scalar(a) && scalar(b)) return simplify(cx(N.add(re(a), re(b)), N.add(im(a), im(b))));
  if (isMat(a) && isMat(b)) {
    if (a.r !== b.r || a.c !== b.c) fail(ERR.DIMENSION);
    return { ...a, a: a.a.map((row, i) => row.map((x, j) => N.add(x, b.a[i][j]))) };
  }
  if (isVec(a) && isVec(b)) {
    if (a.n !== b.n) fail(ERR.DIMENSION);
    return vec(a.a.map((x, i) => N.add(x, b.a[i])));
  }
  fail(ERR.SYNTAX);
}

export function neg(a) {
  if (isReal(a)) return N.neg(a);
  if (isCx(a)) return cx(N.neg(a.re), N.neg(a.im));
  if (isMat(a)) return { ...a, a: a.a.map((row) => row.map(N.neg)) };
  if (isVec(a)) return vec(a.a.map(N.neg));
  fail(ERR.SYNTAX);
}

export const sub = (a, b) => add(a, neg(b));

export function mul(a, b) {
  if (isReal(a) && isReal(b)) return N.mul(a, b);
  if (scalar(a) && scalar(b)) {
    const [p, q, r, s] = [re(a), im(a), re(b), im(b)];
    return simplify(cx(N.sub(N.mul(p, r), N.mul(q, s)), N.add(N.mul(p, s), N.mul(q, r))));
  }
  if (isReal(a) && isMat(b)) return { ...b, a: b.a.map((row) => row.map((x) => N.mul(a, x))) };
  if (isMat(a) && isReal(b)) return mul(b, a);
  if (isReal(a) && isVec(b)) return vec(b.a.map((x) => N.mul(a, x)));
  if (isVec(a) && isReal(b)) return mul(b, a);
  if (isMat(a) && isMat(b)) {
    if (a.c !== b.r) fail(ERR.DIMENSION);
    const out = mat(a.r, b.c);
    for (let i = 0; i < a.r; i++) {
      for (let j = 0; j < b.c; j++) {
        let s = N.ZERO;
        for (let k = 0; k < a.c; k++) s = N.add(s, N.mul(a.a[i][k], b.a[k][j]));
        out.a[i][j] = s;
      }
    }
    return out;
  }
  if (isVec(a) && isVec(b)) return cross(a, b);
  if (isCx(a) || isCx(b)) fail(ERR.SYNTAX);
  fail(ERR.DIMENSION);
}

export function div(a, b) {
  if (isReal(a) && isReal(b)) return N.div(a, b);
  if (scalar(a) && scalar(b)) {
    const [p, q, r, s] = [re(a), im(a), re(b), im(b)];
    const den = N.add(N.mul(r, r), N.mul(s, s));
    if (N.isZero(den)) fail(ERR.MATH);
    return simplify(cx(N.div(N.add(N.mul(p, r), N.mul(q, s)), den), N.div(N.sub(N.mul(q, r), N.mul(p, s)), den)));
  }
  if ((isMat(a) || isVec(a)) && isReal(b)) return mul(N.inv(b), a);
  fail(ERR.SYNTAX);
}

/** Integer power for any kind; real powers for reals; principal powers for complex bases. */
export function pow(a, b) {
  if (isReal(a) && isReal(b)) return N.pow(a, b);
  if (isMat(a)) {
    if (!isReal(b) || !N.isInt(b)) fail(ERR.SYNTAX);
    const n = N.toNumber(b);
    if (n === -1) return matInverse(a);
    if (a.r !== a.c) fail(ERR.DIMENSION);
    if (n < 0 || n > 3) fail(ERR.SYNTAX);
    let r = identity(a.r);
    for (let i = 0; i < n; i++) r = mul(r, a);
    return r;
  }
  if (scalar(a) && isReal(b) && N.isInt(b)) {
    if (b.d.abs().gte(1e10)) fail(ERR.MATH);
    let n = BigInt(b.d.toFixed(0));
    const negExp = n < 0n;
    if (negExp) n = -n;
    if (n <= 64n) {
      let r = N.ONE, base = a;
      for (; n > 0n; n >>= 1n) {
        if (n & 1n) r = mul(r, base);
        if (n > 1n) base = mul(base, base);
      }
      return negExp ? div(N.ONE, r) : r;
    }
    return polarPow(a, b);
  }
  if (scalar(a) && scalar(b)) {
    if (isCx(b)) fail(ERR.MATH);
    if (isReal(a) && N.sign(a) >= 0) return N.pow(a, b);
    return polarPow(a, b);
  }
  fail(ERR.SYNTAX);
}

function polarPow(a, b) {
  const H = N.H;
  const x = new H(re(a).d.toString()), y = new H(im(a).d.toString());
  const r = x.mul(x).add(y.mul(y)).sqrt();
  if (r.isZero()) return N.ZERO;
  const th = H.atan2(y, x);
  const e = new H(b.d.toString());
  const rr = r.pow(e), tt = th.mul(e);
  return simplify(cx(N.fromDec(rr.mul(tt.cos())), N.fromDec(rr.mul(tt.sin()))));
}

export function sqrt(a, complexMode) {
  if (isReal(a)) {
    if (N.sign(a) < 0) {
      if (!complexMode) fail(ERR.MATH);
      return cx(N.ZERO, N.sqrt(N.neg(a)));
    }
    return N.sqrt(a);
  }
  if (isCx(a)) return polarPow(a, N.fromRat({ n: 1n, d: 2n }));
  fail(ERR.SYNTAX);
}

// ---------------------------------------------------------------- complex helpers

export function abs(a) {
  if (isReal(a)) return N.abs(a);
  if (isCx(a)) return N.sqrt(N.add(N.square(a.re), N.square(a.im)));
  if (isMat(a)) return { ...a, a: a.a.map((row) => row.map(N.abs)) };
  if (isVec(a)) return N.sqrt(dot(a, a));
  fail(ERR.SYNTAX);
}

export const arg = (a, unit) => N.atan2(im(a), re(a), unit);
export const conj = (a) => (isCx(a) ? cx(a.re, N.neg(a.im)) : a);
export const realPart = (a) => re(a);
export const imagPart = (a) => im(a);

export function polar(r, theta, unit) {
  if (isCx(r) || isCx(theta)) fail(ERR.MATH);
  return simplify(cx(N.mul(r, N.cos(theta, unit)), N.mul(r, N.sin(theta, unit))));
}

/** Requires a real argument (real-only functions inside Complex mode). */
export function real(v) {
  if (isReal(v)) return v;
  if (isCx(v)) {
    if (N.isZero(v.im)) return v.re;
    fail(ERR.MATH);
  }
  fail(isMat(v) || isVec(v) ? ERR.SYNTAX : ERR.MATH);
}

// ---------------------------------------------------------------- matrices

export function identity(n) {
  const m = mat(n, n);
  for (let i = 0; i < n; i++) m.a[i][i] = N.ONE;
  return m;
}

export function transpose(m) {
  const out = mat(m.c, m.r);
  for (let i = 0; i < m.r; i++) for (let j = 0; j < m.c; j++) out.a[j][i] = m.a[i][j];
  return out;
}

export function det(m) {
  if (!isMat(m)) fail(ERR.SYNTAX);
  if (m.r !== m.c) fail(ERR.DIMENSION);
  const n = m.r;
  if (n === 1) return m.a[0][0];
  if (n === 2) return N.sub(N.mul(m.a[0][0], m.a[1][1]), N.mul(m.a[0][1], m.a[1][0]));
  let s = N.ZERO;
  for (let j = 0; j < n; j++) {
    const minor = { mat: true, r: n - 1, c: n - 1, a: m.a.slice(1).map((row) => row.filter((_, k) => k !== j)) };
    const term = N.mul(m.a[0][j], det(minor));
    s = j % 2 ? N.sub(s, term) : N.add(s, term);
  }
  return s;
}

export function matInverse(m) {
  if (m.r !== m.c) fail(ERR.DIMENSION);
  const d = det(m);
  if (N.isZero(d)) fail(ERR.MATH);
  const n = m.r;
  if (n === 1) return { ...m, a: [[N.inv(m.a[0][0])]] };
  const out = mat(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const minor = { mat: true, r: n - 1, c: n - 1, a: m.a.filter((_, r) => r !== i).map((row) => row.filter((_, c) => c !== j)) };
      const cof = n === 2 ? minor.a[0][0] : det(minor);
      out.a[j][i] = N.div((i + j) % 2 ? N.neg(cof) : cof, d);
    }
  }
  return out;
}

// ---------------------------------------------------------------- vectors

export function dot(a, b) {
  if (!isVec(a) || !isVec(b)) fail(ERR.SYNTAX);
  if (a.n !== b.n) fail(ERR.DIMENSION);
  return a.a.reduce((s, x, i) => N.add(s, N.mul(x, b.a[i])), N.ZERO);
}

export function cross(a, b) {
  const p = a.n === 2 ? [...a.a, N.ZERO] : a.a;
  const q = b.n === 2 ? [...b.a, N.ZERO] : b.a;
  if (a.n !== b.n) fail(ERR.DIMENSION);
  return vec([
    N.sub(N.mul(p[1], q[2]), N.mul(p[2], q[1])),
    N.sub(N.mul(p[2], q[0]), N.mul(p[0], q[2])),
    N.sub(N.mul(p[0], q[1]), N.mul(p[1], q[0])),
  ]);
}

export function vecAngle(a, b, unit) {
  const c = N.div(dot(a, b), N.mul(abs(a), abs(b)));
  const clamped = c.d.gt(1) ? N.ONE : c.d.lt(-1) ? N.neg(N.ONE) : c;
  return N.acos(clamped, unit);
}

export function unitVector(a) {
  if (!isVec(a)) fail(ERR.SYNTAX);
  const n = abs(a);
  if (N.isZero(n)) fail(ERR.MATH);
  return vec(a.a.map((x) => N.div(x, n)));
}
