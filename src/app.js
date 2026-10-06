// Boots the emulator: keypad, LCD rendering, PC keyboard, window scaling, and host integration.
import { Calculator } from './calc/calculator.js';
import { MODES } from './calc/modes/index.js';
import { buildKeypad, KEYBOARD, KEYBOARD_HELP } from './ui/faceplate.js';
import { renderFrame } from './ui/view.js';

const lcd = document.getElementById('lcd');
const statusEl = document.getElementById('status');
const screenEl = document.getElementById('screen');
const toast = document.getElementById('toast');

function storage() {
  try {
    localStorage.setItem('fx991ex.probe', '1');
    return localStorage;
  } catch {
    return null;
  }
}

let blink;
function render() {
  renderFrame(calc, lcd, statusEl, screenEl);
  // the cursor blinks like the real LCD; restart the phase after every key
  clearInterval(blink);
  let on = true;
  blink = setInterval(() => {
    on = !on;
    for (const c of screenEl.querySelectorAll('.cursor')) c.classList.toggle('blink-off', !on);
  }, 500);
}

const calc = new Calculator({ modes: MODES, storage: storage(), onChange: render });
const flash = buildKeypad(document.getElementById('keypad'), (key) => calc.press(key));

function press(key) {
  flash(key);
  calc.press(key);
}

// used by the screenshot and parity-sheet harness (electron/main.cjs, tools/parity)
window.fx = {
  press,
  reset() {
    calc.resetAll();
    render();
  },
};

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const key = KEYBOARD[e.key];
  if (!key) return;
  e.preventDefault();
  press(key);
});

// ---------------------------------------------------------------- scale to the window

const DESIGN_W = 460, DESIGN_H = 960;
function fit() {
  const z = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H);
  document.getElementById('calc').style.zoom = String(z);
}
window.addEventListener('resize', fit);
fit();
render();

// ---------------------------------------------------------------- host (Electron) integration

function showToast(text, action) {
  toast.replaceChildren(document.createTextNode(text));
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', action.run);
    toast.append(b);
  }
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.background = 'transparent';
  close.addEventListener('click', () => { toast.hidden = true; });
  toast.append(close);
  toast.hidden = false;
}

function resultText() {
  const s = calc.top;
  if (!s.result) return null;
  const sel = screenEl.querySelector('.result-area');
  return sel ? sel.textContent.trim() : null;
}

if (window.host) {
  window.host.onCommand(async (cmd) => {
    switch (cmd) {
      case 'copy': {
        const t = resultText();
        if (t) await navigator.clipboard.writeText(t);
        break;
      }
      case 'reset-all':
        calc.resetAll();
        render();
        break;
      case 'help':
        showToast(KEYBOARD_HELP.map(([k, v]) => `${k}: ${v}`).join(' · '));
        break;
      case 'about': {
        const info = await window.host.info();
        showToast(`fx-991EX Emulator ${info.version}. Not affiliated with CASIO.`);
        break;
      }
      default: break;
    }
  });
  window.host.onUpdateState((s) => {
    if (s.status === 'ready') {
      showToast(`Update ${s.version} is ready.`, { label: 'Restart now', run: () => window.host.installUpdate() });
    }
  });
}
