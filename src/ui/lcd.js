// The fx-991CE X display as a pixel buffer: a status line (rows 0–9) above the 192×63 dot matrix.
// Screens draw in content coordinates (x 0–191, y 0–62) with the calculator's own fonts (lcdfont.js).
import { FONTS, ICONS } from './lcdfont.js';

export const WIDTH = 192;
export const HEIGHT = 75;
export const STATUS_ROWS = 10;
export const CONTENT_ROWS = 63;

const parse = (rows) => rows.split('|');
const cache = new Map();

/** Glyph of `ch` in `font` as { x, bottom, rows }, falling back to the main font, then to a box. */
export function glyph(font, ch) {
  const key = `${font}\u0000${ch}`;
  if (!cache.has(key)) {
    const f = FONTS[font] ?? FONTS.L;
    if (ch === ' ') { cache.set(key, { x: 0, bottom: 0, rows: [] }); return cache.get(key); }
    if ((ch === '◀' || ch === '▶') && !f.glyphs[ch]) {
      // cursor-key arrows in texts ([◀][▶]:Goto) use the status line's arrow bitmap
      const rows = parse(ICONS.left.rows);
      cache.set(key, { x: font === 'L' ? 2 : 0, bottom: font === 'L' ? -2 : 0, rows: ch === '◀' ? rows : rows.map((r) => [...r].reverse().join('')) });
      return cache.get(key);
    }
    const g = f.glyphs[ch] ?? (ch === '-' ? f.glyphs['−'] : null);
    // a glyph missing from a small font comes from the other small font before the main one (𝑥 in exponents)
    const near = font === 'S' ? 'T' : font === 'T' || font === 'I' ? 'S' : null;
    if (g) cache.set(key, { x: g[0], bottom: g[1], rows: parse(g[2]) });
    else if (near && FONTS[near].glyphs[ch]) cache.set(key, glyph(near, ch));
    else if (font !== 'L' && FONTS.L.glyphs[ch]) cache.set(key, glyph('L', ch));
    else {
      const h = f.ascent + 1;
      cache.set(key, { x: 1, bottom: 0, rows: Array.from({ length: h }, (_, i) => (i === 0 || i === h - 1 ? '#'.repeat(f.pitch - 2) : `#${'.'.repeat(f.pitch - 4)}#`)) });
    }
  }
  return cache.get(key);
}

/**
 * Splits text into glyph names (a letter followed by a combining mark is one glyph: x̄; so is ⁻¹). "_" makes
 * the rest of the word subscripts, named "_" + character (constants: μ_N, R_K-90).
 */
export function chars(text) {
  const out = [];
  let sub = false;
  for (const c of String(text)) {
    if (c === '_') sub = true;
    else if (/[̀-ͯ]/.test(c) && out.length) out[out.length - 1] += c;
    else if (c === '¹' && out[out.length - 1] === '⁻') out[out.length - 1] = '⁻¹';
    else {
      if (c === ' ') sub = false;
      out.push(sub ? `_${c}` : c);
    }
  }
  return out;
}

/** Text as logged for descriptions and copying: without the subscript marks. */
const plain = (text) => String(text).replace(/_/g, '');

// "⁻¹" of sin⁻¹, cosh⁻¹ … shares one main-font cell (fx-991EX guide, hyperbolic menu): a 5-px minus 8 rows
// above the baseline and a small 1 ending 5 rows above it
const INVERSE = { x: 0, bottom: -5, rows: ['.......##.', '......###.', '.......##.', '#####..##.', '.......##.', '.......##.', '......####'] };

// superscript and subscript characters, drawn raised or lowered with a smaller font
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '−', 'ˣ': 'x' };
const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₚ': 'p' };
const subscript = (ch) => SUB[ch] ?? (ch.length > 1 && ch[0] === '_' ? ch.slice(1) : undefined);

export class LCD {
  constructor() {
    this.bits = new Uint8Array(WIDTH * HEIGHT);
    this.oy = STATUS_ROWS; // content origin
    this.runs = []; // text drawn, for descriptions and copying: { x, y, text }
    this.cursorOn = true;
    this.status = {}; // indicators a screen asks for while painting (◀ ▶ scroll arrows)
  }

  clear() {
    this.bits.fill(0);
    this.runs = [];
    this.status = {};
  }

  get(x, y) {
    return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT ? this.bits[y * WIDTH + x] : 0;
  }

  /** Sets an absolute pixel. */
  put(x, y, on = 1) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) this.bits[y * WIDTH + x] = on ? 1 : 0;
  }

  // ------------------------------------------------------------ content-coordinate drawing

  dot(x, y, on = 1) {
    const yy = y + this.oy;
    if (yy >= this.oy && yy < this.oy + CONTENT_ROWS) this.put(x, yy, on);
  }

  fill(x, y, w, h, on = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, on);
  }

  invert(x, y, w, h) {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const yy = y + j + this.oy;
        if (yy >= this.oy && yy < this.oy + CONTENT_ROWS) this.put(x + i, yy, !this.get(x + i, yy));
      }
    }
  }

  hline(x0, x1, y, on = 1) { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.dot(x, y, on); }

  vline(x, y0, y1, on = 1) { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.dot(x, y, on); }

  frame(x, y, w, h) {
    this.hline(x, x + w - 1, y);
    this.hline(x, x + w - 1, y + h - 1);
    this.vline(x, y, y + h - 1);
    this.vline(x + w - 1, y, y + h - 1);
  }

  /** Draws pixel rows ('#' set) with the top-left corner at (x, y). */
  bitmap(rows, x, y, on = 1) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') this.dot(x + i, y + j, on); });
  }

  /** One glyph in the cell starting at x; base is the baseline row. Returns the cell advance. */
  glyph(ch, x, base, font = 'L', on = 1) {
    if (ch === '⁻¹' && font === 'L') {
      this.bitmap(INVERSE.rows, x + INVERSE.x, base + INVERSE.bottom - INVERSE.rows.length + 1, on);
      return FONTS.L.pitch;
    }
    const sup = SUP[ch];
    const sub = subscript(ch);
    if (sup || sub) {
      if (font === 'L') {
        // inside main-font text: tiny digits within the cell height (top at the capital height), subscripts lowered
        const g = glyph('T', sup ?? sub);
        this.bitmap(g.rows, x + g.x, base + (sup ? -5 : 3) + g.bottom - g.rows.length + 1, on);
        return advance(ch, font);
      }
      // inside small text, in the text's own cells (User's Guide: Σx², ×10¹⁰, c₀): index-font glyphs; subscripts
      // stand on the baseline, superscripts end 3 rows above it (their 6-row digits reach the capital height)
      const g = glyph('I', sup ?? sub);
      this.bitmap(g.rows, x + g.x, (sup ? base - 3 : base) + g.bottom - g.rows.length + 1, on);
      return advance(ch, font);
    }
    const g = glyph(font, ch);
    this.bitmap(g.rows, x + g.x, base + g.bottom - g.rows.length + 1, on);
    return (FONTS[font] ?? FONTS.L).pitch;
  }

  /** Text from cell x on baseline `base`; returns the x after the last cell. opts: { font, invert, log } */
  text(text, x, base, { font = 'L', invert = false, log = true } = {}) {
    const start = x;
    for (const c of chars(text)) x += this.glyph(c, x, base, font, invert ? 0 : 1);
    if (log && String(text).trim()) this.runs.push({ x: start, y: base, text: plain(text) });
    return x;
  }

  /** Text whose last cell ends at x (exclusive). */
  textRight(text, right, base, opts = {}) {
    return this.text(text, right - textWidth(text, opts.font), base, opts);
  }

  /** Text on an inverted (dark) band covering the line's cells. */
  textInverse(text, x, base, w, font = 'L') {
    const f = FONTS[font];
    this.fill(x, base - f.ascent - 1, w ?? textWidth(text, font), f.ascent + f.descent + 2);
    this.text(text, x, base, { font, invert: true });
  }

  /** Logs text for descriptions without drawing it (formulas draw their own glyphs). */
  note(text, x, y) {
    if (String(text).trim()) this.runs.push({ x, y, text: plain(text) });
  }

  // ------------------------------------------------------------ status line

  icon(name) {
    const ic = ICONS[name];
    if (!ic) return;
    const oy = this.oy;
    this.oy = 0;
    if (ic.text) {
      let x = ic.x;
      for (const c of ic.text) x += this.glyph(c, x, ic.y + 6, 'T');
    } else this.bitmap(parse(ic.rows), ic.x, ic.y);
    this.oy = oy;
  }

  /** Plain text of what was drawn, line by line (top to bottom, left to right). */
  describe() {
    const lines = [];
    for (const r of [...this.runs].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const line = lines.find((l) => Math.abs(l.y - r.y) <= 3);
      if (line) line.parts.push(r.text);
      else lines.push({ y: r.y, parts: [r.text] });
    }
    return lines.map((l) => l.parts.join(' ')).join('\n');
  }
}

// Line grids of the calculator's screens (content rows): four lines in the main font, six in the small one.
export const LINES = [12, 28, 44, 60];
export const SMALL_LINES = [9, 19, 29, 39, 49, 59];

/** Page scrollbar at the right edge: 4 px wide (x 188–191), one segment of the track per page, rounded ends. */
export function scrollbar(lcd, page, pages) {
  if (pages <= 1) return;
  const top = 1 + Math.round((page * 62) / pages);
  const bot = Math.round(((page + 1) * 62) / pages);
  lcd.fill(188, top, 4, bot - top + 1);
  for (const y of [top, bot]) { lcd.dot(188, y, 0); lcd.dot(191, y, 0); }
}

/** Cell width of a glyph name from chars(): main-font text sets its raised and lowered characters in tiny cells. */
export function advance(ch, font = 'L') {
  return font === 'L' && (SUP[ch] || subscript(ch)) ? FONTS.T.pitch : (FONTS[font] ?? FONTS.L).pitch;
}

export function textWidth(text, font = 'L') {
  return chars(text).reduce((w, ch) => w + advance(ch, font), 0);
}

/**
 * Paints the buffer onto a canvas as solid pixels. The canvas is sized to the device pixels it covers and
 * each LCD pixel fills its whole cell, so neighbouring pixels join without gaps (as on the real display).
 */
export function present(lcd, canvas, ink = 'rgba(20, 22, 18, 0.92)') {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.max(WIDTH, Math.round(r.width * dpr));
  const H = Math.max(HEIGHT, Math.round(r.height * dpr));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = ink;
  const xs = (x) => Math.round((x * W) / WIDTH);
  const ys = (y) => Math.round((y * H) / HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    const y0 = ys(y), h = ys(y + 1) - y0;
    for (let x = 0; x < WIDTH; x++) {
      if (!lcd.bits[y * WIDTH + x]) continue;
      let e = x;
      while (e + 1 < WIDTH && lcd.bits[y * WIDTH + e + 1]) e++;
      ctx.fillRect(xs(x), y0, xs(e + 1) - xs(x), h);
      x = e;
    }
  }
}
