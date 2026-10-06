# fx-991EX Emulator

A Windows desktop emulator of the CASIO fx-991CE X ClassWiz scientific calculator (the Central European
edition of the fx-991EX), for teaching: students and teacher press the same keys and get the same screens and
answers. Like the physical calculator it shows Hungarian menus and messages, a decimal comma, `;` as the argument
separator, `tg` for tangent, CODATA 2014 constants and the ATOMIC (periodic table / atomic weight) menu.
SETUP ▸ Language offers the same list as the calculator (Cesky, Magyar, Polski, Slovensky); only Magyar is
translated (the other three show English text).
Hungarian strings marked `//?` in `src/calc/i18n.js` are not yet confirmed against the device.

Not affiliated with or endorsed by CASIO. CASIO and ClassWiz are trademarks of CASIO Computer Co., Ltd.
This is a clean-room re-implementation built from the public User's Guide; it contains no CASIO ROM or code.
The MENU icons are drawn pixel for pixel from the User's Guide illustrations so the screen matches the calculator.

## Installing

Run `fx-991EX-Emulator-Setup-<version>.exe`. The installer is per-user (no admin rights needed) and creates
Start-menu and desktop shortcuts. Because the installer is not code-signed, Windows SmartScreen may show
"Windows protected your PC" the first time: choose **More info → Run anyway**.

## Updating

Installed copies update themselves:

- On every start the app checks for a newer release and downloads it in the background.
- When it is ready, a bar at the bottom offers **Restart now**. If ignored, the update installs the next time the app closes.
- **Help → Check for Updates…** checks on demand.

### Publishing an update (maintainer)

Updates are served from the Releases of [magicnothief/fx991ex-emulator](https://github.com/magicnothief/fx991ex-emulator)
(`build.publish` in `package.json`). Installed copies can only download releases from a **public** repository;
while the repository is private, the update check fails quietly. Make it public with
`gh repo edit magicnothief/fx991ex-emulator --visibility public --accept-visibility-change-consequences`.

For publishing, set a GitHub token with `repo` scope for the release command: `set GH_TOKEN=<token>`
(or `set GH_TOKEN` from `gh auth token`).

For each release:

1. Bump `version` in `package.json` (for example `1.0.1`).
2. Run `npm run release`. This builds the installer and uploads it, with `latest.yml` and the blockmap, to a draft GitHub release.
3. Publish the draft release on GitHub. Installed copies pick it up on their next start.

## Using it

Click the keys, or use the PC keyboard (press **F1** in the app for the list):
digits and `+ - * / ( ) .` as on the keypad, Enter `=`, Backspace `DEL`, Esc `AC`, arrows for the cursor pad,
F2 `SHIFT`, F3 `ALPHA`, F4 `MENU`, F5 `OPTN`, F6 `CALC`, `^` power, `s c t` sin cos tan, `l` ln, `q` √, `x` x, `a` Ans, `e` ×10ˣ.
**Ctrl+C** copies the displayed result. **View → Always on Top** keeps the calculator above a presentation.

Setup, memory (Ans, A–F, M, x, y), matrices and vectors are kept between sessions, as on the real calculator.

## What is implemented

All twelve modes from the main menu — Calculate, Complex, Base-N, Matrix, Vector, Statistics, Distribution,
Spreadsheet, Table, Equation/Func, Inequality, Ratio — with the SETUP menu, OPTN menus, CONST (47 CODATA 2010
constants), CONV (40 NIST SP 811 conversions), RESET, CALC, SOLVE, RECALL/STO, M+/M−, multi-statements,
replay and history, S⇔D, a b/c⇔d/c, ENG/←, FACT, sexagesimal input and display, engineering symbols,
Natural Textbook input with templates, and Line input with insert/overwrite.

Calculation follows the User's Guide: 15-digit internal precision, 10-digit display, the 13-level priority
sequence (implied multiplication binds tighter than ÷, so 6÷2(1+2) = 1), the √-form limits (two terms,
coefficients below 100, radicands below 1000), π forms, fraction digit limits, the documented function input
ranges and error types, the quartile method (median of each half, excluding the median), and the documented
number formats. `npm test` checks the worked examples from the User's Guide.

### Known differences from the physical calculator

- **QR codes** (SHIFT OPTN) are not generated: they encode a proprietary CASIO web format.
- The LCD is drawn with scalable fonts rather than CASIO's bitmap fonts, so text is sharper on a projector
  and spacing differs slightly; main-menu icons are simplified.
- CASIO does not publish its exact internal algorithms. Where the manual is silent (the iteration details of
  SOLVE, numerical integration and differentiation, the order of cubic/quartic roots, which special angles give
  √ forms), results were designed to agree with the calculator's documented behaviour but cannot be guaranteed
  digit-for-digit in every case. Results that depend on the last internal digit, on SOLVE's choice among several
  roots, or on numerical-calculus error may differ.

## Checking parity against a physical calculator

`npm run parity` runs 454 key sequences (taken from the User's Guide examples and from areas where the guide is
silent) through the emulator from a fresh Initialize All each, and writes `parity/parity-sheet.html`: every test
with its keys drawn as keycaps, the emulator's screen, and Same/Differs toggles with a note field. Run the same keys
on a physical fx-991CE X and mark each test. The cases live in `tools/parity/cases.mjs`; rerun the command after
changing the emulator to refresh the expected screens. Test ids are positional and key the recorded results, so
replace tests in place or append them at the end of a section.

## Development

```
npm install
node node_modules/electron/install.js   # npm 11 blocks Electron's download script; run it once
npm start                                # run from source
npm test                                 # engine and key-sequence tests
npm run dist                             # build dist/fx-991EX-Emulator-Setup-<version>.exe without publishing
```

Layout: `src/core` is the calculation engine (no DOM; tested in Node), `src/calc` the calculator state machine
and screens, `src/ui` the faceplate and LCD rendering, `electron/` the desktop shell and updater.
