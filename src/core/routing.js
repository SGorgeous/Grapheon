'use strict';
/* ==========================================================================
   GRAPHEON · core/routing.js
   连线几何：四向锚点、正交折线（含走廊错位）、贝塞尔。
   ========================================================================== */

/* =========================================================================
   几何：连线
   ========================================================================= */
function anchorsFor(n){
  return {
    r:{ x:n.x + n.w,     y:n.y + n.h / 2, d:[1, 0] },
    l:{ x:n.x,           y:n.y + n.h / 2, d:[-1, 0] },
    t:{ x:n.x + n.w / 2, y:n.y,           d:[0, -1] },
    b:{ x:n.x + n.w / 2, y:n.y + n.h,     d:[0, 1] }
  };
}
function bezierGeom(a, b){
  const ac = { x:a.x + a.w / 2, y:a.y + a.h / 2 };
  const bc = { x:b.x + b.w / 2, y:b.y + b.h / 2 };
  const right = bc.x >= ac.x;
  const A = right ? anchorsFor(a).r : anchorsFor(a).l;
  const B = right ? anchorsFor(b).l : anchorsFor(b).r;
  const dx = Math.abs(B.x - A.x);
  const c = Math.max(28, dx * 0.5);
  const p0 = { x:A.x, y:A.y };
  const p3 = { x:B.x, y:B.y };
  const p1 = { x:p0.x + (right ? c : -c), y:p0.y };
  const p2 = { x:p3.x - (right ? c : -c), y:p3.y };
  return { type:'c', p0, p1, p2, p3, mid: cub(p0, p1, p2, p3, 0.5) };
}
function cub(p0, p1, p2, p3, t){
  const u = 1 - t, a = u*u*u, b = 3*u*u*t, c = 3*u*t*t, d = t*t*t;
  return { x:a*p0.x + b*p1.x + c*p2.x + d*p3.x, y:a*p0.y + b*p1.y + c*p2.y + d*p3.y };
}
function orthoGeom(a, b, bias){
  bias = bias || 0;
  const ac = { x:a.x + a.w / 2, y:a.y + a.h / 2 };
  const bc = { x:b.x + b.w / 2, y:b.y + b.h / 2 };
  const vx = bc.x - ac.x, vy = bc.y - ac.y;
  const A0 = anchorsFor(a), B0 = anchorsFor(b);
  const keys = ['r', 'l', 't', 'b'];
  let best = null;
  for (const ka of keys) for (const kb of keys){
    const A = A0[ka], B = B0[kb];
    let score = Math.abs(A.x - B.x) + Math.abs(A.y - B.y);
    if (A.d[0] * vx + A.d[1] * vy < 0) score += 700;
    if (B.d[0] * -vx + B.d[1] * -vy < 0) score += 700;
    if (ka === 't' || ka === 'b') score += 8;
    if (kb === 't' || kb === 'b') score += 8;
    if (ka === kb) score += STUB * 2;   // 同侧出线必然绕 U 形，惩罚之
    if (!best || score < best.score) best = { score, A, B, ka, kb };
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
function edgeGeom(a, b){ return doc.mode === 'mind' ? bezierGeom(a, b) : orthoGeom(a, b); }
function edgeGeomFor(e){
  const a = byId(e.s), b = byId(e.t);
  if (!a || !b) return null;
  if (doc.mode === 'mind') return bezierGeom(a, b);
  return orthoGeom(a, b, ((hashId(e.id) % 7) - 3) * 9);
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

