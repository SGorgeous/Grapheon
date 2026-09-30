'use strict';
/* ==========================================================================
   GRAPHEON · view/render-components.js
   把「组件」画出来。和核心绘制分开放，免得 render.js 再长下去。

   这里只认**效果部件**（effectPartsOf 摊平出来的东西），不关心它来自内置组件
   还是用户自己拼的组件 —— 所以用户新建一个组件，绘制这边一行都不用改。

   处理的效果：
     badge    角标      —— 左下角一个小标签
     outline  自定义描边 —— 外框外面再套一圈
     tint     染色      —— 换掉外框颜色
     opacity  透明度    —— 0 ~ 100

   「条件隐藏」不在这里：它在 computeHidden 阶段就把东西藏了，压根走不到绘制。
   「线宽」在 render.js 的 drawEdge 里用 edgeWidthOf() 取。
   ========================================================================== */

/* 角标可能来自内置组件，也可能来自用户组件的某个部件 —— 挨个找 */
function badgePartOf(entity, scope){
  return effectPartsOf(entity, scope).find(p => p.effect === 'badge') || null;
}
function badgeTextOf(entity, scope){
  const p = badgePartOf(entity, scope);
  return p ? partValue(entity, p, 'text', scope).trim() : '';
}
function badgeColorOf(entity, scope){
  const p = badgePartOf(entity, scope);
  const c = p ? partValue(entity, p, 'color', scope).trim() : '';
  return c || C.yellow;
}
/* 染色：把外框颜色换掉（挂了多个的话最后一个说了算） */
function compTintOf(entity, scope){
  const ps = effectPartsOf(entity, scope).filter(p => p.effect === 'tint');
  if (!ps.length) return '';
  return partValue(entity, ps[ps.length - 1], 'color', scope).trim();
}
/* 透明度：0 ~ 100，没挂返回 1（不透明） */
function compOpacityOf(entity, scope){
  const ps = effectPartsOf(entity, scope).filter(p => p.effect === 'opacity');
  if (!ps.length) return 1;
  const v = partNumber(entity, ps[ps.length - 1], 'value', scope, 100);
  return Math.max(0, Math.min(1, v / 100));
}

/* 在 box 下沿贴一个角标 */
function drawBadgeAt(g, box, text, color){
  if (!text) return 0;
  setFont(g, FS, 'normal', FONT);
  const pad = 5;
  const w = Math.min(260, g.measureText(text).width + pad * 2);
  const h = FS + pad;
  const x = box.x, y = box.y;
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
/* 节点 / 分组上的组件（角标 + 描边）。box 是实体本身的外框。 */
function drawEntityComponents(g, entity, box, scope){
  for (const part of effectPartsOf(entity, scope)){
    if (part.effect === 'badge'){
      const text = partValue(entity, part, 'text', scope).trim();
      if (text) drawBadgeAt(g, { x:box.x, y:box.y + box.h + 3 }, text,
        partValue(entity, part, 'color', scope).trim() || C.yellow);
    } else if (part.effect === 'outline'){
      const w = partNumber(entity, part, 'width', scope, 3);
      if (w <= 0) continue;
      const col = partValue(entity, part, 'color', scope).trim() || C.gray;
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
/* 连线的线宽。0 / 没挂就返回 0，交给绘制方用默认值。 */
function edgeWidthOf(e){
  const ps = effectPartsOf(e, 'edge').filter(p => p.effect === 'width');
  if (!ps.length) return 0;
  return partNumber(e, ps[ps.length - 1], 'value', 'edge', 0);
}
