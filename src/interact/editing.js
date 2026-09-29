'use strict';
/* ==========================================================================
   GRAPHEON · interact/editing.js
   节点文本与连线标签的行内编辑（浮层 textarea）。
   ========================================================================== */

/* =========================================================================
   编辑文本
   ========================================================================= */
const editor = document.getElementById('editor');
function startEdit(kind, id, initial){
  const isEdge = kind === 'edge';
  const target = isEdge ? doc.edges.find(e => e.id === id) : byId(id);
  if (!target) return;
  editing = { kind, id, orig: isEdge ? (target.label || '') : target.text };
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
  const t = editing.kind === 'edge'
    ? edgeGeomFor(doc.edges.find(e => e.id === editing.id))
    : byId(editing.id);
  if (!t){ hideEditor(); return; }
  const z = view.z;
  let x, y, w, h, fs, lh;
  if (editing.kind === 'edge'){
    w = 160; h = 40; fs = 13; lh = 20;
    const m = (t && t.mid) ? t.mid : { x:0, y:0 };
    const s = w2s(m);
    x = s.x - (w * z) / 2; y = s.y - (h * z) / 2;
    editor.style.textAlign = 'center';
  } else {
    const n = t;
    fs = n.fs; lh = n.lh;
    const s = w2s({ x:n.x, y:n.y });
    w = n.w; h = n.h;
    x = s.x; y = s.y;
    editor.style.textAlign = 'center';
  }
  const bw = Math.max(1, Math.round(3 * z));
  editor.style.left   = Math.round(x) + 'px';
  editor.style.top    = Math.round(y) + 'px';
  editor.style.width  = Math.max(60, Math.round(w * z)) + 'px';
  editor.style.height = Math.max(28, Math.round(h * z)) + 'px';
  editor.style.fontSize   = (fs * z) + 'px';
  editor.style.lineHeight = (lh * z) + 'px';
  editor.style.borderWidth = bw + 'px';
  editor.style.paddingTop    = Math.round((editing.kind === 'edge' ? 4 : PADY) * z) + 'px';
  editor.style.paddingBottom = editor.style.paddingTop;
  editor.style.paddingLeft = editor.style.paddingRight = Math.round((editing.kind === 'edge' ? 6 : PADX) * z) + 'px';
  editor.style.fontFamily = FONT;
}
editor.addEventListener('input', () => {
  if (!editing) return;
  if (editing.kind === 'edge'){
    const e = doc.edges.find(x => x.id === editing.id);
    if (e){ e.label = editor.value.replace(/\n/g, ' ').trim(); }
  } else {
    const n = byId(editing.id);
    if (n){
      n.text = editor.value;
      sizeAll();
      if (doc.mode === 'mind' && doc.autoLayout) layoutMind();
    }
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
  const wasNew = editing.kind === 'node' && byId(editing.id) && String(byId(editing.id).text).trim() === '';
  if (wasNew){
    const n = byId(editing.id);
    n.text = '新节点';
  }
  hideEditor();
  sizeAll();
  if (doc.mode === 'mind' && doc.autoLayout) layoutMind();
  pushHist();
  mark();
}
function cancelEdit(){
  if (!editing) return;
  if (editing.kind === 'edge'){
    const e = doc.edges.find(x => x.id === editing.id);
    if (e) e.label = editing.orig;
  } else {
    const n = byId(editing.id);
    if (n) n.text = editing.orig;
  }
  hideEditor();
  sizeAll();
  if (doc.mode === 'mind' && doc.autoLayout) layoutMind();
  mark();
}

