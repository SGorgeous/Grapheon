'use strict';
/* ==========================================================================
   GRAPHEON · app/document.js
   模式切换、JSON 存取、新建 / 打开 / 拖入文件。
   ========================================================================== */

/* =========================================================================
   模式 / 文件
   ========================================================================= */
function setMode(m){
  if (doc.mode === m) return;
  doc.mode = m;
  if (m === 'mind'){ doc.autoLayout = true; relayout(); }
  syncButtons(); mark();
  say(m === 'mind' ? '* 思维导图模式：两侧自动排版，Tab 展开分支。' : '* 流程图模式：连线自动正交布线，节点可自由摆放。');
}
function syncButtons(){
  document.getElementById('b-mind').classList.toggle('on', doc.mode === 'mind');
  document.getElementById('b-flow').classList.toggle('on', doc.mode === 'flow');
}

/* 新建：'blank' = 空白文件（一个中心节点），'demo' = 内置示例
   会覆盖当前内容与自动存档；不想要了就 Ctrl+Z（历史被重置，所以先弹菜单让用户确认）。 */
function newDocument(kind){
  if (kind === 'demo'){
    deserialize(demoDoc());
  } else {
    doc = { v:1, mode:'mind', autoLayout:true, nodes:[], edges:[] };
    const n = { id:uid('n'), text:'中心主题', x:0, y:0, w:0, h:0, shape:'rect', collapsed:false, lines:[''] };
    doc.nodes.push(n);
    sel.clear(); editing = null; hideEditor();
    reindex(); sizeAll();
    selectOnly(n.id);
  }
  doc.mode = 'mind';
  doc.autoLayout = true;
  relayout(); fitView(); initHist(); syncButtons(); updateMeta(); mark();
  say(kind === 'demo'
    ? '* 已载入示例文档。'
    : '* 新文件。按 Tab 或方向键，从中心开始生长。');
}
function saveFile(){
  const name = 'grapheon-' + new Date().toISOString().slice(0, 10) + '.json';
  try {
    const data = JSON.stringify(serialize(), null, 2);
    downloadBlob(new Blob([data], { type:'application/json' }), name);
    try { localStorage.setItem(LS_KEY, data); } catch (e) {}
    say('* 已保存为 ' + name);
  } catch (err){
    say('* 保存失败了：' + err.message);
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
      deserialize(JSON.parse(String(r.result)));
      relayout(); fitView(); initHist(); updateMeta(); say('* 读取成功，共 ' + doc.nodes.length + ' 个节点。');
    } catch(err){ say('* 这个文件无法读取……也许它并不属于这里。'); }
  };
  r.readAsText(f);
}
window.addEventListener('dragover', (ev) => { ev.preventDefault(); });
window.addEventListener('drop', (ev) => {
  ev.preventDefault();
  const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (f) readFile(f);
});

