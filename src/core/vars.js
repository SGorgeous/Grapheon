'use strict';
/* ==========================================================================
   GRAPHEON · core/vars.js
   变量系统：变量定义节点、文本里的 {name} 引用、运算符节点、函数分组、输出节点、优先级。

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
const OP_PRIORITY  = 100;         // 运算符节点的默认优先级
const OUT_PRIORITY = 900;         // 输出节点仅次于变量定义
/* 作用域只有两种：
     全局  同作用域内到处能用，不用连线
     局内  范围有限 —— **下游**，或者**这个变量节点指到的那个分组内部**
   以前「组内」是单独一种，现在并进局内了：两者本来就是「范围有限」的两种形态，
   分成两个只是让人多做一道选择题。老存档里的 'group' 会在 normalizeVarDef 里并过来。 */
const VAR_SCOPES = ['global', 'local'];
const VAR_SCOPE_LABEL = { global:'全局', local:'局内' };
const VAR_SCOPE_HINT = {
  global:'本作用域内到处都能用，不用连线',
  local:'只有它的下游能用；把它连到一个分组，那个分组里也就能用了'
};
const VAR_TYPES = ['number', 'string'];
const VAR_TYPE_LABEL = { number:'数字', string:'字符串' };

/* 「被关着的开关挡住了」。和 null（够不着）区分开：
   够不着的话调用方会退回变量自己的值（组内变量就靠这个），
   被挡住的话是真的不通，必须显示 [未定义]。 */
const VAR_BLOCKED = Symbol('varBlocked');
const isVarNode = (n) => !!n && (n.kind === 'var' || n.kind === 'broadcast');
/* 广播节点：把流进来的值变成**全局变量**。
   和变量节点长得一样，但**只能设名字** —— 值由输入决定，另一边显示实际输出。 */
const isBroadcast = (n) => !!n && n.kind === 'broadcast';
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
/* 特殊控件。原「通路节点」已换成「条件节点」—— 它不再是个手动开关，
   而是「输入为 1 才把所填的值放出去」。老存档的 switch 在 normalizeVarDef 里就地转过来。 */
/* 变量节点的「类型」。切换类型不丢数据 —— 每种的字段各存各的，
   切回来还在（normalizeVarDef 只规范化、不删字段）。 */
const VAR_CONTROLS = ['plain', 'slider', 'list', 'map', 'check', 'cond'];
const VAR_CONTROL_LABEL = { plain:'单一变量', slider:'滑块', list:'列表', map:'地图',
                            check:'勾选', cond:'条件' };
const VAR_CONTROL_HINT = {
  plain:'填什么就是什么，数字和字符串都行',
  slider:'起点 / 终点 / 步长都是浮点数，都能写 {变量}',
  list:'任意长度，用 {名字.序号} 取第几项 —— 序号从 0 开始',
  map:'key 索引 value，用 {名字.key} 取值',
  check:'勾中的拼成一串',
  cond:'输入为 1 才把所填的值放出去'
};
function normalizeVarDef(v){
  const out = Object.assign({ name:'x', value:'0', type:'number', scope:'global',
    control:'plain', options:[], picked:[], min:0, max:100, step:1, on:false }, v || {});
  /* 老存档：通路节点 → 条件节点（就地转换，用户不用管）。
     原来是「开着」的就把所填的值设成 1（等价于「条件成立，放它过去」）；
     关着的留空，永远不通。 */
  if (out.control === 'switch'){
    out.control = 'cond';
    if (out.on && String(out.value == null ? '' : out.value) === '') out.value = '1';
  }
  if (VAR_CONTROLS.indexOf(out.control) < 0) out.control = 'plain';
  // 勾选：选项列表 + 选中的下标
  out.options = (Array.isArray(out.options) ? out.options : [])
    .map(x => String(x == null ? '' : x)).filter(x => x !== '');
  out.picked = (Array.isArray(out.picked) ? out.picked : [])
    .map(x => Math.round(+x)).filter(i => i >= 0 && i < out.options.length);
  out.picked = [...new Set(out.picked)].sort((a, b) => a - b);
  /* 列表：任意长度的字符串数组。每一项都可以写 {变量}。
     默认是 0 / 1 / 2 —— 空列表会被重置回默认，所以列表永远至少有一项。 */
  out.items = (Array.isArray(out.items) ? out.items : [])
    .map(x => String(x == null ? '' : x));
  if (out.control === 'list' && !out.items.length) out.items = ['0', '1', '2'];
  /* 地图：有序的 key → value。key 和 value 都能写 {变量}。 */
  out.pairs = (Array.isArray(out.pairs) ? out.pairs : [])
    .map(p => ({ k:String((p && p.k) == null ? '' : p.k),
                 v:String((p && p.v) == null ? '' : p.v) }));
  if (out.control === 'map' && !out.pairs.length) out.pairs = [{ k:'key', v:'value' }];
  // 滑条：上下限和步长
  /* ★ 允许写 {变量} —— 含花括号的一律**原样留着字符串**，求值时再解析。
     以前这里无条件 +x 强转，{宽} 会变成 NaN→0，参数化就无从谈起。 */
  const keepNum = (x, dflt) => {
    if (typeof x === 'string' && x.indexOf('{') >= 0) return x;
    return isFinite(+x) ? +x : dflt;
  };
  out.min = keepNum(out.min, 0);
  out.max = keepNum(out.max, 100);
  if (isFinite(+out.min) && isFinite(+out.max) && +out.max < +out.min){
    const t = out.min; out.min = out.max; out.max = t;
  }
  out.step = (typeof out.step === 'string' && out.step.indexOf('{') >= 0)
    ? out.step : ((isFinite(+out.step) && +out.step > 0) ? +out.step : 1);
  out.on = !!out.on;
  out.name = String(out.name == null ? '' : out.name).replace(/[{}.\s]/g, '') || 'x';
  if (VAR_TYPES.indexOf(out.type) < 0) out.type = 'number';
  if (out.scope === 'group') out.scope = 'local';      // 老存档：组内已并入局内
  if (VAR_SCOPES.indexOf(out.scope) < 0) out.scope = 'global';
  out.value = String(out.value == null ? '' : out.value);
  return out;
}
function normalizeOutDef(o){
  const out = Object.assign({ name:'output' }, o || {});
  out.name = String(out.name == null ? '' : out.name).replace(/[{}.\s]/g, '') || 'output';
  return out;
}
/* 运算符节点：老数据是单个 operand，新数据是 operands 数组，两种都收 */
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
/* 正在求值的变量定义节点。用来挡循环引用（A={B} 且 B={A} 会栈溢出）。 */
const VAR_RESOLVING = new Set();

/* 滑条的值：夹在上下限里，并对齐到步长。
   fromId 给了就先把它自己填的 value 过一遍插值 —— 滑条的值也能引用变量。 */
/* 把**参数字段**解析成数字。字段可以是数字，也可以是带 {变量} 的字符串 ——
   这就是「参数化」。fromId 决定按哪个作用域去解析那些变量。 */
function paramNum(ctx, raw, fromId, dflt){
  if (raw == null || raw === '') return dflt;
  const isRef = (typeof raw === 'string' && raw.indexOf('{') >= 0);
  const s = (isRef && fromId != null) ? interpolateIn(ctx, raw, fromId) : String(raw);
  const n = toNum(s);
  return n == null ? dflt : n;
}
function sliderValue(vd, fromId){
  const v = normalizeVarDef(vd);
  const ctx = liveCtx();
  const lo = paramNum(ctx, v.min, fromId, 0);
  const hi = paramNum(ctx, v.max, fromId, lo + 100);
  const st = Math.max(1e-9, paramNum(ctx, v.step, fromId, 1));
  const raw = (fromId == null) ? v.value : interpolateIn(ctx, v.value, fromId);
  let x = toNum(raw);
  if (x == null) x = lo;
  x = Math.min(hi, Math.max(lo, x));
  const n = Math.round((x - lo) / st);
  x = lo + n * st;
  return Math.round(x * 1e6) / 1e6;
}
/* 勾选的值：选中的选项拼成一串 */
const checkValue = (vd) => normalizeVarDef(vd).picked
  .map(i => normalizeVarDef(vd).options[i]).filter(x => x != null).join(', ');
/* 一个变量定义节点「对外提供的值」的原始来源（不看函数分组替换）。
   普通节点读 value；三个特殊控件各自算。

   ★ value 自己也能引用别的变量（`{宽度}` 这种）。
     给了 fromId 就把 value 过一遍插值 —— 作用域锚点就是这个变量定义节点本身，
     和它的描述文字走的是同一套规则。 */
function controlValue(vd, fromId){
  const v = normalizeVarDef(vd);
  if (v.control === 'check')  return checkValue(v);
  /* 列表 / 地图：不写下标时整条拼成一串（和勾选节点一个道理）。
     每一项都要插值 —— 「所有的空都能写 {变量}」。 */
  if (v.control === 'list' || v.control === 'map'){
    const ctx = liveCtx();
    const at = (x) => (fromId == null) ? String(x == null ? '' : x)
                                       : interpolateIn(ctx, String(x == null ? '' : x), fromId);
    return (v.control === 'list')
      ? v.items.map(at).join(', ')
      : v.pairs.map(p => at(p.k) + '=' + at(p.v)).join(', ');
  }
  if (v.control === 'switch') return v.on ? (v.type === 'number' ? '1' : '开')
                                          : (v.type === 'number' ? '0' : '关');
  // 没给 fromId 就不插值（有些调用点手里只有 varDef，没有所属节点）
  if (fromId == null){
    return v.control === 'slider' ? String(sliderValue(v)) : v.value;
  }
  // 循环引用：退回一个显眼的标记，别递归到爆栈
  if (VAR_RESOLVING.has(fromId)) return '[循环]';
  VAR_RESOLVING.add(fromId);
  try {
    const raw = interpolateIn(liveCtx(), v.value, fromId);
    return v.control === 'slider'
      ? String(sliderValue(Object.assign({}, v, { value:raw })))
      : raw;
  } finally {
    VAR_RESOLVING.delete(fromId);
  }
}
/* 这个节点「通不通」。不通 = 这条连接逻辑上断开，值不往下游流。
   ★ 条件节点：**看流进来的输入是不是 1**。
     1 → 通，把「所填的值」放出去；不是 1 → 不通，下游拿不到值。
   （老的 switch 已经不会出现，留着只是保险。） */
function gateOpenIn(ctx, n){
  if (!isVarNode(n)) return true;
  const v = normalizeVarDef(n.varDef);
  if (v.control === 'switch') return v.on;
  // 条件节点自己就是个「值来源」：它总归输出点东西（所填的值 或「无」），
  // 所以这里一律放行 —— 通不通由 applyNodeOut / condOutputIn 决定。
  if (v.control === 'cond') return true;
  return true;
}
/* 节点的优先级：输出 > 变量 > 运算，其余看 n.priority，最后 0 */
function priorityOf(n){
  if (!n) return 0;
  // ★ 优先级也可以填表达式（能引用变量）：{倍率} / 10 之类，走的是同一套作用域规则。
  // 具体解析在 components.js 的 priorityOfRaw —— 放那边是因为它要用插值，
  // 而插值又依赖 vars.js 里的东西，两边只能这样错开。
  if (typeof priorityOfRaw === 'function'){
    const v = priorityOfRaw(n);
    if (v != null && v !== 0) return v;
  } else if (typeof n.priority === 'number' && n.priority !== 0){
    return n.priority;
  }
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
/* =========================================================================
   多输入汇合 —— 求值模型的**唯一接缝**
   -------------------------------------------------------------------------
   现在每个节点都是「一进一出」：拿到一个值，变换一下，吐出去。
   以后运算符 / 循环 / 广播节点会有**多个**输入，它们都在这里汇合。

   incoming 是「流进这个节点的值」。单输入时它就是唯一的那个值。
   ★ 所有节点变换都必须走这里 —— 别再在别处写 applyOperator，
     否则以后加多输入时又会漏掉一路。
   ========================================================================= */
/* 条件节点的输出：流进来的等于 1 → 输出「所填的值」；否则 → 输出「无」。
   ★ 注意它**不是透传上游** —— 它输出的是自己填的那个值。
     （以前 applyNodeOut 对变量节点是恒等，于是通的时候把上游的值漏了出去。） */
const COND_NONE = '无';
function condOutputIn(ctx, node){
  const v = normalizeVarDef(node.varDef);
  const inc = valueFromUpstream(ctx, node.id);
  if (inc == null || inc === VAR_BLOCKED) return COND_NONE;   // 没接 / 上游不通
  return Number(String(inc).trim()) === 1 ? v.value : COND_NONE;
}
/* 运算符节点的输出：**所有输入端点按 ID 升序依次运算**。
   · 1 号端点（ID 最小的那个）= 沿当前这条路径流进来的值
   · 其余端点 = 接在它上面的那一路上来的值；没接就用格子里填的
   ★ 老存档零改动：老的运算符节点只有一个 operand 格子、没有第二条入边，
     于是其它端点都退回格子值 —— 行为和以前一模一样。 */
function opOutputIn(ctx, node, incoming){
  const od = normalizeOpDef(node.opDef);
  const def = OP_BY_ID.get(od.op) || OPERATORS[0];
  const ins = portList(node).ins.slice().sort((a, b) => a.id - b.id);
  /* ⚠ 下标：od.operands[0] 是**第二个**操作数（第一个是流进来的 incoming）。
     所以第 i 个端点（i>=1）对应的是 od.operands[i-1]，不是 [i]。 */
  const args = [];
  for (let i = 1; i < Math.max(1, ins.length); i++){
    let v = ins[i] ? inputPortValueIn(ctx, node, ins[i], 0) : null;
    if (v == null || v === '') v = od.operands[i - 1];          // 没接就用格子里的
    args.push(v == null ? '' : v);
  }
  /* ★ 一次调用把**全部**操作数传进去 —— 不是逐次折叠。
     OPERATORS 的 apply(v, args) 本来就是收一个数组的，
     逐次折叠对 arity>1 的算符是错的（老行为就是一次调用）。
     没接任何端点时 args 全来自格子值，和以前逐字一致。 */
  /* 格子里的值也可能写了 {变量} —— 走同样的解析 */
  const ctxA = liveCtx();
  const realArgs = args.map(x => (typeof x === 'string' && x.indexOf('{') >= 0)
    ? interpolateIn(ctxA, x, node.id) : x);
  return def.apply(incoming, realArgs);
}
function applyNodeOut(ctx, node, incoming){
  if (!node) return incoming;
  if (isOpNode(node)) return opOutputIn(ctx, node, incoming, node.id);
  // 条件节点：输出自己的值（或「无」），不把上游的值放过去
  if (isVarNode(node) && normalizeVarDef(node.varDef).control === 'cond'){
    return condOutputIn(ctx, node);
  }
  return incoming;                       // 其余节点原样透传
}
/* 算符的**操作数也可以写 {变量}** —— 参数化的另一半。
   fromId = 站在哪个节点上求值，作用域规则和别处一致。 */
function applyOperator(v, od, fromId){
  const o = normalizeOpDef(od);
  const def = OP_BY_ID.get(o.op);
  if (!def) return v;
  const ctx = liveCtx();
  const args = o.operands.map(x =>
    (typeof x === 'string' && x.indexOf('{') >= 0 && fromId != null)
      ? interpolateIn(ctx, x, fromId) : x);
  return def.apply(v, args);
}
function valueToText(v){
  if (v == null || v === VAR_BLOCKED) return '[未定义]';
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
        const m = ctx.byId.get(e.t);
        if (m && isVarNode(m) && !gateOpenIn(ctx, m)) continue;   // 条件不成立：后面不算下游
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
  // 广播节点 = 全局变量，本作用域内到处可用，不用连线
  if (isBroadcast(def)) return true;
  if (v.scope === 'global') return true;                  // 「全局」= 本作用域内全局
  // 局内 = 「下游」或者「指到的那个分组内部」，两条路任一条走通就算可见
  if (downstreamOfIn(ctx, def.id, scopeNodesIn(ctx, scopeId)).has(fromId)) return true;
  for (const e of ctx.edges){
    if (e.s !== def.id) continue;
    const grp = ctx.byGrp.get(e.t);
    if (!grp) continue;
    // 指向分组 = 对全组有效（套娃里的成员也算）
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
   targetId 是输出节点，而我们要从它上游那个运算符节点开始倒推源头，
   否则会把 targetId 当成运算符节点，只拿到它的输入值。 */
function valueInto(ctx, targetId, viaId, inside){
  const src = sourceVarOf(ctx, viaId, inside);
  if (!src) return null;
  return evalFromIn(ctx, src, defValueIn(ctx, src), inside, targetId);
}
/* 输出节点的值：有入边就用入边推出来的值，没有就按名字找同作用域的变量 */
function outputValueIn(ctx, out){
  const scopeId = scopeKeyOfIn(ctx, out.id);
  const inside = scopeNodesIn(ctx, scopeId);
  const ins = ctx.edges.filter(e => e.t === out.id && (!inside || (inside.has(e.s) && inside.has(e.t))));
  if (ins.length){
    for (const e of ins){
      const v = valueInto(ctx, out.id, e.s, inside);
      if (v === VAR_BLOCKED) return null;      // 被开关挡住 = 这个作用域没有输出
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
  let blocked = false;
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
        if (m && isVarNode(m) && !gateOpenIn(ctx, m)){ blocked = true; continue; }   // 条件不成立 = 这条连接逻辑上断开
        const out = applyNodeOut(ctx, m, cur.v);
        if (targetId && e.t === targetId){
          // 看到的是「进这个节点时的值」：运算符节点自己看输入，别的一律看输出
          // 看到的是「进这个节点时的值」：运算符节点自己看输入，别的一律看输出
          return (m && isOpNode(m)) ? cur.v : out;
        }
        last = out;
        next.push({ id:e.t, v:out });
      }
    }
    frontier = next;
  }
  return targetId ? (blocked ? VAR_BLOCKED : null) : last;
}
/* 一条边在它 t 端收到的值：源头是变量定义就用它的值，
   否则递归往回、再把一路经过的变换套上。
   多输入节点的**每一路输入**靠它单独求值。 */
function valueOnEdgeIn(ctx, e, depth){
  depth = depth || 0;
  if (depth > UPSTREAM_MAX_DEPTH) return null;
  const src = ctx.byId.get(e.s);
  if (!src) return null;
  if (isVarNode(src) && !ctx.edges.some(x => x.t === src.id)){
    return defValueIn(ctx, src);                 // 源头：变量定义 / 广播节点自己的值
  }
  const up = valueFromUpstream(ctx, src.id, depth + 1);
  if (up == null || up === VAR_BLOCKED) return up;
  return applyNodeOut(ctx, src, up);
}
/* 落在某个输入端点上的值（那一路没接东西返回 null）。
   接在这个端点上的边 = e.bPort === port.id；
   老边没有 bPort，算在**第一个**输入端点（按 ID 升序）上。 */
function inputPortValueIn(ctx, node, port, depth){
  const sorted = portList(node).ins.slice().sort((a, b) => a.id - b.id);
  const firstId = sorted.length ? sorted[0].id : null;
  for (const e of ctx.edges){
    if (e.t !== node.id) continue;
    const hit = (e.bPort != null) ? (e.bPort === port.id) : (firstId === port.id);
    if (!hit) continue;
    const v = valueOnEdgeIn(ctx, e, depth);
    if (v != null) return v;
  }
  return null;
}

/* =========================================================================
   往回求「流向 nodeId 的那个值」
   -------------------------------------------------------------------------
   做法：沿入边往回走，找到**最近的变量定义节点**，然后用现有的前向求值
   把这个变量到达那个上游节点时的值算出来，再把一路经过的节点变换叠上。

   ★ 完全复用现有语义，不新造一套 —— 所以它和 evalFromIn 在单链上必然一致。

   多输入节点（运算符 / 循环）的**每一路输入**都用它单独求值，
   然后按端点 ID 升序汇合。这是「汇合」的原料。

   找不到变量定义就返回 null（这条线上没有值来源）。
   代 depth 防环：绕回去就放弃这一路。 */
const UPSTREAM_MAX_DEPTH = 32;
function valueFromUpstream(ctx, nodeId, depth){
  depth = depth || 0;
  if (depth > UPSTREAM_MAX_DEPTH) return null;
  let best = null;
  for (const e of ctx.edges){
    if (e.t !== nodeId) continue;
    const src = ctx.byId.get(e.s);
    if (!src) continue;
    // 关着的通路 = 这条路逻辑上断掉（和 evalFromIn 一致）
    if (isVarNode(src) && !gateOpenIn(ctx, src)) return VAR_BLOCKED;
    const hasIn = ctx.edges.some(x => x.t === src.id);
    let incoming;
    if (hasIn){
      incoming = valueFromUpstream(ctx, src.id, depth + 1);
      if (incoming === VAR_BLOCKED) return VAR_BLOCKED;
      if (incoming == null) continue;
    } else if (isVarNode(src)){
      // ★ 没有入边的变量节点才是「源头」，用它自己的值。
      //   有入边的（比如链路中间的通路节点）要**透传** ——
      //   evalFromIn 就是这么做的，不能拿它自己的值顶上去。
      incoming = defValueIn(ctx, src);
      if (incoming === VAR_BLOCKED) return VAR_BLOCKED;
      if (incoming == null) continue;
    } else {
      continue;                            // 非变量节点又没入边 = 没有来源
    }
    const out = applyNodeOut(ctx, src, incoming);
    if (best == null) best = out;
  }
  return best;
}
/* 一个变量定义节点最终对外提供的值。
   指向函数分组的话，值就是那个分组声明出来的输出。 */
function defValueIn(ctx, def){
  if (!def) return null;
  /* ★ 广播节点：它的值**就是流进来的那个**（不能自己填）。
     所以只能靠往回求上游 —— 这也是它和变量节点唯一的区别。 */
  if (isBroadcast(def)){
    const v = valueFromUpstream(ctx, def.id);
    return (v === VAR_BLOCKED) ? null : v;
  }
  /* ★ 条件节点：按名字引用它，拿到的就是 condOutputIn（所填的值，或「无」）。
     它不是「不通就没值」—— 不通的时候输出的是「无」这个值。 */
  if (isVarNode(def) && normalizeVarDef(def.varDef).control === 'cond'){
    return condOutputIn(ctx, def);
  }
  if (isVarNode(def) && !gateOpenIn(ctx, def)) return null;
  for (const e of ctx.edges){
    if (e.s !== def.id) continue;
    const grp = ctx.byGrp.get(e.t);
    // 指向函数分组：一律以它的输出为准 —— 组里没声明输出节点就是空，
    // 不能退回自己填的那个值，那样看起来像「有输出」但其实是假的。
    if (grp && isFunctionGroup(grp)) return functionResultIn(ctx, grp);
  }
  return controlValue(def.varDef, def.id);   // 把锚点传进去，value 里的 {变量} 才解析得了
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
  if (mid === VAR_BLOCKED) return null;      // 被关着的开关挡住：逻辑上不通，就是没有值
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
/* 列表 / 地图的成员取值。
   返回 **undefined** 表示「这个变量没有下标这一说」——
   调用方据此退回「嵌入文档的跨层引用」那条路。
   返回 **null** 表示「确实是列表 / 地图，但没有这一项」→ 显示 [未定义]。 */
function memberValueIn(ctx, def, key, fromId){
  const v = normalizeVarDef(def.varDef);
  const k = String(key == null ? '' : key).trim();
  const at = (x) => interpolateIn(ctx, String(x == null ? '' : x), fromId);
  if (v.control === 'list'){
    if (k === '' || !isFinite(+k)) return null;
    const i = Math.round(+k);
    return (i >= 0 && i < v.items.length) ? at(v.items[i]) : null;
  }
  if (v.control === 'map'){
    /* ★ key 本身也可能写了 {变量}（{图.k{甲}} 这种），
       所以要拿**插值之后**的 key 去比 —— 不然永远匹配不上。 */
    const hit = v.pairs.filter(p => at(p.k) === k)[0];
    return hit ? at(hit.v) : null;
  }
  return undefined;
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
      const head = name.slice(0, i), tail = name.slice(i + 1);
      /* ★ 先试「变量 + 下标 / 键」（{list.2} / {map.key}）。
         变量名里不会有点（normalizeVarDef 会把点清掉），所以点一定是分隔符。
         那个变量不存在、或者它不是列表 / 地图，才退回嵌入文档的跨层引用。 */
      const def = findVarDefIn(ctx, head, fromId);
      if (def){
        const got = memberValueIn(ctx, def, tail, fromId);
        if (got !== undefined) return valueToText(got);
      }
      return valueToText(resolveEmbedOutput(head, tail));
    }
    return valueToText(resolveVarIn(ctx, name, fromId));
  });
}
/* 给外部（和测试）用的薄封装，都走当前文档 */
const interpolate   = (text, fromId) => interpolateIn(liveCtx(), text, fromId);
const resolveVar    = (name, fromId) => resolveVarIn(liveCtx(), name, fromId);
const functionResult = (grp) => functionResultIn(liveCtx(), grp);
const defValue      = (def) => defValueIn(liveCtx(), def);
/* 渲染和量尺寸都读这个：没被替换过就还是原文 */
function displayTextOf(n){
  if (!n) return '';
  // 顶部标题行永远是节点名（n.text）—— 控件节点也一样。
  // 变量名在左边那个专门的格子里，走 varDef.name。
  const t = idx.text && idx.text.get(n.id);
  return t == null ? String(n.text == null ? '' : n.text) : t;
}
const hasVarRefs = (n) => !!n && /\{[^}\n]*\}/.test(String(n.text || ''));

/* 组件「染色」效果：把外框颜色换掉。绘制和命中都走这个，
   免得同一个颜色在两处解析出不一样的结果。
   放在这里而不是 render-components.js，是因为 vars.js 更早加载、谁都能调。 */
function entityTint(entity, scope){
  if (typeof compTintOf === 'function') return compTintOf(entity, scope) || '';
  return '';
}
function entityAlpha(entity, scope){
  if (typeof compOpacityOf === 'function') return compOpacityOf(entity, scope);
  return 1;
}

/* reindex 末尾调用：把**所有可编辑文字**里的 {变量} 都算一遍。
   节点正文、图片描述、连线标签、分组标题 —— 都能引用变量。 */
function refreshVarText(){
  idx.vctx = null;              // 文档变了，Ctx 重建
  embedCtxCache = new Map();
  const ctx = liveCtx();
  idx.text = new Map();
  idx.desc = new Map();
  idx.edgeLabel = new Map();
  idx.groupTitle = new Map();
  const put = (map, id, raw, fromId) => {
    const t = interpolateIn(ctx, raw, fromId);
    if (t !== raw) map.set(id, t);
    return t;
  };
  for (const n of doc.nodes){
    put(idx.text, n.id, n.text, n.id);
    // 描述挂在节点自己的作用域上引用（图片节点的描述也是）
    if (n.desc) put(idx.desc, n.id, n.desc, n.id);
  }
  for (const e of doc.edges) if (e.label) put(idx.edgeLabel, e.id, e.label, e.s);
  for (const g of (doc.groups || [])) if (g.title) put(idx.groupTitle, g.id, g.title, g.id);
}
/* 四个取显示文字的入口：没被替换过就是原文 */
function displayDescOf(n){
  if (!n) return '';
  const t = idx.desc && idx.desc.get(n.id);
  return t == null ? String(n.desc == null ? '' : n.desc) : t;
}
function displayLabelOf(e){
  if (!e) return '';
  const t = idx.edgeLabel && idx.edgeLabel.get(e.id);
  return t == null ? String(e.label == null ? '' : e.label) : t;
}
function displayTitleOf(g){
  if (!g) return '';
  const t = idx.groupTitle && idx.groupTitle.get(g.id);
  return t == null ? String(g.title == null ? '' : g.title) : t;
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

/* =========================================================================
   变量节点的内部布局
   尺寸计算（text.js）、绘制（render.js）、命中（hit.js）全都调这一个，
   免得三处各算一遍、改一处忘两处。
   box 只需要 x / y / w，高度是算出来的。
   ========================================================================= */
function varLayout(box, varDef, lineH){
  const v = normalizeVarDef(varDef);
  const innerW = Math.max(60, box.w - VAR_PAD * 2);
  const top = box.y + 8 + lineH;
  const R = { top, innerW };
  // 控件节点（勾选 / 滑条 / 通路）：**左边也有一个变量名格子**，右边才是控件本体。
  //   节点名（顶部标题行）和变量名是两回事：
  //     标题行  = 给你看的，随便写
  //     变量名  = {name} 引用要找的那个
  //   以前控件节点没有变量名格子，名字只能挤在标题行上，
  //   结果「在标题上改名」和「{name} 引用」对不上。
  R.nameBox = { x:box.x + VAR_PAD, y:top, w:VAR_NAME_W, h:VAR_BOX_H };
  const bodyX = R.nameBox.x + VAR_NAME_W + 10;
  const bodyW = Math.max(80, box.x + box.w - VAR_PAD - bodyX);
  if (v.control === 'check' || v.control === 'list' || v.control === 'map'){
    /* 勾选 / 列表 / 地图：都是「一行一项」，共用同一块列表区。
       高度跟着项数长 —— 所以节点会自己变高。 */
    const cnt = (v.control === 'check') ? v.options.length
              : (v.control === 'list')  ? v.items.length
              : v.pairs.length;
    const rows = Math.max(1, cnt);
    R.listBox = { x:bodyX, y:top, w:bodyW, h:rows * CHECK_ROW_H };
    R.bodyH = Math.max(VAR_BOX_H, R.listBox.h);
  } else if (v.control === 'slider'){
    R.trackBox = { x:bodyX, y:top + (VAR_BOX_H - SLIDER_TRACK_H) / 2, w:bodyW, h:SLIDER_TRACK_H };
    R.bodyH = VAR_BOX_H;
  } else if (v.control === 'switch'){
    R.knobBox = { x:bodyX, y:top + (VAR_BOX_H - SWITCH_H) / 2, w:Math.min(190, bodyW), h:SWITCH_H };
    R.bodyH = VAR_BOX_H;
  } else {
    R.valBox = { x:bodyX, y:top, w:VAR_VAL_W, h:VAR_BOX_H };
    R.bodyH = VAR_BOX_H;
  }
  R.scopeBox = { x:box.x + VAR_PAD, y:top + R.bodyH + 8, w:innerW, h:VAR_SCOPE_H };
  R.height = 8 + lineH + R.bodyH + 8 + VAR_SCOPE_H + 10;
  /* ★ 手动把节点拉高了：多出来的高度**摊给本体那一段**，
     里面的框跟着一起长 —— 不然框只会在顶上挤成一坨，下面一大片空白。 */
  if (box.h && box.h > R.height){
    const extra = box.h - R.height;
    R.bodyH += extra;
    for (const k of ['nameBox', 'valBox', 'listBox', 'trackBox', 'knobBox']){
      if (R[k]) R[k].h += extra;
    }
    R.scopeBox.y += extra;
    R.height = box.h;
  }
  return R;
}
/* 滑条：世界坐标 → 值 */
function sliderValueAt(n, worldX){
  const L = varBoxes(n);
  const b = L.trackBox;
  if (!b) return sliderValue(n.varDef, n.id);
  const v = normalizeVarDef(n.varDef);
  const pad = 12;
  const t = Math.max(0, Math.min(1, (worldX - (b.x + pad)) / Math.max(1, b.w - pad * 2)));
  const raw = v.min + t * (v.max - v.min);
  const steps = Math.round((raw - v.min) / v.step);
  return Math.round((v.min + steps * v.step) * 1e6) / 1e6;
}
/* 滑条：值 → 轨道上的比例 */
function sliderFrac(vd, fromId){
  const v = normalizeVarDef(vd);
  const ctx = liveCtx();
  const lo = paramNum(ctx, v.min, fromId, 0);
  const hi = paramNum(ctx, v.max, fromId, lo + 100);
  if (hi === lo) return 0;
  return Math.max(0, Math.min(1, (sliderValue(v, fromId) - lo) / (hi - lo)));
}
/* 变量节点上那行小字：作用域 + （控件类型或值类型） */
function varScopeText(vd){
  const v = normalizeVarDef(vd);
  /* ⚠ 别在这里手写控件名 —— 之前「通路 → 条件」改名时就是漏了这行，
     界面上一直显示「全局 · 通路」。一律查 VAR_CONTROL_LABEL。 */
  const kind = v.control === 'plain' ? VAR_TYPE_LABEL[v.type]
             : v.control === 'check' ? '列表'
             : v.control === 'slider' ? (v.min + ' ~ ' + v.max + ' 步长 ' + v.step)
             : VAR_CONTROL_LABEL[v.control];
  return VAR_SCOPE_LABEL[v.scope] + ' · ' + kind;
}
