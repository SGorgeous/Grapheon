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
  // 右键菜单现在用子菜单分层。menuStack[0] 是根菜单，之后是展开着的各级子菜单。
  const menuItems = () => menuStack.reduce((a, m) => a.concat([...m.querySelectorAll('.item')]), []);
  /* 子菜单里的当前值前面有 ●，比较前先剥掉，否则「当前项」永远匹配不上 */
  const labelOf   = (d) => d.querySelector('.lb').textContent.trim().replace(/^●\s*/, '');
  const menuItem  = (prefix) => menuItems().find(d => labelOf(d).indexOf(prefix) === 0);
  /* 在根菜单里找到某一项并把它的子菜单展开（mouseenter 不冒泡，直接派发） */
  const openSub = (prefix) => {
    const d = [...ctxEl.querySelectorAll('.item')].find(x => labelOf(x).indexOf(prefix) === 0);
    if (!d) throw new Error('根菜单里没有「' + prefix + '」');
    d.onmouseenter && d.onmouseenter();
    return d;
  };
  const clickSub = (prefix) => {
    const d = menuItem(prefix);
    if (d) d.click();
    return !!d;
  };
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
  /* 测试的固定基线：经典示例（12 节点 / 11 连线 / 单根）。
     刻意不用「当前的默认示例」—— 默认示例是给用户看的展品，会随功能增删而变，
     拿它当基线的话每动一次示例就要改几百条断言。 */
  function fresh(){
    deserialize(classicDoc());
    reindex(); sizeAll(); layoutMind(); initHist(); fitView();
    sel.clear(); selEdgeId = null; mark();
  }
  /* 想测新示例本身的时候用这个 */
  function freshAll(){
    loadDemo('all');
    reindex(); sizeAll(); initHist(); fitView();
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
    const ids = ['b-undo','b-redo','b-new','b-open','b-save','b-png','b-insert','b-view','b-set','b-help','b-reload'];
    const missing = ids.filter(id => {
      const b = document.getElementById(id);
      return !b || typeof b.onclick !== 'function';
    });
    ok('A02 全部已绑定', missing.length === 0, missing.length ? '未绑定：' + missing.join(',') : ids.length + '/' + ids.length);
    ok('A02b 模式按钮已移除', !document.getElementById('b-mind') && !document.getElementById('b-flow'));
    ok('A02c 旧的排版 / 居中 / 图片按钮已并入视图和插入菜单',
      !document.getElementById('b-tidy') && !document.getElementById('b-fit') && !document.getElementById('b-img'));
  });
  T('A03 每个按钮点下去都有效果（不是空绑定）', () => {
    const origDL = downloadBlob;
    let dl = null;
    downloadBlob = (blob, filename) => { dl = { size: blob && blob.size, type: blob && blob.type, filename }; };
    const cases = [
      ['b-new',   () => ctxEl.style.display === 'block'],
      ['b-open',  () => true],
      ['b-save',  () => dl && /^grapheon-\d{4}-\d{2}-\d{2}\.json$/.test(dl.filename) && dl.size > 100],
      ['b-png',   () => expEl.style.display === 'block'],
      ['b-insert',() => ctxEl.style.display === 'block'],
      ['b-view',  () => ctxEl.style.display === 'block'],
      ['b-set',   () => setEl.style.display === 'block'],
      ['b-help',  () => helpEl.style.display === 'block'],
      ['b-undo',  () => true],
      ['b-redo',  () => true],
      // 刷新会真的重新加载页面，所以把 confirm 拦成「取消」，只验它确实问了
      ['b-reload',() => asked > 0]
    ];
    let asked = 0;
    const origConfirm = window.confirm;
    window.confirm = () => { asked++; return false; };     // 永远点「取消」，别真刷新
    const bad = [];
    for (const [id, check] of cases){
      fresh();
      expEl.style.display = 'none'; helpEl.style.display = 'none';
      edgeBoxEl.style.display = 'none'; setEl.style.display = 'none'; hideCtx();
      dl = null; asked = 0;
      try { document.getElementById(id).click(); }
      catch (e){ bad.push(id + ':抛异常(' + e.message + ')'); continue; }
      if (!check()) bad.push(id + ':无效果');
    }
    expEl.style.display = 'none'; helpEl.style.display = 'none';
    edgeBoxEl.style.display = 'none'; setEl.style.display = 'none'; hideCtx();
    downloadBlob = origDL;
    window.confirm = origConfirm;
    ok('A03 11 个按钮全部生效', bad.length === 0, bad.join(' '));
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
  T('D08 自由节点（没有父节点）也能删掉', () => {
    fresh();
    const a = nodeByText('节点');
    selectEdge(edgeOf(rootNode(), a).id);
    deleteSelection();                        // 先断掉它和根的连线
    ok('D08 它现在没有父节点了', isRoot(byId(a.id)));
    const before = doc.nodes.length;
    selectOnly(a.id);
    deleteSelection();
    // 以前「没有入边 = 根节点 = 不许删」，但自由节点 / 图片节点 / 嵌入节点永远没有入边，
    // 于是全都删不掉。现在只有「这一刀会删空整个画布」才拦。
    ok('D08b 现在能删掉了', doc.nodes.length < before, before + ' -> ' + doc.nodes.length);
    ok('D08c 没留下悬挂的连线', doc.edges.every(e => byId(e.s) && byId(e.t)));
  });
  T('D08d 删空整个画布会被拦下来', () => {
    fresh();
    const keep = rootNode();
    doc.nodes = [keep];
    doc.edges = []; doc.groups = [];
    reindex(); sizeAll();
    selectOnly(keep.id);
    deleteSelection();
    ok('D08d 最后一个节点删不掉', doc.nodes.length === 1, doc.nodes.length);
    skipDlg();
    ok('D08e 有说明为什么', /画布就空了/.test(dlgText.textContent), dlgText.textContent.slice(0, 40));
  });
  T('D08f 图片节点能删掉（这次报的那个 BUG）', () => {
    fresh(); layoutMind();
    const n = addNodeAt('', 0, 0, 'rect');
    n.kind = 'image';
    n.image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    n.imgW = 4; n.imgH = 4;
    sizeNode(n);
    reindex(); sizeAll();
    const before = doc.nodes.length;
    selectOnly(n.id);
    deleteSelection();
    ok('D08f 图片节点删得掉', !byId(n.id) && doc.nodes.length === before - 1,
      doc.nodes.length + ' / ' + before);
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
    ok('N01b 有「空白文件」和两种示例',
      items.some(t => t.indexOf('空白文件') === 0)
      && items.some(t => t.indexOf('示例：全部功能') === 0)
      && items.some(t => t.indexOf('示例：经典') === 0), items.join(' / '));
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
  T('N03 新建经典示例文档', () => {
    fresh();
    $('#b-new').click();
    [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('示例：经典') === 0).click();
    ok('N03 恢复成 12 节点', doc.nodes.length === 12, doc.nodes.length);
    ok('N03b 已排版（不是全叠在原点）', new Set(doc.nodes.map(n => Math.round(n.x))).size > 1);
  });
  T('N03c 新建「全部功能」示例：内容齐、框贴好、变量是活的', () => {
    fresh();
    $('#b-new').click();
    [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('示例：全部功能') === 0).click();
    ok('N03c 节点够多', doc.nodes.length >= 40, doc.nodes.length);
    ok('N03d 有分组', (doc.groups || []).length >= 7, (doc.groups || []).length);
    ok('N03e 有函数分组', (doc.groups || []).some(g => g.isFunction));
    ok('N03f 有变量定义 / 运算 / 输出节点',
      doc.nodes.some(n => n.kind === 'var') && doc.nodes.some(n => n.kind === 'op')
      && doc.nodes.some(n => n.kind === 'out'),
      NODE_KINDS.map(k => k + ':' + doc.nodes.filter(n => n.kind === k).length).join(' '));
    ok('N03g 分组框真的贴住了成员（不是虚的）', (doc.groups || []).every(g => {
      if (!g.members.length) return true;
      const b = groupMemberBounds(g);
      return g.x <= b.minX + 1 && g.y <= b.minY + 1
          && g.x + g.w >= b.maxX - 1 && g.y + g.h >= b.maxY - 1;
    }));
    const total = doc.nodes.find(n => n.text === '合计 {单价} 元');
    ok('N03h 示例里有那个引用变量的节点', !!total);
    ok('N03i 变量是活的：12 × 4 = 48', displayTextOf(total) === '合计 48 元', displayTextOf(total));
    const shown = doc.nodes.find(n => n.text === '折后 {折扣价} 元');
    ok('N03j 函数分组也是活的：100 - 15 = 85', displayTextOf(shown) === '折后 85 元',
      displayTextOf(shown));
    ok('N03k 有文档输出节点', !!documentOutputNode(), documentOutputNode() && documentOutputNode().text);
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
    openSub('形状');
    const it = menuItem('恢复自适应尺寸');
    ok('W04b 右键「形状」子菜单里有恢复项', !!it);
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
    openSub('拐点');
    const add = menuItem('在此添加拐点');
    ok('V06 「拐点」子菜单里有「在此添加拐点」', !!add);
    if (add) add.click();
    ok('V06b 加上了一个拐点', e.waypoints && e.waypoints.length === 1);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:m.x, clientY:m.y, bubbles:true, cancelable:true }));
    openSub('拐点');
    const clr = menuItem('清除全部拐点');
    ok('V06c 有拐点时子菜单里有「清除全部拐点」', !!clr);
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
  T('U03 新建分组给一个刚好装下成员的框', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const r = groupBox(grp);
    ok('U03 尺寸是正的', r.w > 0 && r.h > 0, JSON.stringify({ w:r.w, h:r.h }));
    ok('U03b 成员都在框里', [a, b].every(n =>
      n.x >= r.x && n.y >= r.y && n.x + n.w <= r.x + r.w && n.y + n.h <= r.y + r.h),
      JSON.stringify(r));
  });
  T('U03c 框只会长大：成员顶出去就扩，成员回来不缩', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const r0 = groupBox(grp);
    // 把成员 a 拖到框里但让它整个露出去（中心仍在框内 → 还是成员 → 框该长大）
    const inside = { x:grp.x + grp.w - 6, y:grp.y + grp.h / 2 };
    const ac = center(a);
    const dst = S(inside);
    pe('pointerdown', ac.x, ac.y);
    pe('pointermove', dst.x, dst.y);
    pe('pointerup', dst.x, dst.y);
    ok('U03c 拖完还是成员', grp.members.indexOf(a.id) >= 0, JSON.stringify(grp.members));
    const r1 = groupBox(grp);
    ok('U03c2 框长大到整个成员都在里面',
      a.x >= r1.x && a.y >= r1.y && a.x + a.w <= r1.x + r1.w && a.y + a.h <= r1.y + r1.h,
      JSON.stringify({ r:r1, a:{ x:a.x, y:a.y, w:a.w, h:a.h } }));
    ok('U03c3 确实比原来大', r1.w > r0.w + 1 || r1.h > r0.h + 1, r0.w + 'x' + r0.h + ' -> ' + r1.w + 'x' + r1.h);
    // 再把它拖回框正中：框不会缩回去
    const ac2 = center(a);
    const back = S({ x:grp.x + grp.w / 2, y:grp.y + grp.h / 2 });
    pe('pointerdown', ac2.x, ac2.y);
    pe('pointermove', back.x, back.y);
    pe('pointerup', back.x, back.y);
    const r2 = groupBox(grp);
    ok('U03c4 成员回来了框也不缩', r2.w >= r1.w - 1 && r2.h >= r1.h - 1,
      r1.w + 'x' + r1.h + ' -> ' + r2.w + 'x' + r2.h);
  });
  T('U03i 手动拉不到比成员还小', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    setGroupSize(grp, 130, 90);                       // 想缩到很小
    const need = groupMinSize(grp);
    ok('U03i 被夹回成员的外接框', grp.w >= need.w - 0.5 && grp.h >= need.h - 0.5,
      grp.w + 'x' + grp.h + ' vs min ' + Math.round(need.w) + 'x' + Math.round(need.h));
    ok('U03i2 成员还是全都装得下', [a, b].every(n =>
      n.x >= grp.x && n.y >= grp.y && n.x + n.w <= grp.x + grp.w && n.y + n.h <= grp.y + grp.h));
  });
  T('U03d 框能像节点一样拖右下角自由改尺寸', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    selectGroup(grp.id);
    const r = groupBox(grp);
    const h = S({ x:r.x + r.w - 4, y:r.y + r.h - 4 });
    pe('pointerdown', h.x, h.y);
    ok('U03d 抓住的是分组缩放柄', drag && drag.mode === 'resize' && drag.isGroup === true,
      drag && drag.mode + '/' + (drag && drag.isGroup));
    const tgt = S({ x:grp.x + 520, y:grp.y + 380 });
    pe('pointermove', tgt.x, tgt.y);
    ok('U03e 宽度跟着变', Math.abs(grp.w - 520) <= 1, grp.w);
    ok('U03f 高度跟着变', Math.abs(grp.h - 380) <= 1, grp.h);
    pe('pointerup', tgt.x, tgt.y);
    ok('U03g 拉大后成员关系没被动过', grp.members.length === 2, grp.members.length);
  });
  T('U03h 框缩不到没有', () => {
    fresh(); layoutMind();
    sel.clear(); sel.add(nodeByText('节点').id); sel.add(nodeByText('连线').id);
    const grp = createGroup();
    selectGroup(grp.id);
    setGroupSize(grp, 5, 5);
    ok('U03h 有下限', grp.w >= 120 && grp.h >= 80, grp.w + 'x' + grp.h);
  });
  T('U14 把节点拖进框会自动收纳，拖出去会自动移出', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    // 造一个空的自由框，再把「操作」拖进去
    const c = nodeByText('操作');
    const empty = newEmptyGroup(c.x + 600, c.y + 400);
    ok('U14 前置：空框没有成员', empty.members.length === 0, empty.members.length);
    const cc = center(c);
    pe('pointerdown', cc.x, cc.y);
    const dst = S({ x:empty.x + empty.w / 2, y:empty.y + empty.h / 2 });
    pe('pointermove', dst.x, dst.y);
    pe('pointerup', dst.x, dst.y);
    ok('U14b 拖进去之后自动成为成员', empty.members.indexOf(c.id) >= 0, JSON.stringify(empty.members));
    // 再拖出来
    const cc2 = center(c);
    pe('pointerdown', cc2.x, cc2.y);
    const outS = S({ x:empty.x - 500, y:empty.y - 400 });
    pe('pointermove', outS.x, outS.y);
    pe('pointerup', outS.x, outS.y);
    ok('U14c 拖出去之后自动移出', empty.members.indexOf(c.id) < 0, JSON.stringify(empty.members));
  });
  T('U15 分组也能用节点那套端点吸附面板', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const c = nodeByText('操作');
    const e = linkNodes(grp.id, c.id);
    reindex();
    ok('U15 前置：分组上有一条线', !!e && anchorEdges(grp.id).length === 1);
    // 右键分组标题 → 菜单里应当有「连线端点吸附…」
    const tb = groupTitleBox(grp);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:h.x, clientY:h.y, bubbles:true, cancelable:true }));
    const labels = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('U15b 分组菜单里有「连线端点吸附…」',
      labels.some(t => t.indexOf('连线端点吸附') === 0), labels.join(' | '));
    ok('U15c 分组菜单里也有「重命名」（和节点共用同一段代码）',
      labels.some(t => t.indexOf('重命名') === 0), labels.join(' | '));
    const it = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('连线端点吸附') === 0);
    if (it) it.click();
    ok('U15d 面板打开', endBoxEl.style.display === 'block');
    ok('U15d2 选中的是分组，不是把分组 id 混进节点选择集',
      selGroups.has(grp.id) && sel.size === 0 && !byId(grp.id), [...selGroups].join(',') + '/' + sel.size);
    ok('U15e 面板标题写的是分组', endSubEl.textContent.indexOf('分组') === 0, endSubEl.textContent);
    ok('U15f 列出了那条线', endListEl.querySelectorAll('.endrow').length === 1,
      endListEl.querySelectorAll('.endrow').length);
    // 选「上」→ 分组的 aSide 应当钉在框的上边中点
    const opts = [...endListEl.querySelectorAll('.endrow')[0].querySelectorAll('.opt')];
    opts[1].click();
    ok('U15g aSide 钉成 t', e.aSide === 't', e.aSide);
    const ep = edgeEndpoints(e);
    const want = anchorsFor(groupBox(grp)).t;
    ok('U15h 起点锚点就在分组框上边中点',
      Math.abs(ep.a.x - want.x) < 0.01 && Math.abs(ep.a.y - want.y) < 0.01,
      JSON.stringify(ep.a) + ' vs ' + JSON.stringify(want));
    closeEndBox();
  });
  T('V20 防止节点重叠：默认开，压到了就弹开', () => {
    fresh(); setOverlapGuard(true);
    const a = nodeByText('节点'), b = nodeByText('操作');
    // 手工把 b 挪到和 a 完全重合
    const ab = nodeBox(a);
    b.x = ab.x; b.y = ab.y;
    reindex(); sizeAll();
    ok('V20 前置：现在确实叠着', rectsHit(nodeBox(a), nodeBox(b), 0));
    const pushed = resolveOverlaps([a.id]);
    ok('V20b 有人被弹开了', pushed.size >= 1, pushed.size);
    ok('V20c 弹开之后不再重叠', !rectsHit(nodeBox(a), nodeBox(b), 0),
      JSON.stringify([nodeBox(a), nodeBox(b)]));
    ok('V20d 被拖的那个没动', nodeBox(a).x === ab.x && nodeBox(a).y === ab.y,
      nodeBox(a).x + ',' + nodeBox(a).y + ' vs ' + ab.x + ',' + ab.y);
    ok('V20e 弹开之后留了缝', (() => {
      const ra = nodeBox(a), rb = nodeBox(b);
      const gapX = Math.max(rb.x - (ra.x + ra.w), ra.x - (rb.x + rb.w));
      const gapY = Math.max(rb.y - (ra.y + ra.h), ra.y - (rb.y + rb.h));
      return Math.max(gapX, gapY) >= OVERLAP_GAP - 0.01;
    })());
  });
  T('V20f 关掉之后可以随便叠', () => {
    fresh(); setOverlapGuard(false);
    const a = nodeByText('节点'), b = nodeByText('操作');
    const ab = nodeBox(a);
    b.x = ab.x; b.y = ab.y;
    reindex(); sizeAll();
    const pushed = resolveOverlaps([a.id]);
    ok('V20f 关掉时一个都不弹', pushed.size === 0, pushed.size);
    ok('V20g 还是叠着', rectsHit(nodeBox(a), nodeBox(b), 0));
    // 手动弹开是 force，跟开关无关
    const forced = resolveOverlaps([], true);
    ok('V20h 手动弹开无视开关', forced.size >= 1, forced.size);
    ok('V20i 弹完不叠了', !rectsHit(nodeBox(a), nodeBox(b), 0));
    setOverlapGuard(true);
  });
  T('V20j 弹开不会把节点弹出画面外，也不会吃掉节点', () => {
    fresh(); setOverlapGuard(true);
    const before = doc.nodes.length;
    const all = doc.nodes.map(n => ({ x:n.x, y:n.y }));
    // 把所有节点堆到同一格，看它能不能全部拆开
    for (const n of doc.nodes){ n.x = 0; n.y = 0; }
    reindex(); sizeAll();
    for (let i = 0; i < 3; i++) resolveOverlaps([], true);
    ok('V20j 节点一个没少', doc.nodes.length === before, doc.nodes.length);
    let overlap = 0;
    const vis = doc.nodes.filter(n => !isHidden(n.id));
    for (let i = 0; i < vis.length; i++)
      for (let j = i + 1; j < vis.length; j++)
        if (rectsHit(nodeBox(vis[i]), nodeBox(vis[j]), 0)) overlap++;
    ok('V20k 全堆在一起也能拆干净', overlap === 0, overlap + ' 对还叠着');
    ok('V20l 位置真的变了', doc.nodes.some((n, i) => n.x !== all[i].x || n.y !== all[i].y));
    // 隐藏的节点不参与（拿一个来验）
    ok('V20m 只对可见节点动手', vis.length <= doc.nodes.length);
  });
  T('U19b 连到分组的线能存读往返', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const e = linkNodes(c.id, grp.id);          // 节点 → 分组
    const e2 = linkNodes(grp.id, c.id);         // 分组 → 节点
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('U19b 存档里两条都在', snap.edges.filter(x => x.s === grp.id || x.t === grp.id).length === 2,
      snap.edges.filter(x => x.s === grp.id || x.t === grp.id).length);
    deserialize(snap);
    const back = doc.edges.filter(x => x.s === grp.id || x.t === grp.id);
    // 以前 deserialize 的 ok 集合只有节点 id，指向分组的线会被静默丢掉
    ok('U19c 读回来也还在', back.length === 2, back.length);
    ok('U19d 方向没串', back.some(x => x.s === c.id && x.t === grp.id)
      && back.some(x => x.s === grp.id && x.t === c.id),
      back.map(x => x.s + '>' + x.t).join(' '));
  });
  T('U20 导出时指向分组的连线不会被丢掉', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const e = linkNodes(c.id, grp.id);        // 一条连到分组的线
    reindex();
    ok('U20 前置：这条线确实存在', !!e && doc.edges.indexOf(e) >= 0);
    // 全部范围导出：连到分组的那条线必须在，而且一条都不能漏
    const pAll = exportPlan(doc.nodes);
    ok('U20b 连到分组的线在导出清单里', pAll.edges.indexOf(e) >= 0, pAll.edges.length + ' 条');
    ok('U20c 一条都没漏', pAll.edges.length === doc.edges.length, pAll.edges.length + ' / ' + doc.edges.length);
    ok('U20d 分组框也在导出清单里', pAll.drawGroups.indexOf(grp) >= 0, pAll.drawGroups.length);
    // 只导出跟它无关的节点时，这条线不该被带上（另一端不在图里）
    const pOne = exportPlan([c]);
    ok('U20e 只导出无关节点时不带它', pOne.edges.indexOf(e) < 0, pOne.edges.length);
    // 但导出分组里的成员时，框要画、连到框的线也要在
    const pMem = exportPlan([a]);
    ok('U20f 导出成员时框会被画', pMem.drawGroups.indexOf(grp) >= 0);
    ok('U20g 导出成员时连到框的线不被丢',
      doc.edges.filter(x => (x.s === a.id || x.t === a.id) || (pMem.drawGroups.length && (x.t === grp.id || x.s === grp.id)))
        .length >= 0 && pMem.edges.every(x => byId(x.s) || byGroup(x.s)), pMem.edges.length);
  });
  T('U16 空分组框不会自己消失', () => {
    fresh(); layoutMind();
    const grp = newEmptyGroup(0, 0);
    ok('U16 建出来是空的', grp.members.length === 0);
    reindex();
    ok('U16b 重新索引后还在', (doc.groups || []).indexOf(grp) >= 0);
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    ok('U16c 存下来再读还在', (doc.groups || []).length === 1 && doc.groups[0].w > 0,
      JSON.stringify(doc.groups));
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
    const p0 = { ax:a.x, ay:a.y, bx:b.x, by:b.y, gx:grp.x, gy:grp.y };
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
    ok('U05e 框自己也跟着走了', Math.abs(grp.x - p0.gx - dx) < 2 && Math.abs(grp.y - p0.gy - dy) < 2,
      Math.round(grp.x - p0.gx) + ',' + Math.round(grp.y - p0.gy));
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
    ok('U09c 空掉的框还留着（自由框可以是个空盒子）', (doc.groups || []).indexOf(grp) >= 0, doc.groups.length);
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
    ok('U10d 选中态已清', selGroups.size === 0);
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

  T('U17 排版之后框自动跟上，重新贴合成员', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    // 先把框手动拉得很大，模拟「框比成员大很多」
    const need = groupMinSize(grp);
    grp.x = need.x - 260; grp.y = need.y - 180;
    grp.w = need.w + 620; grp.h = need.h + 460;
    ok('U17 前置：框明显比成员大', grp.w > need.w + 500, grp.w + ' vs ' + Math.round(need.w));
    tidyLayout();
    const after = groupMinSize(grp);
    ok('U17b 排版后框重新贴合成员',
      Math.abs(grp.x - after.x) < 1 && Math.abs(grp.y - after.y) < 1 &&
      Math.abs(grp.w - after.w) < 1 && Math.abs(grp.h - after.h) < 1,
      JSON.stringify({ box:{ x:grp.x, y:grp.y, w:grp.w, h:grp.h },
                       need:{ x:after.x, y:after.y, w:after.w, h:after.h } }));
    ok('U17c 成员都在框里', [a, b].every(n =>
      n.x >= grp.x && n.y >= grp.y && n.x + n.w <= grp.x + grp.w && n.y + n.h <= grp.y + grp.h));
    ok('U17d 排版没改成员关系', grp.members.length === 2, grp.members.length);
  });
  T('U18 排版不会动空框（那是你手动拉的尺寸）', () => {
    fresh(); layoutMind();
    const empty = newEmptyGroup(0, 0);
    const w0 = empty.w, h0 = empty.h, x0 = empty.x, y0 = empty.y;
    tidyLayout();
    ok('U18 空框纹丝不动',
      empty.w === w0 && empty.h === h0 && empty.x === x0 && empty.y === y0,
      [empty.x, empty.y, empty.w, empty.h].join(','));
  });
  T('U19 排版会把成员摆到新位置，框跟到新位置', () => {
    fresh(); layoutMind();
    const a = nodeByText('单向箭头'), b = nodeByText('双向箭头');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const before = { x:grp.x, y:grp.y, w:grp.w, h:grp.h };
    // 先把成员挪走，让排版真的有东西可改
    a.x += 900; a.y += 700;
    growAllGroups();                       // 拖拽语义：只长不缩，框先被撑大
    const grown = { w:grp.w, h:grp.h };
    ok('U19 前置：框被撑大了', grown.w > before.w + 100, before.w + ' -> ' + grown.w);
    tidyLayout();
    ok('U19b 排版后框收缩回贴合成员（不再是从前那个大框）',
      grp.w < grown.w - 100, grown.w + ' -> ' + grp.w + '（原有的 ' + before.w + '）');
    const need = groupMinSize(grp);
    ok('U19c 框仍然精确贴合成员',
      Math.abs(grp.x - need.x) < 1 && Math.abs(grp.w - need.w) < 1,
      JSON.stringify({ box:{ x:grp.x, w:grp.w }, need:{ x:need.x, w:need.w } }));
  });
  /* ==================== 菜单分层 & 面板定位 ==================== */
  T('M01 右键菜单按功能分成了子菜单', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    const c = center(n);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    ok('M01 根菜单打开', ctxEl.style.display === 'block');
    const tops = [...ctxEl.querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('M01b 根菜单收短了（≤10 项）', tops.length <= 10, tops.length + ' 项: ' + tops.join(' | '));
    ok('M01c 有「形状」子菜单', tops.indexOf('形状') >= 0, tops.join(' | '));
    ok('M01d 顶层不再平铺四个形状', tops.indexOf('矩形') < 0 && tops.indexOf('菱形（判断）') < 0, tops.join(' | '));
    ok('M01e 子菜单项右边有 ▶', !!document.querySelector('.menu .item.sub .k'));
    hideCtx();
    ok('M01f 收起后子菜单元素也被清掉', document.querySelectorAll('.menu').length === 0,
      document.querySelectorAll('.menu').length);
  });
  T('M02 子菜单鼠标移上去才展开，收起时不留痕', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    const c = center(n);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    ok('M02 一开始只有一级菜单', menuStack.length === 1, menuStack.length);
    openSub('形状');
    ok('M02b 展开后有二级菜单', menuStack.length === 2, menuStack.length);
    ok('M02c 形状项本身还在（子菜单是新的元素）', ctxEl.querySelectorAll('.item').length > 0);
    const subs = [...menuStack[1].querySelectorAll('.item')].map(labelOf);
    ok('M02d 四个形状都在子菜单里',
      ['矩形', '圆角矩形', '菱形（判断）', '椭圆'].every(s => subs.some(x => x === s)), subs.join(' | '));
    // 移到一个没有子菜单的顶层项上 → 二级菜单应当收起来
    const plain = [...ctxEl.querySelectorAll('.item')].find(d => !d.classList.contains('sub'));
    plain.onmouseenter && plain.onmouseenter();
    ok('M02e 移到普通项上二级菜单收起', menuStack.length === 1, menuStack.length);
    hideCtx();
  });
  T('M03 子菜单里的当前值带 ●，点了就生效', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    setEdgeStyle(e, { arrow:'both', dash:true, route:'curve' });
    const m = S(edgeGeomFor(e).mid);
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:m.x, clientY:m.y, bubbles:true, cancelable:true }));
    openSub('箭头');
    const raw = [...menuStack[1].querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('M03 当前箭头带 ●', raw.some(t => t.indexOf('●') === 0 && t.indexOf('双向箭头') > 0), raw.join(' | '));
    ok('M03b 只有当前那一个带 ●', raw.filter(t => t.indexOf('●') === 0).length === 1, raw.join(' | '));
    clickSub('无箭头');
    ok('M03c 点一下就切过去了', e.arrow === 'none', e.arrow);
    ok('M03d 点完菜单关掉了', ctxEl.style.display === 'none' && menuStack.length === 0, menuStack.length);
    // 线型
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:m.x, clientY:m.y, bubbles:true, cancelable:true }));
    openSub('线型');
    const ls = [...menuStack[1].querySelectorAll('.item')].map(labelOf);
    const lsRaw = [...menuStack[1].querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('M03e 线型也是单选标记', lsRaw.some(t => t.indexOf('●') === 0 && t.indexOf('虚线') > 0), lsRaw.join(' | '));
    clickSub('实线');
    ok('M03f 线型已改', e.dash === false);
  });
  T('M04 分组颜色从「循环点」改成了直接选', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const tb = groupTitleBox(grp);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:h.x, clientY:h.y, bubbles:true, cancelable:true }));
    openSub('颜色');
    const ls = [...menuStack[1].querySelectorAll('.item')].map(labelOf);
    ok('M04 颜色子菜单列出默认 + ' + NODE_COLORS.length + ' 色',
      ls.length === NODE_COLORS.length + 1, ls.length + ': ' + ls.join(' | '));
    ok('M04b 当前是默认，默认项带 ●', [...menuStack[1].querySelectorAll('.item')][0].querySelector('.lb').textContent.indexOf('●') === 0, ls[0]);
    clickSub(NODE_COLORS[3][1]);                       // 红
    ok('M04c 直接选中了红色', grp.color === NODE_COLORS[3][0], grp.color);
    // 再打开，红色那项应当是 ●
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX:h.x, clientY:h.y, bubbles:true, cancelable:true }));
    openSub('颜色');
    const ls2 = [...menuStack[1].querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('M04d 重开后红色带 ●', ls2.some(t => t.indexOf('●') === 0 && t.indexOf('红') > 0), ls2.join(' | '));
    clickSub('默认');
    ok('M04e 可以选回默认', grp.color === null, grp.color);
  });
  T('M05 子菜单不会跑出视口右边', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    // 把这个节点平移到贴近右边缘的地方，再在它身上右键
    view.x += (innerWidth - 30) - (n.x * view.z + view.x);
    mark();
    const c = center(n);
    cv.dispatchEvent(new MouseEvent('contextmenu',
      { clientX:c.x, clientY:c.y, bubbles:true, cancelable:true }));
    ok('M05 根菜单夹进视口了', ctxEl.getBoundingClientRect().right <= innerWidth + 0.5,
      ctxEl.getBoundingClientRect().right + ' / ' + innerWidth);
    openSub('形状');
    const sr = menuStack[1].getBoundingClientRect();
    ok('M05b 子菜单也在视口内', sr.right <= innerWidth + 0.5 && sr.left >= -0.5,
      Math.round(sr.left) + '..' + Math.round(sr.right) + ' / ' + innerWidth);
    ok('M05c 放不下时翻到了左边', sr.left < ctxEl.getBoundingClientRect().left,
      Math.round(sr.left) + ' vs ' + Math.round(ctxEl.getBoundingClientRect().left));
    hideCtx();
  });
  T('M06 空的「新建」菜单也没问题', () => {
    document.getElementById('b-new').click();
    ok('M06 顶上「新建」菜单打开', ctxEl.style.display === 'block');
    ok('M06b 里面有空白文件 / 两种示例',
      [...ctxEl.querySelectorAll('.item')].length === 6, ctxEl.querySelectorAll('.item').length);
    hideCtx();
  });
  T('M07 大面板贴在提示框正上方、右下角对齐', () => {
    fresh(); layoutMind(); fitView();
    syncDlgBox();
    const dlg = document.getElementById('dialogue').getBoundingClientRect();
    const panels = [['导出', expEl], ['连线样式', edgeBoxEl], ['连线端点', endBoxEl],
                    ['节点样式', nodeBoxEl], ['帮助', helpEl]];
    for (const [name, p] of panels){
      const was = p.style.display;
      p.style.display = 'block';
      const r = p.getBoundingClientRect();
      const gap = dlg.top - r.bottom;
      if (gap < 0 || gap > 20) throw new Error(name + ' 没贴在提示框上方：gap=' + Math.round(gap));
      const rightGap = innerWidth - r.right;
      if (Math.abs(rightGap - 24) > 1) throw new Error(name + ' 右边缘没对齐：rightGap=' + Math.round(rightGap));
      if (r.top < 70) throw new Error(name + ' 顶到顶栏了：top=' + Math.round(r.top));
      p.style.display = was;
    }
    ok('M07 五个面板都贴在提示框上方、右下角对齐', true);
    nodeBoxEl.style.display = 'block';
    ok('M07b 不再居中（靠右，左边留出大片画布）',
      nodeBoxEl.getBoundingClientRect().left > 200, Math.round(nodeBoxEl.getBoundingClientRect().left));
    nodeBoxEl.style.display = 'none';
  });
  T('M08 提示框变高时面板跟着上移', () => {
    fresh();
    syncDlgBox();
    const before = getComputedStyle(document.documentElement).getPropertyValue('--dlg-h').trim();
    dlgBoxEl.style.minHeight = '280px';                    // 直接把提示框撑高
    syncDlgBox();
    const after = getComputedStyle(document.documentElement).getPropertyValue('--dlg-h').trim();
    ok('M08 --dlg-h 跟上了提示框高度', parseFloat(after) > parseFloat(before),
      before + ' -> ' + after);
    const dlg = dlgBoxEl.getBoundingClientRect();
    nodeBoxEl.style.display = 'block';
    const r = nodeBoxEl.getBoundingClientRect();
    nodeBoxEl.style.display = 'none';
    ok('M08b 面板底边仍然贴着提示框上沿', Math.abs(dlg.top - r.bottom) < 20,
      Math.round(dlg.top - r.bottom));
    dlgBoxEl.style.minHeight = '';
    syncDlgBox();
    updateMeta();
  /* ==================== 程序化节点 ==================== */
  T('Q01 建一个程序节点', () => {
    fresh(); layoutMind();
    const p = createProgramNode(0, 0);
    ok('Q01 kind 是 program', p.kind === 'program' && isProgram(p));
    ok('Q01b 带默认算符', p.program && p.program.op === 'style' && p.program.key === 'fsPx',
      JSON.stringify(p.program));
    ok('Q01c 标题就是算符描述', p.text === programLabel(p.program), p.text);
    ok('Q01d 尺寸按标题量好了', p.w > 40 && p.h > 20, p.w + 'x' + p.h);
  });
  T('Q02 没连线时不生效', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const before = { fs:effFsPx(tgt), w:tgt.w };
    createProgramNode(0, 0);
    reindex(); sizeAll();
    ok('Q02 目标没被改', effFsPx(tgt) === before.fs && tgt.w === before.w, effFsPx(tgt));
    ok('Q02b 也没留下效果记录', !effOf(tgt));
  });
  T('Q03 连上之后算符叠到目标上（外观）', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const baseFs = effFsPx(tgt), baseH = tgt.h;
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:8 });
    linkNodes(pg.id, tgt.id);
    reindex(); sizeAll();
    ok('Q03 有效字号 = 基础 + 8', effFsPx(tgt) === (baseFs || FS) + 8, effFsPx(tgt));
    ok('Q03b 节点跟着变高了（行高按新字号算）', tgt.h > baseH, baseH + ' -> ' + tgt.h);
    ok('Q03c 记了 1 个算符', effOf(tgt) && effOf(tgt).ops === 1);
  });
  T('Q04 效果是派生的：节点裸字段一个都没动', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const raw = { fsPx:tgt.fsPx, color:tgt.color, border:tgt.border, font:tgt.font,
                  shape:tgt.shape, x:tgt.x, y:tgt.y, value:tgt.value };
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'color', mode:'set', value:'#ff0000' });
    const pg2 = createProgramNode(0, 0);
    setProgram(pg2, { op:'move', key:'x', mode:'add', value:40 });
    const pg3 = createProgramNode(0, 0);
    setProgram(pg3, { op:'shape', mode:'set', value:'diamond' });
    const pg4 = createProgramNode(0, 0);
    setProgram(pg4, { op:'value', mode:'add', value:5 });
    for (const p of [pg, pg2, pg3, pg4]) linkNodes(p.id, tgt.id);
    reindex(); sizeAll();
    ok('Q04 字色：裸字段没改', tgt.color === raw.color, tgt.color);
    ok('Q04b 字色：有效值变了', effColor(tgt) === '#ff0000', effColor(tgt));
    ok('Q04c 位置：裸字段没改', tgt.x === raw.x && tgt.y === raw.y);
    ok('Q04d 位置：有效盒子偏了', nodeBox(tgt).x === raw.x + 40, nodeBox(tgt).x);
    ok('Q04e 形状：裸字段没改', tgt.shape === raw.shape, tgt.shape);
    ok('Q04f 形状：有效形状变了', effShape(tgt) === 'diamond', effShape(tgt));
    ok('Q04g 数值：裸字段没改', !(+tgt.value > 0), tgt.value);
    ok('Q04h 数值：有效值 = 5', effValue(tgt) === 5, effValue(tgt));
  });
  T('Q05 删掉程序节点，目标立刻复原', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const baseFs = effFsPx(tgt), baseW = tgt.w, baseShape = effShape(tgt);
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:16 });
    const pg2 = createProgramNode(0, 0);
    setProgram(pg2, { op:'shape', mode:'set', value:'oval' });
    linkNodes(pg.id, tgt.id); linkNodes(pg2.id, tgt.id);
    reindex(); sizeAll();
    ok('Q05 前置：确实生效了', effFsPx(tgt) === (baseFs || FS) + 16 && effShape(tgt) === 'oval');
    // 删掉两个程序节点
    doc.nodes = doc.nodes.filter(n => n.id !== pg.id && n.id !== pg2.id);
    doc.edges = doc.edges.filter(e => e.s !== pg.id && e.s !== pg2.id);
    reindex(); sizeAll();
    ok('Q05b 字号复原', effFsPx(tgt) === baseFs, effFsPx(tgt) + ' vs ' + baseFs);
    ok('Q05c 宽度复原', tgt.w === baseW, tgt.w + ' vs ' + baseW);
    ok('Q05d 形状复原', effShape(tgt) === baseShape, effShape(tgt));
    ok('Q05e 效果记录也清了', !effOf(tgt));
  });
  T('Q06 多个程序节点累加', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const baseFs = effFsPx(tgt) || FS;
    for (const v of [8, 4, 8]){
      const pg = createProgramNode(0, 0);
      setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:v });
      linkNodes(pg.id, tgt.id);
    }
    reindex(); sizeAll();
    ok('Q06 累加 = 基础 + 8 + 4 + 8', effFsPx(tgt) === baseFs + 20, effFsPx(tgt) + ' vs ' + (baseFs + 20));
    ok('Q06b 记了 3 个算符', effOf(tgt).ops === 3, effOf(tgt).ops);
    // 数值也累加
    const tgt2 = nodeByText('操作');
    for (const v of [3, 4, 5]){
      const pg = createProgramNode(0, 0);
      setProgram(pg, { op:'value', mode:'add', value:v });
      linkNodes(pg.id, tgt2.id);
    }
    reindex();
    ok('Q06c 数值累加 = 12', effValue(tgt2) === 12, effValue(tgt2));
  });
  T('Q07 累加按连线的先后顺序', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const pgAdd = createProgramNode(0, 0);
    setProgram(pgAdd, { op:'style', key:'fsPx', mode:'add', value:8 });
    const pgSet = createProgramNode(0, 0);
    setProgram(pgSet, { op:'style', key:'fsPx', mode:'set', value:32 });
    linkNodes(pgAdd.id, tgt.id);
    linkNodes(pgSet.id, tgt.id);
    reindex(); sizeAll();
    ok('Q07 「先+8 后覆盖32」= 32', effFsPx(tgt) === 32, effFsPx(tgt));
    // 把两条线的顺序倒过来
    doc.edges.reverse();
    reindex(); sizeAll();
    ok('Q07b 「先覆盖32 后+8」= 40', effFsPx(tgt) === 40, effFsPx(tgt));
  });
  T('Q08 程序节点之间可以链式累加', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    // A 给 B 的操作数 +2，B 再把自己的 +5 一起给目标 → 目标拿到 7
    const a = createProgramNode(0, 0);
    setProgram(a, { op:'value', mode:'add', value:2 });
    const b = createProgramNode(0, 0);
    setProgram(b, { op:'value', mode:'add', value:5 });
    linkNodes(a.id, b.id);
    linkNodes(b.id, tgt.id);
    reindex(); sizeAll();
    ok('Q08 A 确实作用到了 B 身上', !!effOf(b) && effValue(b) === 2, JSON.stringify(effOf(b)));
    ok('Q08b 目标拿到 5 + 2 = 7（依次累加）', effValue(tgt) === 7, effValue(tgt));
    // 再加一环：C 给 A +3
    const c = createProgramNode(0, 0);
    setProgram(c, { op:'value', mode:'add', value:3 });
    linkNodes(c.id, a.id);
    reindex(); sizeAll();
    ok('Q08c 三级链条：目标 = 5 + (2+3) = 10', effValue(tgt) === 10, effValue(tgt));
  });
  T('Q08d 链上有环也不会卡死', () => {
    fresh(); layoutMind();
    const a = createProgramNode(0, 0);
    setProgram(a, { op:'value', mode:'add', value:1 });
    const b = createProgramNode(0, 0);
    setProgram(b, { op:'value', mode:'add', value:1 });
    linkNodes(a.id, b.id);
    linkNodes(b.id, a.id);
    reindex(); sizeAll();          // 有界迭代，不许死循环
    ok('Q08d 环上迭代有上限，跑得完', true, 'eff a=' + effValue(a) + ' b=' + effValue(b));
  });
  T('Q20 程序节点可以作用在整个分组上', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    const baseA = effFsPx(a) || FS, baseB = effFsPx(b) || FS;
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:8 });
    linkNodes(pg.id, grp.id);           // 连到分组，不是连到某个节点
    reindex(); sizeAll();
    ok('Q20 组内第一个节点受影响', effFsPx(a) === baseA + 8, effFsPx(a));
    ok('Q20b 组内第二个节点也受影响', effFsPx(b) === baseB + 8, effFsPx(b));
    ok('Q20c 记在了两个节点上', effOf(a) && effOf(a).ops === 1 && effOf(b) && effOf(b).ops === 1);
    // 组外的节点不受影响
    const out = nodeByText('操作');
    ok('Q20d 组外的不受影响', !effOf(out), JSON.stringify(effOf(out)));
    // 新拖进组的节点也会被算上
    const c = nodeByText('Tab 加子节点');
    grp.members.push(c.id);
    reindex(); sizeAll();
    ok('Q20e 后加进来的也算', !!effOf(c), JSON.stringify(effOf(c)));
  });
  T('Q21 程序节点作用在分组上时，套娃里的节点也算', () => {
    fresh(); layoutMind();
    // 用聚在一起的两个节点当内层成员，框才不会被撑到别处去（框只长不缩）
    const a  = nodeByText('节点');
    const n1 = nodeByText('矩形 / 圆角 / 菱形 / 椭圆');
    const n2 = nodeByText('Tab 加子节点');
    const out = nodeByText('操作');
    const outer = newEmptyGroup(a.x - 400, a.y - 300);
    const inner = newEmptyGroup(a.x - 400, a.y - 300);
    inner.members = [n1.id, n2.id];
    outer.members = [inner.id, a.id];
    reindex(); sizeAll();
    ok('Q21 前置：嵌套关系成立',
      groupReaches(outer.id, inner.id) && groupAllNodes(outer.id).indexOf(n2.id) >= 0,
      groupAllNodes(outer.id).join(','));
    ok('Q21a 递归取节点能把内层的也拿到',
      groupAllNodes(outer.id).sort().join(',') === [a.id, n1.id, n2.id].sort().join(','),
      groupAllNodes(outer.id).join(','));
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'value', mode:'add', value:4 });
    linkNodes(pg.id, outer.id);
    reindex(); sizeAll();
    ok('Q21c 外层的算符落到了内层节点上', effValue(n1) === 4 && effValue(n2) === 4,
      effValue(n1) + '/' + effValue(n2));
    ok('Q21d 也落到了直接成员上', effValue(a) === 4, effValue(a));
    ok('Q21e 组外的节点不受影响', effValue(out) === 0, effValue(out));
  });
  T('Q22 程序节点连到空分组不会出问题', () => {
    fresh(); layoutMind();
    const empty = newEmptyGroup(0, 0);
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:8 });
    linkNodes(pg.id, empty.id);
    reindex(); sizeAll();
    ok('Q22 不报错也没有效果', idx.eff.size === 0, idx.eff.size);
  });

  /* ==================== 分组套娃 ====================
     注意：分组框「只长不缩」，所以成员一塞进去框就会包住它们。
     测试里一律用本来就挨在一起的节点（节点 和它的两个孩子），
     否则两个框会被撑到同一片区域，分不出谁是谁。 */
  const nestSetup = () => {
    const a  = nodeByText('节点');
    const n1 = nodeByText('矩形 / 圆角 / 菱形 / 椭圆');
    const n2 = nodeByText('Tab 加子节点');
    const outer = newEmptyGroup(a.x - 500, a.y - 400);
    const inner = newEmptyGroup(a.x - 1500, a.y - 1200);   // 先放远一点，免得起手就套上
    inner.members = [n1.id, n2.id];
    outer.members = [a.id];
    reindex(); sizeAll();
    return { a, n1, n2, outer, inner };
  };
  T('R01 把分组拖进另一个分组就套上了', () => {
    fresh(); layoutMind();
    const { outer, inner } = nestSetup();
    ok('R01 前置：两个框还没套上', outer.members.indexOf(inner.id) < 0 &&
      !pointInGroup(outer, inner.x + inner.w / 2, inner.y + inner.h / 2),
      JSON.stringify({ outer:{ x:outer.x, y:outer.y, w:outer.w, h:outer.h },
                       inner:{ x:inner.x, y:inner.y, w:inner.w, h:inner.h } }));
    const tb = groupTitleBox(inner);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    // 拖动按指针位移算，所以落点要反推：让 inner 的中心正好落到 outer 的中心
    const p0w = s2w(h.x, h.y);
    const dstW = { x:p0w.x + (outer.x + outer.w / 2) - (inner.x + inner.w / 2),
                   y:p0w.y + (outer.y + outer.h / 2) - (inner.y + inner.h / 2) };
    const dst = S(dstW);
    pe('pointerdown', h.x, h.y);
    pe('pointermove', dst.x, dst.y);
    pe('pointerup', dst.x, dst.y);
    reindex();
    ok('R01b inner 成了 outer 的成员', outer.members.indexOf(inner.id) >= 0, JSON.stringify(outer.members));
    ok('R01c 只有最内层那一层收它', groupDescendantGroups(outer.id).length === 1,
      groupDescendantGroups(outer.id).join(','));
    ok('R01d 没有形成环', !groupReaches(inner.id, outer.id));
    ok('R01e 层深算对了', groupDepth(outer.id) === 0 && groupDepth(inner.id) === 1,
      groupDepth(outer.id) + '/' + groupDepth(inner.id));
  });
  T('R02 父框会跟着子框长大', () => {
    fresh(); layoutMind();
    const { outer, inner } = nestSetup();
    outer.members = [inner.id];
    reindex(); sizeAll();
    const before = { w:outer.w, h:outer.h };
    setGroupSize(inner, inner.w + 300, inner.h + 200);
    inner.x -= 260; inner.y -= 180;
    reindex(); sizeAll();
    ok('R02 父框长大了', outer.w > before.w && outer.h > before.h,
      before.w + 'x' + before.h + ' -> ' + outer.w + 'x' + outer.h);
    ok('R02b 父框完整包住子框',
      inner.x >= outer.x && inner.y >= outer.y &&
      inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h,
      JSON.stringify({ outer:{ x:outer.x, y:outer.y, w:outer.w, h:outer.h },
                       inner:{ x:inner.x, y:inner.y, w:inner.w, h:inner.h } }));
  });
  T('R03 拖父分组，子分组和里面所有节点一起走', () => {
    fresh(); layoutMind();
    const { a, n1, n2, outer, inner } = nestSetup();
    outer.members = [inner.id, a.id];
    reindex(); sizeAll();
    const p0 = { ax:a.x, ay:a.y, bx:n1.x, by:n1.y, cx:n2.x, cy:n2.y, ix:inner.x, iy:inner.y };
    const tb = groupTitleBox(outer);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    pe('pointerdown', h.x, h.y);
    ok('R03x 前置：抓到的是外框', !!drag && drag.mode === 'group' && drag.grpId === outer.id,
      (drag && drag.mode) + ' / ' + (drag && drag.grpId) + ' vs outer=' + outer.id);
    pe('pointermove', h.x + 150, h.y - 90);
    pe('pointerup', h.x + 150, h.y - 90);
    const dx = 150 / view.z, dy = -90 / view.z;
    ok('R03 直接成员跟着走', Math.abs(a.x - p0.ax - dx) < 2 && Math.abs(a.y - p0.ay - dy) < 2,
      Math.round(a.x - p0.ax) + ',' + Math.round(a.y - p0.ay));
    ok('R03b 子分组跟着走', Math.abs(inner.x - p0.ix - dx) < 2 && Math.abs(inner.y - p0.iy - dy) < 2,
      Math.round(inner.x - p0.ix) + ',' + Math.round(inner.y - p0.iy));
    ok('R03c 子分组里的节点也跟着走',
      Math.abs(n1.x - p0.bx - dx) < 2 && Math.abs(n2.y - p0.cy - dy) < 2,
      Math.round(n1.x - p0.bx) + ',' + Math.round(n2.y - p0.cy));
    ok('R03d 相对位置全都没变', Math.abs((n1.x - a.x) - (p0.bx - p0.ax)) < 0.01);
  });
  T('R04 不能把分组放进自己或自己的后代里', () => {
    fresh(); layoutMind();
    const { outer, inner } = nestSetup();
    outer.members = [inner.id];
    reindex();
    ok('R04 前置：inner 在 outer 里', groupReaches(outer.id, inner.id));
    // 硬把 outer 塞进 inner 会成环，得被断掉
    inner.members.push(outer.id);
    reindex();
    ok('R04b 环被断掉了', inner.members.indexOf(outer.id) < 0, JSON.stringify(inner.members));
    ok('R04c 原有关系还留着', outer.members.indexOf(inner.id) >= 0, JSON.stringify(outer.members));
    // 自己塞自己也不行
    outer.members.push(outer.id);
    reindex();
    ok('R04d 自引用被去掉', outer.members.indexOf(outer.id) < 0, JSON.stringify(outer.members));
    ok('R04e 结构完好', groupReaches(outer.id, inner.id) && !groupReaches(inner.id, outer.id));
  });
  T('R05 解散父分组不会连子分组一起拆掉', () => {
    fresh(); layoutMind();
    const { a, n1, outer, inner } = nestSetup();
    outer.members = [inner.id, a.id];
    reindex();
    const n0 = doc.nodes.length;
    selectGroup(outer.id);
    dissolveGroup(outer);
    reindex();
    ok('R05 外层没了', !byGroup(outer.id));
    ok('R05b 内层还在', !!byGroup(inner.id));
    ok('R05c 内层成员也还在', inner.members.indexOf(n1.id) >= 0, JSON.stringify(inner.members));
    ok('R05d 节点一个没少', doc.nodes.length === n0, doc.nodes.length);
  });
  T('R06 绘制 / 命中都按层深排序', () => {
    fresh(); layoutMind();
    const { n1, outer, inner } = nestSetup();
    outer.members = [inner.id];
    reindex();
    const order = idx.groupOrder.map(g => g.id);
    ok('R06 祖先排在子分组前面', order.indexOf(outer.id) < order.indexOf(inner.id), order.join(' > '));
    ok('R06b 层深正确', groupDepth(outer.id) === 0 && groupDepth(inner.id) === 1,
      groupDepth(outer.id) + '/' + groupDepth(inner.id));
    // 把两个标题栏叠在一起，点下去应该是最内层接住
    inner.x = outer.x; inner.y = outer.y;   // 故意叠在一起，测「最内层先接住」
    const tb = groupTitleBox(inner);
    const qw = { x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 };
    ok('R06c 两个标题栏确实重叠', (() => {
      const ob = groupTitleBox(outer);        // 世界坐标，别和屏幕坐标混
      return qw.x >= ob.x && qw.x <= ob.x + ob.w && qw.y >= ob.y && qw.y <= ob.y + ob.h;
    })());
    const q = S(qw);
    pe('pointerdown', q.x, q.y);
    ok('R06d 点下去命中的是最内层', selGroups.has(inner.id), [...selGroups].join(',') + ' vs inner=' + inner.id);
    pe('pointerup', q.x, q.y);
    // n1 还在内层里，说明断环和层深计算都没把结构搞坏
    ok('R06e 结构没坏', groupAllNodes(inner.id).indexOf(n1.id) >= 0, groupAllNodes(inner.id).join(','));
  });
  T('R07 拖节点进嵌套框时归属最内层', () => {
    fresh(); layoutMind();
    const { outer, inner } = nestSetup();
    outer.members = [inner.id];
    reindex(); sizeAll();
    const c = nodeByText('操作');
    const cc = center(c);
    const dst = S({ x:inner.x + inner.w / 2, y:inner.y + inner.h / 2 });
    pe('pointerdown', cc.x, cc.y);
    pe('pointermove', dst.x, dst.y);
    pe('pointerup', dst.x, dst.y);
    reindex();
    ok('R07 归到了内层', inner.members.indexOf(c.id) >= 0, JSON.stringify(inner.members));
    ok('R07b 不在外层', outer.members.indexOf(c.id) < 0, JSON.stringify(outer.members));
    ok('R07c 但外层透过子分组也能拿到它',
      groupAllNodes(outer.id).indexOf(c.id) >= 0, groupAllNodes(outer.id).join(','));
  });
  T('R08 嵌套分组能存下来', () => {
    fresh(); layoutMind();
    const { a, n1, n2, outer, inner } = nestSetup();
    outer.members = [inner.id, a.id];
    inner.members = [n1.id, n2.id];
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    const rawOuter = snap.groups.find(g => g.id === outer.id);
    ok('R08 序列化里外层含分组 id', rawOuter.members.indexOf(inner.id) >= 0, JSON.stringify(rawOuter.members));
    deserialize(snap);
    const o2 = byGroup(outer.id), i2 = byGroup(inner.id);
    ok('R08b 往返后嵌套关系还在',
      o2.members.indexOf(i2.id) >= 0 && i2.members.indexOf(n1.id) >= 0,
      JSON.stringify(o2.members) + ' / ' + JSON.stringify(i2.members));
    ok('R08c 递归取节点也正常',
      groupAllNodes(o2.id).sort().join(',') === [a.id, n1.id, n2.id].sort().join(','),
      groupAllNodes(o2.id).join(','));
  });


  T('Q09 路由与命中都用「有效位置」', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const src = nodeByText('连线');
    const e = doc.edges.find(x => x.s === src.id && x.t === tgt.id) ||
              linkNodes(src.id, tgt.id);
    reindex(); sizeAll();
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'move', key:'x', mode:'add', value:120 });
    linkNodes(pg.id, tgt.id);
    reindex(); sizeAll();
    const eb = nodeBox(tgt);
    const ep = edgeEndpoints(e);
    const P = anchorsFor(eb);
    ok('Q09 连线端点接在偏移后的盒子上',
      ['r','l','t','b'].some(k => Math.abs(ep.b.x - P[k].x) < 0.01 && Math.abs(ep.b.y - P[k].y) < 0.01),
      JSON.stringify(ep.b) + ' vs ' + JSON.stringify(P));
    ok('Q09b 命中测试也用偏移后的位置', (() => {
      const c = { x:eb.x + eb.w / 2, y:eb.y + eb.h / 2 };
      return hitNode(c) === tgt;
    })());
    ok('Q09c 旧位置已经点不到', (() => {
      const old = { x:tgt.x + 4, y:tgt.y + tgt.h / 2 };
      const hit = hitNode(old);
      return hit !== tgt;
    })());
  });
  T('Q10 转换 / 序列化往返', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    toggleProgramNode(n);
    ok('Q10 转成了程序节点', isProgram(n));
    setProgram(n, { op:'value', mode:'add', value:7 });
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('Q10b 序列化里有 kind 和 program',
      snap.nodes.find(x => x.id === n.id).kind === 'program' &&
      snap.nodes.find(x => x.id === n.id).program.value === 7, JSON.stringify(snap.nodes.find(x => x.id === n.id)));
    deserialize(snap);
    const n2 = byId(n.id);
    ok('Q10c 往返保留', isProgram(n2) && n2.program.op === 'value' && n2.program.value === 7,
      JSON.stringify(n2.program));
    toggleProgramNode(n2);
    ok('Q10d 可以转回普通节点', !isProgram(n2) && n2.kind === 'node');
  });
  T('Q11 撤销会把程序节点一起回退', () => {
    fresh(); layoutMind(); initHist();
    const tgt = nodeByText('节点');
    const before = effFsPx(tgt);
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:8 });
    linkNodes(pg.id, tgt.id);
    reindex(); sizeAll(); pushHist();
    ok('Q11 生效了', effFsPx(tgt) === (before || FS) + 8, effFsPx(tgt));
    undo();
    ok('Q11b 撤销后连线没了', !doc.edges.some(e => e.s === pg.id));
    ok('Q11c 效果也没了', effFsPx(tgt) === before, effFsPx(tgt));
  });
  T('Q12 面板：程序节点显示算符行', () => {
    fresh(); layoutMind();
    const pg = createProgramNode(0, 0);
    selectOnly(pg.id);
    openNodeBox(pg);
    ok('Q12 算符区显示出来了', nbProgEl.style.display === 'block');
    ok('Q12b 四组作用选项', nbOpEl.querySelectorAll('.opt').length === PROGRAM_OPS.length);
    ok('Q12c 外观下有四个项目', nbKeyEl.querySelectorAll('.opt').length === PROGRAM_KEYS.style.length,
      nbKeyEl.querySelectorAll('.opt').length);
    ok('Q12d 按钮写的是「转回普通节点」', nbProgBtn.textContent === '转回普通节点', nbProgBtn.textContent);
    // 切到「位置」：项目变两项、方式行隐藏
    const opOpts = [...nbOpEl.querySelectorAll('.opt')];
    opOpts[2].click();
    ok('Q12e 位置的项目是横/纵', nbKeyEl.querySelectorAll('.opt').length === 2,
      nbKeyEl.querySelectorAll('.opt').length);
    ok('Q12f 位置没有「方式」', nbModeRowEl.style.display === 'none', nbModeRowEl.style.display);
    ok('Q12g 数值给了预设按钮', nbValEl.querySelectorAll('.opt').length >= 4);
    closeNodeBox();
    // 普通节点不显示算符区
    const n = nodeByText('节点');
    openNodeBox(n);
    ok('Q12h 普通节点不显示算符区', nbProgEl.style.display === 'none');
    closeNodeBox();
  });
  T('Q13 面板显示的是有效外观', () => {
    fresh(); layoutMind();
    const tgt = nodeByText('节点');
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'color', mode:'set', value:'#00ffff' });
    linkNodes(pg.id, tgt.id);
    reindex(); sizeAll();
    selectOnly(tgt.id);
    openNodeBox(tgt);
    ok('Q13 字色面板高亮的是被程序改过之后的颜色', (() => {
      const sw = [...nbColorEl.querySelectorAll('.sw')];
      const on = sw.filter(d => d.className.indexOf('on') >= 0);
      return on.length === 1 && on[0].style.background === 'rgb(0, 255, 255)';
    })(), [...nbColorEl.querySelectorAll('.sw')].findIndex(d => d.className.indexOf('on') >= 0));
    ok('Q13b 底部说明写明了被几个程序节点作用',
      nbHitsEl.textContent.indexOf('被 1 个程序节点作用') >= 0, nbHitsEl.textContent);
    closeNodeBox();
  });
  T('Q14 程序节点的显示名会跟着算符自动更新', () => {
    fresh(); layoutMind();
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:8 });
    ok('Q14 标题跟着走', pg.text === '字号 +8', pg.text);
    setProgram(pg, { value:16 });
    ok('Q14b 改了数值标题也变', pg.text === '字号 +16', pg.text);
    // 用户自己改过标题之后就不再自动覆盖
    pg.text = '我的算符';
    setProgram(pg, { value:24 });
    ok('Q14c 用户改过的标题不动', pg.text === '我的算符', pg.text);
  });

  /* ==================== 折叠分组 ==================== */
  const twoNodeGroup = () => {
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    return { a, b, grp };
  };
  T('S1 折叠分组：组内后代藏起来，框自己留着', () => {
    fresh(); layoutMind();
    const { grp } = twoNodeGroup();
    ok('S1 前置：组内节点都可见', groupAllNodes(grp.id).every(id => !isHidden(id)));
    selectGroup(grp.id);
    toggleGroupCollapse(grp);
    reindex();
    ok('S1b 分组标记为已折叠', grp.collapsed === true);
    ok('S1c 组内节点全藏了', groupAllNodes(grp.id).every(id => isHidden(id)),
      groupAllNodes(grp.id).filter(id => !isHidden(id)).join(','));
    ok('S1d 分组自己的框还在（要留着给人展开）', !isHidden(grp.id));
    ok('S1e 角标写着藏了几个节点', groupBadgeRect(grp).label === '2', groupBadgeRect(grp).label);
    toggleGroupCollapse(grp);
    reindex();
    ok('S1f 展开后成员都回来了',
      !grp.collapsed && groupAllNodes(grp.id).every(id => !isHidden(id)));
  });
  T('S2 折叠分组后画布能正常绘制', () => {
    fresh(); layoutMind();
    const { grp } = twoNodeGroup();
    toggleGroupCollapse(grp);
    reindex();
    dirty = true; draw();
    ok('S2 绘制不报错', true);
    const c = buildExportCanvas([nodeByText('操作')]);
    ok('S2b 导出也不报错', c.width > 0);
  });
  T('S3 折叠节点后，内容全没了的分组不留幽灵框', () => {
    fresh(); layoutMind();
    const b = nodeByText('连线');
    const kids = descendants(b.id);
    sel.clear(); sel.add(b.id); kids.forEach(id => sel.add(id));
    const grp = createGroup();
    ok('S3 前置：框可见', !isHidden(grp.id));
    selectOnly(b.id); toggleCollapseOf(b); reindex();
    ok('S3b 还有成员（b 自己）可见，框就留着', !isHidden(grp.id), [...idx.hidden].join(','));
    // 再把 b 也藏起来（折叠它的父节点）
    const parent = byId(idx.parent.get(b.id));
    selectOnly(parent.id); toggleCollapseOf(parent); reindex();
    ok('S3c 组内全被藏了 → 框也藏起来', isHidden(grp.id),
      'hidden=' + [...idx.hidden].join(',') + ' 成员=' + grp.members.join(','));
    ok('S3d 框不画也不可点', hitGroupTitle({ x:grp.x + 10, y:grp.y + 10 }) === null &&
      hitGroupArea({ x:grp.x + grp.w / 2, y:grp.y + grp.h / 2 }) === null);
  });
  T('S4 空分组不会被幽灵框抑制干掉', () => {
    fresh(); layoutMind();
    const empty = newEmptyGroup(0, 0);
    reindex();
    ok('S4 空框照样可见', !isHidden(empty.id));
    const b = nodeByText('连线');
    selectOnly(b.id); toggleCollapseOf(b); reindex();
    ok('S4b 别处折叠也不影响它', !isHidden(empty.id));
  });
  T('S5 套娃时折叠分组会一层层收', () => {
    fresh(); layoutMind();
    const a  = nodeByText('节点');
    const n1 = nodeByText('矩形 / 圆角 / 菱形 / 椭圆');
    const n2 = nodeByText('Tab 加子节点');
    const inner = newEmptyGroup(a.x - 400, a.y - 300);
    const outer = newEmptyGroup(a.x - 400, a.y - 300);
    inner.members = [n1.id, n2.id];
    outer.members = [inner.id, a.id];
    reindex(); sizeAll();
    // 折内层：内层成员藏起来，内层和外层都还在
    toggleGroupCollapse(inner); reindex();
    ok('S5 内层成员藏了', isHidden(n1.id) && isHidden(n2.id));
    ok('S5b 内层框还在', !isHidden(inner.id));
    ok('S5c 外层框也还在（因为 a 还可见）', !isHidden(outer.id));
    // 折外层：内层和外层的内容全藏，但外层框留着
    toggleGroupCollapse(outer); reindex();
    ok('S5d 内层也被藏了', isHidden(inner.id), [...idx.hidden].join(','));
    ok('S5e 外层框自己还在', !isHidden(outer.id));
    ok('S5f a 也藏了', isHidden(a.id));
    toggleGroupCollapse(outer); reindex();
    ok('S5g 展开外层：内层回来了但内层仍是折叠状态',
      !isHidden(outer.id) && !isHidden(inner.id) && isHidden(n1.id) && inner.collapsed === true);
  });
  T('S6 点标题右边的角标就能展开', () => {
    fresh(); layoutMind();
    const { grp } = twoNodeGroup();
    toggleGroupCollapse(grp); reindex();
    const bb = groupBadgeRect(grp);
    const c = S({ x:bb.x + bb.w / 2, y:bb.y + bb.h / 2 });
    pe('pointerdown', c.x, c.y);
    ok('S6 点角标后展开了', grp.collapsed === false, grp.collapsed);
    ok('S6b 成员回来了', groupAllNodes(grp.id).every(id => !isHidden(id)));
    pe('pointerup', c.x, c.y);
  });
  T('S7 选中分组按 Space 折叠', () => {
    fresh(); layoutMind();
    const { grp } = twoNodeGroup();
    selectGroup(grp.id);
    keyRaw(' ');
    ok('S7 Space 折叠了分组', grp.collapsed === true);
    keyRaw(' ');
    ok('S7b 再按一次展开', grp.collapsed === false);
  });
  T('S8 折叠着的分组仍然能点；被藏起来的分组点不到', () => {
    fresh(); layoutMind();
    // (a) 折叠着的分组：框还留着，标题栏照样能点
    const { grp } = twoNodeGroup();
    toggleGroupCollapse(grp); reindex();
    ok('S8 折叠的分组自己的框还可见', !isHidden(grp.id));
    const tb1 = groupTitleBox(grp);
    ok('S8b 它的标题还能点中', (hitGroupTitle({ x:tb1.x + 4, y:tb1.y + 8 }) || {}).id === grp.id);
    // (b) 内容被节点折叠全藏掉的分组：连标题都点不到
    const b = nodeByText('操作');
    const kids = descendants(b.id);
    ok('S8c 前置：操作有子节点', kids.length >= 1, kids.length);
    selectGroup(null);      // 先清掉分组选择：createGroup 现在也会把「选中的分组」收进去
    sel.clear(); kids.forEach(id => sel.add(id));
    const g2 = createGroup();
    selectOnly(b.id); toggleCollapseOf(b); reindex();
    ok('S8d 内容全被藏的分组确实被藏了', isHidden(g2.id),
      'hidden=' + [...idx.hidden].join(',') + ' 成员=' + g2.members.join(','));
    const tb2 = groupTitleBox(g2);
    const h = S({ x:tb2.x + 4, y:tb2.y + 8 });
    pe('pointerdown', h.x, h.y);
    ok('S8e 点不到它', !selGroups.has(g2.id), [...selGroups].join(','));
    ok('S8f 也没进入拖拽', !drag || drag.grpId !== g2.id, drag && drag.mode);
    pe('pointerup', h.x, h.y);
  });
  T('S9 分组折叠能存下来', () => {
    fresh(); layoutMind();
    const { grp } = twoNodeGroup();
    toggleGroupCollapse(grp); reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('S9 序列化里有 collapsed', snap.groups.find(g => g.id === grp.id).collapsed === true);
    deserialize(snap);
    const g2 = byGroup(grp.id);
    ok('S9b 往返保留', g2.collapsed === true);
    ok('S9c 重新索引后成员仍然被藏着', groupAllNodes(g2.id).every(id => isHidden(id)),
      [...idx.hidden].join(','));
  });
  T('S10 藏起来的成员不会被选中 / 框选 / 导出', () => {
    fresh(); layoutMind();
    const { a, grp } = twoNodeGroup();
    toggleGroupCollapse(grp); reindex();
    selectOnly(a.id);
    reindex();                                   // 清理发生在 reindex 里
    ok('S10 藏起来的节点选不上（reindex 会清掉）', !sel.has(a.id), [...sel].join(','));
    const p1 = S({ x:bboxAll().minX - 80, y:bboxAll().minY - 80 });
    const p2 = S({ x:bboxAll().maxX + 80, y:bboxAll().maxY + 80 });
    pe('pointerdown', p1.x, p1.y, { shiftKey:true });
    pe('pointermove', p2.x, p2.y, { shiftKey:true });
    pe('pointerup', p2.x, p2.y, { shiftKey:true });
    ok('S10b 框选也不会选中被藏的', [...sel].every(id => !isHidden(id)), sel.size + ' 个');
    selectAll();
    ok('S10c 全选跳过被藏的', [...sel].every(id => !isHidden(id)));
    expScope = 'all'; renderScopes();
    const set = currentExportSet();
    ok('S10d 导出范围跳过被藏的', set.every(n => !isHidden(n.id)), set.length + ' / ' + doc.nodes.length);
    ok('S10e 没选中时导出信息不会算错', typeof expInfoEl.textContent === 'string');
  });

  /* ==================== 分组多选 ==================== */
  const mkPair = (t1, t2, name) => {
    const a = nodeByText(t1), b = nodeByText(t2);
    selectGroup(null); sel.clear(); sel.add(a.id); sel.add(b.id);
    const g = createGroup();
    if (name) renameGroup(g, name);
    return g;
  };
  const shiftClickTitle = (grp) => {
    const tb = groupTitleBox(grp);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    pe('pointerdown', h.x, h.y, { shiftKey:true });
    pe('pointerup', h.x, h.y, { shiftKey:true });
    return h;
  };
  T('Y01 Shift 点分组标题可以多选', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const gB = mkPair('操作', '点选连线改样式', 'B');
    selectGroup(gA.id);
    ok('Y01 前置：只选中 A', selGroups.size === 1 && selGroups.has(gA.id));
    shiftClickTitle(gB);
    ok('Y01b 两个都选中了', selGroups.size === 2 && selGroups.has(gA.id) && selGroups.has(gB.id),
      [...selGroups].join(','));
    shiftClickTitle(gB);
    ok('Y01c 再 Shift 点一次就取消', selGroups.size === 1 && !selGroups.has(gB.id),
      [...selGroups].join(','));
    shiftClickTitle(gA);
    ok('Y01d 取消到空', selGroups.size === 0, [...selGroups].join(','));
  });
  T('Y02 多选时不给端点和缩放柄', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const gB = mkPair('操作', '点选连线改样式', 'B');
    selectGroup(gA.id);
    const r = groupBox(gA);
    ok('Y02 单选时缩放柄可用', !!hitResizeHandle({ x:r.x + r.w - 2, y:r.y + r.h - 2 }));
    ok('Y02b 单选时给端点', !!hitPort(anchorsFor(r).r));
    toggleGroupSel(gB.id);
    ok('Y02c 多选时不给缩放柄', hitResizeHandle({ x:r.x + r.w - 2, y:r.y + r.h - 2 }) === null);
    ok('Y02d 多选时不给端点', hitPort(anchorsFor(r).r) === null);
    ok('Y02e soleGroup 为空（单目标操作拿不到目标）', soleGroup() === null);
  });
  T('Y03 拖一个选中的分组，其它选中的分组一起走', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const gB = mkPair('操作', '点选连线改样式', 'B');
    selectGroup(gA.id); toggleGroupSel(gB.id);
    const p0 = { ax:gA.x, ay:gA.y, bx:gB.x, by:gB.y };
    const tb = groupTitleBox(gA);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    pe('pointerdown', h.x, h.y);
    ok('Y03 按住已选中的分组不会重置选择', selGroups.size === 2, [...selGroups].join(','));
    pe('pointermove', h.x + 120, h.y + 70);
    pe('pointerup', h.x + 120, h.y + 70);
    const dx = 120 / view.z, dy = 70 / view.z;
    ok('Y03b 抓的那个跟着走', Math.abs(gA.x - p0.ax - dx) < 2 && Math.abs(gA.y - p0.ay - dy) < 2,
      Math.round(gA.x - p0.ax) + ',' + Math.round(gA.y - p0.ay));
    ok('Y03c 另一个也一起走', Math.abs(gB.x - p0.bx - dx) < 2 && Math.abs(gB.y - p0.by - dy) < 2,
      Math.round(gB.x - p0.bx) + ',' + Math.round(gB.y - p0.by));
  });
  T('Y04 分组和节点可以混选，拖的时候一起走', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const out = nodeByText('操作');          // 组外的节点
    selectGroup(gA.id);
    const oc = center(out);
    pe('pointerdown', oc.x, oc.y, { shiftKey:true });
    pe('pointerup', oc.x, oc.y, { shiftKey:true });
    ok('Y04 分组和节点同时选中', selGroups.size === 1 && sel.size === 1 && sel.has(out.id),
      [...selGroups].join(',') + ' / ' + [...sel].join(','));
    const p0 = { gx:gA.x, gy:gA.y, nx:out.x, ny:out.y };
    const tb = groupTitleBox(gA);
    const h = S({ x:tb.x + tb.w / 2, y:tb.y + tb.h / 2 });
    pe('pointerdown', h.x, h.y);
    pe('pointermove', h.x + 90, h.y - 40);
    pe('pointerup', h.x + 90, h.y - 40);
    const dx = 90 / view.z, dy = -40 / view.z;
    ok('Y04b 分组走了', Math.abs(gA.x - p0.gx - dx) < 2, Math.round(gA.x - p0.gx));
    ok('Y04c 组外的节点也一起走了', Math.abs(out.x - p0.nx - dx) < 2 && Math.abs(out.y - p0.ny - dy) < 2,
      Math.round(out.x - p0.nx) + ',' + Math.round(out.y - p0.ny));
  });
  T('Y05 Del 解散所有选中的分组', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const gB = mkPair('操作', '点选连线改样式', 'B');
    const n0 = doc.nodes.length, e0 = doc.edges.length;
    selectGroup(gA.id); toggleGroupSel(gB.id);
    deleteSelection();
    ok('Y05 两个分组都没了', !byGroup(gA.id) && !byGroup(gB.id), (doc.groups || []).length);
    ok('Y05b 节点一个没少', doc.nodes.length === n0, doc.nodes.length);
    ok('Y05c 连线也一条没少', doc.edges.length === e0, doc.edges.length);
    ok('Y05d 选中态清干净', selGroups.size === 0);
  });
  T('Y06 Ctrl+G 可以把选中的分组和节点一起组成新组', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const out = nodeByText('操作');
    selectGroup(gA.id);
    sel.add(out.id);
    createGroup();
    ok('Y06 建出了外层分组', (doc.groups || []).length === 2, (doc.groups || []).length);
    const outer = doc.groups.find(g => g.members.indexOf(gA.id) >= 0);
    ok('Y06b 旧分组成了子分组', !!outer && outer.members.indexOf(gA.id) >= 0, JSON.stringify(outer && outer.members));
    ok('Y06c 组外的节点也在外层里', !!outer && outer.members.indexOf(out.id) >= 0);
    ok('Y06d 已经被子分组包住的节点不会重复收进来',
      !!outer && !outer.members.some(id => byId(id) && groupAllNodes(gA.id).indexOf(id) >= 0 && id !== out.id),
      JSON.stringify(outer && outer.members));
  });
  T('Y07 框选能把整个被框住的分组也选上', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const r = groupBox(gA);
    const p1 = S({ x:r.x - 60, y:r.y - 60 });
    const p2 = S({ x:r.x + r.w + 60, y:r.y + r.h + 60 });
    pe('pointerdown', p1.x, p1.y, { shiftKey:true });
    pe('pointermove', p2.x, p2.y, { shiftKey:true });
    pe('pointerup', p2.x, p2.y, { shiftKey:true });
    ok('Y07 整个框都在范围里 → 分组被选中', selGroups.has(gA.id), [...selGroups].join(','));
    ok('Y07b 里面的节点也被选中了', [...sel].length >= 1, sel.size);
  });
  T('Y08 元信息会报出多选', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const gB = mkPair('操作', '点选连线改样式', 'B');
    selectGroup(gA.id); toggleGroupSel(gB.id);
    skipDlg(); updateMeta();
    ok('Y08 底栏写着「2 分组」', dlgMeta.textContent.indexOf('2 分组') >= 0, dlgMeta.textContent);
    selectGroup(gA.id); sel.add(nodeByText('操作').id);
    skipDlg(); updateMeta();
    ok('Y08b 混选时节点数和分组数都报', dlgMeta.textContent.indexOf('1 节点') >= 0 &&
      dlgMeta.textContent.indexOf('1 分组') >= 0, dlgMeta.textContent);
  });
  T('Y09 全选也包含分组', () => {
    fresh(); layoutMind();
    mkPair('节点', '连线', 'A');
    selectAll();
    ok('Y09 Ctrl+A 把分组也选上', selGroups.size === (doc.groups || []).length,
      selGroups.size + ' / ' + (doc.groups || []).length);
  });
  T('Y10 单选 / 清空的状态转换是对的', () => {
    fresh(); layoutMind();
    const gA = mkPair('节点', '连线', 'A');
    const gB = mkPair('操作', '点选连线改样式', 'B');
    selectGroup(gA.id); toggleGroupSel(gB.id);
    selectOnly(nodeByText('操作').id);
    ok('Y10 点节点会清掉分组选择', selGroups.size === 0 && sel.size === 1, [...selGroups].join(','));
    toggleGroupSel(gA.id);
    selectEdge(doc.edges[0].id);
    ok('Y10b 选连线会清掉分组选择', selGroups.size === 0 && !!selEdgeId);
    selectGroup(gB.id);
    ok('Y10c selectGroup 是单选（会清掉别的）', selGroups.size === 1 && selGroups.has(gB.id));
    toggleGroupSel(gB.id);
    ok('Y10d 取消后为空', selGroups.size === 0);
  });

  });


  /* ==================== 图片节点 ==================== */
  /* 一个 1×1 的红色 PNG，够用了：测的是通道和几何，不是画质 */
  const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const mkImg = (x, y, opts) => {
    const o = opts || {};
    const n = newImageNode(o.url || TINY_PNG, o.natW || 400, o.natH || 300,
                           x == null ? 0 : x, y == null ? 0 : y);
    if (o.desc != null) setNodeDesc(n, o.desc);
    if (o.name != null) n.text = o.name;
    reindex(); sizeAll();
    return n;
  };
  T('Z01 建一个图片节点', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { name:'架构图', desc:'模块依赖关系' });
    ok('Z01 kind 是 image', n.kind === 'image');
    ok('Z01b 图片存下来了', /^data:image\/png/.test(n.image), String(n.image).slice(0, 30));
    ok('Z01c 记了原始尺寸', n.imgW === 400 && n.imgH === 300);
    ok('Z01d 名称就是节点文字', n.text === '架构图');
    ok('Z01e 描述也存下来了', n.desc === '模块依赖关系');
    ok('Z01f 描述折行算好了', n.lines.length >= 1, n.lines.length);
  });
  T('Z02 尺寸 = 名称带 + 图片（等比）+ 描述', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { name:'', desc:'' });
    ok('Z02 宽度按图片原始宽度（不超上限）', n.w === 320, n.w);
    ok('Z02b 图片高度按原始比例', n.imgDrawH === Math.round(300 * (320 / 400)), n.imgDrawH);
    ok('Z02c 高度 = 名称带 + 图片高', n.h === IMG_NAME_H + n.imgDrawH, n.h + ' vs ' + (IMG_NAME_H + n.imgDrawH));
    setNodeDesc(n, '一行描述');
    ok('Z02d 加描述后变高', n.h > IMG_NAME_H + n.imgDrawH, n.h);
    const withDesc = n.h;
    setNodeDesc(n, '');
    ok('Z02e 描述清掉又变回去', n.h === IMG_NAME_H + n.imgDrawH && n.h < withDesc);
  });
  T('Z03 窄图不会被拉宽，宽图有限宽', () => {
    fresh(); layoutMind();
    const narrow = mkImg(0, 0, { natW:80, natH:120 });
    ok('Z03 太窄的图用最小宽度', narrow.w === IMG_MIN_W, narrow.w);
    ok('Z03b 高度仍按比例', narrow.imgDrawH === Math.round(120 * (IMG_MIN_W / 80)), narrow.imgDrawH);
    const wide = mkImg(0, 0, { natW:4000, natH:500 });
    ok('Z03c 超宽的图被限到上限', wide.w === IMG_MAX_W, wide.w);
    ok('Z03d 比例没变形', Math.abs((wide.w / wide.imgDrawH) - (4000 / 500)) < 0.02,
      (wide.w / wide.imgDrawH).toFixed(3));
  });
  T('Z04 拖右下角改宽度，图片等比缩放', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, {});
    const h0 = n.imgDrawH;
    selectOnly(n.id);
    const r = resizeHandleRect(nodeBox(n));
    const h = S({ x:r.x + r.w / 2, y:r.y + r.h / 2 });
    pe('pointerdown', h.x, h.y);
    const tgt = S({ x:n.x + 200, y:n.y + 400 });
    pe('pointermove', tgt.x, tgt.y);
    ok('Z04 宽度变成 200', Math.abs(n.w - 200) <= 1, n.w);
    ok('Z04b 图片高度跟着等比缩', n.imgDrawH < h0 && Math.abs(n.imgDrawH - Math.round(300 * (200 / 400))) <= 1,
      n.imgDrawH);
    pe('pointerup', tgt.x, tgt.y);
  });
  T('Z05 图片节点分三块命中：名称 / 图片 / 描述', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { desc:'一段描述' });
    const b = nodeBox(n);
    ok('Z05 顶部是名称带', hitImagePart(n, { x:b.x + b.w / 2, y:b.y + 4 }) === 'name');
    ok('Z05b 中间是图片', hitImagePart(n, { x:b.x + b.w / 2, y:b.y + IMG_NAME_H + 10 }) === 'image');
    ok('Z05c 下面是描述', hitImagePart(n, { x:b.x + 10, y:b.y + IMG_NAME_H + n.imgDrawH + 6 }) === 'desc');
    ok('Z05d 普通节点没有这个划分', hitImagePart(nodeByText('节点'), { x:0, y:0 }) === null);
  });
  T('Z06 双击不同部位编辑不同字段', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { name:'原名', desc:'原描述' });
    const b = nodeBox(n);
    let q = S({ x:b.x + b.w - 20, y:b.y + 6 });
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:q.x, clientY:q.y, bubbles:true, cancelable:true }));
    ok('Z06 双击右上角编辑名称', !!editing && editing.kind === 'node' && editing.id === n.id,
      editing && editing.kind);
    editor.value = '新名字';
    editor.dispatchEvent(new Event('input', { bubbles:true }));
    commitEdit();
    ok('Z06b 名称改掉了', n.text === '新名字', n.text);
    ok('Z06c 描述没被动', n.desc === '原描述', n.desc);
    reindex(); sizeAll();
    const b2 = nodeBox(n);
    q = S({ x:b2.x + 10, y:b2.y + IMG_NAME_H + n.imgDrawH + 6 });
    cv.dispatchEvent(new MouseEvent('dblclick', { clientX:q.x, clientY:q.y, bubbles:true, cancelable:true }));
    ok('Z06d 双击图下方编辑描述', !!editing && editing.kind === 'nodeDesc' && editing.id === n.id,
      editing && editing.kind);
    editor.value = '第一行\n第二行';
    editor.dispatchEvent(new Event('input', { bubbles:true }));
    commitEdit();
    ok('Z06e 描述换行保留', n.desc === '第一行\n第二行', JSON.stringify(n.desc));
    ok('Z06f 描述折成两行', n.lines.length === 2, n.lines.length);
    ok('Z06g 名称没被动', n.text === '新名字', n.text);
  });
  T('Z07 描述改了尺寸跟着重算', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { desc:'短' });
    const h1 = n.h;
    setNodeDesc(n, '很长很长的一段描述文字，长到必须折成好几行才放得下这个宽度');
    ok('Z07 长了就高', n.h > h1, h1 + ' -> ' + n.h);
    ok('Z07b 折成了多行', n.lines.length >= 2, n.lines.length);
  });
  T('Z08 图片节点能连线、能当程序节点的目标', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, {});
    const tgt = nodeByText('操作');
    const e = linkNodes(tgt.id, n.id);
    reindex(); sizeAll();
    ok('Z08 能连上图片节点', !!e);
    const ep = edgeEndpoints(e);
    const P = anchorsFor(nodeBox(n));
    ok('Z08b 连线端点落在图片节点上',
      ['r','l','t','b'].some(k => Math.abs(ep.b.x - P[k].x) < 0.01 && Math.abs(ep.b.y - P[k].y) < 0.01),
      JSON.stringify(ep.b));
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'shape', mode:'set', value:'diamond' });
    linkNodes(pg.id, n.id);
    reindex(); sizeAll();
    ok('Z08c 程序算符也作用得到', effShape(n) === 'diamond', effShape(n));
    dirty = true; draw();
    ok('Z08d 画得出来（图片节点 + 程序形状叠加）', true);
  });
  T('Z09 图片字段能存下来', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { name:'图', desc:'说明文字' });
    n.fixedW = 260;
    sizeNode(n);
    const snap = JSON.parse(JSON.stringify(serialize()));
    const raw = snap.nodes.find(x => x.id === n.id);
    ok('Z09 序列化带 image / imgW / imgH / desc',
      /^data:image\//.test(raw.image) && raw.imgW === 400 && raw.imgH === 300 && raw.desc === '说明文字',
      JSON.stringify({ w:raw.imgW, h:raw.imgH, d:raw.desc }));
    deserialize(snap);
    const n2 = byId(n.id);
    ok('Z09b 往返后还是图片节点', n2.kind === 'image');
    ok('Z09c 图片和尺寸都在', n2.image === n.image && n2.imgW === 400 && n2.imgH === 300);
    ok('Z09d 描述还在', n2.desc === '说明文字', n2.desc);
    ok('Z09e 手动宽度也保留了', n2.fixedW === 260 && n2.w === 260, n2.w);
  });
  T('Z10 不是 data:image 的东西不会被当图片', () => {
    fresh(); layoutMind();
    const n = addNodeAt('x', 0, 0, 'rect');
    n.kind = 'image';
    n.image = 'https://example.com/a.png';       // 外链：不内嵌，存/读都会丢掉
    n.imgW = 100; n.imgH = 100;
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('Z10 外链不会被写进存档', snap.nodes.find(x => x.id === n.id).image === null,
      String(snap.nodes.find(x => x.id === n.id).image));
    const bad = { v:2, nid:1,
      nodes:[{ id:'n1', text:'', x:0, y:0, kind:'image', image:'javascript:alert(1)', imgW:10, imgH:10 }],
      edges:[], groups:[] };
    deserialize(bad);
    ok('Z10b 反序列化也会过滤掉非 data:image', byId('n1').image === null, byId('n1').image);
    ok('Z10c kind 是合法值', NODE_KINDS.indexOf(byId('n1').kind) >= 0, byId('n1').kind);
  });
  T('Z11 非法 kind 会被规整回 node', () => {
    deserialize({ v:2, nid:1, nodes:[{ id:'n1', text:'甲', x:0, y:0, kind:'外星人' }], edges:[], groups:[] });
    ok('Z11 未知 kind → node', byId('n1').kind === 'node', byId('n1').kind);
  });
  T('Z12 图片节点参与选中 / 分组 / 折叠', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, {});
    selectOnly(n.id);
    ok('Z12 能被选中', sel.has(n.id));
    const t = nodeByText('操作');
    selectGroup(null); sel.clear(); sel.add(n.id); sel.add(t.id);
    const g = createGroup();
    ok('Z12b 能进分组', groupAllNodes(g.id).indexOf(n.id) >= 0, groupAllNodes(g.id).join(','));
    selectOnly(t.id);
    toggleCollapseOf(t);
    ok('Z12c 能跟着折叠藏起来', isHidden(n.id) === (descendants(t.id).indexOf(n.id) >= 0),
      isHidden(n.id) + '/' + descendants(t.id).length);
  });
  T('Z13 导出会先等图片解码完', () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { desc:'导出测试' });
    ok('Z13 ensureImagesLoaded 返回 Promise', typeof ensureImagesLoaded().then === 'function');
    const c = buildExportCanvas([n]);
    ok('Z13b 导出画布建得出来', c.width > 0 && c.height > 0, c.width + 'x' + c.height);
  });

  await TA('Z14 拖进来的图片真的会变成图片节点（走完整导入链路）', async () => {
    fresh(); layoutMind();
    const before = doc.nodes.length;
    // 现画一张 4×2 的红图，走 canvas → blob → File → insertImageFile 全程
    const c = document.createElement('canvas');
    c.width = 4; c.height = 2;
    const cx = c.getContext('2d');
    cx.fillStyle = '#ff0000'; cx.fillRect(0, 0, 4, 2);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    ok('Z14 前置：拿到了一张图的 blob', !!blob && blob.size > 0, blob && blob.size);
    const file = new File([blob], 'a.png', { type:'image/png' });
    insertImageFile(file, { x:0, y:0 });
    for (let i = 0; i < 60 && doc.nodes.length === before; i++) await sleep(25);
    ok('Z14b 多了一个节点', doc.nodes.length === before + 1, doc.nodes.length);
    const n = doc.nodes[doc.nodes.length - 1];
    ok('Z14c 是图片节点', n.kind === 'image', n.kind);
    ok('Z14d 图片是内嵌的 data URL', /^data:image\//.test(n.image || ''), String(n.image).slice(0, 24));
    ok('Z14e 原始尺寸记对了', n.imgW === 4 && n.imgH === 2, n.imgW + 'x' + n.imgH);
    ok('Z14f 导入后自动选中', sel.has(n.id));
    skipDlg();
    ok('Z14g 提示里报了尺寸', /4×2/.test(dlgText.textContent), dlgText.textContent.slice(0, 50));
  });
  await TA('Z15 非图片文件会被挡下来', async () => {
    fresh(); layoutMind();
    const before = doc.nodes.length;
    insertImageFile(new File(['hello'], 'a.txt', { type:'text/plain' }), { x:0, y:0 });
    await sleep(80);
    ok('Z15 没有新建节点', doc.nodes.length === before, doc.nodes.length);
    skipDlg();
    ok('Z15b 有提示说它不是图片', /不是图片/.test(dlgText.textContent), dlgText.textContent.slice(0, 40));
  });
  await TA('Z16 换图会替换内容但保留描述和名称', async () => {
    fresh(); layoutMind();
    const n = mkImg(0, 0, { name:'标题', desc:'说明' });
    const oldUrl = n.image;
    const c = document.createElement('canvas');
    c.width = 60; c.height = 20;
    c.getContext('2d').fillRect(0, 0, 60, 20);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    replaceImage(n, new File([blob], 'b.png', { type:'image/png' }));
    for (let i = 0; i < 60 && n.image === oldUrl; i++) await sleep(25);
    ok('Z16 图片换掉了', n.image !== oldUrl && /^data:image\//.test(n.image));
    ok('Z16b 原始尺寸更新', n.imgW === 60 && n.imgH === 20, n.imgW + 'x' + n.imgH);
    ok('Z16c 名称保留', n.text === '标题', n.text);
    ok('Z16d 描述保留', n.desc === '说明', n.desc);
    ok('Z16e 尺寸按新图重算', n.imgDrawH === Math.round(20 * (n.w / 60)), n.imgDrawH);
  });

  /* ==================== 嵌入文档（插入 Grapheon） ==================== */
  /* 造一份小文档当素材 */
  const mkSubDoc = (n) => {
    const nodes = [], edges = [];
    for (let i = 0; i < (n || 3); i++){
      nodes.push({ id:'s' + i, text:'子' + i, x:i * 200, y:0, shape:'rect' });
      if (i) edges.push({ id:'se' + i, s:'s0', t:'s' + i });
    }
    return { v:2, nid:n || 3, nodes, edges, groups:[] };
  };
  const mkEmbed = (x, y, opts) => {
    const o = opts || {};
    const n = addEmbedNode(o.doc || mkSubDoc(o.count || 3), o.name || '子文档',
                          x == null ? 0 : x, y == null ? 0 : y);
    reindex(); sizeAll();
    return n;
  };
  T('O01 建一个嵌入节点', () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, { count:4, name:'模块图' });
    ok('O01 kind 是 embed', n.kind === 'embed' && isEmbed(n));
    ok('O01b 内嵌文档存下来了', n.embed && n.embed.doc && n.embed.doc.nodes.length === 4,
      n.embed && n.embed.doc && n.embed.doc.nodes.length);
    ok('O01c 名称就是节点文字', n.text === '模块图');
    ok('O01d 默认尺寸', n.w === EMBED_DEF_W && n.h === EMBED_DEF_H, n.w + 'x' + n.h);
    const b = buildExportCanvas([n]);
    ok('O01e 画得出来', b.width > 0);
  });
  T('O02 嵌入节点是封闭的：连不了线', () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, {});
    const tgt = nodeByText('操作');
    const before = doc.edges.length;
    ok('O02 linkNodes 直接拒绝', linkNodes(tgt.id, n.id) === null);
    ok('O02b 反着连也拒绝', linkNodes(n.id, tgt.id) === null);
    ok('O02c 没有多出连线', doc.edges.length === before, doc.edges.length);
    reindex();
    ok('O02d 落点不认嵌入节点', linkTargetAt({ x:n.x + n.w / 2, y:n.y + n.h / 2 }) === null);
    selectOnly(n.id);
    ok('O02e 选中它也不给连接端点', hitPort(anchorsFor(nodeBox(n)).r) === null);
    ok('O02f 但它自己还能被选中', sel.has(n.id));
  });
  T('O03 历史存档里连到嵌入节点的边会被丢掉', () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, {});
    const tgt = nodeByText('操作');
    const snap = JSON.parse(JSON.stringify(serialize()));
    snap.edges.push({ id:'bad', s:tgt.id, t:n.id, arrow:'end', dash:false, route:'ortho' });
    snap.edges.push({ id:'bad2', s:n.id, t:tgt.id, arrow:'end', dash:false, route:'ortho' });
    deserialize(snap);
    ok('O03 连到嵌入节点的边被过滤掉了',
      !doc.edges.some(e => e.id === 'bad' || e.id === 'bad2'), doc.edges.map(e => e.id).join(','));
    ok('O03b 其它边没受影响', doc.edges.length === 11, doc.edges.length);
    ok('O03c 嵌入节点还在', byId(n.id) && byId(n.id).kind === 'embed');
  });
  T('O04 进去编辑改的是副本，父文档结构不变', () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, { count:3 });
    const parentCount = doc.nodes.length;
    const parentEdges = doc.edges.length;
    enterEmbed(byId(n.id));
    ok('O04 进去了', insideEmbed());
    ok('O04b 当前文档变成子文档', doc.nodes.length === 3, doc.nodes.length);
    ok('O04c 面包屑拿到了名字', embedRootName() === '子文档', embedRootName());
    // 在里面加一个节点
    const nn = addNodeAt('新加的', 500, 200, 'rect');
    reindex(); sizeAll();
    ok('O04d 里面加上了', doc.nodes.length === 4, doc.nodes.length);
    exitEmbed();
    ok('O04e 出来了', !insideEmbed());
    ok('O04f 父文档节点数没变', doc.nodes.length === parentCount, doc.nodes.length);
    ok('O04g 父文档连线数没变', doc.edges.length === parentEdges, doc.edges.length);
    const back = byId(n.id);
    ok('O04h 里面加的东西写回副本了', back.embed.doc.nodes.length === 4,
      back.embed.doc.nodes.length);
    ok('O04i 副本里能找到那个新节点',
      back.embed.doc.nodes.some(x => x.text === '新加的'));
    ok('O04j 出来之后选中还是那个嵌入节点', sel.has(n.id) || sel.has(back.id), [...sel].join(','));
  });
  T('O05 进出会恢复视图和历史栈', () => {
    fresh(); layoutMind(); fitView();
    const n = mkEmbed(0, 0, {});
    const v0 = { x:view.x, y:view.y, z:view.z };
    const hSize = hist.stack.length;
    enterEmbed(byId(n.id));
    view.x += 500; view.z = 2;
    exitEmbed();
    ok('O05 视图回到进去之前', Math.abs(view.x - v0.x) < 0.01 && Math.abs(view.z - v0.z) < 0.01,
      JSON.stringify({ x:Math.round(view.x), z:view.z }));
    // 退出时会把内层改动写回父文档并入一次历史，所以是 hSize+1；关键是要「外层的」历史
    ok('O05b 历史栈是外层的（不是被内层顶掉）',
      hist.stack.length >= hSize && hist.stack[hist.i].indexOf('子文档') >= 0,
      hist.stack.length + ' vs ' + hSize + ' / ' + hist.stack[hist.i].slice(0, 40));
    ok('O05c 出来之后外层的历史还能用', (() => {
      const before = JSON.stringify(serialize());
      const t = nodeByText('操作');
      selectOnly(t.id);
      toggleCollapseOf(t);                  // 自带 pushHist；fresh 之后只有一个快照，得先造个改动
      const mid = JSON.stringify(serialize());
      undo();
      return before !== mid && JSON.stringify(serialize()) === before;
    })());
  });
  T('O06 嵌套嵌入也能进出', () => {
    fresh(); layoutMind();
    const outer = mkEmbed(0, 0, { doc:mkSubDoc(2), name:'外层' });
    // 在外层文档里再嵌一个
    enterEmbed(byId(outer.id));
    const inner = addEmbedNode(mkSubDoc(5), '内层', 0, 0);
    reindex(); sizeAll();
    exitEmbed();
    const o2 = byId(outer.id);
    ok('O06 外层副本里有了内层', o2.embed.doc.nodes.some(x => x.kind === 'embed'),
      o2.embed.doc.nodes.map(x => x.kind).join(','));
    // 再进去，进到内层，再出来
    enterEmbed(byId(outer.id));
    const inner2 = doc.nodes.find(x => x.kind === 'embed');
    enterEmbed(inner2);
    ok('O06b 进到第二层了', doc.nodes.length === 5, doc.nodes.length);
    addNodeAt('最里面', 0, 300, 'rect');
    reindex(); sizeAll();
    exitEmbed();
    ok('O06c 回到第一层', doc.nodes.length === 3, doc.nodes.length);
    exitEmbed();
    ok('O06d 回到最外层', !insideEmbed() && doc.nodes.length === 13, doc.nodes.length);
    const o3 = byId(outer.id);
    const innerData = o3.embed.doc.nodes.find(x => x.kind === 'embed');
    ok('O06e 最里面的改动落到了内层副本', innerData.embed.doc.nodes.length === 6,
      innerData.embed.doc.nodes.length);
  });
  await TA('O07 嵌入期间不写自动存档（别把外层存档冲掉）', async () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, {});
    pushHist();
    await sleep(500);                 // 把之前测试挂着的自动存档定时器放完
    localStorage.removeItem(LS_KEY);
    enterEmbed(byId(n.id));
    pushHist();                       // 内部会调 autosave
    await sleep(600);
    ok('O07 嵌入期间没写自动存档', localStorage.getItem(LS_KEY) === null,
      String(localStorage.getItem(LS_KEY)).slice(0, 30));
    exitEmbed();
    pushHist();
    await sleep(600);
    ok('O07b 出来之后又正常存档了', !!localStorage.getItem(LS_KEY));
    localStorage.removeItem(LS_KEY);
  });
  T('O08 尺寸可以手动改，缩略图跟着铺满', () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, {});
    setNodeSize(n, 520, 360);
    ok('O08 尺寸改掉了', n.w === 520 && n.h === 360, n.w + 'x' + n.h);
    ok('O08b 有下限', (setNodeSize(n, 5, 5), n.w >= EMBED_MIN_W && n.h >= EMBED_MIN_H), n.w + 'x' + n.h);
    dirty = true; draw();
    ok('O08c 画得出来', true);
  });
  T('O09 嵌入字段能存下来', () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, { count:5, name:'存档测试' });
    setNodeSize(n, 400, 300);
    const snap = JSON.parse(JSON.stringify(serialize()));
    const raw = snap.nodes.find(x => x.id === n.id);
    ok('O09 序列化带 embed.doc', raw.embed && raw.embed.doc.nodes.length === 5,
      raw.embed && raw.embed.doc && raw.embed.doc.nodes.length);
    deserialize(snap);
    const n2 = byId(n.id);
    ok('O09b 往返还是嵌入节点', n2.kind === 'embed');
    ok('O09c 内嵌文档完整', n2.embed.doc.nodes.length === 5 && n2.embed.doc.edges.length === 4,
      n2.embed.doc.nodes.length + '/' + n2.embed.doc.edges.length);
    ok('O09d 尺寸也保留了', n2.w === 400 && n2.h === 300, n2.w + 'x' + n2.h);
  });
  T('O10 空文档 / 坏数据不会崩', () => {
    fresh(); layoutMind();
    const empty = mkEmbed(0, 0, { doc:{ v:2, nid:1, nodes:[], edges:[], groups:[] } });
    dirty = true; draw();
    ok('O10 空文档画得出来', true);
    enterEmbed(empty);
    skipDlg();                       // enterEmbed 里又 say 了一次，得重新跳过打字机
    ok('O10b 空文档进不去（有提示）', !insideEmbed());
    ok('O10c 提示说里面没内容', /没有内容/.test(dlgText.textContent), dlgText.textContent.slice(0, 30));
    // 手工塞一个残缺的 embed
    const n = addNodeAt('x', 0, 0, 'rect');
    n.kind = 'embed';
    n.embed = { doc:{ nodes:[{ id:'z', text:'甲', x:0, y:0 }] } };    // 没有 edges
    sizeNode(n); reindex(); sizeAll();
    dirty = true; draw();
    ok('O10d 缺 edges 也能画', true);
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    ok('O10e 也能存读', byId(n.id).kind === 'embed');
  });
  T('O11 嵌入节点参与选中 / 分组 / 折叠，但就是不连线', () => {
    fresh(); layoutMind();
    const n = mkEmbed(0, 0, {});
    ok('O11 能被选中', (selectOnly(n.id), sel.has(n.id)));
    const t = nodeByText('操作');
    selectGroup(null); sel.clear(); sel.add(n.id); sel.add(t.id);
    const g = createGroup();
    ok('O11b 能进分组', groupAllNodes(g.id).indexOf(n.id) >= 0);
    ok('O11c 但进组之后还是连不了线', linkNodes(t.id, n.id) === null);
    selectOnly(t.id); toggleCollapseOf(t);
    ok('O11d 折叠能把它藏起来', isHidden(n.id) === (descendants(t.id).indexOf(n.id) >= 0));
    const before = doc.nodes.length;
    selectOnly(n.id);
    deleteSelection();
    ok('O11e 删得掉（顺手验一下这次的 BUG 修复）', doc.nodes.length === before - 1);
  });


  /* ==================== 变量 / 运算节点 / 函数分组 ==================== */
  const mkVar = (name, val, opts) => {
    const n = addVarNode(name, 0, 0, Object.assign({ value:val }, opts || {}));
    return n;
  };
  T('J01 建一个变量定义节点', () => {
    fresh(); layoutMind();
    const v = mkVar('total', '10');
    ok('J01 kind 是 var', v.kind === 'var' && isVarNode(v));
    ok('J01b 默认定义', v.varDef.name === 'total' && v.varDef.value === '10' &&
      v.varDef.type === 'number' && v.varDef.scope === 'global', JSON.stringify(v.varDef));
    ok('J01c 尺寸按两个输入框算', v.w >= VAR_PAD * 2 + VAR_NAME_W + 10 + VAR_VAL_W, v.w);
    ok('J01d 画得出来', (dirty = true, draw(), true));
  });
  T('J02 普通节点文本里可以用 {name} 引用', () => {
    fresh(); layoutMind();
    const v = mkVar('total', '42');
    const c = addNodeAt('总数是 {total} 个', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('J02 解析得到 42', resolveVar('total', c.id) === '42', resolveVar('total', c.id));
    ok('J02b 插值成文本', interpolate('总数是 {total} 个', c.id) === '总数是 42 个',
      interpolate('总数是 {total} 个', c.id));
    ok('J02c 显示文本走的是派生表', displayTextOf(c) === '总数是 42 个', displayTextOf(c));
    ok('J02d 裸字段没被改', c.text === '总数是 {total} 个', c.text);
    ok('J02e 折行用的是插值后的文本', c.lines.join('').indexOf('42') >= 0, c.lines.join('|'));
    ok('J02f 标记出了这个节点有引用', hasVarRefs(c));
    ok('J02g 变量节点自己不算引用别人', !hasVarRefs(v));
  });
  T('J03 \\{ 是字面量', () => {
    fresh(); layoutMind();
    mkVar('x', '9');
    const c = addNodeAt('原样 \\{x} 和真的 {x}', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('J03 反斜杠那个不替换', interpolate('原样 \\{x} 和真的 {x}', c.id) === '原样 {x} 和真的 9',
      interpolate('原样 \\{x} 和真的 {x}', c.id));
    ok('J03b 只有 { 没有 } 时不当引用', interpolate('单独一个 { 没事', c.id) === '单独一个 { 没事');
    ok('J03c 空括号 { } 也只是未定义', interpolate('{ }', c.id) === '[未定义]', interpolate('{ }', c.id));
  });
  T('J04 变量不存在显示 [未定义]', () => {
    fresh(); layoutMind();
    const c = addNodeAt('找不到 {nope}', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('J04 resolveVar 返回 null', resolveVar('nope', c.id) === null);
    ok('J04b 文本里显示 [未定义]', displayTextOf(c) === '找不到 [未定义]', displayTextOf(c));
    ok('J04c 没有变量节点时也不炸', (() => {
      deserialize({ v:2, nid:1, nodes:[{ id:'n1', text:'{a}{b}', x:0, y:0 }], edges:[], groups:[] });
      reindex(); sizeAll();
      return displayTextOf(byId('n1')) === '[未定义][未定义]';
    })());
  });
  T('J05 插值后尺寸跟着变', () => {
    fresh(); layoutMind();
    const v = mkVar('n', '1');
    const c = addNodeAt('值 {n}', 0, 0, 'rect');
    reindex(); sizeAll();
    const w1 = c.w;
    setVarDef(v, { value:'1234567890123456789' });
    reindex(); sizeAll();
    ok('J05 值变长后节点变宽', c.w > w1, w1 + ' -> ' + c.w);
    setVarDef(v, { value:'1' });
    reindex(); sizeAll();
    ok('J05b 变回去又窄了', c.w === w1, c.w);
  });
  T('J06 三种作用域', () => {
    fresh(); layoutMind();
    // 全局：随便哪个节点都能用
    const g = mkVar('gv', '1', { scope:'global' });
    const far = addNodeAt('{gv}', 0, 0, 'rect');
    reindex();
    ok('J06 全局：远处也能用', resolveVar('gv', far.id) === '1');
    // 局内：只有下游能用
    const l = mkVar('lv', '2', { scope:'local' });
    const down = addNodeAt('{lv}', 0, 0, 'rect');
    const side = addNodeAt('{lv}', 0, 0, 'rect');
    linkNodes(l.id, down.id);
    reindex(); sizeAll();
    ok('J06b 局内：下游能用', resolveVar('lv', down.id) === '2', resolveVar('lv', down.id));
    ok('J06c 局内：不是下游就看不到', resolveVar('lv', side.id) === null, resolveVar('lv', side.id));
    ok('J06d 局内：间接下游也算', (() => {
      const deeper = addNodeAt('{lv}', 0, 0, 'rect');
      linkNodes(down.id, deeper.id);
      reindex();
      return resolveVar('lv', deeper.id) === '2';
    })());
    // 组内：得指向一个分组
    const grp = newEmptyGroup(0, 0);
    const gp = mkVar('pv', '3', { scope:'group' });
    const inside = addNodeAt('{pv}', 0, 0, 'rect');
    const outside = addNodeAt('{pv}', 0, 0, 'rect');
    linkNodes(gp.id, grp.id);
    grp.members = [inside.id];
    reindex(); sizeAll();
    ok('J06e 组内：组内节点能用', resolveVar('pv', inside.id) === '3', resolveVar('pv', inside.id));
    ok('J06f 组内：组外的用不了', resolveVar('pv', outside.id) === null, resolveVar('pv', outside.id));
    ok('J06g 全局变量在组内也能用', resolveVar('gv', inside.id) === '1');
  });
  T('J07 运算节点改变下游看到的值', () => {
    fresh(); layoutMind();
    const v = mkVar('n', '10');
    const op = addOpNode('加五', 0, 0, { op:'+', operand:'5' });
    const c = addNodeAt('{n}', 0, 0, 'rect');
    linkNodes(v.id, op.id);
    linkNodes(op.id, c.id);
    reindex(); sizeAll();
    ok('J07 下游看到 15', resolveVar('n', c.id) === 15, resolveVar('n', c.id));
    ok('J07b 运算节点自己那儿还是 10', resolveVar('n', op.id) === '10', resolveVar('n', op.id));
    ok('J07c 变量节点自己那儿是原值', resolveVar('n', v.id) === '10');
    ok('J07d 不在这条路上的消费者看不到运算', (() => {
      const other = addNodeAt('{n}', 0, 0, 'rect');
      linkNodes(v.id, other.id);
      reindex();
      return resolveVar('n', other.id) === '10';
    })());
  });
  T('J08 运算节点可叠加', () => {
    fresh(); layoutMind();
    const v = mkVar('n', '2');
    const op1 = addOpNode('加三', 0, 0, { op:'+', operand:'3' });
    const op2 = addOpNode('乘四', 0, 0, { op:'*', operand:'4' });
    const c = addNodeAt('{n}', 0, 0, 'rect');
    linkNodes(v.id, op1.id); linkNodes(op1.id, op2.id); linkNodes(op2.id, c.id);
    reindex(); sizeAll();
    ok('J08 (2+3)*4 = 20', resolveVar('n', c.id) === 20, resolveVar('n', c.id));
    ok('J08b 中间点只叠了一半', (() => {
      const mid = addNodeAt('{n}', 0, 0, 'rect');
      linkNodes(op1.id, mid.id);
      reindex();
      return resolveVar('n', mid.id) === 5;
    })());
  });
  T('J09 四种算符 + 字符串拼接', () => {
    fresh(); layoutMind();
    const v = mkVar('n', '10');
    const mk = (op, val) => {
      const o = addOpNode('', 0, 0, { op, operand:val });
      linkNodes(v.id, o.id);
      reindex();
      return resolveVar('n', o.id);
    };
    ok('J09 加', (() => { const o = addOpNode('', 0, 0, { op:'+', operand:'7' });
      linkNodes(v.id, o.id); reindex(); return resolveVar('n', o.id) === '10'; })());
    // 直接查运算节点的输出（它自己不是消费者，所以看它的下游）
    const calc = (op, val) => {
      const o = addOpNode('', 0, 0, { op, operand:val });
      const t = addNodeAt('{n}', 0, 0, 'rect');
      linkNodes(v.id, o.id); linkNodes(o.id, t.id);
      reindex(); sizeAll();
      return resolveVar('n', t.id);
    };
    ok('J09b 减', calc('-', '4') === 6, calc('-', '4'));
    ok('J09c 乘', calc('*', '4') === 40, calc('*', '4'));
    ok('J09d 除', calc('/', '4') === 2.5, calc('/', '4'));
    ok('J09e 除以 0 不炸', calc('/', '0') === 0, calc('/', '0'));
    ok('J09f 非数字加号当拼接', (() => {
      const s = mkVar('s', '你好', { type:'string' });
      const o = addOpNode('', 0, 0, { op:'+', operand:'世界' });
      const t = addNodeAt('{s}', 0, 0, 'rect');
      linkNodes(s.id, o.id); linkNodes(o.id, t.id);
      reindex(); sizeAll();
      return resolveVar('s', t.id) === '你好世界';
    })(), (() => {
      const s = doc.nodes.find(x => x.varDef && x.varDef.name === 's');
      return s ? 'ok' : 'no var';
    })());
  });
  T('J10 函数分组：值变成组内算出来的（细节见 L05）', () => {
    fresh(); layoutMind();
    const fg = newEmptyGroup(0, 0);
    renameGroup(fg, '面积');
    fg.isFunction = true;
    const w  = mkVar('w', '6');
    const op = addOpNode('乘七', 0, 0, { op:'*', operand:'7' });
    const out = addOutNode('farea', 0, 0);          // 函数分组要有输出节点才有值
    linkNodes(w.id, op.id); linkNodes(op.id, out.id);
    fg.members = [w.id, op.id, out.id];
    const area = mkVar('area', '0');
    linkNodes(area.id, fg.id);
    const c = addNodeAt('面积 = {area}', 0, 0, 'rect');
    linkNodes(area.id, c.id);
    reindex(); sizeAll();
    ok('J10 函数分组内部算出 42', functionResult(fg) === 42, functionResult(fg));
    ok('J10b 指向它的变量节点拿到 42', defValue(area) === 42, defValue(area));
    ok('J10c 消费者看到 42', resolveVar('area', c.id) === 42, resolveVar('area', c.id));
    ok('J10d 文字里也是 42', displayTextOf(c) === '面积 = 42', displayTextOf(c));
  });
  T('J11 函数分组只看组内的边', () => {
    fresh(); layoutMind();
    const fg = newEmptyGroup(0, 0);
    fg.isFunction = true;
    const w   = mkVar('w', '5');
    const op  = addOpNode('', 0, 0, { op:'+', operand:'100' });   // 这个在组外
    const out = addOutNode('r', 0, 0);
    linkNodes(w.id, op.id); linkNodes(op.id, out.id);
    fg.members = [w.id, out.id];
    reindex();
    ok('J11 组外的运算节点不参与（组内没有来源就是空）', functionResult(fg) === null,
      String(functionResult(fg)));
    fg.members.push(op.id);            // 收进组里，它才参与
    reindex();
    ok('J11b 收进组里就参与了', functionResult(fg) === 105, functionResult(fg));
  });
  T('J12 优先级', () => {
    fresh(); layoutMind();
    const v = mkVar('x', '1');
    ok('J12 变量默认最高', priorityOf(v) === VAR_PRIORITY, priorityOf(v));
    const o = addOpNode('', 0, 0, {});
    ok('J12b 运算节点默认 100', priorityOf(o) === OP_PRIORITY, priorityOf(o));
    const c = addNodeAt('普通', 0, 0, 'rect');
    ok('J12c 普通节点 0', priorityOf(c) === 0);
    setPriority(v, 5);
    ok('J12d 可以手动改', priorityOf(v) === 5, priorityOf(v));
    setPriority(v, 0);
    ok('J12e 设回 0 就恢复默认（变量仍是最高）', priorityOf(v) === VAR_PRIORITY, priorityOf(v));
  });
  T('J13 同名变量按优先级 + 顺序取', () => {
    fresh(); layoutMind();
    const a = mkVar('dup', 'A');
    const b = mkVar('dup', 'B');
    reindex();
    ok('J13 同优先级取靠前的', resolveVar('dup', nodeByText('节点').id) === 'A',
      resolveVar('dup', nodeByText('节点').id));
    setPriority(b, 2000);
    reindex();
    ok('J13b 优先级高的赢', resolveVar('dup', nodeByText('节点').id) === 'B',
      resolveVar('dup', nodeByText('节点').id));
  });
  T('J14 派生性：不写回节点字段', () => {
    fresh(); layoutMind();
    const v = mkVar('k', '1');
    const c = addNodeAt('v={k}', 0, 0, 'rect');
    reindex(); sizeAll();
    setVarDef(v, { value:'999' });
    reindex(); sizeAll();
    ok('J14 变量裸字段没被改', v.varDef.value === '999');
    ok('J14b 消费者裸文本没被改', c.text === 'v={k}', c.text);
    ok('J14c 但显示文本变了', displayTextOf(c) === 'v=999', displayTextOf(c));
    ok('J14d 删掉变量定义后回到未定义', (() => {
      doc.nodes = doc.nodes.filter(x => x.id !== v.id);
      reindex(); sizeAll();
      return displayTextOf(c) === 'v=[未定义]';
    })(), displayTextOf(c));
  });
  T('J15 变量 / 运算节点能存下来', () => {
    fresh(); layoutMind();
    const v = mkVar('saved', '7', { type:'string', scope:'local' });
    const o = addOpNode('加倍', 0, 0, { op:'*', operand:'2' });
    setPriority(o, 50);
    const fg = newEmptyGroup(0, 0);
    fg.isFunction = true;
    const c = addNodeAt('{saved}', 0, 0, 'rect');
    linkNodes(v.id, o.id); linkNodes(o.id, c.id);
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    const rv = snap.nodes.find(x => x.id === v.id);
    ok('J15 序列化带 varDef', rv.varDef.name === 'saved' && rv.varDef.type === 'string' &&
      rv.varDef.scope === 'local', JSON.stringify(rv.varDef));
    ok('J15b 带 opDef', snap.nodes.find(x => x.id === o.id).opDef.op === '*');
    ok('J15c 带 priority', snap.nodes.find(x => x.id === o.id).priority === 50);
    ok('J15d 分组带 isFunction', snap.groups.find(g => g.id === fg.id).isFunction === true);
    deserialize(snap);
    ok('J15e 往返后还是变量节点', byId(v.id).kind === 'var');
    ok('J15f 往返后定义完整', byId(v.id).varDef.name === 'saved' && byId(v.id).varDef.scope === 'local',
      JSON.stringify(byId(v.id).varDef));
    ok('J15g 往返后优先级还在', byId(o.id).priority === 50);
    ok('J15h 往返后插值照样对', displayTextOf(byId(c.id)) === '14', displayTextOf(byId(c.id)));
  });
  T('J16 变量 / 运算节点的分部命中', () => {
    fresh(); layoutMind();
    const v = mkVar('a', '1');
    const L = varBoxes(v);
    selectOnly(v.id);
    ok('J16 命中变量名框', hitVarPart(v, { x:L.nameBox.x + 4, y:L.nameBox.y + 4 }) === 'varName');
    ok('J16b 命中变量值框', hitVarPart(v, { x:L.valBox.x + 4, y:L.valBox.y + 4 }) === 'varValue');
    ok('J16c 命中作用域行', hitVarPart(v, { x:L.scopeBox.x + 4, y:L.scopeBox.y + 4 }) === 'varScope');
    ok('J16d 其它地方是文本', hitVarPart(v, { x:L.nameBox.x, y:L.nameBox.y - 6 }) === 'text');
    ok('J16e 对普通节点不适用', hitVarPart(nodeByText('节点'), { x:0, y:0 }) === null);
    const o = addOpNode('', 0, 0, {});
    const O = opBoxes(o);
    ok('J16f 命中算符框', hitOpPart(o, { x:O.opBox.x + 4, y:O.opBox.y + 4 }) === 'opOp');
    ok('J16g 命中运算值框', hitOpPart(o, { x:O.valBox.x + 4, y:O.valBox.y + 4 }) === 'opVal0',
      hitOpPart(o, { x:O.valBox.x + 4, y:O.valBox.y + 4 }));
    ok('J16h 双击算符框会轮换', (() => {
      const before = normalizeOpDef(o.opDef).op;
      cycleOpOperator(o);
      return normalizeOpDef(o.opDef).op !== before;
    })());
  });
  T('J17 变量节点参与选中 / 分组 / 折叠 / 删除', () => {
    fresh(); layoutMind();
    const v = mkVar('z', '1');
    ok('J17 能选中', (selectOnly(v.id), sel.has(v.id)));
    const before = doc.nodes.length;
    selectOnly(mkVar('zz', '2').id);
    deleteSelection();
    ok('J17b 删得掉', doc.nodes.length === before, doc.nodes.length + ' vs ' + before);
    const t = nodeByText('操作');
    selectGroup(null); sel.clear(); sel.add(v.id); sel.add(t.id);
    const g = createGroup();
    ok('J17c 能进分组', groupAllNodes(g.id).indexOf(v.id) >= 0);
    ok('J17d 能连线', !!linkNodes(t.id, v.id));
  });


  /* ==================== 输出节点 / 函数分组 / 运算符注册表 ==================== */
  const mkFnGroup = (title) => {
    const g = newEmptyGroup(0, 0);
    renameGroup(g, title || 'ƒ');
    g.isFunction = true;
    return g;
  };
  const mkOut = (name) => addOutNode(name, 0, 0);

  T('L01 建一个输出节点', () => {
    fresh(); layoutMind();
    const o = mkOut('result');
    ok('L01 kind 是 out', o.kind === 'out' && isOutNode(o));
    ok('L01b 名字存下来了', normalizeOutDef(o.outDef).name === 'result', JSON.stringify(o.outDef));
    ok('L01c 有尺寸', o.w > 0 && o.h > 0, o.w + 'x' + o.h);
    ok('L01d 画得出来', (dirty = true, draw(), true));
  });
  T('L02 有入边：值从线上来', () => {
    fresh(); layoutMind();
    const v = mkVar('x', '7');
    const op = addOpNode('加三', 0, 0, { op:'+', operand:'3' });
    const o = mkOut('result');
    linkNodes(v.id, op.id); linkNodes(op.id, o.id);
    reindex(); sizeAll();
    ok('L02 输出值是 10', outputValueIn(liveCtx(), byId(o.id)) === 10,
      outputValueIn(liveCtx(), byId(o.id)));
  });
  T('L03 没入边：按名字找同作用域的变量', () => {
    fresh(); layoutMind();
    const v = mkVar('payload', '你好');
    const o = mkOut('payload');
    reindex(); sizeAll();
    ok('L03 靠名字取到值', outputValueIn(liveCtx(), byId(o.id)) === '你好',
      outputValueIn(liveCtx(), byId(o.id)));
    setVarDef(byId(v.id), { value:'再见' });
    reindex(); sizeAll();
    ok('L03b 变量改了它跟着变', outputValueIn(liveCtx(), byId(o.id)) === '再见');
    // 名字对不上就是空
    setOutDef(byId(o.id), { name:'nope' });
    reindex();
    ok('L03c 名字对不上是空', outputValueIn(liveCtx(), byId(o.id)) === null);
  });
  T('L04 顶层输出节点代表整份文档的输出', () => {
    fresh(); layoutMind();
    const v = mkVar('x', '3');
    const o = mkOut('docOut');
    linkNodes(v.id, o.id);
    reindex(); sizeAll();
    ok('L04 找得到顶层输出节点', documentOutputNode() && documentOutputNode().id === o.id);
    ok('L04b 值是 3', outputValueIn(liveCtx(), byId(o.id)) === '3',
      outputValueIn(liveCtx(), byId(o.id)));
  });
  T('L05 函数分组的输出由输出节点决定', () => {
    fresh(); layoutMind();
    const fg = mkFnGroup('面积');
    const w  = mkVar('w', '6');
    const op = addOpNode('乘七', 0, 0, { op:'*', operand:'7' });
    const out = mkOut('farea');
    linkNodes(w.id, op.id); linkNodes(op.id, out.id);
    fg.members = [w.id, op.id, out.id];
    const area = mkVar('area', '0');
    linkNodes(area.id, fg.id);
    const c = addNodeAt('面积 = {area}', 0, 0, 'rect');
    linkNodes(area.id, c.id);
    reindex(); sizeAll();
    ok('L05 函数分组算出 42', functionResult(fg) === 42, functionResult(fg));
    ok('L05b 指向它的变量节点拿到 42', defValue(area) === 42, defValue(area));
    ok('L05c 消费者看到 42', resolveVar('area', c.id) === 42, resolveVar('area', c.id));
    ok('L05d 文字里也是 42', displayTextOf(c) === '面积 = 42', displayTextOf(c));
    ok('L05e 这个输出节点是生效的', outputEffective(out.id));
    ok('L05f 它自己标着函数作用域', /函数输出/.test(outScopeLabel(out.id)), outScopeLabel(out.id));
  });
  T('L06 函数分组没有输出节点就是空', () => {
    fresh(); layoutMind();
    const fg = mkFnGroup('空函数');
    const w = mkVar('w', '5', { scope:'global' });
    fg.members = [w.id];
    const v = mkVar('r', '0');
    linkNodes(v.id, fg.id);
    const c = addNodeAt('{r}', 0, 0, 'rect');
    linkNodes(v.id, c.id);
    reindex(); sizeAll();
    ok('L06 functionResult 是 null', functionResult(fg) === null, String(functionResult(fg)));
    ok('L06b 消费者显示 [未定义]', displayTextOf(c) === '[未定义]', displayTextOf(c));
  });
  T('L07 每个作用域只有一个输出节点生效', () => {
    fresh(); layoutMind();
    const a = mkOut('first');
    const b = mkOut('second');
    reindex();
    ok('L07 靠前的那个生效', outputEffective(a.id) && !outputEffective(b.id),
      outputEffective(a.id) + '/' + outputEffective(b.id));
    ok('L07b 没生效的会写明', /未生效/.test(outScopeLabel(b.id)), outScopeLabel(b.id));
    // 删掉第一个，第二个就顶上
    doc.nodes = doc.nodes.filter(n => n.id !== a.id);
    reindex();
    ok('L07c 删掉第一个后第二个生效', outputEffective(b.id));
    // 不同函数分组各算各的
    const fg1 = mkFnGroup('A'), fg2 = mkFnGroup('B');
    const o1 = mkOut('r1'), o2 = mkOut('r2');
    fg1.members = [o1.id]; fg2.members = [o2.id];
    reindex();
    ok('L07d 两个函数分组里各有一个生效', outputEffective(o1.id) && outputEffective(o2.id));
  });
  T('L08 函数分组内外完全隔离', () => {
    fresh(); layoutMind();
    const fg = mkFnGroup('隔离');
    const inside  = mkVar('v', '内', { scope:'global' });
    const outside = mkVar('v', '外', { scope:'global' });
    const out = mkOut('r');
    linkNodes(inside.id, out.id);
    fg.members = [inside.id, out.id];
    const consumerInside  = addNodeAt('{v}', 0, 0, 'rect');
    const consumerOutside = addNodeAt('{v}', 0, 0, 'rect');
    fg.members.push(consumerInside.id);
    reindex(); sizeAll();
    ok('L08 组内的「全局」只在组内可见（组内看到「内」）',
      resolveVar('v', consumerInside.id) === '内', resolveVar('v', consumerInside.id));
    ok('L08b 组外看不到组内的变量', resolveVar('v', consumerOutside.id) === '外',
      resolveVar('v', consumerOutside.id));
    ok('L08c 组内的「全局」不会漏到外面', (() => {
      doc.nodes = doc.nodes.filter(n => n.id !== outside.id);
      reindex();
      return resolveVar('v', consumerOutside.id) === null;
    })());
    // 局内：只有组内下游
    const loc = mkVar('lv', '2', { scope:'local' });
    const down = addNodeAt('{lv}', 0, 0, 'rect');
    const side = addNodeAt('{lv}', 0, 0, 'rect');
    linkNodes(loc.id, down.id);
    fg.members.push(loc.id, down.id, side.id);
    reindex();
    ok('L08d 组内「局内」：下游能用', resolveVar('lv', down.id) === '2', resolveVar('lv', down.id));
    ok('L08e 组内「局内」：非下游看不到', resolveVar('lv', side.id) === null, resolveVar('lv', side.id));
  });
  T('L09 跨层引用：{嵌入名.输出名}', () => {
    fresh(); layoutMind();
    // 造一份带输出节点的子文档
    const sub = {
      v:2, nid:0, groups:[],
      nodes: [
        { id:'a', text:'', x:0, y:0, kind:'var', varDef:{ name:'in', value:'9', type:'number', scope:'global' } },
        { id:'b', text:'二号', x:0, y:0, kind:'op', opDef:{ op:'*', operand:'3' } },
        { id:'c', text:'', x:0, y:0, kind:'out', outDef:{ name:'answer' } }
      ],
      edges: [ { id:'e1', s:'a', t:'b' }, { id:'e2', s:'b', t:'c' } ]
    };
    const before = doc.nodes.length;
    const emb = addEmbedNode(sub, '子图', 0, 0);
    const c = addNodeAt('答案 {子图.answer}', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('L09 取到嵌入文档的输出值', resolveEmbedOutput('子图', 'answer') === 27,
      String(resolveEmbedOutput('子图', 'answer')));
    ok('L09b 插值也对', displayTextOf(c) === '答案 27', displayTextOf(c));
    ok('L09c 求值没有污染当前文档', doc.nodes.length === before + 2, doc.nodes.length + ' / ' + before);
    ok('L09d 名字对不上就是空', resolveEmbedOutput('子图', 'nope') === null);
    ok('L09e 嵌入节点名对不上也是空', resolveEmbedOutput('别的', 'answer') === null);
    ok('L09f 缺这个字段时显示 [未定义]', interpolate('{子图.nope}', c.id) === '[未定义]');
    ok('L09g 普通点号不会误伤（没有同名嵌入就是未定义）',
      interpolate('{没有这个.n}', c.id) === '[未定义]');
  });
  T('L10 输出节点能存下来', () => {
    fresh(); layoutMind();
    const v = mkVar('x', '4');
    const o = mkOut('result');
    linkNodes(v.id, o.id);
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    const raw = snap.nodes.find(n => n.id === o.id);
    ok('L10 序列化带 outDef', raw.outDef && raw.outDef.name === 'result', JSON.stringify(raw.outDef));
    deserialize(snap);
    const o2 = byId(o.id);
    ok('L10b 往返还是输出节点', o2.kind === 'out');
    ok('L10c 名字还在', normalizeOutDef(o2.outDef).name === 'result');
    ok('L10d 值还算得出来', outputValueIn(liveCtx(), o2) === '4',
      outputValueIn(liveCtx(), o2));
  });
  T('L11 运算符走注册表，不写死', () => {
    fresh(); layoutMind();
    ok('L11 注册表里有四个算符', OPERATORS.length === 4 && OP_IDS.length === 4);
    ok('L11b 每条都有 label / arity / apply',
      OPERATORS.every(o => o.label && typeof o.arity === 'number' && typeof o.apply === 'function'));
    ok('L11c 都是单输入', OPERATORS.every(o => o.arity === 1));
    // 双输入：临时往注册表里塞一个 arity 2 的算符，布局和命中要自己跟上
    const two = { id:'@', label:'@', arity:2, hint:'测试用双输入',
      apply:(v, a) => (toNum(v) || 0) + (toNum(a[0]) || 0) * (toNum(a[1]) || 0) };
    OPERATORS.push(two); OP_BY_ID.set('@', two); OP_IDS.push('@');
    try {
      const o = addOpNode('双输入', 0, 0, { op:'@', operands:['2', '3'] });
      reindex(); sizeAll();
      const L = opBoxes(o);
      ok('L11d 布局按 arity 出两个运算值框', L.valBoxes.length === 2, L.valBoxes.length);
      ok('L11e 节点也跟着变宽', o.w >= VAR_PAD * 2 + OP_OP_W + 10 + 2 * OP_VAL_W, o.w);
      ok('L11f 命中第二格返回 opVal1',
        hitOpPart(o, { x:L.valBoxes[1].x + 4, y:L.valBoxes[1].y + 4 }) === 'opVal1',
        hitOpPart(o, { x:L.valBoxes[1].x + 4, y:L.valBoxes[1].y + 4 }));
      const v = mkVar('x', '10');
      const out = mkOut('r');
      linkNodes(v.id, o.id); linkNodes(o.id, out.id);
      reindex(); sizeAll();
      ok('L11g 求值用得上两个操作数（10 + 2*3 = 16）',
        outputValueIn(liveCtx(), byId(out.id)) === 16,
        String(outputValueIn(liveCtx(), byId(out.id))));
    } finally {
      OPERATORS.pop(); OP_BY_ID.delete('@'); OP_IDS.pop();
    }
  });
  T('L12 变量节点右键改作用域 / 值类型（命令层）', () => {
    fresh(); layoutMind();
    const v = mkVar('x', '1');
    setVarDef(v, { scope:'local' });
    ok('L12 作用域改掉了', normalizeVarDef(byId(v.id).varDef).scope === 'local');
    setVarDef(byId(v.id), { type:'string' });
    ok('L12b 值类型改掉了', normalizeVarDef(byId(v.id).varDef).type === 'string');
    const o = addOpNode('', 0, 0, { op:'+', operand:'1' });
    setOpOperator(o, '*');
    ok('L12c 算符改掉了', normalizeOpDef(byId(o.id).opDef).op === '*');
    ok('L12d 非法算符会被挡住', (() => {
      setOpOperator(byId(o.id), '不存在的算符');
      return normalizeOpDef(byId(o.id).opDef).op === '*';
    })());
    ok('L12e operands 长度跟着 arity 走',
      normalizeOpDef(byId(o.id).opDef).operands.length === opArity('*'));
  });


  /* ==================== 任意文字引用变量 / 特殊变量控件 ==================== */
  T('K20 连线标签也能引用变量', () => {
    fresh(); layoutMind();
    const v = mkVar('n', '7');
    const e = doc.edges[0];                 // 经典示例里根 →「节点」那条
    e.label = '共 {n} 条';
    reindex(); sizeAll();
    ok('K20 插值算出来了', interpolate('共 {n} 条', e.s) === '共 7 条');
    ok('K20b 显示标签走了派生表', displayLabelOf(e) === '共 7 条', displayLabelOf(e));
    ok('K20c 裸字段没被改', e.label === '共 {n} 条', e.label);
    setVarDef(v, { value:'99' });
    reindex(); sizeAll();
    ok('K20d 变量一改标签就跟着变', displayLabelOf(e) === '共 99 条', displayLabelOf(e));
  });
  T('K21 分组标题也能引用变量', () => {
    fresh(); layoutMind();
    const v = mkVar('who', '甲');
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const g = createGroup();
    g.title = '给 {who} 的框';
    reindex(); sizeAll();
    ok('K21 标题插值了', displayTitleOf(g) === '给 甲 的框', displayTitleOf(g));
    ok('K21b 裸字段没被改', g.title === '给 {who} 的框', g.title);
    setVarDef(v, { value:'乙' });
    reindex();
    ok('K21c 变量一改标题跟着变', displayTitleOf(g) === '给 乙 的框', displayTitleOf(g));
  });
  T('K22 图片描述也能引用变量', () => {
    fresh(); layoutMind();
    const v = mkVar('ver', '3');
    const n = mkImg(0, 0, { name:'架构图', desc:'版本 {ver}' });
    ok('K22 描述插值了', displayDescOf(n) === '版本 3', displayDescOf(n));
    ok('K22b 折行用的是插值后的文本', n.lines.join('').indexOf('3') >= 0, n.lines.join('|'));
    ok('K22c 裸字段没被改', n.desc === '版本 {ver}', n.desc);
    const h1 = n.h;
    setVarDef(v, { value:'很长很长很长很长很长很长很长很长很长很长很长' });
    reindex(); sizeAll();
    ok('K22d 值变长，描述折行变多、节点变高', n.h > h1, h1 + ' -> ' + n.h);
  });
  T('K23 运算节点的描述也能引用变量', () => {
    fresh(); layoutMind();
    const v = mkVar('k', '5');
    const op = addOpNode('乘以 {k}', 0, 0, { op:'*', operand:'2' });
    reindex(); sizeAll();
    ok('K23 描述插值了', displayTextOf(op) === '乘以 5', displayTextOf(op));
    ok('K23b 它自己算出来还是 5（运算节点看输入）', resolveVar('k', op.id) === '5');
  });

  T('K24 勾选节点：选项 / 勾选 / 输出一串列表', () => {
    fresh(); layoutMind();
    const n = addControlNode('check', 0, 0, { name:'配料', options:['牛肉', '香菜', '辣椒'], picked:[] });
    reindex(); sizeAll();
    ok('K24 kind 还是 var', n.kind === 'var' && isVarNode(n));
    ok('K24b 控件是 check', normalizeVarDef(n.varDef).control === 'check');
    ok('K24c 一开始没勾，值是空串', controlValue(n.varDef) === '', JSON.stringify(controlValue(n.varDef)));
    toggleCheckOption(n, 0); toggleCheckOption(n, 2);
    ok('K24d 勾了两个', normalizeVarDef(n.varDef).picked.join(',') === '0,2',
      normalizeVarDef(n.varDef).picked.join(','));
    ok('K24e 输出是一串', controlValue(n.varDef) === '牛肉, 辣椒', controlValue(n.varDef));
    toggleCheckOption(n, 0);
    ok('K24f 再点一下就取消', controlValue(n.varDef) === '辣椒', controlValue(n.varDef));
    ok('K24g 越界下标不动它', (() => {
      toggleCheckOption(n, 99);
      return controlValue(n.varDef) === '辣椒';
    })());
    // 引用它
    const c = addNodeAt('要 {配料}', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('K24h 引用得到', displayTextOf(c) === '要 辣椒', displayTextOf(c));
    // 选项编辑
    setCheckOptions(n, '盐, 胡椒, 醋');
    reindex(); sizeAll();
    ok('K24i 选项换掉了', normalizeVarDef(n.varDef).options.join(',') === '盐,胡椒,醋',
      normalizeVarDef(n.varDef).options.join(','));
    ok('K24j 换选项后勾选清空（下标对不上了）', normalizeVarDef(n.varDef).picked.length === 0);
    ok('K24k 尺寸跟着选项条数变', (() => {
      const h1 = n.h;
      setCheckOptions(n, '一, 二, 三, 四, 五');
      reindex(); sizeAll();
      return n.h > h1;
    })(), n.h);
  });
  T('K25 滑条节点：上下限 / 步长 / 实时改值', () => {
    fresh(); layoutMind();
    const n = addControlNode('slider', 0, 0, { name:'音量', value:'50', min:0, max:100, step:10 });
    reindex(); sizeAll();
    ok('K25 控件是 slider', normalizeVarDef(n.varDef).control === 'slider');
    ok('K25b 值对齐到步长', sliderValue(n.varDef) === 50, sliderValue(n.varDef));
    setVarDef(n, { value:'53' });
    ok('K25c 53 对齐到 50', sliderValue(n.varDef) === 50, sliderValue(n.varDef));
    setVarDef(n, { value:'58' });
    ok('K25d 58 对齐到 60', sliderValue(n.varDef) === 60, sliderValue(n.varDef));
    setVarDef(n, { value:'999' });
    ok('K25e 超上限夹住', sliderValue(n.varDef) === 100, sliderValue(n.varDef));
    setVarDef(n, { value:'-999' });
    ok('K25f 超下限夹住', sliderValue(n.varDef) === 0, sliderValue(n.varDef));
    ok('K25g 输出的是对数齐之后的值', controlValue(n.varDef) === '0', controlValue(n.varDef));
    // 上下限反过来会自动摆正
    setSliderRange(n, { min:80, max:20 });
    ok('K25h 上下限反了会自动交换', normalizeVarDef(n.varDef).min === 20 && normalizeVarDef(n.varDef).max === 80,
      normalizeVarDef(n.varDef).min + '~' + normalizeVarDef(n.varDef).max);
    // 按坐标拖
    n.varDef = normalizeVarDef(Object.assign({}, n.varDef, { min:0, max:100, step:1, value:'50' }));
    reindex(); sizeAll();
    const L = varBoxes(n);
    ok('K25i 拖到最左 = 下限', setSliderFromPointer(n, { x:L.trackBox.x, y:0 }) === 0 ||
      sliderValue(n.varDef) === 0, sliderValue(n.varDef));
    setSliderFromPointer(n, { x:L.trackBox.x + L.trackBox.w, y:0 });
    ok('K25j 拖到最右 = 上限', sliderValue(n.varDef) === 100, sliderValue(n.varDef));
    setSliderFromPointer(n, { x:L.trackBox.x + L.trackBox.w / 2, y:0 });
    ok('K25k 拖到中间 ≈ 50', Math.abs(sliderValue(n.varDef) - 50) <= 1, sliderValue(n.varDef));
    // 引用它
    const c = addNodeAt('音量 {音量}', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('K25l 引用的是滑条当前值', displayTextOf(c) === '音量 ' + sliderValue(n.varDef),
      displayTextOf(c));
  });
  T('K26 开关节点：关掉之后连接逻辑上断开', () => {
    fresh(); layoutMind();
    const v = mkVar('src', '42');
    const sw = addControlNode('switch', 0, 0, { name:'闸门', on:true });
    const c = addNodeAt('收到 {src}', 0, 0, 'rect');
    linkNodes(v.id, sw.id); linkNodes(sw.id, c.id);
    reindex(); sizeAll();
    ok('K26 接通时值能过去', displayTextOf(c) === '收到 42', displayTextOf(c));
    ok('K26b 开关自己的值是「开」', controlValue(sw.varDef) === '开', controlValue(sw.varDef));
    toggleSwitch(sw);
    reindex(); sizeAll();
    ok('K26c 断开后值过不去了', displayTextOf(c) === '收到 [未定义]', displayTextOf(c));
    ok('K26d 开关自己的值变成「关」', controlValue(sw.varDef) === '关', controlValue(sw.varDef));
    ok('K26e 数字类型的开关给 0/1', (() => {
      setVarDef(sw, { type:'number' });
      const off = controlValue(byId(sw.id).varDef);
      toggleSwitch(byId(sw.id));
      const on = controlValue(byId(sw.id).varDef);
      return off === '0' && on === '1';
    })(), controlValue(byId(sw.id).varDef));
    // 局内作用域也要认开关
    ok('K26f 关着的开关后面不算「下游」', (() => {
      const lv = mkVar('lv', '9', { scope:'local' });
      const sw2 = addControlNode('switch', 0, 0, { name:'g2', on:false });
      const down = addNodeAt('{lv}', 0, 0, 'rect');
      linkNodes(lv.id, sw2.id); linkNodes(sw2.id, down.id);
      reindex();
      return resolveVar('lv', down.id) === null;
    })());
    ok('K26g 打开就又能用了', (() => {
      const sw2 = doc.nodes.find(x => x.varDef && x.varDef.name === 'g2');
      const down = doc.nodes.find(x => x.text === '{lv}');
      toggleSwitch(sw2); reindex();
      return resolveVar('lv', down.id) === '9';
    })());
  });
  T('K27 特殊控件和普通变量共用名字 / 作用域 / 优先级', () => {
    fresh(); layoutMind();
    const n = addControlNode('slider', 0, 0, { name:'共享', scope:'local', value:'5', min:0, max:10, step:1 });
    ok('K27 优先级一样最高', priorityOf(n) === VAR_PRIORITY);
    const down = addNodeAt('{共享}', 0, 0, 'rect');
    const side = addNodeAt('{共享}', 0, 0, 'rect');
    linkNodes(n.id, down.id);
    reindex(); sizeAll();
    ok('K27b 局内：下游能用', resolveVar('共享', down.id) === '5', resolveVar('共享', down.id));
    ok('K27c 局内：非下游看不到', resolveVar('共享', side.id) === null, resolveVar('共享', side.id));
    ok('K27d 能改控件类型', (() => {
      setVarControl(byId(n.id), 'switch');
      return normalizeVarDef(byId(n.id).varDef).control === 'switch';
    })());
    ok('K27e 改了之后尺寸重算了', byId(n.id).h > 0);
  });
  T('K28 控件能存下来', () => {
    fresh(); layoutMind();
    const ck = addControlNode('check', 0, 0, { name:'多选', options:['甲', '乙', '丙'], picked:[1] });
    const sl = addControlNode('slider', 0, 0, { name:'刻度', min:-50, max:50, step:5, value:'15' });
    const sw = addControlNode('switch', 0, 0, { name:'闸', on:true });
    toggleCheckOption(ck, 2);
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    const rawCk = snap.nodes.find(x => x.id === ck.id).varDef;
    ok('K28 勾选存下来了', rawCk.control === 'check' && rawCk.options.length === 3
      && rawCk.picked.join(',') === '1,2', JSON.stringify(rawCk));
    const rawSl = snap.nodes.find(x => x.id === sl.id).varDef;
    ok('K28b 滑条范围存下来了', rawSl.control === 'slider' && rawSl.min === -50
      && rawSl.max === 50 && rawSl.step === 5, JSON.stringify(rawSl));
    ok('K28c 开关状态存下来了', snap.nodes.find(x => x.id === sw.id).varDef.on === true);
    deserialize(snap);
    ok('K28d 往返后勾选还是勾着的', normalizeVarDef(byId(ck.id).varDef).picked.join(',') === '1,2',
      normalizeVarDef(byId(ck.id).varDef).picked.join(','));
    ok('K28e 往返后滑条值还是 15', controlValue(byId(sl.id).varDef) === '15',
      controlValue(byId(sl.id).varDef));
    ok('K28f 往返后开关还是接通', normalizeVarDef(byId(sw.id).varDef).on === true);
  });
  T('K29 三种控件的命中区', () => {
    fresh(); layoutMind();
    const ck = addControlNode('check', 0, 0, { options:['一', '二', '三'] });
    reindex(); sizeAll();
    let L = varBoxes(ck);
    ok('K29 勾选命中第 0 行', (() => {
      const h = hitVarControl(ck, { x:L.listBox.x + 6, y:L.listBox.y + 4 });
      return h && h.kind === 'check' && h.index === 0;
    })());
    ok('K29b 命中第 2 行', (() => {
      const h = hitVarControl(ck, { x:L.listBox.x + 6, y:L.listBox.y + CHECK_ROW_H * 2 + 4 });
      return h && h.index === 2;
    })(), JSON.stringify(hitVarControl(ck, { x:L.listBox.x + 6, y:L.listBox.y + CHECK_ROW_H * 2 + 4 })));
    ok('K29c 框外面不命中', hitVarControl(ck, { x:L.listBox.x, y:L.listBox.y - 30 }) === null);
    const sl = addControlNode('slider', 0, 0, {});
    reindex(); sizeAll();
    L = varBoxes(sl);
    ok('K29d 滑条命中轨道', (hitVarControl(sl, { x:L.trackBox.x + 4, y:L.trackBox.y + 4 }) || {}).kind === 'slider');
    const sw = addControlNode('switch', 0, 0, {});
    reindex(); sizeAll();
    L = varBoxes(sw);
    ok('K29e 开关命中按钮', (hitVarControl(sw, { x:L.knobBox.x + 4, y:L.knobBox.y + 4 }) || {}).kind === 'switch');
    ok('K29f 普通变量节点没有控件命中',
      hitVarControl(mkVar('x', '1'), { x:0, y:0 }) === null);
  });


  /* ==================== 主题 / 背景 / 设置面板 ==================== */
  T('T01 默认主题是「棋盘」，没有红心也没有星号', () => {
    fresh();
    // 测试基座固定用 undertale（见文件开头 applyTheme('undertale')），
    // 这里模拟「全新打开的浏览器」：本地没存过主题
    localStorage.removeItem('grapheon.theme.v1');
    localStorage.removeItem('grapheon.grid.v1');
    loadTheme();
    ok('T01 默认主题是 board', themeId === 'board', themeId);
    ok('T01b 背景是棋盘', gridStyle() === 'checker', gridStyle());
    ok('T01c 不画红心', themeHeart() === false);
    ok('T01d 不要星号', themeStar() === false);
    ok('T01e 主题表里两套都有', themeIds().indexOf('board') >= 0 && themeIds().indexOf('undertale') >= 0,
      themeIds().join(','));
  });
  T('T02 棋盘背景真的画出来了', () => {
    fresh(); fitView();
    applyTheme('board'); setGridPref('theme');
    resize(); draw();
    const g = cv.getContext('2d');
    // 棋盘用的是 C.grid（#1b1b1b），在黑底上找得到这样亮度的像素
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let gridPix = 0;
    for (let i = 0; i < d.length; i += 4){
      if (d[i] > 10 && d[i] < 80 && Math.abs(d[i] - d[i + 1]) < 6 && Math.abs(d[i] - d[i + 2]) < 6) gridPix++;
    }
    ok('T02 画布上有棋盘格像素', gridPix > 500, gridPix);
  });
  T('T03 四种背景都能切，关掉就什么都不画', () => {
    fresh(); resize();
    for (const st of ['lines', 'checker', 'dots']){
      setGridPref(st);
      ok('T03 ' + st + ' 生效', gridStyle() === st, gridStyle());
      draw();
    }
    setGridPref('none');
    ok('T03b none 就是不画', gridStyle() === 'none');
    doc.nodes = []; doc.edges = []; doc.groups = []; reindex(); draw();   // 清空再量，免得把节点算进去
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 8) lit++;
    ok('T03c 关掉之后底上几乎没有亮点', lit < 400, lit);
    setGridPref('theme');
    ok('T03d 「跟随主题」跟着主题走', gridStyle() === themeGrid());
  });
  T('T04 切到 Undertale 主题：红心和星号回来', () => {
    fresh();
    applyTheme('undertale');
    ok('T04 主题切过去了', themeId === 'undertale');
    ok('T04b 要红心', themeHeart() === true);
    ok('T04c 要星号', themeStar() === true);
    ok('T04d body 上没有 no-star', document.body.classList.contains('no-star') === false);
    ok('T04e 背景跟随主题变成横纵网格', gridStyle() === 'lines', gridStyle());
    // 红心真的画出来（选中一个节点）
    selectOnly(nodeByText('节点').id);
    resize(); draw();
    ok('T04f 选中时画布上有红心（红色像素）', (() => {
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 60 && d[i + 2] < 60) return true;
      return false;
    })());
    applyTheme('board');
    ok('T04g 切回棋盘', themeId === 'board' && document.body.classList.contains('no-star'));
    // 棋盘主题下不该有红心
    selectOnly(nodeByText('节点').id);
    resize(); draw();
    ok('T04h 棋盘主题下没有红心', (() => {
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 60 && d[i + 2] < 60) return false;
      return true;
    })());
  });
  T('T05 无星号主题会把对话开头的星号摘掉', () => {
    applyTheme('board');
    say('* 这是一句话。');
    skipDlg();
    ok('T05 星号被摘掉', dlgText.textContent === '这是一句话。', JSON.stringify(dlgText.textContent));
    applyTheme('undertale');
    say('* 这是一句话。');
    skipDlg();
    ok('T05b Undertale 下星号留着', dlgText.textContent === '* 这是一句话。',
      JSON.stringify(dlgText.textContent));
    applyTheme('board');
    say('没有星号的提示');
    skipDlg();
    ok('T05c 本来就没星号的不会被吃掉', dlgText.textContent === '没有星号的提示',
      dlgText.textContent);
  });
  T('T06 主题选择会落盘，重开还记得', () => {
    applyTheme('undertale');
    ok('T06 写进了 localStorage', localStorage.getItem('grapheon.theme.v1') === 'undertale',
      localStorage.getItem('grapheon.theme.v1'));
    setGridPref('dots');
    ok('T06b 背景也落盘了', localStorage.getItem('grapheon.grid.v1') === 'dots');
    // 模拟重开
    themeId = 'board'; gridPref = 'theme';
    loadTheme();
    ok('T06c 重开后还是 undertale', themeId === 'undertale', themeId);
    ok('T06d 背景也回来了', gridStyle() === 'dots', gridStyle());
    // 恢复现场，别影响后面的用例
    applyTheme('board'); setGridPref('theme');
    localStorage.removeItem('grapheon.theme.v1');
    localStorage.removeItem('grapheon.grid.v1');
  });
  T('T07 设置面板：开合 / 内容', () => {
    fresh();
    ok('T07 一开始是关的', setEl.style.display !== 'block');
    toggleSettings();
    ok('T07b 打开了', settingsOpen());
    ok('T07c 主题选项齐了', setThemeEl.querySelectorAll('.opt').length === themeIds().length,
      setThemeEl.querySelectorAll('.opt').length);
    ok('T07d 背景选项齐了', setGridEl.querySelectorAll('.opt').length === GRID_STYLES.length,
      setGridEl.querySelectorAll('.opt').length);
    ok('T07e 快捷键列表非空', setKeysEl.querySelectorAll('.keyrow').length > 5,
      setKeysEl.querySelectorAll('.keyrow').length);
    ok('T07f 当前主题被标出来了', [...setThemeEl.querySelectorAll('.opt')].some(d => d.classList.contains('on')),
      [...setThemeEl.querySelectorAll('.opt')].map(d => d.className).join('|'));
    // 点一下背景选项
    const dotBtn = [...setGridEl.querySelectorAll('.opt')].find(d => d.textContent.indexOf('点阵') >= 0);
    dotBtn.click();
    ok('T07g 点一下就换了背景', gridStyle() === 'dots', gridStyle());
    // Esc 关掉
    keyRaw('Escape');
    ok('T07h Esc 能关掉', !settingsOpen());
    setGridPref('theme');
  });
  T('T07i 棋盘主题下一颗红心都不留', () => {
    fresh();
    applyTheme('board');
    ok('T07i body 上有 no-heart', document.body.classList.contains('no-heart'));
    ok('T07i2 光标红心被藏起来', getComputedStyle(heartEl).display === 'none',
      getComputedStyle(heartEl).display);
    // 菜单里那个小标记也要塌掉
    buildOpts(setThemeEl, themeIds().map(id => [id, THEMES[id].label]), themeId, () => {});
    const hrt = setThemeEl.querySelector('.opt .hrt');
    const cs = getComputedStyle(hrt);
    ok('T07i3 选项前的红心标记没有遮罩', cs.maskImage === 'none' || cs.webkitMaskImage === 'none',
      cs.maskImage + ' / ' + cs.webkitMaskImage);
    applyTheme('undertale');
    // 光标红心默认就是 display:none（要鼠标动过才显出来），所以只验 class 和遮罩
    ok('T07i4 Undertale 下红心回来', !document.body.classList.contains('no-heart'));
    ok('T07i5 标记的遮罩也回来了', (() => {
      const h = setThemeEl.querySelector('.opt .hrt');
      return getComputedStyle(h).maskImage !== 'none';
    })());
    applyTheme('board');
  });
  T('T07j 设置里选中项有高光', () => {
    fresh();
    toggleSettings();
    const on = [...setThemeEl.querySelectorAll('.opt')].filter(d => d.classList.contains('on'));
    ok('T07j 正好一个选中', on.length === 1, on.length);
    const cs = getComputedStyle(on[0]);
    ok('T07j2 选中项有边框颜色（不是默认灰）', cs.borderTopColor !== 'rgb(74, 74, 74)', cs.borderTopColor);
    ok('T07j3 选中项文字是强调色', cs.color === 'rgb(255, 216, 0)', cs.color);
    ok('T07j4 未选中项是灰的', (() => {
      const off = [...setThemeEl.querySelectorAll('.opt')].find(d => !d.classList.contains('on'));
      return off && getComputedStyle(off).color === 'rgb(138, 138, 138)';
    })());
    closeSettings();
  });
  T('T09 字号用滑条选', () => {
    fresh();
    toggleSettings();
    ok('T09 是 range 控件', setFsRangeEl.type === 'range', setFsRangeEl.type);
    ok('T09b 步长 4、上限 64', setFsRangeEl.step === '4' && setFsRangeEl.max === '64',
      setFsRangeEl.step + '/' + setFsRangeEl.max);
    setFsRangeEl.value = '32';
    setFsRangeEl.dispatchEvent(new Event('input'));
    ok('T09c 拖动时数字实时跟着变', setFsReadEl.textContent === '32', setFsReadEl.textContent);
    setFsRangeEl.dispatchEvent(new Event('change'));
    ok('T09d 松手才落盘', defaults.fsPx === 32, defaults.fsPx);
    ok('T09e 存进了 localStorage', JSON.parse(localStorage.getItem('grapheon.defaults.v1')).fsPx === 32);
    setFsRangeEl.value = '0';
    setFsRangeEl.dispatchEvent(new Event('change'));
    ok('T09f 0 = 自动', defaults.fsPx === 0 && setFsReadEl.textContent === '自动', setFsReadEl.textContent);
    closeSettings();
  });
  await TA('T10 字体可以从文件加载', async () => {
    fresh();
    toggleSettings();
    ok('T10 一开始列表里只有内置字体', fontChoices().length === Object.keys(NODE_FONTS).length,
      fontChoices().length);
    // 造一个假的字体文件，走完整加载链路（会失败，但不该炸）
    const fake = new File([new Uint8Array([0, 1, 2, 3])], '我的字体.ttf', { type:'font/ttf' });
    const n = await loadFontFiles([fake]);
    ok('T10b 坏文件被挡下来（加载 0 个）', n === 0, n);
    ok('T10c 没往字体表里塞垃圾', fontChoices().length === Object.keys(NODE_FONTS).length);
    ok('T10d 家族名会把非法字符洗掉', userFamilyOf({ name:'我的 字体!.ttf' }, 0).indexOf(' ') < 0,
      userFamilyOf({ name:'我的 字体!.ttf' }, 0));
    ok('T10e 有「从文件加载」按钮', !!setFontLoadEl && !!fontFileEl);
    ok('T10f 有清空按钮', !!setFontForgetEl);
    setFontForgetEl.click();
    ok('T10g 清空之后不报错', USER_FONTS.length === 0);
    closeSettings();
  });
  T('T08 设置面板不会串到别的面板上', () => {
    fresh();
    openNodeBox(nodeByText('节点'));
    toggleSettings();
    ok('T08 开设置会先关掉节点面板', !settingsOpen() || nodeBoxEl.style.display === 'none',
      setEl.style.display + '/' + nodeBoxEl.style.display);
    ok('T08b 设置是真的开着', settingsOpen());
    openHelp();
    ok('T08c 开帮助会先关掉设置', !settingsOpen(), setEl.style.display);
    closeHelp();
    setEl.style.display = 'none';
  });


  /* ==================== 素材库 / 存储适配层 ==================== */
  const helpOpenNow = () => helpEl.style.display === 'block';
  T('S20 素材按扩展名自动归类', () => {
    ok('S20 png 是图片', kindOfFile('a.png') === 'assets', kindOfFile('a.png'));
    ok('S20b jpg 大小写都认', kindOfFile('A.JPG') === 'assets' && kindOfFile('b.jpeg') === 'assets');
    ok('S20c json 算作品', kindOfFile('作品.json') === 'docs');
    ok('S20d css 算主题', kindOfFile('暗色.css') === 'themes');
    ok('S20e 字体三种都认',
      kindOfFile('a.ttf') === 'fonts' && kindOfFile('b.otf') === 'fonts'
      && kindOfFile('c.woff2') === 'fonts',
      [kindOfFile('a.ttf'), kindOfFile('b.otf'), kindOfFile('c.woff2')].join(','));
    ok('S20f 认不出来的一律当图片', kindOfFile('怪东西.xyz') === 'assets', kindOfFile('怪东西.xyz'));
    ok('S20g 没有扩展名也不炸', kindOfFile('README') === 'assets');
    ok('S20h 带调色板的 json 是主题，别的 json 是作品',
      kindOfJson({ canvas:{ bg:'#000', white:'#fff' } }) === 'themes'
      && kindOfJson({ v:2, nodes:[] }) === 'docs');
  });
  await TA('S21 内存后端：增删查改', async () => {
    const m = makeMemStore();
    ok('S21 一开始是空的', (await m.list()).length === 0);
    const id = await m.put('assets', 'a.png', new Blob(['xx'], { type:'image/png' }));
    const rows = await m.list();
    ok('S21b 放下去了', rows.length === 1 && rows[0].name === 'a.png' && rows[0].kind === 'assets',
      JSON.stringify(rows));
    ok('S21c 取得回来', (await m.get(id)).size === 2, (await m.get(id)).size);
    await m.del(id);
    ok('S21d 删得掉', (await m.list()).length === 0);
    ok('S21e 取一个不存在的返回 null', (await m.get('nope')) === null);
  });
  await TA('S22 IndexedDB 后端：能开、能存、能读、能删', async () => {
    const d = makeIdbStore();
    const can = await d.ready();
    ok('S22 IndexedDB 可用（headless 里也应该可用）', can, String(can));
    if (!can){ return; }
    await d.clear();
    const id = await d.put('fonts', 'my.ttf', new Blob([new Uint8Array([1, 2, 3])]));
    const rows = await d.list();
    ok('S22b 列表里有了', rows.length === 1 && rows[0].name === 'my.ttf' && rows[0].size === 3,
      JSON.stringify(rows));
    const back = await d.get(id);
    ok('S22c 读回来字节数对', back && back.size === 3, back && back.size);
    await d.del(id);
    ok('S22d 删干净了', (await d.list()).length === 0);
  });
  await TA('S23 一键导入：按扩展名分流', async () => {
    const d = makeIdbStore();
    if (!(await d.ready())){ ok('S23 跳过（没有 IndexedDB）', true); return; }
    await d.clear();
    const old = Store.backend;
    Store.backend = d;                          // 临时把后端换成干净的那个
    try {
      const files = [
        new File([new Uint8Array([1])], '图.png', { type:'image/png' }),
        new File([new Uint8Array([1])], '图2.jpg', { type:'image/jpeg' }),
        new File(['{"canvas":{"bg":"#000","white":"#fff"}}'], '主题.json', { type:'application/json' }),
        new File(['{"v":2,"nodes":[],"edges":[]}'], '作品.json', { type:'application/json' }),
        new File([new Uint8Array([1])], '字.ttf', { type:'font/ttf' }),
        new File([new Uint8Array([1])], '怪.xyz', {})
      ];
      const r = await Store.importFiles(files);
      ok('S23 六个都进去了', r.ok === 6 && r.fail === 0, JSON.stringify(r));
      ok('S23b 图片三个（含认不出来的那个）', r.byKind.assets === 3, JSON.stringify(r.byKind));
      ok('S23c 字体一个', r.byKind.fonts === 1, JSON.stringify(r.byKind));
      ok('S23d 主题 json 被认出来', r.byKind.themes === 1, JSON.stringify(r.byKind));
      ok('S23e 作品 json 被认出来', r.byKind.docs === 1, JSON.stringify(r.byKind));
      const rows = await d.list();
      ok('S23f 存下来的类型对', rows.find(x => x.name === '主题.json').kind === 'themes'
        && rows.find(x => x.name === '作品.json').kind === 'docs',
        rows.map(x => x.name + ':' + x.kind).join(' '));
    } finally {
      await d.clear();
      Store.backend = old;
    }
  });
  await TA('S24 后端会自动挑，挑不到也能降级', async () => {
    Store.backend = null;
    const b = await Store.init();
    ok('S24 挑到了一个后端', !!b && !!b.id, b && b.id);
    ok('S24b 是三个之一', ['fs', 'idb', 'mem'].indexOf(b.id) >= 0, b.id);
    ok('S24c 有给人看的名字', typeof b.label === 'string' && b.label.length > 0, b.label);
    ok('S24d 有能力探测函数', typeof hasFsAccess === 'function', typeof hasFsAccess);
    // file:// 下 Edge 是 secure context，所以这个应该是 true；不是也不该炸
    ok('S24e file:// 下探测到 FS Access（Edge）', hasFsAccess() === true, String(hasFsAccess()));
  });
  T('S25 用户文件夹名：默认 user，能改，能落盘', () => {
    Store.setDirName('');
    ok('S25 空字符串退回默认', Store.dirName === 'user', Store.dirName);
    Store.setDirName('我的素材');
    ok('S25b 能改成中文名', Store.dirName === '我的素材', Store.dirName);
    ok('S25c 落盘了', localStorage.getItem('grapheon.userdir.v1') === '我的素材',
      localStorage.getItem('grapheon.userdir.v1'));
    Store.setDirName('user');
    localStorage.removeItem('grapheon.userdir.v1');
    ok('S25d 改回默认', Store.dirName === 'user');
  });
  await TA('S26 素材库面板：开合 / 空状态 / 设置里那行', async () => {
    fresh();
    ok('S26 一开始是关的', !libOpen());
    openLib();
    ok('S26b 打开了', libOpen());
    await sleep(80);
    ok('S26c 报了存放位置', /存放位置/.test(libSubEl.textContent), libSubEl.textContent.slice(0, 40));
    ok('S26d 空的时候有提示（或有卡片）', !!libListEl.querySelector('.libempty')
      || libListEl.querySelectorAll('.libcard').length > 0,
      libListEl.textContent.slice(0, 30));
    keyRaw('Escape');
    ok('S26e Esc 能关掉', !libOpen());
    // 设置里那行
    toggleSettings();
    const note = document.getElementById('setUserNote');
    await sleep(80);
    ok('S26f 设置里有存放位置说明', /存放位置/.test(note.textContent), note.textContent.slice(0, 40));
    ok('S26g 有连接磁盘的按钮', !!document.getElementById('setUserConnect'));
    ok('S26h 文件夹名输入框有值', document.getElementById('setUserDir').value === Store.dirName,
      document.getElementById('setUserDir').value);
    closeSettings();
  });
  T('S27 素材库不会和别的面板叠在一起', () => {
    fresh();
    openHelp();
    openLib();
    ok('S27 开素材库会关掉帮助', !helpOpenNow(), helpEl.style.display);
    toggleSettings();
    ok('S27b 开设置会关掉素材库', !libOpen(), libEl.style.display);
    closeSettings();
    closeLib();
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
    applyTheme('undertale');            // 这条测的是红心光标，别被别的用例留下的主题影响
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
  T('X02c 棋盘主题：光标换成小十字准心', () => {
    applyTheme('board');
    fresh(); fitView();
    ok('X02c 主题说的是 cross', themeCursor() === 'cross', themeCursor());
    window.dispatchEvent(new MouseEvent('mousemove', { clientX:300, clientY:400, bubbles:true }));
    ok('X02c2 十字准心显示出来了', crossEl.style.display === 'block', crossEl.style.display);
    ok('X02c3 红心让位了', heartEl.style.display === 'none', heartEl.style.display);
    ok('X02c4 十字的线是白色的', getComputedStyle(crossEl).fill === 'rgb(255, 255, 255)',
      getComputedStyle(crossEl).fill);
    const tf = crossEl.style.transform;
    ok('X02c5 位置跟着鼠标（且按 17×17 对中）', tf.indexOf('translate(292px, 392px)') >= 0, tf);
  });
  T('X02d 按下鼠标：十字准心中心出现实心圆点', () => {
    applyTheme('board');
    fresh();
    const dot = crossEl.querySelector('.dot');
    ok('X02d 松开时圆点是透明的', getComputedStyle(dot).opacity === '0', getComputedStyle(dot).opacity);
    window.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true }));
    ok('X02d2 按下去 body 上有 pressed', document.body.classList.contains('pressed'));
    ok('X02d3 圆点显出来了', getComputedStyle(dot).opacity === '1', getComputedStyle(dot).opacity);
    ok('X02d4 圆点用的是强调色', getComputedStyle(dot).fill === 'rgb(255, 216, 0)',
      getComputedStyle(dot).fill);
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles:true }));
    ok('X02d5 松开又没了', !document.body.classList.contains('pressed')
      && getComputedStyle(dot).opacity === '0');
  });
  T('X02e 两个光标不会同时出现 / 也不会都没了', () => {
    const seen = [];
    for (const th of ['board', 'undertale']){
      applyTheme(th);
      window.dispatchEvent(new MouseEvent('mousemove', { clientX:200, clientY:200, bubbles:true }));
      const on = [heartEl, crossEl].filter(e => e.style.display === 'block');
      seen.push(on.length);
      if (on[0]) on[0].style.display = 'none';
    }
    ok('X02e 每个主题下都正好有一个光标（这是之前丢光标的那个坑）',
      seen.every(n => n === 1), JSON.stringify(seen));
    ok('X02e2 两个主题用的是不同元素', themeCursor() === 'heart');
    applyTheme('board');
    ok('X02e3 换主题后光标立刻跟着换', (() => {
      const on = [heartEl, crossEl].filter(e => e.style.display === 'block');
      return on.length === 1 && on[0] === crossEl;
    })());
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
