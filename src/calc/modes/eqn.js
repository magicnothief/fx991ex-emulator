// Equation/Func, Inequality and Ratio modes.
import * as N from '../../core/num.js';
import * as V from '../../core/values.js';
import { CalcError, ERR } from '../../core/errors.js';
import { solveLinear, polyRoots } from '../../core/numerics.js';
import { solveInequality } from '../../core/inequality.js';
import { h, renderModel } from '../../ui/render.js';
import { GridScreen, cellText } from '../screens/grid.js';
import { Menu, Message, page, item, closeMenus, ErrorScreen } from '../screens/common.js';
import { VARIABLE_KEYS } from '../keymap.js';
import { t } from '../i18n.js';

/** Blank bottom screen; OPTN reopens the mode's type menu. */
class Root {
  constructor(calc, optn) { this.calc = calc; this.optn = optn; }
  handle(ev) { if (ev.action !== 'optn') return false; this.calc.push(this.optn()); return true; }
  view() { return { el: h('div', 'message'), status: { noMath: true } }; }
}

class Prompt {
  constructor(calc, lines, min, max, onPick) { Object.assign(this, { calc, lines, min, max, onPick, isMenu: true }); }
  handle(ev) {
    const d = /^tok:(\d)$/.exec(ev.action || '');
    if (d && +d[1] >= this.min && +d[1] <= this.max) this.onPick(+d[1]);
    else if (ev.action === 'ac') closeMenus(this.calc);
    else if (ev.action === 'left') this.calc.pop();
    return true;
  }
  view() { return { el: h('div', 'menu', this.lines.map((l) => h('div', 'item', t(l)))) }; }
}

/** Shows labelled results one at a time; = / ▼ advance, ▲ goes back, STO assigns to a variable. */
class SolutionScreen {
  constructor(calc, items, { header = null } = {}) {
    this.calc = calc;
    this.items = items; // [{ label, value }]
    this.i = 0;
    this.header = header;
  }

  handle(ev) {
    if (this.sto) {
      this.sto = false;
      const name = VARIABLE_KEYS[ev.key];
      if (name) this.calc.mem.vars[name] = this.items[this.i].value;
      return true;
    }
    switch (ev.action) {
      case 'eq': case 'down':
        if (this.i < this.items.length - 1) this.i++;
        else if (ev.action === 'eq') this.calc.pop();
        return true;
      case 'up': if (this.i > 0) this.i--; return true;
      case 'ac': this.calc.pop(); return true;
      case 'sto': this.sto = true; return true;
      default: return /^(menu|setup|reset|qr)$/.test(ev.action || '') ? false : true;
    }
  }

  view() {
    const it = this.items[this.i];
    const el = h('div', null);
    if (this.header) el.append(h('div', 'expr-area', this.header));
    const row = h('div', 'result-area', h('span', null, h('span', 'm-row', labelEl(it.label))), h('span', null, renderModel(this.calc.model(it.value, {}), {})));
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    el.append(row);
    return { el, status: { up: this.i > 0, down: this.i < this.items.length - 1, sto: this.sto } };
  }
}

/** Solution labels are data ({ name, idx } or plain text) and become DOM only in view(). */
const sub = (name, idx) => ({ name, idx });
const labelEl = (l) => (typeof l === 'string' ? l
  : h('span', null, h('i', 'm-var', l.name), l.idx ? h('span', 'm-sub', String(l.idx)) : null, '='));

function coefGrid(calc, md, { rows, labels, onEq, onOptn, defaultValue = N.ZERO, title }) {
  return new GridScreen(calc, {
    cols: labels.map((l) => ({ label: l, width: Math.floor(176 / labels.length) })),
    rowNumbers: rows > 1,
    advance: 'right',
    rowCount: () => rows,
    get: (r, c) => md.coef[r][c],
    set: (r, c, v) => { md.coef[r][c] = V.real(v); },
    onAC: (g) => { md.coef = md.coef.map((row) => row.map(() => defaultValue)); g.r = 0; g.c = 0; },
    onEq,
    onOptn,
    side: title ? () => h('div', 'side', title) : null,
  });
}

// ---------------------------------------------------------------- Equation/Func

const UNKNOWNS = ['x', 'y', 'z', 't'];

export const eqnMode = {
  start(calc) {
    calc.push(new Root(calc, () => eqnTypeMenu(calc)));
    calc.push(eqnTypeMenu(calc));
  },
};

function eqnTypeMenu(calc) {
  const md = calc.modeData;
  const begin = (kind, n) => {
    md.kind = kind;
    md.n = n;
    md.coef = kind === 'simul'
      ? Array.from({ length: n }, () => Array.from({ length: n + 1 }, () => N.ZERO))
      : [Array.from({ length: n + 1 }, () => N.ZERO)];
    closeMenus(calc);
    calc.popTo(calc.screens[0]);
    calc.push(eqnEditor(calc));
  };
  return new Menu(calc, [page([
    item('Simul Equation', () => calc.push(new Prompt(calc, ['Simul Equation', 'Number of Unknowns?', 'Select 2~4'], 2, 4, (n) => begin('simul', n)))),
    item('Polynomial', () => calc.push(new Prompt(calc, ['Polynomial', 'Degree?', 'Select 2~4'], 2, 4, (n) => begin('poly', n)))),
  ])]);
}

function eqnEditor(calc) {
  const md = calc.modeData;
  const simul = md.kind === 'simul';
  const labels = simul ? [...UNKNOWNS.slice(0, md.n), '='] : ['a', 'b', 'c', 'd', 'e'].slice(0, md.n + 1);
  return coefGrid(calc, md, {
    rows: simul ? md.n : 1,
    labels,
    onOptn: () => calc.push(eqnTypeMenu(calc)),
    onEq: () => {
      try {
        if (simul) solveSimul(calc, md);
        else solvePoly(calc, md);
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        calc.push(new ErrorScreen(calc, e.kind, { onCancel: () => {}, onGoto: () => {} }));
      }
    },
  });
}

function solveSimul(calc, md) {
  const A = md.coef.map((row) => row.slice(0, md.n));
  const b = md.coef.map((row) => row[md.n]);
  const sol = solveLinear(A, b);
  if (sol === 'none') return calc.push(new Message(calc, ['No Solution']));
  if (sol === 'infinite') return calc.push(new Message(calc, ['Infinite Solution']));
  calc.push(new SolutionScreen(calc, sol.map((v, i) => ({ label: sub(UNKNOWNS[i]), value: v }))));
}

function solvePoly(calc, md) {
  const coefs = md.coef[0];
  if (N.isZero(coefs[0])) throw new CalcError(ERR.MATH);
  let roots = polyRoots(coefs);
  if (!calc.setup.eqComplex) {
    roots = roots.filter((r) => !V.isCx(r));
    if (roots.length === 0) return calc.push(new Message(calc, ['No Real Roots']));
  }
  // repeated roots are listed once
  const distinct = [];
  for (const r of roots) {
    const same = distinct.some((d) => V.isCx(d) === V.isCx(r) && (V.isCx(r) ? N.eq(d.re, r.re) && N.eq(d.im, r.im) : N.eq(d, r)));
    if (!same) distinct.push(r);
  }
  const items = distinct.map((v, i) => ({ label: sub('x', distinct.length > 1 ? i + 1 : 0), value: v }));
  if (md.n === 2) {
    // vertex of y = ax² + bx + c
    const [a, b, c] = coefs;
    const x = N.div(N.neg(b), N.mul(N.fromInt(2), a));
    const y = N.sub(c, N.div(N.mul(b, b), N.mul(N.fromInt(4), a)));
    items.push({ label: sub('x'), value: x }, { label: sub('y'), value: y });
  }
  calc.push(new SolutionScreen(calc, items));
}

// ---------------------------------------------------------------- Inequality

const INEQ_OPS = ['>', '<', '≥', '≤'];
const POLY_TEXT = { 2: 'ax²+bx+c', 3: 'ax³+bx²+cx+d', 4: 'ax⁴+bx³+cx²+dx+e' };

export const ineqMode = {
  start(calc) {
    calc.push(new Root(calc, () => ineqTypeMenu(calc)));
    calc.push(ineqTypeMenu(calc).items);
  },
};

function ineqTypeMenu(calc) {
  const md = calc.modeData;
  const degree = new Prompt(calc, ['Polynomial', 'Degree?', 'Select 2~4'], 2, 4, (n) => {
    calc.push(new Menu(calc, [page(INEQ_OPS.map((op) => item(`${POLY_TEXT[n]}${op}0`, () => {
      md.n = n;
      md.op = op;
      md.coef = [Array.from({ length: n + 1 }, () => N.ZERO)];
      closeMenus(calc);
      calc.popTo(calc.screens[0]);
      calc.push(ineqEditor(calc));
    })), { small: n === 4 })], { sub: true }));
  });
  const menu = new Menu(calc, [page([item('Polynomial', () => calc.push(degree))])]);
  menu.items = degree;
  return menu;
}

function ineqEditor(calc) {
  const md = calc.modeData;
  return coefGrid(calc, md, {
    rows: 1,
    labels: ['a', 'b', 'c', 'd', 'e'].slice(0, md.n + 1),
    onOptn: () => calc.push(ineqTypeMenu(calc)),
    onEq: () => {
      try {
        calc.push(new IneqResult(calc, solveInequality(md.coef[0], md.op)));
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        calc.push(new ErrorScreen(calc, e.kind, { onCancel: () => {}, onGoto: () => {} }));
      }
    },
  });
}

class IneqResult {
  constructor(calc, result) {
    this.calc = calc;
    this.result = result;
    this.offset = 0;
  }

  handle(ev) {
    switch (ev.action) {
      case 'right': this.offset += 40; return true;
      case 'left': this.offset = Math.max(0, this.offset - 40); return true;
      case 'ac': case 'eq': this.calc.pop(); return true;
      default: return /^(menu|setup|reset|qr)$/.test(ev.action || '') ? false : true;
    }
  }

  view() {
    const r = this.result;
    if (r === 'all' || r === 'none') {
      return { el: h('div', 'message', h('div', null, t(r === 'all' ? 'All Real Numbers' : 'No Solution'))) };
    }
    if (this.calc.setup.io !== 'mm') return this.letterView(r);
    const m = (v) => renderModel(this.calc.model(v, {}), {});
    const x = () => h('i', 'm-var', 'x');
    const lt = (inc) => h('span', 'm-op', inc ? '≤' : '<');
    const parts = [];
    r.forEach((s, i) => {
      if (i) parts.push(h('span', 'm-op', ';'));
      if (s.point) parts.push(x(), h('span', 'm-op', '='), m(s.point));
      else if (s.ne) parts.push(x(), h('span', 'm-op', '≠'), m(s.ne));
      else {
        if (s.lo) parts.push(m(s.lo), lt(s.loInc));
        parts.push(x());
        if (s.hi) parts.push(lt(s.hiInc), m(s.hi));
      }
    });
    const line = h('span', 'm-row', parts);
    line.style.transform = `translateX(calc(var(--lp) * ${-this.offset}))`;
    const area = h('div', 'expr-area', line);
    area.style.top = 'calc(var(--lp) * 14)';
    return { el: h('div', null, area) };
  }

  /** Outside MathI/MathO the boundaries are letters with their decimal values listed below (User's Guide p.30). */
  letterView(r) {
    const letters = 'abcdefgh';
    const values = [];
    const name = (v) => { values.push(v); return letters[values.length - 1]; };
    const lt = (inc) => (inc ? '≤' : '<');
    const pattern = r.map((s) => (s.point ? `x=${name(s.point)}` : s.ne ? `x≠${name(s.ne)}`
      : `${s.lo ? `${name(s.lo)}${lt(s.loInc)}` : ''}x${s.hi ? `${lt(s.hiInc)}${name(s.hi)}` : ''}`)).join(',');
    const rows = values.slice(this.offset / 40, this.offset / 40 + 3).map((v, i) => {
      const row = h('div', 'row', h('span', null, `${letters[this.offset / 40 + i]}=`), h('span', 'v', renderModel(this.calc.model(v, { form: 'dec' }), { line: true })));
      return row;
    });
    return { el: h('div', 'kv', h('div', 'row', pattern), rows) };
  }
}

// ---------------------------------------------------------------- Ratio

export const ratioMode = {
  start(calc) {
    calc.push(new Root(calc, () => ratioMenu(calc)));
    calc.push(ratioMenu(calc));
  },
};

function ratioMenu(calc) {
  const md = calc.modeData;
  const pick = (kind) => () => {
    md.kind = kind;
    md.coef = [[N.ONE, N.ONE, N.ONE]];
    closeMenus(calc);
    calc.popTo(calc.screens[0]);
    calc.push(ratioEditor(calc));
  };
  return new Menu(calc, [page([item('A:B=X:D', pick('X:D')), item('A:B=C:X', pick('C:X'))])]);
}

function ratioEditor(calc) {
  const md = calc.modeData;
  const labels = md.kind === 'X:D' ? ['A', 'B', 'D'] : ['A', 'B', 'C'];
  const grid = coefGrid(calc, md, {
    rows: 1,
    labels,
    defaultValue: N.ONE,
    title: md.kind === 'X:D' ? 'A:B=X:D' : 'A:B=C:X',
    onOptn: () => calc.push(ratioMenu(calc)),
    onEq: () => {
      const [a, b, c] = md.coef[0];
      if ([a, b, c].some(N.isZero)) {
        calc.push(new ErrorScreen(calc, ERR.MATH, { onCancel: () => {}, onGoto: () => {} }));
        return;
      }
      const x = md.kind === 'X:D' ? N.div(N.mul(a, c), b) : N.div(N.mul(b, c), a);
      calc.setAns(x);
      calc.push(new SolutionScreen(calc, [{ label: 'X=', value: x }]));
    },
  });
  // one line, as on the calculator: "1 : 2 = X : 10" with the selected value highlighted
  const gridView = grid.view.bind(grid);
  grid.view = () => {
    const r = gridView();
    const field = (c) => h('span', `f${grid.c === c ? ' sel' : ''}`, cellText(md.coef[0][c], 6));
    const parts = md.kind === 'X:D'
      ? [field(0), ':', field(1), '=', 'X', ':', field(2)]
      : [field(0), ':', field(1), '=', field(2), ':', 'X'];
    r.el.querySelector('table').replaceWith(h('div', 'ratio-line', parts));
    r.el.querySelector('.side')?.remove();
    return r;
  };
  return grid;
}
