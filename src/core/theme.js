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
    cursor: 'cross',
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
  /* 马卡龙粉：浅色底 + 深玫瑰字。背景交给飘落的樱花（effect:'sakura'），
     所以网格关掉 —— 两者叠在一起会很花。 */
  sakura: {
    label: '樱花',
    grid: 'none',
    cursor: 'heart',
    heart: true,
    star: false,
    effect: 'sakura',
    // 这个主题下的流动点：淡粉、慢一点，和花瓣一个调子
    flow: { color:'#ff9ec4', speed:70, gap:90, size:3, alpha:0.85 },
    canvas: {
      bg:    '#fff6f9',
      white: '#9c5a75',
      yellow:'#ff8fb1',
      red:   '#ff5f8d',
      gray:  '#c1849b',
      dim:   '#f2cfdc',
      grid:  '#fbe6ee'
    }
  },
  /* 水波：淡蓝浅色底。背景交给荡开的水纹（effect:'ripple'），
     网格用点阵 —— 像水面上的小光点。 */
  ripple: {
    label: '水波',
    grid: 'dots',
    cursor: 'cross',
    heart: false,
    star: false,
    effect: 'ripple',
    /* 流动点也调成水色，慢一点、淡一点 */
    flow: { color:'#7fc4e8', speed:44, gap:130, size:2, alpha:0.5 },
    canvas: {
      bg:    '#eaf6fd',      // 很淡的天蓝
      white: '#2f566e',      // 正文：深蓝灰
      yellow:'#1f8fd0',      // 主色：选中 / 强调
      red:   '#e2574c',
      gray:  '#7ba6bf',
      dim:   '#c8e2f1',
      grid:  '#d8ebf7'
    }
  },
  undertale: {
    label: 'Undertale',
    grid: 'lines',
    cursor: 'heart',
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
/* 光标外观：heart（红心）/ cross（十字准心） */
const themeCursor = () => currentTheme().cursor || 'heart';
/* 背景特效：目前只有 'sakura' */
const themeEffect = () => currentTheme().effect || '';

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
  if (typeof refreshCursorDom === 'function') refreshCursorDom();   // 换主题立刻换光标
  if (typeof syncSakura === 'function') syncSakura();                // 樱花特效跟着开/关
  if (typeof mark === 'function') mark();
  return themeId;
}
function loadTheme(){
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
  loadGridPref();
  return applyTheme(THEMES[saved] ? saved : DEFAULT_THEME);
}

/* =========================================================================
   用户主题：从文件加载进来的
   存 localStorage（跨文档记住），打开文档时也能从文档里带进来。
   格式（宽松）：{ label, grid, cursor, heart, star, canvas:{bg,white,yellow,red,gray,dim,grid} }
   ========================================================================= */
const THEMES_KEY = 'grapheon.themes.v1';
let USER_THEMES = {};

function normalizeThemeObject(o, fallbackLabel){
  if (!o || typeof o !== 'object') return null;
  const pal = o.canvas || o.colors || o.palette || null;
  if (!pal || typeof pal !== 'object') return null;
  const canvas = {};
  let any = false;
  for (const k in THEME_VARS){
    const v = pal[k];
    if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.trim())){ canvas[k] = v.trim(); any = true; }
  }
  if (!any) return null;
  const out = { label: String(o.label || o.name || fallbackLabel || '自定义主题').slice(0, 24), canvas };
  if (['lines', 'checker', 'dots', 'none'].indexOf(o.grid) >= 0) out.grid = o.grid;
  if (['heart', 'cross'].indexOf(o.cursor) >= 0) out.cursor = o.cursor;
  if (typeof o.heart === 'boolean') out.heart = o.heart;
  if (typeof o.star === 'boolean') out.star = o.star;
  return out;
}
/* 内置主题的 id，用户主题不许占用 */
const BUILTIN_THEME_IDS = new Set(['board', 'undertale', 'sakura', 'ripple']);
function makeUserThemeId(){
  let id;
  do { id = 'u_' + Math.random().toString(36).slice(2, 8); } while (THEMES[id]);
  return id;
}
/* 注册一个用户主题（返回它的 id）；已经注册过的同 id 会覆盖 */
function registerUserTheme(obj, keepId){
  const n = normalizeThemeObject(obj);
  if (!n) return null;
  // 给了 keepId 又没被内置主题占用，就用它 —— 否则「文档里带的主题」每次打开
  // 都会换一个新 id，引用它的地方全对不上。
  const id = (keepId && !BUILTIN_THEME_IDS.has(keepId)) ? keepId : makeUserThemeId();
  n.user = true;
  THEMES[id] = n;
  USER_THEMES[id] = n;
  saveUserThemes();
  return id;
}
function unregisterUserTheme(id){
  if (!THEMES[id] || !THEMES[id].user) return false;
  delete THEMES[id];
  delete USER_THEMES[id];
  if (themeId === id) applyTheme(DEFAULT_THEME);
  saveUserThemes();
  return true;
}
function saveUserThemes(){
  try { localStorage.setItem(THEMES_KEY, JSON.stringify(USER_THEMES)); } catch(e){}
}
function loadUserThemes(){
  let raw = null;
  try { raw = localStorage.getItem(THEMES_KEY); } catch(e){}
  if (!raw) return 0;
  let obj = null;
  try { obj = JSON.parse(raw); } catch(e){}
  if (!obj || typeof obj !== 'object') return 0;
  let n = 0;
  for (const id in obj){
    const def = normalizeThemeObject(obj[id], obj[id] && obj[id].label);
    if (!def) continue;
    def.user = true;
    THEMES[id] = def; USER_THEMES[id] = def; n++;
  }
  return n;
}
/* 打开文档时把文档自带的主题并进来 */
function adoptDocThemes(list){
  let n = 0;
  for (const t of (Array.isArray(list) ? list : [])){
    const id = registerUserTheme(t, t && t.id);
    if (id) n++;
  }
  return n;
}
const userThemes = () => USER_THEMES;
