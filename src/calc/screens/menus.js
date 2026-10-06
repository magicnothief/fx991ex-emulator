// MENU, SETUP, RESET, CONST, CONV, QR and the OPTN submenus shared by all modes.
import { h } from '../../ui/render.js';
import { Menu, Message, Confirm, DigitPrompt, page, item, closeMenus } from './common.js';
import { CONSTANT_GROUPS, CONSTANT_PAGES, CONVERSION_GROUPS, CONVERSION_PAGES } from '../../core/constants.js';
import { MENU_KEY } from '../keymap.js';
import { t, setLanguage, LANGUAGES } from '../i18n.js';

export const MODE_LIST = [
  { id: 'calc', label: 'Calculate', icon: '×÷\n+−' },
  { id: 'cmplx', label: 'Complex', icon: 'i∠' },
  { id: 'base', label: 'Base-N', icon: '2 8\n10 16' },
  { id: 'matrix', label: 'Matrix', icon: '[▫▫]' },
  { id: 'vector', label: 'Vector', icon: '↗' },
  { id: 'stat', label: 'Statistics', icon: '▁▃▆' },
  { id: 'dist', label: 'Distribution', icon: '⌒' },
  { id: 'sheet', label: 'Spreadsheet', icon: '▦' },
  { id: 'table', label: 'Table', icon: '▤' },
  { id: 'eqn', label: 'Equation/Func', icon: 'x=' },
  { id: 'ineq', label: 'Inequality', icon: 'x>' },
  { id: 'ratio', label: 'Ratio', icon: 'A:B' },
];
const MODE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C'];

// ---------------------------------------------------------------- MENU

class MainMenu {
  constructor(calc) {
    this.calc = calc;
    this.sel = Math.max(0, MODE_LIST.findIndex((m) => m.id === calc.mode));
    this.isMenu = true;
  }

  handle(ev) {
    const k = MENU_KEY[ev.key];
    const i = MODE_KEYS.indexOf(k);
    if (i >= 0 && !ev.shift) { this.enter(i); return true; }
    switch (ev.action) {
      case 'left': this.sel = (this.sel + 11) % 12; break;
      case 'right': this.sel = (this.sel + 1) % 12; break;
      case 'up': this.sel = (this.sel + 8) % 12; break;
      case 'down': this.sel = (this.sel + 4) % 12; break;
      case 'eq': this.enter(this.sel); break;
      case 'ac': case 'menu': this.calc.pop(); break;
      default: break;
    }
    return true;
  }

  enter(i) {
    this.calc.enterMode(MODE_LIST[i].id);
  }

  view() {
    const firstRow = Math.min(Math.max(0, Math.floor(this.sel / 4) - 1), 1);
    const icons = MODE_LIST.slice(firstRow * 4, firstRow * 4 + 8).map((m, j) => {
      const idx = firstRow * 4 + j;
      return h('div', `icon${idx === this.sel ? ' sel' : ''}`, h('span', null, m.icon.split('\n').map((l, k) => [k ? h('br') : null, l])), h('span', 'num', MODE_KEYS[idx]));
    });
    const el = h('div', 'mainmenu', h('div', 'icons', icons), h('div', 'label', `${MODE_KEYS[this.sel]}:${t(MODE_LIST[this.sel].label)}`));
    return { el, status: { noMath: true } };
  }
}

export const mainMenu = (calc) => new MainMenu(calc);

// ---------------------------------------------------------------- SETUP

function choose(calc, key, options, after) {
  return new Menu(calc, [page(options.map(([label, value]) => item(label, () => {
    calc.setup[key] = value;
    closeMenus(calc);
    after?.(calc);
  })))], { sub: true });
}

const onOff = [['On', true], ['Off', false]];

export function setupMenu(calc) {
  const sub = (m) => () => calc.push(m());
  const p1 = page([
    item('Input/Output', sub(() => choose(calc, 'io', [['MathI/MathO', 'mm'], ['MathI/DecimalO', 'md'], ['LineI/LineO', 'll'], ['LineI/DecimalO', 'ld']], (c) => c.notify('io')))),
    item('Angle Unit', sub(() => choose(calc, 'angle', [['Degree', 'deg'], ['Radian', 'rad'], ['Gradian', 'gra']]))),
    item('Number Format', sub(() => new Menu(calc, [page([
      item('Fix', () => calc.push(new DigitPrompt(calc, 'Fix 0~9?', 0, 9, (d) => { calc.setup.numFormat = { mode: 'fix', digits: d }; closeMenus(calc); }))),
      item('Sci', () => calc.push(new DigitPrompt(calc, 'Sci 0~9?', 0, 9, (d) => { calc.setup.numFormat = { mode: 'sci', digits: d }; closeMenus(calc); }))),
      item('Norm', () => calc.push(new DigitPrompt(calc, 'Norm 1~2?', 1, 2, (d) => { calc.setup.numFormat = { mode: 'norm', digits: d }; closeMenus(calc); }))),
    ])], { sub: true }))),
    item('Engineer Symbol', sub(() => choose(calc, 'engSymbol', onOff))),
  ]);
  const p2 = page([
    item('Fraction Result', sub(() => choose(calc, 'fracResult', [['ab/c', 'mixed'], ['d/c', 'improper']]))),
    item('Complex', sub(() => choose(calc, 'complexForm', [['a+bi', 'rect'], ['r∠θ', 'polar']]))),
    item('Statistics', sub(() => choose(calc, 'statFreq', onOff, (c) => c.notify('statFreq')))),
    item('Spreadsheet', sub(() => new Menu(calc, [page([
      item('Auto Calc', () => calc.push(choose(calc, 'sheetAutoCalc', onOff))),
      item('Show Cell', () => calc.push(choose(calc, 'sheetShowCell', [['Formula', 'formula'], ['Value', 'value']]))),
    ])], { sub: true }))),
  ]);
  // fx-991CE X layout (User's Guide HU p.7): no Decimal Mark item; Language on page 4
  const p3 = page([
    item('Equation/Func', sub(() => choose(calc, 'eqComplex', onOff))),
    item('Table', sub(() => choose(calc, 'table', [['f(x)', 'f'], ['f(x),g(x)', 'fg']], (c) => c.notify('table')))),
    item('Digit Separator', sub(() => choose(calc, 'digitSep', onOff))),
    item('MultiLine Font', sub(() => choose(calc, 'multiLineFont', [['Normal Font', 'normal'], ['Small Font', 'small']]))),
  ]);
  const p4 = page([
    item('Language', sub(() => choose(calc, 'language', LANGUAGES, (c) => setLanguage(c.setup.language)))),
    item('QR Code', sub(() => choose(calc, 'qr', [['Version 3', 3], ['Version 11', 11]]))),
    item('Contrast', () => calc.push(new ContrastScreen(calc))),
  ]);
  return new Menu(calc, [p1, p2, p3, p4]);
}

class ContrastScreen {
  constructor(calc) { this.calc = calc; this.isMenu = true; }

  handle(ev) {
    if (ev.action === 'left') this.calc.setup.contrast = Math.max(1, this.calc.setup.contrast - 1);
    else if (ev.action === 'right') this.calc.setup.contrast = Math.min(9, this.calc.setup.contrast + 1);
    else if (ev.action === 'ac' || ev.action === 'eq') closeMenus(this.calc);
    return true;
  }

  view() {
    const c = this.calc.setup.contrast;
    const bar = h('div', null, `${t('LIGHT')} ${'■'.repeat(c)}${'□'.repeat(9 - c)} ${t('DARK')}`);
    return { el: h('div', 'message', h('div', 'big', t('CONTRAST')), bar, h('div', null, '[◀]  [▶]')) };
  }
}

// ---------------------------------------------------------------- RESET

export function resetMenu(calc) {
  const done = (title) => {
    closeMenus(calc);
    calc.push(new Message(calc, [title, '', 'Press [AC] Key'], { keys: ['ac'] }));
  };
  return new Menu(calc, [page([
    item('Setup Data', () => calc.push(new Confirm(calc, 'Reset Setup?', () => { calc.resetSetup(); calc.enterMode(calc.mode); done('Reset Setup'); }))),
    item('Memory', () => calc.push(new Confirm(calc, 'Clear Memory?', () => { calc.resetMemory(); done('Clear Memory'); }))),
    item('Initialize All', () => calc.push(new Confirm(calc, 'Initialize All?', () => { calc.resetAll(); done('Initialize All'); }))),
  ])]);
}

export function qrScreen(calc) {
  const m = new Message(calc, ['QR Code', '', 'Not available in', 'this emulator.'], { keys: ['ac', 'qr', 'eq'] });
  m.isMenu = true;
  return m;
}

// ---------------------------------------------------------------- CONST / CONV

function itemsPage(items, insert, calc, idOf, cols) {
  return page(items.map((it) => item(it.label.replace(/_/g, ''), () => { closeMenus(calc); insert(idOf(it)); })), {
    cols,
    small: items.length > 4,
  });
}

export function constMenu(calc, insert) {
  const pages = CONSTANT_PAGES.map((idxs) => page(idxs.map((gi) => {
    const g = CONSTANT_GROUPS[gi];
    return item(g.name, () => calc.push(new Menu(calc, [itemsPage(g.items, insert, calc, (it) => `tok:const|${it.id}|${it.label.replace(/_/g, '')}`, 3)], { sub: true })));
  })));
  return new Menu(calc, pages);
}

export function convMenu(calc, insert) {
  const pages = CONVERSION_PAGES.map((idxs) => page(idxs.map((gi) => {
    const g = CONVERSION_GROUPS[gi];
    return item(g.name, () => calc.push(new Menu(calc, [itemsPage(g.items, insert, calc, (it) => `tok:conv|${it.id}|${it.label}`, 2)], { sub: true })));
  })));
  return new Menu(calc, pages);
}

// ---------------------------------------------------------------- OPTN building blocks

export function hyperbolicMenu(calc, apply) {
  const fns = [['sinh', 'sinh('], ['cosh', 'cosh('], ['tgh', 'tanh('], ['sinh⁻¹', 'asinh('], ['cosh⁻¹', 'acosh('], ['tgh⁻¹', 'atanh(']];
  return new Menu(calc, [page(fns.map(([l, id]) => item(l, () => { closeMenus(calc); apply(`tok:${id}`); })), { cols: 2 })], { sub: true });
}

export function angleUnitMenu(calc, apply) {
  return new Menu(calc, [page([['°', '°u'], ['ʳ', 'ʳ'], ['ᵍ', 'ᵍ']].map(([l, id]) => item(l, () => { closeMenus(calc); apply(`tok:${id}`); })), { cols: 3 })], { sub: true });
}

export function engSymbolMenu(calc, apply) {
  const syms = ['m', 'μ', 'n', 'p', 'f', 'k', 'M', 'G', 'T', 'P', 'E'];
  return new Menu(calc, [page(syms.map((s) => item(s, () => { closeMenus(calc); apply(`tok:eng${s}`); })), { cols: 3 })], { sub: true });
}

/** The OPTN page common to calculation screens. */
export function commonOptnPage(calc, apply, { eng = true } = {}) {
  const items = [
    item('Hyperbolic Func', () => calc.push(hyperbolicMenu(calc, apply))),
    item('Angle Unit', () => calc.push(angleUnitMenu(calc, apply))),
  ];
  if (eng) items.push(item('Engineer Symbol', () => calc.push(engSymbolMenu(calc, apply))));
  return page(items);
}
