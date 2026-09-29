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

function defaultBindings(){
  return {
    'tab':        'node.child',
    'enter':      'node.sibling',
    'f2':         'node.rename',
    'delete':     'node.delete',
    'backspace':  'node.delete',
    'space':      'node.collapse',
    'w':          'node.spawn.up',
    'a':          'node.spawn.left',
    's':          'node.spawn.down',
    'd':          'node.spawn.right',
    'arrowup':    'node.spawn.up',
    'arrowleft':  'node.spawn.left',
    'arrowdown':  'node.spawn.down',
    'arrowright': 'node.spawn.right',
    'ctrl+arrowup':    'node.nav.up',
    'ctrl+arrowleft':  'node.nav.left',
    'ctrl+arrowdown':  'node.nav.down',
    'ctrl+arrowright': 'node.nav.right',
    'e':          'edge.style',
    'h':          'ui.help',
    '?':          'ui.help',
    'escape':     'ui.escape',
    'ctrl+z':     'doc.undo',
    'ctrl+shift+z':'doc.redo',
    'ctrl+y':     'doc.redo',
    'ctrl+s':     'doc.save',
    'ctrl+o':     'doc.open',
    'ctrl+e':     'doc.export',
    'ctrl+a':     'sel.all',
    'ctrl+l':     'layout.tidy'
  };
}

/* 动作表。overlay:true 表示浮层打开时仍然生效（目前只有 Esc）。 */
const ACTIONS = {
  'ui.escape':        { label:'关闭浮层 / 取消选择', group:'界面', overlay:true, run(){
      if (edgeBoxEl.style.display === 'block'){ closeEdgeBox(); return; }
      if (expEl.style.display === 'block'){ closeExport(); return; }
      if (helpEl.style.display === 'block'){ closeHelp(); return; }
      if (ctxEl.style.display === 'block'){ hideCtx(); return; }
      if (editing){ cancelEdit(); return; }
      selectOnly(null); lastClickNode = null;
  }},
  'ui.help':          { label:'操作指南', group:'界面', run(){ openHelp(); } },

  /* 没选中连线时返回 false，让兜底逻辑去处理（按 e 仍然可以直接起手改名） */
  'edge.style':       { label:'连线样式面板', group:'连线', run(){
      if (!selEdgeId) return false;
      openEdgeBox();
      return true;
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
  'node.rename':      { label:'重命名', group:'结构', run(){ if (soleSel()) startEdit('node', soleSel().id); } },
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
const BIND_KEY = 'grapheon.keymap.v1';
let BINDINGS = defaultBindings();

function loadBindings(){
  BINDINGS = defaultBindings();
  try {
    const raw = localStorage.getItem(BIND_KEY);
    if (raw){
      const patch = JSON.parse(raw);
      for (const combo in patch){
        if (patch[combo] === null) delete BINDINGS[combo];
        else BINDINGS[combo] = patch[combo];
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
  if (!act.overlay && (expOpen || helpOpen || boxOpen)) return false;   // 浮层打开时屏蔽其它快捷键

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
  if (expOpen || boxOpen) return;                       // 面板打开时不再兜底
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
