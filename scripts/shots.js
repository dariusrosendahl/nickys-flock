// Renders the marketing screenshots offscreen (no window is shown) into site/shots/.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
if (process.platform === 'darwin' && app.setActivationPolicy) app.setActivationPolicy('accessory');
app.disableHardwareAcceleration();

const root = path.join(__dirname, '..');
const out = path.join(root, 'site', 'shots');
const SHOTS = [
  { file: 'desktop.png', page: 'scripts/desk.html', query: {}, wait: 2200, w: 1280, h: 800 },
  { file: 'herd.png', page: 'renderer/index.html', query: { preview: '1', theme: 'light', demo: 'herd', toolbox: '0' }, wait: 350, w: 820, h: 560 },
  { file: 'feed.png', page: 'renderer/index.html', query: { preview: '1', theme: 'light', demo: 'feed', toolbox: '0' }, wait: 1200, w: 820, h: 560 },
  { file: 'shear.png', page: 'renderer/index.html', query: { preview: '1', theme: 'light', demo: 'shear' }, wait: 1200, w: 820, h: 560 },
];

app.whenReady().then(async () => {
  fs.mkdirSync(out, { recursive: true });
  const keep = [];
  let failed = false;
  for (const s of SHOTS) {
    const w = new BrowserWindow({ show: false, width: s.w * 2, height: s.h * 2, webPreferences: { offscreen: true, zoomFactor: 2 } });
    w.webContents.on('console-message', (e) => { if (e.level === 'error') { failed = true; console.log('ERROR', s.file, e.message); } });
    await w.loadFile(path.join(root, s.page), { query: s.query });
    await new Promise((r) => setTimeout(r, s.wait));
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(out, s.file), img.toPNG());
    console.log('wrote', s.file, img.getSize());
    keep.push(w);
  }
  keep.forEach((w) => w.destroy());
  app.exit(failed ? 1 : 0);
});
