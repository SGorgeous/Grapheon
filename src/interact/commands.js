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
  const grp = selectedGroup();
  if (grp){ dissolveGroup(grp); return; }   // 删分组 = 解散，不动成员
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
function selectOnly(id){ sel.clear(); selEdgeId = null; selGroupId = null; if (id) sel.add(id); mark(); }
function selectEdge(id){ sel.clear(); selEdgeId = id || null; selGroupId = null; mark(); }
function selectGroup(id){ sel.clear(); selEdgeId = null; selGroupId = id || null; mark(); }
function selectAll(){
  sel = new Set(doc.nodes.filter(n => !isHidden(n.id)).map(n => n.id));
  selEdgeId = null; selGroupId = null;
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
const selectedGroup = () => (selGroupId ? byGroup(selGroupId) : null);
function createGroup(){
  const ids = [...sel].filter(id => byId(id) && !isHidden(id));
  if (ids.length < 2){ say('* 至少选中两个节点才能成组（Shift 点选或 Shift 拖拽框选）。'); return null; }
  doc.groups = doc.groups || [];
  const grp = { id:uid('g'), title:'分组 ' + (doc.groups.length + 1), members:ids.slice(), color:null };
  doc.groups.push(grp);
  reindex();
  selectGroup(grp.id);
  pushHist();
  say('* 已把 ' + ids.length + ' 个节点组进「' + grp.title + '」，成员之间的连线关系不变。');
  return grp;
}
function dissolveGroup(grp){
  if (!grp) return;
  doc.groups = (doc.groups || []).filter(g => g !== grp);
  if (selGroupId === grp.id) selGroupId = null;
  reindex(); pushHist(); mark();
  say('* 已解散「' + (grp.title || '分组') + '」，成员节点和连线都保留。');
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
  if (selGroupId && selGroupId !== grp.id && !bad.has(selGroupId) && grp.members.indexOf(selGroupId) < 0){
    ids.push(selGroupId);
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
