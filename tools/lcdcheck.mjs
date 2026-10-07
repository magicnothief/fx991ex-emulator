// Paints an emulator screen into the pixel LCD and writes it as JSON rows, for pixel comparisons with User's
// Guide screenshots.  node tools/lcdcheck.mjs "<keys>" <out.json> [full]
// (content rows 192×63, or with "full" the whole 192×75 display including the status line)
import fs from 'node:fs';
import { Calculator } from '../src/calc/calculator.js';
import { MODES } from '../src/calc/modes/index.js';
import { LCD, WIDTH, HEIGHT, STATUS_ROWS, CONTENT_ROWS } from '../src/ui/lcd.js';
import { paintStatus } from '../src/ui/view.js';

const [keys, out, full] = process.argv.slice(2);
const calc = new Calculator({ modes: MODES, storage: null });
for (const k of keys.split(/\s+/).filter(Boolean)) calc.press(k);
const lcd = new LCD();
lcd.cursorOn = false;
const st = calc.top.paint(lcd) ?? {};
if (!st.bare) paintStatus(lcd, calc, { ...st, ...lcd.status });
const rows = [];
for (let y = full ? 0 : STATUS_ROWS; y < (full ? HEIGHT : STATUS_ROWS + CONTENT_ROWS); y++) {
  let r = '';
  for (let x = 0; x < WIDTH; x++) r += lcd.get(x, y) ? '#' : '.';
  rows.push(r);
}
fs.writeFileSync(out, JSON.stringify(rows));
