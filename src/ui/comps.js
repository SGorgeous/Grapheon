'use strict';
/* ==========================================================================
   GRAPHEON · ui/comps.js
   组件面板 —— 面向组件的那个「一个 UI 管三种实体」。

   选中一个节点 / 一条连线 / 一个分组，这里就列出**它能挂的所有组件**：
     · 扩展组件（COMPONENTS 里注册的）：勾上就加，属性随便填
     · 内置能力（BUILTIN_COMPONENTS）：只读列出，告诉你「这东西其实也是个组件」，
       免得界面上一套、数据里另一套让人犯迷糊

   ★ 所有可填的属性都能写 {变量}，作用域规则和你在节点正文里写一样。
     优先级也在这里填 —— 它同样是可引用变量的。
   ========================================================================== */

const compsEl      = document.getElementById('comps');
const compsSubEl   = document.getElementById('compsSub');
const compsListEl  = document.getElementById('compsList');
const compsHintEl  = document.getElementById('compsHint');

let compsTargetCache = null;

function compsOpen(){ return compsEl.style.display === 'block'; }
function closeComps(){ compsEl.style.display = 'none'; compsTargetCache = null; mark(); }
function toggleComps(){ compsOpen() ? closeComps() : openComps(); }

/* 面板在编辑谁。选中必须「干净地是一个东西」，混选就提示用户。 */
function compsTarget(){
  if (selGroups.size === 1 && sel.size === 0){
    const g = byGroup([...selGroups][0]);
    if (g) return { entity:g, scope:'group', what:'分组「' + (g.title || '未命名') + '」' };
  }
  if (selEdgeId){
    const e = doc.edges.find(x => x.id === selEdgeId);
    if (e) return { entity:e, scope:'edge', what:'一条连线' };
  }
  if (sel.size === 1){
    const n = byId([...sel][0]);
    if (n) return { entity:n, scope:'node', what:'节点「' + (n.text || n.id) + '」' };
  }
  return null;
}
function openComps(){
  hideCtx(); closeHelp();
  if (typeof closeSettings === 'function' && settingsOpen()) closeSettings();
  if (typeof closeLib === 'function' && libOpen()) closeLib();
  compsTargetCache = compsTarget();
  compsEl.style.display = 'block';
  renderComps();
  mark();
}
/* 选中变了就跟着刷新（由 mark() 之外的地方显式调，避免每帧重建 DOM） */
function refreshCompsIfOpen(){
  if (!compsOpen()) return;
  const t = compsTarget();
  const key = t ? (t.scope + ':' + t.entity.id) : '';
  if (key !== compsTargetCache) { compsTargetCache = key; renderComps(); }
}

function renderComps(){
  const t = compsTarget();
  compsTargetCache = t ? (t.scope + ':' + t.entity.id) : '';
  compsListEl.innerHTML = '';
  if (!t){
    compsSubEl.textContent = '没有选中东西';
    compsHintEl.textContent = '选中一个节点 / 一条连线 / 一个分组（只选一个），这里就会列出它能挂的组件。';
    return;
  }
  compsSubEl.textContent = t.what;
  compsHintEl.textContent = '所有属性都能写 {变量} —— 作用域规则和在节点正文里写一样。';

  /* ---- 优先级（节点专属，可引用变量） ---- */
  if (t.scope === 'node'){
    compsListEl.appendChild(rowPriority(t.entity));
  }

  /* ---- 扩展组件 ---- */
  for (const def of componentsFor(t.scope)){
    compsListEl.appendChild(rowComponent(t, def));
  }

  /* ---- 内置能力（只读参考） ---- */
  const builtins = BUILTIN_COMPONENTS[t.scope] || [];
  if (builtins.length){
    const h = document.createElement('div');
    h.className = 'sec';
    h.textContent = '内置能力（一直都在，只是在这里列出来）';
    compsListEl.appendChild(h);
    const wrap = document.createElement('div');
    wrap.className = 'compbuiltins';
    for (const b of builtins){
      const d = document.createElement('div');
      d.className = 'compbuiltin';
      d.innerHTML = '<b>' + esc(b.label) + '</b><span>' + esc(b.hint || '') + '</span>';
      wrap.appendChild(d);
    }
    compsListEl.appendChild(wrap);
  }
}

/* 小工具：别让标签里的尖括号咬到 DOM */
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------------- 优先级那一行 ---------------- */
function rowPriority(n){
  const box = document.createElement('div');
  box.className = 'compcard';
  const head = document.createElement('div');
  head.className = 'comphead';
  head.innerHTML = '<b>优先级</b><span>默认：变量 1000 / 输出 900 / 运算 100，其余 0</span>';
  box.appendChild(head);

  const line = document.createElement('div');
  line.className = 'compline';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'compinput';
  inp.placeholder = '留空 = 用默认；也可以写 {倍率}';
  inp.value = n.priority == null ? '' : String(n.priority);
  const read = document.createElement('span');
  read.className = 'compref';
  const show = () => { read.textContent = '→ ' + priorityOf(n); };
  inp.oninput = () => { show(); };
  inp.onchange = () => {
    const v = inp.value.trim();
    n.priority = v === '' ? null : v;
    reindex(); sizeAll(); pushHist(); mark();
    show();
  };
  show();
  line.appendChild(inp);
  line.appendChild(read);
  box.appendChild(line);
  return box;
}

/* ---------------- 一个扩展组件（卡片） ---------------- */
function rowComponent(t, def){
  const { entity, scope } = t;
  const has = compOn(entity, def.id);
  const box = document.createElement('div');
  box.className = 'compcard' + (has ? ' on' : '');

  const head = document.createElement('div');
  head.className = 'comphead';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = has;
  cb.onchange = () => {
    if (cb.checked) setComponent(entity, def.id, {});
    else removeComponent(entity, def.id);
    reindex(); sizeAll(); pushHist(); mark();
    renderComps();
  };
  const lab = document.createElement('b');
  lab.textContent = def.label;
  head.appendChild(cb); head.appendChild(lab);
  const hint = document.createElement('span');
  hint.textContent = def.hint || '';
  head.appendChild(hint);
  box.appendChild(head);

  if (!has) return box;                 // 没挂上就只显示一个勾选框

  for (const pd of def.props){
    box.appendChild(propRow(entity, scope, def, pd));
  }
  return box;
}

/* ---------------- 一个属性输入 ---------------- */
function propRow(entity, scope, def, pd){
  const line = document.createElement('div');
  line.className = 'compline';
  const lab = document.createElement('span');
  lab.className = 'complab';
  lab.textContent = pd.label;
  line.appendChild(lab);

  const cur = compRaw(entity, def.id, pd.key);
  const commit = (v) => {
    setComponent(entity, def.id, { [pd.key]: v });
    reindex(); sizeAll(); pushHist(); mark();
    renderComps();
  };

  if (pd.type === 'color'){
    const wrap = document.createElement('div');
    wrap.className = 'opts';
    buildSwatches(wrap, cur || null, (v) => commit(v == null ? '' : v));
    line.appendChild(wrap);
  } else {
    const inp = document.createElement('input');
    inp.className = 'compinput';
    inp.type = pd.type === 'number' ? 'number' : 'text';
    if (pd.min != null) inp.min = pd.min;
    if (pd.max != null) inp.max = pd.max;
    inp.value = cur == null ? '' : String(cur);
    if (pd.refable) inp.placeholder = '可以写 {变量}';
    inp.onchange = () => commit(inp.value);
    line.appendChild(inp);
  }

  // 实时显示解析结果，让人看清 {变量} 到底算成了什么
  if (pd.refable){
    const ref = document.createElement('span');
    ref.className = 'compref';
    const show = () => {
      const raw = compRaw(entity, def.id, pd.key);
      const v = pd.type === 'number'
        ? compNumber(entity, def.id, pd.key, scope, 0)
        : compText(entity, def.id, pd.key, scope);
      const changed = String(raw == null ? '' : raw) !== String(v);
      ref.textContent = changed ? '→ ' + String(v) : '';
    };
    show();
    line.appendChild(ref);
  }
  return line;
}

/* 改完属性 / 选中变化之后，外面会调这个 */
const compsRefresh = () => refreshCompsIfOpen();

document.getElementById('compsClose').onclick = () => closeComps();
