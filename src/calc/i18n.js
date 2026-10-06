// Menu and message language. The fx-991CE X offers Česky, Magyar, Polski and Slovensky; this emulator
// provides Magyar (default) and English. Hungarian strings come from the CASIO fx-991CEX Felhasználói
// Útmutató (RJA536670); entries marked "//?" are not printed in that guide and need checking on a unit.
const HU = {
  // main menu
  Calculate: 'Számológép', Complex: 'Komplex', 'Base-N': 'Számr alapszáma', Matrix: 'Mátrix', Vector: 'Vektor',
  Statistics: 'Statisztika', Distribution: 'Eloszlás', Spreadsheet: 'Számolótábla', Table: 'Táblázat',
  'Equation/Func': 'Egyenlet/Függv', Inequality: 'Egyenlőtlenség', Ratio: 'Arány',
  // setup
  'Input/Output': 'Bevitel/Kiírás', 'MathI/MathO': 'Mat be/Mat ki', 'MathI/DecimalO': 'Mat be/Dec ki',
  'LineI/LineO': 'Sor be/Sor ki', 'LineI/DecimalO': 'Sor be/Dec ki',
  'Angle Unit': 'Szög m.egys', Degree: 'Fok (D)', Radian: 'Radián (Rad)', Gradian: 'Újfok (Grad)',
  'Number Format': 'Számformátum', Fix: 'Rögzített(Fix)', Sci: 'Tudományos(Sci)', Norm: 'Normál alak',
  'Engineer Symbol': 'Mérnöki szimb', On: 'Be', Off: 'Ki', 'Fraction Result': 'Tört alakja',
  'Auto Calc': 'Auto számítás', 'Show Cell': 'Cella mutatása', Formula: 'Képlet', Value: 'Érték',
  'Digit Separator': 'Ezres tagolás', 'MultiLine Font': 'Többsoros betű', 'Normal Font': 'Normál betű',
  'Small Font': 'Kis betűtípus', 'Version 3': '3. verzió', 'Version 11': '11. verzió', Contrast: 'Kontraszt',
  'Fix 0~9?': 'Rögzített 0~9?', //?
  'Sci 0~9?': 'Tudományos 0~9?', //?
  'Norm 1~2?': 'Normál alak 1~2?', //?
  CONTRAST: 'KONTRASZT', //?
  LIGHT: 'VILÁGOS', //?
  DARK: 'SÖTÉT', //?
  // reset
  'Setup Data': 'Beáll adatok', Memory: 'Memória', 'Initialize All': 'Össz visszaáll',
  'Reset Setup?': 'Beáll adatok?', //?
  'Clear Memory?': 'Memória törlése?', //?
  'Initialize All?': 'Össz visszaáll?', //?
  'Reset Setup': 'Beáll adatok', //?
  'Clear Memory': 'Memória törölve', //?
  'Press [AC] Key': 'Nyomja meg: [AC]', //?
  'Yes   :[=]': 'Igen  :[=]', 'Cancel:[AC]': 'Mégse :[AC]', //?
  // OPTN
  'Hyperbolic Func': 'Hiperbolikus fv', Argument: 'Argumentum', Conjugate: 'Konjugált', 'Real Part': 'Valós rész',
  'Imaginary Part': 'Képzetes rész', 'Define Matrix': 'Mátrix megadás', 'Edit Matrix': 'Mátrix szerk',
  Determinant: 'Determináns', Transposition: 'Transzponálás', Identity: 'Egységmátrix',
  'Define Vector': 'Vektor megadás', 'Edit Vector': 'Vektor szerk', 'Dot Product': 'Skalárszorzat',
  Angle: 'Szög', 'Unit Vector': 'Egységvektor',
  'Number of Rows?': 'Sorok száma?', //?
  'Number of Columns?': 'Oszlopok száma?', //?
  'Dimension?': 'Dimenzió?', //?
  'Select 1~4': 'Válasszon: 1~4', //?
  'Select 2~3': 'Válasszon: 2~3', //?
  'Select 2~4': '2~4 választ',
  // statistics and distribution
  'Select Type': 'Típus választás', '1-Variable': '1 változós', Editor: 'Szerkesztő', 'Insert Row': 'Sor beilleszt',
  'Delete All': 'Mindent töröl', '1-Variable Calc': '1-változós stat', '2-Variable Calc': '2-változós stat',
  'Regression Calc': 'Regresszió szám', Data: 'Adatok', Summation: 'Összegzés', Variable: 'Változó',
  Regression: 'Regresszió', 'Norm Dist': 'Norm eloszlás', Freq: 'Gyak',
  'No Data': 'Nincs adat', //?
  'Normal PD': 'Normál VSZ', 'Normal CD': 'Normál KE', 'Inverse Normal': 'Inverz normál', 'Binomial PD': 'Binomiális VSZ',
  'Binomial CD': 'Binomiális KE', 'Poisson PD': 'Poisson VSZ', 'Poisson CD': 'Poisson KE', List: 'Lista',
  Lower: 'Alsó', Upper: 'Felső', 'dist:Area': 'Ter',
  // table, equations, inequalities
  'Table Range': 'Tábl tartomány', Start: 'Kezdő', End: 'Záró', Step: 'Lépés',
  'Simul Equation': 'Szimult egyenl', Polynomial: 'Polinom', 'No Solution': 'Nincs megoldás',
  'All Real Numbers': 'Minden valós szám',
  'Number of Unknowns?': 'Ismeretlenek száma?', //?
  'Degree?': 'Foka?',
  'Infinite Solution': 'Végtelen megoldás',
  'No Real Roots': 'Nincs valós gyök', //?
  // spreadsheet
  'Fill Formula': 'Kitölt képlet', 'Fill Value': 'Kitölt értékkel', 'Edit Cell': 'Cella szerkeszt',
  'Free Space': 'Szabad terület', 'Cut & Paste': 'Kivág beilleszt', 'Copy & Paste': 'Másol beilleszt',
  Recalculate: 'Újraszámítás', Grab: 'Kiválasztás', Sum: 'Összeg', Form: 'Képlet', Range: 'Tartom',
  Mean: 'Átlag', //?
  'Set:[=]': 'Beállít:[=]', //?
  'Paste:[=]': 'Beilleszt:[=]', //?
  Bytes: 'bájt', //?
  // constants, conversions, atomic weights
  Universal: 'Univerzális', Electromagnetic: 'Elektromágneses', 'Atomic&Nuclear': 'Atom és mag',
  'Physico-Chem': 'Fiziko-kémia', 'Adopted Values': 'Vál értékek', Other: 'Egyéb',
  Length: 'Hossz', Area: 'Terület', Volume: 'Térfogat', Mass: 'Tömeg', Pressure: 'Nyomás',
  Energy: 'Energia', Power: 'Teljesítmény', Temperature: 'Hőmérséklet',
  'Periodic Table': 'Periód tábla', 'Atomic Weight': 'Atomtömeg', 'Lanth': 'Lant', 'Actin': 'Akti',
  // errors and screens
  'Math ERROR': 'Matematikai HIBA', 'Stack ERROR': 'Verem HIBA', 'Syntax ERROR': 'Szintaktikai HIBA',
  'Argument ERROR': 'Argumentum HIBA', 'Dimension ERROR': 'Dimenzió HIBA', 'Variable ERROR': 'Változó HIBA',
  'Cannot Solve': 'Nem tud megold', 'Range ERROR': 'Tartomány HIBA', 'Time Out': 'Időtúllépés',
  'Circular ERROR': 'Körkörös HIBA', 'Memory ERROR': 'Memória HIBA', 'Continue:[=]': 'Folytatás:[=]',
  '[AC] :Cancel': '[AC] :Mégse', //?
  '[◀][▶]:Goto': '[◀][▶]:Ugrás', //?
  'QR Code': 'QR Code', 'Not available in': 'Ebben az emulátorban', 'this emulator.': 'nem érhető el.',
};

const DICTS = { hu: HU };
let current = 'hu';

// The fx-991CE X language list. Only Hungarian is translated; the others show the English base strings.
export const LANGUAGES = [['Cesky', 'cs'], ['Magyar', 'hu'], ['Polski', 'pl'], ['Slovensky', 'sk']];

/** Selects the display language; anything not on the list (e.g. an older saved 'en') becomes Magyar. */
export function setLanguage(lang) {
  current = LANGUAGES.some(([, id]) => id === lang) ? lang : 'hu';
  return current;
}

/**
 * Translates a UI string; unknown strings (symbols, numbers, names) pass through unchanged.
 * ctx disambiguates words with two meanings, e.g. t('Area', 'dist') is the Inverse Normal parameter.
 */
export function t(s, ctx) {
  if (typeof s !== 'string') return s;
  const d = DICTS[current];
  if (!d) return s;
  return (ctx && d[`${ctx}:${s}`]) ?? d[s] ?? s;
}
