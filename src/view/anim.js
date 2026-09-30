'use strict';
/* ==========================================================================
   GRAPHEON · view/anim.js
   连线流动动画：一串小点从父节点（边的起点）流向子节点（终点）。

   · **速度一致** —— 所有边的小点都按同一个世界速度走，不会这条快那条慢
   · **等间距** —— 点的间隔固定，长边上的点就多，短边就少
   · 可以在「设置 → 动画效果」里整体关掉
   · 主题可以定制颜色 / 速度 / 间隔 / 大小（THEMES[x].flow）

   重绘循环由 sakura.js 那个共用的 rAF 驱动（见那里的 animNeeded()），
   这里只负责「算相位 + 画点」，不自己开循环 —— 两个循环抢 draw() 会闪。
   ========================================================================== */

const ANIM_KEY = 'grapheon.anim.v1';
const FLOW_DEFAULT = { on:true, color:null, speed:90, gap:78, size:3.2, alpha:0.9 };
let animPref = { flow:true };
let animT = 0;                      // 动画时钟（秒），只增不减

function loadAnimPref(){
  try {
    const j = JSON.parse(localStorage.getItem(ANIM_KEY) || '{}');
    if (typeof j.flow === 'boolean') animPref.flow = j.flow;
  } catch(e){}
}
function saveAnimPref(){
  try { localStorage.setItem(ANIM_KEY, JSON.stringify(animPref)); } catch(e){}
}
const animFlowOn = () => !!animPref.flow;
function setAnimFlow(on){
  animPref.flow = !!on;
  saveAnimPref();
  if (typeof syncSakura === 'function') syncSakura();   // 该转就转，该停就停
  if (typeof mark === 'function') mark();
}

/* 主题定制：THEMES[x].flow 覆盖默认值。没写就用默认。 */
function themeFlow(){
  const t = (typeof currentTheme === 'function') ? currentTheme() : null;
  const f = (t && t.flow) || {};
  return Object.assign({}, FLOW_DEFAULT, f);
}
/* 要不要流动：开关开着 + 主题没显式关掉 */
function flowOn(){
  if (!animFlowOn()) return false;
  if (typeof themeFlow === 'function' && themeFlow().on === false) return false;
  return true;
}
/* 系统说「减少动态效果」就安静点 */
function flowMotionOK(){
  return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
const flowWanted = () => flowOn() && flowMotionOK();

/* 推进时钟。所有边共用这一个 T，所以相位天然一致。 */
function flowStep(dt){
  animT += dt;
  if (animT > 1e6) animT -= 1e6;
}

/* 折线按弧长取点 */
function polyLen(pts){
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
  return L;
}
function polyPointAt(pts, s){
  let acc = 0;
  for (let i = 1; i < pts.length; i++){
    const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
    const seg = Math.hypot(dx, dy);
    if (seg <= 0) continue;
    if (acc + seg >= s){
      const k = (s - acc) / seg;
      return { x:pts[i-1].x + dx * k, y:pts[i-1].y + dy * k };
    }
    acc += seg;
  }
  const last = pts[pts.length - 1];
  return { x:last.x, y:last.y };
}

/* 画一条边上的流动点。由 drawEdge() 在画完线之后调，此时相机变换是套着的。 */
function drawEdgeFlow(g, e){
  if (!flowWanted()) return;
  if (e.id === selEdgeId) return;                    // 选中的那条不画，免得看不清
  const geom = (typeof edgeGeomFor === 'function') ? edgeGeomFor(e) : null;
  if (!geom || !geom.pts || geom.pts.length < 2) return;
  const pts = geom.pts;
  const total = polyLen(pts);
  if (total < 26) return;                            // 太短的边跳过，画上去只有一坨
  const f = themeFlow();
  const gap = Math.max(24, +f.gap || FLOW_DEFAULT.gap);
  const speed = Math.max(1, +f.speed || FLOW_DEFAULT.speed);
  const size = Math.max(1, +f.size || FLOW_DEFAULT.size);
  const n = Math.max(1, Math.floor(total / gap));
  const phase = (animT * speed) % gap;
  g.save();
  g.fillStyle = f.color || (typeof C !== 'undefined' && C.yellow) || '#fff';
  g.globalAlpha = (f.alpha == null ? FLOW_DEFAULT.alpha : +f.alpha);
  for (let k = 0; k < n; k++){
    const s = phase + k * gap;
    if (s > total - size * 2) continue;              // 快到头的那几个不画，别糊在箭头上
    const p = polyPointAt(pts, s);
    g.beginPath();
    g.arc(p.x, p.y, size, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
