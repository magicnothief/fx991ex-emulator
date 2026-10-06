// Shared screens: paged menus, messages, errors, confirmations, digit prompts.
import { h } from '../../ui/render.js';
import { MENU_KEY } from '../keymap.js';
import { MENU_KEYS } from '../../core/constants.js';
import { t } from '../i18n.js';

/**
 * A paged menu. pages: [{ items: [{ label, run(calc) }], cols = 1, small = false }]
 * Items are numbered per page (1–9, A–F, M, x). ▲/▼ change page, ◀ returns to the parent menu.
 */
export class Menu {
  constructor(calc, pages, { sub = false, onClose = null, title = null } = {}) {
    this.calc = calc;
    this.pages = pages;
    this.page = 0;
    this.sub = sub;
    this.onClose = onClose;
    this.title = title;
    this.isMenu = true;
  }

  handle(ev) {
    const page = this.pages[this.page];
    const sel = MENU_KEY[ev.key];
    if (sel && !ev.shift) {
      const i = MENU_KEYS.indexOf(sel);
      const item = page.items[i];
      if (item && item.run) item.run(this.calc, this);
      return true;
    }
    switch (ev.action) {
      case 'down':
        this.page = (this.page + 1) % this.pages.length;
        return true;
      case 'up':
        this.page = (this.page - 1 + this.pages.length) % this.pages.length;
        return true;
      case 'left':
        if (this.sub) this.calc.pop();
        return true;
      case 'ac':
        closeMenus(this.calc);
        this.onClose?.();
        return true;
      case 'menu': case 'setup': case 'reset': case 'qr':
        return false;
      default:
        return true; // other keys are ignored while a menu is shown
    }
  }

  view() {
    const page = this.pages[this.page];
    const cols = page.cols || 1;
    const el = h('div', `menu${page.small ? ' small' : ''}`);
    if (this.title) el.append(h('div', 'item title', t(this.title)));
    const items = page.items.map((it, i) => h('div', 'item', `${MENU_KEYS[i]}:${t(it.label)}`));
    const rows = Math.ceil(page.items.length / cols) + (this.title ? 1 : 0);
    if (rows > 5) {
      // pages with many rows (CONV Length, Atomic&Nuclear) use a tighter line pitch
      for (const it of items) it.style.height = it.style.lineHeight = `calc(var(--lp) * ${(54 / rows).toFixed(2)})`;
      el.style.fontSize = `calc(var(--lp) * ${Math.min(8.2, 54 / rows - 1.2).toFixed(2)})`;
    }
    if (cols > 1) {
      const g = h('div', 'grid', items);
      g.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      el.append(g);
    } else el.append(...items);
    if (this.pages.length > 1) {
      const bar = h('div', 'scrollbar');
      const span = 100 / this.pages.length;
      bar.style.top = `${span * this.page}%`;
      bar.style.height = `${span}%`;
      el.append(bar);
    }
    return { el, status: { sub: this.sub } };
  }
}

/** Closes all menus on top of the stack. */
export function closeMenus(calc) {
  while (calc.screens.length > 1 && calc.top.isMenu) calc.screens.pop();
}

export const page = (items, opts = {}) => ({ items, ...opts });
export const item = (label, run) => ({ label, run });

/** A message screen (e.g. "No Solution"); AC, = or ◀▶ close it. */
export class Message {
  constructor(calc, lines, { onClose = null, keys = ['ac', 'eq', 'left', 'right'] } = {}) {
    this.calc = calc;
    this.lines = lines;
    this.onClose = onClose;
    this.keys = keys;
  }

  handle(ev) {
    if (this.keys.includes(ev.action)) {
      this.calc.pop();
      this.onClose?.(ev.action);
    }
    return true;
  }

  view() {
    return { el: h('div', 'message', this.lines.map((l) => h('div', null, t(l)))) };
  }
}

/** Error screen: AC cancels, ◀/▶ go back to the input at the error position. */
export class ErrorScreen {
  constructor(calc, kind, { onCancel, onGoto }) {
    this.calc = calc;
    this.kind = kind;
    this.onCancel = onCancel;
    this.onGoto = onGoto;
  }

  handle(ev) {
    if (ev.action === 'ac') { this.calc.pop(); this.onCancel?.(); }
    else if (ev.action === 'left' || ev.action === 'right') { this.calc.pop(); this.onGoto?.(); }
    else if (['menu', 'setup', 'reset'].includes(ev.action)) return false;
    return true;
  }

  view() {
    const goto = this.onGoto ? h('div', null, t('[◀][▶]:Goto')) : null;
    return { el: h('div', 'message', h('div', 'big', t(this.kind)), h('div', null, ' '), h('div', null, t('[AC] :Cancel')), goto) };
  }
}

/** "Yes:[=]  Cancel:[AC]" confirmation. */
export class Confirm {
  constructor(calc, question, onYes) {
    this.calc = calc;
    this.question = question;
    this.onYes = onYes;
  }

  handle(ev) {
    if (ev.action === 'eq') { this.calc.pop(); this.onYes(); }
    else if (ev.action === 'ac') this.calc.pop();
    return true;
  }

  view() {
    return { el: h('div', 'message', h('div', null, t(this.question)), h('div', null, ' '), h('div', null, t('Yes   :[=]')), h('div', null, t('Cancel:[AC]'))) };
  }
}

/** Prompts for a single digit within a range, e.g. "Fix 0~9?". */
export class DigitPrompt {
  constructor(calc, text, min, max, onDigit) {
    this.calc = calc;
    this.text = text;
    this.min = min;
    this.max = max;
    this.onDigit = onDigit;
    this.isMenu = true;
  }

  handle(ev) {
    const d = /^tok:(\d)$/.exec(ev.action || '');
    if (d && +d[1] >= this.min && +d[1] <= this.max) this.onDigit(+d[1]);
    else if (ev.action === 'ac') closeMenus(this.calc);
    else if (ev.action === 'left') this.calc.pop();
    return true;
  }

  view() {
    return { el: h('div', 'menu', h('div', 'item', t(this.text))) };
  }
}
