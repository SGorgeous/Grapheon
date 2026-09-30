'use strict';
/* ==========================================================================
   GRAPHEON · core/util.js
   全局常量、调色板、小工具函数。
   ========================================================================== */

/* ---------------- 常量 ---------------- */
/* GNU Unifont：16px 网格点阵字体。16px 时 ASCII 8px/字、CJK 16px/字。
   字号一律取 16 的整数倍（16 / 32）；它只有 Regular，不要用 bold（合成粗体会糊）。 */
const FONT   = 'Unifont,"GNU Unifont","Courier New",Consolas,"Microsoft YaHei",monospace';
const FS     = 16;      // 正文字号（Unifont 原生尺寸）
const FS_BIG = 32;      // 根节点字号（2× 原生尺寸）
const PADX   = 18, PADY = 13;
const MINW   = 148, MAXW = 300, MINH = 48;
/* 手动缩放时的下限，别让节点缩成一条线 */
const MIN_FIXED_W = 72, MIN_FIXED_H = 40;

/* ---------------- 节点可自定义的外观 ----------------
   全部存成「值或 null」，null = 跟随主题。这样换主题时没手动改过的节点会一起变。 */
const NODE_FONTS = {
  auto:  FONT,
  mono:  '"Courier New", Consolas, monospace',
  sans:  '"Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
  serif: 'Georgia, "Songti SC", SimSun, serif'
};
const NODE_FONT_LABEL = { auto:'默认 Unifont', mono:'等宽', sans:'黑体', serif:'衬线' };
/* 0 = 自动（正文 16 / 根节点 32） */
const NODE_FS_CHOICES = [0, 16, 24, 32, 48];
const NODE_FS_LABEL = (v) => v ? String(v) : '自动';
/* Undertale 味的调色板 + 几个方便区分的颜色 */
const NODE_COLORS = [
  ['#ffffff', '白'], ['#ffd800', '黄'], ['#ff7f27', '橙'], ['#ff0000', '红'],
  ['#00ffff', '青'], ['#00ff00', '绿'], ['#3b7dff', '蓝'], ['#b967ff', '紫'], ['#8a8a8a', '灰']
];
/* 节点的「种类」。目前只有普通节点；program 是给程序化节点预留的接缝。 */
const NODE_KINDS = ['node', 'program'];
const nodeFontFamily = (n) => NODE_FONTS[n && n.font] || FONT;
const nodeFontSize   = (n) => (n && n.fsPx) ? n.fsPx : ((n && n.big) ? FS_BIG : FS);

/* ---------------- 分组 ---------------- */
const GROUP_PAD = 26;        // 外框离成员的边距
const GROUP_TITLE_H = 32;    // 顶部给标题留的高度
const HGAP   = 68, VGAP = 18, ROOT_VGAP = 150;
const STUB   = 22, CORNER = 10;
/* 画布调色板。实际值由 core/theme.js 的 applyTheme() 写入，
   这里只是各主题共有的默认值（也是 theme.js 认得的键名）。 */
const C = {
  bg:'#000000', white:'#ffffff', yellow:'#ffd800', red:'#ff0000',
  gray:'#8a8a8a', dim:'#4a4a4a', grid:'#151515'
};

/* ---------------- 小工具 ---------------- */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
function el(tag, cls, html){
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}
/* 按像素宽度截断文本，超出补省略号（导出标题用） */
function fitText(g, text, maxW){
  text = String(text == null ? '' : text);
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

/* ---------------- 下载：全项目只有这一条路径 ----------------
   保存 JSON 和导出 PNG 都走这里，测试里只要把 downloadBlob 换掉就能同时覆盖两者。 */
function downloadBlob(blob, filename){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
function dataURLtoBlob(url){
  const bin = atob(url.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type:'image/png' });
}


/* ---------------- 面板通用控件（edgebox / endbox / nodebox 共用） ---------------- */
/* 一排单选：点一下就换，立即作用到真实对象上 */
function buildOpts(host, list, cur, onPick){
  host.innerHTML = '';
  for (const [val, label] of list){
    const on = String(cur) === String(val);
    const d = el('div', 'opt' + (on ? ' on' : ''),
      '<span class="hrt"></span><span>' + label + '</span>');
    d.onclick = () => onPick(val);
    host.appendChild(d);
  }
}
/* 一排色块 + 一个「默认」。cur 为 null 时默认项高亮。 */
function buildSwatches(host, cur, onPick){
  host.innerHTML = '';
  const mk = (val, color, label) => {
    const on = (cur || null) === val;
    const d = el('div', 'sw' + (on ? ' on' : ''));
    if (color) d.style.background = color;
    else d.classList.add('sw-auto');
    d.title = label;
    d.onclick = () => onPick(val);
    host.appendChild(d);
  };
  mk(null, null, '默认（跟随主题）');
  for (const [color, label] of NODE_COLORS) mk(color, color, label);
}
