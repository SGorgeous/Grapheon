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
  /* 一个变量 / 控件节点 */
  const V = (text, x, y, def) => N(text, x, y, { kind:'var', varDef:def });
  const OP = (text, x, y, op, operand) => N(text, x, y, { kind:'op', opDef:{ op, operand } });
  const OUT = (text, x, y, name) => N(text, x, y, { kind:'out', outDef:{ name } });
  /* 一条竖列的说明文字 */
  const notes = (items, x, y, step) =>
    items.map((t, i) => N(t, x, y + i * (step || 46), { shape:'rect' }));
  /* 一个功能组：把成员装进去 */
  const groupOf = (title, color, members) => {
    const g = { id:'dg' + (groups.length + 1), title, members:members.map(m => m.id),
                color, x:0, y:0, w:10, h:10, collapsed:false, isFunction:false };
    groups.push(g);
    return g;
  };
  /* 分区小标题 */
  const head = (text, x, y) => N(text, x, y, { shape:'round' });
  void 0;

  /* ==================== 根 ==================== */
  const root = N('GRAPHEON\n节点与连线', -2050, -720, { w:0, h:0 });
  root.big = true;

  /* 版面：3 列，每列一个分区 */
  // 版面：3 列。间距留得很宽 —— 程序节点本身带盒子，挤在一起会互相压。
  const CX = [-2150, -1080, -60];
  const CW = 1020;

  /* ============================================================
     ① 变量节点
     ============================================================ */
  const h1 = head('① 变量节点', CX[0], -700);
  const n1a = N('一格名字 · 一格值 · 一行作用域', CX[0], -600);
  const n1b = N('全局：同作用域里到处能用，不用连线', CX[0], -500, { shape:'round' });
  const n1c = N('局内：只有下游能用', CX[0], -400, { shape:'round' });
  const vWide = V('宽', CX[0], 0, { name:'宽', value:'12', type:'number', scope:'global' });
  const vHigh = V('高', CX[0], 180, { name:'高', value:'8', type:'number', scope:'global' });
  const vArea = V('面积', CX[0], 360,
    { name:'面积', value:'{宽} × {高} = 96', type:'string', scope:'global' });
  const areaOut = N('算出来：{面积}', CX[0] + 560, 360, { shape:'round' });
  E(vArea, areaOut);
  const vLocal = V('局内变量', CX[0], 560, { name:'局内', value:'只有下游看得到', type:'string', scope:'local' });
  const localDown = N('下游：{局内}', CX[0] + 560, 560, { shape:'round' });
  E(vLocal, localDown);
  const localFar = N('不是下游：{局内}', CX[0] + 560, 660, { shape:'round' });
  const g1 = groupOf('变量节点', '#ff7f27',
    [n1a, n1b, n1c, vWide, vHigh, vArea, areaOut, vLocal, localDown, localFar]);

  /* ============================================================
     ② 运算符节点
     ============================================================ */
  const h2 = head('② 运算符节点', CX[1], -700);
  const n2a = N('两个输入端点，各对一个操作数', CX[1], -600);
  const n2b = N('按端点 ID 升序运算', CX[1], -500, { shape:'round' });
  const vPrice = V('单价', CX[1], 0, { name:'单价', value:'12', type:'number', scope:'global' });
  const opMul = OP('乘四', CX[1], 200, '*', '4');
  const total = N('合计 {单价} 元', CX[1] + 620, 200, { shape:'round' });
  E(vPrice, opMul); E(opMul, total);
  // 第二路接上 → 顶掉格子里那个 4
  const vSecond = V('第二路', CX[1] - 460, 700, { name:'第二路', value:'7', type:'number', scope:'global' });
  const opAdd = OP('加', CX[1], 480, '+', '5');
  const addOut = N('两路都接：10 + 7', CX[1] + 620, 480, { shape:'round' });
  const vTen = V('十', CX[1] - 460, 480, { name:'十', value:'10', type:'number', scope:'global' });
  E(vTen, opAdd); E(opAdd, addOut);
  const eSecond = E(vSecond, opAdd);
  // 把第二路钉到 2 号端点
  if (eSecond){ eSecond.bPort = 2; eSecond.bSide = 'l'; }
  const n2c = N('第二路接上 → 格子里那个 5 被顶掉', CX[1], 880, { shape:'round' });
  const g2 = groupOf('运算符节点', '#00ffff',
    [n2a, n2b, vPrice, opMul, total, vSecond, opAdd, addOut, vTen, n2c]);

  /* ============================================================
     ③ 条件节点
     ============================================================ */
  const h3 = head('③ 条件节点', CX[2], -700);
  const n3a = N('一个输入、一个输出', CX[2], -600);
  const n3b = N('输入为 1 → 输出所填的值；否则 → 输出「无」', CX[2], -500, { shape:'round' });
  const vOne = V('给 1', CX[2], 0, { name:'开关一', value:'1', type:'number', scope:'global' });
  const cdOn = V('通', CX[2], 200,
    { name:'通', value:'条件成立', type:'string', scope:'global', control:'cond' });
  const onOut = N('收到：{通}', CX[2] + 560, 200, { shape:'round' });
  E(vOne, cdOn); E(cdOn, onOut);
  const vZero = V('给 0', CX[2] - 440, 480, { name:'开关零', value:'0', type:'number', scope:'global' });
  const cdOff = V('不通', CX[2], 480,
    { name:'不通', value:'条件不成立', type:'string', scope:'global', control:'cond' });
  const offOut = N('收到：{不通}', CX[2] + 560, 480, { shape:'round' });
  E(vZero, cdOff); E(cdOff, offOut);
  const g3 = groupOf('条件节点', '#7fd4ff', [n3a, n3b, vOne, cdOn, onOut, vZero, cdOff, offOut]);

  /* ============================================================
     ④ 广播节点
     ============================================================ */
  const Y2 = 1280;
  const h4 = head('④ 广播节点', CX[0], Y2);
  const n4a = N('把输入值变成全局变量 · 右上角那个 wifi 就是它', CX[0], Y2 + 80, { shape:'round' });
  const vTemp = V('温度', CX[0] - 420, Y2 + 260, { name:'温度', value:'26', type:'number', scope:'global' });
  const bc = N('广播', CX[0] + 220, Y2 + 240,
    { kind:'broadcast', varDef:{ name:'温度广播', value:'', type:'string', scope:'global' } });
  E(vTemp, bc);
  const farUse = N('远处没连线也取得到：{温度广播}', CX[0] + 220, Y2 + 440, { shape:'round' });
  const g4 = groupOf('广播节点', '#b967ff', [n4a, vTemp, bc, farUse]);

  /* ============================================================
     ⑤ 勾选 / 滑条
     ============================================================ */
  const h5 = head('⑤ 勾选 / 滑条', CX[1], Y2);
  const n5a = N('点一下就改值，引用它的地方跟着变', CX[1], Y2 + 80, { shape:'round' });
  const vPick = V('配料', CX[1], Y2 + 260,
    { name:'配料', type:'string', scope:'global', control:'check',
      options:['牛肉', '香菜', '辣椒'], picked:[0, 2] });
  const pickOut = N('已选：{配料}', CX[1] + 620, Y2 + 260, { shape:'round' });
  E(vPick, pickOut);
  const vVol = V('音量', CX[1], Y2 + 520,
    { name:'音量', type:'number', scope:'global', control:'slider',
      value:'60', min:0, max:100, step:10 });
  const volOut = N('当前 {音量}', CX[1] + 620, Y2 + 520, { shape:'round' });
  E(vVol, volOut);
  const g5 = groupOf('勾选 / 滑条', '#00ff00', [n5a, vPick, pickOut, vVol, volOut]);

  /* ============================================================
     ⑥ 输出节点 + 程序组
     ============================================================ */
  const h6 = head('⑥ 输出节点 + 程序组', CX[2], Y2);
  const n6a = N('组内算完，外面接它的结果', CX[2], Y2 + 80, { shape:'round' });
  const fg = { id:'dg' + (groups.length + 1), title:'ƒ 折扣程序组', members:[],
               color:'#b967ff', x:CX[2], y:Y2 + 150, w:10, h:10, collapsed:false, isFunction:true };
  groups.push(fg);
  const vBase = V('基数', CX[2], Y2 + 260, { name:'基数', value:'100', type:'number', scope:'global' });
  const opSub = OP('减十五', CX[2], Y2 + 480, '-', '15');
  const outFn = OUT('折后', CX[2], Y2 + 700, '折后');
  E(vBase, opSub); E(opSub, outFn);
  fg.members = [vBase.id, opSub.id, outFn.id];
  const vDisc = V('折扣价', CX[2] + 640, Y2 + 340, { name:'折扣价', value:'0', type:'number', scope:'global' });
  edges.push(normalizeEdge({ id:'de' + (++eid), s:vDisc.id, t:fg.id }));
  const shown = N('折后 {折扣价} 元', CX[2] + 640, Y2 + 740, { shape:'round' });
  E(vDisc, shown);
  const docOut = OUT('本图输出', CX[2] + 640, Y2 + 900, 'summary');

  /* ============================================================
     ⑦ 外观节点 + 优先级
     ============================================================ */
  const Y3 = 2560;
  const h7 = head('⑦ 外观节点 + 优先级', CX[0], Y3);
  const n7a = N('从它拉一条线到目标，算符就叠过去', CX[0], Y3 + 80, { shape:'round' });
  const tgtShape = N('被改形状', CX[0] + 480, Y3 + 240);
  const pgShape = N('变菱形', CX[0] - 420, Y3 + 240,
    { kind:'program', program:{ op:'shape', key:'shape', mode:'set', value:'diamond' } });
  E(pgShape, tgtShape);
  const tgtColor = N('被染色', CX[0] + 480, Y3 + 460);
  const pgColor = N('染成青', CX[0] - 420, Y3 + 460,
    { kind:'program', program:{ op:'style', key:'color', mode:'set', value:'#00ffff' } });
  E(pgColor, tgtColor);
  const tgtFs = N('被放大', CX[0] + 480, Y3 + 680);
  const pgFs = N('字号 +16', CX[0] - 420, Y3 + 680,
    { kind:'program', program:{ op:'style', key:'fsPx', mode:'add', value:'16' } });
  E(pgFs, tgtFs);
  const n7b = N('优先级决定叠加顺序：数越大越晚算', CX[0], Y3 + 900, { shape:'round' });
  const g7 = groupOf('外观节点', '#ffd800',
    [n7a, tgtShape, pgShape, tgtColor, pgColor, tgtFs, pgFs, n7b]);

  /* ============================================================
     ⑧ 普通节点的功能（不放快捷键字样）
     ============================================================ */
  const h8 = head('⑧ 普通节点能做什么', CX[1], Y3);
  const shapes = notes([
    '四种形状：矩形 / 圆角 / 菱形 / 椭圆',
    '拖右下角自由改尺寸',
    '样式面板：字体 / 字号 / 字色 / 外框色',
    '折叠子树：点右上角的小方块',
    '优先级：和程序节点同一个字段',
    '组件：角标 / 条件隐藏 / 描边 / 染色 / 透明度 / 线宽',
    '节点名和变量名是分开的两回事'
  ], CX[1], Y3 + 80, 100);
  const cBadge = N('挂了角标组件', CX[1] + 700, Y3 + 80,
    { components:[{ type:'badge', props:{ text:'★ {音量}', color:'#ffd800' } }] });
  const cTint = N('染色 + 透明度', CX[1] + 700, Y3 + 280,
    { components:[{ type:'tint', props:{ color:'#b967ff' } },
                   { type:'opacity', props:{ value:'0.55' } }] });
  const cOut = N('自定义描边', CX[1] + 700, Y3 + 480,
    { components:[{ type:'outline', props:{ width:'4', color:'#00ffff' } }] });
  const g8 = groupOf('普通节点', '#3b7dff',
    shapes.concat([cBadge, cTint, cOut]));

  /* ============================================================
     ⑨ 表格节点
     ============================================================ */
  const h9 = head('⑨ 表格节点', CX[2], Y3);
  const n9a = N('格子里的字也能引用变量 · 每行每列外面各一对加减号', CX[2], Y3 + 80, { shape:'round' });
  const tbl = N('', CX[2], Y3 + 300, {
    kind:'table',
    tableDef:{ cols:3, rows:4, header:true, cells:[
      ['项目', '数量', '小计'],
      ['苹果', '{音量}', '{单价} × {音量}'],
      ['香蕉', '3', '待算'],
      ['合计', '', '—']
    ] } });
  const n9b = N('选中它，行的右侧 / 列的下方会亮出加减号', CX[2], Y3 + 900, { shape:'round' });
  const g9 = groupOf('表格节点', '#7fd4ff', [n9a, tbl, n9b]);

  /* ==================== 根 → 各分区 ==================== */
  for (const g of groups){
    edges.push(normalizeEdge({ id:'de' + (++eid), s:root.id, t:g.id,
                               route:'curve', aSide:'r', bSide:'l' }));
  }
  void CW;
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
    /* ★ 取景对着**第一个分区**，不是全图。
       示例五十多个节点、分九个区，全塞进一屏要缩到 17%，节点就只剩细线。
       打开时先给一块看清的；想看全貌按「居中」。 */
    frameDemoSection(0);
  }
}
/* 把视角对到第 i 个分区上，留一圈边距。最多放到 100%。
   ⚠ 从**成员节点**算，不要从分组框算 —— 框是 refitAllGroups 贴出来的，
     成员被防覆盖推开之后框会涨得很大，照着框取景会缩到 20%，白搭。 */
function frameDemoSection(i){
  const g = (doc.groups || [])[i];
  if (!g) return;
  const ids = g.members || [];
  const bs = ids.map(id => byId(id)).filter(Boolean).map(n => nodeBox(n));
  if (!bs.length) return;
  const xs = bs.map(b => b.x), xe = bs.map(b => b.x + b.w);
  const ys = bs.map(b => b.y), ye = bs.map(b => b.y + b.h);
  const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xe);
  const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ye);
  const m = 80;
  view.z = Math.max(0.2, Math.min(VW / (x1 - x0 + m * 2), VH / (y1 - y0 + m * 2), 1));
  view.x = -((x0 + x1) / 2) * view.z + VW / 2;
  view.y = -((y0 + y1) / 2) * view.z + VH / 2;
  mark();
}

/* =========================================================================
   经典示例：最早那份最简的树，留着当「你好世界」
   ========================================================================= */
function classicDoc(){
  const N = (text, shape) => ({ id:uid('n'), text, x:0, y:0, w:0, h:0, shape:shape || 'rect', collapsed:false, lines:[''] });
  const root = N('GRAPHEON');
  root.big = true;              // 根用大号字（以前靠 reindex 的拓扑规则算出来）
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
