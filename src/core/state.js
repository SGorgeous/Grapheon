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
  // 钉死在哪个端点上（纯数字 id）。没记就用方向，再没有就自动挑。
  e.aPort = (e.aPort == null || e.aPort === '') ? null : (Math.round(+e.aPort) || null);
  e.bPort = (e.bPort == null || e.bPort === '') ? null : (Math.round(+e.bPort) || null);
  if (e.waypoints && !Array.isArray(e.waypoints)) e.waypoints = null;
  return e;
}
/* 新建连线的默认类型。
   以前这里永远是 EDGE_DEFAULTS —— 设置面板里那个「新建连线的默认类型」
   存了却没人读，等于摆设。现在改成优先问设置。 */
function makeEdge(s, t){
  const d = (typeof newEdgeDefaults === 'function') ? newEdgeDefaults() : EDGE_DEFAULTS;
  return normalizeEdge({ id:uid('e'), s, t, label:'', aSide:null, bSide:null,
    arrow:d.arrow, dash:!!d.dash, route:d.route });
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
let idx = { children:new Map(), parent:new Map(), byId:new Map(), groups:new Map(), hidden:new Set(),
            eff:new Map(), box:new Map() };   // eff = 程序化节点叠出来的派生效果
let sel = new Set();
let selEdgeId = null;          // 选中的连线（与节点选择互斥）
let selGroups = new Set();     // 选中的分组：可以多个，也可以和节点混选
let view = { x:0, y:0, z:1 };
let hover = null, hoverPort = null, hoverEdge = null, hoverGrp = null;
let drag = null, marquee = null, linking = null, relink = null;
let editing = null;
let lastClickNode = null;      // Shift 连线的第一个节点
let dirty = true;
const isRoot = (n) => !idx.parent.has(n.id);
const byId   = (id) => idx.byId.get(id);
const mark   = () => { dirty = true; };

/* =========================================================================
   折叠：算一遍「谁被藏起来了」
   -------------------------------------------------------------------------
   两种折叠：
     · 节点折叠 —— 节点以下的整棵子树藏起来
     · 分组折叠 —— 组内所有后代（节点和分组）藏起来，但分组自己的框还留着
   外加一条「幽灵框抑制」：一个没被折叠的分组，如果它的内容全被藏起来了，
   那它自己也藏起来 —— 否则折叠一个节点会在画布上留下一个空框。
   空分组（本来就没东西）不适用这条，那是你手动画的框，得留着。
   ========================================================================= */
function computeHidden(){
  const compHidden = (typeof computeComponentHidden === 'function') ? computeComponentHidden() : new Set();
  const hidden = new Set();
  // 1) 节点折叠
  for (const n of doc.nodes){
    if (!n.collapsed) continue;
    for (const d of descendants(n.id)) hidden.add(d);
  }
  // 2) 分组折叠：组内全部后代都藏起来（分组自己不算，框要留着给人展开）
  for (const g of (doc.groups || [])){
    if (!g.collapsed) continue;
    for (const id of groupDescendantIds(g.id)) hidden.add(id);
  }
  // 3) 幽灵框抑制：迭代到不动点，套娃时会一层层往外收
  let changed = true;
  while (changed){
    changed = false;
    for (const g of (doc.groups || [])){
      if (g.collapsed || hidden.has(g.id)) continue;
      const kids = groupChildNodes(g).concat(groupChildGroups(g));
      if (!kids.length) continue;                       // 空框保持可见
      if (kids.every(id => hidden.has(id))){ hidden.add(g.id); changed = true; }
    }
  }
  // 4) 「条件隐藏」组件：写的东西不是 0 / false / 空 就藏起来（可以引用变量）
  for (const id of compHidden) hidden.add(id);
  return hidden;
}
function reindex(){
  idx.children = new Map(); idx.parent = new Map(); idx.byId = new Map(); idx.groups = new Map();
  for (const n of doc.nodes) { idx.children.set(n.id, []); idx.byId.set(n.id, n); }
  // 自由框：成员允许为空（就是个空盒子，等着往里拖东西），所以只清理「已不在文档里」的成员
  if (!Array.isArray(doc.groups)) doc.groups = [];
  for (const g of doc.groups) idx.groups.set(g.id, g);
  // 成员可以是节点，也可以是另一个分组（套娃）。先去掉失效成员和自引用。
  for (const g of doc.groups){
    g.members = (g.members || []).filter(id =>
      id !== g.id && (idx.byId.has(id) || idx.groups.has(id)));
  }
  // 断环：按 doc.groups 的顺序逐条接受「父分组 → 子分组」的关系，会成环的那条直接丢掉。
  // 贪心 + 固定顺序 = 结果确定；否则按遍历顺序不同会砍错边（把好的砍了、留下成环的那条）。
  const accepted = new Map();
  for (const g of doc.groups) accepted.set(g.id, []);
  const reachesAccepted = (from, target, seen) => {
    if (from === target) return true;
    seen = seen || new Set();
    if (seen.has(from)) return false;
    seen.add(from);
    for (const c of (accepted.get(from) || [])) if (reachesAccepted(c, target, seen)) return true;
    return false;
  };
  for (const g of doc.groups){
    g.members = g.members.filter(id => {
      if (!idx.groups.has(id)) return true;              // 节点成员原样保留
      if (reachesAccepted(id, g.id)) return false;       // 这条会成环，丢掉
      accepted.get(g.id).push(id);
      return true;
    });
  }
  idx.groupOrder = groupOrderByDepth();          // 绘制按这个顺序（祖先在前），命中反过来
  for (const g of doc.groups){
    if (!(+g.w > 0) || !(+g.h > 0)) fitGroupToMembers(g);   // 老档案没尺寸就按成员补一个
    else groupGrowToFit(g);                                 // 维持不变量：框永远装得下成员
  }
  const seen = new Set();
  for (const e of doc.edges){
    if (seen.has(e.id)) continue; seen.add(e.id);
    if (e.s === e.t) continue;
    if (!idx.byId.has(e.s) || !idx.byId.has(e.t)) continue;   // 端点可以是分组，那就不进树
    if (isEmbed(idx.byId.get(e.s)) || isEmbed(idx.byId.get(e.t))) continue;   // 封闭节点不进树
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
  // 折叠：算一遍这个文档里所有「被藏起来」的东西（节点和分组都可能被藏）
  idx.hidden = computeHidden();
  // 选中集里不该留着看不见的东西
  for (const id of [...sel]) if (idx.hidden.has(id)) sel.delete(id);
  if (selEdgeId){
    const e = doc.edges.find(x => x.id === selEdgeId);
    if (e && (idx.hidden.has(e.s) || idx.hidden.has(e.t))) selEdgeId = null;
  }
  for (const id of [...selGroups]) if (!idx.groups.has(id) || idx.hidden.has(id)) selGroups.delete(id);
  // 重建 id 占用表，uid() 靠它保证不与既有 id 冲突
  usedIds = new Set();
  for (const n of doc.nodes) usedIds.add(n.id);
  for (const e of doc.edges) usedIds.add(e.id);
  for (const g of doc.groups) usedIds.add(g.id);
  refreshEffects();          // 程序节点的算符是派生的，索引建好后立刻算一遍
}
const isHidden = (id) => idx.hidden.has(id);
/* 嵌入节点：封闭的，谁也不许连它 */
const isEmbed = (n) => !!n && n.kind === 'embed';
/* 这条线还能用吗。嵌入节点的两端都不接受连线，历史存档里万一有就直接作废。 */
function edgeUsable(e){
  const a = idx.byId.get(e.s), b = idx.byId.get(e.t);
  if (!a || !b) return true;                 // 分组端点不在这张表里，一律放行
  return !isEmbed(a) && !isEmbed(b);
}
/* 这条线整体可见吗（两端都没被折叠藏起来） */
const edgeVisible = (e) => edgeUsable(e) && !idx.hidden.has(e.s) && !idx.hidden.has(e.t);
const byGroup = (id) => idx.groups.get(id);
/* 端点可以是节点、也可以是分组。统一按「有 id/x/y/w/h 的东西」对待，路由就不用分情况了。 */
function anchorOf(id){
  const n = idx.byId.get(id);
  if (n) return nodeBox(n);
  const g = idx.groups.get(id);
  if (g) return groupBox(g);
  return null;
}
/* 分组是个「自由框」：尺寸自己存着，可以随便拉大拉小；成员靠拖进拖出同步。
   members 里可以放节点 id，也可以放别的分组 id（套娃）。 */
function groupBox(g){
  return { id:g.id, isGroup:true, group:g, x:g.x, y:g.y, w:g.w, h:g.h };
}
/* A 是不是 B 的后代（顺带用来断环） */
function groupReaches(from, target, seen){
  if (from === target) return true;
  seen = seen || new Set();
  if (seen.has(from)) return false;
  seen.add(from);
  const g = idx.groups.get(from);
  if (!g) return false;
  for (const m of (g.members || [])) if (idx.groups.has(m) && groupReaches(m, target, seen)) return true;
  return false;
}
/* 一个分组里所有的后代分组 id */
function groupDescendantGroups(id, out, seen){
  out = out || []; seen = seen || new Set();
  const g = idx.groups.get(id);
  if (!g || seen.has(id)) return out;
  seen.add(id);
  for (const m of (g.members || [])){
    if (!idx.groups.has(m)) continue;
    out.push(m);
    groupDescendantGroups(m, out, seen);
  }
  return out;
}
/* 一个分组里所有后代（节点 + 分组）的 id，分组折叠时用 */
function groupDescendantIds(id, out, seen){
  out = out || []; seen = seen || new Set();
  const g = idx.groups.get(id);
  if (!g || seen.has(id)) return out;
  seen.add(id);
  for (const m of (g.members || [])){
    if (idx.groups.has(m)){ out.push(m); groupDescendantIds(m, out, seen); }
    else if (idx.byId.has(m)) out.push(m);
  }
  return out;
}
/* 一个分组里所有的后代节点 id（套娃会一直往里挖，带环保护） */
function groupAllNodes(id, out, seen){
  out = out || []; seen = seen || new Set();
  if (seen.has(id)) return out;
  seen.add(id);
  const g = idx.groups.get(id);
  if (!g){ if (idx.byId.has(id)) out.push(id); return out; }
  for (const m of (g.members || [])) groupAllNodes(m, out, seen);
  return out;
}
const groupChildNodes  = (g) => (g.members || []).filter(id => idx.byId.has(id));
const groupChildGroups = (g) => (g.members || []).filter(id => idx.groups.has(id));
/* 嵌了几层（根分组是 0）。绘制按它升序、命中按它降序。 */
function groupDepth(id, seen){
  seen = seen || new Set();
  if (seen.has(id)) return 0;
  seen.add(id);
  let best = 0;
  for (const g of (doc.groups || [])){
    if ((g.members || []).indexOf(id) < 0) continue;
    best = Math.max(best, 1 + groupDepth(g.id, seen));
  }
  return best;
}
function groupOrderByDepth(){
  return (doc.groups || []).slice().sort((a, b) => groupDepth(a.id) - groupDepth(b.id));
}
/* 分组的「成员外接范围」：直接成员里的节点 + 子分组的框（子分组的框本来就装着它的成员） */
function groupMemberBounds(grp){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const seen = new Set([grp.id]);
  const walk = (g) => {
    for (const m of (g.members || [])){
      const g2 = idx.groups.get(m);
      if (g2){
        if (seen.has(g2.id)) continue;
        seen.add(g2.id);
        minX = Math.min(minX, g2.x); minY = Math.min(minY, g2.y);
        maxX = Math.max(maxX, g2.x + g2.w); maxY = Math.max(maxY, g2.y + g2.h);
        walk(g2);
        continue;
      }
      const n = idx.byId.get(m);
      if (!n) continue;
      const b = nodeBox(n);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }
  };
  walk(grp);
  return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
/* 按当前成员算一个刚好装下它们的框（新建分组、以及老档案缺尺寸时用） */
function fitGroupToMembers(g){
  const r = groupMemberBounds(g);
  if (!r){
    g.x = +g.x || 0; g.y = +g.y || 0;
    g.w = Math.max(200, +g.w || 0); g.h = Math.max(150, +g.h || 0);
    return g;
  }
  g.x = r.minX - GROUP_PAD;
  g.y = r.minY - GROUP_TITLE_H;
  g.w = (r.maxX - r.minX) + GROUP_PAD * 2;
  g.h = (r.maxY - r.minY) + GROUP_TITLE_H + GROUP_PAD;
  return g;
}
/* 一个点（一般是节点中心）在不在这个框里 */
function pointInGroup(g, x, y){
  return x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
}
/* 框只会「长大」：手动拉的尺寸是下限，成员超出就往那个方向扩，成员走了不缩。
   向左/上扩要同时挪原点，否则右下角会跟着漂。 */
function groupGrowToFit(grp){
  const r = groupMemberBounds(grp);
  if (!r) return false;                              // 空框：保持你拉的样子
  const needX = r.minX - GROUP_PAD, needY = r.minY - GROUP_TITLE_H;
  const needR = r.maxX + GROUP_PAD, needB = r.maxY + GROUP_PAD;
  let changed = false;
  if (needX < grp.x){ grp.w += grp.x - needX; grp.x = needX; changed = true; }
  if (needY < grp.y){ grp.h += grp.y - needY; grp.y = needY; changed = true; }
  if (needR > grp.x + grp.w){ grp.w = needR - grp.x; changed = true; }
  if (needB > grp.y + grp.h){ grp.h = needB - grp.y; changed = true; }
  return changed;
}
/* 把每个非空框重新贴合到它的成员（排版这种「全局重排」之后用）。
   空框不动 —— 那是你手动拉的尺寸，没有成员就没有参照。
   从最外层往里做，父框才会把子框的新位置算进去。 */
function refitAllGroups(){
  let changed = false;
  for (const grp of groupOrderByDepth()){
    if (!grp.members || !grp.members.length) continue;
    fitGroupToMembers(grp);
    changed = true;
  }
  return changed;
}
function growAllGroups(){
  let changed = false;
  for (const grp of groupOrderByDepth()) if (groupGrowToFit(grp)) changed = true;
  return changed;
}
/* 这个框装得下现在的成员吗（用于夹住手动缩小） */
function groupMinSize(grp){
  const r = groupMemberBounds(grp);
  if (!r) return { x:null, y:null, w:0, h:0 };
  return { x:r.minX - GROUP_PAD, y:r.minY - GROUP_TITLE_H,
           w:(r.maxX - r.minX) + GROUP_PAD * 2, h:(r.maxY - r.minY) + GROUP_TITLE_H + GROUP_PAD };
}
/* 搬动一个分组：它自己和它里面所有东西（子分组递归）一起走。
   先拍快照再套位移，这样拖动过程中反复算也不会越拖越偏。 */
function groupSnapshot(grp){
  const out = [{ kind:'group', id:grp.id, x:grp.x, y:grp.y }];
  const seen = new Set([grp.id]);
  const walk = (g) => {
    for (const m of (g.members || [])){
      const g2 = idx.groups.get(m);
      if (g2){
        if (seen.has(g2.id)) continue;
        seen.add(g2.id);
        out.push({ kind:'group', id:g2.id, x:g2.x, y:g2.y });
        walk(g2);
        continue;
      }
      const n = idx.byId.get(m);
      if (n) out.push({ kind:'node', id:n.id, x:n.x, y:n.y });
    }
  };
  walk(grp);
  return out;
}
function applyGroupDelta(snap, dx, dy){
  for (const s of snap){
    if (s.kind === 'group'){ const g = idx.groups.get(s.id); if (g){ g.x = s.x + dx; g.y = s.y + dy; } }
    else { const n = idx.byId.get(s.id); if (n){ n.x = s.x + dx; n.y = s.y + dy; } }
  }
}
/* 包含这个点的最内层分组。exclude 用来防止把分组塞进自己或自己的后代里。 */
function innermostGroupAt(x, y, exclude){
  let best = null, bestDepth = -1;
  for (const grp of (doc.groups || [])){
    if (exclude && exclude.has(grp.id)) continue;
    if (!pointInGroup(grp, x, y)) continue;
    const d = groupDepth(grp.id);
    if (d > bestDepth){ bestDepth = d; best = grp; }
  }
  return best;
}

/* =========================================================================
   程序化节点
   -------------------------------------------------------------------------
   程序节点通过「从它出发、指向目标的那条线」把自己的算符叠到目标上。
   同一个目标被多条这样的线指到时，按边在 doc.edges 里的先后顺序依次叠加。

   最要紧的一条约束：效果全是**派生**的 —— 只写进 idx.eff / nodeBox，
   绝不写回节点本身。否则撤销栈会被污染，而且把程序节点删掉之后目标回不去。
   ========================================================================= */
function normalizeProgram(p){
  const out = Object.assign({}, PROGRAM_DEFAULT, p || {});
  if (PROGRAM_OPS.indexOf(out.op) < 0) out.op = 'style';
  const keys = PROGRAM_KEYS[out.op].map(k => k[0]);
  if (keys.indexOf(out.key) < 0) out.key = keys[0];
  if (PROGRAM_MODES.indexOf(out.mode) < 0) out.mode = 'add';
  // ★ 数值也可以是能引用变量的表达式（{倍数} 之类），那种要原样留着，
  //   不能被下面的 Math.round(+value) 吃掉。真正的解析在 applyEdge 里做，
  //   因为那里才知道这个程序节点是谁、作用域该锚在哪。
  const isExpr = (typeof out.value === 'string' && out.value.indexOf('{') >= 0);
  if (isExpr) return out;
  if (out.op === 'style' && out.key === 'font'){
    if (!NODE_FONTS[out.value]) out.value = 'auto';
  } else if (out.op === 'style' && (out.key === 'color' || out.key === 'border')){
    out.value = out.value || null;
  } else if (out.op === 'shape'){
    if (SHAPES.indexOf(out.value) < 0) out.value = 'rect';
  } else {
    out.value = Math.round(+out.value || 0);
  }
  return out;
}
/* 把程序节点的数值解析成真正要用的值。
   可引用的走插值，作用域锚在这个程序节点自己身上 ——
   和「这个节点正文里直接写 {名字}」是同一套规则。
   能解析成数字就用数字，否则保留字符串（形状 / 字体那些本来就吃字符串）。 */
function resolveProgramValue(src, p){
  if (typeof p.value !== 'string' || p.value.indexOf('{') < 0) return p.value;
  const t = interpolateIn(liveCtx(), p.value, src.id);
  const s = String(t).trim();
  const n = Number(s);
  if (s !== '' && !isNaN(n)) return n;
  // 字符串类的算符（形状 / 字体 / 颜色）原样返回；
  // 数值类的必须退回 0 —— 漏一个 NaN 进去，后面 Math.max(8, NaN) 会一路烂掉。
  const strOp = (p.op === 'shape') || (p.op === 'style' && (p.key === 'font' || p.key === 'color' || p.key === 'border'));
  return strOp ? t : 0;
}
function blankEff(){
  return { dx:0, dy:0, shape:null, color:null, border:null,
           font:null, fsPx:null, value:null, ops:0 };
}
/* 把一条边的算符施加到这一遍的目标上 */
function applyEdge(e, bonus, eff){
  const src = idx.byId.get(e.s);
  if (!src || src.kind !== 'program') return false;
  // 目标可以是节点，也可以是分组 —— 分组的话作用到组内全部节点（套娃会一路挖下去）
  const tgtNode = idx.byId.get(e.t);
  const tgtGrp  = idx.groups.get(e.t);
  const targets = tgtNode ? [tgtNode]
                : (tgtGrp ? groupAllNodes(tgtGrp.id).map(id => idx.byId.get(id)).filter(Boolean) : []);
  if (!targets.length) return false;
  const p = normalizeProgram(src.program);
  // 数值可以是表达式（{倍数}），在这儿解析 —— 此时才知道锚点是这个程序节点
  p.value = resolveProgramValue(src, p);
  // 程序节点之间可以链式累加：别的程序节点用「数值」算符改它的操作数
  if (bonus && bonus.has(src.id) && p.op === 'value') p.value = p.value + bonus.get(src.id);
  for (const tgt of targets){
    let x = eff.get(tgt.id);
    if (!x){ x = blankEff(); eff.set(tgt.id, x); }
    applyProgram(x, p, tgt);
    x.ops++;
  }
  return true;
}
/* 从零算一遍所有节点上的程序效果（reindex 末尾调用）。
   程序节点之间可以互相叠加（依次累加），所以迭代到不动点为止；
   遇到环最多跑 EFFECT_MAX_PASS 遍就停，不会死循环。 */
const EFFECT_MAX_PASS = 6;
function refreshEffects(){
  idx.eff = new Map();
  let bonus = new Map();
  for (let pass = 0; pass < EFFECT_MAX_PASS; pass++){
    const eff = new Map();
    for (const e of doc.edges) applyEdge(e, bonus, eff);
    // 统计每个程序节点被叠了多少操作数，供下一遍使用
    const next = new Map();
    for (const [id, x] of eff){
      const n = idx.byId.get(id);
      if (n && n.kind === 'program' && x.value != null) next.set(id, x.value);
    }
    idx.eff = eff;
    let same = next.size === bonus.size;
    if (same) for (const [k, v] of next) if (bonus.get(k) !== v){ same = false; break; }
    bonus = next;
    if (same) break;
  }
  refreshVarText();          // 文本里的 {变量} 也要算一遍（和算符一样是派生的）
  // 失效的缓存扔掉
  if (!idx.box) idx.box = new Map();
  for (const id of [...idx.box.keys()]) if (!idx.byId.has(id)) idx.box.delete(id);
}
function applyProgram(eff, p, tgt){
  if (p.op === 'move'){
    if (p.key === 'y') eff.dy += p.value; else eff.dx += p.value;
    return;
  }
  if (p.op === 'shape'){ eff.shape = p.value; return; }
  if (p.op === 'value'){
    const cur = (eff.value == null) ? (Math.round(+tgt.value) || 0) : eff.value;
    eff.value = (p.mode === 'add') ? cur + p.value : p.value;
    return;
  }
  // style
  if (p.key === 'fsPx'){
    const base = (eff.fsPx != null) ? eff.fsPx
               : ((+tgt.fsPx > 0) ? +tgt.fsPx : (tgt.big ? FS_BIG : FS));
    eff.fsPx = Math.max(8, (p.mode === 'add') ? base + p.value : p.value);
  } else if (p.key === 'font'){
    eff.font = NODE_FONTS[p.value] ? p.value : null;
  } else {
    eff[p.key] = p.value || null;
  }
}
/* ---- 读有效值。全部是查表，不改任何数据 ---- */
const effOf     = (n) => (n && idx.eff) ? (idx.eff.get(n.id) || null) : null;
const effColor  = (n) => { const e = effOf(n); return (e && e.color)  ? e.color  : n.color; };
const effBorder = (n) => { const e = effOf(n); return (e && e.border) ? e.border : n.border; };
const effFont   = (n) => { const e = effOf(n); return (e && e.font)   ? e.font   : n.font; };
const effFsPx   = (n) => { const e = effOf(n); return (e && e.fsPx)   ? e.fsPx   : n.fsPx; };
const effShape  = (n) => { const e = effOf(n); return (e && e.shape)  ? e.shape  : n.shape; };
const effValue  = (n) => { const e = effOf(n); return (e && e.value != null) ? e.value : (Math.round(+n.value) || 0); };
const isProgram = (n) => !!n && n.kind === 'program';

/* 节点的「有效盒子」：位置带上程序算符的位移，形状带上程序算符的形状。
   盒子按 id 缓存并原地更新，所以渲染里反复调用也不会一直分配对象。 */
function nodeBox(n){
  if (!idx.box) idx.box = new Map();
  let b = idx.box.get(n.id);
  if (!b){
    b = { id:n.id, isNode:true, node:n, x:0, y:0, w:0, h:0, shape:'rect' };
    idx.box.set(n.id, b);
  }
  const e = idx.eff ? idx.eff.get(n.id) : null;
  b.x = n.x + (e ? e.dx : 0);
  b.y = n.y + (e ? e.dy : 0);
  b.w = n.w;
  b.h = n.h;
  b.shape = (e && e.shape) ? e.shape : (n.shape || 'rect');
  return b;
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
  // 自定义组件和用户主题的定义跟着文档走 —— 把这个 .json 发给别人，
  // 他那边没有你的组件库/主题库也能正常显示。
  const extra = {};
  if (typeof userComponentDefs === 'function'){
    const defs = userComponentDefs();
    if (defs.length) extra.componentDefs = defs;
  }
  if (typeof userThemes === 'function'){
    const ts = userThemes();
    const ids = Object.keys(ts);
    if (ids.length) extra.themes = ids.map(id => Object.assign({ id }, ts[id]));
  }
  return Object.assign(extra, {
    v:2, nid,
    nodes: doc.nodes.map(n => ({ id:n.id, text:n.text, x:Math.round(n.x), y:Math.round(n.y), shape:n.shape,
      collapsed:!!n.collapsed, fixedW:n.fixedW || null, fixedH:n.fixedH || null,
      font:n.font || null, fsPx:n.fsPx || null, color:n.color || null, border:n.border || null,
      kind:(NODE_KINDS.indexOf(n.kind) >= 0 ? n.kind : 'node'),
      value:(Math.round(+n.value) || 0),
      program:(n.kind === 'program') ? normalizeProgram(n.program) : null,
      image:(n.kind === 'image' && typeof n.image === 'string' && /^data:image\//.test(n.image)) ? n.image : null,
      imgW:(+n.imgW) || 0, imgH:(+n.imgH) || 0,
      desc:(n.desc == null ? '' : String(n.desc)),
      varDef:(n.kind === 'var') ? normalizeVarDef(n.varDef) : null,
      opDef:(n.kind === 'op') ? normalizeOpDef(n.opDef) : null,
      outDef:(n.kind === 'out') ? normalizeOutDef(n.outDef) : null,
      tableDef:(n.kind === 'table') ? normalizeTableDef(n.tableDef) : null,
      ports:normalizePorts(n.ports),
      priority:(n.priority == null || n.priority === '') ? null : n.priority,
      components:normalizeComponents(n.components),
      embed:(n.kind === 'embed' && n.embed && n.embed.doc && Array.isArray(n.embed.doc.nodes))
        ? { doc:n.embed.doc } : null })),
    edges: doc.edges.map(e => ({
      id:e.id, s:e.s, t:e.t, label:e.label || '',
      arrow:e.arrow, dash:!!e.dash, route:e.route, aSide:e.aSide, bSide:e.bSide,
      aPort:e.aPort, bPort:e.bPort,
      components:normalizeComponents(e.components),
      waypoints:(e.waypoints && e.waypoints.length)
        ? e.waypoints.map(p => ({ x:Math.round(p.x), y:Math.round(p.y) })) : null
    })),
    groups: (doc.groups || []).map(g => ({
      id:g.id, title:g.title || '', members:g.members.slice(), color:g.color || null,
      collapsed:!!g.collapsed, isFunction:!!g.isFunction,
      components:normalizeComponents(g.components),
      x:Math.round(g.x), y:Math.round(g.y), w:Math.round(g.w), h:Math.round(g.h)
    }))
  });
}
function deserialize(d){
  if (!d || !Array.isArray(d.nodes)) throw new Error('bad file');
  // 文档可以自带自定义组件和主题的定义 —— 必须**先**并进注册表，
  // 否则下面 normalizeComponents 会因为「认不出这个类型」把它们丢掉。
  if (typeof adoptDocComponents === 'function') adoptDocComponents(d.componentDefs);
  if (typeof adoptDocThemes === 'function') adoptDocThemes(d.themes);
  doc = { v:2, nodes:[], edges:[], groups:[], componentDefs:d.componentDefs || null, themes:d.themes || null };
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
      kind:NODE_KINDS.indexOf(n.kind) >= 0 ? n.kind : 'node',
      value:(Math.round(+n.value) || 0), program:normalizeProgram(n.program),
      image:(typeof n.image === 'string' && /^data:image\//.test(n.image)) ? n.image : null,
      imgW:(+n.imgW) || 0, imgH:(+n.imgH) || 0,
      desc:(n.desc == null ? '' : String(n.desc)),
      varDef:(n.kind === 'var') ? normalizeVarDef(n.varDef) : null,
      opDef:(n.kind === 'op') ? normalizeOpDef(n.opDef) : null,
      outDef:(n.kind === 'out') ? normalizeOutDef(n.outDef) : null,
      tableDef:(n.kind === 'table') ? normalizeTableDef(n.tableDef) : null,
      ports:normalizePorts(n.ports),
      priority:(n.priority == null || n.priority === '') ? null : n.priority,
      components:normalizeComponents(n.components),
      embed:(n.kind === 'embed' && n.embed && n.embed.doc && Array.isArray(n.embed.doc.nodes))
        ? { doc:n.embed.doc } : null });
  }
  // 分组要先读：连线的端点可以是分组，`ok` 里必须已经有分组 id，
  // 否则「节点 → 分组」的连线会在存读往返时被静默丢掉。
  const grpIds = new Set();
  for (const g of (d.groups || [])){
    let id = g.id;
    if (!id || seen.has(id)) id = mkId('g', seen); else seen.add(id);
    grpIds.add(id);
    doc.groups.push({ id, title:g.title == null ? '' : String(g.title),
      members:(g.members || []).slice(), color:g.color || null,
      x:+g.x || 0, y:+g.y || 0, w:+g.w || 0, h:+g.h || 0,
      collapsed:!!g.collapsed, isFunction:!!g.isFunction,
      components:normalizeComponents(g.components) });
  }
  const ok = new Set(doc.nodes.map(n => n.id));
  for (const id of grpIds) ok.add(id);
  for (const e of (d.edges || [])){
    if (!ok.has(e.s) || !ok.has(e.t)) continue;
    let id = e.id;
    if (!id || seen.has(id)) id = mkId('e', seen); else seen.add(id);
    const sa = doc.nodes.find(x => x.id === e.s), sb = doc.nodes.find(x => x.id === e.t);
    if (isEmbed(sa) || isEmbed(sb)) continue;      // 嵌入节点是封闭的，历史存档里的边作废
    doc.edges.push(normalizeEdge({
      id, s:e.s, t:e.t, label:e.label || '',
      arrow:e.arrow, dash:e.dash, route:e.route || legacyRoute, aSide:e.aSide, bSide:e.bSide,
      aPort:e.aPort, bPort:e.bPort,
      components:normalizeComponents(e.components),
      waypoints:Array.isArray(e.waypoints) ? e.waypoints.map(p => ({ x:+p.x || 0, y:+p.y || 0 })) : null
    }));
  }
  sel.clear(); selEdgeId = null; selGroups.clear(); editing = null; hideEditor();
  reindex(); sizeAll();
}

