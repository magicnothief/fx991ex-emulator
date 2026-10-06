// JSON round-trip for calculator values (memory persists across sessions, like the real unit).
import * as N from './num.js';
import * as Q from './rational.js';

const ratOut = (q) => [q.n.toString(), q.d.toString()];
const ratIn = ([n, d]) => Q.rat(BigInt(n), BigInt(d));

export function pack(v) {
  if (v == null) return null;
  if (v.cx) return { c: [pack(v.re), pack(v.im)] };
  if (v.mat) return { m: v.a.map((row) => row.map(pack)) };
  if (v.vec) return { v: v.a.map(pack) };
  const x = !v.x ? null : v.x.k === 'p' ? { p: ratOut(v.x.c) } : { s: v.x.t.map(([r, q]) => [r.toString(), ratOut(q)]) };
  return { d: v.d.toString(), x, f: v.f, dms: v.dms || undefined };
}

export function unpack(o) {
  if (o == null) return null;
  if (o.c) return { cx: true, re: unpack(o.c[0]), im: unpack(o.c[1]) };
  if (o.m) return { mat: true, r: o.m.length, c: o.m[0].length, a: o.m.map((row) => row.map(unpack)) };
  if (o.v) return { vec: true, n: o.v.length, a: o.v.map(unpack) };
  const x = !o.x ? null : o.x.p ? { k: 'p', c: ratIn(o.x.p) } : { k: 's', t: o.x.s.map(([r, q]) => [BigInt(r), ratIn(q)]) };
  return { d: new N.D(o.d), x, f: o.f || 'dec', dms: !!o.dms };
}
