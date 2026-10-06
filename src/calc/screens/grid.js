// Generic cell editor: Matrix/Vector editors, Statistics editor, Distribution list, Table,
// coefficient editors and the Spreadsheet all use it.
import { Editor } from '../../core/editor.js';
import { parseStatements } from '../../core/parser.js';
import { evaluate } from '../../core/evaluator.js';
import { CalcError, ERR } from '../../core/errors.js';
import { formatDecimal, modelText } from '../../core/format.js';
import Decimal from '../../core/decimal.js';
import * as V from '../../core/values.js';
import { h, renderNodes, renderModel } from '../../ui/render.js';
import { ErrorScreen } from './common.js';
import { LINE_TEMPLATE } from './calcscreen.js';

/**
 * Short text for a value in a narrow cell. Digits that do not fit are cut off, not rounded
 * (User's Guide, Binomial PD list: 0.126776… is shown as 0.1267).
 */
export function cellText(v, maxChars = 7) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (V.isCx(v)) return 'cplx';
  for (let sd = 10; sd >= 1; sd--) {
    const m = formatDecimal(v.d.toSD(sd, Decimal.ROUND_DOWN), { mode: 'norm', digits: 1 });
    const t = modelText(m).replace('×10^', 'E');
    if (t.length <= maxChars) return t;
  }
  for (let k = 6; k >= 0; k--) {
    const t = v.d.toExponential(k, Decimal.ROUND_DOWN).replace('e+', 'E').replace('e-', 'E-');
    if (t.length <= maxChars) return t;
  }
  return '…';
}

const LP_PER_CHAR = 4.3;

export class GridScreen {
  constructor(calc, spec) {
    this.calc = calc;
    this.spec = { visibleRows: 4, advance: 'down', rowNumbers: true, ...spec };
    this.r = 0;
    this.c = 0;
    this.top = 0;
    this.editor = null;
  }

  get rows() { return Math.min(this.spec.maxRows ?? this.spec.rowCount(), Math.max(this.spec.rowCount() + (this.spec.growable ? 1 : 0), 1)); }

  move(dr, dc) {
    const cols = this.spec.cols.length;
    this.c = Math.min(cols - 1, Math.max(0, this.c + dc));
    const rows = this.rows;
    let r = this.r + dr;
    if (this.spec.wrap) r = (r + rows) % rows;
    this.r = Math.min(rows - 1, Math.max(0, r));
    const vis = this.spec.visibleRows;
    if (this.r < this.top) this.top = this.r;
    if (this.r >= this.top + vis) this.top = this.r - vis + 1;
    this.spec.onMove?.(this.r, this.c);
  }

  startEdit() {
    this.editor = new Editor(this.calc.setup.io === 'mm' || this.calc.setup.io === 'md');
  }

  handle(ev) {
    const a = ev.action || '';
    if (this.editor) {
      if (a === 'eq' || (a === 'down' || a === 'up') && this.spec.commitOnArrow) return this.commit(a);
      if (a === 'ac') { this.editor = null; return true; }
      if (a === 'del') { this.editor.del(); return true; }
      if (a === 'left') { this.editor.left(); return true; }
      if (a === 'right') { this.editor.right(); return true; }
      if (a === 'up' || a === 'down') { if (!this.editor.vertical(a)) return this.commit('eq'); return true; }
      if (this.insert(a)) return true;
      return a === 'optn' ? this.spec.onOptn?.(this) ?? true : false;
    }
    switch (a) {
      case 'up': this.move(-1, 0); return true;
      case 'down': this.move(1, 0); return true;
      case 'left': this.move(0, -1); return true;
      case 'right': this.move(0, 1); return true;
      case 'eq': return this.spec.onEq ? (this.spec.onEq(this), true) : true;
      case 'ac': return this.spec.onAC ? (this.spec.onAC(this), true) : true;
      case 'optn': return this.spec.onOptn ? (this.spec.onOptn(this), true) : true;
      case 'del': this.spec.del?.(this.r, this.c, this); this.move(0, 0); return true;
      case 'sto': return this.spec.onSto ? (this.spec.onSto(this), true) : true;
      default: {
        const canEdit = !this.spec.readOnly && (!this.spec.editable || this.spec.editable(this.r, this.c));
        if (canEdit && /^(tok|tpl|var|hex):|^exp$/.test(a)) {
          this.startEdit();
          return this.insert(a);
        }
        return !/^(menu|setup|reset|qr)$/.test(a); // global keys fall through to the calculator
      }
    }
  }

  insert(a) {
    const ed = this.editor;
    if (a === 'exp') { if (ed.math) ed.insertTemplate('e10'); else ed.insert('E'); return true; }
    const m = /^(tok|tpl|var|hex):(.*)$/.exec(a);
    if (!m) return false;
    const [, kind, id] = m;
    if (kind === 'tok') ed.insert(id);
    else if (kind === 'var') ed.insert(`v${id}`);
    else if (kind === 'hex') ed.insert(`h${id}`);
    else if (ed.math) ed.insertTemplate(id);
    else ed.insert(LINE_TEMPLATE[id] ?? id);
    return true;
  }

  commit(dir) {
    const nodes = this.editor.root;
    if (nodes.length === 0) { this.editor = null; return true; }
    try {
      const value = this.spec.evaluate ? this.spec.evaluate(nodes, this.r, this.c) : evaluate(parseStatements(nodes)[0], this.calc.ctx());
      if (V.isMat(value) || V.isVec(value) || value.pair) throw new CalcError(ERR.MATH);
      this.spec.set(this.r, this.c, value, nodes, this);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      const keep = this.editor;
      this.calc.push(new ErrorScreen(this.calc, e.kind, { onCancel: () => { this.editor = null; }, onGoto: () => { this.editor = keep; } }));
      return true;
    }
    this.editor = null;
    if (dir === 'up') this.move(-1, 0);
    else if (this.spec.advance === 'right') {
      if (this.c < this.spec.cols.length - 1) this.move(0, 1);
      else if (this.r < this.rows - 1) { this.c = 0; this.move(1, 0); }
    } else this.move(1, 0);
    return true;
  }

  /** Bracketed layout used by the Matrix and Vector editors ("MatA=" followed by the matrix). */
  matrixView() {
    const spec = this.spec;
    const el = h('div', 'grid-screen');
    el.append(h('div', 'mat-title', spec.title));
    const table = h('table');
    for (let r = this.top; r < Math.min(this.rows, this.top + spec.visibleRows); r++) {
      table.append(h('tr', null, spec.cols.map((col, c) => {
        const td = h('td', r === this.r && c === this.c ? 'sel' : null, cellText(spec.get(r, c), Math.floor(col.width / LP_PER_CHAR)));
        td.style.width = `calc(var(--lp) * ${col.width})`;
        return td;
      })));
    }
    el.append(h('div', 'matrix', h('div', 'br l'), table, h('div', 'br r')));
    const footer = h('div', `footer${this.editor ? ' edit' : ''}`);
    if (this.editor) footer.append(renderNodes(this.editor.root, { math: this.editor.math, cursor: this.editor.cursor(), cursorState: {} }));
    else footer.append(renderModel(this.calc.model(spec.get(this.r, this.c), {}), {}));
    el.append(footer);
    return { el, status: { noMath: !this.editor, up: this.top > 0, down: this.top + spec.visibleRows < this.rows } };
  }

  view() {
    const spec = this.spec;
    if (spec.matrix) return this.matrixView();
    const el = h('div', 'grid-screen');
    const table = h('table');
    if (spec.header !== false) {
      const head = h('tr', null, spec.rowNumbers ? h('th', null, '') : null, spec.cols.map((c) => h('th', null, c.label)));
      table.append(head);
    }
    const rows = this.rows;
    for (let r = this.top; r < Math.min(rows, this.top + spec.visibleRows); r++) {
      const tr = h('tr', null);
      if (spec.rowNumbers) tr.append(h('td', 'rowno', String(r + 1)));
      spec.cols.forEach((col, c) => {
        const v = r < spec.rowCount() ? spec.get(r, c) : null;
        const td = h('td', `cell${r === this.r && c === this.c ? ' sel' : ''}`, cellText(v, Math.floor(col.width / LP_PER_CHAR)));
        td.style.width = `calc(var(--lp) * ${col.width})`;
        tr.append(td);
      });
      table.append(tr);
    }
    el.append(table);
    if (spec.side) el.append(spec.side());
    const footer = h('div', `footer${this.editor ? ' edit' : ''}`);
    if (this.editor) {
      footer.append(renderNodes(this.editor.root, { math: this.editor.math, cursor: this.editor.cursor(), cursorState: {} }));
    } else {
      const v = this.r < spec.rowCount() ? spec.get(this.r, this.c) : null;
      const custom = spec.footer?.(this.r, this.c);
      if (custom) footer.append(custom);
      else if (v && typeof v !== 'string') footer.append(renderModel(this.calc.model(v, {}), {}));
      else if (typeof v === 'string') footer.append(v);
    }
    el.append(footer);
    return { el, status: { noMath: !this.editor } };
  }
}
