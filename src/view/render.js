'use strict';
/* ==========================================================================
   GRAPHEON · view/render.js
   canvas 绘制：网格、连线、节点、端口、折叠标记、红心。
   ========================================================================== */

/* =========================================================================
   绘制
   ========================================================================= */
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = Math.floor(VW * DPR);
  canvas.height = Math.floor(VH * DPR);
  canvas.style.width = VW + 'px';
  canvas.style.height = VH + 'px';
  mark();
}
function draw(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, VW, VH);
  drawGrid();
  if (typeof drawSakura === 'function') drawSakura(ctx);   // 背景特效（樱花主题）
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(view.z, view.z);
  drawGraph(ctx);
  ctx.restore();
  drawMarquee();
  positionEditor();
}
let gridPat = null, gridPatStep = 0, gridPatKind = '';
function drawGrid(){
  const st = gridStyle();
  if (st === 'none') return;
  const step = 34 * view.z;
  if (step < 11) return;
  const s = Math.max(8, Math.round(step));
  // 横纵网格：一格只画左上两条线，用 pattern 铺
  if (st === 'lines'){
    if (!gridPat || gridPatStep !== s || gridPatKind !== 'lines'){
      const c = document.createElement('canvas');
      c.width = s; c.height = s;
      const g2 = c.getContext('2d');
      g2.fillStyle = C.grid;
      g2.fillRect(0, 0, 1, s);
      g2.fillRect(0, 0, s, 1);
      gridPat = ctx.createPattern(c, 'repeat');
      gridPatStep = s; gridPatKind = 'lines';
    }
    const ox = ((view.x % s) + s) % s;
    const oy = ((view.y % s) + s) % s;
    ctx.save();
    ctx.fillStyle = gridPat;
    ctx.translate(ox - s, oy - s);
    ctx.fillRect(0, 0, VW + s * 2, VH + s * 2);
    ctx.restore();
    return;
  }
  // 棋盘：2×2 的格子，只填左上和右下 —— 平铺出来就是棋盘
  if (st === 'checker'){
    const c2 = s * 2;
    if (!gridPat || gridPatStep !== s || gridPatKind !== 'checker'){
      const c = document.createElement('canvas');
      c.width = c2; c.height = c2;
      const g2 = c.getContext('2d');
      g2.fillStyle = C.grid;
      g2.fillRect(0, 0, s, s);
      g2.fillRect(s, s, s, s);
      gridPat = ctx.createPattern(c, 'repeat');
      gridPatStep = s; gridPatKind = 'checker';
    }
    const ox = ((view.x % c2) + c2) % c2;
    const oy = ((view.y % c2) + c2) % c2;
    ctx.save();
    ctx.fillStyle = gridPat;
    ctx.translate(ox - c2, oy - c2);
    ctx.fillRect(0, 0, VW + c2 * 2, VH + c2 * 2);
    ctx.restore();
    return;
  }
  // 点阵：一格右上角一个小方块
  if (!gridPat || gridPatStep !== s || gridPatKind !== 'dots'){
    const c = document.createElement('canvas');
    c.width = s; c.height = s;
    const g2 = c.getContext('2d');
    g2.fillStyle = C.grid;
    g2.fillRect(0, 0, 2, 2);
    gridPat = ctx.createPattern(c, 'repeat');
    gridPatStep = s; gridPatKind = 'dots';
  }
  const ox = ((view.x % s) + s) % s;
  const oy = ((view.y % s) + s) % s;
  ctx.save();
  ctx.fillStyle = gridPat;
  ctx.translate(ox - s, oy - s);
  ctx.fillRect(0, 0, VW + s * 2, VH + s * 2);
  ctx.restore();
}
function drawGraph(g){
  for (const grp of (idx.groupOrder || doc.groups || [])){
    if (isHidden(grp.id)) continue;                    // 被折叠藏起来的分组不画
    drawGroup(g, grp);                                 // 祖先先画、子分组叠在上面
  }
  for (const e of doc.edges){
    if (!edgeVisible(e)) continue;                    // 被折叠藏起来的不画
    if (relink && relink.edgeId === e.id) continue;   // 正在拖端点的那条改用预览画
    drawEdge(g, e);
  }
  for (const n of doc.nodes){
    if (isHidden(n.id)) continue;
    drawNode(g, n);
  }
  // 选中节点的连接端口：鼠标悬停在该节点（或已悬停到它的端口）时才显示
  if (sel.size === 1 && !editing){
    const n = byId([...sel][0]);
    const showPorts = n && !isEmbed(n) && (hover === n || (hoverPort && hoverPort.node === n.id));   // 封闭节点不画端口
    if (showPorts){
      const P = anchorsFor(n);
      for (const k of ['r', 'l', 't', 'b']){
        const a = P[k];
        const on = hoverPort && hoverPort.node === n.id && hoverPort.side === k;
        g.fillStyle = on ? C.yellow : C.bg;
        g.strokeStyle = on ? C.yellow : C.white;
        g.lineWidth = 2;
        g.beginPath();
        g.rect(Math.round(a.x) - 5, Math.round(a.y) - 5, 10, 10);
        g.fill(); g.stroke();
      }
    }
  }
  // 拉新连线的预览
  if (linking){
    const a = anchorOf(linking.node);
    if (a){
      const A = anchorsFor(a)[linking.side];
      const to = linking.to;
      g.save();
      g.strokeStyle = C.yellow; g.lineWidth = 2.5;
      g.setLineDash([8, 6]);
      g.beginPath();
      g.moveTo(A.x, A.y);
      g.lineTo(to.x, to.y);
      g.stroke();
      g.restore();
      if (hover) outlineNode(g, hover);
    }
  }
  // 拖拽端点改接的预览
  if (relink) drawRelink(g);
}
/* 折叠标记的位置/尺寸 —— 绘制和命中测试共用同一份几何 */
function collapseBadgeRect(n){
  const label = String(descendants(n.id).length);
  setFont(mctx, FS, 'normal');
  const bw = Math.max(22, mctx.measureText(label).width + 12), bh = 22;
  return { x:n.x + n.w - bw / 2, y:n.y + n.h / 2 - bh / 2, w:bw, h:bh, label };
}
/* 分组标题右边的小角标：折叠时显示藏了多少个节点，点它就展开。
   放在标题栏右边，不和分组四个端点（在边框正中）打架。 */
function groupBadgeRect(g){
  const tb = groupTitleBox(g);
  const label = String(groupAllNodes(g.id).length);
  setFont(mctx, FS, 'normal', FONT);
  const bw = Math.max(22, mctx.measureText(label).width + 12), bh = 22;
  return { x:tb.x + tb.w + 8, y:tb.y + (tb.h - bh) / 2, w:bw, h:bh, label };
}
/* 选中节点的右下角缩放手柄 */
const RESIZE_SZ = 15;
function resizeHandleRect(n){
  return { x:n.x + n.w - RESIZE_SZ / 2, y:n.y + n.h - RESIZE_SZ / 2, w:RESIZE_SZ, h:RESIZE_SZ };
}
const WAYPOINT_SZ = 13;
function outlineNode(g, n){
  g.save();
  g.strokeStyle = C.yellow; g.lineWidth = 3;
  pathShape(g, n);
  g.stroke();
  g.restore();
}
function drawRelink(g){
  const e = doc.edges.find(x => x.id === relink.edgeId);
  if (!e) return;
  const ep = edgeEndpoints(e);
  if (!ep) return;
  const draggedIsT = relink.end === 't';
  const fixed = draggedIsT ? ep.a : ep.b;            // 没被拖的那一端，还留在原节点上
  const fixedNode = byId(draggedIsT ? e.s : e.t);
  const tgt = relink.target;

  g.save();
  g.strokeStyle = C.yellow; g.lineWidth = 2.5;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.setLineDash([10, 8]);
  if (tgt && fixedNode){
    // 按这条线自己的走线方式预览：松手之后长什么样，现在就长什么样
    const geom = (e.route === 'curve')
      ? bezierGeom(fixedNode, tgt, draggedIsT ? e.aSide : null, draggedIsT ? null : e.bSide)
      : orthoGeom(fixedNode, tgt, 0, draggedIsT ? e.aSide : null, draggedIsT ? null : e.bSide);
    pathGeom(g, geom, CORNER);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(fixed.x, fixed.y);
    g.lineTo(relink.to.x, relink.to.y);
    g.stroke();
  }
  g.restore();

  // 松手会落到的锚点方块
  const dropPt = tgt ? nearestAnchor(tgt, fixed) : relink.to;
  g.save();
  g.fillStyle = C.yellow;
  g.beginPath();
  g.rect(Math.round(dropPt.x) - 6, Math.round(dropPt.y) - 6, 12, 12);
  g.fill();
  g.restore();
  if (tgt) outlineNode(g, tgt);
}
function pathShape(g, n){
  const x = n.x, y = n.y, w = n.w, h = n.h;
  g.beginPath();
  if (n.shape === 'diamond'){
    g.moveTo(x + w / 2, y); g.lineTo(x + w, y + h / 2);
    g.lineTo(x + w / 2, y + h); g.lineTo(x, y + h / 2); g.closePath();
  } else if (n.shape === 'oval'){
    g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else if (n.shape === 'round'){
    roundRect(g, x, y, w, h, 14);
  } else {
    roundRect(g, x, y, w, h, 2);
  }
}
function roundRect(g, x, y, w, h, r){
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
/* 图片缓存：按 data URL 存，加载完 mark() 一帧重画。
   同一张图被多个节点用也只解码一次。 */
const imgCache = new Map();
function imageRec(n){
  if (!n || !n.image) return null;
  let rec = imgCache.get(n.image);
  if (!rec){
    rec = { img:new Image(), ok:false, bad:false };
    rec.img.onload  = () => { rec.ok = true; mark(); };
    rec.img.onerror = () => { rec.bad = true; mark(); };
    rec.img.src = n.image;
    imgCache.set(n.image, rec);
  }
  return rec;
}
const imageReady = (n) => { const r = imageRec(n); return !!(r && r.ok); };
/* 等所有图片解码完（导出前用：不然导出的是「加载中」占位） */
function ensureImagesLoaded(){
  const pending = [...doc.nodes].filter(n => n.kind === 'image' && n.image && !imageReady(n));
  if (!pending.length) return Promise.resolve();
  return Promise.all(pending.map(n => new Promise(res => {
    const r = imageRec(n);
    if (!r || r.ok || r.bad) return res();
    const done = () => res();
    r.img.addEventListener('load', done, { once:true });
    r.img.addEventListener('error', done, { once:true });
    setTimeout(done, 4000);              // 兜底，别把导出卡死
  })));
}
/* 嵌入文档的缩略图范围。子文档里没存 w/h（那是派生的），所以按固定值估一个。 */
const estNW = (m) => (+m.fixedW > 0) ? +m.fixedW : 148;
const estNH = (m) => (+m.fixedH > 0) ? +m.fixedH : 48;
function embedBounds(d2){
  const ns = (d2 && d2.nodes) || [];
  if (!ns.length) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const m of ns){
    const x = +m.x || 0, y = +m.y || 0;
    a = Math.min(a, x); b = Math.min(b, y);
    c = Math.max(c, x + estNW(m)); d = Math.max(d, y + estNH(m));
  }
  return { minX:a, minY:b, maxX:c, maxY:d, w:Math.max(1, c - a), h:Math.max(1, d - b) };
}
function drawEmbedNode(g, n, b, selected, hov){
  const stroke = selected ? C.yellow : (hov ? C.yellow : (effBorder(n) || C.white));
  const top = b.y + EMBED_NAME_H;
  const ix = b.x + 7, iy = top + 7, iw = b.w - 14, ih = b.h - EMBED_NAME_H - 14;
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(b.x, b.y, b.w, b.h);
  // 缩略图
  const d2 = n.embed && n.embed.doc;
  const bb = embedBounds(d2);
  if (bb && iw > 20 && ih > 20){
    const pad = 16;
    const z = Math.min((iw - pad * 2) / bb.w, (ih - pad * 2) / bb.h, 1);
    const ox = ix + iw / 2 - ((bb.minX + bb.maxX) / 2) * z;
    const oy = iy + ih / 2 - ((bb.minY + bb.maxY) / 2) * z;
    g.save();
    g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
    // 连线：简化成中心到中心，缩略图不用那么较真
    g.strokeStyle = C.dim; g.lineWidth = Math.max(0.6, 1.6 * z);
    for (const e of (d2.edges || [])){
      const a = d2.nodes.find(x => x.id === e.s), c2 = d2.nodes.find(x => x.id === e.t);
      if (!a || !c2) continue;
      g.beginPath();
      g.moveTo(ox + ((+a.x||0) + estNW(a) / 2) * z, oy + ((+a.y||0) + estNH(a) / 2) * z);
      g.lineTo(ox + ((+c2.x||0) + estNW(c2) / 2) * z, oy + ((+c2.y||0) + estNH(c2) / 2) * z);
      g.stroke();
    }
    // 节点
    g.strokeStyle = C.gray; g.lineWidth = Math.max(0.8, 2 * z);
    for (const m of d2.nodes){
      const mw = estNW(m) * z, mh = estNH(m) * z;
      if (mw < 3 || mh < 3) continue;
      const mx = ox + (+m.x||0) * z, my = oy + (+m.y||0) * z;
      g.strokeRect(mx, my, mw, mh);
      // 够大就塞一行字，缩略图才有信息量
      if (mh >= 13 && mw >= 26 && m.text){
        setFont(g, Math.max(7, Math.min(13, FS * z)), 'normal', FONT);
        g.fillStyle = C.gray;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(fitText(g, m.text, mw - 6), mx + mw / 2, my + mh / 2 + 1);
      }
    }
    g.restore();
  } else {
    setFont(g, FS, 'normal', FONT);
    g.fillStyle = C.dim; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('空文档', ix + iw / 2, iy + ih / 2);
  }
  // 名称带：右边名称，左边一个「封闭」标记
  g.strokeStyle = C.dim; g.lineWidth = 2;
  g.beginPath(); g.moveTo(b.x, top); g.lineTo(b.x + b.w, top); g.stroke();
  setFont(g, FS, 'normal', FONT);
  g.textBaseline = 'middle';
  g.fillStyle = C.gray; g.textAlign = 'left';
  g.fillText('封闭', b.x + 8, b.y + EMBED_NAME_H / 2 + 1);
  g.fillStyle = n.color || C.white; g.textAlign = 'right';
  g.fillText(fitText(g, n.text || '嵌入文档', b.w - 60), b.x + b.w - 8, b.y + EMBED_NAME_H / 2 + 1);
  // 外框
  g.lineWidth = 3; g.strokeStyle = stroke;
  g.strokeRect(b.x, b.y, b.w, b.h);
  g.restore();
}
/* ---------------- 变量 / 运算节点 ----------------
   两个都是「框里有框」：描述在左上角，下面一排小框。
   这里算出来的方框几何，绘制和命中测试共用，不会打架。 */
function varBoxes(n){
  const b = nodeBox(n);
  return varLayout(b, n.varDef, Math.max(1, n.lines.length) * n.lh);
}
function opBoxes(n){
  const b = nodeBox(n);
  const textH = Math.max(1, n.lines.length) * n.lh + 8;
  const top = b.y + textH;
  const arity = opArity(normalizeOpDef(n.opDef).op);
  const opBox = { x:b.x + VAR_PAD, y:top, w:OP_OP_W, h:OP_BOX_H };
  const valBoxes = [];
  let x = opBox.x + OP_OP_W + 10;
  for (let i = 0; i < arity; i++){
    valBoxes.push({ x, y:top, w:OP_VAL_W, h:OP_BOX_H });
    x += OP_VAL_W + 8;
  }
  return { opBox, valBoxes, valBox:valBoxes[0] };     // valBox 是第一格，兼容老用法
}
/* 输出节点：左上角描述 + 一个变量名框 */
function outBoxes(n){
  const b = nodeBox(n);
  const textH = Math.max(1, n.lines.length) * n.lh + 8;
  return { nameBox:{ x:b.x + VAR_PAD, y:b.y + textH, w:Math.min(OUT_NAME_W, b.w - VAR_PAD * 2), h:OUT_BOX_H } };
}
/* 一个小方框 + 居中的字 */
function drawField(g, box, text, cur){
  g.save();
  g.fillStyle = C.bg;
  g.strokeStyle = C.gray;
  g.lineWidth = 2;
  g.beginPath();
  g.rect(Math.round(box.x), Math.round(box.y), Math.round(box.w), Math.round(box.h));
  g.fill(); g.stroke();
  setFont(g, FS, 'normal', FONT);
  g.fillStyle = cur || C.white;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(fitText(g, text, box.w - 10), box.x + box.w / 2, box.y + box.h / 2 + 1);
  g.restore();
}
function drawOutNode(g, n, b, selected, hov){
  const od = normalizeOutDef(n.outDef);
  const L = outBoxes(n);
  const stroke = selected ? C.yellow : (hov ? C.yellow : (effBorder(n) || C.white));
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(b.x, b.y, b.w, b.h);
  setFont(g, n.fs, n.fw, n.fam);
  g.fillStyle = entityTint(n, 'node') || effColor(n) || (selected ? C.yellow : C.white);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const startY = b.y + 8 + n.lh / 2;
  for (let i = 0; i < n.lines.length; i++) g.fillText(n.lines[i], b.x + VAR_PAD, startY + i * n.lh);
  g.restore();
  drawField(g, L.nameBox, od.name, C.yellow);
  // 作用域提示：顶层 / 某个函数分组 / 嵌入内部
  g.save();
  setFont(g, FS, 'normal', FONT);
  g.fillStyle = C.gray;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(outScopeLabel(n.id), b.x + VAR_PAD, L.nameBox.y + L.nameBox.h + 12);
  g.restore();
  g.save();
  g.lineWidth = 3; g.strokeStyle = stroke;
  g.strokeRect(b.x, b.y, b.w, b.h);
  g.restore();
}
/* ---------------- 三种特殊变量控件的绘制 ---------------- */
function drawCheckControl(g, L, v){
  const b = L.listBox;
  g.save();
  g.strokeStyle = C.gray; g.lineWidth = 2;
  g.strokeRect(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h));
  setFont(g, FS, 'normal', FONT);
  g.textBaseline = 'middle';
  const rows = Math.max(1, v.options.length);
  for (let i = 0; i < rows; i++){
    const y = b.y + i * CHECK_ROW_H + CHECK_ROW_H / 2;
    const on = v.picked.indexOf(i) >= 0;
    const text = v.options[i] == null ? '（空）' : v.options[i];
    // 方框 + 勾
    const bx = b.x + 10, by = y - 8;
    g.strokeStyle = on ? C.yellow : C.dim; g.lineWidth = 2;
    g.strokeRect(Math.round(bx), Math.round(by), 16, 16);
    if (on){
      g.beginPath();
      g.moveTo(bx + 3, by + 8); g.lineTo(bx + 7, by + 12); g.lineTo(bx + 13, by + 4);
      g.strokeStyle = C.yellow; g.lineWidth = 2; g.stroke();
    }
    g.fillStyle = on ? C.white : C.gray;
    g.textAlign = 'left';
    g.fillText(fitText(g, text, b.w - 40), bx + 24, y + 1);
  }
  g.restore();
}
function drawSliderControl(g, L, v, n){
  const b = L.trackBox;
  const cy = b.y + b.h / 2;
  const x0 = b.x + 12, x1 = b.x + b.w - 12;
  const fx = sliderFrac(v, n && n.id);
  const kx = x0 + (x1 - x0) * fx;
  g.save();
  // 轨道
  g.strokeStyle = C.dim; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x0, cy); g.lineTo(x1, cy); g.stroke();
  // 已填充的一段
  g.strokeStyle = C.yellow; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x0, cy); g.lineTo(kx, cy); g.stroke();
  // 滑块
  g.fillStyle = C.bg; g.strokeStyle = C.yellow; g.lineWidth = 3;
  g.beginPath(); g.arc(kx, cy, 9, 0, Math.PI * 2); g.fill(); g.stroke();
  // 当前值
  setFont(g, FS, 'normal', FONT);
  g.fillStyle = C.white; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(String(sliderValue(v, n && n.id)), (x0 + x1) / 2, b.y - 2);
  g.restore();
}
function drawSwitchControl(g, L, v){
  const b = L.knobBox;
  g.save();
  g.fillStyle = C.bg;
  g.strokeStyle = v.on ? C.yellow : C.gray;
  g.lineWidth = 3;
  g.beginPath(); g.rect(Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h));
  g.fill(); g.stroke();
  // 左边一个小圆点表示通断
  const cx = b.x + 18, cy = b.y + b.h / 2;
  g.beginPath(); g.arc(cx, cy, 6, 0, Math.PI * 2);
  g.fillStyle = v.on ? C.yellow : C.dim; g.fill();
  setFont(g, FS, 'normal', FONT);
  g.fillStyle = v.on ? C.yellow : C.gray;
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(v.on ? '已接通' : '已断开', cx + 14, cy + 1);
  g.restore();
}
function drawVarNode(g, n, b, selected, hov){
  const v = normalizeVarDef(n.varDef);
  const L = varBoxes(n);
  const stroke = selected ? C.yellow : (hov ? C.yellow : (effBorder(n) || C.white));
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(b.x, b.y, b.w, b.h);
  // 左上角描述
  setFont(g, n.fs, n.fw, n.fam);
  g.fillStyle = entityTint(n, 'node') || effColor(n) || (selected ? C.yellow : C.white);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const startY = b.y + 8 + n.lh / 2;
  for (let i = 0; i < n.lines.length; i++) g.fillText(n.lines[i], b.x + VAR_PAD, startY + i * n.lh);
  g.restore();
  if (v.control === 'check')       drawCheckControl(g, L, v);
  else if (v.control === 'slider') drawSliderControl(g, L, v, n);
  else if (v.control === 'switch') drawSwitchControl(g, L, v);
  else {
    drawField(g, L.nameBox, v.name, C.yellow);
    drawField(g, L.valBox, controlValue(v, n.id), v.type === 'number' ? C.white : C.gray);
  }
  // 作用域 + 控件类型
  setFont(g, FS, 'normal', FONT);
  g.fillStyle = C.gray;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(varScopeText(v), L.scopeBox.x, L.scopeBox.y + L.scopeBox.h / 2);
  // 外框
  g.save();
  g.lineWidth = 3; g.strokeStyle = stroke;
  g.strokeRect(b.x, b.y, b.w, b.h);
  g.restore();
}
function drawOpNode(g, n, b, selected, hov){
  const od = normalizeOpDef(n.opDef);
  const L = opBoxes(n);
  const stroke = selected ? C.yellow : (hov ? C.yellow : (effBorder(n) || C.white));
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(b.x, b.y, b.w, b.h);
  setFont(g, n.fs, n.fw, n.fam);
  g.fillStyle = entityTint(n, 'node') || effColor(n) || (selected ? C.yellow : C.white);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const startY = b.y + 8 + n.lh / 2;
  for (let i = 0; i < n.lines.length; i++) g.fillText(n.lines[i], b.x + VAR_PAD, startY + i * n.lh);
  g.restore();
  drawField(g, L.opBox, opDefOf(od.op).label, C.yellow);
  L.valBoxes.forEach((bx, i) => drawField(g, bx, od.operands[i] || '', C.white));
  g.save();
  g.lineWidth = 3; g.strokeStyle = stroke;
  g.strokeRect(b.x, b.y, b.w, b.h);
  g.restore();
}
/* 图片节点：右上角名称带 + 图片 + 下方描述 */
function drawImageNode(g, n, b, selected, hov){
  const stroke = selected ? C.yellow : (hov ? C.yellow : (effBorder(n) || C.white));
  const nameY = b.y + IMG_NAME_H;
  const imgY  = nameY;
  const descY = imgY + (n.imgDrawH || 0);
  g.save();
  g.lineJoin = 'round';
  g.fillStyle = C.bg;
  g.fillRect(b.x, b.y, b.w, b.h);
  // 图片本体
  const rec = imageRec(n);
  if (rec && rec.ok){
    g.drawImage(rec.img, b.x + 1.5, imgY, b.w - 3, n.imgDrawH || 0);
  } else {
    g.fillStyle = C.bg;
    g.fillRect(b.x + 1.5, imgY, b.w - 3, n.imgDrawH || 0);
    setFont(g, FS, 'normal', FONT);
    g.fillStyle = C.dim;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(rec && rec.bad ? '图片读不出来' : '图片加载中…', b.x + b.w / 2, imgY + (n.imgDrawH || 0) / 2);
  }
  // 分隔线
  g.strokeStyle = C.dim; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(b.x, nameY); g.lineTo(b.x + b.w, nameY);
  if (n.lines && n.lines.length){ g.moveTo(b.x, descY); g.lineTo(b.x + b.w, descY); }
  g.stroke();
  // 右上角名称
  setFont(g, FS, 'normal', FONT);
  g.fillStyle = n.color || C.white;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText(fitText(g, n.text || '未命名', b.w - 16), b.x + b.w - 8, b.y + IMG_NAME_H / 2 + 1);
  // 描述
  if (n.lines && n.lines.length){
    setFont(g, FS, 'normal', FONT);
    g.fillStyle = C.gray;
    g.textAlign = 'left';
    for (let i = 0; i < n.lines.length; i++){
      g.fillText(n.lines[i], b.x + PADX, descY + PADY + n.lh / 2 + i * n.lh);
    }
  }
  // 外框最后描，压住图片边缘
  g.lineWidth = 3;
  g.strokeStyle = stroke;
  g.strokeRect(b.x, b.y, b.w, b.h);
  g.restore();
}
function drawNode(g, n){
  const _alpha = entityAlpha(n, 'node');
  if (_alpha < 1){ g.save(); g.globalAlpha *= _alpha; }
  try {
  const selected = sel.has(n.id);
  const hov = hover && hover.id === n.id;
  const prog = isProgram(n);
  const eff = effOf(n);
  // 位置/形状一律走「有效盒子」：程序化节点可能把目标挪走、或者改了它的形状
  const b = nodeBox(n);
  const stroke = selected ? C.yellow : (hov ? C.yellow : (effBorder(n) || (prog ? C.gray : C.white)));
  if (n.kind === 'image') drawImageNode(g, n, b, selected, hov);
  else if (n.kind === 'embed') drawEmbedNode(g, n, b, selected, hov);
  else if (n.kind === 'var') drawVarNode(g, n, b, selected, hov);
  else if (n.kind === 'op')  drawOpNode(g, n, b, selected, hov);
  else if (n.kind === 'out') drawOutNode(g, n, b, selected, hov);
  else {
  g.save();
  g.lineJoin = 'round';
  g.lineWidth = isRoot(n) ? 4 : 3;
  g.strokeStyle = stroke;
  g.fillStyle = C.bg;
  pathShape(g, b);
  g.fill();
  g.stroke();
  // 程序节点：再描一圈内框 + 左边一个 ▶，一眼和普通节点区分开
  if (prog){
    g.strokeStyle = C.gray;
    g.lineWidth = 2;
    if (b.shape === 'rect' || b.shape === 'round'){
      pathShape(g, { x:b.x + 6, y:b.y + 6, w:b.w - 12, h:b.h - 12, shape:b.shape });
      g.stroke();
    }
    setFont(g, FS, 'normal', FONT);
    g.fillStyle = C.yellow;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText('▶', b.x - 22, b.y + b.h / 2);
  }

  setFont(g, n.fs, n.fw, n.fam);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = entityTint(n, 'node') || effColor(n) || (selected ? C.yellow : C.white);
  const startY = b.y + b.h / 2 - ((n.lines.length - 1) * n.lh) / 2;
  for (let i = 0; i < n.lines.length; i++) g.fillText(n.lines[i], b.x + b.w / 2, startY + i * n.lh);
  g.restore();
  }

  // 被程序节点作用过的目标：右上角一个黄点，数值型再把累计结果显示在右下角
  if (eff && eff.ops && !prog){
    g.fillStyle = C.yellow;
    g.beginPath();
    const cx = b.x + b.w - 8, cy = b.y - 8;
    g.moveTo(cx, cy - 6); g.lineTo(cx + 6, cy); g.lineTo(cx, cy + 6); g.lineTo(cx - 6, cy);
    g.closePath(); g.fill();
  }
  if (eff && eff.value != null && !prog){
    setFont(g, FS, 'normal', FONT);
    g.fillStyle = C.yellow;
    g.textAlign = 'right';
    g.textBaseline = 'alphabetic';
    g.fillText('= ' + eff.value, b.x + b.w - 8, b.y + b.h - 6);
    g.textBaseline = 'middle';
  }

  const kids = idx.children.get(n.id) || [];
  // 折叠时才显示「隐藏了 N 个」的标记；它同时也是展开按钮（点一下展开）
  if (kids.length && n.collapsed){
    const r = collapseBadgeRect(b);
    g.lineWidth = 2.5; g.strokeStyle = C.white; g.fillStyle = C.bg;
    g.beginPath();
    g.rect(Math.round(r.x), Math.round(r.y), Math.round(r.w), r.h);
    g.fill(); g.stroke();
    g.fillStyle = C.white; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(r.label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }
  // 组件（角标 / 自定义描边）—— 画在选中态之前，免得盖住手柄
  if (typeof drawEntityComponents === 'function') drawEntityComponents(g, n, b, 'node');
  if (selected){
    if (themeHeart()) drawHeart(g, b.x - 26, b.y + b.h / 2 - 6.5, 2);   // 主题说不画就不画
    // 右下角缩放手柄
    const r = resizeHandleRect(b);
    g.fillStyle = C.bg; g.strokeStyle = C.yellow; g.lineWidth = 2.5;
    g.beginPath();
    g.rect(Math.round(r.x), Math.round(r.y), r.w, r.h);
    g.fill(); g.stroke();
    g.fillStyle = C.yellow;
    g.fillRect(Math.round(r.x + r.w - 8), Math.round(r.y + r.h - 8), 5, 5);
  }
  } finally { if (_alpha < 1) g.restore(); }   // 组件「透明度」
}
/* 分组：虚线外框 + 左上角标题。外框几何完全由成员算出，永远包住成员。 */
function drawGroup(g, grp){
  const r = groupBox(grp);
  const sel = selGroups.has(grp.id);
  const col = sel ? C.yellow : (grp.color || C.gray);
  g.save();
  g.strokeStyle = col;
  g.lineWidth = 3;
  g.setLineDash(sel ? [] : [12, 8]);
  g.strokeRect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h));
  g.setLineDash([]);
  // 标题
  const tb = groupTitleBox(grp);
  setFont(g, FS, 'normal', FONT);
  g.fillStyle = col;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const ttl = (isFunctionGroup(grp) ? 'ƒ ' : '') + (grp.title || '分组');
  g.fillText(fitText(g, displayTitleOf(grp) ? (isFunctionGroup(grp) ? 'ƒ ' : '') + displayTitleOf(grp) : ttl, tb.w - 12), tb.x + 6, tb.y + tb.h / 2 + 1);
  // 折叠角标：折叠时画（显示藏了多少），鼠标悬在标题栏上也画（提示这里能点）
  if (grp.collapsed || hoverGrp === grp){
    const bb = groupBadgeRect(grp);
    g.fillStyle = C.bg;
    g.strokeStyle = grp.collapsed ? C.yellow : C.gray;
    g.lineWidth = 2.5;
    g.beginPath();
    g.rect(Math.round(bb.x), Math.round(bb.y), Math.round(bb.w), bb.h);
    g.fill(); g.stroke();
    setFont(g, FS, 'normal', FONT);
    g.fillStyle = grp.collapsed ? C.yellow : C.gray;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(grp.collapsed ? bb.label : '−', bb.x + bb.w / 2, bb.y + bb.h / 2 + 1);
  }
  // 选中时：四个端点 + 右下角缩放柄（和节点一样，框也能自由拉大小）
  if (sel){
    const rsz = resizeHandleRect(r);
    g.fillStyle = C.bg; g.strokeStyle = C.yellow; g.lineWidth = 2.5;
    g.beginPath();
    g.rect(Math.round(rsz.x), Math.round(rsz.y), rsz.w, rsz.h);
    g.fill(); g.stroke();
    g.fillStyle = C.yellow;
    g.fillRect(Math.round(rsz.x + rsz.w - 8), Math.round(rsz.y + rsz.h - 8), 5, 5);
    const P = anchorsFor(r);
    for (const k of ['r', 'l', 't', 'b']){
      const a = P[k];
      const on = hoverPort && hoverPort.node === grp.id && hoverPort.side === k;
      g.fillStyle = on ? C.yellow : C.bg;
      g.strokeStyle = C.yellow;
      g.lineWidth = 2;
      g.beginPath();
      g.rect(Math.round(a.x) - 5, Math.round(a.y) - 5, 10, 10);
      g.fill(); g.stroke();
    }
  }
  g.restore();
  if (typeof drawEntityComponents === 'function') drawEntityComponents(g, grp, r, 'group');
}
/* 把一段连线几何铺成当前路径（贝塞尔 / 样条 / 带圆角的折线），绘制与预览共用 */
function pathGeom(g, geom, radius){
  g.beginPath();
  if (!geom) return;
  if (geom.type === 'c'){
    g.moveTo(geom.p0.x, geom.p0.y);
    g.bezierCurveTo(geom.p1.x, geom.p1.y, geom.p2.x, geom.p2.y, geom.p3.x, geom.p3.y);
    return;
  }
  if (geom.type === 'w'){
    const p = geom.pts;
    if (p.length < 2) return;
    g.moveTo(p[0].x, p[0].y);
    for (let i = 0; i < p.length - 1; i++){
      const s = catmullSeg(p, i);
      g.bezierCurveTo(s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.p2.x, s.p2.y);
    }
    return;
  }
  const pts = geom.pts;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++){
    const r = Math.min(radius, Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) / 2,
                              Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) / 2);
    g.arcTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, Math.max(1, r));
  }
  g.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
/* 画一条连线。样式（箭头 / 虚线 / 走线）全部来自这条线自己的属性 */
function drawEdge(g, e){
  const geom = edgeGeomFor(e);
  if (!geom) return;
  const hi = (e.id === selEdgeId) || (e === hoverEdge);
  const stroke = hi ? C.yellow : C.white;
  g.save();
  g.strokeStyle = stroke;
  g.globalAlpha = hi ? 1 : 0.85;
  // 组件「线宽」：填了就用它（可以引用变量），没填保持默认
  const cw = (typeof edgeWidthOf === 'function') ? edgeWidthOf(e) : 0;
  g.lineWidth = cw > 0 ? cw : 2.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (e.dash) g.setLineDash([11, 8]);
  pathGeom(g, geom, CORNER);
  g.stroke();
  g.setLineDash([]);
  // 箭头：none / end（终点单向）/ both（双向）
  const ap = geomArrowPoints(geom);
  if (e.arrow !== 'none' && ap){
    g.globalAlpha = hi ? 1 : 0.9;
    g.fillStyle = stroke;
    if (e.arrow === 'both') arrowHead(g, ap.start.from, ap.start.to, 11);
    arrowHead(g, ap.end.from, ap.end.to, 11);
  }
  // 选中时在两端画出可拖拽的手柄，以及每个拐点的手柄
  if (e.id === selEdgeId){
    const ep = geomEndpoints(geom);
    for (const pt of [ep.a, ep.b]){
      g.globalAlpha = 1;
      g.fillStyle = C.bg; g.strokeStyle = C.yellow; g.lineWidth = 2.5;
      g.beginPath();
      g.rect(Math.round(pt.x) - 7, Math.round(pt.y) - 7, 14, 14);
      g.fill(); g.stroke();
      g.fillStyle = C.yellow;
      g.fillRect(Math.round(pt.x) - 2, Math.round(pt.y) - 2, 4, 4);
    }
    for (const w of (e.waypoints || [])){
      g.globalAlpha = 1;
      g.fillStyle = C.bg; g.strokeStyle = C.yellow; g.lineWidth = 2.5;
      g.beginPath();
      g.rect(Math.round(w.x) - WAYPOINT_SZ / 2, Math.round(w.y) - WAYPOINT_SZ / 2, WAYPOINT_SZ, WAYPOINT_SZ);
      g.fill(); g.stroke();
      g.fillStyle = C.yellow;
      g.fillRect(Math.round(w.x) - 2, Math.round(w.y) - 2, 4, 4);
    }
  }
  g.restore();
  const elabel = displayLabelOf(e);
  if (elabel){
    const m = geom.mid;
    g.save();
    setFont(g, FS, 'normal');
    const w = g.measureText(e.label).width + 18;
    const h = 26;
    g.fillStyle = C.bg; g.strokeStyle = stroke; g.lineWidth = 2.5;
    g.beginPath(); g.rect(Math.round(m.x - w / 2), Math.round(m.y - h / 2), Math.round(w), h); g.fill(); g.stroke();
    g.fillStyle = stroke; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(elabel, m.x, m.y + 1);
    g.restore();
  }
}
function arrowHead(g, from, to, size){
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  g.beginPath();
  g.moveTo(to.x, to.y);
  g.lineTo(to.x - size * Math.cos(ang - 0.42), to.y - size * Math.sin(ang - 0.42));
  g.lineTo(to.x - size * Math.cos(ang + 0.42), to.y - size * Math.sin(ang + 0.42));
  g.closePath();
  g.fill();
}
const HEART = [
  [1,0],[2,0],[4,0],[5,0],
  [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
  [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
  [1,3],[2,3],[3,3],[4,3],[5,3],
  [2,4],[3,4],[4,4],
  [3,5]
];
function drawHeart(g, x, y, s){
  g.save();
  g.fillStyle = C.red;
  for (const [cx, cy] of HEART) g.fillRect(x + cx * s, y + cy * s, s, s);
  g.restore();
}
function drawMarquee(){
  if (!marquee) return;
  const a = w2s(marquee.a), b = w2s(marquee.b);
  ctx.save();
  ctx.strokeStyle = C.yellow; ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.restore();
}

