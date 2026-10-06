// ATOMIC (SHIFT 4, fx-991CE X): periodic table browser and the AtWt command (User's Guide HU pp.38–39).
import { h } from '../../ui/render.js';
import { ELEMENTS, position } from '../../core/elements.js';
import { Menu, page, item, closeMenus } from './common.js';

const AT = new Map(ELEMENTS.map((e) => [`${position(e.z).row},${position(e.z).col}`, e]));
const ROW_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9];

class PeriodicTable {
  constructor(calc, apply) {
    this.calc = calc;
    this.apply = apply;
    this.z = 1;
    this.isMenu = true;
  }

  at(row, col) { return AT.get(`${row},${col}`); }

  /** ◀▶ move to the next element in the row; ▲▼ to the nearest element in the next row. */
  move(dir) {
    const { row, col } = position(this.z);
    if (dir === 'left' || dir === 'right') {
      const step = dir === 'right' ? 1 : -1;
      for (let c = col + step; c >= 1 && c <= 18; c += step) {
        const e = this.at(row, c);
        if (e) { this.z = e.z; return; }
      }
      return;
    }
    const i = ROW_ORDER.indexOf(row) + (dir === 'down' ? 1 : -1);
    if (i < 0 || i >= ROW_ORDER.length) return;
    const target = ROW_ORDER[i];
    for (let d = 0; d < 18; d++) {
      const e = this.at(target, col - d) || this.at(target, col + d);
      if (e) { this.z = e.z; return; }
    }
  }

  handle(ev) {
    switch (ev.action) {
      case 'left': case 'right': case 'up': case 'down': this.move(ev.action); return true;
      case 'eq':
        closeMenus(this.calc);
        this.apply('tok:AtWt');
        for (const d of String(this.z)) this.apply(`tok:${d}`);
        return true;
      case 'ac': closeMenus(this.calc); return true;
      default: return true;
    }
  }

  view() {
    const e = ELEMENTS[this.z - 1];
    const table = h('div', 'ptable');
    for (const row of ROW_ORDER) {
      for (let col = 1; col <= 18; col++) {
        const el = this.at(row, col);
        const cell = h('div', `pt-cell${el ? ' on' : ''}${el && el.z === this.z ? ' sel' : ''}`);
        cell.style.gridRow = String(row + (row >= 8 ? 1 : 0));
        cell.style.gridColumn = String(col);
        table.append(cell);
      }
    }
    const weight = e.bracket ? `[${e.weight}]` : e.weight.replace('.', ',');
    const info = h('div', 'pt-info', h('div', 'pt-z', String(e.z)), h('div', 'pt-sym', e.symbol), h('div', 'pt-w', weight));
    return { el: h('div', 'ptable-screen', table, info), status: { noMath: true } };
  }
}

export function atomicMenu(calc, apply) {
  return new Menu(calc, [page([
    item('Periodic Table', () => calc.push(new PeriodicTable(calc, apply))),
    item('Atomic Weight', () => { closeMenus(calc); apply('tok:AtWt'); }),
  ])]);
}
