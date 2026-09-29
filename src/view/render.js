'use strict';
/* ==========================================================================
   GRAPHEON · view/render.js
   canvas 绘制：网格、连线、节点、端口、折叠标记、红心。
   ========================================================================== */

/* =========================================================================
   绘制
   ========================================================================= */
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
  mark();
}
function draw(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, VW, VH);
  drawGrid();
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.z, view.z);
  drawGraph(ctx);
  ctx.restore();
  drawMarquee();
  positionEditor();
}
let gridPat = null, gridPatStep = 0;
function drawGrid(){
  const step = 34 * view.z;
  if (step < 11) return;
  const s = Math.max(8, Math.round(step));
  if (!gridPat || s !== gridPatStep){
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const g2 = c.getContext('2d');
    g2.fillStyle = C.grid;
    g2.fillRect(0, 0, 2, 2);
    gridPat = ctx.createPattern(c, 'repeat');
    gridPatStep = s;
  }
  const ox = ((view.x % s) + s) % s;
  const oy = ((view.y % s) + s) % s;
  ctx.save();
  ctx.fillStyle = gridPat;
  ctx.translate(ox - s, oy - s);
  ctx.fillRect(0, 0, VW + s * 2, VH + s * 2);
  ctx.restore();
}
function drawGraph(g){
  for (const e of doc.edges){
    if (relink && relink.edgeId === e.id) continue;   // 正在拖端点的那条改用预览画
    drawEdge(g, e);
  }
  for (const n of doc.nodes) drawNode(g, n);
  // 选中节点的连接端口：鼠标悬停在该节点（或已悬停到它的端口）时才显示
  if (sel.size === 1 && !editing){
    const n = byId([...sel][0]);
    const showPorts = n && (hover === n || (hoverPort && hoverPort.node === n.id));
    if (showPorts){
      const P = anchorsFor(n);
      for (const k of ['r', 'l', 't', 'b']){
        const a = P[k];
        const on = hoverPort && hoverPort.node === n.id && hoverPort.side === k;
        g.fillStyle = on ? C.yellow : C.bg;
        g.strokeStyle = on ? C.yellow : C.white;
        g.lineWidth = 2;
        g.beginPath();
        g.rect(Math.round(a.x) - 5, Math.round(a.y) - 5, 10, 10);
        g.fill(); g.stroke();
      }
    }
  }
  // 拉新连线的预览
  if (linking){
    const a = byId(linking.node);
    if (a){
      const A = anchorsFor(a)[linking.side];
      const to = linking.to;
      g.save();
      g.strokeStyle = C.yellow; g.lineWidth = 2.5;
      g.setLineDash([8, 6]);
      g.beginPath();
      g.moveTo(A.x, A.y);
      g.lineTo(to.x, to.y);
      g.stroke();
      g.restore();
      if (hover) outlineNode(g, hover);
    }
  }
  // 拖拽端点改接的预览
  if (relink) drawRelink(g);
}
function outlineNode(g, n){
  g.save();
  g.strokeStyle = C.yellow; g.lineWidth = 3;
  pathShape(g, n);
  g.stroke();
  g.restore();
}
function drawRelink(g){
  const e = doc.edges.find(x => x.id === relink.edgeId);
  if (!e) return;
  const ep = edgeEndpoints(e);
  if (!ep) return;
  const draggedIsT = relink.end === 't';
  const fixed = draggedIsT ? ep.a : ep.b;            // 没被拖的那一端，还留在原节点上
  const fixedNode = byId(draggedIsT ? e.s : e.t);
  const tgt = relink.target;

  g.save();
  g.strokeStyle = C.yellow; g.lineWidth = 2.5;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.setLineDash([10, 8]);
  if (tgt && fixedNode){
    // 按这条线自己的走线方式预览：松手之后长什么样，现在就长什么样
    pathGeom(g, e.route === 'curve' ? bezierGeom(fixedNode, tgt) : orthoGeom(fixedNode, tgt, 0), CORNER);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(fixed.x, fixed.y);
    g.lineTo(relink.to.x, relink.to.y);
    g.stroke();
  }
  g.restore();

  // 松手会落到的锚点方块
  const dropPt = tgt ? nearestAnchor(tgt, fixed) : relink.to;
  g.save();
  g.fillStyle = C.yellow;
  g.beginPath();
  g.rect(Math.round(dropPt.x) - 6, Math.round(dropPt.y) - 6, 12, 12);
  g.fill();
  g.restore();
  if (tgt) outlineNode(g, tgt);
}
function pathShape(g, n){
  const x = n.x, y = n.y, w = n.w, h = n.h;
  g.beginPath();
  if (n.shape === 'diamond'){
    g.moveTo(x + w / 2, y); g.lineTo(x + w, y + h / 2);
    g.lineTo(x + w / 2, y + h); g.lineTo(x, y + h / 2); g.closePath();
  } else if (n.shape === 'oval'){
    g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (n.shape === 'round'){
    roundRect(g, x, y, w, h, 14);
  } else {
    roundRect(g, x, y, w, h, 2);
  }
}
function roundRect(g, x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function drawNode(g, n){
  const selected = sel.has(n.id);
  const hov = hover && hover.id === n.id;
  const stroke = selected ? C.yellow : (hov ? C.yellow : C.white);
  g.save();
  g.lineJoin = 'round';
  g.lineWidth = isRoot(n) ? 4 : 3;
  g.strokeStyle = stroke;
  g.fillStyle = C.bg;
  pathShape(g, n);
  g.fill();
  g.stroke();

  setFont(g, n.fs, n.fw);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = selected ? C.yellow : C.white;
  const startY = n.y + n.h / 2 - ((n.lines.length - 1) * n.lh) / 2;
  for (let i = 0; i < n.lines.length; i++) g.fillText(n.lines[i], n.x + n.w / 2, startY + i * n.lh);

  const kids = idx.children.get(n.id) || [];
  // 只有折叠时才显示「隐藏了 N 个」的标记；展开时端点悬停才出现，两者不会打架
  if (kids.length && n.collapsed){
    const label = String(descendants(n.id).length);
    setFont(g, FS, 'normal');
    const tw = g.measureText(label).width;
    const bw = Math.max(22, tw + 12), bh = 22;
    const cxb = n.x + n.w, cyb = n.y + n.h / 2;
    g.lineWidth = 2.5; g.strokeStyle = C.white; g.fillStyle = C.bg;
    g.beginPath();
    g.rect(Math.round(cxb - bw / 2), Math.round(cyb - bh / 2), Math.round(bw), bh);
    g.fill(); g.stroke();
    g.fillStyle = C.white; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, cxb, cyb + 1);
  }
  if (selected) drawHeart(g, n.x - 26, n.y + n.h / 2 - 6.5, 2);
  g.restore();
}
/* 把一段连线几何铺成当前路径（贝塞尔 / 带圆角的折线），绘制与预览共用 */
function pathGeom(g, geom, radius){
  g.beginPath();
  if (!geom) return;
  if (geom.type === 'c'){
    g.moveTo(geom.p0.x, geom.p0.y);
    g.bezierCurveTo(geom.p1.x, geom.p1.y, geom.p2.x, geom.p2.y, geom.p3.x, geom.p3.y);
    return;
  }
  const pts = geom.pts;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++){
    const r = Math.min(radius, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / 2,
                              Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) / 2);
    g.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, Math.max(1, r));
  }
  g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
/* 画一条连线。样式（箭头 / 虚线 / 走线）全部来自这条线自己的属性 */
function drawEdge(g, e){
  const geom = edgeGeomFor(e);
  if (!geom) return;
  const hi = (e.id === selEdgeId) || (e === hoverEdge);
  const stroke = hi ? C.yellow : C.white;
  g.save();
  g.strokeStyle = stroke;
  g.globalAlpha = hi ? 1 : 0.85;
  g.lineWidth = 2.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (e.dash) g.setLineDash([11, 8]);
  pathGeom(g, geom, CORNER);
  g.stroke();
  g.setLineDash([]);
  // 箭头：none / end（终点单向）/ both（双向）
  const ap = geomArrowPoints(geom);
  if (e.arrow !== 'none' && ap){
    g.globalAlpha = hi ? 1 : 0.9;
    g.fillStyle = stroke;
    if (e.arrow === 'both') arrowHead(g, ap.start.from, ap.start.to, 11);
    arrowHead(g, ap.end.from, ap.end.to, 11);
  }
  // 选中时在两端画出可拖拽的手柄
  if (e.id === selEdgeId){
    const ep = geomEndpoints(geom);
    for (const pt of [ep.a, ep.b]){
      g.globalAlpha = 1;
      g.fillStyle = C.bg; g.strokeStyle = C.yellow; g.lineWidth = 2.5;
      g.beginPath();
      g.rect(Math.round(pt.x) - 7, Math.round(pt.y) - 7, 14, 14);
      g.fill(); g.stroke();
      g.fillStyle = C.yellow;
      g.fillRect(Math.round(pt.x) - 2, Math.round(pt.y) - 2, 4, 4);
    }
  }
  g.restore();
  if (e.label){
    const m = geom.mid;
    g.save();
    setFont(g, FS, 'normal');
    const w = g.measureText(e.label).width + 18;
    const h = 26;
    g.fillStyle = C.bg; g.strokeStyle = stroke; g.lineWidth = 2.5;
    g.beginPath(); g.rect(Math.round(m.x - w / 2), Math.round(m.y - h / 2), Math.round(w), h); g.fill(); g.stroke();
    g.fillStyle = stroke; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(e.label, m.x, m.y + 1);
    g.restore();
  }
}
function arrowHead(g, from, to, size){
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  g.beginPath();
  g.moveTo(to.x, to.y);
  g.lineTo(to.x - size * Math.cos(ang - 0.42), to.y - size * Math.sin(ang - 0.42));
  g.lineTo(to.x - size * Math.cos(ang + 0.42), to.y - size * Math.sin(ang + 0.42));
  g.closePath();
  g.fill();
}
const HEART = [
  [1,0],[2,0],[4,0],[5,0],
  [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
  [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
  [1,3],[2,3],[3,3],[4,3],[5,3],
  [2,4],[3,4],[4,4],
  [3,5]
];
function drawHeart(g, x, y, s){
  g.save();
  g.fillStyle = C.red;
  for (const [cx, cy] of HEART) g.fillRect(x + cx * s, y + cy * s, s, s);
  g.restore();
}
function drawMarquee(){
  if (!marquee) return;
  const a = w2s(marquee.a), b = w2s(marquee.b);
  ctx.save();
  ctx.strokeStyle = C.yellow; ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.restore();
}

