// ATOMIC (SHIFT 4, fx-991CE X): periodic table browser and the AtWt command (User's Guide HU pp.38–39).
import { h } from '../../ui/render.js';
import { ELEMENTS, position } from '../../core/elements.js';
import { Menu, page, item, closeMenus } from './common.js';
import { t } from '../i18n.js';

// Group 3 of periods 6 and 7 holds the lanthanoid (L) and actinoid (A) series cells; the series rows
// below the table are marked with the same letters.
const SERIES = [
  { row: 6, col: 3, letter: 'L', range: '57~71', name: 'Lanth', labelRow: 8 },
  { row: 7, col: 3, letter: 'A', range: '89~103', name: 'Actin', labelRow: 9 },
];
const key = (row, col) => `${row},${col}`;
const CELLS = new Map([
  ...ELEMENTS.map((e) => { const p = position(e.z); return [key(p.row, p.col), e]; }),
  ...SERIES.map((sr) => [key(sr.row, sr.col), sr]),
]);
const ROWS = 9;

class PeriodicTable {
  constructor(calc, apply) {
    this.calc = calc;
    this.apply = apply;
    this.row = 1;
    this.col = 1;
    this.isMenu = true;
  }

  /** ◀▶ move to the next cell in the row; ▲▼ to the nearest cell in the next row. */
  move(dir) {
    if (dir === 'left' || dir === 'right') {
      const step = dir === 'right' ? 1 : -1;
      for (let c = this.col + step; c >= 1 && c <= 18; c += step) {
        if (CELLS.has(key(this.row, c))) { this.col = c; return; }
      }
      return;
    }
    const row = this.row + (dir === 'down' ? 1 : -1);
    if (row < 1 || row > ROWS) return;
    for (let d = 0; d < 18; d++) {
      for (const c of [this.col - d, this.col + d]) {
        if (CELLS.has(key(row, c))) { this.row = row; this.col = c; return; }
      }
    }
  }

  handle(ev) {
    const cell = CELLS.get(key(this.row, this.col));
    switch (ev.action) {
      case 'left': case 'right': case 'up': case 'down': this.move(ev.action); return true;
      case 'eq':
        if (!cell.z) return true; // a series cell has no atomic weight
        closeMenus(this.calc);
        this.apply('tok:AtWt');
        for (const d of String(cell.z)) this.apply(`tok:${d}`);
        return true;
      case 'ac': closeMenus(this.calc); return true;
      default: return true;
    }
  }

  view() {
    const sel = CELLS.get(key(this.row, this.col));
    const table = h('div', 'ptable');
    const place = (el, row, col) => {
      el.style.gridRow = String(row + (row >= 8 ? 1 : 0));
      el.style.gridColumn = String(col);
      table.append(el);
    };
    for (let row = 1; row <= ROWS; row++) {
      for (let col = 1; col <= 18; col++) {
        const cell = CELLS.get(key(row, col));
        if (cell) place(h('div', `pt-cell on${cell === sel ? ' sel' : ''}`, cell.letter ?? null), row, col);
      }
    }
    for (const sr of SERIES) place(h('div', 'pt-cell pt-label', sr.letter), sr.labelRow, 2);
    const info = sel.z
      ? [String(sel.z), sel.symbol, sel.bracket ? `[${sel.weight}]` : sel.weight.replace('.', ',')]
      : [sel.range, t(sel.name), ''];
    const panel = h('div', 'pt-info', h('div', 'pt-z', info[0]), h('div', 'pt-sym', info[1]), h('div', 'pt-w', info[2]));
    return { el: h('div', 'ptable-screen', table, panel), status: { noMath: true } };
  }

  /** Cells of 6×5 pixels (18 groups, the two series rows below), the selected cell filled; Z, symbol, weight right. */
  paint(lcd) {
    const sel = CELLS.get(key(this.row, this.col));
    const cx = (col) => 1 + (col - 1) * 6;
    const cy = (row) => 1 + (row - 1) * 5 + (row >= 8 ? 3 : 0);
    for (const [k, cell] of CELLS) {
      const [row, col] = k.split(',').map(Number);
      if (cell === sel) lcd.fill(cx(col), cy(row), 7, 6);
      else lcd.frame(cx(col), cy(row), 7, 6);
    }
    for (const sr of SERIES) lcd.text(sr.letter, cx(2) - 1, cy(sr.labelRow) + 5, { font: 'T' });
    const info = sel.z
      ? [String(sel.z), sel.symbol, sel.bracket ? `[${sel.weight}]` : sel.weight.replace('.', ',')]
      : [sel.range, t(sel.name), ''];
    lcd.textRight(info[0], 192, 14);
    lcd.textRight(info[1], 192, 30);
    if (info[2]) lcd.textRight(info[2], 192, 46, { font: 'S' });
    return { noMath: true };
  }
}

export function atomicMenu(calc, apply) {
  return new Menu(calc, [page([
    item('Periodic Table', () => calc.push(new PeriodicTable(calc, apply))),
    item('Atomic Weight', () => { closeMenus(calc); apply('tok:AtWt'); }),
  ])]);
}
