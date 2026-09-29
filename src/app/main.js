'use strict';
/* ==========================================================================
   GRAPHEON · app/main.js
   启动引导与主循环。
   ========================================================================== */

/* =========================================================================
   启动
   ========================================================================= */
function boot(){
  loadTheme();          // 先定调色板，避免首帧闪一下
  loadBindings();       // 自定义快捷键
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
  if (!loaded) deserialize(demoDoc());
  reindex(); sizeAll();
  if (doc.mode === 'mind' && doc.autoLayout) layoutMind();
  syncButtons();
  initHist();
  fitView();
  document.body.classList.add('dsh-ready');
  say('* 欢迎来到 GRAPHEON。选中节点后按方向键或 WASD，就能在该方向长出新的节点。');
  updateMeta();
  setInterval(updateMeta, 500);
  requestAnimationFrame(loop);
}
function loop(){
  if (dirty){ dirty = false; draw(); }
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => { resize(); });
window.addEventListener('beforeunload', () => { try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch(e){} });

boot();
