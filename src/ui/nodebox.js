'use strict';
/* ==========================================================================
   GRAPHEON · ui/nodebox.js
   节点样式面板：字号 / 字体 / 字色 / 外框色 / 尺寸。
   选中节点后右键 →「节点样式…」或直接按 E 打开。
   所有选项都能选「默认」，意思是跟随主题（换主题时会一起变）。
   ========================================================================== */

const nodeBoxEl = document.getElementById('nodebox');
const nbSubEl    = document.getElementById('nbSub');
const nbFsEl     = document.getElementById('nbFs');
const nbFontEl   = document.getElementById('nbFont');
const nbColorEl  = document.getElementById('nbColor');
const nbBorderEl = document.getElementById('nbBorder');
const nbSizeEl   = document.getElementById('nbSize');
let nbNodeId = null;

const FS_OPTS   = NODE_FS_CHOICES.map(v => [v, NODE_FS_LABEL(v)]);
const FONT_OPTS = Object.keys(NODE_FONTS).map(k => [k, NODE_FONT_LABEL[k]]);

function openNodeBox(n){
  if (!n){ say('* 先选中一个节点。'); return; }
  hideCtx(); closeHelp(); closeExport();
  if (typeof closeEdgeBox === 'function') closeEdgeBox();
  if (typeof closeEndBox === 'function') closeEndBox();
  nbNodeId = n.id;
  selectOnly(n.id);
  renderNodeBox();
  nodeBoxEl.style.display = 'block';
  mark();
}
function closeNodeBox(){ nodeBoxEl.style.display = 'none'; nbNodeId = null; mark(); }
function renderNodeBox(){
  const n = byId(nbNodeId);
  if (!n){ closeNodeBox(); return; }
  nbSubEl.textContent = '节点「' + (n.text || '未命名') + '」 · ' + n.w + ' × ' + n.h +
    (n.fixedW || n.fixedH ? '（手动尺寸）' : '（随文字自适应）');
  // 字号：0 = 自动。注意 Unifont 只有 16/32/48 是点阵精确的，24 会略微柔化。
  buildOpts(nbFsEl, FS_OPTS, n.fsPx || 0, (v) => { setNodeStyle(n, { fsPx: v || null }); afterNodeEdit(); });
  buildOpts(nbFontEl, FONT_OPTS, n.font || 'auto', (v) => { setNodeStyle(n, { font: v }); afterNodeEdit(); });
  buildSwatches(nbColorEl, n.color, (v) => { setNodeStyle(n, { color: v }); afterNodeEdit(); });
  buildSwatches(nbBorderEl, n.border, (v) => { setNodeStyle(n, { border: v }); afterNodeEdit(); });
  nbSizeEl.innerHTML = '';
  if (n.fixedW || n.fixedH){
    const d = el('div', 'opt on', '<span class="hrt"></span><span>恢复自适应尺寸</span>');
    d.onclick = () => { autoSizeNode(n); afterNodeEdit(); };
    nbSizeEl.appendChild(d);
  } else {
    nbSizeEl.appendChild(el('div', 'opt off', '<span class="hrt"></span><span>拖节点右下角手柄可改尺寸</span>'));
  }
}
function afterNodeEdit(){
  renderNodeBox();
  const n = byId(nbNodeId);
  if (n) say('* 节点外观：' + nodeStyleText(n));
  pushHist();
  mark();
}
document.getElementById('nbClose').onclick = closeNodeBox;
document.getElementById('nbReset').onclick = () => {
  const n = byId(nbNodeId);
  if (n){ resetNodeStyle(n); renderNodeBox(); pushHist(); }
};
