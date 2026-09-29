'use strict';
/* ==========================================================================
   GRAPHEON · interact/pointer.js
   鼠标状态机：框选、平移、拖拽节点、端口拉新线、拖端点改接。
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

  // 选中连线的端点手柄优先：它就压在节点边框上，不先判会被 hitNode 抢走
  const handle = hitEdgeHandle(p);
  if (handle){
    const otherId = handle.end === 's' ? handle.edge.t : handle.edge.s;
    drag = { mode:'relink', edgeId:handle.edge.id, end:handle.end, otherId, moved:false };
    relink = { edgeId:handle.edge.id, end:handle.end, to:p, target:null };
    mark();
    return;
  }
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
        linkNodes(a, b); reindex(); pushHist();
        say('* 已建立连线。');
      }
      lastClickNode = n.id;
      return;
    }
    if (ev.shiftKey || ev.ctrlKey){
      if (sel.has(n.id)) sel.delete(n.id); else sel.add(n.id);
      selEdgeId = null;
    } else if (!sel.has(n.id) || selEdgeId){
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
    selectEdge(e.id);            // 单独选中连线，节点选择被清掉
    hoverEdge = null;
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
    } else if (drag.mode === 'relink'){
      const t = hitNode(p);
      relink.to = p;
      relink.target = (t && t.id !== drag.otherId) ? t : null;   // 不许接到自己另一端造成自环
      drag.moved = true;
      mark();
    }
    return;
  }
  hover = ev.target === canvas ? hitNode(p) : null;
  hoverEdge = null;
  hoverPort = hitPort(p);
  if (!hoverPort && !hover && ev.target === canvas) hoverEdge = hitEdge(p);
  mark();
});
window.addEventListener('pointerup', (ev) => {
  if (!drag) return;
  const p = s2w(ev.clientX, ev.clientY);
  if (drag.mode === 'node' && drag.moved){
    pushHist();
  } else if (drag.mode === 'marquee' && marquee){
    const a = marquee.a, b = marquee.b;
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    sel.clear(); selEdgeId = null;
    for (const n of doc.nodes){
      if (n.x + n.w > x1 && n.x < x2 && n.y + n.h > y1 && n.y < y2) sel.add(n.id);
    }
    if (sel.size) say('* 选中了 ' + sel.size + ' 个节点。');
  } else if (drag.mode === 'link'){
    const t = hitNode(p);
    if (t && t.id !== drag.from.node){
      linkNodes(drag.from.node, t.id);
      reindex(); sizeAll();
      pushHist();
      say('* 已连接。');
    }
  } else if (drag.mode === 'relink'){
    const e = doc.edges.find(x => x.id === drag.edgeId);
    const t = hitNode(p);
    if (e && t && t.id !== drag.otherId){
      const ns = drag.end === 's' ? t.id : e.s;
      const nt = drag.end === 't' ? t.id : e.t;
      if (doc.edges.some(x => x !== e && x.s === ns && x.t === nt)){
        say('* 这两个节点之间已经有一条连线了。');
      } else {
        e.s = ns; e.t = nt;
        reindex(); sizeAll(); pushHist();
        say('* 已把连线改接到「' + (t.text || '未命名') + '」。');
      }
    } else if (e && drag.moved){
      say('* 已取消改接，连线回到原位。');
    }
    if (e) selEdgeId = e.id;
  }
  drag = null; marquee = null; linking = null; relink = null; mark();
});
canvas.addEventListener('dblclick', (ev) => {
  const p = s2w(ev.clientX, ev.clientY);
  const n = hitNode(p);
  if (n){ selectOnly(n.id); startEdit('node', n.id); return; }
  const e = hitEdge(p);
  if (e){ selectEdge(e.id); startEdit('edge', e.id); return; }
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
  else if (e) selectEdge(e.id);
  else selectOnly(null);
  showCtx(ev.clientX, ev.clientY, n, e);
  mark();
});
window.addEventListener('blur', () => {
  drag = null; marquee = null; linking = null; relink = null; mark();
});
