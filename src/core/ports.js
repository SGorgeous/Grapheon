'use strict';
/* ==========================================================================
   GRAPHEON · core/ports.js
   端点模型 —— 每个程序节点的输入 / 输出端点。

   ┌─ 一个端点 ─────────────────────────────────────────────┐
   │ id     纯数字，节点内唯一（ins 和 outs 加起来不能重复）  │
   │ side   't' | 'b' | 'l' | 'r'，挂在哪条边上              │
   │ at     0..1，沿那条边的位置（0.5 = 正中）               │
   │ label  文字，**只在悬停 / 选中时显示**                  │
   └────────────────────────────────────────────────────────┘

   ★ 没有 ports 字段 = 用默认端点。默认端点的位置和以前那套
     「四向中点」**一模一样**，所以老存档零改动、画面零变化。

   ★ id 不只是标识 —— 多输入节点（运算符 / 循环）按 **id 升序**汇合，
     所以 id 决定了求值顺序。改 id 就是改顺序，这是有意的。
   ========================================================================== */

const PORT_SIDES = ['t', 'b', 'l', 'r'];
/* 端点分三类：
     ins   —— 输入端点：数据从这儿进来（程序节点用）
     outs  —— 输出端点：数据从这儿出去（程序节点用）
     conns —— **连接端点**：只管连不连得上，**不参与任何求值**。
              普通节点默认四条边各一个 —— 老的「四方向点」正式收编成端点。 */
const PORT_DIRS = ['ins', 'outs', 'conns'];
const PORT_MAX_PER_DIR = 8;                    // 一边最多几个，太多画不下也点不准
const PORT_HIT_R = 12;                         // 命中半径（世界单位，缩放会修正）
const PORT_DOT_R = 4.5;
const PORT_LABEL_GAP = 10;

/* ★ 哪些节点**有**输入 / 输出端点：只有「有明确输入输出」的程序节点。
   普通节点 / 图片 / 表格 / 嵌入 都不画端点 ——
   它们靠边上的锚点连线就行，摆一堆小方块反而糊。
   （分组另有一套四向锚点，不走这里。） */
const PORTED_KINDS = ['var', 'broadcast', 'op', 'out', 'program'];
const hasPorts = (n) => !!n && PORTED_KINDS.indexOf(n.kind) >= 0;

/* 默认端点：左右进出、上下备用，位置都在那条边的正中。
   普通变量 / 输出 / 控件节点只要一个出口；运算符以后要两个入口。 */
function defaultPorts(n){
  /* 运算符节点：两个输入端点，各对一个操作数格子（按 ID 升序就是运算顺序）。
     广播节点：只有一个输入 —— 它的值来自上游，没有输出端点。 */
  if (n && n.kind === 'op'){
    const arity = (typeof opArity === 'function') ? opArity(normalizeOpDef(n.opDef).op) : 1;
    const ins = [{ id:1, side:'l', at:0.5, label:'操作数 1' }];
    for (let i = 0; i < arity; i++){
      ins.push({ id:2 + i, side:'l', at:0.5, label:'操作数 ' + (i + 2) });
    }
    spreadPorts({ ins, outs:[] }, 'l');
    return { ins, outs:[{ id:2 + arity, side:'r', at:0.5, label:'' }], conns:[] };
  }
  if (n && n.kind === 'broadcast'){
    return { ins:[{ id:1, side:'l', at:0.5, label:'取值' }], outs:[], conns:[] };
  }
  if (n && n.kind === 'program'){
    return { ins:[{ id:1, side:'l', at:0.5, label:'' }], outs:[], conns:[] };
  }
  if (n && n.kind === 'cond'){
    return { ins:[{ id:1, side:'l', at:0.5, label:'条件' }],
             outs:[{ id:3, side:'r', at:0.5, label:'' }], conns:[] };
  }
  /* ★ 普通节点（以及图片 / 表格 / 嵌入）：**四条边各一个连接端点**。
     连接端点只管连不连得上，不参与求值。 */
  return {
    ins:  [],
    outs: [],
    conns: PORT_SIDES.map((s, i) => ({ id:i + 1, side:s, at:0.5, label:'' }))
  };
}

function normalizePort(p, fallbackId){
  const o = (p && typeof p === 'object') ? p : {};
  const id = Math.round(+o.id);
  return {
    id: (isFinite(id) && id > 0) ? id : fallbackId,
    side: PORT_SIDES.indexOf(o.side) >= 0 ? o.side : 'r',
    at: (typeof o.at === 'number' && o.at >= 0 && o.at <= 1) ? o.at : 0.5,
    label: o.label == null ? '' : String(o.label)
  };
}
/* 规整一张端点表。id 重复的话，后面的那个往后挪到第一个空位 ——
   宁可自动让开，也不要因为一个手滑的数字就让整份文档读不出来。 */
function normalizePorts(ports){
  const src = (ports && (Array.isArray(ports.ins) || Array.isArray(ports.outs)
                         || Array.isArray(ports.conns))) ? ports : null;
  if (!src) return null;                       // null = 用默认
  const used = new Set();
  const take = (list, dirFallback) => {
    const out = [];
    (Array.isArray(list) ? list : []).slice(0, PORT_MAX_PER_DIR).forEach((p, i) => {
      const q = normalizePort(p, i + 1);
      if (used.has(q.id)){
        let k = 1;
        while (used.has(k)) k++;
        q.id = k;
      }
      used.add(q.id);
      out.push(q);
    });
    return out;
  };
  return { ins:take(src.ins), outs:take(src.outs), conns:take(src.conns) };
}
/* 拿到实际生效的端点表（没配就是默认） */
function portList(n){
  if (!n) return { ins:[], outs:[], conns:[] };
  const own = normalizePorts(n.ports);
  if (own) return own;
  return defaultPorts(n);
}
const nodePorts = (n) => {
  const L = portList(n);
  return L.ins.concat(L.outs, L.conns || []);
};

/* 端点在世界里的位置 */
function portPoint(n, port){
  const b = nodeBox(n);
  const at = (port && typeof port.at === 'number') ? port.at : 0.5;
  if (!port || port.side === 'r') return { x:b.x + b.w, y:b.y + b.h * at };
  if (port.side === 'l') return { x:b.x, y:b.y + b.h * at };
  if (port.side === 't') return { x:b.x + b.w * at, y:b.y };
  return { x:b.x + b.w * at, y:b.y + b.h };
}
/* 按数字 id 找端点 */
function portById(n, id){
  const all = nodePorts(n);
  for (const p of all) if (p.id === id) return p;
  return null;
}
/* 所有端点里已经用掉的 id */
function usedPortIds(n, exceptDir, exceptId){
  const s = new Set();
  const L = portList(n);
  for (const dir of PORT_DIRS){
    for (const p of (L[dir] || [])){
      if (dir === exceptDir && p.id === exceptId) continue;
      s.add(p.id);
    }
  }
  return s;
}
/* 下一个没用过的 id */
function nextPortId(n){
  const used = usedPortIds(n);
  let k = 1;
  while (used.has(k)) k++;
  return k;
}

/* ---------------- 改端点 ---------------- */

/* 改 id。★ 不重复是硬要求 —— 撞了就拒绝并说明，不偷偷改掉。
   改 id 会改多输入节点的汇合顺序，这是设计的一部分。 */
function setPortId(n, dir, oldId, newId){
  if (!n || (dir !== 'ins' && dir !== 'outs')) return false;
  const v = Math.round(+newId);
  if (!isFinite(v) || v <= 0){
    say('* 端点 ID 得是正整数。');
    return false;
  }
  if (usedPortIds(n, dir, oldId).has(v)){
    say('* 端点 ID ' + v + ' 已经用过了，换一个。');
    return false;
  }
  const L = normalizePorts(n.ports) || defaultPorts(n);
  let hit = null;
  for (const p of L[dir]) if (p.id === oldId){ p.id = v; hit = p; }
  if (!hit) return false;
  n.ports = L;
  reindex(); sizeAll(); mark();
  return true;
}
function setPortLabel(n, dir, id, label){
  if (!n || (dir !== 'ins' && dir !== 'outs')) return false;
  const L = normalizePorts(n.ports) || defaultPorts(n);
  let hit = null;
  for (const p of L[dir]) if (p.id === id){ p.label = String(label == null ? '' : label); hit = p; }
  if (!hit) return false;
  n.ports = L;
  mark();
  return true;
}
/* 加一个端点：自动挑一条还有空位的边，位置均分 */
function addPort(n, dir){
  if (!n || PORT_DIRS.indexOf(dir) < 0) return null;
  const L = normalizePorts(n.ports) || defaultPorts(n);
  if (L[dir].length >= PORT_MAX_PER_DIR){
    say('* 一边最多 ' + PORT_MAX_PER_DIR + ' 个端点。');
    return null;
  }
  // 挑用得最少的一条边
  const count = {};
  for (const s of PORT_SIDES) count[s] = 0;
  for (const d of PORT_DIRS) for (const p of (L[d] || [])) count[p.side] = (count[p.side] || 0) + 1;
  let side = PORT_SIDES[0];
  for (const s of PORT_SIDES) if (count[s] < count[side]) side = s;
  const p = { id:nextPortId(n), side, at:0.5, label:'' };
  L[dir].push(p);
  spreadPorts(L, side);
  n.ports = L;
  reindex(); sizeAll(); mark();
  return p;
}
function removePort(n, dir, id){
  if (!n || (dir !== 'ins' && dir !== 'outs')) return false;
  const L = normalizePorts(n.ports) || defaultPorts(n);
  if (L[dir].length <= 1){
    say('* 至少留一个' + (dir === 'ins' ? '输入' : '输出') + '端点。');
    return false;
  }
  const before = L[dir].length;
  L[dir] = L[dir].filter(p => p.id !== id);
  if (L[dir].length === before) return false;
  for (const s of PORT_SIDES) spreadPorts(L, s);
  n.ports = L;
  // 挂在它上面的边不删，回落到该方向的第一个端点（第 8 节：删端点不删边）
  if (typeof reindex === 'function') reindex();
  sizeAll(); mark();
  return true;
}
/* 同一条边上的端点均匀铺开，免得叠在一起 */
function spreadPorts(L, side){
  const same = [];
  for (const d of PORT_DIRS) for (const p of (L[d] || [])) if (p.side === side) same.push(p);
  same.sort((a, b) => a.id - b.id);            // 按 id 排，顺序稳定
  same.forEach((p, i) => { p.at = (i + 1) / (same.length + 1); });
}
/* 恢复默认端点 */
function resetPorts(n){
  if (!n) return;
  n.ports = null;
  reindex(); sizeAll(); mark();
  say('* 端点恢复默认。');
}

/* 落点压在某个端点上就返回它的 id，否则 null。
   拉线时用它把边**钉死在你拖到的那个端点**上 ——
   没有这个的话，边只能按「哪条边」自动挑，同边的多个端点就分不出来了
   （症状：不管怎么选，都吸到同一条边 / 同一个位置）。 */
function portIdAtPoint(p, node){
  if (!node || typeof portList !== 'function') return null;
  const tol = 12 / Math.max(0.2, view.z);
  let best = null, bestD = Infinity;
  for (const q of portList(node).ins.concat(portList(node).outs)){
    const pt = portPoint(node, q);
    const d = Math.hypot(pt.x - p.x, pt.y - p.y);
    if (d <= tol && d < bestD){ bestD = d; best = q; }
  }
  return best;
}
/* 把一条边的某一端钉到端点上，顺带把方向也对齐 */
function pinEdgePort(e, end, node, port){
  if (!e || !port) return false;
  if (end === 'a'){ e.aPort = port.id; e.aSide = port.side; }
  else { e.bPort = port.id; e.bSide = port.side; }
  return true;
}

/* ---------------- 拖动改方向 ---------------- */

/* 按住一个端点往哪条边走。用「离哪条边最近」判断，比算角度稳。 */
function sideFromPoint(n, p){
  const b = nodeBox(n);
  const d = {
    l: Math.abs(p.x - b.x),
    r: Math.abs(p.x - (b.x + b.w)),
    t: Math.abs(p.y - b.y),
    b: Math.abs(p.y - (b.y + b.h))
  };
  let best = 'r';
  for (const s of PORT_SIDES) if (d[s] < d[best]) best = s;
  return best;
}
/* 落在那条边上的什么位置（0..1），夹住别跑到角外面 */
function atFromPoint(n, side, p){
  const b = nodeBox(n);
  let at;
  if (side === 'l' || side === 'r') at = (p.y - b.y) / Math.max(1, b.h);
  else at = (p.x - b.x) / Math.max(1, b.w);
  return Math.max(0.08, Math.min(0.92, at));
}
/* 拖动中：改方向 + 改位置 */
function movePort(n, dir, id, p){
  const L = normalizePorts(n.ports) || defaultPorts(n);
  let hit = null;
  for (const q of L[dir]) if (q.id === id) hit = q;
  if (!hit) return false;
  const side = sideFromPoint(n, p);
  hit.side = side;
  hit.at = atFromPoint(n, side, p);
  n.ports = L;
  mark();
  return true;
}
/* 找鼠标底下的端点。只在**节点被选中或悬停**时才算命中 ——
   平时要留出那些位置给「从端点拉线」。 */
function portHitAt(p, node){
  const tol = Math.max(6, PORT_HIT_R / Math.max(0.2, view.z));
  const list = node ? [node] : doc.nodes;
  let best = null, bestD = Infinity;
  for (const n of list){
    if (!n || isHidden(n.id) || isEmbed(n)) continue;
    // 只在「全局找」时才要求它已经显示；显式指定了节点就直接算（双击就是这个用法）
    if (!node && !portsShowLabel(n)) continue;
    const L = portList(n);
    for (const dir of PORT_DIRS){
      for (const q of L[dir]){
        const pt = portPoint(n, q);
        const d = Math.hypot(pt.x - p.x, pt.y - p.y);
        if (d <= tol && d < bestD){ bestD = d; best = { node:n, dir, port:q }; }
      }
    }
  }
  return best;
}
/* ★ 拖端点的把手 = 端点旁边一个**实心小方块**，不是圆点。
   圆点留给「从这里拉一条线出去」—— 那个手势不能抢，
   抢了就没法从选中的节点连线了（I04 断言盯着这条）。
   方块只在节点**被选中 / 悬停**时画出来，所以平时那块地方是空的。

   ⚠ 命中必须**按几何算**，不能靠 hover 变量 —— 方块画在盒子**外面**，
    鼠标移上去时 hitNode 落空、hover 会被清成 null，把手就没了。
     这正是「端点拖不动」的原因。 */
const PORT_SQ = 9;                      // 方块的边长（世界单位）
const PORT_SQ_GAP = 7;                  // 方块离圆点多远
const PORT_OUT = { l:{ x:-1, y:0 }, r:{ x:1, y:0 }, t:{ x:0, y:-1 }, b:{ x:0, y:1 } };
/* 把手方块的矩形 —— 画和命中用同一份，保证所见即所得 */
function portHandleBox(n, port){
  const pt = portPoint(n, port);
  const o = PORT_OUT[port.side] || PORT_OUT.r;
  const cx = pt.x + o.x * (PORT_DOT_R + PORT_SQ_GAP + PORT_SQ / 2);
  const cy = pt.y + o.y * (PORT_DOT_R + PORT_SQ_GAP + PORT_SQ / 2);
  return { x:cx - PORT_SQ / 2, y:cy - PORT_SQ / 2, w:PORT_SQ, h:PORT_SQ };
}
/* 标签画在方块再往外一点 */
function portLabelPoint(n, port){
  const pt = portPoint(n, port);
  const o = PORT_OUT[port.side] || PORT_OUT.r;
  const d = PORT_DOT_R + PORT_SQ_GAP + PORT_SQ + 6;
  return { x:pt.x + o.x * d, y:pt.y + o.y * d, side:port.side };
}
/* 鼠标底下的把手。候选 = 显式给的那个 + 选中的那些 + 悬停的那个。
   ⚠ 只在「方块确实画出来了」的节点上找 —— 无差别扫所有节点的话，
     连线中间的点会被误抓成把手，建拐点那个手势就废了（V01 断言盯着）。 */
function portHandleAt(p, node){
  const cands = [];
  const push = (n) => { if (n && cands.indexOf(n) < 0) cands.push(n); };
  if (node) push(node);
  if (typeof sel !== 'undefined' && sel && sel.forEach) sel.forEach(id => push(byId(id)));
  if (typeof hover !== 'undefined') push(hover);
  for (const n of cands){
    if (!n || isHidden(n.id) || isEmbed(n)) continue;
    if (!hasPorts(n)) continue;              // 非程序节点没有可拖的端点
    if (!portsShowLabel(n)) continue;
    for (const dir of PORT_DIRS){
      for (const q of portList(n)[dir]){
        if (inBox(portHandleBox(n, q), p)) return { node:n, dir, port:q };
      }
    }
  }
  return null;
}
/* 端点编辑框里那句话怎么理解。
   「5」      → 只改 ID
   「5 系数」 → 改 ID + 标签
   「系数」   → 只改标签
   这样一个小框同时管两样，不用再开一个面板。 */
function parsePortEdit(text){
  const s = String(text == null ? '' : text).trim();
  const m = s.match(/^#?(\d+)(?:\s+(.*))?$/);
  if (!m) return { id:null, label:s };
  return { id:Math.round(+m[1]), label:(m[2] == null ? null : m[2].trim()) };
}
/* 双击端点的入口 */
function editPort(n, dir, id){
  const p = portById(n, id);
  if (!p) return;
  startEdit('port', n.id, '#' + p.id + (p.label ? ' ' + p.label : ''), { dir, portId:id });
}

/* ---------------- 绘制 ---------------- */

/* 端点小圆点。标签只在**悬停或选中**时画 —— 平时画会糊成一片。 */
function drawPorts(g, n, showLabel){
  if (!n) return;
  /* 只有「有明确输入输出」的程序节点才画端点。
     普通 / 图片 / 表格节点不画 —— 但它们的端点模型还在，
     所以照样能从边上拉线、线也照样接得上去。 */
  if (!hasPorts(n)) return;
  const L = portList(n);
  const hl = (typeof hoverPort !== 'undefined' && hoverPort && hoverPort.node === n) ? hoverPort : null;
  g.save();
  for (const dir of PORT_DIRS){
    for (const p of (L[dir] || [])){
      const pt = portPoint(n, p);
      const on = hl && hl.port && hl.port.id === p.id;
      const r = on ? PORT_DOT_R * 1.5 : PORT_DOT_R;
      g.beginPath();
      g.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      g.fillStyle = on ? C.yellow : (dir === 'ins' ? C.gray : C.yellow);
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = C.bg;
      g.stroke();
      if (showLabel){
        // 拖拽把手：端点旁边一个实心方块。用户看到的就是能拖的那个东西。
        const hb = portHandleBox(n, p);
        g.fillStyle = on ? C.yellow : (dir === 'ins' ? C.gray : C.yellow);
        g.globalAlpha = on ? 1 : 0.75;
        g.fillRect(hb.x, hb.y, hb.w, hb.h);
        g.globalAlpha = 1;
        g.lineWidth = 2;
        g.strokeStyle = C.bg;
        g.strokeRect(hb.x, hb.y, hb.w, hb.h);
        // 标签再往外一点
        const lp = portLabelPoint(n, p);
        const txt = p.label || ('#' + p.id);
        setFont(g, Math.max(11, FS - 4), 'normal', FONT);
        g.fillStyle = on ? C.yellow : C.gray;
        if (lp.side === 'l'){ g.textAlign = 'right'; g.textBaseline = 'middle'; }
        else if (lp.side === 'r'){ g.textAlign = 'left'; g.textBaseline = 'middle'; }
        else { g.textAlign = 'center'; g.textBaseline = (lp.side === 't') ? 'bottom' : 'top'; }
        g.fillText(txt, lp.x, lp.y);
      }
    }
  }
  g.restore();
}
/* 端点要不要显示标签：悬停这个节点、或者它被选中（多选也算） */
function portsShowLabel(n){
  if (!n) return false;
  if (typeof sel !== 'undefined' && sel.has && sel.has(n.id)) return true;
  if (typeof hover !== 'undefined' && hover === n) return true;
  if (typeof singleSel !== 'undefined' && singleSel && singleSel.id === n.id) return true;
  return false;
}
