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
/* ★ 这里以前挂着一整行快捷键（方向键 / Tab / Enter / E / Ctrl+G / Del / H）。
   现在底栏只显示「当前这一下发生了什么」，快捷键和教程都归帮助面板（按 H）。
   dlgHint 只剩一个用途：进到嵌入副本里时提醒你正在改副本。 */
/* 主题不要星号的话，就把开头那个 '* ' 摘掉（文字里原本都带着它） */
function stripStar(s){ return themeStar() ? s : String(s).replace(/^\*\s?/, ''); }
function say(msg, kind, opts){
  dlg.full = stripStar(msg); dlg.shown = 0;
  /* ★ 每次操作都会经这里说一句「刚发生了什么」—— 顺手记进操作记录。
     kind 默认「操作」，文件 / 视图 / 设置那几类在调用处显式传。
     opts.noLog —— 给「操作记录」面板自己的动作留的：清空 / 复制 / 导出
     不该把自己也记进去（不然清空之后立刻又冒出一条「记录已清空」）。 */
  if (!(opts && opts.noLog) && typeof pushLog === 'function') pushLog(kind || '操作', dlg.full);
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
  const gs = selectedGroups();
  if (gs.length === 1 && sel.size === 0){
    selTxt = ' · 选中分组「' + (gs[0].title || '分组') + '」（' + gs[0].members.length + ' 个成员）';
  } else if (gs.length){
    selTxt = (sel.size ? ' · 选中 ' + sel.size + ' 节点' : '') + ' + ' + gs.length + ' 分组';
  }
  // idx.hidden 里既有节点也有分组，分开数才好读
  let hidN = 0, hidG = 0;
  if (idx.hidden) for (const id of idx.hidden){ if (idx.byId.has(id)) hidN++; else hidG++; }
  const gN = (doc.groups || []).length;
  const hid = hidN ? '（隐藏 ' + hidN + (hidG ? ' + ' + hidG + ' 组' : '') + '）' : '';
  const crumb = insideEmbed() ? '⟨嵌入 ' + embedRootName() + '⟩ · ' : '';
  dlgMeta.textContent = crumb + doc.nodes.length + ' 节点' + hid +
    ' / ' + doc.edges.length + ' 连线' + (gN ? ' / ' + gN + ' 分组' : '') + selTxt +
    ' · ' + Math.round(view.z * 100) + '%';
  const emb = insideEmbed() ? '正在编辑嵌入副本 · 原文件不受影响' : '';
  dlgHint.textContent = emb;
  /* 没话可说就把这行收掉，别留一条空行把面板撑高 */
  dlgHint.style.display = emb ? '' : 'none';
  const back = document.getElementById('b-back');
  if (back) back.style.display = insideEmbed() ? '' : 'none';
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

