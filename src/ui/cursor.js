'use strict';
/* ==========================================================================
   GRAPHEON · ui/cursor.js
   红心光标跟随（输入时让位给系统文本光标）。
   ========================================================================== */

/* =========================================================================
   鼠标红心
   ========================================================================= */
const heartEl = document.getElementById('heart');
window.addEventListener('mousemove', (ev) => {
  // 光标悬在正在输入的地方（节点编辑器 / 文件名输入框）时让位给系统文本光标
  let typingHere = false;
  try {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    typingHere = !!el && (el === editor || el === expNameEl);
  } catch (e) {}
  heartEl.style.display = typingHere ? 'none' : 'block';
  heartEl.style.transform = 'translate(' + (ev.clientX - 9) + 'px,' + (ev.clientY - 7) + 'px)';
});
document.addEventListener('mouseleave', () => { heartEl.style.display = 'none'; });

