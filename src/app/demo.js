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
  const E = (a, b) => {
    const e = normalizeEdge({ id:'de' + (++eid), s:a.id, t:b.id });
    edges.push(e);
    return e;
  };
  const V = (text, x, y, def) => N(text, x, y, { kind:'var', varDef:normalizeVarDef(def) });
  const OP = (text, x, y, op, operand) => N(text, x, y, { kind:'op', opDef:{ op, operand } });
  const OUT = (text, x, y, name) => N(text, x, y, { kind:'out', outDef:normalizeOutDef({ name }) });
  /* 程序节点（外观算符） */
  const PG = (text, x, y, op, key, mode, value) =>
    N(text, x, y, { kind:'program', program:normalizeProgram({ op, key, mode, value }) });
  const groupOf = (title, color, members, isFn) => {
    const g = { id:'dg' + (groups.length + 1), title, members:members.map(m => m.id),
                color, x:0, y:0, w:10, h:10, collapsed:false, isFunction:!!isFn };
    groups.push(g);
    return g;
  };
  const head = (text, x, y) => N(text, x, y, { shape:'round' });

  /* ---------------- 版面 ---------------- */
  /* ⚠ 列距要比「一格往两边伸出去的总宽」还大：
       左边那一列（x - DX）和右边那一列（x + DX + 节点宽）都要算进去。
       一格实际占用 ≈ 2*460 + 420 = 1340，所以列距 1150 还不够 ——
       实测 1000 的时候「变量节点」和「运算符节点」的框直接叠上了。
       现在把「往左偏的那一列」限制在 ±(DX+140) 以内，列距 1150 才够。 */
  const CX = [-1150, 0, 1150];
  const RY = [-620, 200, 1020];
  const DX = 460;                   // 一格之内「结果」那一列相对左边那列的偏移
  const DY = 155;                   // 格内行距

  const root = N('GRAPHEON\n节点与连线', CX[0], RY[0] - 140, { w:0, h:0 });
  root.big = true;

  /* ============ ① 变量节点 ============ */
  {
    const x = CX[0], y = RY[0];
    const h = head('① 变量节点：一格名字 · 一格值 · 一行作用域', x, y);
    const k = V('宽', x, y + DY, { name:'宽', value:'40', type:'number', scope:'global' });
    const area = V('面积', x, y + DY * 2,
      { name:'面积', value:'{宽} × 8 = 320', type:'string', scope:'global' });
    const show = N('引用它：{面积}', x + DX, y + DY * 2, { shape:'round' });
    E(area, show);
    const lc = V('局内', x, y + DY * 3,
      { name:'局内', value:'只有下游看得到', type:'string', scope:'local' });
    const down = N('下游：{局内}', x + DX, y + DY * 3, { shape:'round' });
    const far = N('不是下游：{局内}', x + DX, y + DY * 4, { shape:'round' });
    E(lc, down);
    groupOf('变量节点 · 全局 / 局内 / 值里能引用变量', '#ff7f27',
      [h, k, area, show, lc, down, far]);
  }

  /* ============ ② 运算符节点 ============ */
  {
    const x = CX[1], y = RY[0];
    const h = head('② 运算符节点：端点按 ID 升序各对一个操作数', x, y);
    const price = V('单价', x, y + DY, { name:'单价', value:'12', type:'number', scope:'global' });
    const mul = OP('乘四', x, y + DY * 2, '*', '4');
    const total = N('合计 {单价} 元', x + DX, y + DY * 2, { shape:'round' });
    E(price, mul); E(mul, total);
    const ten = V('十', x - 320, y + DY * 3, { name:'十', value:'10', type:'number', scope:'global' });
    const add = OP('加', x, y + DY * 3, '+', '5');
    const both = N('两路都接：10 + 7', x + DX, y + DY * 3, { shape:'round' });
    E(ten, add); E(add, both);
    const note = N('第二路接上 → 格子里的 5 被顶掉', x, y + DY * 4, { shape:'round' });
    groupOf('运算符节点 · 多输入汇合', '#00ffff',
      [h, price, mul, total, ten, add, both, note]);
  }

  /* ============ ③ 条件节点 ============ */
  {
    const x = CX[2], y = RY[0];
    const h = head('③ 条件节点：输入为 1 → 所填的值，否则 →「无」', x, y);
    const one = V('给 1', x, y + DY, { name:'开关一', value:'1', type:'number', scope:'global' });
    const on = V('通', x + DX, y + DY,
      { name:'通', value:'条件成立', type:'string', scope:'global', control:'cond' });
    const onOut = N('收到：{通}', x + DX + 360, y + DY, { shape:'round' });
    E(one, on); E(on, onOut);
    const zero = V('给 0', x, y + DY * 2,
      { name:'开关零', value:'0', type:'number', scope:'global' });
    const off = V('不通', x + DX, y + DY * 2,
      { name:'不通', value:'条件不成立', type:'string', scope:'global', control:'cond' });
    const offOut = N('收到：{不通}', x + DX + 360, y + DY * 2, { shape:'round' });
    E(zero, off); E(off, offOut);
    groupOf('条件节点', '#7fd4ff', [h, one, on, onOut, zero, off, offOut]);
  }

  /* ============ ④ 勾选 / 滑条 ============ */
  {
    const x = CX[0], y = RY[1];
    const h = head('④ 控件：勾选 / 滑条（上下限也能写 {变量}）', x, y);
    const wide = V('宽', x, y + DY, { name:'宽', value:'40', type:'number', scope:'global' });
    const pick = V('配料', x, y + DY * 2,
      { name:'配料', type:'string', scope:'global', control:'check',
        options:['牛肉', '香菜', '辣椒'], picked:[0, 2] });
    const picked = N('已选：{配料}', x + DX, y + DY * 2, { shape:'round' });
    E(pick, picked);
    /* ★ 上下限 / 步长都引用变量 —— 改「宽」这里跟着变 */
    const vol = V('音量', x, y + DY * 3,
      { name:'音量', value:'50', type:'number', scope:'global', control:'slider',
        min:'{宽}', max:'200', step:'{宽}' });
    const volOut = N('当前 {音量}', x + DX, y + DY * 3, { shape:'round' });
    E(vol, volOut);
    groupOf('勾选 / 滑条 · 参数可引用变量', '#00ff00',
      [h, wide, pick, picked, vol, volOut]);
  }

  /* ============ ⑤ 广播 / 输出 ============ */
  {
    const x = CX[1], y = RY[1];
    const h = head('⑤ 广播节点：输入值变全局变量（右上角 wifi）', x, y);
    const temp = V('温度', x, y + DY, { name:'温度', value:'26', type:'number', scope:'global' });
    const bc = N('广播', x + DX, y + DY,
      { kind:'broadcast', varDef:normalizeVarDef({ name:'温度广播', value:'', type:'string', scope:'global' }) });
    E(temp, bc);
    const use = N('远处没连线也取得到：{温度广播}', x + DX, y + DY * 2, { shape:'round' });
    const out2 = OUT('本图输出', x + DX, y + DY * 3, 'summary');
    groupOf('广播 / 输出节点', '#b967ff', [h, temp, bc, use, out2]);
  }

  /* ============ ⑥ 程序组 ============ */
  {
    const x = CX[2], y = RY[1];
    const h = head('⑥ 程序组：组内算完，外面接结果', x, y);
    const base = V('基数', x, y + DY, { name:'基数', value:'100', type:'number', scope:'global' });
    const sub = OP('减十五', x, y + DY * 2, '-', '15');
    const fnOut = OUT('折后', x, y + DY * 3, '折后');
    E(base, sub); E(sub, fnOut);
    /* ★ 外层是**分区框**，里面**嵌套**一个函数组。
       以前这里放了两个平级分组（ƒ程序组 + 输出节点），两个框必然叠在一起 ——
       分组本来就是能套娃的，用嵌套才说得清「这个函数组是这一区的一部分」。 */
    const fg = groupOf('ƒ 折扣程序组', '#b967ff', [base, sub, fnOut], true);
    const disc = V('折扣价', x + DX, y + DY,
      { name:'折扣价', value:'0', type:'number', scope:'global' });
    edges.push(normalizeEdge({ id:'de' + (++eid), s:disc.id, t:fg.id }));
    const shown = N('折后 {折扣价} 元', x + DX, y + DY * 2, { shape:'round' });
    E(disc, shown);
    const outer = groupOf('⑥ 程序组 · 组内算完，外面接结果', '#3b7dff', [h, disc, shown]);
    outer.members.push(fg.id);          // 嵌套：函数组是这一区的一部分
  }

  /* ============ ⑦ 外观节点 ============ */
  {
    const x = CX[0], y = RY[2];
    const h = head('⑦ 外观节点：从它拉线到目标，算符就叠过去', x, y);
    const mult = V('倍数', x - 320, y + DY * 2,
      { name:'倍数', value:'12', type:'number', scope:'global' });
    const t1 = N('被改形状', x + DX, y + DY);
    const p1 = PG('变菱形', x, y + DY, 'shape', 'shape', 'set', 'diamond');
    E(p1, t1);
    const t2 = N('被放大', x + DX, y + DY * 2);
    /* ★ 字号也能写 {变量} —— 面板里那条滑条旁边就是输入框 */
    const p2 = PG('字号 +{倍数}', x, y + DY * 2, 'style', 'fsPx', 'add', '{倍数}');
    E(mult, p2); E(p2, t2);
    const t3 = N('被染色', x + DX, y + DY * 3);
    const p3 = PG('染成青', x, y + DY * 3, 'style', 'color', 'set', '#00ffff');
    E(p3, t3);
    groupOf('外观节点 · 数值参数可引用变量', '#ffd800', [h, mult, t1, p1, t2, p2, t3, p3]);
  }

  /* ============ ⑧ 普通节点 ============ */
  {
    const x = CX[1], y = RY[2];
    const h = head('⑧ 普通节点：形状 / 尺寸 / 样式 / 组件', x, y);
    const a = N('四种形状：矩形 · 圆角 · 菱形 · 椭圆', x, y + DY, { shape:'round' });
    const b = N('拖右下角改尺寸', x, y + DY * 2, { shape:'ellipse' });
    const c = N('挂了角标组件', x + DX, y + DY * 2,
      { components:[{ type:'badge', props:{ text:'★ {音量}', color:'#ffd800' } }] });
    const d = N('菱形 + 染色 + 半透明', x, y + DY * 3,
      { shape:'diamond', components:[{ type:'tint', props:{ color:'#b967ff' } },
                                     { type:'opacity', props:{ value:'0.6' } }] });
    const e2 = N('自定义描边', x + DX, y + DY * 3,
      { components:[{ type:'outline', props:{ width:'4', color:'#00ffff' } }] });
    const note = N('四条边各一个连接端点（空心环）', x, y + DY * 4, { shape:'round' });
    groupOf('普通节点', '#3b7dff', [h, a, b, c, d, e2, note]);
  }

  /* ============ ⑨ 表格节点 ============ */
  {
    const x = CX[2], y = RY[2];
    const h = head('⑨ 表格节点：格子里的字也能引用变量', x, y);
    const tbl = N('', x, y + DY, {
      kind:'table',
      tableDef:normalizeTableDef({ cols:3, rows:4, header:true, cells:[
        ['项目', '数量', '小计'],
        ['苹果', '{音量}', '{单价} × {音量}'],
        ['香蕉', '3', '待算'],
        ['合计', '', '—']
      ] }) });
    const tip = N('选中它 → 行的右侧 / 列的下方亮出加减号', x + DX, y + DY * 3,
      { shape:'round' });
    groupOf('表格节点', '#7fd4ff', [h, tbl, tip]);
  }

  /* ============ 根 → 各分区 ============ */
  for (const g of groups){
    edges.push(normalizeEdge({ id:'de' + (++eid), s:root.id, t:g.id,
                               route:'curve', aSide:'r', bSide:'l' }));
  }
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
