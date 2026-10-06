// Converts numbers into display models. Renderers draw these models; nothing here touches the DOM.
//
// Display models:
//   { t: 'dec', m: '-1.234', e: null|int, sym: null|'k' }   mantissa string, ×10^e or engineering symbol
//   { t: 'frac', neg, n, d }  { t: 'mixed', neg, w, n, d }
//   { t: 'surd', neg, terms: [{ s: '+'|'-', c: '2'|'', r: '3'|null }], den: null|'4' }
//   { t: 'pi', neg, n, d }    (n/d)·π
//   { t: 'dms', neg, deg, min, sec }
//   { t: 'fact', parts: [{ p, e }], rest }
//   { t: 'cplx', re, im } / { t: 'polar', r, theta }   with nested models
import Decimal from './decimal.js';
import * as Q from './rational.js';
import { D, H, toDms, ENG_SYMBOLS } from './num.js';

export const DEFAULT_FORMAT = Object.freeze({ mode: 'norm', digits: 1 });

const SYMBOL_BY_EXP = Object.fromEntries(Object.entries(ENG_SYMBOLS).map(([s, e]) => [e, s]));

const stripZeros = (s) => (s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s);

// ---------------------------------------------------------------- decimals

/**
 * Decimal display per the Number Format setting.
 * opts.eng: engineering exponent override (ENG / ← key), opts.symbols: Engineer Symbol setting.
 */
export function formatDecimal(d, fmt = DEFAULT_FORMAT, opts = {}) {
  d = new D(d.toString());
  if (opts.eng != null) return engForm(d, opts.eng, opts.symbols);
  if (d.isZero()) {
    if (fmt.mode === 'fix') return { t: 'dec', m: (0).toFixed(fmt.digits), e: null, sym: null };
    if (fmt.mode === 'sci') return { t: 'dec', m: sciMantissa(new D(0), fmt.digits || 10), e: 0, sym: null };
    return { t: 'dec', m: '0', e: null, sym: null };
  }
  if (fmt.mode === 'sci') {
    const n = fmt.digits || 10;
    const r = d.toSD(n, Decimal.ROUND_HALF_UP);
    const e = r.e;
    return { t: 'dec', m: sciMantissa(r.div(new D(10).pow(e)), n), e, sym: null };
  }
  if (fmt.mode === 'fix') {
    const r = d.toDecimalPlaces(fmt.digits, Decimal.ROUND_HALF_UP);
    if (r.abs().gte(1e10)) {
      const s = d.toSD(10, Decimal.ROUND_HALF_UP);
      const e = s.e;
      const m = s.div(new D(10).pow(e)).toFixed(fmt.digits, Decimal.ROUND_HALF_UP);
      return { t: 'dec', m, e, sym: null };
    }
    return { t: 'dec', m: r.toFixed(fmt.digits), e: null, sym: null };
  }
  // Norm 1 / Norm 2: 10 significant digits
  const r = d.toSD(10, Decimal.ROUND_HALF_UP);
  const e = r.e;
  const lo = fmt.digits === 2 ? -9 : -2;
  if (opts.symbols) {
    const e3 = Math.floor(e / 3) * 3;
    if (e3 !== 0 && SYMBOL_BY_EXP[e3] && (e >= 10 || e < lo || e3 !== 0)) {
      if (e < 0 || e >= 3) return engForm(r, e3, true);
    }
  }
  if (e >= 10 || e < lo) {
    return { t: 'dec', m: stripZeros(r.div(new D(10).pow(e)).toFixed(9)), e, sym: null };
  }
  return { t: 'dec', m: stripZeros(r.toFixed()), e: null, sym: null };
}

function sciMantissa(m, n) {
  return m.toFixed(n - 1, Decimal.ROUND_HALF_UP);
}

/** Engineering form with a fixed exponent (a multiple of 3). */
function engForm(d, e3, symbols) {
  const r = d.toSD(10, Decimal.ROUND_HALF_UP);
  let m = stripZeros(r.div(new D(10).pow(e3)).toFixed(Math.max(0, 9 - r.e + e3)));
  if (symbols && SYMBOL_BY_EXP[e3]) return { t: 'dec', m, e: null, sym: SYMBOL_BY_EXP[e3] };
  // with Engineer Symbol on, exponent 0 is shown as a plain number (User's Guide p.12: 1024000)
  return { t: 'dec', m, e: symbols && e3 === 0 ? null : e3, sym: null };
}

/** The standard engineering exponent of d (mantissa in [1, 1000)). */
export function engExponent(d) {
  d = new D(d.toString());
  if (d.isZero()) return 0;
  return Math.floor(d.toSD(10, Decimal.ROUND_HALF_UP).e / 3) * 3;
}

// ---------------------------------------------------------------- exact forms

function fracModel(q, mixed) {
  const neg = q.n < 0n;
  const n = neg ? -q.n : q.n;
  if (mixed && n >= q.d) {
    const w = n / q.d, r = n % q.d;
    const size = Q.digits(w) + Q.digits(r) + Q.digits(q.d) + 2;
    if (size > 10) return null;
    return { t: 'mixed', neg, w: w.toString(), n: r.toString(), d: q.d.toString() };
  }
  if (Q.digits(n) + Q.digits(q.d) + 1 > 10) return null;
  return { t: 'frac', neg, n: n.toString(), d: q.d.toString() };
}

function lcm(a, b) { return (a / Q.gcd(a, b)) * b; }

function surdModel(t) {
  // Integer term first, then radicals by descending radicand (as the fx-991EX prints them).
  const ordered = [...t].sort((a, b) => (a[0] === 1n ? -1 : b[0] === 1n ? 1 : a[0] > b[0] ? -1 : 1));
  const den = ordered.reduce((acc, [, q]) => lcm(acc, q.d), 1n);
  const terms = ordered.map(([r, q]) => {
    const c = (q.n * den) / q.d;
    const abs = c < 0n ? -c : c;
    return { s: c < 0n ? '-' : '+', c: r === 1n || abs !== 1n ? abs.toString() : '', r: r === 1n ? null : r.toString() };
  });
  let neg = false;
  if (terms.length === 1 && terms[0].s === '-') { neg = true; terms[0].s = '+'; }
  return { t: 'surd', neg, terms, den: den === 1n ? null : den.toString() };
}

function piModel(c) {
  const neg = c.n < 0n;
  const n = neg ? -c.n : c.n;
  return { t: 'pi', neg, n: n.toString(), d: c.d.toString() };
}

/**
 * Best exact model for a real number, or null if it must be shown as a decimal.
 * kinds: which exact forms are allowed ({ frac, surd, pi }).
 */
export function exactModel(num, { frac = true, surd = true, pi = true, mixed = false } = {}) {
  if (!num.x) return null;
  if (num.x.k === 'p') return pi ? piModel(num.x.c) : null;
  const t = num.x.t;
  if (t.length === 0) return null;
  if (t.length === 1 && t[0][0] === 1n) {
    const q = t[0][1];
    if (Q.isInt(q)) return null; // integers are shown as decimals
    return frac ? fracModel(q, mixed) : null;
  }
  return surd ? surdModel(t) : null;
}

/** Converts a decimal value to a fraction if one with a short enough display exists. */
export function decimalToFraction(num, mixed = false) {
  const q = Q.parseDecimal(num.d.toFixed());
  if (Q.isInt(q)) return null;
  const direct = fracModel(q, mixed);
  if (direct) return direct;
  // continued fraction search reproducing the 15-digit value
  const x = new H(num.d.toString());
  let [h0, h1, k0, k1] = [0n, 1n, 1n, 0n];
  let v = x.abs();
  for (let i = 0; i < 40; i++) {
    const a = BigInt(v.floor().toFixed(0));
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (Q.digits(h1) + Q.digits(k1) + 1 > 10) return null;
    const approx = new D(new H(h1.toString()).div(k1.toString()).toString()).toSD(15);
    if (approx.eq(x.abs())) return fracModel(Q.rat(x.s < 0 ? -h1 : h1, k1), mixed);
    const frac = v.sub(v.floor());
    if (frac.isZero()) return null;
    v = new H(1).div(frac);
  }
  return null;
}

export function dmsModel(num) {
  const r = toDms(num);
  if (!r) return null;
  // seconds are shown to two decimal places at most
  let sec = r.sec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  let min = r.min, deg = r.deg;
  if (sec.gte(60)) { sec = sec.sub(60); min = min.add(1); }
  if (min.gte(60)) { min = min.sub(60); deg = deg.add(1); }
  return { t: 'dms', neg: r.sign < 0, deg: deg.toFixed(0), min: min.toFixed(0), sec: stripZeros(sec.toFixed(2)) };
}

export function factModel(n) {
  return { t: 'fact', ...n };
}

// ---------------------------------------------------------------- result formatting entry point

/**
 * Display model for a real result.
 *   setup:  calculator setup (io, numFormat, fracResult, engSymbol)
 *   view:   { form: 'auto'|'dec'|'exact', mixed: bool|null, eng: int|null }
 */
export function formatReal(num, setup, view = {}) {
  const io = setup.io;
  const mathOut = io === 'mm';
  const mixed = view.mixed ?? setup.fracResult === 'mixed';
  const decOpts = { eng: view.eng ?? null, symbols: setup.engSymbol };
  const asDecimal = () => formatDecimal(num.d, setup.numFormat, decOpts);

  if (view.eng != null) return asDecimal();
  if (num.dms && view.form !== 'dec') {
    const m = dmsModel(num);
    if (m) return m;
  }
  // Which form is shown first: MathO shows exact forms, DecimalO shows decimals,
  // LineO shows fractions only for fraction-format calculations.
  let wantExact;
  if (view.form === 'exact') wantExact = true;
  else if (view.form === 'dec') wantExact = false;
  else wantExact = mathOut || (io === 'll' && num.f === 'frac');
  if (!wantExact) return asDecimal();

  const allowRadical = io === 'mm' || io === 'md';
  const m = exactModel(num, { frac: true, surd: allowRadical, pi: allowRadical, mixed });
  if (m) return m;
  // Decimal-type results (statistics, distributions, calculus, conversions) stay decimal even in MathO
  // (User's Guide p.23: P(Ans) = 0.19324); S⇔D converts them to a fraction on request.
  if (view.form === 'exact' && !num.x && setup.numFormat.mode === 'norm') {
    const f = decimalToFraction(num, mixed);
    if (f) return f;
  }
  return asDecimal();
}

/** Whether S⇔D can toggle this result (it has an exact form different from its decimal). */
export function hasAlternateForm(num, setup) {
  const allowRadical = setup.io === 'mm' || setup.io === 'md';
  if (exactModel(num, { surd: allowRadical, pi: allowRadical })) return true;
  return !num.x && decimalToFraction(num) !== null;
}

/** Plain-text rendering of a model (used for Line output, tables, and tests). */
export function modelText(m, { decimalMark = '.', digitSep = false } = {}) {
  if (!m) return '';
  const num = (s) => groupDigits(s.replace('.', decimalMark), digitSep, decimalMark);
  switch (m.t) {
    case 'dec': {
      let s = num(m.m);
      if (m.sym) s += m.sym;
      if (m.e != null) s += `×10^${m.e}`;
      return s;
    }
    case 'frac': return `${m.neg ? '-' : ''}${m.n}⌟${m.d}`;
    case 'mixed': return `${m.neg ? '-' : ''}${m.w}⌟${m.n}⌟${m.d}`;
    case 'surd': {
      const body = m.terms.map((t, i) => `${i === 0 && t.s === '+' ? '' : t.s}${t.c}${t.r ? `√${t.r}` : ''}`).join('');
      const s = m.den ? (m.terms.length > 1 ? `(${body})/${m.den}` : `${body}/${m.den}`) : body;
      return (m.neg ? '-' : '') + s;
    }
    case 'pi': return `${m.neg ? '-' : ''}${m.d === '1' ? (m.n === '1' ? '' : m.n) : `${m.n}/${m.d}`}π`;
    case 'dms': return `${m.neg ? '-' : ''}${m.deg}°${m.min}'${num(m.sec)}"`;
    case 'fact': return [...m.factors.map(([p, e]) => (e > 1 ? `${p}^${e}` : `${p}`)), ...(m.rest > 1n ? [`(${m.rest})`] : [])].join('×');
    case 'cplx': return [m.re ? modelText(m.re) : '', m.im ? `${modelText(m.im)}i` : ''].filter(Boolean).join('+') || '0';
    case 'polar': return `${modelText(m.r)}∠${modelText(m.theta)}`;
    default: return '?';
  }
}

export function groupDigits(s, on, decimalMark = '.') {
  if (!on) return s;
  const sep = decimalMark === '.' ? ',' : '.';
  const neg = s.startsWith('-') ? '-' : '';
  const body = neg ? s.slice(1) : s;
  const [ip, fp] = body.split(decimalMark);
  const g = ip.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return neg + g + (fp !== undefined ? decimalMark + fp : '');
}
