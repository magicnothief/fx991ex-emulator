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
import { t } from '../i18n.js';
import { editorBox, modelBox, textBox, drawBox } from '../../ui/mathbox.js';

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
    const text = modelText(m, { decimalMark: ',' }).replace('×10^', 'E');
    if (text.length <= maxChars) return text;
  }
  for (let k = 6; k >= 0; k--) {
    const text = v.d.toExponential(k, Decimal.ROUND_DOWN).replace('.', ',').replace('e+', 'E').replace('e-', 'E-');
    if (text.length <= maxChars) return text;
  }
  return '…';
}

// Cells show at most six characters (sin x table: 0,7853 for 0,7853981634)
const CELL_CHARS = 6;

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

  // ------------------------------------------------------------ pixel display

  /**
   * Table layout of the calculator (User's Guide screenshots): a 19-px row-number column and 42-px
   * columns separated by vertical lines, tiny-font cells on a 10-px pitch under a header line, the
   * selected cell inverted, and the full value (or the input) on the bottom line in the main font.
   */
  paint(lcd) {
    const spec = this.spec;
    if (spec.matrix) return this.paintMatrix(lcd);
    const left = spec.rowNumbers ? 19 : 0;
    const colW = 42;
    const header = spec.header !== false;
    const first = header ? 17 : 8;
    const vis = spec.visibleRows;
    const bottom = first + (vis - 1) * 10 + 2;
    if (spec.rowNumbers) lcd.vline(left, 0, bottom);
    spec.cols.forEach((col, c) => {
      const x0 = left + c * colW;
      lcd.vline(x0 + colW, 0, bottom);
      if (header) {
        const label = t(col.label).replace(/x/g, '𝑥');
        lcd.text(label, x0 + 1 + Math.floor((colW - label.length * 6) / 2), 7, { font: 'T' });
      }
    });
    for (let i = 0; i < vis; i++) {
      const r = this.top + i;
      if (r >= this.rows) break;
      const base = first + i * 10;
      if (spec.rowNumbers) lcd.textRight(String(r + 1), left - 1, base, { font: 'T' });
      spec.cols.forEach((col, c) => {
        const x0 = left + c * colW;
        const v = r < spec.rowCount() ? spec.get(r, c) : null;
        const text = cellText(v, CELL_CHARS);
        if (text) lcd.textRight(text, x0 + colW - 1, base, { font: 'T' });
        if (r === this.r && c === this.c) lcd.invert(x0 + 1, base - 8, colW - 1, 10);
      });
    }
    if (spec.side) {
      const el = spec.side();
      const lines = el.children.length ? [...el.children].map((n) => n.textContent) : [el.textContent];
      lines.forEach((l, i) => lcd.text(l, left + spec.cols.length * colW + 3, first + i * 10, { font: 'S' }));
    }
    this.paintFooter(lcd);
    return { noMath: !this.editor, up: this.top > 0, down: this.top + vis < this.rows };
  }

  /** Bottom line: the input being typed (left), or the full value of the selected cell (right). */
  paintFooter(lcd) {
    const spec = this.spec;
    if (this.editor) {
      const b = editorBox(this.editor.root, { math: this.editor.math, cursor: this.editor.cursor(), cursorState: {} });
      drawBox(lcd, b, Math.min(0, 191 - b.w), Math.min(61, 62 - b.desc));
      return;
    }
    const v = this.r < spec.rowCount() ? spec.get(this.r, this.c) : null;
    const custom = spec.footer?.(this.r, this.c);
    let b = null;
    if (custom) b = textBox(custom.textContent ?? String(custom));
    else if (v && typeof v !== 'string') b = modelBox(this.calc.model(v, {}), { digitSep: this.calc.setup.digitSep });
    else if (typeof v === 'string') b = textBox(v);
    if (b) drawBox(lcd, b, Math.max(0, 192 - b.w), Math.min(61, 62 - b.desc));
  }

  /** Matrix and vector editors: the title, then the cells between brackets, the value at the bottom. */
  paintMatrix(lcd) {
    const spec = this.spec;
    lcd.text(spec.title, 0, 8, { font: 'S' });
    const cols = spec.cols.length;
    const colW = cols > 3 ? 40 : 44;
    const x0 = 10;
    const vis = spec.visibleRows;
    const shown = Math.min(vis, this.rows);
    const top = 12, bot = top + shown * 10 + 1;
    lcd.vline(x0 - 4, top, bot); lcd.hline(x0 - 4, x0 - 2, top); lcd.hline(x0 - 4, x0 - 2, bot);
    const xr = x0 + cols * colW + 2;
    lcd.vline(xr, top, bot); lcd.hline(xr - 2, xr, top); lcd.hline(xr - 2, xr, bot);
    for (let i = 0; i < shown; i++) {
      const r = this.top + i;
      const base = top + 9 + i * 10;
      spec.cols.forEach((col, c) => {
        const cx = x0 + c * colW;
        const text = cellText(spec.get(r, c), CELL_CHARS);
        lcd.textRight(text, cx + colW - 2, base, { font: 'T' });
        if (r === this.r && c === this.c) lcd.invert(cx, base - 8, colW - 1, 10);
      });
    }
    this.paintFooter(lcd);
    return { noMath: !this.editor, up: this.top > 0, down: this.top + vis < this.rows };
  }

  /** Bracketed layout used by the Matrix and Vector editors ("MatA=" followed by the matrix). */
  matrixView() {
    const spec = this.spec;
    const el = h('div', 'grid-screen');
    el.append(h('div', 'mat-title', spec.title));
    const table = h('table');
    for (let r = this.top; r < Math.min(this.rows, this.top + spec.visibleRows); r++) {
      table.append(h('tr', null, spec.cols.map((col, c) => {
        const td = h('td', r === this.r && c === this.c ? 'sel' : null, cellText(spec.get(r, c), CELL_CHARS));
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
      const head = h('tr', null, spec.rowNumbers ? h('th', null, '') : null, spec.cols.map((c) => h('th', null, t(c.label))));
      table.append(head);
    }
    const rows = this.rows;
    for (let r = this.top; r < Math.min(rows, this.top + spec.visibleRows); r++) {
      const tr = h('tr', null);
      if (spec.rowNumbers) tr.append(h('td', 'rowno', String(r + 1)));
      spec.cols.forEach((col, c) => {
        const v = r < spec.rowCount() ? spec.get(r, c) : null;
        const td = h('td', `cell${r === this.r && c === this.c ? ' sel' : ''}`, cellText(v, CELL_CHARS));
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
