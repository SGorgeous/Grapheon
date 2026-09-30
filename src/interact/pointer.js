'use strict';
/* ==========================================================================
   GRAPHEON · interact/pointer.js
   鼠标状态机：框选、平移、拖拽节点、缩放节点、端口拉新线、拖端点改接、拉拐点。

   pointerdown 的判定顺序很讲究（手柄都压在别的东西上，先判谁有讲究）：
     连线端点手柄 → 拐点手柄 → 缩放柄 → 折叠标记 → 连接端口 → 节点 → 连线 → 空白
   ========================================================================== */

/* =========================================================================
   鼠标交互
   ========================================================================= */
const BEND_THRESHOLD = 6;      // 超过这么多世界单位才算「拉出拐点」，避免误点

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button === 2) return;
  hideCtx();
  closeHelp();
  skipDlg();
  const p = s2w(ev.clientX, ev.clientY);
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}

  if (ev.button === 1){ drag = { mode:'pan', sx:ev.clientX, sy:ev.clientY, vx:view.x, vy:view.y }; return; }

  // 选中连线的端点手柄：它正好压在节点边框上，不先判会被 hitNode 抢走
  const handle = hitEdgeHandle(p);
  if (handle){
    const otherId = handle.end === 's' ? handle.edge.t : handle.edge.s;
    drag = { mode:'relink', edgeId:handle.edge.id, end:handle.end, otherId, moved:false };
    relink = { edgeId:handle.edge.id, end:handle.end, to:p, target:null };
    mark();
    return;
  }
  // 拐点手柄
  const wp = hitWaypoint(p);
  if (wp){
    drag = { mode:'bend', edgeId:wp.edgeId, index:wp.index, p0:p, moved:false };
    mark();
    return;
  }
  // 缩放柄（节点 / 分组共用；返回的盒子带 isGroup 区分）
  const rz = hitResizeHandle(p);
  if (rz){
    if (rz.isGroup) selectGroup(rz.id); else selectOnly(rz.id);
    drag = { mode:'resize', targetId:rz.id, isGroup:!!rz.isGroup,
             startW:rz.w, startH:rz.h, moved:false };
    mark();
    return;
  }
  // 折叠标记 = 展开按钮（节点和分组共用）
  const cb = hitCollapseBadge(p);
  if (cb){
    if (byGroup(cb.id)) toggleGroupCollapse(cb); else toggleCollapseOf(cb);
    return;
  }
  // 分组标题栏：选中（Shift 加选）整组并开始搬动所有选中的东西
  const gt = hitGroupTitle(p);
  if (gt){
    if (ev.shiftKey) toggleGroupSel(gt.id);
    else if (!selGroups.has(gt.id)) selectGroup(gt.id);
    lastClickNode = null;
    drag = { mode:'group', grpId:gt.id, p0:p, snap:selectionSnapshot(), moved:false };
    mark();
    return;
  }
  // 端点把手（标签那一块）：按住它可以拖端点换边。
  // 圆点不归这里管 —— 那是「拉线」的起点，不能抢。
  const ph = (typeof portHandleAt === 'function') ? portHandleAt(p, null) : null;
  if (ph){
    drag = { mode:'port', node:ph.node, dir:ph.dir, portId:ph.port.id, moved:false };
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
  // 变量节点上的勾选 / 滑条 / 开关：先吃掉这次按下，别启动拖动
  if (n && !isHidden(n.id) && n.kind === 'var'){
    const ctl = hitVarControl(n, p);
    if (ctl){
      selectOnly(n.id);
      if (ctl.kind === 'check'){ toggleCheckOption(n, ctl.index); pushHist(); return; }
      if (ctl.kind === 'switch'){ toggleSwitch(n); pushHist(); return; }
      if (ctl.kind === 'slider'){
        drag = { mode:'slider', targetId:n.id, moved:false };
        setSliderFromPointer(n, p);
        mark();
        return;
      }
    }
  }
  if (n){
    if (ev.shiftKey && lastClickNode && lastClickNode !== n.id && byId(lastClickNode)){
      const a = lastClickNode, b = n.id;
      if (!doc.edges.some(e => e.s === a && e.t === b)){
        linkNodes(a, b, dragPortId, null); reindex(); pushHist();
        say('* 已建立连线。');
      }
      lastClickNode = n.id;
      return;
    }
    if (ev.shiftKey || ev.ctrlKey){
      if (sel.has(n.id)) sel.delete(n.id); else sel.add(n.id);
      selEdgeId = null;
    } else if (!sel.has(n.id) || selEdgeId || selGroups.size){
      // 按住已选中的节点拖动时保留整个选择（含选中的分组），点没选中的才重置
      selectOnly(n.id);
    }
    lastClickNode = n.id;
    drag = { mode:'node', p0:p, snap:selectionSnapshot(), moved:false };
    mark();
    return;
  }
  // 分组边框（框内部已经让给成员节点了）
  const gb = hitGroupBorder(p);
  if (gb){
    if (ev.shiftKey) toggleGroupSel(gb.id);
    else if (!selGroups.has(gb.id)) selectGroup(gb.id);
    lastClickNode = null;
    drag = { mode:'group', grpId:gb.id, p0:p, snap:selectionSnapshot(), moved:false };
    mark();
    return;
  }
  const e = hitEdge(p);
  if (e){
    if (selEdgeId === e.id){
      // 已经选中了：拖线身 = 拉出一个新的拐点（超过阈值才真的建）
      drag = { mode:'bend', edgeId:e.id, index:-1, p0:p, moved:false };
      mark();
      return;
    }
    selectEdge(e.id);
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
    } else if (drag.mode === 'slider'){
      const sn = byId(drag.targetId);
      if (sn && setSliderFromPointer(sn, p) != null) drag.moved = true;
      mark();
    } else if (drag.mode === 'node' || drag.mode === 'group'){
      // 节点和分组走同一套：快照 + 位移，整个选择（节点 + 分组，分组递归带后代）一起走
      const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;
      applyGroupDelta(drag.snap, dx, dy);
      mark();
    } else if (drag.mode === 'resize'){
      if (drag.isGroup){
        const grp = byGroup(drag.targetId);
        if (grp){ const gb = groupBox(grp); setGroupSize(grp, p.x - gb.x, p.y - gb.y); drag.moved = true; }
      } else {
        const n = byId(drag.targetId);
        // 手柄画在「有效位置」上（程序化节点可能挪过它），所以量尺寸也要用有效位置
        if (n){ const eb = nodeBox(n); setNodeSize(n, p.x - eb.x, p.y - eb.y); drag.moved = true; }
      }
      mark();
    } else if (drag.mode === 'marquee'){
      marquee.b = p; mark();
    } else if (drag.mode === 'port'){
      // 拖着端点走：往哪条边靠就挂到哪条边，沿边滑动改位置
      movePort(drag.node, drag.dir, drag.portId, p);
      drag.moved = true;
    } else if (drag.mode === 'link'){
      linking.to = p;
      hover = linkTargetAt(p);
      mark();
    } else if (drag.mode === 'relink'){
      const t = linkTargetAt(p);
      relink.to = p;
      relink.target = (t && t.id !== drag.otherId) ? t : null;   // 不许接到自己另一端造成自环
      drag.moved = true;
      mark();
    } else if (drag.mode === 'bend'){
      const e = doc.edges.find(x => x.id === drag.edgeId);
      if (e){
        if (drag.index < 0){
          if (Math.hypot(p.x - drag.p0.x, p.y - drag.p0.y) < BEND_THRESHOLD / view.z) return;
          drag.index = addWaypoint(e, p.x, p.y);       // 第一次超过阈值才真的建拐点
        } else {
          moveWaypoint(e, drag.index, p.x, p.y);
        }
        drag.moved = true;
        mark();
      }
    }
    return;
  }
  hover = ev.target === canvas ? hitNode(p) : null;
  hoverEdge = null;
  hoverGrp = ev.target === canvas ? hitGroupTitle(p) : null;   // 悬停分组标题时把折叠角标显出来
  hoverPort = hitPort(p);
  if (!hoverPort && !hover && ev.target === canvas) hoverEdge = hitEdge(p);
  mark();
});

window.addEventListener('pointerup', (ev) => {
  if (!drag) return;
  const p = s2w(ev.clientX, ev.clientY);
  if ((drag.mode === 'node' || drag.mode === 'group') && drag.moved){
    // 顺序要紧：先按中心位置同步成员关系（拖出去的就不算成员了），
    // 再让框长大到装得下剩下的成员。反过来的话，刚被移出的节点会把框撑大。
    if (settleGroups(drag.snap.map(s => s.id))) say('* 分组成员 / 外框尺寸已按位置更新。');
    // 防重叠：被拖的那批不让路，把压到的别人弹开。弹完再同步一次成员关系。
    const pushed = resolveOverlaps(drag.snap.map(s => s.id));
    if (pushed.size){
      settleGroups([...pushed]);
      say('* ' + pushed.size + ' 个节点被弹开了（右键可以关掉「防止节点重叠」）。');
    }
    pushHist();
  } else if (drag.mode === 'port'){
    // 方块这个把手管两件事：
    //   丢到**别的节点**上 → 连线（省得再去找那个小圆点）
    //   丢在别处          → 把这个端点挪到那儿（换边 / 沿边挪位置）
    const ownerId = drag.node.id;
    const tgt = (typeof linkTargetAt === 'function') ? linkTargetAt(p) : null;
    if (tgt && tgt.id !== ownerId && !isEmbed(byId(ownerId))){
      drag = null; mark();
      const e = linkNodes(ownerId, tgt.id);
      if (e){ reindex(); pushHist(); }
      return;
    }
    if (drag.moved){
      const p2 = portById(drag.node, drag.portId);
      pushHist();
      reindex(); sizeAll();
      say('* 端点 #' + drag.portId + ' 挪到了'
        + ({ t:'上边', b:'下边', l:'左边', r:'右边' })[p2 ? p2.side : 'r']
        + '。双击它可以改 ID 和标签；把它拖到别的节点上就是连线。');
    }
    drag = null;
    mark();
    return;
  } else if (drag.mode === 'slider'){
    const sn = byId(drag.targetId);
    if (sn) say('* 「' + normalizeVarDef(sn.varDef).name + '」= ' + controlValue(sn.varDef) + '。');
    if (drag.moved) pushHist();
    drag = null;
    mark();
    return;
  } else if (drag.mode === 'resize' && drag.moved){
    if (drag.isGroup){
      const grp = byGroup(drag.targetId);
      if (grp) say('* 分组框改成 ' + grp.w + ' × ' + grp.h + '。往框里拖节点就会自动收纳。');
    } else {
      const n = byId(drag.targetId);
      resolveOverlaps([drag.targetId]);          // 变大之后可能压到别人
      settleGroups([drag.targetId]);             // 也可能顶出分组框
      if (n) say('* 尺寸改为 ' + n.w + ' × ' + n.h + '。右键节点可以恢复自适应。');
    }
    pushHist();
  } else if (drag.mode === 'bend' && drag.moved){
    const e = doc.edges.find(x => x.id === drag.edgeId);
    if (e && drag.index >= 0 && pruneWaypoint(e, drag.index)){
      say('* 拐点已拉直，自动收掉了。');
    } else {
      say('* 已调整拐点。把线拉直会自动收掉，右键可清除全部拐点。');
    }
    pushHist();
  } else if (drag.mode === 'marquee' && marquee){
    const a = marquee.a, b = marquee.b;
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    sel.clear(); selGroups.clear(); selEdgeId = null;
    for (const n of doc.nodes){
      if (isHidden(n.id)) continue;
      const b = nodeBox(n);
      if (b.x + b.w > x1 && b.x < x2 && b.y + b.h > y1 && b.y < y2) sel.add(n.id);
    }
    // 整个框都被框住的分组，也算选中
    for (const grp of (doc.groups || [])){
      if (isHidden(grp.id)) continue;
      const r = groupBox(grp);
      if (r.x >= x1 && r.x + r.w <= x2 && r.y >= y1 && r.y + r.h <= y2) selGroups.add(grp.id);
    }
    if (sel.size || selGroups.size) say('* 选中了 ' + sel.size + ' 个节点' +
      (selGroups.size ? '、' + selGroups.size + ' 个分组' : '') + '。');
  } else if (drag.mode === 'link'){
    const t = linkTargetAt(p);
    if (t && t.id !== drag.from.node){
      linkNodes(drag.from.node, t.id, drag.from.portId, null);
      reindex(); sizeAll();
      pushHist();
      say('* 已连接。');
    }
  } else if (drag.mode === 'relink'){
    const e = doc.edges.find(x => x.id === drag.edgeId);
    const t = linkTargetAt(p);
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
  // ⚠ 分组上的双击必须在这里**让开**：下面 click 那条线（detail === 2）
  //   已经把组内节点选好了，这里再往下走就会**顺手新建一个节点** ——
  //   那正是「双击分组之后冒出一个新节点」的原因。
  // 给分组改名挪到右键菜单和 F2 了。
  if (groupGestureTarget(p, true)) return;
  // 双击拐点 = 删掉它
  const wp = hitWaypoint(p);
  if (wp){
    const e = doc.edges.find(x => x.id === wp.edgeId);
    if (e){ removeWaypoint(e, wp.index); pushHist(); say('* 拐点已删除。'); }
    return;
  }
  const n = hitNode(p);
  if (n){
    selectOnly(n.id);
    if (isEmbed(n)){ enterEmbed(n); return; }        // 双击嵌入节点 = 进去编辑
    // 双击端点 = 改 ID / 标签（一个小框两样都管）
    if (typeof portHitAt === 'function'){
      const ph = portHitAt(p, n);
      if (ph){ selectOnly(n.id); openPortEditor(n, ph.dir, ph.port.id); return; }
    }
    // 表格节点：双击哪个格子就编辑哪个格子
    if (isTableNode(n)){
      const cell = tableCellAt(n, p);
      if (cell){ startEdit('cell', n.id, null, { row:cell.r, col:cell.c }); return; }
    }
    // 变量 / 运算节点：双击哪个小框就编辑哪个字段
    const vp = hitVarPart(n, p);
    if (vp === 'varName' || vp === 'varValue'){ startEdit(vp, n.id); return; }
    const op = hitOpPart(n, p);
    if (op === 'opOp'){ cycleOpOperator(n); return; }
    if (op && /^opVal[0-9]*$/.test(op)){ startEdit(op, n.id); return; }
    const op2 = hitOutPart(n, p);
    if (op2 === 'outName'){ startEdit('outName', n.id); return; }
    // 图片节点分三块：点描述改描述，点名称带/图片改名称
    const part = hitImagePart(n, p);
    startEdit(part === 'desc' ? 'nodeDesc' : 'node', n.id);
    return;
  }
  const e = hitEdge(p);
  if (e){ selectEdge(e.id); startEdit('edge', e.id); return; }
  const nn = addNodeAt('新节点', p.x - 70, p.y - 24, 'rect');
  reindex(); relayout();
  settleGroups([nn.id]);                 // 落在框里就收纳，框跟着长大
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
  const wp = hitWaypoint(p);
  const gt = wp ? null : hitGroup(p);
  const n = (wp || gt) ? null : hitNode(p);
  const e = (wp || gt || n) ? null : hitEdge(p);
  if (wp) selEdgeId = wp.edgeId;
  else if (gt) selectGroup(gt.id);
  else if (n) selectOnly(n.id);
  else if (e) selectEdge(e.id);
  else selectOnly(null);
  showCtx(ev.clientX, ev.clientY, n, wp ? doc.edges.find(x => x.id === wp.edgeId) : e,
    { p, waypoint:wp, group:gt });
  mark();
});

window.addEventListener('blur', () => {
  drag = null; marquee = null; linking = null; relink = null; mark();
});

/* =========================================================================
   分组上的连击：双击 = 选中组内所有节点，三击 = 选中外框
   -------------------------------------------------------------------------
   为什么用 click + ev.detail 而不是 dblclick：dblclick 只管「第二下」，
   数不到第三下。click 的 detail 就是连击次数，2 和 3 都拿得到。

   命中范围是**整个分组**（标题栏 / 外框边 / 框内部），具体判断在
   hit.js 的 groupGestureTarget 里 —— 光认标题和边的话，
   用户点在框里就会掉进「新建节点」，那正是之前的 bug。
   ========================================================================= */
canvas.addEventListener('click', (ev) => {
  const p = s2w(ev.clientX, ev.clientY);
  const gt = groupGestureTarget(p, true);
  if (!gt) return;
  if (ev.detail === 2){ selectGroupNodes(gt); return; }
  if (ev.detail >= 3){ selectGroup(gt.id); say('* 选中了分组外框「' + (gt.title || '未命名') + '」。'); return; }
});
