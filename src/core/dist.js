// Probability distributions (double precision; the fx-991EX guarantees six significant digits).
import { ERR, fail } from './errors.js';

const SQRT2 = Math.SQRT2;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** erfc(x) for x >= 0 */
function erfcPos(x) {
  if (x < 3) {
    // erf(x) = 2/√π · e^{-x²} · Σ 2^n x^{2n+1} / (1·3·…·(2n+1)) — positive terms, no cancellation
    let term = x, sum = x;
    for (let n = 1; n < 200; n++) {
      term *= (2 * x * x) / (2 * n + 1);
      sum += term;
      if (term < sum * 1e-17) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * Math.exp(-x * x) * sum;
  }
  // continued fraction (modified Lentz) for large x
  const tiny = 1e-300;
  let f = x, C = x, Dv = 0;
  for (let n = 1; n < 300; n++) {
    const an = n / 2;
    Dv = x + an * Dv;
    Dv = Math.abs(Dv) < tiny ? tiny : Dv;
    C = x + an / C;
    C = Math.abs(C) < tiny ? tiny : C;
    Dv = 1 / Dv;
    const delta = C * Dv;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-16) break;
  }
  return Math.exp(-x * x) / (f * Math.sqrt(Math.PI));
}

/** Standard normal cumulative distribution Φ(z). */
export function phi(z) {
  if (z >= 0) return 1 - 0.5 * erfcPos(z / SQRT2);
  return 0.5 * erfcPos(-z / SQRT2);
}

export const normalPD = (x, sigma, mu) => {
  if (!(sigma > 0)) fail(ERR.ARGUMENT);
  const z = (x - mu) / sigma;
  return Math.exp(-z * z / 2) / (sigma * SQRT_2PI);
};

export const normalCD = (lower, upper, sigma, mu) => {
  if (!(sigma > 0)) fail(ERR.ARGUMENT);
  return phi((upper - mu) / sigma) - phi((lower - mu) / sigma);
};

/** Inverse normal (left tail): Acklam's approximation polished with Newton steps. */
export function inverseNormal(area, sigma, mu) {
  if (!(sigma > 0) || !(area >= 0 && area <= 1)) fail(ERR.ARGUMENT);
  if (area === 0 || area === 1) fail(ERR.MATH);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const p = area;
  let x;
  if (p < 0.02425) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - 0.02425) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  for (let i = 0; i < 4; i++) {
    const e = phi(x) - p;
    x -= e * SQRT_2PI * Math.exp(x * x / 2);
  }
  return mu + sigma * x;
}

// ---------------------------------------------------------------- discrete distributions

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

const lnFact = (n) => (n < 2 ? 0 : lnGamma(n + 1));

function checkInt(x, max = 1e10) {
  if (!Number.isInteger(x) || x < 0 || x >= max) fail(ERR.ARGUMENT);
}

export function binomialPD(x, n, p) {
  checkInt(n, 1e5);
  if (!(p >= 0 && p <= 1)) fail(ERR.ARGUMENT);
  checkInt(x);
  if (x > n) return 0;
  if (p === 0) return x === 0 ? 1 : 0;
  if (p === 1) return x === n ? 1 : 0;
  return Math.exp(lnFact(n) - lnFact(x) - lnFact(n - x) + x * Math.log(p) + (n - x) * Math.log1p(-p));
}

export function binomialCD(x, n, p) {
  checkInt(n, 1e5);
  checkInt(x);
  let s = 0;
  for (let k = 0; k <= Math.min(x, n); k++) s += binomialPD(k, n, p);
  return Math.min(1, s);
}

export function poissonPD(x, lambda) {
  if (!(lambda > 0)) fail(ERR.ARGUMENT);
  checkInt(x);
  return Math.exp(x * Math.log(lambda) - lambda - lnFact(x));
}

export function poissonCD(x, lambda) {
  checkInt(x);
  let s = 0;
  for (let k = 0; k <= x; k++) s += poissonPD(k, lambda);
  return Math.min(1, s);
}

// ---------------------------------------------------------------- Statistics-mode P(, Q(, R(

export const P = (t) => phi(t);
export const Qf = (t) => Math.abs(phi(t) - 0.5);
export const R = (t) => 1 - phi(t);
