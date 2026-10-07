// Table mode: f(x) and g(x) input, Table Range, and the number table.
import * as N from '../../core/num.js';
import * as V from '../../core/values.js';
import { Editor } from '../../core/editor.js';
import { parseExpression } from '../../core/parser.js';
import { evaluate } from '../../core/evaluator.js';
import { CalcError, ERR } from '../../core/errors.js';
import { h, renderNodes } from '../../ui/render.js';
import { GridScreen } from '../screens/grid.js';
import { Menu, ErrorScreen } from '../screens/common.js';
import { commonOptnPage } from '../screens/menus.js';
import { ParamScreen } from '../screens/params.js';
import { LINE_TEMPLATE } from '../screens/calcscreen.js';
import { editorBox, textBox, row, drawBox } from '../../ui/mathbox.js';

export const tableMode = {
  start(calc) {
    const md = calc.modeData;
    md.f = [];
    md.g = [];
    md.range = { Start: N.ONE, End: N.fromInt(5), Step: N.ONE };
    md.onSetup = (what) => { if (what === 'io') { md.f = []; md.g = []; } };
    calc.push(new FuncInput(calc, 'f'));
  },
};

class FuncInput {
  constructor(calc, which) {
    this.calc = calc;
    this.which = which;
    const md = calc.modeData;
    this.editor = new Editor(this.math, Editor.clone(md[which]));
  }

  get math() { return this.calc.setup.io === 'mm' || this.calc.setup.io === 'md'; }

  onSetup(what) { if (what === 'io') this.editor = new Editor(this.math); }

  handle(ev) {
    const a = ev.action || '';
    const ed = this.editor;
    const md = this.calc.modeData;
    switch (a) {
      case 'eq': {
        md[this.which] = Editor.clone(ed.root);
        if (this.which === 'f' && this.calc.setup.table === 'fg') this.calc.push(new FuncInput(this.calc, 'g'));
        else this.calc.push(rangeScreen(this.calc));
        return true;
      }
      case 'ac': ed.clear(); md[this.which] = []; return true;
      case 'del': ed.del(); return true;
      case 'left': ed.left(); return true;
      case 'right': ed.right(); return true;
      case 'up':
        if (!ed.vertical('up') && this.which === 'g') { md.g = Editor.clone(ed.root); this.calc.pop(); }
        return true;
      case 'down': ed.vertical('down'); return true;
      case 'ins': if (this.math) ed.insArmed = !ed.insArmed; return true;
      case 'exp': if (this.math) ed.insertTemplate('e10'); else ed.insert('E'); return true;
      case 'optn': this.calc.push(new Menu(this.calc, [commonOptnPage(this.calc, (x) => this.handle({ action: x }))])); return true;
      default: {
        const m = /^(tok|tpl|var):(.*)$/.exec(a);
        if (!m) return !/^(menu|setup|reset|qr)$/.test(a);
        if (m[1] === 'tok') ed.insert(m[2]);
        else if (m[1] === 'var') ed.insert(`v${m[2]}`);
        else if (this.math) ed.insertTemplate(m[2]);
        else ed.insert(LINE_TEMPLATE[m[2]] ?? m[2]);
        return true;
      }
    }
  }

  view() {
    const label = h('span', null, this.which, '(', h('i', 'm-var', 'x'), ')=');
    const expr = h('div', `expr-area${this.math ? '' : ' line'}`, h('span', 'expr-scroll', label,
      renderNodes(this.editor.root, { math: this.math, cursor: this.editor.cursor(), cursorState: { block: this.editor.remaining() <= 10 } })));
    return { el: h('div', null, expr) };
  }

  paint(lcd) {
    const label = row([textBox(this.which), textBox('('), textBox('𝑥'), textBox(')='),
      editorBox(this.editor.root, { math: this.math, cursor: this.editor.cursor(), cursorState: { block: this.editor.remaining() <= 10 } })]);
    drawBox(lcd, label, 0, 1 + label.asc);
  }
}

function rangeScreen(calc) {
  const md = calc.modeData;
  return new ParamScreen(calc, {
    title: 'Table Range',
    params: ['Start', 'End', 'Step'].map((k) => ({ key: k, label: k })),
    values: md.range,
    onAC: () => calc.pop(),
    onEq: () => {
      try {
        calc.push(tableView(calc, generate(calc)));
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        calc.push(new ErrorScreen(calc, e.kind, { onCancel: () => {}, onGoto: () => {} }));
      }
    },
  });
}

function compiled(calc) {
  const md = calc.modeData;
  const f = md.f.length ? parseExpression(md.f) : null;
  const g = calc.setup.table === 'fg' && md.g.length ? parseExpression(md.g) : null;
  if (!f && !g) throw new CalcError(ERR.SYNTAX);
  return { f, g };
}

/** One table row; table values are decimal-type (−0,5 rather than −1/2). */
function rowFor(calc, fns, xValue) {
  const x = N.fromDec(xValue.d);
  calc.mem.vars.x = x; // table generation changes variable x
  const val = (ast) => {
    if (!ast) return null;
    try {
      return N.fromDec(V.real(evaluate(ast, calc.ctx())).d);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      return 'ERROR';
    }
  };
  return { x, f: val(fns.f), g: val(fns.g) };
}

function generate(calc) {
  const md = calc.modeData;
  const { Start, End, Step } = md.range;
  const limit = calc.setup.table === 'fg' && md.g.length ? 30 : 45;
  if (N.isZero(Step) || N.sign(N.sub(End, Start)) * N.sign(Step) < 0) throw new CalcError(ERR.RANGE);
  const count = N.toNumber(N.div(N.sub(End, Start), Step)) + 1;
  if (!(count >= 1) || Math.floor(count + 1e-9) > limit) throw new CalcError(ERR.RANGE);
  const fns = compiled(calc);
  const rows = [];
  for (let k = 0; k < Math.floor(count + 1e-9); k++) rows.push(rowFor(calc, fns, N.add(Start, N.mul(Step, N.fromInt(k)))));
  return { rows, fns, limit };
}

function tableView(calc, table) {
  const md = calc.modeData;
  const cols = [{ label: 'x', key: 'x' }];
  if (table.fns.f) cols.push({ label: 'f(x)', key: 'f' });
  if (table.fns.g) cols.push({ label: 'g(x)', key: 'g' });
  const width = Math.floor(180 / cols.length);
  const grid = new GridScreen(calc, {
    cols: cols.map((c) => ({ ...c, width })),
    rowCount: () => table.rows.length,
    growable: true,
    maxRows: table.limit,
    editable: (r, c) => c === 0,
    get: (r, c) => table.rows[r][cols[c].key],
    set: (r, c, v) => {
      table.rows[r] = rowFor(calc, table.fns, V.real(v));
    },
    onAC: () => { calc.pop(); calc.pop(); if (calc.top instanceof FuncInput && calc.top.which === 'g') calc.pop(); },
    onEq: (g) => addNextRow(g, 1),
  });
  // + or = on the row below the last x adds previous + Step; − subtracts it
  const base = grid.handle.bind(grid);
  const addNextRow = (g, sign) => {
    if (g.editor || g.r !== table.rows.length || g.r === 0 || g.r >= table.limit) return false;
    const prev = table.rows[g.r - 1].x;
    table.rows.push(rowFor(calc, table.fns, sign > 0 ? N.add(prev, md.range.Step) : N.sub(prev, md.range.Step)));
    return true;
  };
  grid.handle = (ev) => {
    if (!grid.editor && grid.c === 0 && (ev.action === 'tok:+' || ev.action === 'tok:-') && addNextRow(grid, ev.action === 'tok:+' ? 1 : -1)) return true;
    return base(ev);
  };
  return grid;
}
