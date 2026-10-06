// Spreadsheet mode: cells A1–E45 holding constants or formulas.
import * as N from '../../core/num.js';
import * as V from '../../core/values.js';
import { Editor, tok } from '../../core/editor.js';
import { parseExpression } from '../../core/parser.js';
import { evaluate } from '../../core/evaluator.js';
import { CalcError, ERR } from '../../core/errors.js';
import { tokenInfo } from '../../core/tokens.js';
import { h, renderNodes, renderModel } from '../../ui/render.js';
import { cellText } from '../screens/grid.js';
import { Menu, Message, page, item, closeMenus, ErrorScreen } from '../screens/common.js';
import { commonOptnPage } from '../screens/menus.js';
import { LINE_TEMPLATE, RecallScreen } from '../screens/calcscreen.js';
import { VARIABLE_KEYS } from '../keymap.js';

const COLS = ['A', 'B', 'C', 'D', 'E'];
const ROWS = 45;
const CAPACITY = 1700;
const name = (c, r) => `${COLS[c]}${r + 1}`;

export const sheetMode = {
  start(calc) {
    calc.modeData.cells = {};
    calc.push(new Sheet(calc));
  },
};

/** Moves relative references in formula nodes by (dr, dc); refs leaving the sheet become invalid. */
export function shiftRefs(nodes, dr, dc) {
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i];
    if (nd.k === 'tpl') { out.push({ ...nd, s: nd.s.map((s) => shiftRefs(s, dr, dc)) }); continue; }
    let j = i;
    const absCol = nodes[j]?.id === '$';
    if (absCol) j++;
    const v = nodes[j];
    const info = v && v.k === 'tok' ? tokenInfo(v.id) : null;
    if (!info || info.kind !== 'var' || !COLS.includes(info.name)) { out.push(nd); continue; }
    j++;
    const absRow = nodes[j]?.id === '$';
    if (absRow) j++;
    let digits = '';
    while (nodes[j] && nodes[j].k === 'tok' && /^\d$/.test(nodes[j].id)) { digits += nodes[j].id; j++; }
    if (!digits) { out.push(nd); continue; }
    let col = COLS.indexOf(info.name) + (absCol ? 0 : dc);
    let row = parseInt(digits, 10) + (absRow ? 0 : dr);
    const valid = col >= 0 && col < COLS.length && row >= 1 && row <= ROWS;
    if (!valid) { col = Math.min(Math.max(col, 0), 4); row = 0; } // row 0 never exists → ERROR
    if (absCol) out.push(tok('$'));
    out.push(tok(`v${COLS[col]}`));
    if (absRow) out.push(tok('$'));
    for (const d of String(row)) out.push(tok(d));
    i = j - 1;
  }
  return out;
}

class Sheet {
  constructor(calc) {
    this.calc = calc;
    this.r = 0;
    this.c = 0;
    this.top = 0;
    this.left = 0;
    this.editor = null;
    this.paste = null; // { mode: 'copy'|'cut', from: [r, c] }
    this.grab = null;  // [r, c] while choosing a cell reference
  }

  get cells() { return this.calc.modeData.cells; }

  move(dr, dc, pos = this) {
    pos.r = Math.min(ROWS - 1, Math.max(0, pos.r + dr));
    pos.c = Math.min(COLS.length - 1, Math.max(0, pos.c + dc));
    if (pos.r < this.top) this.top = pos.r;
    if (pos.r >= this.top + 4) this.top = pos.r - 3;
    if (pos.c < this.left) this.left = pos.c;
    if (pos.c >= this.left + 4) this.left = pos.c - 3;
  }

  // ------------------------------------------------------------ values

  used() {
    return Object.values(this.cells).reduce((n, cell) => n + (cell.formula ? 11 + cell.formula.length : 10), 0);
  }

  /** Computes every formula cell (Auto Calc on, or Recalculate). */
  recalc() {
    const memo = new Map();
    const visiting = new Set();
    const valueOf = (key) => {
      const cell = this.cells[key];
      if (!cell) return N.ZERO;
      if (!cell.formula) return cell.value;
      if (memo.has(key)) return memo.get(key);
      if (visiting.has(key)) throw new CalcError(ERR.CIRCULAR);
      visiting.add(key);
      let v;
      try {
        v = V.real(evaluate(parseExpression(cell.formula, { cells: true }), this.ctx(valueOf)));
      } catch (e) {
        if (!(e instanceof CalcError) || e.kind === ERR.CIRCULAR) throw e;
        v = 'ERROR';
      }
      visiting.delete(key);
      memo.set(key, v);
      return v;
    };
    for (const [key, cell] of Object.entries(this.cells)) if (cell.formula) cell.value = valueOf(key);
  }

  ctx(valueOf) {
    const ref = (r) => {
      if (r.row < 1 || r.row > ROWS) throw new CalcError(ERR.MATH);
      return `${r.col}${r.row}`;
    };
    const num = (v) => { if (v === 'ERROR') throw new CalcError(ERR.MATH); return v; };
    return this.calc.ctx({
      cell: (r) => num(valueOf(ref(r))),
      range: (fn, a, b) => {
        const [c1, c2] = [COLS.indexOf(a.col), COLS.indexOf(b.col)].sort((x, y) => x - y);
        const [r1, r2] = [a.row, b.row].sort((x, y) => x - y);
        const vals = [];
        for (let c = c1; c <= c2; c++) for (let r = r1; r <= r2; r++) {
          const key = `${COLS[c]}${r}`;
          if (this.cells[key]) vals.push(num(valueOf(key)));
        }
        if (vals.length === 0) throw new CalcError(ERR.MATH);
        if (fn === 'Min') return vals.reduce((m, v) => (N.cmp(v, m) < 0 ? v : m));
        if (fn === 'Max') return vals.reduce((m, v) => (N.cmp(v, m) > 0 ? v : m));
        const sum = vals.reduce((s, v) => N.add(s, v), N.ZERO);
        return fn === 'Sum' ? sum : N.div(sum, N.fromInt(vals.length));
      },
    });
  }

  /** Stores input into a cell: "=…" is a formula, anything else a constant evaluated now. */
  store(r, c, nodes) {
    const key = name(c, r);
    const prev = this.cells[key];
    let cell;
    if (nodes[0]?.k === 'tok' && nodes[0].id === '=') {
      cell = { formula: nodes.slice(1), value: null };
      if (cell.formula.length > 49) throw new CalcError(ERR.MEMORY);
    } else {
      if (nodes.length > 10) throw new CalcError(ERR.MEMORY);
      const v = V.real(evaluate(parseExpression(nodes, { cells: true }), this.ctx((k) => this.cells[k]?.value ?? N.ZERO)));
      cell = { formula: null, value: v, nodes };
    }
    this.cells[key] = cell;
    if (this.used() > CAPACITY) {
      if (prev) this.cells[key] = prev; else delete this.cells[key];
      throw new CalcError(ERR.MEMORY);
    }
    try {
      if (this.calc.setup.sheetAutoCalc || cell.formula) this.recalc();
    } catch (e) {
      if (prev) this.cells[key] = prev; else delete this.cells[key];
      throw e;
    }
  }

  fail(e) {
    if (!(e instanceof CalcError)) throw e;
    const keep = this.editor;
    this.calc.push(new ErrorScreen(this.calc, e.kind, { onCancel: () => { this.editor = null; }, onGoto: () => { this.editor = keep; } }));
  }

  // ------------------------------------------------------------ keys

  handle(ev) {
    const a = ev.action || '';
    if (this.stoPending) {
      this.stoPending = false;
      const v = VARIABLE_KEYS[ev.key];
      const cell = this.cells[name(this.c, this.r)];
      if (v && cell && cell.value !== 'ERROR' && cell.value) this.calc.mem.vars[v] = cell.value;
      return true;
    }
    if (this.grab) return this.handleGrab(a);
    if (this.editor) return this.handleEdit(a);
    if (this.paste) {
      if (a === 'eq') return this.doPaste();
      if (a === 'ac') { this.paste = null; return true; }
    }
    switch (a) {
      case 'up': this.move(-1, 0); return true;
      case 'down': this.move(1, 0); return true;
      case 'left': this.move(0, -1); return true;
      case 'right': this.move(0, 1); return true;
      case 'del': delete this.cells[name(this.c, this.r)]; if (this.calc.setup.sheetAutoCalc) this.safeRecalc(); return true;
      case 'optn': this.calc.push(this.cellOptn()); return true;
      case 'sto': this.stoPending = true; return true;
      case 'recall':
        this.calc.push(new RecallScreen(this.calc, { apply: (action) => { this.editor = new Editor(this.math); this.handleEdit(action); } }));
        return true;
      case 'ac': case 'eq': return true;
      default:
        if (/^(tok|tpl|var):|^exp$/.test(a)) {
          this.editor = new Editor(this.math);
          return this.handleEdit(a);
        }
        return !/^(menu|setup|reset|qr)$/.test(a);
    }
  }

  get math() { return this.calc.setup.io === 'mm' || this.calc.setup.io === 'md'; }

  safeRecalc() {
    try { this.recalc(); } catch (e) { this.fail(e); }
  }

  handleEdit(a) {
    const ed = this.editor;
    switch (a) {
      case 'eq':
        try {
          if (!ed.isEmpty()) this.store(this.r, this.c, Editor.clone(ed.root));
          this.editor = null;
          this.move(1, 0);
        } catch (e) { this.fail(e); }
        return true;
      case 'ac': this.editor = null; return true;
      case 'del': ed.del(); return true;
      case 'left': ed.left(); return true;
      case 'right': ed.right(); return true;
      case 'up': case 'down': ed.vertical(a); return true;
      case 'exp': if (this.math) ed.insertTemplate('e10'); else ed.insert('E'); return true;
      case 'optn': this.calc.push(this.editOptn()); return true;
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

  handleGrab(a) {
    const g = this.grab;
    switch (a) {
      case 'up': this.move(-1, 0, g); return true;
      case 'down': this.move(1, 0, g); return true;
      case 'left': this.move(0, -1, g); return true;
      case 'right': this.move(0, 1, g); return true;
      case 'eq':
        this.editor.insert(`v${COLS[g.c]}`);
        for (const d of String(g.r + 1)) this.editor.insert(d);
        this.grab = null;
        this.move(0, 0);
        return true;
      case 'ac': this.grab = null; this.move(0, 0); return true;
      default: return true;
    }
  }

  doPaste() {
    const [fr, fc] = this.paste.from;
    const src = this.cells[name(fc, fr)];
    const key = name(this.c, this.r);
    if (!src) delete this.cells[key];
    else if (this.paste.mode === 'cut') {
      this.cells[key] = { ...src }; // cells are replaced, never edited in place, so a shallow copy suffices
      delete this.cells[name(fc, fr)];
      this.paste = null;
    } else {
      this.cells[key] = src.formula ? { formula: shiftRefs(src.formula, this.r - fr, this.c - fc), value: null } : { ...src };
    }
    if (this.used() > CAPACITY) { delete this.cells[key]; this.fail(new CalcError(ERR.MEMORY)); return true; }
    this.safeRecalc();
    return true;
  }

  // ------------------------------------------------------------ OPTN

  cellOptn() {
    const calc = this.calc;
    const close = () => closeMenus(calc);
    return new Menu(calc, [
      page([
        item('Fill Formula', () => { close(); calc.push(new FillDialog(calc, this, true)); }),
        item('Fill Value', () => { close(); calc.push(new FillDialog(calc, this, false)); }),
        item('Edit Cell', () => {
          close();
          const cell = this.cells[name(this.c, this.r)];
          this.editor = new Editor(this.math);
          if (cell) this.editor.load(cell.formula ? [tok('='), ...cell.formula] : cell.nodes ?? []);
        }),
        item('Free Space', () => { close(); calc.push(new Message(calc, ['Free Space', `${CAPACITY - this.used()} Bytes`])); }),
      ]),
      page([
        item('Cut & Paste', () => { close(); this.paste = { mode: 'cut', from: [this.r, this.c] }; }),
        item('Copy & Paste', () => { close(); this.paste = { mode: 'copy', from: [this.r, this.c] }; }),
        item('Delete All', () => { close(); this.calc.modeData.cells = {}; }),
        item('Recalculate', () => { close(); this.safeRecalc(); }),
      ]),
      commonOptnPage(calc, () => {}),
    ]);
  }

  editOptn() {
    const calc = this.calc;
    const ins = (id) => () => { closeMenus(calc); this.editor.insert(id); };
    return new Menu(calc, [
      page([
        item('$', ins('$')),
        item('Grab', () => { closeMenus(calc); this.grab = { r: this.r, c: this.c }; }),
      ]),
      page([item('Min', ins('Min(')), item('Max', ins('Max(')), item('Mean', ins('Mean(')), item('Sum', ins('Sum('))]),
      commonOptnPage(calc, (x) => this.handleEdit(x)),
    ]);
  }

  // ------------------------------------------------------------ view

  view() {
    const el = h('div', 'grid-screen');
    const table = h('table');
    const visCols = [0, 1, 2, 3].map((k) => this.left + k);
    table.append(h('tr', null, h('th', null, ''), visCols.map((c) => h('th', null, COLS[c]))));
    const hl = this.grab ?? this;
    for (let r = this.top; r < this.top + 4; r++) {
      const tr = h('tr', null, h('td', 'rowno', String(r + 1)));
      for (const c of visCols) {
        const cell = this.cells[name(c, r)];
        const text = cell ? (cell.value === 'ERROR' ? 'ERROR' : cell.value ? cellText(cell.value, 7) : '') : '';
        const td = h('td', `cell${r === hl.r && c === hl.c ? ' sel' : ''}`, text);
        td.style.width = 'calc(var(--lp) * 42)';
        tr.append(td);
      }
      table.append(tr);
    }
    el.append(table);
    const footer = h('div', `footer${this.editor && !this.grab ? ' edit' : ''}`);
    if (this.grab) footer.append('Set:[=]');
    else if (this.editor) footer.append(renderNodes(this.editor.root, { math: this.math, cursor: this.editor.cursor(), cursorState: {} }));
    else {
      const cell = this.cells[name(this.c, this.r)];
      if (cell?.formula && this.calc.setup.sheetShowCell === 'formula') footer.append('=', renderNodes(cell.formula, { math: this.math, cursor: null }));
      else if (cell?.value === 'ERROR') footer.append('ERROR');
      else if (cell?.value) footer.append(renderModel(this.calc.model(cell.value, {}), {}));
    }
    el.append(footer);
    return { el, status: { noMath: !this.editor, sto: this.stoPending } };
  }
}

/** Fill Formula / Fill Value dialog: a "Form"/"Value" line and a "Range" line such as B1:B3. */
class FillDialog {
  constructor(calc, sheet, formula) {
    this.calc = calc;
    this.sheet = sheet;
    this.formula = formula;
    this.line = 0;
    this.value = new Editor(false);
    this.range = new Editor(false);
    const here = name(sheet.c, sheet.r);
    for (const id of [`v${here[0]}`, ...here.slice(1), ':', `v${here[0]}`, ...here.slice(1)]) this.range.insert(id);
  }

  handle(ev) {
    const a = ev.action || '';
    const ed = this.line === 0 ? this.value : this.range;
    switch (a) {
      case 'up': case 'down': this.line = 1 - this.line; return true;
      case 'ac': this.calc.pop(); return true;
      case 'del': ed.del(); return true;
      case 'left': ed.left(); return true;
      case 'right': ed.right(); return true;
      case 'eq':
        if (this.line === 0) { this.line = 1; return true; }
        return this.apply();
      default: {
        const m = /^(tok|var):(.*)$/.exec(a);
        if (m) ed.insert(m[1] === 'var' ? `v${m[2]}` : m[2]);
        return true;
      }
    }
  }

  apply() {
    const text = this.range.root.map((nd) => tokenInfo(nd.id).text).join('');
    const m = /^([A-E])(\d+):([A-E])(\d+)$/.exec(text);
    const bad = () => this.sheet.fail(new CalcError(ERR.RANGE));
    if (!m) return bad(), true;
    const [c1, c2] = [COLS.indexOf(m[1]), COLS.indexOf(m[3])].sort((x, y) => x - y);
    const [r1, r2] = [+m[2], +m[4]].sort((x, y) => x - y);
    if (r1 < 1 || r2 > ROWS) return bad(), true;
    const base = this.value.root.filter((nd, i) => !(i === 0 && nd.id === '='));
    try {
      for (let c = c1; c <= c2; c++) {
        for (let r = r1; r <= r2; r++) {
          const nodes = shiftRefs(base, r - r1, c - c1);
          this.sheet.store(r - 1, c, this.formula ? [tok('='), ...nodes] : nodes);
        }
      }
    } catch (e) {
      this.calc.pop();
      this.sheet.fail(e);
      return true;
    }
    this.calc.pop();
    return true;
  }

  view() {
    const row = (label, ed, sel) => {
      const r = h('div', `row${sel ? ' inv' : ''}`, h('span', null, `${label.padEnd(6, ' ')}:`));
      const v = h('span', 'v', renderNodes(ed.root, { math: false, cursor: sel ? ed.cursor() : null, cursorState: {} }));
      v.style.marginRight = 'auto';
      r.append(v);
      return r;
    };
    const el = h('div', 'kv', h('div', 'row', h('span', 'title', this.formula ? 'Fill Formula' : 'Fill Value')),
      row(this.formula ? 'Form' : 'Value', this.value, this.line === 0), row('Range', this.range, this.line === 1));
    return { el, status: { noMath: true } };
  }
}
