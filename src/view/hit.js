'use strict';
/* ==========================================================================
   GRAPHEON · view/hit.js
   命中测试：节点 / 连接端口 / 连线 / 连线端点手柄 / 拐点手柄 / 缩放柄 / 折叠标记。
   所有测试都要跳过被折叠藏起来的节点。
   ========================================================================== */

/* =========================================================================
   命中测试
   ========================================================================= */
/* 形状命中：菱形按 |dx|/半宽 + |dy|/半高 <= 1 判定，其余按矩形 */
function inBox(b, p){
  if ((b.shape || 'rect') === 'diamond'){
    const dx = Math.abs(p.x - (b.x + b.w / 2)) / (b.w / 2);
    const dy = Math.abs(p.y - (b.y + b.h / 2)) / (b.h / 2);
    return dx + dy <= 1;
  }
  return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
}
function hitNode(p){
  for (let i = doc.nodes.length - 1; i >= 0; i--){
    const n = doc.nodes[i];
    if (isHidden(n.id)) continue;
    if (inBox(nodeBox(n), p)) return n;   // 用有效盒子：程序化节点可能挪过位置 / 改过形状
  }
  return null;
}
/* 变量节点分四块：描述 / 变量名框 / 变量值框 / 作用域行
   运算节点分三块：描述 / 算符框 / 运算值框 */
const inRect = (b, p) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function hitVarPart(n, p){
  if (!n || n.kind !== 'var') return null;
  const L = varBoxes(n);
  if (inRect(L.nameBox, p)) return 'varName';
  if (inRect(L.valBox, p)) return 'varValue';
  if (inRect(L.scopeBox, p)) return 'varScope';
  return 'text';
}
/* 变量节点上的三个控件命中。返回 null 或 { kind, index }。
   和 hitVarPart 分开：那一套返回字符串，已经被断言钉住了，不动它。 */
function hitVarControl(n, p){
  if (!n || n.kind !== 'var') return null;
  const v = normalizeVarDef(n.varDef);
  if (v.control === 'plain') return null;
  const L = varBoxes(n);
  if (v.control === 'check'){
    if (!L.listBox || !inRect(L.listBox, p)) return null;
    const i = Math.floor((p.y - L.listBox.y) / CHECK_ROW_H);
    if (i < 0 || i >= Math.max(1, v.options.length)) return null;
    return { kind:'check', index:i };
  }
  if (v.control === 'slider') return (L.trackBox && inRect(L.trackBox, p)) ? { kind:'slider' } : null;
  if (v.control === 'switch') return (L.knobBox && inRect(L.knobBox, p)) ? { kind:'switch' } : null;
  return null;
}
function hitOpPart(n, p){
  if (!n || n.kind !== 'op') return null;
  const L = opBoxes(n);
  if (inRect(L.opBox, p)) return 'opOp';
  for (let i = 0; i < L.valBoxes.length; i++) if (inRect(L.valBoxes[i], p)) return 'opVal' + i;
  return 'text';
}
function hitOutPart(n, p){
  if (!n || n.kind !== 'out') return null;
  return inRect(outBoxes(n).nameBox, p) ? 'outName' : 'text';
}
/* 图片节点分三块：右上角名称带 / 图片本体 / 下面的描述。
   双击哪块就编辑哪块 —— 名称和描述是两个独立的文本字段。 */
function hitImagePart(n, p){
  if (!n || n.kind !== 'image') return null;
  const b = nodeBox(n);
  if (p.y < b.y + IMG_NAME_H) return 'name';
  if (n.lines && n.lines.length){
    const dy = b.y + IMG_NAME_H + (n.imgDrawH || 0);
    if (p.y >= dy) return 'desc';
  }
  return 'image';
}
/* 选中对象的连接端口：选中的是节点就用节点，是分组就用分组框 */
function hitPort(p){
  let box = null, id = null;
  if (sel.size === 1){
    const n = byId([...sel][0]);
    if (n && !isHidden(n.id) && !isEmbed(n)){ box = n; id = n.id; }   // 封闭节点不给端点
  } else {
    const grp = soleGroup();          // 整个选择就是一个分组时才给端点
    if (grp){ box = groupBox(grp); id = grp.id; }
  }
  if (!box) return null;
  const P = anchorsFor(box);
  for (const k of ['r', 'l', 't', 'b']){
    const a = P[k];
    if (Math.abs(p.x - a.x) <= 9 && Math.abs(p.y - a.y) <= 9) return { node:id, side:k };
  }
  return null;
}
/* ---------------- 分组 ---------------- */
/* 标题栏（永远可以抓，用来选中/改名） */
function hitGroupTitle(p){
  // 从最内层往外判：套娃时里面那个先接住点击
  const list = (idx.groupOrder || doc.groups || []).slice().reverse();
  for (let i = 0; i < list.length; i++){
    if (isHidden(list[i].id)) continue;
    const b = groupTitleBox(list[i]);
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return list[i];
  }
  return null;
}
/* 只有边框那一条能抓 —— 框内部要留给成员节点，不然点不到它们 */
/* 点落在哪个分组的**范围**里（从最内层往外找），返回分组对象。
   和 hitGroupArea 的区别：那个返回的是「框」，而且调用方只关心几何；
   这个返回分组本身，套娃时里面那个先接住。 */
function groupAtPoint(p){
  const list = (idx.groupOrder || doc.groups || []).slice().reverse();
  for (const g of list){
    if (isHidden(g.id)) continue;
    const r = groupBox(g);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return g;
  }
  return null;
}
/* 双击 / 三击时，这个点算在哪个分组上。
   标题栏、外框边、**以及框内部**都算 ——
   只认标题和边的话，用户点在框里就会掉进「新建节点」，那正是之前的 bug。
   例外：**空框**（里面一个节点都没有）让给「新建节点」——
   那种情况下「全选组内节点」等于什么都没选，还是建个节点实在。 */
function groupGestureTarget(p, forNewNode){
  const t = hitGroupTitle(p);
  if (t) return t;
  const b = hitGroupBorder(p);
  if (b) return b;
  // ⚠ 框内部：**打在成员身上的不算「点在分组上」**。
  //   少了这一步，双击组内的节点会被当成双击分组、dblclick 直接早退，
  //   节点就永远编辑不了 —— 这是实打实踩过的坑。
  if (hitNode(p) || hitEdge(p) || hitWaypoint(p)) return null;
  const g = groupAtPoint(p);
  if (!g) return null;
  if (forNewNode && !groupAllNodes(g.id).length) return null;
  return g;
}
function hitGroupBorder(p){
  const list = (idx.groupOrder || doc.groups || []).slice().reverse();
  const tol = Math.max(10, 10 / view.z);
  for (let i = 0; i < list.length; i++){
    if (isHidden(list[i].id)) continue;
    const grp = list[i], r = groupBox(grp);
    if (p.x < r.x - tol || p.x > r.x + r.w + tol || p.y < r.y - tol || p.y > r.y + r.h + tol) continue;
    const inner = p.x > r.x + tol && p.x < r.x + r.w - tol &&
                  p.y > r.y + tol && p.y < r.y + r.h - tol;
    if (!inner) return grp;
  }
  return null;
}
function hitGroup(p){ return hitGroupTitle(p) || hitGroupBorder(p); }
/* 落点用：整个框内部都算这个分组（连线可以连到「一组节点」上） */
function hitGroupArea(p){
  const list = (idx.groupOrder || doc.groups || []).slice().reverse();
  for (let i = 0; i < list.length; i++){
    if (isHidden(list[i].id)) continue;
    const r = groupBox(list[i]);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
  }
  return null;
}
/* 拖线时的落点：优先具体节点，其次它所在的分组框 */
function linkTargetAt(p){
  const n = hitNode(p);
  if (n && isEmbed(n)) return null;         // 封闭节点不当落点
  return n || hitGroupArea(p);
}
function hitEdge(p){
  const tol = 9 / view.z;
  let best = null, bd = 1e9;
  for (const e of doc.edges){
    if (!edgeVisible(e)) continue;
    const d = distToGeom(edgeGeomFor(e), p);
    if (d < tol && d < bd){ bd = d; best = e; }
  }
  return best;
}
/* 选中连线两端的拖拽手柄。必须优先于 hitNode —— 手柄正好压在节点边框上。 */
function hitEdgeHandle(p){
  if (!selEdgeId) return null;
  const e = selectedEdge();
  if (!e) return null;
  const ep = edgeEndpoints(e);
  if (!ep) return null;
  const tol = Math.max(12, 12 / view.z);      // 缩小后手柄也跟着变小，给个屏幕像素下限
  if (Math.hypot(p.x - ep.a.x, p.y - ep.a.y) <= tol) return { edge:e, end:'s' };
  if (Math.hypot(p.x - ep.b.x, p.y - ep.b.y) <= tol) return { edge:e, end:'t' };
  return null;
}
/* 拐点手柄 */
function hitWaypoint(p){
  const e = selectedEdge();
  if (!e || !e.waypoints) return null;
  const tol = Math.max(WAYPOINT_SZ / 2 + 3, (WAYPOINT_SZ / 2 + 3) / view.z);
  for (let i = e.waypoints.length - 1; i >= 0; i--){
    const w = e.waypoints[i];
    if (Math.hypot(p.x - w.x, p.y - w.y) <= tol) return { edgeId:e.id, index:i };
  }
  return null;
}
/* 选中对象的缩放柄：节点和分组共用同一个手柄（返回的都是「有 id/x/y/w/h 的盒子」） */
function hitResizeHandle(p){
  let box = null;
  const n = soleSel();
  if (n && !isHidden(n.id)) box = nodeBox(n);
  else { const grp = soleGroup(); if (grp) box = groupBox(grp); }
  if (!box) return null;
  const r = resizeHandleRect(box);
  const pad = 4 / view.z;
  if (p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad) return box;
  return null;
}
/* 折叠标记（同时也是展开按钮）。节点和分组的角标都在这儿判。 */
function hitCollapseBadge(p){
  // 先把分组判一遍（它们画在上面）
  for (const grp of (idx.groupOrder || doc.groups || []).slice().reverse()){
    if (isHidden(grp.id)) continue;
    if (!grp.collapsed && hoverGrp !== grp) continue;
    const bb = groupBadgeRect(grp);
    if (p.x >= bb.x && p.x <= bb.x + bb.w && p.y >= bb.y && p.y <= bb.y + bb.h) return grp;
  }
  for (let i = doc.nodes.length - 1; i >= 0; i--){
    const n = doc.nodes[i];
    if (!n.collapsed || isHidden(n.id)) continue;
    if (!(idx.children.get(n.id) || []).length) continue;
    const r = collapseBadgeRect(n);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return n;
  }
  return null;
}
function selectedEdge(){ return selEdgeId ? (doc.edges.find(x => x.id === selEdgeId) || null) : null; }
