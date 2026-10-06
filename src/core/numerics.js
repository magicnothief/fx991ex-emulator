// Numerical methods: integration (Gauss–Kronrod), derivative (central difference),
// SOLVE (Newton's method), and exact/numeric polynomial and linear-system solvers.
import * as N from './num.js';
import * as Q from './rational.js';
import * as V from './values.js';
import { ERR, fail, CalcError } from './errors.js';

const { H } = N;

// ---------------------------------------------------------------- integration

// 7-point Gauss / 15-point Kronrod nodes and weights on [-1, 1]
const XGK = [0.991455371120812639, 0.949107912342758525, 0.864864423359769073, 0.741531185599394440,
  0.586087235467691130, 0.405845151377397167, 0.207784955007898468, 0.0];
const WGK = [0.022935322010529225, 0.063092092629978553, 0.104790010322250184, 0.140653259715525919,
  0.169004726639267903, 0.190350578064785410, 0.204432940075298892, 0.209482141084727828];
const WG = [0.129484966168869693, 0.279705391489276668, 0.381830050505118945, 0.417959183673469388];

/** ∫ f from a to b. f: (x: number) => number. tol defaults to 1e-5 as on the fx-991EX. */
export function integrate(f, a, b, tol = 1e-5) {
  if (a === b) return 0;
  const sgn = a < b ? 1 : -1;
  const [lo, hi] = a < b ? [a, b] : [b, a];
  let evals = 0;
  const limit = 20000;
  const gk = (l, h) => {
    const c = (l + h) / 2, half = (h - l) / 2;
    const fc = f(c);
    let k = fc * WGK[7], g = fc * WG[3];
    for (let j = 0; j < 7; j++) {
      const dx = half * XGK[j];
      const f1 = f(c - dx), f2 = f(c + dx);
      k += WGK[j] * (f1 + f2);
      if (j % 2 === 1) g += WG[(j - 1) / 2] * (f1 + f2);
    }
    evals += 15;
    return { k: k * half, err: Math.abs((k - g) * half) };
  };
  const stack = [[lo, hi, 0]];
  let total = 0;
  while (stack.length) {
    const [l, h, depth] = stack.pop();
    const { k, err } = gk(l, h);
    if (!Number.isFinite(k)) fail(ERR.MATH);
    const scale = (h - l) / (hi - lo);
    if (err <= Math.max(tol * scale, 1e-15 * Math.abs(k)) || depth > 40) {
      total += k;
    } else {
      if (evals > limit) fail(ERR.TIME_OUT);
      const m = (l + h) / 2;
      stack.push([l, m, depth + 1], [m, h, depth + 1]);
    }
  }
  return sgn * total;
}

// ---------------------------------------------------------------- differentiation

/** d/dx f at x using central differences with Richardson extrapolation. tol defaults to 1e-10. */
export function derivative(f, x, tol = 1e-10) {
  let h = Math.max(Math.abs(x), 1) * 1e-2;
  const table = [];
  let best = null, bestErr = Infinity;
  for (let i = 0; i < 10; i++) {
    const row = [(f(x + h) - f(x - h)) / (2 * h)];
    for (let j = 1; j <= i; j++) {
      const p = 4 ** j;
      row.push((p * row[j - 1] - table[i - 1][j - 1]) / (p - 1));
    }
    table.push(row);
    if (i > 0) {
      const err = Math.abs(row[i] - table[i - 1][i - 1]);
      if (err < bestErr) { bestErr = err; best = row[i]; }
      if (err <= tol * Math.max(1, Math.abs(row[i]))) break;
    }
    h /= 2;
  }
  if (best === null || !Number.isFinite(best)) fail(ERR.MATH);
  // values within the method's noise of zero are reported as 0
  if (Math.abs(best) < 1e-9 * Math.max(1, Math.abs(x))) return 0;
  return best;
}

// ---------------------------------------------------------------- SOLVE

/**
 * Newton's method on g(x) = f(x) (left − right). Returns { x, residual, converged }.
 * g: (x: number) => number (throws CalcError on math errors)
 */
export function solveNewton(g, x0, maxIter = 150) {
  let x = x0;
  let gx = g(x);
  for (let i = 0; i < maxIter; i++) {
    if (gx === 0) return { x, residual: 0, converged: true };
    const h = Math.max(Math.abs(x), 1e-3) * 1e-7;
    let d;
    try {
      d = (g(x + h) - g(x - h)) / (2 * h);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      d = (g(x + h) - gx) / h;
    }
    if (!Number.isFinite(d) || d === 0) {
      x += x === 0 ? 1e-3 : x * 1e-3;
      gx = g(x);
      continue;
    }
    let step = gx / d;
    let nx = x - step;
    let ng;
    // damping: halve the step while the residual grows or the function is undefined
    for (let k = 0; k < 30; k++) {
      try {
        ng = g(nx);
        if (Number.isFinite(ng) && Math.abs(ng) <= Math.abs(gx) * 1.5) break;
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
      }
      step /= 2;
      nx = x - step;
      ng = undefined;
    }
    if (ng === undefined) return { x, residual: gx, converged: false };
    const dx = Math.abs(nx - x);
    x = nx;
    gx = ng;
    if (dx <= 1e-14 * Math.max(1, Math.abs(x))) return { x, residual: gx, converged: true };
  }
  return { x, residual: gx, converged: Math.abs(gx) < 1e-12 };
}

// ---------------------------------------------------------------- linear systems (exact)

/** Solves A·x = b with Num entries by Gauss–Jordan elimination. Returns Num[] | 'none' | 'infinite'. */
export function solveLinear(A, b) {
  const n = A.length;
  const m = A.map((row, i) => [...row, b[i]]);
  let rank = 0;
  const pivots = [];
  for (let col = 0; col < n && rank < n; col++) {
    let p = -1;
    for (let r = rank; r < n; r++) if (!N.isZero(m[r][col])) { p = r; break; }
    if (p < 0) continue;
    [m[rank], m[p]] = [m[p], m[rank]];
    const pv = m[rank][col];
    m[rank] = m[rank].map((x) => N.div(x, pv));
    for (let r = 0; r < n; r++) {
      if (r === rank || N.isZero(m[r][col])) continue;
      const f = m[r][col];
      m[r] = m[r].map((x, k) => N.sub(x, N.mul(f, m[rank][k])));
    }
    pivots.push(col);
    rank++;
  }
  if (rank < n) {
    for (let r = rank; r < n; r++) if (!N.isZero(m[r][n]) && m[r][n].d.abs().gt(1e-13)) return 'none';
    return 'infinite';
  }
  const x = new Array(n);
  pivots.forEach((col, r) => { x[col] = m[r][n]; });
  return x;
}

// ---------------------------------------------------------------- polynomials

/**
 * Roots of a polynomial with real Num coefficients (highest degree first, degree 2–4).
 * Returns values (Num or complex) — exact where the roots are rational or quadratic surds.
 * Real roots come first in descending order, then complex pairs (positive imaginary part first).
 */
export function polyRoots(coefs) {
  if (N.isZero(coefs[0])) fail(ERR.MATH);
  const exact = coefs.every((c) => N.ratOf(c) !== null);
  const roots = exact ? exactRoots(coefs.map((c) => N.ratOf(c))) : numericRoots(coefs);
  return orderRoots(roots, coefs.length - 1);
}

function exactRoots(q) {
  // Scale to integer coefficients and peel off rational roots (rational root theorem).
  let roots = [];
  let poly = q;
  while (poly.length > 3) {
    const r = findRationalRoot(poly);
    if (!r) break;
    roots.push(N.fromRat(r));
    poly = deflate(poly, r);
  }
  if (poly.length === 3) roots.push(...quadraticExact(poly));
  else if (poly.length === 2) roots.push(N.fromRat(Q.neg(Q.div(poly[1], poly[0]))));
  else if (poly.length > 3) return numericRoots(q.map((r) => N.fromRat(r)));
  return roots;
}

function deflate(poly, r) {
  const out = [poly[0]];
  for (let i = 1; i < poly.length - 1; i++) out.push(Q.add(poly[i], Q.mul(out[i - 1], r)));
  return out;
}

function evalRat(poly, x) {
  return poly.reduce((acc, c) => Q.add(Q.mul(acc, x), c), Q.ZERO);
}

function findRationalRoot(poly) {
  const den = poly.reduce((l, c) => (l / Q.gcd(l, c.d)) * c.d, 1n);
  const ints = poly.map((c) => (c.n * den) / c.d);
  const lead = ints[0] < 0n ? -ints[0] : ints[0];
  let last = ints[ints.length - 1];
  if (last === 0n) return Q.ZERO;
  if (last < 0n) last = -last;
  if (last > 10n ** 12n || lead > 10n ** 12n) return null;
  const divisors = (n) => {
    const out = [];
    for (let i = 1n; i * i <= n; i++) if (n % i === 0n) { out.push(i); if (i * i !== n) out.push(n / i); }
    return out;
  };
  for (const p of divisors(last)) {
    for (const qd of divisors(lead)) {
      for (const s of [1n, -1n]) {
        const x = Q.rat(s * p, qd);
        if (evalRat(poly, x).n === 0n) return x;
      }
    }
  }
  return null;
}

function quadraticExact([a, b, c]) {
  const A = N.fromRat(a), B = N.fromRat(b), C = N.fromRat(c);
  const disc = N.sub(N.mul(B, B), N.mul(N.mul(N.fromInt(4), A), C));
  const twoA = N.mul(N.fromInt(2), A);
  const mb = N.neg(B);
  if (N.sign(disc) >= 0) {
    const s = N.sqrt(disc);
    return [N.div(N.add(mb, s), twoA), N.div(N.sub(mb, s), twoA)];
  }
  const s = N.sqrt(N.neg(disc));
  const reP = N.div(mb, twoA);
  const imP = N.abs(N.div(s, twoA));
  return [V.cx(reP, imP), V.cx(reP, N.neg(imP))];
}

/**
 * Display order observed on the fx-991CE X: real roots descending, then complex roots (larger real
 * part, positive imaginary part first). A cubic lists its smallest real root first and the other two
 * as the quadratic solver would: x³−6x²+11x−6 → 1, 3, 2; x³−1 → 1, (−1+√3i)/2, (−1−√3i)/2.
 */
function orderRoots(roots, degree) {
  const reals = roots.filter((r) => !V.isCx(r)).sort((x, y) => -N.cmp(x, y));
  const cplx = roots.filter((r) => V.isCx(r)).sort((x, y) => -N.cmp(x.re, y.re) || -N.cmp(x.im, y.im));
  if (degree === 3 && reals.length) reals.unshift(reals.pop());
  return [...reals, ...cplx];
}

/** Continued-fraction convergent within tol of h with a denominator below 10⁶, or null. */
function ratNear(h, tol) {
  const sign = h.s < 0 ? -1n : 1n;
  const target = h.abs();
  let v = target;
  let [h0, h1, k0, k1] = [0n, 1n, 1n, 0n];
  for (let i = 0; i < 40; i++) {
    const a = BigInt(v.floor().toFixed(0));
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > 1000000n) return null;
    if (new H(h1.toString()).div(k1.toString()).sub(target).abs().lte(tol)) return Q.rat(sign * h1, k1);
    const frac = v.sub(v.floor());
    if (frac.isZero()) return null;
    v = new H(1).div(frac);
  }
  return null;
}

/** A numerically found root part, exact when it is a fraction or a single √ term (x⁴+1: √2/2). */
function identify(h) {
  const q = ratNear(h, '1e-25');
  if (q) return N.fromRat(q);
  const sq = ratNear(h.mul(h), '1e-24');
  if (sq) {
    const s = N.sqrt(N.fromRat(sq));
    if (s.x) return h.s < 0 ? N.neg(s) : s;
  }
  return N.fromDec(h);
}

/** Durand–Kerner in 40-digit precision, then cleanup of tiny imaginary parts. */
function numericRoots(coefs) {
  const deg = coefs.length - 1;
  const a0 = new H(coefs[0].d.toString());
  const c = coefs.map((x) => new H(x.d.toString()).div(a0));
  const cm = (x, y) => [x[0].mul(y[0]).sub(x[1].mul(y[1])), x[0].mul(y[1]).add(x[1].mul(y[0]))];
  const cs = (x, y) => [x[0].sub(y[0]), x[1].sub(y[1])];
  const cd = (x, y) => {
    const den = y[0].mul(y[0]).add(y[1].mul(y[1]));
    return [x[0].mul(y[0]).add(x[1].mul(y[1])).div(den), x[1].mul(y[0]).sub(x[0].mul(y[1])).div(den)];
  };
  const evalP = (z) => c.reduce((acc, k) => { const m = cm(acc, z); return [m[0].add(k), m[1]]; }, [new H(0), new H(0)]);
  // standard Durand–Kerner start: powers of 0.4 + 0.9i
  const base = [new H('0.4'), new H('0.9')];
  let z = Array.from({ length: deg }, (_, k) => {
    let p = [new H(1), new H(0)];
    for (let i = 0; i < k; i++) p = cm(p, base);
    return p;
  });
  for (let it = 0; it < 500; it++) {
    let delta = new H(0);
    z = z.map((zi, i) => {
      let den = [new H(1), new H(0)];
      z.forEach((zj, j) => { if (j !== i) den = cm(den, cs(zi, zj)); });
      const step = cd(evalP(zi), den);
      delta = H.max(delta, step[0].abs().add(step[1].abs()));
      return cs(zi, step);
    });
    if (delta.lt('1e-35')) break;
  }
  const scaleRe = z.reduce((m, r) => H.max(m, r[0].abs().add(r[1].abs())), new H(1));
  return z.map(([re, im]) => {
    const r = identify(re);
    if (im.abs().lt(scaleRe.mul('1e-20'))) return r;
    return V.cx(r, identify(im));
  });
}

/** Real roots with multiplicity information, used by Inequality mode. */
export function realRootsSorted(coefs) {
  const roots = polyRoots(coefs).filter((r) => !V.isCx(r));
  const sorted = [...roots].sort((a, b) => N.cmp(a, b));
  const out = [];
  for (const r of sorted) {
    const prev = out[out.length - 1];
    if (prev && prev.v.d.sub(r.d).abs().lte(new N.D('1e-12').mul(N.D.max(1, r.d.abs())))) prev.mult++;
    else out.push({ v: r, mult: 1 });
  }
  return out;
}
