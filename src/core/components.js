'use strict';
/* ==========================================================================
   GRAPHEON · core/components.js
   面向组件的扩展层。

   设计（路线 B）：
     · 已有的能力（外观 / 变量定义 / 运算 / 程序算符 / 输出 / 控件 / 分组…）
       **保持原样存在原来的字段里**，一行没动 —— 所以 1000 多条老断言不受影响。
     · 新东西走 entity.components = [{ type, props }]，一个类型最多一个。
     · 注册表里声明每个组件「能挂在哪」「有哪些属性」「哪些属性可以引用变量」。

   两种组件：
     COMPONENTS        扩展组件 —— 用户手动加，存在 entity.components 里
     BUILTIN_COMPONENTS 内置能力 —— 其实一直都在，这里只是给 UI 一张「说明书」，
                        让它们在组件面板里也以组件的样子出现

   ★ 可引用变量的属性（refable:true）走的是**和节点正文完全同一套**解析：
       interpolateIn(liveCtx(), 文本, 该实体自己的作用域锚点)
     所以作用域规则（全局 / 局内 / 函数分组隔离）和你直接在节点里写 {名字} 一模一样。
   ========================================================================== */

const COMPONENT_SCOPES = ['node', 'edge', 'group'];
const COMPONENT_SCOPE_LABEL = { node:'节点', edge:'连线', group:'分组' };

/* =========================================================================
   注册表
   属性类型：text 文本 / number 数字 / color 颜色 / bool 开关
   带 refable 的都会先过一遍变量插值，再按类型解析。
   ========================================================================= */
const COMPONENTS = [
  {
    id: 'badge', label: '角标', scopes: COMPONENT_SCOPES, hint: '在左下角贴一个小标签',
    props: [
      { key:'text',  label:'文字', type:'text',  refable:true,  def:'' },
      { key:'color', label:'颜色', type:'color', refable:true,  def:'' }
    ]
  },
  {
    id: 'hideIf', label: '条件隐藏', scopes: COMPONENT_SCOPES,
    hint: '填的内容非空且不是 0 / false / 关，就把它藏起来（可以写 {变量}）',
    props: [
      { key:'when', label:'条件', type:'text', refable:true, def:'' }
    ]
  },
  {
    id: 'outline', label: '自定义描边', scopes: ['node', 'group'], hint: '在外框外面再套一圈',
    props: [
      { key:'width', label:'粗细', type:'number', refable:true, def:'3', min:0, max:24 },
      { key:'color', label:'颜色', type:'color',  refable:true, def:'' }
    ]
  },
  {
    id: 'width', label: '线宽', scopes: ['edge'], hint: '连线粗细',
    props: [
      { key:'value', label:'线宽', type:'number', refable:true, def:'0', min:0, max:24 }
    ]
  }
];
const COMPONENT_BY_ID = new Map(COMPONENTS.map(c => [c.id, c]));
const componentsFor = (scope) => COMPONENTS.filter(c => c.scopes.indexOf(scope) >= 0);
const propDefsOf = (type) => (COMPONENT_BY_ID.get(type) || { props:[] }).props;
const propDefOf = (type, key) => propDefsOf(type).find(p => p.key === key) || null;

/* =========================================================================
   内置能力：只给 UI 看，数据还在原字段里
   ========================================================================= */
const BUILTIN_COMPONENTS = {
  node: [
    { id:'kind',      label:'节点类型',   hint:'普通 / 程序化 / 图片 / 嵌入 / 变量 / 运算 / 输出' },
    { id:'varDef',    label:'变量定义',   hint:'名字 / 值 / 作用域 / 控件（普通·勾选·滑条·开关）' },
    { id:'opDef',     label:'运算算符',   hint:'+ - * /，可以叠加' },
    { id:'program',   label:'程序算符',   hint:'外观 / 形状 / 位置 / 数值' },
    { id:'outDef',    label:'输出',       hint:'声明本作用域的输出值' },
    { id:'priority',  label:'优先级',     hint:'★ 可以填 {变量}' },
    { id:'style',     label:'外观',       hint:'字体 / 字号 / 字色 / 外框色 / 尺寸' },
    { id:'image',     label:'图片',       hint:'内嵌图片 + 名称 + 描述' },
    { id:'embed',     label:'嵌入文档',   hint:'整份 Grapheon 当一个封闭节点' }
  ],
  edge: [
    { id:'arrow',  label:'箭头',    hint:'无 / 单向 / 双向' },
    { id:'dash',   label:'线型',    hint:'实线 / 虚线' },
    { id:'route',  label:'走线',    hint:'正交折线 / 曲线' },
    { id:'side',   label:'端点吸附', hint:'自动 / 上右下左' },
    { id:'points', label:'拐点',    hint:'拖线身就能弯折' },
    { id:'label',  label:'标签',    hint:'★ 可以填 {变量}' }
  ],
  group: [
    { id:'title',     label:'标题',   hint:'★ 可以填 {变量}' },
    { id:'color',     label:'颜色',   hint:'外框颜色' },
    { id:'collapse',  label:'折叠',   hint:'成员一起藏起来' },
    { id:'function',  label:'函数分组', hint:'组内变量 + 运算 + 输出' }
  ]
};

/* =========================================================================
   读写组件
   ========================================================================= */
function normalizeComponent(c){
  if (!c || !COMPONENT_BY_ID.has(c.type)) return null;
  const def = COMPONENT_BY_ID.get(c.type);
  const props = {};
  const src = (c.props && typeof c.props === 'object') ? c.props : {};
  for (const pd of def.props){
    const v = src[pd.key];
    props[pd.key] = (v == null) ? pd.def : String(v);
  }
  return { type:c.type, props };
}
function normalizeComponents(list){
  const out = [], seen = new Set();
  for (const c of (Array.isArray(list) ? list : [])){
    const n = normalizeComponent(c);
    if (!n || seen.has(n.type)) continue;    // 一个类型只留一个
    seen.add(n.type);
    out.push(n);
  }
  return out;
}
const compsOf = (entity) => (entity && Array.isArray(entity.components)) ? entity.components : [];
const compOf = (entity, type) => compsOf(entity).find(c => c.type === type) || null;
/* 挂上 / 更新一个组件。patch 只给要改的属性，其余的留着。 */
function setComponent(entity, type, patch){
  if (!entity || !COMPONENT_BY_ID.has(type)) return null;
  const cur = compOf(entity, type);
  const merged = Object.assign({}, cur ? cur.props : {}, patch || {});
  const next = normalizeComponent({ type, props:merged });
  if (!Array.isArray(entity.components)) entity.components = [];
  const i = entity.components.findIndex(c => c.type === type);
  if (i >= 0) entity.components[i] = next; else entity.components.push(next);
  return next;
}
function removeComponent(entity, type){
  if (!entity || !Array.isArray(entity.components)) return false;
  const i = entity.components.findIndex(c => c.type === type);
  if (i < 0) return false;
  entity.components.splice(i, 1);
  if (!entity.components.length) delete entity.components;
  return true;
}

/* =========================================================================
   取值：可引用的属性先过插值，再按类型解析
   ========================================================================= */
/* 实体引用变量时的「作用域锚点」。
   连线用起点节点（和连线标签一致）；分组优先用第一个成员，
   这样分组在函数分组里时，引用作用域也算在那一层。 */
function refAnchorOf(entity, scope){
  if (!entity) return null;
  if (scope === 'edge') return entity.s;
  if (scope === 'group'){
    const first = (entity.members || []).find(id => {
      const n = idx.byId.get(id);
      return !!n;
    });
    return first || entity.id;
  }
  return entity.id;
}
/* 取一个属性的原始字符串（没挂组件就返回 null） */
function compRaw(entity, type, key){
  const c = compOf(entity, type);
  if (!c) return null;
  const pd = propDefOf(type, key);
  if (!pd) return null;
  const v = c.props[key];
  return v == null ? pd.def : v;
}
/* 解析后的文本。refable 的过一遍插值。 */
function compText(entity, type, key, scope){
  const raw = compRaw(entity, type, key);
  if (raw == null) return '';
  const pd = propDefOf(type, key);
  const s = String(raw);
  if (!pd || !pd.refable) return s;
  return interpolateIn(liveCtx(), s, refAnchorOf(entity, scope));
}
/* 解析后的数字。空 / 解析不出来就用 fallback。 */
function compNumber(entity, type, key, scope, fallback){
  const t = compText(entity, type, key, scope);
  if (t === '') return fallback == null ? 0 : fallback;
  const n = Number(String(t).trim());
  return isNaN(n) ? (fallback == null ? 0 : fallback) : n;
}
const compOn = (entity, type) => !!compOf(entity, type);

/* 「条件隐藏」：真的该藏吗。空、0、false、关、no、off 都算不藏。 */
const HIDE_FALSEY = ['', '0', 'false', 'no', 'off', '否', '关', '不'];
function hiddenByComponent(entity, scope){
  const t = compText(entity, 'hideIf', 'when', scope).trim();
  if (!t) return false;
  return HIDE_FALSEY.indexOf(t.toLowerCase()) < 0;
}
/* 解析出来的「被条件藏起来」的实体 id 集合（reindex 里算一次） */
function computeComponentHidden(){
  const out = new Set();
  for (const n of doc.nodes) if (hiddenByComponent(n, 'node')) out.add(n.id);
  for (const e of doc.edges) if (hiddenByComponent(e, 'edge')) out.add(e.id);
  for (const g of (doc.groups || [])) if (hiddenByComponent(g, 'group')) out.add(g.id);
  return out;
}

/* =========================================================================
   优先级：可以是数字，也可以是能引用变量的表达式
   ★ 这就是「所有可选数据都可填写且可引用变量」的第一个落地点
   ========================================================================= */
function priorityOfRaw(n){
  if (!n) return null;
  const raw = n.priority;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  // 字符串：可以写 "{倍率}" 这样的表达式
  const s = interpolateIn(liveCtx(), String(raw), n.id).trim();
  if (s === '') return null;
  const v = Number(s);
  return isNaN(v) ? null : v;
}
