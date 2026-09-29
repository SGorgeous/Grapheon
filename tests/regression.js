/* ==========================================================================
   GRAPHEON · tests/regression.js
   在真实浏览器里跑的断言套件。用 node tests/run.mjs 执行。
   直接操作全局的模块函数（它们都是普通脚本，共享同一个全局作用域）。
   ========================================================================== */
(async function () {
  const log = [];
  const errors = [];
  window.addEventListener('error', e => errors.push(e.message + ' @' + e.lineno));
  const ok = (n, c, x) => log.push((c ? 'PASS' : 'FAIL') + ' | ' + n + (x !== undefined ? ' | ' + x : ''));
  const T = (n, f) => { try { f(); } catch (e) { log.push('THROW | ' + n + ' | ' + e.message); } };
  const TA = async (n, f) => { try { await f(); } catch (e) { log.push('THROW | ' + n + ' | ' + e.message); } };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const cv = document.getElementById('stage');
  const $ = (s) => document.querySelector(s);

  function key(k, opts){
    window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key:k, bubbles:true, cancelable:true }, opts || {})));
    if (editing) commitEdit();
  }
  const keyRaw = (k, opts) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key:k, bubbles:true, cancelable:true }, opts || {})));
  function pe(type, x, y, extra){
    cv.dispatchEvent(new PointerEvent(type, Object.assign({
      clientX:x, clientY:y, bubbles:true, cancelable:true,
      pointerId:1, pointerType:'mouse', isPrimary:true, button:0,
      buttons: type === 'pointerup' ? 0 : 1
    }, extra || {})));
  }
  const S = (wp) => w2s(wp);
  const center = (n) => S({ x:n.x + n.w / 2, y:n.y + n.h / 2 });
  const overlaps = () => {
    const bad = [];
    for (let i = 0; i < doc.nodes.length; i++) for (let j = i + 1; j < doc.nodes.length; j++){
      const a = doc.nodes[i], b = doc.nodes[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push(a.text + '×' + b.text);
    }
    return bad;
  };
  const dupIds = () => {
    const all = [...doc.nodes.map(n => n.id), ...doc.edges.map(e => e.id)];
    return all.filter((v, i) => all.indexOf(v) !== i);
  };
  function fresh(mode){
    deserialize(demoDoc()); reindex(); sizeAll(); layoutMind(); initHist(); fitView(); sel.clear();
    doc.mode = mode || 'mind'; doc.autoLayout = (doc.mode === 'mind');
    if (doc.mode === 'mind') layoutMind();
    syncButtons(); mark();
  }
  /* 数一块矩形里有几个非黑像素（用来判断「这块地方画了东西没有」） */
  function litPixels(canvas, x0, y0, x1, y1){
    const g = canvas.getContext('2d');
    const w = Math.max(1, Math.min(canvas.width, x1) - x0), h = Math.max(1, Math.min(canvas.height, y1) - y0);
    const d = g.getImageData(x0, y0, w, h).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 120) n++;
    return n;
  }

  /* 先把上次运行可能留下的状态清干净，保证断言可重复（手动打开本页跑两次也一致） */
  try {
    ['grapheon.export.v1', 'grapheon.keymap.v1', 'grapheon.theme.v1'].forEach(k => localStorage.removeItem(k));
  } catch (e) {}
  expNameEl.value = '';
  expTitleEl.value = '';
  GP.keys.reset();
  applyTheme('undertale');

  /* ==================== 架构 ==================== */
  T('A01 源码已模块化（不是塞回单个 html）', () => {
    const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
    ok('A01 至少 20 个外部模块', srcs.length >= 20, srcs.length + ' 个');
    ok('A01b 按目录分类', srcs.some(s => s.startsWith('src/core/')) && srcs.some(s => s.startsWith('src/view/')) &&
      srcs.some(s => s.startsWith('src/interact/')) && srcs.some(s => s.startsWith('src/ui/')) &&
      srcs.some(s => s.startsWith('src/app/')));
    ok('A01c 样式已外置', !!document.querySelector('link[rel=stylesheet][href^="styles/"]'));
    ok('A01d 暴露了扩展点 GP', typeof GP === 'object' && typeof GP.keys === 'object');
    // run.mjs 会在 <head> 最前面注入这个收集器；模块是加载期就抛错的，测试脚本最后才跑，
    // 靠测试自己监听 window.onerror 收不到更早的错误（这正是保存/导出失效被漏掉的原因）
    ok('A01e 加载期没有未捕获错误', !window.__loadErrors || window.__loadErrors.length === 0,
      (window.__loadErrors || []).join(' | ') || '无');
  });

  /* ==================== 顶栏装配（加载顺序陷阱）====================
     踩过的坑：toolbar.js 曾经排在 document.js 前面，`onclick = saveFile` 在加载期
     就把函数当值取出来 → ReferenceError → 该行之后的所有绑定一起失效，
     保存/导出/居中/帮助四个按钮全废，而测试因为直接调函数所以全绿。 */
  T('A02 顶栏每个按钮都绑上了处理函数', () => {
    const ids = ['b-mind','b-flow','b-tidy','b-undo','b-redo','b-new',
                 'b-open','b-save','b-png','b-fit','b-help'];
    const missing = ids.filter(id => {
      const b = document.getElementById(id);
      return !b || typeof b.onclick !== 'function';
    });
    ok('A02 全部已绑定', missing.length === 0, missing.length ? '未绑定：' + missing.join(',') : '11/11');
  });
  T('A03 每个按钮点下去都有效果（不是空绑定）', () => {
    const origDL = downloadBlob;
    let dl = null;
    downloadBlob = (blob, filename) => { dl = { size: blob && blob.size, type: blob && blob.type, filename }; };

    const cases = [
      ['b-mind', () => doc.mode === 'mind'],
      ['b-flow', () => doc.mode === 'flow'],
      ['b-tidy', () => doc.autoLayout === true],
      ['b-new',  () => ctxEl.style.display === 'block'],
      ['b-open', () => true],                       // 拉起文件选择框，headless 里无副作用
      ['b-save', () => dl && /^grapheon-\d{4}-\d{2}-\d{2}\.json$/.test(dl.filename) && dl.size > 100],
      ['b-png',  () => expEl.style.display === 'block'],
      ['b-fit',  () => true],
      ['b-help', () => helpEl.style.display === 'block'],
      ['b-undo', () => true],
      ['b-redo', () => true]
    ];
    const bad = [];
    for (const [id, check] of cases){
      fresh('mind'); sel.clear();
      expEl.style.display = 'none'; helpEl.style.display = 'none'; hideCtx();
      dl = null;
      try { document.getElementById(id).click(); }
      catch (e){ bad.push(id + ':抛异常(' + e.message + ')'); continue; }
      if (!check()) bad.push(id + ':无效果');
    }
    expEl.style.display = 'none'; helpEl.style.display = 'none'; hideCtx();
    downloadBlob = origDL;
    ok('A03 11 个按钮全部生效', bad.length === 0, bad.join(' '));
  });
  T('A04 保存走的是统一下载通道，内容是真 JSON', () => {
    fresh('mind');
    const origDL = downloadBlob;
    let got = null;
    downloadBlob = (blob, filename) => { got = { blob, filename }; };
    saveFile();
    downloadBlob = origDL;
    ok('A04 调用了 downloadBlob', !!got);
    ok('A04b 文件名是 grapheon-日期.json', got && /^grapheon-\d{4}-\d{2}-\d{2}\.json$/.test(got.filename), got && got.filename);
    ok('A04c MIME 是 application/json', got && got.blob.type === 'application/json', got && got.blob.type);
    skipDlg();   // 对白栏是打字机效果，先让它一次吐完
    ok('A04d 对白栏有反馈', /已保存为/.test(dlgText.textContent), dlgText.textContent);
  });

  /* ==================== 主题 ==================== */
  T('Z01 Unifont 生效且字号对齐 16 的整数倍', () => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '16px ' + FONT;
    ok('Z01 ASCII = 8px/字', Math.abs(c.measureText('MMMMMMMMMM').width - 80) < 0.5);
    ok('Z01b CJK = 16px/字', Math.abs(c.measureText('中中中中中').width - 80) < 0.5);
    ok('Z01c FS=16 / FS_BIG=32', FS === 16 && FS_BIG === 32);
    ok('Z01d 无粗体（Unifont 只有 Regular）', doc.nodes.every(n => n.fw === 'normal'));
  });
  T('Z02 主题：调色板与 CSS 变量联动', () => {
    applyTheme('undertale');
    const cssVar = (n) => document.documentElement.style.getPropertyValue(n).trim();
    ok('Z02 内置主题存在', themeIds().indexOf('undertale') >= 0);
    ok('Z02b C 与 CSS 变量一致 (--w)', C.white === cssVar('--w') && C.white === '#ffffff', C.white + ' / ' + cssVar('--w'));
    ok('Z02c C 与 CSS 变量一致 (--bg)', C.bg === cssVar('--bg'), C.bg + ' / ' + cssVar('--bg'));
    ok('Z02d 变量映射表覆盖全部颜色键', Object.keys(THEME_VARS).every(k => C[k] != null));
  });
  T('Z03 主题：注册第三个主题后画布与 DOM 同时变', () => {
    THEMES.__probe = { label:'Probe', canvas:{ bg:'#001122', white:'#00ff00', yellow:'#00ffff',
                                               red:'#ff00ff', gray:'#333333', dim:'#222222', grid:'#010203' } };
    applyTheme('__probe');
    ok('Z03 画布调色板已换', C.white === '#00ff00' && C.bg === '#001122', C.white + ' / ' + C.bg);
    ok('Z03b CSS 变量已换', document.documentElement.style.getPropertyValue('--w').trim() === '#00ff00');
    ok('Z03c themeId 已更新', themeId === '__probe', themeId);
    const c = buildExportCanvas();
    ok('Z03d 换主题后仍能正常出图', c.width > 200 && litPixels(c, 0, 0, c.width, c.height) > 0);
    applyTheme('undertale');
    delete THEMES.__probe;
    ok('Z03e 已还原', C.white === '#ffffff' && themeId === 'undertale' && !THEMES.__probe);
  });
  T('Z04 主题：选择会落盘', () => {
    applyTheme('undertale');
    loadTheme();
    ok('Z04 loadTheme 后仍是 undertale', themeId === 'undertale', themeId);
  });

  /* ==================== 核心 ==================== */
  fresh('mind');
  const root = doc.nodes.find(n => isRoot(n));
  T('C01 初始结构', () => {
    ok('C01 11 节点 / 10 连线', doc.nodes.length === 11 && doc.edges.length === 10, doc.nodes.length + '/' + doc.edges.length);
    ok('C01b 单根且放大', doc.nodes.filter(n => isRoot(n)).length === 1 && root.big === true);
    ok('C01c 全部已度量', doc.nodes.every(n => Array.isArray(n.lines) && n.w > 0 && n.h > 0));
  });
  T('C02 思维导图两侧分布且无重叠', () => {
    doc.autoLayout = true; relayout();
    const kids = idx.children.get(root.id).map(id => byId(id));
    const L = kids.filter(k => k.x + k.w <= root.x), R = kids.filter(k => k.x >= root.x + root.w);
    ok('C02 左右都有分支', L.length > 0 && R.length > 0, 'L=' + L.length + ' R=' + R.length);
    ok('C02b 无重叠', overlaps().length === 0, overlaps().join(' '));
  });
  T('C03 流程图正交布线', () => {
    setMode('flow');
    let bad = 0;
    for (const e of doc.edges){
      const g = edgeGeomFor(e);
      if (!g || g.type !== 'p' || g.pts.length < 2){ bad++; continue; }
      if (g.pts.some(p => !isFinite(p.x) || !isFinite(p.y))) bad++;
      for (let i = 0; i < g.pts.length - 1; i++){
        const a = g.pts[i], b = g.pts[i + 1];
        if (Math.abs(a.x - b.x) > 0.6 && Math.abs(a.y - b.y) > 0.6) bad++;
      }
    }
    ok('C03 全部水平/垂直', bad === 0, 'bad=' + bad + ' / ' + doc.edges.length);
  });
  T('C04 各种形状', () => {
    for (const s of ['rect', 'round', 'diamond', 'oval']){
      const n = doc.nodes[0];
      selectOnly(n.id); setShape(s);
      if (n.shape !== s || !(n.w > 0 && n.h > 0)) throw new Error('shape ' + s);
    }
    ok('C04 四种形状均可用', true); setShape('rect');
  });
  T('C05 命中测试', () => {
    const n = doc.nodes[2];
    ok('C05 hitNode 中心命中', hitNode({ x:n.x + n.w / 2, y:n.y + n.h / 2 }) === n);
    ok('C05b hitNode 空白不误伤', hitNode({ x:n.x - 9999, y:n.y - 9999 }) === null);
    selectOnly(n.id);
    const p = hitPort(anchorsFor(n).r);
    ok('C05c hitPort 命中右端口', !!p && p.side === 'r');
    const e = doc.edges.find(x => byId(x.s) && byId(x.t));
    ok('C05d hitEdge 命中连线', hitEdge(edgeGeomFor(e).mid) === e);
  });
  T('C06 坐标换算', () => {
    const p = { x:123.4, y:-56.7 };
    const b = s2w(w2s(p).x, w2s(p).y);
    ok('C06 往返一致', Math.abs(b.x - p.x) < 1e-6 && Math.abs(b.y - p.y) < 1e-6);
    const z0 = view.z; zoomAt(800, 500, 1.5);
    ok('C06b 缩放生效', view.z > z0);
    const s = w2s(s2w(800, 500));
    ok('C06c 光标锚点不动', Math.abs(s.x - 800) < 1e-6 && Math.abs(s.y - 500) < 1e-6);
    fitView();
  });
  T('C07 序列化往返', () => {
    const n0 = doc.nodes.length, e0 = doc.edges.length;
    deserialize(JSON.parse(JSON.stringify(serialize())));
    ok('C07 数量一致', doc.nodes.length === n0 && doc.edges.length === e0, n0 + '/' + e0);
    ok('C07b 无重复 id', dupIds().length === 0, dupIds().join(','));
    ok('C07c 全部可度量', doc.nodes.every(n => n.w > 0 && n.h > 0));
  });
  T('C08 画布绘制有内容', () => {
    const c = buildExportCanvas();
    ok('C08 画布尺寸合理', c.width > 200 && c.height > 200, c.width + 'x' + c.height);
    const total = Math.floor(c.width / 4) * Math.floor(c.height / 4);
    const lit = Math.floor(litPixels(c, 0, 0, c.width, c.height) / 16);
    const pct = (lit / total) * 100;
    ok('C08b 非黑占比合理', pct > 1 && pct < 80, pct.toFixed(1) + '%');
  });

  /* ==================== 方向生成 ==================== */
  fresh('mind');
  const R2 = doc.nodes.find(n => isRoot(n));
  T('D01 →/D 生成子节点', () => {
    const b = doc.nodes.length;
    selectOnly(R2.id); key('ArrowRight');
    ok('D01 节点 +1', doc.nodes.length === b + 1);
    ok('D01b 是根的子节点', idx.parent.get([...sel][0]) === R2.id);
  });
  T('D02 ↑/↓ 兄弟前后顺序', () => {
    const kids = idx.children.get(R2.id);
    const ref = byId(kids[1]);
    selectOnly(ref.id); key('ArrowUp');
    const up = [...sel][0];
    ok('D02 插在 ref 之前', idx.children.get(R2.id).indexOf(up) === idx.children.get(R2.id).indexOf(ref.id) - 1);
    selectOnly(ref.id); key('ArrowDown');
    const dn = [...sel][0];
    ok('D02b 插在 ref 之后', idx.children.get(R2.id).indexOf(dn) === idx.children.get(R2.id).indexOf(ref.id) + 1);
  });
  T('D03 ← 插入父节点', () => {
    const target = doc.nodes.find(n => n.text === '流程图');
    const oldParent = idx.parent.get(target.id);
    selectOnly(target.id); key('ArrowLeft');
    const np = [...sel][0];
    ok('D03 新节点成为 target 的父', idx.parent.get(target.id) === np);
    ok('D03b 新节点的父是原来的父', idx.parent.get(np) === oldParent);
  });
  T('D04 对根按 ← 产生新根', () => {
    const oldRoot = doc.nodes.find(n => isRoot(n));
    selectOnly(oldRoot.id); key('ArrowLeft');
    const np = [...sel][0];
    ok('D04 新节点没有父', !idx.parent.has(np));
    ok('D04b 旧根成为它的子', idx.parent.get(oldRoot.id) === np);
    ok('D04c 仍然只有一个根', doc.nodes.filter(n => isRoot(n)).length === 1);
    ok('D04d 无重叠', overlaps().length === 0, overlaps().join(' '));
  });
  T('D05 Alt / 无选中 不误触发', () => {
    const r = doc.nodes.find(n => isRoot(n));
    selectOnly(r.id);
    const b = doc.nodes.length;
    key('ArrowLeft', { altKey:true });
    ok('D05 Alt+← 不新建', doc.nodes.length === b);
    selectOnly(null);
    key('ArrowRight'); key('d'); key('w');
    ok('D05b 无选中不新建', doc.nodes.length === b);
  });
  fresh('flow');
  T('F01 四个方向空间生成', () => {
    const a = doc.nodes.find(n => n.text === 'GRAPHEON');
    const made = {};
    for (const [k, d] of [['ArrowRight','R'], ['ArrowLeft','L'], ['ArrowUp','U'], ['ArrowDown','D']]){
      selectOnly(a.id); key(k); made[d] = byId([...sel][0]);
    }
    ok('F01b 右在右', made.R.x > a.x + a.w);
    ok('F01c 左在左', made.L.x + made.L.w < a.x);
    ok('F01d 上在上', made.U.y + made.U.h < a.y);
    ok('F01e 下在下', made.D.y > a.y + a.h);
    ok('F01f 无重叠', overlaps().length === 0, overlaps().join(' '));
  });
  T('F02 连续生成不重叠', () => {
    const a = doc.nodes.find(n => n.text === 'GRAPHEON');
    selectOnly(a.id); key('ArrowRight');
    let cur = byId([...sel][0]);
    const chain = [cur];
    for (let i = 0; i < 4; i++){ selectOnly(cur.id); key('ArrowRight'); cur = byId([...sel][0]); chain.push(cur); }
    const xs = chain.map(n => n.x);
    ok('F02 链上 x 递增', xs.every((v, i) => i === 0 || v > xs[i - 1]), JSON.stringify(xs.map(Math.round)));
    ok('F02b 无重叠', overlaps().length === 0, overlaps().join(' '));
  });

  /* ==================== 快捷键表 ==================== */
  T('K01 comboOf 归一化', () => {
    const c = (o) => GP.keys.comboOf(Object.assign({ key:'', ctrlKey:false, altKey:false, shiftKey:false }, o));
    ok('K01 ctrl+shift+z', c({ key:'Z', ctrlKey:true, shiftKey:true }) === 'ctrl+shift+z', c({ key:'Z', ctrlKey:true, shiftKey:true }));
    ok('K01b 单独 Shift+w 归一到 w', c({ key:'W', shiftKey:true }) === 'w', c({ key:'W', shiftKey:true }));
    ok('K01c 空格 → space', c({ key:' ' }) === 'space', c({ key:' ' }));
    ok('K01d alt+方向键带 alt 前缀', c({ key:'ArrowLeft', altKey:true }) === 'alt+arrowleft');
    ok('K01e Shift+↑ 不带 shift（避免误按失效）', c({ key:'ArrowUp', shiftKey:true }) === 'arrowup');
    ok('K01f ? 保持原样', c({ key:'?' , shiftKey:true }) === '?');
  });
  T('K02 默认键位完整且动作都存在', () => {
    const b = GP.keys.bindings;
    ok('K02 Tab → 子节点', b['tab'] === 'node.child');
    ok('K02b WASD 与方向键都有', ['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].every(k => !!b[k]));
    ok('K02c Ctrl+方向键 = 跳转', b['ctrl+arrowright'] === 'node.nav.right');
    ok('K02d 全部绑定都指向已注册动作', Object.keys(b).every(k => !!GP.keys.actions[b[k]]), 
      Object.keys(b).filter(k => !GP.keys.actions[b[k]]).join(','));
    ok('K02e 动作表带中文标签（给未来设置面板用）', Object.values(GP.keys.actions).every(a => a.label && a.group));
  });
  T('K03 运行时改键生效并落盘', () => {
    fresh('mind');
    GP.keys.reset();
    const n = doc.nodes.find(x => x.text === '流程图');
    const before = doc.nodes.length;
    selectOnly(n.id);
    keyRaw('d');                      // 默认 d = 向右生成
    if (editing) commitEdit();
    ok('K03 默认 d 会生成节点', doc.nodes.length === before + 1, doc.nodes.length);

    // 一个动作只保留一个键：把 node.delete 改绑到 ctrl+d，原来的 delete/backspace 就该被释放
    GP.keys.bind('ctrl+d', 'node.delete');
    let b = GP.keys.bindings;
    ok('K03b 原键位已释放', !b['delete'] && !b['backspace'], JSON.stringify([b['delete'], b['backspace']]));
    ok('K03c ctrl+d 已绑定', b['ctrl+d'] === 'node.delete');
    ok('K03d d 不受影响（它绑的是另一个动作）', b['d'] === 'node.spawn.right', b['d']);
    ok('K03e 已写进 localStorage', (localStorage.getItem('grapheon.keymap.v1') || '').indexOf('ctrl+d') >= 0);

    GP.keys.load();                   // 从 localStorage 重新读一遍，验证落盘
    b = GP.keys.bindings;
    ok('K03f load 后仍是改过的键位', b['ctrl+d'] === 'node.delete' && !b['delete'], JSON.stringify(b['ctrl+d']));

    fresh('mind');
    const m = doc.nodes.find(x => x.text === '快捷键');
    const cnt0 = doc.nodes.length;
    selectOnly(m.id);
    keyRaw('d');
    if (editing) commitEdit();
    ok('K03g d 仍然生成节点', doc.nodes.length === cnt0 + 1, doc.nodes.length);

    const cnt1 = doc.nodes.length;
    const m2 = doc.nodes.find(x => x.text === '快捷键') || byId([...sel][0]);
    selectOnly(m2.id);
    keyRaw('d', { ctrlKey:true });
    if (editing) commitEdit();
    ok('K03h ctrl+d 触发删除', doc.nodes.length < cnt1, cnt1 + ' -> ' + doc.nodes.length);

    GP.keys.unbind('w');
    ok('K03i w 已解绑', !GP.keys.bindings['w']);
    selectOnly(doc.nodes[0].id);
    const cnt2 = doc.nodes.length;
    keyRaw('w');
    if (editing) cancelEdit();
    ok('K03j 解绑后 w 不再生成节点', doc.nodes.length === cnt2, doc.nodes.length);

    GP.keys.reset();
    const d = GP.keys.bindings;
    ok('K03k reset 后恢复默认', d['d'] === 'node.spawn.right' && d['delete'] === 'node.delete' && !d['ctrl+d']);
  });
  T('K04 开面板时全局快捷键被屏蔽，Esc 例外', () => {
    fresh('mind'); sel.clear();
    openExport();
    const before = doc.nodes.length;
    for (const k of ['w', 'd', 'Tab', 'Enter', 'ArrowDown']) keyRaw(k);
    ok('K04 节点数不变', doc.nodes.length === before, doc.nodes.length + ' vs ' + before);
    ok('K04b 面板仍开着', expEl.style.display === 'block');
    keyRaw('Escape');
    ok('K04c Esc 关闭面板', expEl.style.display === 'none');
  });
  T('K05 输入框聚焦时不误触发', () => {
    const before = doc.nodes.length;
    expEl.style.display = 'block';
    for (const k of ['w', 'a', 's', 'd', 'ArrowRight']){
      expNameEl.dispatchEvent(new KeyboardEvent('keydown', { key:k, bubbles:true, cancelable:true }));
    }
    ok('K05 节点数不变', doc.nodes.length === before, doc.nodes.length);
    expEl.style.display = 'none';
  });
  T('K06 帮助浮层里 h/? 关闭、其它键不穿透', () => {
    fresh('mind'); sel.clear();
    openHelp();
    const before = doc.nodes.length;
    keyRaw('w'); keyRaw('d');
    ok('K06 帮助打开时不生成节点', doc.nodes.length === before, doc.nodes.length);
    ok('K06b 帮助仍开着', helpEl.style.display === 'block');
    keyRaw('h');
    ok('K06c h 关闭帮助', helpEl.style.display === 'none');
  });

  /* ==================== 鼠标 ==================== */
  fresh('mind');
  const R3 = doc.nodes.find(n => isRoot(n));
  T('I01 点击选中 / 空白取消', () => {
    const c = center(R3);
    pe('pointerdown', c.x, c.y); pe('pointerup', c.x, c.y);
    ok('I01 选中根节点', sel.size === 1 && sel.has(R3.id));
    pe('pointerdown', 40, 700); pe('pointerup', 40, 700);
    ok('I01b 空白清空选择', sel.size === 0);
  });
  T('I02 拖空白平移', () => {
    const x0 = view.x, y0 = view.y;
    pe('pointerdown', 300, 720); pe('pointermove', 400, 780); pe('pointerup', 400, 780);
    ok('I02 视图已平移', Math.abs(view.x - x0 - 100) < 2 && Math.abs(view.y - y0 - 60) < 2);
    view.x = x0; view.y = y0; mark();
  });
  T('I03 拖拽节点', () => {
    const c = center(R3), x0 = R3.x, y0 = R3.y;
    pe('pointerdown', c.x, c.y); pe('pointermove', c.x + 70, c.y + 40); pe('pointerup', c.x + 70, c.y + 40);
    ok('I03 节点已位移', Math.abs(R3.x - x0 - 70 / view.z) < 2 && Math.abs(R3.y - y0 - 40 / view.z) < 2);
    ok('I03b 自动布局已关闭', doc.autoLayout === false);
  });
  T('I04 端口拉线', () => {
    doc.autoLayout = true; relayout();
    const a = doc.nodes.find(n => n.text === '流程图');
    const b = doc.nodes.find(n => n.text === '快捷键');
    const before = doc.edges.length;
    selectOnly(a.id); mark();
    const port = S(anchorsFor(a).r), tgt = center(b);
    pe('pointerdown', port.x, port.y);
    ok('I04 进入连线态', !!linking && linking.side === 'r');
    pe('pointermove', tgt.x, tgt.y); pe('pointerup', tgt.x, tgt.y);
    ok('I04b 新增连线', doc.edges.length === before + 1 && doc.edges.some(e => e.s === a.id && e.t === b.id));
    ok('I04c 状态已退出', !linking && !drag);
  });
  T('I05 框选', () => {
    sel.clear(); mark();
    const p1 = S({ x:bboxAll().minX - 60, y:bboxAll().minY - 60 });
    const p2 = S({ x:bboxAll().maxX + 60, y:bboxAll().maxY + 60 });
    pe('pointerdown', p1.x, p1.y, { shiftKey:true });
    pe('pointermove', p2.x, p2.y, { shiftKey:true });
    ok('I05 框选中', !!marquee);
    pe('pointerup', p2.x, p2.y, { shiftKey:true });
    ok('I05b 选中全部', sel.size === doc.nodes.length, sel.size + '/' + doc.nodes.length);
  });
  T('I06 双击空白新建 / 双击改名 / 双击连线加标签', () => {
    const before = doc.nodes.length;
    const wp = S({ x:bboxAll().minX - 200, y:bboxAll().maxY + 100 });
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:wp.x, clientY:wp.y, bubbles:true, cancelable:true }));
    ok('I06 节点 +1', doc.nodes.length === before + 1);
    ok('I06b 编辑器打开', !!editing && editor.style.display === 'block');
    commitEdit();
    const n = doc.nodes.find(x => x.text === '流程图');
    const c = center(n);
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    ok('I06c 回填原文', !!editing && editor.value === '流程图');
    cancelEdit();
    const e = doc.edges.find(x => x.label === '');
    const m = S(edgeGeomFor(e).mid);
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:m.x, clientY:m.y, bubbles:true, cancelable:true }));
    ok('I06d 进入连标签编辑', !!editing && editing.kind === 'edge');
    if (editing){ editor.value = '是'; editor.dispatchEvent(new Event('input', { bubbles:true })); commitEdit(); }
    ok('I06e 标签写入', e.label === '是');
  });
  T('I07 滚轮缩放', () => {
    const z0 = view.z;
    cv.dispatchEvent(new WheelEvent('wheel', { clientX:700, clientY:400, deltaY:-240, bubbles:true, cancelable:true }));
    ok('I07 放大', view.z > z0);
    const z1 = view.z;
    cv.dispatchEvent(new WheelEvent('wheel', { clientX:700, clientY:400, deltaY:240, bubbles:true, cancelable:true }));
    ok('I07b 缩小', view.z < z1);
    fitView();
  });
  T('I08 右键菜单经通用 showMenu 路由', () => {
    const n = doc.nodes.find(x => x.text === '快捷键');
    const c = center(n);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    ok('I08 菜单显示', ctxEl.style.display === 'block' && ctxEl.querySelectorAll('.item').length > 0,
      ctxEl.querySelectorAll('.item').length + ' 项');
    const before = doc.nodes.length;
    ctxEl.querySelectorAll('.item')[0].click();
    ok('I08b 菜单项可执行', doc.nodes.length === before + 1);
    ok('I08c 菜单已关闭', ctxEl.style.display === 'none');
    if (editing) commitEdit();
  });
  T('I09 撤销恢复拖拽位置', () => {
    const n = doc.nodes[0], c0 = { x:n.x, y:n.y };
    selectOnly(n.id);
    const s = center(n);
    pe('pointerdown', s.x, s.y); pe('pointermove', s.x + 120, s.y); pe('pointerup', s.x + 120, s.y);
    undo();
    ok('I09 位置已回退', Math.abs(byId(n.id).x - c0.x) < 2);
  });

  /* ==================== 新建菜单 ==================== */
  T('N01 顶栏「新建」弹出菜单', () => {
    fresh('mind');
    $('#b-new').click();
    ok('N01 菜单显示', ctxEl.style.display === 'block');
    const items = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('N01b 有「空白文件」和「示例文档」', items.some(t => t.indexOf('空白文件') === 0) && items.some(t => t.indexOf('示例文档') === 0),
      items.join(' / '));
  });
  T('N02 新建空白文件', () => {
    $('#b-new').click();
    const blank = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('空白文件') === 0);
    blank.click();
    ok('N02 只剩 1 个节点', doc.nodes.length === 1, doc.nodes.length);
    ok('N02b 没有连线', doc.edges.length === 0);
    ok('N02c 是思维导图 + 自动布局', doc.mode === 'mind' && doc.autoLayout === true);
    ok('N02d 中心节点已被选中', sel.size === 1 && sel.has(doc.nodes[0].id));
    ok('N02e 光杆中心节点也用大号字', doc.nodes[0].big === true);
    ok('N02f 菜单已关闭', ctxEl.style.display === 'none');
    ok('N02g 可以直接开始生长', (() => {
      const b = doc.nodes.length;
      key('Tab');
      const grew = doc.nodes.length === b + 1;
      if (editing) cancelEdit();
      return grew;
    })());
  });
  T('N03 新建示例文档', () => {
    $('#b-new').click();
    const demo = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('示例文档') === 0);
    demo.click();
    ok('N03 恢复成 11 节点', doc.nodes.length === 11, doc.nodes.length);
    ok('N03b 历史已重置', typeof hist.i === 'number' && hist.i === 0, hist.i);
  });
  T('N04 菜单会被「点击别处」收起', () => {
    fresh('mind');
    $('#b-new').click();
    ok('N04 先打开', ctxEl.style.display === 'block');
    pe('pointerdown', 700, 500); pe('pointerup', 700, 500);
    ok('N04b 点画布后收起', ctxEl.style.display === 'none');
  });

  /* ==================== 导出 ==================== */
  fresh('mind');
  T('E01 面板结构：标题 / 文件名 / 三个范围', () => {
    sel.clear();
    openExport();
    ok('E01 面板可见', expEl.style.display === 'block');
    ok('E01b 有标题输入框', !!expTitleEl);
    ok('E01c 默认文件名带日期', /^grapheon-\d{4}-\d{2}-\d{2}$/.test(expNameEl.value), expNameEl.value);
    ok('E01d 三个范围', expScopesEl.querySelectorAll('.opt').length === 3);
    const opts = [...expScopesEl.querySelectorAll('.opt')];
    ok('E01e 无选中时 sel/sub 不可用', opts[0].className.indexOf('off') < 0 &&
      opts[1].className.indexOf('off') >= 0 && opts[2].className.indexOf('off') >= 0);
  });
  T('E02 三种范围的集合与连线裁剪', () => {
    expScope = 'all'; renderScopes();
    ok('E02 全部 = 11 节点', currentExportSet().length === 11, currentExportSet().length);
    const a = doc.nodes.find(n => n.text === '流程图');
    const b = doc.nodes.find(n => n.text === '思维导图');
    sel.clear(); sel.add(a.id); sel.add(b.id); renderScopes();
    [...expScopesEl.querySelectorAll('.opt')][1].click();
    const picked = currentExportSet();
    ok('E02b 仅选中 = 2 节点', picked.length === 2);
    const ids = new Set(picked.map(n => n.id));
    ok('E02c 两端不都在集合内的连线被裁掉', doc.edges.filter(e => ids.has(e.s) && ids.has(e.t)).length === 0);
    const k = doc.nodes.find(n => n.text === '快捷键');
    selectOnly(k.id); renderScopes();
    [...expScopesEl.querySelectorAll('.opt')][2].click();
    const sub = currentExportSet();
    const want = 1 + descendants(k.id).length;
    ok('E02d 子树 = 自身 + 全部子孙', sub.length === want, sub.length + ' vs ' + want);
    ok('E02e 不含无关节点', !sub.some(x => x.text === '流程图'));
  });
  T('E03 标题：净化、写入 info、画到左上角', () => {
    fresh('mind'); sel.clear();
    openExport();
    expScope = 'all'; renderScopes();
    ok('E03 sanitizeTitle 去掉换行', sanitizeTitle('第一行\n第二行\t带制表') === '第一行 第二行 带制表', sanitizeTitle('a\nb\tc'));
    expTitleEl.value = '季度流程复盘';
    updateExportInfo();
    ok('E03b info 里提示了标题', expInfoEl.textContent.indexOf('季度流程复盘') > 0, expInfoEl.textContent);

    const withTitle = buildExportCanvas(doc.nodes, '季度流程复盘');
    const bare = buildExportCanvas(doc.nodes, '');
    const band = [56, 40, 900, 110];
    const litWith = litPixels(withTitle, band[0], band[1], band[2], band[3]);
    const litBare = litPixels(bare, band[0], band[1], band[2], band[3]);
    ok('E03c 有标题时左上角有像素', litWith > 200, litWith);
    ok('E03d 无标题时左上角是空的', litBare === 0, litBare);
    ok('E03e 标题确实画在左上（在顶部 1/4 区域内）', litWith > 0 && band[3] < withTitle.height / 4);
  });
  T('E04 标题过长会截断，不会压到边框', () => {
    const long = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常长的标题用来测试截断行为';
    const one = doc.nodes.find(x => x.text === '流程图');
    const c = buildExportCanvas([one], long);       // 单节点 → 画布很窄
    const g = c.getContext('2d');
    setFont(g, FS_BIG, 'normal');
    const maxW = c.width - 112;
    const full = g.measureText(long).width;
    ok('E04 画布确实装不下整条标题', full > maxW, full.toFixed(0) + ' > ' + maxW);
    const t = fitText(g, long, maxW);
    ok('E04b 已截断并加省略号', t.length < long.length && t.slice(-1) === '…', t.length + '/' + long.length);
    ok('E04c 截断后不超宽', g.measureText(t).width <= maxW, g.measureText(t).width.toFixed(0) + ' <= ' + maxW);
  });
  T('E05 文件名净化', () => {
    ok('E05 非法字符替换', sanitizeFile('a/b:c*d?e"f<g>h|i') === 'a_b_c_d_e_f_g_h_i');
    ok('E05b 去掉尾部点和空格', sanitizeFile('name...  ') === 'name');
    ok('E05c 空值兜底', sanitizeFile('') === 'grapheon' && sanitizeFile('   ') === 'grapheon');
    ok('E05d 中文与空格保留', sanitizeFile('我的 流程图') === '我的 流程图');
  });
  T('E06 单节点导出尺寸精确 / 空画布不开面板', () => {
    const n = doc.nodes.find(x => x.text === '流程图');
    const c = buildExportCanvas([n]);
    ok('E06 尺寸 = 单节点包围盒', c.width === Math.ceil((n.w + 180) * 2) && c.height === Math.ceil((n.h + 180) * 2),
      c.width + 'x' + c.height);
    const keep = doc.nodes;
    doc.nodes = []; doc.edges = []; reindex(); relayout();
    expEl.style.display = 'none';
    openExport();
    ok('E06b 没有节点时不打开面板', expEl.style.display === 'none');
    deserialize(demoDoc()); reindex(); sizeAll(); relayout(); sel.clear(); mark();
  });
  await TA('E07 点「导出」真的产出 PNG，文件名与标题都带上', async () => {
    fresh('mind'); sel.clear();
    openExport();
    expNameEl.value = '我的/流程 图..';
    expTitleEl.value = '复盘 2026';
    expScope = 'all'; renderScopes();
    let got = null;
    const origDL = downloadBlob;
    downloadBlob = function (blob, filename){ got = { size: blob && blob.size, type: blob && blob.type, filename }; };
    $('#expGo').click();
    for (let i = 0; i < 40 && !got; i++) await sleep(25);
    ok('E07 触发了下载', !!got);
    if (got){
      ok('E07b 文件名已净化 + .png', got.filename === '我的_流程 图.png', got.filename);
      ok('E07c 是 PNG 且非空', got.type === 'image/png' && got.size > 2000, got.type + ' / ' + got.size);
    }
    ok('E07d 导出后面板自动关闭', expEl.style.display === 'none');
    downloadBlob = origDL;
  });
  T('E08 文件名/标题/范围会记住', () => {
    ok('E08 已落盘', (localStorage.getItem('grapheon.export.v1') || '').indexOf('我的_流程') >= 0 ||
      (localStorage.getItem('grapheon.export.v1') || '').indexOf('我的/流程') >= 0,
      localStorage.getItem('grapheon.export.v1'));
  });

  /* ==================== 收尾 ==================== */
  T('X01 全流程后仍无重复 id / 无孤儿', () => {
    fresh('mind');
    ok('X01 无重复 id', dupIds().length === 0, dupIds().join(','));
    ok('X01b 无孤儿节点', doc.nodes.filter(n => doc.edges.some(e => e.t === n.id)).every(n => idx.parent.has(n.id)));
    dirty = true; draw();
    ok('X01c draw 正常', true);
  });
  T('X02 红心光标：编辑器打开时画布上仍跟随', () => {
    fresh('mind'); fitView();
    const n = doc.nodes.find(x => x.text === '流程图');
    selectOnly(n.id); startEdit('node', n.id);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX:60, clientY:560, bubbles:true }));
    ok('X02 画布上红心可见', heartEl.style.display === 'block', heartEl.style.display);
    const r = editor.getBoundingClientRect();
    window.dispatchEvent(new MouseEvent('mousemove', {
      clientX:Math.round(r.left + r.width / 2), clientY:Math.round(r.top + r.height / 2), bubbles:true }));
    ok('X02b 编辑器上红心让位', heartEl.style.display === 'none', heartEl.style.display);
    cancelEdit();
  });
  T('X03 恢复默认状态', () => {
    GP.keys.reset(); applyTheme('undertale'); fresh('mind'); fitView();
    ok('X03 已回到示例文档', doc.nodes.length === 11);
  });

  const fails = log.filter(l => l.startsWith('FAIL') || l.startsWith('THROW'));
  const pre = document.createElement('pre');
  pre.id = 'testlog';
  pre.textContent = 'REGRESSION total=' + log.length + ' failed=' + fails.length + '\n' + log.join('\n') +
    (errors.length ? '\nJSERRORS:\n' + errors.join('\n') : '\nJSERRORS: none');
  pre.style.display = 'none';
  document.body.appendChild(pre);
})();
