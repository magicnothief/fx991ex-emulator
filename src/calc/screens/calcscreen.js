// The calculation screen used by Calculate, Complex, Base-N, Matrix, Vector and Statistics modes.
import { Editor, tok, tpl } from '../../core/editor.js';
import { parseStatements, parseEquation, variablesOf } from '../../core/parser.js';
import { evaluate, evalAt } from '../../core/evaluator.js';
import { CalcError, ERR } from '../../core/errors.js';
import { engExponent, factModel, hasAlternateForm, formatReal, modelText } from '../../core/format.js';
import { tokenInfo } from '../../core/tokens.js';
import { factorize } from '../../core/rational.js';
import { solveNewton } from '../../core/numerics.js';
import * as N from '../../core/num.js';
import * as V from '../../core/values.js';
import { h, renderNodes, renderModel } from '../../ui/render.js';
import { LCD, chars, LINES, SMALL_LINES } from '../../ui/lcd.js';
import { editorBox, modelBox, textBox, row, drawBox } from '../../ui/mathbox.js';
import { VARIABLE_KEYS } from '../keymap.js';
import { ErrorScreen } from './common.js';
import { atomicMenu } from './atomic.js';

// Keys that continue from the previous result with "Ans".
const CONTINUES = new Set(['tok:+', 'tok:-', 'tok:×', 'tok:÷', 'tok:²', 'tok:³', 'tok:⁻¹', 'tok:!', 'tok:%', 'tok:P', 'tok:C',
  'tpl:pow', 'tpl:frac', 'tok:and', 'tok:or', 'tok:xor', 'tok:xnor', 'tok:•', 'tok:x̂', 'tok:ŷ', 'tok:x̂1', 'tok:x̂2', 'tok:►t']);

const LINE_TEMPLATE = { frac: '⌟', mixed: '⌟', sqrt: '√(', cbrt: '∛(', root: 'xroot(', pow: '^(', pow10: '10^(', exp: 'e^(', logab: 'log(', abs: 'Abs(', int: '∫(', diff: 'd/dx(', sum: 'Σ(' };

export class CalcScreen {
  /** hooks: { optn(screen), onMatrix(value), onVector(value), solve: bool } */
  constructor(calc, hooks = {}) {
    this.calc = calc;
    this.hooks = hooks;
    this.editor = new Editor(this.math);
    this.phase = 'input';
    this.result = null;
    this.history = [];
    this.hist = -1;
    this.undoSnap = null;
    this.calcVars = null; // active CALC session
  }

  get math() { return this.calc.setup.io === 'mm' || this.calc.setup.io === 'md'; }

  /** Changing Input/Output clears the calculation history. */
  onSetup(what) {
    if (what !== 'io') return;
    this.history = [];
    this.clear();
  }

  // ------------------------------------------------------------ key handling

  handle(ev) {
    const a = ev.action;
    if (this.stoPending) return this.handleSto(ev);
    switch (a) {
      case 'ac': return this.clear();
      case 'eq': return this.execute(false);
      case 'approx': return this.execute(true);
      case 'left': case 'right': return this.moveH(a);
      case 'up': case 'down': return this.moveV(a);
      case 'del': return this.edit(() => (this.phase === 'result' ? this.beginEdit(false) : this.editor.del()));
      case 'ins':
        if (this.phase === 'result') this.beginEdit(false);
        if (this.math) this.editor.insArmed = !this.editor.insArmed;
        else this.editor.overwrite = !this.editor.overwrite;
        return true;
      case 'undo':
        if (this.math && this.undoSnap) {
          const cur = this.editor.snapshot();
          this.editor.restore(this.undoSnap);
          this.undoSnap = cur;
          this.phase = 'input';
        }
        return true;
      case 'sto': this.stoPending = true; return true;
      case 'recall': this.calc.push(new RecallScreen(this.calc, this)); return true;
      case 'm+': case 'm-': return this.memoryAdd(a === 'm+');
      case 'calc': return this.startCalc();
      case 'solve': return this.startSolve();
      case 'optn': if (this.hooks.optn) this.calc.push(this.hooks.optn(this)); return true;
      case 'const': this.calc.push(this.calc.modes.$menus.constMenu(this.calc, (id) => this.apply(id))); return true;
      case 'atomic':
        // atomic weights can be used in every mode except Base-N
        if (this.calc.mode !== 'base') this.calc.push(atomicMenu(this.calc, (id) => this.apply(id)));
        return true;
      case 'conv': this.calc.push(this.calc.modes.$menus.convMenu(this.calc, (id) => this.apply(id))); return true;
      case 'sd': case 'mixed': case 'eng': case 'engleft': case 'fact': return this.resultToggle(a);
      case 'dms': return this.phase === 'result' ? this.resultToggle(a) : this.apply('tok:dms');
      case 'exp': return this.apply(this.math ? 'tpl:e10' : 'tok:E');
      default:
        if (a && a.startsWith('base:')) return this.setBase(a.slice(5));
        if (a && /^(tok|tpl|var|hex):/.test(a)) return this.apply(a);
        return false;
    }
  }

  /** Inserts a token/template/variable, starting a new calculation if a result is shown. */
  apply(action) {
    if (this.phase === 'result') {
      const cont = CONTINUES.has(action) || action.startsWith('tok:conv|') || action.startsWith('tok:eng');
      this.editor = new Editor(this.math, cont ? [tok('Ans')] : []);
      this.phase = 'input';
      this.result = null;
      this.hist = -1;
      this.calcVars = null;
    }
    return this.edit(() => {
      const [kind, id] = [action.slice(0, action.indexOf(':')), action.slice(action.indexOf(':') + 1)];
      if (kind === 'tok') this.editor.insert(id);
      else if (kind === 'var') this.editor.insert(`v${id}`);
      else if (kind === 'hex') this.editor.insert(`h${id}`);
      else if (kind === 'tpl') {
        // Matrix and Vector modes enter Abs as a function, Abs(MatB) (User's Guide pp.27, 29)
        const asFunction = id === 'abs' && (this.calc.mode === 'matrix' || this.calc.mode === 'vector');
        if (this.math && !asFunction) this.editor.insertTemplate(id);
        else this.editor.insert(LINE_TEMPLATE[id] ?? id);
      }
    });
  }

  edit(fn) {
    if (this.math) this.undoSnap = this.editor.snapshot();
    fn();
    return true;
  }

  clear() {
    this.editor = new Editor(this.math);
    this.phase = 'input';
    this.result = null;
    this.hist = -1;
    this.calcVars = null;
    this.stoPending = false;
    return true;
  }

  /** Replay: edit the expression of the displayed result (◀ → cursor at end, ▶ → start). */
  beginEdit(atStart) {
    const entry = this.hist >= 0 ? this.history[this.hist] : null;
    const nodes = entry ? entry.nodes : this.editor.root;
    this.editor = new Editor(this.math);
    this.editor.load(nodes, !atStart);
    this.phase = 'input';
    this.result = null;
    this.hist = -1;
    this.calcVars = null;
  }

  moveH(dir) {
    if (this.phase === 'result') {
      this.beginEdit(dir === 'right');
      return true;
    }
    if (dir === 'left') this.editor.left();
    else this.editor.right();
    return true;
  }

  moveV(dir) {
    if (this.phase === 'input' && this.math && this.editor.vertical(dir)) return true;
    if (this.history.length === 0) return true;
    if (this.phase === 'input' && !this.editor.isEmpty()) return true;
    let i = this.hist < 0 ? this.history.length - 1 : this.hist;
    if (this.phase === 'result' || this.hist >= 0) i += dir === 'up' ? -1 : 1;
    if (i < 0 || i >= this.history.length) return true;
    this.hist = i;
    const e = this.history[i];
    this.editor = new Editor(this.math, Editor.clone(e.nodes));
    this.phase = 'result';
    this.result = { value: e.value, view: { ...e.view }, label: e.label };
    return true;
  }

  // ------------------------------------------------------------ execution

  execute(approx) {
    if (this.phase === 'result' && this.calcVars) return this.startCalc();
    if (this.phase === 'result' && this.stmts && this.stmtIdx < this.stmts.length - 1) {
      return this.runStatement(this.stmtIdx + 1, approx);
    }
    if (this.editor.isEmpty()) return true;
    try {
      this.stmts = parseStatements(this.editor.root, { baseMode: this.calc.ctx().baseMode });
    } catch (e) {
      return this.fail(e);
    }
    if (this.hist >= 0) this.hist = -1;
    return this.runStatement(0, approx);
  }

  runStatement(i, approx) {
    this.stmtIdx = i;
    try {
      const st = this.stmts[i];
      if (st.t === 'eq') throw new CalcError(ERR.SYNTAX);
      let value = evaluate(st, this.calc.ctx());
      let view = { form: approx ? 'dec' : 'auto' };
      if (value.view) { view.polar = value.view === 'polar'; value = value.value; }
      this.showResult(value, view);
    } catch (e) {
      return this.fail(e);
    }
    return true;
  }

  showResult(value, view, label = null) {
    if (V.isMat(value) || V.isVec(value)) {
      const key = V.isMat(value) ? 'mats' : 'vcts';
      this.calc.mem[key].Ans = value;
      this.pushHistory(value, view, label);
      this.phase = 'result';
      this.result = { value, view, label };
      (V.isMat(value) ? this.hooks.onMatrix : this.hooks.onVector)?.(value, this);
      return;
    }
    if (value.pair) this.calc.setAns(value.values[0]);
    else this.calc.setAns(value);
    this.phase = 'result';
    this.result = { value, view, label };
    this.pushHistory(value, view, label);
  }

  pushHistory(value, view, label) {
    this.history.push({ nodes: Editor.clone(this.editor.root), value, view: { ...view }, label });
    if (this.history.length > 30) this.history.shift();
    this.hist = -1;
  }

  fail(e) {
    if (!(e instanceof CalcError)) {
      console.error(e);
      e = new CalcError(ERR.MATH);
    }
    const pos = e.pos;
    this.calc.push(new ErrorScreen(this.calc, e.kind, {
      onCancel: () => this.clear(),
      onGoto: () => {
        this.phase = 'input';
        this.result = null;
        this.editor.path = [];
        this.editor.idx = pos != null ? Math.min(pos, this.editor.root.length) : this.editor.root.length;
      },
    }));
    return true;
  }

  resultToggle(a) {
    if (this.phase !== 'result' || !this.result) return true;
    const { value } = this.result;
    if (value.pair || V.isMat(value) || V.isVec(value)) return true;
    const view = this.result.view;
    const real = V.isReal(value);
    switch (a) {
      case 'sd':
        if (this.calc.mode === 'base') return true;
        if (view.fact) { view.fact = false; return true; }
        if (view.dmsShown != null) { view.dmsShown = undefined; return true; }
        if (!real || hasAlternateForm(value, this.calc.setup) || view.form !== 'auto') {
          const exactNow = view.form === 'exact' || (view.form !== 'dec' && this.calc.model(value, view).t !== 'dec');
          view.form = exactNow ? 'dec' : 'exact';
        }
        view.eng = null;
        return true;
      case 'mixed':
        view.mixed = !(view.mixed ?? this.calc.setup.fracResult === 'mixed');
        return true;
      case 'eng': case 'engleft':
        if (!real || this.calc.mode === 'base') return true;
        if (view.eng == null) {
          // The first press shows the standard engineering form; when Engineer Symbol already shows
          // that form (1.024M), it moves straight on (User's Guide p.12: 1.024M → 1024k → 1024000).
          const base = engExponent(value.d);
          const alreadyEng = this.calc.setup.engSymbol && base !== 0 && this.calc.model(value, view).sym;
          view.eng = alreadyEng ? base : base + (a === 'eng' ? 3 : -3);
        }
        view.eng += a === 'eng' ? -3 : 3;
        return true;
      case 'dms':
        // °’” switches between sexagesimal and decimal (User's Guide p.11)
        if (!real) return true;
        view.dmsShown = !(view.dmsShown ?? value.dms);
        return true;
      case 'fact': {
        if (view.fact) { view.fact = false; return true; }
        if (!real || this.calc.mode !== 'calc') return true;
        const q = N.ratOf(value);
        if (!q || q.d !== 1n || q.n <= 0n || q.n >= 10n ** 10n) {
          this.fail(new CalcError(ERR.MATH));
          return true;
        }
        view.fact = true;
        return true;
      }
      default: return true;
    }
  }

  setBase(base) {
    this.calc.modeData.base = base;
    return true;
  }

  // ------------------------------------------------------------ memory

  handleSto(ev) {
    this.stoPending = false;
    const name = VARIABLE_KEYS[ev.key];
    if (!name) return true; // any other key cancels STO
    let value;
    if (this.phase === 'input' && !this.editor.isEmpty()) {
      this.execute(false);
      if (this.phase !== 'result') return true;
    }
    value = this.phase === 'result' ? this.result.value : this.calc.mem.ans;
    if (value.pair) value = value.values[0];
    if (V.isMat(value) || V.isVec(value)) return true;
    this.calc.mem.vars[name] = value;
    if (this.phase !== 'result') {
      this.editor = new Editor(this.math, [tok('Ans')]);
      this.phase = 'result';
    }
    this.result = { value, view: { form: 'auto' }, label: `→${name}` };
    return true;
  }

  memoryAdd(plus) {
    if (this.phase === 'input' && !this.editor.isEmpty()) {
      this.execute(false);
      if (this.phase !== 'result') return true;
    } else if (this.phase !== 'result') {
      this.editor = new Editor(this.math, [tok('Ans')]);
      this.phase = 'result';
      this.result = { value: this.calc.mem.ans, view: { form: 'auto' } };
    }
    const v = this.result.value;
    if (!V.isReal(v) && !V.isCx(v)) return true;
    try {
      const m = this.calc.mem.vars.M ?? N.ZERO;
      this.calc.mem.vars.M = plus ? V.add(m, v) : V.sub(m, v);
      this.result.label = plus ? 'M+' : 'M−';
    } catch (e) {
      this.fail(e);
    }
    return true;
  }

  // ------------------------------------------------------------ CALC and SOLVE

  startCalc() {
    if (this.calc.mode !== 'calc' && this.calc.mode !== 'cmplx') return true;
    const nodes = this.phase === 'result' && this.hist >= 0 ? this.history[this.hist].nodes : this.editor.root;
    if (nodes.length === 0) return true;
    let stmts;
    try {
      stmts = parseStatements(nodes);
    } catch (e) {
      return this.fail(e);
    }
    const vars = [];
    for (const st of stmts) {
      if (st.t === 'eq') { if (st.a.t !== 'var') return this.fail(new CalcError(ERR.SYNTAX)); variablesOf(st.b, vars); }
      else variablesOf(st, vars);
    }
    this.editor = new Editor(this.math, Editor.clone(nodes));
    this.phase = 'input';
    this.calc.push(new VarPrompt(this.calc, this, vars, () => this.runCalc(stmts)));
    return true;
  }

  runCalc(stmts) {
    try {
      let value;
      for (const st of stmts) {
        if (st.t === 'eq') {
          value = evaluate(st.b, this.calc.ctx());
          this.calc.mem.vars[st.a.name] = value;
        } else value = evaluate(st, this.calc.ctx());
      }
      this.showResult(value, { form: 'auto' });
      this.calcVars = true;
    } catch (e) {
      this.fail(e);
    }
  }

  startSolve() {
    if (!this.hooks.solve) return true;
    const nodes = this.editor.root;
    if (nodes.length === 0) return true;
    let eqn;
    try {
      eqn = parseEquation(nodes);
    } catch (e) {
      return this.fail(e);
    }
    const lhs = eqn.t === 'eq' ? eqn.a : eqn;
    const rhs = eqn.t === 'eq' ? eqn.b : { t: 'num', v: N.ZERO };
    const vars = variablesOf(rhs, variablesOf(lhs));
    if (vars.length === 0) return this.fail(new CalcError(ERR.VARIABLE));
    this.editor = new Editor(this.math, Editor.clone(nodes));
    this.phase = 'input';
    this.calc.push(new SolvePrompt(this.calc, this, { lhs, rhs, vars }));
    return true;
  }

  // ------------------------------------------------------------ view

  view() {
    const calc = this.calc;
    const el = h('div', null);
    const math = this.math;
    const exprArea = h('div', `expr-area${math ? '' : ' line'}`);
    const showCursor = this.phase === 'input';
    const cursorState = {
      overwrite: !math && this.editor.overwrite,
      block: this.editor.remaining() <= 10,
    };
    const exprNodes = this.editor.root;
    const content = renderNodes(exprNodes, { math, cursor: showCursor ? this.editor.cursor() : null, cursorState });
    const scroller = h('span', 'expr-scroll', content);
    if (this.result?.label) scroller.append(h('span', 'm-op', this.result.label));
    exprArea.append(scroller);
    el.append(exprArea);
    if (this.phase === 'result' && this.result) el.append(this.resultView());
    const status = {
      disp: this.phase === 'result' && this.stmts && this.stmtIdx < this.stmts.length - 1,
      up: this.history.length > 0 && (this.hist < 0 ? this.history.length > (this.phase === 'result' ? 1 : 0) : this.hist > 0),
      down: this.hist >= 0 && this.hist < this.history.length - 1,
      sto: this.stoPending,
    };
    return { el, status, after: () => keepCursorVisible(exprArea) };
  }

  /** Pixel display: input from the top-left, result right-aligned on the bottom line (rows 49–61). */
  paint(lcd) {
    if (this.calc.mode === 'base') return this.paintBase(lcd);
    const math = this.math;
    const cursorState = { overwrite: !math && this.editor.overwrite, block: this.editor.remaining() <= 10 };
    const cursor = this.phase === 'input' ? this.editor.cursor() : null;
    if (math) {
      const parts = [editorBox(this.editor.root, { math, cursor, cursorState })];
      if (this.result?.label) parts.push(textBox(this.result.label));
      const expr = row(parts);
      this.scrollX = scrollFor(expr, this.scrollX ?? 0, lcd);
      const base = 1 + expr.asc;
      drawBox(lcd, expr, -this.scrollX, base);
      if (this.scrollX > 0) lcd.status.left = true;
      if (expr.w - this.scrollX > 191) lcd.status.right = true;
    } else {
      paintLine(lcd, this.editor.root, cursor, cursorState, this.result?.label);
    }
    if (this.phase === 'result' && this.result) this.paintResult(lcd);
    return {
      disp: this.phase === 'result' && this.stmts && this.stmtIdx < this.stmts.length - 1,
      up: this.history.length > 0 && (this.hist < 0 ? this.history.length > (this.phase === 'result' ? 1 : 0) : this.hist > 0),
      down: this.hist >= 0 && this.hist < this.history.length - 1,
      sto: this.stoPending,
    };
  }

  /**
   * Base-N (User's Guide, BIN example): the active base "[Bin]" on the first line, the input on the second,
   * the result right-aligned on the third (BIN: 32 bits on the third and fourth lines, in groups of four).
   */
  paintBase(lcd) {
    const base = this.calc.modeData.base || 'dec';
    lcd.text(`[${BASE_NAMES[base]}]`, 0, 12);
    const cursor = this.phase === 'input' ? this.editor.cursor() : null;
    const expr = editorBox(this.editor.root, { math: false, cursor, cursorState: { overwrite: this.editor.overwrite, block: this.editor.remaining() <= 10 } });
    drawBox(lcd, expr, Math.min(0, 191 - expr.w), 26);
    if (this.phase === 'result' && this.result) {
      const { value } = this.result;
      if (value.pair || V.isMat(value) || V.isVec(value) || V.isCx(value)) this.paintResult(lcd);
      else {
        baseLines(value, base).forEach((l, i) => {
          if (base !== 'bin') { lcd.textRight(l, 192, 40); return; }
          // four groups of four digits, 5 px between the groups (fills the 192-pixel line)
          for (let gI = 0; gI < 4; gI++) lcd.text(l.slice(gI * 4, gI * 4 + 4), 2 + gI * 49, 40 + i * 14, { log: false });
          lcd.note(l.replace(/(.{4})(?=.)/g, '$1 '), 0, 40 + i * 14);
        });
      }
    }
    return {
      noMath: true,
      disp: this.phase === 'result' && this.stmts && this.stmtIdx < this.stmts.length - 1,
      up: this.history.length > 0 && (this.hist < 0 ? this.history.length > (this.phase === 'result' ? 1 : 0) : this.hist > 0),
      down: this.hist >= 0 && this.hist < this.history.length - 1,
      sto: this.stoPending,
    };
  }

  paintResult(lcd) {
    const { value, view } = this.result;
    const opts = { line: !this.math, digitSep: this.calc.setup.digitSep };
    const result = (b) => {
      const base = Math.min(61, 62 - b.desc);
      drawBox(lcd, b, Math.max(0, 192 - b.w), base);
    };
    const model = (m) => (this.math ? modelBox(m, opts) : textBox(modelText(m, { decimalMark: ',', digitSep: opts.digitSep })));
    if (value.pair) {
      result(row(value.labels.flatMap((l, i) => [i ? textBox('; ') : null, textBox(l === 'x' || l === 'y' ? (l === 'x' ? '𝑥' : '𝑦') : l), textBox('='), model(this.calc.model(value.values[i], view))])));
      return;
    }
    if (V.isMat(value) || V.isVec(value)) { result(textBox(V.isMat(value) ? 'MatAns' : 'VctAns')); return; }
    if (this.calc.mode === 'base') {
      const lines = baseLines(value, this.calc.modeData.base || 'dec');
      lines.forEach((l, i) => lcd.textRight(l, 192, 61 - (lines.length - 1 - i) * 13));
      return;
    }
    result(model(this.resultModel()));
  }

  resultView() {
    const { value, view } = this.result;
    const line = !this.math;
    const area = h('div', `result-area${line ? ' line' : ''}`);
    const opts = { line, digitSep: this.calc.setup.digitSep };
    const sep = '; '; // results separator with a decimal comma (User's Guide HU p.16: r=2; θ=45)
    if (value.pair) {
      const parts = value.labels.flatMap((l, i) => [i ? sep : '', h('i', 'm-var', l), '=', renderModel(this.calc.model(value.values[i], view), opts)]);
      area.append(h('span', 'm-row', parts));
      return area;
    }
    if (V.isMat(value) || V.isVec(value)) {
      area.append(h('span', null, V.isMat(value) ? 'MatAns' : 'VctAns'));
      return area;
    }
    if (this.calc.mode === 'base') {
      area.append(baseView(value, this.calc.modeData.base || 'dec'));
      return area;
    }
    area.append(renderModel(this.resultModel(), opts));
    return area;
  }

  /** Display model of a single real or complex result, after FACT, °’” and other display toggles. */
  resultModel() {
    const { value, view } = this.result;
    if (view.fact) return factModel(factorize(N.ratOf(value).n));
    // °’” to decimal shows the decimal form (User's Guide p.11: 2°30'0" → 2.5)
    if (view.dmsShown != null) return this.calc.model({ ...value, dms: view.dmsShown }, { ...view, form: view.dmsShown ? 'auto' : 'dec' });
    return this.calc.model(value, view);
  }
}

function keepCursorVisible(area) {
  const cur = area.querySelector('.cursor');
  const inner = area.firstElementChild;
  if (!inner) return;
  if (area.classList.contains('line')) return;
  if (!cur) { area.scrollLeft = 0; return; }
  const ar = area.getBoundingClientRect();
  const cr = cur.getBoundingClientRect();
  if (cr.right > ar.right) area.scrollLeft += cr.right - ar.right + 4;
  else if (cr.left < ar.left) area.scrollLeft -= ar.left - cr.left + 4;
}

/** Horizontal scroll that keeps the cursor inside the 191 visible columns. */
function scrollFor(box, scroll, lcd) {
  if (box.w <= 191) return 0;
  const probe = new LCD();
  let cx = null;
  probe.cursorOn = true;
  const vline = probe.vline.bind(probe);
  probe.vline = (x, y0, y1) => { if (cx == null) cx = x; vline(x, y0, y1); };
  box.draw(probe, 0, 30);
  if (cx == null) return Math.min(scroll, box.w - 191);
  if (cx - scroll > 185) return cx - 185;
  if (cx - scroll < 6) return Math.max(0, cx - 6);
  return scroll;
}

/** Line input: 17 characters per line from the top; overwrite mode underlines the character it replaces. */
function paintLine(lcd, nodes, cursor, cursorState, label) {
  const glyphs = [];
  nodes.forEach((nd) => glyphs.push(...chars(tokenInfo(nd.id).text)));
  const cursorAt = cursor && cursor.slot === nodes ? glyphIndex(nodes, cursor.idx) : -1;
  if (label) glyphs.push(...chars(label));
  const per = 17;
  const lines = Math.max(1, Math.ceil((glyphs.length + (cursorAt === glyphs.length ? 1 : 0)) / per));
  const first = Math.max(0, lines - 3) * per; // the last three lines stay visible
  for (let i = first; i < glyphs.length; i++) {
    const k = i - first;
    lcd.glyph(glyphs[i], (k % per) * 11, 12 + Math.floor(k / per) * 13);
  }
  lcd.note(glyphs.join(''), 0, 12);
  if (cursorAt >= first && lcd.cursorOn) {
    const k = cursorAt - first;
    const x = (k % per) * 11, base = 12 + Math.floor(k / per) * 13;
    if (cursorState.overwrite && cursorAt < glyphs.length) lcd.hline(x, x + 9, base + 1);
    else if (cursorState.block) lcd.fill(x, base - 11, 10, 13);
    else lcd.vline(x, base - 11, base + 1);
  }
}

function glyphIndex(nodes, idx) {
  let n = 0;
  for (let i = 0; i < idx; i++) n += chars(tokenInfo(nodes[i].id).text).length;
  return n;
}

const BASE_NAMES = { dec: 'Dec', hex: 'Hex', bin: 'Bin', oct: 'Oct' };

function baseLines(value, base) {
  const n = BigInt(value.d.toFixed(0));
  const u = n < 0n ? n + 0x100000000n : n;
  if (base === 'dec') return [n.toString()];
  if (base === 'hex') return [u.toString(16).toUpperCase().padStart(8, '0')];
  if (base === 'oct') return [u.toString(8).padStart(11, '0')];
  // BIN: 32 bits as two lines of 16 digits (16 cells fit the 192-pixel line)
  const b = u.toString(2).padStart(32, '0');
  return [b.slice(0, 16), b.slice(16)];
}

/** Base-N result display: two's complement for HEX/BIN/OCT; BIN as two 16-bit lines. */
function baseView(value, base) {
  const n = BigInt(value.d.toFixed(0));
  const u = n < 0n ? n + 0x100000000n : n;
  let lines;
  if (base === 'dec') lines = [n.toString()];
  else if (base === 'hex') lines = [u.toString(16).toUpperCase().padStart(8, '0')];
  else if (base === 'oct') lines = [u.toString(8).padStart(11, '0')];
  else {
    const b = u.toString(2).padStart(32, '0').replace(/(.{4})/g, '$1 ').trim();
    lines = [b.slice(0, 19), b.slice(20)];
  }
  return h('div', null, lines.map((l) => h('div', null, l)));
}

// ---------------------------------------------------------------- RECALL

export class RecallScreen {
  constructor(calc, screen) {
    this.calc = calc;
    this.screen = screen;
    this.isMenu = true;
  }

  handle(ev) {
    const name = VARIABLE_KEYS[ev.key];
    if (name) {
      this.calc.pop();
      this.screen.apply(`var:${name}`);
    } else if (ev.action === 'ac') this.calc.pop();
    return true;
  }

  view() {
    // values on this screen always use Norm 1
    const setup = { ...this.calc.setup, numFormat: { mode: 'norm', digits: 1 } };
    const model = (v) => (V.isCx(v) ? this.calc.complexModel(v) : formatReal(v, setup, {}));
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y'];
    const rows = [];
    for (let i = 0; i < names.length; i += 2) {
      rows.push(h('div', 'row', names.slice(i, i + 2).map((n) => {
        const v = this.calc.mem.vars[n] ?? N.ZERO;
        return h('span', null, h(n === 'x' || n === 'y' ? 'i' : 'span', null, n), '=', renderModel(model(v), { line: true }));
      })));
    }
    const el = h('div', 'kv small', rows);
    el.style.setProperty('font-size', 'calc(var(--lp) * 7.6)');
    return { el };
  }

  /** RECALL: the variables in two small-font columns. */
  paint(lcd) {
    const setup = { ...this.calc.setup, numFormat: { mode: 'norm', digits: 1 } };
    const model = (v) => (V.isCx(v) ? this.calc.complexModel(v) : formatReal(v, setup, {}));
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y'];
    names.forEach((n, i) => {
      const v = this.calc.mem.vars[n] ?? N.ZERO;
      const label = n === 'x' ? '𝑥' : n === 'y' ? '𝑦' : n;
      lcd.text(`${label}=${modelText(model(v), { decimalMark: ',' })}`, (i % 2) * 97, SMALL_LINES[Math.floor(i / 2)], { font: 'S' });
    });
  }
}

// ---------------------------------------------------------------- CALC prompt

/** Prompts for each variable in turn ("A=0"), then calls onDone. */
class VarPrompt {
  constructor(calc, screen, vars, onDone) {
    this.calc = calc;
    this.screen = screen;
    this.vars = vars;
    this.i = 0;
    this.onDone = onDone;
    this.editor = null;
    if (vars.length === 0) queueMicrotask(() => { calc.pop(); onDone(); calc.onChange(); });
  }

  handle(ev) {
    const a = ev.action;
    if (a === 'ac') { this.calc.pop(); this.screen.clear(); return true; }
    if (a === 'eq') {
      if (this.editor && !this.editor.isEmpty()) {
        try {
          const v = evaluate(parseStatements(this.editor.root)[0], this.calc.ctx());
          this.calc.mem.vars[this.vars[this.i]] = v;
        } catch (e) {
          if (e instanceof CalcError) return true;
          throw e;
        }
      }
      this.editor = null;
      this.i++;
      if (this.i >= this.vars.length) {
        this.calc.pop();
        this.onDone();
      }
      return true;
    }
    if (a === 'up' && this.i > 0) { this.i--; this.editor = null; return true; }
    if (a === 'down' && this.i < this.vars.length - 1) { this.i++; this.editor = null; return true; }
    return inputInto(this, ev);
  }

  view() {
    const el = h('div', null);
    el.append(h('div', 'expr-area', h('span', 'expr-scroll', renderNodes(this.screen.editor.root, { math: this.screen.math, cursor: null }))));
    el.append(promptLine(this.calc, this.vars[this.i], this.editor));
    return { el };
  }

  paint(lcd) { paintPrompt(lcd, this.calc, this.screen, this.vars[this.i], this.editor); }
}

/** Shared value-entry handling for prompts: digits and functions go into a line editor. */
function inputInto(prompt, ev) {
  const a = ev.action || '';
  if (!/^(tok|tpl|var):/.test(a) && !['del', 'left', 'right', 'exp'].includes(a)) return true;
  if (!prompt.editor) prompt.editor = new Editor(false);
  const ed = prompt.editor;
  if (a === 'del') ed.del();
  else if (a === 'left') ed.left();
  else if (a === 'right') ed.right();
  else if (a === 'exp') ed.insert('E');
  else {
    const id = a.slice(a.indexOf(':') + 1);
    if (a.startsWith('var:')) ed.insert(`v${id}`);
    else if (a.startsWith('tpl:')) ed.insert(LINE_TEMPLATE[id] ?? id);
    else ed.insert(id);
  }
  return true;
}

/** CALC/SOLVE prompt: the expression on top; the bottom line "A=5" (or the input) inverted across the whole row. */
function paintPrompt(lcd, calc, screen, name, editor) {
  const expr = editorBox(screen.editor.root, { math: screen.math, cursor: null });
  drawBox(lcd, expr, 0, 1 + expr.asc);
  const label = name === 'x' ? '𝑥' : name === 'y' ? '𝑦' : name;
  const x = lcd.text(`${label}=`, 0, 61);
  if (editor) drawBox(lcd, editorBox(editor.root, { math: false, cursor: editor.cursor(), cursorState: {} }), x, 61);
  else {
    const v = calc.mem.vars[name] ?? N.ZERO;
    lcd.text(modelText(calc.model(v, { form: 'dec' }), { decimalMark: ',' }), x, 61);
  }
  lcd.invert(0, 49, 192, 14);
}

function promptLine(calc, name, editor) {
  const row = h('div', 'result-area inv');
  row.style.justifyContent = 'flex-start';
  row.style.height = 'calc(var(--lp) * 12)';
  row.style.alignItems = 'center';
  const label = h('span', null, h(name === 'x' || name === 'y' ? 'i' : 'span', null, name), '=');
  if (editor) {
    row.append(label, renderNodes(editor.root, { math: false, cursor: editor.cursor(), cursorState: {} }));
  } else {
    const v = calc.mem.vars[name] ?? N.ZERO;
    const val = h('span', null, renderModel(calc.model(v, { form: 'dec' }), { line: true }));
    val.style.marginLeft = 'auto';
    row.append(label, val);
  }
  return row;
}

// ---------------------------------------------------------------- SOLVE

class SolvePrompt {
  constructor(calc, screen, eqn) {
    this.calc = calc;
    this.screen = screen;
    this.eqn = eqn;
    this.i = 0;
    this.solveFor = eqn.vars.includes('x') ? 'x' : eqn.vars[0];
    this.i = eqn.vars.indexOf(this.solveFor);
    this.editor = null;
  }

  handle(ev) {
    const a = ev.action;
    const vars = this.eqn.vars;
    if (a === 'ac') { this.calc.pop(); this.screen.clear(); return true; }
    if (a === 'up') { this.i = (this.i - 1 + vars.length) % vars.length; this.editor = null; return true; }
    if (a === 'down') { this.i = (this.i + 1) % vars.length; this.editor = null; return true; }
    if (a === 'eq') {
      if (this.editor && !this.editor.isEmpty()) {
        try {
          this.calc.mem.vars[vars[this.i]] = V.real(evaluate(parseStatements(this.editor.root)[0], this.calc.ctx()));
        } catch (e) {
          if (!(e instanceof CalcError)) throw e;
        }
        this.editor = null;
        if (this.i < vars.length - 1) this.i++;
        return true;
      }
      this.solve(vars[this.i]);
      return true;
    }
    return inputInto(this, ev);
  }

  solve(name) {
    const ctx = this.calc.ctx();
    const { lhs, rhs } = this.eqn;
    const g = (x) => evalAt(lhs, ctx, name, x) - evalAt(rhs, ctx, name, x);
    const x0 = V.real(this.calc.mem.vars[name] ?? N.ZERO).d.toNumber();
    let r;
    try {
      r = solveNewton(g, x0);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      r = { converged: false };
    }
    if (!r.converged) {
      this.calc.push(new ErrorScreen(this.calc, ERR.CANT_SOLVE, { onCancel: () => { this.calc.pop(); this.screen.clear(); }, onGoto: () => {} }));
      return;
    }
    const x = N.fromDec(new N.D(r.x).toSD(15));
    this.calc.mem.vars[name] = x;
    this.calc.setAns(x);
    // Residuals below the 15-digit noise floor display as 0, as on the calculator (x²+B=0 → L−R=0).
    const res = g(r.x);
    const residual = Math.abs(res) < 1e-13 * Math.max(1, Math.abs(r.x)) ? N.ZERO : N.fromDec(new N.D(res).toSD(10));
    this.calc.push(new SolveResult(this.calc, this, name, x, residual));
  }

  view() {
    const el = h('div', null);
    el.append(h('div', 'expr-area', h('span', 'expr-scroll', renderNodes(this.screen.editor.root, { math: this.screen.math, cursor: null }))));
    el.append(promptLine(this.calc, this.eqn.vars[this.i], this.editor));
    return { el };
  }

  paint(lcd) { paintPrompt(lcd, this.calc, this.screen, this.eqn.vars[this.i], this.editor); }
}

class SolveResult {
  constructor(calc, prompt, name, x, residual) {
    this.calc = calc;
    this.prompt = prompt;
    this.name = name;
    this.x = x;
    this.residual = residual;
  }

  handle(ev) {
    if (ev.action === 'eq') { this.calc.pop(); this.prompt.i = this.prompt.eqn.vars.indexOf(this.name); return true; }
    if (ev.action === 'ac') { this.calc.pop(); this.calc.pop(); this.prompt.screen.clear(); return true; }
    if (ev.action === 'sto') return true;
    return true;
  }

  view() {
    const el = h('div', null);
    el.append(h('div', 'expr-area', h('span', 'expr-scroll', renderNodes(this.prompt.screen.editor.root, { math: this.prompt.screen.math, cursor: null }))));
    const kv = h('div', null);
    kv.style.cssText = 'position:absolute;left:calc(var(--lp)*2);right:calc(var(--lp)*2);bottom:0;font-size:calc(var(--lp)*10)';
    const row = (label, model) => {
      const r = h('div', 'm-row', label, h('span', null, renderModel(model, {})));
      r.style.cssText = 'display:flex;justify-content:space-between;height:calc(var(--lp)*12)';
      return r;
    };
    kv.append(row(h('span', null, h('i', 'm-var', this.name), '='), this.calc.model(this.x, { form: 'dec' })));
    kv.append(row('L−R=', this.calc.model(this.residual, { form: 'dec' })));
    el.append(kv);
    return { el };
  }

  /** The equation on top, "x=" and "L−R=" on the last two lines with the values right-aligned. */
  paint(lcd) {
    const screen = this.prompt.screen;
    const expr = editorBox(screen.editor.root, { math: screen.math, cursor: null });
    drawBox(lcd, expr, 0, 1 + expr.asc);
    const line = (label, value, base) => {
      lcd.text(label, 0, base);
      const b = modelBox(this.calc.model(value, { form: 'dec' }), {});
      drawBox(lcd, b, Math.max(0, 192 - b.w), base);
    };
    line(`${this.name === 'x' ? '𝑥' : this.name}=`, this.x, LINES[2]);
    line('L−R=', this.residual, LINES[3]);
  }
}

export { VarPrompt, LINE_TEMPLATE, tpl };
