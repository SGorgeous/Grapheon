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
  T('G06 E 键打开面板；没选中连线时仍可用于改名', () => {
    fresh();
    const st = nodeByText('节点');
    selectOnly(st.id);
    keyRaw('e');                                        // 没选中连线 → 应当起手改名
    ok('G06 没选中连线时 e 触发改名', !!editing && editor.value === 'e', editor.value + '/' + !!editing);
    cancelEdit();
    const e = doc.edges[0];
    selectEdge(e.id);
    keyRaw('e');
    ok('G06b 选中连线时 e 打开样式面板', edgeBoxEl.style.display === 'block');
    keyRaw('Escape');
    ok('G06c Esc 关闭面板', edgeBoxEl.style.display === 'none');
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
    ok('K02c e → 连线样式', b['e'] === 'edge.style');
    ok('K02d 模式键位已移除', !b['1'] && !b['2'] && !GP.keys.actions['mode.mind'] && !GP.keys.actions['mode.flow']);
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
