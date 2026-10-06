// Mode registry: each mode builds its initial screens; $menus provides the global menus.
import { calcMode, complexMode, baseMode, matrixMode, vectorMode } from './basic.js';
import { statMode, distMode } from './stat.js';
import { tableMode } from './table.js';
import { eqnMode, ineqMode, ratioMode } from './eqn.js';
import { sheetMode } from './sheet.js';
import * as menus from '../screens/menus.js';

export const MODES = {
  calc: calcMode,
  cmplx: complexMode,
  base: baseMode,
  matrix: matrixMode,
  vector: vectorMode,
  stat: statMode,
  dist: distMode,
  sheet: sheetMode,
  table: tableMode,
  eqn: eqnMode,
  ineq: ineqMode,
  ratio: ratioMode,
  $menus: menus,
};
