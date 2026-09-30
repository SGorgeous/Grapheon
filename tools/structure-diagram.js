/* ==========================================================================
   用 Grapheon 自己画一张「GRAPHEON 项目结构与功能」图，然后走它自己的导出通道出 PNG。
   ========================================================================== */
(function () {
  // ---- 从空白开始，不要示例文档 ----
  deserialize({ v:2, nid:1, nodes:[{ id:'r', text:'GRAPHEON', x:0, y:0, shape:'rect' }], edges:[], groups:[] });
  reindex();

  const mkGroup = (ids, title, color) => {
    selectGroup(null); sel.clear();
    for (const id of ids) sel.add(id);
    const g = createGroup();
    renameGroup(g, title);
    g.color = color;
    return g;
  };
  const NODE_H = 52, VGAP = 12, COL_W = 300, COL_GAP = 70;

  /* ---------- 代码结构：五个分层，每层一个分组 ---------- */
  const LAYERS = [
    ['核心 core', '#ffd800', [
      'util 常量 / 工具 / 下载',
      'theme 主题调色板',
      'text 文本度量与折行',
      'state 文档模型 / 索引',
      'vars 变量系统',
      'history 撤销栈 / 存档',
      'layout 树形排版',
      'routing 连线几何'
    ]],
    ['视图 view', '#00ffff', [
      'stage 画布 / DPR',
      'render 全部绘制',
      'camera 视口 / 缩放',
      'hit 命中测试'
    ]],
    ['交互 interact', '#00ff00', [
      'pointer 鼠标状态机',
      'keys 快捷键表',
      'editing 行内编辑',
      'commands 所有命令'
    ]],
    ['界面 ui', '#b967ff', [
      'menu 弹出菜单 / 子菜单',
      'nodebox 节点面板',
      'edgebox 连线样式面板',
      'endbox 端点吸附面板',
      'exporter PNG 导出',
      'help 操作指南',
      'dialogue 对白栏',
      'toolbar 顶栏装配',
      'cursor 光标'
    ]],
    ['应用 app', '#ff7f27', [
      'document 新建 / 打开 / 拖放',
      'demo 示例文档',
      'main 启动 / 主循环'
    ]]
  ];

  const layerGroups = [];
  LAYERS.forEach(([title, color, mods], ci) => {
    const x = ci * (COL_W + COL_GAP);
    const ids = mods.map((t, ri) => {
      const n = addNodeAt(t, x, ri * (NODE_H + VGAP), 'rect');
      return n.id;
    });
    reindex(); sizeAll();
    layerGroups.push(mkGroup(ids, title, color));
  });
  reindex(); sizeAll();

  // 把这一整排挪到上面去：先量出整体范围，再平移
  let topY = Infinity, botY = -Infinity;
  for (const g of layerGroups){ topY = Math.min(topY, g.y); botY = Math.max(botY, g.y + g.h); }
  const sizeBand = botY - topY;
  for (const g of layerGroups){
    const d = -sizeBand / 2 - 120 - topY;
    moveGroupBy(g, 0, d);
  }
  reindex(); sizeAll();

  /* ---------- 功能：六个分组 ---------- */
  const FEATURES = [
    ['节点与外观', '#ffd800', [
      '矩形 / 圆角 / 菱形 / 椭圆',
      '拖手柄自由改尺寸',
      '字体 · 字号 · 字色 · 外框色',
      '折叠子树（点角标展开）'
    ]],
    ['连线', '#00ffff', [
      '箭头：无 / 单向 / 双向',
      '线型：实线 / 虚线',
      '走线：正交折线 / 曲线',
      '拐点：拖线身自由弯折',
      '端点吸附：自动 / 上右下左',
      '拖端点改接到别的节点'
    ]],
    ['分组', '#00ff00', [
      '自由框：手动尺寸 + 自动长大',
      '拖进去自动收纳',
      '分组可以套娃',
      '折叠分组（不留幽灵框）',
      '多选（可与节点混选）'
    ]],
    ['程序化节点', '#b967ff', [
      '算符：外观 / 形状 / 位置 / 数值',
      '连到分组 = 作用全组',
      '程序节点之间链式累加',
      '优先级可调'
    ]],
    ['变量系统', '#ff7f27', [
      '变量定义节点（名 / 值 / 作用域）',
      '文本里用 \\{name} 引用变量',
      '运算节点：+ - * / 可叠加',
      '函数分组 = 自定义运算',
      '作用域：全局 / 局内 / 组内'
    ]],
    ['媒体与其它', '#3b7dff', [
      '图片节点（拖拽 / 粘贴 / 描述）',
      '嵌入 Grapheon（封闭节点）',
      '导出 PNG · 撤销重做',
      '主题可换 · 快捷键自定义'
    ]]
  ];

  const featureGroups = [];
  FEATURES.forEach(([title, color, items], ci) => {
    const x = ci * (COL_W + COL_GAP);
    const ids = items.map((t, ri) => addNodeAt(t, x, ri * (NODE_H + VGAP), 'rect').id);
    reindex(); sizeAll();
    featureGroups.push(mkGroup(ids, title, color));
  });
  reindex(); sizeAll();
  for (const g of featureGroups){
    const d = sizeBand / 2 + 120 - g.y;
    moveGroupBy(g, 0, d);
  }
  reindex(); sizeAll();

  /* ---------- 根节点连到每一层 / 每一类 ---------- */
  const root = doc.nodes.find(n => n.text === 'GRAPHEON');
  const all = layerGroups.concat(featureGroups);
  for (const g of all){
    const e = linkNodes(root.id, g.id);
    if (e){ e.route = 'curve'; e.aSide = 'r'; e.bSide = 'l'; }
  }
  document.title = 'edges=' + doc.edges.length + ' groups=' + (doc.groups||[]).length +
    ' rootEdges=' + doc.edges.filter(e => e.s === root.id).length;
  root.x = -520; root.y = -60;
  root.text = 'GRAPHEON\n节点与连线';
  sizeNode(root);

  /* ---------- 用变量系统给图加点「活」的 ---------- */
  const vCount = addVarNode('模块数', -520, -300, { value:'28', type:'number', scope:'global' });
  vCount.text = '模块总数';
  const vLayers = addVarNode('分层数', -520, 160, { value:'11', type:'number', scope:'global' });
  vLayers.text = '分组数';
  const note = addNodeAt('共 {模块数} 个模块，分 {分层数} 组', -520, 300, 'round');
  linkNodes(vCount.id, note.id);
  linkNodes(vLayers.id, note.id);
  // 把两个变量节点的优先级压到默认以下，演示「可以手动设优先级」
  setPriority(vCount, 10);
  setPriority(vLayers, 10);

  reindex(); sizeAll();
  selectGroup(null); sel.clear();
  initHist(); fitView(); mark();
  say('* 这张图就是 Grapheon 画的：左边根节点、五层代码结构、六个功能分组，底下「共 N 个模块」用的是变量系统。');
  updateMeta();

  /* ---------- 走 Grapheon 自己的导出通道出 PNG ---------- */
  expScope = 'all';
  ensureImagesLoaded().then(() => {
    const nodes = currentExportSet();
    const cv = buildExportCanvas(nodes, 'GRAPHEON · 结构与功能');
    const im = document.createElement('img');
    im.id = 'shot';
    im.src = cv.toDataURL('image/png');
    im.style.display = 'none';
    document.body.appendChild(im);
    document.title = 'shot-ready';
  });
})();
