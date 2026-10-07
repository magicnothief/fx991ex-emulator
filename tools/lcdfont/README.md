# LCD fonts

`src/ui/lcdfont.js` is generated from the screenshots in the CASIO User's Guides, so the emulator draws the
display with the calculator's own glyphs. The guides are not part of the repository; put them in a work
folder (`<dir>`) as `cex.pdf` (fx-991CE X Hungarian User's Guide), `manual.pdf` (fx-991EX English User's Guide)
and `learn.pdf` (CASIO teaching resource with ClassWiz screenshots), then run, in order:

1. `python collect.py <dir>` — gathers every LCD screenshot into `<dir>/font/shots.pkl`
2. `python segment.py <dir>` — cuts text lines into glyphs and groups identical bitmaps
3. label the groups (`labels.txt`: index, font L/S/T/E/I, character) from contact sheets
4. `python build.py <dir>` — picks the best sample per character and its offset in the cell
5. `python harvest.py <dir>` — replaces glyphs with the ones cut from screens whose text is known
6. `python gen.py <dir> src/ui/lcdfont.js` — writes the module, adding hand-drawn glyphs for characters the
   guides never show (W, accented capitals, ≤, ≠ and parts of the small and tiny fonts)

`tools/lcdcheck.mjs "<keys>" out.json` paints a screen into the pixel buffer for comparing with a screenshot.
