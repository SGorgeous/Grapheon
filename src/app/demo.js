'use strict';
/* ==========================================================================
   GRAPHEON · app/demo.js
   首次打开时的示例文档。
   ========================================================================== */

/* =========================================================================
   示例文档
   ========================================================================= */
function demoDoc(){
  const N = (text, shape) => ({ id:uid('n'), text, x:0, y:0, w:0, h:0, shape:shape || 'rect', collapsed:false, lines:[''] });
  const root = N('GRAPHEON');
  const a = N('流程图');
  const b = N('思维导图');
  const c = N('快捷键');
  const a1 = N('节点：矩形 / 菱形');
  const a2 = N('连线：正交自动布线');
  const b1 = N('两侧自动平衡');
  const b2 = N('Tab 生长分支');
  const c1 = N('Tab 子节点');
  const c2 = N('Enter 兄弟节点');
  const c3 = N('Space 折叠');
  const nodes = [root, a, b, c, a1, a2, b1, b2, c1, c2, c3];
  const E = (s, t, label) => ({ id:uid('e'), s:s.id, t:t.id, label:label || '' });
  return { v:1, nid, mode:'mind', autoLayout:true, nodes, edges:[
    E(root, a), E(root, b), E(root, c),
    E(a, a1), E(a, a2), E(b, b1), E(b, b2), E(c, c1), E(c, c2), E(c, c3)
  ]};
}

