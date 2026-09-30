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
const HINT = '方向键/WASD 生成节点 · Tab 子节点 · Enter 兄弟 · E 样式面板 · Ctrl+G 分组 · Del 删除 · H 帮助';
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
  if (selGroupId){
    const grp = selectedGroup();
    if (grp) selTxt = ' · 选中分组「' + (grp.title || '分组') + '」（' + grp.members.length + ' 个成员）';
  }
  const hid = idx.hidden ? idx.hidden.size : 0;
  const gN = (doc.groups || []).length;
  dlgMeta.textContent = doc.nodes.length + ' 节点' + (hid ? '（隐藏 ' + hid + '）' : '') +
    ' / ' + doc.edges.length + ' 连线' + (gN ? ' / ' + gN + ' 分组' : '') + selTxt +
    ' · ' + Math.round(view.z * 100) + '%';
  dlgHint.textContent = HINT;
}
document.getElementById('dialogue').addEventListener('click', skipDlg);

/* =========================================================================
   把下方提示框的实际高度写进 --dlg-h，右侧那些浮层面板靠它对齐到提示框上沿。
   提示框高度会随文字换行变化，所以用 ResizeObserver 实时量，不能写死。
   ========================================================================= */
const dlgBoxEl = document.getElementById('dialogue');
function syncDlgBox(){
  const r = dlgBoxEl.getBoundingClientRect();
  const h = Math.max(0, Math.round(window.innerHeight - r.top));
  document.documentElement.style.setProperty('--dlg-h', h + 'px');
}
if (typeof ResizeObserver === 'function') new ResizeObserver(syncDlgBox).observe(dlgBoxEl);
window.addEventListener('resize', syncDlgBox);

