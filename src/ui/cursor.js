'use strict';
/* ==========================================================================
   GRAPHEON · ui/cursor.js
   自定义光标：跟着鼠标走，输入时让位给系统文本光标。

   两套外观，由主题决定（见 core/theme.js 的 cursor 字段）：
     heart  决心红心（Undertale）
     cross  小十字准心（棋盘主题）

   十字准心在**按住鼠标任意键**时，中心会画一个实心圆点 —— 靠 body.pressed 这个
   class 控制：按下去加，松开去掉。

   ⚠ 别把两个元素都藏了：body.dsh-ready 把系统光标设成了 cursor:none，
     自定义光标是**唯一**的光标。棋盘主题一度把红心整个藏掉，结果光标直接没了 ——
     那正是这个文件要防的事。
   ========================================================================== */

const heartEl = document.getElementById('heart');
const crossEl = document.getElementById('cross');

let lastCursorX = 0, lastCursorY = 0;
let cursorOn = false;

/* 当前该显示哪一个。主题没写就按红心。 */
function cursorKind(){ return themeCursor(); }
function activeCursorEl(){ return cursorKind() === 'cross' ? crossEl : heartEl; }

function hideAllCursors(){
  if (heartEl) heartEl.style.display = 'none';
  if (crossEl) crossEl.style.display = 'none';
}
function placeCursor(x, y){
  const kind = cursorKind();
  const el = activeCursorEl();
  hideAllCursors();                 // 先全关，只开当前这个
  if (!el) return;
  // 红心 18×15、十字 17×17，各按自己的尺寸对中
  const dx = kind === 'cross' ? -8 : -9;
  const dy = kind === 'cross' ? -8 : -7;
  el.style.transform = 'translate(' + (x + dx) + 'px,' + (y + dy) + 'px)';
  el.style.display = 'block';
}

window.addEventListener('mousemove', (ev) => {
  lastCursorX = ev.clientX; lastCursorY = ev.clientY;
  // 光标悬在正在输入的地方（节点编辑器 / 面板里的输入框）时让位给系统文本光标
  let typingHere = false;
  try {
    const t = document.elementFromPoint(ev.clientX, ev.clientY);
    typingHere = !!t && (t === editor || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  } catch (e) {}
  if (typingHere){ cursorOn = false; hideAllCursors(); return; }
  cursorOn = true;
  placeCursor(ev.clientX, ev.clientY);
});
document.addEventListener('mouseleave', () => { cursorOn = false; hideAllCursors(); });

/* 按住任意键：十字准心中间出现一个实心圆点 */
window.addEventListener('pointerdown', () => { document.body.classList.add('pressed'); }, true);
window.addEventListener('pointerup', () => { document.body.classList.remove('pressed'); }, true);
window.addEventListener('pointercancel', () => { document.body.classList.remove('pressed'); }, true);
window.addEventListener('blur', () => { document.body.classList.remove('pressed'); });

/* 换主题时立刻换成新光标（不用等鼠标动） */
function refreshCursorDom(){
  if (cursorOn) placeCursor(lastCursorX, lastCursorY);
  else hideAllCursors();
}
