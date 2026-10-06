// Polynomial inequalities p(x) > 0, < 0, ≥ 0, ≤ 0 (Inequality mode).
import * as N from './num.js';
import { CalcError, ERR } from './errors.js';
import { realRootsSorted } from './numerics.js';

/**
 * Returns 'all', 'none', or segments [{ lo, loInc, hi, hiInc } | { point }] with Num bounds (null = unbounded).
 */
export function solveInequality(coefs, op) {
  if (N.isZero(coefs[0])) throw new CalcError(ERR.MATH);
  const roots = realRootsSorted(coefs);
  const H = N.H;
  const evalAt = (x) => coefs.reduce((acc, c) => acc.mul(x).add(new H(c.d.toString())), new H(0));
  const strict = op === '>' || op === '<';
  const wantPos = op === '>' || op === '≥';
  const ok = (val) => (wantPos ? val.gt(0) : val.lt(0));
  // test points: before the first root, between roots, after the last
  const xs = roots.map((r) => new H(r.v.d.toString()));
  const tests = [];
  if (xs.length === 0) tests.push(new H(0));
  else {
    tests.push(xs[0].sub(1));
    for (let i = 0; i < xs.length - 1; i++) tests.push(xs[i].add(xs[i + 1]).div(2));
    tests.push(xs[xs.length - 1].add(1));
  }
  const inSet = tests.map((t) => ok(evalAt(t)));
  if (xs.length === 0) return inSet[0] ? 'all' : 'none';
  // Pieces alternate: interval 0, root 0, interval 1, …, root n-1, interval n.
  // Roots belong to the set only for ≥ and ≤ (p = 0 there).
  const pieces = [];
  roots.forEach((r, i) => {
    pieces.push({ interval: i, member: inSet[i] });
    pieces.push({ root: r.v, member: !strict });
  });
  pieces.push({ interval: roots.length, member: inSet[roots.length] });
  const segs = [];
  let start = null;
  pieces.forEach((p, k) => {
    if (p.member && start === null) start = k;
    const endsHere = p.member && (k === pieces.length - 1 || !pieces[k + 1].member);
    if (!endsHere) return;
    const first = pieces[start], last = p;
    if (first.root && first === last) segs.push({ point: first.root });
    else {
      segs.push({
        lo: first.root ?? (first.interval === 0 ? null : roots[first.interval - 1].v),
        loInc: !!first.root,
        hi: last.root ?? (last.interval === roots.length ? null : roots[last.interval].v),
        hiInc: !!last.root,
      });
    }
    start = null;
  });
  if (segs.length === 1 && segs[0].lo === null && segs[0].hi === null) return 'all';
  if (segs.length === 0) return 'none';
  return segs;
}

