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
/* 节点和分组共用的一小段菜单：重命名 / 端点吸附。
   「复用节点的右键菜单代码」就落在这里 —— 两边都调它，行为天然一致。 */
function pushCommonItems(items, target, kind, renameHint){
  items.push(['重命名', renameHint, () => startEdit(kind, target.id)]);
  if (doc.edges.some(e => e.s === target.id || e.t === target.id)){
    items.push(['连线端点吸附…', '', () => openEndBox(target)]);
  }
}
/* 颜色一行：点一下循环到下一个（节点和分组都能用） */
function pushColorItem(items, target, label){
  items.push([label + '：' + (target.color || '默认'), '▶', () => {
    const i = NODE_COLORS.findIndex(c => c[0] === target.color);
    target.color = (i + 1 >= NODE_COLORS.length) ? null : NODE_COLORS[i + 1][0];
    mark(); pushHist(); say('* ' + label + '已切换。');
  }]);
}

function showCtx(x, y, n, e, info){
  info = info || {};
  const items = [];
  if (n){
    items.push(['添加子节点', 'Tab', () => addChild()]);
    items.push(['添加兄弟节点', 'Enter', () => addSibling()]);
    pushCommonItems(items, n, 'node', 'F2');
    items.push('hr');
    items.push(['矩形', '', () => setShape('rect')]);
    items.push(['圆角矩形', '', () => setShape('round')]);
    items.push(['菱形（判断）', '', () => setShape('diamond')]);
    items.push(['椭圆', '', () => setShape('oval')]);
    if (n.fixedW || n.fixedH) items.push(['恢复自适应尺寸', '', () => autoSizeNode(n)]);
    items.push('hr');
    items.push(['节点样式…', 'E', () => openNodeBox(n)]);
    const owner = (doc.groups || []).find(grp => grp.members.indexOf(n.id) >= 0);
    if (owner) items.push(['移出分组「' + (owner.title || '分组') + '」', '', () => { selectOnly(n.id); removeSelectionFromGroup(owner); }]);
    items.push([(n.collapsed ? '展开' : '折叠') + '子树', 'Space', () => toggleCollapseOf(n)]);
    items.push(['删除节点', 'Del', () => { selectOnly(n.id); deleteSelection(); }]);
  } else if (info.group){
    const grp = info.group;
    pushCommonItems(items, grp, 'group', '双击标题');
    items.push(['把选中的节点加入', '', () => addSelectionToGroup(grp)]);
    items.push('hr');
    items.push(['收缩到刚好包住成员', '', () => tidyGroup(grp)]);
    pushColorItem(items, grp, '分组颜色');
    items.push(['解散分组（保留成员）', 'Del', () => dissolveGroup(grp)]);
  } else if (e){
    if (info.waypoint){
      items.push(['删除这个拐点', '双击', () => { removeWaypoint(e, info.waypoint.index); pushHist(); say('* 拐点已删除。'); }]);
    } else if (info.p){
      items.push(['在此添加拐点', '', () => { addWaypoint(e, info.p.x, info.p.y); pushHist(); say('* 已添加拐点，拖动它调整走向。'); }]);
    }
    if (e.waypoints && e.waypoints.length){
      items.push(['清除全部拐点（' + e.waypoints.length + ' 个）', '', () => { clearWaypoints(e); pushHist(); say('* 拐点已清除。'); }]);
    }
    items.push('hr');
    items.push(['连线样式…', 'E', () => openEdgeBox()]);
    items.push('hr');
    items.push(['箭头：' + ARROW_LABEL[e.arrow], '▶', () => { cycleEdgeArrow(e); pushHist(); }]);
    items.push(['线型：' + (e.dash ? '虚线' : '实线'), '▶', () => { setEdgeStyle(e, { dash: !e.dash }); pushHist(); say('* 线型：' + (e.dash ? '虚线' : '实线')); }]);
    items.push(['走线：' + ROUTE_LABEL[e.route], '▶', () => { cycleEdgeRoute(e); pushHist(); }]);
    items.push('hr');
    items.push(['编辑标签', '双击', () => startEdit('edge', e.id)]);
    items.push(['删除连线', 'Del', () => deleteEdgeOnly(e)]);
  } else {
    items.push(['在此新建节点', '双击', () => {
      const p = s2w(x, y);
      const nn = addNodeAt('新节点', p.x - 70, p.y - 24, 'rect');
      reindex(); relayout(); syncGroupMembership([nn.id]);
      selectOnly(nn.id); pushHist(); startEdit('node', nn.id, ''); mark();
    }]);
    items.push(['在此新建空分组框', '', () => newEmptyGroup(p.x, p.y)]);
    items.push(['全选', 'Ctrl+A', selectAll]);
    if (sel.size >= 2) items.push(['把选中的 ' + sel.size + ' 个节点加入分组', 'Ctrl+G', () => createGroup()]);
    items.push(['排版（按树形摆一次）', 'Ctrl+L', () => { tidyLayout(); pushHist(); say('* 已按树形排版。'); }]);
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
