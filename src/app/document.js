'use strict';
/* ==========================================================================
   GRAPHEON · app/document.js
   模式切换、JSON 存取、新建 / 打开 / 拖入文件。
   ========================================================================== */

/* 新建：'blank' = 空白文件（一个中心节点），'demo' = 内置示例
   会覆盖当前内容与自动存档（历史会被重置，所以先弹菜单让用户确认）。 */
function newDocument(kind){
  clearDocStack();          // 新建文档 = 回到最外层

  if (kind === 'demo' || kind === 'classic'){
    // 两份示例都自带坐标，不用 layoutMind；分组框由 loadDemo 贴合成员
    loadDemo(kind === 'classic' ? 'classic' : 'all');
  } else {
    doc = { v:2, nodes:[], edges:[] };
    /* ★ 空白文档 = **两个相连的节点**：上面题目、下面内容。
       题目是根，所以显式标 big（大号字），不靠拓扑规则去猜。 */
    const a = { id:uid('n'), text:'题目', x:0, y:0, w:0, h:0, shape:'round',
                collapsed:false, lines:[''], big:true };
    const b = { id:uid('n'), text:'内容', x:0, y:160, w:0, h:0, shape:'rect',
                collapsed:false, lines:[''] };
    doc.nodes.push(a, b);
    sel.clear(); selEdgeId = null; editing = null; hideEditor();
    reindex(); sizeAll();
    const e0 = linkNodes(a.id, b.id);
    reindex(); sizeAll();
    selectOnly(e0 ? a.id : b.id);
  }
  relayout(); fitView(); initHist(); updateMeta(); mark();
  say(kind === 'demo'
    ? '* 已载入示例文档。'
    : '* 新文件。');
}
function saveFile(){
  const name = 'grapheon-' + new Date().toISOString().slice(0, 10) + '.json';
  try {
    const data = JSON.stringify(serialize(), null, 2);
    downloadBlob(new Blob([data], { type:'application/json' }), name);
    try { localStorage.setItem(LS_KEY, data); } catch (e) {}
    say('* 已保存为 ' + name, '文件');
  } catch (err){
    say('* 保存失败了：' + err.message, '文件');
  }
}
const fileEl = document.getElementById('file');
fileEl.addEventListener('change', () => {
  const f = fileEl.files && fileEl.files[0];
  if (f) readFile(f);
  fileEl.value = '';
});
function readFile(f){
  const r = new FileReader();
  r.onload = () => {
    try {
      clearDocStack();     // 从外面打开文件也回到最外层
      deserialize(JSON.parse(String(r.result)));
      relayout(); fitView(); initHist(); updateMeta(); say('* 读取成功，共 ' + doc.nodes.length + ' 个节点。', '文件');
    } catch(err){ say('* 这个文件无法读取……也许它并不属于这里。'); }
  };
  r.readAsText(f);
}

/* ---------------- 图片：按钮 / 右键 / 拖拽 / 粘贴 ----------------
   四条入口最后都汇到 insertImageFile()，行为一致。 */
const imgFileEl = document.getElementById('imgfile');
let imgInsertAt = null;          // 右键插入时记住落点
let imgReplaceFor = null;        // 「换一张图片」时记住要换哪个节点
function pickImageFile(at, replaceNode){
  imgInsertAt = at || null;
  imgReplaceFor = replaceNode || null;
  imgFileEl.value = '';
  imgFileEl.click();
}
imgFileEl.addEventListener('change', () => {
  const f = imgFileEl.files && imgFileEl.files[0];
  if (f){
    if (imgReplaceFor) replaceImage(imgReplaceFor, f);
    else insertImageFile(f, imgInsertAt);
  }
  imgInsertAt = null; imgReplaceFor = null;
  imgFileEl.value = '';
});
const isImageFile = (f) => !!f && /^image\//.test(f.type || '');
const dropPos = (ev) => s2w(ev.clientX || 0, ev.clientY || 0);


/* ---------------- 嵌入文档：右键 / 拖拽 / 选择器 ----------------
   「插入 Grapheon」= 把一整份文档当一个封闭节点塞进来。 */
const gpkFileEl = document.getElementById('gpkfile');
let gpkInsertAt = null;
function pickEmbedFile(at){
  gpkInsertAt = at || null;
  gpkFileEl.value = '';
  gpkFileEl.click();
}
gpkFileEl.addEventListener('change', () => {
  const f = gpkFileEl.files && gpkFileEl.files[0];
  if (f) insertEmbedFile(f, gpkInsertAt);
  gpkInsertAt = null;
  gpkFileEl.value = '';
});
window.addEventListener('dragover', (ev) => {
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'copy';
});
window.addEventListener('drop', (ev) => {
  ev.preventDefault();
  const dt = ev.dataTransfer;
  if (!dt) return;
  // 图片直接插到鼠标松开的位置；不是图片才当存档读
  const files = [...(dt.files || [])];
  const img = files.find(isImageFile);
  if (img){ insertImageFile(img, dropPos(ev)); return; }
  if (files[0]) readFile(files[0]);
});
/* 从剪贴板粘一张图进来 */
window.addEventListener('paste', (ev) => {
  if (editing || (ev.target && ev.target.tagName === 'INPUT')) return;   // 正在打字就别抢
  const items = (ev.clipboardData && ev.clipboardData.items) || [];
  for (const it of items){
    if (it.kind !== 'file' || !/^image\//.test(it.type || '')) continue;
    const f = it.getAsFile();
    if (f){ ev.preventDefault(); insertImageFile(f, viewCenter()); return; }
  }
});

