// Writes enlarged PNG-ready pixel dumps for checking glyphs and layouts:
//   node tools/lcdspecimen.mjs fonts <out.json>        every glyph of every font
//   node tools/lcdspecimen.mjs keys "<keys>" <out.json> one screen (content rows)
import fs from 'node:fs';
import { LCD, WIDTH, HEIGHT } from '../src/ui/lcd.js';
import { FONTS } from '../src/ui/lcdfont.js';

const [mode, a, b] = process.argv.slice(2);
const dump = (lcd) => Array.from({ length: HEIGHT }, (_, y) => Array.from({ length: WIDTH }, (_, x) => (lcd.get(x, y) ? '#' : '.')).join(''));

if (mode === 'fonts') {
  const pages = [];
  for (const [name, f] of Object.entries(FONTS)) {
    const chars = Object.keys(f.glyphs);
    const per = Math.floor(190 / f.pitch);
    const lineH = f.ascent + f.descent + 4;
    for (let p = 0; p < chars.length; p += per * Math.floor(60 / lineH)) {
      const lcd = new LCD();
      const page = chars.slice(p, p + per * Math.floor(60 / lineH));
      page.forEach((c, i) => lcd.glyph(c, (i % per) * f.pitch, f.ascent + 1 + Math.floor(i / per) * lineH, name));
      pages.push({ font: name, chars: page.join(''), rows: dump(lcd).slice(10) });
    }
  }
  fs.writeFileSync(a, JSON.stringify(pages));
} else {
  const { Calculator } = await import('../src/calc/calculator.js');
  const { MODES } = await import('../src/calc/modes/index.js');
  const calc = new Calculator({ modes: MODES, storage: null });
  for (const k of a.split(/\s+/).filter(Boolean)) calc.press(k);
  const lcd = new LCD();
  lcd.cursorOn = false;
  calc.top.paint(lcd);
  fs.writeFileSync(b, JSON.stringify([{ font: 'screen', chars: a, rows: dump(lcd).slice(10) }]));
}
