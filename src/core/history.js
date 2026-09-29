'use strict';
/* ==========================================================================
   GRAPHEON · core/history.js
   撤销 / 重做栈、localStorage 自动保存。
   ========================================================================== */

/* ---------------- 历史 ---------------- */
const hist = { stack:[], i:-1 };
function snapshot(){ return JSON.stringify(serialize()); }
function pushHist(){
  const s = snapshot();
  if (hist.stack[hist.i] === s) return;
  hist.stack = hist.stack.slice(0, hist.i + 1);
  hist.stack.push(s);
  if (hist.stack.length > 120) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  autosave();
}
function initHist(){ hist.stack = [snapshot()]; hist.i = 0; }
function undo(){
  if (hist.i <= 0) { say('* 没有可以撤销的步骤了。'); return; }
  hist.i--; applySnap(hist.stack[hist.i]); say('* 已撤销。');
}
function redo(){
  if (hist.i >= hist.stack.length - 1) { say('* 没有可以重做的步骤了。'); return; }
  hist.i++; applySnap(hist.stack[hist.i]); say('* 已重做。');
}
function applySnap(s){
  deserialize(JSON.parse(s));
  relayout(); autosave(); mark();
}

/* ---------------- 自动保存 ---------------- */
const LS_KEY = 'grapheon.doc.v1';
let autosaveTimer = null;
function autosave(){
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch(e){}
  }, 400);
}

