'use strict';
/* ==========================================================================
   GRAPHEON · ui/menu.js
   通用弹出菜单。右键菜单和顶栏「新建」菜单都用它，以后加设置菜单也复用。
     showMenu(x, y, items)   items: [标签, 快捷键提示, 回调] 或 'hr'
   ========================================================================== */

const ctxEl = document.getElementById('ctx');

function showMenu(x, y, items){
  ctxEl.innerHTML = '';
  for (const it of items){
    if (!it || it === 'hr'){ ctxEl.appendChild(el('div', 'hr')); continue; }
    const d = el('div', 'item',
      '<span>' + it[0] + '</span><span class="k">' + (it[1] || '') + '</span>');
    d.onclick = () => { hideCtx(); if (it[2]) it[2](); };
    ctxEl.appendChild(d);
  }
  if (!ctxEl.children.length) return;
  // 先放到左上角量尺寸，再夹到视口内
  ctxEl.style.display = 'block';
  ctxEl.style.left = '0px'; ctxEl.style.top = '0px';
  const w = ctxEl.offsetWidth, h = ctxEl.offsetHeight;
  ctxEl.style.left = Math.max(8, Math.min(x, VW - w - 12)) + 'px';
  ctxEl.style.top  = Math.max(8, Math.min(y, VH - h - 12)) + 'px';
}
function hideCtx(){ ctxEl.style.display = 'none'; }

/* ---------------- 画布右键菜单 ---------------- */
function showCtx(x, y, n, e){
  const items = [];
  if (n){
    items.push(['添加子节点', 'Tab', addChild]);
    items.push(['添加兄弟节点', 'Enter', addSibling]);
    items.push(['重命名', 'F2', () => startEdit('node', n.id)]);
    items.push('hr');
    items.push(['矩形', '', () => setShape('rect')]);
    items.push(['圆角矩形', '', () => setShape('round')]);
    items.push(['菱形（判断）', '', () => setShape('diamond')]);
    items.push(['椭圆', '', () => setShape('oval')]);
    items.push('hr');
    items.push([(n.collapsed ? '展开' : '折叠') + '子树', 'Space', toggleCollapse]);
    items.push(['删除节点', 'Del', deleteSelection]);
  } else if (e){
    items.push(['编辑标签', '', () => startEdit('edge', e.id)]);
    items.push(['删除连线', '', () => deleteEdgeOnly(e)]);
  } else {
    items.push(['在此新建节点', '双击', () => {
      const p = s2w(x, y);
      const nn = addNodeAt('新节点', p.x - 70, p.y - 24, 'rect');
      reindex(); relayout(); selectOnly(nn.id); pushHist(); startEdit('node', nn.id, ''); mark();
    }]);
    items.push(['全选', 'Ctrl+A', selectAll]);
    items.push(['整理布局', 'Ctrl+L', () => { doc.autoLayout = true; relayout(); fitIfNeeded(); pushHist(); say('* 已重新排版。'); }]);
    items.push(['居中显示', '', fitView]);
  }
  showMenu(x, y, items);
}

/* ---------------- 顶栏「新建」菜单 ---------------- */
function showNewMenu(anchor){
  const r = anchor.getBoundingClientRect();
  showMenu(r.left, r.bottom + 8, [
    ['空白文件', '一个中心节点', () => newDocument('blank')],
    ['示例文档', '', () => newDocument('demo')],
    'hr',
    ['取消', 'Esc', null]
  ]);
}

/* 点击别处收起。注意顶栏按钮要放行，否则「新建」菜单会在同一次点击里被立刻关掉。 */
window.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest && ev.target.closest('#topbar')) return;
  if (!ctxEl.contains(ev.target) && ev.target !== canvas) hideCtx();
}, true);
window.addEventListener('click', (ev) => {
  if (ev.target.closest && ev.target.closest('#topbar')) return;
  if (!ctxEl.contains(ev.target)) hideCtx();
});
