// Expected values are the worked examples from the CASIO fx-991EX User's Guide unless noted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { line, tok, tpl, calc, show, ctx, SETUP } from './helpers.js';
import * as N from '../src/core/num.js';
import * as V from '../src/core/values.js';
import { parseStatements } from '../src/core/parser.js';
import { evaluate } from '../src/core/evaluator.js';
import { formatReal, formatDecimal, modelText, engExponent } from '../src/core/format.js';
import { factorize } from '../src/core/rational.js';
import { Stats } from '../src/core/stats.js';
import { polyRoots, solveLinear } from '../src/core/numerics.js';
import * as Dist from '../src/core/dist.js';

const eq = (input, expected, opts) => assert.equal(calc(typeof input === 'string' ? line(input) : input, opts), expected);
const L = N.fromLiteral;
const LINE = { setup: { io: 'll' } };

test('basic input rules and priority', () => {
  eq('4×sin(30)×(30+10×3)', '120');
  eq('6÷2(1+2)', '1'); // implied multiplication binds tighter than ÷
  eq('(1+1)^(2+2)', '16');
  eq('(5²)³', '15625');
  eq('~2²', '-4');
  eq('(~2)²', '4');
  eq('2+3:3×3', '9'); // multi-statement shows the last result
});

test('functions', () => {
  eq('e^(5)×2', '296.8263182');
  eq('log(1000)', '3');
  eq('log(2,16)', '4');
  eq('ln(90)', '4.49980967');
  eq('(5+3)!', '40320');
  eq('Abs(2−7)×2', '10');
  eq('10P4', '5040');
  eq('10C4', '210');
  eq('150×20%', '30');
  eq('660÷880%', '75');
  eq('3500−3500×25%', '2625');
  eq('Pol(√(2),√(2))', 'r=2, θ=45');
  eq('Rec(√(2),45)', 'x=1, y=1');
  eq('(π÷2)ʳ', '90');
});

test('natural display forms (MathI/MathO)', () => {
  eq('sin(30)', '1⌟2');
  eq('π÷6', '1/6π');
  eq([tok('('), tpl('sqrt', [[tok('2')]]), tok('+'), tok('2'), tok(')'), tok('×'), tpl('sqrt', [[tok('3')]])], '√6+2√3');
  eq([tpl('sqrt', [[tok('2')]]), tok('×'), tok('3')], '3√2');
  eq('10√(2)+15×3√(3)', '45√3+10√2');
  eq('99√(999)', '3129.089165'); // outside the √ form range
  eq('0.1+0.2', '3⌟10');
  eq([tpl('frac', [[tok('2')], [tok('3')]]), tok('+'), tpl('mixed', [[tok('1')], [tok('1')], [tok('2')]])], '13⌟6');
  eq('sin(60)', '√3/2');
  eq('tan(15)', '2-√3');
  eq('1÷√(2)', '√2/2');
  eq('2^(40)', '1.099511628×10^12');
});

test('line output keeps decimals unless fractions are input', () => {
  eq('1÷3', '0.3333333333', LINE);
  eq('1⌟3', '1⌟3', LINE);
  eq('2⌟3+1⌟1⌟2', '13⌟6', LINE);
  eq('√(2)×3', '4.242640687', LINE);
});

test('number formats', () => {
  const fmt = (v, numFormat) => modelText(formatDecimal(N.fromLiteral(v).d, numFormat));
  assert.equal(modelText(formatReal(N.div(L('1'), L('200')), { ...SETUP, io: 'md' })), '5×10^-3');
  assert.equal(modelText(formatReal(N.div(L('1'), L('200')), { ...SETUP, io: 'md', numFormat: { mode: 'norm', digits: 2 } })), '0.005');
  assert.equal(modelText(formatDecimal(N.div(L('100'), L('7')).d, { mode: 'fix', digits: 3 })), '14.286');
  assert.equal(modelText(formatDecimal(N.div(L('1'), L('7')).d, { mode: 'sci', digits: 5 })), '1.4286×10^-1');
  assert.equal(fmt('0.01428571428571', { mode: 'norm', digits: 1 }), '0.01428571429');
  // ENG: 1234 → 1.234×10^3 → 1234×10^0 → (←) 1.234×10^3 → 0.001234×10^6
  const d = L('1234').d;
  const e0 = engExponent(d);
  assert.equal(modelText(formatDecimal(d, undefined, { eng: e0 })), '1.234×10^3');
  assert.equal(modelText(formatDecimal(d, undefined, { eng: e0 - 3 })), '1234×10^0');
  assert.equal(modelText(formatDecimal(d, undefined, { eng: e0 + 3 })), '0.001234×10^6');
  assert.equal(modelText(formatDecimal(L('1024000').d, undefined, { eng: 6, symbols: true })), '1.024M');
});

test('Rnd with Fix 3', () => {
  const fix3 = { setup: { io: 'md', numFormat: { mode: 'fix', digits: 3 } }, context: { numFormat: { mode: 'fix', digits: 3 } } };
  eq('10÷3×3', '10.000', fix3);
  eq('Rnd(10÷3)×3', '9.999', fix3);
});

test('sexagesimal', () => {
  eq('2dms20dms30dms+0dms9dms30dms', '2°30\'0"');
});

test('prime factorisation', () => {
  const f = factorize(1014n);
  assert.deepEqual(f.factors, [[2n, 1], [3n, 1], [13n, 2]]);
  assert.equal(factorize(1009n * 1013n).rest, 1022117n);
});

test('calculus', () => {
  eq([tpl('int', [[tok('ln('), tok('vx'), tok(')')], [tok('1')], [tok('e')]])], '1');
  eq([tpl('diff', [[tok('sin('), tok('vx'), tok(')')], [tok('π'), tok('÷'), tok('2')]])], '0', { setup: { angle: 'rad' } });
  eq([tpl('sum', [[tok('vx'), tok('+'), tok('1')], [tok('1')], [tok('5')]])], '20');
});

test('complex mode', () => {
  const C = { context: { complex: true } };
  eq('(1+i)^(4)+(1−i)²', '-4-2i', C);
  eq('2∠45', '√2+√2i', C);
  eq('Abs(1+i)', '√2', C);
  eq('Arg(1+i)', '45', C);
  eq('Conjg(2+3i)', '2-3i', C);
  eq('ReP(2+3i)', '2', C);
  eq('ImP(2+3i)', '3', C);
  eq('√(~4)', '0+2i', C);
});

test('Base-N', () => {
  const run = (s, baseMode) => {
    const c = ctx({ baseMode });
    return evaluate(parseStatements(line(s), { baseMode })[0], c).d.toString();
  };
  assert.equal(run('11+1', 'bin'), '4');
  assert.equal(run('based10+baseh10+baseb10+baseo10', 'dec'), '36');
  assert.equal(run('1010and1100', 'bin'), '8');
  assert.equal(run('Not(1010)', 'bin'), '-11');
  assert.equal(run('15×37', 'dec'), '555');
  assert.equal(run('7÷2', 'dec'), '3');
});

test('matrices and vectors', () => {
  const m = (rows) => ({ mat: true, r: rows.length, c: rows[0].length, a: rows.map((r) => r.map((x) => L(String(x)))) });
  const text = (M) => M.a.map((r) => r.map((x) => x.d.toString()).join(' ')).join(' / ');
  const mats = { A: m([[2, 1], [1, 1]]), B: m([[2, -1], [-1, 2]]) };
  const run = (s, extra = {}) => evaluate(parseStatements(line(s))[0], ctx({ mats, ...extra }));
  assert.equal(text(run('MatA×MatB')), '3 0 / 1 1');
  assert.equal(run('Det(MatA)').d.toString(), '1');
  assert.equal(text(run('MatA⁻¹')), '1 -1 / -1 2');
  assert.equal(text(run('MatA²')), '5 3 / 3 2');
  assert.equal(text(run('MatA³')), '13 8 / 8 5');
  const v = (xs) => V.vec(xs.map((x) => L(String(x))));
  const vcts = { A: v([1, 2]), B: v([3, 4]), C: v([2, -1, 2]) };
  const rv = (s, setup) => evaluate(parseStatements(line(s))[0], ctx({ vcts, ...setup }));
  assert.equal(rv('VctA•VctB').d.toString(), '11');
  assert.equal(rv('VctA×VctB').a.map((x) => x.d.toString()).join(','), '0,0,-2');
  assert.equal(rv('Abs(VctC)').d.toString(), '3');
  assert.equal(modelText(formatDecimal(rv('Angle(VctA,VctB)').d, { mode: 'fix', digits: 3 })), '10.305');
  assert.equal(rv('UnitV(VctB)').a.map((x) => show(x)).join(','), '3⌟5,4⌟5');
});

test('statistics', () => {
  const rows = (xs, ys, fs) => xs.map((x, i) => ({ x: L(String(x)), y: ys ? L(String(ys[i])) : undefined, f: fs ? L(String(fs[i])) : undefined }));
  const fix3 = (v) => modelText(formatDecimal(v.d, { mode: 'fix', digits: 3 }));
  const s1 = new Stats('1var', rows([1, 2, 3, 4, 5], null, [1, 2, 3, 2, 1]));
  assert.equal(s1.value('x̄').d.toString(), '3');
  const tv = s1.tValue(L('2'));
  assert.equal(show(tv, { ...SETUP, io: 'md' }), '-0.8660254038');
  const lg = new Stats('log', rows([20, 110, 200, 290], [3150, 7310, 8800, 9310]));
  assert.equal(fix3(lg.value('r')), '0.998');
  assert.equal(fix3(lg.value('a')), '-3857.984');
  assert.equal(fix3(lg.value('b')), '2357.532');
  assert.equal(fix3(lg.estimate('ŷ', L('160'))), '8106.898');
  const ex1 = new Stats('log', rows([170, 173, 179], [66, 68, 75]));
  assert.equal(show(ex1.value('a'), { ...SETUP, io: 'md' }), '-852.1627746');
  assert.equal(show(ex1.value('b'), { ...SETUP, io: 'md' }), '178.6897969');
  assert.equal(show(ex1.value('r'), { ...SETUP, io: 'md' }), '0.9919863213');
  // Casio quartiles exclude the median from each half (Learning Mathematics with ClassWiz, module 10)
  const beans = new Stats('1var', rows([24.6, 21.4, 27.1, 30.2, 20.4, 20.7, 21.8, 29.1, 22.5, 21.6, 31.8, 21.0, 17.1, 27.7, 28.1, 24.9, 24.7, 24.0, 23.6, 19.1, 20.8, 24.8, 22.3, 29.6, 24.4]));
  assert.equal(beans.value('Q1').d.toString(), '21.2');
  assert.equal(beans.value('Q3').d.toString(), '27.4');
  assert.equal(beans.value('x̄').d.toString(), '24.132');
});

test('distributions', () => {
  assert.equal(new N.D(Dist.normalPD(36, 2, 35)).toSD(10).toString(), '0.1760326634');
  // the List screen truncates to the column width: 0.1859, 0.1267, 0.0633, 0.0219
  const b = [10, 11, 12, 13].map((x) => (Math.trunc(Dist.binomialPD(x, 15, 0.6) * 1e4) / 1e4).toFixed(4));
  assert.deepEqual(b, ['0.1859', '0.1267', '0.0633', '0.0219']);
  assert.equal(Dist.P(-0.8660254038).toFixed(5), '0.19324');
});

test('equations, inequalities, ratio', () => {
  const sol = solveLinear([[L('1'), L('2')], [L('2'), L('3')]], [L('3'), L('4')]);
  assert.deepEqual(sol.map((x) => x.d.toString()), ['-1', '2']);
  const roots = polyRoots([L('1'), L('2'), L('-2')]);
  assert.deepEqual(roots.map((r) => show(r)), ['-1+√3', '-1-√3']);
  const cubic = polyRoots([L('3'), L('3'), L('-1'), L('0')]);
  assert.deepEqual(cubic.map((r) => show(r)), ['(-3+√21)/6', '0', '(-3-√21)/6']);
  // 1:2 = X:10
  assert.equal(show(N.div(N.mul(L('1'), L('10')), L('2'))), '5');
});

test('inequalities', async () => {
  const { solveInequality } = await import('../src/core/inequality.js');
  const P = (...cs) => cs.map((c) => L(String(c)));
  const text = (r) => (typeof r === 'string' ? r : r.map((s) => (s.point ? `x=${show(s.point)}`
    : `${s.lo ? `${show(s.lo)}${s.loInc ? '≤' : '<'}` : ''}x${s.hi ? `${s.hiInc ? '≤' : '<'}${show(s.hi)}` : ''}`)).join(', '));
  assert.equal(text(solveInequality(P(3, 3, -1, 0), '>')), '(-3-√21)/6<x<0, (-3+√21)/6<x'); // manual example
  assert.equal(text(solveInequality(P(1, 2, -3), '<')), '-3<x<1');
  assert.equal(text(solveInequality(P(1, 0, 0), '≥')), 'all');
  assert.equal(text(solveInequality(P(1, 0, 0), '<')), 'none');
  assert.equal(text(solveInequality(P(1, -2, 1), '≤')), 'x=1');
  assert.equal(text(solveInequality(P(1, -2, 1), '>')), 'x<1, 1<x');
  assert.equal(text(solveInequality(P(1, 0, -4), '≥')), 'x≤-2, 2≤x');
});

test('complex output format commands apply to the whole expression', () => {
  const C = { context: { complex: true } };
  const v = evaluate(parseStatements(line('2∠45►r∠θ'))[0], ctx({ complex: true }));
  assert.equal(v.view, 'polar');
  assert.equal(show(v.value), '√2+√2i');
  eq('√(2)+√(2)i', '√2+√2i', C);
});
