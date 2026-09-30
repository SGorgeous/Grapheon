'use strict';
/* ==========================================================================
   GRAPHEON · app/demo.js
   示例文档。两份：

     demoDoc()    —— 默认示例，把**所有功能**都摆出来，还带一组活的变量演示
     classicDoc() —— 最早那份最简示例，留着当「你好世界」

   两份都是纯数据（序列化后的形状），loadDemo() 负责摆好分组框。
   ========================================================================== */

/* =========================================================================
   新示例：功能总览
   ========================================================================= */
function demoDoc(){
  const nodes = [], edges = [], groups = [];
  let nid = 0, eid = 0;
  const N = (text, x, y, extra) => {
    const n = Object.assign({ id:'d' + (++nid), text, x, y, shape:'rect' }, extra || {});
    nodes.push(n);
    return n;
  };
  const E = (a, b, extra) => {
    const e = normalizeEdge(Object.assign({ id:'de' + (++eid), s:a.id, t:b.id }, extra || {}));
    edges.push(e);
    return e;
  };
  /* 一列：竖着排一串节点，返回它们 */
  const column = (items, x, y) => items.map((t, i) => N(t, x, y + i * 58));
  /* 一个功能分组：把这一列的成员装进去 */
  const groupOf = (title, color, members) => {
    const g = { id:'dg' + (groups.length + 1), title, members:members.map(m => m.id),
                color, x:0, y:0, w:10, h:10, collapsed:false, isFunction:false };
    groups.push(g);
    return g;
  };

  /* ---------- 根 ---------- */
  const root = N('GRAPHEON\n节点与连线', -1180, -260, { w:0, h:0 });
  root.big = true;

  /* ---------- 六块功能，3 列 × 2 行 ---------- */
  const COLW = 520, ROWH = 460, GAPX = 46, GAPY = 60;
  const bandX = 340, bandY = -660;
  const FEATURES = [
    ['节点与外观', '#ffd800', [
      '四种形状：矩形 / 圆角 / 菱形 / 椭圆',
      '拖右下角自由改尺寸',
      'E 打开样式面板：字体 / 字号 / 字色 / 外框色',
      '折叠子树：点右上角的小方块',
      'Tab 加子节点，Enter 加兄弟节点'
    ]],
    ['连线', '#00ffff', [
      '箭头：无 / 单向 / 双向',
      '线型：实线 / 虚线',
      '走线：正交折线 / 曲线',
      '拐点：拖线身中间就能弯折',
      '端点吸附：默认自动，可以钉死某一边',
      '拖端点改接：把一头摘下来接到别的节点'
    ]],
    ['分组', '#00ff00', [
      '框可以手动拉伸，也会自动长大来容纳成员',
      '把节点拖进框里就自动收纳',
      '分组可以套娃',
      '折叠分组：成员一起藏起来，不留幽灵框',
      '多选：Shift 追加，可以和节点混着选'
    ]],
    ['程序化节点', '#b967ff', [
      '算符：外观 / 形状 / 位置 / 数值',
      '连到分组 = 整组一起变',
      '程序节点之间可以链式累加',
      '优先级可调，决定叠加的先后'
    ]],
    ['变量系统', '#ff7f27', [
      '变量定义节点：名字 + 值 + 作用域',
      '别的节点文本里写 {名字} 就能引用',
      '想打字的 {名字} 本身，前面加反斜杠',
      '三种作用域：全局 / 局内（仅下游）/ 组内',
      '运算节点：+ - * / 可以叠加',
      '程序组：组内算完把结果吐出来',
      '输出节点：声明本作用域的输出值',
      '★ 任何文字都能引用：正文 / 描述 / 连线标签 / 分组标题',
      '★ 勾选节点：随便加选项，输出一串列表',
      '★ 滑条节点：上下限 + 步长，拖一下实时生效',
      '★ 通路节点：关掉后这条连接逻辑上断开'
    ]],
    ['媒体与其它', '#3b7dff', [
      '图片节点：拖进来 / 粘贴 / 右键插入',
      '图片右上角命名，下面写描述',
      '嵌入 Grapheon：整份文档当一个封闭节点',
      '导出 PNG：可选范围、可填标题',
      '撤销重做 / 排版 / 居中 / 换主题 / 自定义快捷键'
    ]]
  ];
  FEATURES.forEach(([title, color, items], i) => {
    const x = bandX + (i % 3) * (COLW + GAPX);
    const y = bandY + Math.floor(i / 3) * (ROWH + GAPY);
    groupOf(title, color, column(items, x, y));
  });
  // 根 → 每个分组的连线。分组不在 nodes 里，所以直接给出分组 id
  for (const g of groups){
    edges.push(normalizeEdge({ id:'de' + (++eid), s:root.id, t:g.id,
                               route:'curve', aSide:'r', bSide:'l' }));
  }

  /* ---------- 活的功能演示 ---------- */
  const demoY = bandY + 2 * (ROWH + GAPY) + 40;
  const title = N('↓ 下面这组是活的：变量 / 运算 / 程序组 / 输出节点', -1180, demoY - 70, { shape:'round' });

  // 变量 单价=12 → 运算 ×4 → 节点「合计 48 元」
  const vPrice = N('单价', -1180, demoY, {
    kind:'var', varDef:{ name:'单价', value:'12', type:'number', scope:'global' } });
  const opMul = N('乘四', -1180, demoY + 130, { kind:'op', opDef:{ op:'*', operand:'4' } });
  const total = N('合计 {单价} 元', -700, demoY + 130, { shape:'round' });
  E(vPrice, opMul); E(opMul, total);

  // 函数分组「折扣函数」：基数 100 → 减 15 → 输出节点 折后
  const fg = { id:'dg' + (groups.length + 1), title:'ƒ 折扣函数', members:[],
               color:'#b967ff', x:200, y:demoY, w:10, h:10, collapsed:false, isFunction:true };
  groups.push(fg);
  const vBase = N('基数', 200, demoY + 60, {
    kind:'var', varDef:{ name:'基数', value:'100', type:'number', scope:'global' } });
  const opSub = N('减十五', 200, demoY + 190, { kind:'op', opDef:{ op:'-', operand:'15' } });
  const outFn = N('折后', 200, demoY + 320, { kind:'out', outDef:{ name:'折后' } });
  E(vBase, opSub); E(opSub, outFn);
  fg.members = [vBase.id, opSub.id, outFn.id];

  // 外层变量指向函数分组，拿到 85
  const vDisc = N('折扣价', 700, demoY + 60, {
    kind:'var', varDef:{ name:'折扣价', value:'0', type:'number', scope:'global' } });
  edges.push(normalizeEdge({ id:'de' + (++eid), s:vDisc.id, t:fg.id }));   // 变量 → 函数分组
  const shown = N('折后 {折扣价} 元', 700, demoY + 190, { shape:'round' });
  E(vDisc, shown);

  // 文档输出节点
  const docOut = N('本图输出', 700, demoY + 320, { kind:'out', outDef:{ name:'summary' } });
  E(total, docOut);

  // 三种特殊变量控件
  const ck = N('配料', -1180, demoY + 400, {
    kind:'var', varDef:{ name:'配料', type:'string', scope:'global', control:'check',
      options:['牛肉', '香菜', '辣椒'], picked:[0, 2] } });
  const ckOut = N('已选：{配料}', -700, demoY + 400, { shape:'round' });
  E(ck, ckOut);

  const sl = N('音量', -1180, demoY + 620, {
    kind:'var', varDef:{ name:'音量', type:'number', scope:'global', control:'slider',
      value:'60', min:0, max:100, step:10 } });
  const slOut = N('当前 {音量}', -700, demoY + 620, { shape:'round' });
  E(sl, slOut);

  // 开关：关着的时候值过不去，右边会变成 [未定义]
  const gate = N('闸门', -1180, demoY + 840, {
    kind:'var', varDef:{ name:'闸门', type:'string', scope:'global', control:'switch', on:false } });
  const gateOut = N('过闸：{单价}', -700, demoY + 840, { shape:'round' });
  const gateSrc = N('过闸源', -1180, demoY + 960, { kind:'var', varDef:{ name:'过闸源', value:'7', type:'number', scope:'global' } });
  E(gateSrc, gate); E(gate, gateOut);
  gateOut.text = '过闸：{过闸源}';

  /* ---------- 一些小提示 ---------- */
  const tips = column([
    '提示：按住 Shift 框选可以一次选中一片',
    '提示：拖空白处平移，滚轮缩放',
    '提示：右上角 ? 是完整操作指南',
    '提示：这份示例可以直接改，不会影响别的'
  ], bandX + 3 * (COLW + GAPX), bandY + 20);   // 挪到功能带右边，别和分组撞上

  return { v:2, nid, nodes, edges, groups };
}

/* 载入示例：把分组框按成员重新贴合一次，否则框的位置是虚的 */
function loadDemo(which){
  if (which === 'classic'){
    deserialize(classicDoc());
    layoutMind();          // 经典示例的节点坐标都是 0，得按树形摆一次
  } else {
    deserialize(demoDoc());   // 新示例自带坐标
    // 示例里有不少长句会折成两行，行距是按单行留的 —— 直接用防覆盖把叠住的推开。
    // 这既省得手算行距，也顺带当了防覆盖的活广告。
    resolveOverlaps([], true);
    refitAllGroups();         // 分组框按成员贴合一次
  }
}

/* =========================================================================
   经典示例：最早那份最简的树，留着当「你好世界」
   ========================================================================= */
function classicDoc(){
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
