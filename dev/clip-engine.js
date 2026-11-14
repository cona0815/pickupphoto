// ══════════════════════════════════════════════════════════════
// 2026v54 🔎 AI 看圖（本機）：Chinese-CLIP（OFA-Sys，MIT）＋ transformers.js 3.8.1（Apache-2.0）
// 照片不離開電腦：只下載程式與模型（固定版本、比對 SHA-256），在瀏覽器裡把每張照片算成 512 個數字（特徵），
// 存在這台電腦的瀏覽器（IndexedDB），之後打字找照片、分類、找相似都用這些數字比。
// ══════════════════════════════════════════════════════════════
const CLIP_TF_BASE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
const CLIP_TF_FILES = {
  'transformers.min.js': [888173, 'aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa'],
  'ort-wasm-simd-threaded.jsep.mjs': [44484, '08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9'],
  'ort-wasm-simd-threaded.jsep.wasm': [21596019, 'c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39'],
};
const CLIP_MODEL_ID = 'Xenova/chinese-clip-vit-base-patch16';
const CLIP_MODEL_REV = 'f26904860903e70e050b8f48255e5f48401816e9';
const CLIP_MODEL_BASE = `https://huggingface.co/${CLIP_MODEL_ID}/resolve/${CLIP_MODEL_REV}/`;
const CLIP_MODEL_FILES = {
  'config.json': [844, '19447ad8c20d274f0644a6663af56286be98bd2d0e5f9472fcb318e04fcd6961'],
  'preprocessor_config.json': [546, '61a78fdd2c7ac17b54b6190c0f4cb23423192c535003d52528d01e318a47608b'],
  'tokenizer_config.json': [1315, '38fbc894183595cc1168e36150251b2fb658197b3a49f6908cce88ae22acd52a'],
  'tokenizer.json': [439124, '7dfbf1966ebf99d471c3796e9b457329d2b2182b817e144f1e904b957745c839'],
  'onnx/model_quantized.onnx': [190842404, 'a2c2849329eafb24100acec5a9421a39f8cb445296444c5c98855b69e5e7a751'],
  'onnx/model_fp16.onnx': [377377730, '0fad978faa89b85fda53a83a4c202116a9eb87c8f9723fb4d85e4483efbce4b2'],
};
const CLIP_CACHE = 'pickup-clip-v1';
const clipState = { loaded: false, loading: null, error: '', device: '', dtype: '', T: null, model: null, tok: null, proc: null, dummyText: null, blankPx: null, textMemo: new Map() };

// 用顯示卡（WebGPU＋半精度）還是 CPU（小模型）
async function clipPlan() {
  if (clipState.plan) return clipState.plan;
  let gpu = false;
  try { if (navigator.gpu && localStorage.getItem('clipPrefer') !== 'small') { const a = await navigator.gpu.requestAdapter(); gpu = !!(a && a.features && a.features.has('shader-f16')); } } catch (e) {}
  clipState.plan = gpu ? { device: 'webgpu', dtype: 'fp16', file: 'onnx/model_fp16.onnx', mb: 377, label: '顯示卡（快，一張約 0.05～0.2 秒）' }
                       : { device: 'wasm', dtype: 'q8', file: 'onnx/model_quantized.onnx', mb: 191, label: 'CPU（一張約 0.5～1 秒）' };
  return clipState.plan;
}
async function clipCachedNames() {
  try { const c = await caches.open(CLIP_CACHE); return new Set((await c.keys()).map(r => r.url)); } catch (e) { return new Set(); }
}
// 下載 → 比對大小與 SHA-256 → 存進瀏覽器快取（下次不用再下載）；不符就丟掉、不使用
async function clipFetchVerified(url, spec, pc) {
  let cache = null; try { cache = await caches.open(CLIP_CACHE); const hit = await cache.match(url); if (hit) return await hit.arrayBuffer(); } catch (e) {}
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error('下載失敗 HTTP ' + res.status);
  let buf;
  if (res.body && pc) {
    const rd = res.body.getReader(), parts = []; let got = 0, lastT = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; const t = performance.now(); if (t - lastT > 250) { lastT = t; pc(got, spec[0]); } }
    const u8 = new Uint8Array(got); let o = 0; for (const p of parts) { u8.set(p, o); o += p.length; } buf = u8.buffer;
  } else buf = await res.arrayBuffer();
  if (buf.byteLength !== spec[0] || await sha256Hex(buf) !== spec[1]) {
    try { memMonLogEvent('clip_hash_fail', `⚠️ ${url.split('/').pop()} 驗證失敗`); } catch (e) {}
    throw new Error(`檔案驗證失敗（${url.split('/').pop()}，SHA-256 不符），已丟棄`);
  }
  try { if (cache) await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } })); } catch (e) {}
  return buf;
}
async function clipEnsure(pc = () => {}) {
  if (clipState.loaded) return true;
  if (clipState.loading) return clipState.loading;
  clipState.loading = (async () => {
    try {
      let plan = await clipPlan();
      try { await clipLoadOnce(plan, pc); }
      catch (e) {
        if (plan.device !== 'webgpu') throw e;
        console.warn('clip webgpu failed → cpu', e);   // 顯示卡不行 → 改 CPU 小模型
        try { localStorage.setItem('clipPrefer', 'small'); } catch (e2) {}
        clipState.plan = null; plan = await clipPlan();
        await clipLoadOnce(plan, pc);
      }
      clipState.loaded = true; clipState.error = '';
      pc(100, '看圖模型準備好了');
      try { memMonLogEvent('clip_ready', `🔎 看圖模型：${plan.device} ${plan.dtype}`); } catch (e) {}
      return true;
    } catch (e) {
      clipState.error = (e && e.message) || String(e); console.warn('clip load', e);
      return false;
    } finally { clipState.loading = null; }
  })();
  return clipState.loading;
}
async function clipLoadOnce(plan, pc) {
  const MB = n => (n / 1048576).toFixed(0);
  let T = clipState.T;
  if (!T) {
    // 1) 程式庫（transformers.js）與推論引擎：固定版本、比對 SHA-256，再用 blob: 載入
    pc(1, '下載看圖程式（transformers.js，約 1 MB）…');
    const tfBuf = await clipFetchVerified(CLIP_TF_BASE + 'transformers.min.js', CLIP_TF_FILES['transformers.min.js']);
    pc(3, '下載推論引擎（約 21 MB，只下載一次）…');
    const mjsBuf = await clipFetchVerified(CLIP_TF_BASE + 'ort-wasm-simd-threaded.jsep.mjs', CLIP_TF_FILES['ort-wasm-simd-threaded.jsep.mjs']);
    const wasmBuf = await clipFetchVerified(CLIP_TF_BASE + 'ort-wasm-simd-threaded.jsep.wasm', CLIP_TF_FILES['ort-wasm-simd-threaded.jsep.wasm'], (g, t) => pc(3 + Math.round(g / t * 7), `下載推論引擎 ${MB(g)} / ${MB(t)} MB…`));
    T = await import(URL.createObjectURL(new Blob([tfBuf], { type: 'text/javascript' })));
    T.env.allowLocalModels = false;
    T.env.useBrowserCache = false;
    T.env.backends.onnx.wasm.wasmPaths = { mjs: URL.createObjectURL(new Blob([mjsBuf], { type: 'text/javascript' })), wasm: URL.createObjectURL(new Blob([wasmBuf], { type: 'application/wasm' })) };
    T.env.backends.onnx.wasm.numThreads = 1;
    T.env.backends.onnx.wasm.proxy = false;
    clipState.T = T;
  }
  // 2) 模型：只給 transformers.js 我們驗證過的檔案（固定版本）
  const files = {};
  for (const f of ['config.json', 'preprocessor_config.json', 'tokenizer_config.json', 'tokenizer.json', plan.file]) {
    const big = f === plan.file;
    if (big) pc(10, `下載看圖模型（約 ${plan.mb} MB，只下載一次）…`);
    files[CLIP_MODEL_BASE + f] = await clipFetchVerified(CLIP_MODEL_BASE + f, CLIP_MODEL_FILES[f], big ? (g, t) => pc(10 + Math.round(g / t * 75), `下載看圖模型 ${MB(g)} / ${MB(t)} MB…`) : null);
  }
  T.env.useCustomCache = true;
  T.env.customCache = {
    match: async key => { const u = typeof key === 'string' ? key : key && key.url; const b = files[u]; return b ? new Response(b.slice(0)) : undefined; },
    put: async () => {},
  };
  T.env.allowRemoteModels = true;    // 需要的檔案都由上面驗證過的 customCache 提供（固定版本），不會另外下載
  pc(88, '初始化看圖模型…');
  const opt = { revision: CLIP_MODEL_REV };
  clipState.proc = await T.AutoProcessor.from_pretrained(CLIP_MODEL_ID, opt);
  clipState.tok = await T.AutoTokenizer.from_pretrained(CLIP_MODEL_ID, opt);
  clipState.model = await T.ChineseCLIPModel.from_pretrained(CLIP_MODEL_ID, { ...opt, dtype: plan.dtype, device: plan.device });
  clipState.device = plan.device; clipState.dtype = plan.dtype;
  clipState.dummyText = clipState.tok(['照片'], { padding: true, truncation: true });
  clipState.blankPx = await clipState.proc(new T.RawImage(new Uint8ClampedArray(224 * 224 * 3).fill(128), 224, 224, 3));
  clipState.textMemo.clear();
  // 自我檢查：算一張測試圖與兩句話，結果要是正常數字、而且不一樣（顯示卡算錯 → 改 CPU）
  const chk = await clipEmbedPixels(clipState.blankPx);
  const [ta, tb] = await clipEmbedTexts(['一隻貓', '一張收據']);
  let dot = 0; for (let i = 0; i < ta.length; i++) dot += ta[i] * tb[i];
  if (!chk || [...chk].some(v => !Number.isFinite(v)) || !(dot < 0.98)) throw new Error('看圖模型算出來的數字不正常（' + plan.device + '）');
}
function clipNorm(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; s = Math.sqrt(s) || 1; const o = new Float32Array(v.length); for (let i = 0; i < v.length; i++) o[i] = v[i] / s; return o; }
async function clipEmbedPixels(px) {
  const out = await clipState.model({ ...clipState.dummyText, ...px });
  return clipNorm(out.image_embeds.data);
}
// 一張照片 → 512 個數字（先縮小再算，快很多）
async function clipEmbedImage(blob) {
  const bmp = await createImageBitmap(blob, { resizeWidth: 320, resizeQuality: 'medium' });
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close();
  const img = clipState.T.RawImage.fromCanvas(c);
  return clipEmbedPixels(await clipState.proc(img));
}
// 一批文字 → 各自 512 個數字（記住算過的）
async function clipEmbedTexts(texts) {
  const need = [...new Set(texts.filter(t => !clipState.textMemo.has(t)))];
  for (let i = 0; i < need.length; i += 16) {
    const part = need.slice(i, i + 16);
    const ti = clipState.tok(part, { padding: true, truncation: true, max_length: 52 });
    const out = await clipState.model({ ...ti, ...clipState.blankPx });
    const d = out.text_embeds.data, n = d.length / part.length;
    part.forEach((t, k) => clipState.textMemo.set(t, clipNorm(d.subarray(k * n, (k + 1) * n))));
  }
  return texts.map(t => clipState.textMemo.get(t));
}
function clipMean(vs) { const o = new Float32Array(vs[0].length); for (const v of vs) for (let i = 0; i < o.length; i++) o[i] += v[i]; return clipNorm(o); }
