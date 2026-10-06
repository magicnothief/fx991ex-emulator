// Parameter input lists ("x :0", "σ :1", …) and scrollable result lists.
import { Editor } from '../../core/editor.js';
import { parseStatements } from '../../core/parser.js';
import { evaluate } from '../../core/evaluator.js';
import { CalcError } from '../../core/errors.js';
import * as V from '../../core/values.js';
import { h, renderNodes, renderModel } from '../../ui/render.js';
import { ErrorScreen } from './common.js';
import { LINE_TEMPLATE } from './calcscreen.js';
import { t } from '../i18n.js';

/**
 * opts: { title, params: [{ key, label }], values: { key: Num }, onEq(), onAC(), onOptn() }
 * Typing edits the highlighted parameter; = stores it and moves down; = without input runs onEq.
 */
export class ParamScreen {
  constructor(calc, opts) {
    this.calc = calc;
    this.opts = opts;
    this.i = 0;
    this.top = 0;
    this.editor = null;
  }

  get visible() { return this.opts.title ? 3 : 4; }

  move(d) {
    const n = this.opts.params.length;
    this.i = (this.i + d + n) % n;
    if (this.i < this.top) this.top = this.i;
    if (this.i >= this.top + this.visible) this.top = this.i - this.visible + 1;
  }

  handle(ev) {
    const a = ev.action || '';
    if (a === 'eq') {
      if (this.editor && !this.editor.isEmpty()) {
        try {
          const v = V.real(evaluate(parseStatements(this.editor.root)[0], this.calc.ctx()));
          this.opts.values[this.opts.params[this.i].key] = v;
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
          this.calc.push(new ErrorScreen(this.calc, e.kind, { onCancel: () => { this.editor = null; }, onGoto: () => {} }));
          return true;
        }
        this.editor = null;
        if (this.i < this.opts.params.length - 1) this.move(1);
        return true;
      }
      this.editor = null;
      this.opts.onEq?.(this);
      return true;
    }
    if (a === 'ac') {
      if (this.editor) this.editor = null;
      else this.opts.onAC?.(this);
      return true;
    }
    if (a === 'optn') { this.opts.onOptn?.(this); return true; }
    if (a === 'up' && !this.editor) { this.move(-1); return true; }
    if (a === 'down' && !this.editor) { this.move(1); return true; }
    if (this.editor && a === 'del') { this.editor.del(); return true; }
    if (this.editor && a === 'left') { this.editor.left(); return true; }
    if (this.editor && a === 'right') { this.editor.right(); return true; }
    const m = /^(tok|tpl|var):(.*)$/.exec(a);
    if (m || a === 'exp') {
      if (!this.editor) this.editor = new Editor(false);
      if (a === 'exp') this.editor.insert('E');
      else if (m[1] === 'tok') this.editor.insert(m[2]);
      else if (m[1] === 'var') this.editor.insert(`v${m[2]}`);
      else this.editor.insert(LINE_TEMPLATE[m[2]] ?? m[2]);
      return true;
    }
    return /^(menu|setup|reset|qr)$/.test(a) ? false : true;
  }

  view() {
    const { title, params, values } = this.opts;
    const el = h('div', 'kv');
    if (title) el.append(h('div', 'row', h('span', 'title', t(title))));
    params.slice(this.top, this.top + this.visible).forEach((p, j) => {
      const idx = this.top + j;
      const sel = idx === this.i;
      const row = h('div', `row${sel ? ' inv' : ''}`);
      row.append(h('span', null, `${t(p.label, this.opts.ctx).padEnd(5, ' ')}:`));
      const val = h('span', 'v');
      if (sel && this.editor) {
        val.append(renderNodes(this.editor.root, { math: false, cursor: this.editor.cursor(), cursorState: {} }));
        val.style.marginRight = 'auto';
      } else {
        const v = values[p.key];
        val.append(renderModel(this.calc.model(v, { form: 'dec' }), { line: true }));
        val.style.marginRight = 'auto';
      }
      row.append(val);
      el.append(row);
    });
    return { el, status: { noMath: true } };
  }
}

/** A scrollable list of "label = value" rows. rows: [{ label, value }] */
export class ListScreen {
  /** dense: small font with six rows per screen, as the statistics result lists use */
  constructor(calc, rows, { title = null, onClose = null, onEq = null, dense = false } = {}) {
    this.calc = calc;
    this.rows = rows;
    this.title = title;
    this.top = 0;
    this.onClose = onClose;
    this.onEq = onEq;
    this.dense = dense;
  }

  get visible() { return (this.dense ? 6 : 4) - (this.title ? 1 : 0); }

  handle(ev) {
    const vis = this.visible;
    switch (ev.action) {
      case 'up': this.top = Math.max(0, this.top - (this.dense ? vis : 1)); break;
      case 'down':
        this.top = this.dense
          ? Math.min(Math.floor((this.rows.length - 1) / vis) * vis, this.top + vis)
          : Math.min(Math.max(0, this.rows.length - vis), this.top + 1);
        break;
      case 'ac': this.calc.pop(); this.onClose?.(); break;
      case 'eq': if (this.onEq) this.onEq(); else { this.calc.pop(); this.onClose?.(); } break;
      default: return /^(menu|setup|reset|qr)$/.test(ev.action || '') ? false : true;
    }
    return true;
  }

  view() {
    const vis = this.visible;
    const el = h('div', `kv${this.dense ? ' dense' : ''}`);
    if (this.title) el.append(h('div', 'row', t(this.title)));
    for (const r of this.rows.slice(this.top, this.top + vis)) {
      let v;
      try {
        v = typeof r.value === 'function' ? r.value() : r.value;
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        v = null;
      }
      const val = v == null ? 'ERROR' : typeof v === 'string' ? v : renderModel(this.calc.model(v, { form: 'dec' }), { line: true });
      el.append(h('div', 'row list-row', h('span', 'lbl', r.label), h('span', 'v', '=', val)));
    }
    if (this.rows.length > vis) {
      const bar = h('div', 'scrollbar');
      bar.style.top = `${(this.top / this.rows.length) * 100}%`;
      bar.style.height = `${(vis / this.rows.length) * 100}%`;
      el.append(bar);
    }
    return { el, status: { noMath: true } };
  }
}
