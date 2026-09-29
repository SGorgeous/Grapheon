'use strict';
/* ==========================================================================
   GRAPHEON · view/hit.js
   命中测试：节点 / 连接端口 / 连线。
   ========================================================================== */

/* =========================================================================
   命中测试
   ========================================================================= */
function hitNode(p){
  for (let i = doc.nodes.length - 1; i >= 0; i--){
    const n = doc.nodes[i];
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
  if (!n) return null;
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
    const g = edgeGeomFor(e);
    const d = distToGeom(g, p);
    if (d < tol && d < bd){ bd = d; best = e; }
  }
  return best;
}

