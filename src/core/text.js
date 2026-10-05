'use strict';
/* ==========================================================================
   GRAPHEON · core/text.js
   文本度量、中英混排换行、节点尺寸计算。

   默认字体是 GNU Unifont（16px 点阵网格，16px 时 ASCII 8px/字、CJK 16px/字）。
   节点可以自己指定字体和字号；一旦指定，就用那个字体量宽高、折行。
   ========================================================================== */

/* ---------------- 文本度量 ---------------- */
const mctx = document.createElement('canvas').getContext('2d');
const HAS_LS = ('letterSpacing' in mctx);
function setFont(g, size, weight, family){
  g.font = (weight || 'normal') + ' ' + size + 'px ' + (family || FONT);
  if (HAS_LS) { try { g.letterSpacing = '1px'; } catch(e){} }
}
const CJK = /[\u1100-\u11ff\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
function tokenize(s){
  const out = []; let buf = '';
  for (const ch of s){
    if (CJK.test(ch) || ch === ' ' || ch === '\t'){
      if (buf){ out.push(buf); buf = ''; }
      out.push(ch);
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}
function wrapText(text, maxW, size, weight, family){
  setFont(mctx, size, weight, family);
  const lines = [];
  for (const para of String(text == null ? '' : text).split('\n')){
    const toks = tokenize(para);
    let line = '';
    for (const t of toks){
      if (line && mctx.measureText((line + t).replace(/\s+$/,'')).width > maxW){
        lines.push(line.replace(/\s+$/,''));
        line = (t === ' ' || t === '\t') ? '' : t;
      } else line += t;
    }
    lines.push(line.replace(/\s+$/,''));
  }
  if (!lines.length) lines.push('');
  return lines;
}
/* 多媒体节点：尺寸由「名称带 + 内容区 + 描述」叠出来。
   拖右下角改宽度时内容等比缩放，高度自己跟着走。

   ★ 内容区按类型算：
       图片 / 视频  按原始比例（视频还没拿到元数据时按 16:9 占位）
       音频         一条固定高度的条
       网页 / 文件  一张固定高度的卡片
     原始尺寸记在 n.imgW / n.imgH 里（插入时量到的；视频由 videoRec 回填）。 */
function sizeImageNode(n){
  const kind = (typeof mediaKindOf === 'function') ? mediaKindOf(n) : 'image';
  const isFlat = (kind === 'audio' || kind === 'link' || kind === 'file');
  const natW = (+n.imgW > 0) ? +n.imgW : (isFlat ? 1 : 4);
  const natH = (+n.imgH > 0) ? +n.imgH : (isFlat ? 1 : 3);
  let w = (+n.fixedW > 0) ? Math.max(IMG_MIN_W, +n.fixedW)
                          : Math.min(IMG_MAX_W, Math.max(IMG_MIN_W, isFlat ? 240 : natW));
  w = Math.round(w);
  /* 内容区高度：
       音频 / 网页 / 文件  → 固定高（一条 / 一张卡片）
       有原始尺寸的        → 按原始比例
       视频还没拿到元数据  → 16:9 占位
       图片还没加载出来    → 老规矩 4:3（别改，改了老文档的形态会变） */
  let imgH;
  if (isFlat) imgH = mediaFallbackBoxH(kind, w);
  else if (+n.imgH > 0) imgH = Math.max(24, Math.round(natH * (w / natW)));
  else if (kind === 'video') imgH = mediaFallbackBoxH('video', w);
  else imgH = Math.max(24, Math.round(3 * (w / 4)));
  n.imgDrawW = w;
  n.imgDrawH = imgH;
  n.mediaKind = kind;                 // 画的时候不用再算一遍
  const desc = displayDescOf(n);      // 描述里也能引用变量
  n.lines = desc ? wrapText(desc, w - PADX * 2, FS, 'normal', FONT) : [];
  n.lh = Math.round(FS * 1.32);
  n.fs = FS; n.fw = 'normal'; n.fam = FONT;
  n.w = w;
  /* ★ 高度改由块模型说了算（②b）。
     这一行原来是 IMG_NAME_H + imgH + descH ——
     那三块正是 name / image / descBand，块和必须和它**一模一样**。 */
  n.h = partsHeight(n);
}
/* =========================================================================
   节点尺寸计算的两块公共部分
   ─────────────────────────────────────────────────────────────
   ① nodeFontMetrics：字体度量的那三行。
      六个 size×Node 里一字不差地抄了六遍，收敛成一处。
   ② nodeDescMetrics：把描述折行 + 上面那三行。
      var / op / out 三个节点完全一样（都用 displayTextOf、都用同样的宽度）。
      ⚠ 另外三个**不能**套：
        image  用 displayDescOf，而且 wrapText 发生在 n.w = w **之前**；
        table  把 n.lines 写死成 ['']（长度 1，和空描述不一样）；
        embed  写死成 []。
        硬套会悄悄改变行为，所以宁可各留各的。
   ★ 这一步只收敛重复，**行为一个字都不改**。 */
function nodeFontMetrics(n){
  n.lh = Math.round(FS * 1.32);
  n.fs = FS; n.fw = 'normal'; n.fam = FONT;
}
function nodeDescMetrics(n){
  const desc = displayTextOf(n);
  /* 这里**不能**加「空描述就给 []」的守卫 ——
     var / op / out 原来都是无条件 wrapText 的，
     加守卫会让空描述的节点矮一行（wrapText('') 给的是 ['']，长度 1）。
     我第一版就是顺手加了守卫，等于偷偷改了行为。
     要守卫的是 sizeImageNode，它自己留着。 */
  n.lines = wrapText(desc, n.w - VAR_PAD * 2, FS, 'normal', FONT);
  nodeFontMetrics(n);
  return n.lines.length;
}

/* 嵌入节点：尺寸完全手动（里面那张缩略图会等比铺满） */
function sizeEmbedNode(n){
  /* ★ 嵌入是**填充块** —— 尺寸规则属于这块自己（240×340，能被 fixedW/H 覆盖），
     不走堆叠求和。规则写在 blocks.js 的 defW/defH/minW/minH 上。 */
  const fb = fillBlockOf(n);
  n.w = Math.round(Math.max(fb.minW(), +n.fixedW || fb.defW()));
  n.h = Math.round(Math.max(fb.minH(), +n.fixedH || fb.defH()));
  n.lines = [];
  nodeFontMetrics(n);
}
/* 变量定义节点：左上角描述 + 中间两个输入框 + 作用域一行 */
function sizeVarNode(n){
  setFont(mctx, FS, 'normal', FONT);
  const v = varDefOf(n);
  // 控件节点也是「名字格 + 本体」两段，宽度按同一套算
  let inner = (v.control === 'plain')
    ? VAR_PAD * 2 + VAR_NAME_W + 10 + VAR_VAL_W
    : VAR_PAD * 2 + VAR_NAME_W + 10 + CONTROL_MIN_W;
  // 广播节点右上角有个 wifi 符号，留出位置
  if (n.kind === 'broadcast') inner += 22;
  let w = Math.max(MINW, inner);
  if (+n.fixedW > 0) w = Math.max(MIN_FIXED_W, +n.fixedW);
  n.w = Math.round(w);
  nodeDescMetrics(n);
  // ★ fixedH：手动拉过高度就听它的（内部几行由 varLayout 摊开）
  /* ★ 多变量时按「每行叠起来」算高；单变量时 varLayoutsHeight 走的就是原来那条 */
  /* ★ 高度交给块模型（②d）：var / broadcast 身上就一块 vars，
     它整块委托给 varLayoutsHeight —— 一行加法都不重写。
     fixedH 仍旧是框级下限。 */
  n.h = (+n.fixedH > 0) ? Math.max(partsHeight(n), Math.round(+n.fixedH)) : partsHeight(n);
}
/* 运算符节点：左上角描述 + 中间「算符 运算值」 */
function sizeOpNode(n){
  setFont(mctx, FS, 'normal', FONT);
  const arity = opArity(normalizeOpDef(n.opDef).op);
  const inner = VAR_PAD * 2 + OP_OP_W + 10 + arity * OP_VAL_W + (arity - 1) * 8;
  let w = Math.max(MINW, inner);
  if (+n.fixedW > 0) w = Math.max(MIN_FIXED_W, +n.fixedW);
  n.w = Math.round(w);
  nodeDescMetrics(n);
  /* ★ 高度交给块模型（②d）：headLine（8 + 行高）+ opBox（OP_BOX_H + 10）。 */
  n.h = (+n.fixedH > 0) ? Math.max(partsHeight(n), Math.round(+n.fixedH)) : partsHeight(n);
}
/* 输出节点：左上角描述 + 一个变量名框 */
function sizeOutNode(n){
  setFont(mctx, FS, 'normal', FONT);
  let w = Math.max(MINW, VAR_PAD * 2 + OUT_NAME_W);
  if (+n.fixedW > 0) w = Math.max(MIN_FIXED_W, +n.fixedW);
  n.w = Math.round(w);
  nodeDescMetrics(n);
  /* ★ 高度交给块模型（②d）：headLine + outBox。 */
  n.h = (+n.fixedH > 0) ? Math.max(partsHeight(n), Math.round(+n.fixedH)) : partsHeight(n);
}
/* 表格节点：宽 = 各列宽之和，高 = 行数 × 行高。手动拉过宽度就按比例摊给各列。 */
function sizeTableNode(n){
  setFont(mctx, FS, 'normal', FONT);
  const t = normalizeTableDef(n.tableDef);
  const cols = tableColWidths(n);
  const natural = cols.reduce((a, x) => a + x, 0);
  n.w = (+n.fixedW > 0) ? Math.max(MIN_FIXED_W, +n.fixedW) : Math.max(MIN_FIXED_W, natural);
  /* ★ 高度交给块模型（②d）：table 那一块就是「行数 × 行高」。
     fixedH 是**框级下限**，不属于块 —— 留在这一层。 */
  n.h = (+n.fixedH > 0) ? Math.max(partsHeight(n), Math.round(+n.fixedH)) : partsHeight(n);
  n.lines = [''];
  nodeFontMetrics(n);
}
function sizeNode(n){
  if (n.kind === 'image'){ sizeImageNode(n); return; }
  if (n.kind === 'table'){ sizeTableNode(n); return; }
  if (n.kind === 'out'){ sizeOutNode(n); return; }
  if (n.kind === 'embed'){ sizeEmbedNode(n); return; }
  if (n.kind === 'var' || n.kind === 'broadcast'){ sizeVarNode(n); return; }   // 广播节点同一套尺寸
  if (n.kind === 'op'){ sizeOpNode(n); return; }
  const size = nodeFontSize(n);
  const family = nodeFontFamily(n);
  const weight = 'normal';   // Unifont 无粗体；统一不用合成粗体
  setFont(mctx, size, weight, family);
  const raw = displayTextOf(n);      // 用插值之后的文本量宽：{x} 会变成真值
  let natural = 0;
  for (const p of raw.split('\n')) natural = Math.max(natural, mctx.measureText(p).width);

  const dia  = n.shape === 'diamond';
  const big  = !!n.big;
  const cap  = (big ? MAXW + 90 : MAXW) * (dia ? 1.5 : 1);
  const need = natural + PADX * 2 + 14;
  let w = Math.max(big ? 210 : MINW, Math.min(cap, need * (dia ? 1.6 : 1)));
  // 手动拖过尺寸就用固定值；文字仍然按这个宽度重新折行
  if (n.fixedW) w = Math.max(MIN_FIXED_W, n.fixedW);
  n.w = Math.round(w);

  const avail = dia ? n.w * 0.54 : n.w - PADX * 2;
  n.lines = wrapText(raw, avail, size, weight, family);
  n.lh  = Math.round(size * 1.32);
  n.fs  = size;          // 实际用的字号（供绘制用）
  n.fw  = weight;
  n.fam = family;
  /* ★ 正文高度交给块模型（②d）：就一块 text。
     下面那几行 MINH / 菱形 / big / fixedH **都是框级下限**，不属于块，留在这一层。 */
  let h = partsHeight(n);
  if (dia) h = Math.max(h, n.w * 0.52);
  h = Math.max(big ? 68 : MINH, h);
  if (n.fixedH) h = Math.max(MIN_FIXED_H, n.fixedH);
  n.h = Math.round(h);
}
