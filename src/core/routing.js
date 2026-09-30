'use strict';
/* ==========================================================================
   GRAPHEON · core/routing.js
   连线几何：四向锚点、正交折线（含走廊错位）、贝塞尔。
   ========================================================================== */

/* =========================================================================
   几何：连线
   ========================================================================= */
function anchorsFor(n){
  const A = {
    r:{ x:n.x + n.w,     y:n.y + n.h / 2, d:[1, 0] },
    l:{ x:n.x,           y:n.y + n.h / 2, d:[-1, 0] },
    t:{ x:n.x + n.w / 2, y:n.y,           d:[0, -1] },
    b:{ x:n.x + n.w / 2, y:n.y + n.h,     d:[0, 1] }
  };
  /* ★ 钉死在某个端点上：四个槽全换成那个点。
     这样不管后面是自动挑边、还是 aSide/bSide 指定了哪条边，
     出来的都是同一个端点的真实位置。
     光靠「哪条边」表达不了同一条边上的两个端点 —— 必须靠端点 id。 */
  if (n && n.__forced){
    const dd = n.__forced.d;
    const f = { x:n.__forced.x, y:n.__forced.y,
                d:(Array.isArray(dd) && isFinite(dd[0]) && isFinite(dd[1])) ? dd : [1, 0] };
    return { r:f, l:f, t:f, b:f };
  }
  return A;
}
/* ka / kb 是「钉死」的端点边（'r'|'l'|'t'|'b'），传 null 表示按相对位置自动挑 —— 默认就是自动。 */
function bezierGeom(a, b, ka, kb){
  const ac = { x:a.x + a.w / 2, y:a.y + a.h / 2 };
  const bc = { x:b.x + b.w / 2, y:b.y + b.h / 2 };
  const right = bc.x >= ac.x;
  const A0 = anchorsFor(a), B0 = anchorsFor(b);
  const A = A0[ka] || (right ? A0.r : A0.l);
  const B = B0[kb] || (right ? B0.l : B0.r);
  const p0 = { x:A.x, y:A.y };
  const p3 = { x:B.x, y:B.y };
  // 控制点长度取「沿出口法线方向的距离」，这样自动挑左右时和以前的手感一致
  const along = Math.abs((p3.x - p0.x) * A.d[0] + (p3.y - p0.y) * A.d[1]);
  const c = Math.max(28, along * 0.5);
  const p1 = { x:p0.x + A.d[0] * c, y:p0.y + A.d[1] * c };
  const p2 = { x:p3.x + B.d[0] * c, y:p3.y + B.d[1] * c };
  return { type:'c', p0, p1, p2, p3, mid: cub(p0, p1, p2, p3, 0.5) };
}
function cub(p0, p1, p2, p3, t){
  const u = 1 - t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
  return { x:a*p0.x + b*p1.x + c*p2.x + d*p3.x, y:a*p0.y + b*p1.y + c*p2.y + d*p3.y };
}
function orthoGeom(a, b, bias, ka, kb){
  bias = bias || 0;
  const ac = { x:a.x + a.w / 2, y:a.y + a.h / 2 };
  const bc = { x:b.x + b.w / 2, y:b.y + b.h / 2 };
  const vx = bc.x - ac.x, vy = bc.y - ac.y;
  const A0 = anchorsFor(a), B0 = anchorsFor(b);
  const keys = ['r', 'l', 't', 'b'];
  // 钉死了就只用那一条边；没钉就在四条边里挑最合适的
  const keysA = ka ? [ka] : keys;
  const keysB = kb ? [kb] : keys;
  let best = null;
  for (const x of keysA) for (const y of keysB){
    const A = A0[x], B = B0[y];
    let score = Math.abs(A.x - B.x) + Math.abs(A.y - B.y);
    if (A.d[0] * vx + A.d[1] * vy < 0) score += 700;
    if (B.d[0] * -vx + B.d[1] * -vy < 0) score += 700;
    if (x === 't' || x === 'b') score += 8;
    if (y === 't' || y === 'b') score += 8;
    if (x === y) score += STUB * 2;   // 同侧出线必然绕 U 形，惩罚之
    if (!best || score < best.score) best = { score, A, B, ka:x, kb:y };
  }
  const A = best.A, B = best.B;
  const p0 = { x:A.x, y:A.y };
  const p1 = { x:A.x + A.d[0] * STUB, y:A.y + A.d[1] * STUB };
  const p3 = { x:B.x, y:B.y };
  const p2 = { x:B.x + B.d[0] * STUB, y:B.y + B.d[1] * STUB };
  const h1 = A.d[0] !== 0, h2 = B.d[0] !== 0;
  const pts = [p0, p1];
  if (h1 && h2){
    const mx = (p1.x + p2.x) / 2 + bias;
    pts.push({ x:mx, y:p1.y }, { x:mx, y:p2.y });
  } else if (!h1 && !h2){
    const my = (p1.y + p2.y) / 2 + bias;
    pts.push({ x:p1.x, y:my }, { x:p2.x, y:my });
  } else if (h1 && !h2){
    pts.push({ x:p2.x + (Math.abs(p1.y - p2.y) < 1 ? bias : 0), y:p1.y });
  } else {
    pts.push({ x:p1.x, y:p2.y + (Math.abs(p1.x - p2.x) < 1 ? bias : 0) });
  }
  pts.push(p2, p3);
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++){
    const q = pts[i], p = clean[clean.length - 1];
    if (Math.abs(q.x - p.x) > 0.5 || Math.abs(q.y - p.y) > 0.5) clean.push(q);
  }
  if (clean.length < 2) clean.push({ x:p3.x + 1, y:p3.y });
  const n = clean.length;
  return { type:'p', pts:clean, mid: clean[Math.floor(n / 2)], dir:B.d };
}
/* ---- 拐点：手动指定的折点。有拐点时走线由拐点决定，
       而 route 仍然决定「拐角是硬折还是平滑」：ortho = 折线，curve = 过点的样条。 ---- */
function waypointGeom(e){
  const wps = e.waypoints;
  if (!wps || !wps.length) return null;
  const a = anchorOf(e.s), b = anchorOf(e.t);
  if (!a || !b) return null;
  const A0 = anchorsFor(a), B0 = anchorsFor(b);
  const first = wps[0], last = wps[wps.length - 1];
  const A = A0[e.aSide] || nearestAnchor(a, first);
  const B = B0[e.bSide] || nearestAnchor(b, last);
  const pts = [{ x:A.x, y:A.y }];
  for (const p of wps) pts.push({ x:p.x, y:p.y });
  pts.push({ x:B.x, y:B.y });
  return { type: e.route === 'curve' ? 'w' : 'p', pts, mid: pts[Math.floor(pts.length / 2)] };
}
/* 某一端的强制锚点：这条边记了端点 id 的话，就用它的真实位置 */
function forcedAnchorOf(nodeId, portId){
  if (portId == null) return null;
  const n = idx.byId.get(nodeId);
  if (!n || typeof portById !== 'function') return null;
  const p = portById(n, portId);
  if (!p) return null;
  const pt = portPoint(n, p);
  // ⚠ d 必须是**数组 [dx,dy]** —— anchorsFor 里就是这个形状，
  //   下游用 A.d[0] / A.d[1] 取方向。把 PORT_OUT 的 {x,y} 直接塞进去
  //   会让方向变成 undefined、坐标变 NaN，线就画不出来了。
  const o = (typeof PORT_OUT === 'object' && PORT_OUT[p.side]) || { x:1, y:0 };
  return { x:pt.x, y:pt.y, d:[o.x, o.y] };
}
/* 没记端点时该用哪个：挑「朝外方向最正对对方」的那个。
   进来的是源头的 OUT 端点 / 落点的 IN 端点 —— 这也是它们该在的位置。 */
function autoPortFor(nodeId, otherBox, end, side){
  if (typeof portList !== 'function') return null;
  const n = idx.byId.get(nodeId);
  if (!n) return null;
  const L = portList(n);
  const list0 = (end === 'a')
    ? (L.outs.length ? L.outs : L.ins)
    : (L.ins.length ? L.ins : L.outs);
  let list = list0.slice();
  if (!list.length) return null;
  // aSide / bSide 是「想钉在哪条边」—— 但落点必须是**真实端点**。
  // 那条边上正好有端点就用它；没有就退回「哪个端口朝着对方」。
  // （老的「四条边中点」不再作为落点：同边可能有多个端点，说不清是哪一个。）
  if (side){
    const onSide = list.filter(q => q.side === side);
    if (onSide.length) list = onSide;
  }
  const b = nodeBox(n);
  const self = { x:b.x + b.w / 2, y:b.y + b.h / 2 };
  const other = { x:otherBox.x + otherBox.w / 2, y:otherBox.y + otherBox.h / 2 };
  let best = list[0], bestScore = -Infinity;
  for (const q of list){
    const o = (typeof PORT_OUT === 'object' && PORT_OUT[q.side]) || { x:1, y:0 };
    // 朝外的方向 · 指向对方的方向：越大越正对
    const score = o.x * (other.x - self.x) + o.y * (other.y - self.y);
    if (score > bestScore){ bestScore = score; best = q; }
  }
  return best;
}
function edgeGeomFor(e){
  const wg = waypointGeom(e);
  if (wg) return wg;
  const a0 = anchorOf(e.s), b0 = anchorOf(e.t);
  if (!a0 || !b0) return null;
  // ⚠ 一定要**复制**再打标记：anchorOf 对节点返回的是 idx 里的**缓存对象**，
  //   直接往上写 __forced 会把它永久污染 —— 之后所有用到这个盒子的锚点
  //   四条边全变成同一个点，几何退化，线就画不出来了。
  const a = Object.assign({}, a0), b = Object.assign({}, b0);
  /* ★ 两端都钉在**真实端点**上。
     老的「四条边中点」不再作为落点 —— 同一节点上可能有多个端点，
     「哪条边」表达不了是哪一个，只有端点 id 说得清。
     没记端点（老存档 / 程序内部建的边）就按「哪个端口朝着对方」自动挑一个。 */
  let pa = e.aPort, pb = e.bPort;
  if (pa == null){ const q = autoPortFor(e.s, b0, 'a', e.aSide); if (q) pa = q.id; }
  if (pb == null){ const q = autoPortFor(e.t, a0, 'b', e.bSide); if (q) pb = q.id; }
  const fa = forcedAnchorOf(e.s, pa); if (fa) a.__forced = fa;
  const fb = forcedAnchorOf(e.t, pb); if (fb) b.__forced = fb;
  if (e.route === 'curve') return bezierGeom(a, b, e.aSide, e.bSide);
  // 正交折线：按 id 哈希给每条线一点走廊偏移，避免平行线完全重叠
  return orthoGeom(a, b, ((hashId(e.id) % 7) - 3) * 9, e.aSide, e.bSide);
}
/* 几何的两端（用于拖拽端点、画箭头） */
function geomEndpoints(geom){
  if (!geom) return null;
  if (geom.type === 'c') return { a:geom.p0, b:geom.p3 };
  return { a:geom.pts[0], b:geom.pts[geom.pts.length - 1] };
}
function edgeEndpoints(e){ return geomEndpoints(edgeGeomFor(e)); }
/* 每个箭头的「从哪指向哪」，起点箭头是指进起始节点，终点箭头是指进目标节点 */
function geomArrowPoints(geom){
  if (!geom) return null;
  if (geom.type === 'c'){
    return { start:{ from:geom.p1, to:geom.p0 }, end:{ from:geom.p2, to:geom.p3 } };
  }
  const p = geom.pts;
  return { start:{ from:p[1], to:p[0] }, end:{ from:p[p.length - 2], to:p[p.length - 1] } };
}
/* 样条取样：Catmull-Rom 转成三次贝塞尔后均匀取点 */
function catmullSeg(p, i){
  const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p[i + 1];
  return {
    p1,
    c1:{ x:p1.x + (p2.x - p0.x) / 6, y:p1.y + (p2.y - p0.y) / 6 },
    c2:{ x:p2.x - (p3.x - p1.x) / 6, y:p2.y - (p3.y - p1.y) / 6 },
    p2
  };
}
/* 一个节点上离某点最近的锚点（拖拽重连时的吸附位置） */
function nearestAnchor(n, from){
  const P = anchorsFor(n);
  let best = null, bd = Infinity;
  for (const k of ['r', 'l', 't', 'b']){
    const a = P[k];
    const d = Math.hypot(a.x - from.x, a.y - from.y);
    if (d < bd){ bd = d; best = a; }
  }
  return best;
}
function hashId(s){
  let h = 2166136261;
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function distToGeom(g, p){
  if (!g) return 1e9;
  let best = 1e9;
  if (g.type === 'p'){
    for (let i = 0; i < g.pts.length - 1; i++) best = Math.min(best, distSeg(p, g.pts[i], g.pts[i + 1]));
  } else if (g.type === 'w'){
    const pts = g.pts;
    for (let i = 0; i < pts.length - 1; i++){
      const s = catmullSeg(pts, i);
      let prev = s.p1;
      for (let k = 1; k <= 10; k++){
        const q = cub(s.p1, s.c1, s.c2, s.p2, k / 10);
        best = Math.min(best, distSeg(p, prev, q));
        prev = q;
      }
    }
  } else {
    let prev = g.p0;
    for (let i = 1; i <= 24; i++){
      const q = cub(g.p0, g.p1, g.p2, g.p3, i / 24);
      best = Math.min(best, distSeg(p, prev, q));
      prev = q;
    }
  }
  return best;
}
function distSeg(p, a, b){
  const vx = b.x - a.x, vy = b.y - a.y;
  const L2 = vx * vx + vy * vy;
  let t = L2 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = p.x - (a.x + t * vx), dy = p.y - (a.y + t * vy);
  return Math.hypot(dx, dy);
}

