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
    /* ★ 右边只留**快捷键**；说明文字收起来，右键点这一项时在鼠标处浮出来
       （同时挂 title，悬停也能看到）。 */
    if (hint){
      if (isMenuShortcut(hint)){
        d.appendChild(el('span', 'k', hint));
      } else {
        d.title = hint;
        d.dataset.tip = hint;
        d.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          showMenuTip(hint, ev);
        });
        d.addEventListener('mouseleave', hideMenuTip);
      }
    }
    if (subs) d.appendChild(el('span', 'k', '▶'));

    if (subs){
      /* ★ 子菜单**单击**才展开，不再用 hover ——
         以前鼠标扫过一排带子菜单的项，子菜单会一层层弹开，
         想点最下面那个还得到处绕。
         再点同一项 = 收起。悬停**不再**关掉更深的那几级 ——
         不然鼠标往子菜单挪的半路上它就没了。 */
      d.onclick = (ev) => {
        ev.stopPropagation();
        const wasOpen = d.classList.contains('sel');
        closeMenusBelow(depth + 1);
        for (const s of root.querySelectorAll('.item.sel')) s.classList.remove('sel');
        if (wasOpen) return;
        d.classList.add('sel');
        showMenu(0, 0, subs, depth + 1, d);
      };
    } else {
      if (fn) d.onclick = (ev) => { ev.stopPropagation(); hideCtx(); fn(); };
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

/* =========================================================================
   菜单项右边的 hint 是「快捷键」还是「说明」？
   快捷键：纯 ASCII 且短（Esc / Enter / Ctrl+X / Del），或者白名单里的中文按键名。
   说明  ：带中文的整句话（一个中心节点 / 拖过去的会把别人弹开）。
   ========================================================================= */
const MENU_KEY_NAMES = ['方向键','空格','双击','右键','单击','拖拽','滚动','回车','退格'];
function isMenuShortcut(s){
  const t = String(s == null ? '' : s).trim();
  if (!t) return false;
  if (/^(Ctrl|Shift|Alt|Cmd|⌘)\s*\+/i.test(t)) return true;   // Ctrl + X
  if (/^[A-Za-z0-9+\-\/ ]{1,12}$/.test(t)) return true;        // 纯 ASCII 且短
  return MENU_KEY_NAMES.indexOf(t) >= 0;                        // 白名单里的中文按键名
}

/* 「用法」浮层：右键点菜单项时，在鼠标处浮出来 */
function menuTipEl(){
  let t = document.getElementById('menuTip');
  if (!t){
    t = el('div', 'ud menu-tip');
    t.id = 'menuTip';
    t.style.display = 'none';
    document.body.appendChild(t);
  }
  return t;
}
function showMenuTip(text, ev){
  const t = menuTipEl();
  t.textContent = String(text || '');
  t.style.display = 'block';
  /* 先摆上去量一下，别超出右 / 下边 */
  const w = t.offsetWidth, h = t.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 16;
  if (x + w > window.innerWidth - 8)  x = Math.max(8, ev.clientX - w - 10);
  if (y + h > window.innerHeight - 8) y = Math.max(8, ev.clientY - h - 10);
  t.style.left = Math.round(x) + 'px';
  t.style.top  = Math.round(y) + 'px';
}
function hideMenuTip(){
  const t = document.getElementById('menuTip');
  if (t) t.style.display = 'none';
}
/* 关菜单的时候顺手把它收掉 */
document.addEventListener('pointerdown', hideMenuTip, true);
window.addEventListener('blur', hideMenuTip);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideMenuTip(); }, true);

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

/* =========================================================================
   组件效果 → 右键菜单项（第二步：从组件面板搬进菜单）
   没挂上：点一下挂上（用默认值）；挂上了：● 开头，点开小浮层改参数。
   字段类型直接映射到浮层（number → 滑条+填空，color → 色块+填空，text → 填空）。

   scope 决定哪些效果可用（effectDef(id).scopes）；
   who   是显示给用户看的「是谁」—— 节点是 tagOf(n)，连线是 edgeTag(e)。

   ⚠ 这里**不用正则** —— 我的写文件管线吃过反斜杠（\d 变成 d），
     正则静默失配过一次。数字判断走 nbAsNumber。
   ========================================================================= */
function effectMenuItems(entity, scope, ids, who){
  const out = [];
  for (const id of ids){
    const def = effectDef(id);
    if (!def || def.scopes.indexOf(scope) < 0) continue;
    const on = compOn(entity, id);
    const props = def.props || [];
    const fields = props.map(p => {
      const isNum = p.type === 'number';
      const lab = p.label || p.key;
      return {
        key: p.key, label: lab,
        type: p.type === 'color' ? 'color' : (isNum ? 'number' : 'text'),
        min: isNum ? 0 : undefined,
        /* 透明度的量程是 0~100，别的数字（粗细 / 线宽）按 0~20 给 */
        max: isNum ? (lab.indexOf('透明') >= 0 ? 100 : 20) : undefined,
        step: 1,
        placeholder: p.refable ? '留空 = 默认；也可以写 {变量}' : '留空 = 默认'
      };
    });
    const values = {};
    for (const p of props) values[p.key] = (p.def == null ? '' : String(p.def));
    if (on){
      for (const p of props){
        const raw = compRaw(entity, id, p.key);
        if (raw != null && raw !== '') values[p.key] = String(raw);
      }
    }
    out.push([(on ? '● ' : '   ') + def.label + (props.length ? '…' : ''),
      on ? '点开改参数' : (def.hint || ''),
      () => {
        if (!props.length){
          if (on){ removeComponent(entity, id); say('* ' + who + '的' + def.label + '已关掉。'); }
          else { setComponent(entity, id, {}); say('* ' + who + '挂上了' + def.label + '。'); }
          reindex(); sizeAll(); pushHist(); mark();
          return;
        }
        openValueBox({
          title: def.label, who, hint: def.hint || '',
          fields, values,
          onOk: (vals) => {
            const next = {};
            let any = false;
            for (const p of props){
              const v = String(vals[p.key] == null ? '' : vals[p.key]);
              if (v === '') continue;
              const num = nbAsNumber(v);
              next[p.key] = (p.type === 'number' && num != null) ? num : v;
              any = true;
            }
            if (!any){
              removeComponent(entity, id);
              say('* ' + who + '的' + def.label + '已关掉。');
            } else {
              setComponent(entity, id, next);
              say('* ' + who + '的' + def.label + '已设置。');
            }
            reindex(); sizeAll(); pushHist(); mark();
          }
        });
      }]);
  }
  return out;
}
/* 把这几个效果收进**一个**「效果 ▶」子菜单（顶层项不多的地方用） */
function effectSubMenu(items, entity, scope, ids, who){
  const list = effectMenuItems(entity, scope, ids, who);
  if (list.length) items.push(['效果', '不改结构，只盖一层：' + list.map(x => x[0].replace(/^[●\s]+/, '')).join(' / '), null, list]);
}

/* =========================================================================
   多媒体节点：Ctrl + 左键打开源（和 Word 里的超链接一个习惯）
   图片 / 视频 / 音频打开的是**原始文件**，网页 / 文件就是新开一个标签页。
   ========================================================================= */
function openMediaSource(n){
  const raw = (typeof mediaSrcOf === 'function') ? mediaSrcOf(n) : '';
  if (!raw){ say('* 这个节点还没填源。'); return false; }
  if (typeof mediaSrcAllowed === 'function' && !mediaSrcAllowed(raw)){
    say('* 这个源不安全，不让打开。');
    return false;
  }
  const href = mediaHrefOf(n);
  try {
    window.open(href, '_blank', 'noopener');
  } catch (e) {
    say('* 打不开这个源。');
    return false;
  }
  say('* 已在新标签页打开。');
  return true;
}

function showCtx(x, y, n, e, info){
  info = info || {};
  const items = [];
  if (n){
    /* =====================================================================
       节点右键菜单（重排过）
       ---------------------------------------------------------------------
       以前最多 26 个顶层项，长得看不到头。现在按**用途**归成几组，
       顶层常驻不超过 8 项：重命名 / 外观 / 数据 / 连接 / 结构 / 表格 / 对齐 / 删除。
       ===================================================================== */
    items.push(['重命名', 'F2', () => startEdit('node', n.id)]);
    if (doc.edges.some(e => e.s === n.id || e.t === n.id)){
      items.push(['连线端点吸附…', '改这条线接在哪条边上', () => openEndBox(n)]);
    }

    /* ---------------- 外观 ▶ ---------------- */
    const look = [];
    /* ★ 多媒体节点（原名「图片节点」）的专属项。
       放在「外观」里而不是新开顶层 —— 顶层名额有限（PM01 卡 <= 8）。 */
    if (typeof isMediaNode === 'function' && isMediaNode(n)){
      const curSrc = mediaSrcOf(n);
      const curKind = mediaKindOf(n);
      look.push(['媒体', '源 / 类型 / 打开 / 播放', null, [
        ['换源…', curSrc || '还没填', () => openValueBox({
          title:'媒体源', who:tagOf(n),
          hint:'相对地址会自动补 user/ 前缀（pic.png → user/pic.png）。'
             + '也可以写 https:// 网页地址，或 data: 内嵌数据。留空 = 清掉。',
          fields:[{ key:'src', label:'源', type:'text', placeholder:'pic.png / https://… / data:…' }],
          values:{ src:curSrc },
          onOk: (vals) => {
            const v = String(vals.src == null ? '' : vals.src).trim();
            /* 换源也过一遍白名单：危险的协议头不许进节点 */
            if (v && typeof mediaSrcAllowed === 'function' && !mediaSrcAllowed(v)){
              say('* 这个源不安全，没改。');
              return;
            }
            n.src = v;
            reindex(); sizeNode(n); reindex(); sizeAll(); pushHist(); mark();
            say('* ' + tagOf(n) + '的源改成了' + (v ? '「' + mediaKindLabelOf(n) + '」' : '空') + '。');
          }
        })],
        'hr',
        ['类型', (MEDIA_KIND_LABEL[curKind] || '未定') + '（自动判的可以改）', null,
          MEDIA_KINDS.map(k => [(curKind === k ? '● ' : '   ') + MEDIA_KIND_LABEL[k],
            k === mediaKind(curSrc) ? '自动判定也是这个' : '',
            () => { setMediaType(n, k); say('* ' + tagOf(n) + '的类型改成了' + MEDIA_KIND_LABEL[k] + '。'); }])
            .concat(['hr', ['交回自动判定', '按扩展名重新猜', () => {
              setMediaType(n, ''); say('* ' + tagOf(n) + '的类型交回自动判定。');
            }]])],
        'hr',
        ['打开源', 'Ctrl + 左键', () => openMediaSource(n)],
        ['播放 / 暂停', typeof mediaElOf === 'function' && mediaElOf(n) ? '' : '这个类型不能播放',
          (typeof mediaElOf === 'function' && mediaElOf(n)) ? () => toggleMediaPlay(n) : null]
      ]]);
    }
    look.push(...effectMenuItems(n, 'node', ['tint', 'outline', 'badge'], tagOf(n)));
    look.push(['形状', '', null, [
      [(n.shape === 'rect'    ? '● ' : '   ') + '矩形',       '', () => setShape('rect')],
      [(n.shape === 'round'   ? '● ' : '   ') + '圆角矩形',   '', () => setShape('round')],
      [(n.shape === 'diamond' ? '● ' : '   ') + '菱形（判断）', '', () => setShape('diamond')],
      [(n.shape === 'oval'    ? '● ' : '   ') + '椭圆',       '', () => setShape('oval')],
      'hr',
      ['恢复自适应尺寸', n.fixedW || n.fixedH ? '现在是你手动拉的' : '尺寸本来就是自适应',
        n.fixedW || n.fixedH ? () => autoSizeNode(n) : null]
    ]]);
    look.push([isProgram(n) ? '程序算符…' : '节点样式…', 'E', () => openNodeBox(n)]);
    /* ★ 透明度：组件层的效果，直接放进「外观」里，不另开顶层菜单
       （顶层有上限 PM01 卡 8 项，而且「外观」本来就是它该待的地方）。
       点开是那个「滑条 + 填空」的小浮层。 */
    {
      const on  = (typeof compOn === 'function') && compOn(n, 'opacity');
      const cur = (typeof compRaw === 'function') ? compRaw(n, 'opacity', 'value') : null;
      look.push([(on ? '● ' : '   ') + '透明度…',
        on ? ('现在 ' + cur) : '0 ~ 100，只盖一层不改结构',
        /* 透明度是**单个数字**，用 openNumBox 就够（滑条 + 填空）。
           等以后加需要颜色 / 文本的效果时，再把它泛化成多字段浮层。 */
        () => openNumBox({
          title:'透明度', who:tagOf(n),
          hint:'0 ~ 100。拖滑条快速试，也可以直接填精确值；还能填 {变量}。留空 = 关掉这一项。',
          min:0, max:100, step:1,
          value: (cur == null ? '' : String(cur)),
          placeholder:'留空 = 关掉；也可以写 {变量}',
          onOk: (v0) => {
            const v = String(v0 == null ? '' : v0).trim();
            if (v === ''){
              removeComponent(n, 'opacity');
              say('* ' + tagOf(n) + '的透明度已关掉。');
            } else {
              /* ★ 这里**故意不用正则** —— 我的 PowerShell 管线吃过反斜杠，
                 把 \d 变成了 d，正则静默失配。Number() 没有这个问题。 */
              const num = Number(v);
              const isNum = (v !== '' && isFinite(num));
              setComponent(n, 'opacity', { value: isNum ? num : v });
              say('* ' + tagOf(n) + '的透明度设为 ' + v + '。');
            }
            reindex(); sizeAll(); pushHist(); mark();
          }
        })]);
    }
    if (n.kind === 'image'){
      look.push('hr');
      look.push(['换一张图片…', '', () => pickImageFile(null, n)]);
      look.push(['编辑描述…', '双击图下方', () => startEdit('nodeDesc', n.id)]);
      look.push(['编辑名称…', '双击右上角', () => startEdit('node', n.id)]);
    }
    if (isEmbed(n)){
      look.push('hr');
      look.push(['进入编辑', '双击', () => enterEmbed(n)]);
      look.push(['换个文档…', '', () => pickEmbedFile()]);
    }
    items.push(['外观', '形状 / 样式 / 染色 / 透明度 / 描边 / 角标', null, look]);

    /* ---------------- 数据 ▶（一切和「值」有关的）---------------- */
    const data = [];
    if (isBroadcast(n)){
      data.push(['广播：值来自输入，只能设名字', '全局可见，不用连线', null]);
      data.push('hr');
    }
    if (isVarNode(n)){
      const v = varDefOf(n);
      /* 「类型」而不是「控件」—— 单一变量 / 滑块 / 列表 / 地图 / 勾选 / 条件
         都是同一个变量节点的不同形态，切换不丢数据。 */
      data.push(['类型：' + VAR_CONTROL_LABEL[v.control], '', null,
        VAR_CONTROLS.map(c => [(v.control === c ? '● ' : '   ') + VAR_CONTROL_LABEL[c],
          (typeof VAR_CONTROL_HINT === 'object' && VAR_CONTROL_HINT[c]) || '',
          () => { setVarControl(n, c); }])]);
      if (v.control === 'check'){
        data.push(['编辑选项…', '逗号分隔', () => startEdit('checkOpts', n.id)]);
        data.push(['清空勾选', '', () => { setVarDef(n, { picked:[] }); pushHist(); }]);
      }
      if (v.control === 'list'){
        data.push(['编辑项目…', '一行一项，可以写 {变量}', () => startEdit('listItems', n.id)]);
        data.push(['加一项', '引用写法 {' + v.name + '.' + v.items.length + '}', () => addListItem(n)]);
        data.push(['删掉最后一项', v.items.length > 1 ? ('现在 ' + v.items.length + ' 项')
                                                      : '至少留一项',
          v.items.length > 1 ? () => removeListItem(n) : null]);
      }
      if (v.control === 'map'){
        data.push(['编辑键值…', '一行一对 key=value，都能写 {变量}',
          () => startEdit('mapPairs', n.id)]);
        data.push(['加一对', '引用写法 {' + v.name + '.键名}', () => addMapPair(n)]);
        data.push(['删掉最后一对', v.pairs.length > 1 ? ('现在 ' + v.pairs.length + ' 对')
                                                      : '至少留一对',
          v.pairs.length > 1 ? () => removeMapPair(n) : null]);
      }
      if (v.control === 'slider'){
        /* ★ 上下限可能写的是 {变量} —— 加减之前必须先解析成数。
       以前直接 v.min - 10，上下限写 {下界} 的时候算出来是 NaN，
       点一下「下限 -10」，范围就变成 NaN 了。 */
    const curMin = () => paramNum(liveCtx(), v.min, n.id, 0);
    const curMax = () => paramNum(liveCtx(), v.max, n.id, curMin() + 100);
    data.push(['滑条范围…', v.min + ' ~ ' + v.max + ' 步长 ' + v.step, null, [
      ['下限 -10', '', () => setSliderRange(n, { min:curMin() - 10 })],
      ['下限 +10', '', () => setSliderRange(n, { min:curMin() + 10 })],
      ['上限 -10', '', () => setSliderRange(n, { max:curMax() - 10 })],
      ['上限 +10', '', () => setSliderRange(n, { max:curMax() + 10 })],
          ['步长归 1', '', () => setSliderRange(n, { step:1 })],
          ['步长归 5', '', () => setSliderRange(n, { step:5 })]
        ]]);
      }
      if (v.control === 'cond'){
        const ctx0 = liveCtx();
        const inc = (typeof gateOpenIn === 'function') ? valueFromUpstream(ctx0, n.id) : null;
        data.push(['条件：输入 ' + (inc == null ? '（没接）' : String(inc))
          + ' → ' + (gateOpenIn(ctx0, n) ? '通' : '不通'), '输入为 1 才通', null]);
      }
      data.push(['作用域：' + VAR_SCOPE_LABEL[v.scope], '', null,
        VAR_SCOPES.map(s => [(v.scope === s ? '● ' : '   ') + VAR_SCOPE_LABEL[s], VAR_SCOPE_HINT[s],
          () => { setVarDef(n, { scope:s }); pushHist();
                  say('* 作用域改成「' + VAR_SCOPE_LABEL[s] + '」：' + VAR_SCOPE_HINT[s] + '。'); }])]);
      data.push(['值类型：' + VAR_TYPE_LABEL[v.type], '', null,
        VAR_TYPES.map(x => [(v.type === x ? '● ' : '   ') + VAR_TYPE_LABEL[x], '',
          () => { setVarDef(n, { type:x }); pushHist(); }])]);
    }
    if (isOpNode(n)){
      const od = normalizeOpDef(n.opDef);
      data.push(['运算符：' + opDefOf(od.op).label, '', null,
        OPERATORS.map(o => [(od.op === o.id ? '● ' : '   ') + o.label, o.hint,
          () => { setOpOperator(n, o.id); }])]);
      data.push(['操作数…', '可以写 {变量}', () => startEdit('opVal0', n.id)]);
    }
    data.push('hr');
    data.push([isProgram(n) ? '转回普通节点' : '转成程序节点', '程序节点才有作用域 / 输出',
      () => toggleProgramNode(n)]);
    items.push(['数据', '类型 / 作用域 / 值类型 / 运算符', null, data]);

    /* ---------------- 连接 ▶（端点相关）---------------- */
    if (!isEmbed(n)){
      const PL = portList(n);
      /* ⚠ 三类都要有名字。以前只有 ins/outs 两个分支，
         连接端点掉进 else → 菜单里显示成「输出端点（4）」。 */
      const dirLabel = (d) => d === 'ins' ? '输入' : (d === 'outs' ? '输出' : '连接');
      const portItems = [];
      for (const dir of PORT_DIRS){
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
        nodePorts(n).map(p => [
          '#' + p.id, p.side === 't' ? '上' : p.side === 'b' ? '下' : p.side === 'l' ? '左' : '右',
          () => startEdit('portId', n.id, String(p.id),
            { dir: PORT_DIRS.filter(d => (portList(n)[d] || []).indexOf(p) >= 0)[0] || 'ins',
              portId:p.id })
        ])]);
      portItems.push(['恢复默认端点', '回到这个节点种类默认的样子', () => resetPorts(n)]);
      items.push(['连接', '端点：加 / 删 / 改 ID / 换边', null, portItems]);
    }

    /* ---------------- 结构 ▶ ---------------- */
    const struct = [
      ['添加子节点', '', () => addChild()],
      ['添加兄弟节点', 'Enter', () => addSibling()],
      'hr'
    ];
    const owner = (doc.groups || []).find(grp => grp.members.indexOf(n.id) >= 0);
    if (sel.size >= 2){
      struct.push(['把选中的 ' + sel.size + ' 个组成新分组', 'Ctrl+G', () => createGroup()]);
    }
    if (owner){
      struct.push(['移出「' + (owner.title || '分组') + '」', '',
        () => { selectOnly(n.id); removeSelectionFromGroup(owner); }]);
    }
    if (sel.size < 2 && !owner){
      struct.push(['分组', '选中两个以上才能成组（Ctrl+G）', null]);
    }
    struct.push('hr');
    struct.push([(n.collapsed ? '展开' : '折叠') + '子树', 'Tab', () => toggleCollapseOf(n)]);
    /* ★ 优先级并进「结构」—— 它本来就是结构性的东西。
       之前它单独占一个顶层「布局」菜单，既和「结构」重复，
       又占掉顶层名额（PM01 卡 <= 8）。 */
    {
      const prio = (n.priority == null || n.priority === '') ? '' : String(n.priority);
      struct.push(['优先级…', prio === '' ? '默认（变量 1000 / 输出 900 / 运算 100）' : ('现在 ' + prio),
        () => openNumBox({
          title:'优先级', who:tagOf(n),
          hint:'拖滑条快速试，或直接填精确值。留空 = 用默认（变量 1000 / 输出 900 / 运算 100 / 其余 0）；也可以填 {变量}。',
          min:0, max:2000, step:1, value:prio,
          onOk: (v) => {
            /* ★ 不用正则判断数字 —— 我的写文件管线吃过反斜杠，
               把 \d 变成 d 让正则静默失配过一次。Number() 没这个问题。 */
            const num = Number(String(v == null ? '' : v).trim());
            const isNum = (String(v == null ? '' : v).trim() !== '' && isFinite(num));
            n.priority = (v === '') ? null : (isNum ? num : v);
            reindex(); sizeAll(); pushHist(); mark();
            say('* ' + tagOf(n) + '的优先级改为 ' + (v === '' ? '默认' : v)
              + '（生效值 ' + priorityOf(n) + '）。');
          }
        })]);
    }
    /* ★ 条件隐藏归「行为」一类，但它也是「这个节点什么时候不出现」，
       放进「结构」比另开一个顶层菜单合适（顶层名额有限）。 */
    struct.push(...effectMenuItems(n, 'node', ['hideIf'], tagOf(n)));
    items.push(['结构', '子节点 / 兄弟 / 分组 / 折叠 / 优先级 / 条件隐藏', null, struct]);

    /* ---------------- 表格 ▶（只有表格节点才有）---------------- */
    if (isTableNode(n)){
      const tt = tableOf(n);
      items.push(['表格', tt.rows + ' 行 × ' + tt.cols + ' 列', null, [
        /* 导出的是**算完的结果** —— 单元格里的 {=…} 会先求值再写进文件 */
        ['导出为 CSV', '公式导出的是结果', () => exportTableCSV(n)],
        'hr',
        ['末尾加一行', '行高固定', () => tableAddRow(n)],
        ['末尾加一列', '列宽按内容算', () => tableAddCol(n)],
        'hr',
        ['删掉最后一行', '至少留一行', () => tableDelRow(n)],
        ['删掉最后一列', '至少留一列', () => tableDelCol(n)],
        'hr',
        [(tt.header ? '● ' : '   ') + '第 0 行当表头', '底色反一下，用它当标题行',
          () => toggleTableHeader(n)]
      ]]);
    }

    /* ---------------- 对齐与分布 ▶（选了多个才有意义）---------------- */
    if (sel.size + selGroups.size >= 2){
      items.push(['对齐与分布', '', null, [
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

    items.push('hr');
    items.push(['删除节点', 'Del', () => { selectOnly(n.id); deleteSelection(); }]);
  } else if (info.group){
    const grp = info.group;
    pushCommonItems(items, grp, 'group', 'F2');
    items.push(['把选中的（节点 / 分组）加入', '', () => addSelectionToGroup(grp)]);
    items.push('hr');
    items.push(['颜色', '', null, colorSub(grp.color, (v) => {
      grp.color = v; mark(); pushHist(); say('* ' + tagOf(grp) + '的颜色改为' + (v || '默认') + '。');
    })]);
    /* 分组也能挂外观 / 行为那几项（作用域过滤在 effectMenuItems 里） */
    effectSubMenu(items, grp, 'group', ['tint', 'opacity', 'outline', 'badge', 'hideIf'], tagOf(grp));
    items.push([grp.isFunction ? '取消程序组' : '设为程序组', '', () => toggleFunctionGroup(grp)]);
    items.push([(grp.collapsed ? '展开' : '折叠') + '分组', 'Tab', () => toggleGroupCollapse(grp)]);
    items.push(['收缩到刚好包住成员', '', () => tidyGroup(grp)]);
    /* ---------------- 连接 ▶（分组也有端点表了）----------------
       ★ 以前分组只有四向中点、没有任何可改的地方，所以这一段只有节点有。
         现在 group.ports 和 node.ports 是**同一套结构**，
         addPort / removePort / resetPorts 本来就只认 .ports 字段，直接能用。
         没配过 ports 的分组，这里显示的就是它当前生效的默认四向。 */
    {
      const PL = portList(grp);
      const dirLabel = (d) => d === 'ins' ? '输入' : (d === 'outs' ? '输出' : '连接');
      const sideName = (s) => s === 't' ? '上' : s === 'b' ? '下' : s === 'l' ? '左' : '右';
      const portItems = [];
      for (const dir of PORT_DIRS){
        const list = PL[dir];
        portItems.push([dirLabel(dir) + '端点（' + list.length + '）', '', null,
          list.map(p => ['#' + p.id + (p.label ? ' ' + p.label : ''), sideName(p.side),
            () => startEdit('portLabel', grp.id, p.label, { dir, portId:p.id })])
          .concat([
            'hr',
            ['加一个' + dirLabel(dir) + '端点', '最多 ' + PORT_MAX_PER_DIR + ' 个',
              () => addPort(grp, dir)],
            ['删掉最后一个', '至少留一个',
              () => removePort(grp, dir, list[list.length - 1].id)]
          ])]);
      }
      portItems.push('hr');
      portItems.push(['端点 ID…', '纯数字，不能重复，决定汇合顺序', null,
        nodePorts(grp).map(p => [
          '#' + p.id, sideName(p.side),
          () => startEdit('portId', grp.id, String(p.id),
            { dir: PORT_DIRS.filter(d => (portList(grp)[d] || []).indexOf(p) >= 0)[0] || 'ins',
              portId:p.id })
        ])]);
      portItems.push(['恢复默认端点', '回到分组的四向中点', () => resetPorts(grp)]);
      items.push(['连接', '端点：加 / 删 / 改 ID / 换边', null, portItems]);
    }
    items.push('hr');
    items.push(['解散分组（保留成员）', 'Del', () => dissolveGroup(grp)]);
  } else if (e){
    items.push(['连线样式…', 'E', () => openEdgeBox()]);
    items.push(['编辑标签', '双击', () => startEdit('edge', e.id)]);
    items.push('hr');
    /* 线宽是**连线专属**的效果，直接放这一层（第 3 步从组件面板搬过来）。
       ⚠ 连线不能用 tagOf —— 它只认节点和分组，连线的名字要用 edgeTag。 */
    items.push(...effectMenuItems(e, 'edge', ['width'], edgeTag(e)));
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
        ? ['删除这个拐点', '双击', () => { removeWaypoint(e, info.waypoint.index); pushHist(); say('* ' + edgeTag(e) + '的拐点已删除。'); }]
        : ['在此添加拐点', '', info.p ? () => { addWaypoint(e, info.p.x, info.p.y); pushHist(); say('* ' + edgeTag(e) + '加了拐点，拖动它调整走向。'); } : null],
      ['清除全部拐点', hasWp ? String(e.waypoints.length) + ' 个' : '当前没有拐点',
        hasWp ? () => { clearWaypoints(e); pushHist(); say('* ' + edgeTag(e) + '的拐点已清除。'); } : null]
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
          say('* 建了表格节点' + tagOf(nn) + '。双击格子改内容。');
        }]
      ]],
      ['空组', '一个空的分组框，往里拖东西就自动收纳', () => newEmptyGroup(s2w(x, y).x, s2w(x, y).y)],
      ['程序节点', '变量（可切类型）/ 勾选 / 条件 / 输出', null, [
        ['变量节点', '单一变量 / 滑块 / 列表 / 地图，建好再切类型', () => {
          const p = s2w(x, y);
          const nn = addVarNode('x', Math.round(p.x - 137), Math.round(p.y - 50));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了变量节点' + tagOf(nn) + '。别处写 {名字} 就能引用。');
        }],
        ['勾选节点', '选项随便加，输出选中的那一串', () => {
          const p = s2w(x, y);
          const nn = addControlNode('check', Math.round(p.x - 140), Math.round(p.y - 70));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了勾选节点' + tagOf(nn) + '。点方框勾选，输出是选中那串。');
        }],
        ['条件节点', '输入为 1 时才把所填的值放出去', () => {
          const p = s2w(x, y);
          const nn = addControlNode('cond', Math.round(p.x - 140), Math.round(p.y - 60));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了条件节点' + tagOf(nn) + '。输入为 1 才放行。');
        }],
        ['广播节点', '把输入值变成全局变量，只能设名字', () => {
          const p = s2w(x, y);
          const nn = addBroadcastNode(Math.round(p.x - 137), Math.round(p.y - 50));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了广播节点' + tagOf(nn) + '。它的名字就是全局变量。');
        }],
        ['输出节点', '声明本作用域的输出值', () => {
          const p = s2w(x, y);
          const nn = addOutNode('output', Math.round(p.x - 110), Math.round(p.y - 40));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了输出节点' + tagOf(nn) + '。把值连进来就行。');
        }],
        'hr',
        // 这两个也是程序节点，只是不是「变量」那一类。
        // 不放在这里的话就没有别的入口了 —— 见 README 的说明。
        ['运算符节点', '两个输入端点各对一个操作数，按端点顺序运算', () => {
          const p = s2w(x, y);
          const nn = addOpNode('运算', Math.round(p.x - 110), Math.round(p.y - 40));
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了运算符节点' + tagOf(nn) + '。两个输入端点各对一个操作数。');
        }],
        ['外观节点', '改变目标的 外观 / 形状 / 位置 / 数值', () => {
          const p = s2w(x, y);
          const nn = createProgramNode(p.x - 70, p.y - 24);
          reindex(); relayout();
          selectOnly(nn.id); pushHist(); mark();
          say('* 建了外观节点' + tagOf(nn) + '。拉线到目标就生效。');
        }]
      ]],
      ['程序组', '组内变量 + 运算 + 输出，外面接它的输出（原函数分组）', () => {
        const p = s2w(x, y);
        const g = newEmptyGroup(Math.round(p.x - 160), Math.round(p.y - 120));
        g.isFunction = true;
        renameGroup(g, '程序组');
        reindex(); sizeAll();
        selectGroup(g.id); pushHist(); mark();
        say('* 建了程序组' + tagOf(g) + '。外面用变量节点指向它取结果。');
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
    ['空白文件', '题目 + 内容，已经连好', () => newDocument('blank')],
    ['示例：全部功能', '带活的变量演示', () => newDocument('demo')],
    ['示例：经典', '最早那份最简的树', () => newDocument('classic')],
    'hr',
    /* 导入 CSV：选个文件 → 直接变成一个表格节点 */
    ['从 CSV 导入…', '变成一个表格节点', () => importCSV()],
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
      say('* 加了节点' + tagOf(n) + '。');
    }],
    ['图片…', '也可以直接把图片拖进窗口', () => pickImageFile()],
    /* ★ 多媒体节点的两种源都给直接入口（直接写地址，不用先建空节点再换源）：
         网页链接——原样用；相对地址——自动补 user/ 前缀，文件放 user/ 里。
       上面那条「图片…」是内嵌（data:），文档会变大。 */
    ['网页链接…', '填 https:// 地址，Ctrl+左键打开', () => {
      openValueBox({
        title:'网页链接', who:'新节点',
        hint:'http:// 或 https:// 开头的地址。**没写协议头的话会自动补 https://**'
           + '（example.com → https://example.com）。'
           + '建好之后 Ctrl + 左键打开（和 Word 里一样）。',
        fields:[{ key:'url', label:'地址', type:'text', placeholder:'example.com 或 https://example.com' }],
        values:{ url:'' },
        onOk: (vals) => {
          const typed = String(vals.url == null ? '' : vals.url).trim();
          if (!typed) return;
          /* ★ 没写 http(s):// 就自动补 https://（用户要的）。
             只在**这个入口**补 —— 「相对地址…」和「换源…」不能补：
             那两处的 pic.png 是相对地址、data: 是内嵌数据，
             补上 https:// 就全坏了。 */
          const v = (typeof mediaUrlOf === 'function') ? mediaUrlOf(typed) : typed;
          if (typeof mediaSrcAllowed === 'function' && !mediaSrcAllowed(v)){
            say('* 这个地址不让用。');
            return;
          }
          const c = viewCenter();
          const n = addNodeAt(v, Math.round(c.x - 120), Math.round(c.y - 24), 'rect');
          n.kind = 'image'; n.src = v;
          reindex(); sizeNode(n); reindex(); sizeAll();
          selectOnly(n.id); pushHist(); mark();
          /* 补过就明说补成了什么（长地址不进提示语，底栏放不下） */
          say(v !== typed ? '* 加了网页节点，已补成 https:// 开头。' : '* 加了网页节点。');
        }
      });
    }],
    ['相对地址…', '写 user/ 里的文件名', () => {
      openValueBox({
        title:'相对地址', who:'新节点',
        hint:'写 user/ 里的文件名就行（pic.png 等于 user/pic.png）。'
           + ' ../ 开头的是从根往上走。类型按扩展名自动判。',
        fields:[{ key:'src', label:'地址', type:'text', placeholder:'pic.png / video/clip.mp4' }],
        values:{ src:'' },
        onOk: (vals) => {
          const v = String(vals.src == null ? '' : vals.src).trim();
          if (!v) return;
          if (typeof mediaSrcAllowed === 'function' && !mediaSrcAllowed(v)){
            say('* 这个地址不让用。');
            return;
          }
          const c = viewCenter();
          const n = addNodeAt(v, Math.round(c.x - 120), Math.round(c.y - 24), 'rect');
          n.kind = 'image'; n.src = v;
          reindex(); sizeNode(n); reindex(); sizeAll();
          selectOnly(n.id); pushHist(); mark();
          say('* 加了媒体节点（' + mediaKindLabelOf(n) + '）。');
        }
      });
    }],
    ['嵌入 Grapheon…', '整份文档当一个封闭节点', () => pickEmbedFile()],
    'hr',
    ['变量定义节点', '单一变量 / 滑块 / 列表 / 地图，右键可切', () => {
      const c = viewCenter();
      const n = addVarNode('x', Math.round(c.x - 137), Math.round(c.y - 50));
      selectOnly(n.id); pushHist(); mark();
    }],
    ['运算符节点', '+ - * / 可以叠加', () => {
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
    ['条件节点', '输入为 1 时把所填的值放出去', () => {
      const c = viewCenter();
      const n = addControlNode('cond', Math.round(c.x - 140), Math.round(c.y - 60));
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
