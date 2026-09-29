'use strict';
/* ==========================================================================
   GRAPHEON · interact/commands.js
   结构操作：子/兄弟/父节点、删除、折叠、形状、方向生成、连线样式。
   （没有模式了：方向键一律做「空间生成」，Tab/Enter 仍是结构化的子/兄弟节点。）
   ========================================================================== */

/* =========================================================================
   操作
   ========================================================================= */
function addNodeAt(text, x, y, shape){
  const n = { id:uid('n'), text:text || '', x, y, w:0, h:0, shape:shape || 'rect', collapsed:false, lines:[''] };
  doc.nodes.push(n);
  sizeNode(n);
  return n;
}
function linkNodes(s, t){
  if (s === t) return null;
  if (doc.edges.some(e => e.s === s && e.t === t)) return null;
  const e = makeEdge(s, t);
  doc.edges.push(e);
  return e;
}
const soleSel = () => sel.size === 1 ? byId([...sel][0]) : null;

function addChild(){
  const n = soleSel();
  if (!n){ say('* 先选中一个节点，再按 Tab。'); return; }
  addChildOf(n);
  say('* 新的子节点诞生了。Tab 继续深入，Enter 添加兄弟。');
}
function addSibling(){
  const n = soleSel();
  if (!n){ say('* 先选中一个节点，再按 Enter。'); return; }
  const p = idx.parent.get(n.id);
  if (!p){ addChildOf(n); say('* 根节点没有兄弟，改为新建子节点。'); return; }
  addSiblingOf(byId(p), n, 'after');
  say('* 新的兄弟节点。');
}
/* --- 结构原语：子 / 兄弟（可指定前后）/ 父 --- */
function afterSpawn(nn){
  reindex(); sizeAll();
  sel.clear(); sel.add(nn.id); selEdgeId = null;
  pushHist(); mark();
  startEdit('node', nn.id, '');
}
function addChildOf(parent){
  if (parent.collapsed) parent.collapsed = false;
  const sib = idx.children.get(parent.id) || [];
  const nn = addNodeAt('', parent.x + parent.w + HGAP, parent.y + sib.length * (parent.h + VGAP), 'rect');
  linkNodes(parent.id, nn.id);
  afterSpawn(nn);
}
function addSiblingOf(p, ref, where){
  if (p.collapsed) p.collapsed = false;
  const nn = addNodeAt('', ref.x, ref.y + ref.h + VGAP, 'rect');
  const e = linkNodes(p.id, nn.id);
  // 兄弟顺序由 edges 里父节点出边的先后决定，插到 ref 的前/后（「排版」时的上下次序照这个来）
  if (e){
    const j = doc.edges.indexOf(e);
    if (j >= 0) doc.edges.splice(j, 1);
    const ei = doc.edges.findIndex(x => x.s === p.id && x.t === ref.id);
    if (ei >= 0) doc.edges.splice(where === 'before' ? ei : ei + 1, 0, e);
    else doc.edges.push(e);
  }
  afterSpawn(nn);
}
function addParentOf(n){
  const p = idx.parent.get(n.id);
  const np = addNodeAt('', n.x - n.w - HGAP, n.y, 'rect');
  if (p){
    const pe = byId(p);
    if (pe && pe.collapsed) pe.collapsed = false;
    // 原边 (p → n) 改接到新节点上，从而占据 n 原来的位置
    const ei = doc.edges.findIndex(e => e.s === p && e.t === n.id);
    if (ei >= 0) doc.edges[ei].t = np.id;
    else doc.edges.push(makeEdge(p, np.id));
  }
  const ne = makeEdge(np.id, n.id);
  const j = p ? doc.edges.findIndex(e => e.s === p && e.t === np.id) : -1;
  if (j >= 0) doc.edges.splice(j + 1, 0, ne); else doc.edges.push(ne);
  afterSpawn(np);
}
/* --- 方向键 / WASD：在该方向空间生成节点，自动避开同一行/列上的已有节点 --- */
function spawnInDirection(dir){
  const n = soleSel();
  if (!n){ say('* 先选中一个节点，再按方向键（或 WASD）。'); return; }
  const nn = addNodeAt('', n.x, n.y, 'rect');
  linkNodes(n.id, nn.id);
  reindex(); sizeAll();
  const pos = spawnPos(n, dir, nn.w, nn.h, nn);
  nn.x = pos.x; nn.y = pos.y;
  afterSpawn(nn);
  say('* 已在' + ({ up:'上', down:'下', left:'左', right:'右' })[dir] + '方生成新节点。');
}
function spawnPos(n, dir, w, h, skip){
  const GAP = 64;
  const sameRow = (m) => m.y < n.y + n.h && n.y < m.y + m.h;
  const sameCol = (m) => m.x < n.x + n.w && n.x < m.x + m.w;
  if (dir === 'right' || dir === 'left'){
    const sign = dir === 'right' ? 1 : -1;
    let edge = dir === 'right' ? n.x + n.w : n.x;
    for (const m of doc.nodes){
      if (m === n || m === skip || !sameRow(m)) continue;
      const e = sign > 0 ? m.x + m.w : m.x;
      edge = sign > 0 ? Math.max(edge, e) : Math.min(edge, e);
    }
    return { x: sign > 0 ? edge + GAP : edge - GAP - w, y: n.y + n.h / 2 - h / 2 };
  }
  const sign = dir === 'down' ? 1 : -1;
  let edge = dir === 'down' ? n.y + n.h : n.y;
  for (const m of doc.nodes){
    if (m === n || m === skip || !sameCol(m)) continue;
    const e = sign > 0 ? m.y + m.h : m.y;
    edge = sign > 0 ? Math.max(edge, e) : Math.min(edge, e);
  }
  return { x: n.x + n.w / 2 - w / 2, y: sign > 0 ? edge + GAP : edge - GAP - h };
}
function deleteSelection(){
  const ed = selectedEdge();
  if (ed){ deleteEdgeOnly(ed); return; }
  if (!sel.size){ say('* 没有选中的东西。'); return; }
  const roots = [...sel].filter(id => byId(id));
  if (roots.some(id => isRoot(byId(id)))){
    say('* 你不能删除根节点……它承载着决心。');
    return;
  }
  const kill = new Set();
  for (const id of roots) { kill.add(id); for (const d of descendants(id)) kill.add(d); }
  doc.nodes  = doc.nodes.filter(n => !kill.has(n.id));
  doc.edges  = doc.edges.filter(e => !kill.has(e.s) && !kill.has(e.t));
  sel.clear();
  reindex(); relayout();
  pushHist(); say('* ' + kill.size + ' 个节点被抹除了。');
}
function deleteEdgeOnly(e){
  doc.edges = doc.edges.filter(x => x !== e);
  if (selEdgeId === e.id) selEdgeId = null;
  reindex(); relayout(); pushHist(); say('* 连线已断开。');
}
function toggleCollapseOf(n){
  if (!n) return;
  const kids = idx.children.get(n.id) || [];
  if (!kids.length){ say('* 这个节点没有子节点。'); return; }
  if (!n.collapsed){
    n.collapsed = true;
    n.collapseAt = { x:n.x, y:n.y };     // 记住折叠时父节点的位置
    reindex();
    say('* 已折叠，隐藏 ' + descendants(n.id).length + ' 个子孙节点。点角标或按 Space 展开。');
  } else {
    const from = n.collapseAt;
    n.collapsed = false;
    // 折叠期间父节点可能被拖走过，展开时把整棵子树按同样的位移挪过去，相对形状不变
    if (from){
      const dx = n.x - from.x, dy = n.y - from.y;
      if (dx || dy) for (const id of descendants(n.id)){ const m = byId(id); if (m){ m.x += dx; m.y += dy; } }
    }
    n.collapseAt = null;
    reindex();
    say('* 已展开。');
  }
  pushHist(); mark();
}
function toggleCollapse(){
  const n = soleSel();
  if (!n){ say('* 先选中一个节点，再按 Space。'); return; }
  toggleCollapseOf(n);
}
function setShape(shape){
  const n = soleSel(); if (!n) return;
  n.shape = shape; relayout(); pushHist();
  const names = { rect:'矩形', round:'圆角', diamond:'菱形', oval:'椭圆' };
  say('* 形状已改为「' + names[shape] + '」。');
}
/* 把节点尺寸改回「随文字自适应」 */
function autoSizeNode(n){
  if (!n) return;
  n.fixedW = null; n.fixedH = null;
  sizeNode(n); pushHist(); mark();
  say('* 尺寸已恢复自适应。');
}
function setNodeSize(n, w, h){
  if (!n) return;
  n.fixedW = Math.max(MIN_FIXED_W, Math.round(w));
  n.fixedH = Math.max(MIN_FIXED_H, Math.round(h));
  sizeNode(n);
  mark();
}
function selectOnly(id){ sel.clear(); selEdgeId = null; if (id) sel.add(id); mark(); }
function selectEdge(id){ sel.clear(); selEdgeId = id || null; mark(); }
function selectAll(){
  sel = new Set(doc.nodes.filter(n => !isHidden(n.id)).map(n => n.id));
  selEdgeId = null;
  mark();
}

/* --- 连线样式 --- */
const ARROW_LABEL = { none:'无箭头', end:'单向箭头', both:'双向箭头' };
const ROUTE_LABEL = { ortho:'正交折线', curve:'曲线' };
const edgeStyleLabel = (e) => (e.dash ? '虚线' : '实线') + (e.arrow === 'none' ? '' : ARROW_LABEL[e.arrow]);
function setEdgeStyle(e, patch){
  if (!e) return;
  Object.assign(e, patch);
  normalizeEdge(e);
  mark();
}
function cycleEdgeArrow(e){
  if (!e) return;
  e.arrow = ARROW_KINDS[(ARROW_KINDS.indexOf(e.arrow) + 1) % ARROW_KINDS.length];
  mark(); say('* 箭头：' + ARROW_LABEL[e.arrow]);
}
function cycleEdgeRoute(e){
  if (!e) return;
  e.route = e.route === 'ortho' ? 'curve' : 'ortho';
  mark(); say('* 走线：' + ROUTE_LABEL[e.route]);
}
/* --- 端点钉位（自由连接）：null = 自动吸附 --- */
function edgeSideOf(e, which){ return which === 'a' ? e.aSide : e.bSide; }
function setEdgeSide(e, which, side){
  if (!e) return;
  if (which === 'a') e.aSide = normSide(side); else e.bSide = normSide(side);
  mark();
}
const edgeSideText = (e) => (e.aSide ? SIDE_LABEL[e.aSide] : '自动') + ' → ' + (e.bSide ? SIDE_LABEL[e.bSide] : '自动');

/* --- 拐点：手动指定连线的弯折走向 --- */
function addWaypoint(e, x, y, index){
  if (!e) return -1;
  if (!e.waypoints) e.waypoints = [];
  const at = (index == null) ? e.waypoints.length : Math.max(0, Math.min(e.waypoints.length, index));
  e.waypoints.splice(at, 0, { x, y });
  mark();
  return at;
}
function moveWaypoint(e, index, x, y){
  if (!e || !e.waypoints || !e.waypoints[index]) return;
  e.waypoints[index] = { x, y };
  mark();
}
function removeWaypoint(e, index){
  if (!e || !e.waypoints || !e.waypoints[index]) return;
  e.waypoints.splice(index, 1);
  if (!e.waypoints.length) e.waypoints = null;
  mark();
}
function clearWaypoints(e){
  if (!e) return;
  e.waypoints = null;
  mark();
}
/* 拖到几乎成一条直线时把拐点自动收掉 */
function pruneWaypoint(e, index){
  if (!e || !e.waypoints || e.waypoints.length < 1) return false;
  const pts = edgeGeomFor(e) ? edgeGeomFor(e).pts : null;
  if (!pts) return false;
  const i = index + 1;                       // pts[0] 是起点锚点，拐点从 1 开始
  if (i <= 0 || i >= pts.length - 1) return false;
  if (distSeg(pts[i], pts[i - 1], pts[i + 1]) < 8){
    removeWaypoint(e, index);
    return true;
  }
  return false;
}

function moveSelection(dx, dy){
  for (const id of sel){ const n = byId(id); if (n){ n.x += dx; n.y += dy; } }
}
/* Ctrl+方向键：就近跳转选择（不再有「父/子/兄弟」那套，那是模式时代的产物） */
function navigate(dir){
  const n = soleSel();
  if (!n){
    if (doc.nodes.length) selectOnly(doc.nodes[0].id);
    return;
  }
  const c = { x:n.x + n.w / 2, y:n.y + n.h / 2 };
  let best = null, bs = 1e9;
  for (const m of doc.nodes){
    if (m.id === n.id) continue;
    const mc = { x:m.x + m.w / 2, y:m.y + m.h / 2 };
    const vx = mc.x - c.x, vy = mc.y - c.y;
    const along = dir === 'left' ? -vx : dir === 'right' ? vx : dir === 'up' ? -vy : vy;
    if (along < 12) continue;
    const side = dir === 'left' || dir === 'right' ? Math.abs(vy) : Math.abs(vx);
    const s = along + side * 2.2;
    if (s < bs){ bs = s; best = m; }
  }
  if (best) selectOnly(best.id);
}
