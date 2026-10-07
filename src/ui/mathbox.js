// Natural Textbook Display on the pixel LCD: lays out editor trees and results as boxes and draws them.
// A box is { w, asc, desc, draw(lcd, x, base), text }: asc rows above and desc rows below the baseline row.
// Layout rules measured from the fx-991CE X User's Guide screenshots (4⁄5+2⁄3, (1+√2)⁄√2, 7⁄10 …).
import { glyph, chars, textWidth } from './lcd.js';
import { FONTS } from './lcdfont.js';
import { tokenInfo } from '../core/tokens.js';
import { groupDigits } from '../core/format.js';

// main style (L font) and the small style of exponents, limits and indices (S font)
// axis: fraction bar above the baseline; numGap/denGap: rows from the bar to the numerator box bottom
// (exclusive) and to the denominator top (fx-991CE X User's Guide: 4⁄5+2⁄3, (1+√2)⁄√2)
const STYLE = {
  L: { font: 'L', pitch: 11, asc: 11, desc: 1, axis: 5, raise: 7, numGap: 2, denGap: 3 },
  S: { font: 'S', pitch: 6, asc: 8, desc: 2, axis: 4, raise: 4, numGap: 0, denGap: 2 },
};
const smaller = () => STYLE.S;

const box = (w, asc, desc, draw, text = '') => ({ w, asc, desc, draw, text });

/** A run of glyphs in one style. */
export function textBox(str, st = STYLE.L, font = st.font) {
  const cs = chars(str);
  // main-font subscripts (constants such as c₀, μ_N) reach 3 rows below the baseline
  const desc = font === 'L' && cs.some((c) => /^_.|^[₀-₉ₚ]$/.test(c)) ? 3 : st.desc;
  return box(textWidth(str, font), st.asc, desc, (lcd, x, base) => {
    for (const c of cs) x += lcd.glyph(c, x, base, font);
  }, String(str));
}

export function row(items) {
  items = items.filter(Boolean);
  const w = items.reduce((s, b) => s + b.w, 0);
  const asc = Math.max(0, ...items.map((b) => b.asc));
  const desc = Math.max(0, ...items.map((b) => b.desc));
  const r = box(w, asc, desc, (lcd, x, base) => {
    for (const b of items) { b.draw(lcd, x, base); x += b.w; }
  }, items.map((b) => b.text).join(''));
  r.bars = items.some((b) => b.bars); // holds a fraction bar
  return r;
}

/**
 * Fraction as in the User's Guide (4⁄5: numerator rows 1–12, bar on row 15, denominator rows 18–29): the bar
 * 5 rows above the baseline with two blank rows on each side, running from 1 px into the box to its end; the
 * parts start 2 px in. When the numerator or denominator holds a fraction itself, the main bar reaches 2 px
 * further on each side, so it is clearly the longest (stacked fractions).
 */
export function frac(num, den, st = STYLE.L) {
  const inner = Math.max(num.w, den.w);
  const pad = num.bars || den.bars ? 2 : 0;
  const w = inner + 4 + 2 * pad;
  const bar = -st.axis;
  const numBase = bar - st.numGap - num.desc;
  const denBase = bar + st.denGap + den.asc;
  const b = box(w, -(numBase - num.asc), denBase + den.desc, (lcd, x, base) => {
    lcd.hline(x + 1, x + w - 1, base + bar);
    num.draw(lcd, x + 2 + pad + Math.floor((inner - num.w) / 2), base + numBase);
    den.draw(lcd, x + 2 + pad + Math.floor((inner - den.w) / 2), base + denBase);
  }, `(${num.text})/(${den.text})`);
  b.bars = true;
  return b;
}

/** Exponent: small style with its bottom 7 rows above the baseline (higher when it holds a fraction). */
export function raised(exp, st = STYLE.L) {
  const lift = st.raise + Math.max(0, exp.desc - STYLE.S.desc);
  return box(exp.w + 1, lift + exp.asc, 0, (lcd, x, base) => exp.draw(lcd, x + 1, base - lift), `^(${exp.text})`);
}

/** Subscript (logarithm base): small style lowered below the baseline. */
export function lowered(sub) {
  return box(sub.w + 1, Math.max(0, sub.asc - 3), sub.desc + 3, (lcd, x, base) => sub.draw(lcd, x + 1, base + 3), `_(${sub.text})`);
}

/**
 * Radical as in the User's Guide ((1+√2)⁄√2): 12 px before the radicand and 2 px after it; a
 * tick and diagonal ending one row below the radicand's baseline, a stroke up to an overline 3 rows above
 * the radicand that ends on the radicand's last column.
 */
export function radical(rad, index = null) {
  const lead = Math.max(12, index ? index.w + 7 : 0);
  const w = lead + rad.w + 2;
  const r = box(w, rad.asc + 3, Math.max(rad.desc, 1), (lcd, x, base) => {
    const c = x + lead; // radicand start
    const top = base - rad.asc; // radicand top row
    const b = base + Math.max(rad.desc, 1) - 1; // reference baseline for the fixed lower part
    lcd.hline(c - 4, c + rad.w - 1, top - 3);
    lcd.vline(c - 4, top - 2, top);
    lcd.vline(c - 5, top + 1, b - 4);
    // tick and diagonal (fixed shape at the bottom)
    for (const [dx, dy] of [[-8, -7], [-9, -6], [-8, -6], [-9, -5], [-7, -5], [-7, -4], [-7, -3], [-6, -3], [-7, -2], [-6, -2], [-6, -1], [-6, 0], [-6, 1]]) {
      lcd.dot(c + dx, b + dy);
    }
    if (index) index.draw(lcd, c - 6 - index.w, b - 8);
    rad.draw(lcd, c - 2, base); // the radicand's cells start 2 px before the sign's reference column
  }, `√(${rad.text})`);
  r.bars = rad.bars;
  return r;
}

/** Parenthesis glyph, stretched to cover asc/desc when the content is taller than a line. */
function paren(open, asc, desc, st = STYLE.L) {
  const g = glyph(st.font, open ? '(' : ')');
  const normal = asc <= st.asc && desc <= st.desc;
  return box(st.pitch, Math.max(asc, st.asc), Math.max(desc, st.desc), (lcd, x, base) => {
    if (normal) { lcd.glyph(open ? '(' : ')', x, base, st.font); return; }
    const rows = g.rows;
    const h = asc + desc + 1;
    const head = rows.slice(0, 4), tail = rows.slice(-4), mid = rows[Math.floor(rows.length / 2)];
    const out = [...head, ...Array(Math.max(0, h - 8)).fill(mid), ...tail];
    lcd.bitmap(out, x + g.x, base - asc);
  }, open ? '(' : ')');
}

/**
 * Empty input box: solid outline (User's Guide p.8) sitting on the baseline like a digit, with the blank
 * descender row below it; when the cursor is in the box it blinks inside the outline.
 */
function emptyBox(st, cursor = null) {
  const h = st === STYLE.L ? 10 : 7;
  const bw = st === STYLE.L ? 7 : 5;
  return box(bw + 2, h - 1, st.desc, (lcd, x, base) => {
    lcd.frame(x + 1, base - h + 1, bw, h);
    if (cursor && lcd.cursorOn) {
      if (cursor.block) lcd.fill(x + 2, base - h + 2, bw - 2, h - 2);
      else lcd.vline(x + 3, base - h + 2, base - 1);
    }
  }, '□');
}

function cursorBox(st, state) {
  return box(0, st.asc, st.desc, (lcd, x, base) => {
    if (!lcd.cursorOn) return;
    if (state.block) lcd.fill(x, base - st.asc, st.pitch - 1, st.asc + st.desc + 1);
    else lcd.vline(x, base - st.asc, base + st.desc);
  }, '');
}

// ---------------------------------------------------------------- editor trees

const POSTFIX_SUP = { '²': '2', '³': '3', '⁻¹': '−1' };
const ITALIC = { vx: '𝑥', vy: '𝑦' };

function tokenText(id) {
  if (ITALIC[id]) return ITALIC[id];
  if (id === 'neg') return '-'; // the sign of a negative number: shorter than the subtraction operator
  if (id === 'vi' || id === 'i') return '𝑖';
  if (id === 'e') return '𝑒';
  return tokenInfo(id).text;
}

/** Lays out a slot (array of nodes) in style st; the cursor is drawn where opts.cursor points. */
function slotBox(slot, st, opts, root = false) {
  const here = opts.cursor && opts.cursor.slot === slot;
  if (slot.length === 0 && !root) return emptyBox(st, here ? opts.cursorState ?? {} : null);
  const items = [];
  const parens = []; // indices of '(' boxes for stretching
  const add = (b, kind) => { items.push(b); if (kind) parens.push([kind, items.length - 1]); };
  slot.forEach((nd, i) => {
    if (here && opts.cursor.idx === i) add(cursorBox(st, opts.cursorState ?? {}));
    if (nd.k === 'tpl') { add(templateBox(nd, st, opts)); return; }
    if (POSTFIX_SUP[nd.id]) { add(raised(textBox(POSTFIX_SUP[nd.id], smaller()), st)); return; }
    const text = tokenText(nd.id);
    if (text.length > 1 && text.endsWith('(')) {
      add(textBox(text.slice(0, -1), st));
      add(paren(true, st.asc, st.desc, st), 'open');
    } else if (text === '(') add(paren(true, st.asc, st.desc, st), 'open');
    else if (text === ')') add(paren(false, st.asc, st.desc, st), 'close');
    else add(textBox(text, st));
  });
  if (here && opts.cursor.idx === slot.length) add(cursorBox(st, opts.cursorState ?? {}));
  stretchParens(items, parens, st);
  return row(items);
}

/** Matching parentheses grow to the height of what they enclose. */
function stretchParens(items, parens, st) {
  const stack = [];
  for (const [kind, i] of parens) {
    if (kind === 'open') { stack.push(i); continue; }
    const j = stack.pop();
    if (j == null) continue;
    const inner = items.slice(j + 1, i);
    const asc = Math.max(st.asc, ...inner.map((b) => b.asc));
    const desc = Math.max(st.desc, ...inner.map((b) => b.desc));
    if (asc > st.asc || desc > st.desc) {
      items[j] = paren(true, asc, desc, st);
      items[i] = paren(false, asc, desc, st);
    }
  }
}

function templateBox(nd, st, opts) {
  const s = (i, style = st) => slotBox(nd.s[i], style, opts);
  const sm = smaller();
  switch (nd.id) {
    case 'frac': return frac(s(0), s(1), st);
    case 'mixed': return row([s(0), frac(s(1), s(2), st)]);
    case 'sqrt': return radical(s(0));
    case 'cbrt': return radical(s(0), textBox('3', sm));
    case 'root': return radical(s(1), s(0, sm));
    case 'pow': return raised(s(0, sm), st);
    case 'pow10': return row([textBox('10', st), raised(s(0, sm), st)]);
    case 'exp': return row([textBox('𝑒', st), raised(s(0, sm), st)]);
    case 'e10': return row([textBox('×10', st), raised(s(0, sm), st)]);
    case 'logab': {
      const arg = s(1);
      return row([textBox('log', st), lowered(s(0, sm)), paren(true, arg.asc, arg.desc, st), arg, paren(false, arg.asc, arg.desc, st)]);
    }
    case 'abs': {
      const inner = s(0);
      return box(inner.w + 6, inner.asc + 1, inner.desc + 1, (lcd, x, base) => {
        lcd.vline(x + 1, base - inner.asc - 1, base + inner.desc + 1);
        inner.draw(lcd, x + 3, base);
        lcd.vline(x + inner.w + 4, base - inner.asc - 1, base + inner.desc + 1);
      }, `Abs(${inner.text})`);
    }
    case 'box': return s(0);
    case 'int': return integral(s(0), s(1, sm), s(2, sm), st);
    case 'diff': {
      const f = s(0), at = s(1, sm);
      const ddx = frac(textBox('d', st), row([textBox('d', st), textBox('𝑥', st)]), st);
      return row([ddx, paren(true, f.asc, f.desc, st), f, paren(false, f.asc, f.desc, st),
        box(at.w + 14, 0, at.desc + 4, (lcd, x, base) => {
          lcd.vline(x + 1, base - 10, base + 3);
          lcd.text('𝑥=', x + 3, base + 4, { font: 'S', log: false });
          at.draw(lcd, x + 15, base + 4);
        }, `|x=${at.text}`)]);
    }
    case 'sum': return summation(s(0), s(1, sm), s(2, sm), st);
    default: return textBox('?', st);
  }
}

/** ∫ with the limits beside the sign, then f(x) dx. */
function integral(f, lo, hi, st) {
  const h = Math.max(f.asc, 11) + 4;
  const d = Math.max(f.desc, 1) + 3;
  const limW = Math.max(lo.w, hi.w);
  const sign = box(7 + limW, h, d, (lcd, x, base) => {
    const top = base - h, bot = base + d;
    lcd.dot(x + 5, top); lcd.dot(x + 6, top + 1); lcd.dot(x + 4, top);
    lcd.vline(x + 3, top + 1, bot - 1);
    lcd.dot(x + 2, bot); lcd.dot(x + 1, bot); lcd.dot(x, bot - 1);
    hi.draw(lcd, x + 7, top + hi.asc);
    lo.draw(lcd, x + 7, bot);
  }, `∫(${lo.text},${hi.text})`);
  return row([sign, f, textBox('d', st), textBox('𝑥', st)]);
}

/** Σ with the upper limit above, x=lower below, then (f(x)). */
function summation(f, lo, hi, st) {
  const loRow = row([textBox('𝑥=', STYLE.S), lo]);
  const w = Math.max(11, loRow.w, hi.w);
  const sign = box(w + 1, 11 + hi.asc + hi.desc + 1, 1 + loRow.asc + loRow.desc, (lcd, x, base) => {
    lcd.glyph('Σ', x + Math.floor((w - 11) / 2), base, 'L');
    hi.draw(lcd, x + Math.floor((w - hi.w) / 2), base - 12 - hi.desc);
    loRow.draw(lcd, x + Math.floor((w - loRow.w) / 2), base + 1 + loRow.asc);
  }, `Σ(${lo.text},${hi.text})`);
  return row([sign, paren(true, f.asc, f.desc, st), f, paren(false, f.asc, f.desc, st)]);
}

/** Editor contents as a box. opts: { math, cursor: { slot, idx } | null, cursorState } */
export function editorBox(nodes, opts) {
  if (!opts.math) return lineBox(nodes, opts);
  return slotBox(nodes, STYLE.L, opts, true);
}

/** Line input: plain glyphs; in overwrite mode the cursor underlines the character it replaces. */
function lineBox(nodes, opts) {
  const st = STYLE.L;
  const items = [];
  nodes.forEach((nd, i) => {
    const here = opts.cursor && opts.cursor.slot === nodes && opts.cursor.idx === i;
    const b = textBox(tokenText(nd.id).replace(/[𝑥𝑦]/g, (c) => c), st);
    if (here && opts.cursorState?.overwrite) {
      items.push(box(b.w, b.asc, b.desc, (lcd, x, base) => { b.draw(lcd, x, base); if (lcd.cursorOn) lcd.hline(x, x + b.w - 2, base + 1); }, b.text));
      return;
    }
    if (here) items.push(cursorBox(st, opts.cursorState ?? {}));
    items.push(b);
  });
  if (opts.cursor && opts.cursor.slot === nodes && opts.cursor.idx === nodes.length) items.push(cursorBox(st, opts.cursorState ?? {}));
  return row(items);
}

// ---------------------------------------------------------------- results

/** A result model (core/format.js) as a box. opts: { line, digitSep } */
export function modelBox(m, opts = {}, st = STYLE.L) {
  const num = (s) => groupDigits(String(s).replace('.', ','), opts.digitSep, ',');
  const t = (s) => textBox(s, st);
  const neg = (b, isNeg) => (isNeg ? row([t('-'), b]) : b); // short sign of a negative value ("-25", p.25)
  switch (m.t) {
    case 'dec': {
      const items = [t(num(m.m))];
      if (m.sym) items.push(textBox(m.sym, st, 'E'));
      if (m.e != null) items.push(t('×10'), raised(textBox(String(m.e), STYLE.S), st));
      return row(items);
    }
    case 'frac': return neg(frac(t(m.n), t(m.d), st), m.neg);
    case 'mixed': return neg(row([t(m.w), frac(t(m.n), t(m.d), st)]), m.neg);
    case 'surd': {
      const terms = m.terms.map((tm, i) => row([
        i > 0 ? t(tm.s === '-' ? '−' : '+') : tm.s === '-' ? t('-') : null,
        tm.c ? t(tm.c) : null,
        tm.r ? radical(t(tm.r)) : null,
      ]));
      const body = row(terms);
      return neg(m.den ? frac(body, t(m.den), st) : body, m.neg);
    }
    case 'pi': {
      const coef = m.d === '1' ? (m.n === '1' ? null : t(m.n)) : frac(t(m.n), t(m.d), st);
      // after a fraction the π is centred on the fraction bar, 1 row above the baseline
      const pi = coef?.bars ? box(st.pitch, st.asc + 1, 0, (lcd, x, base) => lcd.glyph('π', x, base - 1, st.font), 'π') : t('π');
      return neg(row([coef, pi]), m.neg);
    }
    case 'dms': return t(`${m.neg ? '-' : ''}${m.deg}°${m.min}'${num(m.sec)}"`);
    case 'fact': {
      const items = [];
      m.factors.forEach(([p, e], i) => {
        if (i) items.push(t('×'));
        items.push(t(String(p)));
        if (e > 1) items.push(raised(textBox(String(e), STYLE.S), st));
      });
      if (m.rest > 1n) items.push(t(`${items.length ? '×' : ''}(${m.rest})`));
      return row(items);
    }
    case 'cplx': {
      const items = [];
      if (m.re) items.push(modelBox(m.re, opts, st));
      if (m.im) {
        const imNeg = m.im.neg || (m.im.t === 'dec' && m.im.m.startsWith('-'));
        const imAbs = imNeg ? stripSign(m.im) : m.im;
        if (m.re) items.push(t(imNeg ? '−' : '+'));
        else if (imNeg) items.push(t('-'));
        const unit = m.im.t === 'dec' && m.im.m.replace('-', '') === '1' && m.im.e == null;
        if (!unit) items.push(modelBox(imAbs, opts, st));
        items.push(t('𝑖'));
      }
      return items.length ? row(items) : t('0');
    }
    case 'polar': return row([modelBox(m.r, opts, st), t('∠'), modelBox(m.theta, opts, st)]);
    case 'cfrac': {
      const items = [];
      if (m.re) items.push(modelBox(m.re, opts, st), t(m.im.neg ? '−' : '+'));
      else if (m.im.neg) items.push(t('-'));
      const im = { ...m.im, neg: false };
      const unit = im.terms.length === 1 && !im.terms[0].r && im.terms[0].c === '1';
      if (!unit) items.push(modelBox(im, opts, st));
      items.push(t('𝑖'));
      return frac(row(items), t(m.den), st);
    }
    default: return t('?');
  }
}

function stripSign(m) {
  if (m.t === 'dec') return { ...m, m: m.m.replace(/^-/, '') };
  return { ...m, neg: false };
}

/** Draws a box and logs its text for descriptions. */
export function drawBox(lcd, b, x, base) {
  b.draw(lcd, x, base);
  lcd.note(b.text, x, base);
}

export { STYLE, FONTS };
