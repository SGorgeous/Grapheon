'use strict';
/* ==========================================================================
   GRAPHEON · core/layout.js
   思维导图：以根为中心、子树按高度贪心平衡分到左右两侧。
   ========================================================================== */

/* =========================================================================
   布局
   ========================================================================= */
function layoutMind(){
  const roots = doc.nodes.filter(n => !idx.parent.has(n.id));
  if (!roots.length) return;
  const comps = roots.map(r => ({ root:r, ids:[r.id, ...descendants(r.id)] }));
  comps.sort((a, b) => b.ids.length - a.ids.length);

  let y = 0;
  for (const comp of comps){
    layoutComponent(comp.root);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const id of comp.ids){
      const n = byId(id);
      minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x + n.w);
      minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y + n.h);
    }
    const dx = -(minX + maxX) / 2;
    const dy = y - minY;
    for (const id of comp.ids){ const n = byId(id); n.x += dx; n.y += dy; }
    y += (maxY - minY) + ROOT_VGAP;
  }
}
function subH(id, cache){
  if (cache.has(id)) return cache.get(id);
  const n = byId(id);
  const ks = n.collapsed ? [] : (idx.children.get(id) || []);
  if (!ks.length) { cache.set(id, n.h); return n.h; }
  let total = 0;
  ks.forEach((c, i) => { total += subH(c, cache) + (i ? VGAP : 0); });
  const v = Math.max(n.h, total);
  cache.set(id, v);
  return v;
}
function layoutComponent(root){
  root.x = -root.w / 2;
  root.y = 0;
  const cache = new Map();
  const ks = root.collapsed ? [] : (idx.children.get(root.id) || []);

  const sized = ks.map(k => ({ id:k, s: subH(k, cache) }));
  sized.sort((a, b) => b.s - a.s);
  const L = [], R = []; let ls = 0, rs = 0;
  for (const it of sized){ if (ls <= rs){ L.push(it); ls += it.s; } else { R.push(it); rs += it.s; } }

  placeSide(R, +1, root.x + root.w + HGAP, cache);
  placeSide(L, -1, root.x - HGAP, cache);
  root.y = -root.h / 2;
}
function placeSide(list, dir, edgeX, cache){
  if (!list.length) return;
  let total = 0;
  list.forEach((it, i) => { total += it.s + (i ? VGAP : 0); });
  let y = -total / 2;
  for (const it of list){
    placeSub(it.id, dir, edgeX, y, cache);
    y += it.s + VGAP;
  }
}
function placeSub(id, dir, edgeX, yTop, cache){
  const n = byId(id);
  const h = subH(id, cache);
  n.x = dir > 0 ? edgeX : edgeX - n.w;
  const ks = n.collapsed ? [] : (idx.children.get(id) || []);
  if (!ks.length){ n.y = yTop + (h - n.h) / 2; return; }
  let total = 0;
  ks.forEach((c, i) => { total += subH(c, cache) + (i ? VGAP : 0); });
  let cy = yTop + (h - total) / 2;
  const centers = [];
  for (const c of ks){
    const cn = byId(c);
    const nextX = dir > 0 ? (n.x + n.w + HGAP) : (n.x - HGAP);
    placeSub(c, dir, nextX, cy, cache);
    centers.push(cn.y + cn.h / 2);
    cy += subH(c, cache) + VGAP;
  }
  n.y = (centers[0] + centers[centers.length - 1]) / 2 - n.h / 2;
}
/* 内容变了之后重算尺寸（不再有「实时自动排版」这回事） */
function relayout(){
  sizeAll();
  mark();
}
/* 「排版」按钮 / Ctrl+L：按树形把节点摆一次。这是一次性操作，不会一直管着你的手动位置。 */
function tidyLayout(){
  sizeAll();
  layoutMind();
  fitIfNeeded();
  mark();
}

