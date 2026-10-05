/* =========================================================================
   节点身体 = 一层一层摞起来的「块」
   ─────────────────────────────────────────────────────────────
   为什么要有这个文件（②a）：现在 n.kind === 在 src 里出现 51 次 ——
   加一种节点要同时改 绘制 / 尺寸 / 命中 / 存档四处。
   块模型的目标是让「节点是什么」变成「它身上挂了哪几块」。

   ★ 这一步**只做高度**，而且**不接线**：
     绘制和命中一律不动，sizeNode 也不动。
     目的只有一个 —— 先把模型摆出来，用它**对账**：
     每种 kind 的块高度之和，必须等于现在算出来的 n.h。
     对不上就说明模型有问题，这时候发现比画完再发现便宜得多。

   ★ 一条硬规矩：**能委托就委托，不重写公式**。
     vars 那块直接调 varLayoutsHeight()，不把里面的加法抄一遍 ——
     抄一遍就是两处维护，早晚对不上。

   ★ 边距**不假装统一**：三个布局家族的上下留白本来就不一样
     （图片的描述带是 PADY*2；op / out 的抬头是 8 + 10）。
     模型里就按它们本来的样子分成不同的块，而不是硬塞进一个「desc」。
   ========================================================================= */

/* 每块只管一件事：这个节点身上，这一块要多高。
   n 是节点；块自己从 n 上读它需要的东西（lines / imgDrawH / varDefs …）。 */
const NODE_BLOCK_DEFS = {
  /* 顶上那条名称横带（image / embed 用） */
  name:  { label:'名称带', h:(n) => IMG_NAME_H },

  /* 正文：折行后的行数 × 行高 + 上下留白 */
  text:  { label:'正文',   h:(n) => Math.max(1, n.lines.length) * n.lh + PADY * 2 },

  /* 图片底下那条描述（只有 image 走这个边距家族） */
  descBand: { label:'描述带', h:(n) => (n.lines.length ? n.lines.length * n.lh + PADY * 2 : 0) },

  /* op / out 的抬头：8 + 行高（和描述带不是一个边距） */
  headLine: { label:'抬头', h:(n) => 8 + Math.max(1, n.lines.length) * n.lh },

  /* 图片本体（高度是 sizeImageNode 按原始比例算好放上去的） */
  image: { label:'图片',   h:(n) => n.imgDrawH || 0 },

  /* 表格：高 = 行数 × 行高 */
  table: { label:'表格',   h:(n) => normalizeTableDef(n.tableDef).rows * tableRowH() },

  /* 变量区 —— **整块委托**，一行加法都不重写 */
  vars:  { label:'变量',   h:(n) => Math.round(varLayoutsHeight(n)) },

  /* 运算符 / 输出：中间那个输入框 + 下留白 */
  opBox: { label:'运算符', h:(n) => OP_BOX_H + 10 },
  outBox:{ label:'输出',   h:(n) => OUT_BOX_H + 10 },

  /* 嵌入：★ 它是「**填充块**」不是「堆叠块」——
     里面那张缩略图吃掉整个框的剩余空间，自己不报高度。
     对账时它一项就解释了全部差额（块和 0 vs n.h 240）。
     模型必须区分这两种：堆叠的报高度，填充的吃剩下的。 */
  embed: { label:'嵌入',   fill:true, h:(n) => 0,
           /* ★ 填充块**自带默认尺寸**：嵌入没手动拉过就是 240×340，
              拉过就听 fixedH / fixedW。它的尺寸规则是这块自己的，不属于堆叠高度。 */
           defH:() => EMBED_DEF_H, defW:() => EMBED_DEF_W,
           minH:() => EMBED_MIN_H, minW:() => EMBED_MIN_W }
};

/* kind → 身体上有哪几块（从上到下）。
   ★ program 不在 NODE_KINDS 的 sizeNode 分派里 ——
     它是「对外的算符」，落的是**默认正文**那一支。
     这正好印证了：对外的行为不该混进身体里的块。 */
const NODE_PARTS_BY_KIND = {
  node:      ['text'],
  program:   ['text'],
  var:       ['vars'],
  broadcast: ['vars'],
  op:        ['headLine', 'opBox'],
  out:       ['headLine', 'outBox'],
  table:     ['table'],
  image:     ['name', 'image', 'descBand'],
  embed:     ['embed']
};

/* 这个节点身上有哪几块 */
function nodePartsOf(n){
  if (!n) return [];
  const list = NODE_PARTS_BY_KIND[n.kind];
  return list ? list.slice() : NODE_PARTS_BY_KIND.node.slice();
}
/* 这个节点身上的**填充块**（没有就 null）。
   填充块自带尺寸规则（嵌入就是 240×340），不参与堆叠求和。 */
function fillBlockOf(n){
  for (const id of nodePartsOf(n)){
    const d = NODE_BLOCK_DEFS[id];
    if (d && d.fill) return d;
  }
  return null;
}

/* 块加起来的自然高度。
   ⚠ 它**不含框级下限**：普通节点有 MINH(=48)、菱形另有下限、fixedH 也是下限。
     所以对账要写成 max(框级下限, partsHeight)，不能直接比 ——
     我第一次就是直接比的，一个 47 vs 48 的 1px 差额把结论带偏了。
   另外 fill 块不吃高度，它的空间是「框高减去其它块」。 */
function partsHeight(n){
  let t = 0;
  for (const id of nodePartsOf(n)){
    const def = NODE_BLOCK_DEFS[id];
    if (def && typeof def.h === 'function') t += def.h(n) || 0;
  }
  return Math.round(t);
}
