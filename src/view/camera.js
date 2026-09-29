'use strict';
/* ==========================================================================
   GRAPHEON · view/camera.js
   世界坐标 ↔ 屏幕坐标、居中适配、以光标为中心缩放。
   ========================================================================== */

/* =========================================================================
   坐标
   ========================================================================= */
const s2w = (sx, sy) => ({ x:(sx - view.x) / view.z, y:(sy - view.y) / view.z });
const w2s = (p) => ({ x:p.x * view.z + view.x, y:p.y * view.z + view.y });
function bboxAll(){
  if (!doc.nodes.length) return { minX:-100, minY:-100, maxX:100, maxY:100, w:200, h:200 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of doc.nodes){
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  }
  return { minX, minY, maxX, maxY, w:Math.max(1, maxX - minX), h:Math.max(1, maxY - minY) };
}
function fitView(){
  const bb = bboxAll();
  const padX = 140, padTop = 130, padBottom = 150;
  const availW = VW - padX * 2;
  const availH = VH - padTop - padBottom;
  const z = Math.max(0.15, Math.min(1.5, Math.min(availW / bb.w, availH / bb.h)));
  view.z = z;
  view.x = VW / 2 - ((bb.minX + bb.maxX) / 2) * z;
  view.y = padTop + availH / 2 - ((bb.minY + bb.maxY) / 2) * z;
  mark();
}
function fitIfNeeded(){
  const bb = bboxAll();
  const a = w2s({ x:bb.minX, y:bb.minY }), b = w2s({ x:bb.maxX, y:bb.maxY });
  if (a.x < 40 || a.y < 40 || b.x > VW - 40 || b.y > VH - 40) fitView();
}
function zoomAt(sx, sy, factor){
  const w = s2w(sx, sy);
  view.z = Math.max(0.12, Math.min(3.5, view.z * factor));
  view.x = sx - w.x * view.z;
  view.y = sy - w.y * view.z;
  mark();
}

