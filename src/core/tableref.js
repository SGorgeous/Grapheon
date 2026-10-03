'use strict';
/* ==========================================================================
   GRAPHEON · core/tableref.js
   表格单元格引用 —— 行列逻辑和 Excel 一样。

     A1        第 A 列第 1 行
     B2        ……
     A1:B10    一片区域（给 SUM / AVG 这类用）
     $A$1      美元符号照收、忽略（没有「复制填充」这件事，绝对引用无意义）

   列号用字母：A..Z, AA..AZ, BA.. —— 和 Excel 一样是**双射二十六进制**
   （没有 0，A=1，Z=26，AA=27）。

   ★ 引用是**相对于所在表格节点**的，和 Excel「公式引用本表单元格」一致。
   ========================================================================== */

const CELLREF_RE = /^\$?([A-Za-z]{1,3})\$?([0-9]{1,4})$/;

/* 列字母 → 0 起的下标：A=0, Z=25, AA=26 */
function colToIndex(s){
  let n = 0;
  const t = String(s == null ? '' : s).toUpperCase();
  for (let i = 0; i < t.length; i++){
    const c = t.charCodeAt(i) - 64;              // 'A' → 1
    if (c < 1 || c > 26) return -1;
    n = n * 26 + c;
  }
  return n - 1;
}
/* 0 起的下标 → 列字母 */
function indexToCol(i){
  let n = Math.floor(+i) + 1, s = '';
  while (n > 0){
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m - 1) / 26);
  }
  return s || 'A';
}
/* "A1" → { c:0, r:0 }；不是单元格引用返回 null */
function parseCellRef(s){
  const m = String(s == null ? '' : s).trim().match(CELLREF_RE);
  if (!m) return null;
  return { c: colToIndex(m[1]), r: parseInt(m[2], 10) - 1 };
}
const isCellRef = (s) => !!parseCellRef(s);

/* =========================================================================
   在一个表格节点里取值。都走 displayTableCell ——
   所以「引用别的格子」和「格子里有公式」能一层层套下去，
   而且**循环引用**由 interpDepth / 表格自己的守卫拦住。
   ========================================================================= */
function tableCellValueByRef(n, c, r){
  if (!isTableNode(n)) return null;
  const t = tableOf(n);
  if (c < 0 || r < 0 || c >= t.cols || r >= t.rows) return null;   // 出界 —— 和 Excel 一样
  return displayTableCell(n, r, c);
}
function tableValueOfRef(n, refText){
  const p = parseCellRef(refText);
  if (!p) return undefined;
  return tableCellValueByRef(n, p.c, p.r);
}
/* A1:B10 → 一个**按行铺开**的数组（和 Excel 的遍历顺序一致）。
   单格也收，返回长度 1 的数组。两角前后反了也能认。 */
function tableRangeValues(n, a, b){
  const p = parseCellRef(a), q = parseCellRef(b);
  if (!p || !q) return null;
  const c0 = Math.min(p.c, q.c), c1 = Math.max(p.c, q.c);
  const r0 = Math.min(p.r, q.r), r1 = Math.max(p.r, q.r);
  const out = [];
  /* 上限保护：一个区域最多收 2000 格，免得手滑写出 A1:ZZ9999 */
  if ((c1 - c0 + 1) * (r1 - r0 + 1) > 2000) return null;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) out.push(tableCellValueByRef(n, c, r));
  return out;
}

/* 表格 → 一个「引用上下文」：给公式求值用。
   只对表格节点成立；别的节点上没有单元格，返回 null。 */
function tableRefCtx(n, fromId){
  if (!isTableNode(n)) return null;
  return {
    cell:  (nm) => tableValueOfRef(n, nm),
    range: (a, b) => tableRangeValues(n, a, b),
  };
}
