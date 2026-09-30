'use strict';
/* ==========================================================================
   GRAPHEON · core/state.js
   文档模型、id 分配、父子索引、序列化 / 反序列化。
   ========================================================================== */

/* ---------------- 文档模型 ---------------- */
let doc = { v:2, nodes:[], edges:[], groups:[] };

/* 连线的「类型」＝ 三个互相独立的属性。arrow: none|end|both，dash: 实线/虚线，
   route: ortho 正交折线 / curve 曲线。老文件没有这些字段，由 normalizeEdge 补默认值。 */
const EDGE_DEFAULTS = { arrow:'end', dash:false, route:'ortho' };
const ARROW_KINDS = ['none', 'end', 'both'];
const ROUTE_KINDS = ['ortho', 'curve'];
/* 连线的两端各可以「钉」在节点的某条边上（r/l/t/b）。null = 自动吸附，
   由路由按两个节点的相对位置挑最合适的一对锚点（默认就是这个）。 */
const SIDE_KINDS = ['r', 'l', 't', 'b'];
const SIDE_LABEL = { r:'右', l:'左', t:'上', b:'下' };
const normSide = (v) => (SIDE_KINDS.indexOf(v) >= 0 ? v : null);
function normalizeEdge(e){
  if (ARROW_KINDS.indexOf(e.arrow) < 0) e.arrow = EDGE_DEFAULTS.arrow;
  if (ROUTE_KINDS.indexOf(e.route) < 0) e.route = EDGE_DEFAULTS.route;
  e.dash = !!e.dash;
  e.label = e.label == null ? '' : String(e.label);
  e.aSide = normSide(e.aSide);
  e.bSide = normSide(e.bSide);
  if (e.waypoints && !Array.isArray(e.waypoints)) e.waypoints = null;
  return e;
}
function makeEdge(s, t){
  return normalizeEdge({ id:uid('e'), s, t, label:'', aSide:null, bSide:null });
}
let nid = 1;
/* id 分配：节点用 n* 前缀、边用 e* 前缀，共用同一个自增计数器。
   因为共用计数器，必须对「两个命名空间」都查重，否则会发出重复 id，
   而 reindex 会把重复 id 的边当成同一条边丢掉（连线凭空消失）。 */
let usedIds = new Set();
function mkId(prefix, set){
  let id, guard = 0;
  do { id = prefix + (nid++).toString(36); } while (set.has(id) && guard++ < 1000000);
  set.add(id);
  return id;
}
const uid = (p) => mkId(p || 'n', usedIds);
let idx = { children:new Map(), parent:new Map(), byId:new Map(), groups:new Map(), hidden:new Set() };
let sel = new Set();
let selEdgeId = null;          // 选中的连线（与节点选择互斥）
let selGroupId = null;         // 选中的分组（同上）
let view = { x:0, y:0, z:1 };
let hover = null, hoverPort = null, hoverEdge = null;
let drag = null, marquee = null, linking = null, relink = null;
let editing = null;
let lastClickNode = null;      // Shift 连线的第一个节点
let dirty = true;
const isRoot = (n) => !idx.parent.has(n.id);
const byId   = (id) => idx.byId.get(id);
const mark   = () => { dirty = true; };

function reindex(){
  idx.children = new Map(); idx.parent = new Map(); idx.byId = new Map(); idx.groups = new Map();
  for (const n of doc.nodes) { idx.children.set(n.id, []); idx.byId.set(n.id, n); }
  // 自由框：成员允许为空（就是个空盒子，等着往里拖东西），所以只清理「已不在文档里」的成员
  if (!Array.isArray(doc.groups)) doc.groups = [];
  for (const g of doc.groups){
    g.members = (g.members || []).filter(id => idx.byId.has(id));
    if (!(+g.w > 0) || !(+g.h > 0)) fitGroupToMembers(g);   // 老档案没尺寸就按成员补一个
    else groupGrowToFit(g);                                 // 维持不变量：框永远装得下成员
  }
  for (const g of doc.groups) idx.groups.set(g.id, g);
  const seen = new Set();
  for (const e of doc.edges){
    if (seen.has(e.id)) continue; seen.add(e.id);
    if (e.s === e.t) continue;
    if (!idx.byId.has(e.s) || !idx.byId.has(e.t)) continue;   // 端点可以是分组，那就不进树
    if (idx.parent.has(e.t)) continue;
    if (reachUp(e.s, e.t)) continue;               // 防环
    idx.parent.set(e.t, e.s);
    idx.children.get(e.s).push(e.t);
  }
  // 根 = 没有父节点；有子节点的根才用大号字
  // （空白新文档里只有一个光杆中心节点，那个也当根处理，否则它是小号字，很怪）
  for (const n of doc.nodes){
    n.big = !idx.parent.has(n.id) &&
            ((idx.children.get(n.id) || []).length > 0 || doc.nodes.length === 1);
  }
  // 折叠：把被折叠节点以下的整棵子树标记为隐藏（绘制/命中/选择/导出都要跳过它们）
  idx.hidden = new Set();
  for (const n of doc.nodes){
    if (!n.collapsed) continue;
    for (const d of descendants(n.id)) idx.hidden.add(d);
  }
  // 选中集里不该留着看不见的东西
  for (const id of [...sel]) if (idx.hidden.has(id)) sel.delete(id);
  if (selEdgeId){
    const e = doc.edges.find(x => x.id === selEdgeId);
    if (e && (idx.hidden.has(e.s) || idx.hidden.has(e.t))) selEdgeId = null;
  }
  if (selGroupId && !idx.groups.has(selGroupId)) selGroupId = null;
  // 重建 id 占用表，uid() 靠它保证不与既有 id 冲突
  usedIds = new Set();
  for (const n of doc.nodes) usedIds.add(n.id);
  for (const e of doc.edges) usedIds.add(e.id);
  for (const g of doc.groups) usedIds.add(g.id);
}
const isHidden = (id) => idx.hidden.has(id);
/* 这条线整体可见吗（两端都没被折叠藏起来） */
const edgeVisible = (e) => !idx.hidden.has(e.s) && !idx.hidden.has(e.t);
const byGroup = (id) => idx.groups.get(id);
/* 端点可以是节点、也可以是分组。统一按「有 id/x/y/w/h 的东西」对待，路由就不用分情况了。 */
function anchorOf(id){
  const n = idx.byId.get(id);
  if (n) return n;
  const g = idx.groups.get(id);
  if (g) return groupBox(g);
  return null;
}
/* 分组是个「自由框」：尺寸自己存着，可以随便拉大拉小；成员靠拖进拖出同步。 */
function groupBox(g){
  return { id:g.id, isGroup:true, group:g, x:g.x, y:g.y, w:g.w, h:g.h };
}
/* 按当前成员算一个刚好装下它们的框（新建分组、以及老档案缺尺寸时用） */
function fitGroupToMembers(g){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of (g.members || [])){
    const n = idx.byId.get(id);
    if (!n) continue;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  }
  if (!isFinite(minX)){
    g.x = +g.x || 0; g.y = +g.y || 0;
    g.w = Math.max(200, +g.w || 0); g.h = Math.max(150, +g.h || 0);
    return g;
  }
  g.x = minX - GROUP_PAD;
  g.y = minY - GROUP_TITLE_H;
  g.w = (maxX - minX) + GROUP_PAD * 2;
  g.h = (maxY - minY) + GROUP_TITLE_H + GROUP_PAD;
  return g;
}
/* 一个点（一般是节点中心）在不在这个框里 */
function pointInGroup(g, x, y){
  return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
}
/* 框只会「长大」：手动拉的尺寸是下限，成员超出就往那个方向扩，成员走了不缩。
   向左/上扩要同时挪原点，否则右下角会跟着漂。 */
function groupGrowToFit(grp){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of (grp.members || [])){
    const n = idx.byId.get(id);
    if (!n) continue;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  }
  if (!isFinite(minX)) return false;                 // 空框：保持你拉的样子
  const needX = minX - GROUP_PAD, needY = minY - GROUP_TITLE_H;
  const needR = maxX + GROUP_PAD, needB = maxY + GROUP_PAD;
  let changed = false;
  if (needX < grp.x){ grp.w += grp.x - needX; grp.x = needX; changed = true; }
  if (needY < grp.y){ grp.h += grp.y - needY; grp.y = needY; changed = true; }
  if (needR > grp.x + grp.w){ grp.w = needR - grp.x; changed = true; }
  if (needB > grp.y + grp.h){ grp.h = needB - grp.y; changed = true; }
  return changed;
}
/* 把每个非空框重新贴合到它的成员（排版这种「全局重排」之后用）。
   空框不动 —— 那是你手动拉的尺寸，没有成员就没有参照。 */
function refitAllGroups(){
  let changed = false;
  for (const grp of (doc.groups || [])){
    if (!grp.members || !grp.members.length) continue;
    fitGroupToMembers(grp);
    changed = true;
  }
  return changed;
}function growAllGroups(){
  let changed = false;
  for (const grp of (doc.groups || [])) if (groupGrowToFit(grp)) changed = true;
  return changed;
}
/* 这个框装得下现在的成员吗（用于夹住手动缩小） */
function groupMinSize(grp){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const id of (grp.members || [])){
    const n = idx.byId.get(id);
    if (!n) continue;
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  }
  if (!isFinite(minX)) return { x:null, y:null, w:0, h:0 };
  return { x:minX - GROUP_PAD, y:minY - GROUP_TITLE_H,
           w:(maxX - minX) + GROUP_PAD * 2, h:(maxY - minY) + GROUP_TITLE_H + GROUP_PAD };
}
/* 分组标题栏的矩形（命中测试和绘制共用） */
function groupTitleBox(g){
  const r = groupBox(g);
  setFont(mctx, FS, 'normal', FONT);
  const tw = Math.min(r.w - 20, mctx.measureText(g.title || '分组').width + 16);
  return { x:r.x + 6, y:r.y + 4, w:Math.max(48, tw), h:GROUP_TITLE_H - 8 };
}
function reachUp(from, target){
  let cur = from, guard = 0;
  while (cur !== undefined && guard++ < 5000){
    if (cur === target) return true;
    cur = idx.parent.get(cur);
  }
  return false;
}
function descendants(id){
  const out = []; const st = [id];
  while (st.length){
    const c = st.pop();
    for (const k of (idx.children.get(c) || [])){ out.push(k); st.push(k); }
  }
  return out;
}
function sizeAll(){ for (const n of doc.nodes) sizeNode(n); }

/* ---------------- 序列化 ---------------- */
function serialize(){
  return {
    v:2, nid,
    nodes: doc.nodes.map(n => ({ id:n.id, text:n.text, x:Math.round(n.x), y:Math.round(n.y), shape:n.shape,
      collapsed:!!n.collapsed, fixedW:n.fixedW || null, fixedH:n.fixedH || null,
      font:n.font || null, fsPx:n.fsPx || null, color:n.color || null, border:n.border || null,
      kind:(n.kind === 'program' ? 'program' : 'node') })),
    edges: doc.edges.map(e => ({
      id:e.id, s:e.s, t:e.t, label:e.label || '',
      arrow:e.arrow, dash:!!e.dash, route:e.route, aSide:e.aSide, bSide:e.bSide,
      waypoints:(e.waypoints && e.waypoints.length)
        ? e.waypoints.map(p => ({ x:Math.round(p.x), y:Math.round(p.y) })) : null
    })),
    groups: (doc.groups || []).map(g => ({
      id:g.id, title:g.title || '', members:g.members.slice(), color:g.color || null,
      x:Math.round(g.x), y:Math.round(g.y), w:Math.round(g.w), h:Math.round(g.h)
    }))
  };
}
function deserialize(d){
  if (!d || !Array.isArray(d.nodes)) throw new Error('bad file');
  doc = { v:2, nodes:[], edges:[], groups:[] };
  nid = d.nid || 1;
  // v1 的文件用 mode 决定走线：mind 是曲线、flow 是正交。
  // 现在没有模式了，就把旧的 mode 一次性翻译成每条线的 route，老存档打开后长相不变。
  const legacyRoute = (d.mode === 'mind') ? 'curve' : 'ortho';
  const seen = new Set();
  for (const n of d.nodes){
    let id = n.id;
    if (!id || seen.has(id)) id = mkId('n', seen); else seen.add(id);
    doc.nodes.push({ id, text:n.text == null ? '' : String(n.text),
      x:+n.x || 0, y:+n.y || 0, w:0, h:0, shape:n.shape || 'rect', collapsed:!!n.collapsed,
      fixedW:(+n.fixedW > 0) ? +n.fixedW : null, fixedH:(+n.fixedH > 0) ? +n.fixedH : null,
      font:NODE_FONTS[n.font] ? n.font : null,
      fsPx:(+n.fsPx > 0) ? +n.fsPx : ((+n.fs > 0) ? +n.fs : null),   // 也认早期写成 fs 的档
      color:n.color || null, border:n.border || null,
      kind:(n.kind === 'program') ? 'program' : 'node' });
  }
  const ok = new Set(doc.nodes.map(n => n.id));
  for (const e of (d.edges || [])){
    if (!ok.has(e.s) || !ok.has(e.t)) continue;
    let id = e.id;
    if (!id || seen.has(id)) id = mkId('e', seen); else seen.add(id);
    doc.edges.push(normalizeEdge({
      id, s:e.s, t:e.t, label:e.label || '',
      arrow:e.arrow, dash:e.dash, route:e.route || legacyRoute, aSide:e.aSide, bSide:e.bSide,
      waypoints:Array.isArray(e.waypoints) ? e.waypoints.map(p => ({ x:+p.x || 0, y:+p.y || 0 })) : null
    }));
  }
  for (const g of (d.groups || [])){
    let id = g.id;
    if (!id || seen.has(id)) id = mkId('g', seen); else seen.add(id);
    doc.groups.push({ id, title:g.title == null ? '' : String(g.title),
      members:(g.members || []).slice(), color:g.color || null });
  }
  sel.clear(); selEdgeId = null; selGroupId = null; editing = null; hideEditor();
  reindex(); sizeAll();
}

