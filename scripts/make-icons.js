// Renders build/icon.png and the menu bar template icons offscreen (no window is shown).
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
if (process.platform === 'darwin' && app.setActivationPolicy) app.setActivationPolicy('accessory');
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, width: 400, height: 400, webPreferences: { offscreen: true } });
  await w.loadFile(path.join(__dirname, 'icon.html'));
  const r = await w.webContents.executeJavaScript('makeIcons()');
  const root = path.join(__dirname, '..');
  const write = (rel, url) => {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', rel);
  };
  write('build/icon.png', r.app);
  write('assets/trayTemplate.png', r.tray);
  write('assets/trayTemplate@2x.png', r.tray2x);
  write('assets/tray.png', r.win);
  write('assets/tray@2x.png', r.win2x);
  write('site/img/chute.png', r.chute);
  write('site/img/trot.png', r.trot);
  write('site/img/favicon.png', r.favicon);
  app.exit(0);
});
