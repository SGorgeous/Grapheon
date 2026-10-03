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
/* 只数**中间那几段**，跳过两端的出桩 / 入桩。
   ⚠ 必须跳过：segHitsBox 是 AABB 重叠判定（不是真的线段相交），
     而出桩那一段本来就从节点边上出发、和节点盒子必然重叠 ——
     不跳的话「撞上自己」对所有候选都成立，打分就白给了。
     段 i 覆盖 pts[i-1] → pts[i]，所以 i 从 2 到 pts.length-2。 */
function pathCrossCountInner(pts, boxes){
  if (!boxes.length) return 0;
  let n = 0;
  for (const box of boxes){
    let hit = false;
    for (let i = 2; i < pts.length - 1 && !hit; i++){
      if (segHitsBox(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, box)) hit = true;
    }
    if (hit) n++;
  }
  return n;
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

/* 正交连接线寻路（可见性网格 + A*）
   ─────────────────────────────────────────────────────────────
   参考 draw.io / Lucidchart 那套 Orthogonal Connector Routing：
   把所有节点的边（外扩 PAD）当成候选坐标线，它们的交点构成一张路网，
   在路网上跑 A*（拐弯加惩罚 → 自然选拐点最少的路）。
   结构上**不可能**穿过盒子 —— 不是「试出来没穿」，是路网里就没有那种边。

   放在 orthoGeom 里当**兜底**：候选打分那套跑完还是穿，才走这里。
   这样正常情况的行为一点不变（不砸现有断言），只有病态排布才换路。
   ========================================================================= */
const GRID_MAX_CELLS = 2600;      // 路网上限，超了就不试（宁可维持现状）
const GRID_TURN_COST = 34;        // 拐一次弯相当于多走这么多像素

/* 极简二叉堆 */
function heapPush(h, item){
  h.push(item);
  let i = h.length - 1;
  while (i > 0){
    const p = (i - 1) >> 1;
    if (h[p].c <= h[i].c) break;
    const t = h[p]; h[p] = h[i]; h[i] = t; i = p;
  }
}
function heapPop(h){
  const top = h[0], last = h.pop();
  if (h.length){
    h[0] = last;
    let i = 0;
    for (;;){
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < h.length && h[l].c < h[m].c) m = l;
      if (r < h.length && h[r].c < h[m].c) m = r;
      if (m === i) break;
      const t = h[m]; h[m] = h[i]; h[i] = t; i = m;
    }
  }
  return top;
}

/* p0/p1/p2/p3 是四个端点；boxes 是**要躲开**的盒子。
   返回一条正交折线（含 p0 和 p3），或者 null。 */
function routeOrthoAStar(p0, p1, p2, p3, boxes){
  if (!boxes || !boxes.length) return null;
  const PAD = AVOID_PAD;

  /* ── ① 候选坐标线 ── */
  const xs = new Set([p0.x, p1.x, p2.x, p3.x]);
  const ys = new Set([p0.y, p1.y, p2.y, p3.y]);
  for (const b of boxes){
    xs.add(b.x - PAD); xs.add(b.x + b.w + PAD); xs.add(b.x + b.w / 2);
    ys.add(b.y - PAD); ys.add(b.y + b.h + PAD); ys.add(b.y + b.h / 2);
  }
  const X = [...xs].sort((m, n) => m - n);
  const Y = [...ys].sort((m, n) => m - n);
  const W = X.length, H = Y.length;
  if (W * H > GRID_MAX_CELLS) return null;

  const xi = new Map(); X.forEach((v, i) => xi.set(v, i));
  const yi = new Map(); Y.forEach((v, i) => yi.set(v, i));

  /* ── ② 这一小段是不是穿盒子 ──
     坐标线都取在盒子边界（±PAD）上，所以只需看中点：
     中点在盒内 ⇒ 整段在盒内。 */
  const inBox = (x, y) => {
    for (const b of boxes){
      if (x > b.x - PAD && x < b.x + b.w + PAD && y > b.y - PAD && y < b.y + b.h + PAD) return true;
    }
    return false;
  };
  const segOK = (x1, y1, x2, y2) => {
    if (x1 === x2 && y1 === y2) return false;
    /* 采样几个点，别只看中点（段可能跨过一整个盒子） */
    const n = Math.max(2, Math.ceil(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 8));
    for (let k = 0; k <= n; k++){
      const t = k / n;
      if (inBox(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  };

  const si = xi.get(p1.x), sj = yi.get(p1.y);
  const gi = xi.get(p2.x), gj = yi.get(p2.y);
  if (si == null || sj == null || gi == null || gj == null) return null;

  /* ── ③ A*（状态 = 格点 + 从哪个方向进的，用来数拐弯） ── */
  const N = W * H;
  const dirStart = (p1.x !== p0.x) ? 1 : 2;          // 1=横 2=竖
  const INF = Infinity;
  const g = new Float64Array(N * 3).fill(INF);
  const prev = new Int32Array(N * 3).fill(-1);
  const key = (i, j, d) => (j * W + i) * 3 + d;
  const hcost = (i, j) => (Math.abs(X[i] - p2.x) + Math.abs(Y[j] - p2.y));
  const heap = [];
  const sk = key(si, sj, dirStart);
  g[sk] = 0;
  heapPush(heap, { k:sk, i:si, j:sj, d:dirStart, c:hcost(si, sj) });
  const DIRS = [[1,0,1],[-1,0,1],[0,1,2],[0,-1,2]];
  let goalKey = -1, guard = 0;
  while (heap.length && guard++ < 60000){
    const cur = heapPop(heap);
    if (cur.i === gi && cur.j === gj){ goalKey = cur.k; break; }
    if (cur.c - hcost(cur.i, cur.j) > g[cur.k] + 1e-6) continue;   // 过期条目
    for (const [dx, dy, d2] of DIRS){
      const ni = cur.i + dx, nj = cur.j + dy;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      if (!segOK(X[cur.i], Y[cur.j], X[ni], Y[nj])) continue;
      const step = Math.abs(X[ni] - X[cur.i]) + Math.abs(Y[nj] - Y[cur.j]);
      const turn = (cur.d === d2) ? 0 : GRID_TURN_COST;
      const nk = key(ni, nj, d2);
      const ng = g[cur.k] + step + turn;
      if (ng < g[nk] - 1e-6){
        g[nk] = ng; prev[nk] = cur.k;
        heapPush(heap, { k:nk, i:ni, j:nj, d:d2, c:ng + hcost(ni, nj) });
      }
    }
  }
  if (goalKey < 0) return null;

  /* ── ④ 回溯 ── */
  const mid = [];
  let k = goalKey;
  while (k >= 0){
    const cell = Math.floor(k / 3);
    mid.push({ x:X[cell % W], y:Y[Math.floor(cell / W)] });
    k = prev[k];
  }
  mid.reverse();
  return [p0, ...mid, p3];
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

  /* ★ 出桩长度要按**可用跨度**收短 —— 这是「线穿过自己」的根因。
     两根桩各走 STUB(22)。两个盒子挨得近时 p1 会越过 p2 ——
     走廊宽度变成负数，折线只能折回来，而折回的那一段
     正好落在对方（或自己）的盒子里。
     主流正交走线的做法就是这个：空隙不够就不收桩，
     直接走一个贴边的 L / Z，而不是先冲进去再折回来。 */
  const MIN_CORR = 10;                       // 中间至少留这么宽的走廊
  let stubA = STUB, stubB = STUB;
  if (A.d[0] !== 0 && B.d[0] !== 0){
    /* 两端都横向：沿 A 的朝向看，从 A 的边到 B 的边还有多少路 */
    const span = (B.x - A.x) * A.d[0];
    /* ★ span <= 0 表示目标在**背后**（端点背着目标）——
       这种时候桩绝对不能收：收成 0 就成了「从端点上直接掉头穿回去」，
       比原来的折返还难看。背后绕行交给下面那几条 PAD2 候选去办。 */
    if (span > 0 && span < stubA + stubB + MIN_CORR){
      const avail = Math.max(0, span - MIN_CORR);
      stubA = Math.min(STUB, avail / 2);
      stubB = Math.min(STUB, avail / 2);
    }
  } else if (A.d[1] !== 0 && B.d[1] !== 0){
    const span = (B.y - A.y) * A.d[1];
    if (span > 0 && span < stubA + stubB + MIN_CORR){
      const avail = Math.max(0, span - MIN_CORR);
      stubA = Math.min(STUB, avail / 2);
      stubB = Math.min(STUB, avail / 2);
    }
  } else {
    /* 一横一竖：横向那根桩别伸过对方的边 */
    if (A.d[0] !== 0) stubA = Math.min(STUB, Math.max(0, Math.abs(B.x - A.x) - MIN_CORR));
    if (B.d[0] !== 0) stubB = Math.min(STUB, Math.max(0, Math.abs(A.x - B.x) - MIN_CORR));
    if (A.d[1] !== 0) stubA = Math.min(STUB, Math.max(0, Math.abs(B.y - A.y) - MIN_CORR));
    if (B.d[1] !== 0) stubB = Math.min(STUB, Math.max(0, Math.abs(A.y - B.y) - MIN_CORR));
  }

  const p0 = { x:A.x, y:A.y };
  const p1 = { x:A.x + A.d[0] * stubA, y:A.y + A.d[1] * stubA };
  const p3 = { x:B.x, y:B.y };
  const p2 = { x:B.x + B.d[0] * stubB, y:B.y + B.d[1] * stubB };
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
  const boxes = (obstacles && obstacles.length <= AVOID_MAX_BOXES) ? obstacles : [];
  if (boxes.length){
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
    /* ★ 两端自己的盒子**单独**算一次。
       它们不在 boxes 里（avoidBoxes 的契约），但「折回来穿过自己」是最难看的，
       所以给它一个**次级**权重：穿别人 10 万，穿自己 1 万，偏移最小。 */
    const selfBoxes = [a, b].filter(Boolean);
    const selfCross = (q) => selfBoxes.length ? pathCrossCountInner(q, selfBoxes) : 0;

    /* 绕开自己的两条：出桩 → 沿桩口竖直绕到两个盒子**之外** → 再横过去 → 入桩。
       形状和上面「绕行」那类一样，只是 my 取得明确在两端盒子之外。 */
    const PAD2 = AVOID_PAD + 16;
    if (h1 && h2){
      const top = Math.min(a.y, b.y) - PAD2;
      const bot = Math.max(a.y + a.h, b.y + b.h) + PAD2;
      for (const my of [top, bot]){
        cands.push({ pts:[p0, p1, { x:p1.x, y:my }, { x:p2.x, y:my }, p2, p3], d:0 });
      }
    } else if (!h1 && !h2){
      const lft = Math.min(a.x, b.x) - PAD2;
      const rgt = Math.max(a.x + a.w, b.x + b.w) + PAD2;
      for (const mx of [lft, rgt]){
        cands.push({ pts:[p0, p1, { x:mx, y:p1.y }, { x:mx, y:p2.y }, p2, p3], d:0 });
      }
    }

    let bestC = null;
    for (const c of cands){
      const cross = pathCrossCount(c.pts, boxes);
      const self = selfCross(c.pts);
      // 穿别人是首要的；穿自己次之（但绝不该赢过能绕开的方案）；并列时取偏移小的
      const score = cross * 100000 + self * 10000 + Math.abs(c.d);
      if (!bestC || score < bestC.score) bestC = { score, pts:c.pts, cross, self, d:c.d };
      // 既不穿别人也不穿自己、还是直连 —— 那就是最好，不用再试
      if (cross === 0 && self === 0 && c.d === 0) break;
    }
    if (bestC) pts = bestC.pts;
  }

  /* ★★ 兜底：走线穿过**两端自己**时，换成正经的正交寻路。
     ⚠ 这一段必须在 if (boxes.length) **外面** ——
        avoidBoxes 按契约把两端排除掉，所以「只有两个节点」时
        boxes 是空的，原来整块（含这里的检查）都被跳过，
        于是新文件里两个挨得近的节点必然穿过自己；
        多放第三个节点之后 obstacles 非空，整块才跑起来
        —— 这就是「再新建一个节点就正常了」的原因。
     躲的范围 = 别的障碍 + 两端自己。两端自己也必须躲，
     那正是「穿过自己」的来源。 */
  const selfBoxes = [a, b].filter(Boolean);
  if (selfBoxes.length && pathCrossCountInner(pts, selfBoxes) > 0){
    const routed = routeOrthoAStar(p0, p1, p2, p3, boxes.concat(selfBoxes));
    if (routed && pathCrossCountInner(routed, selfBoxes) === 0) pts = routed;
  }
  /* 收尾清理：
     ① 扔掉完全重合的点
     ② **吃掉共线的中间点** —— 并排且对齐的两个节点本来会生成
        148,24 → 170,24 → 324,24 → 478,24 → 500,24 这么一串共线的点（5 个），
        其实两个点就够。留着不只是浪费：pts.length 虚高之后，
        箭头角度、拐点手柄、mid 都可能落在一个根本不存在的「折点」上。 */
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++){
    const q = pts[i], p = clean[clean.length - 1];
    if (Math.abs(q.x - p.x) <= 0.5 && Math.abs(q.y - p.y) <= 0.5) continue;
    const m = clean.length;
    if (m >= 2){
      const a2 = clean[m - 2];
      const cross = (p.x - a2.x) * (q.y - a2.y) - (p.y - a2.y) * (q.x - a2.x);
      /* ★ 必须是**方向一致**才合并。
         三点共线但中间那个是「掉头」（p 在 a2 和 q 之间折返）时，
         吃掉它等于把折返拉直 —— 线就切进盒子里了。
         判据：a2→q 的向量和 a2→p 的向量同向（点积 > 0）。 */
      const dot = (q.x - a2.x) * (p.x - a2.x) + (q.y - a2.y) * (p.y - a2.y);
      if (Math.abs(cross) < 0.5 && dot > 0){ clean[m - 1] = q; continue; }
    }
    clean.push(q);
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

