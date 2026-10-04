'use strict';
/* ==========================================================================
   GRAPHEON · ui/numbox.js
   值小浮层：**按字段类型出输入框**，数字型的给「滑条 + 填空双向联动」。

   为什么要有它：
     优先级 / 透明度 / 线宽这类值，有时候想拖（快速试），有时候想精确写，
     有时候还得写 {变量}。只有滑条或只有输入框都不够 ——
     这正是之前「优先级只有填空、透明度只有滑条」那个割裂的由来。

   两个入口：
     openValueBox({ title, who, hint, fields:[…], values:{…}, onOk(values) })
       fields 每项 { key, label, type:'number'|'text'|'color',
                     def, min, max, step, placeholder }
     openNumBox({ title, who, hint, min, max, step, value, onOk(v) })
       单个数字字段的简写（优先级 / 透明度在用）

   ⚠ 这个文件里**一个正则都没有** ——
     我的 PowerShell 写文件管线吃过反斜杠（\d 变成 d），正则静默失配过一次。
     能用 Number() / 字符比较判断的就不写正则。
   ========================================================================== */

let numBoxCfg = null;          // { onOk, fields }

const numBoxEl = () => document.getElementById('numbox');
const numBoxFieldsEl = () => document.getElementById('numboxFields');
const numBoxOpen = () => {
  const el = numBoxEl();
  return !!el && el.style.display === 'block';
};

/* 是不是一个纯数字（不用正则） */
function nbAsNumber(s){
  const t = String(s == null ? '' : s).trim();
  if (t === '') return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
}
function nbClamp(n, f){
  const lo = (f && f.min != null) ? f.min : -Infinity;
  const hi = (f && f.max != null) ? f.max : Infinity;
  return Math.max(lo, Math.min(hi, n));
}
/* 看起来像 #rrggbb 吗（不用正则：长度 + 逐字符十六进制） */
function nbIsHexColor(s){
  const t = String(s == null ? '' : s).trim();
  if (t.length !== 7 || t.charAt(0) !== '#') return false;
  for (let i = 1; i < 7; i++){
    if ('0123456789abcdef'.indexOf(t.charAt(i).toLowerCase()) < 0) return false;
  }
  return true;
}

/* 造一个字段的一行 */
function nbBuildRow(f, value){
  const row = document.createElement('div');
  row.className = 'nbfield';
  row.dataset.key = f.key;
  const lab = document.createElement('span');
  lab.className = 'nblabel';
  lab.textContent = f.label || f.key;
  row.appendChild(lab);

  const v0 = (value == null) ? '' : String(value);
  const ph = f.placeholder || '留空 = 默认；也可以写 {变量}';
  const mkText = () => {
    const t = document.createElement('input');
    t.type = 'text';
    t.className = 'nbtext';
    t.spellcheck = false;
    t.autocomplete = 'off';
    t.placeholder = ph;
    t.value = v0;
    return t;
  };

  if (f.type === 'color'){
    /* 颜色：色块选择器 + 一个可写 {变量} 的文本框，两边互相同步 */
    const pick = document.createElement('input');
    pick.type = 'color';
    pick.className = 'nbcolor';
    pick.value = nbIsHexColor(v0) ? v0 : '#ffffff';
    const text = mkText();
    pick.addEventListener('input', () => { text.value = pick.value; });
    text.addEventListener('input', () => {
      if (nbIsHexColor(text.value)) pick.value = text.value.trim();
    });
    row.appendChild(pick);
    row.appendChild(text);
    row._read = () => text.value.trim();
    return row;
  }

  if (f.type === 'text'){
    const text = mkText();
    row.appendChild(text);
    row._read = () => text.value.trim();
    return row;
  }

  /* number：滑条 + 文本框，双向联动 */
  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'nbrange';
  range.min = String(f.min == null ? 0 : f.min);
  range.max = String(f.max == null ? 100 : f.max);
  /* ★ step 默认 1 不用 10：range 会把程序设的值吸附到步长上，
     填 1234 却显示 1230 会让人以为没填进去（其实存对了）。 */
  range.step = String(f.step == null ? 1 : f.step);
  const text = mkText();
  const num = nbAsNumber(v0);
  range.value = String(num == null ? (f.min == null ? 0 : f.min) : nbClamp(num, f));
  range.addEventListener('input', () => { text.value = range.value; });
  text.addEventListener('input', () => {
    const n = nbAsNumber(text.value);
    if (n != null) range.value = String(nbClamp(n, f));
  });
  row.appendChild(range);
  row.appendChild(text);
  row._read = () => text.value.trim();
  return row;
}

function openValueBox(cfg){
  const el = numBoxEl();
  if (!el) return false;
  const c = cfg || {};
  const fields = (c.fields || []).slice();
  numBoxCfg = { onOk: c.onOk, fields };
  document.getElementById('numboxWho').textContent = (c.title || '数值') + (c.who ? '　' + c.who : '');
  document.getElementById('numboxHint').textContent = c.hint || '';
  const host = numBoxFieldsEl();
  host.textContent = '';
  const values = c.values || {};
  for (const f of fields) host.appendChild(nbBuildRow(f, values[f.key]));
  el.style.display = 'block';
  positionNumBox();
  const first = host.querySelector('input.nbtext');
  setTimeout(() => { try { (first || host.querySelector('input')).focus(); if (first) first.select(); } catch(e){} }, 0);
  return true;
}
/* 单个数字字段的简写 */
function openNumBox(opt){
  const o = opt || {};
  return openValueBox({
    title: o.title, who: o.who, hint: o.hint,
    fields: [{ key:'v', label:o.label || '', type:'number',
               min:o.min, max:o.max, step:o.step, placeholder:o.placeholder }],
    values: { v: o.value },
    onOk: (vals) => { if (typeof o.onOk === 'function') o.onOk(vals.v); }
  });
}
function closeNumBox(){
  const el = numBoxEl();
  if (el) el.style.display = 'none';
  numBoxCfg = null;
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
  const host = numBoxFieldsEl();
  const vals = {};
  for (const row of host.querySelectorAll('.nbfield')){
    vals[row.dataset.key] = useDefault ? '' : (typeof row._read === 'function' ? row._read() : '');
  }
  const cb = c.onOk;
  closeNumBox();
  if (typeof cb === 'function') cb(vals);
}
function bindNumBox(){
  const el = numBoxEl();
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('keydown', (ev) => {
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
