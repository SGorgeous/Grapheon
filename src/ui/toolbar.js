'use strict';
/* ==========================================================================
   GRAPHEON · ui/toolbar.js
   顶栏按钮的装配层。

   ⚠ 这里是「加载期就把函数当值取出来」的地方，所以本文件必须排在所有被引用模块之后。
   为保险起见，一律用箭头函数包一层：这样函数是在**点击时**才解析的，
   即使以后有人插了新模块、顺序变了，也不会像 `onclick = saveFile` 那样
   在加载期抛 ReferenceError 并让后面所有绑定一起失效。
   ========================================================================== */

const TOPBAR = [
  ['b-undo',  () => undo()],
  ['b-redo',  () => redo()],
  ['b-new',   (ev) => { hideCtx(); showNewMenu(ev.currentTarget); }],
  ['b-open',  () => fileEl.click()],
  ['b-save',  () => saveFile()],
  ['b-png',   () => openExport()],
  ['b-insert',(ev) => { hideCtx(); showInsertMenu(ev.currentTarget); }],
  ['b-view',  (ev) => { hideCtx(); showViewMenu(ev.currentTarget); }],
  ['b-log',   () => openLogbox()],
  ['b-set',   () => toggleSettings()],
  ['b-back',  () => exitEmbed()],
  ['b-help',  () => openHelp()],
  ['b-reload',() => { if (confirm('刷新页面？没保存的改动会丢。')) location.reload(); }]
];

for (const [id, fn] of TOPBAR){
  const btn = document.getElementById(id);
  if (!btn) continue;
  btn.onclick = fn;
}
