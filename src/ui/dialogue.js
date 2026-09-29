'use strict';
/* ==========================================================================
   GRAPHEON · ui/dialogue.js
   底部打字机对白栏与状态信息。
   ========================================================================== */

/* =========================================================================
   对白（打字机）
   ========================================================================= */
const dlgText  = document.getElementById('dlgText');
const dlgArrow = document.getElementById('dlgArrow');
const dlgMeta  = document.getElementById('dlgMeta');
const dlgHint  = document.getElementById('dlgHint');
let dlg = { full:'', shown:0, timer:null };
const HINT = '方向键/WASD 生成节点 · Tab 子节点 · Enter 兄弟 · E 改连线样式 · 拖端点可改接 · Del 删除 · H 帮助';
function say(msg){
  dlg.full = msg; dlg.shown = 0;
  clearInterval(dlg.timer);
  dlgText.textContent = '';
  dlgArrow.style.visibility = 'hidden';
  dlg.timer = setInterval(() => {
    dlg.shown += 1;
    dlgText.textContent = dlg.full.slice(0, dlg.shown);
    if (dlg.shown >= dlg.full.length){
      clearInterval(dlg.timer); dlg.timer = null;
      dlgText.textContent = dlg.full;
      dlgArrow.style.visibility = 'visible';
    }
  }, 24);
}
function skipDlg(){
  if (!dlg.timer) return;
  clearInterval(dlg.timer); dlg.timer = null;
  dlgText.textContent = dlg.full;
  dlgArrow.style.visibility = 'visible';
}
function updateMeta(){
  const nSel = sel.size, eSel = selEdgeId ? 1 : 0;
  let selTxt = '';
  if (nSel) selTxt = ' · 选中 ' + nSel + ' 节点';
  else if (eSel){
    const e = selectedEdge();
    const wp = (e && e.waypoints && e.waypoints.length) ? ' · ' + e.waypoints.length + ' 拐点' : '';
    selTxt = ' · 选中连线（' + (e ? edgeStyleLabel(e) + wp : '') + '）';
  }
  const hid = idx.hidden ? idx.hidden.size : 0;
  dlgMeta.textContent = doc.nodes.length + ' 节点' + (hid ? '（隐藏 ' + hid + '）' : '') +
    ' / ' + doc.edges.length + ' 连线' + selTxt +
    ' · ' + Math.round(view.z * 100) + '%';
  dlgHint.textContent = HINT;
}
document.getElementById('dialogue').addEventListener('click', skipDlg);

