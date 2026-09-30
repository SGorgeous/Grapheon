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
  return byId(id) || null;
}
const editValue = (kind, t) => (kind === 'edge') ? (t.label || '') : (kind === 'group' ? (t.title || '') : t.text);
function editSetValue(kind, t, v){
  if (kind === 'edge') t.label = String(v).replace(/\n/g, ' ').trim();
  else if (kind === 'group') t.title = String(v).replace(/\n/g, ' ');
  else t.text = v;
}

function startEdit(kind, id, initial){
  const target = editTarget(kind, id);
  if (!target) return;
  editing = { kind, id, orig: editValue(kind, target) };
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
    if (editing.kind === 'node') sizeAll();
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
