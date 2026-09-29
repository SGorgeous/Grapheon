'use strict';
/* ==========================================================================
   GRAPHEON · core/state.js
   文档模型、id 分配、父子索引、序列化 / 反序列化。
   ========================================================================== */

/* ---------------- 文档模型 ---------------- */
let doc = { v:1, mode:'mind', autoLayout:true, nodes:[], edges:[] };
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
let idx = { children:new Map(), parent:new Map(), byId:new Map() };
let sel = new Set();
let view = { x:0, y:0, z:1 };
let hover = null, hoverPort = null, hoverEdge = null;
let drag = null, marquee = null, linking = null;
let editing = null;
let lastClickNode = null;      // Shift 连线的第一个节点
let dirty = true;
const isRoot = (n) => !idx.parent.has(n.id);
const byId   = (id) => idx.byId.get(id);
const mark   = () => { dirty = true; };

function reindex(){
  idx.children = new Map(); idx.parent = new Map(); idx.byId = new Map();
  for (const n of doc.nodes) { idx.children.set(n.id, []); idx.byId.set(n.id, n); }
  const seen = new Set();
  for (const e of doc.edges){
    if (seen.has(e.id)) continue; seen.add(e.id);
    if (e.s === e.t) continue;
    if (!idx.byId.has(e.s) || !idx.byId.has(e.t)) continue;
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
  // 重建 id 占用表，uid() 靠它保证不与既有 id 冲突
  usedIds = new Set();
  for (const n of doc.nodes) usedIds.add(n.id);
  for (const e of doc.edges) usedIds.add(e.id);
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
    v:1, nid, mode:doc.mode, autoLayout:doc.autoLayout,
    nodes: doc.nodes.map(n => ({ id:n.id, text:n.text, x:Math.round(n.x), y:Math.round(n.y), shape:n.shape, collapsed:!!n.collapsed })),
    edges: doc.edges.map(e => ({ id:e.id, s:e.s, t:e.t, label:e.label || '' }))
  };
}
function deserialize(d){
  if (!d || !Array.isArray(d.nodes)) throw new Error('bad file');
  doc = { v:1, mode:(d.mode === 'flow' ? 'flow' : 'mind'), autoLayout:d.autoLayout !== false, nodes:[], edges:[] };
  nid = d.nid || 1;
  const seen = new Set();
  for (const n of d.nodes){
    let id = n.id;
    if (!id || seen.has(id)) id = mkId('n', seen); else seen.add(id);
    doc.nodes.push({ id, text:n.text == null ? '' : String(n.text),
      x:+n.x || 0, y:+n.y || 0, w:0, h:0, shape:n.shape || 'rect', collapsed:!!n.collapsed });
  }
  const ok = new Set(doc.nodes.map(n => n.id));
  for (const e of (d.edges || [])){
    if (!ok.has(e.s) || !ok.has(e.t)) continue;
    let id = e.id;
    if (!id || seen.has(id)) id = mkId('e', seen); else seen.add(id);
    doc.edges.push({ id, s:e.s, t:e.t, label:e.label || '' });
  }
  sel.clear(); editing = null; hideEditor();
  reindex(); sizeAll();
}

