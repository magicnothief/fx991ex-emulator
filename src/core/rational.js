// Exact rational arithmetic on BigInt. A rational is a frozen {n, d} with d > 0 and gcd(n, d) = 1.

export function gcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) [a, b] = [b, a % b];
  return a;
}

export function rat(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) throw new RangeError('zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return Object.freeze({ n: n / g, d: d / g });
}

export const ZERO = rat(0n);
export const ONE = rat(1n);

export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export const div = (a, b) => rat(a.n * b.d, a.d * b.n);
export const neg = (a) => rat(-a.n, a.d);
export const abs = (a) => (a.n < 0n ? neg(a) : a);
export const sign = (a) => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const cmp = (a, b) => {
  const x = a.n * b.d - b.n * a.d;
  return x > 0n ? 1 : x < 0n ? -1 : 0;
};
export const isInt = (a) => a.d === 1n;

export function powInt(a, e) {
  if (e === 0) return ONE;
  if (e < 0) return powInt(rat(a.d, a.n), -e);
  return rat(a.n ** BigInt(e), a.d ** BigInt(e));
}

/** Number of decimal digits of |x| (0 has 1 digit). */
export function digits(x) {
  if (x < 0n) x = -x;
  return x.toString().length;
}

/** Size guard: exact values that grow beyond this are dropped to decimal. */
export function tooBig(a, maxDigits = 60) {
  return digits(a.n) > maxDigits || digits(a.d) > maxDigits;
}

/** Parse a finite decimal string like "-12.5e-3" into an exact rational. */
export function parseDecimal(s) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s.trim());
  if (!m) throw new SyntaxError(`bad number ${s}`);
  const [, sg, ip = '', fp = '', ex = '0'] = m;
  let n = BigInt((ip + fp) || '0');
  let d = 10n ** BigInt(fp.length);
  const e = parseInt(ex, 10);
  if (e > 0) n *= 10n ** BigInt(e);
  else if (e < 0) d *= 10n ** BigInt(-e);
  return rat(sg === '-' ? -n : n, d);
}

/** Integer square root (floor) for BigInt >= 0. */
export function isqrt(n) {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x--;
  while ((x + 1n) * (x + 1n) <= n) x++;
  return x;
}

/** Integer k-th root (floor) for BigInt >= 0. */
export function iroot(n, k) {
  if (n < 2n) return n;
  const kb = BigInt(k);
  let x = BigInt(Math.floor(Math.pow(Number(n), 1 / k)));
  if (x < 1n) x = 1n;
  while (x ** kb > n) x--;
  while ((x + 1n) ** kb <= n) x++;
  return x;
}

/**
 * Split n > 0 into [s, r] with n = s^2 * r and r squarefree.
 * Returns null when n is too large to factor quickly (the caller falls back to decimal).
 */
export function squareFree(n) {
  if (n > 10n ** 18n) return null;
  let s = 1n;
  let k = 1n; // product of primes that occur an odd number of times
  let r = n;
  for (let p = 2n; p * p * p <= r; p += p === 2n ? 1n : 2n) {
    if (r % p !== 0n) continue;
    let e = 0n;
    while (r % p === 0n) { r /= p; e++; }
    s *= p ** (e >> 1n);
    if (e & 1n) k *= p;
  }
  // r now has at most two prime factors, all larger than the last trial divisor.
  const sq = isqrt(r);
  if (r > 1n && sq * sq === r) { s *= sq; r = 1n; }
  return [s, k * r];
}

/**
 * Prime factorisation as the fx-991EX FACT command does it: trial division by primes below 1000.
 * A remainder below 1009^2 = 1018081 must be prime; anything larger is returned unfactored.
 */
export function factorize(n) {
  const factors = [];
  let r = n;
  for (let p = 2n; p < 1000n && p * p <= r; p += p === 2n ? 1n : 2n) {
    let e = 0;
    while (r % p === 0n) { r /= p; e++; }
    if (e) factors.push([p, e]);
  }
  let rest = 1n;
  if (r > 1n) {
    if (r < 1018081n) factors.push([r, 1]);
    else rest = r;
  }
  return { factors, rest };
}
