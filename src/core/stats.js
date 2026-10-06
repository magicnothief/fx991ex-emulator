// Statistics calculations: summations, variances, quartiles, and regressions.
// Results are decimal values (the calculator computes statistics numerically).
import * as N from './num.js';
import { ERR, fail } from './errors.js';

export const STAT_TYPES = [
  { id: '1var', label: '1-Variable', paired: false },
  { id: 'lin', label: 'y=a+bx', paired: true },
  { id: 'quad', label: 'y=a+bx+cx²', paired: true },
  { id: 'log', label: 'y=a+b•ln(x)', paired: true },
  { id: 'expe', label: 'y=a•e^(bx)', paired: true },
  { id: 'expab', label: 'y=a•b^x', paired: true },
  { id: 'pow', label: 'y=a•x^b', paired: true },
  { id: 'inv', label: 'y=a+b/x', paired: true },
];

const dec = (v) => N.fromDec(v.d);

/**
 * rows: [{ x: Num, y?: Num, f?: Num }] — frequencies default to 1.
 */
export class Stats {
  constructor(type, rows) {
    this.type = type;
    this.rows = rows.filter((r) => r.x);
    this.paired = type !== '1var';
    this.cache = new Map();
  }

  get(key, compute) {
    if (!this.cache.has(key)) this.cache.set(key, compute());
    return this.cache.get(key);
  }

  data() {
    if (this.rows.length === 0) fail(ERR.MATH);
    return this.rows.map((r) => ({ x: r.x, y: r.y ?? N.ZERO, f: r.f ?? N.ONE }));
  }

  sum(fn) {
    return this.data().reduce((s, r) => N.add(s, N.mul(r.f, fn(r))), N.ZERO);
  }

  /** Statistics are decimal-type results (an even-count median shows 3,5, not 7/2). */
  value(id) {
    return this.get(id, () => dec(this.compute(id)));
  }

  compute(id) {
    const n = () => this.value('n');
    const mean = (k) => N.div(this.value(k), n());
    switch (id) {
      case 'n': {
        const v = this.data().reduce((s, r) => N.add(s, r.f), N.ZERO);
        if (N.sign(v) <= 0) fail(ERR.MATH);
        return v;
      }
      case 'Σx': return this.sum((r) => r.x);
      case 'Σx²': return this.sum((r) => N.mul(r.x, r.x));
      case 'Σy': return this.sum((r) => r.y);
      case 'Σy²': return this.sum((r) => N.mul(r.y, r.y));
      case 'Σxy': return this.sum((r) => N.mul(r.x, r.y));
      case 'Σx³': return this.sum((r) => N.mul(N.mul(r.x, r.x), r.x));
      case 'Σx²y': return this.sum((r) => N.mul(N.mul(r.x, r.x), r.y));
      case 'Σx⁴': return this.sum((r) => N.square(N.mul(r.x, r.x)));
      case 'x̄': return mean('Σx');
      case 'ȳ': return mean('Σy');
      case 'σ²x': return this.variance('Σx', 'Σx²', false);
      case 'σ²y': return this.variance('Σy', 'Σy²', false);
      case 's²x': return this.variance('Σx', 'Σx²', true);
      case 's²y': return this.variance('Σy', 'Σy²', true);
      case 'σx': return dec(N.sqrt(this.value('σ²x')));
      case 'σy': return dec(N.sqrt(this.value('σ²y')));
      case 'sx': return dec(N.sqrt(this.value('s²x')));
      case 'sy': return dec(N.sqrt(this.value('s²y')));
      case 'minX': return this.extreme('x', -1);
      case 'maxX': return this.extreme('x', 1);
      case 'minY': return this.extreme('y', -1);
      case 'maxY': return this.extreme('y', 1);
      case 'Q1': return this.quartile(1);
      case 'Med': return this.quartile(2);
      case 'Q3': return this.quartile(3);
      case 'a': case 'b': case 'c': case 'r': return this.regression()[id] ?? fail(ERR.SYNTAX);
      default: fail(ERR.SYNTAX);
    }
  }

  variance(sk, s2k, sample) {
    const n = this.value('n');
    const mean = N.div(this.value(sk), n);
    const ss = N.sub(this.value(s2k), N.mul(n, N.mul(mean, mean)));
    const den = sample ? N.sub(n, N.ONE) : n;
    if (N.sign(den) <= 0) fail(ERR.MATH);
    let v = N.div(ss, den);
    if (N.sign(v) < 0) v = N.ZERO; // rounding noise
    return v;
  }

  extreme(k, dir) {
    const vals = this.data().map((r) => r[k]);
    return vals.reduce((m, v) => (N.cmp(v, m) * dir > 0 ? v : m));
  }

  /** Quartiles: median of the lower/upper half, excluding the median when n is odd. */
  quartile(which) {
    const data = this.data();
    if (data.some((r) => !N.isInt(r.f) || N.sign(r.f) < 0)) fail(ERR.MATH);
    const sorted = data.map((r) => ({ x: r.x, f: N.toNumber(r.f) })).filter((r) => r.f > 0).sort((a, b) => N.cmp(a.x, b.x));
    const total = sorted.reduce((s, r) => s + r.f, 0);
    if (total === 0) fail(ERR.MATH);
    const at = (k) => { // k-th value (0-based) of the expanded data
      let acc = 0;
      for (const r of sorted) { acc += r.f; if (k < acc) return r.x; }
      return sorted[sorted.length - 1].x;
    };
    const median = (lo, len) => (len % 2 ? at(lo + (len - 1) / 2) : N.div(N.add(at(lo + len / 2 - 1), at(lo + len / 2)), N.fromInt(2)));
    if (which === 2) return median(0, total);
    if (total === 1) return at(0);
    const half = Math.floor(total / 2);
    return which === 1 ? median(0, half) : median(total - half, half);
  }

  // ------------------------------------------------------------ regression

  transformed() {
    const t = this.type;
    const tx = (x) => (t === 'log' || t === 'pow' ? N.ln(x) : t === 'inv' ? N.inv(x) : x);
    const ty = (y) => (t === 'expe' || t === 'expab' || t === 'pow' ? N.ln(y) : y);
    return this.data().map((r) => ({ x: tx(r.x), y: ty(r.y), f: r.f, x0: r.x }));
  }

  regression() {
    return this.get('reg', () => {
      if (!this.paired) fail(ERR.SYNTAX);
      const d = this.transformed();
      const S = (fn) => d.reduce((s, r) => N.add(s, N.mul(r.f, fn(r))), N.ZERO);
      const n = S(() => N.ONE);
      const sx = S((r) => r.x), sy = S((r) => r.y);
      const sxx = N.sub(S((r) => N.mul(r.x, r.x)), N.div(N.mul(sx, sx), n));
      const syy = N.sub(S((r) => N.mul(r.y, r.y)), N.div(N.mul(sy, sy), n));
      const sxy = N.sub(S((r) => N.mul(r.x, r.y)), N.div(N.mul(sx, sy), n));
      if (this.type === 'quad') {
        const sx2 = S((r) => N.mul(r.x, r.x));
        const sxx2 = N.sub(S((r) => N.mul(N.mul(r.x, r.x), r.x)), N.div(N.mul(sx, sx2), n));
        const sx2x2 = N.sub(S((r) => N.square(N.mul(r.x, r.x))), N.div(N.mul(sx2, sx2), n));
        const sx2y = N.sub(S((r) => N.mul(N.mul(r.x, r.x), r.y)), N.div(N.mul(sx2, sy), n));
        const den = N.sub(N.mul(sxx, sx2x2), N.mul(sxx2, sxx2));
        if (N.isZero(den)) fail(ERR.MATH);
        const b = N.div(N.sub(N.mul(sxy, sx2x2), N.mul(sx2y, sxx2)), den);
        const c = N.div(N.sub(N.mul(sx2y, sxx), N.mul(sxy, sxx2)), den);
        const a = N.div(N.sub(N.sub(sy, N.mul(b, sx)), N.mul(c, sx2)), n);
        return { a: dec(a), b: dec(b), c: dec(c) };
      }
      if (N.isZero(sxx)) fail(ERR.MATH);
      let b = N.div(sxy, sxx);
      let a = N.div(N.sub(sy, N.mul(b, sx)), n);
      const rDen = N.sqrt(N.mul(sxx, syy));
      const r = N.isZero(rDen) ? fail(ERR.MATH) : N.div(sxy, rDen);
      if (this.type === 'expe' || this.type === 'pow') a = N.exp(a);
      if (this.type === 'expab') { a = N.exp(a); b = N.exp(b); }
      return { a: dec(a), b: dec(b), r: dec(r) };
    });
  }

  /** Estimated values: ŷ from x, x̂ (x̂1, x̂2 for quadratic) from y. */
  estimate(op, v) {
    const { a, b, c } = this.regression();
    const t = this.type;
    if (op === 'ŷ') {
      switch (t) {
        case 'lin': return N.add(a, N.mul(b, v));
        case 'quad': return N.add(N.add(a, N.mul(b, v)), N.mul(c, N.mul(v, v)));
        case 'log': return N.add(a, N.mul(b, N.ln(v)));
        case 'expe': return N.mul(a, N.exp(N.mul(b, v)));
        case 'expab': return N.mul(a, N.pow(b, v));
        case 'pow': return N.mul(a, N.pow(v, b));
        case 'inv': return N.add(a, N.div(b, v));
        default: fail(ERR.SYNTAX);
      }
    }
    if (t === 'quad') {
      if (op === 'x̂') fail(ERR.SYNTAX);
      const disc = N.sub(N.mul(b, b), N.mul(N.mul(N.fromInt(4), c), N.sub(a, v)));
      const s = N.sqrt(disc);
      const twoC = N.mul(N.fromInt(2), c);
      return op === 'x̂1' ? N.div(N.add(N.neg(b), s), twoC) : N.div(N.sub(N.neg(b), s), twoC);
    }
    if (op !== 'x̂') fail(ERR.SYNTAX);
    switch (t) {
      case 'lin': return N.div(N.sub(v, a), b);
      case 'log': return N.exp(N.div(N.sub(v, a), b));
      case 'expe': return N.div(N.sub(N.ln(v), N.ln(a)), b);
      case 'expab': return N.div(N.sub(N.ln(v), N.ln(a)), N.ln(b));
      case 'pow': return N.exp(N.div(N.sub(N.ln(v), N.ln(a)), b));
      case 'inv': return N.div(b, N.sub(v, a));
      default: fail(ERR.SYNTAX);
    }
  }

  /** x▸t: standardised variate using x̄ and σx. */
  tValue(x) {
    return N.div(N.sub(x, this.value('x̄')), this.value('σx'));
  }

  /** Results list shown by "1-Variable Calc" / "2-Variable Calc". */
  summaryIds() {
    if (!this.paired) return ['x̄', 'Σx', 'Σx²', 'σ²x', 'σx', 's²x', 'sx', 'n', 'minX', 'Q1', 'Med', 'Q3', 'maxX'];
    return ['x̄', 'Σx', 'Σx²', 'σ²x', 'σx', 's²x', 'sx', 'n', 'ȳ', 'Σy', 'Σy²', 'σ²y', 'σy', 's²y', 'sy', 'Σxy', 'Σx³', 'Σx²y', 'Σx⁴', 'minX', 'maxX', 'minY', 'maxY'];
  }
}
