'use strict';
/* ==========================================================================
   GRAPHEON · core/vars.js
   变量系统：变量定义节点、文本里的 {name} 引用、运算节点、函数分组、优先级。

   三条贯穿全篇的规矩：

   1. **一切是派生的。** 求值结果只写进 idx.text / idx.varVal 这些派生表，
      绝不写回 n.text、n.varDef —— 否则撤销栈会被污染，删掉变量节点也回不去。
   2. **变量定义节点优先级最高。** 它默认 priority = 1000，先算出来给别人用；
      程序节点的优先级可以手动设，决定算符叠加的先后。
   3. **函数分组的运算只看组内。** 只有「两端都在组内」的边才参与，
      外部接进来的边一律不算。
   ========================================================================== */

const VAR_PRIORITY = 1000;        // 变量定义节点的默认优先级（最高）
const OP_PRIORITY  = 100;         // 运算节点的默认优先级
const OP_KINDS = ['+', '-', '*', '/'];
const VAR_SCOPES = ['global', 'local', 'group'];
const VAR_SCOPE_LABEL = { global:'全局', local:'局内', group:'组内' };
const VAR_TYPES = ['number', 'string'];
const VAR_TYPE_LABEL = { number:'数字', string:'字符串' };

const isVarNode = (n) => !!n && n.kind === 'var';
const isOpNode  = (n) => !!n && n.kind === 'op';

/* ---------------- 数据规范化 ---------------- */
function normalizeVarDef(v){
  const out = Object.assign({ name:'x', value:'0', type:'number', scope:'global' }, v || {});
  out.name = String(out.name == null ? '' : out.name).replace(/[{}]/g, '').trim() || 'x';
  if (VAR_TYPES.indexOf(out.type) < 0) out.type = 'number';
  if (VAR_SCOPES.indexOf(out.scope) < 0) out.scope = 'global';
  out.value = String(out.value == null ? '' : out.value);
  return out;
}
function normalizeOpDef(o){
  const out = Object.assign({ op:'+', operand:'1', type:'number' }, o || {});
  if (OP_KINDS.indexOf(out.op) < 0) out.op = '+';
  if (VAR_TYPES.indexOf(out.type) < 0) out.type = 'number';
  out.operand = String(out.operand == null ? '' : out.operand);
  return out;
}
/* 节点的优先级：变量最高，运算其次，其余看 n.priority，最后 0 */
function priorityOf(n){
  if (!n) return 0;
  if (typeof n.priority === 'number' && n.priority !== 0) return n.priority;
  if (isVarNode(n)) return VAR_PRIORITY;
  if (isOpNode(n))  return OP_PRIORITY;
  return 0;
}
/* 数值化。用来算数；算不了就退回字符串。 */
function toNum(v){
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim();
  if (s === '' || isNaN(Number(s))) return null;
  return Number(s);
}
/* 把运算节点的算符作用到值上 */
function applyOperator(v, od){
  const o = normalizeOpDef(od);
  const a = toNum(v), b = toNum(o.operand);
  // 两边都能当数字就按数字算；否则只有 + 有意义（拼字符串）
  if (a == null || b == null){
    if (o.op === '+') return String(v == null ? '' : v) + String(o.operand);
    return String(v == null ? '' : v);
  }
  if (o.op === '+') return a + b;
  if (o.op === '-') return a - b;
  if (o.op === '*') return a * b;
  if (o.op === '/') return b === 0 ? 0 : a / b;
  return a;
}
/* 显示用：数字去尾零，字符串原样 */
function valueToText(v){
  if (v == null) return '[未定义]';
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

/* ---------------- 作用域 ---------------- */
/* 从 from 出发沿边往下游走，收集能到达的节点 id（含 from） */
function downstreamOf(startId, inside){
  const seen = new Set([startId]);
  let frontier = [startId];
  while (frontier.length){
    const next = [];
    for (const id of frontier){
      for (const e of doc.edges){
        if (e.s !== id) continue;
        if (inside && (!inside.has(e.s) || !inside.has(e.t))) continue;
        if (seen.has(e.t)) continue;
        seen.add(e.t);
        next.push(e.t);
      }
    }
    frontier = next;
  }
  return seen;
}
/* 这个变量定义对 fromId 可见吗 */
function varVisible(def, fromId){
  const v = normalizeVarDef(def.varDef);
  if (v.scope === 'global') return true;
  if (def.id === fromId) return true;
  if (v.scope === 'local'){
    return downstreamOf(def.id).has(fromId);            // 局内：只有下游能用
  }
  // 组内：这个变量节点指向哪个分组，那个分组里的节点才能用
  for (const e of doc.edges){
    if (e.s !== def.id) continue;
    const grp = byGroup(e.t);
    if (!grp) continue;
    if (groupAllNodes(grp.id).indexOf(fromId) >= 0) return true;
  }
  return false;
}
/* 找一个名字对 fromId 可见的变量定义。同名时优先级高的赢，再同就取靠前的。 */
function findVarDef(name, fromId){
  let best = null, bestP = -Infinity;
  for (const n of doc.nodes){
    if (!isVarNode(n)) continue;
    if (normalizeVarDef(n.varDef).name !== name) continue;
    if (!varVisible(n, fromId)) continue;
    const p = priorityOf(n);
    if (p > bestP){ bestP = p; best = n; }
  }
  return best;
}

/* ---------------- 函数分组 ---------------- */
const isFunctionGroup = (g) => !!g && !!g.isFunction;
/* 组内计算：只看「两端都在组内」的边 */
function functionResult(grp){
  if (!grp) return null;
  const inside = new Set(groupAllNodes(grp.id));
  // 组内的变量定义节点（优先级最高的那个当返回值）
  let def = null, bestP = -Infinity;
  for (const id of inside){
    const n = byId(id);
    if (!isVarNode(n)) continue;
    const p = priorityOf(n);
    if (p > bestP){ bestP = p; def = n; }
  }
  if (!def) return null;
  return evalFrom(def, normalizeVarDef(def.varDef).value, inside);
}
/* 从变量定义出发，沿边把算符推下去。
   start 是起点值（可能已经被函数分组替换过），inside 非空时只在它里面走。
   targetId 给了就在到达它时返回；没给就返回推完一圈的最终值。

   ⚠ 值必须**每条路径各带各的**。早先图省事用一个共享累加器走 BFS，
   结果一条分支上的运算泄漏到了兄弟分支（v→运算A→甲 会污染 v→乙）。 */
function evalFrom(def, start, inside, targetId){
  if (targetId && def.id === targetId) return start;
  const seen = new Set([def.id]);
  let frontier = [{ id:def.id, v:start }];
  let last = start;
  while (frontier.length){
    const next = [];
    for (const cur of frontier){
      // 同一个节点可能引出多条边，按优先级排序，保证结果确定
      const outs = doc.edges
        .map((e, i) => ({ e, i }))
        .filter(x => x.e.s === cur.id
                  && !seen.has(x.e.t)
                  && (!inside || (inside.has(x.e.s) && inside.has(x.e.t))))
        .sort((x, y) => (priorityOf(byId(x.e.s)) - priorityOf(byId(y.e.s))) || (x.i - y.i));
      for (const { e } of outs){
        if (seen.has(e.t)) continue;
        seen.add(e.t);
        const m = byId(e.t);
        const out = (m && isOpNode(m)) ? applyOperator(cur.v, m.opDef) : cur.v;
        if (targetId && e.t === targetId){
          // 看到的是「进这个节点时的值」：运算节点自己看输入，别的一律看输出
          return (m && isOpNode(m)) ? cur.v : out;
        }
        last = out;
        next.push({ id:e.t, v:out });
      }
    }
    frontier = next;
  }
  return targetId ? null : last;
}
/* 一个变量定义节点最终对外提供的值。
   如果它指向一个函数分组，值就变成那个分组内部算出来的值。 */
function defValue(def){
  if (!def) return null;
  for (const e of doc.edges){
    if (e.s !== def.id) continue;
    const grp = byGroup(e.t);
    if (grp && isFunctionGroup(grp)){
      const r = functionResult(grp);
      if (r != null) return r;
    }
  }
  // 没指向函数分组：就是它自己填的那个值（往下游的算符由 resolveVar 沿路施加）
  return normalizeVarDef(def.varDef).value;
}
/* 解析 fromId 看到的变量值。找不到定义返回 null。 */
function resolveVar(name, fromId){
  const def = findVarDef(name, fromId);
  if (!def) return null;
  const base = defValue(def);
  if (def.id === fromId) return base;
  // 从「定义最终提供的值」出发往下游推，沿路把运算节点的算符作用上。
  // 起点必须用 base —— 拿 n.varDef.value 重走会把函数分组的替换结果覆盖掉。
  const mid = evalFrom(def, base, null, fromId);
  return (mid == null) ? base : mid;
}

/* ---------------- 文本插值 ---------------- */
const VAR_TOKEN = /\\\{|\{([^}\n]*)\}/g;
/* 把 {name} 换成变量值。\{name} 转义成字面量 {name}；找不到就显示 [未定义]。 */
function interpolate(text, fromId){
  const s = String(text == null ? '' : text);
  if (s.indexOf('{') < 0 && s.indexOf('\\') < 0) return s;
  return s.replace(VAR_TOKEN, (m, name) => {
    if (m === '\\{') return '{';
    const v = resolveVar(name, fromId);
    return valueToText(v);
  });
}
/* 渲染和量尺寸都读这个：没被替换过就还是原文 */
function displayTextOf(n){
  if (!n) return '';
  const t = idx.text && idx.text.get(n.id);
  return t == null ? String(n.text == null ? '' : n.text) : t;
}
/* 有没有引用（用来给节点加个小标记） */
const hasVarRefs = (n) => !!n && /\{[^}\n]*\}/.test(String(n.text || ''));

/* reindex 末尾调用：算一遍所有节点的显示文本 */
function refreshVarText(){
  idx.text = new Map();
  for (const n of doc.nodes){
    const t = interpolate(n.text, n.id);
    if (t !== n.text) idx.text.set(n.id, t);
  }
}
