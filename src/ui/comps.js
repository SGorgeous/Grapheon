'use strict';
/* ==========================================================================
   GRAPHEON · ui/comps.js
   组件面板 —— 面向组件的那个「一个 UI 管三种实体」。

   选中一个节点 / 一条连线 / 一个分组，这里就列出**它能挂的所有组件**：
     · 内置组件（角标 / 条件隐藏 / 自定义描边 / 线宽）
     · 用户自定义组件（自己起名 + 挑几个效果拼起来的）
     · 内置能力（只读列出，告诉你「这东西其实也是个组件」）

   ★ 所有可填的属性都能写 {变量}，作用域规则和你在节点正文里写一样。
     优先级也在这里填 —— 它同样是可引用变量的。
   ========================================================================== */

const compsEl      = document.getElementById('comps');
const compsSubEl   = document.getElementById('compsSub');
const compsListEl  = document.getElementById('compsList');
const compsHintEl  = document.getElementById('compsHint');

let compsTargetCache = null;
let compEditor = null;            // 正在编辑的自定义组件草稿（null = 没在编辑）

function compsOpen(){ return compsEl.style.display === 'block'; }
function closeComps(){ compsEl.style.display = 'none'; compsTargetCache = null; compEditor = null; mark(); }
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
  if (typeof settingsOpen === 'function' && settingsOpen()) closeSettings();
  if (typeof libOpen === 'function' && libOpen()) closeLib();
  compsEl.style.display = 'block';
  renderComps();
  mark();
}
function refreshCompsIfOpen(){
  if (!compsOpen()) return;
  const t = compsTarget();
  const key = t ? (t.scope + ':' + t.entity.id) : '';
  if (key !== compsTargetCache && !compEditor) { compsTargetCache = key; renderComps(); }
}

function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function btn(label, fn, cls){
  const b = document.createElement('button');
  b.className = 'ud-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  b.onclick = fn;
  return b;
}
function section(title){
  const d = document.createElement('div');
  d.className = 'sec';
  d.textContent = title;
  return d;
}

function renderComps(){
  const t = compsTarget();
  compsTargetCache = t ? (t.scope + ':' + t.entity.id) : '';
  compsListEl.innerHTML = '';

  /* ---- 自定义组件的编辑器（优先显示） ---- */
  if (compEditor){ renderCompEditor(); return; }

  if (!t){
    compsSubEl.textContent = '没有选中东西';
  } else {
    compsSubEl.textContent = t.what;
  }
  compsHintEl.textContent = '所有属性都能写 {变量} —— 作用域规则和在节点正文里写一样。';

  if (t){
    if (t.scope === 'node') compsListEl.appendChild(rowPriority(t.entity));
    for (const def of componentsFor(t.scope)) compsListEl.appendChild(rowComponent(t, def));
  }

  /* ---- 自定义组件管理 ---- */
  compsListEl.appendChild(section('自定义组件'));
  const bar = document.createElement('div');
  bar.className = 'compline';
  bar.appendChild(btn('新建组件…', () => {
    compEditor = { id:null, label:'', scopes:[t ? t.scope : 'node'], parts:[{ effect:'badge', props:{} }] };
    renderComps();
  }));
  if (USER_COMPONENTS.length){
    bar.appendChild(btn('全部导出为 JSON', exportUserComponents));
  }
  compsListEl.appendChild(bar);

  if (USER_COMPONENTS.length){
    const wrap = document.createElement('div');
    wrap.className = 'compbuiltins';
    for (const u of USER_COMPONENTS){
      const d = document.createElement('div');
      d.className = 'compuserdef';
      d.innerHTML = '<b>' + esc(u.label) + '</b><span>'
        + u.scopes.map(s => COMPONENT_SCOPE_LABEL[s]).join(' / ') + ' · '
        + u.parts.map(p => (effectDef(p.effect) || {}).label || p.effect).join(' + ') + '</span>';
      const e2 = btn('编辑', () => { compEditor = JSON.parse(JSON.stringify(u)); renderComps(); });
      const d2 = btn('删除', () => {
        unregisterUserComponent(u.id);
        reindex(); sizeAll(); pushHist(); mark();
        renderComps();
      });
      d.appendChild(e2); d.appendChild(d2);
      wrap.appendChild(d);
    }
    compsListEl.appendChild(wrap);
  } else {
    const d = document.createElement('div');
    d.className = 'sub';
    d.textContent = '还没有。自定义组件 = 自己起个名字，把几个「效果」拼在一起，'
      + '一次给实体加上好几样东西。';
    compsListEl.appendChild(d);
  }

  /* ---- 内置能力（只读参考） ---- */
  if (t){
    const builtins = BUILTIN_COMPONENTS[t.scope] || [];
    if (builtins.length){
      compsListEl.appendChild(section('内置能力（一直都在，只是在这里列出来）'));
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
  inp.oninput = show;
  inp.onchange = () => {
    const v = inp.value.trim();
    n.priority = v === '' ? null : v;
    reindex(); sizeAll(); pushHist(); mark(); show();
  };
  show();
  line.appendChild(inp); line.appendChild(read);
  box.appendChild(line);
  return box;
}

/* ---------------- 一个组件的实例卡片 ---------------- */
function rowComponent(t, def){
  const { entity, scope } = t;
  const usable = def.scopes.indexOf(scope) >= 0;
  if (!usable) return document.createComment('');
  const has = compOn(entity, def.id);
  const box = document.createElement('div');
  box.className = 'compcard' + (has ? ' on' : '') + (def.user ? ' user' : '');

  const head = document.createElement('div');
  head.className = 'comphead';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = has;
  cb.onchange = () => {
    if (cb.checked) setComponent(entity, def.id, {});
    else removeComponent(entity, def.id);
    reindex(); sizeAll(); pushHist(); mark(); renderComps();
  };
  const lab = document.createElement('b');
  lab.textContent = def.label + (def.user ? '（自定义）' : '');
  head.appendChild(cb); head.appendChild(lab);
  const hint = document.createElement('span');
  hint.textContent = def.user
    ? def.parts.map(p => (effectDef(p.effect) || {}).label || p.effect).join(' + ')
    : ((effectDef(def.effect) || {}).hint || '');
  head.appendChild(hint);
  box.appendChild(head);

  if (!has) return box;                 // 没挂上就只显示一个勾选框

  for (const grp of propsOfDef(def)){
    if (propsOfDef(def).length > 1){
      const sh = document.createElement('div');
      sh.className = 'comppart';
      sh.textContent = '· ' + grp.label;
      box.appendChild(sh);
    }
    for (const pd of grp.props) box.appendChild(propRow(entity, scope, def, pd));
  }
  return box;
}

/* ---------------- 一个属性输入 ---------------- */
function propRow(entity, scope, def, pd){
  const line = document.createElement('div');
  line.className = 'compline';
  const lab = document.createElement('span');
  lab.className = 'complab';
  lab.textContent = pd.bareKey ? pd.label : pd.label;
  line.appendChild(lab);

  const cur = compRaw(entity, def.id, pd.key);
  const commit = (v) => {
    setComponent(entity, def.id, { [pd.key]: v });
    reindex(); sizeAll(); pushHist(); mark(); renderComps();
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
    inp.value = cur == null ? '' : String(cur);
    if (pd.refable) inp.placeholder = '可以写 {变量}';
    inp.onchange = () => commit(inp.value);
    line.appendChild(inp);
  }

  if (pd.refable){
    const ref = document.createElement('span');
    ref.className = 'compref';
    const raw = compRaw(entity, def.id, pd.key);
    const v = pd.type === 'number'
      ? compNumber(entity, def.id, pd.key, scope, 0)
      : compText(entity, def.id, pd.key, scope);
    ref.textContent = String(raw == null ? '' : raw) !== String(v) ? '→ ' + String(v) : '';
    line.appendChild(ref);
  }
  return line;
}

/* =========================================================================
   自定义组件编辑器
   ========================================================================= */
function renderCompEditor(){
  const d = compEditor;
  compsSubEl.textContent = d.id ? '编辑自定义组件' : '新建自定义组件';
  compsHintEl.textContent = '自定义组件 = 起个名字 + 挑几个效果拼在一起。'
    + '效果是真正干活的那部分（写死在程序里），组件是它们的组合。';

  const box = document.createElement('div');
  box.className = 'compcard on';

  // 名字
  let line = document.createElement('div'); line.className = 'compline';
  let lab = document.createElement('span'); lab.className = 'complab'; lab.textContent = '名称';
  const nameInp = document.createElement('input');
  nameInp.className = 'compinput'; nameInp.value = d.label; nameInp.placeholder = '比如：打折标记';
  nameInp.oninput = () => { d.label = nameInp.value; };
  line.appendChild(lab); line.appendChild(nameInp); box.appendChild(line);

  // 作用域
  line = document.createElement('div'); line.className = 'compline';
  lab = document.createElement('span'); lab.className = 'complab'; lab.textContent = '能挂在哪';
  line.appendChild(lab);
  for (const s of COMPONENT_SCOPES){
    const w = document.createElement('label');
    w.className = 'compcheck';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = d.scopes.indexOf(s) >= 0;
    cb.onchange = () => {
      if (cb.checked){ if (d.scopes.indexOf(s) < 0) d.scopes.push(s); }
      else d.scopes = d.scopes.filter(x => x !== s);
    };
    w.appendChild(cb);
    const sp = document.createElement('span'); sp.textContent = COMPONENT_SCOPE_LABEL[s];
    w.appendChild(sp);
    line.appendChild(w);
  }
  box.appendChild(line);

  // 效果列表
  box.appendChild(section('包含哪些效果'));
  for (const eid of EFFECT_IDS){
    const ed = EFFECTS[eid];
    const used = d.parts.find(p => p.effect === eid);
    const card = document.createElement('div');
    card.className = 'compeffect' + (used ? ' on' : '');
    const h = document.createElement('div');
    h.className = 'comphead';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!used;
    cb.onchange = () => {
      if (cb.checked) d.parts.push({ effect:eid, props:{} });
      else d.parts = d.parts.filter(p => p.effect !== eid);
      renderComps();
    };
    const l = document.createElement('b'); l.textContent = ed.label;
    const sp = document.createElement('span'); sp.textContent = ed.hint || '';
    h.appendChild(cb); h.appendChild(l); h.appendChild(sp);
    card.appendChild(h);
    if (used){
      for (const pd of ed.props){
        const ln = document.createElement('div'); ln.className = 'compline';
        const lb = document.createElement('span'); lb.className = 'complab'; lb.textContent = pd.label;
        ln.appendChild(lb);
        if (pd.type === 'color'){
          const wrap = document.createElement('div'); wrap.className = 'opts';
          buildSwatches(wrap, used.props[pd.key] || null, (v) => { used.props[pd.key] = v == null ? '' : v; });
          ln.appendChild(wrap);
        } else {
          const inp = document.createElement('input');
          inp.className = 'compinput';
          inp.type = pd.type === 'number' ? 'number' : 'text';
          inp.value = used.props[pd.key] == null ? pd.def : used.props[pd.key];
          inp.placeholder = '默认值（可以写 {变量}）';
          inp.oninput = () => { used.props[pd.key] = inp.value; };
          ln.appendChild(inp);
        }
        card.appendChild(ln);
      }
    }
    box.appendChild(card);
  }
  // 效果能挂的作用域和组件声明的作用域要取交集，不然加了也用不上
  const bad = d.parts.filter(p => {
    const ed = EFFECTS[p.effect];
    return ed && !d.scopes.some(s => ed.scopes.indexOf(s) >= 0);
  });
  if (bad.length){
    const warn = document.createElement('div');
    warn.className = 'compwarn';
    warn.textContent = '⚠ ' + bad.map(p => EFFECTS[p.effect].label).join('、')
      + ' 不支持你选的作用域，加了也不会生效。';
    box.appendChild(warn);
  }

  // 按钮
  const bar = document.createElement('div');
  bar.className = 'compline';
  bar.appendChild(btn(d.id ? '保存修改' : '创建', () => {
    if (!d.label.trim()){ compsHintEl.textContent = '先给组件起个名字。'; return; }
    if (!d.scopes.length){ compsHintEl.textContent = '至少选一个作用域。'; return; }
    if (!d.parts.length){ compsHintEl.textContent = '至少挑一个效果。'; return; }
    const saved = registerUserComponent(d);
    if (!saved){ compsHintEl.textContent = '这个组件不合法，检查一下作用和效果。'; return; }
    compEditor = null;
    reindex(); sizeAll(); pushHist(); mark();
    renderComps();
  }));
  bar.appendChild(btn('取消', () => { compEditor = null; renderComps(); }));
  if (d.id){
    bar.appendChild(btn('删除这个组件', () => {
      unregisterUserComponent(d.id);
      compEditor = null;
      reindex(); sizeAll(); pushHist(); mark();
      renderComps();
    }));
  }
  box.appendChild(bar);
  compsListEl.appendChild(box);
}

/* 把自定义组件库导出成 JSON，方便发给别人 */
function exportUserComponents(){
  const blob = new Blob([JSON.stringify(userComponentDefs(), null, 2)], { type:'application/json' });
  downloadBlob(blob, 'grapheon-components.json');
  say('* 已导出 ' + USER_COMPONENTS.length + ' 个自定义组件。');
}

document.getElementById('compsClose').onclick = () => closeComps();
