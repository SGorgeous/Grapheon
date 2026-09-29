'use strict';
/* ==========================================================================
   GRAPHEON · ui/help.js
   操作指南浮层。
   ========================================================================== */

/* =========================================================================
   帮助
   ========================================================================= */
const helpEl = document.getElementById('help');
function openHelp(){ helpEl.style.display = 'block'; }
function closeHelp(){ helpEl.style.display = 'none'; }
helpEl.addEventListener('click', (ev) => ev.stopPropagation());
window.addEventListener('pointerdown', (ev) => {
  if (helpEl.style.display === 'block' && !helpEl.contains(ev.target)) closeHelp();
});

