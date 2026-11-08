/* 校園拾光 service worker — 2026v18 (2026-11-01)
   - 網頁本身（index.html、圖示）：先上網拿最新版，沒網路才用快取 → 老師永遠拿到最新版本
   - 公開程式庫與模型（jsDelivr、cdnjs、Google Fonts、YuNet 模型）：第一次下載後存起來，之後離線也能篩照片
   - Gemini、Google 登入／雲端硬碟、OpenStreetMap：一律直接上網，不快取（這些也只有老師按了才會送）
   - 2026v31：回顧短片的內建配樂（audio/bgm/，含 jsDelivr 上的同一批檔案）一律直接上網、不快取 → 不佔手機空間
   - 2026v27：資安第三輪（網頁端）；網站上不再提供 versions/ 舊版
   - 2026v26：分享入口不收別的網站（referrer 是別的網域）送來的照片；網頁匯入前先讓老師確認
   - 2026v25：外部程式庫改用 SRI（crossorigin）載入 → 程式庫快取換成 libs-v2；舊快取裡沒有 CORS 的版本刪掉，不然 SRI 會拒絕
   - 2026v16：手機相簿「分享 → 校園拾光」（manifest share_target）→ 收到的照片暫存在這支手機的 IndexedDB，網頁匯入後立刻刪掉；不經過任何伺服器 */
const VERSION = '2026v35';
const SHELL = `shell-${VERSION}`, LIBS = 'libs-v2';
const SHELL_FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'media.githubusercontent.com', 'raw.githubusercontent.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => (k.startsWith('shell-') && k !== SHELL) || (k.startsWith('libs-') && k !== LIBS)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
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
      // 2026v26 資安：別的網站用表單送來的（referrer 是別的網域）一律不收；手機系統分享表沒有 referrer。
      // （拿掉 referrer 的硬塞還擋不掉 → 網頁那邊會先秀縮圖、老師按「匯入」才匯入）
      let ref = ''; try { ref = req.referrer ? new URL(req.referrer).origin : ''; } catch {}
      if (ref && ref !== self.location.origin) return Response.redirect(new URL('./', self.registration.scope).href, 303);
      try { const fd = await req.formData(); const files = fd.getAll('photos').filter(f => f && typeof f === 'object' && f.size); n = files.length; await inboxPut(files); }
      catch (err) { console.warn('share-target', err); }
      return Response.redirect(new URL(`./?share=${n}`, self.registration.scope).href, 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  if (url.pathname.includes('/audio/bgm/')) return;   // 2026v31：內建配樂不快取（只在試聽／製作時抓那一首）
  if (url.origin === self.location.origin) {
    // 網頁本身：網路優先
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  if (LIB_HOSTS.includes(url.hostname)) {
    // 程式庫與模型：快取優先（版本號寫在網址裡，不會拿到舊的）
    // 2026v25：要做 SRI 比對的程式庫是 CORS 請求 → 只能拿 CORS 回應；opaque 的只給 no-cors 請求（例如字型 CSS）
    e.respondWith(caches.open(LIBS).then(c => c.match(req).then(hit => (hit && (hit.type !== 'opaque' || req.mode === 'no-cors')) ? hit
      : fetch(req).then(res => { if (res.ok || (res.type === 'opaque' && req.mode === 'no-cors')) c.put(req, res.clone()); return res; }))));
  }
  // 其他（Gemini、Google API、OpenStreetMap）：不攔截，直接上網
});
