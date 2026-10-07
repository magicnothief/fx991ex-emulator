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
// 3×4 letters of the series cells and row labels
const SERIES_LETTER = { L: ['#..', '#..', '#..', '###'], A: ['.#.', '#.#', '###', '#.#'] };

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

  /**
   * The guide's periodic table (User's Guide p.39): a grid of 6-pixel cells with shared borders (x 0–108,
   * rows from y 2), the lanthanoid and actinoid rows 4 px below it under groups 4–18, "L"/"A" in their group-3
   * cells and before their rows, the selected cell filled; Z, symbol and weight centred on the right.
   */
  paint(lcd) {
    const sel = CELLS.get(key(this.row, this.col));
    const cx = (row, col) => 6 * (col - 1) + (row >= 8 ? 6 : 0);
    const cy = (row) => (row >= 8 ? 48 + 6 * (row - 8) : 2 + 6 * (row - 1));
    for (const [k, cell] of CELLS) {
      const [row, col] = k.split(',').map(Number);
      const x = cx(row, col), y = cy(row);
      if (cell === sel) lcd.fill(x, y, 7, 7);
      else lcd.frame(x, y, 7, 7);
      if (cell.letter) lcd.bitmap(SERIES_LETTER[cell.letter], x + 2, y + 1, cell === sel ? 0 : 1);
    }
    for (const sr of SERIES) lcd.bitmap(SERIES_LETTER[sr.letter], 14, cy(sr.labelRow) + 1);
    const info = sel.z
      ? [String(sel.z), sel.symbol, sel.bracket ? `[${sel.weight}]` : sel.weight.replace('.', ',')]
      : [sel.range, t(sel.name), ''];
    const centre = (text, base, font, pitch) => lcd.text(text, 150 - Math.floor((text.length * pitch) / 2), base, { font });
    centre(info[0], 19, 'L', 11);
    centre(info[1], 37, 'L', 11);
    if (info[2]) centre(info[2], 52, 'S', 6);
    return { noMath: true };
  }

}

export function atomicMenu(calc, apply) {
  return new Menu(calc, [page([
    item('Periodic Table', () => calc.push(new PeriodicTable(calc, apply))),
    item('Atomic Weight', () => { closeMenus(calc); apply('tok:AtWt'); }),
  ])]);
}
