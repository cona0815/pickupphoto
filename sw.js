/* 校園拾光 service worker — 2026v18 (2026-11-01)
   - 網頁本身（index.html、圖示）：先上網拿最新版，沒網路才用快取 → 老師永遠拿到最新版本
   - 公開程式庫與模型（jsDelivr、cdnjs、Google Fonts、YuNet 模型）：第一次下載後存起來，之後離線也能篩照片
   - Gemini、Google 登入／雲端硬碟、OpenStreetMap：一律直接上網，不快取（這些也只有老師按了才會送）
   - 2026v16：手機相簿「分享 → 校園拾光」（manifest share_target）→ 收到的照片暫存在這支手機的 IndexedDB，網頁匯入後立刻刪掉；不經過任何伺服器 */
const VERSION = '2026v23';
const SHELL = `shell-${VERSION}`, LIBS = 'libs-v1';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'media.githubusercontent.com', 'raw.githubusercontent.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// 2026v16: 分享進來的照片 → IndexedDB photoPickerCache / kv 'inbox'（跟網頁同一個資料庫，版本 3）
function inboxDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('photoPickerCache', 3);
    r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('analysis')) db.createObjectStore('analysis', { keyPath: 'key' }); if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function inboxPut(files) {
  const db = await inboxDb();
  await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ at: Date.now(), files }, 'inbox'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  db.close();
}
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      let n = 0;
      try { const fd = await req.formData(); const files = fd.getAll('photos').filter(f => f && typeof f === 'object' && f.size); n = files.length; await inboxPut(files); }
      catch (err) { console.warn('share-target', err); }
      return Response.redirect(new URL(`./?share=${n}`, self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
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
