'use strict';
/* ==========================================================================
   GRAPHEON · view/render-components.js
   把「组件」画出来。和核心绘制分开放，免得 render.js 再长下去。

   目前实现三个扩展组件的画面部分：
     badge    角标      —— 左下角一个小标签
     outline  自定义描边 —— 外框外面再套一圈
     width    线宽      —— 连线粗细

   「条件隐藏」不在这里：它在 computeHidden 阶段就把东西藏了，压根走不到绘制。
   ========================================================================== */

/* 角标文字（解析过变量）。空就不画。 */
function badgeTextOf(entity, scope){
  return compText(entity, 'badge', 'text', scope).trim();
}
function badgeColorOf(entity, scope){
  const c = compText(entity, 'badge', 'color', scope).trim();
  return c || C.yellow;
}
/* 在 (x, y) 画一个左下角对齐的角标，返回它的宽度 */
function drawBadgeAt(g, box, text, color){
  if (!text) return 0;
  setFont(g, FS, 'normal', FONT);
  const pad = 5;
  const w = Math.min(260, g.measureText(text).width + pad * 2);
  const h = FS + pad;
  const x = box.x, y = box.y - h;          // 贴在 box 下沿之下
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(x, y, w, h);
  g.strokeStyle = color; g.lineWidth = 2;
  g.strokeRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  g.fillStyle = color;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(fitText(g, text, w - pad * 2), x + pad, y + h / 2 + 1);
  g.restore();
  return w;
}
/* 节点 / 分组上的组件（角标 + 描边） */
function drawEntityComponents(g, entity, box, scope){
  const text = badgeTextOf(entity, scope);
  if (text) drawBadgeAt(g, { x:box.x, y:box.y + box.h + 3 }, text, badgeColorOf(entity, scope));
  if (scope === 'edge') return;
  const hasOutline = compOn(entity, 'outline');
  if (hasOutline){
    const w = compNumber(entity, 'outline', 'width', scope, 3);
    if (w > 0){
      const col = compText(entity, 'outline', 'color', scope).trim() || C.gray;
      const grow = 3 + w / 2;
      g.save();
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.rect(Math.round(box.x - grow), Math.round(box.y - grow),
             Math.round(box.w + grow * 2), Math.round(box.h + grow * 2));
      g.stroke();
      g.restore();
    }
  }
}
/* 连线的线宽。0 / 没挂组件就返回 0，交给绘制方用默认值。 */
function edgeWidthOf(e){
  if (!compOn(e, 'width')) return 0;
  return compNumber(e, 'width', 'value', 'edge', 0);
}
