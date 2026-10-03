'use strict';
/* ==========================================================================
   GRAPHEON · core/csv.js
   表格节点 ⇄ CSV。

   导入：选一个 .csv → 建一个表格节点。
   导出：把表格节点写成 .csv —— **导出的是算完的结果，不是公式**。
         （单元格里的 {=…} 会先求值，再写进文件。）

   CSV 按 RFC 4180 那套来：
     · 字段用逗号分隔，行用换行
     · 包在双引号里的字段可以含逗号、换行、双引号
     · 字段里的双引号写成两个（""）
     · 认 UTF-8 BOM（Excel 存出来的 CSV 头上有）
     · 分隔符自动认：逗号 / 分号 / 制表符（欧洲的 Excel 用分号）
   ========================================================================== */

const CSV_MAX_ROWS = 40;        // 跟 TBL_MAX_ROWS 对齐 —— 表格节点有上限
const CSV_MAX_COLS = 12;

/* ---------------- 读 ---------------- */
/* 猜分隔符：看第一行里哪个候选出现得最多（引号里的不算） */
function csvSniffDelim(text){
  const cands = [',', ';', '\t'];
  const line = String(text).split(/\r\n|\n|\r/).find(l => l.trim() !== '') || '';
  const count = {};
  for (const d of cands) count[d] = 0;
  let inQ = false;
  for (let i = 0; i < line.length; i++){
    const c = line[i];
    if (c === '"'){ inQ = !inQ; continue; }
    if (!inQ && count[c] !== undefined) count[c]++;
  }
  let best = ',', bestN = -1;
  for (const d of cands) if (count[d] > bestN){ bestN = count[d]; best = d; }
  return best;
}

/* 解析成二维数组。手写状态机 —— 正则处理不了引号里的换行。 */
function parseCSV(text, delim){
  let s = String(text == null ? '' : text);
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);            // UTF-8 BOM
  const d = delim || csvSniffDelim(s);
  const rows = [];
  let row = [], field = '', inQ = false, i = 0;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < s.length){
    const c = s[i];
    if (inQ){
      if (c === '"'){
        if (s[i + 1] === '"'){ field += '"'; i += 2; continue; }   // "" → "
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === ''){ inQ = true; i++; continue; }
    if (c === d){ pushField(); i++; continue; }
    if (c === '\r' || c === '\n'){
      pushRow();
      if (c === '\r' && s[i + 1] === '\n') i++;
      i++; continue;
    }
    field += c; i++;
  }
  /* 最后一段：文件末尾没有换行时也得收 */
  if (field !== '' || row.length) pushRow();
  /* 去掉尾巴上的空行 */
  while (rows.length && rows[rows.length - 1].every(x => x === '')) rows.pop();
  return rows;
}

/* ---------------- 写 ---------------- */
/* 一个字段要不要包引号：含分隔符 / 引号 / 换行就得包 */
function csvField(v, d){
  const s = String(v == null ? '' : v);
  if (s.indexOf(d) >= 0 || s.indexOf('"') >= 0 || /[\r\n]/.test(s))
    return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function toCSV(rows, delim){
  const d = delim || ',';
  return rows.map(r => r.map(v => csvField(v, d)).join(d)).join('\r\n');
}

/* ★ 表格节点 → 二维数组。
   用 displayTableCell（它走 interpolateIn），所以拿到的是**算完的结果**。
   {=1+1} 出来是 2，不是 "{=1+1}" —— 这正是导出要的。 */
function tableRowsForExport(n){
  const t = tableOf(n);
  const rows = [];
  /* 底下全空的行 / 全空的列不导出（表格节点允许留空白格）*/
  let lastRow = -1, lastCol = -1;
  for (let r = 0; r < t.rows; r++){
    for (let c = 0; c < t.cols; c++){
      const v = displayTableCell(n, r, c);
      if (String(v == null ? '' : v).trim() !== ''){ lastRow = r; lastCol = Math.max(lastCol, c); }
    }
  }
  if (lastRow < 0) return [];                       // 全空表
  for (let r = 0; r <= lastRow; r++){
    const row = [];
    for (let c = 0; c <= lastCol; c++) row.push(displayTableCell(n, r, c));
    rows.push(row);
  }
  return rows;
}
function tableToCSV(n, delim){ return toCSV(tableRowsForExport(n), delim); }

/* ---------------- 建 / 存 ---------------- */
/* 从二维数组建一个表格节点。放在 (x, y)。 */
function addTableNodeFromRows(rows, x, y, name){
  const src = rows || [];
  const cols = Math.max(1, Math.min(CSV_MAX_COLS,
    src.reduce((m, r) => Math.max(m, (r || []).length), 0)));
  const body = src.slice(0, CSV_MAX_ROWS);
  const cells = [];
  for (let r = 0; r < body.length; r++){
    const row = [];
    for (let c = 0; c < cols; c++) row.push(String((body[r] || [])[c] == null ? '' : (body[r] || [])[c]));
    cells.push(row);
  }
  const n = addNodeAt(name || (cells.length ? String(cells[0][0] || '') : '表格'), x, y, 'rect');
  n.kind = 'table';
  n.tableDef = normalizeTableDef({ cols, rows: Math.max(1, cells.length), cells });
  sizeNode(n);
  return n;
}

/* ---------------- 文件 ---------------- */
function csvPickFile(cb){
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.csv,.tsv,.txt,text/csv,text/plain';
  inp.style.display = 'none';
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try { cb(String(r.result || ''), f.name); }
      catch(e){ say('* CSV 读出来不对：' + e.message + '。'); }
    };
    r.onerror = () => say('* CSV 读失败了。');
    r.readAsText(f, 'UTF-8');
  };
  document.body.appendChild(inp);
  inp.click();
  setTimeout(() => { try { inp.remove(); } catch(e){} }, 0);
}

/* 导入：选文件 → 建节点 → 落在视野中间 */
function importCSV(){
  csvPickFile((text, fname) => {
    const rows = parseCSV(text);
    if (!rows.length){ say('* 这个 CSV 里没有内容。'); return; }
    const cx = Math.round((canvas.clientWidth / 2 - view.x) / view.z);
    const cy = Math.round((canvas.clientHeight / 2 - view.y) / view.z);
    const title = String(fname || '').replace(/\.(csv|tsv|txt)$/i, '') || '表格';
    pushUndo('导入 CSV');
    const n = addTableNodeFromRows(rows, cx - 160, cy - 100, title);
    reindex(); sizeAll(); selectOnly(n);
    const clipped = (rows.length > CSV_MAX_ROWS || (rows[0] || []).length > CSV_MAX_COLS);
    say('* 「' + shortName(title) + '」导入 ' + rows.length + ' 行'
      + (clipped ? '（表格最多 ' + CSV_MAX_ROWS + ' 行 × ' + CSV_MAX_COLS + ' 列，多的截掉了）' : '') + '。');
  });
}

/* 导出：表格节点 → .csv（算完的结果） */
function exportTableCSV(n){
  if (!n || !isTableNode(n)){ say('* 先选一个表格节点。'); return; }
  const rows = tableRowsForExport(n);
  if (!rows.length){ say('* 「' + tagOf(n) + '」是空表，没什么可导出的。'); return; }
  const csv = toCSV(rows);
  const base = String(n.text || '表格').replace(/[\\/:*?"<>|]/g, '_') || '表格';
  downloadBlob(new Blob([csv], { type:'text/csv;charset=utf-8' }), base + '.csv');
  say('* 导出了「' + tagOf(n) + '」：' + rows.length + ' 行 × ' + rows[0].length + ' 列（公式已算成结果）。');
}
