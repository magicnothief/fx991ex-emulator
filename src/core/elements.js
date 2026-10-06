// Atomic weights for the fx-991CE X ATOMIC menu (IUPAC 2015 standard atomic weights).
// Elements with an interval use the IUPAC conventional value (H 1.008); elements without a standard
// atomic weight give the mass number of the best-known isotope, written in brackets on the display.
const DATA = `H 1.008|He 4.002602|Li 6.94|Be 9.0121831|B 10.81|C 12.011|N 14.007|O 15.999|F 18.998403163|Ne 20.1797|
Na 22.98976928|Mg 24.305|Al 26.9815385|Si 28.085|P 30.973761998|S 32.06|Cl 35.45|Ar 39.948|K 39.0983|Ca 40.078|
Sc 44.955908|Ti 47.867|V 50.9415|Cr 51.9961|Mn 54.938044|Fe 55.845|Co 58.933194|Ni 58.6934|Cu 63.546|Zn 65.38|
Ga 69.723|Ge 72.630|As 74.921595|Se 78.971|Br 79.904|Kr 83.798|Rb 85.4678|Sr 87.62|Y 88.90584|Zr 91.224|
Nb 92.90637|Mo 95.95|Tc [98]|Ru 101.07|Rh 102.90550|Pd 106.42|Ag 107.8682|Cd 112.414|In 114.818|Sn 118.710|
Sb 121.760|Te 127.60|I 126.90447|Xe 131.293|Cs 132.90545196|Ba 137.327|La 138.90547|Ce 140.116|Pr 140.90766|Nd 144.242|
Pm [145]|Sm 150.36|Eu 151.964|Gd 157.25|Tb 158.92535|Dy 162.500|Ho 164.93033|Er 167.259|Tm 168.93422|Yb 173.045|
Lu 174.9668|Hf 178.49|Ta 180.94788|W 183.84|Re 186.207|Os 190.23|Ir 192.217|Pt 195.084|Au 196.966569|Hg 200.592|
Tl 204.38|Pb 207.2|Bi 208.98040|Po [209]|At [210]|Rn [222]|Fr [223]|Ra [226]|Ac [227]|Th 232.0377|
Pa 231.03588|U 238.02891|Np [237]|Pu [244]|Am [243]|Cm [247]|Bk [247]|Cf [251]|Es [252]|Fm [257]|
Md [258]|No [259]|Lr [262]|Rf [267]|Db [268]|Sg [271]|Bh [272]|Hs [270]|Mt [276]|Ds [281]|
Rg [280]|Cn [285]|Nh [284]|Fl [289]|Mc [288]|Lv [293]|Ts [294]|Og [294]`;

/** [{ z, symbol, weight: '44.955908' | '98', bracket: bool }] indexed by atomic number − 1. */
export const ELEMENTS = DATA.replace(/\s+/g, '').split('|').map((entry, i) => {
  const m = /^([A-Z][a-z]?)(\[?)([\d.]+)\]?$/.exec(entry);
  return { z: i + 1, symbol: m[1], weight: m[3], bracket: m[2] === '[' };
});

/** Table position: period/group, with La–Lu and Ac–Lr on two separate rows (8 and 9). */
export function position(z) {
  if (z === 1) return { row: 1, col: 1 };
  if (z === 2) return { row: 1, col: 18 };
  const short = [[3, 2], [11, 3]]; // periods 2 and 3: groups 1–2 then 13–18
  for (const [start, row] of short) {
    if (z >= start && z < start + 8) {
      const k = z - start;
      return { row, col: k < 2 ? k + 1 : k + 11 };
    }
  }
  if (z <= 36) return { row: 4, col: z - 18 };
  if (z <= 54) return { row: 5, col: z - 36 };
  if (z >= 57 && z <= 71) return { row: 8, col: z - 54 };
  if (z >= 89 && z <= 103) return { row: 9, col: z - 86 };
  if (z <= 86) return { row: 6, col: z <= 56 ? z - 54 : z - 68 };
  return { row: 7, col: z <= 88 ? z - 86 : z - 100 };
}
