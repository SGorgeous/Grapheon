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
const HINT = '方向键/WASD 生成节点 · Ctrl+方向键 仅跳转 · Tab 子节点 · Enter 兄弟 · F2 改名 · Space 折叠 · Del 删除 · 滚轮缩放 · H 帮助';
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
  const mode = doc.mode === 'mind' ? '思维导图' : '流程图';
  const auto = doc.mode === 'mind' ? (doc.autoLayout ? '自动排版' : '自由摆放') : '自由摆放';
  dlgMeta.textContent = mode + ' · ' + auto + ' · ' + doc.nodes.length + ' 节点 / ' + doc.edges.length + ' 连线 · ' + Math.round(view.z * 100) + '%';
  dlgHint.textContent = HINT;
}
document.getElementById('dialogue').addEventListener('click', skipDlg);

