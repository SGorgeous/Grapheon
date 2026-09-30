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
  const center0 = (n) => ({ x:n.x + n.w / 2, y:n.y + n.h / 2 });   // 世界坐标下的中心
  const nodeByText = (t) => doc.nodes.find(n => n.text === t);
  const rootNode = () => doc.nodes.find(n => isRoot(n));   // fresh() 会重建文档，别缓存节点引用
  const edgeOf = (s, t) => doc.edges.find(e => e.s === s.id && e.t === t.id);
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
  function fresh(){
    deserialize(demoDoc());
    reindex(); sizeAll(); layoutMind(); initHist(); fitView();
    sel.clear(); selEdgeId = null; mark();
  }
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
    // 靠测试自己监听 window.onerror 收不到更早的错误
    ok('A01e 加载期没有未捕获错误', !window.__loadErrors || window.__loadErrors.length === 0,
      (window.__loadErrors || []).join(' | ') || '无');
  });
  T('A02 顶栏每个按钮都绑上了处理函数', () => {
    const ids = ['b-tidy','b-undo','b-redo','b-new','b-open','b-save','b-png','b-fit','b-help'];
    const missing = ids.filter(id => {
      const b = document.getElementById(id);
      return !b || typeof b.onclick !== 'function';
    });
    ok('A02 全部已绑定', missing.length === 0, missing.length ? '未绑定：' + missing.join(',') : ids.length + '/' + ids.length);
    ok('A02b 模式按钮已移除', !document.getElementById('b-mind') && !document.getElementById('b-flow'));
  });
  T('A03 每个按钮点下去都有效果（不是空绑定）', () => {
    const origDL = downloadBlob;
    let dl = null;
    downloadBlob = (blob, filename) => { dl = { size: blob && blob.size, type: blob && blob.type, filename }; };
    const cases = [
      ['b-tidy', () => true],
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
      fresh();
      expEl.style.display = 'none'; helpEl.style.display = 'none';
      edgeBoxEl.style.display = 'none'; hideCtx();
      dl = null;
      try { document.getElementById(id).click(); }
      catch (e){ bad.push(id + ':抛异常(' + e.message + ')'); continue; }
      if (!check()) bad.push(id + ':无效果');
    }
    expEl.style.display = 'none'; helpEl.style.display = 'none';
    edgeBoxEl.style.display = 'none'; hideCtx();
    downloadBlob = origDL;
    ok('A03 9 个按钮全部生效', bad.length === 0, bad.join(' '));
  });
  T('A04 保存走的是统一下载通道，内容是真 JSON', () => {
    fresh();
    const origDL = downloadBlob;
    let got = null;
    downloadBlob = (blob, filename) => { got = { blob, filename }; };
    saveFile();
    downloadBlob = origDL;
    ok('A04 调用了 downloadBlob', !!got);
    ok('A04b 文件名是 grapheon-日期.json', got && /^grapheon-\d{4}-\d{2}-\d{2}\.json$/.test(got.filename), got && got.filename);
    ok('A04c MIME 是 application/json', got && got.blob.type === 'application/json', got && got.blob.type);
    skipDlg();
    ok('A04d 对白栏有反馈', /已保存为/.test(dlgText.textContent), dlgText.textContent);
  });

  /* ==================== 主题 / 字体 ==================== */
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
    ok('Z02 C 与 CSS 变量一致 (--w)', C.white === cssVar('--w') && C.white === '#ffffff');
    ok('Z02b C 与 CSS 变量一致 (--bg)', C.bg === cssVar('--bg'));
    ok('Z02c 变量映射表覆盖全部颜色键', Object.keys(THEME_VARS).every(k => C[k] != null));
  });
  T('Z03 主题：注册第三个主题后画布与 DOM 同时变', () => {
    THEMES.__probe = { label:'Probe', canvas:{ bg:'#001122', white:'#00ff00', yellow:'#00ffff',
                                               red:'#ff00ff', gray:'#333333', dim:'#222222', grid:'#010203' } };
    applyTheme('__probe');
    ok('Z03 画布调色板已换', C.white === '#00ff00' && C.bg === '#001122');
    ok('Z03b CSS 变量已换', document.documentElement.style.getPropertyValue('--w').trim() === '#00ff00');
    const c = buildExportCanvas();
    ok('Z03c 换主题后仍能正常出图', c.width > 200 && litPixels(c, 0, 0, c.width, c.height) > 0);
    applyTheme('undertale');
    delete THEMES.__probe;
    ok('Z03d 已还原', C.white === '#ffffff' && themeId === 'undertale' && !THEMES.__probe);
  });

  /* ==================== 核心结构 ==================== */
  fresh();
  const root = doc.nodes.find(n => isRoot(n));
  T('C01 初始结构', () => {
    ok('C01 12 节点 / 11 连线', doc.nodes.length === 12 && doc.edges.length === 11, doc.nodes.length + '/' + doc.edges.length);
    ok('C01b 单根且放大', doc.nodes.filter(n => isRoot(n)).length === 1 && root.big === true);
    ok('C01c 全部已度量', doc.nodes.every(n => Array.isArray(n.lines) && n.w > 0 && n.h > 0));
    ok('C01d 没有 mode / autoLayout 字段了', doc.mode === undefined && doc.autoLayout === undefined);
  });
  T('C02 排版后无重叠且两侧分布', () => {
    layoutMind();
    const kids = idx.children.get(root.id).map(id => byId(id));
    const L = kids.filter(k => k.x + k.w <= root.x), R = kids.filter(k => k.x >= root.x + root.w);
    ok('C02 左右都有分支', L.length > 0 && R.length > 0, 'L=' + L.length + ' R=' + R.length);
    ok('C02b 无重叠', overlaps().length === 0, overlaps().join(' '));
  });
  T('C03 坐标换算', () => {
    const p = { x:123.4, y:-56.7 };
    const b = s2w(w2s(p).x, w2s(p).y);
    ok('C03 往返一致', Math.abs(b.x - p.x) < 1e-6 && Math.abs(b.y - p.y) < 1e-6);
    const z0 = view.z; zoomAt(800, 500, 1.5);
    ok('C03b 缩放生效', view.z > z0);
    const s = w2s(s2w(800, 500));
    ok('C03c 光标锚点不动', Math.abs(s.x - 800) < 1e-6 && Math.abs(s.y - 500) < 1e-6);
    fitView();
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
    fresh();
    const n = doc.nodes[2];
    ok('C05 hitNode 中心命中', hitNode({ x:n.x + n.w / 2, y:n.y + n.h / 2 }) === n);
    ok('C05b hitNode 空白不误伤', hitNode({ x:n.x - 9999, y:n.y - 9999 }) === null);
    selectOnly(n.id);
    ok('C05c hitPort 命中右端口', (hitPort(anchorsFor(n).r) || {}).side === 'r');
    const e = doc.edges[0];
    ok('C05d hitEdge 命中连线', hitEdge(edgeGeomFor(e).mid) === e);
  });
  T('C06 序列化往返（含连线样式）', () => {
    fresh();
    const e = doc.edges[0];
    setEdgeStyle(e, { arrow:'both', dash:true, route:'curve' });
    e.label = '测试';
    const n0 = doc.nodes.length, e0 = doc.edges.length;
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    ok('C06 数量一致', doc.nodes.length === n0 && doc.edges.length === e0, n0 + '/' + e0);
    ok('C06b 无重复 id', dupIds().length === 0, dupIds().join(','));
    const e2 = doc.edges.find(x => x.id === e.id);
    ok('C06c 样式往返保留', e2 && e2.arrow === 'both' && e2.dash === true && e2.route === 'curve' && e2.label === '测试',
      e2 ? [e2.arrow, e2.dash, e2.route, e2.label].join('/') : 'missing');
    ok('C06d 序列化里带 v:2 且没有 mode', snap.v === 2 && snap.mode === undefined);
  });
  T('C07 老存档（v1 有 mode）能被读进来并翻译成每条线的走线', () => {
    const legacy = {
      v:1, nid:50, mode:'mind', autoLayout:true,
      nodes: [{ id:'n1', text:'甲', x:0, y:0, shape:'rect' }, { id:'n2', text:'乙', x:200, y:0, shape:'rect' }],
      edges: [{ id:'e1', s:'n1', t:'n2', label:'' }]
    };
    deserialize(legacy);
    ok('C07 节点读进来了', doc.nodes.length === 2);
    ok('C07b 旧 mind 模式翻译成曲线', doc.edges[0].route === 'curve', doc.edges[0].route);
    ok('C07c 其余样式补默认值', doc.edges[0].arrow === 'end' && doc.edges[0].dash === false);
    const legacyFlow = Object.assign({}, legacy, { mode:'flow' });
    deserialize(legacyFlow);
    ok('C07d 旧 flow 模式翻译成正交', doc.edges[0].route === 'ortho', doc.edges[0].route);
  });

  /* ==================== 连线类型 ==================== */
  fresh();
  T('G01 新连线默认是 单向箭头 / 实线 / 正交', () => {
    const a = nodeByText('节点'), b = nodeByText('操作');
    const before = doc.edges.length;
    const e = linkNodes(a.id, b.id);
    ok('G01 新边建立', doc.edges.length === before + 1 && !!e);
    ok('G01b 默认值正确', e.arrow === 'end' && e.dash === false && e.route === 'ortho',
      [e.arrow, e.dash, e.route].join('/'));
  });
  T('G02 样例文档里混了多种类型', () => {
    fresh();
    const kinds = doc.edges.map(e => e.arrow + (e.dash ? '/虚线' : '') + '/' + e.route);
    ok('G02 存在双向箭头', doc.edges.some(e => e.arrow === 'both'));
    ok('G02b 存在虚线', doc.edges.some(e => e.dash === true));
    ok('G02c 存在曲线', doc.edges.some(e => e.route === 'curve'));
    ok('G02d 存在正交', doc.edges.some(e => e.route === 'ortho'));
  });
  T('G03 走线按每条线自己的设置渲染', () => {
    fresh();
    doc.edges.forEach(e => setEdgeStyle(e, { route:'ortho' }));
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
    ok('G03 全部水平/垂直', bad === 0, 'bad=' + bad + ' / ' + doc.edges.length);
    const e0 = doc.edges[0];
    setEdgeStyle(e0, { route:'curve' });
    ok('G03b 改成曲线后是贝塞尔', edgeGeomFor(e0).type === 'c');
    setEdgeStyle(e0, { route:'ortho' });
    ok('G03c 改回正交', edgeGeomFor(e0).type === 'p');
  });
  T('G04 箭头端点几何', () => {
    const e = doc.edges[0];
    setEdgeStyle(e, { route:'ortho' });
    const ap = geomArrowPoints(edgeGeomFor(e));
    ok('G04 正交有起止箭头点', ap && ap.start && ap.end);
    const ep = edgeEndpoints(e);
    ok('G04b 箭头终点就是几何终点',
      Math.abs(ap.end.to.x - ep.b.x) < 0.01 && Math.abs(ap.end.to.y - ep.b.y) < 0.01);
    setEdgeStyle(e, { route:'curve' });
    const ap2 = geomArrowPoints(edgeGeomFor(e));
    ok('G04c 曲线也有起止箭头点', ap2 && ap2.start && ap2.end);
    setEdgeStyle(e, { route:'ortho' });
  });
  T('G05 样式面板：打开 / 同步当前值 / 切换生效 / 关闭', () => {
    fresh();
    const a = nodeByText('节点'), b = nodeByText('操作');
    const e = linkNodes(a.id, b.id);
    selectEdge(e.id);
    openEdgeBox();
    ok('G05 面板打开', edgeBoxEl.style.display === 'block');
    ok('G05b 显示的是这条线', ebEdgeId === e.id);
    const opts = (host) => [...host.querySelectorAll('.opt')];
    ok('G05c 三个选项组都渲染了',
      opts(ebArrowEl).length === 3 && opts(ebDashEl).length === 2 && opts(ebRouteEl).length === 4 - 2,
      opts(ebArrowEl).length + '/' + opts(ebDashEl).length + '/' + opts(ebRouteEl).length);
    ok('G05d 当前值高亮', opts(ebArrowEl)[1].className.indexOf('on') >= 0 &&
      opts(ebDashEl)[0].className.indexOf('on') >= 0 && opts(ebRouteEl)[0].className.indexOf('on') >= 0);
    opts(ebArrowEl)[2].click();                        // 双向
    ok('G05e 箭头改成双向', e.arrow === 'both', e.arrow);
    opts(ebDashEl)[1].click();                         // 虚线
    ok('G05f 线型改成虚线', e.dash === true);
    opts(ebRouteEl)[1].click();                        // 曲线
    ok('G05g 走线改成曲线', e.route === 'curve');
    ok('G05h 高亮跟着更新', opts(ebArrowEl)[2].className.indexOf('on') >= 0 &&
      opts(ebDashEl)[1].className.indexOf('on') >= 0 && opts(ebRouteEl)[1].className.indexOf('on') >= 0);
    ebLabelEl.value = '是';
    ebLabelEl.dispatchEvent(new Event('input', { bubbles:true }));
    ok('G05i 标签实时写入', e.label === '是', e.label);
    closeEdgeBox();
    ok('G05j 面板已关闭', edgeBoxEl.style.display === 'none');
    ok('G05k 样式改动进了撤销栈', (() => { undo(); const e2 = doc.edges.find(x => x.id === e.id); return !e2 || e2.label !== '是'; })());
  });
  T('G06 E 键是通用样式面板：选中什么就开什么', () => {
    fresh();
    const st = nodeByText('节点');
    selectOnly(st.id);
    keyRaw('e');
    ok('G06 选中节点时 e 打开节点样式', nodeBoxEl.style.display === 'block');
    keyRaw('Escape');
    ok('G06b Esc 关掉它', nodeBoxEl.style.display === 'none');
    const e = doc.edges[0];
    selectEdge(e.id);
    keyRaw('e');
    ok('G06c 选中连线时 e 打开连线样式', edgeBoxEl.style.display === 'block');
    ok('G06d 不会同时开着节点面板', nodeBoxEl.style.display === 'none');
    keyRaw('Escape');
    ok('G06e Esc 关掉它', edgeBoxEl.style.display === 'none');
    selectOnly(null);
    keyRaw('e');
    ok('G06f 什么都没选中时不弹面板', nodeBoxEl.style.display === 'none' && edgeBoxEl.style.display === 'none');
  });
  T('G07 右键连线的菜单里有样式项', () => {
    fresh();
    const e = doc.edges[0];
    const m = edgeGeomFor(e).mid;
    const mS = S(m);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:mS.x, clientY:mS.y, bubbles:true, cancelable:true }));
    ok('G07 菜单显示', ctxEl.style.display === 'block');
    const labels = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('G07b 有「连线样式…」', labels.some(t => t.indexOf('连线样式') === 0), labels.join(' | '));
    ok('G07c 有箭头/线型/走线三项', labels.some(t => t.indexOf('箭头') === 0) &&
      labels.some(t => t.indexOf('线型') === 0) && labels.some(t => t.indexOf('走线') === 0));
    hideCtx();
  });

  /* ==================== 拖端点改接 ==================== */
  T('R01 点选连线：节点选择被清掉', () => {
    fresh();
    const st = nodeByText('节点');
    selectOnly(st.id);
    const e = edgeOf(rootNode(), st);
    selectEdge(e.id);
    ok('R01 连线被选中', selEdgeId === e.id);
    ok('R01b 节点选择已清空', sel.size === 0, sel.size);
    ok('R01c selectedEdge() 能取到', selectedEdge() === e);
  });
  T('R02 选中后两端出现可拖手柄，且能被命中', () => {
    fresh();
    const e = doc.edges[0];
    ok('R02 未选中时没有手柄', hitEdgeHandle({ x:0, y:0 }) === null);
    selectEdge(e.id);
    const ep = edgeEndpoints(e);
    ok('R02b 起点手柄可命中', (hitEdgeHandle(ep.a) || {}).end === 's');
    ok('R02c 终点手柄可命中', (hitEdgeHandle(ep.b) || {}).end === 't');
    ok('R02d 离远了不算命中', hitEdgeHandle({ x:ep.a.x + 500, y:ep.a.y }) === null);
  });
  T('R03 拖端点把它接到另一个节点上', () => {
    fresh();
    layoutMind();
    const a = nodeByText('节点');
    const a1 = nodeByText('矩形 / 圆角 / 菱形 / 椭圆');
    const e = edgeOf(rootNode(), a);
    selectEdge(e.id);
    const ep = edgeEndpoints(e);
    const h = S(ep.b);
    pe('pointerdown', h.x, h.y);
    ok('R03 进入改接态', !!relink && relink.edgeId === e.id && relink.end === 't', relink && relink.end);
    const tgt = center(a1);
    pe('pointermove', tgt.x, tgt.y);
    ok('R03b 预览吸附到目标节点', relink.target === a1, relink.target && relink.target.text);
    pe('pointerup', tgt.x, tgt.y);
    ok('R03c 终点已改接', e.t === a1.id, byId(e.t) && byId(e.t).text);
    ok('R03d 起点没变', e.s === rootNode().id);
    ok('R03e 改接后仍是选中状态', selEdgeId === e.id);
    ok('R03f 对白栏有反馈', (skipDlg(), /改接/.test(dlgText.textContent)), dlgText.textContent);
  });
  T('R04 落到空白处 = 取消，连线不动', () => {
    fresh();
    layoutMind();
    const a = nodeByText('节点');
    const e = edgeOf(rootNode(), a);
    const t0 = e.t;
    selectEdge(e.id);
    const h = S(edgeEndpoints(e).b);
    pe('pointerdown', h.x, h.y);
    pe('pointermove', 20, 20);
    pe('pointerup', 20, 20);
    ok('R04 终点没变', e.t === t0);
    ok('R04b 提示已取消', (skipDlg(), /取消改接/.test(dlgText.textContent)), dlgText.textContent);
  });
  T('R05 不许接到自己另一端（自环）', () => {
    fresh();
    layoutMind();
    const a = nodeByText('节点');
    const e = edgeOf(rootNode(), a);
    selectEdge(e.id);
    const h = S(edgeEndpoints(e).b);
    pe('pointerdown', h.x, h.y);
    const sc = center(rootNode());           // 另一端就是 root
    pe('pointermove', sc.x, sc.y);
    ok('R05 目标被拒绝', relink.target === null, relink.target && relink.target.text);
    pe('pointerup', sc.x, sc.y);
    ok('R05b 边没有被改成自环', e.s !== e.t);
  });
  T('R06 不许改接成重复的连线', () => {
    fresh();
    layoutMind();
    const a = nodeByText('节点'), c = nodeByText('操作');
    const e = edgeOf(rootNode(), a);
    ok('R06 前置：root→操作 已存在', !!edgeOf(rootNode(), c));
    selectEdge(e.id);
    const h = S(edgeEndpoints(e).b);
    pe('pointerdown', h.x, h.y);
    const tc = center(c);
    pe('pointermove', tc.x, tc.y);
    pe('pointerup', tc.x, tc.y);
    ok('R06b 被拒绝，终点还是节点', e.t === a.id, byId(e.t).text);
    ok('R06c 提示重复', (skipDlg(), /已经有一条连线/.test(dlgText.textContent)), dlgText.textContent);
  });
  T('R07 改接可撤销', () => {
    fresh();
    layoutMind();
    const a = nodeByText('节点');
    const a1 = nodeByText('矩形 / 圆角 / 菱形 / 椭圆');
    const e = edgeOf(rootNode(), a);
    selectEdge(e.id);
    const h = S(edgeEndpoints(e).b);
    pe('pointerdown', h.x, h.y);
    const tgt = center(a1);
    pe('pointermove', tgt.x, tgt.y);
    pe('pointerup', tgt.x, tgt.y);
    ok('R07 已改接到 a1', e.t === a1.id);
    undo();
    const e2 = doc.edges.find(x => x.id === e.id);
    ok('R07b 撤销后回到 a', e2 && e2.t === a.id, e2 && byId(e2.t).text);
  });
  T('R08 拖端点时那条线不出现在常规绘制里（改走预览）', () => {
    fresh();
    const e = doc.edges[0];
    selectEdge(e.id);
    const h = S(edgeEndpoints(e).b);
    pe('pointerdown', h.x, h.y);
    pe('pointermove', h.x + 60, h.y + 60);
    dirty = true; draw();
    ok('R08 拖动中主画布能正常重绘', true);
    pe('pointerup', h.x + 60, h.y + 60);
    ok('R08b 松手后状态清干净', !relink && !drag);
  });

  /* ==================== 方向生成 ==================== */
  fresh();
  T('D01 四个方向空间生成', () => {
    const a = nodeByText('GRAPHEON');
    const made = {};
    for (const [k, d] of [['ArrowRight','R'], ['ArrowLeft','L'], ['ArrowUp','U'], ['ArrowDown','D']]){
      selectOnly(a.id); key(k); made[d] = byId([...sel][0]);
    }
    ok('D01 四个方向都生成了', Object.values(made).every(Boolean));
    ok('D01b 右在右', made.R.x > a.x + a.w);
    ok('D01c 左在左', made.L.x + made.L.w < a.x);
    ok('D01d 上在上', made.U.y + made.U.h < a.y);
    ok('D01e 下在下', made.D.y > a.y + a.h);
  });
  T('D02 连续同方向生成不重叠', () => {
    fresh();
    const a = nodeByText('GRAPHEON');
    selectOnly(a.id); key('ArrowRight');
    let cur = byId([...sel][0]);
    const chain = [cur];
    for (let i = 0; i < 4; i++){ selectOnly(cur.id); key('ArrowRight'); cur = byId([...sel][0]); chain.push(cur); }
    const xs = chain.map(n => n.x);
    ok('D02 链上 x 递增', xs.every((v, i) => i === 0 || v > xs[i - 1]), JSON.stringify(xs.map(Math.round)));
    ok('D02b 新生成的这几条没重叠', (() => {
      for (let i = 0; i < chain.length; i++) for (let j = i + 1; j < chain.length; j++){
        const p = chain[i], q = chain[j];
        if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) return false;
      }
      return true;
    })());
  });
  T('D03 Tab 加子节点 / Enter 加兄弟节点', () => {
    fresh();
    layoutMind();
    const a = nodeByText('节点');
    const b0 = doc.nodes.length;
    selectOnly(a.id); key('Tab');
    const child = byId([...sel][0]);
    ok('D03 子节点已建立', doc.nodes.length === b0 + 1 && idx.parent.get(child.id) === a.id);
    key('Enter');
    const sib = byId([...sel][0]);
    ok('D03b 兄弟节点已建立', idx.parent.get(sib.id) === a.id);
    const order = idx.children.get(a.id);
    ok('D03c 兄弟顺序正确', order.indexOf(sib.id) === order.indexOf(child.id) + 1,
      JSON.stringify(order.map(id => byId(id).text || '(空)')));
  });
  T('D04 插入父节点并把原边改接上去', () => {
    fresh();
    layoutMind();
    const target = nodeByText('节点');
    const oldParent = idx.parent.get(target.id);
    selectOnly(target.id);
    addParentOf(target);
    const np = byId([...sel][0]);
    ok('D04 新节点成为 target 的父', idx.parent.get(target.id) === np.id);
    ok('D04b 新节点的父是原来的父', idx.parent.get(np.id) === oldParent);
    ok('D04c 原边没有残留', doc.edges.filter(e => e.s === oldParent && e.t === target.id).length === 0);
  });
  T('D05 Alt / 无选中 不误触发', () => {
    fresh();
    const r = doc.nodes.find(n => isRoot(n));
    selectOnly(r.id);
    const b = doc.nodes.length;
    key('ArrowLeft', { altKey:true });
    ok('D05 Alt+← 不新建', doc.nodes.length === b);
    selectOnly(null);
    key('ArrowRight'); key('d'); key('w');
    ok('D05b 无选中不新建', doc.nodes.length === b);
  });
  T('D06 删除节点（连同子孙）', () => {
    fresh();
    const b = nodeByText('连线');            // 它有 3 个子节点，正好测子树
    const before = doc.nodes.length;
    const kids = descendants(b.id).length;
    selectOnly(b.id);
    deleteSelection();
    ok('D06 连同子孙一起删', doc.nodes.length === before - 1 - kids, before + ' -> ' + doc.nodes.length);
    ok('D06b 没有悬挂连线', doc.edges.every(x => byId(x.s) && byId(x.t)));
  });
  T('D07 删除连线', () => {
    fresh();
    const e = doc.edges[0];
    const n0 = doc.edges.length;
    selectEdge(e.id);
    deleteSelection();
    ok('D07 连线被删掉', doc.edges.length === n0 - 1 && !doc.edges.includes(e));
    ok('D07b 连线选择已清空', selEdgeId === null);
    ok('D07c 两端节点都还在', !!byId(e.s) && !!byId(e.t));
  });
  T('D08 孤立的节点变成根后不可删（保护根节点）', () => {
    fresh();
    const a = nodeByText('节点');
    selectEdge(edgeOf(rootNode(), a).id);
    deleteSelection();                        // 先断掉它和根的连线
    ok('D08 它现在没有父节点了', isRoot(byId(a.id)));
    const before = doc.nodes.length;
    selectOnly(a.id);
    deleteSelection();
    ok('D08b 删除被拒绝', doc.nodes.length === before, before + ' -> ' + doc.nodes.length);
  });

  /* ==================== 快捷键 ==================== */
  T('K01 comboOf 归一化', () => {
    const c = (o) => GP.keys.comboOf(Object.assign({ key:'', ctrlKey:false, altKey:false, shiftKey:false }, o));
    ok('K01 ctrl+shift+z', c({ key:'Z', ctrlKey:true, shiftKey:true }) === 'ctrl+shift+z');
    ok('K01b 单独 Shift+w 归一到 w', c({ key:'W', shiftKey:true }) === 'w');
    ok('K01c 空格 → space', c({ key:' ' }) === 'space');
    ok('K01d alt+方向键带 alt 前缀', c({ key:'ArrowLeft', altKey:true }) === 'alt+arrowleft');
    ok('K01e Shift+↑ 不带 shift', c({ key:'ArrowUp', shiftKey:true }) === 'arrowup');
  });
  T('K02 默认键位完整且动作都存在', () => {
    fresh(); GP.keys.reset();
    const b = GP.keys.bindings;
    ok('K02 Tab → 子节点', b['tab'] === 'node.child');
    ok('K02b WASD 与方向键都有', ['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'].every(k => !!b[k]));
    ok('K02c e → 样式面板（节点/连线通用）', b['e'] === 'style.open');
    ok('K02d 模式键位已移除', !b['1'] && !b['2'] && !GP.keys.actions['mode.mind'] && !GP.keys.actions['mode.flow']);
    ok('K02e Ctrl+G = 加入分组', b['ctrl+g'] === 'group.create');
    ok('K02e 全部绑定都指向已注册动作', Object.keys(b).every(k => !!GP.keys.actions[b[k]]),
      Object.keys(b).filter(k => !GP.keys.actions[b[k]]).join(','));
    ok('K02f 动作表带中文标签', Object.values(GP.keys.actions).every(a => a.label && a.group));
  });
  T('K03 运行时改键生效并落盘', () => {
    fresh(); GP.keys.reset();
    const n = nodeByText('节点');
    const before = doc.nodes.length;
    selectOnly(n.id); keyRaw('d');
    if (editing) commitEdit();
    ok('K03 默认 d 会生成节点', doc.nodes.length === before + 1);
    GP.keys.bind('ctrl+d', 'node.delete');
    let b = GP.keys.bindings;
    ok('K03b 原键位已释放', !b['delete'] && !b['backspace']);
    ok('K03c ctrl+d 已绑定', b['ctrl+d'] === 'node.delete');
    ok('K03d 已写进 localStorage', (localStorage.getItem('grapheon.keymap.v1') || '').indexOf('ctrl+d') >= 0);
    GP.keys.load();
    ok('K03e load 后仍是改过的键位', GP.keys.bindings['ctrl+d'] === 'node.delete');
    GP.keys.reset();
    ok('K03f reset 后恢复默认', GP.keys.bindings['d'] === 'node.spawn.right' && !GP.keys.bindings['ctrl+d']);
  });
  T('K04 面板打开时全局快捷键被屏蔽，Esc 例外', () => {
    fresh(); sel.clear();
    openExport();
    const before = doc.nodes.length;
    for (const k of ['w', 'd', 'Tab', 'Enter', 'ArrowDown']) keyRaw(k);
    ok('K04 节点数不变', doc.nodes.length === before, doc.nodes.length + ' vs ' + before);
    keyRaw('Escape');
    ok('K04b Esc 关闭导出面板', expEl.style.display === 'none');
    const e = doc.edges[0];
    selectEdge(e.id); openEdgeBox();
    const b2 = doc.nodes.length;
    for (const k of ['w', 'd', 'Tab']) keyRaw(k);
    ok('K04c 样式面板打开时也不生成节点', doc.nodes.length === b2);
    keyRaw('Escape');
    ok('K04d Esc 关闭样式面板', edgeBoxEl.style.display === 'none');
  });
  T('K05 输入框聚焦时不误触发', () => {
    fresh();
    const before = doc.nodes.length;
    expEl.style.display = 'block';
    for (const k of ['w', 'a', 's', 'd', 'ArrowRight']){
      expNameEl.dispatchEvent(new KeyboardEvent('keydown', { key:k, bubbles:true, cancelable:true }));
    }
    ok('K05 节点数不变', doc.nodes.length === before);
    expEl.style.display = 'none';
  });

  /* ==================== 鼠标 ==================== */
  fresh();
  T('I01 点击选中节点 / 空白取消', () => {
    const n = doc.nodes.find(x => isRoot(x));
    const c = center(n);
    pe('pointerdown', c.x, c.y); pe('pointerup', c.x, c.y);
    ok('I01 选中根节点', sel.size === 1 && sel.has(n.id));
    pe('pointerdown', 40, 700); pe('pointerup', 40, 700);
    ok('I01b 空白清空选择', sel.size === 0);
  });
  T('I02 拖空白平移', () => {
    fresh();
    const x0 = view.x, y0 = view.y;
    pe('pointerdown', 300, 720); pe('pointermove', 400, 780); pe('pointerup', 400, 780);
    ok('I02 视图已平移', Math.abs(view.x - x0 - 100) < 2 && Math.abs(view.y - y0 - 60) < 2);
    view.x = x0; view.y = y0; mark();
  });
  T('I03 拖拽节点（不再有关闭自动布局那回事）', () => {
    fresh();
    const n = doc.nodes.find(x => isRoot(x));
    const c = center(n), x0 = n.x, y0 = n.y;
    pe('pointerdown', c.x, c.y); pe('pointermove', c.x + 70, c.y + 40); pe('pointerup', c.x + 70, c.y + 40);
    ok('I03 节点已位移', Math.abs(n.x - x0 - 70 / view.z) < 2 && Math.abs(n.y - y0 - 40 / view.z) < 2);
    undo();
    ok('I03b 撤销可回退', Math.abs(byId(n.id).x - x0) < 2);
  });
  T('I04 端口拉新连线', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点');
    const b = nodeByText('操作');
    const before = doc.edges.length;
    selectOnly(a.id); mark();
    const port = S(anchorsFor(a).r), tgt = center(b);
    pe('pointerdown', port.x, port.y);
    ok('I04 进入连线态', !!linking && linking.side === 'r');
    pe('pointermove', tgt.x, tgt.y); pe('pointerup', tgt.x, tgt.y);
    ok('I04b 新增连线', doc.edges.length === before + 1 && !!edgeOf(a, b));
    ok('I04c 状态已退出', !linking && !drag);
  });
  T('I05 框选', () => {
    fresh();
    const p1 = S({ x:bboxAll().minX - 60, y:bboxAll().minY - 60 });
    const p2 = S({ x:bboxAll().maxX + 60, y:bboxAll().maxY + 60 });
    pe('pointerdown', p1.x, p1.y, { shiftKey:true });
    pe('pointermove', p2.x, p2.y, { shiftKey:true });
    ok('I05 框选中', !!marquee);
    pe('pointerup', p2.x, p2.y, { shiftKey:true });
    ok('I05b 选中全部', sel.size === doc.nodes.length, sel.size + '/' + doc.nodes.length);
  });
  T('I06 双击空白新建 / 双击节点改名 / 双击连线加标签', () => {
    fresh();
    const before = doc.nodes.length;
    const wp = S({ x:bboxAll().minX - 200, y:bboxAll().maxY + 100 });
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:wp.x, clientY:wp.y, bubbles:true, cancelable:true }));
    ok('I06 节点 +1', doc.nodes.length === before + 1);
    commitEdit();
    const n = nodeByText('节点');
    const c = center(n);
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    ok('I06b 回填原文', !!editing && editor.value === '节点');
    cancelEdit();
    const e = doc.edges[0];
    const m = S(edgeGeomFor(e).mid);
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:m.x, clientY:m.y, bubbles:true, cancelable:true }));
    ok('I06c 进入连标签编辑', !!editing && editing.kind === 'edge');
    if (editing){ editor.value = '是'; editor.dispatchEvent(new Event('input', { bubbles:true })); commitEdit(); }
    ok('I06d 标签写入', e.label === '是');
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
  T('I08 点连线会把它选中（而不是选中某个节点）', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    const m = S(edgeGeomFor(e).mid);
    pe('pointerdown', m.x, m.y); pe('pointerup', m.x, m.y);
    ok('I08 连线被选中', selEdgeId === e.id, selEdgeId);
    ok('I08b 没有节点被选中', sel.size === 0);
  });

  /* ==================== 新建菜单 ==================== */
  T('N01 顶栏「新建」菜单', () => {
    fresh();
    $('#b-new').click();
    ok('N01 菜单显示', ctxEl.style.display === 'block');
    const items = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('N01b 有「空白文件」和「示例文档」',
      items.some(t => t.indexOf('空白文件') === 0) && items.some(t => t.indexOf('示例文档') === 0), items.join(' / '));
  });
  T('N02 新建空白文件', () => {
    fresh();
    $('#b-new').click();
    [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('空白文件') === 0).click();
    ok('N02 只剩 1 个节点', doc.nodes.length === 1, doc.nodes.length);
    ok('N02b 没有连线', doc.edges.length === 0);
    ok('N02c 光杆中心节点也用大号字', doc.nodes[0].big === true);
    ok('N02d 可以直接开始生长', (() => {
      const b = doc.nodes.length;
      key('Tab');
      const grew = doc.nodes.length === b + 1;
      if (editing) cancelEdit();
      return grew;
    })());
    ok('N02e 新连线带默认样式', doc.edges[0].arrow === 'end' && doc.edges[0].route === 'ortho');
  });
  T('N03 新建示例文档', () => {
    fresh();
    $('#b-new').click();
    [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('示例文档') === 0).click();
    ok('N03 恢复成 12 节点', doc.nodes.length === 12, doc.nodes.length);
    ok('N03b 已排版（不是全叠在原点）', new Set(doc.nodes.map(n => Math.round(n.x))).size > 1);
  });
  T('N04 菜单会被「点击别处」收起', () => {
    fresh();
    $('#b-new').click();
    ok('N04 先打开', ctxEl.style.display === 'block');
    pe('pointerdown', 700, 500); pe('pointerup', 700, 500);
    ok('N04b 点画布后收起', ctxEl.style.display === 'none');
  });

  /* ==================== 导出 ==================== */
  fresh();
  T('E01 面板结构', () => {
    sel.clear(); selEdgeId = null;
    openExport();
    ok('E01 面板可见', expEl.style.display === 'block');
    ok('E01b 有标题输入框', !!expTitleEl);
    ok('E01c 三个范围', expScopesEl.querySelectorAll('.opt').length === 3);
  });
  T('E02 三种范围的集合与连线裁剪', () => {
    expScope = 'all'; renderScopes();
    ok('E02 全部 = 12 节点', currentExportSet().length === 12, currentExportSet().length);
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id); renderScopes();
    [...expScopesEl.querySelectorAll('.opt')][1].click();
    const picked = currentExportSet();
    ok('E02b 仅选中 = 2 节点', picked.length === 2);
    const ids = new Set(picked.map(n => n.id));
    ok('E02c 两端不都在集合内的连线被裁掉', doc.edges.filter(e => ids.has(e.s) && ids.has(e.t)).length === 0);
    const k = nodeByText('操作');
    selectOnly(k.id); renderScopes();
    [...expScopesEl.querySelectorAll('.opt')][2].click();
    const sub = currentExportSet();
    ok('E02d 子树 = 自身 + 全部子孙', sub.length === 1 + descendants(k.id).length, sub.length);
  });
  T('E03 标题画到左上角', () => {
    fresh(); sel.clear(); selEdgeId = null;
    openExport();
    expScope = 'all'; renderScopes();
    expTitleEl.value = '季度复盘';
    updateExportInfo();
    ok('E03 info 里提示了标题', expInfoEl.textContent.indexOf('季度复盘') > 0);
    const withTitle = buildExportCanvas(doc.nodes, '季度复盘');
    const bare = buildExportCanvas(doc.nodes, '');
    const band = [56, 40, 900, 110];
    const litWith = litPixels(withTitle, band[0], band[1], band[2], band[3]);
    const litBare = litPixels(bare, band[0], band[1], band[2], band[3]);
    ok('E03b 有标题时左上角有像素', litWith > 200, litWith);
    ok('E03c 无标题时左上角是空的', litBare === 0, litBare);
  });
  T('E04 标题过长会截断', () => {
    const long = '这是一个非常非常非常非常非常非常非常非常非常非常非常非常长的标题用来测试截断行为';
    const one = nodeByText('节点');
    const c = buildExportCanvas([one], long);
    const g = c.getContext('2d');
    setFont(g, FS_BIG, 'normal');
    const maxW = c.width - 112;
    ok('E04 画布装不下整条标题', g.measureText(long).width > maxW);
    const t = fitText(g, long, maxW);
    ok('E04b 已截断并加省略号', t.length < long.length && t.slice(-1) === '…');
    ok('E04c 截断后不超宽', g.measureText(t).width <= maxW);
  });
  T('E05 文件名净化', () => {
    ok('E05 非法字符替换', sanitizeFile('a/b:c*d?e"f<g>h|i') === 'a_b_c_d_e_f_g_h_i');
    ok('E05b 去掉尾部点和空格', sanitizeFile('name...  ') === 'name');
    ok('E05c 空值兜底', sanitizeFile('') === 'grapheon');
    ok('E05d 中文与空格保留', sanitizeFile('我的 图') === '我的 图');
  });
  await TA('E06 点「导出」真的产出 PNG', async () => {
    fresh(); sel.clear(); selEdgeId = null;
    openExport();
    expNameEl.value = '我的/图..';
    expTitleEl.value = '复盘';
    expScope = 'all'; renderScopes();
    let got = null;
    const origDL = downloadBlob;
    downloadBlob = function (blob, filename){ got = { size: blob && blob.size, type: blob && blob.type, filename }; };
    $('#expGo').click();
    for (let i = 0; i < 40 && !got; i++) await sleep(25);
    ok('E06 触发了下载', !!got);
    if (got){
      ok('E06b 文件名已净化 + .png', got.filename === '我的_图.png', got.filename);
      ok('E06c 是 PNG 且非空', got.type === 'image/png' && got.size > 2000, got.type + ' / ' + got.size);
    }
    ok('E06d 导出后面板自动关闭', expEl.style.display === 'none');
    downloadBlob = origDL;
  });
  T('E07 导出图里不含选中态和端点手柄', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    selectEdge(e.id);
    const withSel = buildExportCanvas(doc.nodes);
    const saved = selEdgeId;
    selEdgeId = null;
    const withoutSel = buildExportCanvas(doc.nodes);
    selEdgeId = saved;
    ok('E07 两者尺寸一致', withSel.width === withoutSel.width && withSel.height === withoutSel.height);
    ok('E07b 导出前后选中态被还原', selEdgeId === e.id);
  /* ==================== 折叠子树（真隐藏）==================== */
  T('H01 折叠后整棵子树真的被藏起来', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');                 // 有 3 个子节点
    const kids = descendants(b.id);
    ok('H01 前置：它有子孙', kids.length === 3, kids.length);
    const kid = byId(kids[0]);
    ok('H01b 折叠前能命中子节点', hitNode(center0(kid)) === kid);
    selectOnly(b.id);
    toggleCollapseOf(b);
    ok('H01c collapsed 已置位', b.collapsed === true);
    ok('H01d 子孙都被标记为隐藏', kids.every(id => isHidden(id)), kids.filter(id => !isHidden(id)).join(','));
    ok('H01e 子节点再也点不到', hitNode(center0(kid)) === null);
    ok('H01f 子节点不在绘制列表里', isHidden(kid.id));
    ok('H01g 折到子节点的连线也隐藏了',
      doc.edges.filter(e => e.s === b.id && kids.indexOf(e.t) >= 0).every(e => !edgeVisible(e)));
    ok('H01h 隐藏数量正确', idx.hidden.size === 3, idx.hidden.size);
  });
  T('H02 点折叠角标就能展开', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    selectOnly(b.id); toggleCollapseOf(b);
    const r = collapseBadgeRect(b);
    const c = S({ x:r.x + r.w / 2, y:r.y + r.h / 2 });
    pe('pointerdown', c.x, c.y);
    ok('H02 点角标后已展开', b.collapsed === false);
    ok('H02b 子孙重新可见', descendants(b.id).every(id => !isHidden(id)));
    pe('pointerup', c.x, c.y);
  });
  T('H03 隐藏的节点选不中（框选 / 全选都会跳过）', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    selectOnly(b.id); toggleCollapseOf(b);
    selectAll();
    ok('H03 全选不含隐藏节点', [...sel].every(id => !isHidden(id)), sel.size + ' 个');
    const p1 = S({ x:bboxAll().minX - 80, y:bboxAll().minY - 80 });
    const p2 = S({ x:bboxAll().maxX + 80, y:bboxAll().maxY + 80 });
    pe('pointerdown', p1.x, p1.y, { shiftKey:true });
    pe('pointermove', p2.x, p2.y, { shiftKey:true });
    pe('pointerup', p2.x, p2.y, { shiftKey:true });
    ok('H03b 框选也不含隐藏节点', [...sel].every(id => !isHidden(id)), sel.size + ' / ' + doc.nodes.length);
  });
  T('H04 折叠期间拖动父节点，展开时子树跟着走', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    const kidId = descendants(b.id)[0];
    selectOnly(b.id); toggleCollapseOf(b);
    const before = { x:byId(kidId).x, y:byId(kidId).y };
    b.x += 300; b.y += 120;                      // 等价于拖拽父节点
    toggleCollapseOf(b);                         // 展开
    const after = { x:byId(kidId).x, y:byId(kidId).y };
    ok('H04 子树整体跟着父节点位移',
      Math.abs((after.x - before.x) - 300) < 0.01 && Math.abs((after.y - before.y) - 120) < 0.01,
      JSON.stringify({ dx:after.x - before.x, dy:after.y - before.y }));
  });
  T('H05 删除折叠的节点会连隐藏的子孙一起删', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    const kids = descendants(b.id);
    selectOnly(b.id); toggleCollapseOf(b);
    const before = doc.nodes.length;
    selectOnly(b.id);
    deleteSelection();
    ok('H05 连子孙一起删掉', doc.nodes.length === before - 1 - kids.length, before + ' -> ' + doc.nodes.length);
    ok('H05b 没有悬挂连线', doc.edges.every(x => byId(x.s) && byId(x.t)));
    ok('H05c 隐藏表已清空', idx.hidden.size === 0);
  });
  T('H06 导出范围跳过隐藏节点', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    selectOnly(b.id); toggleCollapseOf(b);
    sel.clear(); selEdgeId = null;
    expScope = 'all'; renderScopes();
    const set = currentExportSet();
    ok('H06 全部范围不含隐藏节点', set.every(n => !isHidden(n.id)), set.length + ' / ' + doc.nodes.length);
    ok('H06b 数量对得上', set.length === doc.nodes.length - 3, set.length);
  });
  T('H07 折叠状态能存下来', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    selectOnly(b.id); toggleCollapseOf(b);
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    const b2 = nodeByText('连线');
    ok('H07 collapsed 往返保留', b2.collapsed === true);
    ok('H07b 重新索引后隐藏集正确', descendants(b2.id).every(id => isHidden(id)));
  });

  /* ==================== 端点钉位（自由连接，默认自动）==================== */
  T('S01 默认是自动吸附，端点不钉死', () => {
    fresh(); layoutMind();
    ok('S01 所有边默认 aSide/bSide 为 null',
      doc.edges.every(e => e.aSide === null && e.bSide === null),
      doc.edges.map(e => e.aSide + '/' + e.bSide).join(' '));
  });
  T('S02 节点右键菜单里有「连线端点吸附…」', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    const c = center(b);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    ok('S02 菜单显示', ctxEl.style.display === 'block');
    const labels = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('S02b 有端点吸附项', labels.some(t => t.indexOf('连线端点吸附') === 0), labels.join(' | '));
    const it = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('连线端点吸附') === 0);
    if (it) it.click();
    ok('S02c 面板打开', endBoxEl.style.display === 'block');
    ok('S02d 面板列出该节点的连线', endListEl.querySelectorAll('.endrow').length === 4,
      endListEl.querySelectorAll('.endrow').length + ' 行');
  });
  T('S03 指定端点后几何真的接在那条边上', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    openEndBox(b);
    const row = endListEl.querySelectorAll('.endrow')[0];
    const opts = [...row.querySelectorAll('.opt')];
    ok('S03 默认高亮「自动」', opts[0].className.indexOf('on') >= 0);
    const targetId = doc.edges.find(e => e.s === b.id).t;
    const e = doc.edges.find(x => x.s === b.id && x.t === targetId);
    opts[1].click();                              // 上
    ok('S03b aSide 变成 t', e.aSide === 't', e.aSide);
    const ep = edgeEndpoints(e);
    const want = anchorsFor(b).t;
    ok('S03c 起点锚点就在上边中点',
      Math.abs(ep.a.x - want.x) < 0.01 && Math.abs(ep.a.y - want.y) < 0.01,
      JSON.stringify(ep.a) + ' vs ' + JSON.stringify(want));
    const opts2 = [...endListEl.querySelectorAll('.endrow')[0].querySelectorAll('.opt')];
    opts2[0].click();                             // 回到自动
    ok('S03d 可以恢复自动', e.aSide === null);
    closeEndBox();
  });
  T('S04 钉死的端点不随相对位置改变', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    const targetId = doc.edges.find(e => e.s === b.id).t;
    const e = doc.edges.find(x => x.s === b.id && x.t === targetId);
    setEdgeSide(e, 'a', 'b');                     // 钉在下边
    const before = edgeEndpoints(e).a;
    const target = byId(targetId);
    target.x += 400; target.y -= 300;             // 把目标挪走
    const after = edgeEndpoints(e).a;
    ok('S04 起点仍钉在同一条边上', Math.abs(after.y - before.y) < 0.01, after.y + ' vs ' + before.y);
  });
  T('S05 端点钉位能存下来', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    setEdgeSide(e, 'a', 't'); setEdgeSide(e, 'b', 'l');
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    const e2 = doc.edges.find(x => x.id === e.id);
    ok('S05 往返保留', e2.aSide === 't' && e2.bSide === 'l', e2.aSide + '/' + e2.bSide);
  });
  T('S06 非法值会被规整成自动', () => {
    fresh();
    const e = doc.edges[0];
    e.aSide = 'xx'; normalizeEdge(e);
    ok('S06 非法端点值 → null', e.aSide === null);
  });

  /* ==================== 节点自由缩放 ==================== */
  T('W01 默认随文字自适应', () => {
    fresh();
    ok('W01 没有 fixedW/fixedH', doc.nodes.every(n => !n.fixedW && !n.fixedH));
  });
  T('W02 拖右下角手柄改尺寸', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    selectOnly(n.id);
    const r = resizeHandleRect(n);
    const h = S({ x:r.x + r.w / 2, y:r.y + r.h / 2 });
    const tgt = S({ x:n.x + 320, y:n.y + 200 });
    pe('pointerdown', h.x, h.y);
    ok('W02 进入缩放态', drag && drag.mode === 'resize', drag && drag.mode);
    pe('pointermove', tgt.x, tgt.y);
    ok('W02b 宽度变了', Math.abs(n.w - 320) <= 1, n.w);
    ok('W02c 高度变了', Math.abs(n.h - 200) <= 1, n.h);
    ok('W02d 记到了 fixedW/fixedH', n.fixedW === n.w && n.fixedH === n.h);
    pe('pointerup', tgt.x, tgt.y);
    ok('W02e 状态已退出', !drag);
  });
  T('W03 尺寸有下限，缩不成负的', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    selectOnly(n.id);
    const r = resizeHandleRect(n);
    const h = S({ x:r.x + r.w / 2, y:r.y + r.h / 2 });
    pe('pointerdown', h.x, h.y);
    pe('pointermove', h.x - 900, h.y - 900);
    pe('pointerup', h.x - 900, h.y - 900);
    ok('W03 不小于下限', n.w >= MIN_FIXED_W && n.h >= MIN_FIXED_H, n.w + 'x' + n.h);
  });
  T('W04 恢复自适应尺寸', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    setNodeSize(n, 300, 200);
    ok('W04 先改成固定尺寸', n.fixedW === 300);
    const c = center(n);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    const it = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('恢复自适应') === 0);
    ok('W04b 右键里有恢复项', !!it);
    if (it) it.click();
    ok('W04c 已清掉固定尺寸', !n.fixedW && !n.fixedH);
    ok('W04d 又回到自动宽度', n.w !== 300);
    hideCtx();
  });
  T('W05 固定尺寸能存下来，且排版时按它算', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    setNodeSize(n, 360, 180);
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    const n2 = nodeByText('节点');
    ok('W05 往返保留', n2.fixedW === 360 && n2.fixedH === 180, n2.fixedW + 'x' + n2.fixedH);
    layoutMind();
    ok('W05b 尺寸没被排版改掉', n2.w === 360 && n2.h === 180, n2.w + 'x' + n2.h);
    ok('W05c 排版后仍然无重叠', overlaps().length === 0, overlaps().join(' '));
  });

  /* ==================== 连线拐点 ==================== */
  T('V01 拖已选中的连线会拉出拐点', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    selectEdge(e.id);
    ok('V01 前置：还没有拐点', !e.waypoints);
    const ms = S(edgeGeomFor(e).mid);
    pe('pointerdown', ms.x, ms.y);
    pe('pointermove', ms.x + 90, ms.y + 70);
    pe('pointerup', ms.x + 90, ms.y + 70);
    ok('V01b 生成了 1 个拐点', e.waypoints && e.waypoints.length === 1, e.waypoints && e.waypoints.length);
    ok('V01c 几何多了一个折点', edgeGeomFor(e).pts.length === 3, edgeGeomFor(e).pts.length);
  });
  T('V02 没选中时点连线只是选中，不会拉拐点', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    const m = S(edgeGeomFor(e).mid);
    pe('pointerdown', m.x, m.y);
    pe('pointermove', m.x + 80, m.y + 60);
    pe('pointerup', m.x + 80, m.y + 60);
    ok('V02 只是选中了它', selEdgeId === e.id);
    ok('V02b 没有产生拐点', !e.waypoints);
  });
  T('V03 拖拐点手柄移动它', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    selectEdge(e.id);
    addWaypoint(e, 400, 400);
    const w = S({ x:400, y:400 });
    pe('pointerdown', w.x, w.y);
    ok('V03 抓住的是拐点', drag && drag.mode === 'bend' && drag.index === 0, drag && drag.mode + '/' + (drag && drag.index));
    pe('pointermove', w.x + 50, w.y - 30);
    pe('pointerup', w.x + 50, w.y - 30);
    const moved = e.waypoints[0];
    ok('V03b 拐点跟着移动',
      Math.abs(moved.x - (400 + 50 / view.z)) < 2 && Math.abs(moved.y - (400 - 30 / view.z)) < 2,
      Math.round(moved.x) + ',' + Math.round(moved.y));
  });
  T('V04 拉成一条直线会自动收掉拐点', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    selectEdge(e.id);
    addWaypoint(e, 400, 400);
    const pts = edgeGeomFor(e).pts;
    moveWaypoint(e, 0, (pts[0].x + pts[2].x) / 2, (pts[0].y + pts[2].y) / 2);
    ok('V04 判定为直线并删除', pruneWaypoint(e, 0) === true);
    ok('V04b 拐点已清空', !e.waypoints || e.waypoints.length === 0);
  });
  T('V05 双击拐点删除它', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    selectEdge(e.id);
    addWaypoint(e, 500, 500);
    const w = S({ x:500, y:500 });
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:w.x, clientY:w.y, bubbles:true, cancelable:true }));
    ok('V05 拐点已删掉', !e.waypoints || e.waypoints.length === 0, e.waypoints && e.waypoints.length);
  });
  T('V06 右键连线可以加 / 清拐点', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    const m = S(edgeGeomFor(e).mid);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:m.x, clientY:m.y, bubbles:true, cancelable:true }));
    const add = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('在此添加拐点') === 0);
    ok('V06 菜单里有「在此添加拐点」', !!add);
    if (add) add.click();
    ok('V06b 加上了一个拐点', e.waypoints && e.waypoints.length === 1);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:m.x, clientY:m.y, bubbles:true, cancelable:true }));
    const clr = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('清除全部拐点') === 0);
    ok('V06c 有拐点时出现「清除全部拐点」', !!clr);
    if (clr) clr.click();
    ok('V06d 已清空', !e.waypoints);
    hideCtx();
  });
  T('V07 曲线 + 拐点走平滑样条', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    setEdgeStyle(e, { route:'ortho' });
    addWaypoint(e, 400, 500); addWaypoint(e, 700, 300);
    ok('V07 正交时是折线', edgeGeomFor(e).type === 'p');
    setEdgeStyle(e, { route:'curve' });
    const g = edgeGeomFor(e);
    ok('V07b 曲线时是样条', g.type === 'w', g.type);
    ok('V07c 端点仍是节点上的锚点', g.pts.length === 4, g.pts.length);
    dirty = true; draw();
    ok('V07d 样条能正常绘制', true);
  });
  T('V08 拐点能存下来', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    addWaypoint(e, 321, 654);
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    const e2 = doc.edges.find(x => x.id === e.id);
    ok('V08 往返保留', e2.waypoints && e2.waypoints.length === 1 &&
      e2.waypoints[0].x === 321 && e2.waypoints[0].y === 654, JSON.stringify(e2.waypoints));
  });
  T('V09 拐点能被命中（用于拖拽 / 删除）', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    selectEdge(e.id);
    addWaypoint(e, 600, 600);
    ok('V09 命中拐点', (hitWaypoint({ x:600, y:600 }) || {}).index === 0);
    ok('V09b 离远了不命中', hitWaypoint({ x:100, y:100 }) === null);
    selEdgeId = null;
    ok('V09c 没选中连线时不命中拐点', hitWaypoint({ x:600, y:600 }) === null);
  });

  /* ==================== 节点外观 ==================== */
  T('P01 默认全部跟随主题', () => {
    fresh();
    ok('P01 外观字段都是 null', doc.nodes.every(n =>
      !n.font && !n.fsPx && !n.color && !n.border), '有节点被改过');
    ok('P01b 默认字体就是主题字体', nodeFontFamily(doc.nodes[0]) === FONT);
    ok('P01c 默认字号 16 / 根节点 32', nodeFontSize(nodeByText('节点')) === FS &&
      nodeFontSize(doc.nodes.find(n => !idx.parent.has(n.id))) === FS_BIG);
  });
  T('P02 节点样式面板：打开 / 列选项 / 关闭', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    selectOnly(n.id);
    openNodeBox(n);
    ok('P02 面板打开', nodeBoxEl.style.display === 'block');
    ok('P02b 字号 5 个选项', nbFsEl.querySelectorAll('.opt').length === NODE_FS_CHOICES.length,
      nbFsEl.querySelectorAll('.opt').length);
    ok('P02c 字体 4 个选项', nbFontEl.querySelectorAll('.opt').length === Object.keys(NODE_FONTS).length,
      nbFontEl.querySelectorAll('.opt').length);
    ok('P02d 色板 = 默认 + ' + NODE_COLORS.length + ' 色',
      nbColorEl.querySelectorAll('.sw').length === NODE_COLORS.length + 1 &&
      nbBorderEl.querySelectorAll('.sw').length === NODE_COLORS.length + 1);
    ok('P02e 默认项高亮', nbFsEl.querySelectorAll('.opt')[0].className.indexOf('on') >= 0 &&
      nbColorEl.querySelectorAll('.sw')[0].className.indexOf('on') >= 0);
    closeNodeBox();
    ok('P02f 面板关闭', nodeBoxEl.style.display === 'none');
  });
  T('P03 改字号：画出的是新字号，尺寸跟着重算', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    const h0 = n.h, lh0 = n.lh;
    selectOnly(n.id); openNodeBox(n);
    const opts = [...nbFsEl.querySelectorAll('.opt')];
    opts[3].click();                                   // 32
    ok('P03 fsPx 已设置', n.fsPx === 32 && n.fs === 32, n.fsPx + '/' + n.fs);
    ok('P03b 行高跟着变', n.lh > lh0, lh0 + ' -> ' + n.lh);
    ok('P03c 高度跟着变', n.h > h0, h0 + ' -> ' + n.h);
    ok('P03d 面板同步高亮', [...nbFsEl.querySelectorAll('.opt')][3].className.indexOf('on') >= 0);
    const opts2 = [...nbFsEl.querySelectorAll('.opt')];
    opts2[0].click();                                  // 回到自动
    ok('P03e 可以回到自动', n.fsPx === null && n.lh === lh0, n.fsPx);
    closeNodeBox();
  });
  T('P04 改字体：折行按新字体重算', () => {
    fresh(); layoutMind();
    const n = nodeByText('矩形 / 圆角 / 菱形 / 椭圆');
    const w0 = n.w;
    setNodeStyle(n, { font:'sans' });
    ok('P04 字体已记录', n.font === 'sans' && n.fam === NODE_FONTS.sans);
    ok('P04b 宽度按新字体重算', n.w !== w0, w0 + ' -> ' + n.w);
    ok('P04c 仍然能折行', Array.isArray(n.lines) && n.lines.length >= 1);
    setNodeStyle(n, { font:'auto' });
    ok('P04d 回到主题字体', nodeFontFamily(n) === FONT);
  });
  T('P05 改字色 / 外框色并真的用上', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    setNodeStyle(n, { color:'#00ffff', border:'#ff7f27' });
    ok('P05 两个颜色都记下了', n.color === '#00ffff' && n.border === '#ff7f27');
    dirty = true; draw();
    ok('P05b 用自定义颜色绘制不报错', true);
    const c = buildExportCanvas([n]);
    ok('P05c 导出也带着颜色', c.width > 0);
  });
  T('P06 一键恢复默认 / 非法值被规整', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    setNodeStyle(n, { font:'sans', fsPx:32, color:'#ff0000', border:'#00ff00' });
    resetNodeStyle(n);
    ok('P06 全部回到 null', !n.font && !n.fsPx && !n.color && !n.border);
    ok('P06b 字体回到主题字体', nodeFontFamily(n) === FONT);
    setNodeStyle(n, { font:'不存在的字体', fsPx:-5, color:'', border:'' });
    ok('P06c 非法字体 → null', n.font === null);
    ok('P06d 非法字号 → null', n.fsPx === null);
    ok('P06e 空颜色 → null', n.color === null && n.border === null);
  });
  T('P07 外观能存下来', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    setNodeStyle(n, { font:'serif', fsPx:24, color:'#b967ff', border:'#ffd800' });
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    const n2 = nodeByText('节点');
    ok('P07 往返保留', n2.font === 'serif' && n2.fsPx === 24 &&
      n2.color === '#b967ff' && n2.border === '#ffd800',
      [n2.font, n2.fs, n2.color, n2.border].join('/'));
    ok('P07b 反序列化后尺寸也是按新字号算的', n2.lh === Math.round(24 * 1.32), n2.lh);
  });

  /* ==================== 分组 ==================== */
  T('U01 至少两个节点才能成组', () => {
    fresh(); layoutMind();
    const before = (doc.groups || []).length;
    selectOnly(nodeByText('节点').id);
    createGroup();
    ok('U01 单个节点被拒绝', (doc.groups || []).length === before, (doc.groups || []).length);
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    ok('U01b 两个节点可以成组', !!grp && doc.groups.length === before + 1);
    ok('U01c 成员正确', grp.members.length === 2 && grp.members.indexOf(a.id) >= 0 && grp.members.indexOf(b.id) >= 0);
  });
  T('U02 成组不改变连接关系', () => {
    fresh(); layoutMind();
    const n0 = doc.nodes.length, e0 = doc.edges.length;
    const before = doc.edges.map(e => e.s + '>' + e.t).sort().join(',');
    sel.clear(); sel.add(nodeByText('节点').id); sel.add(nodeByText('连线').id);
    createGroup();
    ok('U02 节点数不变', doc.nodes.length === n0, doc.nodes.length);
    ok('U02b 连线数不变', doc.edges.length === e0, doc.edges.length);
    ok('U02c 连线的两端也没变', doc.edges.map(e => e.s + '>' + e.t).sort().join(',') === before);
  });
  T('U03 外框永远包住所有成员', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const r = groupBox(grp);
    ok('U03 成员都在框里', [a, b].every(n =>
      n.x >= r.x && n.y >= r.y && n.x + n.w <= r.x + r.w && n.y + n.h <= r.y + r.h),
      JSON.stringify(r));
    a.x += 400; a.y += 200;                            // 成员一动框就跟着变
    const r2 = groupBox(grp);
    ok('U03b 成员移动后框跟着长大/移动', r2.x !== r.x || r2.w !== r.w, JSON.stringify(r2));
    ok('U03c 移动后依然包住', [a, b].every(n =>
      n.x >= r2.x && n.y >= r2.y && n.x + n.w <= r2.x + r2.w && n.y + n.h <= r2.y + r2.h));
  });
  T('U04 分组可以重命名', () => {
    fresh(); layoutMind();
    sel.clear(); sel.add(nodeByText('节点').id); sel.add(nodeByText('连线').id);
    const grp = createGroup();
    renameGroup(grp, '前置处理');
    ok('U04 标题已改', grp.title === '前置处理', grp.title);
    renameGroup(grp, '  ');
    ok('U04b 空标题兜底', grp.title === '分组', grp.title);
    renameGroup(grp, '多行\n标题');
    ok('U04c 换行被压平', grp.title.indexOf('\n') < 0, grp.title);
  });
  T('U05 拖分组标题会整体搬动成员', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const p0 = { ax:a.x, ay:a.y, bx:b.x, by:b.y };
    const tb = groupTitleBox(grp);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    pe('pointerdown', h.x, h.y);
    ok('U05 进入分组拖拽', drag && drag.mode === 'group', drag && drag.mode);
    pe('pointermove', h.x + 120, h.y + 80);
    pe('pointerup', h.x + 120, h.y + 80);
    const dx = 120 / view.z, dy = 80 / view.z;
    ok('U05b 成员整体位移', Math.abs(a.x - p0.ax - dx) < 2 && Math.abs(a.y - p0.ay - dy) < 2,
      Math.round(a.x - p0.ax) + ',' + Math.round(a.y - p0.ay));
    ok('U05c 相对位置不变', Math.abs((b.x - a.x) - (p0.bx - p0.ax)) < 0.01);
    ok('U05d 拖完清干净了', !drag);
  });
  T('U06 分组外框有四个端点且能命中', () => {
    fresh(); layoutMind();
    sel.clear(); sel.add(nodeByText('节点').id); sel.add(nodeByText('连线').id);
    const grp = createGroup();
    const r = groupBox(grp);
    const P = anchorsFor(r);
    for (const k of ['r', 'l', 't', 'b']){
      const hit = hitPort({ x:P[k].x, y:P[k].y });
      if (!hit || hit.node !== grp.id || hit.side !== k) throw new Error('端点 ' + k + ' 没命中');
    }
    ok('U06 四个端点都能命中', true);
    ok('U06b 分组框上确实是 4 个锚点', Object.keys(P).length === 4);
  });
  T('U07 可以从分组端点拉一条线到节点', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const r = groupBox(grp);
    const before = doc.edges.length;
    const port = S(anchorsFor(r).l), tgt = center(c);
    pe('pointerdown', port.x, port.y);
    ok('U07 进入连线态', !!linking && linking.node === grp.id, linking && linking.node);
    pe('pointermove', tgt.x, tgt.y);
    pe('pointerup', tgt.x, tgt.y);
    ok('U07b 新增了一条从分组出发的线',
      doc.edges.length === before + 1 && doc.edges.some(e => e.s === grp.id && e.t === c.id),
      doc.edges.length);
    const e = doc.edges.find(x => x.s === grp.id && x.t === c.id);
    ok('U07c 这条线能算出几何（分组被当作端点）', !!edgeGeomFor(e));
    dirty = true; draw();
    ok('U07d 能正常绘制', true);
  });
  T('U08 连线也可以指到分组上', () => {
    fresh(); layoutMind();
    const c = nodeByText('操作');
    sel.clear(); sel.add(nodeByText('节点').id); sel.add(nodeByText('连线').id);
    const grp = createGroup();
    const e = linkNodes(c.id, grp.id);
    ok('U08 建线成功', !!e);
    reindex();
    const ep = edgeEndpoints(e);
    const r = groupBox(grp);
    ok('U08b 终点落在分组框的某条边上', (() => {
      const P = anchorsFor(r);
      return ['r','l','t','b'].some(k => Math.abs(ep.b.x - P[k].x) < 0.01 && Math.abs(ep.b.y - P[k].y) < 0.01);
    })(), JSON.stringify(ep.b));
    ok('U08c 不影响树的父子关系（分组不进树）',
      doc.nodes.filter(n => !idx.parent.has(n.id)).length >= 1);
  });
  T('U09 成员被删掉后分组会自动收缩 / 消失', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('返回') || nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    ok('U09 前置：2 个成员', grp.members.length === 2);
    // 直接删掉一个成员（绕过 UI，模拟别处删节点）
    doc.nodes = doc.nodes.filter(n => n.id !== a.id);
    doc.edges = doc.edges.filter(e => e.s !== a.id && e.t !== a.id);
    reindex();
    ok('U09b 分组只剩 1 个成员', grp.members.length === 1, grp.members.length);
    doc.nodes = doc.nodes.filter(n => n.id !== b.id);
    doc.edges = doc.edges.filter(e => e.s !== b.id && e.t !== b.id);
    reindex();
    ok('U09c 空分组自动消失', (doc.groups || []).indexOf(grp) < 0, doc.groups.length);
  });
  T('U10 解散分组：成员和连线都留着', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const n0 = doc.nodes.length, e0 = doc.edges.length;
    selectGroup(grp.id);
    deleteSelection();                                  // 选中分组后按 Del = 解散
    ok('U10 分组没了', (doc.groups || []).indexOf(grp) < 0);
    ok('U10b 节点一个没少', doc.nodes.length === n0, doc.nodes.length);
    ok('U10c 连线也一条没少', doc.edges.length === e0, doc.edges.length);
    ok('U10d 选中态已清', selGroupId === null);
  });
  T('U11 分组能存下来', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    renameGroup(grp, '我的分组');
    grp.color = '#ff7f27';
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('U11 序列化里有 groups', Array.isArray(snap.groups) && snap.groups.length === 1, JSON.stringify(snap.groups));
    deserialize(snap);
    const g2 = (doc.groups || [])[0];
    ok('U11b 往返保留', !!g2 && g2.title === '我的分组' && g2.members.length === 2 && g2.color === '#ff7f27',
      g2 && g2.title + '/' + g2.members.length + '/' + g2.color);
  });
  T('U12 点到框里面不会选中分组（留给成员节点）', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const r = groupBox(grp);
    // 框内部的空白处（避开成员）：取框内中心，若正好压到成员就换一个点
    const c = { x:r.x + r.w / 2, y:r.y + r.h / 2 };
    ok('U12 内部点不会命中分组边框', hitGroupBorder(c) === null);
    ok('U12b 但整个区域算这个分组（用于拖线落点）', (hitGroupArea(c) || {}).id === grp.id);
    const tb = groupTitleBox(grp);
    ok('U12c 标题栏可以命中分组', (hitGroupTitle({ x:tb.x + 4, y:tb.y + tb.h / 2 }) || {}).id === grp.id);
  });
  T('U13 Ctrl+G 把选中的节点加入分组', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    keyRaw('g', { ctrlKey:true });
    ok('U13 Ctrl+G 建组', (doc.groups || []).length === 1, (doc.groups || []).length);
    const c = nodeByText('操作');
    selectOnly(c.id);
    keyRaw('g', { ctrlKey:true });
    ok('U13b 单个节点不会建新组', (doc.groups || []).length === 1);
  });

  });

  /* ==================== 收尾 ==================== */
  T('X01 全流程后仍无重复 id / 无孤儿', () => {
    fresh();
    ok('X01 无重复 id', dupIds().length === 0, dupIds().join(','));
    ok('X01b 无孤儿节点', doc.nodes.filter(n => doc.edges.some(e => e.t === n.id)).every(n => idx.parent.has(n.id)));
    dirty = true; draw();
    ok('X01c draw 正常', true);
  });
  T('X02 红心光标：编辑器打开时画布上仍跟随', () => {
    fresh(); fitView();
    const n = nodeByText('节点');
    selectOnly(n.id); startEdit('node', n.id);
    window.dispatchEvent(new MouseEvent('mousemove', { clientX:60, clientY:560, bubbles:true }));
    ok('X02 画布上红心可见', heartEl.style.display === 'block', heartEl.style.display);
    const r = editor.getBoundingClientRect();
    window.dispatchEvent(new MouseEvent('mousemove', {
      clientX:Math.round(r.left + r.width / 2), clientY:Math.round(r.top + r.height / 2), bubbles:true }));
    ok('X02b 编辑器上红心让位', heartEl.style.display === 'none');
    cancelEdit();
  });
  T('X03 恢复默认状态', () => {
    GP.keys.reset(); applyTheme('undertale'); fresh(); fitView();
    ok('X03 已回到示例文档', doc.nodes.length === 12);
  });

  const fails = log.filter(l => l.startsWith('FAIL') || l.startsWith('THROW'));
  const pre = document.createElement('pre');
  pre.id = 'testlog';
  pre.textContent = 'REGRESSION total=' + log.length + ' failed=' + fails.length + '\n' + log.join('\n') +
    (errors.length ? '\nJSERRORS:\n' + errors.join('\n') : '\nJSERRORS: none');
  pre.style.display = 'none';
  document.body.appendChild(pre);
})();
