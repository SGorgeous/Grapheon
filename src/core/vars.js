'use strict';
/* ==========================================================================
   GRAPHEON · core/vars.js
   变量系统：变量定义节点、文本里的 {name} 引用、运算节点、函数分组、输出节点、优先级。

   五条贯穿全篇的规矩：

   1. **一切是派生的。** 求值结果只写进 idx.text 这些派生表，绝不写回
      n.text / n.varDef —— 否则撤销栈会被污染，删掉变量定义也回不去。
   2. **求值核心吃一个 Ctx。** 不直接读全局 doc/idx，所以同一套逻辑既能算
      当前文档，也能算一个嵌入文档里的输出值（{嵌入名.输出名}）。
   3. **函数分组内外完全隔离。** 一个变量节点的「全局」指的是它所在的函数分组
      内部的全局；跨过分组边界互相都看不见。
   4. **运算符是一张表。** 加自定义算符 / 双输入只要往 OPERATORS 里加一条，
      布局、命中、面板、求值全都是按 arity 算出来的。
   5. **每个作用域只有一个输出节点生效。** 作用域 = 顶层文档 / 某个函数分组 /
      某个嵌入文档。没声明输出就是空（显示 [未定义]）。
   ========================================================================== */

const VAR_PRIORITY = 1000;        // 变量定义节点的默认优先级（最高）
const OP_PRIORITY  = 100;         // 运算节点的默认优先级
const OUT_PRIORITY = 900;         // 输出节点仅次于变量定义
const VAR_SCOPES = ['global', 'local', 'group'];
const VAR_SCOPE_LABEL = { global:'全局', local:'局内', group:'组内' };
const VAR_SCOPE_HINT = {
  global:'本作用域内到处都能用',
  local:'只有它的下游能用',
  group:'把它连到一个分组，组内才能用'
};
const VAR_TYPES = ['number', 'string'];
const VAR_TYPE_LABEL = { number:'数字', string:'字符串' };

const isVarNode = (n) => !!n && n.kind === 'var';
const isOpNode  = (n) => !!n && n.kind === 'op';
const isOutNode = (n) => !!n && n.kind === 'out';

/* =========================================================================
   运算符注册表
   以后要加自定义算符 / 双输入，只要往这里加一条：
     arity 是运算值框的个数，apply(v, args) 里 args 的长度等于 arity。
   布局（opBoxes）、命中（hitOpPart）、面板、求值全都按 arity 自动算。
   ========================================================================= */
function numArgs(v, args, fn){
  const a = toNum(v);
  const b = toNum(args[0]);
  if (a == null || b == null) return v;       // 不能当数字就不动它
  return fn(a, b);
}
const OPERATORS = [
  { id:'+', label:'+', arity:1, hint:'加（数字）/ 拼接（字符串）',
    apply:(v, args) => {
      const a = toNum(v), b = toNum(args[0]);
      if (a == null || b == null) return String(v == null ? '' : v) + String(args[0]);
      return a + b;
    } },
  { id:'-', label:'-', arity:1, hint:'减', apply:(v, a) => numArgs(v, a, (x, y) => x - y) },
  { id:'*', label:'*', arity:1, hint:'乘', apply:(v, a) => numArgs(v, a, (x, y) => x * y) },
  { id:'/', label:'/', arity:1, hint:'除（除以 0 得 0）',
    apply:(v, a) => numArgs(v, a, (x, y) => y === 0 ? 0 : x / y) }
];
const OP_BY_ID = new Map(OPERATORS.map(o => [o.id, o]));
const OP_IDS = OPERATORS.map(o => o.id);
const opDefOf = (id) => OP_BY_ID.get(id) || OPERATORS[0];
const opArity = (id) => opDefOf(id).arity;

/* ---------------- 数据规范化 ---------------- */
function normalizeVarDef(v){
  const out = Object.assign({ name:'x', value:'0', type:'number', scope:'global' }, v || {});
  out.name = String(out.name == null ? '' : out.name).replace(/[{}.\s]/g, '') || 'x';
  if (VAR_TYPES.indexOf(out.type) < 0) out.type = 'number';
  if (VAR_SCOPES.indexOf(out.scope) < 0) out.scope = 'global';
  out.value = String(out.value == null ? '' : out.value);
  return out;
}
function normalizeOutDef(o){
  const out = Object.assign({ name:'output' }, o || {});
  out.name = String(out.name == null ? '' : out.name).replace(/[{}.\s]/g, '') || 'output';
  return out;
}
/* 运算节点：老数据是单个 operand，新数据是 operands 数组，两种都收 */
function normalizeOpDef(o){
  const src = o || {};
  const id = OP_BY_ID.has(src.op) ? src.op : OP_IDS[0];
  const def = opDefOf(id);
  let args = Array.isArray(src.operands) ? src.operands.slice() : [src.operand];
  args = args.map(x => String(x == null ? '' : x));
  while (args.length < def.arity) args.push('');
  args.length = def.arity;
  return { op:id, operands:args, type: VAR_TYPES.indexOf(src.type) >= 0 ? src.type : 'number' };
}
/* 节点的优先级：输出 > 变量 > 运算，其余看 n.priority，最后 0 */
function priorityOf(n){
  if (!n) return 0;
  if (typeof n.priority === 'number' && n.priority !== 0) return n.priority;
  if (isVarNode(n)) return VAR_PRIORITY;
  if (isOutNode(n)) return OUT_PRIORITY;
  if (isOpNode(n))  return OP_PRIORITY;
  return 0;
}
function toNum(v){
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).trim();
  if (s === '' || isNaN(Number(s))) return null;
  return Number(s);
}
function applyOperator(v, od){
  const o = normalizeOpDef(od);
  const def = OP_BY_ID.get(o.op);
  return def ? def.apply(v, o.operands) : v;
}
function valueToText(v){
  if (v == null) return '[未定义]';
  if (typeof v === 'number') return String(Math.round(v * 1e6) / 1e6);
  return String(v);
}

/* =========================================================================
   Ctx：一份「文档视图」。当前文档和嵌入文档都走同一套求值逻辑。
   ========================================================================= */
function buildCtx(nodes, edges, groups){
  const list = nodes || [];
  const out = {
    nodes: list,
    edges: edges || [],
    groups: groups || [],
    byId: new Map(list.map(n => [n.id, n])),
    byGrp: new Map((groups || []).map(g => [g.id, g]))
  };
  return out;
}
/* 当前文档的 Ctx。reindex 会把它清掉，下次用的时候重建。 */
function liveCtx(){
  if (!idx.vctx) idx.vctx = buildCtx(doc.nodes, doc.edges, doc.groups);
  return idx.vctx;
}
/* Ctx 版的 groupAllNodes：member 里可能是节点也可能是子分组 */
function ctxGroupNodes(ctx, gid, out, seen){
  out = out || []; seen = seen || new Set();
  if (seen.has(gid)) return out;
  seen.add(gid);
  const g = ctx.byGrp.get(gid);
  if (!g){ if (ctx.byId.has(gid)) out.push(gid); return out; }
  for (const m of (g.members || [])) ctxGroupNodes(ctx, m, out, seen);
  return out;
}
function ctxGroupDepth(ctx, gid, seen){
  seen = seen || new Set();
  if (seen.has(gid)) return 0;
  seen.add(gid);
  let d = 0;
  for (const g of ctx.groups) if ((g.members || []).indexOf(gid) >= 0) d = Math.max(d, 1 + ctxGroupDepth(ctx, g.id, seen));
  return d;
}
const isFunctionGroup = (g) => !!g && !!g.isFunction;

/* 节点所属的「函数分组作用域」：最内层的那个函数分组；不在任何里面就返回 null（顶层文档） */
function functionScopeOfIn(ctx, nodeId){
  let best = null, bestD = -1;
  for (const g of ctx.groups){
    if (!isFunctionGroup(g)) continue;
    if (ctxGroupNodes(ctx, g.id).indexOf(nodeId) < 0) continue;
    const d = ctxGroupDepth(ctx, g.id);
    if (d > bestD){ bestD = d; best = g; }
  }
  return best;
}
const scopeKeyOfIn = (ctx, nodeId) => {
  const g = functionScopeOfIn(ctx, nodeId);
  return g ? g.id : null;                     // null = 顶层文档
};
/* 某个作用域里能看见的节点集合 */
function scopeNodesIn(ctx, scopeId){
  return scopeId ? new Set(ctxGroupNodes(ctx, scopeId)) : null;   // null = 顶层，不设限
}

/* ---------------- 作用域可见性 ---------------- */
function downstreamOfIn(ctx, startId, inside){
  const seen = new Set([startId]);
  let frontier = [startId];
  while (frontier.length){
    const next = [];
    for (const id of frontier){
      for (const e of ctx.edges){
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
function varVisibleIn(ctx, def, fromId){
  // 函数分组内外完全隔离：作用域不同就互相看不见
  if (scopeKeyOfIn(ctx, def.id) !== scopeKeyOfIn(ctx, fromId)) return false;
  const v = normalizeVarDef(def.varDef);
  if (def.id === fromId) return true;
  const scopeId = scopeKeyOfIn(ctx, def.id);
  if (v.scope === 'global') return true;                  // 「全局」= 本作用域内全局
  if (v.scope === 'local') return downstreamOfIn(ctx, def.id, scopeNodesIn(ctx, scopeId)).has(fromId);
  // 组内：这个变量节点连到哪个分组，那个分组里的节点才能用
  for (const e of ctx.edges){
    if (e.s !== def.id) continue;
    const grp = ctx.byGrp.get(e.t);
    if (!grp) continue;
    if (ctxGroupNodes(ctx, grp.id).indexOf(fromId) >= 0) return true;
  }
  return false;
}
/* 找一个名字对 fromId 可见的变量定义。同名时优先级高的赢，再同就取靠前的。 */
function findVarDefIn(ctx, name, fromId){
  let best = null, bestP = -Infinity;
  for (const n of ctx.nodes){
    if (!isVarNode(n)) continue;
    if (normalizeVarDef(n.varDef).name !== name) continue;
    if (!varVisibleIn(ctx, n, fromId)) continue;
    const p = priorityOf(n);
    if (p > bestP){ bestP = p; best = n; }
  }
  return best;
}

/* =========================================================================
   输出节点
   每个作用域只有一个生效（按文档顺序取第一个）。没声明输出就是空。
   ========================================================================= */
function outputNodeInScope(ctx, scopeId){
  const inside = scopeId ? new Set(ctxGroupNodes(ctx, scopeId)) : null;
  for (const n of ctx.nodes){
    if (!isOutNode(n)) continue;
    if (inside && !inside.has(n.id)) continue;
    if (scopeKeyOfIn(ctx, n.id) !== (scopeId || null)) continue;
    return n;
  }
  return null;
}
const scopeOutputNode = (ctx, scopeId) => outputNodeInScope(ctx, scopeId || null);

/* 顺着边倒推，找到「喂养」nodeId 的那个变量定义。找不到就 null。 */
function sourceVarOf(ctx, nodeId, inside){
  const n = ctx.byId.get(nodeId);
  if (n && isVarNode(n)) return n;
  const seen = new Set([nodeId]);
  let frontier = [nodeId];
  while (frontier.length){
    const next = [];
    for (const id of frontier){
      for (const e of ctx.edges){
        if (e.t !== id) continue;
        if (inside && (!inside.has(e.s) || !inside.has(e.t))) continue;
        if (seen.has(e.s)) continue;
        seen.add(e.s);
        const src = ctx.byId.get(e.s);
        if (!src) continue;
        if (isVarNode(src)) return src;
        next.push(e.s);
      }
    }
    frontier = next;
  }
  return null;
}
/* 从 viaId 那一侧流进 targetId 的值。
   注意 targetId 和 viaId 是分开的：问「流进输出节点的值」时，
   targetId 是输出节点，而我们要从它上游那个运算节点开始倒推源头，
   否则会把 targetId 当成运算节点，只拿到它的输入值。 */
function valueInto(ctx, targetId, viaId, inside){
  const src = sourceVarOf(ctx, viaId, inside);
  if (!src) return null;
  return evalFromIn(ctx, src, defValueIn(ctx, src), inside, targetId);
}
const valueAtNodeIn = (ctx, nodeId, inside) => valueInto(ctx, nodeId, nodeId, inside);
/* 输出节点的值：有入边就用入边推出来的值，没有就按名字找同作用域的变量 */
function outputValueIn(ctx, out){
  const scopeId = scopeKeyOfIn(ctx, out.id);
  const inside = scopeNodesIn(ctx, scopeId);
  const ins = ctx.edges.filter(e => e.t === out.id && (!inside || (inside.has(e.s) && inside.has(e.t))));
  if (ins.length){
    for (const e of ins){
      const v = valueInto(ctx, out.id, e.s, inside);
      if (v != null) return v;
    }
  }
  const nm = normalizeOutDef(out.outDef).name;
  const def = findVarDefIn(ctx, nm, out.id);
  return def ? defValueIn(ctx, def) : null;
}

/* ---------------- 求值 ---------------- */
/* 从变量定义出发，沿边把算符推下去。
   start 是起点值，inside 非空时只在它里面走，targetId 给了就在到达它时返回。

   ⚠ 值必须**每条路径各带各的**。早先图省事用一个共享累加器走 BFS，
   结果一条分支上的运算泄漏到了兄弟分支（v→运算A→甲 会污染 v→乙）。 */
function evalFromIn(ctx, def, start, inside, targetId){
  if (targetId && def.id === targetId) return start;
  const seen = new Set([def.id]);
  let frontier = [{ id:def.id, v:start }];
  let last = start;
  while (frontier.length){
    const next = [];
    for (const cur of frontier){
      const outs = ctx.edges
        .map((e, i) => ({ e, i }))
        .filter(x => x.e.s === cur.id
                  && !seen.has(x.e.t)
                  && (!inside || (inside.has(x.e.s) && inside.has(x.e.t))))
        .sort((x, y) => (priorityOf(ctx.byId.get(x.e.s)) - priorityOf(ctx.byId.get(y.e.s))) || (x.i - y.i));
      for (const { e } of outs){
        if (seen.has(e.t)) continue;
        seen.add(e.t);
        const m = ctx.byId.get(e.t);
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
   指向函数分组的话，值就是那个分组声明出来的输出。 */
function defValueIn(ctx, def){
  if (!def) return null;
  for (const e of ctx.edges){
    if (e.s !== def.id) continue;
    const grp = ctx.byGrp.get(e.t);
    // 指向函数分组：一律以它的输出为准 —— 组里没声明输出节点就是空，
    // 不能退回自己填的那个值，那样看起来像「有输出」但其实是假的。
    if (grp && isFunctionGroup(grp)) return functionResultIn(ctx, grp);
  }
  return normalizeVarDef(def.varDef).value;
}
/* 函数分组的结果 = 它声明的输出节点的值。没有输出节点就是空。 */
function functionResultIn(ctx, grp){
  if (!grp) return null;
  const out = outputNodeInScope(ctx, grp.id);
  if (!out) return null;
  return outputValueIn(ctx, out);
}
/* 解析 fromId 看到的变量值。找不到定义返回 null。
   起点必须是 defValueIn()（可能已被函数分组替换过）。 */
function resolveVarIn(ctx, name, fromId){
  const def = findVarDefIn(ctx, name, fromId);
  if (!def) return null;
  const base = defValueIn(ctx, def);
  if (def.id === fromId) return base;
  const mid = evalFromIn(ctx, def, base, null, fromId);
  return (mid == null) ? base : mid;
}

/* =========================================================================
   跨层引用：{嵌入节点名.输出名}
   嵌入文档是一份普通对象，用一份临时 Ctx 在它里面求值 —— 不碰全局状态。
   ========================================================================= */
let embedCtxCache = new Map();
function embeddedCtxOf(embedNode){
  if (embedCtxCache.has(embedNode.id)) return embedCtxCache.get(embedNode.id);
  const d2 = (embedNode.embed && embedNode.embed.doc) || {};
  const c = buildCtx(d2.nodes || [], d2.edges || [], d2.groups || []);
  embedCtxCache.set(embedNode.id, c);
  return c;
}
function resolveEmbedOutput(embedName, outName){
  for (const n of doc.nodes){
    if (n.kind !== 'embed') continue;
    if (String(n.text || '') !== embedName) continue;
    const ctx = embeddedCtxOf(n);
    const out = ctx.nodes.find(x => isOutNode(x) && normalizeOutDef(x.outDef).name === outName);
    if (!out) continue;
    return outputValueIn(ctx, out);
  }
  return null;
}

/* ---------------- 文本插值 ---------------- */
const VAR_TOKEN = /\\\{|\{([^}\n]*)\}/g;
/* 把 {name} 换成变量值，{嵌入名.输出名} 换成嵌入文档的输出值。
   \{name} 转义成字面量；找不到就显示 [未定义]。 */
function interpolateIn(ctx, text, fromId){
  const s = String(text == null ? '' : text);
  if (s.indexOf('{') < 0 && s.indexOf('\\') < 0) return s;
  return s.replace(VAR_TOKEN, (m, name) => {
    if (m === '\\{') return '{';
    if (name && name.indexOf('.') > 0){
      const i = name.indexOf('.');
      return valueToText(resolveEmbedOutput(name.slice(0, i), name.slice(i + 1)));
    }
    return valueToText(resolveVarIn(ctx, name, fromId));
  });
}
/* 给外部（和测试）用的薄封装，都走当前文档 */
const interpolate   = (text, fromId) => interpolateIn(liveCtx(), text, fromId);
const resolveVar    = (name, fromId) => resolveVarIn(liveCtx(), name, fromId);
const functionResult = (grp) => functionResultIn(liveCtx(), grp);
const defValue      = (def) => defValueIn(liveCtx(), def);
const scopeOutputNodeOf = (scopeId) => scopeOutputNode(liveCtx(), scopeId);

/* 渲染和量尺寸都读这个：没被替换过就还是原文 */
function displayTextOf(n){
  if (!n) return '';
  const t = idx.text && idx.text.get(n.id);
  return t == null ? String(n.text == null ? '' : n.text) : t;
}
const hasVarRefs = (n) => !!n && /\{[^}\n]*\}/.test(String(n.text || ''));

/* reindex 末尾调用：算一遍所有节点的显示文本 */
function refreshVarText(){
  idx.vctx = null;              // 文档变了，Ctx 重建
  embedCtxCache = new Map();
  const ctx = liveCtx();
  idx.text = new Map();
  for (const n of doc.nodes){
    const t = interpolateIn(ctx, n.text, n.id);
    if (t !== n.text) idx.text.set(n.id, t);
  }
}

/* ---------------- 给界面用的小查询 ---------------- */
/* 这个输出节点属于哪个作用域（画在节点上的那行小字） */
function outScopeLabel(nodeId){
  const ctx = liveCtx();
  const g = functionScopeOfIn(ctx, nodeId);
  const eff = outputEffective(nodeId);
  if (g) return (eff ? 'ƒ 函数输出 · ' : '未生效 · ') + (g.title || '分组');
  return eff ? '文档输出' : '未生效 · 同作用域已有输出节点';
}
/* 同一作用域里只有第一个输出节点生效 */
function outputEffective(nodeId){
  const ctx = liveCtx();
  const scopeId = scopeKeyOfIn(ctx, nodeId);
  const n = outputNodeInScope(ctx, scopeId);
  return !!n && n.id === nodeId;
}
/* 当前文档的顶层输出节点（嵌入到别处时，外层用 {嵌入名.名字} 取它） */
const documentOutputNode = () => scopeOutputNode(liveCtx(), null);
