'use strict';
/* ==========================================================================
   GRAPHEON · ui/settings.js
   设置面板：主题 / 背景 / 默认节点外观 / 新连线样式 / 快捷键。
   所有改动立刻生效并存进 localStorage，没有「确定 / 取消」。
   ========================================================================== */

const setEl      = document.getElementById('set');
const setThemeEl = document.getElementById('setTheme');
const setGridEl  = document.getElementById('setGrid');
const setFontEl  = document.getElementById('setFont');
const setFsEl    = document.getElementById('setFs');
const setEdgeEl  = document.getElementById('setEdge');
const setKeysEl  = document.getElementById('setKeys');

/* 新文档 / 新节点的默认值。存 localStorage，键 grapheon.defaults.v1 */
const DEFAULT_KEY = 'grapheon.defaults.v1';
const DEFAULTS = { font:'auto', fsPx:0, edge:{ arrow:'end', dash:false, route:'ortho' } };
let defaults = JSON.parse(JSON.stringify(DEFAULTS));

function loadDefaults(){
  try {
    const raw = localStorage.getItem(DEFAULT_KEY);
    if (raw){
      const j = JSON.parse(raw);
      if (j && typeof j === 'object'){
        if (NODE_FONTS[j.font]) defaults.font = j.font;
        if (NODE_FS_CHOICES.indexOf(+j.fsPx) >= 0) defaults.fsPx = +j.fsPx;
        if (j.edge && ARROW_KINDS.indexOf(j.edge.arrow) >= 0) defaults.edge.arrow = j.edge.arrow;
        if (j.edge && ROUTE_KINDS.indexOf(j.edge.route) >= 0) defaults.edge.route = j.edge.route;
        if (j.edge) defaults.edge.dash = !!j.edge.dash;
      }
    }
  } catch(e){}
}
function saveDefaults(){
  try { localStorage.setItem(DEFAULT_KEY, JSON.stringify(defaults)); } catch(e){}
}

/* ---------------- 面板开合 ---------------- */
function openSettings(){
  hideCtx(); closeHelp();
  if (typeof closeNodeBox === 'function') closeNodeBox();
  if (typeof closeEdgeBox === 'function') closeEdgeBox();
  if (typeof closeEndBox === 'function') closeEndBox();
  if (typeof closeExport === 'function') closeExport();
  renderSettings();
  setEl.style.display = 'block';
  syncDlgBox();
  mark();
}
function closeSettings(){ setEl.style.display = 'none'; mark(); }
function toggleSettings(){ setEl.style.display === 'block' ? closeSettings() : openSettings(); }
const settingsOpen = () => setEl.style.display === 'block';

/* ---------------- 渲染 ---------------- */
function renderSettings(){
  // 主题
  buildOpts(setThemeEl, themeIds().map(id => [id, THEMES[id].label]), themeId, (id) => {
    applyTheme(id);
    renderSettings();          // 主题会影响「背景：跟随主题」的显示
    say('* 主题换成「' + THEMES[id].label + '」。');
  });
  // 背景
  buildOpts(setGridEl, GRID_STYLES.map(s => [s, GRID_LABEL[s]]), gridPref, (s) => {
    setGridPref(s);
    renderSettings();
  });
  // 默认字体 / 字号
  buildOpts(setFontEl, Object.keys(NODE_FONTS).map(k => [k, NODE_FONT_LABEL[k]]), defaults.font, (k) => {
    defaults.font = k; saveDefaults(); renderSettings();
  });
  buildOpts(setFsEl, NODE_FS_CHOICES.map(v => [v, NODE_FS_LABEL(v)]), defaults.fsPx, (v) => {
    defaults.fsPx = +v; saveDefaults(); renderSettings();
  });
  // 新连线
  buildOpts(setEdgeEl, ARROW_KINDS.map(a => [a, ARROW_LABEL[a]]), defaults.edge.arrow, (a) => {
    defaults.edge.arrow = a; saveDefaults(); renderSettings();
  });
  // 快捷键
  setKeysEl.innerHTML = '';
  for (const { combo, label } of GP.keys.rows()){
    const d = document.createElement('div');
    d.className = 'keyrow';
    const k = document.createElement('b'); k.textContent = combo;
    const s = document.createElement('span'); s.textContent = label;
    d.appendChild(k); d.appendChild(s);
    setKeysEl.appendChild(d);
  }
}

document.getElementById('setClose').onclick = () => closeSettings();
document.getElementById('setKeysReset').onclick = () => {
  GP.keys.reset();
  renderSettings();
  say('* 快捷键已恢复默认。');
};
