// Expression editor shared by every input screen.
// Math (Natural Textbook) input builds a tree of tokens and templates; Line input is a flat token list.
//   node = { k: 'tok', id } | { k: 'tpl', id, s: [slot, ...] }   slot = node[]
import { TEMPLATES, tokenInfo } from './tokens.js';

export const MAX_INPUT = 199; // fx-991EX input capacity in bytes (one node ≈ one byte here)

const tok = (id) => ({ k: 'tok', id });
const tpl = (id, slots) => ({ k: 'tpl', id, s: slots ?? Array.from({ length: TEMPLATES[id] }, () => []) });

// Vertical neighbours inside templates: [from slot, ▲ target, ▼ target]
const VERTICAL = {
  frac: { 0: [null, 1], 1: [0, null] },
  mixed: { 1: [null, 2], 2: [1, null] },
  int: { 0: [2, 1], 1: [0, null], 2: [null, 0] },
  sum: { 0: [2, 1], 1: [0, null], 2: [null, 0] },
};

export class Editor {
  constructor(math = true, nodes = []) {
    this.math = math;
    this.root = nodes;
    this.path = []; // [{ node, slot }]
    this.idx = nodes.length;
    this.overwrite = false;
    this.insArmed = false; // INS pressed: next template wraps the operand at the cursor
  }

  static clone(nodes) { return structuredClone(nodes); }

  get slot() {
    const top = this.path[this.path.length - 1];
    return top ? top.node.s[top.slot] : this.root;
  }

  isEmpty() { return this.root.length === 0; }

  clear() {
    this.root = [];
    this.path = [];
    this.idx = 0;
    this.insArmed = false;
  }

  load(nodes, cursorAtEnd = true) {
    this.root = Editor.clone(nodes);
    this.path = [];
    this.idx = cursorAtEnd ? this.root.length : 0;
    this.insArmed = false;
  }

  size() {
    const count = (slot) => slot.reduce((n, nd) => n + 1 + (nd.k === 'tpl' ? nd.s.reduce((m, s) => m + count(s), 0) : 0), 0);
    return count(this.root);
  }

  /** Remaining bytes; the cursor turns into a block when ≤ 10 remain. */
  remaining() { return MAX_INPUT - this.size(); }

  // ------------------------------------------------------------ insertion

  insert(id) {
    if (this.remaining() <= 0) return false;
    if (!this.math && this.overwrite && this.idx < this.slot.length) {
      this.slot.splice(this.idx, 1, tok(id));
    } else {
      this.slot.splice(this.idx, 0, tok(id));
    }
    this.idx++;
    this.insArmed = false;
    return true;
  }

  insertMany(ids) { for (const id of ids) this.insert(id); }

  /** Inserts a template; in Math mode some templates absorb the operand before the cursor. */
  insertTemplate(id) {
    if (this.remaining() <= 1) return false;
    const node = tpl(id);
    const slot = this.slot;
    // x▪ directly after an exponent box does nothing (2³ then x▪ stays 2³)
    if (id === 'pow' && this.math && slot[this.idx - 1]?.k === 'tpl' && slot[this.idx - 1].id === 'pow') return false;
    if (this.insArmed) {
      // wrap the operand to the right of the cursor
      const end = operandEnd(slot, this.idx);
      const taken = slot.splice(this.idx, end - this.idx);
      node.s[firstWrapSlot(id)] = taken;
      slot.splice(this.idx, 0, node);
      this.insArmed = false;
      this.idx++;
      return true;
    }
    if (id === 'frac') {
      const start = operandStart(slot, this.idx);
      if (start < this.idx) {
        node.s[0] = slot.splice(start, this.idx - start);
        slot.splice(start, 0, node);
        this.path.push({ node, slot: 1 });
        this.idx = 0;
        return true;
      }
    }
    slot.splice(this.idx, 0, node);
    this.path.push({ node, slot: 0 });
    this.idx = 0;
    return true;
  }

  // ------------------------------------------------------------ deletion

  del() {
    this.insArmed = false;
    const slot = this.slot;
    if (!this.math && this.overwrite && this.idx < slot.length) {
      slot.splice(this.idx, 1);
      return;
    }
    if (this.idx > 0) {
      const prev = slot[this.idx - 1];
      if (prev.k === 'tpl' && prev.s.some((s) => s.length)) {
        this.enterFromRight(prev);
        return;
      }
      slot.splice(this.idx - 1, 1);
      this.idx--;
      return;
    }
    const top = this.path[this.path.length - 1];
    if (!top) return;
    if (top.slot > 0 && top.node.s[top.slot - 1].length > 0) {
      this.left();
      return;
    }
    // At the start of a template: remove the template and keep the contents of its first slot.
    this.path.pop();
    const parent = this.slot;
    const pos = parent.indexOf(top.node);
    const keep = top.node.s.find((s) => s.length) ?? [];
    parent.splice(pos, 1, ...keep);
    this.idx = pos;
  }

  // ------------------------------------------------------------ cursor movement

  right() {
    const slot = this.slot;
    if (this.idx < slot.length) {
      const node = slot[this.idx];
      if (this.math && node.k === 'tpl') {
        this.path.push({ node, slot: 0 });
        this.idx = 0;
      } else this.idx++;
      return;
    }
    const top = this.path[this.path.length - 1];
    if (!top) { this.idx = 0; return; } // wrap around
    if (top.slot < top.node.s.length - 1) {
      top.slot++;
      this.idx = 0;
      return;
    }
    this.path.pop();
    this.idx = this.slot.indexOf(top.node) + 1;
  }

  left() {
    if (this.idx > 0) {
      const node = this.slot[this.idx - 1];
      if (this.math && node.k === 'tpl') this.enterFromRight(node);
      else this.idx--;
      return;
    }
    const top = this.path[this.path.length - 1];
    if (!top) { this.idx = this.root.length; return; } // wrap around
    if (top.slot > 0) {
      top.slot--;
      this.idx = top.node.s[top.slot].length;
      return;
    }
    this.path.pop();
    this.idx = this.slot.indexOf(top.node);
  }

  enterFromRight(node) {
    const last = node.s.length - 1;
    this.path.push({ node, slot: last });
    this.idx = node.s[last].length;
  }

  /** ▲/▼ inside fractions and integral/sum limits. Returns false when not applicable. */
  vertical(dir) {
    for (let i = this.path.length - 1; i >= 0; i--) {
      const { node, slot } = this.path[i];
      const map = VERTICAL[node.id];
      const target = map?.[slot]?.[dir === 'up' ? 0 : 1];
      if (target != null) {
        const innermost = i === this.path.length - 1;
        this.path.length = i + 1;
        this.path[i].slot = target;
        this.idx = innermost ? Math.min(this.idx, node.s[target].length) : node.s[target].length;
        return true;
      }
    }
    return false;
  }

  home() { this.path = []; this.idx = 0; }
  end() { this.path = []; this.idx = this.root.length; }

  /** Cursor location used by renderers: the slot array and index. */
  cursor() { return { slot: this.slot, idx: this.idx }; }

  /** Snapshot for UNDO: tree copy plus the cursor as slot indices. */
  snapshot() {
    const path = [];
    let slot = this.root;
    for (const { node, slot: si } of this.path) {
      path.push([slot.indexOf(node), si]);
      slot = node.s[si];
    }
    return { root: Editor.clone(this.root), path, idx: this.idx };
  }

  restore(snap) {
    this.root = Editor.clone(snap.root);
    this.path = [];
    let slot = this.root;
    for (const [i, si] of snap.path) {
      const node = slot[i];
      this.path.push({ node, slot: si });
      slot = node.s[si];
    }
    this.idx = snap.idx;
  }

  /** Linear position of the cursor in a flattened walk (used to place the cursor after errors). */
  setLinearPosition(n) {
    this.path = [];
    this.idx = Math.min(n, this.root.length);
  }
}

const isNumberPart = (nd) => nd.k === 'tok' && ['digit', 'point', 'exp'].includes(tokenInfo(nd.id).kind);

/** Start index of the operand ending at idx (for fraction absorption). */
function operandStart(slot, idx) {
  let i = idx;
  if (i === 0) return idx;
  const prev = slot[i - 1];
  if (prev.k === 'tok') {
    const info = tokenInfo(prev.id);
    if (isNumberPart(prev)) {
      while (i > 0 && isNumberPart(slot[i - 1])) i--;
      return i;
    }
    if (info.kind === 'var' || info.kind === 'value') return i - 1;
    if (info.kind === 'close') {
      let depth = 0;
      for (let j = i - 1; j >= 0; j--) {
        const k = slot[j].k === 'tok' ? tokenInfo(slot[j].id).kind : '';
        if (k === 'close') depth++;
        else if (k === 'open' || k === 'func') {
          depth--;
          if (depth === 0) return j;
        }
      }
      return idx;
    }
    return idx;
  }
  return prev.id === 'pow' ? operandStart(slot, i - 1) : i - 1;
}

/** End index (exclusive) of the operand starting at idx (for INS wrapping). */
function operandEnd(slot, idx) {
  if (idx >= slot.length) return idx;
  const nd = slot[idx];
  if (nd.k === 'tpl') return idx + 1;
  const info = tokenInfo(nd.id);
  if (isNumberPart(nd)) {
    let i = idx;
    while (i < slot.length && isNumberPart(slot[i])) i++;
    return i;
  }
  if (info.kind === 'open' || info.kind === 'func') {
    let depth = 0;
    for (let j = idx; j < slot.length; j++) {
      const k = slot[j].k === 'tok' ? tokenInfo(slot[j].id).kind : '';
      if (k === 'open' || k === 'func') depth++;
      else if (k === 'close' && --depth === 0) return j + 1;
    }
    return slot.length;
  }
  return idx + 1;
}

const firstWrapSlot = (id) => ({ root: 1, logab: 1, mixed: 0 }[id] ?? 0);

export { tok, tpl };
