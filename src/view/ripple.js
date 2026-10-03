'use strict';
/* ==========================================================================
   GRAPHEON · view/ripple.js
   水波纹：点击 / 新建节点 / 拖动节点时荡开的圈。

   和樱花不一样，波纹画在**世界坐标**里 —— 平移画布时它跟着内容走，
   像印在水面上，而不是贴在屏幕上。

   自己跑一个 rAF 推进动画（樱花也是这么干的）：只要还有活着的圈，
   就一直 mark() 让画布重画，全散完了就停。
   ========================================================================== */

const RIPPLE_MAX   = 80;                                  // 同时最多几个
/* 浅蓝底上，太淡的圈根本看不见 —— 用饱和一点的湖蓝 / 青，透明度也抬上去 */
const RIPPLE_TINTS = ['#3fa9dc', '#2b8fc4', '#5fc0e8', '#1f7fb4', '#7fd2ee'];
let ripples = [];
let rippleRaf = 0, rippleLast = 0;

/* 系统说「减少动态效果」就别荡 —— 和樱花一致 */
const rippleMotionOK = () => !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const rippleWanted = () => (typeof themeEffect === 'function') && themeEffect() === 'ripple' && rippleMotionOK();

/* 加一个圈。
   kind：'tap'  点一下 —— 小、快
         'new'  新建节点 —— 大一点，从节点中心荡开
         'drag' 拖节点 —— 跟着走的一串小圈  */
function pushRipple(x, y, kind){
  /* 不是水波主题就别攒了（换主题时清空，见下） */
  if (!rippleWanted()) return null;
  if (ripples.length >= RIPPLE_MAX) ripples.shift();
  const k = kind || 'tap';
  const e = {
    x, y, t: 0,
    r0:   k === 'new' ? 8 : (k === 'drag' ? 2 : 4),
    r1:   k === 'new' ? 110 : (k === 'drag' ? 46 : 62),
    life: k === 'new' ? 1.15 : (k === 'drag' ? 0.5 : 0.72),
    lw:   k === 'new' ? 3 : 2,
    tint: RIPPLE_TINTS[(Math.random() * RIPPLE_TINTS.length) | 0],
    /* 新节点那个多荡一圈，看着更「咚」 */
    echo: k === 'new' ? 0.34 : 0,
  };
  ripples.push(e);
  kickRippleLoop();
  return e;
}
function clearRipples(){ ripples = []; }

function kickRippleLoop(){
  if (rippleRaf) return;
  rippleLast = 0;
  const step = (ts) => {
    rippleRaf = 0;
    if (!ripples.length) return;
    if (typeof mark === 'function') mark();          // 让画布重画一帧
    rippleRaf = requestAnimationFrame(step);
  };
  rippleRaf = requestAnimationFrame(step);
}

/* 在世界坐标里画（draw() 已经做过 translate/scale 了） */
function drawRipples(g){
  if (!ripples.length) return;
  if (!rippleWanted()){ clearRipples(); return; }

  const now = performance.now();
  const dt = rippleLast ? Math.min(0.05, (now - rippleLast) / 1000) : 0.016;
  rippleLast = now;

  const alive = [];
  for (const e of ripples){
    e.t += dt;
    const k = e.t / e.life;
    if (k >= 1 + e.echo) continue;                   // 连回声都散完了
    alive.push(e);

    /* 主圈：半径按 ease-out 扩张，透明度随之衰减 */
    const kk = Math.min(1, k / (1 - e.echo || 1));
    const ease = 1 - Math.pow(1 - kk, 2.4);
    const r = e.r0 + (e.r1 - e.r0) * ease;
    const a = (1 - kk) * 0.85;
    if (a > 0.01){
      g.save();
      g.globalAlpha = a;
      g.strokeStyle = e.tint;
      g.lineWidth = e.lw * (1 - kk * 0.5);
      g.beginPath();
      g.arc(e.x, e.y, r, 0, Math.PI * 2);
      g.stroke();
      /* 内圈一圈更淡的，像水面的第二道涟漪 */
      g.globalAlpha = a * 0.55;
      g.lineWidth = Math.max(1, e.lw * 0.6);
      g.beginPath();
      g.arc(e.x, e.y, r * 0.62, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    /* 回声：晚一点、更淡的一圈 */
    if (e.echo){
      const ke = (k - e.echo) / (1 - e.echo + e.echo);
      if (ke > 0 && ke < 1){
        const re = e.r0 + (e.r1 * 1.35 - e.r0) * (1 - Math.pow(1 - ke, 2.4));
        const ae = (1 - ke) * 0.42;
        if (ae > 0.01){
          g.save();
          g.globalAlpha = ae;
          g.strokeStyle = e.tint;
          g.lineWidth = 2;
          g.beginPath();
          g.arc(e.x, e.y, re, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      }
    }
  }
  ripples = alive;
  /* 画完若还有活着的，下一帧继续（rAF 那个循环负责 mark） */
}

/* 拖节点时别每一帧都加 —— 隔一段距离加一个，串成一串 */
let lastDragRipple = null;
function dragRipple(x, y){
  if (!rippleWanted()) return;
  if (lastDragRipple){
    const dx = x - lastDragRipple.x, dy = y - lastDragRipple.y;
    if (dx * dx + dy * dy < 34 * 34) return;
  }
  lastDragRipple = { x, y };
  pushRipple(x, y, 'drag');
}
function resetDragRipple(){ lastDragRipple = null; }
