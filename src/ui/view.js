// Draws the current calculator state onto the LCD: status indicators plus the top screen.
import * as N from '../core/num.js';
import * as V from '../core/values.js';
import { h } from './render.js';

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

export function renderFrame(calc, lcd, statusEl, screenEl) {
  lcd.classList.toggle('off', !calc.power);
  const contrast = calc.setup.contrast ?? 5;
  lcd.style.setProperty('--ink', `rgba(27, 29, 22, ${0.45 + contrast * 0.06})`);
  if (!calc.power) return null;
  const { el, status = {}, after } = calc.top.view();
  statusEl.replaceChildren(...statusBar(calc, status));
  screenEl.replaceChildren(el);
  after?.();
  return el;
}
