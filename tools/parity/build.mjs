// Builds the parity sheet: runs every case in the emulator, then writes parity/parity-sheet.html.
//   node tools/parity/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { SECTIONS, allCases } from './cases.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const outDir = path.join(root, 'parity');
const shotDir = path.join(outDir, 'shots');
fs.mkdirSync(shotDir, { recursive: true });

const cases = allCases();
const casesFile = path.join(shotDir, 'cases.json');
fs.writeFileSync(casesFile, JSON.stringify(cases.map((c) => ({ id: c.id, keys: c.runKeys }))));

const electron = createRequire(import.meta.url)('electron');
const run = spawnSync(electron, ['.'], {
  cwd: root,
  env: { ...process.env, FX_CASES: casesFile, FX_OUT: shotDir, FX_DESCRIBE: path.join(here, 'describe.js') },
  stdio: 'inherit',
  timeout: 15 * 60 * 1000,
});
if (run.status !== 0) throw new Error(`emulator run failed (${run.status ?? run.signal})`);

const screens = JSON.parse(fs.readFileSync(path.join(shotDir, 'results.json'), 'utf8'));
const data = {
  version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  sections: SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    start: s.start,
    tests: cases.filter((c) => c.section === s.id).map((c) => ({
      id: c.id,
      title: c.title,
      keys: c.keys,
      manual: c.manual ?? null,
      note: c.note ?? null,
      core: !!c.core,
      screen: screens[c.id] ?? '',
      image: `data:image/jpeg;base64,${fs.readFileSync(path.join(shotDir, `${c.id}.jpg`)).toString('base64')}`,
    })),
  })),
};

// template.html is page content (the claude.ai Artifact viewer adds the document shell);
// parity-sheet.html wraps it into a standalone document for opening from disk.
const template = fs.readFileSync(path.join(here, 'template.html'), 'utf8');
const content = template.replace('/*__DATA__*/null', () => JSON.stringify(data).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(outDir, 'parity-sheet.artifact.html'), content);
const standalone = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${content}</body></html>`;
fs.writeFileSync(path.join(outDir, 'parity-sheet.html'), standalone);
console.log(`${cases.length} cases → parity/parity-sheet.html (${(standalone.length / 1e6).toFixed(1)} MB)`);
