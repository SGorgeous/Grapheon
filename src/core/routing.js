'use strict';
/* ==========================================================================
   GRAPHEON · core/routing.js
   连线几何：四向锚点、正交折线（含走廊错位）、贝塞尔。
   ========================================================================== */

/* =========================================================================
   几何：连线
   ========================================================================= */
/* 一个盒子的四向锚点。**只给分组用** —— 分组没有端点表。
   节点不再走这条路：节点的锚点一律来自它的**真实端点**（见下）。 */
function boxAnchors(b){
  return {
    r:{ x:b.x + b.w,     y:b.y + b.h / 2, d:[1, 0] },
    l:{ x:b.x,           y:b.y + b.h / 2, d:[-1, 0] },
    t:{ x:b.x + b.w / 2, y:b.y,           d:[0, -1] },
    b:{ x:b.x + b.w / 2, y:b.y + b.h,     d:[0, 1] }
  };
}
/* 四条边的中点。**只作为「该边上没有端点时」的度量参照**，不会当成落点用。 */
function sideMidOf(b, s){
  if (s === 'r') return { x:b.x + b.w, y:b.y + b.h / 2 };
  if (s === 'l') return { x:b.x,       y:b.y + b.h / 2 };
  if (s === 't') return { x:b.x + b.w / 2, y:b.y };
  return              { x:b.x + b.w / 2, y:b.y + b.h };
}
function anchorsFor(x){
  if (!x) return boxAnchors({ x:0, y:0, w:0, h:0 });
  /* ★ 钉死在某个端点上：四个槽全换成那个点。
     这样不管后面是自动挑边、还是 aSide/bSide 指定了哪条边，
     出来的都是同一个端点的真实位置。
     光靠「哪条边」表达不了同一条边上的两个端点 —— 必须靠端点 id。 */
  if (x.__forced){
    const dd = x.__forced.d;
    const f = { x:x.__forced.x, y:x.__forced.y,
                d:(Array.isArray(dd) && isFinite(dd[0]) && isFinite(dd[1])) ? dd : [1, 0] };
    return { r:f, l:f, t:f, b:f };
  }
  /* 传进来的是**节点**（不是走线内部的盒子副本）→ 锚点从它的端点表推。
     分组没有端点表，走下面的 boxAnchors。 */
  const n = (typeof byId === 'function' && x.id != null) ? byId(x.id) : null;
  const isNode = !!n && n === x;
  if (isNode && typeof portList === 'function'){
    const L = portList(n);
    const A = {};
    for (const dir of PORT_DIRS){
      for (const p of (L[dir] || [])){
        if (A[p.side]) continue;                       // 同边多个端点取第一个，具体靠 aPort 钉
        const pt = portPoint(n, p);
        const o = PORT_OUT[p.side] || PORT_OUT.r;
        A[p.side] = { x:pt.x, y:pt.y, d:[o.x, o.y], id:p.id };
      }
    }
    /* 那条边上没有端点的：退到**离它最近的真实端点** ——
       仍然是真实端点，绝不虚构位置。程序节点只有左右两个端点时，
       上下的锚点就落在左右那两个上，这正是「不许凭空造点」的意思。 */
    const all = nodePorts(n);
    if (all.length){
      for (const s of PORT_SIDES){
        if (A[s]) continue;
        const mid = sideMidOf(n, s);
        let best = null, bd = Infinity, bs = 'r';
        for (const p of all){
          const pt = portPoint(n, p);
          const d = Math.hypot(pt.x - mid.x, pt.y - mid.y);
          if (d < bd){ bd = d; best = pt; bs = p.side; }
        }
        const o = PORT_OUT[bs] || PORT_OUT.r;
        A[s] = { x:best.x, y:best.y, d:[o.x, o.y] };
      }
    }
    /* ★ 兜底：四条边**必须都有值**。
       有空洞的话，调用方写的 anchorsFor(x)[side].x 会直接抛异常 ——
       那是在 draw() 里面，一抛整帧就断，症状是「虚线没了 / 画一半」。
       端点表整个是空的时候（理论上不该发生）退回盒子四向锚点。 */
    const box = boxAnchors(n);
    for (const s of PORT_SIDES){ if (!A[s]) A[s] = box[s]; }
    return A;
  }
  return boxAnchors(x);
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
/* =========================================================================
   走线避让：候选走廊打分
   -------------------------------------------------------------------------
   以前走廊偏移是「按边 id 哈希」算的，纯粹为了让平行线不重叠 ——
   **完全不看节点在哪**，所以线会直接从别的节点身上穿过去。

   现在改成：拿若干条候选走廊，逐条数它穿过几个障碍盒子，取最少的。
   并列时取偏移最小的（尽量贴原来的走廊，视觉上稳）。

   ★ 几条硬约束：
     · 端点是钉死的，避让**只能改中间那段** —— 两端保持朝外方向不变
     · 障碍只算节点，**分组框不算**（它套着节点，算进去会绕得离谱）
     · 盒子太多就直接退回直连（大文档里逐条边避让会把重绘拖垮）
     · 用户拖过拐点的边根本不走这儿（waypointGeom 在前面就返回了）
   ========================================================================= */
const AVOID_MAX_BOXES = 400;          // 障碍超过这个数就不避让了
const AVOID_PAD = 6;                  // 离盒子多远算「擦到」
const AVOID_OFFSETS = [0, 45, -45, 100, -100, 170, -170, 250, -250];
/* 当前文档里所有可以当障碍的盒子。按位置签名缓存 —— 没动就不重算。 */
function avoidBoxes(excludeA, excludeB){
  const list = [];
  if (!idx.box) return list;
  for (const b of idx.box.values()){
    if (!b || b.id === excludeA || b.id === excludeB) continue;
    if (isHidden(b.id)) continue;
    list.push(b);
    if (list.length > AVOID_MAX_BOXES) return list;      // 够多了，触发退回
  }
  return list;
}
/* 一条轴对齐线段是否穿过盒子 */
function segHitsBox(x1, y1, x2, y2, box){
  const bx0 = box.x - AVOID_PAD, bx1 = box.x + box.w + AVOID_PAD;
  const by0 = box.y - AVOID_PAD, by1 = box.y + box.h + AVOID_PAD;
  if (Math.abs(y1 - y2) < 0.5){                          // 水平段
    if (y1 < by0 || y1 > by1) return false;
    const a0 = Math.min(x1, x2), a1 = Math.max(x1, x2);
    return !(a1 < bx0 || a0 > bx1);
  }
  if (Math.abs(x1 - x2) < 0.5){                          // 垂直段
    if (x1 < bx0 || x1 > bx1) return false;
    const a0 = Math.min(y1, y2), a1 = Math.max(y1, y2);
    return !(a1 < by0 || a0 > by1);
  }
  return false;
}
/* 这条路径穿过几个**不同的**盒子（同一条线穿两次只算一个） */
function pathCrossCount(pts, boxes){
  if (!boxes.length) return 0;
  let n = 0;
  for (const box of boxes){
    let hit = false;
    for (let i = 1; i < pts.length && !hit; i++){
      if (segHitsBox(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, box)) hit = true;
    }
    if (hit) n++;
  }
  return n;
}

function orthoGeom(a, b, bias, ka, kb, obstacles){
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
  /* 给一个走廊偏移，造出这条折线。避让只动中间那一段 ——
     两端 p0→p1、p2→p3 是端点朝外的固定短桩，永远不变，
     否则线会从端点上斜着飞出去。 */
  const buildPts = (off) => {
    const q = [p0, p1];
    if (h1 && h2){
      const mx = (p1.x + p2.x) / 2 + off;
      q.push({ x:mx, y:p1.y }, { x:mx, y:p2.y });
    } else if (!h1 && !h2){
      const my = (p1.y + p2.y) / 2 + off;
      q.push({ x:p1.x, y:my }, { x:p2.x, y:my });
    } else if (h1 && !h2){
      q.push({ x:p2.x + (Math.abs(p1.y - p2.y) < 1 ? off : 0), y:p1.y });
    } else {
      q.push({ x:p1.x, y:p2.y + (Math.abs(p1.x - p2.x) < 1 ? off : 0) });
    }
    q.push(p2, p3);
    return q;
  };
  let pts = buildPts(bias);
  const boxes = (obstacles && obstacles.length <= AVOID_MAX_BOXES) ? obstacles : null;
  if (boxes && boxes.length){
    /* 两类候选：
       ① 挪走廊 —— 偏移中间那段的位置
       ② 绕行   —— 障碍正挡在两端之间时，① 是没用的
                   （两端都朝左右时，挪走廊只动竖直那段，
                     水平那一段该穿还是穿），得整个绕上去 / 绕下去 */
    const cands = [];
    for (const d of AVOID_OFFSETS) cands.push({ pts:buildPts(bias + d), d });
    const my1 = p1.y + bias, my2 = p2.y + bias;
    for (const d of AVOID_OFFSETS){
      if (d === 0) continue;
      const my = (my1 + my2) / 2 + d;
      const q = [p0, p1];
      if (h1 && h2) q.push({ x:p1.x, y:my }, { x:p2.x, y:my });
      else if (!h1 && !h2) q.push({ x:p1.x + d, y:p1.y }, { x:p1.x + d, y:p2.y });
      else break;
      q.push(p2, p3);
      cands.push({ pts:q, d });
    }
    let bestC = null;
    for (const c of cands){
      const cross = pathCrossCount(c.pts, boxes);
      // 穿过几个盒子是首要的（权重远大于偏移）；并列时取偏移小的
      const score = cross * 10000 + Math.abs(c.d);
      if (!bestC || score < bestC.score) bestC = { score, pts:c.pts, cross, d:c.d };
      if (cross === 0 && c.d === 0) break;               // 直连就干净，不用再试
    }
    if (bestC) pts = bestC.pts;
  }
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
  // 障碍：除两端之外的所有节点盒子（分组框不算 —— 它套着节点，算进去会绕得离谱）
  return orthoGeom(a, b, ((hashId(e.id) % 7) - 3) * 9, e.aSide,
                   e.bSide, avoidBoxes(e.s, e.t));
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

