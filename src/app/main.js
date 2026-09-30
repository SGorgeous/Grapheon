'use strict';
/* ==========================================================================
   GRAPHEON · app/main.js
   启动引导与主循环。
   ========================================================================== */

/* =========================================================================
   启动
   ========================================================================= */
function boot(){
  loadUserComponents(); // 自定义组件要先注册，文档里的实例才认得出来
  loadUserThemes();     // 用户主题也要先并进注册表
  loadTheme();          // 再定调色板，避免首帧闪一下
  loadBindings();       // 自定义快捷键
  loadOverlapPref();    // 防止节点重叠，默认开
  loadSakuraPref();     // 樱花特效开关（跟随主题 / 用户关掉）
  loadDefaults();      // 新节点的默认外观 / 新连线样式
  loadExportPrefs();    // 上次用过的文件名 / 标题 / 导出范围
  resize();
  let loaded = false;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw){
      const j = JSON.parse(raw);
      if (j && j.nodes && j.nodes.length) { deserialize(j); loaded = true; }
    }
  } catch(e){}
  if (!loaded){
    loadDemo('all');    // 新示例：功能总览 + 活的变量演示
  }
  reindex(); sizeAll();
  initHist();
  // 素材库里的自定义字体异步捞回来，失败也不挡启动
  if (typeof restoreUserFonts === 'function') restoreUserFonts().catch(() => {});
  fitView();
  document.body.classList.add('dsh-ready');
  say('* 欢迎来到 GRAPHEON。选中节点后按方向键或 WASD 生成节点；点选连线后按 E 改连线样式。');
  updateMeta();
  setInterval(updateMeta, 500);
  requestAnimationFrame(loop);
}
function loop(){
  if (dirty){ dirty = false; draw(); }
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => {
  resize();
  if (typeof sakuraResize === 'function') sakuraResize();   // 窗口变了重新铺花瓣
});
window.addEventListener('beforeunload', () => {
  if (insideEmbed()) return;      // 同上：别让内层覆盖外层存档
  try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch(e){}
});

boot();
