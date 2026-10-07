// Draws the current calculator state onto the LCD: status indicators plus the top screen.
import * as N from '../core/num.js';
import * as V from '../core/values.js';
import { h } from './render.js';
import { LCD, present } from './lcd.js';

const BASE_LABEL = { dec: 'Dec', hex: 'Hex', bin: 'Bin', oct: 'Oct' };

function statusBar(calc, st) {
  const s = calc.setup;
  const items = [];
  const boxed = (t) => h('span', 'ind boxed', t);
  if (calc.shift) items.push(boxed('S'));
  if (calc.alpha) items.push(boxed('A'));
  const m = calc.mem.vars.M;
  if (m && !(V.isReal(m) && N.isZero(m))) items.push(h('span', 'ind', 'M'));
  if (st.sto) items.push(h('span', 'ind', '→x'));
  items.push(boxed({ deg: 'D', rad: 'R', gra: 'G' }[s.angle]));
  if (s.numFormat.mode === 'fix') items.push(h('span', 'ind', 'FIX'));
  if (s.numFormat.mode === 'sci') items.push(h('span', 'ind', 'SCI'));
  if (s.engSymbol) items.push(h('span', 'ind', 'E'));
  if (calc.mode === 'cmplx' || calc.mode === 'eqn') items.push(h('span', 'ind math', s.complexForm === 'polar' ? '∠' : 'i'));
  if (calc.mode === 'base') items.push(h('span', 'ind', BASE_LABEL[calc.modeData.base || 'dec']));
  if ((s.io === 'mm' || s.io === 'md') && !st.noMath) items.push(h('span', 'ind math', '√▫'));
  items.push(h('span', 'spacer'));
  if (st.disp) items.push(boxed('Disp'));
  if (st.up) items.push(h('span', 'ind', '▲'));
  if (st.down) items.push(h('span', 'ind', '▼'));
  if (st.sub) items.push(h('span', 'ind', '◀'));
  return items;
}

const pixels = new LCD();

/** Status line on the pixel display: indicator bitmaps at their fixed positions. */
function paintStatus(lcd, calc, st) {
  const s = calc.setup;
  if (st.only) { // MENU: only the scroll arrows
    if (st.down) lcd.icon('down');
    if (st.up) lcd.icon('up');
    return;
  }
  if (calc.shift) lcd.icon('S');
  else if (calc.alpha) lcd.icon('A');
  const m = calc.mem.vars.M;
  if (m && !(V.isReal(m) && N.isZero(m))) lcd.icon('M');
  if (st.sto) lcd.icon('STO');
  if ((s.io === 'mm' || s.io === 'md') && !st.noMath) lcd.icon('math');
  if (calc.mode !== 'base') lcd.icon({ deg: 'D', rad: 'R', gra: 'G' }[s.angle]); // Base-N shows no angle unit
  if (s.numFormat.mode === 'fix') lcd.icon('FIX');
  if (s.numFormat.mode === 'sci') lcd.icon('SCI');
  if (s.engSymbol) lcd.icon('eng');
  if (calc.mode === 'cmplx' || calc.mode === 'eqn') lcd.icon('cmplx');
  if (st.disp) lcd.icon('Disp');
  if (st.sub || st.left) lcd.icon('left');
  if (st.down) lcd.icon('down');
  if (st.up) lcd.icon('up');
}

/**
 * Draws the top screen. Screens with paint(lcd) use the pixel display (canvas); the others still render
 * as HTML. dom: { lcd, canvas, status, screen }. Returns the plain text shown (for copying and tests).
 */
export function renderFrame(calc, dom, cursorOn = true) {
  const { lcd, canvas, status: statusEl, screen: screenEl } = dom;
  lcd.classList.toggle('off', !calc.power);
  const contrast = calc.setup.contrast ?? 5;
  const ink = `rgba(20, 22, 18, ${0.5 + contrast * 0.05})`;
  lcd.style.setProperty('--ink', ink);
  if (!calc.power) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return ''; }
  const top = calc.top;
  if (top.paint) {
    pixels.clear();
    pixels.cursorOn = cursorOn;
    const st = top.paint(pixels) ?? {};
    if (!st.bare) paintStatus(pixels, calc, { ...st, ...pixels.status });
    present(pixels, canvas, ink);
    canvas.hidden = false;
    statusEl.hidden = true;
    screenEl.hidden = true;
    return pixels.describe();
  }
  canvas.hidden = true;
  statusEl.hidden = false;
  screenEl.hidden = false;
  const { el, status = {}, after } = top.view();
  // MENU uses the whole display: its icons fill the rows where other screens show indicators
  lcd.classList.toggle('bare', !!status.bare);
  statusEl.replaceChildren(...(status.bare ? [] : statusBar(calc, status)));
  screenEl.replaceChildren(el);
  after?.();
  return el.textContent;
}
