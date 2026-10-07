// CONST (CODATA 2014, fx-991CE X) and CONV (NIST Special Publication 811, 2008) tables in menu order.
// Menu keys: 1–9, then A–F, M and x — the keys that carry those letters on the keypad.
export const MENU_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'M', 'x'];

const c = (id, label, value) => ({ id, label, value });

export const CONSTANT_GROUPS = [
  { name: 'Universal', items: [
    c('h', 'h', '6.626070040e-34'), c('hbar', 'ħ', '1.054571800e-34'), c('c0', 'c₀', '299792458'),
    c('eps0', 'ε₀', '8.854187817e-12'), c('mu0', 'μ₀', '1.2566370614e-6'), c('Z0', 'Z₀', '376.730313461'),
    c('G', 'G', '6.67408e-11'), c('lP', 'lₚ', '1.616229e-35'), c('tP', 'tₚ', '5.39116e-44'),
  ] },
  { name: 'Electromagnetic', items: [
    c('muN', 'μ_N', '5.050783699e-27'), c('muB', 'μ_B', '9.274009994e-24'), c('e', 'e', '1.6021766208e-19'),
    c('Phi0', 'Φ₀', '2.067833831e-15'), c('G0', 'G₀', '7.7480917310e-5'), c('KJ', 'K_J', '4.835978525e14'),
    c('RK', 'R_K', '25812.8074555'),
  ] },
  { name: 'Atomic&Nuclear', items: [
    c('mp', 'm_p', '1.672621898e-27'), c('mn', 'm_n', '1.674927471e-27'), c('me', 'm_e', '9.10938356e-31'),
    c('mmu', 'm_μ', '1.883531594e-28'), c('a0', 'a₀', '5.2917721067e-11'), c('alpha', 'α', '7.2973525664e-3'),
    c('re', 'r_e', '2.8179403227e-15'), c('lC', 'λ_C', '2.4263102367e-12'), c('gp', 'γ_p', '2.675221900e8'),
    c('lCp', 'λ_Cp', '1.32140985396e-15'), c('lCn', 'λ_Cn', '1.31959090481e-15'), c('Rinf', 'R∞', '10973731.568508'),
    c('mup', 'μ_p', '1.4106067873e-26'), c('mue', 'μ_e', '-9.284764620e-24'), c('mun', 'μ_n', '-9.6623650e-27'),
    c('mumu', 'μ_μ', '-4.49044826e-26'), c('mtau', 'm_τ', '3.16747e-27'),
  ] },
  { name: 'Physico-Chem', items: [
    c('u', 'u', '1.660539040e-27'), c('F', 'F', '96485.33289'), c('NA', 'N_A', '6.022140857e23'),
    c('k', 'k', '1.38064852e-23'), c('Vm', 'V_m', '0.022413962'), c('R', 'R', '8.3144598'),
    c('c1', 'c₁', '3.741771790e-16'), c('c2', 'c₂', '0.0143877736'), c('sigma', 'σ', '5.670367e-8'),
  ] },
  { name: 'Adopted Values', items: [
    c('g', 'g', '9.80665'), c('atm', 'atm', '101325'), c('RK90', 'R_K-90', '25812.807'), c('KJ90', 'K_J-90', '4.835979e14'),
  ] },
  // t is 273,15 on the fx-991CE X (parity sheet U11)
  { name: 'Other', items: [c('t', 't', '273.15')] },
];

export const CONSTANTS = Object.fromEntries(CONSTANT_GROUPS.flatMap((g) => g.items.map((it) => [it.id, it])));

// Conversions: value' = (value + offset) × factor. Factors are 'a' or 'a/b' decimal strings (exact rationals).
const v = (id, label, factor, offset = '0') => ({ id, label, factor, offset });
const pair = (a, b, factor) => [v(`${a}>${b}`, `${a}▸${b}`, factor), v(`${b}>${a}`, `${b}▸${a}`, `1/${factor}`)];

export const CONVERSION_GROUPS = [
  { name: 'Length', items: [
    ...pair('in', 'cm', '2.54'), ...pair('ft', 'm', '0.3048'), ...pair('yd', 'm', '0.9144'),
    ...pair('mile', 'km', '1.609344'), ...pair('n mile', 'm', '1852'), ...pair('pc', 'km', '3.085678e13'),
  ] },
  // international acre: 4840 yd² = 4046.8564224 m²
  { name: 'Area', items: [...pair('acre', 'm²', '4046.8564224')] },
  { name: 'Volume', items: [...pair('gal(US)', 'L', '3.785412'), ...pair('gal(UK)', 'L', '4.54609')] },
  { name: 'Mass', items: [...pair('oz', 'g', '28.34952'), ...pair('lb', 'kg', '0.4535924')] },
  { name: 'Pressure', items: [
    ...pair('atm', 'Pa', '101325'), ...pair('mmHg', 'Pa', '133.3224'),
    ...pair('kgf/cm²', 'Pa', '98066.5'), ...pair('lbf/in²', 'kPa', '6.894757'),
  ] },
  { name: 'Energy', items: [...pair('kgf•m', 'J', '9.80665'), v('J>cal', 'J▸cal', '1/4.1858'), v('cal>J', 'cal▸J', '4.1858')] },
  { name: 'Power', items: [...pair('hp', 'kW', '0.7456999')] },
  { name: 'Temperature', items: [
    v('F>C', '°F▸°C', '5/9', '-32'), // (F − 32)·5/9: offset applied before the factor
    v('C>F', '°C▸°F', '9/5', '160/9'), // C·9/5 + 32 = (C + 160/9)·9/5
  ] },
];

export const CONVERSIONS = Object.fromEntries(CONVERSION_GROUPS.flatMap((g) => g.items.map((it) => [it.id, it])));

// Menu pages: CONST shows 4 categories, then Adopted Values / Other on the next page.
export const CONSTANT_PAGES = [[0, 1, 2, 3], [4, 5]];
// CONV (fx-991CE X, checked on a unit): Length, Area, Volume, Mass / Pressure, Energy, Power, Temperature.
// No Velocity category, unlike the fx-991EX Reference Sheet.
export const CONVERSION_PAGES = [[0, 1, 2, 3], [4, 5, 6, 7]];
