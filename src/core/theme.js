'use strict';
/* ==========================================================================
   GRAPHEON · core/theme.js
   主题注册表 —— 调色板只在这里定义一次，DOM（CSS 变量）和 canvas 共用同一份。

   主题除了调色板，还能带三样「性格」：
     grid   背景样式：lines（横纵网格）/ checker（棋盘）/ dots（点阵）/ none
     heart  画不画那颗决心红心
     star   对话栏和标题前那个星号

   加一个新主题只要在 THEMES 里加一项，调 applyTheme('xxx') 即可
   （会写进 localStorage，下次打开还是它）。

   背景样式可以被用户单独覆盖（设置面板里选），存在 grapheon.grid.v1。
   ========================================================================== */

/* canvas 用 C.xxx；DOM 用同名 CSS 变量 --xxx */
const THEMES = {
  /* 默认主题：棋盘底、没有红心、没有星号 */
  board: {
    label: '棋盘',
    grid: 'checker',
    heart: false,
    star: false,
    canvas: {
      bg:    '#000000',
      white: '#ffffff',
      yellow:'#ffd800',
      red:   '#ff0000',
      gray:  '#8a8a8a',
      dim:   '#4a4a4a',
      grid:  '#1b1b1b'
    }
  },
  undertale: {
    label: 'Undertale',
    grid: 'lines',
    heart: true,
    star: true,
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
};

const THEME_KEY = 'grapheon.theme.v1';
const GRID_KEY  = 'grapheon.grid.v1';
const DEFAULT_THEME = 'board';
let themeId = DEFAULT_THEME;

const themeIds   = () => Object.keys(THEMES);
const currentTheme = () => THEMES[themeId] || THEMES[DEFAULT_THEME];
/* 主题自带的性格，缺省就按 Undertale 那套来 */
const themeGrid  = () => currentTheme().grid  || 'lines';
const themeHeart = () => currentTheme().heart !== false;
const themeStar  = () => currentTheme().star  !== false;

/* 背景样式：用户选过就用用户的，没选过跟随主题 */
const GRID_STYLES = ['theme', 'lines', 'checker', 'dots', 'none'];
const GRID_LABEL  = { theme:'跟随主题', lines:'横纵网格', checker:'棋盘', dots:'点阵', none:'无' };
let gridPref = 'theme';
function loadGridPref(){
  try { const v = localStorage.getItem(GRID_KEY); if (GRID_STYLES.indexOf(v) >= 0) gridPref = v; } catch(e){}
}
function setGridPref(v){
  if (GRID_STYLES.indexOf(v) < 0) return;
  gridPref = v;
  try { localStorage.setItem(GRID_KEY, v); } catch(e){}
  if (typeof mark === 'function') mark();
}
const gridStyle = () => gridPref === 'theme' ? themeGrid() : gridPref;

/* CSS 变量名 ←→ 调色板键名 */
const THEME_VARS = { bg:'--bg', white:'--w', yellow:'--y', red:'--r', gray:'--g', dim:'--d', grid:'--grid' };

function applyTheme(id){
  const t = THEMES[id] || THEMES[DEFAULT_THEME];
  themeId = THEMES[id] ? id : DEFAULT_THEME;
  const pal = t.canvas;
  // 就地改属性：C 是 const 对象，别重新赋值（其它模块按引用持有它）
  for (const k in THEME_VARS) if (pal[k] != null) C[k] = pal[k];
  // 同步到 DOM
  const rootStyle = document.documentElement.style;
  for (const k in THEME_VARS) if (pal[k] != null) rootStyle.setProperty(THEME_VARS[k], pal[k]);
  // 主题性格：星号靠一个 body class 控制，CSS 里藏掉
  document.body.classList.toggle('no-star', !themeStar());
  document.body.classList.toggle('no-heart', !themeHeart());
  try { localStorage.setItem(THEME_KEY, themeId); } catch (e) {}
  if (typeof mark === 'function') mark();
  return themeId;
}
function loadTheme(){
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  loadGridPref();
  return applyTheme(THEMES[saved] ? saved : DEFAULT_THEME);
}
