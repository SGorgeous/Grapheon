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
const NODE_KINDS = ['node', 'program', 'image', 'embed', 'var', 'op', 'out'];
/* ---------------- 变量定义节点 / 运算节点 ----------------
   两个都是「框里有框」：描述文字在左上角，下面一排输入框。 */
const VAR_PAD = 12;
const VAR_NAME_W = 118, VAR_VAL_W = 118, VAR_BOX_H = 30;
const VAR_SCOPE_H = 22;
const OP_OP_W = 54, OP_VAL_W = 116, OP_BOX_H = 32;
/* 三种特殊变量控件 */
const CHECK_ROW_H = 26;          // 勾选：每行一个选项
const SLIDER_TRACK_H = 34;       // 滑条：轨道高度
const SWITCH_H = 34;             // 开关：按钮高度
const CONTROL_MIN_W = 210;       // 控件模式下变量的最小宽度
/* 输出节点：左上角描述 + 一个变量名框 */
const OUT_NAME_W = 190, OUT_BOX_H = 30;
/* ---------------- 嵌入文档节点 ----------------
   把一整份 Grapheon 当成一个节点嵌进来。它是**封闭**的：不接受任何连线，
   双击进去编辑的是内部副本，外部那份原文件一个字节都不会动。 */
const EMBED_NAME_H = 30;         // 顶部名称带
const EMBED_DEF_W = 340, EMBED_DEF_H = 240;
const EMBED_MIN_W = 180, EMBED_MIN_H = 130;
/* ---------------- 图片节点 ----------------
   图片以 data URL 内嵌（存文件、存 localStorage 都靠它），导入时先等比缩到 IMG_SRC_MAX 以内，
   太大再转 JPEG 压一道。名称画在右上角那条带里，描述画在图片下面。 */
const IMG_MAX_W  = 320;    // 节点默认宽度上限（按图片原始宽度取小）
const IMG_MIN_W  = 140;
const IMG_NAME_H = 30;     // 右上角名称带的高度
const IMG_SRC_MAX = 900;   // 导入时等比缩放的最长边
const IMG_BUDGET  = 700000; // data URL 超过这个长度就改用 JPEG 压
const SHAPES = ['rect', 'round', 'diamond', 'oval'];
const SHAPE_LABEL = { rect:'矩形', round:'圆角矩形', diamond:'菱形', oval:'椭圆' };
/* ---------------- 程序化节点 ----------------
   程序节点通过「指向目标的那条线」把自己的算符叠到目标上，多个可以累加。 */
const PROGRAM_OPS = ['style', 'shape', 'move', 'value'];
const PROGRAM_OP_LABEL = { style:'外观', shape:'形状', move:'位置', value:'数值' };
const PROGRAM_KEYS = {
  style: [['fsPx', '字号'], ['color', '字色'], ['border', '外框色'], ['font', '字体']],
  move:  [['x', '横向偏移'], ['y', '纵向偏移']],
  shape: [['shape', '形状']],
  value: [['value', '数值']]
};
const PROGRAM_MODES = ['add', 'set'];
const PROGRAM_MODE_LABEL = { add:'累加', set:'覆盖' };
const PROGRAM_DEFAULT = { op:'style', key:'fsPx', mode:'add', value:8 };
/* 这两个读的是「有效外观」（含程序化节点叠加上来的算符），不是节点裸字段 */
const nodeFontFamily = (n) => NODE_FONTS[effFont(n)] || FONT;
const nodeFontSize   = (n) => effFsPx(n) || ((n && n.big) ? FS_BIG : FS);

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
