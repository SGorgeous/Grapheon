'use strict';
/* ==========================================================================
   GRAPHEON · core/store.js
   素材库（用户文件夹）的存储适配层。

   为什么要抽象：以后这个项目可能被包成 exe、或者移植到手机上跑。
   那两种环境里都没有「用户随手能打开的磁盘文件夹」，所以**上层不能直接调
   File System Access API**，只能认下面这几个方法，后端可以整个换掉。

   三个后端，按可用性从好到差自动挑：
     fs    File System Access API —— 桌面 Edge/Chrome，真·磁盘文件夹（默认 user/）
     idb   IndexedDB              —— 哪儿都能跑：手机、exe 里的 WebView、不支持的浏览器
     mem   内存                    —— 最后的兜底，刷新就没了（至少在测试里能用）

   每个后端都实现同一套（全部 async）：
     ready()                    能不能用
     label                      给人看的名字
     list()                     -> [{ kind, name, size, id }]
     get(id)                    -> Blob
     put(kind, name, blob)      -> id
     del(id)
   ========================================================================== */

const ASSET_KINDS = ['assets', 'docs', 'themes', 'fonts'];
const ASSET_KIND_LABEL = { assets:'图片', docs:'作品', themes:'主题', fonts:'字体' };
const ASSET_EXT = {
  assets: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
  docs:   ['json'],
  themes: ['css'],          // 主题也可能是 json，见 kindOfFile 的兜底规则
  fonts:  ['ttf', 'otf', 'woff', 'woff2']
};
const DEFAULT_USER_DIR = 'user';
const USERDIR_KEY = 'grapheon.userdir.v1';

/* 按扩展名归类。认不出来的一律丢进 assets（至少能当素材摆着）。 */
function kindOfFile(name){
  const ext = String(name || '').toLowerCase().replace(/^.*\./, '');
  for (const k of ASSET_KINDS) if (ASSET_EXT[k].indexOf(ext) >= 0) return k;
  return 'assets';
}
/* 主题的 json 要单独认一下：里面有 canvas 调色板的算主题，否则算作品 */
function kindOfJson(obj){
  return (obj && obj.canvas && (obj.canvas.bg || obj.canvas.white)) ? 'themes' : 'docs';
}

/* ---------------- 后端 1：内存 ---------------- */
function makeMemStore(){
  const rows = [];
  let n = 0;
  return {
    id:'mem', label:'临时（刷新即失）',
    async ready(){ return true; },
    async list(){ return rows.map(r => ({ kind:r.kind, name:r.name, size:r.blob.size, id:r.id })); },
    async get(id){ const r = rows.find(x => x.id === id); return r ? r.blob : null; },
    async put(kind, name, blob){
      const id = 'm' + (++n);
      rows.push({ id, kind, name, blob });
      return id;
    },
    async del(id){ const i = rows.findIndex(x => x.id === id); if (i >= 0) rows.splice(i, 1); },
    async clear(){ rows.length = 0; }
  };
}

/* ---------------- 后端 2：IndexedDB ----------------
   手机 / exe / 不支持 FS Access 的浏览器都走这条。 */
const IDB_NAME = 'grapheon.lib.v1';
const IDB_STORE = 'files';
const IDB_META = 'meta';
const IDB_VERSION = 2;
/* 开库。**两个 store 必须一起建** —— 早先 makeIdbStore 和 saveDirHandle 各开各的、
   版本都写 1，谁先建谁把 onupgradeneeded 用掉了，后一个的 store 就永远不存在，
   于是「保存目录句柄」一调就炸（测试里就是 S22 报的那个错）。 */
let _libDb = null;
function openLibDb(){
  return new Promise((res, rej) => {
    if (_libDb) return res(_libDb);
    if (typeof indexedDB === 'undefined') return rej(new Error('没有 IndexedDB'));
    const rq = indexedDB.open(IDB_NAME, IDB_VERSION);
    rq.onupgradeneeded = () => {
      const d = rq.result;
      if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE, { keyPath:'id' });
      if (!d.objectStoreNames.contains(IDB_META))  d.createObjectStore(IDB_META,  { keyPath:'k' });
    };
    rq.onsuccess = () => { _libDb = rq.result; res(_libDb); };
    rq.onerror = () => rej(rq.error || new Error('IndexedDB 打不开'));
  });
}
function makeIdbStore(){
  const tx = (mode, fn) => openLibDb().then(d => new Promise((res, rej) => {
    const t = d.transaction(IDB_STORE, mode);
    const st = t.objectStore(IDB_STORE);
    const out = fn(st);
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
    t.onerror = () => rej(t.error);
  }));
  let n = 0;
  return {
    id:'idb', label:'浏览器内置（IndexedDB）',
    async ready(){ try { await open(); return true; } catch(e){ return false; } },
    async list(){
      const all = await tx('readonly', st => st.getAll());
      return (all || []).map(r => ({ kind:r.kind, name:r.name, size:r.blob ? r.blob.size : 0, id:r.id }));
    },
    async get(id){ const r = await tx('readonly', st => st.get(id)); return r ? r.blob : null; },
    async put(kind, name, blob){
      const id = 'i' + Date.now().toString(36) + (++n);
      await tx('readwrite', st => st.put({ id, kind, name, blob }));
      return id;
    },
    async del(id){ await tx('readwrite', st => st.delete(id)); },
    async clear(){ await tx('readwrite', st => st.clear()); }
  };
}

/* ---------------- 后端 3：File System Access ----------------
   真正的磁盘文件夹（默认 user/）。句柄可以存进 IndexedDB，下次重连。
   注意：showDirectoryPicker 必须在**用户手势**里调，不能自动弹。 */
const HANDLE_KEY = 'grapheon.dirhandle.v1';
function hasFsAccess(){
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}
/* 把句柄存/取出来。句柄本身是结构化可克隆的，IndexedDB 放得下。 */
async function saveDirHandle(h){
  try {
    const d = await openLibDb();
    await new Promise((res, rej) => {
      const t = d.transaction(IDB_META, 'readwrite');
      t.objectStore(IDB_META).put({ k:HANDLE_KEY, v:h });
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch(e){}
}
async function loadDirHandle(){
  try {
    const d = await openLibDb();
    return await new Promise((res, rej) => {
      const t = d.transaction(IDB_META, 'readonly');
      const rq = t.objectStore(IDB_META).get(HANDLE_KEY);
      rq.onsuccess = () => res(rq.result ? rq.result.v : null);
      rq.onerror = () => rej(t.error);
    });
  } catch(e){ return null; }
}
/* 目录里可能有用户自己手建的文件，所以四个子目录都扫一遍 */
function makeFsStore(root){
  let n = 0;
  const dirFor = (kind, create) => root.getDirectoryHandle(kind, { create:!!create });
  return {
    id:'fs', label:'磁盘文件夹',
    root,
    async ready(){ return !!root; },
    async list(){
      const out = [];
      for (const kind of ASSET_KINDS){
        let dir;
        try { dir = await dirFor(kind, false); } catch(e){ continue; }
        for await (const [name, h] of dir.entries()){
          if (h.kind !== 'file') continue;
          let size = 0;
          try { size = (await h.getFile()).size; } catch(e){}
          out.push({ kind, name, size, id:kind + '/' + name, handle:h });
        }
      }
      return out;
    },
    async get(id){
      const [kind, ...rest] = String(id).split('/');
      const name = rest.join('/');
      const dir = await dirFor(kind, false);
      const h = await dir.getFileHandle(name);
      return h.getFile();
    },
    async put(kind, name, blob){
      const dir = await dirFor(kind, true);
      const h = await dir.getFileHandle(name, { create:true });
      const w = await h.createWritable();
      await w.write(blob);
      await w.close();
      return kind + '/' + name;
    },
    async del(id){
      const [kind, ...rest] = String(id).split('/');
      const dir = await dirFor(kind, false);
      await dir.removeEntry(rest.join('/'));
    }
  };
}

/* =========================================================================
   管理器：上层只跟它打交道
   ========================================================================= */
const Store = {
  backend: null,
  dirName: DEFAULT_USER_DIR,     // 默认 user/，可以自定义
  async init(){
    if (this.backend) return this.backend;
    try { const v = localStorage.getItem(USERDIR_KEY); if (v) this.dirName = v; } catch(e){}
    // 0) 原生宿主优先：能挂上就说明是 exe / 手机环境，那边比浏览器管用得多
    if (hasNative()){
      const ns = makeNativeStore(nativeHost());
      if (await ns.ready()){ this.backend = ns; return ns; }
    }
    // 先看有没有存过的目录句柄（FS Access）
    if (hasFsAccess()){
      const h = await loadDirHandle();
      if (h){
        try {
          const perm = await h.queryPermission({ mode:'readwrite' });
          if (perm === 'granted'){ this.backend = makeFsStore(h); return this.backend; }
          this.pendingHandle = h;      // 要用户点一下才能重新授权
        } catch(e){}
      }
    }
    // 退到 IndexedDB
    const idb = makeIdbStore();
    if (await idb.ready()){ this.backend = idb; return idb; }
    this.backend = makeMemStore();
    return this.backend;
  },
  /* 连磁盘文件夹。**必须在用户手势里调用**（点按钮），不然浏览器会拒。 */
  async connectFolder(name){
    if (!hasFsAccess()) throw new Error('这个浏览器不支持直接读写文件夹');
    const root = await window.showDirectoryPicker({ mode:'readwrite', id:'grapheon-user' });
    this.backend = makeFsStore(root);
    /* ★ 记下根句柄。拖文件进来要往 user/ 里写，需要一个**现成的**句柄 ——
       而 showDirectoryPicker 要求用户手势，调用点常常在 await 之后，
       那时候再弹会被浏览器静默忽略（这个坑踩过）。 */
    this.root = root;
    await saveDirHandle(root);
    return this.backend;
  },
  /* 重新授权上次那个目录（也要用户手势） */
  async reconnect(){
    if (!this.pendingHandle) return false;
    const perm = await this.pendingHandle.requestPermission({ mode:'readwrite' });
    if (perm !== 'granted') return false;
    this.backend = makeFsStore(this.pendingHandle);
    this.root = this.pendingHandle;        // ★ 同上：重新授权之后也要记
    this.pendingHandle = null;
    return true;
  },
  /* 已经授权好的 user/ 根目录；没连过就是 null。
     ★ 这个函数**不弹窗**，只是问一句 —— 弹窗要求用户手势。 */
  userRoot(){ return this.root || null; },
  setDirName(v){
    this.dirName = String(v || '').trim() || DEFAULT_USER_DIR;
    try { localStorage.setItem(USERDIR_KEY, this.dirName); } catch(e){}
  },
  async list(){ const b = await this.init(); return b.list(); },
  async get(id){ const b = await this.init(); return b.get(id); },
  async del(id){ const b = await this.init(); return b.del(id); },
  async put(kind, name, blob){ const b = await this.init(); return b.put(kind, name, blob); },
  /* 一键导入一堆素材：按扩展名自动归类 */
  async importFiles(files){
    const b = await this.init();
    const list = [...(files || [])];
    let ok = 0, fail = 0;
    const byKind = {};
    for (const f of list){
      let kind = kindOfFile(f.name);
      // .json 要读一眼才知道是作品还是主题
      if (kind === 'docs' && /\.json$/i.test(f.name)){
        try { kind = kindOfJson(JSON.parse(await f.text())); } catch(e){}
      }
      try {
        await b.put(kind, f.name, f);
        byKind[kind] = (byKind[kind] || 0) + 1;
        ok++;
      } catch(e){ fail++; }
    }
    return { ok, fail, byKind, total:list.length };
  }
};

/* ---------------- 后端 4：native（宿主提供的） ----------------
   给「打包成 exe」和「移植到手机」准备的。

   宿主（Electron 主进程 / Capacitor 插件 / RN 桥）只要往 window 上挂一个对象：

     window.GrapheonNative = {
       label: '本机文件夹',
       ready()                    -> bool
       list()                     -> [{ kind, name, size, id }]
       get(id)                    -> base64 字符串（或 null）
       put(kind, name, base64)    -> id
       del(id)
     }

   二进制走 base64 过桥 —— 任何桥都能传字符串，不用为每种宿主单独写序列化。

   ⚠ 这个后端**必须排在 fs 前面**：能挂上宿主就说明是原生环境，
     那边对文件系统的控制比浏览器的 File System Access API 强得多
     （没有授权弹窗、能读写任意路径、手机上也能用）。 */
function nativeHost(){
  if (typeof window === 'undefined') return null;
  const h = window.GrapheonNative || window.grapheonNative;
  return (h && typeof h.list === 'function') ? h : null;
}
const hasNative = () => !!nativeHost();

function blobToBase64(blob){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      res(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => rej(r.error || new Error('读不出来'));
    r.readAsDataURL(blob);
  });
}
function base64ToBlob(b64, type){
  const bin = atob(String(b64 || ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: type || 'application/octet-stream' });
}
function makeNativeStore(host){
  return {
    id:'native',
    label:'本机（' + (host.label || '宿主提供') + '）',
    host,
    async ready(){ try { return !!(await host.ready()); } catch(e){ return true; } },
    async list(){ return (await host.list()) || []; },
    async get(id){
      const r = await host.get(id);
      if (r == null) return null;
      if (r instanceof Blob) return r;
      // 宿主可能回 { data, type }
      if (r && typeof r === 'object') return base64ToBlob(r.data, r.type);
      return base64ToBlob(r);
    },
    async put(kind, name, blob){ return await host.put(kind, name, await blobToBase64(blob)); },
    async del(id){ return await host.del(id); }
  };
}
