'use strict';
/* ==========================================================================
   GRAPHEON · interact/pointer.js
   鼠标状态机：框选、平移、拖拽节点、端口拉线。
   ========================================================================== */

/* =========================================================================
   鼠标交互
   ========================================================================= */
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button === 2) return;
  hideCtx();
  closeHelp();
  skipDlg();
  const p = s2w(ev.clientX, ev.clientY);
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}

  if (ev.button === 1){ drag = { mode:'pan', sx:ev.clientX, sy:ev.clientY, vx:view.x, vy:view.y }; return; }

  const port = hitPort(p);
  if (port){
    drag = { mode:'link', from:port };
    linking = { node:port.node, side:port.side, to:p };
    mark();
    return;
  }
  const n = hitNode(p);
  if (n){
    if (ev.shiftKey && lastClickNode && lastClickNode !== n.id && byId(lastClickNode)){
      const a = lastClickNode, b = n.id;
      if (!doc.edges.some(e => e.s === a && e.t === b)){
        linkNodes(a, b); reindex(); relayout(); pushHist();
        say('* 已建立连线。');
      }
      lastClickNode = n.id;
      return;
    }
    if (ev.shiftKey || ev.ctrlKey){
      if (sel.has(n.id)) sel.delete(n.id); else sel.add(n.id);
    } else if (!sel.has(n.id)){
      selectOnly(n.id);
    }
    lastClickNode = n.id;
    const starts = [...sel].map(id => { const m = byId(id); return { id, x:m.x, y:m.y }; });
    drag = { mode:'node', p0:p, starts, moved:false };
    mark();
    return;
  }
  const e = hitEdge(p);
  if (e){
    hoverEdge = e;
    if (doc.mode === 'mind' && idx.parent.get(e.t) === e.s){ selectOnly(e.t); }
    else selectOnly(null);
    lastClickNode = null;
    mark();
    return;
  }
  // 空白
  selectOnly(null);
  lastClickNode = null;
  if (ev.shiftKey){ drag = { mode:'marquee' }; marquee = { a:p, b:p }; }
  else drag = { mode:'pan', sx:ev.clientX, sy:ev.clientY, vx:view.x, vy:view.y };
  mark();
});
window.addEventListener('pointermove', (ev) => {
  const p = s2w(ev.clientX, ev.clientY);
  if (drag){
    if (drag.mode === 'pan'){
      view.x = drag.vx + (ev.clientX - drag.sx);
      view.y = drag.vy + (ev.clientY - drag.sy);
      mark();
    } else if (drag.mode === 'node'){
      const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
      for (const s of drag.starts){ const n = byId(s.id); if (n){ n.x = s.x + dx; n.y = s.y + dy; } }
      mark();
    } else if (drag.mode === 'marquee'){
      marquee.b = p; mark();
    } else if (drag.mode === 'link'){
      linking.to = p;
      hover = hitNode(p);
      mark();
    }
    return;
  }
  hover = ev.target === canvas ? hitNode(p) : null;
  hoverEdge = null;
  hoverPort = hitPort(p);
  if (!hoverPort && hover){
    const e = hitEdge(p);
    if (e && !doc.nodes.some(n => n === hover)) hoverEdge = e;
  }
  mark();
});
window.addEventListener('pointerup', (ev) => {
  if (!drag) return;
  const p = s2w(ev.clientX, ev.clientY);
  if (drag.mode === 'node' && drag.moved){
    if (doc.mode === 'mind' && doc.autoLayout){
      doc.autoLayout = false;
      say('* 自动布局已关闭，你可以自由摆放了。按「整理」或 Ctrl+L 恢复自动排版。');
    }
    pushHist();
  } else if (drag.mode === 'marquee' && marquee){
    const a = marquee.a, b = marquee.b;
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    sel.clear();
    for (const n of doc.nodes){
      if (n.x + n.w > x1 && n.x < x2 && n.y + n.h > y1 && n.y < y2) sel.add(n.id);
    }
    if (sel.size) say('* 选中了 ' + sel.size + ' 个节点。');
  } else if (drag.mode === 'link'){
    const t = hitNode(p);
    if (t && t.id !== drag.from.node){
      linkNodes(drag.from.node, t.id);
      reindex(); sizeAll();
      if (doc.mode === 'mind' && doc.autoLayout) layoutMind();
      pushHist();
      say(doc.mode === 'mind' ? '* 已连接，思维导图已重新排版。' : '* 已连接。');
    }
  }
  drag = null; marquee = null; linking = null; mark();
});
canvas.addEventListener('dblclick', (ev) => {
  const p = s2w(ev.clientX, ev.clientY);
  const n = hitNode(p);
  if (n){ selectOnly(n.id); startEdit('node', n.id); return; }
  const e = hitEdge(p);
  if (e){ startEdit('edge', e.id); return; }
  const nn = addNodeAt('新节点', p.x - 70, p.y - 24, 'rect');
  reindex(); relayout();
  sel.clear(); sel.add(nn.id);
  pushHist(); mark();
  startEdit('node', nn.id, '');
  say('* 创建了一个自由节点。');
});
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const f = Math.pow(1.0016, -ev.deltaY * (ev.deltaMode === 1 ? 18 : 1));
  zoomAt(ev.clientX, ev.clientY, f);
}, { passive:false });
canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const p = s2w(ev.clientX, ev.clientY);
  const n = hitNode(p);
  const e = n ? null : hitEdge(p);
  if (n) selectOnly(n.id);
  else if (e) hoverEdge = e, selectOnly(null);
  else selectOnly(null);
  showCtx(ev.clientX, ev.clientY, n, e);
  mark();
});
window.addEventListener('blur', () => { drag = null; marquee = null; linking = null; mark(); });
