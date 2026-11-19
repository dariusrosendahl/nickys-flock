// Full-page screenshots of site/index.html (offscreen) at desktop and phone width, light and dark.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
if (process.platform === 'darwin' && app.setActivationPolicy) app.setActivationPolicy('accessory');
app.disableHardwareAcceleration();
const root = path.join(__dirname, '..');
const outDir = process.argv[2] || '/tmp/nickys-flock-page';
const runs = [
  { name: 'desktop-light', w: 1440, theme: 'light' },
  { name: 'desktop-dark', w: 1440, theme: 'dark' },
  { name: 'phone-light', w: 390, theme: 'light' },
];
app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const keep = [];
  for (const r of runs) {
    const w = new BrowserWindow({ show: false, width: r.w, height: 900, webPreferences: { offscreen: true } });
    w.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') console.log('CONSOLE', r.name, e.message); });
    await w.loadFile(path.join(root, 'site', 'index.html'));
    const info = await w.webContents.executeJavaScript(`
      document.documentElement.dataset.theme = '${r.theme}';
      document.querySelectorAll('[loading=lazy]').forEach(e => e.loading = 'eager');
      new Promise(res => setTimeout(() => res({ h: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }), 1500));
    `);
    w.setContentSize(r.w, Math.min(info.h, 7000));
    await new Promise((res) => setTimeout(res, 1800));
    const img = await w.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, r.name + '.png'), img.toPNG());
    console.log(r.name, JSON.stringify(info), 'overflow:', info.sw > info.cw);
    keep.push(w);
  }
  keep.forEach((w) => w.destroy());
  app.exit(0);
});
