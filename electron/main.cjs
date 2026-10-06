// Electron main process: window, application menu, and auto-update via GitHub Releases.
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DESIGN = { width: 460, height: 960 }; // faceplate design size in CSS px
const CAPTURE = process.env.FX_CAPTURE; // dev aid: path of a PNG to capture, then quit
const CAPTURE_KEYS = process.env.FX_KEYS || ''; // dev aid: key ids to press before capturing
const CASES = process.env.FX_CASES; // dev aid: JSON [{ id, keys }] run from a reset each, see tools/parity

// Screenshot runs use a throwaway profile so they never see (or overwrite) the user's saved state.
if (CAPTURE || CASES) app.setPath('userData', fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'fx991-capture-')));

let win;
let updater = null;
let updateState = { status: 'idle' };

function stateFile() {
  return path.join(app.getPath('userData'), 'window.json');
}

function loadBounds() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}

function createWindow() {
  const saved = loadBounds();
  win = new BrowserWindow({
    width: saved?.width ?? 400,
    height: saved?.height ?? 834,
    x: saved?.x,
    y: saved?.y,
    minWidth: 230,
    minHeight: 480,
    backgroundColor: '#141517', // matches the page behind the faceplate
    title: 'fx-991EX Emulator',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: false,
    show: !CAPTURE && !CASES,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.setAspectRatio(DESIGN.width / DESIGN.height);
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  win.on('close', () => {
    if (!CAPTURE) fs.writeFileSync(stateFile(), JSON.stringify(win.getBounds()));
  });
  // Links (README, release notes) open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  if (CAPTURE || CASES) {
    win.webContents.on('console-message', (e) => console.log(`[renderer] ${e.message}`));
    win.webContents.once('did-finish-load', CASES ? runCases : capture);
  }
}

async function capture() {
  // FX_KEYS: key ids separated by spaces; "|" separates segments, each captured to <FX_CAPTURE>-<n>.png
  // (LCD only unless FX_FULL is set). Without "|" a single full-window capture is written to FX_CAPTURE.
  win.setContentSize(Number(process.env.FX_W || 460), Number(process.env.FX_H || 960));
  await new Promise((r) => setTimeout(r, 400));
  const segments = CAPTURE_KEYS.split('|');
  const multi = segments.length > 1;
  for (let i = 0; i < segments.length; i++) {
    for (const key of segments[i].split(/\s+/).filter(Boolean)) {
      await win.webContents.executeJavaScript(`window.fx.press(${JSON.stringify(key)})`);
    }
    await new Promise((r) => setTimeout(r, 120));
    let rect;
    if (multi && !process.env.FX_FULL) {
      rect = await win.webContents.executeJavaScript(`(() => { const r = document.getElementById('lcd').getBoundingClientRect();
        return { x: Math.floor(r.x) - 2, y: Math.floor(r.y) - 2, width: Math.ceil(r.width) + 4, height: Math.ceil(r.height) + 4 }; })()`);
    }
    const image = await win.webContents.capturePage(rect);
    fs.writeFileSync(multi ? CAPTURE.replace(/\.png$/, `-${i}.png`) : CAPTURE, image.toPNG());
  }
  app.quit();
}

/**
 * Runs each case from a fresh Initialize All: presses its keys, then writes <FX_OUT>/<id>.jpg (the LCD)
 * and collects the text FX_DESCRIBE's script reads off the screen into <FX_OUT>/results.json.
 */
async function runCases() {
  const cases = JSON.parse(fs.readFileSync(CASES, 'utf8'));
  const out = process.env.FX_OUT;
  const describe = fs.readFileSync(process.env.FX_DESCRIBE, 'utf8');
  win.setContentSize(460, 960);
  await new Promise((r) => setTimeout(r, 400));
  const results = {};
  for (const c of cases) {
    const keys = c.keys.split(/\s+/).filter(Boolean);
    try {
      await win.webContents.executeJavaScript(`window.fx.reset(); ${JSON.stringify(keys)}.forEach((k) => window.fx.press(k));`);
    } catch (e) {
      console.error(`[case ${c.id}] ${e.message}`); // an emulator exception: keep going, the capture shows the state reached
    }
    await new Promise((r) => setTimeout(r, 30));
    results[c.id] = await win.webContents.executeJavaScript(describe);
    const rect = await win.webContents.executeJavaScript(`(() => { const r = document.getElementById('lcd').getBoundingClientRect();
      return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) }; })()`);
    fs.writeFileSync(path.join(out, `${c.id}.jpg`), (await win.webContents.capturePage(rect)).toJPEG(88));
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 1));
  app.quit();
}

// ---------------------------------------------------------------- updates

function setUpdateState(s) {
  updateState = s;
  win?.webContents.send('update-state', s);
}

/** Updates are published to the GitHub repository named in package.json → build.publish. */
function updatesConfigured() {
  try {
    const pub = require('../package.json').build.publish[0];
    return pub.owner && pub.owner !== 'CHANGE-ME';
  } catch {
    return false;
  }
}

function initUpdater() {
  if (!app.isPackaged || !updatesConfigured()) return; // updates only apply to configured, installed builds
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch {
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => setUpdateState({ status: 'checking' }));
  updater.on('update-available', (i) => setUpdateState({ status: 'downloading', version: i.version }));
  updater.on('update-not-available', () => setUpdateState({ status: 'current' }));
  updater.on('download-progress', (p) => setUpdateState({ status: 'downloading', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (i) => setUpdateState({ status: 'ready', version: i.version }));
  updater.on('error', (e) => setUpdateState({ status: 'error', message: String(e?.message || e) }));
  updater.checkForUpdates().catch(() => {});
}

async function checkForUpdatesInteractive() {
  if (!updater) {
    dialog.showMessageBox(win, {
      type: 'info',
      message: 'Automatic updates are not set up for this copy.',
      detail: !app.isPackaged
        ? 'This copy is running from source. Install the app with the setup program to receive automatic updates.'
        : 'This build has no update source configured (package.json → build.publish).',
    });
    return;
  }
  try {
    const r = await updater.checkForUpdates();
    if (!r || !r.updateInfo || r.updateInfo.version === app.getVersion()) {
      dialog.showMessageBox(win, { type: 'info', message: `You have the latest version (${app.getVersion()}).` });
    } else {
      dialog.showMessageBox(win, {
        type: 'info',
        message: `Version ${r.updateInfo.version} is downloading.`,
        detail: 'You will be asked to restart when it is ready. It also installs automatically the next time you close the app.',
      });
    }
  } catch (e) {
    dialog.showMessageBox(win, { type: 'error', message: 'Could not check for updates.', detail: String(e?.message || e) });
  }
}

ipcMain.handle('app-info', () => ({ version: app.getVersion(), packaged: app.isPackaged, update: updateState }));
ipcMain.handle('check-updates', () => checkForUpdatesInteractive());
ipcMain.handle('install-update', () => { if (updateState.status === 'ready') updater.quitAndInstall(); });

// ---------------------------------------------------------------- menu

function buildMenu() {
  const send = (cmd) => () => win?.webContents.send('command', cmd);
  const template = [
    {
      label: 'Calculator',
      submenu: [
        { label: 'Copy Result', accelerator: 'CmdOrCtrl+C', click: send('copy') },
        { type: 'separator' },
        { label: 'Reset All…', click: send('reset-all') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Always on Top', type: 'checkbox', click: (m) => win.setAlwaysOnTop(m.checked) },
        { label: 'Show Keyboard Shortcuts', accelerator: 'F1', click: send('help') },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Check for Updates…', click: () => checkForUpdatesInteractive() },
        { label: `About fx-991EX Emulator ${app.getVersion()}`, click: send('about') },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  initUpdater();
});

app.on('window-all-closed', () => app.quit());
