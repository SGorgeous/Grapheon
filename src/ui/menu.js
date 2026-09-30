'use strict';
/* ==========================================================================
   GRAPHEON · ui/menu.js
   通用弹出菜单，支持多级子菜单。右键菜单和顶栏「新建」菜单共用。

   items 里每一项是：
     'hr'                          分隔线
     [标签, 快捷键提示, 回调]       普通项
     [标签, 提示, null, 子项数组]   带子菜单，鼠标移上去往右展开

   菜单项太多会看不清，所以按功能收进子菜单；子菜单里的当前值前面有 ●。
   ========================================================================== */

const ctxEl = document.getElementById('ctx');
let menuStack = [];        // [0] 是 ctxEl，之后是各级子菜单

function closeMenusBelow(depth){
  while (menuStack.length > depth){
    const m = menuStack.pop();
    if (m !== ctxEl) m.remove();
  }
}
function hideCtx(){
  closeMenusBelow(0);
  ctxEl.style.display = 'none';
  ctxEl.innerHTML = '';
  ctxEl.classList.remove('menu');
}
/* 把菜单夹进视口 */
function placeMenu(elm, x, y){
  const w = elm.offsetWidth, h = elm.offsetHeight;
  elm.style.left = Math.max(8, Math.min(x, innerWidth  - w - 8)) + 'px';
  elm.style.top  = Math.max(8, Math.min(y, innerHeight - h - 8)) + 'px';
}
/* 子菜单：优先贴在这一项的右侧展开；右边放不下就翻到左边 */
function placeSubMenu(elm, anchorEl){
  const sw = elm.offsetWidth, sh = elm.offsetHeight;
  const r = anchorEl.getBoundingClientRect();
  const left = (r.right - 4 + sw <= innerWidth - 8) ? (r.right - 4) : (r.left - sw + 4);
  elm.style.left = Math.max(8, Math.min(left, innerWidth - sw - 8)) + 'px';
  elm.style.top  = Math.max(8, Math.min(r.top - 6, innerHeight - sh - 8)) + 'px';
}

function showMenu(x, y, items, depth, anchorEl){
  depth = depth || 0;
  closeMenusBelow(depth);
  const root = depth === 0 ? ctxEl : el('div', 'ud menu');
  root.innerHTML = '';
  root.classList.add('menu');

  for (const it of items){
    if (!it || it === 'hr'){ root.appendChild(el('div', 'hr')); continue; }
    const [label, hint, fn, subs] = it;
    const d = el('div', 'item' + (subs ? ' sub' : '') + (!fn && !subs ? ' off' : ''));
    d.appendChild(el('span', 'lb', label));
    // 有子菜单的也要显示灰字说明 —— 以前直接跳过 hint 只给个 ▶，
    // 结果「节点」「程序节点」这两项光秃秃的。
    if (hint) d.appendChild(el('span', 'k', hint));
    if (subs) d.appendChild(el('span', 'k', '▶'));

    if (subs){
      d.onmouseenter = () => {
        for (const s of root.querySelectorAll('.item.sel')) s.classList.remove('sel');
        d.classList.add('sel');
        showMenu(0, 0, subs, depth + 1, d);
      };
    } else {
      // 移到没有子菜单的项上时，收起更深的那几级
      d.onmouseenter = () => {
        closeMenusBelow(depth + 1);
        for (const s of root.querySelectorAll('.item.sel')) s.classList.remove('sel');
      };
      if (fn) d.onclick = () => { hideCtx(); fn(); };
    }
    root.appendChild(d);
  }

  if (!root.children.length){ if (depth === 0) ctxEl.style.display = 'none'; return null; }

  if (depth === 0){
    ctxEl.style.display = 'block';
    placeMenu(ctxEl, x, y);
    menuStack = [ctxEl];
  } else {
    document.body.appendChild(root);
    root.style.visibility = 'hidden';
    root.style.display = 'block';
    placeSubMenu(root, anchorEl);
    root.style.visibility = 'visible';
    menuStack.push(root);
  }
  return root;
}

/* ---------------- 子菜单小工具 ---------------- */
/* 单选型子菜单：当前值前面画 ●，点一下直接切过去（比「点一次循环一个」好找得多） */
function radioSub(list, cur, onPick){
  return list.map(([val, label]) => [
    (String(cur) === String(val) ? '● ' : '   ') + label, '', () => onPick(val)
  ]);
}
function colorSub(cur, onPick){
  const out = [[(cur == null ? '● ' : '   ') + '默认（跟随主题）', '', () => onPick(null)]];
  for (const [color, label] of NODE_COLORS){
    out.push([(cur === color ? '● ' : '   ') + label, '', () => onPick(color)]);
  }
  return out;
}

/* ---------------- 画布右键菜单 ---------------- */
/* 节点和分组共用的一小段菜单：重命名 / 端点吸附。
   「复用节点的右键菜单代码」就落在这里 —— 两边都调它，行为天然一致。 */
function pushCommonItems(items, target, kind, renameHint){
  items.push(['重命名', renameHint, () => startEdit(kind, target.id)]);
  if (doc.edges.some(e => e.s === target.id || e.t === target.id)){
    items.push(['连线端点吸附…', '', () => openEndBox(target)]);
  }
}

function showCtx(x, y, n, e, info){
  info = info || {};
  const items = [];
  if (n){
    items.push(['添加子节点', 'Tab', () => addChild()]);
    items.push(['添加兄弟节点', 'Enter', () => addSibling()]);
    pushCommonItems(items, n, 'node', 'F2');
    // 选了多个才给对齐相关的项（一个东西没法对齐）
    if (sel.size + selGroups.size >= 2){
      items.push(['对齐与分布', '▶', null, [
        ['左对齐',      '', () => alignSelection('h-left')],
        ['水平居中',    '', () => alignSelection('h-center')],
        ['右对齐',      '', () => alignSelection('h-right')],
        'hr',
        ['顶对齐',      '', () => alignSelection('v-top')],
        ['垂直居中',    '', () => alignSelection('v-center')],
        ['底对齐',      '', () => alignSelection('v-bottom')],
        'hr',
        ['横向等距分布', '至少三个', () => distributeSelection('x')],
        ['竖向等距分布', '至少三个', () => distributeSelection('y')]
      ]]);
    }
    // 端点：加 / 删 / 改 id / 改标签 / 恢复默认
    if (!isEmbed(n)){
      const PL = portList(n);
      const dirLabel = (d) => d === 'ins' ? '输入' : '输出';
      const portItems = [];
      for (const dir of ['ins', 'outs']){
        const list = PL[dir];
        portItems.push([dirLabel(dir) + '端点（' + list.length + '）', '', null,
          list.map(p => ['#' + p.id + (p.label ? ' ' + p.label : ''),
            p.side === 't' ? '上' : p.side === 'b' ? '下' : p.side === 'l' ? '左' : '右',
            () => startEdit('portLabel', n.id, p.label, { dir, portId:p.id })])
          .concat([
            'hr',
            ['加一个' + dirLabel(dir) + '端点', '最多 ' + PORT_MAX_PER_DIR + ' 个',
              () => addPort(n, dir)],
            ['删掉最后一个', '至少留一个',
              () => removePort(n, dir, list[list.length - 1].id)]
          ])]);
      }
      portItems.push('hr');
      portItems.push(['端点 ID…', '纯数字，不能重复，决定汇合顺序', null,
        portList(n).ins.concat(portList(n).outs).map(p => [
          '#' + p.id, p.side === 't' ? '上' : p.side === 'b' ? '下' : p.side === 'l' ? '左' : '右',
          () => startEdit('portId', n.id, String(p.id),
            { dir: portList(n).ins.indexOf(p) >= 0 ? 'ins' : 'outs', portId:p.id })
        ])]);
      portItems.push(['恢复默认端点', '回到左右各一个', () => resetPorts(n)]);
      items.push(['端点', '点一下改标签', null, portItems]);
    }
    // 表格节点：行列的增删
    if (isTableNode(n)){
      const tt = tableOf(n);
      items.push(['表格：' + tt.rows + ' 行 × ' + tt.cols + ' 列', '双击格子改内容', null, [
        ['末尾加一行', '行高固定', () => tableAddRow(n)],
        ['末尾加一列', '列宽按内容算', () => tableAddCol(n)],
        'hr',
        ['删掉最后一行', '至少留一行', () => tableDelRow(n)],
        ['删掉最后一列', '至少留一列', () => tableDelCol(n)],
        'hr',
        [(tt.header ? '● ' : '   ') + '第 0 行当表头', '底色反一下，用它当标题行', () => toggleTableHeader(n)]
      ]]);
    }
    items.push(['组件…', 'C', () => openComps()]);
    if (isVarNode(n)){
      const v = normalizeVarDef(n.varDef);
      items.push(['控件：' + VAR_CONTROL_LABEL[v.control], '▶', null,
        VAR_CONTROLS.map(c => [(v.control === c ? '● ' : '   ') + VAR_CONTROL_LABEL[c], '', () => {
          setVarControl(n, c);
        }])]);
      if (v.control === 'check'){
        items.push(['编辑选项…', '逗号分隔', () => startEdit('checkOpts', n.id)]);
        items.push(['清空勾选', '', () => { setVarDef(n, { picked:[] }); pushHist(); }]);
      }
      if (v.control === 'slider'){
        items.push(['滑条范围…', v.min + ' ~ ' + v.max + ' 步长 ' + v.step, null, [
          ['下限 -10', '', () => setSliderRange(n, { min:v.min - 10 })],
          ['下限 +10', '', () => setSliderRange(n, { min:v.min + 10 })],
          ['上限 -10', '', () => setSliderRange(n, { max:v.max - 10 })],
          ['上限 +10', '', () => setSliderRange(n, { max:v.max + 10 })],
          ['步长归 1', '', () => setSliderRange(n, { step:1 })],
          ['步长归 5', '', () => setSliderRange(n, { step:5 })]
        ]]);
      }
      if (v.control === 'cond'){
        const inc = (typeof gateOpenIn === 'function') ? valueFromUpstream(liveCtx(), n.id) : null;
        items.push(['条件：输入 ' + (inc == null ? '（没接）' : String(inc))
          + ' → ' + (gateOpenIn(liveCtx(), n) ? '通' : '不通'), '输入为 1 才通', null]);
      }
      items.push(['作用域：' + VAR_SCOPE_LABEL[v.scope], '▶', null,
        VAR_SCOPES.map(s => [(v.scope === s ? '● ' : '   ') + VAR_SCOPE_LABEL[s], VAR_SCOPE_HINT[s],
          () => { setVarDef(n, { scope:s }); pushHist(); say('* 作用域改成「' + VAR_SCOPE_LABEL[s] + '」：' + VAR_SCOPE_HINT[s] + '。'); }])]);
      items.push(['值类型：' + VAR_TYPE_LABEL[v.type], '▶', null,
        VAR_TYPES.map(x => [(v.type === x ? '● ' : '   ') + VAR_TYPE_LABEL[x], '', () => { setVarDef(n, { type:x }); pushHist(); }])]);
      items.push('hr');
    }
    if (isOpNode(n)){
      const od = normalizeOpDef(n.opDef);
      items.push(['运算符：' + opDefOf(od.op).label, '▶', null,
        OPERATORS.map(o => [(od.op === o.id ? '● ' : '   ') + o.label, o.hint, () => { setOpOperator(n, o.id); }])]);
      items.push('hr');
    }
    if (isEmbed(n)){
      items.push(['进入编辑', '双击', () => enterEmbed(n)]);
      items.push(['换个文档…', '', () => pickEmbedFile()]);
      items.push('hr');
    }
    if (n.kind === 'image'){
      items.push(['换一张图片…', '', () => pickImageFile(null, n)]);
      items.push(['编辑描述…', '双击图下方', () => startEdit('nodeDesc', n.id)]);
      items.push(['编辑名称…', '双击右上角', () => startEdit('node', n.id)]);
      items.push('hr');
    }
    items.push([isProgram(n) ? '程序算符…' : '节点样式…', 'E', () => openNodeBox(n)]);
    items.push([isProgram(n) ? '转回普通节点' : '转成程序节点', '', () => toggleProgramNode(n)]);
    // 优先级改到「组件…」面板里填了 —— 它现在是个可引用变量的组件，
    // 这里再放一份子菜单就是两处维护同一个东西。
    items.push('hr');
    items.push(['形状', '', null, [
      [(n.shape === 'rect'    ? '● ' : '   ') + '矩形',       '', () => setShape('rect')],
      [(n.shape === 'round'   ? '● ' : '   ') + '圆角矩形',   '', () => setShape('round')],
      [(n.shape === 'diamond' ? '● ' : '   ') + '菱形（判断）', '', () => setShape('diamond')],
      [(n.shape === 'oval'    ? '● ' : '   ') + '椭圆',       '', () => setShape('oval')],
      'hr',
      ['恢复自适应尺寸', n.fixedW || n.fixedH ? '' : '尺寸本来就是自适应', n.fixedW || n.fixedH ? () => autoSizeNode(n) : null]
    ]]);
    // 分组相关：只有选中的节点确实能加进去 / 确实在某个组里时才给
    const owner = (doc.groups || []).find(grp => grp.members.indexOf(n.id) >= 0);
    if (sel.size >= 2 || owner){
      items.push(['分组', '', null, [
        ['把选中的 ' + Math.max(sel.size, 1) + ' 个节点组成新分组', 'Ctrl+G',
          sel.size >= 2 ? () => createGroup() : null],
        owner ? ['移出「' + (owner.title || '分组') + '」', '', () => { selectOnly(n.id); removeSelectionFromGroup(owner); }] : null
      ].filter(Boolean)]);
    }
    items.push('hr');
    items.push([(n.collapsed ? '展开' : '折叠') + '子树', 'Space', () => toggleCollapseOf(n)]);
    items.push(['删除节点', 'Del', () => { selectOnly(n.id); deleteSelection(); }]);
  } else if (info.group){
    const grp = info.group;
    pushCommonItems(items, grp, 'group', 'F2');
    items.push(['把选中的（节点 / 分组）加入', '', () => addSelectionToGroup(grp)]);
    items.push('hr');
    items.push(['颜色', '', null, colorSub(grp.color, (v) => {
      grp.color = v; mark(); pushHist(); say('* 分组颜色已改为 ' + (v || '默认') + '。');
    })]);
    items.push(['组件…', 'C', () => openComps()]);
    items.push([grp.isFunction ? '取消程序组' : '设为程序组', '', () => toggleFunctionGroup(grp)]);
    items.push([(grp.collapsed ? '展开' : '折叠') + '分组', 'Space', () => toggleGroupCollapse(grp)]);
    items.push(['收缩到刚好包住成员', '', () => tidyGroup(grp)]);
    items.push('hr');
    items.push(['解散分组（保留成员）', 'Del', () => dissolveGroup(grp)]);
  } else if (e){
    items.push(['连线样式…', 'E', () => openEdgeBox()]);
    items.push(['编辑标签', '双击', () => startEdit('edge', e.id)]);
    items.push('hr');
    items.push(['组件…', 'C', () => openComps()]);
  items.push(['箭头', '', null, radioSub(
      ARROW_KINDS.map(k => [k, ARROW_LABEL[k]]), e.arrow,
      (v) => { setEdgeStyle(e, { arrow:v }); pushHist(); say('* 箭头：' + ARROW_LABEL[v]); })]);
    items.push(['线型', '', null, radioSub(
      [[false, '实线'], [true, '虚线']], e.dash,
      (v) => { setEdgeStyle(e, { dash:!!v }); pushHist(); say('* 线型：' + (v ? '虚线' : '实线')); })]);
    items.push(['走线', '', null, radioSub(
      ROUTE_KINDS.map(k => [k, ROUTE_LABEL[k]]), e.route,
      (v) => { setEdgeStyle(e, { route:v }); pushHist(); say('* 走线：' + ROUTE_LABEL[v]); })]);
    const hasWp = !!(e.waypoints && e.waypoints.length);
    items.push(['拐点', '', null, [
      info.waypoint
        ? ['删除这个拐点', '双击', () => { removeWaypoint(e, info.waypoint.index); pushHist(); say('* 拐点已删除。'); }]
        : ['在此添加拐点', '', info.p ? () => { addWaypoint(e, info.p.x, info.p.y); pushHist(); say('* 已添加拐点，拖动它调整走向。'); } : null],
      ['清除全部拐点', hasWp ? String(e.waypoints.length) + ' 个' : '当前没有拐点',
        hasWp ? () => { clearWaypoints(e); pushHist(); say('* 拐点已清除。'); } : null]
    ]]);
    items.push('hr');
    items.push(['删除连线', 'Del', () => deleteEdgeOnly(e)]);
  } else {
    items.push(['新建', '加一个东西', null, [
      ['节点', '文本 / 图片 / 表格', null, [
        ['文本节点', '一个普通节点，双击改名', () => {
          const p = s2w(x, y);
          const nn = addNodeAt('新节点', p.x - 70, p.y - 24, 'rect');
          reindex(); relayout(); settleGroups([nn.id]);
          selectOnly(nn.id); pushHist(); mark();
        }],
        ['图片节点…', '也可以直接把图片拖进窗口', () => pickImageFile(s2w(x, y))],
        ['表格节点', '行列可编辑，格子里的字也能引用变量', () => {
          const p = s2w(x, y);
          const nn = addTableNode(Math.round(p.x - 160), Math.round(p.y - 70));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了一个表格节点。双击格子改内容，右键可以加行 / 加列。');
        }]
      ]],
      ['空组', '一个空的分组框，往里拖东西就自动收纳', () => newEmptyGroup(s2w(x, y).x, s2w(x, y).y)],
      ['程序节点', '变量 / 勾选 / 滑条 / 条件 / 输出', null, [
        ['变量节点', '{name} 可引用，全局零连线可用', () => {
          const p = s2w(x, y);
          const nn = addVarNode('x', Math.round(p.x - 137), Math.round(p.y - 50));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了一个变量节点。双击左边的框改名，右边的框改值；别处写 {名字} 就能引用。');
        }],
        ['勾选节点', '选项随便加，输出选中的那一串', () => {
          const p = s2w(x, y);
          const nn = addControlNode('check', Math.round(p.x - 140), Math.round(p.y - 70));
          selectOnly(nn.id); pushHist(); mark();
          say('* 勾选节点：点方框就能勾 / 取消，输出是选中的那一串。右键「编辑选项…」加减选项。');
        }],
        ['滑条节点', '上下限 + 步长，拖一下实时生效', () => {
          const p = s2w(x, y);
          const nn = addControlNode('slider', Math.round(p.x - 140), Math.round(p.y - 60));
          selectOnly(nn.id); pushHist(); mark();
          say('* 滑条节点：拖圆点实时改值，引用它的地方跟着变。上下限 / 步长在面板或右键里设。');
        }],
        ['条件节点', '输入为 1 时才把所填的值放出去', () => {
          const p = s2w(x, y);
          const nn = addControlNode('cond', Math.round(p.x - 140), Math.round(p.y - 60));
          selectOnly(nn.id); pushHist(); mark();
          say('* 条件节点：一个输入一个输出。流进来的值是 1 就把「所填的值」放出去；不是 1 就不通。');
        }],
        ['输出节点', '声明本作用域的输出值', () => {
          const p = s2w(x, y);
          const nn = addOutNode('output', Math.round(p.x - 110), Math.round(p.y - 40));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了一个输出节点。把值连进来，或者双击名字框填一个同作用域的变量名。');
        }],
        'hr',
        // 这两个也是程序节点，只是不是「变量」那一类。
        // 不放在这里的话就没有别的入口了 —— 见 README 的说明。
        ['运算节点', '给流过来的变量值做 + - * /，可以叠加', () => {
          const p = s2w(x, y);
          const nn = addOpNode('运算', Math.round(p.x - 110), Math.round(p.y - 40));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了一个运算节点。双击算符框切换 + - * /，双击右边的框改运算值。');
        }],
        ['程序化节点', '改变目标的 外观 / 形状 / 位置 / 数值', () => {
          const p = s2w(x, y);
          const nn = createProgramNode(p.x - 70, p.y - 24);
          reindex(); relayout();
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了一个程序化节点。从它拉一条线到目标节点，算符就会叠加过去。');
        }]
      ]],
      ['程序组', '组内变量 + 运算 + 输出，外面接它的输出（原函数分组）', () => {
        const p = s2w(x, y);
        const g = newEmptyGroup(Math.round(p.x - 160), Math.round(p.y - 120));
        g.isFunction = true;
        renameGroup(g, '程序组');
        reindex(); sizeAll();
        selectGroup(g.id); pushHist(); mark();
        say('* 建了一个程序组。往里放变量 / 运算 / 输出节点，外面用一个变量节点指向它就能取到结果。');
      }],
      ['嵌入 Grapheon…', '整份文档当一个封闭节点', () => pickEmbedFile(s2w(x, y))]
    ]]);
    items.push(['全选', 'Ctrl+A', selectAll]);
    items.push(['居中', '把所有内容放进视野', fitView]);
    if (sel.size >= 2) items.push(['把选中的 ' + sel.size + ' 个节点加入分组', 'Ctrl+G', () => createGroup()]);
  }
  showMenu(x, y, items);
}

/* ---------------- 顶栏「新建」菜单 ---------------- */
function showNewMenu(anchor){
  const r = anchor.getBoundingClientRect();
  showMenu(r.left, r.bottom + 8, [
    ['空白文件', '一个中心节点', () => newDocument('blank')],
    ['示例：全部功能', '带活的变量演示', () => newDocument('demo')],
    ['示例：经典', '最早那份最简的树', () => newDocument('classic')],
    'hr',
    [(overlapOn() ? '● ' : '   ') + '防止节点重叠', '拖过去的会把别人弹开', () => setOverlapGuard(!overlapOn())],
    ['弹开所有重叠的节点', '手动清一次', () => {
      const pushed = resolveOverlaps([], true);
      pushHist();
      say(pushed.size ? '* 弹开了 ' + pushed.size + ' 个节点。' : '* 没有重叠的节点。');
    }],
    'hr',
    ['取消', 'Esc', null]
  ]);
}

/* 点击别处收起。注意顶栏按钮要放行，否则「新建」菜单会在同一次点击里被立刻关掉。
   子菜单是 body 下的兄弟节点，不在 ctxEl 里面，所以要逐个查。 */
const inAnyMenu = (t) => menuStack.some(m => m.contains(t));
window.addEventListener('pointerdown', (ev) => {
  if (ev.target.closest && ev.target.closest('#topbar')) return;
  if (!inAnyMenu(ev.target) && ev.target !== canvas) hideCtx();
}, true);
window.addEventListener('click', (ev) => {
  if (ev.target.closest && ev.target.closest('#topbar')) return;
  if (!inAnyMenu(ev.target)) hideCtx();
});

/* =========================================================================
   插入菜单（顶栏「插入」）
   把散在各处的「加一个 X」收拢到一处。
   ========================================================================= */
function showInsertMenu(anchor){
  const items = [
    ['节点', '空白节点，放在视口正中', () => {
      const c = viewCenter();
      const n = addNodeAt('新节点', Math.round(c.x - 60), Math.round(c.y - 24), 'rect');
      selectOnly(n.id); pushHist(); mark();
      say('* 加了一个节点。选中它按方向键 / WASD 可以往那个方向接着生成。');
    }],
    ['图片…', '也可以直接把图片拖进窗口', () => pickImageFile()],
    ['嵌入 Grapheon…', '整份文档当一个封闭节点', () => pickEmbedFile()],
    'hr',
    ['变量定义节点', '别的文字里写 {名字} 引用', () => {
      const c = viewCenter();
      const n = addVarNode('x', Math.round(c.x - 137), Math.round(c.y - 50));
      selectOnly(n.id); pushHist(); mark();
    }],
    ['运算节点', '+ - * / 可以叠加', () => {
      const c = viewCenter();
      const n = addOpNode('运算', Math.round(c.x - 110), Math.round(c.y - 40));
      selectOnly(n.id); pushHist(); mark();
    }],
    ['输出节点', '声明本作用域的输出值', () => {
      const c = viewCenter();
      const n = addOutNode('output', Math.round(c.x - 110), Math.round(c.y - 40));
      selectOnly(n.id); pushHist(); mark();
    }],
    'hr',
    ['勾选节点', '选项随便加，输出一串列表', () => {
      const c = viewCenter();
      const n = addControlNode('check', Math.round(c.x - 140), Math.round(c.y - 70));
      selectOnly(n.id); pushHist(); mark();
    }],
    ['滑条节点', '上下限 + 步长，实时生效', () => {
      const c = viewCenter();
      const n = addControlNode('slider', Math.round(c.x - 140), Math.round(c.y - 60));
      selectOnly(n.id); pushHist(); mark();
    }],
    ['通路节点', '断开后这条连接逻辑上不通', () => {
      const c = viewCenter();
      const n = addControlNode('switch', Math.round(c.x - 140), Math.round(c.y - 60));
      selectOnly(n.id); pushHist(); mark();
    }]
  ];
  showMenu(anchor.getBoundingClientRect().left, anchor.getBoundingClientRect().bottom + 6, items);
}

/* 视图菜单（顶栏「视图」）：居中 + 对齐与分布 */
function showViewMenu(anchor){
  const r = anchor.getBoundingClientRect();
  showMenu(r.left, r.bottom + 6, [
    ['居中', '把全部内容放进视野', () => { fitView(); say('* 已居中。'); }],
    'hr',
    // 「排版」按钮撤了，换成对齐与分布 —— 手动的、可预期的、随选随用
    ['对齐与分布', '先选中几个', null, [
      ['左对齐',      '', () => alignSelection('h-left')],
      ['水平居中',    '', () => alignSelection('h-center')],
      ['右对齐',      '', () => alignSelection('h-right')],
      'hr',
      ['顶对齐',      '', () => alignSelection('v-top')],
      ['垂直居中',    '', () => alignSelection('v-center')],
      ['底对齐',      '', () => alignSelection('v-bottom')],
      'hr',
      ['横向等距分布', '至少三个', () => distributeSelection('x')],
      ['竖向等距分布', '至少三个', () => distributeSelection('y')]
    ]]
  ]);
}
