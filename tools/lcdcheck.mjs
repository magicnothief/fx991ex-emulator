// Paints an emulator screen into the pixel LCD and writes its content rows (192×63) as JSON, for pixel
// comparisons with User's Guide screenshots.  node tools/lcdcheck.mjs "<keys>" <out.json>
import fs from 'node:fs';
import { Calculator } from '../src/calc/calculator.js';
import { MODES } from '../src/calc/modes/index.js';
import { LCD, WIDTH, STATUS_ROWS, CONTENT_ROWS } from '../src/ui/lcd.js';

const [keys, out] = process.argv.slice(2);
const calc = new Calculator({ modes: MODES, storage: null });
for (const k of keys.split(/\s+/).filter(Boolean)) calc.press(k);
const lcd = new LCD();
lcd.cursorOn = false;
calc.top.paint(lcd);
const rows = [];
for (let y = STATUS_ROWS; y < STATUS_ROWS + CONTENT_ROWS; y++) {
  let r = '';
  for (let x = 0; x < WIDTH; x++) r += lcd.get(x, y) ? '#' : '.';
  rows.push(r);
}
fs.writeFileSync(out, JSON.stringify(rows));
