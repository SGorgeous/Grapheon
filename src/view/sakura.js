'use strict';
/* ==========================================================================
   GRAPHEON · view/sakura.js
   樱花主题的背景特效：飘落的樱花。

   花瓣画在**主画布**里，位置在「背景填色 + 网格」之后、「图层」之前 ——
   所以它天然就是背景（节点会盖住它），而且**不会跑进 PNG 导出**
   （导出走的是 buildExportCanvas 自己的画布，根本不调 drawSakura）。

   动画靠一个独立的 requestAnimationFrame 循环：只在主题声明了 effect:'sakura'
   时才转，切走就停 —— 不想让一个背景特效把 CPU 一直占着。

   花瓣活在图层的**屏幕坐标系**里（不跟相机缩放/平移走）——
   樱花飘落是「窗外」的事，不该跟着画布放大缩小。
   ========================================================================== */

const SAKURA_COUNT = 46;
const SAKURA_MOTION_KEY = 'grapheon.sakura.v1';
let sakuraPetals = [];
let sakuraRaf = 0, sakuraLastTs = 0, sakuraRunning = false;
let sakuraPref = null;                 // null = 跟随主题；false = 用户明确关掉

/* 花瓣颜色：马卡龙粉的几档，随机挑一个，看着有层次 */
const SAKURA_TINTS = ['#ffc2d6', '#ffa8c5', '#ff8fb1', '#ffd6e3', '#f7b7cd'];

function loadSakuraPref(){
  try {
    const v = localStorage.getItem(SAKURA_MOTION_KEY);
    if (v === '0') sakuraPref = false;
    if (v === '1') sakuraPref = true;
  } catch(e){}
}
function setSakuraEnabled(on){
  sakuraPref = !!on;
  try { localStorage.setItem(SAKURA_MOTION_KEY, on ? '1' : '0'); } catch(e){}
  syncSakura();
}
const sakuraEnabled = () => sakuraPref !== false;
/* 系统说「减少动态效果」就别转 —— 尊重一下 */
const sakuraMotionOK = () => !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const sakuraWanted = () => themeEffect() === 'sakura' && sakuraEnabled() && sakuraMotionOK();

function rand(a, b){ return a + Math.random() * (b - a); }

function sakuraInit(){
  const W = Math.max(1, VW), H = Math.max(1, VH);
  sakuraPetals = [];
  for (let i = 0; i < SAKURA_COUNT; i++){
    sakuraPetals.push({
      x: rand(-40, W + 40),
      y: rand(-H, H),                         // 一开始就铺满，别让它们从顶上排队下来
      r: rand(4, 11),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-1.6, 1.6),
      vy: rand(14, 42),
      vx: rand(-14, 26),
      sway: rand(0.5, 1.5),
      phase: rand(0, Math.PI * 2),
      squash: rand(0.35, 0.75),
      tint: SAKURA_TINTS[(Math.random() * SAKURA_TINTS.length) | 0],
      alpha: rand(0.45, 0.9)
    });
  }
}

function sakuraStep(dt, t){
  const W = Math.max(1, VW), H = Math.max(1, VH);
  for (const p of sakuraPetals){
    p.y += p.vy * dt;
    p.x += (p.vx + Math.sin(t * p.sway + p.phase) * 26) * dt;   // 左右飘
    p.rot += p.vrot * dt;
    if (p.y - p.r > H){                       // 落到底了就回到顶上重来
      p.y = -p.r - rand(0, 120);
      p.x = rand(-40, W + 40);
      p.tint = SAKURA_TINTS[(Math.random() * SAKURA_TINTS.length) | 0];
    }
    if (p.x < -60) p.x = W + 50;
    if (p.x > W + 60) p.x = -50;
  }
}

/* 一片花瓣：一个上尖下圆的小叶片 */
function sakuraPetalPath(g, p){
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rot);
  g.scale(1, p.squash);
  g.beginPath();
  g.moveTo(0, -p.r);
  g.bezierCurveTo(p.r * 0.95, -p.r * 0.55, p.r * 0.72, p.r * 0.75, 0, p.r);
  g.bezierCurveTo(-p.r * 0.72, p.r * 0.75, -p.r * 0.95, -p.r * 0.55, 0, -p.r);
  g.closePath();
  g.fill();
  g.restore();
}

/* 在屏幕坐标系里画一遍。draw() 会在套相机变换之前调它。 */
function drawSakura(g){
  if (!sakuraRunning && !sakuraPetals.length) return;
  if (!sakuraWanted()) return;
  g.save();
  g.setTransform(DPR, 0, 0, DPR, 0, 0);      // 撇开相机的平移缩放
  for (const p of sakuraPetals){
    g.globalAlpha = p.alpha;
    g.fillStyle = p.tint;
    sakuraPetalPath(g, p);
  }
  g.restore();
}

function sakuraTick(ts){
  if (!sakuraRunning) return;
  const dt = sakuraLastTs ? Math.min(0.05, (ts - sakuraLastTs) / 1000) : 0.016;
  sakuraLastTs = ts;
  sakuraStep(dt, ts / 1000);
  if (typeof draw === 'function') draw();
  sakuraRaf = requestAnimationFrame(sakuraTick);
}
function startSakura(){
  if (sakuraRunning) return;
  if (!sakuraPetals.length) sakuraInit();
  sakuraRunning = true;
  sakuraLastTs = 0;
  sakuraRaf = requestAnimationFrame(sakuraTick);
}
function stopSakura(){
  if (!sakuraRunning) return;
  sakuraRunning = false;
  if (sakuraRaf) cancelAnimationFrame(sakuraRaf);
  sakuraRaf = 0;
  if (typeof draw === 'function') draw();
}
/* 主题切换 / 开关变化时调这个：该转就转，该停就停 */
function syncSakura(){
  if (sakuraWanted()) startSakura(); else stopSakura();
}
/* 窗口尺寸变了要重新铺一遍，不然花瓣会集中在一角 */
function sakuraResize(){ if (sakuraRunning) sakuraInit(); }
