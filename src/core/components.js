'use strict';
/* ==========================================================================
   GRAPHEON · core/components.js
   面向组件的扩展层。

   设计（路线 B）：
     · 已有的能力（外观 / 变量定义 / 运算 / 程序算符 / 输出 / 控件 / 分组…）
       **保持原样存在原来的字段里**，一行没动。
     · 新东西走 entity.components = [{ type, props }]，一个类型最多一个。
     · 注册表声明每个组件「能挂在哪」「有哪些属性」「哪些属性可以引用变量」。

   ==========================================================================
   效果（EFFECT）和组件（COMPONENT）是两回事，别混：

     效果 EFFECT    真正干活的那部分代码（画角标 / 判隐藏 / 改线宽…），写死在代码里
     组件 COMPONENT 一个有名字的东西，由**一到多个效果**拼成

   内置组件 = 单个效果的预置（角标 / 条件隐藏 / 自定义描边 / 线宽）
   用户组件 = 自己起名 + 挑几个效果拼起来 + 定作用域（★ 这才是「自定义」的意义：
              能一次干好几件事，而不是给同一个效果换个名字）

   ★ 可引用变量的属性（refable:true）走的是**和节点正文完全同一套**解析：
       interpolateIn(liveCtx(), 文本, 该实体自己的作用域锚点)
     所以作用域规则（全局 / 局内 / 函数分组隔离）和你直接在节点里写 {名字} 一模一样。
   ========================================================================== */

const COMPONENT_SCOPES = ['node', 'edge', 'group'];
const COMPONENT_SCOPE_LABEL = { node:'节点', edge:'连线', group:'分组' };
const ALL_SCOPES = COMPONENT_SCOPES.slice();

/* =========================================================================
   效果：真正干活的部分。用户声明组件时从这里挑。
   属性类型：text 文本 / number 数字 / color 颜色
   带 refable 的都会先过一遍变量插值，再按类型解析。
   ========================================================================= */
const EFFECT_PROP = {
  text:  (key, label, def) => ({ key, label, type:'text',  refable:true, def:def || '' }),
  num:   (key, label, def) => ({ key, label, type:'number', refable:true, def:def || '0' }),
  color: (key, label, def) => ({ key, label, type:'color', refable:true, def:def || '' })
};
const EFFECTS = {
  badge: {
    label:'角标', hint:'在左下角贴一个小标签',
    scopes: ALL_SCOPES,
    props: [ EFFECT_PROP.text('text', '文字'), EFFECT_PROP.color('color', '颜色') ]
  },
  hideIf: {
    label:'条件隐藏', hint:'填的内容非空且不是 0 / false / 关，就把它藏起来',
    scopes: ALL_SCOPES,
    props: [ EFFECT_PROP.text('when', '条件') ]
  },
  outline: {
    label:'自定义描边', hint:'在外框外面再套一圈',
    scopes: ['node', 'group'],
    props: [ EFFECT_PROP.num('width', '粗细', '3'), EFFECT_PROP.color('color', '颜色') ]
  },
  width: {
    label:'线宽', hint:'连线粗细',
    scopes: ['edge'],
    props: [ EFFECT_PROP.num('value', '线宽', '0') ]
  },
  tint: {
    label:'染色', hint:'把外框颜色换掉',
    scopes: ALL_SCOPES,
    props: [ EFFECT_PROP.color('color', '颜色') ]
  },
  opacity: {
    label:'透明度', hint:'0 ~ 100',
    scopes: ALL_SCOPES,
    props: [ EFFECT_PROP.num('value', '透明', '100') ]
  }
};
const EFFECT_IDS = Object.keys(EFFECTS);
const effectDef = (id) => EFFECTS[id] || null;

/* =========================================================================
   内置组件：单个效果的预置。属性键不加前缀，和老存档完全兼容。
   ========================================================================= */
const BUILTIN_COMPONENT_DEFS = [
  { id:'badge',   label:'角标',       scopes:ALL_SCOPES,          effect:'badge' },
  { id:'hideIf',  label:'条件隐藏',   scopes:ALL_SCOPES,          effect:'hideIf' },
  { id:'outline', label:'自定义描边', scopes:['node', 'group'],   effect:'outline' },
  { id:'width',   label:'线宽',       scopes:['edge'],            effect:'width' }
];

/* =========================================================================
   注册表：内置 + 用户声明的
   ========================================================================= */
let USER_COMPONENTS = [];                 // 用户声明的自定义组件
let COMPONENT_BY_ID = new Map();
function rebuildComponentIndex(){
  COMPONENT_BY_ID = new Map();
  for (const c of BUILTIN_COMPONENT_DEFS) COMPONENT_BY_ID.set(c.id, c);
  for (const c of USER_COMPONENTS) COMPONENT_BY_ID.set(c.id, c);
}
rebuildComponentIndex();

/* 老名字留个别名，别的地方和断言还在用 */
const COMPONENTS = BUILTIN_COMPONENT_DEFS;
const allComponents = () => BUILTIN_COMPONENT_DEFS.concat(USER_COMPONENTS);
const compDef = (id) => COMPONENT_BY_ID.get(id) || null;
const isUserComponent = (id) => !!compDef(id) && !BUILTIN_COMPONENT_DEFS.some(c => c.id === id);
const componentsFor = (scope) => allComponents().filter(c => c.scopes.indexOf(scope) >= 0);

/* 一个组件定义里所有的「效果部件」。内置的只有一个，用户的可能好几个。 */
function partsOfDef(def){
  if (!def) return [];
  if (def.effect) return [{ effect:def.effect, props:{} }];
  return (def.parts || []).map(p => ({ effect:p.effect, props:Object.assign({}, p.props || {}) }));
}
/* 属性键：单部件的组件不加前缀（老存档兼容），多部件的按 0. / 1. 编号 */
function propKeyOf(partIndex, partCount, key){
  return partCount > 1 ? (partIndex + '.' + key) : key;
}
function propsOfDef(def){
  const parts = partsOfDef(def);
  return parts.map((part, i) => {
    const ed = effectDef(part.effect);
    return {
      index:i,
      effect:part.effect,
      label:(ed && ed.label) || part.effect,
      scopes:(ed && ed.scopes) || ALL_SCOPES,
      props:((ed && ed.props) || []).map(pd => Object.assign({}, pd, {
        key: propKeyOf(i, parts.length, pd.key),
        bareKey: pd.key,
        partIndex:i,
        partCount:parts.length
      }))
    };
  });
}

/* =========================================================================
   用户组件的声明 / 注册 / 落盘
   ========================================================================= */
let userCompSeq = 0;
function makeUserComponentId(){
  let id;
  do { id = 'u' + (++userCompSeq) + Date.now().toString(36).slice(-3); }
  while (COMPONENT_BY_ID.has(id));
  return id;
}
/* 从一份「声明」造出一个合法的组件定义 */
function normalizeComponentDef(d, keepId){
  if (!d || typeof d !== 'object') return null;
  const scopes = (Array.isArray(d.scopes) ? d.scopes : []).filter(s => COMPONENT_SCOPES.indexOf(s) >= 0);
  if (!scopes.length) return null;
  const label = String(d.label == null ? '' : d.label).trim() || '未命名组件';
  let parts = Array.isArray(d.parts) ? d.parts : (d.effect ? [{ effect:d.effect, props:d.props }] : []);
  parts = parts.filter(p => p && EFFECTS[p.effect]).slice(0, 8).map(p => {
    const ed = EFFECTS[p.effect];
    const props = {};
    for (const pd of ed.props){
      const v = (p.props || {})[pd.key];
      props[pd.key] = v == null ? pd.def : String(v);
    }
    return { effect:p.effect, props };
  });
  if (!parts.length) return null;
  const id = (keepId && d.id && !BUILTIN_COMPONENT_DEFS.some(c => c.id === d.id))
    ? String(d.id) : makeUserComponentId();
  return { id, label, scopes, parts, user:true };
}
const COMP_LIB_KEY = 'grapheon.comps.v1';
function registerUserComponent(def, opts){
  const n = normalizeComponentDef(def, true);
  if (!n) return null;
  const i = USER_COMPONENTS.findIndex(c => c.id === n.id);
  if (i >= 0) USER_COMPONENTS[i] = n; else USER_COMPONENTS.push(n);
  rebuildComponentIndex();
  if (!opts || opts.save !== false) saveUserComponents();
  return n;
}
function unregisterUserComponent(id){
  const i = USER_COMPONENTS.findIndex(c => c.id === id);
  if (i < 0) return false;
  USER_COMPONENTS.splice(i, 1);
  rebuildComponentIndex();
  // 文档里挂在它下面的实例也一并清掉，免得留下认不出来的孤儿
  for (const n of doc.nodes) removeComponent(n, id);
  for (const e of doc.edges) removeComponent(e, id);
  for (const g of (doc.groups || [])) removeComponent(g, id);
  saveUserComponents();
  return true;
}
function userComponentDefs(){ return USER_COMPONENTS.map(c => JSON.parse(JSON.stringify(c))); }
/* 存两份：localStorage 当「库」（跨文档记住），文档里也存一份（跟着文件走） */
function saveUserComponents(){
  try { localStorage.setItem(COMP_LIB_KEY, JSON.stringify(userComponentDefs())); } catch(e){}
}
function loadUserComponents(){
  let list = [];
  try {
    const raw = localStorage.getItem(COMP_LIB_KEY);
    if (raw) list = JSON.parse(raw);
  } catch(e){}
  for (const d of (Array.isArray(list) ? list : [])) registerUserComponent(d, { save:false });
}
/* 打开文档时把文档自带的定义合并进来 —— 这样把 .json 发给别人，
   他那边没有这个组件库也能正常显示。 */
function adoptDocComponents(defs){
  let added = 0;
  for (const d of (Array.isArray(defs) ? defs : [])){
    const n = normalizeComponentDef(d, true);
    if (!n) continue;
    if (COMPONENT_BY_ID.has(n.id)) continue;
    USER_COMPONENTS.push(n);
    added++;
  }
  if (added) rebuildComponentIndex();
  return added;
}

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
   读写组件（实例）
   ========================================================================= */
function normalizeComponent(c){
  if (!c || !COMPONENT_BY_ID.has(c.type)) return null;
  const def = COMPONENT_BY_ID.get(c.type);
  const parts = partsOfDef(def);
  const props = {};
  const src = (c.props && typeof c.props === 'object') ? c.props : {};
  parts.forEach((part, i) => {
    const ed = effectDef(part.effect);
    if (!ed) return;
    for (const pd of ed.props){
      const key = propKeyOf(i, parts.length, pd.key);
      const v = src[key];
      // 缺省时的优先级：实例填的 > 组件声明里那个部件的默认值 > 效果自己的默认值。
      // 早先只用了效果默认值，于是「新建组件时给部件定的默认值」根本不生效。
      props[key] = (v != null) ? String(v)
        : (part.props[pd.key] != null ? String(part.props[pd.key]) : pd.def);
    }
  });
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
    const first = (entity.members || []).find(id => idx.byId.get(id));
    return first || entity.id;
  }
  return entity.id;
}
function compRaw(entity, type, key){
  const c = compOf(entity, type);
  if (!c) return null;
  const def = compDef(type);
  if (!def) return null;
  for (const grp of propsOfDef(def)){
    const pd = grp.props.find(p => p.key === key);
    if (!pd) continue;
    const v = c.props[key];
    return v == null ? pd.def : v;
  }
  return null;
}
function compPropDef(type, key){
  const def = compDef(type);
  if (!def) return null;
  for (const grp of propsOfDef(def)){
    const pd = grp.props.find(p => p.key === key);
    if (pd) return pd;
  }
  return null;
}
function compText(entity, type, key, scope){
  const raw = compRaw(entity, type, key);
  if (raw == null) return '';
  const pd = compPropDef(type, key);
  const s = String(raw);
  if (!pd || !pd.refable) return s;
  return interpolateIn(liveCtx(), s, refAnchorOf(entity, scope));
}
function compNumber(entity, type, key, scope, fallback){
  const t = compText(entity, type, key, scope);
  if (t === '') return fallback == null ? 0 : fallback;
  const n = Number(String(t).trim());
  return isNaN(n) ? (fallback == null ? 0 : fallback) : n;
}
const compOn = (entity, type) => !!compOf(entity, type);

/* =========================================================================
   把实体上所有组件的「效果部件」摊平，供绘制和判定使用
   ========================================================================= */
function effectPartsOf(entity, scope){
  const out = [];
  if (!entity) return out;
  for (const c of compsOf(entity)){
    const def = compDef(c.type);
    if (!def) continue;
    const parts = partsOfDef(def);
    parts.forEach((part, i) => {
      const ed = effectDef(part.effect);
      if (!ed) return;
      if (ed.scopes.indexOf(scope) < 0) return;      // 效果不支持这个作用域就跳过
      const props = {};
      for (const pd of ed.props){
        const key = propKeyOf(i, parts.length, pd.key);
        const raw = c.props[key];
        props[pd.key] = (raw != null) ? raw : (part.props[pd.key] != null ? part.props[pd.key] : pd.def);
      }
      out.push({ effect:part.effect, def:ed, props, comp:def, compType:c.type, partIndex:i, raw:c });
    });
  }
  return out;
}
/* 把某个部件的一个属性解析出来（过插值） */
function partValue(entity, part, key, scope){
  const ed = part.def;
  const pd = ed.props.find(p => p.key === key);
  const raw = part.props[key];
  const s = String(raw == null ? (pd ? pd.def : '') : raw);
  if (!pd || !pd.refable) return s;
  return interpolateIn(liveCtx(), s, refAnchorOf(entity, scope));
}
function partNumber(entity, part, key, scope, fallback){
  const t = partValue(entity, part, key, scope);
  if (t === '') return fallback == null ? 0 : fallback;
  const n = Number(String(t).trim());
  return isNaN(n) ? (fallback == null ? 0 : fallback) : n;
}

/* 「条件隐藏」：真的该藏吗。空、0、false、关、no、off 都算不藏。 */
const HIDE_FALSEY = ['', '0', 'false', 'no', 'off', '否', '关', '不'];
function hiddenByComponent(entity, scope){
  for (const part of effectPartsOf(entity, scope)){
    if (part.effect !== 'hideIf') continue;
    const t = partValue(entity, part, 'when', scope).trim();
    if (t && HIDE_FALSEY.indexOf(t.toLowerCase()) < 0) return true;
  }
  return false;
}
function computeComponentHidden(){
  const out = new Set();
  for (const n of doc.nodes) if (hiddenByComponent(n, 'node')) out.add(n.id);
  for (const e of doc.edges) if (hiddenByComponent(e, 'edge')) out.add(e.id);
  for (const g of (doc.groups || [])) if (hiddenByComponent(g, 'group')) out.add(g.id);
  return out;
}

/* =========================================================================
   优先级：可以是数字，也可以是能引用变量的表达式
   ========================================================================= */
function priorityOfRaw(n){
  if (!n) return null;
  const raw = n.priority;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const s = interpolateIn(liveCtx(), String(raw), n.id).trim();
  if (s === '') return null;
  const v = Number(s);
  return isNaN(v) ? null : v;
}
