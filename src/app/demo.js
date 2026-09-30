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
  /* 一整组：竖着排一串节点，返回它们 */
  const column = (items, x, y, step) => items.map((t, i) => N(t, x, y + i * (step || 58)));
  /* 一个功能分组：把这一列的成员装进去 */
  const groupOf = (title, color, members) => {
    const g = { id:'dg' + (groups.length + 1), title, members:members.map(m => m.id),
                color, x:0, y:0, w:10, h:10, collapsed:false, isFunction:false };
    groups.push(g);
    return g;
  };
  /* 一张小标题：用来给下面的活演示分区 */
  const head = (text, x, y, color) => {
    const n = N(text, x, y, { shape:'round', big:false });
    n.headColor = color || null;
    return n;
  };

  /* ==================== 根 ==================== */
  const root = N('GRAPHEON\n节点与连线', -1420, -300, { w:0, h:0 });
  root.big = true;

  /* ==================== 功能总览：3 列 × 2 行 ==================== */
  const COLW = 560, ROWH = 470, GAPX = 50, GAPY = 70;
  const bandX = 320, bandY = -720;
  const FEATURES = [
    ['节点与外观', '#ffd800', [
      '四种形状：矩形 / 圆角 / 菱形 / 椭圆',
      '拖右下角自由改尺寸',
      'E 打开样式面板：字体 / 字号 / 字色 / 外框色',
      '折叠子树：点右上角的小方块',
      'Tab 加子节点，Enter 加兄弟节点',
      '方向键 / WASD 按方向生成',
      '节点名和变量名是分开的两回事'
    ]],
    ['连线', '#00ffff', [
      '箭头：无 / 单向 / 双向',
      '线型：实线 / 虚线',
      '走线：正交折线 / 曲线',
      '拐点：拖线身中间就能弯折',
      '端点吸附：默认自动，可以钉死某一边',
      '拖端点改接：把一头摘下来接到别的节点',
      '「设置 → 新建连线的默认类型」决定新线长什么样'
    ]],
    ['分组', '#00ff00', [
      '框可以手动拉伸，也会自动长大来容纳成员',
      '把节点拖进框里就自动收纳',
      '分组可以套娃',
      '折叠分组：成员一起藏起来，不留幽灵框',
      '双击分组：选中组内全部节点（不含外框）',
      '三击分组：选中外框（改名走右键或 F2）'
    ]],
    ['对齐与排版', '#7fd4ff', [
      '选中多个 → 视图 → 对齐与分布',
      '六种对齐：左 / 水平居中 / 右 / 顶 / 垂直居中 / 底',
      '横向 / 竖向等距分布（至少三个）',
      '基准是整个选择的外接矩形',
      '对齐之后**允许重叠**，不会被防重叠弹开',
      '防止节点重叠：默认开，设置里能关'
    ]],
    ['程序化节点', '#b967ff', [
      '算符：外观 / 形状 / 位置 / 数值',
      '连到分组 = 整组一起变',
      '程序节点之间可以链式累加',
      '数值也能引用变量：{倍数}',
      '优先级可调，决定叠加的先后',
      '改动是「派生的」，从不写回节点本身'
    ]],
    ['媒体与其它', '#3b7dff', [
      '图片节点：拖进来 / 粘贴 / 右键插入',
      '图片右上角命名，下面写描述',
      '表格节点：行列可编辑，格子也能引用变量',
      '嵌入 Grapheon：整份文档当一个封闭节点',
      '导出 PNG：可选范围、可填标题',
      '撤销重做 / 居中 / 换主题 / 自定义快捷键',
      '主题：棋盘（默认）/ 樱花（飘落特效）/ Undertale'
    ]]
  ];
  FEATURES.forEach(([title, color, items], i) => {
    const x = bandX + (i % 3) * (COLW + GAPX);
    const y = bandY + Math.floor(i / 3) * (ROWH + GAPY);
    groupOf(title, color, column(items, x, y));
  });
  // 根 → 每个功能分组
  for (const g of groups){
    edges.push(normalizeEdge({ id:'de' + (++eid), s:root.id, t:g.id,
                               route:'curve', aSide:'r', bSide:'l' }));
  }

  /* ==================== 变量系统：整块往右挪，别和功能带撞 ==================== */
  const LX = -1420;                   // 变量演示区的左边界
  const demoY = bandY + 2 * (ROWH + GAPY) + 60;

  const vHead = head('① 变量 → 运算 → 引用', LX, demoY - 90);
  /* ---- ① 变量 + 运算 + 引用 ---- */
  const vPrice = N('单价', LX, demoY, {
    kind:'var', varDef:{ name:'单价', value:'12', type:'number', scope:'global' } });
  const opMul = N('乘四', LX, demoY + 150, { kind:'op', opDef:{ op:'*', operand:'4' } });
  const total = N('合计 {单价} 元', LX + 520, demoY + 150, { shape:'round' });
  E(vPrice, opMul); E(opMul, total);
  // 文档级输出节点：声明「本图的输出」
  const docOut = N('本图输出', LX + 520, demoY + 10, { kind:'out', outDef:{ name:'summary' } });
  E(total, docOut);

  /* ---- ② 变量的值也能引用变量 ---- */
  const vHead2 = head('② 变量自己的值也能引用变量', LX, demoY + 330);
  const vW = N('宽', LX, demoY + 420, {
    kind:'var', varDef:{ name:'宽', value:'12', type:'number', scope:'global' } });
  const vH = N('高', LX, demoY + 560, {
    kind:'var', varDef:{ name:'高', value:'8', type:'number', scope:'global' } });
  const vArea = N('面积', LX, demoY + 700, {
    kind:'var', varDef:{ name:'面积', value:'{宽} × {高} = 96', type:'string', scope:'global' } });
  const areaOut = N('算出来：{面积}', LX + 520, demoY + 700, { shape:'round' });
  E(vArea, areaOut);
  // 改宽/高，面积跟着变 —— 这里只连出来给人看，值本身是插值算的
  E(vW, vArea); E(vH, vArea);

  /* ==================== 程序组（原函数分组） ==================== */
  const FX = LX + 1100;
  const vHead3 = head('③ 程序组：组内算完，外面接结果', FX, demoY - 90);
  const fg = { id:'dg' + (groups.length + 1), title:'ƒ 折扣函数', members:[],
               color:'#b967ff', x:FX, y:demoY, w:10, h:10, collapsed:false, isFunction:true };
  groups.push(fg);
  const vBase = N('基数', FX, demoY, {
    kind:'var', varDef:{ name:'基数', value:'100', type:'number', scope:'global' } });
  const opSub = N('减十五', FX, demoY + 150, { kind:'op', opDef:{ op:'-', operand:'15' } });
  const outFn = N('折后', FX, demoY + 300, { kind:'out', outDef:{ name:'折后' } });
  E(vBase, opSub); E(opSub, outFn);
  fg.members = [vBase.id, opSub.id, outFn.id];

  // 外面一个变量指向程序组 → 拿到组内算出来的 85
  const vDisc = N('折扣价', FX + 560, demoY + 60, {
    kind:'var', varDef:{ name:'折扣价', value:'0', type:'number', scope:'global' } });
  edges.push(normalizeEdge({ id:'de' + (++eid), s:vDisc.id, t:fg.id }));   // 变量 → 程序组
  const shown = N('折后 {折扣价} 元', FX + 560, demoY + 300, { shape:'round' });
  E(vDisc, shown);

  /* ==================== 三种控件 ==================== */
  const CX = FX + 1100;
  const vHead4 = head('④ 三种控件：勾选 / 滑条 / 通路', CX, demoY - 90);

  const ck = N('配料', CX, demoY, {
    kind:'var', varDef:{ name:'配料', type:'string', scope:'global', control:'check',
      options:['牛肉', '香菜', '辣椒'], picked:[0, 2] } });
  const ckOut = N('已选：{配料}', CX + 520, demoY, { shape:'round' });
  E(ck, ckOut);

  const sl = N('音量', CX, demoY + 260, {
    kind:'var', varDef:{ name:'音量', type:'number', scope:'global', control:'slider',
      value:'60', min:0, max:100, step:10 } });
  const slOut = N('当前 {音量}', CX + 520, demoY + 260, { shape:'round' });
  E(sl, slOut);

  /* 通路节点：关着的时候值过不去，下游变成 [未定义] */
  const gateSrc = N('过闸源', CX, demoY + 520, {
    kind:'var', varDef:{ name:'过闸源', value:'7', type:'number', scope:'global' } });
  const gate = N('闸门', CX, demoY + 680, {
    kind:'var', varDef:{ name:'闸门', type:'string', scope:'global', control:'switch', on:false } });
  const gateOut = N('过闸：{过闸源}', CX + 520, demoY + 680, { shape:'round' });
  E(gateSrc, gate); E(gate, gateOut);

  /* ==================== 表格节点 ==================== */
  const TX = CX + 1100;
  const vHead5 = head('⑤ 表格节点：格子里的字也能引用变量', TX, demoY - 90);
  const tbl = N('', TX, demoY, {
    kind:'table',
    tableDef:{ cols:3, rows:4, header:true, cells:[
      ['项目', '数量', '小计'],
      ['苹果', '{数量}', '{单价} × {数量}'],
      ['香蕉', '3', '待算'],
      ['合计', '', '—']
    ] } });
  const vQty = N('数量', TX + 620, demoY - 40, {
    kind:'var', varDef:{ name:'数量', value:'5', type:'number', scope:'global' } });
  const vUnit = N('单价2', TX + 620, demoY + 110, {
    kind:'var', varDef:{ name:'单价2', value:'3', type:'string', scope:'global' } });
  // 表格用的是外面那个「单价」，这里再放一个说明引用关系的节点
  const tblNote = N('格子里写 {单价} / {数量}，变量一改表格跟着变', TX + 620, demoY + 260, { shape:'round' });

  /* ==================== 组件 ==================== */
  const MX = TX + 1500;
  const vHead6 = head('⑥ 组件：挂上去就生效', MX, demoY - 90);
  const cBadge = N('角标组件', MX, demoY, {
    components:[{ type:'badge', props:{ text:'★ {数量} 件', color:'#ffd800' } }] });
  const cOutline = N('自定义描边', MX, demoY + 150, {
    components:[{ type:'outline', props:{ width:'4', color:'#00ffff' } }] });
  const cTint = N('染色 + 透明度', MX, demoY + 300, {
    components:[{ type:'tint', props:{ color:'#b967ff' } },
                { type:'opacity', props:{ value:'0.5' } }] });
  const cHide = N('条件隐藏：{数量} 一有值就把我藏起来（现在就是藏着的）', MX, demoY + 450, {
    components:[{ type:'hideIf', props:{ when:'{数量}' } }] });

  /* ==================== 小提示 ==================== */
  const tips = column([
    '提示：新建的内容在空白处右键 → 新建',
    '提示：拖空白处平移，滚轮缩放',
    '提示：右上角 ? 是完整操作指南',
    '提示：这份示例可以直接改，不会影响别的'
  ], bandX + 3 * (COLW + GAPX), bandY + 30, 58);

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
