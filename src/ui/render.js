// DOM rendering of editor contents and result display models for the LCD.
import { tokenInfo } from '../core/tokens.js';
import { modelText, groupDigits } from '../core/format.js';

export function h(tag, cls, ...children) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ITALIC_VARS = new Set(['vx', 'vy']);
const OPS = new Set(['+', '-', '×', '÷', '=', ',', ':', '∠', 'P', 'C', '•']);

export function cursorEl(state) {
  const cls = ['cursor'];
  if (state.overwrite) cls.push('over');
  if (state.block) cls.push('block');
  return h('span', cls.join(' '));
}

/**
 * Renders editor nodes. opts: { math, cursor: { slot, idx } | null, cursorState }
 */
export function renderNodes(nodes, opts) {
  return opts.math ? renderSlot(nodes, opts, true) : renderLine(nodes, opts);
}

function renderLine(nodes, opts) {
  const row = h('span', 'expr-line');
  const over = opts.cursorState?.overwrite;
  nodes.forEach((nd, i) => {
    const here = opts.cursor && opts.cursor.slot === nodes && opts.cursor.idx === i;
    const info = tokenInfo(nd.id);
    const text = ITALIC_VARS.has(nd.id) ? h('i', 'm-var', info.text) : info.text;
    // in overwrite mode the cursor underlines the character it will replace
    if (here && over) { row.append(h('span', 'cursor under', text)); return; }
    if (here) row.append(cursorEl(opts.cursorState));
    row.append(text);
  });
  if (opts.cursor && opts.cursor.slot === nodes && opts.cursor.idx === nodes.length) row.append(cursorEl(opts.cursorState));
  return row;
}

function renderSlot(slot, opts, root = false) {
  const row = h('span', 'm-row');
  const here = opts.cursor && opts.cursor.slot === slot;
  if (slot.length === 0 && !root) {
    // an empty box stays visible with the cursor on its left edge (User's Guide p.8: ▮□⁄□)
    if (here) row.append(cursorEl(opts.cursorState));
    row.append(h('span', 'm-slot-empty'));
    return row;
  }
  slot.forEach((nd, i) => {
    if (here && opts.cursor.idx === i) row.append(cursorEl(opts.cursorState));
    row.append(nd.k === 'tpl' ? renderTemplate(nd, opts) : renderToken(nd));
  });
  if (here && opts.cursor.idx === slot.length) row.append(cursorEl(opts.cursorState));
  return row;
}

function renderToken(nd) {
  const info = tokenInfo(nd.id);
  if (nd.id === '²') return h('span', 'm-sup', '2');
  if (nd.id === '³') return h('span', 'm-sup', '3');
  if (nd.id === '⁻¹') return h('span', 'm-sup', '−1');
  if (ITALIC_VARS.has(nd.id)) return h('i', 'm-var', info.text);
  if (nd.id === 'neg') return h('span', 'm-neg', '-');
  if (OPS.has(nd.id)) return h('span', 'm-op', info.text);
  return document.createTextNode(info.text);
}

function renderTemplate(nd, opts) {
  const s = (i) => renderSlot(nd.s[i], opts);
  switch (nd.id) {
    case 'frac': return h('span', 'm-frac', h('span', 'm-num', s(0)), h('span', 'm-den', s(1)));
    case 'mixed': return h('span', 'm-mixed', s(0), h('span', 'm-frac', h('span', 'm-num', s(1)), h('span', 'm-den', s(2))));
    case 'sqrt': return h('span', 'm-root', h('span', 'm-radical', '√'), h('span', 'm-radicand', s(0)));
    case 'cbrt': return h('span', 'm-root', h('span', 'm-index', '3'), h('span', 'm-radical', '√'), h('span', 'm-radicand', s(0)));
    case 'root': return h('span', 'm-root', h('span', 'm-index', s(0)), h('span', 'm-radical', '√'), h('span', 'm-radicand', s(1)));
    case 'pow': return h('span', 'm-sup', s(0));
    case 'pow10': return h('span', 'm-row', '10', h('span', 'm-sup', s(0)));
    case 'exp': return h('span', 'm-row', h('i', 'm-var', 'e'), h('span', 'm-sup', s(0)));
    case 'e10': return h('span', 'm-row', '×10', h('span', 'm-sup', s(0)));
    case 'logab': return h('span', 'm-row', 'log', h('span', 'm-sub', s(0)), h('span', 'm-paren', '(', s(1), ')'));
    case 'abs': return h('span', 'm-abs', s(0));
    case 'box': return s(0);
    case 'int': return h('span', 'm-int', h('span', 'm-sign', '∫'), h('span', 'm-limits', s(2), s(1)), s(0), h('span', 'm-row', 'd', h('i', 'm-var', 'x')));
    case 'diff': return h('span', 'm-diff m-row',
      h('span', 'm-frac', h('span', 'm-num', 'd'), h('span', 'm-den', 'd', h('i', 'm-var', 'x'))),
      h('span', 'm-paren', '(', s(0), ')'),
      h('span', 'm-at', h('span', 'm-bar'), h('span', 'm-sub', h('i', 'm-var', 'x'), '=', s(1))));
    case 'sum': return h('span', 'm-sum',
      h('span', 'm-stack', s(2), h('span', 'm-sign', 'Σ'), h('span', 'm-row', h('i', 'm-var', 'x'), '=', s(1))),
      h('span', 'm-paren', '(', s(0), ')'));
    default: return document.createTextNode('?');
  }
}

// ---------------------------------------------------------------- result models

/** opts: { line: bool, decimalMark, digitSep } */
export function renderModel(m, opts = {}) {
  opts = { decimalMark: ',', ...opts }; // the fx-991CE X always shows a decimal comma
  if (opts.line) return h('span', null, modelText(m, opts));
  const num = (s) => groupDigits(s.replace('.', opts.decimalMark), opts.digitSep, opts.decimalMark);
  const sign = (neg) => (neg ? h('span', 'm-neg', '-') : null);
  const frac = (n, d) => h('span', 'm-frac', h('span', 'm-num', n), h('span', 'm-den', d));
  switch (m.t) {
    case 'dec': {
      const parts = [num(m.m)];
      if (m.sym) parts.push(m.sym);
      if (m.e != null) parts.push('×10', h('span', 'm-sup', String(m.e).replace('-', '−')));
      return h('span', 'm-row', parts);
    }
    case 'frac': return h('span', 'm-row', sign(m.neg), frac(m.n, m.d));
    case 'mixed': return h('span', 'm-row m-mixed', sign(m.neg), m.w, frac(m.n, m.d));
    case 'surd': {
      const terms = m.terms.map((t, i) => h('span', 'm-row',
        i > 0 || t.s === '-' ? h('span', i > 0 ? 'm-op' : 'm-neg', t.s === '-' ? (i > 0 ? '−' : '-') : '+') : null,
        t.c,
        t.r ? h('span', 'm-root', h('span', 'm-radical', '√'), h('span', 'm-radicand', t.r)) : null));
      const body = h('span', 'm-row', terms);
      return h('span', 'm-row', sign(m.neg), m.den ? frac(body, m.den) : body);
    }
    case 'pi': {
      const coef = m.d === '1' ? (m.n === '1' ? null : m.n) : frac(m.n, m.d);
      return h('span', 'm-row', sign(m.neg), coef, 'π');
    }
    case 'dms': return h('span', 'm-row', m.neg ? '-' : '', `${m.deg}°${m.min}’${num(m.sec)}”`);
    case 'fact': {
      const parts = [];
      m.factors.forEach(([p, e], i) => {
        if (i) parts.push('×');
        parts.push(String(p));
        if (e > 1) parts.push(h('span', 'm-sup', String(e)));
      });
      if (m.rest > 1n) parts.push(parts.length ? '×' : '', `(${m.rest})`);
      return h('span', 'm-row', parts);
    }
    case 'cplx': {
      const parts = [];
      if (m.re) parts.push(renderModel(m.re, opts));
      if (m.im) {
        const imNeg = m.im.neg || (m.im.t === 'dec' && m.im.m.startsWith('-'));
        const imAbs = imNeg ? stripSign(m.im) : m.im;
        if (m.re) parts.push(h('span', 'm-op', imNeg ? '−' : '+'));
        else if (imNeg) parts.push(h('span', 'm-neg', '-'));
        const unit = m.im.t === 'dec' && m.im.m.replace('-', '') === '1' && m.im.e == null ? null : renderModel(imAbs, opts);
        parts.push(unit, h('i', 'm-var', 'i'));
      }
      if (!parts.length) parts.push('0');
      return h('span', 'm-row', parts);
    }
    case 'polar': return h('span', 'm-row', renderModel(m.r, opts), h('span', 'm-op', '∠'), renderModel(m.theta, opts));
    case 'cfrac': {
      const parts = [];
      if (m.re) parts.push(renderModel(m.re, opts));
      if (m.re) parts.push(h('span', 'm-op', m.im.neg ? '−' : '+'));
      else if (m.im.neg) parts.push(h('span', 'm-neg', '-'));
      const im = { ...m.im, neg: false };
      const unit = im.terms.length === 1 && !im.terms[0].r && im.terms[0].c === '1';
      if (!unit) parts.push(renderModel(im, opts));
      parts.push(h('i', 'm-var', 'i'));
      return frac(h('span', 'm-row', parts), m.den);
    }
    default: return h('span', null, '?');
  }
}

function stripSign(m) {
  if (m.t === 'dec') return { ...m, m: m.m.replace(/^-/, '') };
  return { ...m, neg: false };
}
