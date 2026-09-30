'use strict';
/* ==========================================================================
   GRAPHEON · ui/library.js
   素材库面板：看用户文件夹里有什么，一键导入一大批素材。

   所有磁盘访问都走 core/store.js —— 那边会自动挑后端（磁盘文件夹 / IndexedDB /
   内存），这里不关心用的是哪种。以后包成 exe 或上手机，换的也是那边。
   ========================================================================== */

const libEl      = document.getElementById('lib');
const libSubEl   = document.getElementById('libSub');
const libListEl  = document.getElementById('libList');
const libFileEl  = document.getElementById('libfile');

function openLib(){ hideCtx(); closeHelp(); toggleSettingsIfOpen(); libEl.style.display = 'block'; refreshLib(); mark(); }
function closeLib(){ libEl.style.display = 'none'; mark(); }
function toggleLib(){ libEl.style.display === 'block' ? closeLib() : openLib(); }
const libOpen = () => libEl.style.display === 'block';
function toggleSettingsIfOpen(){ if (typeof settingsOpen === 'function' && settingsOpen()) closeSettings(); }

const fmtSize = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB'
  : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B';

async function refreshLib(){
  let items = [];
  try {
    const b = await Store.init();
    items = await b.list();
    libSubEl.textContent = '存放位置：' + b.label +
      (b.id === 'fs' ? '（' + Store.dirName + '/）' : '') + ' · 共 ' + items.length + ' 个素材';
  } catch(e){
    libSubEl.textContent = '读不出来：' + e.message;
    return;
  }
  libListEl.innerHTML = '';
  if (!items.length){
    const d = document.createElement('div');
    d.className = 'libempty';
    d.textContent = '还是空的。点上面「一键导入素材」把图片 / 作品 / 主题 / 字体一次丢进来。';
    libListEl.appendChild(d);
    return;
  }
  // 按类分组，看得清楚
  for (const kind of ASSET_KINDS){
    const group = items.filter(x => x.kind === kind);
    if (!group.length) continue;
    const h = document.createElement('div');
    h.className = 'libsec';
    h.textContent = ASSET_KIND_LABEL[kind] + '（' + group.length + '）';
    libListEl.appendChild(h);
    const wrap = document.createElement('div');
    wrap.className = 'libgrid';
    for (const it of group) wrap.appendChild(libCard(it));
    libListEl.appendChild(wrap);
  }
}

/* 一张卡片：图片给缩略图，字体用它自己渲染，其它给个摘要 */
function libCard(it){
  const d = document.createElement('div');
  d.className = 'libcard';
  const thumb = document.createElement('div');
  thumb.className = 'libthumb';
  const name = document.createElement('div');
  name.className = 'libname';
  name.textContent = it.name;
  const meta = document.createElement('div');
  meta.className = 'libmeta';
  meta.textContent = fmtSize(it.size);
  const acts = document.createElement('div');
  acts.className = 'libacts';

  const ins = document.createElement('button');
  ins.className = 'ud-btn';
  ins.textContent = '插入';
  ins.onclick = () => insertAsset(it);
  acts.appendChild(ins);

  const del = document.createElement('button');
  del.className = 'ud-btn';
  del.textContent = '删除';
  del.onclick = async () => { await Store.del(it.id); refreshLib(); };
  acts.appendChild(del);

  d.appendChild(thumb); d.appendChild(name); d.appendChild(meta); d.appendChild(acts);

  // 缩略图：异步填，失败了就留空
  Store.get(it.id).then(async (blob) => {
    if (!blob) return;
    if (it.kind === 'assets' && /^image\//.test(blob.type || '')){
      const url = URL.createObjectURL(blob);
      const im = document.createElement('img');
      im.src = url;
      im.onload = () => URL.revokeObjectURL(url);
      thumb.appendChild(im);
      ins.dataset.url = url;
    } else if (it.kind === 'fonts'){
      // 用这个字体本身把文件名渲染出来，一眼就知道长什么样
      try {
        const n = await loadFontBlob(it.name, blob);
        const p = document.createElement('div');
        p.className = 'libfont';
        p.style.fontFamily = n.family;
        p.textContent = '永 Aa 字 123';
        thumb.appendChild(p);
      } catch(e){}
    } else if (it.kind === 'docs'){
      try {
        const j = JSON.parse(await blob.text());
        thumb.textContent = (j.nodes ? j.nodes.length : 0) + ' 节点 / ' + (j.edges ? j.edges.length : 0) + ' 连线';
      } catch(e){ thumb.textContent = '读不出'; }
    } else if (it.kind === 'themes'){
      try {
        const j = JSON.parse(await blob.text());
        const pal = j.canvas || {};
        for (const k of ['bg', 'white', 'yellow', 'gray']){
          if (!pal[k]) continue;
          const sw = document.createElement('i');
          sw.style.background = pal[k];
          thumb.appendChild(sw);
        }
        if (!thumb.childNodes.length) thumb.textContent = '主题';
      } catch(e){ thumb.textContent = '主题'; }
    }
  }).catch(() => {});

  return d;
}

/* 把素材里的字体喂给浏览器，返回家族名 */
async function loadFontBlob(fileName, blob){
  const family = 'GPLib-' + String(fileName).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '');
  if (document.fonts.check('16px "' + family + '"') || NODE_FONTS[family]) return { family };
  const url = URL.createObjectURL(blob);
  const face = new FontFace(family, 'url(' + url + ')');
  await face.load();
  document.fonts.add(face);
  NODE_FONTS[family] = family;
  NODE_FONT_LABEL[family] = String(fileName).replace(/\.[^.]+$/, '');
  return { family };
}

/* 「插入」：按类型做最合理的那件事 */
async function insertAsset(it){
  const blob = await Store.get(it.id);
  if (!blob){ say('* 这个素材读不出来了。'); return; }
  if (it.kind === 'assets'){
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); insertImageBlob(blob, img.naturalWidth, img.naturalHeight); };
    img.onerror = () => { URL.revokeObjectURL(url); say('* 这张图读不出来。'); };
    img.src = url;
    return;
  }
  if (it.kind === 'docs'){
    try {
      const j = JSON.parse(await blob.text());
      const c = viewCenter();
      const n = addEmbedNode(j, String(it.name).replace(/\.json$/i, ''),
                             Math.round(c.x - EMBED_DEF_W / 2), Math.round(c.y - EMBED_DEF_H / 2));
      selectOnly(n.id); pushHist(); mark();
      say('* 已把「' + n.text + '」嵌进来。');
    } catch(e){ say('* 这个文件不是合法的 Grapheon 文档。'); }
    return;
  }
  if (it.kind === 'fonts'){
    const n = await loadFontBlob(it.name, blob);
    if (typeof renderSettings === 'function' && settingsOpen()) renderSettings();
    say('* 字体「' + String(it.name).replace(/\.[^.]+$/, '') + '」已加载，可以在节点样式面板里选。');
    return;
  }
  if (it.kind === 'themes'){
    // 一键套用：注册进主题表再切过去。也接受 { id, theme:{...} } 这种包一层的写法。
    let obj = null;
    try { obj = JSON.parse(await blob.text()); } catch(e){ obj = null; }
    if (obj && obj.theme) obj = Object.assign({ id:obj.id }, obj.theme);
    const id = registerUserTheme(obj);
    if (!id){ say('* 这个文件读不出主题（至少要有一个 canvas 调色板）。'); return; }
    applyTheme(id);
    say('* 主题「' + ((THEMES[id] || {}).label || '') + '」已套用。不想要了可以在设置里「删除当前主题」。');
  }
}

/* 套用主题后给个小反馈，顺便告诉他怎么删 */
function btnApplyFeedback(it){
  return '不想要了可以在设置里「删除当前主题」。';
}

/* ---------------- 导入 ---------------- */
function pickLibFiles(){ libFileEl.value = ''; libFileEl.click(); }
libFileEl.addEventListener('change', async () => {
  const r = await Store.importFiles(libFileEl.files);
  await refreshLib();
  say('* 导入了 ' + r.ok + ' 个素材' +
      (r.fail ? '（' + r.fail + ' 个失败）' : '') + '：' +
      Object.keys(r.byKind).map(k => ASSET_KIND_LABEL[k] + ' ' + r.byKind[k]).join('、') + '。');
});

document.getElementById('libClose').onclick = () => closeLib();
document.getElementById('libRefresh').onclick = () => refreshLib();
document.getElementById('libImport').onclick = () => pickLibFiles();
document.getElementById('libConnect').onclick = async () => {
  try {
    const b = await Store.connectFolder();
    await refreshLib();
    say('* 接上了磁盘文件夹（' + Store.dirName + '/）。素材是真实的文件，资源管理器里也能看到。');
  } catch(e){
    say('* ' + (e && e.name === 'AbortError' ? '取消了。' : '连不上：' + e.message));
  }
};
