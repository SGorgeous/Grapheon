'use strict';
/* ==========================================================================
   GRAPHEON · interact/editing.js
   行内编辑（浮层 textarea）：节点文本 / 连线标签 / 分组标题。
   ========================================================================== */

/* =========================================================================
   编辑文本
   ========================================================================= */
const editor = document.getElementById('editor');

/* 统一取「正在编辑的那个东西」，三种目标各查各的表 */
function editTarget(kind, id){
  if (kind === 'edge') return doc.edges.find(e => e.id === id) || null;
  if (kind === 'group') return byGroup(id) || null;
  return byId(id) || null;   // 'node' 和 'nodeDesc' 都是节点，只是改的字段不同
}
const editValue = (kind, t) => {
  if (kind === 'edge') return t.label || '';
  if (kind === 'group') return t.title || '';
  if (kind === 'nodeDesc') return t.desc || '';
  if (kind === 'varName') return normalizeVarDef(t.varDef).name;
  if (kind === 'varValue') return normalizeVarDef(t.varDef).value;
  if (kind === 'outName') return normalizeOutDef(t.outDef).name;
  if (kind === 'checkOpts') return normalizeVarDef(t.varDef).options.join(', ');
  if (kind === 'cell') return (tableOf(t).cells[editing.row] || [])[editing.col] || '';
  if (kind === 'portLabel') return (portById(t, editing.portId) || {}).label || '';
  if (kind === 'portId') return String(editing.portId);
  if (kind === 'opVal') return normalizeOpDef(t.opDef).operands[0];
  if (/^opVal[0-9]+$/.test(kind)) return normalizeOpDef(t.opDef).operands[+kind.slice(5)] || '';
  return t.text;
};
function editSetValue(kind, t, v){
  if (kind === 'edge') t.label = String(v).replace(/\n/g, ' ').trim();
  else if (kind === 'group') t.title = String(v).replace(/\n/g, ' ');
  else if (kind === 'nodeDesc') t.desc = v;      // 描述允许换行
  else if (kind === 'varName') t.varDef = normalizeVarDef(Object.assign({}, t.varDef, { name:v }));
  else if (kind === 'varValue') t.varDef = normalizeVarDef(Object.assign({}, t.varDef, { value:v.trim() }));
  else if (kind === 'outName') t.outDef = normalizeOutDef({ name:v });
  else if (kind === 'checkOpts') setCheckOptions(t, v);
  else if (kind === 'cell') setTableCell(t, editing.row, editing.col, v.trim());
  else if (kind === 'portLabel') setPortLabel(t, editing.dir, editing.portId, v.trim());
  else if (kind === 'portId'){
    if (setPortId(t, editing.dir, editing.portId, v.trim())) editing.portId = Math.round(+v.trim());
  }
  else if (kind === 'opVal' || /^opVal[0-9]+$/.test(kind)){
    const i = kind === 'opVal' ? 0 : +kind.slice(5);
    const args = normalizeOpDef(t.opDef).operands.slice();
    args[i] = v.trim();
    t.opDef = normalizeOpDef(Object.assign({}, t.opDef, { operands:args }));
  }
  else t.text = v;
}

function startEdit(kind, id, initial, extra){
  const target = editTarget(kind, id);
  if (!target) return;
  // 先挂上 editing 再算 orig：像表格格子这种，要靠 row/col 才取得到原文
  editing = Object.assign({ kind, id }, extra || {});
  editing.orig = editValue(kind, target);
  editor.value = initial != null ? initial : editing.orig;
  editor.style.display = 'block';
  positionEditor();
  editor.focus();
  editor.select();
  mark();
}
function hideEditor(){
  editor.style.display = 'none';
  editing = null;
  mark();
}
function positionEditor(){
  if (!editing) return;
  const z = view.z;
  let x, y, w, h, fs, lh, padX, padY;
  if (editing.kind === 'edge'){
    const t = edgeGeomFor(doc.edges.find(e => e.id === editing.id));
    if (!t){ hideEditor(); return; }
    const m = t.mid || { x:0, y:0 };
    const s = w2s(m);
    w = 160; h = 40; fs = 13; lh = 20; padX = 6; padY = 4;
    x = s.x - (w * z) / 2; y = s.y - (h * z) / 2;
    editor.style.textAlign = 'center';
  } else if (editing.kind === 'group'){
    const grp = byGroup(editing.id);
    if (!grp){ hideEditor(); return; }
    const tb = groupTitleBox(grp);
    const s = w2s({ x:tb.x, y:tb.y });
    w = tb.w; h = tb.h; fs = FS; lh = 20; padX = 6; padY = 4;
    x = s.x; y = s.y;
    editor.style.textAlign = 'left';
  } else if (editing.kind === 'varName' || editing.kind === 'varValue'
             || editing.kind === 'outName' || editing.kind === 'checkOpts' || editing.kind === 'cell'
             || editing.kind === 'portLabel' || editing.kind === 'portId'
             || editing.kind === 'opOp' || /^opVal[0-9]?$/.test(editing.kind)){
    // 变量 / 运算节点里那一个个小框：直接把编辑框盖上去
    const n = byId(editing.id);
    if (!n){ hideEditor(); return; }
    let box;
    if (editing.kind === 'varName') box = varBoxes(n).nameBox;
    else if (editing.kind === 'varValue') box = varBoxes(n).valBox;
    else if (editing.kind === 'outName') box = outBoxes(n).nameBox;
    else if (editing.kind === 'checkOpts') box = varBoxes(n).listBox || outBoxes(n).nameBox;
    else if (editing.kind === 'cell') box = tableCellBox(tableGeom(n), editing.row, editing.col);
    else if (editing.kind === 'opOp') box = opBoxes(n).opBox;
    else box = opBoxes(n).valBoxes[editing.kind === 'opVal' ? 0 : +editing.kind.slice(5)] || opBoxes(n).valBox;
    const s = w2s({ x:box.x, y:box.y });
    fs = FS; lh = Math.round(FS * 1.32);
    w = box.w; h = box.h; padX = 4; padY = 4;
    x = s.x; y = s.y;
    editor.style.textAlign = 'center';
  } else if (editing.kind === 'nodeDesc'){
    // 图片描述：盖在图片下面那一块上
    const n = byId(editing.id);
    if (!n){ hideEditor(); return; }
    const b = nodeBox(n);
    const dy = b.y + IMG_NAME_H + (n.imgDrawH || 0);
    const s = w2s({ x:b.x, y:dy });
    fs = FS; lh = n.lh || Math.round(FS * 1.32);
    w = b.w; h = Math.max(28, b.y + b.h - dy); padX = PADX; padY = PADY;
    x = s.x; y = s.y;
    editor.style.textAlign = 'left';
  } else {
    const n = byId(editing.id);
    if (!n){ hideEditor(); return; }
    const s = w2s({ x:n.x, y:n.y });
    fs = n.fs; lh = n.lh;
    w = n.w; h = n.h; padX = PADX; padY = PADY;
    x = s.x; y = s.y;
    editor.style.textAlign = 'center';
  }
  editor.style.left   = Math.round(x) + 'px';
  editor.style.top    = Math.round(y) + 'px';
  editor.style.width  = Math.max(60, Math.round(w * z)) + 'px';
  editor.style.height = Math.max(28, Math.round(h * z)) + 'px';
  editor.style.fontSize   = (fs * z) + 'px';
  editor.style.lineHeight = (lh * z) + 'px';
  editor.style.borderWidth = Math.max(1, Math.round(3 * z)) + 'px';
  editor.style.paddingTop = editor.style.paddingBottom = Math.round(padY * z) + 'px';
  editor.style.paddingLeft = editor.style.paddingRight = Math.round(padX * z) + 'px';
  editor.style.fontFamily = FONT;
}
editor.addEventListener('input', () => {
  if (!editing) return;
  const t = editTarget(editing.kind, editing.id);
  if (t){
    editSetValue(editing.kind, t, editor.value);
    if (editing.kind !== 'edge' && editing.kind !== 'group'){ reindex(); sizeAll(); }   // 变量值会影响插值后的文本
  }
  positionEditor();
  mark();
});
editor.addEventListener('keydown', (ev) => {
  ev.stopPropagation();
  if (ev.key === 'Enter' && !ev.shiftKey){ ev.preventDefault(); commitEdit(); }
  else if (ev.key === 'Escape'){ ev.preventDefault(); cancelEdit(); }
  else if (ev.key === 'Tab'){ ev.preventDefault(); commitEdit(); setTimeout(addChild, 0); }
});
editor.addEventListener('blur', () => { if (editing) commitEdit(); });
function commitEdit(){
  if (!editing) return;
  // 新建出来的空节点给个占位名，免得留下一个空框
  if (editing.kind === 'node'){
    const n = byId(editing.id);
    if (n && String(n.text).trim() === '') n.text = '新节点';
  }
  if (editing.kind === 'group'){
    const grp = byGroup(editing.id);
    if (grp && !String(grp.title).trim()) grp.title = '分组';
  }
  hideEditor();
  sizeAll();
  pushHist();
  mark();
}
function cancelEdit(){
  if (!editing) return;
  const t = editTarget(editing.kind, editing.id);
  if (t) editSetValue(editing.kind, t, editing.orig);
  hideEditor();
  sizeAll();
  mark();
}
