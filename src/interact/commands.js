'use strict';
/* ==========================================================================
   GRAPHEON · interact/commands.js
   结构操作：子/兄弟/父节点、删除、折叠、形状、方向生成。
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
  const e = { id:uid('e'), s, t, label:'' };
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
  if (doc.mode === 'mind' && doc.autoLayout) layoutMind();
  sel.clear(); sel.add(nn.id);
  pushHist(); mark();
  startEdit('node', nn.id, '');
}
function addChildOf(parent){
  if (parent.collapsed) parent.collapsed = false;
  const sib = idx.children.get(parent.id) || [];
  // 先给个临时位置，思维导图会立即重排
  const nn = addNodeAt('', parent.x + parent.w + HGAP, parent.y + sib.length * (parent.h + VGAP), 'rect');
  linkNodes(parent.id, nn.id);
  afterSpawn(nn);
}
function addSiblingOf(p, ref, where){
  if (p.collapsed) p.collapsed = false;
  const nn = addNodeAt('', ref.x, ref.y + ref.h + VGAP, 'rect');
  const e = linkNodes(p.id, nn.id);
  // 兄弟顺序由 edges 里父节点出边的先后决定，插到 ref 的前/后
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
    else doc.edges.push({ id:uid('e'), s:p, t:np.id, label:'' });
  }
  const ne = { id:uid('e'), s:np.id, t:n.id, label:'' };
  const j = p ? doc.edges.findIndex(e => e.s === p && e.t === np.id) : -1;
  if (j >= 0) doc.edges.splice(j + 1, 0, ne); else doc.edges.push(ne);
  afterSpawn(np);
}
/* --- 方向键 / WASD：在该方向生成节点 --- */
function spawnInDirection(dir){
  const n = soleSel();
  if (!n){ say('* 先选中一个节点，再按方向键（或 WASD）。'); return; }
  if (doc.mode === 'mind'){
    if (dir === 'right'){ addChildOf(n); say('* 向右长出一个子节点。'); return; }
    if (dir === 'left'){
      const wasRoot = isRoot(n);
      addParentOf(n);
      say(wasRoot ? '* 根节点没有父级，于是新节点成为了新的根。' : '* 已在左侧插入一个父节点。');
      return;
    }
    const p = idx.parent.get(n.id);
    if (!p){ addChildOf(n); say('* 根节点没有兄弟，改为新建子节点。'); return; }
    addSiblingOf(byId(p), n, dir === 'up' ? 'before' : 'after');
    say(dir === 'up' ? '* 已在前面插入一个兄弟节点。' : '* 已在后面插入一个兄弟节点。');
    return;
  }
  // 流程图：纯空间方向，自动避开同一行/列上的已有节点
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
  reindex(); relayout(); pushHist(); say('* 连线已断开。');
}
function toggleCollapse(){
  const n = soleSel();
  if (!n) return;
  const kids = idx.children.get(n.id) || [];
  if (!kids.length){ say('* 这个节点没有子节点。'); return; }
  n.collapsed = !n.collapsed;
  relayout(); pushHist();
  say(n.collapsed ? '* 已折叠，隐藏 ' + descendants(n.id).length + ' 个子孙节点。' : '* 已展开。');
}
function setShape(shape){
  const n = soleSel(); if (!n) return;
  n.shape = shape; relayout(); pushHist();
  const names = { rect:'矩形', round:'圆角', diamond:'菱形', oval:'椭圆' };
  say('* 形状已改为「' + names[shape] + '」。');
}
function selectOnly(id){ sel.clear(); if (id) sel.add(id); mark(); }
function selectAll(){ sel = new Set(doc.nodes.map(n => n.id)); mark(); }

function moveSelection(dx, dy){
  for (const id of sel){ const n = byId(id); if (n){ n.x += dx; n.y += dy; } }
}
function navigate(dir){
  const n = soleSel();
  if (!n){
    if (doc.nodes.length) selectOnly(doc.nodes[0].id);
    return;
  }
  if (doc.mode === 'mind'){
    const p = idx.parent.get(n.id);
    const kids = idx.children.get(n.id) || [];
    const sibs = p ? (idx.children.get(p) || []) : doc.nodes.filter(x => !idx.parent.has(x.id)).map(x => x.id);
    if (dir === 'left'){
      if (p) selectOnly(p);
      else { const l = sibs.indexOf(n.id); if (l > 0) selectOnly(sibs[l - 1]); }
    } else if (dir === 'right'){
      if (kids.length) selectOnly(kids[0]);
      else { const l = sibs.indexOf(n.id); if (l >= 0 && l < sibs.length - 1) selectOnly(sibs[l + 1]); }
    } else {
      const l = sibs.indexOf(n.id);
      if (l < 0) return;
      const t = dir === 'up' ? l - 1 : l + 1;
      if (t >= 0 && t < sibs.length) selectOnly(sibs[t]);
    }
  } else {
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
}

