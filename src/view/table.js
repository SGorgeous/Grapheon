'use strict';
/* ==========================================================================
   GRAPHEON · view/table.js
   表格节点：行列可编辑的格子，格子里的字也能引用变量。

   数据在 node.tableDef = { cols, rows, cells:[[..]], header }
   · cells[r][c] 是字符串，走的是和节点正文同一套插值
   · header 为真时第 0 行当表头（底色反一下）

   尺寸由内容算出来：每列取该列最宽的格子，夹在 MIN/MAX 之间；行高固定。
   格子里的字**不折行**，放不下就截断（表格格子通常都短，
   真放不下要折行的话，用文本节点更合适）。
   ========================================================================== */

const TBL_PADX = 10, TBL_PADY = 8;
const TBL_MIN_COL = 56, TBL_MAX_COL = 240;
const TBL_MIN_ROWS = 1, TBL_MAX_ROWS = 40;
const TBL_MIN_COLS = 1, TBL_MAX_COLS = 12;

function normalizeTableDef(t){
  const src = (t && typeof t === 'object') ? t : {};
  const cols = Math.max(TBL_MIN_COLS, Math.min(TBL_MAX_COLS, Math.round(+src.cols) || 3));
  const rows = Math.max(TBL_MIN_ROWS, Math.min(TBL_MAX_ROWS, Math.round(+src.rows) || 3));
  const old = Array.isArray(src.cells) ? src.cells : [];
  const cells = [];
  for (let r = 0; r < rows; r++){
    const row = Array.isArray(old[r]) ? old[r] : [];
    const out = [];
    for (let c = 0; c < cols; c++) out.push(String(row[c] == null ? '' : row[c]));
    cells.push(out);
  }
  return { cols, rows, cells, header: src.header !== false };
}
const isTableNode = (n) => !!n && n.kind === 'table';
const tableOf = (n) => normalizeTableDef(n && n.tableDef);

/* 每列的宽度：取该列最宽的那个格子 */
function tableColWidths(n){
  const t = tableOf(n);
  const out = [];
  for (let c = 0; c < t.cols; c++){
    let w = 0;
    for (let r = 0; r < t.rows; r++){
      const s = displayTableCell(n, r, c);
      if (!s) continue;
      w = Math.max(w, mctx.measureText(s).width);
    }
    out.push(Math.max(TBL_MIN_COL, Math.min(TBL_MAX_COL, Math.ceil(w) + TBL_PADX * 2)));
  }
  return out;
}
function tableRowH(){
  setFont(mctx, FS, 'normal', FONT);
  return FS + TBL_PADY * 2;
}
/* 表格的整体几何。绘制、命中、编辑器定位共用这一份。 */
function tableGeom(n){
  const b = nodeBox(n);
  const t = tableOf(n);
  const cols = tableColWidths(n);
  const total = cols.reduce((a, x) => a + x, 0);
  const rh = tableRowH();
  // 手动拉过宽度的话，把差值按比例摊给各列
  let xs = [], x = b.x;
  if (+n.fixedW > 0 && total > 0 && b.w !== total){
    const k = b.w / total;
    for (let c = 0; c < cols.length; c++){ xs.push(x); x += cols[c] * k; }
    xs.push(b.x + b.w);
  } else {
    for (let c = 0; c < cols.length; c++){ xs.push(x); x += cols[c]; }
    xs.push(x);
  }
  const y0 = b.y;
  const ys = [];
  for (let r = 0; r <= t.rows; r++) ys.push(y0 + r * rh);
  return { t, xs, ys, rh, x:b.x, y:y0, w:xs[xs.length - 1] - b.x, h:t.rows * rh };
}
function tableCellBox(g, r, c){
  if (r < 0 || c < 0 || r >= g.t.rows || c >= g.t.cols) return null;
  return { x:g.xs[c], y:g.ys[r], w:g.xs[c + 1] - g.xs[c], h:g.rh };
}
/* 格子内容的显示文本（过插值） */
function displayTableCell(n, r, c){
  const t = tableOf(n);
  const raw = (t.cells[r] || [])[c];
  if (raw == null || raw === '') return '';
  return interpolateIn(liveCtx(), raw, n.id);
}
/* 命中：返回 { r, c } 或 null */
function tableCellAt(n, p){
  if (!isTableNode(n)) return null;
  const g = tableGeom(n);
  if (p.x < g.x || p.x > g.x + g.w || p.y < g.y || p.y > g.y + g.h) return null;
  let c = -1;
  for (let i = 0; i < g.t.cols; i++) if (p.x >= g.xs[i] && p.x < g.xs[i + 1]){ c = i; break; }
  if (c < 0) return null;
  const r = Math.floor((p.y - g.y) / g.rh);
  if (r < 0 || r >= g.t.rows) return null;
  return { r, c };
}

function drawTableNode(g, n, b, selected, hov){
  const G = tableGeom(n);
  const t = G.t;
  const stroke = selected ? C.yellow : (hov ? C.yellow : (entityTint(n, 'node') || effBorder(n) || C.white));
  g.save();
  g.fillStyle = C.bg;
  g.fillRect(G.x, G.y, G.w, G.h);
  // 表头底色：用暗色反一下，和正文区分开
  if (t.header && t.rows > 0){
    g.fillStyle = C.grid;
    g.fillRect(G.x, G.y, G.w, G.rh);
  }
  // 网格线
  g.strokeStyle = C.dim; g.lineWidth = 1.5;
  g.beginPath();
  for (let i = 0; i <= t.cols; i++){
    const x = Math.round(G.xs[i]) + 0.5;
    g.moveTo(x, G.y); g.lineTo(x, G.y + G.h);
  }
  for (let r = 0; r <= t.rows; r++){
    const y = Math.round(G.ys[r]) + 0.5;
    g.moveTo(G.x, y); g.lineTo(G.x + G.w, y);
  }
  g.stroke();
  // 格子里的字
  setFont(g, FS, 'normal', FONT);
  g.textAlign = 'left'; g.textBaseline = 'middle';
  for (let r = 0; r < t.rows; r++){
    for (let c = 0; c < t.cols; c++){
      const s = displayTableCell(n, r, c);
      if (!s) continue;
      const box = { x:G.xs[c], y:G.ys[r], w:G.xs[c + 1] - G.xs[c], h:G.rh };
      g.fillStyle = (t.header && r === 0) ? C.gray : C.white;
      g.fillText(fitText(g, s, box.w - TBL_PADX * 2), box.x + TBL_PADX, box.y + box.h / 2 + 1);
    }
  }
  // 外框
  g.lineWidth = 3; g.strokeStyle = stroke;
  g.strokeRect(G.x, G.y, G.w, G.h);
  g.restore();
}
