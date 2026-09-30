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
const PORT_MAX_PER_DIR = 8;                    // 一边最多几个，太多画不下也点不准
const PORT_HIT_R = 12;                         // 命中半径（世界单位，缩放会修正）
const PORT_DOT_R = 4.5;
const PORT_LABEL_GAP = 10;

/* 默认端点：左右进出、上下备用，位置都在那条边的正中。
   普通变量 / 输出 / 控件节点只要一个出口；运算符以后要两个入口。 */
function defaultPorts(n){
  return {
    ins:  [{ id:1, side:'l', at:0.5, label:'' }],
    outs: [{ id:3, side:'r', at:0.5, label:'' }]
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
  const src = (ports && (Array.isArray(ports.ins) || Array.isArray(ports.outs))) ? ports : null;
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
  return { ins:take(src.ins), outs:take(src.outs) };
}
/* 拿到实际生效的端点表（没配就是默认） */
function portList(n){
  if (!n) return { ins:[], outs:[] };
  const own = normalizePorts(n.ports);
  if (own) return own;
  return defaultPorts(n);
}
const nodePorts = (n) => portList(n).ins.concat(portList(n).outs);

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
  for (const dir of ['ins', 'outs']){
    for (const p of L[dir]){
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
  if (!n || (dir !== 'ins' && dir !== 'outs')) return null;
  const L = normalizePorts(n.ports) || defaultPorts(n);
  if (L[dir].length >= PORT_MAX_PER_DIR){
    say('* 一边最多 ' + PORT_MAX_PER_DIR + ' 个端点。');
    return null;
  }
  // 挑用得最少的一条边
  const count = {};
  for (const s of PORT_SIDES) count[s] = 0;
  for (const d of ['ins', 'outs']) for (const p of L[d]) count[p.side] = (count[p.side] || 0) + 1;
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
  for (const d of ['ins', 'outs']) for (const p of L[d]) if (p.side === side) same.push(p);
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

/* ---------------- 绘制 ---------------- */

/* 端点小圆点。标签只在**悬停或选中**时画 —— 平时画会糊成一片。 */
function drawPorts(g, n, showLabel){
  if (!n) return;
  const L = portList(n);
  const hl = (typeof hoverPort !== 'undefined' && hoverPort && hoverPort.node === n) ? hoverPort : null;
  g.save();
  for (const dir of ['ins', 'outs']){
    for (const p of L[dir]){
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
        const txt = p.label || ('#' + p.id);
        setFont(g, Math.max(11, FS - 4), 'normal', FONT);
        g.fillStyle = on ? C.yellow : C.gray;
        g.textBaseline = 'middle';
        let lx = pt.x, ly = pt.y;
        if (p.side === 'l'){ g.textAlign = 'right'; lx = pt.x - PORT_LABEL_GAP; }
        else if (p.side === 'r'){ g.textAlign = 'left'; lx = pt.x + PORT_LABEL_GAP; }
        else { g.textAlign = 'center'; ly = pt.y + (p.side === 't' ? -PORT_LABEL_GAP : PORT_LABEL_GAP); }
        if (p.side === 't' || p.side === 'b') g.textBaseline = (p.side === 't') ? 'bottom' : 'top';
        g.fillText(txt, lx, ly);
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
