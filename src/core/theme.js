'use strict';
/* ==========================================================================
   GRAPHEON · core/theme.js
   主题注册表 —— 调色板只在这里定义一次，DOM（CSS 变量）和 canvas 共用同一份。

   加一个新主题只要三步：
     1. 复制 styles/theme-undertale.css → styles/theme-xxx.css，改 :root 里的默认值；
     2. 在下面 THEMES 里加一项，canvas 里的键就是画布用的颜色；
     3. 调 applyTheme('xxx') 即可（会写入 localStorage，下次打开还是它）。
   如果新主题的 CSS 只是改变量，第 1 步甚至可以省掉，直接复用现有样式表。
   ========================================================================== */

/* canvas 用 C.xxx；DOM 用同名 CSS 变量 --xxx */
const THEMES = {
  undertale: {
    label: 'Undertale',
    canvas: {
      bg:    '#000000',
      white: '#ffffff',
      yellow:'#ffd800',
      red:   '#ff0000',
      gray:  '#8a8a8a',
      dim:   '#4a4a4a',
      grid:  '#151515'
    }
  }
  /* 示例：再加一套只要放开下面这段，并调 applyTheme('mono')
  ,mono: {
    label: 'Mono',
    canvas: { bg:'#000000', white:'#ffffff', yellow:'#ffffff', red:'#ffffff',
              gray:'#9a9a9a', dim:'#5a5a5a', grid:'#141414' }
  }
  */
};

const THEME_KEY = 'grapheon.theme.v1';
let themeId = 'undertale';

const themeIds   = () => Object.keys(THEMES);
const currentTheme = () => THEMES[themeId] || THEMES.undertale;

/* CSS 变量名 ←→ 调色板键名 */
const THEME_VARS = { bg:'--bg', white:'--w', yellow:'--y', red:'--r', gray:'--g', dim:'--d', grid:'--grid' };

function applyTheme(id){
  const t = THEMES[id] || THEMES.undertale;
  themeId = THEMES[id] ? id : 'undertale';
  const pal = t.canvas;
  // 就地改属性：C 是 const 对象，别重新赋值（其它模块按引用持有它）
  for (const k in THEME_VARS) if (pal[k] != null) C[k] = pal[k];
  // 同步到 DOM
  const rootStyle = document.documentElement.style;
  for (const k in THEME_VARS) if (pal[k] != null) rootStyle.setProperty(THEME_VARS[k], pal[k]);
  try { localStorage.setItem(THEME_KEY, themeId); } catch (e) {}
  if (typeof mark === 'function') mark();
  return themeId;
}
function loadTheme(){
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  return applyTheme(saved || 'undertale');
}
