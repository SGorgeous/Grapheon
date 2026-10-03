'use strict';
/* ==========================================================================
   GRAPHEON · ui/numbox.js
   数值小浮层：**滑条 + 填空，双向联动**。

   为什么要有它：
     优先级 / 透明度 / 线宽 这类值，有时候想拖（快速试），有时候想精确写，
     有时候还得写 {变量}。只有滑条或只有输入框都不够 ——
     这正是之前「优先级只有填空、透明度只有滑条」那个割裂的由来。

   用法：
     openNumBox({
       title:'优先级', who:'「甲」', hint:'…',
       min:0, max:2000, step:10,
       value:'',                 // 空串 = 用默认
       onOk:(v) => { … }         // v 是**文本**；空串表示「用默认」
     });
   ========================================================================== */

let numBoxCfg = null;

const numBoxEl = () => document.getElementById('numbox');
const numBoxOpen = () => {
  const el = numBoxEl();
  return !!el && el.style.display === 'block';
};

function openNumBox(cfg){
  const el = numBoxEl();
  if (!el) return false;
  numBoxCfg = cfg || {};
  const c = numBoxCfg;
  const range = document.getElementById('numboxRange');
  const text  = document.getElementById('numboxText');
  document.getElementById('numboxWho').textContent = (c.title || '数值') + (c.who ? '　' + c.who : '');
  document.getElementById('numboxHint').textContent = c.hint || '';
  range.min = String(c.min == null ? 0 : c.min);
  range.max = String(c.max == null ? 100 : c.max);
  range.step = String(c.step == null ? 1 : c.step);
  const v = (c.value == null) ? '' : String(c.value);
  text.value = v;
  /* 填的是数字就同步滑条；填的是 {变量} 或空的，滑条停在起点 */
  const num = numOfText(v, c);
  range.value = String(num == null ? (c.min == null ? 0 : c.min) : num);
  text.placeholder = c.placeholder || '留空 = 用默认；也可以写 {变量}';
  el.style.display = 'block';
  positionNumBox();
  setTimeout(() => { try { text.focus(); text.select(); } catch(e){} }, 0);
  return true;
}
function closeNumBox(){
  const el = numBoxEl();
  if (el) el.style.display = 'none';
  numBoxCfg = null;
}
/* 文本 → 数字。不是纯数字就返回 null（{变量}、空串都算） */
function numOfText(s, c){
  const t = String(s == null ? '' : s).trim();
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!isFinite(n)) return null;
  const lo = (c && c.min != null) ? c.min : -Infinity;
  const hi = (c && c.max != null) ? c.max : Infinity;
  return Math.max(lo, Math.min(hi, n));
}
/* 居中偏上放 —— 小浮层不跟鼠标，免得挡住刚点的那一项 */
function positionNumBox(){
  const el = numBoxEl();
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = Math.max(8, Math.min(window.innerWidth - r.width - 8, (window.innerWidth - r.width) / 2));
  const y = Math.max(8, Math.min(window.innerHeight - r.height - 8, window.innerHeight * 0.28));
  el.style.left = Math.round(x) + 'px';
  el.style.top  = Math.round(y) + 'px';
}
function numBoxCommit(useDefault){
  const c = numBoxCfg; if (!c) return;
  const text = document.getElementById('numboxText');
  const v = useDefault ? '' : text.value.trim();
  const cb = c.onOk;
  closeNumBox();
  if (typeof cb === 'function') cb(v);
}
function bindNumBox(){
  const el = numBoxEl();
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  const range = document.getElementById('numboxRange');
  const text  = document.getElementById('numboxText');
  /* 拖滑条 → 文本跟着变 */
  range.addEventListener('input', () => { text.value = range.value; });
  /* 填文本 → 是数字就把滑条挪过去 */
  text.addEventListener('input', () => {
    const n = numOfText(text.value, numBoxCfg || {});
    if (n != null) range.value = String(n);
  });
  text.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter'){ ev.preventDefault(); numBoxCommit(false); }
    else if (ev.key === 'Escape'){ ev.preventDefault(); closeNumBox(); }
    ev.stopPropagation();
  });
  document.getElementById('numboxOk').addEventListener('click', () => numBoxCommit(false));
  document.getElementById('numboxClear').addEventListener('click', () => numBoxCommit(true));
  document.getElementById('numboxCancel').addEventListener('click', () => closeNumBox());
  /* 点外面就关掉（Esc 由 keys.js 的 ui.escape 管） */
  document.addEventListener('pointerdown', (ev) => {
    if (!numBoxOpen()) return;
    if (el.contains(ev.target)) return;
    closeNumBox();
  }, true);
}
bindNumBox();
