'use strict';
/* ==========================================================================
   GRAPHEON · app/demo.js
   首次打开时的示例文档。示例里刻意混了几种连线类型，一眼就能看出新机制。
   ========================================================================== */

/* =========================================================================
   示例文档
   ========================================================================= */
function demoDoc(){
  const N = (text, shape) => ({ id:uid('n'), text, x:0, y:0, w:0, h:0, shape:shape || 'rect', collapsed:false, lines:[''] });
  const root = N('GRAPHEON');
  const a = N('节点');
  const b = N('连线');
  const c = N('操作');
  const a1 = N('矩形 / 圆角 / 菱形 / 椭圆');
  const a2 = N('Tab 加子节点');
  const b1 = N('单向箭头');
  const b2 = N('双向箭头');
  const b3 = N('虚线');
  const c1 = N('点选连线改样式');
  const c2 = N('拖端点改接');
  const c3 = N('空格折叠子树');
  const nodes = [root, a, b, c, a1, a2, b1, b2, b3, c1, c2, c3];
  // E(起点, 终点, 标签, 样式)
  const E = (s, t, label, style) => normalizeEdge(
    Object.assign({ id:uid('e'), s:s.id, t:t.id, label:label || '' }, style || {}));
  return { v:2, nid, nodes, edges:[
    E(root, a), E(root, b), E(root, c),
    E(a, a1), E(a, a2),
    E(b, b1), E(b, b2, '', { arrow:'both' }), E(b, b3, '', { dash:true }),
    E(c, c1, '', { route:'curve' }), E(c, c2, '', { route:'curve', dash:true }), E(c, c3)
  ]};
}
