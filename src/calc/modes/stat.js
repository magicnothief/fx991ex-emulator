// Statistics and Distribution modes.
import * as N from '../../core/num.js';
import { Stats, STAT_TYPES } from '../../core/stats.js';
import * as Dist from '../../core/dist.js';
import { CalcError, ERR } from '../../core/errors.js';
import { h } from '../../ui/render.js';
import { CalcScreen } from '../screens/calcscreen.js';
import { GridScreen } from '../screens/grid.js';
import { Menu, Message, page, item, closeMenus } from '../screens/common.js';
import { commonOptnPage } from '../screens/menus.js';
import { ParamScreen, ListScreen } from '../screens/params.js';
import { t } from '../i18n.js';

const statTok = (screen, id, label = id) => item(label, (calc) => { closeMenus(calc); screen.apply(`tok:stat|${id}|${label}`); });
const tokItem = (screen, label, id) => item(label, (calc) => { closeMenus(calc); screen.apply(`tok:${id}`); });

// ---------------------------------------------------------------- Statistics

const ROW_LIMIT = { 1: 160, 2: 80, 3: 53 };

export const statMode = {
  start(calc) {
    const md = calc.modeData;
    md.type = null;
    md.rows = [];
    md.stats = () => (md.type ? new Stats(md.type, md.rows) : null);
    md.onSetup = (what) => { if (what === 'statFreq') { md.rows = []; } };
    const calcScreen = new CalcScreen(calc, { optn: (s) => statCalcOptn(calc, s) });
    md.calcScreen = calcScreen;
    calc.push(calcScreen);
    calc.push(typeMenu(calc, false));
  },
};

function typeMenu(calc, sub) {
  const md = calc.modeData;
  const pick = (t) => () => {
    const wasPaired = md.type && md.type !== '1var';
    const paired = t.id !== '1var';
    if (!md.type || wasPaired !== paired) md.rows = [];
    md.type = t.id;
    closeMenus(calc);
    calc.popTo(md.calcScreen);
    calc.push(statEditor(calc));
  };
  const items = STAT_TYPES.map((t) => item(t.label, pick(t)));
  return new Menu(calc, [page(items.slice(0, 4)), page(items.slice(4))], { sub });
}

function statEditor(calc) {
  const md = calc.modeData;
  const paired = md.type !== '1var';
  const freq = calc.setup.statFreq;
  const cols = [{ label: 'x', key: 'x' }];
  if (paired) cols.push({ label: 'y', key: 'y' });
  if (freq) cols.push({ label: 'Freq', key: 'f' });
  const width = cols.length === 1 ? 60 : cols.length === 2 ? 52 : 44;
  const g = new GridScreen(calc, {
    cols: cols.map((c) => ({ ...c, width })),
    rowCount: () => md.rows.length,
    growable: true,
    wrap: true, // ▼ on the last row returns to the first (User's Guide data-entry examples rely on it)
    maxRows: ROW_LIMIT[cols.length],
    get: (r, c) => {
      const row = md.rows[r];
      const k = cols[c].key;
      return k === 'f' ? row.f ?? N.ONE : row[k] ?? null;
    },
    set: (r, c, v) => {
      while (md.rows.length <= r) md.rows.push({ x: null, y: paired ? null : undefined, f: N.ONE });
      md.rows[r][cols[c].key] = v;
      if (!md.rows[r].x) md.rows[r].x = N.ZERO;
      if (paired && !md.rows[r].y) md.rows[r].y = N.ZERO;
    },
    del: (r) => { if (r < md.rows.length) md.rows.splice(r, 1); },
    onAC: () => calc.pop(),
    onOptn: (grid) => calc.push(new Menu(calc, [page([
      item('Select Type', () => { closeMenus(calc); calc.push(typeMenu(calc, false)); }),
      item('Editor', () => calc.push(new Menu(calc, [page([
        item('Insert Row', () => { closeMenus(calc); if (grid.r < md.rows.length) md.rows.splice(grid.r, 0, { x: N.ZERO, y: paired ? N.ZERO : undefined, f: N.ONE }); }),
        item('Delete All', () => { closeMenus(calc); md.rows = []; grid.r = 0; grid.top = 0; }),
      ])], { sub: true }))),
      item(paired ? '2-Variable Calc' : '1-Variable Calc', () => { closeMenus(calc); showSummary(calc); }),
      ...(paired ? [item('Regression Calc', () => { closeMenus(calc); showRegression(calc); })] : []),
    ])])),
  });
  return g;
}

const STAT_LABELS = {
  'x̄': 'x̄', 'Σx': 'Σx', 'Σx²': 'Σx²', 'σ²x': 'σ²x', 'σx': 'σx', 's²x': 's²x', sx: 'sx', n: 'n',
  'ȳ': 'ȳ', 'Σy': 'Σy', 'Σy²': 'Σy²', 'σ²y': 'σ²y', 'σy': 'σy', 's²y': 's²y', sy: 'sy',
  'Σxy': 'Σxy', 'Σx³': 'Σx³', 'Σx²y': 'Σx²y', 'Σx⁴': 'Σx⁴',
  minX: 'min(x)', maxX: 'max(x)', minY: 'min(y)', maxY: 'max(y)', Q1: 'Q₁', Med: 'Med', Q3: 'Q₃',
};

function showSummary(calc) {
  const s = calc.modeData.stats();
  if (!s || s.rows.length === 0) { calc.push(new Message(calc, ['No Data'])); return; }
  calc.push(new ListScreen(calc, s.summaryIds().map((id) => ({ label: STAT_LABELS[id], value: () => s.value(id) })), { dense: true }));
}

function showRegression(calc) {
  const s = calc.modeData.stats();
  if (!s || s.rows.length === 0) { calc.push(new Message(calc, ['No Data'])); return; }
  const t = STAT_TYPES.find((x) => x.id === calc.modeData.type);
  const ids = calc.modeData.type === 'quad' ? ['a', 'b', 'c'] : ['a', 'b', 'r'];
  calc.push(new ListScreen(calc, ids.map((id) => ({ label: `   ${id}`, value: () => s.value(id) })), { title: t.label, dense: true }));
}

function statCalcOptn(calc, s) {
  const md = calc.modeData;
  const paired = md.type !== '1var';
  const quad = md.type === 'quad';
  const p1 = paired
    ? [item('Select Type', () => { closeMenus(calc); calc.push(typeMenu(calc, false)); }),
      item('2-Variable Calc', () => { closeMenus(calc); showSummary(calc); }),
      item('Regression Calc', () => { closeMenus(calc); showRegression(calc); }),
      item('Data', () => { closeMenus(calc); calc.push(statEditor(calc)); })]
    : [item('Select Type', () => { closeMenus(calc); calc.push(typeMenu(calc, false)); }),
      item('1-Variable Calc', () => { closeMenus(calc); showSummary(calc); }),
      item('Data', () => { closeMenus(calc); calc.push(statEditor(calc)); })];
  const sub = (items, cols = 1) => () => calc.push(new Menu(calc, [page(items, { cols, small: items.length > 4 })], { sub: true }));
  const summation = paired ? ['Σx', 'Σx²', 'Σy', 'Σy²', 'Σxy', 'Σx³', 'Σx²y', 'Σx⁴'] : ['Σx', 'Σx²'];
  // User's Guide Ex 2: OPTN ▼ 2 (Variable) 1 (x̄) — the mean is item 1 and n comes last
  const variables = paired ? ['x̄', 'σ²x', 'σx', 's²x', 'sx', 'ȳ', 'σ²y', 'σy', 's²y', 'sy', 'n'] : ['x̄', 'σ²x', 'σx', 's²x', 'sx', 'n'];
  const minmax = paired ? ['minX', 'maxX', 'minY', 'maxY'] : ['minX', 'Q1', 'Med', 'Q3', 'maxX'];
  const regression = quad
    ? [statTok(s, 'a'), statTok(s, 'b'), statTok(s, 'c'), tokItem(s, 'x̂₁', 'x̂1'), tokItem(s, 'x̂₂', 'x̂2'), tokItem(s, 'ŷ', 'ŷ')]
    : [statTok(s, 'a'), statTok(s, 'b'), statTok(s, 'r'), tokItem(s, 'x̂', 'x̂'), tokItem(s, 'ŷ', 'ŷ')];
  const p2 = [
    item('Summation', sub(summation.map((id) => statTok(s, id, STAT_LABELS[id])), 2)),
    item('Variable', () => calc.push(new Menu(calc, [
      page(variables.slice(0, 8).map((id) => statTok(s, id, STAT_LABELS[id])), { cols: 2, small: true }),
      ...(variables.length > 8 ? [page(variables.slice(8).map((id) => statTok(s, id, STAT_LABELS[id])))] : []),
    ], { sub: true }))),
    item('Min/Max', sub(minmax.map((id) => statTok(s, id, STAT_LABELS[id])), 2)),
    paired
      ? item('Regression', sub(regression, 2))
      : item('Norm Dist', sub([tokItem(s, 'P(', 'P('), tokItem(s, 'Q(', 'Q('), tokItem(s, 'R(', 'R('), tokItem(s, '▸t', '►t')], 2)),
  ];
  return new Menu(calc, [page(p1), page(p2), commonOptnPage(calc, (a) => s.apply(a))]);
}

// ---------------------------------------------------------------- Distribution

const DIST_TYPES = [
  { id: 'npd', label: 'Normal PD', params: ['x', 'σ', 'μ'], result: 'p' },
  { id: 'ncd', label: 'Normal CD', params: ['Lower', 'Upper', 'σ', 'μ'], result: 'P' },
  { id: 'inv', label: 'Inverse Normal', params: ['Area', 'σ', 'μ'], result: 'xInv' },
  { id: 'bpd', label: 'Binomial PD', params: ['x', 'N', 'p'], result: 'P', discrete: true },
  { id: 'bcd', label: 'Binomial CD', params: ['x', 'N', 'p'], result: 'P', discrete: true },
  { id: 'ppd', label: 'Poisson PD', params: ['x', 'λ'], result: 'P', discrete: true },
  { id: 'pcd', label: 'Poisson CD', params: ['x', 'λ'], result: 'P', discrete: true },
];

const DEFAULTS = { x: 0, 'σ': 1, 'μ': 0, Lower: 0, Upper: 0, Area: 0, N: 0, p: 0, 'λ': 0 };

function distValue(type, v) {
  const n = (k) => v[k].d.toNumber();
  const intArg = (k) => { if (!v[k].d.isInteger()) throw new CalcError(ERR.ARGUMENT); return n(k); };
  switch (type.id) {
    case 'npd': return Dist.normalPD(n('x'), n('σ'), n('μ'));
    case 'ncd': return Dist.normalCD(n('Lower'), n('Upper'), n('σ'), n('μ'));
    case 'inv': return Dist.inverseNormal(n('Area'), n('σ'), n('μ'));
    case 'bpd': return Dist.binomialPD(intArg('x'), intArg('N'), n('p'));
    case 'bcd': return Dist.binomialCD(intArg('x'), intArg('N'), n('p'));
    case 'ppd': return Dist.poissonPD(intArg('x'), n('λ'));
    case 'pcd': return Dist.poissonCD(intArg('x'), n('λ'));
    default: throw new CalcError(ERR.SYNTAX);
  }
}

const toNum = (x) => N.fromDec(new N.D(x).toSD(10));

export const distMode = {
  start(calc) {
    const md = calc.modeData;
    md.values = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, N.fromInt(v)]));
    md.list = [];
    md.results = [];
    md.root = new DistRoot(calc);
    calc.push(md.root);
    calc.push(distTypeMenu(calc, false));
  },
};

/** Bottom of the Distribution stack; only reachable through OPTN. */
class DistRoot {
  constructor(calc) { this.calc = calc; }

  handle(ev) {
    if (ev.action !== 'optn') return false;
    this.calc.push(distTypeMenu(this.calc));
    return true;
  }

  view() { return { el: h('div', 'message'), status: { noMath: true } }; }
  paint() { return { noMath: true }; }
}

function distTypeMenu(calc, sub = false) {
  const items = DIST_TYPES.map((t) => item(t.label, () => {
    calc.modeData.type = t;
    closeMenus(calc);
    calc.popTo(calc.modeData.root);
    if (t.discrete) {
      calc.push(new Menu(calc, [page([
        item('List', () => { closeMenus(calc); calc.modeData.inputMode = 'list'; calc.popTo(calc.modeData.root); calc.push(distList(calc)); }),
        item('Variable', () => { closeMenus(calc); calc.modeData.inputMode = 'var'; calc.popTo(calc.modeData.root); calc.push(distParams(calc)); }),
      ])], { title: null }));
    } else {
      calc.modeData.inputMode = 'var';
      calc.push(distParams(calc));
    }
  }));
  return new Menu(calc, [page(items.slice(0, 4)), page(items.slice(4))], { sub });
}

function distParams(calc) {
  const md = calc.modeData;
  const t = md.type;
  const listMode = md.inputMode === 'list';
  const keys = listMode ? t.params.filter((p) => p !== 'x') : t.params;
  return new ParamScreen(calc, {
    title: t.label,
    params: keys.map((k) => ({ key: k, label: k })),
    ctx: 'dist',
    values: md.values,
    onOptn: () => calc.push(new Menu(calc, [page([item('Select Type', () => { closeMenus(calc); calc.push(distTypeMenu(calc)); })])])),
    onAC: () => { if (listMode) calc.pop(); },
    onEq: () => {
      try {
        if (listMode) {
          md.results = md.list.map((x) => {
            try { return toNum(distValue(t, { ...md.values, x })); } catch (e) { if (e instanceof CalcError) return 'ERROR'; throw e; }
          });
          calc.pop();
          // the list comes back with the cursor on the first row (User's Guide p.32)
          Object.assign(md.listGrid, { r: 0, c: 0, top: 0 });
          return;
        }
        const r = toNum(distValue(t, md.values));
        calc.setAns(r);
        calc.push(new ListScreen(calc, [{ label: t.result, value: r }], { onEq: () => calc.pop() }));
      } catch (e) {
        if (!(e instanceof CalcError)) throw e;
        calc.push(new Message(calc, [e.kind, '', '[AC] :Cancel']));
      }
    },
  });
}

function distList(calc) {
  const md = calc.modeData;
  md.listGrid = new GridScreen(calc, {
    cols: [{ label: 'x', width: 34 }, { label: md.type.result, width: 28 }],
    rowCount: () => md.list.length,
    growable: true,
    maxRows: 45,
    editable: (r, c) => c === 0,
    get: (r, c) => (c === 0 ? md.list[r] : md.results[r] ?? null),
    set: (r, c, v) => {
      md.list[r] = v;
      md.results = [];
    },
    del: (r) => { md.list.splice(r, 1); md.results = []; },
    onEq: () => { if (md.list.length) calc.push(distParams(calc)); },
    onOptn: (grid) => calc.push(new Menu(calc, [page([
      item('Select Type', () => { closeMenus(calc); calc.push(distTypeMenu(calc)); }),
      item('Editor', () => calc.push(new Menu(calc, [page([
        item('Insert Row', () => { closeMenus(calc); md.list.splice(grid.r, 0, N.ZERO); md.results = []; }),
        item('Delete All', () => { closeMenus(calc); md.list = []; md.results = []; grid.r = 0; }),
      ])], { sub: true }))),
    ])])),
    side: () => h('div', 'side', t(md.type.label).split(' ').map((w) => h('div', null, w))),
  });
  return md.listGrid;
}
