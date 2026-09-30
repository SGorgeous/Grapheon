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
const setFsRangeEl = document.getElementById('setFsRange');
const setFsReadEl  = document.getElementById('setFsRead');
const setFontLoadEl = document.getElementById('setFontLoad');
const setFontForgetEl = document.getElementById('setFontForget');
const setFontNoteEl = document.getElementById('setFontNote');
const fontFileEl   = document.getElementById('fontfile');
const themeFileEl  = document.getElementById('themefile');
const setThemeNoteEl = document.getElementById('setThemeNote');
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
/* 新建连线时问这个 —— 让设置里那一项真的生效 */
const newEdgeDefaults = () => ({ arrow:defaults.edge.arrow, dash:!!defaults.edge.dash, route:defaults.edge.route });
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
  if (typeof closeLib === 'function') closeLib();      // 素材库面板别和设置叠在一起
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
  // 动画效果：连线流动点
  buildOpts(setAnimEl, [[true, '连线流动点'], [false, '关掉（省电）']], animFlowOn(), (v) => {
    setAnimFlow(v === true || v === 'true');
    renderSettings();
  });
  // 背景特效开关（目前只有樱花）
  const hasFx = themeEffect() === 'sakura';
  setFxEl.parentElement.style.display = hasFx ? 'flex' : 'none';
  if (hasFx){
    buildOpts(setFxEl, [[true, '飘落的樱花'], [false, '关掉（省电）']], sakuraEnabled(), (v) => {
      setSakuraEnabled(v === true || v === 'true');
      renderSettings();
    });
  }
  // 默认字体 / 字号
  buildOpts(setFontEl, fontChoices(), defaults.font, (k) => {
    defaults.font = k; saveDefaults(); renderSettings();
  });
  // 字号：拉滑条，0 表示「自动」。拖动时实时看得到数字
  setFsRangeEl.value = defaults.fsPx;
  setFsReadEl.textContent = NODE_FS_LABEL(defaults.fsPx);
  setFsRangeEl.oninput = () => { setFsReadEl.textContent = NODE_FS_LABEL(+setFsRangeEl.value); };
  setFsRangeEl.onchange = () => { defaults.fsPx = +setFsRangeEl.value; saveDefaults(); renderSettings(); };
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

/* ---------------- 从文件加载字体 ----------------
   用 FontFace API 把用户选的字体喂给浏览器，然后就能按家族名用在节点上了。
   只活在这一次会话里 —— 关掉页面就没了（要持久化得配「用户文件夹」，见 README）。 */
const USER_FONTS = [];                      // [{ family, label, source }]
function fontChoices(){
  return Object.keys(NODE_FONTS).map(k => [k, NODE_FONT_LABEL[k]])
    .concat(USER_FONTS.map(f => [f.family, f.label]));
}
/* 家族名：文件名 + 序号，避免重名打架 */
function userFamilyOf(file, i){
  const base = String(file.name || 'font').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '') || 'User';
  return 'GP-' + base + '-' + i;
}
function loadFontFiles(files){
  const list = [...(files || [])];
  if (!list.length) return Promise.resolve(0);
  let done = 0;
  const jobs = list.map((f, i) => new Promise((res) => {
    const family = userFamilyOf(f, USER_FONTS.length + i);
    const url = URL.createObjectURL(f);
    const face = new FontFace(family, 'url(' + url + ')');
    face.load().then(async () => {
      document.fonts.add(face);
      const label = String(f.name || family).replace(/\.[^.]+$/, '');
      // 塞进全局字体表，节点样式面板就能直接选它
      NODE_FONTS[family] = family;
      NODE_FONT_LABEL[family] = label;
      USER_FONTS.push({ family, label, source:f.name });
      // 顺手存进素材库 —— 这就是「自定义字体持久化」：下次开页面再从库里捞回来
      try { await Store.put('fonts', f.name, f); } catch(e){}
      done++;
      res();
    }).catch((e) => { URL.revokeObjectURL(url); res(); });
  }));
  return Promise.all(jobs).then(() => done);
}
/* 开页面时把素材库里的字体重新喂给浏览器。
   失败 / 慢都不该挡住启动，所以是异步的、错了也不吭声。 */
async function restoreUserFonts(){
  let items = [];
  try {
    const b = await Store.init();
    items = (await b.list()).filter(x => x.kind === 'fonts');
  } catch(e){ return 0; }
  let n = 0;
  for (const it of items){
    try {
      const blob = await Store.get(it.id);
      if (!blob) continue;
      const family = 'GPLib-' + String(it.name).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '');
      if (NODE_FONTS[family]) continue;                    // 已经在表里了
      const url = URL.createObjectURL(blob);
      const face = new FontFace(family, 'url(' + url + ')');
      await face.load();
      document.fonts.add(face);
      NODE_FONTS[family] = family;
      NODE_FONT_LABEL[family] = String(it.name).replace(/\.[^.]+$/, '');
      n++;
    } catch(e){ /* 坏字体跳过就行 */ }
  }
  return n;
}
setFontLoadEl.onclick = () => { fontFileEl.value = ''; fontFileEl.click(); };
fontFileEl.addEventListener('change', async () => {
  const n = await loadFontFiles(fontFileEl.files);
  renderSettings();
  setFontNoteEl.textContent = n
    ? ('已加载 ' + n + ' 个字体：' + USER_FONTS.map(f => f.label).join('、'))
    : '这个文件读不出字体（浏览器支持 .ttf / .otf / .woff / .woff2）';
  if (n) say((themeStar() ? '* ' : '') + '加载了 ' + n + ' 个字体，可以在上面的字体列表里选。');
});
setFontForgetEl.onclick = () => {
  for (const f of USER_FONTS){ delete NODE_FONTS[f.family]; delete NODE_FONT_LABEL[f.family]; }
  USER_FONTS.length = 0;
  if (NODE_FONTS[defaults.font] == null) defaults.font = 'auto';   // 选中的自定义字体没了就退回默认
  saveDefaults();
  renderSettings();
  setFontNoteEl.textContent = '已清空（页面重新加载后本来也会清空）';
};

/* ---------------- 素材库（用户文件夹） ---------------- */
const setFxEl = document.getElementById('setFx');
const setAnimEl = document.getElementById('setAnim');
const setUserDirEl = document.getElementById('setUserDir');
const setUserNoteEl = document.getElementById('setUserNote');
setUserDirEl.value = Store.dirName;
setUserDirEl.onchange = () => {
  Store.setDirName(setUserDirEl.value);
  setUserDirEl.value = Store.dirName;
  renderUserNote();
};
document.getElementById('setUserOpen').onclick = () => { closeSettings(); openLib(); };
document.getElementById('setUserConnect').onclick = async () => {
  try {
    await Store.connectFolder();
    await renderUserNote();
    say('* 接上了磁盘文件夹（' + Store.dirName + '/）。');
  } catch(e){
    say('* ' + (e && e.name === 'AbortError' ? '取消了。' : '连不上：' + e.message));
  }
};
async function renderUserNote(){
  const b = await Store.init();
  setUserNoteEl.textContent = '当前存放位置：' + b.label +
    '　·　文件夹名 ' + Store.dirName + '/' +
    (b.id === 'fs' ? '' : '　·　（没连磁盘时存在浏览器里，手机上也能用）') +
    (hasFsAccess() ? '' : '　·　这个浏览器不支持直接读写文件夹');
}
renderUserNote();

/* ---------------- 从文件加载主题 ---------------- */
document.getElementById('setThemeLoad').onclick = () => { themeFileEl.value = ''; themeFileEl.click(); };
document.getElementById('setThemeDel').onclick = () => {
  const cur = currentTheme();
  if (!cur || !cur.user){ setThemeNoteEl.textContent = '当前这个是内置主题，删不了。'; return; }
  unregisterUserTheme(themeId);
  renderSettings();
  setThemeNoteEl.textContent = '删掉了，已切回默认主题。';
};
themeFileEl.addEventListener('change', async () => {
  const f = themeFileEl.files && themeFileEl.files[0];
  if (!f) return;
  let obj = null;
  try { obj = JSON.parse(await f.text()); } catch(e){ obj = null; }
  // 也接受 { id, theme:{...} } 这种包了一层的写法
  if (obj && obj.theme) obj = Object.assign({ id:obj.id }, obj.theme);
  const id = registerUserTheme(obj);
  if (!id){
    setThemeNoteEl.textContent = '这个文件读不出主题（至少要有一个 canvas 调色板）。';
    return;
  }
  applyTheme(id);
  renderSettings();
  setThemeNoteEl.textContent = '已套用「' + THEMES[id].label + '」。';
  say((themeStar() ? '* ' : '') + '主题「' + THEMES[id].label + '」已套用，也记进库里了。');
});

document.getElementById('setClose').onclick = () => closeSettings();
document.getElementById('setKeysReset').onclick = () => {
  GP.keys.reset();
  renderSettings();
  say('* 快捷键已恢复默认。');
};
