const { app, BrowserWindow, desktopCapturer, shell } = require('electron');
const path = require('node:path');
const config = require('./app-config.json');

const DEV_URL = 'http://127.0.0.1:3000';

function configuredUrl() {
  if (!app.isPackaged) return DEV_URL;
  const value = (process.env.COMMUTE_BATTLE_APP_URL || config.appUrl)?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#1a1d21',
    title: 'Commute Battle',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 허들(1:1 음성 통화 + 화면 공유)에 필요한 권한은 앱이 직접 여는 주소에서만 허용합니다.
  const mediaOrigins = new Set([new URL(DEV_URL).origin]);
  const media = new Set(['media', 'audioCapture', 'display-capture']);
  const allowedMedia = (url) => { try { return mediaOrigins.has(new URL(url).origin); } catch { return false; } };

  win.webContents.session.setPermissionRequestHandler((contents, permission, callback) => {
    callback(media.has(permission) && allowedMedia(contents.getURL()));
  });
  win.webContents.session.setPermissionCheckHandler((contents, permission, origin) => (
    media.has(permission) && allowedMedia(origin || contents?.getURL() || '')
  ));
  win.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    // Windows 11에서는 운영체제 화면 선택기를 띄우고, 실패하면 첫 번째 화면을 공유합니다.
    desktopCapturer.getSources({ types: ['screen', 'window'] })
      .then((sources) => callback(sources.length ? { video: sources[0] } : null))
      .catch(() => callback(null));
  }, { useSystemPicker: true });

  const appUrl = configuredUrl();
  if (appUrl) {
    mediaOrigins.add(new URL(appUrl).origin);
    const allowedOrigin = new URL(appUrl).origin;
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      if (new URL(url).origin !== allowedOrigin) {
        event.preventDefault();
        void shell.openExternal(url);
      }
    });
    void win.loadURL(appUrl);
  } else {
    const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>Commute Battle 설정</title><style>body{margin:0;display:grid;min-height:100vh;place-items:center;background:#f6f8fc;color:#172033;font:16px system-ui}.card{max-width:620px;padding:40px;border:1px solid #e2e8f0;background:white;box-shadow:0 12px 36px #0f172a12}h1{margin-top:0}code{display:block;padding:14px;background:#eff6ff;color:#1d4ed8}</style><div class="card"><h1>앱 주소 설정이 필요합니다</h1><p>패키징 전에 desktop/app-config.json에 배포된 HTTPS 주소를 입력해 주세요.</p><code>{ "appUrl": "https://your-app.example.com" }</code></div></html>`;
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
