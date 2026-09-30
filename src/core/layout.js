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
  // 排版是「全局重排」，成员都被摆到别处去了，框必须跟着重排 —— 重新贴合到成员。
  // （拖拽时的规矩是「只长不缩」，那是局部操作；这里是显式的整体重排，所以允许收缩。）
  refitAllGroups();
  fitIfNeeded();
  mark();
}


/* =========================================================================
   防止节点重叠
   -------------------------------------------------------------------------
   默认开启：拖完一个节点，压到别人身上就把别人弹开（被拖的那个跟手，不让路）。
   关掉之后随便叠。设置存在 localStorage 里。

   ⚠ 只在**交互路径**（拖拽结束、缩放结束、手动弹开）里调用，不挂在 addNodeAt 上：
     程序化铺文档时需要能精确指定坐标，自动弹开会把布局搞乱。
   ========================================================================= */
const OVERLAP_GAP = 16;          // 弹开之后留的缝
const OVERLAP_MAX_PASS = 16;     // 迭代上限，防止两个节点来回推
const OVERLAP_KEY = 'grapheon.overlap.v1';
let overlapGuard = true;

function loadOverlapPref(){
  try { if (localStorage.getItem(OVERLAP_KEY) === '0') overlapGuard = false; } catch(e){}
}
function setOverlapGuard(on){
  overlapGuard = !!on;
  try { localStorage.setItem(OVERLAP_KEY, overlapGuard ? '1' : '0'); } catch(e){}
  mark();
  say(overlapGuard
    ? '* 已开启「防止节点重叠」：拖过去的节点会把别人弹开。'
    : '* 已关闭「防止节点重叠」：现在可以随便叠了。');
}
const overlapOn = () => overlapGuard;

const rectsHit = (a, b, g) => a.x < b.x + b.w + g && b.x < a.x + a.w + g
                            && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
/* 把 b 推离 a：沿重叠更小的那个轴推，位移最小 */
function pushApart(a, b, gap){
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (ox <= 0 || oy <= 0) return null;
  if (ox <= oy){
    const dir = (b.x + b.w / 2 >= a.x + a.w / 2) ? 1 : -1;
    return { x:dir * (ox + gap), y:0 };
  }
  const dir = (b.y + b.h / 2 >= a.y + a.h / 2) ? 1 : -1;
  return { x:0, y:dir * (oy + gap) };
}
/* 把压在一起的节点弹开。
   seeds = 用户刚动过的节点，它们不让路（这样拖起来跟手）。
   返回被迫移动过的节点 id 集合。 */
function resolveOverlaps(seeds, force){
  const pushed = new Set();
  if (!overlapGuard && !force) return pushed;
  const list = doc.nodes.filter(n => !isHidden(n.id));
  if (list.length < 2) return pushed;
  // 自己维护一份几何：nodeBox 有缓存，边动边读会读到旧的
  const box = new Map(list.map(n => {
    const b = nodeBox(n);
    return [n.id, { x:b.x, y:b.y, w:b.w, h:b.h }];
  }));
  const actor = new Set(seeds || []);
  for (let pass = 0; pass < OVERLAP_MAX_PASS; pass++){
    let hit = false;
    for (let i = 0; i < list.length; i++){
      for (let j = i + 1; j < list.length; j++){
        const A = list[i], B = list[j];
        const ra = box.get(A.id), rb = box.get(B.id);
        if (!rectsHit(ra, rb, OVERLAP_GAP)) continue;
        // 谁让路：被拖的那个不让
        const victim = (actor.has(A.id) && !actor.has(B.id)) ? B : A;
        const other  = victim === A ? B : A;
        const d = pushApart(box.get(other.id), box.get(victim.id), OVERLAP_GAP);
        if (!d) continue;
        victim.x += d.x; victim.y += d.y;
        const vb = box.get(victim.id);
        vb.x += d.x; vb.y += d.y;
        actor.add(victim.id);
        pushed.add(victim.id);
        hit = true;
      }
    }
    if (!hit) break;
  }
  if (pushed.size){ reindex(); sizeAll(); }
  return pushed;
}
