/* 校園拾光 service worker — 2026v8 (2026-10-28)
   - 網頁本身（index.html、圖示）：先上網拿最新版，沒網路才用快取 → 老師永遠拿到最新版本
   - 公開程式庫與模型（jsDelivr、cdnjs、Google Fonts、YuNet 模型）：第一次下載後存起來，之後離線也能篩照片
   - Gemini、Google 登入／雲端硬碟、OpenStreetMap：一律直接上網，不快取（這些也只有老師按了才會送） */
const VERSION = '2026v8';
const SHELL = `shell-${VERSION}`, LIBS = 'libs-v1';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'media.githubusercontent.com', 'raw.githubusercontent.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    // 網頁本身：網路優先
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    // 程式庫與模型：快取優先（版本號寫在網址裡，不會拿到舊的）
    e.respondWith(caches.open(LIBS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }))));
  }
  // 其他（Gemini、Google API、OpenStreetMap）：不攔截，直接上網
});
