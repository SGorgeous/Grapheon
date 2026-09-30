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
  if (isEmbed(byId(s)) || isEmbed(byId(t))){ say('* 嵌入节点是封闭的，连不了线。'); return null; }
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
  // 选中的分组一律「解散」：只拆容器，成员节点和连线都留着
  const grps = selectedGroups();
  if (grps.length){
    for (const grp of grps) dissolveGroup(grp, true);
    if (!sel.size){
      pushHist(); mark();
      say('* 解散了 ' + grps.length + ' 个分组，成员和连线都保留。');
      return;
    }
  }
  if (!sel.size){ say('* 没有选中的东西。'); return; }
  const roots = [...sel].filter(id => byId(id));
  const kill = new Set();
  for (const id of roots) { kill.add(id); for (const d of descendants(id)) kill.add(d); }
  // 只在「这一刀会删空整个画布」时才拦。以前用的是「没有入边就当根节点不许删」，
  // 但自从有了自由节点（双击空白建的、图片节点、嵌入节点）之后，那个判断就不成立了。
  if (kill.size >= doc.nodes.length){
    say('* 全删掉画布就空了……至少留一个节点吧。');
    return;
  }
  doc.nodes  = doc.nodes.filter(n => !kill.has(n.id));
  doc.edges  = doc.edges.filter(e => !kill.has(e.s) && !kill.has(e.t));
  sel.clear();
  reindex(); relayout();
  pushHist();
  say('* ' + kill.size + ' 个节点被抹除了' + (grps.length ? '，另有 ' + grps.length + ' 个分组被解散。' : '。'));
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
/* 折叠一个分组：组内所有后代藏起来，分组自己的框留着（角标显示藏了多少） */
function toggleGroupCollapse(grp){
  if (!grp) return;
  const ids = groupAllNodes(grp.id);
  if (!ids.length && !groupChildGroups(grp).length){
    say('* 这个分组还是空的，没什么可折叠的。');
    return;
  }
  grp.collapsed = !grp.collapsed;
  reindex(); pushHist(); mark();
  say(grp.collapsed
    ? '* 已折叠分组「' + (grp.title || '分组') + '」，藏起 ' + ids.length + ' 个节点。点标题右边的角标展开。'
    : '* 已展开分组「' + (grp.title || '分组') + '」。');
}
/* Space：选中分组就折叠分组，选中节点就折叠节点 */
function toggleCollapse(){
  const grp = soleGroup();
  if (grp){ toggleGroupCollapse(grp); return; }
  const n = soleSel();
  if (!n){ say('* 先选中一个节点或分组，再按 Space。'); return; }
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
function selectOnly(id){ sel.clear(); selGroups.clear(); selEdgeId = null; if (id) sel.add(id); mark(); }
function selectEdge(id){ sel.clear(); selGroups.clear(); selEdgeId = id || null; mark(); }
/* 只选中这一个分组 */
function selectGroup(id){ sel.clear(); selGroups.clear(); selEdgeId = null; if (id) selGroups.add(id); mark(); }
/* Shift 点分组：加进/移出多选 */
function toggleGroupSel(id){
  if (!id) return;
  selEdgeId = null;
  if (selGroups.has(id)) selGroups.delete(id); else selGroups.add(id);
  mark();
}
function selectAll(){
  sel = new Set(doc.nodes.filter(n => !isHidden(n.id)).map(n => n.id));
  selGroups = new Set((doc.groups || []).filter(g => !isHidden(g.id)).map(g => g.id));
  selEdgeId = null;
  mark();
}
/* 选中的分组列表 */
const selectedGroups = () => [...selGroups].map(id => byGroup(id)).filter(Boolean);
/* 「整个选择就是一个分组」时才返回它 —— 面板、端点、缩放柄这些单目标操作要用 */
const soleGroup = () => (selGroups.size === 1 && sel.size === 0) ? byGroup([...selGroups][0]) : null;
/* 整个选择是不是空的 */
const nothingSelected = () => sel.size === 0 && selGroups.size === 0 && !selEdgeId;
/* 一次拖拽要带走的所有东西（选中的分组递归展开 + 选中的节点），按 id 去重 */
function selectionSnapshot(){
  const out = [], seen = new Set();
  const push = (kind, id, x, y) => {
    const k = kind + ':' + id;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ kind, id, x, y });
  };
  for (const grp of selectedGroups()) for (const s of groupSnapshot(grp)) push(s.kind, s.id, s.x, s.y);
  for (const id of sel){ const n = byId(id); if (n) push('node', id, n.x, n.y); }
  return out;
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

/* =========================================================================
   节点外观
   ========================================================================= */
/* 只改传进来的那几项；传 null 就是「跟随主题」。改完要重算尺寸（字号变了）。 */
function setNodeStyle(n, patch){
  if (!n) return;
  Object.assign(n, patch);
  if (n.font != null && !NODE_FONTS[n.font]) n.font = null;
  if (!(+n.fsPx > 0)) n.fsPx = null;
  if (!n.color) n.color = null;
  if (!n.border) n.border = null;
  sizeNode(n);
  mark();
}
function resetNodeStyle(n){
  if (!n) return;
  n.font = null; n.fsPx = null; n.color = null; n.border = null;
  sizeNode(n); mark();
  say('* 外观已恢复成跟随主题。');
}
const nodeStyleText = (n) => [
  NODE_FONT_LABEL[n.font] || NODE_FONT_LABEL.auto,
  NODE_FS_LABEL(n.fsPx),
  n.color ? '字色' : '默认字色',
  n.border ? '外框色' : '默认外框'
].join(' · ');

/* =========================================================================
   分组
   ========================================================================= */

function createGroup(){
  // 选中的分组直接作为子分组收进来；已经被这些分组包住的节点就不重复收，
  // 否则一个节点会同时属于两层，程序算符会被叠加两次。
  const inSel = new Set();
  for (const grp of selectedGroups()) for (const id of groupAllNodes(grp.id)) inSel.add(id);
  const ids = [...sel].filter(id => byId(id) && !isHidden(id) && !inSel.has(id));
  for (const grp of selectedGroups()) ids.push(grp.id);
  if (ids.length < 2){ say('* 至少选中两个东西（节点或分组）才能成组，Shift 点选或 Shift 拖拽框选。'); return null; }
  doc.groups = doc.groups || [];
  const grp = { id:uid('g'), title:'分组 ' + (doc.groups.length + 1), members:ids.slice(), color:null };
  doc.groups.push(grp);
  reindex();
  selectGroup(grp.id);
  pushHist();
  say('* 已把 ' + ids.length + ' 个节点组进「' + grp.title + '」，成员之间的连线关系不变。');
  return grp;
}
function dissolveGroup(grp, quiet){
  if (!grp) return;
  doc.groups = (doc.groups || []).filter(g => g !== grp);
  selGroups.delete(grp.id);
  reindex(); mark();
  if (!quiet){
    pushHist();
    say('* 已解散「' + (grp.title || '分组') + '」，成员节点和连线都保留。');
  }
}
function renameGroup(grp, title){
  if (!grp) return;
  grp.title = String(title == null ? '' : title).replace(/[\r\n]+/g, ' ').trim() || '分组';
  pushHist(); mark();
}
/* 搬动一个分组：它自己和里面所有东西（子分组递归）一起走 */
function moveGroupBy(grp, dx, dy){
  if (!grp) return;
  applyGroupDelta(groupSnapshot(grp), dx, dy);
  mark();
}
/* 把选中的东西（节点和/或分组）塞进一个已有分组 */
function addSelectionToGroup(grp){
  if (!grp) return;
  // 分组不能塞进自己或自己的后代里
  const bad = new Set([grp.id, ...groupDescendantGroups(grp.id)]);
  const ids = [...sel].filter(id => byId(id) && grp.members.indexOf(id) < 0);
  for (const gid of selGroups){
    if (gid !== grp.id && grp.members.indexOf(gid) < 0) ids.push(gid);
  }
  const ok = ids.filter(id => !bad.has(id));
  if (!ok.length){ say('* 没有新的东西可以加进去。'); return; }
  grp.members = grp.members.concat(ok);
  reindex(); pushHist(); mark();
  say('* 已把 ' + ok.length + ' 个东西加入「' + grp.title + '」。');
}
function removeSelectionFromGroup(grp){
  if (!grp) return;
  for (const id of sel){
    const i = grp.members.indexOf(id);
    if (i >= 0) grp.members.splice(i, 1);
  }
  reindex(); pushHist(); mark();
  say('* 已移出分组。');
}

/* 分组自由框：手动改尺寸。成员的外接框是硬下限 —— 拉不到比成员还小。 */
function setGroupSize(grp, w, h){
  if (!grp) return;
  grp.w = Math.max(120, Math.round(w));
  grp.h = Math.max(80, Math.round(h));
  const need = groupMinSize(grp);          // 成员要求的左下边界
  if (need.x != null){
    if (grp.x + grp.w < need.x + need.w) grp.w = need.x + need.w - grp.x;
    if (grp.y + grp.h < need.y + need.h) grp.h = need.y + need.h - grp.y;
  }
  mark();
}
/* 拖进拖出自动收纳：节点中心落在框里就加入，离开就移除。
   只在「拖完节点」「新建节点」时调用，其它操作（排版、改尺寸）不碰成员关系，免得误伤。 */
/* 拖进拖出自动收纳：一个东西归「包含它中心的最内层分组」所有。
   节点和分组都按这个规则走，所以把分组拖进另一个分组就是套娃。
   只在「拖完」「新建」时调用，其它操作不碰成员关系，免得误伤。 */
function syncGroupMembership(ids){
  const list = doc.groups || [];
  if (!list.length || !ids || !ids.length) return false;
  let changed = false;
  for (const id of ids){
    const n = byId(id), grp = n ? null : byGroup(id);
    if (!n && !grp) continue;
    // 移动的是分组时，它自己和它的后代都不能当自己的父级
    const exclude = grp ? new Set([grp.id, ...groupDescendantGroups(grp.id)]) : null;
    const b = n ? nodeBox(n) : groupBox(grp);
    const want = innermostGroupAt(b.x + b.w / 2, b.y + b.h / 2, exclude);
    for (const g of list){
      if (exclude && exclude.has(g.id)) continue;
      const at = g.members.indexOf(id);
      const should = !!want && want.id === g.id;
      if (should && at < 0){ g.members.push(id); changed = true; }
      else if (!should && at >= 0){ g.members.splice(at, 1); changed = true; }
    }
  }
  if (changed) mark();
  return changed;
}
/* 拖完节点 / 改完尺寸后的统一收尾：先同步成员关系，再让所有框长大到装得下自己的成员 */
function settleGroups(ids){
  const movedMem = syncGroupMembership(ids);
  const grew = growAllGroups();
  return movedMem || grew;
}
/* 把框收缩到刚好包住成员 */
function tidyGroup(grp){
  if (!grp) return;
  fitGroupToMembers(grp);
  pushHist(); mark();
  say('* 已把「' + (grp.title || '分组') + '」收缩到刚好包住成员。');
}

/* 直接画一个空的分组框，等着往里拖节点 */
function newEmptyGroup(cx, cy){
  doc.groups = doc.groups || [];
  const w = 320, h = 220;
  const grp = { id:uid('g'), title:'分组 ' + (doc.groups.length + 1), members:[], color:null,
                x:Math.round(cx - w / 2), y:Math.round(cy - h / 2), w, h };
  doc.groups.push(grp);
  reindex();
  selectGroup(grp.id);
  pushHist();
  say('* 建了一个空分组框。把节点拖进去就会自动收纳，拖右下角可以改大小。');
  return grp;
}

/* =========================================================================
   程序化节点
   ========================================================================= */
/* 把算符写成人看得懂的一行字，用来当程序节点的标题 */
function programLabel(p){
  const q = normalizeProgram(p);
  const keyLabel = (PROGRAM_KEYS[q.op].find(k => k[0] === q.key) || ['', ''])[1];
  if (q.op === 'shape') return '形状 → ' + (SHAPE_LABEL[q.value] || q.value);
  if (q.op === 'value') return '数值 ' + (q.mode === 'add' ? '+=' : '=') + ' ' + q.value;
  if (q.op === 'move')  return keyLabel + ' ' + (q.value >= 0 ? '+' : '') + q.value;
  if (q.key === 'font') return '字体 → ' + (NODE_FONT_LABEL[q.value] || '默认');
  if (q.key === 'fsPx') return '字号 ' + (q.mode === 'add' ? ((q.value >= 0 ? '+' : '') + q.value) : ('= ' + q.value));
  const cn = (NODE_COLORS.find(c => c[0] === q.value) || [null, null])[1];
  return keyLabel + ' → ' + (cn || '默认');
}
function createProgramNode(x, y){
  const nn = addNodeAt('', x, y, 'round');
  nn.kind = 'program';
  nn.program = normalizeProgram(null);
  nn.text = programLabel(nn.program);
  sizeNode(nn);              // 标题是后填的，尺寸得按新标题重算
  reindex();                 // 新节点要立刻进索引，否则 byId 找不到它
  return nn;
}
/* 改算符。改完立刻重算派生效果并重新量尺寸（字号会被算符影响）。 */
function setProgram(n, patch){
  if (!isProgram(n)) return;
  const before = programLabel(n.program);
  n.program = normalizeProgram(Object.assign({}, n.program, patch));
  // 标题还是自动生成的那份就跟着更新；用户自己改过就尊重用户
  if (String(n.text).trim() === before) n.text = programLabel(n.program);
  refreshEffects(); sizeAll(); mark();
}
/* 普通节点 ↔ 程序节点 */
function toggleProgramNode(n){
  if (!n) return;
  if (isProgram(n)){
    n.kind = 'node';
    say('* 「' + (n.text || '节点') + '」已转回普通节点，它对目标的影响立刻消失。');
  } else {
    n.kind = 'program';
    n.program = normalizeProgram(n.program);
    if (!String(n.text).trim()) n.text = programLabel(n.program);
    say('* 「' + (n.text || '节点') + '」已转成程序节点：把它连到目标节点上，算符就会叠加过去。');
  }
  refreshEffects(); sizeAll(); pushHist(); mark();
}
/* 一个节点身上叠了哪些算符（面板里列出来给人看） */
/* 一个东西身上叠了哪些程序算符。传节点 id 找直接指向它的；
   传分组 id 找指向这个分组（或它的任一祖先分组）的 —— 组内的节点都算被作用到。 */
function programHits(id){
  const ancestors = new Set([id]);
  for (const g of (doc.groups || [])){
    if ((g.members || []).indexOf(id) >= 0) ancestors.add(g.id);
  }
  // 分组套娃：把祖先的祖先也加进来
  for (let i = 0; i < 4; i++){
    for (const g of (doc.groups || [])){
      for (const a of [...ancestors]) if ((g.members || []).indexOf(a) >= 0) ancestors.add(g.id);
    }
  }
  const out = [];
  for (const e of doc.edges){
    if (!ancestors.has(e.t)) continue;
    const src = byId(e.s);
    if (src && isProgram(src)) out.push(src);
  }
  return out;
}

/* =========================================================================
   图片节点
   ========================================================================= */
/* 把一张图片等比缩到 IMG_SRC_MAX 以内并转成 data URL（存文件、存 localStorage 都靠它） */
function imageToDataURL(file, cb){
  const reader = new FileReader();
  reader.onerror = () => cb(null, 0, 0);
  reader.onload = () => {
    const im = new Image();
    im.onerror = () => cb(null, 0, 0);
    im.onload = () => {
      const natW = im.naturalWidth || 1, natH = im.naturalHeight || 1;
      const s = Math.min(1, IMG_SRC_MAX / Math.max(natW, natH));
      const w = Math.max(1, Math.round(natW * s)), h = Math.max(1, Math.round(natH * s));
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d');
      cx.drawImage(im, 0, 0, w, h);
      let url = cv.toDataURL('image/png');
      if (url.length > IMG_BUDGET) url = cv.toDataURL('image/jpeg', 0.82);   // 太大就压一道
      cb(url, natW, natH);
    };
    im.src = reader.result;
  };
  reader.readAsDataURL(file);
}
const newImageNode = (url, natW, natH, x, y) => {
  const n = addNodeAt('', x, y, 'rect');
  n.kind = 'image';
  n.image = url; n.imgW = natW; n.imgH = natH || 1;
  n.desc = '';
  sizeNode(n);
  return n;
};
/* 视口正中的世界坐标，用来决定新图片落在哪 */
const viewCenter = () => s2w(VW / 2, VH / 2 - 60);
/* 从文件插一张图。at 不给就放视口正中 */
function insertImageFile(file, at){
  if (!file){ return; }
  if (!/^image\//.test(file.type || '')){ say('* 「' + (file.name || '这个文件') + '」不是图片。'); return; }
  say('* 正在处理图片……');
  imageToDataURL(file, (url, natW, natH) => {
    if (!url){ say('* 这张图片读不出来。'); return; }
    const p = at || viewCenter();
    const n = newImageNode(url, natW, natH, Math.round(p.x - 140), Math.round(p.y - 110));
    reindex(); sizeAll();
    selectOnly(n.id);
    pushHist(); mark();
    say('* 图片已加入（' + natW + '×' + natH + '，内嵌约 ' + Math.round(url.length / 1024) +
        ' KB）。右上角双击命名，图片下面双击写描述。');
  });
}
/* 给已有的图片节点换一张图 */
function replaceImage(n, file){
  if (!n || n.kind !== 'image' || !file) return;
  imageToDataURL(file, (url, natW, natH) => {
    if (!url){ say('* 这张图片读不出来。'); return; }
    n.image = url; n.imgW = natW; n.imgH = natH || 1;
    sizeNode(n); pushHist(); mark();
    say('* 换好了（' + natW + '×' + natH + '）。');
  });
}
function setNodeDesc(n, text){
  if (!n) return;
  n.desc = String(text == null ? '' : text);
  sizeNode(n); mark();
}

/* =========================================================================
   嵌入文档（插入 Grapheon）
   -------------------------------------------------------------------------
   把一整份文档当成一个节点塞进来。它是封闭的：
     · 不接受任何连线（edgeUsable / linkTargetAt / linkNodes 三处都拦）
     · 双击进去编辑的是**内部副本**，外面那份原文件一个字节都不会动
   进出用的是一个文档栈，所以嵌套嵌入也没问题。
   ========================================================================= */
let docStack = [];
const insideEmbed = () => docStack.length > 0;
const embedRootName = () => insideEmbed() ? docStack[docStack.length - 1].title : '';

function addEmbedNode(d2, name, x, y){
  const n = addNodeAt(name || '嵌入文档', x, y, 'rect');
  n.kind = 'embed';
  n.embed = { doc: d2 };
  n.fixedW = EMBED_DEF_W;
  n.fixedH = EMBED_DEF_H;
  sizeNode(n);
  reindex(); sizeAll();
  return n;
}
/* 从文件插一份文档进来 */
function insertEmbedFile(file, at){
  if (!file) return;
  const r = new FileReader();
  r.onerror = () => say('* 这个文件读不出来。');
  r.onload = () => {
    let d2 = null;
    try { d2 = JSON.parse(String(r.result)); } catch(e){ d2 = null; }
    if (!d2 || !Array.isArray(d2.nodes)){
      say('* 这不是一个 Grapheon 文档（要 .json）。');
      return;
    }
    const p = at || viewCenter();
    const n = addEmbedNode(d2, String(file.name || '嵌入文档').replace(/\.json$/i, ''),
                           Math.round(p.x - EMBED_DEF_W / 2), Math.round(p.y - EMBED_DEF_H / 2));
    selectOnly(n.id);
    pushHist(); mark();
    say('* 已把「' + n.text + '」整份嵌进来（' + d2.nodes.length + ' 个节点）。' +
        '它是封闭的：连不了线；双击进去可以改，改的是副本，原文件不受影响。');
  };
  r.readAsText(file);
}
/* 进入嵌入文档 */
function enterEmbed(n){
  if (!isEmbed(n)) return;
  if (!n.embed || !n.embed.doc || !n.embed.doc.nodes || !n.embed.doc.nodes.length){
    say('* 这个嵌入节点里没有内容。');
    return;
  }
  docStack.push({
    doc, view:{ x:view.x, y:view.y, z:view.z },
    sel:new Set(sel), selGroups:new Set(selGroups), selEdgeId,
    nodeId:n.id, title:n.text,
    histStack:hist.stack.slice(), histI:hist.i
  });
  deserialize(JSON.parse(JSON.stringify(n.embed.doc)));   // 编辑的是副本
  fitView(); initHist(); mark();
  say('* 进了「' + n.text + '」内部。这里改的是副本，原文件不会被动到；按 Esc 出来。');
  updateMeta();
}
/* 退出嵌入文档，把里面改的东西写回父文档里那个节点 */
function exitEmbed(){
  const top = docStack.pop();
  if (!top) return false;
  const parentNode = top.doc.nodes.find(x => x.id === top.nodeId);
  if (parentNode && parentNode.embed){
    parentNode.embed.doc = JSON.parse(JSON.stringify(serialize()));
  }
  doc = top.doc;
  view.x = top.view.x; view.y = top.view.y; view.z = top.view.z;
  sel = new Set(top.sel);
  selGroups = new Set(top.selGroups);
  selEdgeId = top.selEdgeId;
  hist.stack = top.histStack;
  hist.i = top.histI;
  reindex(); sizeAll(); mark();
  selectOnly(top.nodeId);
  pushHist();          // 内层改动写回了父文档，得进历史栈，否则栈顶和当前状态对不上
  say('* 回到了「' + (parentNode ? parentNode.text : '上一层') + '」。里面改的东西已经存进副本了。');
  updateMeta();
  return true;
}
const clearDocStack = () => { docStack = []; };

/* =========================================================================
   变量定义节点 / 运算节点 / 函数分组
   ========================================================================= */
function addVarNode(name, x, y, opts){
  const n = addNodeAt('', x, y, 'rect');
  n.kind = 'var';
  n.varDef = normalizeVarDef(Object.assign({ name:name || 'x', value:'0' }, opts || {}));
  sizeNode(n);
  reindex(); sizeAll();
  return n;
}
function addOpNode(desc, x, y, opts){
  const n = addNodeAt(desc || '运算', x, y, 'rect');
  n.kind = 'op';
  n.opDef = normalizeOpDef(opts || {});
  sizeNode(n);
  reindex(); sizeAll();
  return n;
}
/* 改变量定义。改完要重算：值会影响所有引用它的节点文本 */
function setVarDef(n, patch){
  if (!isVarNode(n)) return;
  n.varDef = normalizeVarDef(Object.assign({}, n.varDef, patch));
  reindex(); sizeAll(); mark();
}
function setOpDef(n, patch){
  if (!isOpNode(n)) return;
  n.opDef = normalizeOpDef(Object.assign({}, n.opDef, patch));
  reindex(); sizeAll(); mark();
}
/* 双击算符框：在四个算符里轮换 */
function cycleOpOperator(n){
  if (!isOpNode(n)) return;
  const cur = normalizeOpDef(n.opDef).op;
  const next = OP_IDS[(OP_IDS.indexOf(cur) + 1) % OP_IDS.length];
  setOpOperator(n, next);
}
/* 分组 → 函数分组 */
function toggleFunctionGroup(grp){
  if (!grp) return;
  grp.isFunction = !grp.isFunction;
  reindex(); sizeAll(); pushHist(); mark();
  say(grp.isFunction
    ? '* 「' + (grp.title || '分组') + '」现在是函数分组：变量节点指向它，值就变成组内算出来的值。'
    : '* 「' + (grp.title || '分组') + '」不再是函数分组。');
}
/* 手动设优先级 */
function setPriority(n, v){
  if (!n) return;
  const num = Math.round(+v);
  n.priority = (isNaN(num) || num === 0) ? null : num;
  reindex(); sizeAll(); pushHist(); mark();
  say('* 「' + (n.text || n.id) + '」的优先级设成 ' + priorityOf(n) + '。');
}

/* ---------------- 输出节点 ----------------
   每个作用域（顶层文档 / 某个函数分组 / 某个嵌入文档）只有一个生效。
   值有入边就从入边推，没入边就按名字找同作用域的变量。 */
function addOutNode(name, x, y){
  const n = addNodeAt('', x, y, 'rect');
  n.kind = 'out';
  n.outDef = normalizeOutDef({ name:name || 'output' });
  sizeNode(n);
  reindex(); sizeAll();
  return n;
}
function setOutDef(n, patch){
  if (!isOutNode(n)) return;
  n.outDef = normalizeOutDef(Object.assign({}, n.outDef, patch));
  reindex(); sizeAll(); mark();
}
function setOpOperator(n, id){
  if (!isOpNode(n) || !OP_BY_ID.has(id)) return;
  setOpDef(n, { op:id });          // normalizeOpDef 会把 operands 补齐到新算符的 arity
  pushHist();
  say('* 算符改成 ' + opDefOf(id).label + '（' + opDefOf(id).hint + '）。');
}

/* =========================================================================
   特殊变量节点：勾选 / 滑条 / 开关
   都是变量定义节点，只是 control 不同 —— 名字、作用域、优先级、{name} 引用全都共用。
   ========================================================================= */
function addControlNode(control, x, y, opts){
  const n = addNodeAt('', x, y, 'rect');
  n.kind = 'var';
  const base = { name: control === 'check' ? '选项' : control === 'slider' ? '数值' : '开关' };
  if (control === 'check')  Object.assign(base, { control:'check', options:['选项一', '选项二'], picked:[0], type:'string' });
  if (control === 'slider') Object.assign(base, { control:'slider', value:'50', min:0, max:100, step:1, type:'number' });
  if (control === 'switch') Object.assign(base, { control:'switch', on:false, type:'string' });
  n.varDef = normalizeVarDef(Object.assign(base, opts || {}));
  sizeNode(n);
  reindex(); sizeAll();
  return n;
}
/* 点一下勾选项：切换选中 */
function toggleCheckOption(n, i){
  if (!isVarNode(n)) return null;
  const v = normalizeVarDef(n.varDef);
  if (v.control !== 'check' || i < 0 || i >= Math.max(1, v.options.length)) return null;
  const picked = v.picked.slice();
  const at = picked.indexOf(i);
  if (at >= 0) picked.splice(at, 1); else picked.push(i);
  n.varDef = normalizeVarDef(Object.assign({}, v, { picked }));
  reindex(); sizeAll(); mark();
  return n.varDef;
}
/* 点一下开关：通 / 断 */
function toggleSwitch(n){
  if (!isVarNode(n)) return null;
  const v = normalizeVarDef(n.varDef);
  if (v.control !== 'switch') return null;
  n.varDef = normalizeVarDef(Object.assign({}, v, { on: !v.on }));
  reindex(); sizeAll(); mark();
  return n.varDef;
}
/* 拖滑条：按世界坐标算出值，实时生效 */
function setSliderFromPointer(n, worldP){
  if (!isVarNode(n)) return null;
  const v = normalizeVarDef(n.varDef);
  if (v.control !== 'slider') return null;
  const val = sliderValueAt(n, worldP.x);
  if (String(val) === String(sliderValue(v, n.id))) return null;
  n.varDef = normalizeVarDef(Object.assign({}, v, { value:String(val) }));
  reindex(); sizeAll(); mark();
  return val;
}
function setSliderRange(n, patch){
  if (!isVarNode(n)) return;
  n.varDef = normalizeVarDef(Object.assign({}, n.varDef, patch));
  reindex(); sizeAll(); pushHist(); mark();
  say('* 滑条范围：' + varScopeText(n.varDef) + '。');
}
function setVarControl(n, control){
  if (!isVarNode(n)) return;
  n.varDef = normalizeVarDef(Object.assign({}, n.varDef, { control }));
  sizeNode(n);
  reindex(); sizeAll(); pushHist(); mark();
  say('* 「' + normalizeVarDef(n.varDef).name + '」现在是' + VAR_CONTROL_LABEL[control] + '节点。');
}
/* 勾选节点的选项列表：用一串逗号分隔的文本来编辑 */
function setCheckOptions(n, text){
  if (!isVarNode(n)) return;
  const options = String(text || '').split(/[,，\n]/).map(s => s.trim()).filter(s => s !== '');
  const v = normalizeVarDef(n.varDef);
  n.varDef = normalizeVarDef(Object.assign({}, v, { options, picked:[] }));
  sizeNode(n);
  reindex(); sizeAll(); mark();
}

/* =========================================================================
   对齐与等距分布
   -------------------------------------------------------------------------
   作用于**选中的东西**：
     · 选中的分组当成一个整体搬（它内部的节点会被跳过，否则同一个节点被搬两次）
     · 其余选中的节点各自搬自己
   对齐基准是**整个选择的外接矩形** —— 这样结果和眼睛看到的一致。

   ⚠ 故意不跑防重叠：用户要的就是把它们排成一条线，弹开就白排了。
   ========================================================================= */
const ALIGN_LABELS = {
  'h-left':'左对齐', 'h-center':'水平居中', 'h-right':'右对齐',
  'v-top':'顶对齐',  'v-center':'垂直居中', 'v-bottom':'底对齐'
};
const ALIGN_MODES = Object.keys(ALIGN_LABELS);

/* 把选择摊成可以搬的条目 */
function alignItems(){
  const gsel = selectedGroups();
  const inside = new Set();
  for (const g of gsel) for (const id of groupAllNodes(g.id)) inside.add(id);
  const items = [];
  for (const g of gsel){
    const b = groupBox(g);
    if (!b) continue;
    items.push({ what:'group', ref:g, x:b.x, y:b.y, w:b.w, h:b.h,
                 move:(dx, dy) => moveGroupBy(g, dx, dy) });
  }
  for (const id of sel){
    if (inside.has(id)) continue;            // 已经在被搬的分组里了，别再搬一次
    const n = byId(id);
    if (!n) continue;
    const b = nodeBox(n);
    items.push({ what:'node', ref:n, x:b.x, y:b.y, w:b.w, h:b.h,
                 move:(dx, dy) => { n.x += dx; n.y += dy; } });
  }
  return items;
}
function alignBounds(items){
  const x0 = Math.min(...items.map(i => i.x));
  const y0 = Math.min(...items.map(i => i.y));
  const x1 = Math.max(...items.map(i => i.x + i.w));
  const y1 = Math.max(...items.map(i => i.y + i.h));
  return { x0, y0, x1, y1 };
}
function alignSelection(mode){
  if (ALIGN_MODES.indexOf(mode) < 0) return false;
  const items = alignItems();
  if (items.length < 2){ say('* 至少选两个东西才能对齐。'); return false; }
  const b = alignBounds(items);
  let moved = 0;
  for (const it of items){
    let dx = 0, dy = 0;
    if (mode === 'h-left')        dx = b.x0 - it.x;
    else if (mode === 'h-center') dx = (b.x0 + b.x1) / 2 - (it.x + it.w / 2);
    else if (mode === 'h-right')  dx = b.x1 - (it.x + it.w);
    else if (mode === 'v-top')    dy = b.y0 - it.y;
    else if (mode === 'v-center') dy = (b.y0 + b.y1) / 2 - (it.y + it.h / 2);
    else if (mode === 'v-bottom') dy = b.y1 - (it.y + it.h);
    dx = Math.round(dx); dy = Math.round(dy);
    if (dx || dy){ it.move(dx, dy); moved++; }
  }
  reindex(); sizeAll(); pushHist(); mark();
  say('* ' + ALIGN_LABELS[mode] + '：' + items.length + ' 个（' + moved + ' 个动了）。');
  return true;
}
/* 等距分布：首尾不动，中间按「边到边的间距相等」重排。
   按中心排序，所以不管谁宽谁窄，视觉顺序都是对的。 */
function distributeSelection(axis){
  if (axis !== 'x' && axis !== 'y') return false;
  const items = alignItems();
  if (items.length < 3){ say('* 至少选三个才能等距分布。'); return false; }
  const pos = (axis === 'x') ? 'x' : 'y';
  const size = (axis === 'x') ? 'w' : 'h';
  const sorted = items.slice().sort((a, b) => (a[pos] + a[size] / 2) - (b[pos] + b[size] / 2));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const span = (last[pos] + last[size]) - first[pos];
  const total = sorted.reduce((t, it) => t + it[size], 0);
  const gap = (span - total) / (sorted.length - 1);
  let cur = first[pos];
  for (const it of sorted){
    const d = Math.round(cur - it[pos]);
    if (d) it.move(pos === 'x' ? d : 0, pos === 'y' ? d : 0);
    cur += it[size] + gap;
  }
  reindex(); sizeAll(); pushHist(); mark();
  say('* ' + (axis === 'x' ? '横向' : '竖向') + '等距分布：' + sorted.length + ' 个，间距 '
      + Math.round(gap) + 'px。');
  return true;
}

/* =========================================================================
   双击分组 = 选中组内所有节点（不含外框）；三击 = 选中外框
   -------------------------------------------------------------------------
   「组内节点」是**递归**的：套娃里的成员也算 —— 你双击一个组，
   想要的是「这个组里所有的东西」，不是「直接挂在这一层的那几个」。
   ========================================================================= */
function selectGroupNodes(grp){
  if (!grp) return false;
  sel.clear(); selGroups.clear(); selEdgeId = null;
  let skipped = 0;
  for (const id of groupAllNodes(grp.id)){
    if (!byId(id)) continue;
    if (isHidden(id)){ skipped++; continue; }     // 藏起来的选不上，和全选保持一致
    sel.add(id);
  }
  lastClickNode = null;
  mark();
  say('* 选中了「' + (grp.title || '分组') + '」里的 ' + sel.size + ' 个节点'
      + (skipped ? '（另有 ' + skipped + ' 个藏着，跳过了）' : '') + '。');
  return true;
}
