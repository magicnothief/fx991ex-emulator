// Calculate, Complex, Base-N, Matrix and Vector modes.
import * as N from '../../core/num.js';
import * as V from '../../core/values.js';
import { Editor, tok } from '../../core/editor.js';
import { h } from '../../ui/render.js';
import { CalcScreen } from '../screens/calcscreen.js';
import { GridScreen } from '../screens/grid.js';
import { Menu, page, item, closeMenus } from '../screens/common.js';
import { commonOptnPage } from '../screens/menus.js';
import { t } from '../i18n.js';
import { LINES } from '../../ui/lcd.js';

const tokItem = (screen, label, id) => item(label, (calc) => { closeMenus(calc); screen.apply(`tok:${id}`); });

// ---------------------------------------------------------------- Calculate / Complex / Base-N

export const calcMode = {
  start(calc) {
    calc.push(new CalcScreen(calc, {
      solve: true,
      optn: (s) => new Menu(calc, [commonOptnPage(calc, (a) => s.apply(a))]),
    }));
  },
};

export const complexMode = {
  start(calc) {
    calc.push(new CalcScreen(calc, {
      optn: (s) => new Menu(calc, [
        page([tokItem(s, 'Argument', 'Arg('), tokItem(s, 'Conjugate', 'Conjg('), tokItem(s, 'Real Part', 'ReP('), tokItem(s, 'Imaginary Part', 'ImP(')]),
        page([tokItem(s, '▸r∠θ', '►r∠θ'), tokItem(s, '▸a+bi', '►a+bi')]),
        commonOptnPage(calc, (a) => s.apply(a), { eng: false }),
      ]),
    }));
  },
};

export const baseMode = {
  start(calc) {
    calc.modeData.base = 'dec';
    calc.push(new CalcScreen(calc, {
      optn: (s) => new Menu(calc, [
        page([tokItem(s, 'Neg', 'Neg('), tokItem(s, 'Not', 'Not('), tokItem(s, 'and', 'and'), tokItem(s, 'or', 'or'), tokItem(s, 'xor', 'xor'), tokItem(s, 'xnor', 'xnor')], { cols: 2 }),
        page([tokItem(s, 'd', 'based'), tokItem(s, 'h', 'baseh'), tokItem(s, 'b', 'baseb'), tokItem(s, 'o', 'baseo')], { cols: 2 }),
      ]),
    }));
  },
};

// ---------------------------------------------------------------- Matrix / Vector

const NAMES = ['A', 'B', 'C', 'D'];
const STO_TARGET = { NEG: 'A', DMS: 'B', INV: 'C', SIN: 'D' };

/** "Number of Rows? Select 1~4" style prompt. */
class SizePrompt {
  constructor(calc, lines, min, max, onPick) {
    Object.assign(this, { calc, lines, min, max, onPick, isMenu: true });
  }

  handle(ev) {
    const d = /^tok:(\d)$/.exec(ev.action || '');
    if (d && +d[1] >= this.min && +d[1] <= this.max) this.onPick(+d[1]);
    else if (ev.action === 'ac') closeMenus(this.calc);
    else if (ev.action === 'left') this.calc.pop();
    return true;
  }

  view() {
    return { el: h('div', 'menu', this.lines.map((l) => h('div', 'item', t(l)))) };
  }

  paint(lcd) { this.lines.forEach((l, i) => lcd.text(t(l), 0, LINES[i])); }
}

function arrayMode(kind) {
  const isMat = kind === 'mat';
  const prefix = isMat ? 'Mat' : 'Vct';
  const store = (calc) => (isMat ? calc.mem.mats : calc.mem.vcts);

  function editor(calc, name, readOnly = false) {
    const get = () => store(calc)[name];
    const spec = {
      title: `${prefix}${name}=`,
      matrix: true,
      advance: 'right',
      readOnly,
      visibleRows: 3,
      cols: Array.from({ length: isMat ? get().c : 1 }, () => ({ label: '', width: isMat ? Math.min(40, Math.floor(150 / get().c)) : 40 })),
      rowCount: () => (isMat ? get().r : get().n),
      get: (r, c) => (isMat ? get().a[r][c] : get().a[r]),
      set: (r, c, v) => {
        const value = V.isReal(v) ? v : V.real(v);
        if (isMat) get().a[r][c] = value;
        else get().a[r] = value;
      },
      onAC: () => calc.pop(),
      onSto: (g) => { g.stoPending = true; },
    };
    const g = new GridScreen(calc, spec);
    const baseHandle = g.handle.bind(g);
    g.handle = (ev) => {
      if (g.stoPending) {
        g.stoPending = false;
        const target = STO_TARGET[ev.key];
        if (target) {
          store(calc)[target] = V.copyArray(get());
          calc.pop();
          calc.push(editor(calc, target));
        }
        return true;
      }
      if (name === 'Ans' && /^(tok:[+\-×÷²³]|tok:⁻¹)$/.test(ev.action || '')) {
        // continue the calculation from MatAns / VctAns
        calc.pop();
        const s = calc.top;
        s.editor = new Editor(s.math, [tok(`${prefix}Ans`)]);
        s.phase = 'input';
        s.result = null;
        s.apply(ev.action);
        return true;
      }
      return baseHandle(ev);
    };
    return g;
  }

  function define(calc, name) {
    const finish = (value) => {
      store(calc)[name] = value;
      closeMenus(calc);
      calc.push(editor(calc, name));
    };
    if (isMat) {
      calc.push(new SizePrompt(calc, [`${prefix}${name}`, 'Number of Rows?', 'Select 1~4'], 1, 4, (r) => {
        calc.push(new SizePrompt(calc, [`${prefix}${name}`, 'Number of Columns?', 'Select 1~4'], 1, 4, (c) => finish(V.mat(r, c))));
      }));
    } else {
      calc.push(new SizePrompt(calc, [`${prefix}${name}`, 'Dimension?', 'Select 2~3'], 2, 3, (n) => finish(V.vec(Array.from({ length: n }, () => N.ZERO)))));
    }
  }

  const sizeOf = (v) => (!v ? '' : isMat ? ` ${v.r}×${v.c}` : ` ${v.n}`);
  const pickMenu = (calc, fn, sub = true) => new Menu(calc, [page(NAMES.map((n) => item(`${prefix}${n}${sizeOf(store(calc)[n])}`, () => fn(n))))], { sub });

  return {
    start(calc) {
      const screen = new CalcScreen(calc, {
        optn: (s) => new Menu(calc, [
          page([
            item(`Define ${isMat ? 'Matrix' : 'Vector'}`, () => calc.push(pickMenu(calc, (n) => define(calc, n)))),
            item(`Edit ${isMat ? 'Matrix' : 'Vector'}`, () => calc.push(pickMenu(calc, (n) => {
              closeMenus(calc);
              if (store(calc)[n]) calc.push(editor(calc, n));
              else define(calc, n);
            }))),
            ...NAMES.map((n) => tokItem(s, `${prefix}${n}`, `${prefix}${n}`)),
          ], { cols: 2, small: true }),
          isMat
            ? page([tokItem(s, 'MatAns', 'MatAns'), tokItem(s, 'Determinant', 'Det('), tokItem(s, 'Transposition', 'Trn('), tokItem(s, 'Identity', 'Identity(')])
            : page([tokItem(s, 'VctAns', 'VctAns'), tokItem(s, 'Dot Product', '•'), tokItem(s, 'Angle', 'Angle('), tokItem(s, 'Unit Vector', 'UnitV(')]),
          commonOptnPage(calc, (a) => s.apply(a), { eng: false }),
        ]),
        onMatrix: () => calc.push(editor(calc, 'Ans', true)),
        onVector: () => calc.push(editor(calc, 'Ans', true)),
      });
      calc.push(screen);
      calc.push(pickMenu(calc, (n) => define(calc, n), false));
    },
  };
}

export const matrixMode = arrayMode('mat');
export const vectorMode = arrayMode('vec');
