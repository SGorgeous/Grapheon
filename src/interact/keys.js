'use strict';
/* ==========================================================================
   GRAPHEON · interact/keys.js
   快捷键：一张可自定义的绑定表（BINDINGS）+ 一张动作注册表（ACTIONS）。

   想改键位有两种办法：
     · 运行时：GP.keys.bind('ctrl+d', 'node.delete') / GP.keys.unbind('delete') / GP.keys.reset()
              改动会写进 localStorage，下次打开仍然生效。
     · 改默认值：直接改下面 defaultBindings() 里的表。
   想加新动作：往 ACTIONS 里加一项 { label, group, run, overlay?, needSel? }，
              再在 defaultBindings() 里给它绑一个组合键即可。
   ========================================================================== */

/* 组合键 id 规则（comboOf 生成）：
     修饰键前缀 ctrl / alt / shift（shift 只在与 ctrl|alt 同时按下时才作为前缀，
     单独的 Shift+w 因为字符已经是 'W'，会归一化成 'w'）；
     键名统一小写：'tab' 'enter' 'f2' 'delete' 'space' 'arrowleft' ...，单字符就是它本身。 */
function comboOf(ev){
  const parts = [];
  if (ev.ctrlKey || ev.metaKey) parts.push('ctrl');
  if (ev.altKey) parts.push('alt');
  // shift 只在和 ctrl/alt 同时按下时才算修饰键：单独的 Shift+w 字符已经是 'W'，
  // Shift+↑ 也直接归一化成 'arrowup'（不这么做的话误按 Shift 就会让快捷键失灵）
  if (ev.shiftKey && parts.length) parts.push('shift');
  let k = ev.key;
  if (k === ' ' || k === 'Spacebar') k = 'space';
  if (k.length === 1){
    if (/[A-Za-z]/.test(k)) k = k.toLowerCase();
  } else {
    k = k.toLowerCase();
  }
  parts.push(k);
  return parts.join('+');
}

/* ★ 键位对齐 Blender 的节点编辑器（对照见文件头注释）。
   两个本应用特有的动作让位：
     · WASD 生成节点 → Shift+方向键（把 A / S / D / W 让给 Blender 的语义）
     · Ctrl+方向键 跳转 → 方向键直接跳转
   加子节点（node.child）不再占键位，仍在右键菜单里。 */
function defaultBindings(){
  return {
    /* 添加 / 结构 */
    'ctrl+a':     'ui.addMenu',      // Blender 是 Shift+A；这个应用的 comboOf 丢掉单 Shift，改 Ctrl+A
    'enter':      'node.sibling',    // 本应用特有，保留
    'tab':        'node.collapse',   // Blender: Tab 进出组 → 这里折叠 / 展开
    'f2':         'node.rename',
    'x':          'node.delete',     // Blender: X 删除
    'delete':     'node.delete',
    'backspace':  'node.delete',

    /* 选择 */
    'a':          'sel.all',         // Blender: A 全选
    'alt+a':      'sel.none',        // Blender: Alt+A 取消全选
    'ctrl+i':     'sel.invert',      // Blender: Ctrl+I 反选

    /* 分组 */
    'ctrl+g':     'group.create',
    'ctrl+alt+g': 'group.dissolve',  // Blender: Ctrl+Alt+G 解组

    /* 连线 */
    'f':          'edge.link',       // Blender: F 连接选中的两个

    /* 视图 */
    'n':          'style.open',      // Blender: N 侧栏 → 样式面板
    'ctrl+space': 'ui.toggle',       // Blender: Ctrl+Space 最大化 → 隐藏界面
    'home':       'view.fit',        // Blender: Home 看全部
    'h':          'ui.help',
    '?':          'ui.help',

    /* 生成（Ctrl+方向键）/ 跳转（方向键）
       ⚠ 不能用 Shift+方向键：comboOf 会把单独的 Shift 丢掉（防误按），
          Shift+→ 会被归一成 arrowright，和跳转撞上。 */
    'ctrl+arrowup':    'node.spawn.up',
    'ctrl+arrowdown':  'node.spawn.down',
    'ctrl+arrowleft':  'node.spawn.left',
    'ctrl+arrowright': 'node.spawn.right',
    'arrowup':    'node.nav.up',
    'arrowdown':  'node.nav.down',
    'arrowleft':  'node.nav.left',
    'arrowright': 'node.nav.right',

    /* 面板 / 文档 */
    'e':          'style.open',
    'c':          'comps.open',
    'escape':     'ui.escape',
    'ctrl+z':     'doc.undo',
    'ctrl+shift+z':'doc.redo',
    'ctrl+y':     'doc.redo',
    'ctrl+s':     'doc.save',
    'ctrl+o':     'doc.open',
    'ctrl+e':     'doc.export',
    'ctrl+l':     'layout.tidy'
  };
}

/* 动作表。overlay:true 表示浮层打开时仍然生效（目前只有 Esc）。 */
const ACTIONS = {
  'ui.escape':        { label:'关闭浮层 / 取消选择', group:'界面', overlay:true, run(){
      if (nodeBoxEl.style.display === 'block'){ closeNodeBox(); return; }
      if (typeof compsOpen === 'function' && compsOpen()){ closeComps(); return; }
      if (typeof libOpen === 'function' && libOpen()){ closeLib(); return; }
      if (settingsOpen()){ closeSettings(); return; }
      if (insideEmbed()){ exitEmbed(); return; }   // 在嵌入文档里，Esc 先出来
      if (endBoxEl.style.display === 'block'){ closeEndBox(); return; }
      if (edgeBoxEl.style.display === 'block'){ closeEdgeBox(); return; }
      if (expEl.style.display === 'block'){ closeExport(); return; }
      if (helpEl.style.display === 'block'){ closeHelp(); return; }
      if (ctxEl.style.display === 'block'){ hideCtx(); return; }
      if (editing){ cancelEdit(); return; }
      selectOnly(null); lastClickNode = null;
  }},
  'ui.help':          { label:'操作指南', group:'界面', run(){ openHelp(); } },
  /* ★ 对齐 Blender：Shift+A 的「添加菜单」 */
  'ui.addMenu':       { label:'添加节点', group:'结构', run(){
      const b = document.getElementById('b-new');
      if (b){ showNewMenu(b); return true; }
      return false;
  }},
  /* ★ 对齐 Blender：Alt+A 取消全选 */
  'sel.none':         { label:'取消全选', group:'文档', run(){
      selectOnly(null);
      mark();
      say('* 已取消选择。');
  }},
  /* ★ 对齐 Blender：Ctrl+I 反选 */
  'sel.invert':       { label:'反选', group:'文档', run(){
      const before = new Set(sel);
      sel.clear();
      for (const n of doc.nodes) if (!before.has(n.id) && !isHidden(n.id)) sel.add(n.id);
      for (const g of doc.groups) if (!before.has(g.id)) sel.add(g.id);
      mark();
      say(sel.size ? '* 反选：选中了 ' + sel.size + ' 个。' : '* 反选之后什么都没选中。');
  }},
  /* ★ 对齐 Blender：F 连接选中的两个节点 */
  'edge.link':        { label:'连接选中的两个节点', group:'连线', run(){
      const ids = [...sel].filter(id => byId(id));
      if (ids.length !== 2){ say('* 先选中两个节点，再按 F 连接。'); return true; }
      if (doc.edges.some(e => (e.s === ids[0] && e.t === ids[1]) || (e.s === ids[1] && e.t === ids[0]))){
        say('* 这两个节点已经连着了。'); return true;
      }
      const e = linkNodes(ids[0], ids[1]);
      reindex(); pushHist(); mark();
      say('* 连上了' + edgeTag(e) + '。');
  }},
  /* ★ 对齐 Blender：Home 看全部 */
  'view.fit':         { label:'缩放到全部', group:'视图', run(){
      fitView(); mark();
      say('* 已缩放到全部。');
  }},
  'comps.open':       { label:'组件面板', group:'样式', run(){ openComps(); } },
  'group.create':     { label:'把选中的节点加入分组', group:'分组', run(){ createGroup(); } },
  'group.dissolve':   { label:'解散选中的分组', group:'分组', run(){
      const grps = selectedGroups();
      if (!grps.length) return false;
      for (const grp of grps) dissolveGroup(grp, true);
      pushHist(); mark();
      say('* 解散了 ' + grps.length + ' 个分组。');
      return true;
  }},

  /* E = 样式面板，选中什么就开什么。都没有就返回 false 交给兜底逻辑。 */
  'style.open':       { label:'样式面板（节点 / 连线）', group:'样式', run(){
      if (selEdgeId){ openEdgeBox(); return true; }
      const n = soleSel();
      if (n){ openNodeBox(n); return true; }
      return false;
  }},
  'edge.dash':        { label:'实线 / 虚线', group:'连线', run(){
      const e = selectedEdge(); if (!e) return false;
      setEdgeStyle(e, { dash: !e.dash }); pushHist();
      say('* 线型：' + (e.dash ? '虚线' : '实线'));
      return true;
  }},
  'edge.route':       { label:'正交 / 曲线', group:'连线', run(){
      const e = selectedEdge(); if (!e) return false;
      cycleEdgeRoute(e); pushHist();
      return true;
  }},
  'edge.arrow':       { label:'切换箭头', group:'连线', run(){
      const e = selectedEdge(); if (!e) return false;
      cycleEdgeArrow(e); pushHist();
      return true;
  }},

  'node.child':       { label:'添加子节点', group:'结构', run(){ addChild(); } },
  'node.sibling':     { label:'添加兄弟节点', group:'结构', run(){ addSibling(); } },
  'ui.toggle':        { label:'隐藏 / 显示界面', group:'视图', run(){
      const on = document.body.classList.toggle('ui-hidden');
      say(on ? '* 界面已隐藏。' : '* 界面回来了。');
    } },
  'node.rename':      { label:'重命名', group:'结构', run(){
      if (soleSel()){ startEdit('node', soleSel().id); return; }
      const g = soleGroup();                       // 选中分组外框时改分组名
      if (g) startEdit('group', g.id);
    } },
  'node.delete':      { label:'删除节点', group:'结构', run(){ deleteSelection(); } },
  'node.collapse':    { label:'折叠 / 展开', group:'结构', run(){ toggleCollapse(); } },
  'node.spawn.up':    { label:'在该方向生成节点', group:'结构', run(){ spawnInDirection('up'); } },
  'node.spawn.down':  { label:'在该方向生成节点', group:'结构', run(){ spawnInDirection('down'); } },
  'node.spawn.left':  { label:'在该方向生成节点', group:'结构', run(){ spawnInDirection('left'); } },
  'node.spawn.right': { label:'在该方向生成节点', group:'结构', run(){ spawnInDirection('right'); } },
  'node.nav.up':      { label:'跳转选择', group:'结构', run(){ navigate('up'); } },
  'node.nav.down':    { label:'跳转选择', group:'结构', run(){ navigate('down'); } },
  'node.nav.left':    { label:'跳转选择', group:'结构', run(){ navigate('left'); } },
  'node.nav.right':   { label:'跳转选择', group:'结构', run(){ navigate('right'); } },

  'doc.undo':         { label:'撤销', group:'文档', run(){ undo(); } },
  'doc.redo':         { label:'重做', group:'文档', run(){ redo(); } },
  'doc.save':         { label:'保存为 JSON', group:'文档', run(){ saveFile(); } },
  'doc.open':         { label:'打开 JSON', group:'文档', run(){ fileEl.click(); } },
  'doc.export':       { label:'导出图片', group:'文档', run(){ openExport(); } },
  'sel.all':          { label:'全选', group:'文档', run(){ selectAll(); say('* 已全选。'); } },
  'layout.tidy':      { label:'按树形排版', group:'文档', run(){
      tidyLayout(); pushHist(); say('* 已按树形排版。');
  }}
};

/* ---------------- 绑定管理（对外 API：GP.keys） ---------------- */
/* ★ 存储键带版本号。
   默认键位表换了一整套时**必须升版** —— 老存档只存「和当时默认值的差异」，
   把它叠到新表上，旧键位会一个个复活（实测：w/s/d/space 全回来了，
   ctrl+arrowup 还和新表的生成键撞了车）。
   v1 → v2：对齐 Blender 那次换表。 */
const BIND_KEY = 'grapheon.keymap.v2';
let BINDINGS = defaultBindings();

function loadBindings(){
  BINDINGS = defaultBindings();
  try {
    const raw = localStorage.getItem(BIND_KEY);
    if (raw){
      const patch = JSON.parse(raw);
      for (const combo in patch){
        if (patch[combo] === null){ delete BINDINGS[combo]; continue; }
        /* ★ 兜底：动作不存在（改名 / 删掉了）就别认这条存档，
           不然会绑到一个永远不响的键上。 */
        if (!ACTIONS[patch[combo]]) continue;
        BINDINGS[combo] = patch[combo];
      }
    }
  } catch (e) {}
  return BINDINGS;
}
function saveBindings(){
  try {
    const base = defaultBindings(), patch = {};
    for (const c in BINDINGS) if (BINDINGS[c] !== base[c]) patch[c] = BINDINGS[c];
    for (const c in base) if (!(c in BINDINGS)) patch[c] = null;
    localStorage.setItem(BIND_KEY, JSON.stringify(patch));
  } catch (e) {}
}
function bindKey(combo, action){
  if (!ACTIONS[action]) throw new Error('未知动作: ' + action);
  for (const c in BINDINGS) if (BINDINGS[c] === action) delete BINDINGS[c];  // 一个动作只留一个键
  BINDINGS[combo] = action;
  saveBindings();
  return BINDINGS;
}
function unbindKey(combo){ delete BINDINGS[combo]; saveBindings(); return BINDINGS; }
function resetKeys(){ BINDINGS = defaultBindings(); try { localStorage.removeItem(BIND_KEY); } catch (e) {} return BINDINGS; }
function keymapRows(){
  const rows = [];
  for (const combo in BINDINGS){
    const a = ACTIONS[BINDINGS[combo]];
    if (a) rows.push({ combo, action:BINDINGS[combo], label:a.label, group:a.group });
  }
  return rows.sort((x, y) => (x.group + x.combo).localeCompare(y.group + y.combo));
}

/* ---------------- 事件入口 ---------------- */
function dispatchKey(ev){
  const tag = ev.target && ev.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return false;   // 正在输入框里打字

  const combo = comboOf(ev);
  const id = BINDINGS[combo];
  const act = id && ACTIONS[id];
  if (!act) return false;

  const expOpen  = expEl.style.display === 'block';
  const helpOpen = helpEl.style.display === 'block';
  const boxOpen  = edgeBoxEl.style.display === 'block';
  const endOpen  = endBoxEl.style.display === 'block';
  const nboxOpen = nodeBoxEl.style.display === 'block';
  const setOpen  = (typeof settingsOpen === 'function') && settingsOpen();
  if (!act.overlay && (expOpen || helpOpen || boxOpen || endOpen || nboxOpen)) return false;   // 浮层打开时屏蔽其它快捷键

  // run() 返回 false 表示「当前不适用」，交回给兜底逻辑（见下面的可打印字符改名）
  if (act.run(ev) === false) return false;
  ev.preventDefault();
  return true;
}

window.addEventListener('keydown', (ev) => {
  const tag = ev.target && ev.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;   // 正在输入框里打字

  if (dispatchKey(ev)) return;

  const expOpen  = expEl.style.display === 'block';
  const helpOpen = helpEl.style.display === 'block';
  const boxOpen  = edgeBoxEl.style.display === 'block';
  const endOpen  = endBoxEl.style.display === 'block';
  const nboxOpen = nodeBoxEl.style.display === 'block';
  const setOpen  = (typeof settingsOpen === 'function') && settingsOpen();
  if (expOpen || boxOpen || endOpen || nboxOpen || setOpen) return;            // 面板打开时不再兜底
  if (helpOpen){
    if (ev.key === 'h' || ev.key === 'H' || ev.key === '?'){ ev.preventDefault(); closeHelp(); }
    return;
  }
  // 兜底：其余可打印字符 = 直接改名（w/a/s/d 等已被绑定占用，改名也可用 F2 / 双击）
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key.length === 1 && soleSel()){
    ev.preventDefault();
    startEdit('node', soleSel().id, ev.key);
  }
});

/* 对外暴露，方便以后做「设置 → 快捷键」面板 */
window.GP = window.GP || {};
GP.keys = {
  get bindings(){ return BINDINGS; },
  actions: ACTIONS,
  bind: bindKey,
  unbind: unbindKey,
  reset: resetKeys,
  rows: keymapRows,
  comboOf,
  load: loadBindings,
  save: saveBindings
};
