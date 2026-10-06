// Key-sequence tests of the calculator state machine, using the User's Guide examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Calculator } from '../src/calc/calculator.js';
import { MODES } from '../src/calc/modes/index.js';
import { modelText } from '../src/core/format.js';

function fresh() {
  return new Calculator({ modes: MODES, storage: null });
}

function keys(calc, seq) {
  for (const k of seq.split(/\s+/).filter(Boolean)) calc.press(k);
  return calc;
}

/** Text of the displayed result of the calculation screen. */
function result(calc) {
  const s = calc.top;
  assert.ok(s.result, `no result shown (top screen: ${s.constructor.name})`);
  const v = s.result.value;
  if (v.pair) return v.labels.map((l, i) => `${l}=${modelText(calc.model(v.values[i], s.result.view))}`).join(', ');
  return modelText(s.resultModel());
}

test('Ans continues the next calculation', () => {
  const c = keys(fresh(), '1 4 MUL 1 3 EQ DIV 7 EQ');
  assert.equal(result(c), '26');
  keys(c, '1 2 3 ADD 4 5 6 EQ 7 8 9 SUB ANS EQ');
  assert.equal(result(c), '210');
});

test('replay edits the previous expression', () => {
  const c = keys(fresh(), '4 MUL 3 ADD 2 EQ');
  assert.equal(result(c), '14');
  keys(c, 'LEFT DEL DEL SUB 7 EQ');
  assert.equal(result(c), '5');
});

test('calculation history scrolls back', () => {
  const c = keys(fresh(), '2 ADD 2 EQ 3 ADD 3 EQ');
  assert.equal(result(c), '6');
  keys(c, 'UP');
  assert.equal(result(c), '4');
});

test('multi-statements show each result in turn', () => {
  const c = keys(fresh(), '3 ADD 3 ALPHA INT 3 MUL 3 EQ');
  assert.equal(result(c), '6');
  keys(c, 'EQ');
  assert.equal(result(c), '9');
});

test('variables, STO and independent memory', () => {
  const c = keys(fresh(), '3 ADD 5 STO NEG');
  assert.equal(result(c), '8');
  keys(c, 'ALPHA NEG MUL 1 0 EQ');
  assert.equal(result(c), '80');
  keys(c, 'AC 0 STO MPLUS 1 0 MUL 5 MPLUS 1 0 ADD 5 SHIFT MPLUS');
  assert.equal(c.mem.vars.M.d.toString(), '35');
});

test('CALC substitutes variable values', () => {
  const c = keys(fresh(), '3 ALPHA NEG ADD ALPHA DMS CALC 5 EQ 1 0 EQ');
  assert.equal(result(c), '25');
});

test('SOLVE uses Newton\'s method', () => {
  const c = keys(fresh(), 'ALPHA RP SQR ADD ALPHA DMS ALPHA CALC 0 SHIFT CALC 1 EQ NEG 2 EQ UP EQ');
  assert.equal(c.top.constructor.name, 'SolveResult');
  assert.equal(modelText(c.model(c.top.x, { form: 'dec' })), '1.414213562');
  assert.equal(c.top.residual.d.toString(), '0');
});

test('syntax errors show the error screen; AC clears', () => {
  const c = keys(fresh(), '1 ADD EQ');
  assert.equal(c.top.kind, 'Syntax ERROR');
  keys(c, 'AC');
  assert.equal(c.top.constructor.name, 'CalcScreen');
  assert.ok(c.top.editor.isEmpty());
});

test('setup: Fix 3 with ≈', () => {
  const c = keys(fresh(), 'SHIFT MENU 3 1 3 1 0 0 DIV 7 SHIFT EQ');
  assert.equal(result(c), '14.286');
});

test('S⇔D toggles π and decimal forms', () => {
  const c = keys(fresh(), 'SHIFT EXP DIV 6 EQ');
  assert.equal(result(c), '1/6π');
  keys(c, 'SD');
  assert.equal(result(c), '0.5235987756');
});

test('engineering symbols', () => {
  const c = keys(fresh(), '9 9 9 OPTN 3 6 ADD 2 5 OPTN 3 6 EQ');
  assert.equal(result(c), '1024000');
  keys(c, 'SHIFT MENU 4 1 9 9 9 OPTN 3 6 ADD 2 5 OPTN 3 6 EQ');
  assert.equal(result(c), '1.024M');
});

test('main menu switches modes and Statistics finds the mean', () => {
  // User's Guide Ex 2, with the Freq column: 1=2=3=4=5= ▼ ▶ 1=2=3=2= then OPTN ▼ 2 (Variable) 1 (x̄)
  const c = keys(fresh(), 'SHIFT MENU DOWN 3 1 MENU 6 1 1 EQ 2 EQ 3 EQ 4 EQ 5 EQ DOWN RIGHT 1 EQ 2 EQ 3 EQ 2 EQ AC OPTN DOWN 2 1 EQ');
  assert.equal(c.mode, 'stat');
  assert.equal(result(c), '3');
});

test('Base-N conversion of a result', () => {
  const c = keys(fresh(), 'MENU 3 1 5 MUL 3 7 EQ');
  assert.equal(c.top.result.value.d.toString(), '555');
  keys(c, 'POW');
  assert.equal(c.modeData.base, 'hex');
});

test('RESET Initialize All clears memory and setup', () => {
  const c = keys(fresh(), 'SHIFT MENU 2 2 5 STO NEG SHIFT 9 3 EQ AC');
  assert.equal(c.setup.angle, 'deg');
  assert.equal(c.mem.vars.A, undefined);
});

test('STO copies a matrix to another matrix variable (p.26)', () => {
  const c = keys(fresh(), 'MENU 4 1 2 2 2 EQ 1 EQ 1 EQ 1 EQ STO DMS');
  assert.equal(c.mem.mats.B.a[0][0].d.toString(), '2');
  keys(c, '9 EQ');
  assert.equal(c.mem.mats.A.a[0][0].d.toString(), '2', 'editing the copy leaves the original unchanged');
});

test('Spreadsheet cut & paste and copy & paste (pp.34–35)', () => {
  const base = 'MENU 8 7 MUL 5 EQ 7 MUL 6 EQ ALPHA NEG 2 ADD 7 EQ UP UP UP RIGHT ALPHA CALC ALPHA NEG 1 ADD 7 EQ';
  const cut = keys(fresh(), `${base} UP OPTN DOWN 1 RIGHT EQ`);
  assert.equal(cut.top.cells.C1.value.d.toString(), '42');
  assert.equal(cut.top.cells.B1, undefined);
  const copy = keys(fresh(), `${base} UP OPTN DOWN 2 DOWN DOWN EQ`);
  assert.equal(copy.top.cells.B3.value.d.toString(), '56');
});

test('ENG with Engineer Symbol on (p.12)', () => {
  const c = keys(fresh(), 'SHIFT MENU 4 1 9 9 9 OPTN 3 6 ADD 2 5 OPTN 3 6 EQ');
  assert.equal(result(c), '1.024M');
  keys(c, 'ENG');
  assert.equal(result(c), '1024k');
  keys(c, 'ENG');
  assert.equal(result(c), '1024000');
  keys(c, 'SHIFT ENG');
  assert.equal(result(c), '1024k');
});

test('°’” converts a sexagesimal result to decimal and back (p.11)', () => {
  const c = keys(fresh(), '2 DMS 2 0 DMS 3 0 DMS ADD 0 DMS 9 DMS 3 0 DMS EQ');
  assert.equal(result(c), '2°30\'0"');
  keys(c, 'DMS');
  assert.equal(result(c), '2.5');
  keys(c, 'DMS');
  assert.equal(result(c), '2°30\'0"');
});

test('decimal-type results stay decimal in MathI/MathO (pp.23, 37)', () => {
  const freq = 'SHIFT MENU DOWN 3 1 MENU 6 1 1 EQ 2 EQ 3 EQ 4 EQ 5 EQ DOWN RIGHT 1 EQ 2 EQ 3 EQ 2 EQ';
  const c = keys(fresh(), `${freq} AC 2 OPTN DOWN 4 4 EQ OPTN DOWN 4 1 ANS RP EQ`);
  assert.equal(result(c), '0.19324');
  assert.equal(result(keys(fresh(), '5 SHIFT 8 1 2 EQ')), '1.968503937');
  assert.equal(result(keys(fresh(), 'SHIFT MENU 1 3 5 SHIFT 8 1 2 EQ')), '1.968503937');
  assert.equal(result(keys(fresh(), 'SHIFT 7 DOWN 2 1 EQ')), '273.15');
  assert.equal(result(keys(fresh(), 'SHIFT 7 DOWN 2 1 EQ SD')), '5463⌟20', 'S⇔D still offers the fraction');
});

// ---------------------------------------------------------------- fx-991CE X, from the physical parity sheet

test('fx-991CE X calculation results observed on the physical unit', () => {
  const r = (seq) => result(keys(fresh(), seq));
  assert.equal(r('AC INT ALPHA RP SQR RIGHT 0 RIGHT 1 EQ'), '1⌟3'); // G02
  assert.equal(r('AC INT 4 FRAC 1 ADD ALPHA RP SQR RIGHT RIGHT 0 RIGHT 1 EQ'), 'π'); // G03
  assert.equal(r('AC INT ALPHA RP RIGHT 1 RIGHT 0 EQ'), '-1⌟2'); // G05
  assert.equal(r('AC SIN 1 8 RP EQ'), '0.3090169944'); // E09
  assert.equal(r('AC SHIFT LOG 0 DOT 5 EQ'), '3.16227766'); // E36
  assert.equal(r('AC 2 POW 1 FRAC 2 EQ'), '1.414213562'); // E39
  assert.equal(r('SHIFT MENU 2 2 AC SIN 3 DOT 1 4 1 5 9 2 6 5 3 5 8 9 7 9 RP EQ'), '0'); // F10
  assert.equal(r('SHIFT MENU 2 2 AC SHIFT ADD 1 SHIFT RP 1 RP EQ'), 'r=1.414213562, θ=0.7853981634'); // F13
  assert.equal(r('SHIFT MENU 3 1 0 AC 5 DIV 2 SHIFT EQ'), '3.'); // C16 (shown as 3,)
  assert.equal(r('SHIFT MENU 3 1 2 AC 1 EXP 1 2 EQ'), '1×10^12'); // C17
  assert.equal(r('SHIFT 4 2 2 1 EQ'), '44.955908'); // ATOMIC, User's Guide HU p.39
  assert.equal(keys(fresh(), 'AC SHIFT X ALPHA RP RIGHT 1 DOT 5 RIGHT 3 EQ').top.kind, 'Argument ERROR'); // G12
  assert.equal(keys(fresh(), 'SHIFT 4 2 1 1 9 EQ').top.kind, 'Syntax ERROR'); // U33
  assert.equal(r('SHIFT 4 2 4 3 EQ'), '97'); // U31
  assert.equal(keys(fresh(), 'MENU 2 LP 1 ADD ENG RP POW 0 DOT 5 EQ').top.kind, 'Math ERROR'); // I14
  assert.equal(keys(fresh(), 'AC 2 POW 3 RIGHT POW 2 EQ').top.kind, 'Syntax ERROR'); // A09
});

test('Base-N ignores the decimal key (J15)', () => {
  const c = keys(fresh(), 'MENU 3 1 DOT 5');
  assert.deepEqual(c.top.editor.root.map((n) => n.id), ['1', '5']);
});

test('Statistics median is decimal (M12)', () => {
  assert.equal(result(keys(fresh(), 'MENU 6 1 1 EQ 2 EQ 3 EQ 4 EQ 5 EQ 6 EQ AC OPTN DOWN 3 3 EQ')), '3.5');
});
