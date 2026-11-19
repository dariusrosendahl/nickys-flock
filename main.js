// Nicky's Flock: a menu bar app that lets comic sheep wander across the screen.
// One transparent, click-through, always-on-top window covers the main display's
// work area. It never takes focus, so typing in other apps is never interrupted.
const { app, BrowserWindow, Tray, Menu, screen, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const argValue = (name) => {
  const a = process.argv.find((x) => x === name || x.startsWith(name + '='));
  if (!a) return null;
  return a.includes('=') ? a.slice(a.indexOf('=') + 1) : '';
};
const SELFTEST = argValue('--selftest');
const INDEX = path.join(__dirname, 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, 'preload.js');

// menu bar app: no Dock icon, never becomes the active app
if (process.platform === 'darwin' && app.setActivationPolicy) app.setActivationPolicy('accessory');
if (process.platform === 'win32') app.setAppUserModelId('nl.doordarius.nickysflock');

const DEFAULT_SETTINGS = { spawn: 'sometimes', maxFlock: 12, toolbox: true, sound: true, hidden: false };

let win = null;
let tray = null;
let data = { settings: { ...DEFAULT_SETTINGS }, flock: null, firstRunDone: false };
let stats = { sheep: 0, penned: 0, wool: 0 };
let cursorTimer = null;
let quitting = false;

// ---------- storage ----------
const dataFile = () => path.join(app.getPath('userData'), 'flock.json');
function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    data = { ...data, ...d, settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) } };
  } catch (e) {
    /* first run or unreadable file: keep defaults */
  }
}
function saveData() {
  try {
    fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
    const tmp = dataFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, dataFile());
  } catch (e) {
    console.error('Could not save the flock:', e.message);
  }
}

// ---------- overlay window ----------
function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function createOverlay() {
  const wa = workArea();
  win = new BrowserWindow({
    x: wa.x,
    y: wa.y,
    width: wa.width,
    height: wa.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    acceptFirstMouse: true,
    roundedCorners: false,
    show: false,
    alwaysOnTop: true,
    type: process.platform === 'darwin' ? 'panel' : 'toolbar',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      spellcheck: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(INDEX);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; });
}

function fitOverlay() {
  if (!win) return;
  const wa = workArea();
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
}

function showOverlay(show) {
  if (!win) return;
  if (show) win.showInactive();
  else win.hide();
}

function startCursorFeed() {
  let lx = null, ly = null;
  cursorTimer = setInterval(() => {
    if (!win || !win.isVisible()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    const x = p.x - b.x, y = p.y - b.y;
    if (x === lx && y === ly) return;
    lx = x; ly = y;
    win.webContents.send('flock:cursor', { x, y });
  }, 33);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------- settings + tray ----------
function setSetting(key, value) {
  data.settings[key] = value;
  saveData();
  if (key === 'hidden') showOverlay(!value);
  send('flock:settings', data.settings);
  refreshTray();
}

function trayIcon() {
  // macOS: black template image that follows the menu bar colour.
  // Windows: a coloured sheep that reads on both light and dark taskbars.
  const mac = process.platform === 'darwin';
  const p = path.join(__dirname, 'assets', mac ? 'trayTemplate.png' : 'tray.png');
  const img = nativeImage.createFromPath(p);
  if (mac && !img.isEmpty()) img.setTemplateImage(true);
  return img;
}

function buildMenu() {
  const s = data.settings;
  const radio = (key, value, label) => ({
    label, type: 'radio', checked: s[key] === value, click: () => setSetting(key, value),
  });
  const items = [
    { label: "Nicky's Flock", enabled: false },
    { label: `${stats.sheep} sheep · ${stats.penned} in the pen · ${stats.wool} wool`, enabled: false },
    { type: 'separator' },
    { label: 'Drop a sheep now', enabled: !s.hidden, click: () => send('flock:command', 'spawn') },
    { label: 'Drop some hay', enabled: !s.hidden, click: () => send('flock:command', 'hay') },
    { label: 'Whistle for the dog', enabled: !s.hidden, click: () => send('flock:command', 'dog') },
    { type: 'separator' },
    { label: 'Hide the sheep', type: 'checkbox', checked: s.hidden, click: (i) => setSetting('hidden', i.checked) },
    { label: 'Show the toolbox', type: 'checkbox', checked: s.toolbox, click: (i) => setSetting('toolbox', i.checked) },
    { label: 'Sounds', type: 'checkbox', checked: s.sound, click: (i) => setSetting('sound', i.checked) },
    {
      label: 'New sheep arrive',
      submenu: [
        radio('spawn', 'often', 'About every minute'),
        radio('spawn', 'sometimes', 'Every few minutes'),
        radio('spawn', 'rarely', 'A few times an hour'),
      ],
    },
    {
      label: 'Flock size',
      submenu: [
        radio('maxFlock', 6, 'Small (6 sheep)'),
        radio('maxFlock', 12, 'Medium (12 sheep)'),
        radio('maxFlock', 20, 'Big (20 sheep)'),
      ],
    },
  ];
  if (app.isPackaged) {
    items.push({
      label: 'Open at login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    });
  }
  items.push({ type: 'separator' }, { label: "Quit Nicky's Flock", accelerator: process.platform === 'darwin' ? 'Command+Q' : undefined, click: () => app.quit() });
  return Menu.buildFromTemplate(items);
}

let trayRefresh = null;
function refreshTray() {
  if (!tray) return;
  clearTimeout(trayRefresh);
  trayRefresh = setTimeout(() => {
    tray.setContextMenu(buildMenu());
    tray.setToolTip(`Nicky's Flock: ${stats.sheep} sheep`);
  }, 150);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip("Nicky's Flock");
  tray.setContextMenu(buildMenu());
  // Windows opens tray menus on right-click only; open it on left-click too
  if (process.platform !== 'darwin') tray.on('click', () => tray.popUpContextMenu());
}

// ---------- ipc ----------
function registerIpc() {
  ipcMain.handle('flock:init', () => ({ settings: data.settings, flock: data.flock }));
  ipcMain.on('flock:ready', () => { if (!data.settings.hidden) showOverlay(true); });
  ipcMain.on('flock:save', (_e, flock) => { data.flock = flock; saveData(); });
  ipcMain.on('flock:stats', (_e, s) => { stats = s; refreshTray(); });
  ipcMain.on('flock:capture', (_e, on) => {
    if (!win) return;
    if (on) win.setIgnoreMouseEvents(false);
    else win.setIgnoreMouseEvents(true, { forward: true });
  });
}

// ---------- self-test (headless, never shows a window) ----------
async function runSelftest() {
  const outDir = SELFTEST || path.join(os.tmpdir(), 'nickys-flock-selftest');
  fs.mkdirSync(outDir, { recursive: true });
  const errors = [];
  const windows = [];
  const shoot = async (query, file, ms, script) => {
    const w = new BrowserWindow({
      width: 1440, height: 900, show: false, transparent: false,
      webPreferences: { offscreen: true, preload: PRELOAD, contextIsolation: true, sandbox: true },
    });
    w.webContents.on('console-message', (e, level, message) => {
      const lv = typeof e.level === 'string' ? e.level : level;
      const msg = e.message || message;
      if (lv === 'error' || lv === 3 || lv === 'warning' || lv === 2) errors.push(`[${file}] ${msg}`);
    });
    w.webContents.on('render-process-gone', (_e, d) => errors.push(`[${file}] renderer gone: ${d.reason}`));
    let img = null;
    w.webContents.on('paint', (_e, _dirty, image) => { img = image; });
    w.webContents.setFrameRate(30);
    await w.loadFile(INDEX, { query });
    if (script) await w.webContents.executeJavaScript(script);
    await new Promise((r) => setTimeout(r, ms));
    const probe = await w.webContents.executeJavaScript(
      'JSON.stringify({sheep: __flock.G.sheep.map(s => s.name + ":" + s.state + (s.penned ? ":penned" : "")), hay: __flock.G.hay.length, wool: __flock.G.wool, fx: __flock.G.fx.length})'
    );
    const image = (await w.webContents.capturePage()) || img;
    fs.writeFileSync(path.join(outDir, file), image.toPNG());
    console.log(`SELFTEST ${file}: ${probe}`);
    windows.push(w);
  };
  try {
    await shoot({ preview: '1', demo: '1' }, 'demo.png', 1800);
    // a live run: spawn a few sheep, drop hay, whistle the dog, let it play out
    await shoot({ preview: '1' }, 'live.png', 7000,
      "localStorage.clear(); setTimeout(() => { __flock.command('spawn'); __flock.command('spawn'); __flock.command('spawn'); __flock.command('hay'); __flock.command('dog'); }, 2500); true");
  } catch (e) {
    errors.push(String(e && e.stack || e));
  }
  for (const w of windows) w.destroy();
  console.log(`SELFTEST errors: ${JSON.stringify(errors)}`);
  console.log(`SELFTEST output: ${outDir}`);
  app.exit(errors.length ? 1 : 0);
}

// ---------- app lifecycle ----------
if (SELFTEST !== null) {
  app.disableHardwareAcceleration();
  app.whenReady().then(runSelftest);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    if (process.platform === 'darwin' && app.dock) app.dock.hide();
    loadData();
    if (!data.firstRunDone) {
      data.firstRunDone = true;
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });
      saveData();
    }
    registerIpc();
    createOverlay();
    createTray();
    startCursorFeed();
    screen.on('display-metrics-changed', fitOverlay);
    screen.on('display-added', fitOverlay);
    screen.on('display-removed', fitOverlay);
  });

  app.on('second-instance', () => {
    if (data.settings.hidden) setSetting('hidden', false);
    send('flock:command', 'spawn');
  });

  app.on('before-quit', (e) => {
    if (quitting || !win) return;
    e.preventDefault();
    quitting = true;
    clearInterval(cursorTimer);
    send('flock:command', 'save');
    setTimeout(() => app.quit(), 300);
  });

  app.on('window-all-closed', () => { /* menu bar app: keep running */ });
}
