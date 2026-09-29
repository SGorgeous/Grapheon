'use strict';
/* ==========================================================================
   GRAPHEON · view/hit.js
   命中测试：节点 / 连接端口 / 连线 / 连线端点手柄 / 拐点手柄 / 缩放柄 / 折叠标记。
   所有测试都要跳过被折叠藏起来的节点。
   ========================================================================== */

/* =========================================================================
   命中测试
   ========================================================================= */
function hitNode(p){
  for (let i = doc.nodes.length - 1; i >= 0; i--){
    const n = doc.nodes[i];
    if (isHidden(n.id)) continue;
    if (n.shape === 'diamond'){
      const dx = Math.abs(p.x - (n.x + n.w / 2)) / (n.w / 2);
      const dy = Math.abs(p.y - (n.y + n.h / 2)) / (n.h / 2);
      if (dx + dy <= 1) return n;
    } else if (p.x >= n.x && p.x <= n.x + n.w && p.y >= n.y && p.y <= n.y + n.h) return n;
  }
  return null;
}
function hitPort(p){
  if (sel.size !== 1) return null;
  const n = byId([...sel][0]);
  if (!n || isHidden(n.id)) return null;
  const P = anchorsFor(n);
  for (const k of ['r', 'l', 't', 'b']){
    const a = P[k];
    if (Math.abs(p.x - a.x) <= 9 && Math.abs(p.y - a.y) <= 9) return { node:n.id, side:k };
  }
  return null;
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
/* 选中节点的缩放柄 */
function hitResizeHandle(p){
  const n = soleSel();
  if (!n || isHidden(n.id)) return null;
  const r = resizeHandleRect(n);
  const pad = 4 / view.z;
  if (p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad) return n;
  return null;
}
/* 折叠标记（同时也是展开按钮） */
function hitCollapseBadge(p){
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
