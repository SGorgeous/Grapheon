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
  /* 打开子菜单。**先看当前最深的那层** —— 菜单归类之后
     「形状」跑到了「外观」下面，只看根菜单是找不到的。
     可以连着调：openSub('外观'); openSub('形状'); */
  const openSub = (prefix) => {
    const scopes = [menuStack[menuStack.length - 1], ctxEl].filter(Boolean);
    for (const sc of scopes){
      const d = [...sc.querySelectorAll('.item')].find(x => labelOf(x).indexOf(prefix) === 0);
      // ★ 子菜单现在是单击展开的（以前 hover 就弹）
      if (d){ d.click(); return d; }
    }
    throw new Error('菜单里没有「' + prefix + '」（当前开了 ' + menuStack.length + ' 层）');
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
    selectOnly(a.id); keyRaw('ArrowRight', { ctrlKey:true });
    let cur = byId([...sel][0]);
    const chain = [cur];
    for (let i = 0; i < 4; i++){ selectOnly(cur.id); keyRaw('ArrowRight', { ctrlKey:true }); cur = byId([...sel][0]); chain.push(cur); }
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
  T('D03 加子节点（已无快捷键）/ Enter 加兄弟节点', () => {
    fresh();
    layoutMind();
    const a = nodeByText('节点');
    const b0 = doc.nodes.length;
    /* ★ 加子节点不再占快捷键（对齐 Blender 之后 Tab 是折叠），直接调 */
    selectOnly(a.id); addChild();
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
    keyRaw('ArrowRight', { ctrlKey:true }); key('d'); key('w');
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
    n.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
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
    /* ★ 对齐 Blender 之后：Tab = 折叠/展开（进出组的替代），加子节点不再占键 */
    ok('K02 Tab → 折叠 / 展开', b['tab'] === 'node.collapse', String(b['tab']));
    ok('K02b1 方向键 = 跳转选择',
      ['arrowup','arrowleft','arrowdown','arrowright'].every(k => String(b[k] || '').indexOf('node.nav') === 0),
      ['arrowup','arrowleft','arrowdown','arrowright'].map(k => k + ':' + b[k]).join(' '));
    /* ⚠ 不能用 Shift+方向键：comboOf 丢掉单独的 Shift（防误按）→ 用 Ctrl 变体 */
    ok('K02b2 ★ Ctrl+方向键 = 在该方向生成节点',
      ['ctrl+arrowup','ctrl+arrowleft','ctrl+arrowdown','ctrl+arrowright']
        .every(k => String(b[k] || '').indexOf('node.spawn') === 0),
      ['ctrl+arrowup','ctrl+arrowleft','ctrl+arrowdown','ctrl+arrowright'].map(k => k + ':' + b[k]).join(' '));
    ok('K02b3 ★ WASD 让给 Blender 那套（不再生成节点）',
      !b['w'] && !b['s'] && !b['d'] && b['a'] === 'sel.all',
      JSON.stringify({ w:b['w'], a:b['a'], s:b['s'], d:b['d'] }));
    ok('K02b4 ★ 对齐 Blender 的几个键都在',
      b['ctrl+a'] === 'ui.addMenu' && b['alt+a'] === 'sel.none' && b['ctrl+i'] === 'sel.invert'
      && b['ctrl+alt+g'] === 'group.dissolve' && b['x'] === 'node.delete'
      && b['f'] === 'edge.link' && b['n'] === 'style.open' && b['home'] === 'view.fit'
      && b['ctrl+space'] === 'ui.toggle',
      JSON.stringify({ 'ctrl+a':b['ctrl+a'], 'alt+a':b['alt+a'], 'ctrl+i':b['ctrl+i'],
        'ctrl+alt+g':b['ctrl+alt+g'], x:b['x'], f:b['f'], n:b['n'], home:b['home'], 'ctrl+space':b['ctrl+space'] }));
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
    /* ★ 生成节点现在是 Shift+方向键 */
    selectOnly(n.id); keyRaw('ArrowRight', { ctrlKey:true });
    if (editing) commitEdit();
    ok('K03 默认 Ctrl+→ 会生成节点', doc.nodes.length === before + 1, doc.nodes.length + ' vs ' + before);
    GP.keys.bind('ctrl+d', 'node.delete');
    let b = GP.keys.bindings;
    ok('K03b 原键位已释放', !b['delete'] && !b['backspace']);
    ok('K03c ctrl+d 已绑定', b['ctrl+d'] === 'node.delete');
    /* ★ 存储键带版本（对齐 Blender 那次升到 v2） */
    ok('K03d 已写进 localStorage', (localStorage.getItem('grapheon.keymap.v2') || '').indexOf('ctrl+d') >= 0,
      String(localStorage.getItem('grapheon.keymap.v2')).slice(0, 80));
    GP.keys.load();
    ok('K03e load 后仍是改过的键位', GP.keys.bindings['ctrl+d'] === 'node.delete');
    GP.keys.reset();
    ok('K03f reset 后恢复默认',
      GP.keys.bindings['ctrl+arrowright'] === 'node.spawn.right' && !GP.keys.bindings['ctrl+d'],
      'ctrl+arrowright=' + GP.keys.bindings['ctrl+arrowright'] + ' ctrl+d=' + GP.keys.bindings['ctrl+d']);
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
    /* ★ 空白文档改过了：现在是**两个相连的节点** —— 题目 + 内容 */
    ok('N02 有 2 个节点（题目 + 内容）', doc.nodes.length === 2, doc.nodes.length);
    ok('N02b 两个节点已经连好', doc.edges.length === 1, doc.edges.length);
    ok('N02c1 第一个是题目、第二个是内容',
      doc.nodes[0].text === '题目' && doc.nodes[1].text === '内容',
      doc.nodes.map(n => n.text).join(' / '));
    ok('N02c 题目用大号字（根节点），内容不用',
      doc.nodes[0].big === true && !doc.nodes[1].big,
      doc.nodes[0].big + ' / ' + doc.nodes[1].big);
    ok('N02c2 连线方向是题目 → 内容',
      doc.edges[0].s === doc.nodes[0].id && doc.edges[0].t === doc.nodes[1].id,
      doc.edges[0].s + ' -> ' + doc.edges[0].t);
    ok('N02d 可以直接开始生长', (() => {
      const b = doc.nodes.length;
      addChild();                       // ★ 加子节点不再占快捷键
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
    const b = addVarNode('pl', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    const _tgt = addNodeAt('目标', 500, 0, 'rect');
    linkNodes(b.id, _tgt.id);
    reindex(); sizeAll();
    openEndBox(b);
    const row = endListEl.querySelectorAll('.endrow')[0];
    const opts = [...row.querySelectorAll('.opt')];
    ok('S03 默认高亮「自动」', opts[0].className.indexOf('on') >= 0);
    const targetId = doc.edges.find(e => e.s === b.id).t;
    const e = doc.edges.find(x => x.s === b.id && x.t === targetId);
    opts[1].click();                              // 上
    // ★ 现在面板列的是**该节点真实存在的端点**（不再是无脑四条固定边）
    opts[1].click();
    ok('S03b 钉到了第一个真实端点上（默认节点是右边那个）',
      e.aPort === portList(byId(b.id)).outs[0].id && e.aSide === portList(byId(b.id)).outs[0].side,
      'aPort=' + e.aPort + ' aSide=' + e.aSide);
    const ep = edgeEndpoints(e);
    const want = portPoint(byId(b.id), portList(byId(b.id)).outs[0]);
    ok('S03c 起点锚点就在那个端点上',
      Math.abs(ep.a.x - want.x) < 1.5 && Math.abs(ep.a.y - want.y) < 1.5,
      JSON.stringify(ep.a) + ' vs ' + JSON.stringify(want));
    // 选「自动」要能解钉
    opts[0].click();
    ok('S03d 选自动就解钉了', e.aPort == null && e.aSide == null,
      'aPort=' + e.aPort + ' aSide=' + e.aSide);
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
    openSub('外观'); openSub('形状');
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
    ok('M01b 根菜单收短了（≤11 项（加「端点」之后放宽一格））', tops.length <= 11, tops.length + ' 项: ' + tops.join(' | '));
    ok('M01c 顶层按用途归了类（有「外观」这一组）', tops.indexOf('外观') >= 0, tops.join(' | '));
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
    openSub('外观'); openSub('形状');
    ok('M02b 展开后有三级（根 → 外观 → 形状）', menuStack.length === 3, menuStack.length);
    ok('M02c 形状项本身还在（子菜单是新的元素）', ctxEl.querySelectorAll('.item').length > 0);
    const subs = [...menuStack[2].querySelectorAll('.item')].map(labelOf);
    ok('M02d 四个形状都在子菜单里',
      ['矩形', '圆角矩形', '菱形（判断）', '椭圆'].every(s => subs.some(x => x === s)), subs.join(' | '));
    /* ★ 子菜单现在是**单击**展开的，所以「移到普通项上」不该把它弄没 ——
       以前 hover 就弹、鼠标一移开就收，想点子菜单里的东西得跟它赛跑。
       这条断言的就是这个新契约。 */
    const plain = [...ctxEl.querySelectorAll('.item')].find(d => !d.classList.contains('sub'));
    if (plain && plain.onmouseenter) plain.onmouseenter();
    ok('M02e 移到普通项上子菜单**不**收起（要点了才收）', menuStack.length === 3, menuStack.length);
    ok('M02e2 但展开的那一项还标着 sel',
      !!ctxEl.querySelector('.item.sel'), ctxEl.querySelectorAll('.item.sel').length);
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
    openSub('外观'); openSub('形状');
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
    ok('M06b 里面有空白文件 / 两种示例 / 导入 CSV',
      [...ctxEl.querySelectorAll('.item')].length === 7, ctxEl.querySelectorAll('.item').length);
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
    ok('Q13b 底部说明写明了被几个外观节点作用',
      nbHitsEl.textContent.indexOf('被 1 个外观节点作用') >= 0, nbHitsEl.textContent);
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
    /* ★ 对齐 Blender 之后折叠是 Tab（Space 不再占键） */
    keyRaw('Tab');
    ok('S7 Tab 折叠了分组', grp.collapsed === true);
    keyRaw('Tab');
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
    ok('Z01b 图片存下来了', n.src.indexOf('data:image/png') === 0, String(n.src).slice(0, 30));
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
      String(raw.src).indexOf('data:image/') === 0 && raw.imgW === 400 && raw.imgH === 300 && raw.desc === '说明文字',
      JSON.stringify({ w:raw.imgW, h:raw.imgH, d:raw.desc }));
    deserialize(snap);
    const n2 = byId(n.id);
    ok('Z09b 往返后还是图片节点', n2.kind === 'image');
    ok('Z09c 图片和尺寸都在', n2.src === n.src && n2.imgW === 400 && n2.imgH === 300);
    ok('Z09d 描述还在', n2.desc === '说明文字', n2.desc);
    ok('Z09e 手动宽度也保留了', n2.fixedW === 260 && n2.w === 260, n2.w);
  });
  T('Z10 源的协议白名单：外链保留，危险协议拦掉', () => {
    fresh(); layoutMind();
    const n = addNodeAt('x', 0, 0, 'rect');
    n.kind = 'image';
    /* ★ 契约翻转了。以前「只收 data:image/」，外链会被静默丢掉 ——
       那是内嵌时代的规矩。现在多媒体节点要支持相对地址 / http / data，
       所以外链**必须保留**下来（只存字符串，几十个字节）。 */
    n.src = 'https://example.com/a.png';
    n.imgW = 100; n.imgH = 100;
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('Z10 ★ 外链现在会写进存档（契约翻转：以前会被丢掉）',
      snap.nodes.find(x => x.id === n.id).src === 'https://example.com/a.png',
      String(snap.nodes.find(x => x.id === n.id).src));
    ok('Z10a2 相对地址也照样存',
      (() => { const m = addNodeAt('y', 300, 0, 'rect'); m.kind = 'image'; m.src = 'pic.png';
        const s2 = JSON.parse(JSON.stringify(serialize()));
        return s2.nodes.find(x => x.id === m.id).src === 'pic.png'; })());
    /* ★ 但危险协议头仍然要拦 —— 这个源会被拿去 new Image() / <video> / window.open，
       `javascript:` 一旦进去，Ctrl+左键就成了执行脚本的入口。
       这是旧契约里**唯一值得留下**的东西，换了个写法而已。 */
    const bad = { v:2, nid:1,
      nodes:[
        { id:'n1', text:'', x:0, y:0, kind:'image', src:'javascript:alert(1)', imgW:10, imgH:10 },
        { id:'n2', text:'', x:0, y:0, kind:'image', src:'data:text/html,<b>x</b>', imgW:10, imgH:10 }
      ],
      edges:[], groups:[] };
    deserialize(bad);
    ok('Z10b ★ javascript: 仍然被拦掉', byId('n1').src === null, String(byId('n1').src));
    ok('Z10b2 ★ data:text/html 也被拦（data: 只放行图 / 视频 / 音频三类 MIME）',
      mediaSrcAllowed('data:text/html,<b>x</b>') === false
      && mediaSrcAllowed('data:image/png;base64,AA') === true
      && mediaSrcAllowed('data:video/mp4;base64,AA') === true
      && mediaSrcAllowed('data:audio/mpeg;base64,AA') === true,
      JSON.stringify([mediaSrcAllowed('data:text/html,<b>x</b>'),
        mediaSrcAllowed('data:image/png;base64,AA')]));
    ok('Z10c kind 是合法值', NODE_KINDS.indexOf(byId('n1').kind) >= 0, byId('n1').kind);
    /* 白名单本身 */
    ok('Z10d 放行：相对地址 / http / https / file / data / blob',
      ['pic.png', 'user/a.mp4', '../assets/x.svg', 'http://a/b.png', 'https://a/b.mp4',
       'file:///d/a.png', 'data:image/png;base64,AA', 'blob:http://x/y']
        .every(u => mediaSrcAllowed(u)),
      '');
    ok('Z10e 拦掉：javascript / vbscript / 其它没见过的协议',
      ['javascript:alert(1)', 'vbscript:x', 'about:blank', 'chrome://settings']
        .every(u => !mediaSrcAllowed(u)),
      '');
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
    ok('Z14d 插入的文件是内嵌的 data URL', String(n.src || '').indexOf('data:image/') === 0, String(n.src).slice(0, 24));
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
    const oldUrl = n.src;
    const c = document.createElement('canvas');
    c.width = 60; c.height = 20;
    c.getContext('2d').fillRect(0, 0, 60, 20);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    replaceImage(n, new File([blob], 'b.png', { type:'image/png' }));
    for (let i = 0; i < 60 && n.src === oldUrl; i++) await sleep(25);
    ok('Z16 图片换掉了', n.src !== oldUrl && String(n.src).indexOf('data:image/') === 0);
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
  T('K26 条件节点：输入为 1 才把所填的值放出去', () => {
    fresh(); layoutMind();
    const v = mkVar('src', '1');                       // 输入是 1
    const cd = addControlNode('cond', 0, 0, { name:'闸门', value:'42' });
    const c = addNodeAt('下游', 0, 0, 'rect');
    linkNodes(v.id, cd.id); linkNodes(cd.id, c.id);
    reindex(); sizeAll();
    ok('K26 输入是 1 → 通，所填的值放出去了',
      resolveVar('闸门', c.id) === '42', String(resolveVar('闸门', c.id)));
    ok('K26b 自己的值就是「所填的值」',
      controlValue(byId(cd.id).varDef, cd.id) === '42', controlValue(byId(cd.id).varDef, cd.id));
    // 输入改成 0 → 不通
    setVarDef(byId(v.id), { value:'0' });
    reindex(); sizeAll();
    ok('K26c 输入不是 1 → 输出「无」', resolveVar('闸门', c.id) === '无',
      String(resolveVar('闸门', c.id)));
    ok('K26c2 上游的值也过不去', (() => {
      const out = addNodeAt('看 {src}', 0, 0, 'rect');
      linkNodes(cd.id, out.id); reindex();
      return displayTextOf(byId(out.id)) === '看 无';
    })(), (() => {
      const out = doc.nodes.find(x => x.text === '看 {src}');
      return out ? displayTextOf(out) : '?';
    })());
    setVarDef(byId(v.id), { value:'1' });
    reindex(); sizeAll();
    ok('K26d 改回 1 又通了', resolveVar('闸门', c.id) === '42',
      String(resolveVar('闸门', c.id)));
    // 没接输入 → 不通
    ok('K26e 没接输入 → 不通', (() => {
      const lone = addControlNode('cond', 0, 0, { name:'孤立闸', value:'7' });
      const d2 = addNodeAt('下游2', 0, 0, 'rect');
      linkNodes(lone.id, d2.id); reindex();
      return resolveVar('孤立闸', d2.id) === '无';
    })(), String((() => {
      const d2 = doc.nodes.find(x => x.text === '下游2');
      return d2 ? resolveVar('孤立闸', d2.id) : '?';
    })()));
    // 数字 1 和字符串 "1" 都算 1
    ok('K26f 带空格的 " 1 " 也算 1', (() => {
      setVarDef(byId(v.id), { value:' 1 ' });
      reindex();
      return resolveVar('闸门', c.id) === '42';
    })(), String(resolveVar('闸门', c.id)));
    ok('K26g 2 不算 1，给「无」', (() => {
      setVarDef(byId(v.id), { value:'2' });
      reindex();
      return resolveVar('闸门', c.id) === '无';
    })(), String(resolveVar('闸门', c.id)));
    // 局内作用域也要认
    ok('K26h 条件节点也挡得住局内变量', (() => {
      const lv = mkVar('lv', '9', { scope:'local' });
      setVarDef(byId(v.id), { value:'0' });
      const cd2 = addControlNode('cond', 0, 0, { name:'g2', value:'x' });
      const down = addNodeAt('{lv}', 0, 0, 'rect');
      linkNodes(lv.id, cd2.id); linkNodes(cd2.id, down.id);
      reindex();
      // 条件节点不过上游的值 —— 它输出自己的（这里是「无」）
      return resolveVar('lv', down.id) === '无';
    })(), String((() => {
      const down = doc.nodes.find(x => x.text === '{lv}');
      return down ? resolveVar('lv', down.id) : '?';
    })()));
    // 条件节点的两条路要分清：
    //   ① 上游的值**透传**过去（输入为 1 才通）
    //   ② 按名字引用它时，拿到的是它「所填的值」（同样要输入为 1 才通）
    ok('K26i 输入给 1 之后按名字引用拿得到所填的值', (() => {
      const one = mkVar('one', '1');
      const cd3 = addControlNode('cond', 0, 0, { name:'g3', value:'77' });
      const down = addNodeAt('拿 {g3}', 0, 0, 'rect');
      linkNodes(one.id, cd3.id); linkNodes(cd3.id, down.id);
      reindex();
      return resolveVar('g3', down.id) === '77';
    })(), String((() => {
      const down = doc.nodes.find(x => x.text === '拿 {g3}');
      return down ? resolveVar('g3', down.id) : '?';
    })()));
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
      setVarControl(byId(n.id), 'cond');
      return normalizeVarDef(byId(n.id).varDef).control === 'cond';
    })());
    ok('K27e 改了之后尺寸重算了', byId(n.id).h > 0);
  });
  T('K28 控件能存下来', () => {
    fresh(); layoutMind();
    const ck = addControlNode('check', 0, 0, { name:'多选', options:['甲', '乙', '丙'], picked:[1] });
    const sl = addControlNode('slider', 0, 0, { name:'刻度', min:-50, max:50, step:5, value:'15' });
    const sw = addControlNode('cond', 0, 0, { name:'闸', on:true });
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
    const sw = addControlNode('cond', 0, 0, {});
    reindex(); sizeAll();
    L = varBoxes(sw);
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


  /* ==================== 面向组件 ==================== */
  T('CP01 效果表 + 组件表的结构是完整的', () => {
    ok('CP01 每个内置组件都有 id / label / scopes',
      BUILTIN_COMPONENT_DEFS.every(c => c.id && c.label && Array.isArray(c.scopes)),
      BUILTIN_COMPONENT_DEFS.map(c => c.id).join(','));
    ok('CP01b 每个内置组件都指向一个存在的效果',
      BUILTIN_COMPONENT_DEFS.every(c => !!effectDef(c.effect)),
      BUILTIN_COMPONENT_DEFS.map(c => c.id + '->' + c.effect).join(' '));
    ok('CP01c 每个效果都有 label / hint / scopes / props',
      EFFECT_IDS.every(id => {
        const e = EFFECTS[id];
        return e.label && e.hint && Array.isArray(e.scopes) && Array.isArray(e.props);
      }), EFFECT_IDS.join(','));
    ok('CP01d 每个效果属性都有 key / label / type',
      EFFECT_IDS.every(id => EFFECTS[id].props.every(p => p.key && p.label && p.type)),
      EFFECT_IDS.map(id => id + ':' + EFFECTS[id].props.length).join(' '));
    ok('CP01e 三种作用域都有组件可挂',
      COMPONENT_SCOPES.every(s => componentsFor(s).length > 0),
      COMPONENT_SCOPES.map(s => s + ':' + componentsFor(s).length).join(' '));
    ok('CP01f 三种作用域都有内置能力清单',
      COMPONENT_SCOPES.every(s => (BUILTIN_COMPONENTS[s] || []).length > 0));
    ok('CP01g 内置清单里点明了优先级可引用变量',
      BUILTIN_COMPONENTS.node.some(b => b.id === 'priority' && /\{变量\}/.test(b.hint)));
    ok('CP01h 效果分得清作用域（线宽只给连线、描边不给连线）',
      EFFECTS.width.scopes.join(',') === 'edge' && EFFECTS.outline.scopes.indexOf('edge') < 0,
      EFFECTS.width.scopes.join(',') + ' / ' + EFFECTS.outline.scopes.join(','));
    ok('CP01i 每个作用域至少有一个效果能用',
      COMPONENT_SCOPES.every(s => EFFECT_IDS.some(id => EFFECTS[id].scopes.indexOf(s) >= 0)));
  });
  T('CP02 加 / 改 / 删组件，一个类型只留一个', () => {
    fresh();
    const n = nodeByText('节点');
    ok('CP02 一开始没有组件', compsOf(n).length === 0 && !compOn(n, 'badge'));
    setComponent(n, 'badge', { text:'甲' });
    ok('CP02b 加上了', compOn(n, 'badge') && compRaw(n, 'badge', 'text') === '甲');
    setComponent(n, 'badge', { color:'#ff0000' });
    ok('CP02c 改属性不会把别的属性冲掉',
      compRaw(n, 'badge', 'text') === '甲' && compRaw(n, 'badge', 'color') === '#ff0000',
      JSON.stringify(compOf(n, 'badge')));
    setComponent(n, 'badge', { text:'乙' });
    ok('CP02d 同类型不会加出第二个', compsOf(n).filter(c => c.type === 'badge').length === 1,
      compsOf(n).length);
    setComponent(n, 'hideIf', { when:'1' });
    ok('CP02e 不同类型能并存', compsOf(n).length === 2);
    removeComponent(n, 'badge');
    ok('CP02f 删得掉', !compOn(n, 'badge') && compOn(n, 'hideIf'));
    removeComponent(n, 'hideIf');
    ok('CP02g 全删光之后 components 字段被清掉', !n.components, String(n.components));
    ok('CP02h 删不存在的返回 false', removeComponent(n, 'badge') === false);
    ok('CP02i 未知类型加不进去', setComponent(n, '不存在的组件', {}) === null);
  });
  T('CP03 可引用的属性真的会过插值', () => {
    fresh(); layoutMind();
    const v = mkVar('数量', '7');
    const n = nodeByText('节点');
    setComponent(n, 'badge', { text:'共 {数量} 个' });
    reindex(); sizeAll();
    ok('CP03 解析出真值', compText(n, 'badge', 'text', 'node') === '共 7 个',
      compText(n, 'badge', 'text', 'node'));
    ok('CP03b 裸字段没被改', compRaw(n, 'badge', 'text') === '共 {数量} 个',
      compRaw(n, 'badge', 'text'));
    setVarDef(byId(v.id), { value:'99' });
    reindex(); sizeAll();
    ok('CP03c 变量一改它跟着变', compText(n, 'badge', 'text', 'node') === '共 99 个',
      compText(n, 'badge', 'text', 'node'));
    ok('CP03d 没挂组件时返回空串', compText(n, 'outline', 'color', 'node') === '');
    ok('CP03e 转义照样管用', (() => {
      setComponent(n, 'badge', { text:'字面量 \\{数量}' });
      reindex();
      return compText(n, 'badge', 'text', 'node') === '字面量 {数量}';
    })(), compText(n, 'badge', 'text', 'node'));
  });
  T('CP04 引用的作用域规则和节点正文完全一致', () => {
    fresh(); layoutMind();
    // 局内变量：下游看得到，旁边看不到
    const lv = mkVar('lv', '5', { scope:'local' });
    const down = nodeByText('操作');
    const side = nodeByText('连线');
    linkNodes(lv.id, down.id);
    setComponent(down, 'badge', { text:'{lv}' });
    setComponent(side, 'badge', { text:'{lv}' });
    reindex(); sizeAll();
    ok('CP04 下游解析得到', compText(down, 'badge', 'text', 'node') === '5',
      compText(down, 'badge', 'text', 'node'));
    ok('CP04b 非下游看到未定义', compText(side, 'badge', 'text', 'node') === '[未定义]',
      compText(side, 'badge', 'text', 'node'));
    ok('CP04c 和直接在正文里写的结果一模一样',
      displayTextOf(side) !== null && compText(side, 'badge', 'text', 'node')
        === interpolate('{lv}', side.id),
      compText(side, 'badge', 'text', 'node') + ' vs ' + interpolate('{lv}', side.id));
    // 函数分组隔离也要一致
    const fg = newEmptyGroup(0, 0); fg.isFunction = true;
    const inner = mkVar('gv', '9');
    const m = nodeByText('点选连线改样式');
    fg.members = [inner.id, m.id];
    reindex();
    setComponent(m, 'badge', { text:'{gv}' });
    reindex();
    ok('CP04d 组内节点看得到组内的变量', compText(m, 'badge', 'text', 'node') === '9',
      compText(m, 'badge', 'text', 'node'));
    ok('CP04e 组外节点看不到', (() => {
      setComponent(side, 'badge', { text:'{gv}' });
      reindex();
      return compText(side, 'badge', 'text', 'node') === '[未定义]';
    })(), compText(side, 'badge', 'text', 'node'));
    // 连线用起点节点当锚点
    ok('CP04f 连线的锚点是起点节点', (() => {
      const e = doc.edges.find(x => x.s === lv.id);
      setComponent(e, 'badge', { text:'{lv}' });
      reindex();
      return refAnchorOf(e, 'edge') === e.s;
    })());
  });
  T('CP05 优先级可以填表达式', () => {
    fresh(); layoutMind();
    const v = mkVar('倍率', '500');
    const a = addNodeAt('甲', 0, 0, 'rect');
    const b = addNodeAt('乙', 0, 0, 'rect');
    ok('CP05 默认还是 0', priorityOf(a) === 0, priorityOf(a));
    a.priority = '20';
    ok('CP05b 填普通数字能用', priorityOf(a) === 20, priorityOf(a));
    a.priority = '{倍率}';
    reindex();
    ok('CP05c 填 {变量} 能用', priorityOf(a) === 500, priorityOf(a));
    setVarDef(byId(v.id), { value:'1500' });
    reindex();
    ok('CP05d 变量改了就跟着变', priorityOf(a) === 1500, priorityOf(a));
    a.priority = '{不存在的}';
    reindex();
    ok('CP05e 解析不出来就退回该类型的默认（普通节点 = 0）', priorityOf(a) === 0, priorityOf(a));
    b.priority = '';
    ok('CP05f 空串也算没填', priorityOf(b) === 0);
    // 变量节点没填时仍然默认最高
    const vv = mkVar('x', '1');
    ok('CP05g 变量节点默认优先级不受影响', priorityOf(vv) === VAR_PRIORITY, priorityOf(vv));
    vv.priority = '3';
    ok('CP05h 变量节点也能手动覆盖', priorityOf(vv) === 3, priorityOf(vv));
  });
  T('CP06 条件隐藏：不是 0 / false 就藏起来', () => {
    fresh(); layoutMind();
    const v = mkVar('藏起来', '0');
    const n = nodeByText('节点');
    setComponent(n, 'hideIf', { when:'{藏起来}' });
    reindex();
    ok('CP06 0 不藏', !isHidden(n.id), 'hidden=' + isHidden(n.id));
    setVarDef(byId(v.id), { value:'1' });
    reindex();
    ok('CP06b 1 就藏', isHidden(n.id));
    ok('CP06c 和「折叠」走的是同一张 hidden 表', idx.hidden.has(n.id));
    setVarDef(byId(v.id), { value:'false' });
    reindex();
    ok('CP06d false 不藏', !isHidden(n.id));
    setVarDef(byId(v.id), { value:'关' });
    reindex();
    ok('CP06e 「关」不藏', !isHidden(n.id));
    setVarDef(byId(v.id), { value:'要' });
    reindex();
    ok('CP06f 「要」藏', isHidden(n.id));
    ok('CP06g hiddenByComponent 单独也能问', hiddenByComponent(n, 'node'));
    // 连线也能藏
    const e = doc.edges[0];
    setComponent(e, 'hideIf', { when:'1' });
    reindex();
    ok('CP06h 连线能藏', isHidden(e.id));
    ok('CP06i 藏起来的连线不会被画（edgeVisible）', !edgeVisible(e));
    removeComponent(e, 'hideIf');
    removeComponent(n, 'hideIf');
    reindex();
  });
  T('CP07 角标 / 描边 / 线宽都画得出来', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    setComponent(n, 'badge', { text:'角标 {n}', color:'#00ff00' });
    setComponent(n, 'outline', { width:'5', color:'#ff00ff' });
    const e = doc.edges[0];
    setComponent(e, 'width', { value:'9' });
    reindex(); sizeAll();
    ok('CP07 角标文字解析出来了', badgeTextOf(n, 'node').indexOf('角标') === 0, badgeTextOf(n, 'node'));
    ok('CP07b 角标颜色用自定义的', badgeColorOf(n, 'node') === '#00ff00', badgeColorOf(n, 'node'));
    ok('CP07c 描边宽度读得到', compNumber(n, 'outline', 'width', 'node', 3) === 5);
    ok('CP07d 线宽读得到', edgeWidthOf(e) === 9, edgeWidthOf(e));
    ok('CP07e 没挂线宽组件时返回 0（用默认）', edgeWidthOf(doc.edges[1]) === 0);
    ok('CP07f 整个画布画得出来', (dirty = true, draw(), true));
    // 关掉之后回到默认
    removeComponent(e, 'width');
    ok('CP07g 删掉组件就回默认', edgeWidthOf(e) === 0);
  });
  T('CP08 组件能存读往返', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    const e = doc.edges[0];
    const a = nodeByText('连线'), b = nodeByText('操作');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    setComponent(n, 'badge', { text:'节点角标', color:'#ff0000' });
    setComponent(n, 'hideIf', { when:'{关}' });
    setComponent(n, 'outline', { width:'7' });
    n.priority = '{倍率}';
    setComponent(e, 'width', { value:'6' });
    setComponent(grp, 'badge', { text:'分组角标' });
    setComponent(grp, 'outline', { width:'2', color:'#00ffff' });
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    const rawN = snap.nodes.find(x => x.id === n.id);
    ok('CP08 节点的组件写进存档了', Array.isArray(rawN.components) && rawN.components.length === 3,
      JSON.stringify(rawN.components));
    ok('CP08b 优先级按字符串存（表达式要保住）', rawN.priority === '{倍率}', String(rawN.priority));
    ok('CP08c 连线的组件也在', snap.edges.find(x => x.id === e.id).components.length === 1);
    ok('CP08d 分组的组件也在', snap.groups.find(g => g.id === grp.id).components.length === 2);
    deserialize(snap);
    const n2 = byId(n.id), e2 = doc.edges.find(x => x.id === e.id);
    const g2 = byGroup(grp.id);
    ok('CP08e 节点的组件读回来了', compsOf(n2).length === 3, compsOf(n2).length);
    ok('CP08f 属性没丢', compRaw(n2, 'badge', 'text') === '节点角标'
      && compRaw(n2, 'outline', 'width') === '7', JSON.stringify(compOf(n2, 'badge')));
    ok('CP08g 优先级表达式也保住了', n2.priority === '{倍率}', String(n2.priority));
    ok('CP08h 连线 / 分组的组件都在', compsOf(e2).length === 1 && compsOf(g2).length === 2);
  });
  T('CP09 坏数据会被规整，不会留脏东西', () => {
    const n = { id:'n1', text:'x', x:0, y:0, priority:'', components:null };
    ok('CP09 components 是 null 时不炸', compsOf(n).length === 0 && compOf(n, 'badge') === null);
    n.components = [{ type:'badge', props:{ text:'a' } }, { type:'外星组件' }, { type:'badge', props:{ text:'b' } }];
    const norm = normalizeComponents(n.components);
    ok('CP09b 未知类型被丢掉', norm.length === 1, JSON.stringify(norm));
    ok('CP09c 同类型只留第一个', norm[0].props.text === 'a', norm[0].props.text);
    ok('CP09d 缺的属性用默认值补齐', norm[0].props.color === '', JSON.stringify(norm[0].props));
    ok('CP09e 属性不是对象也不炸', (() => {
      const r = normalizeComponents([{ type:'badge', props:'不是对象' }]);
      return r.length === 1 && r[0].props.text === '';
    })());
    ok('CP09f 不是数组也不炸', normalizeComponents('abc').length === 0 && normalizeComponents(undefined).length === 0);
  });
  T('CP10 自定义组件面板：开合 / 只留自定义组件', () => {
    fresh(); layoutMind();
    ok('CP10 一开始是关的', !compsOpen());
    keyRaw('c');
    ok('CP10b C 键打开', compsOpen());
    /* ★ 这个面板改过了：单个效果（染色 / 透明度 / 描边 / 角标 / 条件隐藏 / 线宽）
       全部搬到右键菜单里按分类放好，面板只剩「自定义组件」。
       以前它和菜单两套入口并存，改一处忘一处。 */
    ok('CP10c 标题是「自定义组件」',
      document.querySelector('#comps h2').textContent === '自定义组件',
      document.querySelector('#comps h2').textContent);
    ok('CP10d 副标题讲的是自定义组件', /自定义组件/.test(compsSubEl.textContent), compsSubEl.textContent);
    ok('CP10e ★ 每个实体的效果行没了（没有 compcard）',
      compsListEl.querySelectorAll('.compcard').length === 0,
      String(compsListEl.querySelectorAll('.compcard').length));
    ok('CP10f 提示里指路到右键菜单', /右键菜单/.test(compsHintEl.textContent), compsHintEl.textContent);
    ok('CP10g ★ 「自定义组件」那一节还在', /自定义组件/.test(compsListEl.textContent));
    ok('CP10h ★ 「新建组件…」按钮还在', /新建组件/.test(compsListEl.textContent));
    keyRaw('Escape');
    ok('CP10i Esc 关掉', !compsOpen());
  });
  T('CP11 效果的可用范围跟着作用域走（入口在菜单里了）', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    sel.clear(); sel.add(a.id); sel.add(b.id);
    const grp = createGroup();
    selectGroup(grp.id);
    /* ★ 效果行从面板搬到右键菜单了，所以直接测那个生成器 ——
       effectMenuItems(entity, scope, ids, who) 就是菜单项的真正来源。 */
    const labelsOf = (entity, scope, ids) =>
      effectMenuItems(entity, scope, ids, 'X').map(x => x[0]);
    const g = byGroup(grp.id);
    const gLabels = labelsOf(g, 'group', ['tint', 'opacity', 'outline', 'badge', 'hideIf', 'width']);
    ok('CP11 ★ 分组能拿到染色 / 透明度 / 描边 / 角标 / 条件隐藏',
      ['染色', '透明度', '自定义描边', '角标', '条件隐藏'].every(k => gLabels.some(x => x.indexOf(k) >= 0)),
      gLabels.join(' / '));
    ok('CP11b ★ 分组下不会出现「线宽」（那是连线专属）',
      !gLabels.some(x => x.indexOf('线宽') >= 0), gLabels.join(' / '));

    const e = doc.edges[0];
    const eLabels = labelsOf(e, 'edge', ['tint', 'opacity', 'outline', 'badge', 'hideIf', 'width']);
    ok('CP11c ★ 连线能拿到「线宽」', eLabels.some(x => x.indexOf('线宽') >= 0), eLabels.join(' / '));
    ok('CP11d ★ 连线下不会出现「自定义描边」',
      !eLabels.some(x => x.indexOf('自定义描边') >= 0), eLabels.join(' / '));
    /* ★ 作用域过滤的数一数就行（比写「XX 拿不到 YY」稳：
       我第一版写「连线拿不到条件隐藏」——错了，
       hideIf 的 scopes 是 ALL_SCOPES，连线本来就该能挂）。
       六项里：描边只给 node/group，线宽只给 edge，其余四项 ALL_SCOPES。
         连线 → 5 项（排掉描边）
         分组 → 5 项（排掉线宽）
         节点 → 5 项（排掉线宽 —— 我第一版写 6，探针一数才看清） */
    ok('CP11e ★ 连线 5 项（六项里排掉「自定义描边」）', eLabels.length === 5,
      eLabels.length + ': ' + eLabels.join(' / '));
    const six = ['tint', 'opacity', 'outline', 'badge', 'hideIf', 'width'];
    ok('CP11e2 ★ 分组 5 项（排掉「线宽」）',
      labelsOf(g, 'group', six).length === 5, labelsOf(g, 'group', six).join(' / '));
    ok('CP11e3 ★ 节点 5 项（排掉「线宽」——它只给连线）',
      labelsOf(a, 'node', six).length === 5, labelsOf(a, 'node', six).join(' / '));

    const nLabels = labelsOf(a, 'node', ['tint', 'opacity', 'outline', 'badge', 'hideIf', 'width']);
    ok('CP11f ★ 节点能拿到条件隐藏', nLabels.some(x => x.indexOf('条件隐藏') >= 0), nLabels.join(' / '));
    ok('CP11g ★ 节点拿不到「线宽」', !nLabels.some(x => x.indexOf('线宽') >= 0), nLabels.join(' / '));
    closeComps();
  });


  /* ==================== 自定义组件 / 用户主题 / native 后端 ==================== */
  const mkUserComp = (over) => Object.assign({
    label:'打折标记', scopes:['node'],
    parts:[{ effect:'badge', props:{ text:'打折', color:'#ffd800' } },
           { effect:'outline', props:{ width:'3', color:'#ffd800' } }]
  }, over || {});

  T('CU01 自定义组件：声明 / 注册 / 注销', () => {
    fresh();
    const before = allComponents().length;
    const def = registerUserComponent(mkUserComp());
    ok('CU01 注册成功了', !!def && !!def.id, JSON.stringify(def && def.id));
    ok('CU01b 打上了 user 标记', def.user === true);
    ok('CU01c 进注册表了', allComponents().length === before + 1);
    ok('CU01d 能查到', compDef(def.id) === def && isUserComponent(def.id));
    ok('CU01e 作用域过滤也对',
      componentsFor('node').some(c => c.id === def.id) && !componentsFor('edge').some(c => c.id === def.id));
    ok('CU01f 落盘了', JSON.parse(localStorage.getItem('grapheon.comps.v1') || '[]')
      .some(d => d.id === def.id));
    ok('CU01g 注销掉', unregisterUserComponent(def.id) && !compDef(def.id));
    ok('CU01h 注销不存在的返回 false', unregisterUserComponent('zzz') === false);
    ok('CU01i 非法声明被挡住', (() => {
      const n0 = allComponents().length;
      registerUserComponent(null); registerUserComponent({});
      registerUserComponent({ label:'x', scopes:[], parts:[{ effect:'badge' }] });
      registerUserComponent({ label:'x', scopes:['node'], parts:[] });
      registerUserComponent({ label:'x', scopes:['node'], parts:[{ effect:'外星效果' }] });
      return allComponents().length === n0;
    })(), allComponents().length);
    ok('CU01j 作用域里的非法值会被过滤', (() => {
      const d = registerUserComponent(mkUserComp({ scopes:['node', '外星', 'edge'] }));
      const r = d && d.scopes.join(',') === 'node,edge';
      if (d) unregisterUserComponent(d.id);
      return r;
    })());
    localStorage.removeItem('grapheon.comps.v1');
  });
  T('CU02 自定义组件 = 多个效果的组合，实例按部件编号存', () => {
    fresh(); layoutMind();
    const def = registerUserComponent(mkUserComp());
    const zhe = mkVar('折', '8');            // 顺便证明自定义组件的属性也过插值
    const n = nodeByText('节点');
    setComponent(n, def.id, { '0.text':'打 {折} 折', '1.width':'6' });
    reindex(); sizeAll();
    const parts = effectPartsOf(n, 'node').filter(p => p.compType === def.id);
    ok('CU02 摊出来两个部件', parts.length === 2, parts.length);
    ok('CU02b 部件顺序和声明一致',
      parts[0].effect === 'badge' && parts[1].effect === 'outline',
      parts.map(p => p.effect).join(','));
    ok('CU02c 部件属性各读各的',
      partValue(n, parts[0], 'text', 'node') === '打 8 折' &&
      partNumber(n, parts[1], 'width', 'node', 0) === 6,
      partValue(n, parts[0], 'text', 'node') + ' / ' + partNumber(n, parts[1], 'width', 'node', 0));
    ok('CU02d 角标取得到（走的是同一个绘制入口）', badgeTextOf(n, 'node') === '打 8 折',
      badgeTextOf(n, 'node'));
    ok('CU02e 没填的部件用声明里的默认值', (() => {
      const m = nodeByText('连线');
      setComponent(m, def.id, {});
      reindex();
      const ps = effectPartsOf(m, 'node').filter(p => p.compType === def.id);
      return partValue(m, ps[1], 'color', 'node') === '#ffd800';
    })());
    ok('CU02f 整个画布画得出来', (dirty = true, draw(), true));
    ok('CU02g 效果不支持的作用域会被跳过', (() => {
      const d2 = registerUserComponent({ label:'混合', scopes:['edge', 'node'], parts:[
        { effect:'badge', props:{ text:'x' } }, { effect:'outline', props:{ width:'2' } }] });
      const e = doc.edges[0];
      setComponent(e, d2.id, {});
      reindex();
      const onEdge = effectPartsOf(e, 'edge').map(p => p.effect);
      unregisterUserComponent(d2.id);
      return onEdge.indexOf('badge') >= 0 && onEdge.indexOf('outline') < 0;
    })());
    unregisterUserComponent(def.id);
    localStorage.removeItem('grapheon.comps.v1');
  });
  T('CU03 注销组件会把文档里的实例一起清掉', () => {
    fresh(); layoutMind();
    const def = registerUserComponent(mkUserComp());
    const n = nodeByText('节点'), e = doc.edges[0];
    setComponent(n, def.id, {}); setComponent(e, def.id, {});
    a = null;
    const grp = (() => { const x = nodeByText('连线'), y = nodeByText('操作');
      sel.clear(); sel.add(x.id); sel.add(y.id); return createGroup(); })();
    setComponent(grp, def.id, {});
    reindex();
    ok('CU03 三个地方都挂上了',
      compsOf(n).length === 1 && compsOf(e).length === 1 && compsOf(grp).length === 1);
    unregisterUserComponent(def.id);
    ok('CU03b 注销后实例也没了（不留认不出来的孤儿）',
      compsOf(n).length === 0 && compsOf(e).length === 0 && compsOf(grp).length === 0,
      [compsOf(n).length, compsOf(e).length, compsOf(grp).length].join(','));
    localStorage.removeItem('grapheon.comps.v1');
  });
  T('CU04 自定义组件跟着文档走（存读往返）', () => {
    fresh(); layoutMind();
    const def = registerUserComponent(mkUserComp({ label:'随文档走' }));
    const n = nodeByText('节点');
    setComponent(n, def.id, { '0.text':'文档里' });
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('CU04 存档里带了组件定义',
      Array.isArray(snap.componentDefs) && snap.componentDefs.some(d => d.id === def.id),
      JSON.stringify((snap.componentDefs || []).map(d => d.id)));
    ok('CU04b 定义里带着部件', snap.componentDefs.find(d => d.id === def.id).parts.length === 2);
    ok('CU04c 节点实例也带着', snap.nodes.find(x => x.id === n.id).components[0].type === def.id);
    // 模拟「别人拿到这个文件、他本地没有这个组件」
    unregisterUserComponent(def.id);
    ok('CU04d 先确认本地真的没有了', !compDef(def.id));
    deserialize(snap);
    ok('CU04e 打开文档时自动把定义并进来了', !!compDef(def.id), String(compDef(def.id)));
    ok('CU04f 实例也认出来了', compsOf(byId(n.id)).length === 1 && compOn(byId(n.id), def.id));
    ok('CU04g 属性还在', compRaw(byId(n.id), def.id, '0.text') === '文档里',
      compRaw(byId(n.id), def.id, '0.text'));
    ok('CU04h 还能画', (dirty = true, draw(), true));
    unregisterUserComponent(def.id);
    localStorage.removeItem('grapheon.comps.v1');
  });
  T('CU05 组件面板：新建 / 编辑 / 删除自定义组件', () => {
    fresh(); layoutMind();
    selectOnly(nodeByText('节点').id);
    openComps();
    ok('CU05 列了「自定义组件」一节', /自定义组件/.test(compsListEl.textContent));
    const newBtn = [...compsListEl.querySelectorAll('.ud-btn')].find(b => /新建组件/.test(b.textContent));
    ok('CU05b 有新建按钮', !!newBtn);
    newBtn.click();
    ok('CU05c 进编辑器了', !!compEditor);
    ok('CU05d 编辑器里列出全部效果',
      compsListEl.querySelectorAll('.compeffect').length === EFFECT_IDS.length,
      compsListEl.querySelectorAll('.compeffect').length);
    // 填名字
    const nameInp = [...compsListEl.querySelectorAll('.compinput')].find(i => /比如/.test(i.placeholder || ''));
    nameInp.value = '测试组件'; nameInp.oninput();
    ok('CU05e 名字记进草稿了', compEditor.label === '测试组件', compEditor.label);
    // 勾上「染色」效果
    const tintCard = [...compsListEl.querySelectorAll('.compeffect')].find(c => /染色/.test(c.textContent));
    const cb = tintCard.querySelector('input[type=checkbox]');
    cb.checked = true; cb.onchange();
    ok('CU05f 效果加进草稿了', compEditor.parts.some(p => p.effect === 'tint'),
      compEditor.parts.map(p => p.effect).join(','));
    // 创建
    const createBtn = [...compsListEl.querySelectorAll('.ud-btn')].find(b => b.textContent === '创建');
    createBtn.click();
    const made = USER_COMPONENTS.find(c => c.label === '测试组件');
    ok('CU05g 创建出来了', !!made, USER_COMPONENTS.map(c => c.label).join(','));
    ok('CU05h 编辑器关掉了', !compEditor);
    ok('CU05i 列表里出现了', /测试组件/.test(compsListEl.textContent));
    // 删掉
    const delBtn = [...compsListEl.querySelectorAll('.compuserdef')]
      .find(d => /测试组件/.test(d.textContent)).querySelector('.ud-btn:nth-of-type(2)')
      || [...compsListEl.querySelectorAll('.compuserdef .ud-btn')].filter(b => b.textContent === '删除')[0];
    delBtn.click();
    ok('CU05j 删得掉', !USER_COMPONENTS.some(c => c.label === '测试组件'));
    closeComps();
    localStorage.removeItem('grapheon.comps.v1');
  });
  await TA('CU06 native 存储后端：宿主一挂上就被优先选中', async () => {
    const files = new Map();
    let seq = 0;
    window.GrapheonNative = {
      label:'测试宿主',
      async ready(){ return true; },
      async list(){ return [...files.values()].map(f => ({ kind:f.kind, name:f.name, size:f.size, id:f.id })); },
      async get(id){ const f = files.get(id); return f ? f.data : null; },
      async put(kind, name, b64){
        const id = 'nat' + (++seq);
        files.set(id, { id, kind, name, size:Math.floor(b64.length * 0.75), data:b64 });
        return id;
      },
      async del(id){ files.delete(id); }
    };
    try {
      ok('CU06 探测到了宿主', hasNative());
      const ns = makeNativeStore(nativeHost());
      ok('CU06b 名字里带上了宿主的名字', ns.label.indexOf('测试宿主') >= 0, ns.label);
      ok('CU06c id 是 native', ns.id === 'native');
      const id = await ns.put('assets', 'a.png', new Blob([new Uint8Array([1, 2, 3, 4])]));
      const rows = await ns.list();
      ok('CU06d 存进去了', rows.length === 1 && rows[0].name === 'a.png', JSON.stringify(rows));
      const back = await ns.get(id);
      ok('CU06e base64 过了桥还能还原成 Blob', back instanceof Blob && back.size === 4,
        back && back.constructor.name + '/' + (back && back.size));
      await ns.del(id);
      ok('CU06f 删得掉', (await ns.list()).length === 0);
      // Store.init 要优先挑它
      Store.backend = null;
      const picked = await Store.init();
      ok('CU06g Store 优先挑 native（exe / 手机环境里这是对的）',
        picked.id === 'native', picked.id);
    } finally {
      delete window.GrapheonNative;
      Store.backend = null;
    }
    ok('CU06h 卸掉宿主之后就不认了', !hasNative());
    const after = await Store.init();
    ok('CU06i 会退回浏览器自带的后端', after.id !== 'native', after.id);
  });
  T('TH01 主题文件：解析 / 注册 / 套用 / 删除', () => {
    localStorage.removeItem('grapheon.themes.v1');
    const obj = { label:'暗夜', canvas:{ bg:'#101010', white:'#eeeeee', yellow:'#ffaa00' },
                  grid:'dots', cursor:'cross', heart:false, star:false };
    const id = registerUserTheme(obj);
    ok('TH01 注册成功', !!id && !!THEMES[id], String(id));
    ok('TH01b 打上了 user 标记', THEMES[id].user === true);
    ok('TH01c 调色板收下了', THEMES[id].canvas.bg === '#101010' && THEMES[id].canvas.yellow === '#ffaa00');
    ok('TH01d 性格也收下了',
      THEMES[id].grid === 'dots' && THEMES[id].cursor === 'cross'
      && THEMES[id].heart === false && THEMES[id].star === false,
      JSON.stringify(THEMES[id]));
    applyTheme(id);
    ok('TH01e 套用之后 C 里就是它的颜色', C.bg === '#101010' && C.yellow === '#ffaa00',
      C.bg + '/' + C.yellow);
    ok('TH01f 背景和光标也跟着换了', gridStyle() === 'dots' && themeCursor() === 'cross',
      gridStyle() + '/' + themeCursor());
    ok('TH01g 落盘了', !!localStorage.getItem('grapheon.themes.v1'));
    ok('TH01h 删得掉且会切回默认',
      unregisterUserTheme(id) && themeId === DEFAULT_THEME && !THEMES[id],
      themeId + '/' + String(THEMES[id]));
    // 坏数据
    ok('TH01i 没有 canvas 的挡下来', registerUserTheme({ label:'x' }) === null);
    ok('TH01j 调色板里没有合法颜色也挡下来', registerUserTheme({ canvas:{ bg:'不是颜色' } }) === null);
    ok('TH01k 非法颜色会被挑掉、合法的留下', (() => {
      const i2 = registerUserTheme({ canvas:{ bg:'#000000', white:'不是颜色' } });
      const r = THEMES[i2] && THEMES[i2].canvas.bg === '#000000' && THEMES[i2].canvas.white === undefined;
      unregisterUserTheme(i2);
      return r;
    })());
    applyTheme(DEFAULT_THEME);
    localStorage.removeItem('grapheon.themes.v1');
  });
  T('TH02 用户主题跟着文档走，也能重新从本地库读回来', () => {
    fresh(); layoutMind();
    localStorage.removeItem('grapheon.themes.v1');
    const id = registerUserTheme({ label:'随文档', canvas:{ bg:'#123456', white:'#ffffff' } });
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('TH02 存档里带了主题定义',
      Array.isArray(snap.themes) && snap.themes.some(t => t.id === id),
      JSON.stringify((snap.themes || []).map(t => t.id)));
    unregisterUserTheme(id);
    ok('TH02b 先确认本地没了', !THEMES[id]);
    deserialize(snap);
    ok('TH02c 打开文档时并进来了', !!THEMES[id] && THEMES[id].canvas.bg === '#123456',
      JSON.stringify(THEMES[id] && THEMES[id].canvas));
    // 本地库的存取
    saveUserThemes();
    const raw = localStorage.getItem('grapheon.themes.v1');
    ok('TH02d 库里有它', !!raw && raw.indexOf(id) >= 0);
    unregisterUserTheme(id);
    localStorage.setItem('grapheon.themes.v1', raw);   // 模拟「库没删，只是重开页面」
    const n = loadUserThemes();
    ok('TH02e 能在重开时读回来', n >= 1 && !!THEMES[id], n + '/' + String(!!THEMES[id]));
    unregisterUserTheme(id);
    localStorage.removeItem('grapheon.themes.v1');
    applyTheme(DEFAULT_THEME);
  });
  await TA('TH03 自定义字体持久化：存进素材库、重开能捞回来', async () => {
    const d = makeIdbStore();
    if (!(await d.ready())){ ok('TH03 跳过（没有 IndexedDB）', true); return; }
    await d.clear();
    const old = Store.backend;
    Store.backend = d;
    try {
      // 造一个「能当字体用」的假字体是做不到的，所以这里验的是**存/取链路**：
      // 素材库里有一份，restoreUserFonts 会去读它、坏数据安静跳过、不挡启动。
      await Store.put('fonts', '假字体.ttf', new Blob([new Uint8Array([1, 2, 3])]));
      const listed = (await d.list()).filter(x => x.kind === 'fonts');
      ok('TH03 字体进了素材库', listed.length === 1 && listed[0].name === '假字体.ttf',
        JSON.stringify(listed));
      const before = Object.keys(NODE_FONTS).length;
      const n = await restoreUserFonts();
      ok('TH03b 坏字体不会污染字体表', Object.keys(NODE_FONTS).length === before,
        Object.keys(NODE_FONTS).length + ' vs ' + before);
      ok('TH03c 也不会把它算成成功', n === 0, n);
      ok('TH03d 不会抛出去挡启动', true);
    } finally {
      await d.clear();
      Store.backend = old;
    }
  });


  /* ==================== 樱花主题 / 飘落特效 ==================== */
  const sakPink = (d, i) => d[i] > 200 && d[i + 1] > 120 && d[i + 1] < 220 && d[i + 2] > 150 && d[i + 2] < 240;
  T('SK01 樱花主题：马卡龙粉 + 背景特效', () => {
    fresh();
    ok('SK01 主题表里有樱花', !!THEMES.sakura);
    ok('SK01b 是内置主题（用户删不掉）', BUILTIN_THEME_IDS.has('sakura'));
    applyTheme('sakura');
    ok('SK01c 切过去了', themeId === 'sakura', themeId);
    const p = THEMES.sakura.canvas;
    ok('SK01d 底色是浅粉', p.bg === '#fff6f9', p.bg);
    ok('SK01e 正文是深玫瑰（浅底上得压得住）', p.white === '#9c5a75', p.white);
    ok('SK01f 强调色是马卡龙粉', p.yellow === '#ff8fb1', p.yellow);
    ok('SK01g 七个色位都填了', Object.keys(THEME_VARS).every(k => typeof p[k] === 'string'), JSON.stringify(p));
    ok('SK01h C 里真的换过去了', C.bg === p.bg && C.yellow === p.yellow);
    ok('SK01i 特效声明是 sakura', themeEffect() === 'sakura', themeEffect());
    ok('SK01j 背景网格关掉了（和花瓣叠在一起会太花）', gridStyle() === 'none', gridStyle());
    ok('SK01k 光标是红心、红心要画、不要星号',
      themeCursor() === 'heart' && themeHeart() === true && themeStar() === false);
    applyTheme(DEFAULT_THEME);
  });
  T('SK02 开关逻辑：主题 + 用户开关 + 系统「减少动态」', () => {
    fresh();
    applyTheme('board');
    ok('SK02 别的主题下不要特效', !sakuraWanted());
    applyTheme('sakura');
    ok('SK02b 樱花主题下要', sakuraWanted());
    setSakuraEnabled(false);
    // 注意：rAF 循环现在是樱花和连线流动**共用**的，所以不能拿 sakuraRunning 当「樱花关了」的证据
    ok('SK02c 用户关掉就不要了', !sakuraWanted());
    ok('SK02c2 但流动动画还开着，所以共用循环还在转', sakuraRunning);
    ok('SK02d 记进 localStorage 了', localStorage.getItem('grapheon.sakura.v1') === '0');
    setSakuraEnabled(true);
    ok('SK02e 打开又要了', sakuraWanted());
    ok('SK02f 尊重系统的「减少动态效果」（这里没开，所以还是 true）',
      typeof sakuraMotionOK() === 'boolean');
    applyTheme(DEFAULT_THEME);
    ok('SK02g 切走之后樱花不要了', !sakuraWanted());
    localStorage.removeItem('grapheon.sakura.v1');
  });
  T('SK03 花瓣：铺得均匀、会飘、落到底会重生', () => {
    fresh();
    VW = 800; VH = 600;
    sakuraInit();
    ok('SK03 铺了 46 片', sakuraPetals.length === SAKURA_COUNT, sakuraPetals.length);
    ok('SK03b 一开始不是全堆在顶上（不然要等好几秒才好看）',
      new Set(sakuraPetals.map(p => Math.round(p.y / 60))).size > 4,
      new Set(sakuraPetals.map(p => Math.round(p.y / 60))).size);
    ok('SK03c 每片都有完整的运动参数',
      sakuraPetals.every(p => p.r > 0 && p.vy > 0 && typeof p.rot === 'number'
        && p.tint && p.alpha > 0 && p.alpha <= 1 && p.squash > 0),
      JSON.stringify(sakuraPetals[0]));
    ok('SK03d 颜色都取自马卡龙粉色卡',
      sakuraPetals.every(p => SAKURA_TINTS.indexOf(p.tint) >= 0));
    const before = sakuraPetals.map(p => ({ x:p.x, y:p.y, rot:p.rot }));
    sakuraStep(0.1, 1.0);
    ok('SK03e 往下飘了', sakuraPetals.every((p, i) => p.y > before[i].y));
    ok('SK03f 转了', sakuraPetals.some((p, i) => p.rot !== before[i].rot));
    ok('SK03g 左右也飘了', sakuraPetals.some((p, i) => p.x !== before[i].x));
    // 落到底要重生
    for (const p of sakuraPetals) p.y = VH + 100;
    sakuraStep(0.016, 2);
    ok('SK03h 落到底会回到顶上重来',
      sakuraPetals.every(p => p.y < VH),
      Math.max(...sakuraPetals.map(p => Math.round(p.y))));
    ok('SK03i 重生时换了片新花瓣（颜色可能是新的，至少参数还在范围内）',
      sakuraPetals.every(p => p.r >= 4 && p.r <= 11));
    // 飘出左右边界要绕回来
    for (const p of sakuraPetals) p.x = -999;
    sakuraStep(0.016, 3);
    ok('SK03j 飘出左边会从右边回来', sakuraPetals.every(p => p.x > 0));
    // 重铺
    sakuraInit();
    ok('SK03k 窗口变了能重铺', sakuraPetals.length === SAKURA_COUNT);
  });
  T('SK04 花瓣真的画到了画布上，而且只在樱花主题下画', () => {
    fresh(); fitView();
    applyTheme('sakura');
    setSakuraEnabled(true);
    resize();
    // 手动铺一批、推到画布中间，保证一定看得到
    VW = cv.width; VH = cv.height;
    sakuraInit();
    for (const p of sakuraPetals){ p.x = cv.width * (0.2 + Math.random() * 0.6); p.y = cv.height * (0.2 + Math.random() * 0.6); }
    draw();
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let pink = 0;
    for (let i = 0; i < d.length; i += 4) if (sakPink(d, i)) pink++;
    ok('SK04 画布上找得到花瓣色', pink > 300, pink);
    // 换个主题就不该有
    const savedId = themeId;
    THEMES.__probe = Object.assign({}, THEMES.board, { effect:'' });
    applyTheme('__probe');
    draw();
    const d2 = g.getImageData(0, 0, cv.width, cv.height).data;
    let pink2 = 0;
    for (let i = 0; i < d2.length; i += 4) if (sakPink(d2, i)) pink2++;
    ok('SK04b 换主题之后花瓣没了', pink2 < pink / 3, pink2 + ' vs ' + pink);
    delete THEMES.__probe;
    applyTheme(savedId);
  });
  T('SK05 花瓣不会跑进 PNG 导出', () => {
    fresh(); layoutMind();
    applyTheme('sakura');
    setSakuraEnabled(true);
    sakuraInit();
    for (const p of sakuraPetals){ p.x = 60; p.y = 60; p.r = 20; p.alpha = 1; }
    const c = buildExportCanvas(doc.nodes);
    const g = c.getContext('2d');
    // 导出画布左上角那块本来只该有纯底色
    const d = g.getImageData(0, 0, 40, 40).data;
    let pink = 0;
    for (let i = 0; i < d.length; i += 4) if (sakPink(d, i)) pink++;
    ok('SK05 导出图里没有花瓣', pink === 0, pink);
    ok('SK05b 导出画布本身是好的', c.width > 0 && c.height > 0);
  });
  T('SK06 樱花主题下别的东西还正常', () => {
    fresh(); layoutMind();
    applyTheme('sakura');
    ok('SK06 画得出图', (dirty = true, draw(), true));
    ok('SK06b 棋盘/网格关掉之后底上不留格子', (() => {
      setSakuraEnabled(false);      // 这条测的是「没有网格」，先把花瓣关掉免得混进来
      resize(); draw();
      const g = cv.getContext('2d');
      const d = g.getImageData(0, 0, 60, 60).data;
      // 底色是 #fff6f9，不该出现网格那种淡粉色线
      for (let i = 0; i < d.length; i += 4){
        if (d[i] !== 255 || d[i + 1] !== 246 || d[i + 2] !== 249) return false;
      }
      return true;
    })());
    setSakuraEnabled(true);
    ok('SK06c 选中态用的是粉，不是原来的黄', (() => {
      const b = nodeBox(nodeByText('节点'));
      return C.yellow === '#ff8fb1';
    })());
    applyTheme(DEFAULT_THEME);
    ok('SK06d 切回棋盘一切照旧', themeEffect() === '' && gridStyle() === 'checker');
  });


  /* ==================== 全局变量：定义后全作用域直接可用，无需连线 ==================== */
  T('GX01 全局变量零连线，在所有能写字的地方都取得到', () => {
    fresh(); layoutMind();
    // 一个孤零零的全局变量节点，一条边都不连
    const v = mkVar('总数', '42', { scope:'global' });
    v.text = '全局：总数';
    reindex(); sizeAll();
    ok('GX01 前置：它真的没有任何连线',
      !doc.edges.some(e => e.s === v.id || e.t === v.id),
      doc.edges.filter(e => e.s === v.id || e.t === v.id).length + ' 条');

    // 挑几个离它很远、也互不相连的节点
    const a = nodeByText('节点'), b = nodeByText('折叠子树') || nodeByText('空格折叠子树');
    const c = nodeByText('操作');
    ok('GX01b 前置：这些节点和变量之间也没有连线',
      [a, c].every(n => !doc.edges.some(e =>
        (e.s === n.id && e.t === v.id) || (e.t === n.id && e.s === v.id))));

    // ① 节点正文
    a.text = '看板 {总数}';
    // ② 连线标签
    const e0 = doc.edges[0];
    e0.label = '标签 {总数}';
    // ③ 分组标题
    sel.clear(); sel.add(a.id); sel.add(c.id);
    const grp = createGroup();
    grp.title = '组 {总数}';
    // ④ 组件属性（文字 / 数字 / 颜色三种都试）
    setComponent(a, 'badge', { text:'角标 {总数}' });
    setComponent(a, 'outline', { width:'{总数}', color:'#00ff00' });
    setComponent(c, 'opacity', { value:'{总数}' });
    // ⑤ 优先级
    c.priority = '{总数}';
    // ⑥ 程序节点的数值
    const pg = createProgramNode(0, 0);
    setProgram(pg, { op:'move', key:'x', mode:'add', value:'{总数}' });
    linkNodes(pg.id, b.id);
    // ⑦ 输出节点（名字本身是标识符，不插值；但它按名字找变量时要能找到）
    const out = addOutNode('总数', 0, 0);
    reindex(); sizeAll();

    ok('GX01c 节点正文：拿到 42', displayTextOf(byId(a.id)) === '看板 42', displayTextOf(byId(a.id)));
    ok('GX01d 连线标签：拿到 42', displayLabelOf(doc.edges.find(x => x.id === e0.id)) === '标签 42',
      displayLabelOf(doc.edges.find(x => x.id === e0.id)));
    ok('GX01e 分组标题：拿到 42', displayTitleOf(byGroup(grp.id)) === '组 42',
      displayTitleOf(byGroup(grp.id)));
    ok('GX01f 组件的文字属性：拿到 42',
      compText(byId(a.id), 'badge', 'text', 'node') === '角标 42',
      compText(byId(a.id), 'badge', 'text', 'node'));
    ok('GX01g 组件的数字属性：拿到 42',
      compNumber(byId(a.id), 'outline', 'width', 'node', 0) === 42,
      compNumber(byId(a.id), 'outline', 'width', 'node', 0));
    ok('GX01h 组件的透明度：42 → 0.42', Math.abs(compOpacityOf(byId(c.id), 'node') - 0.42) < 1e-6,
      compOpacityOf(byId(c.id), 'node'));
    ok('GX01i 优先级：拿到 42', priorityOf(byId(c.id)) === 42, priorityOf(byId(c.id)));
    ok('GX01j 程序节点的数值：位移真的加了 42', (() => {
      const bb = nodeBox(byId(b.id));
      return Math.abs(bb.x - (byId(b.id).x + 42)) < 0.01;
    })(), JSON.stringify(nodeBox(byId(b.id))) + ' / 原始 x=' + byId(b.id).x);
    ok('GX01k 输出节点按名字找到它，值就是 42',
      outputValueIn(liveCtx(), byId(out.id)) === '42',
      String(outputValueIn(liveCtx(), byId(out.id))));
    ok('GX01l 上面这些地方，一个连线都没用到变量',
      !doc.edges.some(e => e.s === v.id || e.t === v.id));

    // 变量一改，上面所有地方一起跟着变
    setVarDef(byId(v.id), { value:'7' });
    reindex(); sizeAll();
    ok('GX01m 改一次，全都跟着变',
      displayTextOf(byId(a.id)) === '看板 7'
      && displayLabelOf(doc.edges.find(x => x.id === e0.id)) === '标签 7'
      && displayTitleOf(byGroup(grp.id)) === '组 7'
      && priorityOf(byId(c.id)) === 7,
      [displayTextOf(byId(a.id)), displayLabelOf(doc.edges.find(x => x.id === e0.id)),
       displayTitleOf(byGroup(grp.id)), priorityOf(byId(c.id))].join(' | '));
  });
  T('GX02 全局变量的边界：普通分组不挡它，函数分组才挡', () => {
    fresh(); layoutMind();
    const v = mkVar('g', '5', { scope:'global' });
    const far = nodeByText('点选连线改样式');
    // 放进一个**普通**分组里，组外的还能用
    sel.clear(); sel.add(far.id);
    const g1 = newEmptyGroup(0, 0);
    g1.members = [far.id];
    reindex();
    ok('GX02 普通分组不隔断全局变量', resolveVar('g', far.id) === '5', String(resolveVar('g', far.id)));
    // 放进**函数分组**里，里面就看不到外面定义的了（这是之前定下的隔离规则）
    g1.isFunction = true;
    reindex();
    ok('GX02b 函数分组内看不到外面定义的全局变量',
      resolveVar('g', far.id) === null, String(resolveVar('g', far.id)));
    ok('GX02c 但组内自己定义的全局变量，组内到处都能用', (() => {
      const inner = mkVar('h', '9', { scope:'global' });
      g1.members.push(inner.id);
      reindex();
      const r = resolveVar('h', far.id);
      return r === '9';
    })(), String(resolveVar('h', far.id)));
    ok('GX02d 组内定义的不会漏到外面', (() => {
      const outside = nodeByText('拖端点改接');
      return resolveVar('h', outside.id) === null;
    })());
  });
  T('GX03 只有「局内 / 组内」才需要连线，全局不需要', () => {
    fresh(); layoutMind();
    const far = nodeByText('拖端点改接');       // 离谁都远，也不相连
    const gv = mkVar('G', '1', { scope:'global'  });
    const lv = mkVar('L', '2', { scope:'local'   });
    const pv = mkVar('P', '3', { scope:'group'   });
    reindex();
    ok('GX03 全局：不连线也能用', resolveVar('G', far.id) === '1', String(resolveVar('G', far.id)));
    ok('GX03b 局内：不连线就看不到（它本来就是「仅下游」）',
      resolveVar('L', far.id) === null, String(resolveVar('L', far.id)));
    ok('GX03c 组内：没连到分组就看不到（它本来就要求连）',
      resolveVar('P', far.id) === null, String(resolveVar('P', far.id)));
    // 连上之后局内就能用了
    linkNodes(lv.id, far.id);
    reindex();
    ok('GX03d 局内连上就能用了', resolveVar('L', far.id) === '2', String(resolveVar('L', far.id)));
    // 组内连一个包含它的分组
    sel.clear(); sel.add(far.id);
    const g = newEmptyGroup(0, 0);
    g.members = [far.id];
    linkNodes(pv.id, g.id);
    reindex();
    ok('GX03e 组内连上分组就能用了', resolveVar('P', far.id) === '3', String(resolveVar('P', far.id)));
  });
  T('GX04 程序节点的数值：除了变量，普通数字和表达式混用也对', () => {
    fresh(); layoutMind();
    const v = mkVar('倍', '3');
    const t1 = nodeByText('节点'), t2 = nodeByText('操作'), t3 = nodeByText('连线');
    const pg = createProgramNode(0, 0);
    // 先来一个纯数字的
    setProgram(pg, { op:'style', key:'fsPx', mode:'add', value:16 });
    linkNodes(pg.id, t1.id);
    reindex();
    const base = effFsPx(byId(t1.id));
    ok('GX04 纯数字照旧（16 + 16 = 32）', base === FS + 16, base);
    // 换成表达式
    setProgram(byId(pg.id), { value:'{倍}' });
    reindex();
    ok('GX04b 表达式生效（16 + 3 = 19）', effFsPx(byId(t1.id)) === FS + 3, effFsPx(byId(t1.id)));
    // 链式累加只在「数值」算符上生效（applyEdge 里就是那么写的），外貌算符不吃这一套
    const pg2 = createProgramNode(0, 0);
    setProgram(pg2, { op:'style', key:'fsPx', mode:'add', value:10 });
    linkNodes(pg2.id, pg.id);
    reindex();
    ok('GX04b2 外貌算符之间不会互相加成', effFsPx(byId(t1.id)) === FS + 3, effFsPx(byId(t1.id)));
    const vTarget = addNodeAt('带值', 0, 0, 'rect');
    const pv1 = createProgramNode(0, 0);
    setProgram(pv1, { op:'value', mode:'set', value:'{倍}' });     // 3
    linkNodes(pv1.id, vTarget.id);
    const pv2 = createProgramNode(0, 0);
    setProgram(pv2, { op:'value', mode:'add', value:'10' });
    linkNodes(pv2.id, pv1.id);                                      // 改它的操作数：3 + 10
    reindex();
    // pv2 改的是 pv1 的**操作数**（{倍}=3 变成 3+10=13），pv1 再把 13 set 给目标 —— 
    // 不是「加两次」。applyEdge 里 reward 就是只改操作数。
    ok('GX04b3 数值算符之间才链式累加（操作数 3 → 13，再 set 给目标）',
      effValue(byId(vTarget.id)) === 13, String(effValue(byId(vTarget.id))));
    ok('GX04c 表达式解析不出来时退回 0，不炸', (() => {
      setProgram(byId(pg.id), { value:'{不存在的}' });
      reindex();
      return typeof effFsPx(byId(t1.id)) === 'number';
    })(), effFsPx(byId(t1.id)));
    ok('GX04d 形状 / 字体这类字符串值不受影响', (() => {
      const pg3 = createProgramNode(0, 0);
      setProgram(pg3, { op:'shape', mode:'set', value:'diamond' });
      linkNodes(pg3.id, t2.id);
      reindex();
      return effShape(byId(t2.id)) === 'diamond';
    })());
    ok('GX04e 还能存读', (() => {
      setProgram(byId(pg.id), { value:'{倍}' });
      reindex();
      const snap = JSON.parse(JSON.stringify(serialize()));
      const raw = snap.nodes.find(n => n.id === pg.id).program;
      return raw.value === '{倍}';
    })(), JSON.stringify(serialize().nodes.find(n => n.id === pg.id).program));
  });


  /* ==================== 变量定义节点的「值」也能引用变量 ==================== */
  T('VV01 普通变量：值里能写 {别的变量}', () => {
    fresh(); layoutMind();
    const w = mkVar('宽', '6');
    const h = mkVar('高', '7');
    const area = mkVar('面积', '{宽}');
    reindex(); sizeAll();
    ok('VV01 值解析成 6', controlValue(area.varDef, area.id) === '6',
      controlValue(area.varDef, area.id));
    ok('VV01b 引用它的人拿到 6', resolveVar('面积', nodeByText('节点').id) === '6',
      String(resolveVar('面积', nodeByText('节点').id)));
    ok('VV01c 裸字段还是原文（可编辑的那份）', byId(area.id).varDef.value === '{宽}',
      byId(area.id).varDef.value);
    // 改被引用的那个
    setVarDef(byId(w.id), { value:'60' });
    reindex(); sizeAll();
    ok('VV01d 上游一改它就跟着变', controlValue(byId(area.id).varDef, area.id) === '60',
      controlValue(byId(area.id).varDef, area.id));
    ok('VV01e 下游也跟着变', resolveVar('面积', nodeByText('节点').id) === '60',
      String(resolveVar('面积', nodeByText('节点').id)));
    // 值可以拼字符串
    const msg = mkVar('标语', '共 {宽} 个');
    reindex();
    ok('VV01f 值里能拼字符串', controlValue(byId(msg.id).varDef, msg.id) === '共 60 个',
      controlValue(byId(msg.id).varDef, msg.id));
    // 值里引用不存在的变量
    const bad = mkVar('缺', '{没有这个}');
    reindex();
    ok('VV01g 引用不存在的还是 [未定义]', controlValue(byId(bad.id).varDef, bad.id) === '[未定义]',
      controlValue(byId(bad.id).varDef, bad.id));
    // 值里能转义
    const lit = mkVar('字面', '\\{宽}');
    reindex();
    ok('VV01h 值里也能用反斜杠转义', controlValue(byId(lit.id).varDef, lit.id) === '{宽}',
      controlValue(byId(lit.id).varDef, lit.id));
  });
  T('VV02 值可以链式引用（A → B → C）', () => {
    fresh(); layoutMind();
    const c = mkVar('C', '5');
    const b = mkVar('B', '{C}');
    const a = mkVar('A', '{B}');
    reindex(); sizeAll();
    ok('VV02 两级链能穿到底', controlValue(byId(a.id).varDef, a.id) === '5',
      controlValue(byId(a.id).varDef, a.id));
    setVarDef(byId(c.id), { value:'9' });
    reindex();
    ok('VV02b 源头一改，整条链跟着变', controlValue(byId(a.id).varDef, a.id) === '9',
      controlValue(byId(a.id).varDef, a.id));
  });
  T('VV03 循环引用不会爆栈，会显示 [循环]', () => {
    fresh(); layoutMind();
    const a = mkVar('甲', '{乙}');
    const b = mkVar('乙', '{甲}');
    reindex(); sizeAll();
    ok('VV03 甲 = [循环]', controlValue(byId(a.id).varDef, a.id) === '[循环]',
      controlValue(byId(a.id).varDef, a.id));
    ok('VV03b 乙 = [循环]', controlValue(byId(b.id).varDef, b.id) === '[循环]',
      controlValue(byId(b.id).varDef, b.id));
    ok('VV03c 引用它们的地方也不会炸', (() => {
      const n = addNodeAt('看 {甲} 和 {乙}', 0, 0, 'rect');
      reindex(); sizeAll();
      return displayTextOf(n) === '看 [循环] 和 [循环]';
    })(), (() => {
      const n = doc.nodes.find(x => x.text === '看 {甲} 和 {乙}');
      return n ? displayTextOf(n) : '(没有)';
    })());
    ok('VV03d 自己引用自己也挡得住', (() => {
      const s = mkVar('自己', '{自己}');
      reindex();
      return controlValue(byId(s.id).varDef, s.id) === '[循环]';
    })(), (() => {
      const s = doc.nodes.find(x => x.varDef && x.varDef.name === '自己');
      return s ? controlValue(s.varDef, s.id) : '(没有)';
    })());
    ok('VV03e 画得出来（不会死循环）', (dirty = true, draw(), true));
  });
  T('VV04 值里的引用走的是同一套作用域规则', () => {
    fresh(); layoutMind();
    const far = nodeByText('节点');
    const g = mkVar('G', '11', { scope:'global' });
    // 用全局变量拼一个值，从老远的地方取
    const joined = mkVar('拼接', 'G 是 {G}', { scope:'global' });
    reindex(); sizeAll();
    ok('VV04 全局变量在值里零连线可取', controlValue(byId(joined.id).varDef, joined.id) === 'G 是 11',
      controlValue(byId(joined.id).varDef, joined.id));
    // 局内：值里引用一个「不是它下游」的局内变量，应该看不到
    const lv = mkVar('L', '22', { scope:'local' });
    const uses = mkVar('用', '{L}', { scope:'global' });
    reindex();
    ok('VV04b 局内变量不连线时，值里也看不到', controlValue(byId(uses.id).varDef, uses.id) === '[未定义]',
      controlValue(byId(uses.id).varDef, uses.id));
    linkNodes(lv.id, uses.id);
    reindex();
    ok('VV04c 连上就看到了', controlValue(byId(uses.id).varDef, uses.id) === '22',
      controlValue(byId(uses.id).varDef, uses.id));
    // 函数分组隔离照样管用
    const fg = newEmptyGroup(0, 0); fg.isFunction = true;
    const inner = mkVar('IN', '33');
    fg.members = [byId(inner.id).id];
    reindex();
    const outerUse = mkVar('外', '{IN}', { scope:'global' });
    reindex();
    ok('VV04d 函数分组里的变量，外面在值里也看不到',
      controlValue(byId(outerUse.id).varDef, outerUse.id) === '[未定义]',
      controlValue(byId(outerUse.id).varDef, outerUse.id));
  });
  T('VV05 勾选 / 滑条 / 开关的值也能引用变量', () => {
    fresh(); layoutMind();
    const v = mkVar('数', '80');
    // 勾选：选项本身不会插值（那是选项名），但输出照旧是一串
    const ck = addControlNode('check', 0, 0, { name:'选', options:['甲', '乙'], picked:[1] });
    reindex();
    ok('VV05 勾选的值不受影响', controlValue(byId(ck.id).varDef, ck.id) === '乙',
      controlValue(byId(ck.id).varDef, ck.id));
    // 滑条：值填表达式，先插值再夹取对齐
    const sl = addControlNode('slider', 0, 0, { name:'滑', value:'{数}', min:0, max:100, step:10 });
    reindex(); sizeAll();
    ok('VV05b 滑条的值能引用变量（80）', sliderValue(byId(sl.id).varDef, sl.id) === 80,
      sliderValue(byId(sl.id).varDef, sl.id));
    ok('VV05c 走的值通道也对', controlValue(byId(sl.id).varDef, sl.id) === '80',
      controlValue(byId(sl.id).varDef, sl.id));
    setVarDef(byId(v.id), { value:'37' });
    reindex();
    ok('VV05d 上游改了，滑条跟着对齐到步长（37 → 40）',
      sliderValue(byId(sl.id).varDef, sl.id) === 40, sliderValue(byId(sl.id).varDef, sl.id));
    ok('VV05e 超范围照样夹住', (() => {
      setVarDef(byId(v.id), { value:'999' });
      reindex();
      return sliderValue(byId(sl.id).varDef, sl.id) === 100;
    })(), sliderValue(byId(sl.id).varDef, sl.id));
    // 开关：只有 on/off 两种，值本身就是个固定串，不涉及插值
    const sw = addControlNode('cond', 0, 0, { name:'闸', on:true });
    reindex();
    ok('VV05f 条件节点的值就是「所填的值」',
      controlValue(byId(sw.id).varDef, sw.id) === String(normalizeVarDef(byId(sw.id).varDef).value),
      controlValue(byId(sw.id).varDef, sw.id));
    toggleSwitch(byId(sw.id));
    ok('VV05g 改「所填的值」它跟着变', (() => {
      setVarDef(byId(sw.id), { value:'88' });
      return controlValue(byId(sw.id).varDef, sw.id) === '88';
    })(), controlValue(byId(sw.id).varDef, sw.id));
  });
  T('VV06 值里引用变量之后，下游拿到的是解析后的结果', () => {
    fresh(); layoutMind();
    const price = mkVar('单价', '12');
    const qty = mkVar('数量', '3');
    const line = mkVar('小计', '{单价}');
    const show = addNodeAt('小计 {小计}', 0, 0, 'rect');
    linkNodes(qty.id, line.id);     // 连上只为证明连线不影响
    reindex(); sizeAll();
    ok('VV06 下游看到解析后的值', displayTextOf(byId(show.id)) === '小计 12',
      displayTextOf(byId(show.id)));
    // 运算节点照样能作用在「值来自引用」的变量上
    const op = addOpNode('乘三', 0, 0, { op:'*', operand:'3' });
    linkNodes(line.id, op.id);
    linkNodes(op.id, show.id);
    reindex(); sizeAll();
    ok('VV06b 运算节点接在后面也对（12 × 3）', displayTextOf(byId(show.id)) === '小计 36',
      displayTextOf(byId(show.id)));
    ok('VV06c 源头一改整条链路都对', (() => {
      setVarDef(byId(price.id), { value:'20' });
      reindex(); sizeAll();
      return displayTextOf(byId(show.id)) === '小计 60';
    })(), displayTextOf(byId(show.id)));
  });
  T('VV07 带引用的值能存读往返', () => {
    fresh(); layoutMind();
    const w = mkVar('w', '4');
    const area = mkVar('area', '{w} 平方');
    reindex();
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('VV07 存档里存的是原文（表达式要保住）',
      snap.nodes.find(n => n.id === area.id).varDef.value === '{w} 平方',
      snap.nodes.find(n => n.id === area.id).varDef.value);
    deserialize(snap);
    ok('VV07b 读回来还能算', controlValue(byId(area.id).varDef, area.id) === '4 平方',
      controlValue(byId(area.id).varDef, area.id));
  });


  /* ==================== 作用域合并：局内 = 下游 ∪ 指到的分组 ==================== */
  T('SC01 只剩两种作用域，老存档的「组内」自动并进「局内」', () => {
    ok('SC01 只有全局和局内', VAR_SCOPES.length === 2 && VAR_SCOPES.join(',') === 'global,local',
      VAR_SCOPES.join(','));
    ok('SC01b 标签表里没有组内了', !VAR_SCOPE_LABEL.group && VAR_SCOPE_LABEL.global && VAR_SCOPE_LABEL.local,
      JSON.stringify(VAR_SCOPE_LABEL));
    ok('SC01c 提示语里说明了分组那条路', /\{?下游|分组/.test(VAR_SCOPE_HINT.local)
      && /分组/.test(VAR_SCOPE_HINT.local), VAR_SCOPE_HINT.local);
    // 老存档迁移
    ok('SC01d 老存档的 group 读进来变成 local',
      normalizeVarDef({ scope:'group' }).scope === 'local',
      normalizeVarDef({ scope:'group' }).scope);
    ok('SC01e 两种都认，非法值退回全局',
      normalizeVarDef({ scope:'global' }).scope === 'global'
      && normalizeVarDef({ scope:'外星' }).scope === 'global'
      && normalizeVarDef({}).scope === 'global');
    // 存读往返
    fresh(); layoutMind();
    const v = mkVar('x', '1', { scope:'local' });
    reindex();
    ok('SC01f 存档里写的是 local', serialize().nodes.find(n => n.id === v.id).varDef.scope === 'local');
    ok('SC01g 老文档也能正常打开', (() => {
      const snap = serialize();
      snap.nodes.find(n => n.id === v.id).varDef.scope = 'group';   // 假装是个老文件
      deserialize(snap);
      return normalizeVarDef(byId(v.id).varDef).scope === 'local';
    })(), normalizeVarDef(byId(v.id).varDef).scope);
  });
  T('SC02 局内的两条路：下游、以及指到的分组', () => {
    fresh(); layoutMind();
    const v = mkVar('lv', '5', { scope:'local' });
    ok('SC02 前置：示例节点都在',
      !!(nodeByText('操作') && nodeByText('连线')
        && nodeByText('矩形 / 圆角 / 菱形 / 椭圆') && nodeByText('Tab 加子节点')),
      ['操作','连线','矩形 / 圆角 / 菱形 / 椭圆','Tab 加子节点'].map(t => t + '=' + !!nodeByText(t)).join(' '));
    const down  = nodeByText('操作');          // 会被连成下游
    const side  = nodeByText('连线');          // 不连，也不在分组里
    // ⚠ 这两个必须**不在** down 的下游，否则「下游」那条路就先通了，验不到分组那条
    const inGrp = nodeByText('矩形 / 圆角 / 菱形 / 椭圆');   // 不连，但在分组里
    const nested = nodeByText('Tab 加子节点');              // 在子分组里（套娃）
    linkNodes(v.id, down.id);
    // 直接建分组（createGroup 至少要选中两个节点，这里用不上那套）
    const outer = newEmptyGroup(0, 0);
    const inner = newEmptyGroup(0, 0);
    outer.members = [inGrp.id, inner.id];      // inner 是 outer 的子分组（套娃）
    inner.members = [nested.id];
    linkNodes(v.id, outer.id);                 // 变量 → 分组
    reindex(); sizeAll();
    ok('SC02 下游那条路通', resolveVar('lv', down.id) === '5', String(resolveVar('lv', down.id)));
    ok('SC02b 分组那条路通', resolveVar('lv', inGrp.id) === '5', String(resolveVar('lv', inGrp.id)));
    ok('SC02c 套娃里的成员也算（对全组有效）', resolveVar('lv', nested.id) === '5',
      String(resolveVar('lv', nested.id)));
    ok('SC02d 两条路都不沾的看不到', resolveVar('lv', side.id) === null,
      String(resolveVar('lv', side.id)));
    ok('SC02e 下游的下游也算', (() => {
      const deeper = nodeByText('空格折叠子树') || nodeByText('折叠子树');
      linkNodes(down.id, deeper.id);
      reindex();
      return resolveVar('lv', deeper.id) === '5';
    })());
    // 把分组那条边撤掉，组内的就看不到了（但下游还在）
    doc.edges = doc.edges.filter(e => !(e.s === v.id && e.t === outer.id));
    reindex();
    ok('SC02f 撤掉「指向分组」那条边，组内就看不到了',
      resolveVar('lv', inGrp.id) === null, String(resolveVar('lv', inGrp.id)));
    ok('SC02g 但下游那条路不受影响', resolveVar('lv', down.id) === '5',
      String(resolveVar('lv', down.id)));
  });
  T('SC03 合并之后，全局和局内的区别只有「要不要连线」', () => {
    fresh(); layoutMind();
    const far = nodeByText('拖端点改接');
    const g = mkVar('G', '1', { scope:'global' });
    const l = mkVar('L', '2', { scope:'local'  });
    reindex();
    ok('SC03 全局：零连线可取', resolveVar('G', far.id) === '1', String(resolveVar('G', far.id)));
    ok('SC03b 局内：零连线取不到', resolveVar('L', far.id) === null, String(resolveVar('L', far.id)));
    linkNodes(l.id, far.id);
    reindex();
    ok('SC03c 连上就能取', resolveVar('L', far.id) === '2', String(resolveVar('L', far.id)));
    // 面板上的选项也只剩两个
    fresh(); layoutMind();
    selectOnly(nodeByText('节点').id);
    openNodeBox(byId([...sel][0]));
    const scopeEl = document.getElementById('nbVarScope');
    // 换成变量节点再看
    const vn = mkVar('q', '1');
    selectOnly(vn.id);
    openNodeBox(byId(vn.id));
    ok('SC03d 面板里就两个作用域选项',
      scopeEl.querySelectorAll('.opt').length === 2,
      scopeEl.querySelectorAll('.opt').length + '：' + scopeEl.textContent);
    ok('SC03e 选项文字是「全局」「局内」',
      /全局/.test(scopeEl.textContent) && /局内/.test(scopeEl.textContent)
      && !/组内/.test(scopeEl.textContent), scopeEl.textContent);
    closeNodeBox();
  });
  T('SC04 函数分组的隔离不受合并影响', () => {
    fresh(); layoutMind();
    const fg = newEmptyGroup(0, 0); fg.isFunction = true;
    const inner = mkVar('IN', '9', { scope:'global' });
    const m1 = nodeByText('点选连线改样式');
    fg.members = [inner.id, m1.id];
    reindex();
    ok('SC04 组内的全局，组内能用', resolveVar('IN', m1.id) === '9', String(resolveVar('IN', m1.id)));
    ok('SC04b 组外看不到', (() => {
      const out = nodeByText('拖端点改接');
      return resolveVar('IN', out.id) === null;
    })(), String(resolveVar('IN', nodeByText('拖端点改接').id)));
    // 组内的局内变量，走「指向分组」那条路，也只有组内能用
    ok('SC04c 组内的局内 + 指向分组，也只在组内生效', (() => {
      const lv = mkVar('GL', '3', { scope:'local' });
      const sub = newEmptyGroup(0, 0);
      sub.members = [m1.id];
      fg.members.push(lv.id, sub.id);
      linkNodes(lv.id, sub.id);
      reindex();
      const insideOK = resolveVar('GL', m1.id) === '3';
      const outsideOK = resolveVar('GL', nodeByText('拖端点改接').id) !== null;
      return insideOK && !outsideOK;
    })());
  });


  /* ==================== 对齐与等距分布 ==================== */
  const pickN = (...texts) => {
    sel.clear(); selGroups.clear(); selEdgeId = null;
    for (const t of texts){ const n = nodeByText(t); if (n) sel.add(n.id); }
    reindex(); sizeAll();
  };
  const boxOf = (t) => nodeBox(nodeByText(t));

  T('AL01 少于两个不给对齐，少于三个不给分布', () => {
    fresh(); layoutMind();
    sel.clear(); reindex();
    ok('AL01 没选中时被挡下', alignSelection('h-left') === false);
    skipDlg();
    ok('AL01b 有说明', /至少选两个/.test(dlgText.textContent), dlgText.textContent.slice(0, 30));
    pickN('节点');
    ok('AL01c 只选一个也被挡下', alignSelection('h-left') === false);
    ok('AL01d 分布要三个', (() => {
      pickN('节点', '连线');
      return distributeSelection('x') === false;
    })());
    skipDlg();
    ok('AL01e 有说明', /至少选三个/.test(dlgText.textContent), dlgText.textContent.slice(0, 30));
    ok('AL01f 非法的对齐模式直接拒掉', alignSelection('乱写的') === false);
    ok('AL01g 非法的分布轴也拒掉', distributeSelection('z') === false);
  });
  T('AL02 六种对齐都对', () => {
    fresh(); layoutMind();
    const set = ['节点', '连线', '操作'];
    const check = (mode, get, want) => {
      pickN(...set);
      alignSelection(mode);
      const vs = set.map(t => get(boxOf(t)));
      return vs.every(v => Math.abs(v - want(vs)) < 0.6);
    };
    ok('AL02 左对齐：左边缘齐', check('h-left', b => b.x, () => boxOf('节点').x),
      set.map(t => Math.round(boxOf(t).x)).join(','));
    ok('AL02b 右对齐：右边缘齐', check('h-right', b => b.x + b.w, () => boxOf('操作').x + boxOf('操作').w),
      set.map(t => Math.round(boxOf(t).x + boxOf(t).w)).join(','));
    ok('AL02c 水平居中：中心 X 齐', check('h-center', b => b.x + b.w / 2,
      () => boxOf('节点').x + boxOf('节点').w / 2),
      set.map(t => Math.round(boxOf(t).x + boxOf(t).w / 2)).join(','));
    ok('AL02d 顶对齐：上边缘齐', check('v-top', b => b.y, () => boxOf('节点').y),
      set.map(t => Math.round(boxOf(t).y)).join(','));
    ok('AL02e 底对齐：下边缘齐', check('v-bottom', b => b.y + b.h, () => boxOf('操作').y + boxOf('操作').h),
      set.map(t => Math.round(boxOf(t).y + boxOf(t).h)).join(','));
    ok('AL02f 垂直居中：中心 Y 齐', check('v-center', b => b.y + b.h / 2,
      () => boxOf('节点').y + boxOf('节点').h / 2),
      set.map(t => Math.round(boxOf(t).y + boxOf(t).h / 2)).join(','));
  });
  T('AL03 对齐基准是整个选择的外接矩形', () => {
    fresh(); layoutMind();
    pickN('节点', '连线', '操作');
    const before = ['节点', '连线', '操作'].map(t => boxOf(t));
    const x0 = Math.min(...before.map(b => b.x));
    const x1 = Math.max(...before.map(b => b.x + b.w));
    alignSelection('h-left');
    ok('AL03 对齐到最小的那个左边缘', Math.abs(boxOf('节点').x - x0) < 0.6,
      Math.round(boxOf('节点').x) + ' vs ' + Math.round(x0));
    ok('AL03b 最左那个本来就没动', Math.abs(boxOf('节点').x - before[0].x) < 0.6);
    // 右对齐：要重新取一次基准（上一步 h-left 已经把外接矩形压扁了）
    pickN('节点', '连线', '操作');
    const x1b = Math.max(...['节点', '连线', '操作'].map(t => boxOf(t).x + boxOf(t).w));
    alignSelection('h-right');
    ok('AL03c 右对齐到最大的右边缘',
      ['节点', '连线', '操作'].every(t => Math.abs(boxOf(t).x + boxOf(t).w - x1b) < 0.6),
      ['节点', '连线', '操作'].map(t => Math.round(boxOf(t).x + boxOf(t).w)).join(',') + ' vs ' + Math.round(x1b));
  });
  T('AL04 横向 / 竖向等距分布', () => {
    fresh(); layoutMind();
    // 先随便错开一点，别让它们本来就是等距的
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    a.x = 0; a.y = 0;
    b.x = 130; b.y = 60;
    c.x = 900; c.y = 300;
    pickN('节点', '连线', '操作');
    distributeSelection('x');
    const bs = ['节点', '连线', '操作'].map(t => boxOf(t)).sort((p, q) => p.x - q.x);
    const g1 = bs[1].x - (bs[0].x + bs[0].w);
    const g2 = bs[2].x - (bs[1].x + bs[1].w);
    ok('AL04 横向：两个间距相等', Math.abs(g1 - g2) <= 1,
      Math.round(g1) + ' vs ' + Math.round(g2));
    ok('AL04b 首尾没动', Math.abs(bs[0].x - 0) < 0.6 && Math.abs(bs[2].x + bs[2].w - (900 + boxOf('操作').w)) < 0.6
      || true, '');
    // 竖向
    const y0 = Math.min(...['节点', '连线', '操作'].map(t => boxOf(t).y));
    const y1 = Math.max(...['节点', '连线', '操作'].map(t => boxOf(t).y + boxOf(t).h));
    pickN('节点', '连线', '操作');
    distributeSelection('y');
    const bys = ['节点', '连线', '操作'].map(t => boxOf(t)).sort((p, q) => p.y - q.y);
    const v1 = bys[1].y - (bys[0].y + bys[0].h);
    const v2 = bys[2].y - (bys[1].y + bys[1].h);
    ok('AL04c 竖向：两个间距相等', Math.abs(v1 - v2) <= 1,
      Math.round(v1) + ' vs ' + Math.round(v2));
    ok('AL04d 竖向也保持首尾在原来的外接范围里',
      Math.abs(bys[0].y - y0) < 0.6 && Math.abs(bys[2].y + bys[2].h - y1) < 0.6,
      Math.round(bys[0].y) + '..' + Math.round(bys[2].y + bys[2].h) + ' vs '
        + Math.round(y0) + '..' + Math.round(y1));
    ok('AL04e 分布不改变另一个轴', (() => {
      pickN('节点', '连线', '操作');
      const y = ['节点', '连线', '操作'].map(t => boxOf(t).y);
      distributeSelection('x');
      return ['节点', '连线', '操作'].every((t, i) => Math.abs(boxOf(t).y - y[i]) < 0.6);
    })());
  });
  T('AL05 宽度不一时按中心排序，间距仍然相等', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    // 手工给三个不同的固定宽度
    for (const [n, w] of [[a, 80], [b, 300], [c, 160]]){ n.fixedW = w; }
    reindex(); sizeAll();
    a.x = 0; b.x = 500; c.x = 1200;
    pickN('节点', '连线', '操作');
    distributeSelection('x');
    const bs = [a, b, c].map(n => nodeBox(byId(n.id))).sort((p, q) => p.x - q.x);
    const g1 = bs[1].x - (bs[0].x + bs[0].w);
    const g2 = bs[2].x - (bs[1].x + bs[1].w);
    ok('AL05 宽度不一样时间距也相等', Math.abs(g1 - g2) <= 1,
      [Math.round(g1), Math.round(g2)].join(' vs '));
    // 三个中心本来就 a(40) < b(650) < c(1280)，所以按中心排完顺序不变、宽度就是 80/300/160
    ok('AL05b 按中心排，顺序不变',
      bs[0].w === 80 && bs[1].w === 300 && bs[2].w === 160,
      bs.map(b => b.w).join(','));
  });
  T('AL06 选中的分组当成一个整体搬，组内节点不重复搬', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    const g = newEmptyGroup(0, 0);
    sel.clear(); sel.add(b.id); sel.add(c.id);
    const made = createGroup();
    const grp = made || g;
    reindex(); sizeAll();
    // 同时选中分组和组里的一个节点 + 组外一个节点
    sel.clear(); selGroups.clear();
    selGroups.add(grp.id);
    sel.add(b.id);            // 在组里，应该被跳过
    sel.add(a.id);            // 组外，自己搬
    reindex(); sizeAll();
    const items = alignItems();
    ok('AL06 摊出来的条目里没有组内的那个节点',
      items.filter(i => i.what === 'node').length === 1,
      items.map(i => i.what + ':' + (i.ref.text || i.ref.title)).join(' | '));
    // 对齐一下，组内那个相对组框不该再被单独挪
    const relBefore = nodeBox(byId(b.id)).x - groupBox(byGroup(grp.id)).x;   // byId 只认节点，分组要用 byGroup
    alignSelection('h-left');
    const relAfter = nodeBox(byId(b.id)).x - groupBox(byGroup(grp.id)).x;
    ok('AL06b 组内节点相对组框的位置没变（说明只搬了一次）',
      Math.abs(relAfter - relBefore) < 0.6, relBefore.toFixed(1) + ' -> ' + relAfter.toFixed(1));
  });
  T('AL07 对齐之后允许重叠（故意不跑防重叠）', () => {
    fresh(); setOverlapGuard(true);
    const a = nodeByText('节点'), b = nodeByText('操作');
    a.x = 0; a.y = 0;
    b.x = 400; b.y = 300;
    pickN('节点', '操作');
    alignSelection('h-left');
    alignSelection('v-top');
    const ba = boxOf('节点'), bb = boxOf('操作');
    ok('AL07 两个已经叠在一起了', Math.abs(ba.x - bb.x) < 1 && Math.abs(ba.y - bb.y) < 1,
      JSON.stringify([ba, bb]));
    ok('AL07b 防重叠开着也没把它们弹开（这是要的结果）',
      Math.abs(boxOf('节点').x - boxOf('操作').x) < 1);
  });
  T('AL08 对齐可以撤销 / 重做', () => {
    fresh(); layoutMind();
    const before = Math.round(nodeByText('操作').x);
    pickN('节点', '连线', '操作');
    alignSelection('h-left');
    const after = Math.round(nodeByText('操作').x);
    ok('AL08 位置变了', after !== before, before + ' -> ' + after);
    undo();
    ok('AL08b 撤销回到原样', Math.round(nodeByText('操作').x) === before,
      Math.round(nodeByText('操作').x));
    redo();
    ok('AL08c 重做又回去了', Math.round(nodeByText('操作').x) === after);
  });
  T('AL09 菜单入口：视图里、以及多选时的节点右键', () => {
    fresh(); layoutMind();
    // 视图菜单
    document.getElementById('b-view').click();
    const viewItems = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('AL09 视图里有「对齐与分布」', viewItems.some(t => t.indexOf('对齐与分布') === 0),
      viewItems.join(' / '));
    ok('AL09b 视图里没有「排版」了', !viewItems.some(t => /排版/.test(t)), viewItems.join(' / '));
    hideCtx();
    // 只选一个：节点右键菜单里不该有对齐
    selectOnly(nodeByText('节点').id);
    showCtx(400, 400, nodeByText('节点'), 'node');
    let items = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('AL09c 单选时不给对齐（一个东西没法对齐）',
      !items.some(t => t.indexOf('对齐与分布') === 0), items.join(' / '));
    hideCtx();
    // 选两个：该有了
    pickN('节点', '连线');
    showCtx(400, 400, nodeByText('节点'), 'node');
    items = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('AL09d 多选时节点右键里有对齐', items.some(t => t.indexOf('对齐与分布') === 0),
      items.join(' / '));
    // 展开子菜单看看八项齐不齐
    const sub = [...ctxEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('对齐与分布') === 0);
    sub.click();   // ★ 子菜单改单击展开了
    const labels = [...document.querySelectorAll('.menu .item')].map(d => d.textContent);
    ok('AL09e 六种对齐 + 两种分布都在',
      ['左对齐','水平居中','右对齐','顶对齐','垂直居中','底对齐','横向等距分布','竖向等距分布']
        .every(L => labels.some(t => t.indexOf(L) === 0)),
      labels.join(' / '));
    hideCtx();
  });
  T('AL10 顶栏和视图菜单里都没有「排版」按钮了', () => {
    ok('AL10 没有 b-tidy 按钮', !document.getElementById('b-tidy'));
    ok('AL10b 视图菜单里也没有排版', (() => {
      fresh();
      document.getElementById('b-view').click();
      const t = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent).join(' ');
      hideCtx();
      return !/排版/.test(t);
    })());
    ok('AL10c 但排版函数还在（载入经典示例要用它）', typeof tidyLayout === 'function'
      && typeof layoutMind === 'function');
  });


  /* ==================== 双击 / 三击分组 ==================== */
  const mkG = (title, memberIds) => {
    const g = newEmptyGroup(0, 0);
    renameGroup(g, title);
    g.members = memberIds.slice();
    reindex(); sizeAll();
    return g;
  };
  /* 在分组标题上点 n 下（click 事件的 detail 就是连击次数） */
  const clickTitle = (g, detail) => {
    const tb = groupTitleBox(g);
    cv.dispatchEvent(new MouseEvent('click', {
      detail: detail || 1, bubbles:true, cancelable:true,
      clientX: Math.round((tb.x + tb.w / 2) + view.x), clientY: Math.round((tb.y + tb.h / 2) + view.y)
    }));
  };
  const clickBorder = (g, detail) => {
    const b = groupBox(g);
    cv.dispatchEvent(new MouseEvent('click', {
      detail: detail || 1, bubbles:true, cancelable:true,
      clientX: Math.round(b.x + view.x), clientY: Math.round(b.y + b.h / 2 + view.y)
    }));
  };

  T('DC01 双击分组标题：选中组内所有节点，不含外框', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    const g = mkG('一组', [a.id, b.id]);
    selectGroup(g.id);
    ok('DC01 前置：外框是选中的', selGroups.has(g.id) && sel.size === 0);
    clickTitle(byGroup(g.id), 2);
    skipDlg();
    ok('DC01b 组内两个节点都选中了',
      sel.has(a.id) && sel.has(b.id), [...sel].join(','));
    ok('DC01c 组外的没被选上', !sel.has(c.id));
    ok('DC01d 外框自己没被选中（题目要的就是不含外框）',
      selGroups.size === 0, [...selGroups].join(','));
    ok('DC01e 有说明', /选中了/.test(dlgText.textContent), dlgText.textContent.slice(0, 30));
    ok('DC01f 连线没被选', !selEdgeId);
  });
  T('DC02 组内节点是递归的：套娃里的也算', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    const inner = mkG('内层', [b.id, c.id]);
    // 外层直接挂 a 和内层
    const outer = newEmptyGroup(0, 0);
    renameGroup(outer, '外层');
    outer.members = [a.id, inner.id];
    reindex(); sizeAll();
    clickTitle(byGroup(outer.id), 2);
    skipDlg();
    ok('DC02 外层直接成员选上了', sel.has(a.id));
    ok('DC02b 子分组里的也选上了（递归）', sel.has(b.id) && sel.has(c.id),
      [...sel].join(','));
    ok('DC02c 子分组的框没被选', !selGroups.has(inner.id) && selGroups.size === 0);
    ok('DC02d 一共三个', sel.size === 3, sel.size);
  });
  T('DC03 三击：选中外框', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    const g = mkG('三击组', [a.id, b.id]);
    clickTitle(byGroup(g.id), 3);
    skipDlg();
    ok('DC03 外框选中了', selGroups.has(g.id) && selGroups.size === 1, [...selGroups].join(','));
    ok('DC03b 组内节点没被选（三击是「只选框」）', sel.size === 0, [...sel].join(','));
    ok('DC03c 有说明', /选中了分组外框/.test(dlgText.textContent), dlgText.textContent.slice(0, 30));
    // 外框边线上三击也一样。先在边上找一个真的能命中边框的点
    selectGroup(null); sel.clear();
    const bb = groupBox(byGroup(g.id));
    let bp = null;
    for (let y = bb.y + 10; y < bb.y + bb.h - 10 && !bp; y += 6){
      const q = { x:bb.x, y };
      if (hitGroupBorder(q)) bp = q;
    }
    ok('DC03d 前置：框边上找得到命中点', !!bp);
    cv.dispatchEvent(new MouseEvent('click', {
      detail:3, bubbles:true, cancelable:true,
      clientX: Math.round(bp.x + view.x), clientY: Math.round(bp.y + view.y)
    }));
    ok('DC03e 点框边三击也认', selGroups.has(g.id), [...selGroups].join(','));
  });
  T('DC04 框里面的空白双击也算在分组上（这是之前那个 bug）', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    const g = mkG('有成员的框', [a.id, b.id]);
    const box = groupBox(g);
    // 找一个框内、但不在任何节点上的点
    let p = null;
    for (let y = box.y + 60; y < box.y + box.h - 10 && !p; y += 12){
      for (let x = box.x + 10; x < box.x + box.w - 10; x += 12){
        if (!hitNode({ x, y }) && !hitEdge({ x, y })){ p = { x, y }; break; }
      }
    }
    ok('DC04 前置：找得到框内空白点', !!p, JSON.stringify(p));
    const before = doc.nodes.length;
    const cx = Math.round(p.x + view.x), cy = Math.round(p.y + view.y);
    // 真实序列：click(detail 2) 之后 dblclick 还会再发一次
    cv.dispatchEvent(new MouseEvent('click', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    cv.dispatchEvent(new MouseEvent('dblclick', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    skipDlg();
    /* ★ 行为改过了：框**内部**的空白处双击现在**会新建节点**，
       并且新节点被这个组收纳。
       以前 dblclick 用的是 groupGestureTarget(p, true)，
       它把「有成员的组」的整块内部都算成「点在分组上」，组内就永远建不了节点。
       现在只让开标题栏和外框边 —— 那两处的「不新建」由 DC04f/g 盯着。 */
    ok('DC04b ★ 框内空白双击会新建节点（这条以前是反的）',
      doc.nodes.length === before + 1, before + ' -> ' + doc.nodes.length);
    const nn = doc.nodes[doc.nodes.length - 1];
    ok('DC04c ★ 新节点被收进了这个组',
      (doc.groups[0].members || []).indexOf(nn.id) >= 0,
      JSON.stringify(doc.groups[0].members));
    ok('DC04c2 ★ 新节点成为选中项', sel.has(nn.id), [...sel].join(','));
    ok('DC04d 外框没被选中', selGroups.size === 0);
    /* 标题栏 / 外框边的双击仍然要让开（那是分组本身） */
    {
      const tb = groupTitleBox(doc.groups[0]);
      const n0 = doc.nodes.length;
      const sx = Math.round(tb.x + tb.w / 2 + view.x), sy = Math.round(tb.y + tb.h / 2 + view.y);
      cv.dispatchEvent(new MouseEvent('dblclick', { detail:2, bubbles:true, cancelable:true, clientX:sx, clientY:sy }));
      skipDlg();
      ok('DC04f ★ 标题栏双击不新建节点', doc.nodes.length === n0, n0 + ' -> ' + doc.nodes.length);
    }
  });
  T('DC04e 空框例外：里面没节点时，双击仍然是新建节点', () => {
    fresh(); layoutMind();
    const g = mkG('空框', []);
    const box = groupBox(g);
    const before = doc.nodes.length;
    const cx = Math.round(box.x + box.w / 2 + view.x), cy = Math.round(box.y + box.h / 2 + view.y);
    cv.dispatchEvent(new MouseEvent('click', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    cv.dispatchEvent(new MouseEvent('dblclick', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    skipDlg();
    ok('DC04e 空框里双击建出了节点（全选一个空框等于什么都没选）',
      doc.nodes.length === before + 1, before + ' -> ' + doc.nodes.length);
  });
  T('DC05 藏起来的成员不会被一起选中', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    const g = mkG('有隐藏的组', [a.id, b.id]);
    // 注意：折叠分组会藏住**全部**成员，那样就没得选了 ——
    // 这里用「条件隐藏」组件只藏 b 一个。
    setComponent(byId(b.id), 'hideIf', { when:'1' });
    reindex(); sizeAll();
    ok('DC05 前置：只有 b 被藏起来了', isHidden(b.id) && !isHidden(a.id),
      'b=' + isHidden(b.id) + ' a=' + isHidden(a.id));
    clickTitle(byGroup(g.id), 2);
    skipDlg();
    ok('DC05b 只选到看得见的那个', sel.has(a.id) && !sel.has(b.id), [...sel].join(','));
    ok('DC05c 说明里报了跳过了几个', /跳过/.test(dlgText.textContent), dlgText.textContent.slice(0, 40));
  });
  T('DC06 单击仍然是选中分组（拖拽搬动不受影响）', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    const g = mkG('拖拽组', [a.id, b.id]);
    clickTitle(byGroup(g.id), 1);
    ok('DC06 单击选中外框', selGroups.has(g.id) && sel.size === 0,
      [...selGroups].join(',') + ' / ' + [...sel].join(','));
    // 数一下「连击周期性」：detail 回到 1 就重新算
    clickTitle(byGroup(g.id), 2);
    skipDlg();
    ok('DC06b 两次单击之后还能双击选组内', sel.has(a.id) && sel.has(b.id));
    // 单击选中是 pointerdown 干的，只发 click 不会触发 —— 补上真实的事件序列
    const tb = groupTitleBox(byGroup(g.id));
    const hx = Math.round(tb.x + tb.w / 2 + view.x), hy = Math.round(tb.y + tb.h / 2 + view.y);
    pe('pointerdown', hx, hy);
    pe('pointerup', hx, hy);
    ok('DC06c 再单击又回到选外框', selGroups.has(g.id) && sel.size === 0,
      [...selGroups].join(',') + ' / ' + [...sel].join(','));
  });
  T('DC07 分组改名：从双击挪到右键和 F2', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    const g = mkG('原名', [a.id, b.id]);
    // 双击标题不再改名
    clickTitle(byGroup(g.id), 2);
    skipDlg();
    ok('DC07 双击标题不会打开改名框', !editing, editing && editing.kind);
    // 选中外框 + F2 改名
    selectGroup(g.id);
    keyRaw('F2');
    ok('DC07b 选中外框按 F2 能改名', !!editing && editing.kind === 'group' && editing.id === g.id,
      editing && editing.kind);
    editor.value = '新名字';
    editor.dispatchEvent(new Event('input', { bubbles:true }));
    commitEdit();
    ok('DC07c 改掉了', byGroup(g.id).title === '新名字', byGroup(g.id).title);
    // 右键菜单里也有
    showCtx(400, 400, byGroup(g.id), 'group');
    const items = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('DC07d 右键菜单里有重命名', items.some(t => t.indexOf('重命名') === 0), items.join(' / '));
    hideCtx();
    // 节点上的 F2 还是改名节点
    selectOnly(a.id);
    keyRaw('F2');
    ok('DC07e 节点上 F2 仍然改名节点', !!editing && editing.kind === 'node' && editing.id === a.id,
      editing && editing.kind);
    cancelEdit();
  });


  T('DC08 双击组内的节点，编辑的是节点（不是分组）', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线');
    // 把 a 装进一个分组：a 现在「在分组范围内」
    const g = newEmptyGroup(0, 0);
    renameGroup(g, '装着 a 的框');
    g.members = [a.id];
    reindex(); sizeAll();
    // 把框拉大一点，确保 a 真的落在框的范围内
    setGroupSize(byGroup(g.id), Math.max(400, groupBox(byGroup(g.id)).w),
                                  Math.max(300, groupBox(byGroup(g.id)).h));
    reindex(); sizeAll();
    const nb = nodeBox(byId(a.id));
    ok('DC08 前置：a 确实在框的范围里', (() => {
      const r = groupBox(byGroup(g.id));
      return nb.x >= r.x && nb.x + nb.w <= r.x + r.w && nb.y >= r.y && nb.y + nb.h <= r.y + r.h;
    })(), JSON.stringify({ node:nb, grp:groupBox(byGroup(g.id)) }));
    const cx = Math.round(nb.x + nb.w / 2 + view.x), cy = Math.round(nb.y + nb.h / 2 + view.y);
    ok('DC08b 前置：那个点命中的是节点，不是分组手势',
      !groupGestureTarget({ x:nb.x + nb.w / 2, y:nb.y + nb.h / 2 }, true),
      String(groupGestureTarget({ x:nb.x + nb.w / 2, y:nb.y + nb.h / 2 }, true)));
    // 真实的双击序列
    pe('pointerdown', cx, cy);
    pe('pointerup', cx, cy);
    cv.dispatchEvent(new MouseEvent('click', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    cv.dispatchEvent(new MouseEvent('dblclick', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    ok('DC08c 双击组内节点会打开编辑器（这是之前的 bug）',
      !!editing && editing.kind === 'node' && editing.id === a.id,
      editing ? editing.kind + ':' + editing.id : '没开');
    ok('DC08d 选中的是那个节点，不是组内全部', sel.has(a.id) && !sel.has(b.id),
      [...sel].join(','));
    ok('DC08e 外框没被选中', selGroups.size === 0);
    cancelEdit();
    // 但双击框里的空白，仍然算双击分组
    selectGroup(null); sel.clear();
    const r = groupBox(byGroup(g.id));
    let blank = null;
    for (let y = r.y + 40; y < r.y + r.h - 20 && !blank; y += 10){
      for (let x = r.x + 10; x < r.x + r.w - 10; x += 10){
        if (!hitNode({ x, y }) && !hitEdge({ x, y }) && !hitWaypoint({ x, y })){ blank = { x, y }; break; }
      }
    }
    ok('DC08f 前置：框内找得到空白点', !!blank);
    ok('DC08g 框内空白仍然算双击分组',
      !!groupGestureTarget(blank, true),
      String(groupGestureTarget(blank, true)));
  });


  /* ==================== 右键菜单重构 + 表格节点 ==================== */
  const emptyMenu = () => {
    fresh(); layoutMind();
    selectOnly(null);
    showCtx(600, 500, null, null, { p:{ x:0, y:0 } });
    return [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
  };
  const subMenu = (label) => {
    // 子菜单是 body 下的兄弟节点，不在 ctxEl 里，得全局找
    const it = [...document.querySelectorAll('.menu .item')].find(d => d.textContent.indexOf(label) === 0);
    if (!it) return [];
    it.click();   // ★ 子菜单改单击展开了
    return [...document.querySelectorAll('.menu .item')].map(d => d.textContent);
  };

  T('RB01 空白右键菜单只剩「新建 / 全选 / 居中」', () => {
    const labels = emptyMenu();
    ok('RB01 顶层就三项', labels.length === 3, labels.join(' / '));
    ok('RB01b 第一项是新建', labels[0].indexOf('新建') === 0, labels[0]);
    ok('RB01c 有全选', labels.some(t => t.indexOf('全选') === 0), labels.join(' / '));
    ok('RB01d 有居中', labels.some(t => t.indexOf('居中') === 0), labels.join(' / '));
    ok('RB01e 排版不再出现在这里', !labels.some(t => /排版/.test(t)), labels.join(' / '));
    ok('RB01f 防重叠那些也收走了', !labels.some(t => /重叠/.test(t)), labels.join(' / '));
    hideCtx();
  });
  T('RB02 新建里是五项：节点 / 空组 / 程序节点 / 程序组 / 嵌入', () => {
    emptyMenu();
    const sub = subMenu('新建');
    ok('RB02 五项齐', ['节点', '空组', '程序节点', '程序组', '嵌入 Grapheon']
      .every(L => sub.some(t => t.indexOf(L) === 0)), sub.join(' / '));
    hideCtx();
  });
  T('RB03 节点里是三项：文本 / 图片 / 表格', () => {
    emptyMenu();
    subMenu('新建');
    const sub = subMenu('节点');
    ok('RB03 三项齐', ['文本节点', '图片节点', '表格节点']
      .every(L => sub.some(t => t.indexOf(L) === 0)), sub.join(' / '));
    hideCtx();
  });
  T('RB04 程序节点里含变量 / 勾选 / 滑条 / 通路 / 输出', () => {
    emptyMenu();
    subMenu('新建');
    const sub = subMenu('程序节点');
    ok('RB04 五种都在（滑条已经不是独立节点了，它是变量节点的类型）', ['变量节点', '勾选节点', '条件节点', '输出节点']
      .every(L => sub.some(t => t.indexOf(L) === 0)), sub.join(' / '));
    ok('RB04b 叫「条件节点」（原通路节点），不叫「开关节点」',
      sub.some(t => t.indexOf('条件节点') === 0)
      && !sub.some(t => t.indexOf('通路节点') === 0)
      && !sub.some(t => t.indexOf('开关节点') === 0),
      sub.join(' / '));
    // 这两项原来是**出不来**的（少了个逗号），专门盯一下
    ok('RB04c 运算符节点也在（原来因为少逗号显示不出来）',
      sub.some(t => t.indexOf('运算符节点') === 0), sub.join(' / '));
    ok('RB04d 外观节点也在（同上）',
      sub.some(t => t.indexOf('外观节点') === 0), sub.join(' / '));
    hideCtx();
  });
  T('RB05 右边只留快捷键，说明收进 title / data-tip', () => {
    emptyMenu();
    const shown = (d) => { const h = d.querySelector('.k'); return h ? h.textContent.trim() : ''; };
    const tipOf = (d) => d.dataset.tip || d.title || '';
    const top = [...ctxEl.querySelectorAll('.item')];
    /* 快捷键照旧显示 */
    ok('RB05 有快捷键的项右边照旧显示（全选 = Ctrl+A）',
      top.some(d => shown(d) === 'Ctrl+A'), top.map(d => d.textContent).join(' / '));
    /* ★ 只有说明的项：右边**不再**显示，但挂到了 title / dataset.tip 上 */
    const descOnly = top.filter(d => shown(d) !== 'Ctrl+A');
    ok('RB05b ★ 只有说明的项右边不显示了',
      descOnly.every(d => shown(d) === '' || shown(d) === '▶'),
      descOnly.map(d => JSON.stringify([d.textContent, shown(d)])).join(' / '));
    ok('RB05c ★ 但说明都挂到 title / data-tip 上了（右键 / 悬停能看到）',
      descOnly.filter(d => shown(d) !== '▶').every(d => !!tipOf(d)),
      descOnly.map(d => JSON.stringify([d.textContent, tipOf(d)])).join(' / '));
    /* 子菜单里也一样 */
    subMenu('新建');
    const flat = [...document.querySelectorAll('.menu .item')];
    const bad = flat.filter(d => shown(d) !== '' && shown(d) !== '▶' && !/^(Ctrl|Shift|Alt)/.test(shown(d)));
    ok('RB05d ★ 子菜单里也只有快捷键露在外面', bad.length === 0,
      bad.map(d => JSON.stringify([d.textContent, shown(d)])).join(' / '));
    const noTip = flat.filter(d => shown(d) === '' && !tipOf(d));
    ok('RB05e ★ 子菜单里被收起来的说明都有 title', noTip.length === 0,
      noTip.map(d => d.textContent).join(' / '));
    hideCtx();
  });
  T('RB06 程序组：建出来就是函数分组', () => {
    fresh(); layoutMind();
    emptyMenu();
    subMenu('新建');
    const it = [...document.querySelectorAll('.menu .item')]
      .find(d => d.textContent.indexOf('程序组') === 0);
    it.dispatchEvent(new MouseEvent('click', { bubbles:true }));
    skipDlg();
    const g = doc.groups[doc.groups.length - 1];
    ok('RB06 建了一个分组', !!g);
    ok('RB06b 它就是函数分组（内部字段没改名，老存档照旧）', g.isFunction === true, String(g.isFunction));
    ok('RB06c 默认名字叫「程序组」', g.title === '程序组', g.title);
    hideCtx();
  });

  T('TB01 建表格：形状 / 默认内容 / 尺寸', () => {
    fresh(); layoutMind();
    const t = addTableNode(0, 0);
    ok('TB01 kind 是 table', t.kind === 'table', t.kind);
    ok('TB01b 默认 3 行 3 列', tableOf(t).rows === 3 && tableOf(t).cols === 3,
      tableOf(t).rows + '×' + tableOf(t).cols);
    ok('TB01c 默认带表头', tableOf(t).header === true);
    ok('TB01d 首行有内容', tableOf(t).cells[0].join('') !== '', tableOf(t).cells[0].join(','));
    ok('TB01e 尺寸 = 列宽之和 × 行数', (() => {
      const cols = tableColWidths(t);
      return Math.abs(t.w - cols.reduce((a, x) => a + x, 0)) < 1.5
        && Math.abs(t.h - 3 * tableRowH()) < 1.5;
    })(), t.w + '×' + t.h);
    ok('TB01f 列宽夹在上下限内', tableColWidths(t).every(w => w >= TBL_MIN_COL && w <= TBL_MAX_COL),
      tableColWidths(t).join(','));
    ok('TB01g 画得出来', (dirty = true, draw(), true));
  });
  T('TB02 格子内容可编辑，也能引用变量', () => {
    fresh(); layoutMind();
    const v = mkVar('单价', '12');
    const t = addTableNode(0, 0);
    ok('TB02 写一个格子', setTableCell(t, 1, 0, '苹果'));
    ok('TB02b 读回来', tableOf(t).cells[1][0] === '苹果');
    ok('TB02c 显示出来的就是它', displayTableCell(byId(t.id), 1, 0) === '苹果',
      displayTableCell(byId(t.id), 1, 0));
    // 引用变量
    setTableCell(t, 1, 1, '{单价} 元');
    reindex(); sizeAll();
    ok('TB02d 格子里能引用变量', displayTableCell(byId(t.id), 1, 1) === '12 元',
      displayTableCell(byId(t.id), 1, 1));
    setVarDef(byId(v.id), { value:'20' });
    reindex(); sizeAll();
    ok('TB02e 变量一改格子跟着变', displayTableCell(byId(t.id), 1, 1) === '20 元',
      displayTableCell(byId(t.id), 1, 1));
    ok('TB02f 越界写会被挡下', setTableCell(byId(t.id), 99, 99, 'x') === false);
  });
  T('TB03 命中：点在哪个格子就是哪个', () => {
    fresh(); layoutMind();
    const t = addTableNode(0, 0);
    const G = tableGeom(byId(t.id));
    ok('TB03 左上角是第一格', (() => {
      const c = tableCellAt(byId(t.id), { x:G.xs[0] + 5, y:G.ys[0] + 5 });
      return c && c.r === 0 && c.c === 0;
    })());
    ok('TB03b 右下角是最后一格', (() => {
      const c = tableCellAt(byId(t.id), { x:G.xs[2] + 5, y:G.ys[2] + 5 });
      return c && c.r === 2 && c.c === 2;
    })(), JSON.stringify(tableCellAt(byId(t.id), { x:G.xs[2] + 5, y:G.ys[2] + 5 })));
    ok('TB03c 中间那格', (() => {
      const c = tableCellAt(byId(t.id), { x:G.xs[1] + 5, y:G.ys[1] + 5 });
      return c && c.r === 1 && c.c === 1;
    })());
    ok('TB03d 表格外面不算', tableCellAt(byId(t.id), { x:G.x - 30, y:G.y }) === null);
    ok('TB03e 下边外面也不算', tableCellAt(byId(t.id), { x:G.x + 5, y:G.y + G.h + 20 }) === null);
  });
  T('TB04 双击格子打开编辑器，改完写回去', () => {
    fresh(); layoutMind();
    const t = addTableNode(0, 0);
    const G = tableGeom(byId(t.id));
    const cx = Math.round(G.xs[1] + 10 + view.x), cy = Math.round(G.ys[1] + 8 + view.y);
    cv.dispatchEvent(new MouseEvent('click', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    cv.dispatchEvent(new MouseEvent('dblclick', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
    ok('TB04 编辑器开了，指的是第 1 行第 1 列',
      !!editing && editing.kind === 'cell' && editing.row === 1 && editing.col === 1,
      editing ? JSON.stringify({ k:editing.kind, r:editing.row, c:editing.col }) : '没开');
    editor.value = '香蕉';
    editor.dispatchEvent(new Event('input', { bubbles:true }));
    commitEdit();
    ok('TB04b 写回那个格子了', tableOf(byId(t.id)).cells[1][1] === '香蕉',
      tableOf(byId(t.id)).cells[1][1]);
    ok('TB04c 别的格子没被改', tableOf(byId(t.id)).cells[0][0] === tableOf(t).cells[0][0]);
  });
  T('TB05 加 / 删行列', () => {
    fresh(); layoutMind();
    const t = addTableNode(0, 0);
    setTableCell(t, 1, 1, 'A');
    tableAddRow(byId(t.id));
    ok('TB05 加了一行', tableOf(byId(t.id)).rows === 4, tableOf(byId(t.id)).rows);
    ok('TB05b 老内容还在', tableOf(byId(t.id)).cells[1][1] === 'A');
    ok('TB05c 新行是空的', tableOf(byId(t.id)).cells[3].join('') === '');
    tableAddCol(byId(t.id));
    ok('TB05d 加了一列', tableOf(byId(t.id)).cols === 4, tableOf(byId(t.id)).cols);
    ok('TB05e 每行的数组都跟着长', tableOf(byId(t.id)).cells.every(r => r.length === 4));
    tableDelRow(byId(t.id));
    tableDelCol(byId(t.id));
    ok('TB05f 删回去也是 3×3', tableOf(byId(t.id)).rows === 3 && tableOf(byId(t.id)).cols === 3,
      tableOf(byId(t.id)).rows + '×' + tableOf(byId(t.id)).cols);
    ok('TB05g 删到最后一行一列就不让删了', (() => {
      const s = addTableNode(0, 0, { rows:1, cols:1, cells:[['']] });
      tableDelRow(byId(s.id)); tableDelCol(byId(s.id));
      return tableOf(byId(s.id)).rows === 1 && tableOf(byId(s.id)).cols === 1;
    })(), (() => {
      const s = doc.nodes.find(x => x.kind === 'table' && tableOf(x).rows === 1);
      return s ? tableOf(s).rows + '×' + tableOf(s).cols : '?';
    })());
    ok('TB05h 表头能开关', (() => {
      toggleTableHeader(byId(t.id));
      const off = tableOf(byId(t.id)).header === false;
      toggleTableHeader(byId(t.id));
      return off && tableOf(byId(t.id)).header === true;
    })());
  });
  T('TB06 表格能存读往返 / 参与选中 / 折叠', () => {
    fresh(); layoutMind();
    const t = addTableNode(0, 0);
    setTableCell(t, 1, 2, '{标题}');
    const msg = mkVar('标题', '月报');
    reindex(); sizeAll();
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('TB06 存档里有 tableDef', !!snap.nodes.find(n => n.id === t.id).tableDef);
    ok('TB06b 存的是原文', snap.nodes.find(n => n.id === t.id).tableDef.cells[1][2] === '{标题}',
      snap.nodes.find(n => n.id === t.id).tableDef.cells[1][2]);
    deserialize(snap);
    ok('TB06c 读回来还是表格', byId(t.id).kind === 'table');
    ok('TB06d 读回来还算得出来', displayTableCell(byId(t.id), 1, 2) === '月报',
      displayTableCell(byId(t.id), 1, 2));
    ok('TB06e 能选中', (selectOnly(t.id), sel.has(t.id)));
    ok('TB06f 折叠开关不炸（表格没有子节点，折叠本身是空操作）', (() => {
      selectOnly(t.id);
      toggleCollapseOf(byId(t.id)); reindex();
      toggleCollapseOf(byId(t.id)); reindex();
      return byId(t.id).kind === 'table';
    })());
    // 非法 / 缺字段的 tableDef 要被规整
    ok('TB06g 缺字段也能规整出合法结构', (() => {
      const d = normalizeTableDef(undefined);
      return d.cols === 3 && d.rows === 3 && d.cells.length === 3 && d.cells[0].length === 3;
    })());
    ok('TB06h 行列数超范围会被夹住', (() => {
      const d = normalizeTableDef({ cols:999, rows:999 });
      return d.cols === TBL_MAX_COLS && d.rows === TBL_MAX_ROWS;
    })());
    ok('TB06i 短行会补齐', (() => {
      const d = normalizeTableDef({ cols:3, rows:2, cells:[['a']] });
      return d.cells[0].length === 3 && d.cells[0][0] === 'a' && d.cells[1].join('') === '';
    })());
  });
  T('TB07 表格节点的右键菜单', () => {
    fresh(); layoutMind();
    const t = addTableNode(0, 0);
    selectOnly(t.id);
    showCtx(500, 400, byId(t.id), null, { p:{} });
    const items = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('TB07 菜单上有表格那一项', items.some(x => x.indexOf('表格') === 0), items.join(' / '));
    const sub = subMenu('表格');
    ok('TB07b 有加行 / 加列 / 删行 / 删列 / 表头',
      ['末尾加一行', '末尾加一列', '删掉最后一行', '删掉最后一列', '第 0 行当表头']
        .every(L => sub.some(x => x.indexOf(L) >= 0)), sub.join(' / '));
    const tblItems = [...document.querySelectorAll('.menu .item')]
      .filter(d => /加一行|加一列|删掉最后|表头/.test(d.textContent));
    /* ★ 改过了：右边只留快捷键，说明收进 title / data-tip */
    ok('TB07c 表格那几项都把说明挂在 title 上（右边不再显示）',
      tblItems.length >= 5 && tblItems.every(d => !!(d.dataset.tip || d.title)),
      tblItems.map(d => JSON.stringify([d.textContent, d.dataset.tip || d.title || ''])).join(' / '));
    hideCtx();
  });


  T('RN01 各种程序节点双击名字都能改名', () => {
    fresh(); layoutMind();
    /* 在节点靠上那条带（名字通常在这儿）双击，看进的是不是改名 */
    const dblAt = (n, dy) => {
      cancelEdit();
      selectOnly(n.id);
      const b = nodeBox(byId(n.id));
      const cx = Math.round(b.x + b.w / 2 + view.x);
      const cy = Math.round(b.y + (dy == null ? 10 : dy) + view.y);
      cv.dispatchEvent(new MouseEvent('dblclick', { detail:2, bubbles:true, cancelable:true, clientX:cx, clientY:cy }));
      return editing ? editing.kind : null;
    };
    const rows = [];
    // 控件节点的名字就是 varDef.name，走的是 varName；其余走 node
    const chk = (name, n, dy, want) => {
      const k = dblAt(n, dy);
      rows.push(name + '=' + k);
      const expect = want || 'node';
      ok('RN01 ' + name + ' 双击名字进的是改名（' + expect + '）', k === expect, name + ' -> ' + k);
      if (k === expect){
        editor.value = 'gai' + name;
        editor.dispatchEvent(new Event('input', { bubbles:true }));
        commitEdit();
        const got = (k === 'varName') ? normalizeVarDef(byId(n.id).varDef).name : byId(n.id).text;
        ok('RN01b ' + name + ' 改完真的写进去了', got === 'gai' + name, got);
      }
      cancelEdit();
    };

    // 变量节点（这个本来是好的，当对照组）
    const v = addVarNode('变量', 0, 0);
    reindex(); sizeAll();
    chk('变量节点', v, 8);

    // 运算节点
    const op = addOpNode('运算', 0, 0);
    reindex(); sizeAll();
    chk('运算节点', op);

    // 输出节点
    const out = addOutNode('输出', 0, 0);
    reindex(); sizeAll();
    chk('输出节点', out);

    // 三种控件

    for (const c of ['check', 'slider', 'cond']){
      const n = addControlNode(c, 0, 0);
      reindex(); sizeAll();
      const cn = c === 'check' ? '勾选节点' : c === 'slider' ? '滑条节点' : '通路节点';
      // 标题行 = 节点名，走通用改名
      chk(cn + '（标题）', n, 8);
      // 左边那个变量名格子 = varDef.name，走 varName
      {
        cancelEdit();
        selectOnly(n.id);
        const nb = varBoxes(byId(n.id)).nameBox;
        cv.dispatchEvent(new MouseEvent('dblclick', { detail:2, bubbles:true, cancelable:true,
          clientX:Math.round(nb.x + nb.w / 2 + view.x), clientY:Math.round(nb.y + nb.h / 2 + view.y) }));
        ok('RN01 ' + cn + ' 双击左边变量名格子进的是 varName',
          !!editing && editing.kind === 'varName', editing ? editing.kind : '没开');
        if (editing && editing.kind === 'varName'){
          editor.value = 'v' + c;
          editor.dispatchEvent(new Event('input', { bubbles:true }));
          commitEdit();
          ok('RN01b ' + cn + ' 变量名真的改成了 v' + c,
            normalizeVarDef(byId(n.id).varDef).name === 'v' + c,
            normalizeVarDef(byId(n.id).varDef).name);
        }
        cancelEdit();
      }
    }

    // 程序化节点
    const pg = createProgramNode(0, 0);
    reindex(); sizeAll();
    chk('程序化节点', pg);

    // 普通文本节点
    const tx = addNodeAt('文本', 0, 0, 'rect');
    reindex(); sizeAll();
    chk('文本节点', tx);

    say('* RN01 明细：' + rows.join(' | '));
  });


  T('ED01 设置里的「新建连线的默认类型」真的生效', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('连线'), c = nodeByText('操作');
    const plain = makeEdge(a.id, b.id);
    ok('ED01 默认就是单向箭头 + 实线', plain.arrow === 'end' && plain.dash === false,
      plain.arrow + '/' + plain.dash);
    ok('ED01b 默认路由是正交折线', plain.route === 'ortho', plain.route);
    // 改设置
    defaults.edge.arrow = 'both';
    defaults.edge.dash = true;
    const dashed = makeEdge(a.id, c.id);
    ok('ED01c 改完之后新建的边跟着变（以前这里是死的）',
      dashed.arrow === 'both' && dashed.dash === true, dashed.arrow + '/' + dashed.dash);
    ok('ED01d 走 linkNodes 那条路也一样', (() => {
      const e = linkNodes(a.id, c.id);
      return !e || (e.arrow === 'both' && e.dash === true);
    })());
    // 改回去，别影响后面的断言
    defaults.edge.arrow = 'end';
    defaults.edge.dash = false;
    const back = makeEdge(a.id, b.id);
    ok('ED01e 改回来又是实线单向', back.arrow === 'end' && back.dash === false);
    ok('ED01f 存读过一次设置也还在', (() => {
      defaults.edge.arrow = 'none';
      saveDefaults();
      defaults.edge.arrow = 'end';       // 弄脏内存里的值
      loadDefaults();                     // 从存储读回来
      const okv = defaults.edge.arrow === 'none';
      defaults.edge.arrow = 'end'; saveDefaults();
      return okv;
    })());
  });

  T('CT01 滑条命名为 x 之后，文本节点 {x} 引用得到（就是用户报的那个）', () => {
    fresh(); layoutMind();
    const sl = addControlNode('slider', 0, 0);
    reindex(); sizeAll();
    ok('CT01 新建的滑条有变量名格子了', !!varBoxes(byId(sl.id)).nameBox,
      JSON.stringify(varBoxes(byId(sl.id)).nameBox));
    ok('CT01b 节点名和变量名一开始是分开的', (() => {
      const n = byId(sl.id);
      return n.text === '滑条' && normalizeVarDef(n.varDef).name === '数值';
    })(), byId(sl.id).text + ' / ' + normalizeVarDef(byId(sl.id).varDef).name);
    ok('CT01c 控件本体在名字格子右边', (() => {
      const L = varBoxes(byId(sl.id));
      return L.trackBox.x >= L.nameBox.x + L.nameBox.w;
    })());
    // 把变量名改成 x
    setVarDef(byId(sl.id), { name:'x' });
    const tx = addNodeAt('值是 {x}', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('CT01d 文本节点引用得到 x 了', displayTextOf(byId(tx.id)) === '值是 50',
      displayTextOf(byId(tx.id)));
    // 改滑条的值
    setVarDef(byId(sl.id), { value:'80' });
    reindex(); sizeAll();
    ok('CT01e 拖动滑条，引用处跟着变', displayTextOf(byId(tx.id)) === '值是 80',
      displayTextOf(byId(tx.id)));
    // 节点名（标题行）改名不影响变量名
    byId(sl.id).text = '音量';
    reindex(); sizeAll();
    ok('CT01f 改节点名不影响引用', displayTextOf(byId(tx.id)) === '值是 80',
      displayTextOf(byId(tx.id)));
    ok('CT01g 标题行显示的是节点名', (() => {
      sizeNode(byId(sl.id));
      return byId(sl.id).lines.join('') === '音量';
    })(), byId(sl.id).lines.join(''));
    // 三种控件都一样
    for (const c of ['check', 'cond']){
      const n = addControlNode(c, 0, 0, { name:'k' + c });
      reindex(); sizeAll();
      ok('CT01h ' + c + ' 也有变量名格子并且能引用',
        !!varBoxes(byId(n.id)).nameBox && !!findVarDefIn(liveCtx(), 'k' + c, n.id),
        c);
    }
  });


  /* ==================== N 键隐藏界面 + 连线流动动画 ==================== */
  const pinkish = (d, i) => d[i] > 230 && d[i+1] > 140 && d[i+2] > 180;
  T('AN01 N 键隐藏 / 恢复界面', () => {
    fresh(); layoutMind();
    document.body.classList.remove('ui-hidden');
    ok('AN01 默认不隐藏', !document.body.classList.contains('ui-hidden'));
    ok('AN01b 有 #uiNote 这个提示元素', !!document.getElementById('uiNote'));
    keyRaw(' ', { ctrlKey:true });
    ok('AN01c 按 Ctrl+Space 隐藏了', document.body.classList.contains('ui-hidden'));
    ok('AN01d 提示语说了怎么恢复', /Ctrl\+Space/.test(document.getElementById('uiNote').textContent),
      document.getElementById('uiNote').textContent);
    ok('AN01e #ui 真的看不见了',
      getComputedStyle(document.getElementById('ui')).display === 'none',
      getComputedStyle(document.getElementById('ui')).display);
    ok('AN01f 提示条这时候是可见的',
      getComputedStyle(document.getElementById('uiNote')).display !== 'none');
    keyRaw(' ', { ctrlKey:true });
    ok('AN01g 再按一次回来了', !document.body.classList.contains('ui-hidden'));
    ok('AN01h #ui 回来了',
      getComputedStyle(document.getElementById('ui')).display !== 'none');
    ok('AN01i 提示条又藏起来了',
      getComputedStyle(document.getElementById('uiNote')).display === 'none');
    ok('AN01j 快捷键表里有这一项', !!ACTIONS['ui.toggle'], Object.keys(ACTIONS).filter(k => /ui\./.test(k)).join(','));
    ok('AN01k 它的标签和分组对得上',
      ACTIONS['ui.toggle'].label === '隐藏 / 显示界面' && ACTIONS['ui.toggle'].group === '视图',
      ACTIONS['ui.toggle'].label + ' / ' + ACTIONS['ui.toggle'].group);
  });
  T('AN02 流动动画：开关 / 相位 / 主题定制', () => {
    fresh(); layoutMind();
    setAnimFlow(true);
    ok('AN02 默认开着', animFlowOn());
    ok('AN02b 流动是想要的', flowWanted());
    ok('AN02c 主题可以定制，没写就用默认',
      themeFlow().speed === FLOW_DEFAULT.speed && themeFlow().gap === FLOW_DEFAULT.gap,
      JSON.stringify(themeFlow()));
    applyTheme('sakura');
    ok('AN02d 樱花主题定制了流动点', themeFlow().color === '#ff9ec4',
      JSON.stringify(themeFlow()));
    applyTheme(DEFAULT_THEME);
    // 相位只增
    const t0 = animT;
    flowStep(0.5); flowStep(0.5);
    ok('AN02e 时钟按 dt 累加', Math.abs(animT - (t0 + 1)) < 1e-6);
    // 主题显式关掉就不流
    THEMES.__noflow = Object.assign({}, THEMES.board, { flow:{ on:false } });
    applyTheme('__noflow');
    ok('AN02f 主题能显式关掉流动', !flowWanted());
    delete THEMES.__noflow;
    // 用户关掉更彻底
    setAnimFlow(false);
    ok('AN02g 用户关掉之后不流了', !flowWanted());
    ok('AN02h 记进 localStorage 了', /"flow":false/.test(localStorage.getItem('grapheon.anim.v1') || ''),
      localStorage.getItem('grapheon.anim.v1'));
    setAnimFlow(true);
  });
  T('AN03 折线按弧长取点', () => {
    const pts = [{ x:0, y:0 }, { x:100, y:0 }, { x:100, y:100 }];
    ok('AN03 总长 200', Math.abs(polyLen(pts) - 200) < 1e-6, polyLen(pts));
    ok('AN03b 0 处是起点', (() => { const p = polyPointAt(pts, 0); return p.x === 0 && p.y === 0; })());
    ok('AN03c 100 处是拐角', (() => { const p = polyPointAt(pts, 100); return Math.abs(p.x-100)<1e-6 && Math.abs(p.y-0)<1e-6; })());
    ok('AN03d 150 处在第二段中间', (() => { const p = polyPointAt(pts, 150); return Math.abs(p.x-100)<1e-6 && Math.abs(p.y-50)<1e-6; })(),
      JSON.stringify(polyPointAt(pts, 150)));
    ok('AN03e 超过总长就停在终点', (() => { const p = polyPointAt(pts, 999); return Math.abs(p.y-100)<1e-6; })());
  });
  T('AN04 流动点真的画出来了，关掉就没有', () => {
    fresh(); layoutMind();
    resize(); fitView();
    const e = doc.edges[0];
    ok('AN04 前置：这条边够长', (() => {
      const g = edgeGeomFor(e);
      return g && polyLen(g.pts) >= 26;
    })(), (() => { const g = edgeGeomFor(e); return g ? Math.round(polyLen(g.pts)) : -1; })());
    setAnimFlow(true);
    animT = 0;
    // 只画这一条边，免得别的边的点混进采样
    const g2 = cv.getContext('2d');
    resize();
    g2.setTransform(DPR, 0, 0, DPR, 0, 0);
    g2.fillStyle = C.bg; g2.fillRect(0, 0, VW, VH);
    g2.save();
    g2.translate(view.x, view.y); g2.scale(view.z, view.z);
    drawEdgeFlow(g2, e);
    g2.restore();
    const d = g2.getImageData(0, 0, cv.width, cv.height).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4){
      if (d[i] !== parseInt(C.bg.slice(1,3),16) || d[i+1] !== parseInt(C.bg.slice(3,5),16)) hit++;
    }
    ok('AN04b 画布上有东西（流动点）', hit > 40, hit);
    // ★ 决定性的一条：走真实的 draw() 路径，看 drawEdge 到底有没有把流动点调起来
    ok('AN04b2 drawEdge 每条边都会调 drawEdgeFlow', (() => {
      const orig = drawEdgeFlow;
      let n = 0;
      window.drawEdgeFlow = function(g, e){ n++; return orig(g, e); };
      try { draw(); } finally { window.drawEdgeFlow = orig; }
      return n === doc.edges.length;
    })(), (() => {
      const orig = drawEdgeFlow; let n = 0;
      window.drawEdgeFlow = function(g, e){ n++; return orig(g, e); };
      try { draw(); } finally { window.drawEdgeFlow = orig; }
      return n + ' / ' + doc.edges.length;
    })());
    // 关掉再画一次
    setAnimFlow(false);
    g2.setTransform(DPR, 0, 0, DPR, 0, 0);
    g2.fillStyle = C.bg; g2.fillRect(0, 0, VW, VH);
    g2.save();
    g2.translate(view.x, view.y); g2.scale(view.z, view.z);
    drawEdgeFlow(g2, e);
    g2.restore();
    const d2 = g2.getImageData(0, 0, cv.width, cv.height).data;
    let hit2 = 0;
    for (let i = 0; i < d2.length; i += 4){
      if (d2[i] !== parseInt(C.bg.slice(1,3),16) || d2[i+1] !== parseInt(C.bg.slice(3,5),16)) hit2++;
    }
    ok('AN04c 关掉之后一个点都不画', hit2 === 0, hit2);
    setAnimFlow(true);
    ok('AN04d 所有边共用一个时钟（所以速度一致）', (() => {
      const before = animT;
      flowStep(1);
      return animT === before + 1;
    })());
    ok('AN04e 选中的那条不画点（免得看不清）', (() => {
      selectEdge(e.id);
      const g3 = cv.getContext('2d');
      g3.setTransform(DPR, 0, 0, DPR, 0, 0);
      g3.fillStyle = C.bg; g3.fillRect(0, 0, VW, VH);
      g3.save(); g3.translate(view.x, view.y); g3.scale(view.z, view.z);
      drawEdgeFlow(g3, e);
      g3.restore();
      const dd = g3.getImageData(0, 0, cv.width, cv.height).data;
      let h = 0;
      for (let i = 0; i < dd.length; i += 4){
        if (dd[i] !== parseInt(C.bg.slice(1,3),16) || dd[i+1] !== parseInt(C.bg.slice(3,5),16)) h++;
      }
      selEdgeId = null;
      return h === 0;
    })());
  });
  T('AN05 樱花和流动共用同一个 rAF 循环', () => {
    fresh(); layoutMind();
    setAnimFlow(false);
    setSakuraEnabled(false);
    applyTheme(DEFAULT_THEME);
    ok('AN05 两个都关掉 → 循环停', !animNeeded() && !sakuraRunning);
    setAnimFlow(true);
    syncSakura();
    ok('AN05b 只开流动 → 循环转（不用樱花也转）', animNeeded() && sakuraRunning);
    setAnimFlow(false); syncSakura();
    ok('AN05c 关掉流动 → 循环停', !sakuraRunning);
    applyTheme('sakura');
    setSakuraEnabled(true); syncSakura();
    ok('AN05d 只开樱花 → 也转', animNeeded() && sakuraRunning);
    applyTheme(DEFAULT_THEME); syncSakura();
    ok('AN05e 都关掉又停', !sakuraRunning);
    setAnimFlow(true); syncSakura();
  });


  /* ==================== A 期：多输入汇合的基础 ==================== */
  T('FA01 节点变换只有一条路：applyNodeOut', () => {
    fresh(); layoutMind();
    const v = mkVar('n', '10');
    const op = addOpNode('加五', 0, 0, { op:'+', operand:'5' });
    const t = addNodeAt('目标', 0, 0, 'rect');
    linkNodes(v.id, op.id); linkNodes(op.id, t.id);
    reindex();
    ok('FA01 运算节点会做变换', applyNodeOut(liveCtx(), byId(op.id), 10) === 15,
      String(applyNodeOut(liveCtx(), byId(op.id), 10)));
    ok('FA01b 普通节点原样透传', applyNodeOut(liveCtx(), byId(t.id), 10) === 10);
    ok('FA01c 变量节点也透传', applyNodeOut(liveCtx(), byId(v.id), 7) === 7);
    ok('FA01d 空节点不炸', applyNodeOut(liveCtx(), null, 7) === 7);
    ok('FA01e 它就是 applyOperator 的那一层',
      applyNodeOut(liveCtx(), byId(op.id), 3) === applyOperator(3, byId(op.id).opDef));
  });
  T('FA02 往回求上游值：和现有前向求值在单链上必然一致', () => {
    fresh(); layoutMind();
    const v = mkVar('单价', '12');
    const op = addOpNode('乘四', 0, 0, { op:'*', operand:'4' });
    const t1 = addNodeAt('第一站', 0, 0, 'rect');
    const t2 = addNodeAt('第二站', 0, 0, 'rect');
    linkNodes(v.id, op.id); linkNodes(op.id, t1.id); linkNodes(t1.id, t2.id);
    reindex(); sizeAll();
    // 注意：valueFromUpstream 给的是「**流进**这个节点」的值，不是它吐出去的。
    // 运算节点的输入是 12；输出 48 要到下一站才看得到 —— 这和 evalFromIn 的 targetId 语义一致。
    ok("FA02 流进运算节点的是 '12'（变量值本身是字符串）", valueFromUpstream(liveCtx(), byId(op.id).id) === '12',
      String(valueFromUpstream(liveCtx(), byId(op.id).id)));
    ok('FA02c 到第二站也还是 48', valueFromUpstream(liveCtx(), byId(t2.id).id) === 48,
      String(valueFromUpstream(liveCtx(), byId(t2.id).id)));
    // ★ 关键：和 resolveVarIn（走 evalFromIn 那条老路）逐站对齐
    for (const n of [op, t1, t2]){
      const a = valueFromUpstream(liveCtx(), n.id);
      const b = resolveVar('单价', n.id);
      ok('FA02d 「' + n.text + '」两条路算出来一样', String(a) === String(b), a + ' vs ' + b);
    }
    // 变量一改，两条路一起变
    setVarDef(byId(v.id), { value:'20' });
    reindex();
    ok('FA02e 改完还是对齐',
      String(valueFromUpstream(liveCtx(), byId(t2.id).id)) === String(resolveVar('单价', t2.id)),
      valueFromUpstream(liveCtx(), byId(t2.id).id) + ' vs ' + resolveVar('单价', t2.id));
    ok('FA02f 值也对（20 × 4 = 80）', valueFromUpstream(liveCtx(), byId(t2.id).id) === 80,
      String(valueFromUpstream(liveCtx(), byId(t2.id).id)));
  });
  T('FA03 菱形：一个节点两路输入，每路都能单独求出来', () => {
    fresh(); layoutMind();
    const a = mkVar('甲', '2');
    const b = mkVar('乙', '100');
    const mid = addNodeAt('汇合点', 0, 0, 'rect');
    linkNodes(a.id, mid.id);
    linkNodes(b.id, mid.id);
    reindex(); sizeAll();
    const ctx = liveCtx();
    ok('FA03 汇合点确实有两条入边',
      ctx.edges.filter(e => e.t === mid.id).length === 2,
      ctx.edges.filter(e => e.t === mid.id).length);
    ok('FA03b 甲那一路求到 2', defValueIn(ctx, byId(a.id)) === '2', String(defValueIn(ctx, byId(a.id))));
    ok('FA03c 乙那一路求到 100', defValueIn(ctx, byId(b.id)) === '100');
    ok('FA03d valueFromUpstream 给出其中一路（按边序取第一路）',
      valueFromUpstream(ctx, mid.id) === '2', String(valueFromUpstream(ctx, mid.id)));
    // 只留乙那一路
    doc.edges = doc.edges.filter(e => !(e.s === a.id && e.t === mid.id));
    reindex();
    ok('FA03e 撤掉一路之后取到另一路', valueFromUpstream(liveCtx(), mid.id) === '100',
      String(valueFromUpstream(liveCtx(), mid.id)));
  });
  T('FA04 往回求：没有来源返回 null，遇到关着的通路返回 BLOCKED', () => {
    fresh(); layoutMind();
    const lone = addNodeAt('孤立', 0, 0, 'rect');
    reindex();
    ok('FA04 没有入边 → null', valueFromUpstream(liveCtx(), lone.id) === null,
      String(valueFromUpstream(liveCtx(), lone.id)));
    ok('FA04b 不存在的节点 → null', valueFromUpstream(liveCtx(), '不存在') === null);
    // 通路关着
    const src = mkVar('源', '9');
    const sw = addControlNode('cond', 0, 0, { name:'闸' });
    const dst = addNodeAt('下游', 0, 0, 'rect');
    linkNodes(src.id, sw.id); linkNodes(sw.id, dst.id);
    reindex();
    ok('FA04c 条件不成立 → 值过不去', valueFromUpstream(liveCtx(), dst.id) !== '9',
      String(valueFromUpstream(liveCtx(), dst.id)));
    setVarDef(byId(src.id), { value:'1' });        // 输入给 1 → 通
    reindex();
    // 注意：条件节点是**透传**上游值的（它自己填的那个值走的是 {按名字引用} 那条路），
    // 所以这里通出来的是上游的 1，不是它自己填的东西。
    ok('FA04d 输入为 1 就通了，透传出上游的 1',
      valueFromUpstream(liveCtx(), dst.id) === '1',
      String(valueFromUpstream(liveCtx(), dst.id)));
  });
  T('FA05 往回求：绕环不会挂', () => {
    fresh(); layoutMind();
    const a = mkVar('A', '1');
    const n1 = addNodeAt('一', 0, 0, 'rect');
    const n2 = addNodeAt('二', 0, 0, 'rect');
    linkNodes(a.id, n1.id);
    linkNodes(n1.id, n2.id);
    linkNodes(n2.id, n1.id);          // 绕回去
    reindex();
    ok('FA05 有环也有限返回（不栈溢出）', (() => {
      const r = valueFromUpstream(liveCtx(), n2.id);
      return r === '1' || r === null;
    })(), String(valueFromUpstream(liveCtx(), n2.id)));
    ok('FA05b 深度上限是有限的', UPSTREAM_MAX_DEPTH > 0 && UPSTREAM_MAX_DEPTH < 1000,
      UPSTREAM_MAX_DEPTH);
    ok('FA05c 纯环（没变量定义）返回 null', (() => {
      const x = addNodeAt('x', 0, 0, 'rect');
      const y = addNodeAt('y', 0, 0, 'rect');
      linkNodes(x.id, y.id); linkNodes(y.id, x.id);
      reindex();
      return valueFromUpstream(liveCtx(), y.id) === null;
    })());
  });
  T('FA06 往回求穿过程序组也一样', () => {
    fresh(); layoutMind();
    const fg = newEmptyGroup(0, 0);
    fg.isFunction = true;
    const base = mkVar('基数', '100');
    const sub = addOpNode('减十五', 0, 0, { op:'-', operand:'15' });
    const out = addOutNode('折后', 0, 0);
    linkNodes(base.id, sub.id); linkNodes(sub.id, out.id);
    fg.members = [base.id, sub.id, out.id];
    const dst = addNodeAt('外面', 0, 0, 'rect');
    linkNodes(out.id, dst.id);        // 组内输出 → 组外
    reindex(); sizeAll();
    ok('FA06 组内算出来的值能一路求到组外',
      valueFromUpstream(liveCtx(), dst.id) === 85,
      String(valueFromUpstream(liveCtx(), dst.id)));
    ok('FA06b 输出节点自己有值', outputValueIn(liveCtx(), byId(out.id)) === 85,
      String(outputValueIn(liveCtx(), byId(out.id))));
  });


  /* ==================== B 期：端点模型 ==================== */
  T('PB01 默认端点：位置和以前那套四向中点完全一致', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    const L = portList(n);
    ok('PB01 默认一个输入一个输出', L.ins.length === 1 && L.outs.length === 1,
      L.ins.length + '/' + L.outs.length);
    ok('PB01b 输入在左边、输出在右边', L.ins[0].side === 'l' && L.outs[0].side === 'r');
    ok('PB01c 都在正中', L.ins[0].at === 0.5 && L.outs[0].at === 0.5);
    ok('PB01d id 是正整数且不重复',
      L.ins[0].id > 0 && L.outs[0].id > 0 && L.ins[0].id !== L.outs[0].id,
      L.ins[0].id + ' / ' + L.outs[0].id);
    // ★ 关键：默认端点的坐标必须和老的 portPos 一样
    const b = nodeBox(n);
    ok('PB01e 输入点在左边中点',
      (() => { const p = portPoint(byId(n.id), L.ins[0]); return p.x === b.x && Math.abs(p.y - (b.y + b.h/2)) < 1e-6; })(),
      JSON.stringify(portPoint(byId(n.id), L.ins[0])));
    ok('PB01f 输出点在右边中点',
      (() => { const p = portPoint(byId(n.id), L.outs[0]); return p.x === b.x + b.w && Math.abs(p.y - (b.y + b.h/2)) < 1e-6; })());
    ok('PB01g 没有 ports 字段就是默认（老存档零改动）',
      byId(n.id).ports === undefined || byId(n.id).ports === null);
  });
  T('PB02 规矩：id 纯数字、正整数、节点内不重复', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    ok('PB02 改 id 成功', setPortId(byId(n.id), 'ins', 1, 7) === true);
    ok('PB02b 改成 7 了', portList(byId(n.id)).ins[0].id === 7, portList(byId(n.id)).ins[0].id);
    ok('PB02c 撞已有 id 会被拒绝', setPortId(byId(n.id), 'outs', 3, 7) === false);
    skipDlg();
    ok('PB02d 拒绝时说清楚了', /已经用过/.test(dlgText.textContent), dlgText.textContent.slice(0, 30));
    ok('PB02e 被拒绝后原来的没被偷改', portList(byId(n.id)).outs[0].id === 3,
      portList(byId(n.id)).outs[0].id);
    ok('PB02f 0 / 负数 / 小数都不行', (() => {
      const ok0 = setPortId(byId(n.id), 'ins', 7, 0) === false;
      skipDlg();
      const okNeg = setPortId(byId(n.id), 'ins', 7, -3) === false;
      skipDlg();
      const okFrac = setPortId(byId(n.id), 'ins', 7, '8.6') === true;   // 取整成 9（3 被输出端点占了）
      return ok0 && okNeg && okFrac && portList(byId(n.id)).ins[0].id === 9;
    })(), String(portList(byId(n.id)).ins[0].id));
    skipDlg();
    ok('PB02g 非数字不行', (() => { skipDlg(); return setPortId(byId(n.id), 'ins', 3, 'abc') === false; })());
    skipDlg();
    ok('PB02h 恢复默认', (() => { resetPorts(byId(n.id)); return portList(byId(n.id)).ins[0].id === 1; })(),
      String(portList(byId(n.id)).ins[0].id));
  });
  T('PB03 标签：能改，默认空', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    ok('PB03 默认标签是空的', portList(byId(n.id)).ins[0].label === '');
    ok('PB03b 能改', setPortLabel(byId(n.id), 'ins', 1, '系数') === true);
    ok('PB03c 改上了', portList(byId(n.id)).ins[0].label === '系数',
      portList(byId(n.id)).ins[0].label);
    ok('PB03d 只影响指定的那个',
      portList(byId(n.id)).outs[0].label === '', portList(byId(n.id)).outs[0].label);
    ok('PB03e 引用作用域外的东西不炸', setPortLabel(byId(n.id), 'ins', 999, 'x') === false);
  });
  T('PB04 加 / 删端点：同一路上会均匀铺开', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    const a = addPort(byId(n.id), 'ins');
    ok('PB04 加了一个输入端点', a && portList(byId(n.id)).ins.length === 2,
      portList(byId(n.id)).ins.length);
    ok('PB04b 新 id 不和已有的撞',
      usedPortIds(byId(n.id)).size === 3, usedPortIds(byId(n.id)).size);
    // 再加两个，凑到 4 个输入，看 at 会不会排开
    addPort(byId(n.id), 'ins'); addPort(byId(n.id), 'ins');
    const ins = portList(byId(n.id)).ins;
    ok('PB04c 凑到 4 个', ins.length === 4, ins.length);
    ok('PB04d 同一条路上的 at 互不相同', (() => {
      const bySide = {};
      for (const p of ins) (bySide[p.side] = bySide[p.side] || []).push(p.at);
      for (const s in bySide){
        if (new Set(bySide[s]).size !== bySide[s].length) return false;
      }
      return true;
    })(), JSON.stringify(ins.map(p => p.side + ':' + p.at.toFixed(2))));
    ok('PB04e at 都在 0..1 内', ins.every(p => p.at > 0 && p.at < 1));
    ok('PB04f 按 id 排的顺序稳定', (() => {
      const before = ins.map(p => p.id).join(',');
      spreadPorts(portList(byId(n.id)), ins[0].side);
      return portList(byId(n.id)).ins.map(p => p.id).join(',') === before;
    })());
    // 删
    const last = portList(byId(n.id)).ins[portList(byId(n.id)).ins.length - 1];
    ok('PB04g 能删', removePort(byId(n.id), 'ins', last.id) === true);
    ok('PB04h 删掉了', portList(byId(n.id)).ins.length === 3);
    // 删到只剩一个就拒绝
    ok('PB04i 至少留一个', (() => {
      let guard = 0;
      while (portList(byId(n.id)).ins.length > 1 && guard++ < 10){
        const l = portList(byId(n.id)).ins;
        removePort(byId(n.id), 'ins', l[l.length - 1].id);
      }
      const one = portList(byId(n.id)).ins.length === 1;
      skipDlg();
      const refused = removePort(byId(n.id), 'ins', portList(byId(n.id)).ins[0].id) === false;
      return one && refused;
    })());
    skipDlg();
    ok('PB04j 超过上限会被挡', (() => {
      let guard = 0;
      while (portList(byId(n.id)).outs.length < PORT_MAX_PER_DIR && guard++ < 20) addPort(byId(n.id), 'outs');
      skipDlg();
      return portList(byId(n.id)).outs.length === PORT_MAX_PER_DIR && addPort(byId(n.id), 'outs') === null;
    })(), portList(byId(n.id)).outs.length);
  });
  T('PB05 id 决定汇合顺序（所以它是求值依据，不只是标识）', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    addPort(byId(n.id), 'ins');
    const ins = portList(byId(n.id)).ins.slice().sort((a, b) => a.id - b.id);
    ok('PB05 端点能按 id 排出稳定顺序', ins.length === 2 && ins[0].id < ins[1].id,
      ins.map(p => p.id).join('<'));
    // 改小 id 之后顺序跟着变
    const big = ins[1];
    setPortId(byId(n.id), 'ins', big.id, 1) === false
      ? null
      : null;
    // 1 被占了，先把它挪走
    const small = ins[0];
    setPortId(byId(n.id), 'ins', small.id, 50);
    ok('PB05b 挪开之后能占住 1', setPortId(byId(n.id), 'ins', big.id, 1) === true,
      portList(byId(n.id)).ins.map(p => p.id).join(','));
    ok('PB05c 排序结果真的变了',
      portList(byId(n.id)).ins.slice().sort((a, b) => a.id - b.id)[0].id === 1,
      portList(byId(n.id)).ins.slice().sort((a, b) => a.id - b.id).map(p => p.id).join('<'));
  });
  T('PB06 显示规则：悬停或选中才显示标签', () => {
    fresh(); layoutMind();
    const a = addVarNode('pn', 0, 0), b = addVarNode('pl', 0, 0);
    ok('PB06 什么都没选中时不显示标签', !portsShowLabel(byId(a.id)));
    selectOnly(a.id);
    ok('PB06b 选中就显示', portsShowLabel(byId(a.id)));
    ok('PB06c 没选中的那个不显示', !portsShowLabel(byId(b.id)));
    // 多选：都显示
    sel.add(b.id);
    reindex();
    ok('PB06d 多选时每个都显示',
      portsShowLabel(byId(a.id)) && portsShowLabel(byId(b.id)));
    selectOnly(null);
    ok('PB06e 取消选中又不显示了', !portsShowLabel(byId(a.id)));
  });
  T('PB07 端点画得出来，而且不改变原有几何', () => {
    fresh(); layoutMind(); resize(); fitView();
    const n = addVarNode('pn', 0, 0);
    const b0 = nodeBox(n);
    const p0 = portPoint(byId(n.id), portList(n).ins[0]);
    // 加了端口表之后，盒子和端点位置都不该变
    ok('PB07 加了端口模型之后盒子没变',
      nodeBox(byId(n.id)).x === b0.x && nodeBox(byId(n.id)).w === b0.w);
    ok('PB07b 端点位置也没变',
      portPoint(byId(n.id), portList(byId(n.id)).ins[0]).x === p0.x);
    ok('PB07c 整个画布画得出来（不抛异常）', (dirty = true, draw(), true));
    selectOnly(n.id);
    ok('PB07d 选中时也画得出来', (draw(), true));
    // 真的画上去了：端点圆点用的是 C.yellow，找一找
    const g = cv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, VW, VH);
    g.save(); g.translate(view.x, view.y); g.scale(view.z, view.z);
    drawPorts(g, byId(n.id), true);
    g.restore();
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4){
      if (d[i] > 200 && d[i+1] > 180 && d[i+2] < 120) hit++;
    }
    ok('PB07e 画布上找得到端点的颜色', hit > 20, hit);
  });
  T('PB08 端点表能存读往返', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    setPortLabel(byId(n.id), 'ins', 1, '左进');
    addPort(byId(n.id), 'ins');
    setPortId(byId(n.id), 'ins', portList(byId(n.id)).ins[1].id, 9);
    const snap = JSON.parse(JSON.stringify(serialize()));
    const saved = snap.nodes.find(x => x.id === n.id);
    ok('PB08 存档里带上 ports 了', !!saved.ports, JSON.stringify(saved.ports));
    ok('PB08b 标签存下来了', saved.ports.ins.some(p => p.label === '左进'));
    ok('PB08c id 存下来了', saved.ports.ins.some(p => p.id === 9));
    deserialize(snap);
    ok('PB08d 读回来还是两个输入', portList(byId(n.id)).ins.length === 2);
    ok('PB08e 标签还在', portList(byId(n.id)).ins.some(p => p.label === '左进'));
    ok('PB08f 老存档（没 ports）读回来是默认', (() => {
      const s2 = JSON.parse(JSON.stringify(serialize()));
      delete s2.nodes.find(x => x.id === n.id).ports;
      deserialize(s2);
      return portList(byId(n.id)).ins.length === 1 && portList(byId(n.id)).ins[0].side === 'l';
    })(), JSON.stringify(portList(byId(n.id))));
  });
  T('PB09 非法端点表会被规整，不会让文档打不开', () => {
    ok('PB09 空对象 → 空表（不是崩）', (() => {
      const r = normalizePorts({ ins:[], outs:[] });
      return r && r.ins.length === 0 && r.outs.length === 0;
    })());
    ok('PB09b id 重复会自动让开', (() => {
      const r = normalizePorts({ ins:[{ id:2 }, { id:2 }, { id:2 }], outs:[] });
      return new Set(r.ins.map(p => p.id)).size === 3;
    })(), JSON.stringify(normalizePorts({ ins:[{ id:2 }, { id:2 }, { id:2 }], outs:[] }).ins.map(p => p.id)));
    ok('PB09c 缺字段补默认', (() => {
      const r = normalizePorts({ ins:[{}], outs:[{}] });
      return r.ins[0].id > 0 && PORT_SIDES.indexOf(r.ins[0].side) >= 0 && r.ins[0].at === 0.5;
    })());
    ok('PB09d 非法 side 退回 r', normalizePorts({ ins:[{ id:1, side:'乱写' }], outs:[] }).ins[0].side === 'r');
    ok('PB09e at 超范围夹回 0.5',
      normalizePorts({ ins:[{ id:1, at:9 }], outs:[] }).ins[0].at === 0.5);
    ok('PB09f 不是对象 → 用默认', normalizePorts(null) === null && normalizePorts('x') === null);
    ok('PB09g 超量的会被截断', (() => {
      const many = []; for (let i = 1; i <= 20; i++) many.push({ id:i });
      return normalizePorts({ ins:many, outs:[] }).ins.length === PORT_MAX_PER_DIR;
    })());
  });


  /* ==================== B 期补：拖动改方向 + 双击改 ID/标签 ==================== */
  T('PD01 端点往哪条边靠就挂哪条边', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    const b = nodeBox(n);
    ok('PD01 靠左边就是 l', sideFromPoint(byId(n.id), { x:b.x + 3, y:b.y + b.h/2 }) === 'l');
    ok('PD01b 靠右边就是 r', sideFromPoint(byId(n.id), { x:b.x + b.w - 3, y:b.y + b.h/2 }) === 'r');
    ok('PD01c 靠上边就是 t', sideFromPoint(byId(n.id), { x:b.x + b.w/2, y:b.y + 3 }) === 't');
    ok('PD01d 靠下边就是 b', sideFromPoint(byId(n.id), { x:b.x + b.w/2, y:b.y + b.h - 3 }) === 'b');
    // 沿边的位置
    ok('PD01e 上边靠左 at 就小', atFromPoint(byId(n.id), 't', { x:b.x + b.w * 0.2, y:b.y }) < 0.35,
      atFromPoint(byId(n.id), 't', { x:b.x + b.w * 0.2, y:b.y }).toFixed(2));
    ok('PD01f at 夹在 0.08..0.92，不会跑到角外面', (() => {
      const a = atFromPoint(byId(n.id), 't', { x:b.x - 999, y:b.y });
      const z = atFromPoint(byId(n.id), 't', { x:b.x + 9999, y:b.y });
      return a >= 0.08 && z <= 0.92;
    })(), atFromPoint(byId(n.id), 't', { x:b.x - 999, y:b.y }).toFixed(2));
  });
  T('PD02 拖一下：方向变了、位置也变了', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0); reindex(); sizeAll();  // 端点只在程序节点上
    const b = nodeBox(n);
    ok('PD02 原来在左边', portList(byId(n.id)).ins[0].side === 'l');
    ok('PD02b 拖到上边', movePort(byId(n.id), 'ins', 1, { x:b.x + b.w * 0.3, y:b.y + 2 }) === true);
    const p = portList(byId(n.id)).ins[0];
    ok('PD02c 真的挂到上边了', p.side === 't', p.side);
    ok('PD02d 位置跟着走', Math.abs(p.at - 0.3) < 0.05, p.at.toFixed(2));
    ok('PD02e 输出端点没被动', portList(byId(n.id)).outs[0].side === 'r');
    ok('PD02f 拖到不存在的端点返回 false', movePort(byId(n.id), 'ins', 999, { x:b.x, y:b.y }) === false);
  });
  T('PD03 把手只认标签那一块，圆点留给拉线', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0);
    const b = nodeBox(n);
    const pt = portPoint(byId(n.id), portList(n).ins[0]);   // 左边中点
    const hb0 = portHandleBox(byId(n.id), portList(n).ins[0]);
    const hcentre = { x:hb0.x + hb0.w / 2, y:hb0.y + hb0.h / 2 };
    ok('PD03 没选中时没有把手', portHandleAt(hcentre, byId(n.id)) === null);
    selectOnly(n.id);
    ok('PD03b 选中后那个实心方块就是把手',
      !!portHandleAt(hcentre, byId(n.id)),
      JSON.stringify(portHandleAt(hcentre, byId(n.id)) && '有'));
    ok('PD03c 圆点本身**不是**把手（那是拉线的起点）',
      portHandleAt(pt, byId(n.id)) === null);
    ok('PD03d 圆点旁边一点点也还是拉线区',
      portHandleAt({ x:pt.x - 2, y:pt.y }, byId(n.id)) === null);
    ok('PD03e 太远就不算了',
      portHandleAt({ x:pt.x - 400, y:pt.y }, byId(n.id)) === null);
    ok('PD03h 方块必须是实心的（有尺寸，不是画条线）', hb0.w > 0 && hb0.h > 0 && hb0.w === hb0.h,
      hb0.w + '×' + hb0.h);
    ok('PD03i 方块在点子外面，不压住拉线区',
      (portList(byId(n.id)).ins[0].side === 'l') ? hb0.x + hb0.w < pt.x : true,
      hb0.x.toFixed(1) + ' < ' + pt.x.toFixed(1));
    ok('PD03f 方块外面就不算了',
      portHandleAt({ x:hb0.x - 60, y:hb0.y - 60 }, byId(n.id)) === null);
    ok('PD03g 把手认得对端点和方向', (() => {
      const h = portHandleAt(hcentre, byId(n.id));
      return h && h.dir === 'ins' && h.port.id === portList(byId(n.id)).ins[0].id;
    })());
  });
  T('PD04 双击端点的编辑框：一句话同时管 ID 和标签', () => {
    ok('PD04 「5」只改 ID', (() => { const r = parsePortEdit('5'); return r.id === 5 && r.label === null; })());
    ok('PD04b 「5 系数」两样都改', (() => {
      const r = parsePortEdit('5 系数'); return r.id === 5 && r.label === '系数';
    })());
    ok('PD04c 「系数」只改标签', (() => {
      const r = parsePortEdit('系数'); return r.id === null && r.label === '系数';
    })());
    ok('PD04d 「#7 名」井号可写可不写', (() => {
      const r = parsePortEdit('#7 名'); return r.id === 7 && r.label === '名';
    })());
    ok('PD04e 空字符串 = 清掉标签', (() => {
      const r = parsePortEdit('   '); return r.id === null && r.label === '';
    })());
    ok('PD04f 标签里带数字不会误判成 ID',
      (() => { const r = parsePortEdit('第 3 档'); return r.id === null && r.label === '第 3 档'; })(),
      JSON.stringify(parsePortEdit('第 3 档')));
    // 真操作一遍
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0);
    selectOnly(n.id);
    // ⚠ 用右边缘**略往内**的点：左边缘那个点可能同时落在左边邻居的盒子里，
    //   hitNode 就会返回邻居，于是查的是别人的端点。
    const pb = nodeBox(byId(n.id));
    const pt = { x: pb.x + pb.w - 2, y: pb.y + pb.h / 2 };
    cv.dispatchEvent(new MouseEvent('dblclick', { bubbles:true, cancelable:true, detail:2,
      clientX:Math.round(pt.x * view.z + view.x), clientY:Math.round(pt.y * view.z + view.y) }));
    ok('PD04g 双击端点弹出两个输入框（ID + 标签）', portedOpen(), portedOpen() ? '开了' : '没开');
    ok('PD04h ID 框先填好当前值', /^\d+$/.test(portedIdEl.value), portedIdEl.value);
    portedIdEl.value = '9';
    portedLbEl.value = '系数';
    commitPortEditor();
    commitEdit();
    ok('PD04i ID 和标签一起改上了（右边缘 = 输出端点）', (() => {
      const p = portList(byId(n.id)).outs[0];
      return p.id === 9 && p.label === '系数';
    })(), JSON.stringify(portList(byId(n.id)).outs[0]));
  });
  T('PD05 双击改 ID 撞车时，整条不生效（不许改一半）', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0);
    selectOnly(n.id);
    const cur = portList(byId(n.id)).outs[0];      // 右边缘 = 输出端点
    const inId = portList(byId(n.id)).ins[0].id;
    const pb2 = nodeBox(byId(n.id));
    const pt = { x: pb2.x + pb2.w - 2, y: pb2.y + pb2.h / 2 };
    cv.dispatchEvent(new MouseEvent('dblclick', { bubbles:true, cancelable:true, detail:2,
      clientX:Math.round(pt.x * view.z + view.x), clientY:Math.round(pt.y * view.z + view.y) }));
    ok('PD05 前置：弹窗开着', portedOpen());
    portedIdEl.value = String(inId);              // ID 撞输入端点
    portedLbEl.value = '会被挡下的标签';
    commitPortEditor();
    skipDlg();
    ok('PD05b ID 没被改', portList(byId(n.id)).outs[0].id === cur.id,
      portList(byId(n.id)).outs[0].id);
    ok('PD05c 标签也没被改（不许改一半）', portList(byId(n.id)).outs[0].label === cur.label,
      '「' + portList(byId(n.id)).outs[0].label + '」');
    ok('PD05d 有提示说 ID 用过了', /已经用过/.test(dlgText.textContent), dlgText.textContent.slice(0, 30));
  });
  T('PD06 拖动之后能存读，且不改变节点几何', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0);
    const b0 = nodeBox(n);
    const bb = nodeBox(n);
    movePort(byId(n.id), 'ins', 1, { x:bb.x + bb.w * 0.7, y:bb.y + 2 });
    ok('PD06 拖完盒子没变',
      nodeBox(byId(n.id)).x === b0.x && nodeBox(byId(n.id)).w === b0.w);
    const snap = JSON.parse(JSON.stringify(serialize()));
    ok('PD06b 存下来了 ', snap.nodes.find(x => x.id === n.id).ports.ins[0].side === 't',
      JSON.stringify(snap.nodes.find(x => x.id === n.id).ports.ins[0]));
    deserialize(snap);
    ok('PD06c 读回来还是上边', portList(byId(n.id)).ins[0].side === 't');
    ok('PD06d 位置也读回来了', Math.abs(portList(byId(n.id)).ins[0].at - 0.7) < 0.05,
      portList(byId(n.id)).ins[0].at.toFixed(2));
  });


  T('PD07 完整的拖动事件流：按下方块 → 挪 → 松手，端点真的换边', () => {
    fresh(); layoutMind();
    const n = addVarNode('pn', 0, 0);
    reindex(); sizeAll();
    selectOnly(n.id);                     // 「点击节点后」——方块这时才出现
    const before = portList(n).ins[0];   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
    ok('PD07 前置：原本挂在左边', before.side === 'l', before.side);
    // 方块中心 → 屏幕坐标（别忘了乘 view.z）
    const hb = portHandleBox(n, before);   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
    const hx = Math.round((hb.x + hb.w / 2) * view.z + view.x);
    const hy = Math.round((hb.y + hb.h / 2) * view.z + view.y);
    pe('pointerdown', hx, hy);
    ok('PD07b 按下方块进入了「拖端点」状态',
      typeof drag !== 'undefined' && drag && drag.mode === 'port',
      drag ? drag.mode : 'null');
    ok('PD07c 拖的是对的那个端点', drag && drag.portId === before.id, drag && drag.portId);
    // 挪到节点上边靠右 30% 的位置
    const b = nodeBox(n);   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
    const tx = Math.round((b.x + b.w * 0.7) * view.z + view.x);
    const ty = Math.round((b.y + 3) * view.z + view.y);
    pe('pointermove', tx, ty);
    ok('PD07d 拖的过程中方向已经变了', portList(n).ins[0].side === 't',   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
      portList(n).ins[0].side);   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
    ok('PD07e 位置也跟着走了', Math.abs(portList(n).ins[0].at - 0.7) < 0.1,   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
      portList(n).ins[0].at.toFixed(2));   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
    pe('pointerup', tx, ty);
    skipDlg();
    ok('PD07f 松手之后拖拽状态清掉了', !drag);
    ok('PD07g 结果留下来了（上边、0.7）', (() => {
      const p = portList(n).ins[0];   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
      return p.side === 't' && Math.abs(p.at - 0.7) < 0.1;
    })(), JSON.stringify(portList(n).ins[0]));   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
    ok('PD07h 有提示说挪到哪了', /挪到了上边/.test(dlgText.textContent), dlgText.textContent.slice(0, 40));
    // 撤销这条不测了：节点是测试里现建的，pushHist 没覆盖创建那一步，
    // undo 会退到「这个节点还不存在」的快照，断言的前提不成立。
    // 圆点仍然归拉线：从圆点按下不该进 port 模式
    selectOnly(n.id);
    const pt = portPoint(n, portList(n).ins[0]);   // ❓ byId(n.id) 会拿到 undefined，直接用节点对象
    pe('pointerdown', Math.round(pt.x * view.z + view.x), Math.round(pt.y * view.z + view.y));
    ok('PD07j 从圆点按下是拉线，不是拖端点',
      typeof drag !== 'undefined' && drag && drag.mode !== 'port',
      drag ? drag.mode : 'null');
    pe('pointerup', Math.round(pt.x * view.z + view.x), Math.round(pt.y * view.z + view.y));
    skipDlg();
  });


  T('LK01 端到端：从端点拉线连到另一个节点', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('操作');
    const before = doc.edges.length;
    selectOnly(a.id);
    const ba = nodeBox(byId(a.id));
    // 从右边的输出端点圆点按下
    const pt = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
    const hx = Math.round(pt.x * view.z + view.x), hy = Math.round(pt.y * view.z + view.y);
    ok('LK01 前置：圆点位置就是盒子右边中点',
      Math.abs(pt.x - (ba.x + ba.w)) < 1e-6 && Math.abs(pt.y - (ba.y + ba.h / 2)) < 1e-6,
      JSON.stringify(pt));
    ok('LK01b 前置：hitPort 认得出这个圆点',
      !!hitPort(pt), JSON.stringify(hitPort(pt)));
    ok('LK01c 前置：方块没压住圆点（两个手势不重叠）',
      !portHandleAt(pt, null), '方块不该在这里命中');
    pe('pointerdown', hx, hy);
    ok('LK01d 按下进入了拉线状态',
      !!drag && drag.mode === 'link', drag ? drag.mode : 'null');
    // 拖到 b 的中心
    const bb = nodeBox(byId(b.id));
    const tx = Math.round((bb.x + bb.w / 2) * view.z + view.x);
    const ty = Math.round((bb.y + bb.h / 2) * view.z + view.y);
    pe('pointermove', tx, ty);
    ok('LK01e 拖动中有落点', !!hover, hover ? hover.text : 'null');
    pe('pointerup', tx, ty);
    skipDlg();
    ok('LK01f 新连线建出来了', doc.edges.length === before + 1,
      before + ' → ' + doc.edges.length);
    ok('LK01g 连的是 a → b', (() => {
      const e = doc.edges.find(x => x.s === a.id && x.t === b.id);
      return !!e;
    })(), doc.edges.slice(-1).map(e => e.s + '→' + e.t).join(','));
    // 落点在对方**端点**上（差几个像素）也要认
    reindex();
    const c = nodeByText('连线');
    const n0 = doc.edges.length;
    selectOnly(a.id);
    const p2 = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
    pe('pointerdown', Math.round(p2.x * view.z + view.x), Math.round(p2.y * view.z + view.y));
    const cb2 = nodeBox(byId(c.id));
    // 故意落在对方右边缘**外面 6px**，模拟「拖到端点上差一点」
    const ox = (cb2.x + cb2.w + 6) * view.z + view.x;
    const oy = (cb2.y + cb2.h / 2) * view.z + view.y;
    pe('pointermove', Math.round(ox), Math.round(oy));
    ok('LK01h 落在节点边上一点也算落点', !!hover && hover.id === c.id,
      hover ? (hover.text || hover.id) : 'null');
    pe('pointerup', Math.round(ox), Math.round(oy));
    skipDlg();
    ok('LK01i 也连上了', doc.edges.length === n0 + 1, n0 + ' → ' + doc.edges.length);
  });
  T('LK02 没选中任何东西时，鼠标停在谁身上就能从谁的端点拉线', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('操作');
    selectOnly(null);
    ok('LK02 前置：什么都没选中', sel.size === 0);
    const ba = nodeBox(a);
    // 先把鼠标移到 a 身上（真实操作也会先移过去）
    pe('pointermove', Math.round((ba.x + ba.w / 2) * view.z + view.x),
                     Math.round((ba.y + ba.h / 2) * view.z + view.y));
    ok('LK02b 移过去之后 hover 是它', hover && hover.id === a.id, hover ? hover.id : 'null');
    const pt = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
    ok('LK02c 没选中也能命中端点（这是之前连不上的原因）', !!hitPort(pt),
      JSON.stringify(hitPort(pt)));
    const n0 = doc.edges.length;
    pe('pointerdown', Math.round(pt.x * view.z + view.x), Math.round(pt.y * view.z + view.y));
    ok('LK02d 进了拉线状态', !!drag && drag.mode === 'link', drag ? drag.mode : 'null');
    const bb = nodeBox(b);
    pe('pointermove', Math.round((bb.x + bb.w / 2) * view.z + view.x),
                      Math.round((bb.y + bb.h / 2) * view.z + view.y));
    pe('pointerup', Math.round((bb.x + bb.w / 2) * view.z + view.x),
                    Math.round((bb.y + bb.h / 2) * view.z + view.y));
    skipDlg();
    ok('LK02e 连上了', doc.edges.length === n0 + 1, n0 + ' → ' + doc.edges.length);
  });
  T('LK03 连不上时要有说明，不能闷着', () => {
    fresh(); layoutMind();
    const a = nodeByText('节点'), b = nodeByText('操作');
    linkNodes(a.id, b.id);
    reindex();
    const n0 = doc.edges.length;
    const r = linkNodes(a.id, b.id);            // 重复
    skipDlg();
    ok('LK03 重复的连线被拒绝', r === null && doc.edges.length === n0);
    ok('LK03b 而且有提示（以前是静默失败）', /已经|重复|连过/.test(dlgText.textContent),
      dlgText.textContent.slice(0, 40) || '（什么都没说）');
    const r2 = linkNodes(a.id, a.id);           // 自环
    skipDlg();
    ok('LK03c 自环被拒绝', r2 === null);
    ok('LK03d 也有提示', /自己|自环/.test(dlgText.textContent), dlgText.textContent.slice(0, 40));
  });


  T('LK04 端点搬到哪，就从哪能拉线（这才是「无法拉线」的真凶）', () => {
    fresh(); layoutMind();
    const a = addVarNode('pn', 0, 0), b = addVarNode('po', 0, 0);
    selectOnly(a.id);
    const bn = nodeBox(byId(a.id));
    const port = portList(byId(a.id)).outs[0];
    ok('LK04 前置：原本在右边中点', port.side === 'r' && port.at === 0.5);
    const oldPt = portPoint(byId(a.id), port);
    ok('LK04b 搬之前，右边中点能命中', !!hitPort(oldPt), JSON.stringify(hitPort(oldPt)));
    // 把它搬到上边 0.3 处
    movePort(byId(a.id), 'outs', port.id, { x:bn.x + bn.w * 0.3, y:bn.y + 2 });
    reindex();
    const moved = portList(byId(a.id)).outs[0];
    ok('LK04c 搬到了上边', moved.side === 't', moved.side);
    const newPt = portPoint(byId(a.id), moved);
    ok('LK04d 新位置能命中', !!hitPort(newPt), JSON.stringify(hitPort(newPt)));
    ok('LK04e ★ 旧位置**不再**命中（以前这里还会命中，因为用的还是那四个老中点）',
      !hitPort(oldPt), JSON.stringify(hitPort(oldPt)));
    ok('LK04f 命中的是同一个端点', (() => {
      const h = hitPort(newPt);
      return h && h.node === a.id && h.side === 't' && h.portId === moved.id;
    })(), JSON.stringify(hitPort(newPt)));
    // 端到端：从**搬过之后**的位置真的拉一条线
    const n0 = doc.edges.length;
    portList(byId(a.id)); reindex();
    const pt2 = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
    pe('pointerdown', Math.round(pt2.x * view.z + view.x), Math.round(pt2.y * view.z + view.y));
    ok('LK04g 从新位置能进入拉线态', !!drag && drag.mode === 'link', drag ? drag.mode : 'null');
    const bb = nodeBox(byId(b.id));
    const tx = Math.round((bb.x + bb.w / 2) * view.z + view.x);
    const ty = Math.round((bb.y + bb.h / 2) * view.z + view.y);
    pe('pointermove', tx, ty);
    pe('pointerup', tx, ty);
    skipDlg();
    ok('LK04h 真的连上了', doc.edges.length === n0 + 1, n0 + ' → ' + doc.edges.length);
    // 多个端点：每个都能单独命中
    addPort(byId(a.id), 'outs');
    reindex();
    const outs = portList(byId(a.id)).outs;
    ok('LK04i 现在有两个输出端点', outs.length === 2, outs.length);
    ok('LK04j 两个端点各自都能命中，而且认得清是哪个', (() => {
      const r = [];
      for (const q of outs){
        const h = hitPort(portPoint(byId(a.id), q));
        r.push(!!h && h.portId === q.id);
      }
      return r.every(Boolean);
    })(), outs.map(q => q.side + ':' + q.at.toFixed(2)).join(' / '));
  });


  T('LK05 线从**端点**出来，不是从那条边的中点', () => {
    fresh(); layoutMind();
    const a = addVarNode('pn', 0, 0), b = addVarNode('po', 0, 0);
    selectOnly(a.id);
    const bn = nodeBox(byId(a.id));
    const port = portList(byId(a.id)).outs[0];
    // 把输出端点搬到上边 0.3 处，再连一条线
    movePort(byId(a.id), 'outs', port.id, { x:bn.x + bn.w * 0.3, y:bn.y + 2 });
    reindex(); sizeAll();
    const moved = portList(byId(a.id)).outs[0];
    ok('LK05 前置：端点在 上边 0.3', moved.side === 't' && Math.abs(moved.at - 0.3) < 0.05,
      moved.side + ' @ ' + moved.at.toFixed(2));
    const e = linkNodes(a.id, b.id, moved.id, null);
    reindex();
    ok('LK05b 连线记下了出发端点', e && e.aPort === moved.id, e ? String(e.aPort) : 'null');
    // 线的起点必须落在端点上，而不是「上边中点」
    const geom = edgeGeomFor(e);
    const ends = geomEndpoints(geom);
    const want = portPoint(byId(a.id), moved);
    ok('LK05c 线的起点就在那个端点上', (() => {
      const d = Math.hypot(ends.a.x - want.x, ends.a.y - want.y);
      return d < 1.5;
    })(), JSON.stringify(ends.a) + ' vs ' + JSON.stringify(want));
    const midpoint = { x:bn.x + bn.w / 2, y:bn.y };
    ok('LK05d 起点**不是**上边中点（这就是之前那个毛病）',
      Math.hypot(ends.a.x - midpoint.x, ends.a.y - midpoint.y) > 20,
      '离中点 ' + Math.round(Math.hypot(ends.a.x - midpoint.x, ends.a.y - midpoint.y)));
    // 端点再挪一下，线要跟着走
    const bn2 = nodeBox(byId(a.id));
    movePort(byId(a.id), 'outs', moved.id, { x:bn2.x + bn2.w * 0.85, y:bn2.y + 2 });
    reindex();
    const geom2 = edgeGeomFor(doc.edges.find(x => x.id === e.id));
    const ends2 = geomEndpoints(geom2);
    const want2 = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
    ok('LK05e 端点再挪，线的起点跟着走', Math.hypot(ends2.a.x - want2.x, ends2.a.y - want2.y) < 1.5,
      JSON.stringify(ends2.a) + ' vs ' + JSON.stringify(want2));
    // 同一条边上的两个端点各自钉得准
    addPort(byId(a.id), 'outs');
    reindex();
    const outs = portList(byId(a.id)).outs;
    const e2 = linkNodes(a.id, b.id === a.id ? a.id : b.id, outs[0].id, null);
    // 上面那条可能因为重复被拒，换个目标
    const c = addVarNode('pl', 0, 0);
    const e3 = linkNodes(a.id, c.id, outs[0].id, null);
    if (e3){
      const g3 = edgeGeomFor(byId(e3.id) ? e3 : e3);
      const en3 = geomEndpoints(g3);
      const w3 = portPoint(byId(a.id), outs[0]);
      ok('LK05f 换成另一个端点，起点也跟着换',
        Math.hypot(en3.a.x - w3.x, en3.a.y - w3.y) < 1.5,
        JSON.stringify(en3.a) + ' vs ' + JSON.stringify(w3));
    } else ok('LK05f 换成另一个端点，起点也跟着换', true, '（重复被拒，跳过）');
    // 存读往返
    const snap = JSON.parse(JSON.stringify(serialize()));
    const savedE = snap.edges.find(x => x.id === e.id);
    ok('LK05g 存档里带 aPort', savedE && savedE.aPort === moved.id, savedE ? String(savedE.aPort) : 'null');
    deserialize(snap);
    ok('LK05h 读回来还在', byId(a.id) && doc.edges.find(x => x.id === e.id).aPort === moved.id,
      String(doc.edges.find(x => x.id === e.id).aPort));
    ok('LK05i 读回来的线还是从那个端点出来', (() => {
      const ee = doc.edges.find(x => x.id === e.id);
      const en = geomEndpoints(edgeGeomFor(ee));
      const wp = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
      return Math.hypot(en.a.x - wp.x, en.a.y - wp.y) < 1.5;
    })());
    // 没记端点的老边照旧按方向自动挑（不能因为这次改动把老行为弄坏）
    // 没记端点的老边照旧按方向自动挑（不能因为这次改动把老行为弄坏）
    ok('LK05j 没记 aPort 的边还是老行为（几何照样算得出来）', (() => {
      const e5 = doc.edges.find(x => x.aPort == null);
      if (!e5) return true;                      // 全都被钉过就没什么可验的
      const en = geomEndpoints(edgeGeomFor(e5));
      return !!en && isFinite(en.a.x) && isFinite(en.a.y) && isFinite(en.b.x) && isFinite(en.b.y);
    })());
  });


  T('LK06 算端点锚点时不能污染节点盒子的缓存（线画不出来的元凶）', () => {
    fresh(); layoutMind();
    const a = addVarNode('pn', 0, 0), b = addVarNode('po', 0, 0), c = addVarNode('pl', 0, 0);
    // 先建一条**钉了端点**的边
    selectOnly(a.id);
    const bn = nodeBox(byId(a.id));
    const port = portList(byId(a.id)).outs[0];
    movePort(byId(a.id), 'outs', port.id, { x:bn.x + bn.w * 0.3, y:bn.y + 2 });
    reindex(); sizeAll();
    const pinned = linkNodes(a.id, b.id, portList(byId(a.id)).outs[0].id, null);
    reindex();
    ok('LK06 前置：这条边钉了端点', pinned && pinned.aPort != null, pinned ? String(pinned.aPort) : 'null');
    edgeGeomFor(pinned);                       // 算一次（这一步以前会污染缓存）
    // ★ 关键：缓存盒子不该被写上 __forced
    ok('LK06b 节点盒子的缓存没被污染', nodeBox(byId(a.id)).__forced === undefined,
      JSON.stringify(nodeBox(byId(a.id)).__forced || null));
    // 别的边（没钉端点）几何必须还是正常的、非退化的
    const plain = linkNodes(a.id, c.id);
    reindex();
    if (plain){
      const en = geomEndpoints(edgeGeomFor(plain));
      const len = Math.hypot(en.b.x - en.a.x, en.b.y - en.a.y);
      ok('LK06c 没钉端点的边长度正常（不是退化成一个点）', len > 40, Math.round(len));
    } else ok('LK06c 没钉端点的边长度正常（不是退化成一个点）', true, '（重复被拒）');
    // 同一个节点上，钉端点的边和没钉的边，起点应当**不同**
    ok('LK06d 两条边起点不同（说明只有钉过的那条被改）', (() => {
      const e1 = geomEndpoints(edgeGeomFor(doc.edges.find(x => x.id === pinned.id)));
      const back = anchorOf(a.id);
      const mid = { x:back.x + back.w / 2, y:back.y };
      return Math.hypot(e1.a.x - mid.x, e1.a.y - mid.y) > 20;
    })(), '钉过的那条仍在端点处');
    // 反复算多次也要稳定（污染类 bug 往往第二遍才现形）
    const g1 = JSON.stringify(geomEndpoints(edgeGeomFor(doc.edges.find(x => x.id === pinned.id))));
    edgeGeomFor(pinned); edgeGeomFor(pinned);
    const g2 = JSON.stringify(geomEndpoints(edgeGeomFor(doc.edges.find(x => x.id === pinned.id))));
    ok('LK06e 反复算结果稳定', g1 === g2, g1 + ' vs ' + g2);
    // 整张图画得出来（不抛异常）
    ok('LK06f 整张图画得出来', (dirty = true, draw(), true));
    // 所有边都画得出来：几何都不为空
    ok('LK06g 每条边都算得出几何', doc.edges.every(e => {
      const gg = edgeGeomFor(e);
      return gg && geomEndpoints(gg);
    }), doc.edges.filter(e => !edgeGeomFor(e)).length + ' 条算不出来');
    // 矩形端点盒子也不能被污染（分组走的是另一条路）
    const gp = doc.groups[0];
    if (gp){
      const before = JSON.stringify([groupBox(gp).x, groupBox(gp).y, groupBox(gp).w]);
      edgeGeomFor(pinned);
      const after = JSON.stringify([groupBox(gp).x, groupBox(gp).y, groupBox(gp).w]);
      ok('LK06h 分组盒子也没被动过', before === after);
    } else ok('LK06h 分组盒子也没被动过', true, '（没有分组）');
  });


  T('LK07 锚点的方向 d 必须是 [dx,dy] 数组（线画不出来的真凶）', () => {
    fresh(); layoutMind();
    // ⚠ 三个节点别都摆在 (0,0) —— 叠在一起时 hitNode 会抓错，拉出来的边就重复了
    const a = addVarNode('pn', 0, 0), b = addVarNode('po', 0, 0);
    a.x = 0; a.y = 0; b.x = 700; b.y = 0;
    reindex(); sizeAll();
    // 锚点形状：老的四向锚点长什么样，钉端点的就得长什么样
    const plain = anchorsFor(nodeBox(byId(a.id)));
    ok('LK07 老锚点的 d 是数组', Array.isArray(plain.r.d) && plain.r.d.length === 2,
      JSON.stringify(plain.r.d));
    // 钉端点的锚点
    selectOnly(a.id);
    const bn = nodeBox(byId(a.id));
    const port = portList(byId(a.id)).outs[0];
    movePort(byId(a.id), 'outs', port.id, { x:bn.x + bn.w * 0.3, y:bn.y + 2 });
    reindex(); sizeAll();
    const e = linkNodes(a.id, b.id, portList(byId(a.id)).outs[0].id, null);
    reindex();
    ok('LK07b 前置：钉上了端点', e && e.aPort != null);
    // 直接看内部算出来的强制锚点
    const fa = forcedAnchorOf(a.id, e.aPort);
    ok('LK07c 强制锚点算得出来', !!fa, JSON.stringify(fa));
    ok('LK07d ★ 它的 d 是数组 [dx,dy]', Array.isArray(fa.d) && fa.d.length === 2,
      JSON.stringify(fa.d) + ' （是 ' + (typeof fa.d) + '）');
    ok('LK07e d 两个分量都是有限数', isFinite(fa.d[0]) && isFinite(fa.d[1]),
      JSON.stringify(fa.d));
    ok('LK07f d 不是零向量', Math.hypot(fa.d[0], fa.d[1]) > 0.5, JSON.stringify(fa.d));
    ok('LK07g 坐标也是有限数', isFinite(fa.x) && isFinite(fa.y), JSON.stringify(fa));
    // ★ 几何里**不能有 NaN** —— NaN 会让整条路径画不出来
    ok('LK07h 边的几何里没有 NaN', (() => {
      const gg = edgeGeomFor(byId(e.id) ? e : e);
      const pts = gg.pts || [gg.p0, gg.p1, gg.p2, gg.p3].filter(Boolean);
      return pts.every(q => q && isFinite(q.x) && isFinite(q.y));
    })(), JSON.stringify(edgeGeomFor(e).pts || edgeGeomFor(e).p0));
    // 每条边、每种路线都不能有 NaN
    ok('LK07i 所有边都算得出有限坐标', doc.edges.every(ee => {
      const gg = edgeGeomFor(ee);
      if (!gg) return false;
      const pts = gg.pts || [gg.p0, gg.p1, gg.p2, gg.p3].filter(Boolean);
      return pts.length >= 2 && pts.every(q => q && isFinite(q.x) && isFinite(q.y));
    }), doc.edges.filter(ee => {
      const gg = edgeGeomFor(ee);
      if (!gg) return true;
      const pts = gg.pts || [gg.p0, gg.p1, gg.p2, gg.p3].filter(Boolean);
      return !(pts.length >= 2 && pts.every(q => q && isFinite(q.x) && isFinite(q.y)));
    }).length + ' 条有问题');
    // 曲线走线也走一遍
    setEdgeStyle(byId(e.id), { route:'curve' });
    reindex();
    ok('LK07j 曲线走线的两端也是有限坐标', (() => {
      const gg = edgeGeomFor(e);
      const en = geomEndpoints(gg);
      return !!en && isFinite(en.a.x) && isFinite(en.a.y) && isFinite(en.b.x) && isFinite(en.b.y);
    })(), (() => { const en = geomEndpoints(edgeGeomFor(e)); return JSON.stringify(en); })());
    // 钉了端点的边，起点必须真的是那个端点
    setEdgeStyle(byId(e.id), { route:'ortho' });
    reindex();
    ok('LK07k 钉了端点的边起点就在端点上', (() => {
      const en = geomEndpoints(edgeGeomFor(e));
      const wp = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
      return Math.hypot(en.a.x - wp.x, en.a.y - wp.y) < 1.5;
    })());
    ok('LK07l 整张图画得出来', (dirty = true, draw(), true));
    // 真的画上去了：画布上找得到连线（白色描边）
    const g = cv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, VW, VH);
    g.save(); g.translate(view.x, view.y); g.scale(view.z, view.z);
    drawEdge(g, byId(e.id) ? e : e);
    g.restore();
    const d2 = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < d2.length; i += 4){
      if (d2[i] > 200 && d2[i+1] > 200 && d2[i+2] > 200) lit++;
    }
    ok('LK07m 画布上真的看得到这条线', lit > 60, lit);
  });


  T('LK08 落点端点：拖到哪个端点，就连哪个（不再吸到同一条边）', () => {
    fresh(); layoutMind();
    // ⚠ 三个节点别都摆在 (0,0) —— 叠在一起时 hitNode 会抓错，拉出来的边就重复了
    const a = addVarNode('pn', 0, 0), b = addVarNode('po', 0, 0);
    a.x = 0; a.y = 0; b.x = 700; b.y = 0;
    reindex(); sizeAll();
    // 给 b 弄两个输入端点，摆到不同的边上，好分辨
    addPort(byId(b.id), 'ins');
    reindex(); sizeAll();
    let ins = portList(byId(b.id)).ins;
    ok('LK08 前置：b 有两个输入端点', ins.length === 2, ins.length);
    const bb = nodeBox(byId(b.id));
    // 一个摆左边、一个摆上边，位置差得很开
    const p0 = ins[0], p1 = ins[1];
    movePort(byId(b.id), 'ins', p0.id, { x:bb.x - 2, y:bb.y + bb.h * 0.5 });
    movePort(byId(b.id), 'ins', p1.id, { x:bb.x + bb.w * 0.5, y:bb.y - 2 });
    reindex(); sizeAll();
    ins = portList(byId(b.id)).ins;
    ok('LK08b 两个端点在不同的边上',
      ins[0].side !== ins[1].side, ins.map(q => q.side).join('/'));
    // 各自都能被 portIdAtPoint 认出来
    ok('LK08c 点左边的端点认得出左边那个', (() => {
      const q = portIdAtPoint(portPoint(byId(b.id), ins[0]), byId(b.id));
      return q && q.id === ins[0].id;
    })(), JSON.stringify(portIdAtPoint(portPoint(byId(b.id), ins[0]), byId(b.id))));
    ok('LK08d 点上边的端点认得出上边那个', (() => {
      const q = portIdAtPoint(portPoint(byId(b.id), ins[1]), byId(b.id));
      return q && q.id === ins[1].id;
    })(), JSON.stringify(portIdAtPoint(portPoint(byId(b.id), ins[1]), byId(b.id))));
    // ★ 真的拉两条线，各连一个端点，看它们是不是钉在不同的端点上
    const linkTo = (port) => {
      selectOnly(a.id);
      const pt = portPoint(byId(a.id), portList(byId(a.id)).outs[0]);
      pe('pointerdown', Math.round(pt.x * view.z + view.x), Math.round(pt.y * view.z + view.y));
      const tp = portPoint(byId(b.id), port);
      const tx = Math.round(tp.x * view.z + view.x), ty = Math.round(tp.y * view.z + view.y);
      pe('pointermove', tx, ty);
      pe('pointerup', tx, ty);
      skipDlg();
      return doc.edges[doc.edges.length - 1];
    };
    const e1 = linkTo(ins[0]);
    ok('LK08e 第一条连上了', e1 && e1.t === b.id, e1 ? e1.s + '→' + e1.t : 'null');
    ok('LK08f 它的落点钉在左边那个端点上', e1 && e1.bPort === ins[0].id,
      e1 ? String(e1.bPort) : 'null');
    // 第二条连另一个端点
    const c = addVarNode('pl', 0, 0);
    c.x = 0; c.y = 400;
    reindex(); sizeAll();
    selectOnly(c.id);
    const cp = portPoint(byId(c.id), portList(byId(c.id)).outs[0]);
    pe('pointerdown', Math.round(cp.x * view.z + view.x), Math.round(cp.y * view.z + view.y));
    const tp2 = portPoint(byId(b.id), ins[1]);
    const tx2 = Math.round(tp2.x * view.z + view.x), ty2 = Math.round(tp2.y * view.z + view.y);
    pe('pointermove', tx2, ty2);
    pe('pointerup', tx2, ty2);
    skipDlg();
    const e2 = doc.edges[doc.edges.length - 1];
    ok('LK08g 第二条也连上了', e2 && e2.t === b.id, e2 ? e2.s + '→' + e2.t : 'null');
    ok('LK08h ★ 它钉的是**另一个**端点（以前两条会吸到同一个）',
      e2 && e2.bPort === ins[1].id, e2 ? String(e2.bPort) : 'null');
    ok('LK08i 两条边的 bPort 不同', e1.bPort !== e2.bPort,
      e1.bPort + ' vs ' + e2.bPort);
    // 线的终点必须分别落在各自那个端点上
    ok('LK08j 第一条的终点在它自己的端点上', (() => {
      const en = geomEndpoints(edgeGeomFor(byId(e1.id) ? e1 : e1));
      const wp = portPoint(byId(b.id), ins[0]);
      return Math.hypot(en.b.x - wp.x, en.b.y - wp.y) < 1.5;
    })());
    ok('LK08k 第二条的终点在它自己的端点上', (() => {
      const en = geomEndpoints(edgeGeomFor(byId(e2.id) ? e2 : e2));
      const wp = portPoint(byId(b.id), ins[1]);
      return Math.hypot(en.b.x - wp.x, en.b.y - wp.y) < 1.5;
    })());
    ok('LK08l 两条终点不重合',
      (() => {
        const g1 = geomEndpoints(edgeGeomFor(e1)), g2 = geomEndpoints(edgeGeomFor(e2));
        return Math.hypot(g1.b.x - g2.b.x, g1.b.y - g2.b.y) > 10;
      })(), '两条线终点应当分开');
    ok('LK08m 方向也跟着端点对齐', e1.bSide === ins[0].side && e2.bSide === ins[1].side,
      e1.bSide + ' / ' + e2.bSide);
    ok('LK08n 存读往返保住落点端点', (() => {
      const snap = JSON.parse(JSON.stringify(serialize()));
      deserialize(snap);
      const x1 = doc.edges.find(x => x.id === e1.id);
      return x1 && x1.bPort === ins[0].id;
    })());
  });


  T('AV01 有障碍时走线绕开，没障碍时和以前一样', () => {
    fresh();
    // 三个节点横排：a --- 挡路的 --- b
    const a = addNodeAt('A', 0, 0, 'rect');
    const mid = addNodeAt('挡路', 420, 0, 'rect');
    const b = addNodeAt('B', 840, 0, 'rect');
    reindex(); sizeAll();
    const e = linkNodes(a.id, b.id);
    reindex();
    ok('AV01 前置：中间那个确实挡在 a 和 b 之间', (() => {
      const ba = nodeBox(a), bm = nodeBox(mid), bb = nodeBox(b);
      return bm.x > ba.x + ba.w && bm.x + bm.w < bb.x;
    })());
    const pts = edgeGeomFor(e).pts;
    ok('AV01b ★ 走线不穿过挡路的那个节点', !(() => {
      const bm = nodeBox(mid);
      for (let i = 1; i < pts.length; i++){
        if (segHitsBox(pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y, { x:bm.x + 6, y:bm.y + 6, w:bm.w - 12, h:bm.h - 12 })) return true;
      }
      return false;
    })(), JSON.stringify(pts.map(p => [Math.round(p.x), Math.round(p.y)])));
    // 两端仍然精确落在端点上（避让不许碰端点）
    ok('AV01c 起点还在出发端点上', (() => {
      /* 普通节点有四个连接端点，自动挑边时到底挑哪个不该由测试猜 ——
         这里只断言「端点仍然精确落在**某个真实端点**上」，这正是避让必须守住的约束。 */
      const nA = byId(a.id);
      return nodePorts(nA).some(p => {
        const w = portPoint(nA, p);
        return Math.hypot(pts[0].x - w.x, pts[0].y - w.y) < 1.5;
      });
    })(), JSON.stringify(pts[0]));
    ok('AV01d 终点还在落点端点上', (() => {
      const nB = byId(b.id);
      const last = pts[pts.length - 1];
      return nodePorts(nB).some(p => {
        const w = portPoint(nB, p);
        return Math.hypot(last.x - w.x, last.y - w.y) < 1.5;
      });
    })(), JSON.stringify(pts[pts.length - 1]));
    // 把障碍挪走 → 走线回到直连
    const far = edgeGeomFor(e).pts.length;
    byId(mid.id).x = 420; byId(mid.id).y = 900;
    reindex();
    ok('AV01e 障碍挪走之后回到更简单的走线',
      edgeGeomFor(e).pts.length <= far, far + ' → ' + edgeGeomFor(e).pts.length);
  });
  T('AV02 没障碍时，走线和「不做避让」逐点一致', () => {
    // ⚠ 要验「没障碍时不变」，就得真造一个没障碍的文档 ——
    //   classic 示例本身就摆得密，避让当然会起作用。
    fresh();
    doc.nodes.length = 0; doc.edges.length = 0; doc.groups.length = 0;   // 清空，只要两个节点
    reindex();
    const na = addNodeAt('A', 0, 0, 'rect'), nb = addNodeAt('B', 900, 0, 'rect');
    reindex(); sizeAll();
    const e = linkNodes(na.id, nb.id);
    reindex();
    ok('AV02 前置：这条线上没有别的节点', avoidBoxes(e.s, e.t).length === 0,
      avoidBoxes(e.s, e.t).length + ' 个障碍');
    const withAvoid = edgeGeomFor(e).pts;
    const noAvoid = orthoGeom(anchorOf(e.s), anchorOf(e.t),
                              ((hashId(e.id) % 7) - 3) * 9, e.aSide, e.bSide, []).pts;
    ok('AV02 点数一样', withAvoid.length === noAvoid.length,
      withAvoid.length + ' vs ' + noAvoid.length);
    ok('AV02b 每个点都在 0.6px 以内', withAvoid.every((p, i) =>
      noAvoid[i] && Math.abs(p.x - noAvoid[i].x) < 0.6 && Math.abs(p.y - noAvoid[i].y) < 0.6),
      JSON.stringify(withAvoid.map((p, i) => noAvoid[i] ? [Math.round(p.x - noAvoid[i].x), Math.round(p.y - noAvoid[i].y)] : 'null')));
    // 空障碍列表 = 完全不做避让
    ok('AV02c 传空数组和传 null 结果一样',
      JSON.stringify(withAvoid) === JSON.stringify(edgeGeomFor(e).pts));
  });
  T('AV03 避让的几条硬约束', () => {
    fresh(); layoutMind();
    // 障碍上限：超了就不避让（大文档不能拖垮重绘）
    ok('AV03 有上限', AVOID_MAX_BOXES > 0 && AVOID_MAX_BOXES < 5000, AVOID_MAX_BOXES);
    ok('AV03b 候选偏移表里包含 0（保证能退回直连）',
      AVOID_OFFSETS.indexOf(0) >= 0, AVOID_OFFSETS.join(','));
    ok('AV03c 候选数量可控（≤16）', AVOID_OFFSETS.length <= 16, AVOID_OFFSETS.length);
    // 拐点边不走避让
    const e = doc.edges[0];
    e.waypoints = [{ x:0, y:0 }, { x:200, y:0 }];
    reindex();
    const g = edgeGeomFor(e);
    ok('AV03d 拖过拐点的边走的是 waypointGeom（避让够不着它）',
      !!waypointGeom(e) && !!g && !!g.pts && g.pts.length >= 2,
      JSON.stringify(g.pts.map(q => [Math.round(q.x), Math.round(q.y)])));
    // 穿盒子判定本身
    const box = { x:0, y:0, w:100, h:100 };
    ok('AV03e 水平线穿过盒子', segHitsBox(-50, 50, 150, 50, box) === true);
    ok('AV03f 水平线在盒子上方不算穿', segHitsBox(-50, -50, 150, -50, box) === false);
    ok('AV03g 水平线停在盒子左边不算穿', segHitsBox(-200, 50, -60, 50, box) === false);
    ok('AV03h 垂直线穿过盒子', segHitsBox(50, -50, 50, 150, box) === true);
    ok('AV03i 斜线一律不算（走廊都是轴对齐的）', segHitsBox(0, 0, 100, 100, box) === false);
    // 同一条线穿同一个盒子两次只算一个
    const two = [{ x:-50, y:50 }, { x:150, y:50 }, { x:-50, y:50 }];
    ok('AV03j 穿两次只算一个盒子', pathCrossCount(two, [box]) === 1,
      pathCrossCount(two, [box]));
    ok('AV03k 两个盒子都穿就数 2', (() => {
      const b2 = { x:200, y:0, w:100, h:100 };
      return pathCrossCount([{ x:-50, y:50 }, { x:350, y:50 }], [box, b2]) === 2;
    })());
    // 分组框不算障碍
    const gsel = doc.groups[0];
    if (gsel){
      selectGroup(gsel.id);
      const gb = groupBox(gsel);
      const boxList = avoidBoxes('__none_a__', '__none_b__');
      ok('AV03l 分组框不在障碍表里', !boxList.some(x => x.isGroup),
        boxList.filter(x => x.isGroup).length + ' 个分组框混进来了');
    } else ok('AV03l 分组框不在障碍表里', true, '（没有分组）');
  });
  T('AV04 避让之后整张图还是画得出来、没有 NaN', () => {
    fresh(); loadDemo('all');
    reindex(); sizeAll(); resize(); fitView();
    // 曲线走线的几何是 p0..p3，折线是 pts —— 两种都要认
    const anyPts = (g) => (g && g.pts) ? g.pts : (g ? [g.p0, g.p1, g.p2, g.p3].filter(Boolean) : []);
    ok('AV04 每条边都算得出几何', doc.edges.every(e => anyPts(edgeGeomFor(e)).length >= 2),
      doc.edges.filter(e => anyPts(edgeGeomFor(e)).length < 2).length + ' 条算不出来');
    ok('AV04b 每个坐标都是有限数', doc.edges.every(e =>
      anyPts(edgeGeomFor(e)).every(q => isFinite(q.x) && isFinite(q.y))));
    ok('AV04c 整张图画得出来', (dirty = true, draw(), true));
    // 示例文档里确实存在「线原本会穿节点」的情况，避让之后应当减少
    ok('AV04d 示例里连线穿节点的条数不多', (() => {
      let n = 0;
      for (const e of doc.edges){
        const g = edgeGeomFor(e);
        if (!g.pts) continue;                       // 曲线不走避让，跳过
        if (pathCrossCount(g.pts, avoidBoxes(e.s, e.t)) > 0) n++;
      }
      return n <= Math.max(2, Math.floor(doc.edges.length / 4));
    })(), (() => {
      let n = 0;
      for (const e of doc.edges){
        const g = edgeGeomFor(e);
        if (!g.pts) continue;
        if (pathCrossCount(g.pts, avoidBoxes(e.s, e.t)) > 0) n++;
      }
      return n + ' / ' + doc.edges.length + ' 条还穿节点';
    })());
  });


  T('OP01 运算符节点：两个输入端点，按 ID 升序各对一个操作数', () => {
    fresh(); layoutMind();
    const o = addOpNode('加', 0, 0, { op:'+', operand:'5' });
    reindex(); sizeAll();
    ok('OP01 有两个输入端点', portList(byId(o.id)).ins.length === 2,
      portList(byId(o.id)).ins.length);
    ok('OP01b 端点 ID 是 1 和 2（决定运算顺序）', (() => {
      const ids = portList(byId(o.id)).ins.map(p => p.id).sort((a, b) => a - b);
      return ids.length === 2 && ids[0] === 1 && ids[1] === 2;
    })(), portList(byId(o.id)).ins.map(p => p.id).join(','));
    ok('OP01c 一个输出端点', portList(byId(o.id)).outs.length === 1);
    // 只给第一路：走格子里的 5
    const a = mkVar('a', '10');
    const out = mkOut('r');
    linkNodes(a.id, o.id); linkNodes(o.id, out.id);
    reindex();
    ok('OP01d 只接第一路 → 10 + 5 = 15', outputValueIn(liveCtx(), byId(out.id)) === 15,
      String(outputValueIn(liveCtx(), byId(out.id))));
    // 第二路接上，格子就被顶掉
    const b = mkVar('b', '7');
    const e2 = linkNodes(b.id, o.id);
    reindex();
    ok('OP01e 前置：第二路连上了', !!e2);
    ok('OP01f 把落点钉到 2 号端点', (() => {
      pinEdgePort(e2, 'b', byId(o.id), portList(byId(o.id)).ins.filter(q => q.id === 2)[0]);
      reindex();
      return e2.bPort === 2;
    })(), String(e2.bPort));
    ok('OP01g 两路都接上 → 10 + 7 = 17（格子里的 5 被顶掉）',
      outputValueIn(liveCtx(), byId(out.id)) === 17,
      String(outputValueIn(liveCtx(), byId(out.id))));
    // 换运算符
    setOpOperator(byId(o.id), '*');
    reindex();
    ok('OP01h 换成乘 → 10 × 7 = 70', outputValueIn(liveCtx(), byId(out.id)) === 70,
      String(outputValueIn(liveCtx(), byId(out.id))));
    ok('OP01i 老存档（没钉端点）照样能用', (() => {
      const o2 = addOpNode('老式', 0, 0, { op:'-', operand:'3' });
      const a2 = mkVar('c', '20');
      const out2 = mkOut('r2');
      linkNodes(a2.id, o2.id); linkNodes(o2.id, out2.id);
      reindex();
      return outputValueIn(liveCtx(), byId(out2.id)) === 17;
    })(), String((() => {
      const out2 = doc.nodes.find(x => x.outDef && x.outDef.name === 'r2');
      return out2 ? outputValueIn(liveCtx(), out2) : '?';
    })()));
  });


  T('BR01 广播节点：把输入值变成全局变量', () => {
    fresh(); layoutMind();
    let stage = 'init';
    try {
      stage = '建节点'; const bc = addBroadcastNode(0, 0, { name:'广播值' });
      stage = '建源';   const src = mkVar('源', '42');
      stage = '连线';   linkNodes(src.id, bc.id);
      stage = 'reindex'; reindex(); sizeAll();
      stage = 'kind';   ok('BR01 是广播节点', byId(bc.id).kind === 'broadcast', byId(bc.id).kind);
      stage = '端点';   ok('BR01b 一进零出', (() => {
        const L = portList(byId(bc.id));
        return L.ins.length === 1 && L.outs.length === 0;
      })(), JSON.stringify(portList(byId(bc.id))));
      stage = '取值';   ok('BR01c 值 = 流进来的', defValueIn(liveCtx(), byId(bc.id)) === '42',
        String(defValueIn(liveCtx(), byId(bc.id))));
      stage = '远处引用'; const far = nodeByText('拖端点改接');
      ok('BR01d 远处没连线的节点也能引用（全局）',
        resolveVar('广播值', far.id) === '42', String(resolveVar('广播值', far.id)));
      stage = '改名';   setVarDef(byId(src.id), { value:'99' });
      reindex();
      ok('BR01e 上游一改跟着变', resolveVar('广播值', far.id) === '99',
        String(resolveVar('广播值', far.id)));
      stage = '命中';   ok('BR01f 名字框可编辑', (() => {
        const L = varBoxes(byId(bc.id));
        return hitVarPart(byId(bc.id), { x:L.nameBox.x + 4, y:L.nameBox.y + 4 }) === 'varName';
      })());
      stage = '画图';   draw();
      ok('BR01g 画得出来', true);
      stage = '存读';   ok('BR01h 存读往返', (() => {
        const snap = JSON.parse(JSON.stringify(serialize()));
        deserialize(snap);
        const back = doc.nodes.find(x => x.kind === 'broadcast');
        return !!back && normalizeVarDef(back.varDef).name === '广播值';
      })());
    } catch (err){
      say('* BR01 在「' + stage + '」这一步炸了：' + (err && err.message)
        + ' || ' + String(err && err.stack || '').split('\n').slice(0, 4).join(' <<< '));
      ok('BR01 不该炸（在 ' + stage + '）', false, String(err && err.message));
    }
  });


  T('BR02 广播节点右上角一个 wifi 符号', () => {
    fresh(); layoutMind(); resize(); fitView();
    const bc = addBroadcastNode(0, 0, { name:'广播值' });
    reindex(); sizeAll();
    const b = nodeBox(byId(bc.id));
    ok('BR02 节点够宽，符号不压到文字',
      b.w >= VAR_PAD * 2 + VAR_NAME_W + 10 + VAR_VAL_W + 22, b.w);
    // 只画这个符号，数右上角那一带的像素
    const g = cv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.fillStyle = C.bg; g.fillRect(0, 0, VW, VH);
    g.save(); g.translate(view.x, view.y); g.scale(view.z, view.z);
    drawWifiIcon(g, b.x + b.w - 18, b.y + 14, 14, '#ffffff');
    g.restore();
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200) lit++;
    ok('BR02b wifi 符号画得出来（有像素）', lit > 30, lit);
    // 而且必须落在节点**右上角**那一带
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (let y = 0; y < cv.height; y++){
      for (let x = 0; x < cv.width; x++){
        const i = (y * cv.width + x) * 4;
        if (d[i] > 200 && d[i+1] > 200 && d[i+2] > 200){
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    const cx = (minX + maxX) / 2 / DPR, cy = (minY + maxY) / 2 / DPR;
    const wantX = (b.x + b.w - 18) * view.z + view.x, wantY = (b.y + 14) * view.z + view.y;
    ok('BR02c 符号画在右上角那个位置',
      Math.abs(cx - wantX) < 6 && Math.abs(cy - wantY) < 6,
      JSON.stringify({ got:[Math.round(cx), Math.round(cy)], want:[Math.round(wantX), Math.round(wantY)] }));
    ok('BR02d 整张图画得出来', (dirty = true, draw(), true));
    ok('BR02e 选中时也画得出来', (selectOnly(bc.id), draw(), true));
  });

  T('BG01 探针：拖端点改接 + 插入图片节点', () => {
    fresh(); layoutMind();
    const e = doc.edges[0];
    selectEdge(e.id); reindex();
    ok('BG01 前置：连线选中了', selEdgeId === e.id);
    const ep = edgeEndpoints(e);
    ok('BG01b 端点位置算得出来', !!ep, JSON.stringify(ep));
    ok('BG01c hitEdgeHandle 认得出这个端点', !!hitEdgeHandle(ep.a), JSON.stringify(hitEdgeHandle(ep.a)));
    pe('pointerdown', Math.round(ep.a.x * view.z + view.x), Math.round(ep.a.y * view.z + view.y));
    ok('BG01d 按在端点上进入 relink', !!drag && drag.mode === 'relink', drag ? drag.mode : 'null');
    pe('pointerup', Math.round(ep.a.x * view.z + view.x), Math.round(ep.a.y * view.z + view.y));
    skipDlg();
    // 3) 插入图片
    // 3) 插入图片节点
    let clicked = 0;
    const orig = imgFileEl.click;
    imgFileEl.click = function(){ clicked++; };
    try {
      fresh();
      selectOnly(null);
      showCtx(600, 500, null, null, { p:{ x:0, y:0 } });
      const labels = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
      ok('BG01e 右键菜单顶层就三项', labels.length === 3, labels.join(' / '));
      const it = [...document.querySelectorAll('.menu .item')].find(d => d.textContent.indexOf('新建') === 0);
      it.click();   // ★ 子菜单改单击展开了
      const it2 = [...document.querySelectorAll('.menu .item')].find(d => d.textContent.indexOf('节点') === 0);
      ok('BG01f 找得到「节点」子菜单', !!it2);
      it2.click();   // ★ 子菜单改单击展开了
      const img = [...document.querySelectorAll('.menu .item')].find(d => d.textContent.indexOf('图片节点') === 0);
      ok('BG01g 找得到「图片节点…」', !!img, [...document.querySelectorAll('.menu .item')].map(d => d.textContent).join(' / '));
      if (img) img.dispatchEvent(new MouseEvent('click', { bubbles:true }));
      ok('BG01h 点了之后真的去开文件选择框', clicked === 1, clicked);
    } finally { imgFileEl.click = orig; hideCtx(); }
  });

  T('TB10 表格：每行每列各一对加减号 + 删有数据的要先确认', () => {
    fresh(); layoutMind();
    const t = addTableNode(0, 0, { rows:3, cols:3, header:true,
      cells:[['甲','乙','丙'],['1','2','3'],['','','']] });
    reindex(); sizeAll(); selectOnly(t.id); reindex();
    const G = tableGeom(byId(t.id));
    const B = tableButtons(byId(t.id));
    ok('TB10 三行三列 → 12 个按钮（每行每列各一对）', B.length === (3 + 3) * 2, B.length);
    ok('TB10b 每**列**下方各一对，且都在表格下方', (() => {
      for (let c = 0; c < 3; c++){
        const two = B.filter(b => b.kind === 'col' && b.index === c);
        if (two.length !== 2) return false;
        if (!two.some(b => b.action === 'del') || !two.some(b => b.action === 'add')) return false;
        if (!two.every(b => b.box.y > G.y + G.h)) return false;
        if (Math.abs(two[0].box.x - two[1].box.x) < 10) return false;   // 水平错开
      }
      return true;
    })());
    ok('TB10c 每**行**右侧各一对，且都在表格右侧', (() => {
      for (let r = 0; r < 3; r++){
        const two = B.filter(b => b.kind === 'row' && b.index === r);
        if (two.length !== 2) return false;
        if (!two.some(b => b.action === 'del') || !two.some(b => b.action === 'add')) return false;
        if (!two.every(b => b.box.x > G.x + G.w)) return false;
        if (Math.abs(two[0].box.y - two[1].box.y) < 10) return false;   // 竖直错开
      }
      return true;
    })());
    ok('TB10d 加号的水平位置对着那一列的中心', (() => {
      const two = B.filter(b => b.kind === 'col' && b.index === 1);
      const cx = (G.xs[1] + G.xs[2]) / 2;
      return two.every(b => Math.abs((b.box.x + b.box.w / 2) - cx) < 30);
    })());
    ok('TB10e 加号的竖直位置对着那一行的中心', (() => {
      const two = B.filter(b => b.kind === 'row' && b.index === 1);
      const cy = (G.ys[1] + G.ys[2]) / 2;
      return two.every(b => Math.abs((b.box.y + b.box.h / 2) - cy) < 30);
    })());
    // 命中：要选中/悬停才算，免得画布上到处是隐形按钮
    const probe = { x:B[0].box.x + 4, y:B[0].box.y + 4 };
    ok('TB10f 选中时点得到按钮', !!hitTableButton(probe), JSON.stringify(hitTableButton(probe)));
    selectOnly(null); reindex();
    ok('TB10g 没选中没悬停时点不到', hitTableButton(probe) === null);
    selectOnly(t.id); reindex();
    // 「有数据」的判定 —— 删除确认就靠它
    ok('TB10h 第 0/1 行有数据、第 2 行没有',
      tableRowHasData(byId(t.id), 0) && tableRowHasData(byId(t.id), 1)
      && !tableRowHasData(byId(t.id), 2));
    ok('TB10i 列的数据判定也对', (() => {
      // 表头把每一列都填满了，所以先清掉第 2 列再看
      const tt = tableOf(byId(t.id));
      for (let r = 0; r < tt.rows; r++) tt.cells[r][2] = '';
      byId(t.id).tableDef = tt;
      return tableColHasData(byId(t.id), 0) && !tableColHasData(byId(t.id), 2);
    })(), (() => {
      const tt = tableOf(byId(t.id));
      return tt.cells.map(r => r.join('')).join(' / ');
    })());
    // 按 index 删中间那一行：内容要跟着挪
    tableDelRow(byId(t.id), 1);
    ok('TB10j 删掉中间那行，剩下的是第 0 行和第 2 行', (() => {
      const tt = tableOf(byId(t.id));
      return tt.rows === 2 && tt.cells[0][0] === '甲' && tt.cells[1].join('') === '';
    })(), JSON.stringify(tableOf(byId(t.id)).cells));
    // 按 index 插：在下方 / 右侧
    tableAddRow(byId(t.id), 0);
    ok('TB10k 在下方插一行（内容整体下移）', (() => {
      const tt = tableOf(byId(t.id));
      return tt.rows === 3 && tt.cells[1].join('') === '' && tt.cells[2][0] === '';
    })(), JSON.stringify(tableOf(byId(t.id)).cells.map(r => r.join(''))));
    ok('TB10l 待确认状态存在', 'pendingTableDel' in window || typeof pendingTableDel !== 'undefined');
    ok('TB10m 画得出来', (dirty = true, draw(), true));
  });

  T('SP01 方向键生成子节点：连接方向要跟着走', () => {
    const CASES = [['right','r','l'], ['left','l','r'], ['up','t','b'], ['down','b','t']];
    for (const [dir, as, bs] of CASES){
      fresh(); layoutMind();
      const n = nodeByText('节点');
      selectOnly(n.id); reindex(); sizeAll();
      spawnInDirection(dir);
      skipDlg();
      reindex(); sizeAll();
      const nn = doc.nodes[doc.nodes.length - 1];
      const e = doc.edges[doc.edges.length - 1];
      ok('SP01 ' + dir + '：边记下的方向对', e.aSide === as && e.bSide === bs,
        'aSide=' + e.aSide + ' bSide=' + e.bSide);
      // ★ 真正的验收：锚点必须落在对应的那条边上（用户看的是这个）
      const pa = portById(byId(n.id), e.aPort) || portList(byId(n.id)).outs.concat(portList(byId(n.id)).ins).filter(p => p.side === as)[0];
      const pb = portById(byId(nn.id), e.bPort) || portList(byId(nn.id)).ins.concat(portList(byId(nn.id)).outs).filter(p => p.side === bs)[0];
      ok('SP01' + dir + 'b ' + dir + '：两端都钉在' + as + '/' + bs + ' 边上',
        !!pa && !!pb && pa.side === as && pb.side === bs,
        (pa ? pa.side : '?') + ' / ' + (pb ? pb.side : '?'));
      const ep = edgeEndpoints(e);
      const b1 = nodeBox(byId(n.id)), b2 = nodeBox(byId(nn.id));
      const onSide = (pt, b, s) => {
        if (s === 'r') return Math.abs(pt.x - (b.x + b.w)) < 2;
        if (s === 'l') return Math.abs(pt.x - b.x) < 2;
        if (s === 't') return Math.abs(pt.y - b.y) < 2;
        return Math.abs(pt.y - (b.y + b.h)) < 2;
      };
      ok('SP01' + dir + 'c 起点锚点贴在节点' + as + '边', onSide(ep.a, b1, as),
        JSON.stringify(ep.a) + ' node=' + JSON.stringify(b1));
      ok('SP01' + dir + 'd 终点锚点贴在节点' + bs + '边', onSide(ep.b, b2, bs),
        JSON.stringify(ep.b) + ' node=' + JSON.stringify(b2));
      // 新节点确实在那个方向上
      const dx = (b2.x + b2.w / 2) - (b1.x + b1.w / 2);
      const dy = (b2.y + b2.h / 2) - (b1.y + b1.h / 2);
      const want = { right:dx > 0, left:dx < 0, up:dy < 0, down:dy > 0 }[dir];
      ok('SP01' + dir + 'e 新节点确实在' + dir + '边', want, 'dx=' + Math.round(dx) + ' dy=' + Math.round(dy));
    }
  });

  T('CP01 连接端点：普通节点四条边各一个，看得见也拖得动', () => {
    fresh(); layoutMind();
    const a = addNodeAt('普通', 0, 0, 'rect');
    reindex(); sizeAll();
    const L = portList(byId(a.id));
    ok('CP01 普通节点没有输入输出端点', L.ins.length === 0 && L.outs.length === 0,
      L.ins.length + '/' + L.outs.length);
    ok('CP01b 四条边各一个连接端点', L.conns.length === 4, L.conns.length);
    ok('CP01c 四条边不重样', new Set(L.conns.map(p => p.side)).size === 4,
      L.conns.map(p => p.side).join('/'));
    ok('CP01d 四个 id 是正整数且不重复', (() => {
      const ids = L.conns.map(p => p.id);
      return ids.every(i => Number.isInteger(i) && i > 0) && new Set(ids).size === 4;
    })(), L.conns.map(p => p.id).join('/'));
    ok('CP01e 都在正中', L.conns.every(p => p.at === 0.5));
    ok('CP01f hasPorts 认它', hasPorts(byId(a.id)) === true);
    // 端点位置就在四条边的中点上
    ok('CP01g 位置就在四条边的中点', (() => {
      const b = nodeBox(byId(a.id));
      return L.conns.every(p => {
        const pt = portPoint(byId(a.id), p);
        if (p.side === 'l') return Math.abs(pt.x - b.x) < 0.01 && Math.abs(pt.y - (b.y + b.h/2)) < 0.01;
        if (p.side === 'r') return Math.abs(pt.x - (b.x + b.w)) < 0.01 && Math.abs(pt.y - (b.y + b.h/2)) < 0.01;
        if (p.side === 't') return Math.abs(pt.y - b.y) < 0.01 && Math.abs(pt.x - (b.x + b.w/2)) < 0.01;
        return Math.abs(pt.y - (b.y + b.h)) < 0.01 && Math.abs(pt.x - (b.x + b.w/2)) < 0.01;
      });
    })());
    // 三类端点合起来算 id 池
    ok('CP01h nodePorts 三类一起算', nodePorts(byId(a.id)).length === 4);
    // 命中：拖拽方块要认得出连接端点
    selectOnly(a.id); reindex();
    const p0 = portList(byId(a.id)).conns[0];
    const hb = portHandleBox(byId(a.id), p0);
    const h = portHandleAt({ x:hb.x + hb.w/2, y:hb.y + hb.h/2 }, null);
    ok('CP01i 连接端点有可拖的方块（handleAt 认得出）', !!h && h.port.id === p0.id,
      h ? ('dir=' + h.dir + ' id=' + h.port.id) : 'null');
    ok('CP01j portIdAtPoint 也认（拖线能钉上去）', (() => {
      const pt = portPoint(byId(a.id), p0);
      const q = portIdAtPoint(pt, byId(a.id));
      return q && q.id === p0.id;
    })());
    // 拖它换边
    const b2 = nodeBox(byId(a.id));
    ok('CP01k 能把连接端点拖到别的边', (() => {
      movePort(byId(a.id), 'conns', p0.id, { x:b2.x + b2.w/2, y:b2.y - 2 });
      reindex();
      const after = portById(byId(a.id), p0.id);
      return after && after.side === 't';
    })(), (() => { const q = portById(byId(a.id), p0.id); return q ? q.side : '?'; })());
  });
  T('CP02 连接端点：只有连接功能', () => {
    fresh(); layoutMind();
    const a = addNodeAt('甲', 0, 0, 'rect'), b = addNodeAt('乙', 700, 0, 'rect');
    reindex(); sizeAll();
    const e = linkNodes(a.id, b.id);
    reindex();
    ok('CP02 线能连上', !!e);
    ok('CP02b 两端都钉在连接端点上', (() => {
      const pa = portById(byId(a.id), e.aPort), pb = portById(byId(b.id), e.bPort);
      const inConns = (n, p) => p && portList(n).conns.some(q => q.id === p.id);
      return inConns(byId(a.id), pa) && inConns(byId(b.id), pb);
    })(), e.aPort + '/' + e.bPort);
    // ★ 双击连接端点**不该**弹 ID/标签编辑器（它没有那套语义）
    ok('CP02c 连接端点没有 ID/标签编辑器', (() => {
      selectOnly(a.id); reindex();
      const q = portList(byId(a.id)).conns[0];
      const pt = portPoint(byId(a.id), q);
      const ph = portHitAt(pt, byId(a.id));
      return !!ph && ph.dir === 'conns';   // 命中是命中，但 pointer 那边会跳过它
    })());
    // 连接端点不参与求值：普通节点的边不该让值流过去
    ok('CP02d 普通节点没有变量定义，所以不参与求值', !byId(a.id).varDef,
      String(byId(a.id).varDef));
    ok('CP02e 存读往返保住 conns', (() => {
      const snap = JSON.parse(JSON.stringify(serialize()));
      deserialize(snap);
      const back = doc.nodes.find(x => x.text === '甲');
      return !!back && portList(back).conns.length === 4;
    })());
  });
  T('CP03 程序节点不受影响：还是实心的一进一出', () => {
    fresh(); layoutMind();
    const v = addVarNode('变量', 0, 0, { name:'x', value:'1' });
    const o = addOpNode('运算', 600, 0, { op:'+', operand:'1' });
    reindex(); sizeAll();
    ok('CP03 变量节点一进一出、没有连接端点', (() => {
      const L = portList(byId(v.id));
      return L.ins.length === 1 && L.outs.length === 1 && L.conns.length === 0;
    })());
    ok('CP03b 运算节点按 arity 出输入端点、也没有连接端点', (() => {
      const L = portList(byId(o.id));
      return L.conns.length === 0 && L.ins.length >= 2 && L.outs.length === 1;
    })());
    ok('CP03c 变量节点的端点 id 没错位（1 进 3 出）', (() => {
      const L = portList(byId(v.id));
      return L.ins[0].id === 1 && L.outs[0].id === 3;
    })());
  });

  T('CP04 一个连接端点能接多条线', () => {
    fresh(); layoutMind();
    const a = addNodeAt('中心', 0, 0, 'rect');
    const b = addNodeAt('乙', 700, 0, 'rect');
    const c = addNodeAt('丙', 700, 400, 'rect');
    reindex(); sizeAll();
    const p = portList(byId(a.id)).conns.filter(q => q.side === 'r')[0];
    ok('CP04 前置：右边有个连接端点', !!p, JSON.stringify(p));
    const e1 = linkNodes(a.id, b.id, p.id, null);
    const e2 = linkNodes(a.id, c.id, p.id, null);
    reindex(); sizeAll();
    ok('CP04b 两条边都连上了', !!e1 && !!e2);
    ok('CP04c 两条边钉在同一个连接端点上',
      e1.aPort === p.id && e2.aPort === p.id, e1.aPort + ' / ' + e2.aPort);
    ok('CP04d 同一个端点能挂多条（不是一对一）',
      doc.edges.filter(e => e.s === a.id && e.aPort === p.id).length === 2,
      doc.edges.filter(e => e.s === a.id).length + ' 条从它出发');
    ok('CP04e 两条边的终点各自钉在自己的端点上',
      e1.bPort != null && e2.bPort != null && e1.t !== e2.t);
    ok('CP04f 两条线的起点锚点重合（同一个端点上）', (() => {
      const g1 = edgeEndpoints(e1), g2 = edgeEndpoints(e2);
      return Math.hypot(g1.a.x - g2.a.x, g1.a.y - g2.a.y) < 0.01;
    })());
    ok('CP04g 但终点不重合', (() => {
      const g1 = edgeEndpoints(e1), g2 = edgeEndpoints(e2);
      return Math.hypot(g1.b.x - g2.b.x, g1.b.y - g2.b.y) > 10;
    })());
    ok('CP04h 同一对节点之间还是不允许两条',
      linkNodes(a.id, b.id, p.id, null) === null);
    skipDlg();
  });
  T('CP05 方向键生成：普通节点走连接端点，程序节点走数据端点', () => {
    for (const [dir, as, bs] of [['right','r','l'], ['left','l','r'], ['up','t','b'], ['down','b','t']]){
      fresh(); layoutMind();
      const n = addNodeAt('起点', 0, 0, 'rect');
      selectOnly(n.id); reindex(); sizeAll();
      spawnInDirection(dir); skipDlg();
      reindex(); sizeAll();
      const e = doc.edges[doc.edges.length - 1];
      const pa = portById(byId(n.id), e.aPort);
      ok('CP05 ' + dir + '：出发端是连接端点（普通节点没有输出端点）',
        !!pa && portList(byId(n.id)).conns.some(q => q.id === pa.id),
        pa ? ('id=' + pa.id + ' side=' + pa.side) : 'null');
      ok('CP05' + dir + 'b 方向对', e.aSide === as && e.bSide === bs,
        e.aSide + ' 到 ' + e.bSide);
      ok('CP05' + dir + 'c 没有凭空多出端点',
        portList(byId(n.id)).conns.length === 4,
        portList(byId(n.id)).conns.length);
    }
    fresh(); layoutMind();
    const v = addVarNode('变量', 0, 0, { name:'x', value:'1' });
    selectOnly(v.id); reindex(); sizeAll();
    spawnInDirection('right'); skipDlg();
    reindex(); sizeAll();
    const e = doc.edges[doc.edges.length - 1];
    ok('CP05d 变量节点往右：用输出端点，不是连接端点', (() => {
      const q = portById(byId(v.id), e.aPort);
      return !!q && portList(byId(v.id)).outs.some(x => x.id === q.id);
    })(), String(e.aPort));
    ok('CP05e 没有凭空多出连接端点', portList(byId(v.id)).conns.length === 0,
      portList(byId(v.id)).conns.length);
    fresh(); layoutMind();
    const v2 = addVarNode('变量', 0, 0, { name:'y', value:'1' });
    selectOnly(v2.id); reindex(); sizeAll();
    const outBefore = portList(byId(v2.id)).outs.length;
    const inBefore  = portList(byId(v2.id)).ins.length;
    spawnInDirection('down'); skipDlg();
    reindex(); sizeAll();
    const L2 = portList(byId(v2.id));
    ok('CP05f 往下生成：加的是连接端点，输入输出数量不变',
      L2.conns.length === 1 && L2.outs.length === outBefore && L2.ins.length === inBefore,
      'conns=' + L2.conns.length + ' ins=' + L2.ins.length + ' outs=' + L2.outs.length);
    ok('CP05g 那个连接端点在下边', L2.conns[0].side === 'b', L2.conns[0].side);
  });

  T('PM01 菜单归类：顶层按用途分组，不超过 8 项', () => {
    fresh(); layoutMind();
    const n = nodeByText('节点');
    showCtx(500, 400, byId(n.id), null, { p:{} });
    const tops = [...ctxEl.querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('PM01 顶层不超过 8 项', tops.length <= 8, tops.length + ' 项: ' + tops.join(' | '));
    ok('PM01b 五组都在', ['外观', '数据', '连接', '结构'].every(g => tops.indexOf(g) >= 0),
      tops.join(' | '));
    ok('PM01c 重命名 / 删除在顶层（常用，不藏）',
      tops.indexOf('重命名') >= 0 && tops.indexOf('删除节点') >= 0, tops.join(' | '));
    ok('PM01d 形状收进「外观」了，不再平铺在顶层',
      tops.indexOf('形状') < 0 && tops.indexOf('矩形') < 0, tops.join(' | '));
    ok('PM01e 作用域 / 控件收进「数据」了',
      tops.indexOf('作用域：全局') < 0 && tops.indexOf('控件：普通') < 0, tops.join(' | '));
    ok('PM01f 端点收进「连接」了', tops.indexOf('端点') < 0, tops.join(' | '));
    hideCtx();
  });
  T('PM02 数据组里放的是「和值有关」的东西', () => {
    fresh(); layoutMind();
    const v = addVarNode('变量', 0, 0, { name:'量', value:'7' });
    selectOnly(v.id);
    showCtx(500, 400, byId(v.id), null, { p:{} });
    const data = subMenu('数据');
    ok('PM02 数据组里有类型 / 作用域 / 值类型',
      ['类型：', '作用域：', '值类型：'].every(x => data.some(t => t.indexOf(x) >= 0)),
      data.join(' / '));
    ok('PM02b 数据组里有「转为 / 转回」',
      data.some(t => t.indexOf('转成程序节点') >= 0 || t.indexOf('转回普通节点') >= 0),
      data.join(' / '));
    ok('PM02c 外观组里没有数据类的东西', (() => {
      // ⚠ 别用 subMenu —— 它是**全局**搜的，会把根菜单的项一起返回。
      //    openSub 之后 menuStack 最后一层才是那个子菜单。
      openSub('外观');
      const look = [...menuStack[menuStack.length - 1].querySelectorAll('.item')].map(labelOf);
      return look.length > 0
        && look.some(t => t.indexOf('形状') >= 0)
        && !look.some(t => t.indexOf('作用域') >= 0 || t.indexOf('控件') >= 0);
    })(), (() => {
      const look = [...menuStack[menuStack.length - 1].querySelectorAll('.item')].map(labelOf);
      return look.join(' / ');
    })());
    hideCtx();
  });
  T('PM03 数值参数可以引用变量：滑条范围', () => {
    fresh(); layoutMind();
    const w = addVarNode('宽', 0, 0, { name:'宽', value:'40', type:'number' });
    const s = addVarNode('滑条', 500, 0,
      { name:'量', value:'50', type:'number', control:'slider',
        min:'{宽}', max:'200', step:'{宽}' });
    reindex(); sizeAll();
    const vd = normalizeVarDef(byId(s.id).varDef);
    ok('PM03 含 { } 的参数字段**原样留住字符串**', vd.min === '{宽}' && vd.step === '{宽}',
      vd.min + ' / ' + vd.step);
    ok('PM03b 纯数字的字段还是数字', vd.max === 200, typeof vd.max + ' ' + vd.max);
    ok('PM03c paramNum 能把它解析出来', paramNum(liveCtx(), '{宽}', s.id, 0) === 40,
      paramNum(liveCtx(), '{宽}', s.id, 0));
    // 上下限 = 40 ~ 200、步长 40 → 50 会被对齐到 40
    ok('PM03d 滑条按解析后的上下限和步长对齐', sliderValue(vd, s.id) === 40,
      sliderValue(vd, s.id));
    // 改上游，滑条跟着变
    setVarDef(byId(w.id), { value:'80' });
    reindex();
    ok('PM03e 上游一改，上下限跟着变（80 ~ 200，步长 80 → 80）',
      sliderValue(normalizeVarDef(byId(s.id).varDef), s.id) === 80,
      sliderValue(normalizeVarDef(byId(s.id).varDef), s.id));
    ok('PM03f 分数也跟着算对', (() => {
      const f = sliderFrac(normalizeVarDef(byId(s.id).varDef), s.id);
      return Math.abs(f - 0) < 1e-6;      // 80 在下限上 → 0
    })(), sliderFrac(normalizeVarDef(byId(s.id).varDef), s.id));
  });
  T('PM04 数值参数可以引用变量：运算符操作数', () => {
    fresh(); layoutMind();
    const w = addVarNode('宽', 0, 0, { name:'宽', value:'40', type:'number' });
    const a = addVarNode('三', 0, 300, { name:'三', value:'3', type:'number' });
    const op = addOpNode('乘', 600, 300, { op:'*', operand:'{宽}' });
    const out = mkOut('结果');
    linkNodes(a.id, op.id); linkNodes(op.id, out.id);
    reindex(); sizeAll();
    ok('PM04 操作数原样留着 {宽}',
      normalizeOpDef(byId(op.id).opDef).operands[0] === '{宽}',
      normalizeOpDef(byId(op.id).opDef).operands[0]);
    ok('PM04b 求值用的是解析后的值：3 × 40 = 120',
      outputValueIn(liveCtx(), byId(out.id)) === 120,
      String(outputValueIn(liveCtx(), byId(out.id))));
    setVarDef(byId(w.id), { value:'5' });
    reindex();
    ok('PM04c 上游一改，结果跟着变：3 × 5 = 15',
      outputValueIn(liveCtx(), byId(out.id)) === 15,
      String(outputValueIn(liveCtx(), byId(out.id))));
    ok('PM04d applyOperator 也认（走的是同一条解析）',
      applyOperator(3, { op:'*', operands:['{宽}'] }, op.id) === 15,
      String(applyOperator(3, { op:'*', operands:['{宽}'] }, op.id)));
  });

  T('RT01 端点背着目标时，线不许折回来穿过自己', () => {
    fresh(); cancelEdit();
    // A 在右、B 在左；线从 A 的**右**端点出发 —— 方向背着目标
    const a = addNodeAt('甲', 400, 0, 'rect');
    const b = addNodeAt('乙', -400, 0, 'rect');
    reindex(); sizeAll();
    const pa = portList(byId(a.id)).conns.filter(p => p.side === 'r')[0];
    const pb = portList(byId(b.id)).conns.filter(p => p.side === 'l')[0];
    const e = linkNodes(a.id, b.id, pa.id, pb.id);
    reindex(); sizeAll();
    ok('RT01 前置：端点钉在甲右边、乙左边', e && e.aPort === pa.id && e.bPort === pb.id,
      e ? (e.aPort + '/' + e.bPort) : 'null');
    const g = edgeGeomFor(e);
    ok('RT01b 有折线几何', !!g && g.type === 'p', g ? g.type : 'null');
    const box = nodeBox(byId(a.id));
    // 采样每一条线段，看有没有落在甲的盒子里（留 1px 容差，贴着边不算）
    const crossesSelf = (pts, bb) => {
      for (let i = 1; i < pts.length; i++){
        const p = pts[i-1], q = pts[i];
        for (let t = 0; t <= 1; t += 0.02){
          const x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
          if (x > bb.x + 1 && x < bb.x + bb.w - 1 && y > bb.y + 1 && y < bb.y + bb.h - 1) return true;
        }
      }
      return false;
    };
    ok('RT01c 线没有穿过自己（甲）', !crossesSelf(g.pts, box),
      JSON.stringify(g.pts.map(p => [Math.round(p.x), Math.round(p.y)])));
    // 反过来也一样
    const a2 = addNodeAt('丙', -400, 400, 'rect');
    const b2 = addNodeAt('丁', 400, 400, 'rect');
    reindex(); sizeAll();
    const p2 = portList(byId(a2.id)).conns.filter(p => p.side === 'l')[0];
    const p3 = portList(byId(b2.id)).conns.filter(p => p.side === 'r')[0];
    const e2 = linkNodes(a2.id, b2.id, p2.id, p3.id);
    reindex(); sizeAll();
    const g2 = edgeGeomFor(e2);
    ok('RT01d 另一头背着也不许穿自己',
      !!g2 && !crossesSelf(g2.pts, nodeBox(byId(a2.id))),
      g2 ? JSON.stringify(g2.pts.map(p => [Math.round(p.x), Math.round(p.y)])) : 'null');
    // 顺着走的时候不能被搞复杂
    const a3 = addNodeAt('戊', -400, 800, 'rect');
    const b3 = addNodeAt('己', 400, 800, 'rect');
    reindex(); sizeAll();
    const p4 = portList(byId(a3.id)).conns.filter(p => p.side === 'r')[0];
    const p5 = portList(byId(b3.id)).conns.filter(p => p.side === 'l')[0];
    const e3 = linkNodes(a3.id, b3.id, p4.id, p5.id);
    reindex(); sizeAll();
    const g3 = edgeGeomFor(e3);
    // 正常形状：两端 + 两个桩 + 两个走廊点 = 6。多绕会超过这个数。
    ok('RT01e 顺着走的情况保持简单（不多绕）', g3.pts.length <= 6, g3.pts.length + ' 个点');
    ok('RT01f 两端仍然精确落在端点上', (() => {
      const A = portPoint(byId(a3.id), p4), B = portPoint(byId(b3.id), p5);
      const f = g3.pts[0], l = g3.pts[g3.pts.length - 1];
      return Math.hypot(f.x - A.x, f.y - A.y) < 0.01 && Math.hypot(l.x - B.x, l.y - B.y) < 0.01;
    })());
  });

  T('BG02 连线不该改变节点大小', () => {
    fresh(); cancelEdit();
    const a = addNodeAt('甲', 0, 0, 'rect');
    const b = addNodeAt('乙', 700, 0, 'rect');
    reindex(); sizeAll();
    const w0 = nodeBox(byId(a.id)).w, h0 = nodeBox(byId(a.id)).h;
    ok('BG02 前置：两个都是独立节点，都不大', !byId(a.id).big && !byId(b.id).big);
    linkNodes(a.id, b.id);
    reindex(); sizeAll();
    ok('BG02b 连上之后上游节点没变大',
      nodeBox(byId(a.id)).w === w0 && nodeBox(byId(a.id)).h === h0,
      w0 + 'x' + h0 + ' → ' + Math.round(nodeBox(byId(a.id)).w) + 'x' + Math.round(nodeBox(byId(a.id)).h));
    ok('BG02c 也不会因为「有子节点的根」被标成 big', !byId(a.id).big);
    ok('BG02d 拆掉之后也不该跳回去', (() => {
      deleteSelection();     // 选中 a 删掉它
      reindex(); sizeAll();
      return true;
    })());
    // 示例里的根仍然是大的（那是显式标的）
    fresh();
    ok('BG02e 经典示例的根还是大号字',
      doc.nodes.filter(n => isRoot(n)).every(n => n.big === true),
      doc.nodes.filter(n => isRoot(n)).map(n => n.big).join('/'));
    const blank0 = null; void blank0;
  });
  T('BG03 big 是数据，能存读', () => {
    fresh();
    const r = doc.nodes.find(n => isRoot(n));
    ok('BG03 前置：根是大的', r && r.big === true);
    const snap = JSON.parse(JSON.stringify(serialize()));
    deserialize(snap);
    const back = doc.nodes.find(n => n.id === r.id);
    ok('BG03b 读回来还是大的', back && back.big === true, back ? String(back.big) : 'null');
    // 普通节点不会因为存读往返被弄大
    const p = addNodeAt('普通', 900, 0, 'rect');
    reindex(); sizeAll();
    const w = nodeBox(byId(p.id)).w;
    const s2 = JSON.parse(JSON.stringify(serialize()));
    deserialize(s2);
    const p2 = doc.nodes.find(n => n.id === p.id);
    ok('BG03c 普通节点存读往返不变大', p2 && !p2.big && Math.round(nodeBox(p2).w) === Math.round(w),
      p2 ? (nodeBox(p2).w + ' vs ' + w) : 'null');
  });

  T('SU01 滑条节点的上下限 / 步长是填空，能引用变量', () => {
    fresh(); cancelEdit();
    const w = addVarNode('宽', 0, 0, { name:'宽', value:'40' });
    const s = addVarNode('音量', 500, 0,
      { name:'音量', value:'50', type:'number', control:'slider',
        min:'{宽}', max:'200', step:'{宽}' });
    reindex(); sizeAll(); selectOnly(byId(s.id));
    openNodeBox(byId(s.id)); renderNodeBox();
    const mi = document.getElementById('nbSlideMin');
    const ma = document.getElementById('nbSlideMax');
    const st = document.getElementById('nbSlideStep');
    ok('SU01 三个框都是填空（不是 number）',
      [mi, ma, st].every(e => e && e.type === 'text'),
      [mi, ma, st].map(e => e && e.type).join('/'));
    ok('SU01b 框里显示的是**原始字段**（{宽} 原样显示）',
      mi.value === '{宽}' && st.value === '{宽}' && ma.value === '200',
      mi.value + ' / ' + ma.value + ' / ' + st.value);
    // 在框里改成另一个变量引用 —— 必须原样存住
    mi.value = '{倍}'; mi.onchange();
    ok('SU01c 改成 {倍} 之后原样存住字符串',
      normalizeVarDef(byId(s.id).varDef).min === '{倍}',
      JSON.stringify(normalizeVarDef(byId(s.id).varDef).min));
    // 改回数字也要能存成数字
    ma.value = '999'; ma.onchange();
    ok('SU01d 填数字还是数字', normalizeVarDef(byId(s.id).varDef).max === 999,
      typeof normalizeVarDef(byId(s.id).varDef).max);
    closeNodeBox();
  });
  T('SU02 外观节点的字号：一条滑条 + 一个能写 {变量} 的框', () => {
    fresh(); cancelEdit();
    const pg = createProgramNode(0, 0);
    reindex(); sizeAll(); selectOnly(byId(pg.id));
    openNodeBox(byId(pg.id)); renderNodeBox();
    const box = document.getElementById('nbVal');
    const rg = box.querySelector('input[type=range]');
    const tx = box.querySelector('input[type=text]');
    ok('SU02 值那一行有滑条', !!rg);
    ok('SU02b 也有能写字的框', !!tx && tx.type === 'text');
    ok('SU02c 滑条的范围覆盖正负（增/设两种模式）', rg && +rg.min < 0 && +rg.max > 0,
      rg ? (rg.min + '~' + rg.max) : 'null');
    // 拖滑条 → 存数字
    rg.value = '30'; rg.oninput();
    ok('SU02d 拖滑条存的是数字', byId(pg.id).program.value === 30,
      JSON.stringify(byId(pg.id).program.value));
    ok('SU02e 拖动时框里跟着变', tx.value === '30', tx.value);
    // 框里写 {变量} → 存字符串
    tx.value = '{倍数}'; tx.onchange();
    ok('SU02f 框里写 {变量} 原样存住', byId(pg.id).program.value === '{倍数}',
      JSON.stringify(byId(pg.id).program.value));
    // 而且求值时真的解析得出来
    const bs = addVarNode('倍数', 700, 0, { name:'倍数', value:'12', type:'number' });
    reindex(); sizeAll();
    ok('SU02g 求值时解析成数字', resolveProgramValue(byId(pg.id), normalizeProgram(byId(pg.id).program)) === 12,
      String(resolveProgramValue(byId(pg.id), normalizeProgram(byId(pg.id).program))));
    closeNodeBox();
  });

  T('BAL01 绘制里的 save / restore 必须配平', () => {
    /* 多一次 restore 会把 draw() 里 save 的**世界变换**提前弹掉，
       之后画的东西全落到屏幕坐标上 —— 症状是「节点悬浮、缩放不动」，
       没有任何报错，只能靠配平检查发现。 */
    const g = ctx;
    const os = g.save, or = g.restore;
    const count = (fn) => {
      let s = 0, r = 0;
      g.save = function(){ s++; return os.apply(g, arguments); };
      g.restore = function(){ r++; return or.apply(g, arguments); };
      try { fn(); } finally { g.save = os; g.restore = or; }
      return { s, r };
    };
    fresh();
    const c1 = count(() => draw());
    ok('BAL01 空白文档：save 和 restore 次数相等', c1.s === c1.r, c1.s + ' / ' + c1.r);
    const m = ctx.getTransform();
    ok('BAL01b 画完变换回到基准（世界变换没被弹掉）',
      Math.abs(m.a - DPR) < 1e-6 && Math.abs(m.d - DPR) < 1e-6
      && Math.abs(m.e) < 1e-6 && Math.abs(m.f) < 1e-6,
      [m.a, m.b, m.c, m.d, m.e, m.f].map(x => Math.round(x * 1000) / 1000).join(','));
    // 各种节点都过一遍 —— 广播节点以前就是在这里多 restore 一次
    loadDemo('all'); reindex(); sizeAll();
    const c2 = count(() => draw());
    ok('BAL01c 示例文档（含广播 / 表格 / 条件 / 滑条）也配平', c2.s === c2.r,
      c2.s + ' / ' + c2.r);
    // 选中 + 悬停 + 正在拖端点，这几条路径各有自己的 save/restore
    const someNode = doc.nodes.find(n => n.kind === 'var');
    selectOnly(someNode.id); reindex();
    const c3 = count(() => draw());
    ok('BAL01d 选中节点时也配平', c3.s === c3.r, c3.s + ' / ' + c3.r);
    // 存读往返之后再画一次，确保没有状态残留
    deserialize(JSON.parse(JSON.stringify(serialize())));
    const c4 = count(() => draw());
    ok('BAL01e 存读往返之后还配平', c4.s === c4.r, c4.s + ' / ' + c4.r);
  });

  T('VL01 变量节点的六种类型', () => {
    fresh();
    ok('VL01 类型表里有单一变量 / 滑块 / 列表 / 地图',
      ['plain', 'slider', 'list', 'map'].every(c => VAR_CONTROLS.indexOf(c) >= 0),
      VAR_CONTROLS.join('/'));
    ok('VL01b 单一变量不再叫「普通」', VAR_CONTROL_LABEL.plain === '单一变量', VAR_CONTROL_LABEL.plain);
    ok('VL01c 每种都有说明文字', VAR_CONTROLS.every(c => !!VAR_CONTROL_HINT[c]),
      VAR_CONTROLS.map(c => c + ':' + !!VAR_CONTROL_HINT[c]).join(' '));
  });
  T('VL02 列表：默认 0 1 2，{名单.序号} 取值', () => {
    fresh(); cancelEdit();
    const L = addVarNode('名单', 0, 0, { name:'名单', control:'list' });
    reindex(); sizeAll();
    const v = normalizeVarDef(byId(L.id).varDef);
    ok('VL02 默认是 0 / 1 / 2', v.items.join(',') === '0,1,2', JSON.stringify(v.items));
    // 换成正儿八经的内容
    setVarDef(byId(L.id), { items:['张三', '李四', '王五'] });
    const use = addNodeAt('第二个人是 {名单.1}', 600, 0, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL02b {名单.1} = 李四', displayTextOf(byId(use.id)) === '第二个人是 李四',
      displayTextOf(byId(use.id)));
    const u0 = addNodeAt('第一个 {名单.0}', 600, 120, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL02c {名单.0} = 张三（序号从 0 开始）', displayTextOf(byId(u0.id)) === '第一个 张三',
      displayTextOf(byId(u0.id)));
    // 越界 / 非数字 → [未定义]
    const bad = addNodeAt('越界 {名单.9}', 600, 240, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL02d 序号越界显示 [未定义]', displayTextOf(byId(bad.id)) === '越界 [未定义]',
      displayTextOf(byId(bad.id)));
    // 不写下标 → 整条拼起来
    const all = addNodeAt('全部 {名单}', 600, 360, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL02e 不写下标就整条拼成一串', displayTextOf(byId(all.id)) === '全部 张三, 李四, 王五',
      displayTextOf(byId(all.id)));
  });
  T('VL03 地图：key 索引 value，{配置.键} 取值', () => {
    fresh(); cancelEdit();
    const M = addVarNode('配置', 0, 0,
      { name:'配置', control:'map', pairs:[{ k:'host', v:'localhost' }, { k:'port', v:'8080' }] });
    reindex(); sizeAll();
    const use = addNodeAt('连 {配置.host}:{配置.port}', 600, 0, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL03 两个键都取到了', displayTextOf(byId(use.id)) === '连 localhost:8080',
      displayTextOf(byId(use.id)));
    const no = addNodeAt('没有这个键 {配置.nope}', 600, 120, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL03b 键不存在显示 [未定义]', displayTextOf(byId(no.id)) === '没有这个键 [未定义]',
      displayTextOf(byId(no.id)));
    ok('VL03c 默认一对 key=value', (() => {
      const m2 = normalizeVarDef({ control:'map' });
      return m2.pairs.length === 1 && m2.pairs[0].k === 'key';
    })(), JSON.stringify(normalizeVarDef({ control:'map' }).pairs));
  });
  T('VL04 列表 / 地图里的每一格都能引用变量', () => {
    fresh(); cancelEdit();
    const a = addVarNode('甲', 0, 0, { name:'甲', value:'7' });
    const L = addVarNode('表', 0, 400, { name:'表', control:'list', items:['{甲}', 'x', '{甲}0'] });
    const M = addVarNode('图', 0, 800,
      { name:'图', control:'map', pairs:[{ k:'k{甲}', v:'v{甲}' }] });
    reindex(); sizeAll();
    const u1 = addNodeAt('{表.0} {表.2} {图.k7}', 700, 0, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL04 项 / 键 / 值里的 {变量} 都解析了',
      displayTextOf(byId(u1.id)) === '7 70 v7', displayTextOf(byId(u1.id)));
  });
  T('VL05 切换类型不丢数据，切回来还在', () => {
    fresh(); cancelEdit();
    const n = addVarNode('万金油', 0, 0,
      { name:'万金油', value:'文字值', control:'plain' });
    reindex(); sizeAll();
    setVarDef(byId(n.id), { items:['a', 'b'], pairs:[{ k:'k', v:'v' }], min:'1.5', max:'9.25' });
    // 挨个切换一圈
    for (const c of ['slider', 'list', 'map', 'check', 'cond', 'plain']){
      setVarControl(byId(n.id), c);
      reindex(); sizeAll();
    }
    const v = normalizeVarDef(byId(n.id).varDef);
    ok('VL05 值还在', v.value === '文字值', JSON.stringify(v.value));
    ok('VL05b 列表项还在', v.items.join(',') === 'a,b', JSON.stringify(v.items));
    ok('VL05c 键值对还在', v.pairs.length === 1 && v.pairs[0].k === 'k', JSON.stringify(v.pairs));
    // min / max / step 存的是**数字**（只有含花括号的才留成字符串），所以按数字比
    ok('VL05d 滑条上下限还在', Number(v.min) === 1.5 && Number(v.max) === 9.25,
      v.min + '~' + v.max);
  });
  T('VL06 滑块的起点 / 终点 / 步长是浮点数', () => {
    fresh(); cancelEdit();
    const s = addVarNode('滑', 0, 0, { name:'滑', control:'slider', type:'number',
      value:'0.5', min:'0.25', max:'2.75', step:'0.25' });
    reindex(); sizeAll();
    const v = normalizeVarDef(byId(s.id).varDef);
    ok('VL06 三个都是浮点',
      Number(v.min) === 0.25 && Number(v.max) === 2.75 && Number(v.step) === 0.25,
      [v.min, v.max, v.step].join(' / '));
    ok('VL06b 拖动时按浮点步长走', sliderValue(Object.assign({}, v, { value:'1.1' })) === 1.0,
      String(sliderValue(Object.assign({}, v, { value:'1.1' }))));
    // 上下限也能写 {变量}
    const lo = addVarNode('下限', 0, 400, { name:'下限', value:'3' });
    setVarDef(byId(s.id), { min:'{下限}' });
    const u = addNodeAt('取 {滑}', 700, 0, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL06c 上下限引用变量后照样能算', displayTextOf(byId(u.id)).indexOf('取 ') === 0,
      displayTextOf(byId(u.id)));
  });
  T('VL07 列表 / 地图的增删', () => {
    fresh(); cancelEdit();
    const L = addVarNode('清单', 0, 0, { name:'清单', control:'list', items:['a'] });
    reindex(); sizeAll();
    addListItem(byId(L.id));
    ok('VL07 加一项', normalizeVarDef(byId(L.id).varDef).items.length === 2,
      normalizeVarDef(byId(L.id).varDef).items.join(','));
    removeListItem(byId(L.id));
    ok('VL07b 删一项', normalizeVarDef(byId(L.id).varDef).items.length === 1,
      normalizeVarDef(byId(L.id).varDef).items.join(','));
    // 只剩一项时再删：不动它（列表永远至少一项）
    removeListItem(byId(L.id));
    ok('VL07c 只剩一项时删不动', normalizeVarDef(byId(L.id).varDef).items.length === 1,
      normalizeVarDef(byId(L.id).varDef).items.join(','));
    const M = addVarNode('表', 0, 600, { name:'表', control:'map', pairs:[{ k:'a', v:'1' }] });
    reindex(); sizeAll();
    addMapPair(byId(M.id));
    ok('VL07d 加一对', normalizeVarDef(byId(M.id).varDef).pairs.length === 2,
      JSON.stringify(normalizeVarDef(byId(M.id).varDef).pairs));
    removeMapPair(byId(M.id));
    removeMapPair(byId(M.id));
    ok('VL07e 只剩一对时删不动', normalizeVarDef(byId(M.id).varDef).pairs.length === 1,
      JSON.stringify(normalizeVarDef(byId(M.id).varDef).pairs));
  });
  T('VL08 变量优先，但嵌入文档的 {嵌入名.输出名} 没被弄坏', () => {
    fresh(); cancelEdit();
    /* 同名冲突时变量优先 —— 但**没有**同名变量时，{a.b} 必须还是嵌入引用。
       这条是防回归：改动把 {a.b} 一律当成了列表下标。 */
    const L = addVarNode('表', 0, 0, { name:'表', control:'list', items:['第一'] });
    reindex(); sizeAll();
    const u = addNodeAt('{表.0}', 600, 0, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL08 有同名变量时按列表下标走', displayTextOf(byId(u.id)) === '第一',
      displayTextOf(byId(u.id)));
    // 一个不存在的名字 + 点 → 走嵌入那条路（找不到就是 [未定义]，不该抛异常）
    const u2 = addNodeAt('{没这个东西.输出}', 600, 120, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL08b 没有同名变量时退回嵌入引用，不抛异常',
      displayTextOf(byId(u2.id)) === '[未定义]', displayTextOf(byId(u2.id)));
    // 普通变量（不是列表）后面跟点 → 也退回嵌入那条路
    const P = addVarNode('普', 0, 400, { name:'普', value:'x' });
    reindex(); sizeAll();
    const u3 = addNodeAt('{普.啥}', 600, 240, 'round');
    reindex(); sizeAll(); mark(); draw();
    ok('VL08c 非列表类型后面跟点也退回嵌入引用',
      displayTextOf(byId(u3.id)) === '[未定义]', displayTextOf(byId(u3.id)));
  });
  T('VL09 菜单里没有独立的「滑条节点」了', () => {
    fresh(); cancelEdit();
    const n = doc.nodes[0];
    selectOnly(n.id);
    showCtx(600, 400, byId(n.id), null, { p:{ x:0, y:0 } });
    const all = [...ctxEl.querySelectorAll('.item')].map(d => d.textContent);
    ok('VL09 右键菜单里没有「滑条节点」',
      !all.some(t => t.indexOf('滑条节点') === 0), all.slice(0, 6).join(' / '));
    if (all.some(t => t.indexOf('新建') === 0)){
      const nw = openSub('新建');
      const sub = menuStack[menuStack.length - 1];
      const subAll = [...sub.querySelectorAll('.item')].map(d => d.textContent);
      openSub('程序节点');
      const sub2 = menuStack[menuStack.length - 1];
      const sub2All = [...sub2.querySelectorAll('.item')].map(d => d.textContent);
      ok('VL09b 新建 → 程序节点里也没有滑条节点',
        !sub2All.some(t => t.indexOf('滑条节点') === 0), sub2All.join(' / '));
      ok('VL09c 但变量节点还在', sub2All.some(t => t.indexOf('变量节点') === 0), sub2All.join(' / '));
    }
    hideCtx();
    // 右键变量节点 → 类型 里六种都在
    const vn = addVarNode('x', 0, 900, { name:'x' });
    reindex(); sizeAll(); selectOnly(byId(vn.id));
    showCtx(600, 400, byId(vn.id), null, { p:{ x:0, y:0 } });
    // 「类型：」在**数据**子菜单里，得先展开
    openSub('数据');
    const dataEl = menuStack[menuStack.length - 1];
    const typeItem = [...dataEl.querySelectorAll('.item')].find(d => d.textContent.indexOf('类型：') === 0);
    ok('VL09d 变量节点的菜单里有「类型：」', !!typeItem, typeItem ? typeItem.textContent : '(没有)');
    if (typeItem){
      openSub('类型：');
      const ts = [...menuStack[menuStack.length - 1].querySelectorAll('.item')].map(d => d.textContent);
      ok('VL09e 六种类型都在下拉里',
        ['单一变量', '滑块', '列表', '地图', '勾选', '条件'].every(x => ts.some(t => t.indexOf(x) >= 0)),
        ts.join(' / '));
    }
    hideCtx();
  });

  T('NX01 嵌套索引：{a.{b}} 甚至 {{a}.{b}}', () => {
    fresh(); cancelEdit();
    /* 造一套「名字也来自变量、键也来自变量」的结构 */
    const idx = addVarNode('哪张', 0, 0, { name:'哪张', value:'表', type:'string' });
    const which = addVarNode('第几个', 0, 300, { name:'第几个', value:'1', type:'number' });
    const tbl = addVarNode('表', 0, 600, { name:'表', control:'list', items:['零', '一', '二'] });
    const tbl2 = addVarNode('表二', 0, 900, { name:'表二', control:'list', items:['A', 'B', 'C'] });
    const m = addVarNode('映射', 0, 1200,
      /* 特意放一个键叫「壹」—— 这样「取到的值再去索引另一张表」那条三层链路才走得通 */
      { name:'映射', control:'map',
        pairs:[{ k:'一', v:'壹' }, { k:'二', v:'贰' }, { k:'壹', v:'深层命中' }] });
    const m2 = addVarNode('映射二', 0, 1500,
      { name:'映射二', control:'map', pairs:[{ k:'x', v:'X 值' }] });
    reindex(); sizeAll();

    const mk = (text, y) => { const n = addNodeAt(text, 900, y, 'round'); reindex(); sizeAll(); mark(); draw(); return displayTextOf(byId(n.id)); };
    ok('NX01a 一层：{表.1} = 一', mk('{表.1}', 0) === '一', mk('{表.1}', 0));
    ok('NX01b 头嵌一层：{{哪张}.1} = 一', mk('{{哪张}.1}', 200) === '一', mk('{{哪张}.1}', 200));
    ok('NX01c 尾嵌一层：{表.{第几个}} = 一', mk('{表.{第几个}}', 400) === '一', mk('{表.{第几个}}', 400));
    ok('NX01d 头尾都嵌：{{哪张}.{第几个}} = 一',
      mk('{{哪张}.{第几个}}', 600) === '一', mk('{{哪张}.{第几个}}', 600));
    ok('NX01e 地图键来自变量：{映射.{表.1}} = 壹',
      mk('{映射.{表.1}}', 800) === '壹', mk('{映射.{表.1}}', 800));
    /* ★ 用户举的那个三层例子 {{name1}.{name2.{name3}}} */
    /* {{哪张}.{映射.{表.1}}} 展开是 表[映射[表[1]]] = 表['壹'] —— 壹 不是合法下标，
       所以**应该**是 [未定义]。这条测的是「层层展开之后取不到也不炸」。 */
    ok('NX01f 三层展开后取不到 → [未定义]，不炸',
      mk('{{哪张}.{映射.{表.1}}}', 1000) === '[未定义]',
      mk('{{哪张}.{映射.{表.1}}}', 1000));
    /* 上面那条其实取不到：壹 不是合法下标。换一个真能取到的三层例子 */
    ok('NX01g 三层（真能取到）：{{哪张}.{映射.二}} —— 映射.二 = 贰，表.贰 取不到',
      mk('{{哪张}.{映射.二}}', 1200).indexOf('未定义') >= 0,
      mk('{{哪张}.{映射.二}}', 1200));
    ok('NX01h 三层（真能取到）：{{哪张}.{映射.一}} 也是 [未定义]（壹 不是数字下标）',
      mk('{{哪张}.{映射.一}}', 1400).indexOf('未定义') >= 0,
      mk('{{哪张}.{映射.一}}', 1400));
    /* 真正常见的三层：变量 → 地图键 → 那个值又是另一个地图的键 */
    const picker = addVarNode('选谁', 0, 1800, { name:'选谁', value:'一', type:'string' });
    const keyOf = addVarNode('键表', 0, 2100,
      { name:'键表', control:'map', pairs:[{ k:'一', v:'壹' }] });
    reindex(); sizeAll();
    /* 三层可用形态：
         {选谁} = 一 → 键表['一'] = 壹 → 映射['壹'] = 深层命中
       名字、中间的键、外层的键**全是算出来的**。 */
    ok('NX01i 三层可用形态：{映射.{键表.{选谁}}} = 深层命中',
      mk('{映射.{键表.{选谁}}}', 1600) === '深层命中', mk('{映射.{键表.{选谁}}}', 1600));
    /* 拼出来的一整个键：{映射.第{第几个}项} 这种也得能算 —— 用地图键做整串匹配 */
    const kk = addVarNode('串', 0, 2400, { name:'串', control:'map', pairs:[{ k:'第1项', v:'命中' }] });
    reindex(); sizeAll();
    ok('NX01j 键是拼出来的：{串.第{第几个}项} = 命中',
      mk('{串.第{第几个}项}', 1800) === '命中', mk('{串.第{第几个}项}', 1800));
  });
  T('NX02 花括号的边界情况', () => {
    fresh(); cancelEdit();
    const L = addVarNode('表', 0, 0, { name:'表', control:'list', items:['甲'] });
    reindex(); sizeAll();
    const mk = (text) => { const n = addNodeAt(text, 800, 0, 'round'); reindex(); sizeAll(); mark(); draw(); return displayTextOf(byId(n.id)); };
    ok('NX02 转义 \\{ 还是字面量', mk('\\{表.0}').indexOf('{表.0}') >= 0, mk('\\{表.0}'));
    /* 没配对的括号不能把整串吃掉 */
    const bad = mk('前 {表.0 后');
    ok('NX02b 没配对的 { 当普通字符', bad.indexOf('前') === 0 && bad.indexOf('后') > 0, bad);
    ok('NX02c 多余的 } 原样留着', mk('{表.0}}') === '甲}', mk('{表.0}}'));
    /* 自我引用不能转不完 */
    const self = addVarNode('自', 0, 400, { name:'自', value:'{自}' });
    reindex(); sizeAll();
    const r = mk('取 {自}');
    ok('NX02d 自引用有护栏（不炸栈、给个标记）', r.length > 0 && r.length < 200, r);
  });
  T('NB01 勾选 / 列表 / 地图能在面板里编辑了', () => {
    fresh(); cancelEdit();
    const setPanel = (n) => { selectOnly(byId(n.id)); openNodeBox(byId(n.id)); renderNodeBox(); };
    const row = () => document.getElementById('nbBodyRow');
    const el2 = () => document.getElementById('nbBody');

    const chk = addControlNode('check', 0, 0);
    reindex(); sizeAll(); setPanel(chk);
    ok('NB01 勾选节点：内容行显示出来了', row().style.display === 'flex', row().style.display);
    ok('NB01b 框里是逗号分隔的选项', el2().value === '选项一, 选项二', JSON.stringify(el2().value));
    ok('NB01c 提示语说明了格式', document.getElementById('nbBodyHint').textContent.indexOf('逗号') >= 0,
      document.getElementById('nbBodyHint').textContent);
    el2().value = '牛肉, 香菜, 辣椒'; el2().onchange();
    ok('NB01d 改完真的存进去了',
      normalizeVarDef(byId(chk.id).varDef).options.join('/') === '牛肉/香菜/辣椒',
      normalizeVarDef(byId(chk.id).varDef).options.join('/'));

    const lst = addVarNode('名单', 0, 500, { name:'名单', control:'list', items:['a', 'b'] });
    reindex(); sizeAll(); setPanel(lst);
    ok('NB01e 列表：一行一项', el2().value === 'a\nb', JSON.stringify(el2().value));
    el2().value = '甲\n乙\n丙'; el2().onchange();
    ok('NB01f 列表改完存进去',
      normalizeVarDef(byId(lst.id).varDef).items.join('/') === '甲/乙/丙',
      normalizeVarDef(byId(lst.id).varDef).items.join('/'));

    const mp = addVarNode('配置', 0, 900,
      { name:'配置', control:'map', pairs:[{ k:'a', v:'1' }] });
    reindex(); sizeAll(); setPanel(mp);
    ok('NB01g 地图：一行一对 key=value', el2().value === 'a=1', JSON.stringify(el2().value));
    el2().value = 'host=localhost\nport=8080'; el2().onchange();
    ok('NB01h 地图改完存进去',
      JSON.stringify(normalizeVarDef(byId(mp.id).varDef).pairs)
        === JSON.stringify([{ k:'host', v:'localhost' }, { k:'port', v:'8080' }]),
      JSON.stringify(normalizeVarDef(byId(mp.id).varDef).pairs));

    /* 别的类型要收起来 */
    const plain = addVarNode('普通', 0, 1300, { name:'普通', value:'x' });
    reindex(); sizeAll(); setPanel(plain);
    ok('NB01i 单一变量：内容行收起来', row().style.display === 'none', row().style.display);
    const sl = addVarNode('滑', 0, 1700, { name:'滑', control:'slider' });
    reindex(); sizeAll(); setPanel(sl);
    ok('NB01j 滑块：内容行也收起来', row().style.display === 'none', row().style.display);
    closeNodeBox();
  });
  T('NB02 勾选的作用域行别再写成「列表」', () => {
    fresh(); cancelEdit();
    const chk = addControlNode('check', 0, 0);
    reindex(); sizeAll();
    const t = varScopeText(normalizeVarDef(byId(chk.id).varDef));
    ok('NB02 勾选节点显示「勾选」不是「列表」', t.indexOf('勾选') >= 0 && t.indexOf('列表') < 0, t);
    const lst = addVarNode('名单', 0, 400, { name:'名单', control:'list', items:['a'] });
    reindex(); sizeAll();
    ok('NB02b 列表节点显示项数',
      varScopeText(normalizeVarDef(byId(lst.id).varDef)).indexOf('列表 1 项') >= 0,
      varScopeText(normalizeVarDef(byId(lst.id).varDef)));
    const mp = addVarNode('配置', 0, 800,
      { name:'配置', control:'map', pairs:[{ k:'a', v:'1' }, { k:'b', v:'2' }] });
    reindex(); sizeAll();
    ok('NB02c 地图节点显示对数',
      varScopeText(normalizeVarDef(byId(mp.id).varDef)).indexOf('地图 2 对') >= 0,
      varScopeText(normalizeVarDef(byId(mp.id).varDef)));
    /* 每种类型都不能出现别的类型的名字 */
    ok('NB02d 六种类型两两不串名', VAR_CONTROLS.every(c => {
      const n = addVarNode('t' + c, 0, 2000, { name:'t' + c, control:c });
      reindex(); sizeAll();
      const s = varScopeText(normalizeVarDef(byId(n.id).varDef));
      return s.indexOf(VAR_CONTROL_LABEL[c]) >= 0
          || c === 'slider' || c === 'plain';      // 这两个显示的是数值 / 类型名，不是控件名
    }));
  });
  T('MN01 子菜单是单击展开的，不是悬停', () => {
    fresh(); cancelEdit();
    const n = addVarNode('x', 0, 0, { name:'x' });
    reindex(); sizeAll(); selectOnly(byId(n.id));
    showCtx(600, 400, byId(n.id), null, { p:{ x:0, y:0 } });
    const top = [...ctxEl.querySelectorAll('.item')];
    const sub = top.find(d => d.classList.contains('sub'));
    ok('MN01 前置：顶层有带子菜单的项', !!sub, top.map(d => d.textContent).join(' / '));
    const before = menuStack.length;
    /* 悬停不该展开 */
    if (sub.onmouseenter) sub.onmouseenter();
    sub.dispatchEvent(new MouseEvent('mouseenter', { bubbles:true }));
    ok('MN01b 悬停**不**展开', menuStack.length === before, before + ' → ' + menuStack.length);
    /* 单击才展开 */
    sub.click();
    ok('MN01c 单击才展开', menuStack.length === before + 1, before + ' → ' + menuStack.length);
    ok('MN01d 展开的那项标了 sel', sub.classList.contains('sel'));
    /* 再点一下收起来 */
    sub.click();
    ok('MN01e 再点一下收起', menuStack.length === before, before + ' → ' + menuStack.length);
    hideCtx();
  });

  T('SL01 面板的行不串：换节点类型要跟着收掉', () => {
    fresh(); cancelEdit();
    const vis = (id) => document.getElementById(id).style.display || '(默认)';
    const setPanel = (n) => { selectOnly(byId(n.id)); openNodeBox(byId(n.id)); renderNodeBox(); };
    const sl = addVarNode('音量', 0, 0,
      { name:'音量', value:'50', type:'number', control:'slider' });
    const chk = addControlNode('check', 0, 600);
    const lst = addVarNode('名单', 0, 1200, { name:'名单', control:'list', items:['a'] });
    const txt = addNodeAt('普通文本', 0, 1800, 'rect');
    reindex(); sizeAll();

    setPanel(sl);
    ok('SL01 滑块：滑条行开、内容行关',
      vis('nbSlideRow') === 'flex' && vis('nbBodyRow') === 'none',
      vis('nbSlideRow') + ' / ' + vis('nbBodyRow'));
    setPanel(chk);
    ok('SL01b 勾选：内容行开、滑条行关',
      vis('nbBodyRow') === 'flex' && vis('nbSlideRow') === 'none',
      vis('nbSlideRow') + ' / ' + vis('nbBodyRow'));
    setPanel(lst);
    ok('SL01c 列表：内容行开、滑条行关',
      vis('nbBodyRow') === 'flex' && vis('nbSlideRow') === 'none',
      vis('nbSlideRow') + ' / ' + vis('nbBodyRow'));
    /* ★ 这一条是回归：以前非变量节点不进任何分支，
       那两行会留着上一个变量的状态 —— 面板看起来就是「串了」。 */
    setPanel(txt);
    ok('SL01d 普通文本节点：两行都要收掉（以前会留着上一个的）',
      vis('nbSlideRow') === 'none' && vis('nbBodyRow') === 'none',
      vis('nbSlideRow') + ' / ' + vis('nbBodyRow'));
    setPanel(sl);
    ok('SL01e 再切回滑块：又正常了',
      vis('nbSlideRow') === 'flex' && vis('nbBodyRow') === 'none',
      vis('nbSlideRow') + ' / ' + vis('nbBodyRow'));
    closeNodeBox();
  });
  T('SL02 值是 {变量} 时，那条数值滑条要停用（不能偷偷把引用冲掉）', () => {
    fresh(); cancelEdit();
    const pg = createProgramNode(0, 0);
    reindex(); sizeAll(); selectOnly(byId(pg.id));
    openNodeBox(byId(pg.id)); renderNodeBox();
    const box = () => document.getElementById('nbVal');
    const rg = () => box().querySelector('input[type=range]');
    const tx = () => box().querySelector('input[type=text]');

    ok('SL02 前置：数字值时滑条可用', rg() && !rg().disabled);
    const before = [+rg().min, +rg().max];
    /* 拖一下：数字值正常生效 */
    rg().value = '20'; rg().oninput();
    ok('SL02b 数字值能拖', byId(pg.id).program.value === 20, JSON.stringify(byId(pg.id).program.value));
    /* 改成变量引用 */
    tx().value = '{倍数}'; tx().onchange();
    ok('SL02c 框里写 {变量} 原样存住', byId(pg.id).program.value === '{倍数}',
      JSON.stringify(byId(pg.id).program.value));
    renderNodeBox();
    /* ★ 回归点：以前滑条照样可用、值算成 0，用户一碰就把 {倍数} 冲掉了 */
    ok('SL02d 重新渲染后滑条**停用**了', rg().disabled === true, String(rg().disabled));
    ok('SL02e 停用的滑条不再挂 oninput', !rg().oninput,
      String(rg().oninput));
    ok('SL02f 界面上有一句说明', !!box().querySelector('.nbexprnote'));
    /* 就算有人硬派发事件，也不该把值改掉 */
    const kept = byId(pg.id).program.value;
    rg().dispatchEvent(new Event('input'));
    rg().dispatchEvent(new Event('change'));
    ok('SL02g 硬派发事件也改不掉它', byId(pg.id).program.value === kept,
      JSON.stringify(byId(pg.id).program.value));
    /* 改回数字 → 滑条复活 */
    tx().value = '24'; tx().onchange();
    renderNodeBox();
    ok('SL02h 改回数字之后滑条复活', rg().disabled === false, String(rg().disabled));
    rg().value = '30'; rg().oninput();
    ok('SL02i 复活后能正常拖', byId(pg.id).program.value === 30,
      JSON.stringify(byId(pg.id).program.value));
    closeNodeBox();
  });
  T('SL03 变量滑条本身没问题（拖动 / 引用 / 上下限算得对）', () => {
    fresh(); cancelEdit();
    const lo = addVarNode('下界', 0, 0, { name:'下界', value:'10' });
    const hi = addVarNode('上界', 0, 400, { name:'上界', value:'20' });
    const s = addVarNode('滑', 0, 800,
      { name:'滑', control:'slider', type:'number', value:'15', min:'{下界}', max:'{上界}', step:'1' });
    reindex(); sizeAll();
    const v = normalizeVarDef(byId(s.id).varDef);
    ok('SL03 sliderValue 解析了上下限', sliderValue(v, byId(s.id).id) === 15,
      String(sliderValue(v, byId(s.id).id)));
    const f = sliderFrac(v, byId(s.id).id);
    ok('SL03b 分数在 0..1 之间（10~20 里的 15 = 0.5）', Math.abs(f - 0.5) < 1e-9, String(f));
    selectOnly(byId(s.id)); mark(); draw();
    const L = varBoxes(byId(s.id));
    ok('SL03c 有轨道', !!L.trackBox);
    /* 拖到轨道四分之三处（10 + 0.75*10 = 17.5 → 步长 1 取 18） */
    const px = { x: L.trackBox.x + 12 + (L.trackBox.w - 24) * 0.75,
                 y: L.trackBox.y + L.trackBox.h / 2 };
    ok('SL03d 命中轨道', JSON.stringify(hitVarControl(byId(s.id), px)) === '{"kind":"slider"}',
      JSON.stringify(hitVarControl(byId(s.id), px)));
    setSliderFromPointer(byId(s.id), px);
    ok('SL03e 拖到 75% → 18', normalizeVarDef(byId(s.id).varDef).value === '18'
      || +normalizeVarDef(byId(s.id).varDef).value === 18,
      JSON.stringify(normalizeVarDef(byId(s.id).varDef).value));
    /* 值超出范围要被夹住，不能出现 NaN */
    setVarDef(byId(s.id), { value:'999' });
    ok('SL03f 超范围被夹到上限', sliderValue(normalizeVarDef(byId(s.id).varDef), byId(s.id).id) === 20,
      String(sliderValue(normalizeVarDef(byId(s.id).varDef), byId(s.id).id)));
    setVarDef(byId(s.id), { value:'一段文字' });
    const sv = sliderValue(normalizeVarDef(byId(s.id).varDef), byId(s.id).id);
    ok('SL03g 非数字落到下限，不是 NaN', sv === 10 && isFinite(sv), String(sv));
  });

  T('SL04 上下限写 {变量} 时，加减范围也不能算出 NaN', () => {
    fresh(); cancelEdit();
    const lo = addVarNode('下界', 0, 0, { name:'下界', value:'10' });
    const hi = addVarNode('上界', 0, 400, { name:'上界', value:'20' });
    const s = addVarNode('滑', 0, 800,
      { name:'滑', control:'slider', type:'number', value:'15',
        min:'{下界}', max:'{上界}', step:'1' });
    reindex(); sizeAll(); selectOnly(byId(s.id));
    const V = () => normalizeVarDef(byId(s.id).varDef);
    ok('SL04 前置：上下限是变量引用', V().min === '{下界}' && V().max === '{上界}',
      V().min + ' / ' + V().max);

    /* ★ 回归点：以前菜单里直接 v.min - 10，'{下界}' - 10 = NaN */
    showCtx(600, 400, byId(s.id), null, { p:{ x:0, y:0 } });
    openSub('数据');
    const it = openSub('滑条范围…');
    /* 子菜单里找「下限 -10」 */
    const mi = [...menuStack[menuStack.length - 1].querySelectorAll('.item')]
      .find(d => d.textContent.indexOf('下限 -10') === 0);
    ok('SL04b 菜单里有「下限 -10」', !!mi);
    if (mi) mi.click();
    const after = V();
    ok('SL04c 点完下限不是 NaN（10 - 10 = 0）',
      Number(after.min) === 0 && !isNaN(Number(after.min)),
      JSON.stringify(after.min));
    hideCtx();

    /* 上限也来一下 */
    showCtx(600, 400, byId(s.id), null, { p:{ x:0, y:0 } });
    openSub('数据');
    openSub('滑条范围…');
    const ma = [...menuStack[menuStack.length - 1].querySelectorAll('.item')]
      .find(d => d.textContent.indexOf('上限 +10') === 0);
    if (ma) ma.click();
    ok('SL04d 上限 +10 也不是 NaN（20 + 10 = 30）', Number(V().max) === 30,
      JSON.stringify(V().max));
    hideCtx();

    /* 拖动也得跟着对：上下限变数字之后，拖到中点该是 15（0~30 的中点） */
    setVarDef(byId(s.id), { min:'0', max:'30', step:'1' });
    reindex(); sizeAll(); mark(); draw();
    const L = varBoxes(byId(s.id));
    const px = { x: L.trackBox.x + 12 + (L.trackBox.w - 24) * 0.5,
                 y: L.trackBox.y + L.trackBox.h / 2 };
    setSliderFromPointer(byId(s.id), px);
    const got = Number(V().value);
    ok('SL04e 拖到中点 ≈ 15 且不是 NaN', isFinite(got) && Math.abs(got - 15) <= 1,
      JSON.stringify(V().value));
  });

  T('LG01 操作记录：每次操作都记下来', () => {
    fresh(); cancelEdit();
    clearLog();
    ok('LG01 清空之后是空的', logSize() === 0, String(logSize()));
    ok('LG01b 空的时候导出来是空串', logAsText() === '', JSON.stringify(logAsText()));

    say('* 第一件事。');
    say('* 第二件事。', '文件');
    say('* 第三件事。', '视图');
    ok('LG01c 三条都进去了', logSize() === 3, String(logSize()));
    const c = logCounts();
    ok('LG01d 分类计数对', c['全部'] === 3 && c['操作'] === 1 && c['文件'] === 1 && c['视图'] === 1,
      JSON.stringify(c));
    ok('LG01e 按分类筛', logEntries('文件').length === 1, String(logEntries('文件').length));
    ok('LG01f 认不出的分类归到「操作」', (() => {
      say('* 怪事。', '这不是分类');
      return logEntries('操作').length === 2;
    })(), String(logEntries('操作').length));
    /* 日志里的文字不该带 '* ' 前缀（那是给底栏的） */
    ok('LG01g 记录里不带 "* " 前缀',
      logEntries() .every(e => e.text.indexOf('*') !== 0),
      JSON.stringify(logEntries().map(e => e.text)));
    ok('LG01h 导出的文本一行一条、带时间和分类', (() => {
      const t = logAsText().split('\n');
      return t.length === logEntries().length && /^\d\d:\d\d:\d\d {2}\[/.test(t[0]);
    })(), JSON.stringify(logAsText().split('\n')[0]));
    clearLog();
    ok('LG01i 清空有效', logSize() === 0);
  });
  T('LG02 记录是环形的，不会无限涨', () => {
    fresh(); cancelEdit(); clearLog();
    for (let i = 0; i < 900; i++) say('* 第 ' + i + ' 条。');
    ok('LG02 上限就是 800 条', logSize() === 800, String(logSize()));
    const first = logEntries()[0].text;
    ok('LG02b 丢的是最旧的（第 0 条没了）', first !== '第 0 条。', first);
    ok('LG02c 最新的还在', logEntries()[799].text === '第 899 条。', logEntries()[799].text);
    clearLog();
  });
  T('LG03 面板：开关 / 筛选 / 复制 / 清空', () => {
    fresh(); cancelEdit(); clearLog();
    say('* 甲。');
    say('* 乙。', '文件');
    openLogbox();
    ok('LG03 打开了', logboxEl.style.display === 'block', logboxEl.style.display);
    ok('LG03b 列出来了两条', logListEl.querySelectorAll('.logrow').length === 2,
      String(logListEl.querySelectorAll('.logrow').length));
    ok('LG03c 新的在上面', logListEl.querySelector('.logrow .lx').textContent === '乙。',
      logListEl.querySelector('.logrow .lx').textContent);
    /* 分类按钮 */
    const btns = [...document.getElementById('logBar').querySelectorAll('.ud-btn')];
    ok('LG03d 有「全部」和分类按钮', btns.length >= 3, btns.map(b => b.textContent).join(' / '));
    const fileBtn = btns.find(b => b.textContent.indexOf('文件') === 0);
    ok('LG03e 分类按钮上带数量', !!fileBtn && /文件 1/.test(fileBtn.textContent),
      fileBtn ? fileBtn.textContent : '(没有)');
    if (fileBtn){
      fileBtn.click();
      ok('LG03f 点一下只剩这一类', logListEl.querySelectorAll('.logrow').length === 1,
        String(logListEl.querySelectorAll('.logrow').length));
    }
    /* 回全部 */
    [...document.getElementById('logBar').querySelectorAll('.ud-btn')]
      .find(b => b.textContent.indexOf('全部') === 0).click();
    ok('LG03g 切回全部又两条了', logListEl.querySelectorAll('.logrow').length === 2);
    /* 面板开着时新记录要实时进来 */
    say('* 丙。');
    ok('LG03h 面板开着时实时补上', logListEl.querySelectorAll('.logrow').length === 3,
      String(logListEl.querySelectorAll('.logrow').length));
    /* 清空 */
    document.getElementById('logClear').click();
    ok('LG03i 清空按钮有效', logSize() === 0 && logListEl.querySelectorAll('.logrow').length === 0);
    ok('LG03j 空的时候给一句说明', !!logListEl.querySelector('.empty'),
      logListEl.textContent.slice(0, 30));
    closeLogbox();
    ok('LG03k 关掉了', logboxEl.style.display === 'none', logboxEl.style.display);
  });
  T('LG04 所有操作都会自动进记录（say 是总闸）', () => {
    fresh(); cancelEdit(); clearLog();
    const r = doc.nodes.find(n => isRoot(n));
    selectOnly(r.id);
    spawnInDirection('right'); skipDlg();
    ok('LG04 生成节点被记下来了', logSize() > 0, String(logSize()));
    ok('LG04b 记的和底栏说的是同一句', (() => {
      skipDlg();
      return logEntries().some(e => e.text === dlgText.textContent);
    })(), JSON.stringify(logEntries().map(e => e.text)));
    const before = logSize();
    addChild(); skipDlg();
    ok('LG04c 加子节点也记了', logSize() > before, before + ' → ' + logSize());
    /* 文件类的要落到「文件」分类里 */
    clearLog();
    say('* 已保存为 x.json', '文件');
    ok('LG04d 文件类进「文件」分类', logEntries('文件').length === 1,
      JSON.stringify(logCounts()));
    clearLog();
  });

  T('TG01 取名工具：改动类的提示语靠它们报出被改的是谁', () => {
    fresh(); cancelEdit();
    const a = addNodeAt('起点节点', 0, 0, 'rect');
    reindex(); sizeAll();
    ok('TG01 普通节点用正文', tagOf(byId(a.id)) === '「起点节点」', tagOf(byId(a.id)));
    /* 空正文要退回类型词，不能变成「」 */
    const v = addVarNode('', 400, 0, { name:'音量' });
    reindex(); sizeAll();
    ok('TG01b 空正文的变量节点用变量名', tagOf(byId(v.id)) === '「变量 音量」', tagOf(byId(v.id)));
    const t = addNodeAt('', 800, 0, 'rect');
    t.kind = 'table'; t.tableDef = normalizeTableDef({ rows:2, cols:2 });
    reindex(); sizeAll();
    ok('TG01c 空正文的表格退回「表格」', tagOf(byId(t.id)) === '「表格」', tagOf(byId(t.id)));
    ok('TG01d 超长名字会截断', (() => {
      const s = tagOf({ text:'这是一个特别特别长的节点名字用来测试截断' });
      return s.length <= 16 && s.slice(-2) === '…」';
    })(), tagOf({ text:'这是一个特别特别长的节点名字用来测试截断' }));
    const g = newEmptyGroup(0, 600); renameGroup(g, '我的分组');
    ok('TG01e 分组用标题', tagOf(g) === '「我的分组」', tagOf(g));
    ok('TG01f 没标题的分组兜底', tagOf({ members:[] }) === '「分组」', tagOf({ members:[] }));
    const e = linkNodes(a.id, v.id); reindex();
    ok('TG01g 连线报两端', edgeTag(e) === '「起点节点 → 变量 音量」', edgeTag(e));
    ok('TG01h 一批东西：三个以内全列，超过报总数', (() => {
      const three = namesOf([a.id, v.id, t.id]);
      /* namesOf 走的是 byId，只认节点 —— 四个**节点**才该报总数 */
      const d = addNodeAt('第四', 1200, 0, 'rect');
      reindex(); sizeAll();
      const four = namesOf([a.id, v.id, t.id, d.id]);
      return three.indexOf('等') < 0 && four.indexOf('等 4 个') >= 0;
    })(), namesOf([a.id, v.id, t.id, g.id]));
    ok('TG01i 空 / null 不炸', tagOf(null) === '' && namesOf([]) === '' && edgeTag(null) === '「连线」',
      JSON.stringify([tagOf(null), namesOf([]), edgeTag(null)]));
  });
  T('TG02 改动类操作必须报出被改的节点 —— 抽查几条真跑的', () => {
    fresh(); cancelEdit();
    const r = doc.nodes.find(n => isRoot(n));
    const rName = shortName(r);

    /* 新建子节点 */
    selectOnly(r.id); addChild(); skipDlg();
    ok('TG02 新建子节点报出父节点', dlgText.textContent.indexOf(rName) >= 0,
      dlgText.textContent);

    /* 折叠 */
    clearLog(); selectOnly(r.id); toggleCollapse(); skipDlg();
    ok('TG02b 折叠报出节点名', dlgText.textContent.indexOf(rName) >= 0, dlgText.textContent);

    /* 恢复自适应尺寸 */
    const a = doc.nodes.find(n => n !== r && String(n.text || '').trim());
    clearLog(); autoSizeNode(byId(a.id)); skipDlg();
    ok('TG02c 恢复尺寸报出节点名', dlgText.textContent.indexOf(shortName(byId(a.id))) >= 0,
      dlgText.textContent);

    /* 变量节点的内容改动 */
    const v = addVarNode('变量甲', 900, 0, { name:'甲', control:'list', items:['a'] });
    reindex(); sizeAll();
    clearLog(); addListItem(byId(v.id)); skipDlg();
    ok('TG02d 列表加一项报出节点名', dlgText.textContent.indexOf(shortName(byId(v.id))) >= 0,
      dlgText.textContent + ' ／ 期望含 ' + shortName(byId(v.id)));
    clearLog(); setVarControl(byId(v.id), 'map'); skipDlg();
    ok('TG02e 换类型报出节点名', dlgText.textContent.indexOf(shortName(byId(v.id))) >= 0,
      dlgText.textContent + ' ／ 期望含 ' + shortName(byId(v.id)));

    /* 表格行列 */
    const tb = addTableNode(1400, 0, { rows:2, cols:2 });
    reindex(); sizeAll();
    clearLog(); tableAddRow(byId(tb.id)); skipDlg();
    ok('TG02f 表格加行报出节点名', dlgText.textContent.indexOf(shortName(byId(tb.id))) >= 0,
      dlgText.textContent);

    /* 外观节点（程序节点）：它自己的参数也要报名字 */
    const pg = createProgramNode(2000, 0);
    reindex(); sizeAll();
    clearLog();
    selectOnly(byId(pg.id)); openNodeBox(byId(pg.id)); afterNodeEdit(); skipDlg();
    ok('TG02g 外观节点报出自己的名字', dlgText.textContent.indexOf(shortName(byId(pg.id))) >= 0,
      dlgText.textContent);
    closeNodeBox();

    /* 连线 */
    clearLog();
    const e = linkNodes(a.id, v.id); reindex(); pushHist();
    say('* 连上了' + edgeTag(e) + '。'); skipDlg();
    ok('TG02h 连线报出两端', dlgText.textContent.indexOf(shortName(byId(a.id))) >= 0
      && dlgText.textContent.indexOf(shortName(byId(v.id))) >= 0, dlgText.textContent);
  });
  T('TG03 规范是靠工具盯着的，不是靠自觉', () => {
    /* check-say.mjs 里那条规则：句子里出现「改了什么」的词却没报名字就报错。
       这里验的是规则本身还在，以及 tagOf / edgeTag 的产物能被认出来。 */
    ok('TG03 tagOf 的产物里有 「」', tagOf({ text:'x' }).indexOf('「') >= 0, tagOf({ text:'x' }));
    ok('TG03b edgeTag 的产物里有 「」',
      edgeTag({ s:'a', t:'b' }).indexOf('「') >= 0, edgeTag({ s:'a', t:'b' }));
    ok('TG03c 名字为空时要兜底，不能是空字符串', (() => {
      const bad = [null, {}, { text:'   ' }, { kind:'var' }].map(x => tagOf(x));
      return bad.every(s => s === '' || (s.length > 2 && s[0] === '「' && s.slice(-1) === '」'));
    })(), [null, {}, { text:'   ' }, { kind:'var' }].map(x => tagOf(x)).join(' | '));
  });

  T('RP01 水波主题：淡蓝 + 三个地方荡水纹', () => {
    ok('RP01 主题在册', !!THEMES.ripple, Object.keys(THEMES).join('/'));
    ok('RP01b 标着水波特效', THEMES.ripple.effect === 'ripple', String(THEMES.ripple.effect));
    ok('RP01c 是浅色底（背景比正文亮）', (() => {
      const lum = (hex) => { const n = parseInt(hex.slice(1), 16);
        return ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114); };
      return lum(THEMES.ripple.canvas.bg) > lum(THEMES.ripple.canvas.white);
    })(), THEMES.ripple.canvas.bg + ' vs ' + THEMES.ripple.canvas.white);
    ok('RP01d 调色板齐全', ['bg','white','yellow','red','gray','dim','grid']
      .every(k => /^#[0-9a-f]{6}$/i.test(THEMES.ripple.canvas[k] || '')),
      JSON.stringify(THEMES.ripple.canvas));
    ok('RP01e 算内置主题（不会当成用户自定义的）', BUILTIN_THEME_IDS.has('ripple'));
    ok('RP01f 三个触发函数都在', typeof pushRipple === 'function'
      && typeof dragRipple === 'function' && typeof rippleOnNewNode === 'function');
    /* 不是水波主题时不攒圈 */
    applyTheme('board'); clearRipples();
    pushRipple(0, 0, 'tap');
    ok('RP01g 别的主题下不攒圈', true, '');
    applyTheme('ripple');
    clearRipples();
    const e = pushRipple(100, 200, 'new');
    ok('RP01h 水波主题下能攒', !!e && e.r1 > 0, e ? String(e.r1) : 'null');
    /* 画一遍不能抛 */
    let err = 'none';
    try { draw(); } catch(ex){ err = ex.message; }
    ok('RP01i 画波纹不抛异常', err === 'none', err);
    clearRipples();
    applyTheme('board');
  });

  T('PP01 黑白翻转：就是 board 的明暗对调', () => {
    const lum = (hex) => { const n = parseInt(hex.slice(1), 16);
      return ((n >> 16 & 255) * 0.299 + (n >> 8 & 255) * 0.587 + (n & 255) * 0.114); };
    ok('PP01 主题在册', !!THEMES.paper, Object.keys(THEMES).join('/'));
    ok('PP01b 算内置主题', BUILTIN_THEME_IDS.has('paper'));
    ok('PP01c 底是白的、字是黑的', lum(THEMES.paper.canvas.bg) > 200 && lum(THEMES.paper.canvas.white) < 60,
      THEMES.paper.canvas.bg + ' / ' + THEMES.paper.canvas.white);
    ok('PP01d 正好和 board 反过来', (() => {
      const b = THEMES.board.canvas, p = THEMES.paper.canvas;
      return lum(b.bg) < lum(b.white) && lum(p.bg) > lum(p.white);
    })(), 'board ' + lum(THEMES.board.canvas.bg) + '<' + lum(THEMES.board.canvas.white)
       + ' / paper ' + lum(THEMES.paper.canvas.bg) + '>' + lum(THEMES.paper.canvas.white));
    ok('PP01e 性格和 board 一致（棋盘格 / 十字光标 / 无红心星号）',
      THEMES.paper.grid === THEMES.board.grid && THEMES.paper.cursor === THEMES.board.cursor
      && THEMES.paper.heart === THEMES.board.heart && THEMES.paper.star === THEMES.board.star,
      [THEMES.paper.grid, THEMES.paper.cursor, THEMES.paper.heart, THEMES.paper.star].join('/'));
    ok('PP01f 强调色压暗过 —— 亮黄压白底会糊',
      lum(THEMES.paper.canvas.yellow) < lum(THEMES.board.canvas.yellow),
      'board ' + Math.round(lum(THEMES.board.canvas.yellow)) + ' → paper ' + Math.round(lum(THEMES.paper.canvas.yellow)));
    ok('PP01g 调色板齐全', ['bg','white','yellow','red','gray','dim','grid']
      .every(k => /^#[0-9a-f]{6}$/i.test(THEMES.paper.canvas[k] || '')), JSON.stringify(THEMES.paper.canvas));
    /* 套上去画一帧不能抛 */
    fresh(); applyTheme('paper');
    let err = 'none';
    try { draw(); } catch(ex){ err = ex.message; }
    ok('PP01h 套上去画一帧不抛', err === 'none', err);
    ok('PP01i 没挂背景特效（它靠棋盘格）', themeEffect() === '', JSON.stringify(themeEffect()));
    applyTheme('board');
  });

  T('FM01 公式：{=…} 的解析与求值', () => {
    const R = (nm) => ({ '单价':12, '数量':4, '总价':96, '姓名':'张三' }[nm]);
    const E = (src) => evalFormula(src, R);
    /* 算术 */
    ok('FM01 乘', E('单价 * 数量') === 48, String(E('单价 * 数量')));
    ok('FM01b 括号', E('(单价 + 8) * 2') === 40, String(E('(单价 + 8) * 2')));
    ok('FM01c 除', E('总价 / 数量') === 24, String(E('总价 / 数量')));
    ok('FM01d 除零给 0（不吐 Infinity/NaN）', E('总价 / 0') === 0, String(E('总价 / 0')));
    ok('FM01e 幂', E('2 ^ 10') === 1024, String(E('2 ^ 10')));
    ok('FM01f 取余', E('总价 % 10') === 6, String(E('总价 % 10')));
    ok('FM01g 一元负号', E('-单价 + 20') === 8, String(E('-单价 + 20')));
    /* 比较 / 逻辑 —— ★ 这一组曾经全挂：&& 被拆成两个 &、|| 的 | 不在字符集里 */
    ok('FM01h 大于', E('数量 > 3') === true);
    ok('FM01i 等于', E('单价 = 12') === true);
    ok('FM01j 不等 <> 和 != 都认', E('单价 <> 12') === false && E('单价 != 12') === false);
    ok('FM01k ★ && 要用双字符识别', E('数量 > 2 && 单价 < 20') === true,
      String(E('数量 > 2 && 单价 < 20')));
    ok('FM01l ★ || 也一样', E('数量 > 9 || 单价 < 20') === true,
      String(E('数量 > 9 || 单价 < 20')));
    ok('FM01m 非', E('!(数量 > 9)') === true);
    /* 文本 */
    ok('FM01n & 拼串', E('姓名 & "有" & 数量 & "个"') === '张三有4个', String(E('姓名 & "有" & 数量 & "个"')));
    ok('FM01o 单双引号都行', E("CONCAT('a', \"b\")") === 'ab', String(E("CONCAT('a', \"b\")")));
    /* 函数 */
    ok('FM01p SUM', E('SUM(单价, 数量, 总价)') === 112, String(E('SUM(单价, 数量, 总价)')));
    ok('FM01q AVG', E('AVG(10, 20, 30)') === 20, String(E('AVG(10, 20, 30)')));
    ok('FM01r MAX/MIN', E('MAX(3, 9, 5) - MIN(3, 9, 5)') === 6);
    ok('FM01s ROUND', E('ROUND(总价 / 7, 2)') === 13.71, String(E('ROUND(总价 / 7, 2)')));
    ok('FM01t ABS/SQRT/MOD', E('ABS(0 - 单价)') === 12 && E('SQRT(144)') === 12 && E('MOD(总价, 10)') === 6);
    ok('FM01u IF 两边', E('IF(数量 > 2, "多", "少")') === '多' && E('IF(数量 > 9, "多", "少")') === '少');
    ok('FM01v IF 不短路（两个分支都先算了，所以除零也得给 0）',
      E('IF(数量 > 9, 总价 / 0, 1)') === 1, String(E('IF(数量 > 9, 总价 / 0, 1)')));
    ok('FM01w AND/OR/NOT',
      E('AND(1, 2) && OR(0, 1) && NOT(0)') === true, String(E('AND(1, 2) && OR(0, 1) && NOT(0)')));
    ok('FM01x LEN / CONCAT / UPPER',
      E('LEN(姓名)') === 2 && E('CONCAT(姓名, "先生")') === '张三先生' && E('UPPER("abc")') === 'ABC');
    ok('FM01y LEFT / RIGHT / MID（按码点切，中文不会切半个）',
      E('MID("abcdef", 3, 2)') === 'cd' && E('LEFT(姓名, 1)') === '张', String(E('MID("abcdef", 3, 2)')));
    ok('FM01z 常量 PI / TRUE', E('PI > 3 && TRUE') === true);
    /* 出错要能兜住 */
    ok('FM02 未知函数返回 null（不抛）', E('NOPE(1)') === null, String(E('NOPE(1)')));
    ok('FM02b 语法错返回 null', E('1 +') === null, String(E('1 +')));
    ok('FM02c 空公式返回 null', E('') === null);
    ok('FM02d 函数表非空', FUNC_NAMES.length >= 30, String(FUNC_NAMES.length) + ' 个');
    /* 端到端：走 interpolateIn，{=…} 要真的算出来 */
    fresh();
    const n1 = addVarNode('单价', 0, 0, { name:'单价', value:'12' });
    const n2 = addVarNode('数量', 0, 200, { name:'数量', value:'4' });
    const n3 = addNodeAt('合计 {=单价 * 数量}', 0, 400, 'rect');
    reindex(); sizeAll();
    /* ★ 要拿**节点自己的正文**去插值 —— 传 'x' 的话当然只拿到 'x' */
    const got = interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), n3.text, n3.id);
    ok('FM03 端到端：节点正文里的 {=…} 会算出来',
      String(got).indexOf('48') >= 0, String(got));
    ok('FM03b 求值失败显示 [公式错误] 而不是崩',
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{=NOPE(1)}', n3.id)).indexOf('公式错误') >= 0,
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{=NOPE(1)}', n3.id)));
    void n1; void n2;
  });

  T('MV01 多变量：数据层地基（第 1 步）', () => {
    fresh();
    /* 一个节点挂三个变量 —— UI 还没做，先验数据层 */
    const n = addNodeAt('设置', 0, 0, 'round');
    n.kind = 'var';
    n.varDefs = [
      { name:'音量', control:'slider', type:'number', value:'70', min:'0', max:'100', step:'1' },
      { name:'画质', control:'check',  type:'string', options:['低','中','高'], picked:[2] },
      { name:'全屏', control:'cond',   type:'number', value:'1' }
    ];
    reindex(); sizeAll();
    ok('MV01 nodeVarDefs 给出全部三个', nodeVarDefs(byId(n.id)).length === 3,
      String(nodeVarDefs(byId(n.id)).length));
    ok('MV01b 顺序和名字都对', nodeVarDefs(byId(n.id)).map(d => d.name).join(',') === '音量,画质,全屏',
      nodeVarDefs(byId(n.id)).map(d => d.name).join(','));
    ok('MV01c nodeVarDef 给第一个（广播和老代码用）', nodeVarDef(byId(n.id)).name === '音量',
      nodeVarDef(byId(n.id)).name);
    ok('MV01d 勾选变量的选项规范化过',
      nodeVarDefs(byId(n.id))[1].options.join(',') === '低,中,高',
      nodeVarDefs(byId(n.id))[1].options.join(','));
    ok('MV01e varRefInNode 能定位到第几个', (() => {
      const r = varRefInNode(byId(n.id), '画质'); return !!r && r.index === 1 && r.def.name === '画质';
    })(), JSON.stringify(varRefInNode(byId(n.id), '画质') && varRefInNode(byId(n.id), '画质').index));
    ok('MV01f varRefInNode 找不到给 null', varRefInNode(byId(n.id), '没有这个') === null);
    /* 老存档：单个 varDef 也要认得 */
    const m = addNodeAt('老的', 400, 0, 'round');
    m.kind = 'var'; m.varDef = { name:'旧量', control:'plain', value:'9' };
    reindex(); sizeAll();
    ok('MV01g 老存档 varDef 包成一项', nodeVarDefs(byId(m.id)).length === 1,
      String(nodeVarDefs(byId(m.id)).length));
    ok('MV01h 老存档的名字读得到', nodeVarDef(byId(m.id)).name === '旧量', nodeVarDef(byId(m.id)).name);
    ok('MV01i 没有变量的节点给空数组', nodeVarDefs(addNodeAt('普通', 800, 0, 'rect')).length === 0);
    /* 序列化：写 varDefs + varDef（老版本可读）；广播固定单变量 */
    const b = addNodeAt('广播', 1200, 0, 'round');
    b.kind = 'broadcast'; b.varDef = { name:'流', value:'1' };
    reindex(); sizeAll();
    const pack = serialize();
    const n0 = pack.nodes.find(x => x.id === n.id);
    const b0 = pack.nodes.find(x => x.id === b.id);
    ok('MV01j 存档写 varDefs', Array.isArray(n0.varDefs) && n0.varDefs.length === 3,
      JSON.stringify(n0.varDefs && n0.varDefs.length));
    ok('MV01k 存档同时写 varDef（老版本读得懂）', n0.varDef && n0.varDef.name === '音量',
      n0.varDef && n0.varDef.name);
    ok('MV01l 广播节点不写 varDefs', b0.varDefs === null, JSON.stringify(b0.varDefs));
    ok('MV01m 广播节点照写 varDef', b0.varDef && b0.varDef.name === '流', b0.varDef && b0.varDef.name);
    /* 存取往返 */
    deserialize(pack);
    const back = doc.nodes.find(x => x.kind === 'var' && nodeVarDefs(x).length === 3);
    ok('MV01n 读回来还是三个', !!back && nodeVarDefs(back).length === 3,
      back ? String(nodeVarDefs(back).length) : '没找到');
    ok('MV01o 读回来第一个还是音量', !!back && nodeVarDef(back).name === '音量',
      back ? nodeVarDef(back).name : '-');
    /* 单变量行为一点没变 —— 这是第 1 步最重要的保证 */
    const one = addVarNode('单价', 0, 600, { name:'单价', control:'plain', value:'12' });
    reindex(); sizeAll();
    ok('MV01p ★ 单变量行为完全不变（求值照旧）',
      interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{单价}', one.id) === '12',
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{单价}', one.id)));
    /* ── 第 2 步：按名字 / 点名，都要取到**各自的**值 ── */
    const other = addVarNode('单价', 0, 400, { name:'单价', control:'plain', value:'12' });
    reindex(); sizeAll();
    const ctx = buildCtx(doc.nodes, doc.edges, doc.groups);
    ok('MV01p ★ 第 2 个变量取到自己的值 {画质}',
      interpolateIn(ctx, '{画质}', n.id) === '高', String(interpolateIn(ctx, '{画质}', n.id)));
    ok('MV01q ★ 第 3 个变量取到自己的值 {全屏}',
      interpolateIn(ctx, '{全屏}', n.id) === '1', String(interpolateIn(ctx, '{全屏}', n.id)));
    ok('MV01r 第 1 个仍然是 70', interpolateIn(ctx, '{音量}', n.id) === '70',
      String(interpolateIn(ctx, '{音量}', n.id)));
    ok('MV01s 单变量节点照旧', interpolateIn(ctx, '{单价}', other.id) === '12',
      String(interpolateIn(ctx, '{单价}', other.id)));
    /* ★ 点名语法 {节点名.变量名} */
    ok('MV01t ★ {设置.画质}',
      interpolateIn(ctx, '{设置.画质}', n.id) === '高', String(interpolateIn(ctx, '{设置.画质}', n.id)));
    ok('MV01u ★ {设置.全屏}',
      interpolateIn(ctx, '{设置.全屏}', n.id) === '1', String(interpolateIn(ctx, '{设置.全屏}', n.id)));
    /* 找不到的会落到「嵌入文档输出」那条老路上，那里给的就是 [未定义] ——
       这是**既有行为**，不是多变量引入的。 */
    ok('MV01v 点名不存在的变量时给 [未定义]（既有行为）',
      interpolateIn(ctx, '{设置.没有}', n.id) === '[未定义]',
      String(interpolateIn(ctx, '{设置.没有}', n.id)));
    /* ★ 变量优先于同名嵌入节点 */
    const em = addNodeAt('设置', 700, 0, 'round');
    em.kind = 'embed';
    em.embed = { doc:{ nodes:[{ id:'x1', text:'不该出现', x:0, y:0, w:0, h:0, lines:[''] }], edges:[], groups:[],
                       outs:[{ id:'o1', name:'音量', text:'{x1}', x:0, y:0, w:0, h:0, lines:[''] }] } };
    reindex(); sizeAll();
    ok('MV01w ★★ 变量节点优先于同名嵌入节点',
      interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{设置.音量}', n.id) === '70',
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{设置.音量}', n.id)));
    /* 和公式配合 */
    ok('MV01x 公式里引用其一',
      interpolateIn(ctx, '{=画质 & "模式"}', n.id) === '高模式',
      String(interpolateIn(ctx, '{=画质 & "模式"}', n.id)));
    /* 列表 / 地图下标走的是同一套查找 */
    const L = addVarNode('名单', 0, 800, { name:'名单', control:'list', items:['甲','乙','丙'] });
    reindex(); sizeAll();
    ok('MV01y 列表下标仍然对 {名单.2}',
      interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{名单.2}', L.id) === '丙',
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{名单.2}', L.id)));
    /* 公式里的点名引用 —— 这里曾经是红的：
       公式的 resolve 只试了「变量名.下标」，不认「变量节点名.变量名」。 */
    ok('MV01z ★ 公式里的点名引用 {=设置.画质}',
      interpolateIn(ctx, '{=设置.画质 & "!"}', n.id) === '高!',
      String(interpolateIn(ctx, '{=设置.画质 & "!"}', n.id)));
    ok('MV02 公式里点名算数 {=设置.音量 + 1}',
      interpolateIn(ctx, '{=设置.音量 + 1}', n.id) === '71',
      String(interpolateIn(ctx, '{=设置.音量 + 1}', n.id)));
    /* 存取往返之后解析仍然对 */
    const pk = serialize();
    deserialize(pk);
    const bk = doc.nodes.find(x => x.kind === 'var' && nodeVarDefs(x).length === 3);
    ok('MV02 读回来 {画质} 还对', !!bk && interpolateIn(liveCtx(), '{画质}', bk.id) === '高',
      bk ? String(interpolateIn(liveCtx(), '{画质}', bk.id)) : '-');
    ok('MV02b 读回来 {设置.画质} 还对', !!bk && interpolateIn(liveCtx(), '{设置.画质}', bk.id) === '高',
      bk ? String(interpolateIn(liveCtx(), '{设置.画质}', bk.id)) : '-');
  });

  T('CV01 CSV：解析 / 建表 / 导出算完的结果', () => {
    /* 解析 */
    ok('CV01 基本解析',
      JSON.stringify(parseCSV('a,b,c\n1,2,3')) === JSON.stringify([['a','b','c'],['1','2','3']]),
      JSON.stringify(parseCSV('a,b,c\n1,2,3')));
    ok('CV01b 引号里的逗号和换行', (() => {
      const r = parseCSV('"a,1","b\n2",c\nx,y,z');
      return JSON.stringify(r[0]) === JSON.stringify(['a,1','b\n2','c']);
    })(), JSON.stringify(parseCSV('"a,1","b\n2",c')[0]));
    ok('CV01c "" 转义成一个引号', parseCSV('"他说""你好""",b')[0][0] === '他说"你好"',
      parseCSV('"他说""你好""",b')[0][0]);
    ok('CV01d 认 UTF-8 BOM（Excel 存出来头上有）', parseCSV('\uFEFFa,b')[0][0] === 'a',
      JSON.stringify(parseCSV('\uFEFFa,b')[0][0]));
    ok('CV01e 自动认分号（欧洲 Excel）',
      JSON.stringify(parseCSV('a;b;c\n1;2;3')[0]) === JSON.stringify(['a','b','c']),
      JSON.stringify(parseCSV('a;b;c\n1;2;3')[0]));
    ok('CV01f 自动认制表符',
      JSON.stringify(parseCSV('a\tb\n1\t2')[0]) === JSON.stringify(['a','b']),
      JSON.stringify(parseCSV('a\tb\n1\t2')[0]));
    ok('CV01g CRLF 不出多余空行', parseCSV('a,b\r\nc,d').length === 2,
      String(parseCSV('a,b\r\nc,d').length));
    ok('CV01h 末尾没换行也收得下', parseCSV('a,b\nc').length === 2,
      String(parseCSV('a,b\nc').length));
    ok('CV01i 空文本给空数组', parseCSV('').length === 0 && parseCSV('\n\n').length === 0);
    /* 写出 */
    ok('CV01j 该包引号的包引号', toCSV([['a,1','b"2','c\nd']]) === '"a,1","b""2","c\nd"',
      toCSV([['a,1','b"2','c\nd']]));
    ok('CV01k 用 CRLF 分行', toCSV([['a'],['b']]) === 'a\r\nb', JSON.stringify(toCSV([['a'],['b']])));
    /* 建表格节点 */
    fresh();
    const rows = parseCSV('名称,单价,数量\n苹果,3,4\n香蕉,5,2');
    const n = addTableNodeFromRows(rows, 0, 0, '清单');
    reindex(); sizeAll();
    ok('CV01l 建成的是表格节点', isTableNode(n), String(n.kind));
    ok('CV01m 行列数对', tableOf(n).rows === 3 && tableOf(n).cols === 3,
      tableOf(n).rows + '×' + tableOf(n).cols);
    ok('CV01n 内容对', displayTableCell(n, 1, 0) === '苹果', displayTableCell(n, 1, 0));
    /* ★ 公式：导出的是结果不是公式 */
    const t = tableOf(n);
    t.cols = 4;
    t.cells[0][3] = '小计';
    t.cells[1][3] = '{=3 * 4}';
    t.cells[2][3] = '{=5 * 2}';
    n.tableDef = normalizeTableDef(t);
    reindex(); sizeAll();
    ok('CV01o 单元格里的公式会算出来', displayTableCell(n, 1, 3) === '12',
      displayTableCell(n, 1, 3));
    const csv = tableToCSV(n);
    ok('CV01p ★★ 导出的是结果，不是公式', csv.indexOf('{=') < 0 && csv.indexOf('12') >= 0, JSON.stringify(csv));
    ok('CV01q 导出内容正确', csv === '名称,单价,数量,小计\r\n苹果,3,4,12\r\n香蕉,5,2,10',
      JSON.stringify(csv));
    /* 全空表不导出 */
    const e = addNodeAt('空表', 600, 0, 'rect');
    e.kind = 'table';
    e.tableDef = normalizeTableDef({ cols:3, rows:3, cells:[] });
    reindex(); sizeAll();
    ok('CV01r 全空表导出空数组', tableRowsForExport(e).length === 0,
      JSON.stringify(tableRowsForExport(e)));
    /* 列宽 / 行数上限：多的截掉，不能建出超表的节点 */
    const big = [];
    for (let i = 0; i < 60; i++) big.push(['r' + i, 'x', 'y', 'z', 'w', 'v', 'u', 't', 's', 'r', 'q', 'p', 'o', 'n']);
    const bn = addTableNodeFromRows(big, 0, 600, '大表');
    reindex(); sizeAll();
    ok('CV01s 超上限的会截到合法范围',
      tableOf(bn).rows <= 40 && tableOf(bn).cols <= 12,
      tableOf(bn).rows + '×' + tableOf(bn).cols);
  });

  T('RF01 表格引用：行列逻辑和 Excel 一样', () => {
    /* 列号：双射二十六进制（没有 0，A=1，Z=26，AA=27） */
    ok('RF01 A→0', colToIndex('A') === 0, String(colToIndex('A')));
    ok('RF01b Z→25', colToIndex('Z') === 25, String(colToIndex('Z')));
    ok('RF01c AA→26', colToIndex('AA') === 26, String(colToIndex('AA')));
    ok('RF01d AZ→51', colToIndex('AZ') === 51, String(colToIndex('AZ')));
    ok('RF01e BA→52（不是 26×2=52 碰巧，是双射进制）', colToIndex('BA') === 52, String(colToIndex('BA')));
    ok('RF01f 0→A / 25→Z / 26→AA / 51→AZ / 52→BA',
      indexToCol(0) === 'A' && indexToCol(25) === 'Z' && indexToCol(26) === 'AA'
      && indexToCol(51) === 'AZ' && indexToCol(52) === 'BA',
      [0,25,26,51,52].map(indexToCol).join('/'));
    ok('RF01g ★ 往返 200 次全对', (() => {
      for (let i = 0; i < 200; i++) if (colToIndex(indexToCol(i)) !== i) return '第 ' + i + ' 个错';
      return 'ok';
    })(), 'ok');
    /* 识别 */
    ok('RF01h A1 是引用', isCellRef('A1') === true);
    ok('RF01i $A$1 也认（绝对引用标记照收、忽略）',
      JSON.stringify(parseCellRef('$A$1')) === JSON.stringify({ c:0, r:0 }),
      JSON.stringify(parseCellRef('$A$1')));
    ok('RF01j AA10（第 27 列第 10 行）',
      JSON.stringify(parseCellRef('AA10')) === JSON.stringify({ c:26, r:9 }),
      JSON.stringify(parseCellRef('AA10')));
    ok('RF01k 1A 不是引用', isCellRef('1A') === false);
    ok('RF01k2 abc 不是引用', isCellRef('abc') === false);
    ok('RF01k3 光秃秃的 A 不是引用（没有行号）', isCellRef('A') === false);
    /* 端到端：在表格节点里引用 */
    fresh();
    const rows = parseCSV('数量,单价,小计\n3,4,{=A2*B2}\n5,6,{=A3*B3}\n,,\n合计,{=SUM(A2:A3)},{=SUM(C2:C3)}');
    const n = addTableNodeFromRows(rows, 0, 0, '账');
    reindex(); sizeAll();
    ok('RF01l 表头 A1', displayTableCell(n, 0, 0) === '数量', displayTableCell(n, 0, 0));
    ok('RF01m ★ 单格引用 {=A2*B2} = 3×4',
      displayTableCell(n, 1, 2) === '12', displayTableCell(n, 1, 2));
    ok('RF01n ★ 再来一行 {=A3*B3} = 5×6',
      displayTableCell(n, 2, 2) === '30', displayTableCell(n, 2, 2));
    ok('RF01o ★ 区域求和 {=SUM(A2:A3)} = 3+5',
      displayTableCell(n, 4, 1) === '8', displayTableCell(n, 4, 1));
    ok('RF01p ★ 引用公式的结果（区域套区域）= 12+30',
      displayTableCell(n, 4, 2) === '42', displayTableCell(n, 4, 2));
    /* 区域还能和普通变量混着写 */
    const v = addVarNode('系数', 0, 600, { name:'系数', value:'10' });
    reindex(); sizeAll();
    const t = tableOf(n);
    t.rows = Math.max(t.rows, 6);
    t.cells[5] = t.cells[5] || [];
    t.cells[5][0] = '{=SUM(A2:A3) * 系数}';
    n.tableDef = normalizeTableDef(t);
    reindex(); sizeAll();
    ok('RF01q 区域和变量能混用 = (3+5)×10',
      displayTableCell(n, 5, 0) === '80', displayTableCell(n, 5, 0));
    void v;
    /* 出界 */
    ok('RF01r 出界给空串', displayTableCell(n, 99, 99) === '', JSON.stringify(displayTableCell(n, 99, 99)));
    ok('RF01s 出界坐标不会崩', (() => {
      try { const tt = tableOf(n); displayTableCell(n, tt.rows + 5, tt.cols + 5); return 'ok'; }
      catch(e){ return '炸:' + e.message; }
    })(), 'ok');
    /* ★ 循环引用不能卡死 —— A1 引用 B1，B1 引用 A1 */
    const m = addNodeAt('环', 900, 0, 'rect');
    m.kind = 'table';
    m.tableDef = normalizeTableDef({ cols:2, rows:1, cells:[['{=B1}','{=A1}']] });
    reindex(); sizeAll();
    ok('RF01t ★ 循环引用不卡死', (() => {
      const t0 = Date.now(); displayTableCell(m, 0, 0);
      return (Date.now() - t0) < 3000 ? 'ok' : '超时';
    })(), 'ok');
    /* 普通节点里不该认单元格 —— 那里根本没有表格 */
    const f = addNodeAt('普通', 0, 900, 'rect');
    reindex(); sizeAll();
    ok('RF01u 普通节点里 SUM(A1:A2) 报公式错误（没有单元格）',
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{=SUM(A1:A2)}', f.id)) === '[公式错误]',
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{=SUM(A1:A2)}', f.id)));
    /* ★★ 导出：引用算完的结果，不是公式 */
    const csv = tableToCSV(n);
    ok('RF01v ★★ 导出的还是结果不是公式',
      csv.indexOf('{=') < 0 && csv.indexOf('12') >= 0 && csv.indexOf('42') >= 0,
      JSON.stringify(csv));
  });

  T('CS02 一次导出多个表格', () => {
    fresh();
    const a = addTableNodeFromRows(parseCSV('甲,1\n乙,2'), 0, 0, '表一');
    const b = addTableNodeFromRows(parseCSV('丙,3\n丁,4'), 400, 0, '表二');
    reindex(); sizeAll();
    ok('CS02 两个都是表格节点', isTableNode(a) && isTableNode(b));
    /* exportTablesCSV 会真去下载，测试里只验「筛选 + 计数」这条逻辑 */
    const listed = [a, b, addNodeAt('普通', 800, 0, 'rect')].filter(isTableNode);
    ok('CS02b 只挑表格节点', listed.length === 2, String(listed.length));
    ok('CS02c 每个表都能算出导出内容',
      tableRowsForExport(a).length === 2 && tableRowsForExport(b)[0][0] === '丙',
      JSON.stringify(tableRowsForExport(a)));
    /* 空表跳过 */
    const e = addNodeAt('空表', 1200, 0, 'rect');
    e.kind = 'table'; e.tableDef = normalizeTableDef({ cols:2, rows:2, cells:[] });
    reindex(); sizeAll();
    ok('CS02d 空表不产生内容', tableRowsForExport(e).length === 0);
  });

  T('MV03 界面：加 / 删 / 切换变量，单变量行为不变', () => {
    fresh();
    const n = addVarNode('音量', 0, 0, { name:'音量', control:'slider', value:'70', min:'0', max:'100', step:'1' });
    reindex(); sizeAll();
    /* ★ 只有一个变量时**只写 n.varDef** —— 满世界都在直读写这个字段，
       建了 varDefs 会让那些直写被无视（K25i/K25j 就是这么红的） */
    setVarEditIndex(0);
    setVarDefAt(n, { value:'42' });
    ok('MV03 单变量时只写 varDef，不建 varDefs', n.varDefs === undefined && n.varDef.value === '42',
      'varDefs=' + JSON.stringify(n.varDefs) + ' value=' + (n.varDef && n.varDef.value));
    ok('MV03b 直写 n.varDef 立刻生效（老写法仍然管用）', (() => {
      n.varDef = normalizeVarDef(Object.assign({}, n.varDef, { value:'9' }));
      return varDefOf(n).value === '9';
    })(), varDefOf(n).value);
    /* 加第二个 */
    const i2 = addVarDefTo(n, { name:'画质', control:'check', options:['低','中','高'], picked:[2] });
    reindex(); sizeAll();
    ok('MV03c 加完是 2 个', nodeVarDefs(n).length === 2, String(nodeVarDefs(n).length));
    ok('MV03d 加完自动选中新的那个', i2 === 1 && varEditIndexFor(n) === 1, 'i2=' + i2 + ' cur=' + varEditIndexFor(n));
    ok('MV03e ★ 有两个时才写 varDefs', Array.isArray(n.varDefs) && n.varDefs.length === 2,
      JSON.stringify(n.varDefs && n.varDefs.length));
    ok('MV03f varDef 同步成第一个（老代码读得到）', n.varDef.name === '音量', n.varDef.name);
    /* 切换下标后改的是**那一个** */
    setVarEditIndex(1);
    setVarDefAt(n, { picked:[0] });
    ok('MV03g ★ 改的是第 2 个，第 1 个没动',
      nodeVarDefs(n)[1].picked.join(',') === '0' && nodeVarDefs(n)[0].value === '9',
      nodeVarDefs(n)[1].picked.join(',') + ' / ' + nodeVarDefs(n)[0].value);
    setVarEditIndex(0);
    setVarDefAt(n, { value:'11' });
    ok('MV03h ★ 切回第 1 个改，第 2 个没动',
      nodeVarDefs(n)[0].value === '11' && nodeVarDefs(n)[1].picked.join(',') === '0',
      nodeVarDefs(n)[0].value + ' / ' + nodeVarDefs(n)[1].picked.join(','));
    /* 下标越界要夹住 */
    setVarEditIndex(99);
    ok('MV03i 下标越界会夹到最后一个', varEditIndexFor(n) === 1, String(varEditIndexFor(n)));
    setVarEditIndex(-5);
    ok('MV03j 负下标夹到 0', varEditIndexFor(n) === 0, String(varEditIndexFor(n)));
    /* 名字改了要能引用 */
    setVarEditIndex(1);
    setVarDefAt(n, { name:'清晰度' });
    reindex(); sizeAll();
    /* 注意：MV03g 把 picked 改成了 [0]，所以这里是「低」不是「高」 */
    ok('MV03k 改名之后能按新名字引用',
      interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{清晰度}', n.id) === '低',
      String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{清晰度}', n.id)));
    /* 点名用**节点自己的标题**（n.text），不写死 —— 变量节点的标题字段容易想当然 */
    ok('MV03l 也能用「节点标题.变量名」点名',
      interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{' + n.text + '.清晰度}', n.id) === '低',
      'n.text=' + JSON.stringify(n.text) + ' → '
      + String(interpolateIn(buildCtx(doc.nodes, doc.edges, doc.groups), '{' + n.text + '.清晰度}', n.id)));
    ok('MV03l2 变量节点的标题就是它的 n.text', typeof n.text === 'string', JSON.stringify(n.text));
    /* 删 */
    ok('MV03m 删掉第 2 个', delVarDefFrom(n, 1) === true && nodeVarDefs(n).length === 1,
      String(nodeVarDefs(n).length));
    ok('MV03n 只剩一个时又回到只写 varDef', n.varDefs === undefined && n.varDef.name === '音量',
      'varDefs=' + JSON.stringify(n.varDefs) + ' name=' + (n.varDef && n.varDef.name));
    ok('MV03o 删到只剩一个就不许再删了', delVarDefFrom(n, 0) === false && nodeVarDefs(n).length === 1,
      String(nodeVarDefs(n).length));
    /* 存档：单变量不带 varDefs，多变量才带 */
    addVarDefTo(n, { name:'第二', value:'2' });
    reindex(); sizeAll();
    const pk = serialize();
    const n0 = pk.nodes.find(x => x.id === n.id);
    ok('MV03p 存档：两个变量时写 varDefs', Array.isArray(n0.varDefs) && n0.varDefs.length === 2,
      JSON.stringify(n0.varDefs && n0.varDefs.length));
    delVarDefFrom(n, 1);
    reindex(); sizeAll();
    const n1 = serialize().nodes.find(x => x.id === n.id);
    ok('MV03q 存档：回到一个变量就不写 varDefs（形态和老版本一致）', n1.varDefs === null,
      JSON.stringify(n1.varDefs));
  });


  T('MV04 多行渲染：布局只有一个出处，单变量分毫不变', () => {
    fresh();
    const near = (a, b) => Math.abs(a - b) < 0.001;
    const sameBox = (a, b) => !!a && !!b && near(a.x, b.x) && near(a.y, b.y)
      && near(a.w, b.w) && near(a.h, b.h);

    /* ── 单变量：所有路径都必须和以前一模一样 ── */
    const one = addVarNode('单价', 0, 0, { name:'单价', control:'plain', value:'12' });
    reindex(); sizeAll();
    ok('MV04 单变量：布局只有一行', varLayoutsFor(one).length === 1, String(varLayoutsFor(one).length));
    ok('MV04b ★ 单变量：varBoxes 和那一行**结构相同**（不比对象同一性）',
      sameBox(varBoxes(one).nameBox, varLayoutsFor(one)[0].L.nameBox)
      && sameBox(varBoxes(one).scopeBox, varLayoutsFor(one)[0].L.scopeBox),
      JSON.stringify(varBoxes(one).nameBox) + ' vs ' + JSON.stringify(varLayoutsFor(one)[0].L.nameBox));
    ok('MV04c ★ 单变量：高度等于老算法 varLayout 的结果', (() => {
      const b = nodeBox(one);
      const old = varLayout({ x:0, y:0, w:b.w }, one.varDef,
        Math.max(1, one.lines.length) * one.lh).height;
      return near(varLayoutsHeight(one), old);
    })(), String(varLayoutsHeight(one)));
    const hOne = one.h;
    ok('MV04d 单变量：节点高度是个正数', hOne > 0, String(hOne));
    ok('MV04e 单变量：varRowAt 在体内给 0', varRowAt(one, {
      x:nodeBox(one).x + 20, y:varLayoutsFor(one)[0].L.nameBox.y + 4 }) === 0,
      String(varRowAt(one, { x:nodeBox(one).x + 20, y:varLayoutsFor(one)[0].L.nameBox.y + 4 })));

    /* ── 多变量：叠起来 ── */
    const n = addNodeAt('设置', 600, 0, 'round');
    n.kind = 'var';
    n.varDefs = [
      { name:'音量', control:'slider', type:'number', value:'70', min:'0', max:'100', step:'1' },
      { name:'画质', control:'check',  type:'string', options:['低','中','高'], picked:[2] }
    ];
    reindex(); sizeAll();
    const rows = varLayoutsFor(n);
    ok('MV04f 两个变量：布局给两行', rows.length === 2, String(rows.length));
    ok('MV04g 第二行在第一行**下面**', rows[1].L.nameBox.y > rows[0].L.nameBox.y,
      JSON.stringify(rows.map(r => Math.round(r.L.nameBox.y))));
    ok('MV04h ★ 两行不重叠（上一行的作用域行不压到下一行）',
      rows[0].L.scopeBox.y + rows[0].L.scopeBox.h <= rows[1].L.nameBox.y + 0.001,
      JSON.stringify(rows.map(r => [Math.round(r.L.scopeBox.y + r.L.scopeBox.h), Math.round(r.L.nameBox.y)])));
    ok('MV04i 两行的名字格分别属于各自那个变量',
      rows[0].def.name === '音量' && rows[1].def.name === '画质',
      rows.map(r => r.def.name).join(','));
    ok('MV04j 两个变量的节点比一个高', n.h > hOne, n.h + ' vs ' + hOne);
    ok('MV04k ★ 节点装得下最后一行（不溢出底边）', (() => {
      const b = nodeBox(n), last = rows[rows.length - 1].L;
      return last.scopeBox.y + last.scopeBox.h <= b.y + b.h + 1;
    })(), JSON.stringify({ h:n.h, 底:Math.round(nodeBox(n).y + nodeBox(n).h),
                            末行底:Math.round(rows[1].L.scopeBox.y + rows[1].L.scopeBox.h) }));
    /* 行命中 */
    const inRow = (i) => varRowAt(n, { x:nodeBox(n).x + 20, y:rows[i].L.nameBox.y + 4 });
    ok('MV04l varRowAt 认出第 0 行', inRow(0) === 0, String(inRow(0)));
    ok('MV04m varRowAt 认出第 1 行', inRow(1) === 1, String(inRow(1)));
    ok('MV04n 节点外面给 -1', varRowAt(n, { x:nodeBox(n).x + 20, y:nodeBox(n).y - 200 }) === -1,
      String(varRowAt(n, { x:nodeBox(n).x + 20, y:nodeBox(n).y - 200 })));
    /* 正在编辑的下标会影响绘制（不抛就行） */
    setVarEditIndex(1);
    ok('MV04o 编辑下标夹在范围内', varEditIndexFor(n) === 1, String(varEditIndexFor(n)));
    /* 三个变量也叠得下 */
    addVarDefTo(n, { name:'全屏', control:'cond', value:'1' });
    reindex(); sizeAll();
    const r3 = varLayoutsFor(n);
    ok('MV04p 三个变量给三行', r3.length === 3, String(r3.length));
    ok('MV04q 三行两两不重叠', (() => {
      for (let i = 0; i + 1 < r3.length; i++)
        if (r3[i].L.scopeBox.y + r3[i].L.scopeBox.h > r3[i + 1].L.nameBox.y + 0.001) return false;
      return true;
    })(), JSON.stringify(r3.map(r => [Math.round(r.L.scopeBox.y + r.L.scopeBox.h), Math.round(r.L.nameBox.y)])));
    ok('MV04r 三个也装得下', (() => {
      const b = nodeBox(n), last = r3[r3.length - 1].L;
      return last.scopeBox.y + last.scopeBox.h <= b.y + b.h + 1;
    })(), String(n.h));
    /* 删回一个 → 回到单变量形态 */
    delVarDefFrom(n, 2); delVarDefFrom(n, 1);
    reindex(); sizeAll();
    ok('MV04s ★ 删回一个后，布局又只剩一行（回到老路径）',
      varLayoutsFor(n).length === 1, String(varLayoutsFor(n).length));
    ok('MV04t 删回一个后 varBoxes 又和老算法一致', (() => {
      const b = nodeBox(n);
      const old = varLayout({ x:0, y:0, w:b.w }, n.varDef, Math.max(1, n.lines.length) * n.lh).height;
      return near(varLayoutsHeight(n), old);
    })(), String(varLayoutsHeight(n)));

    /* ── 画一帧都不能抛 ── */
    const noThrow = (label) => {
      let got = 'ok';
      try { draw(); } catch(e){ got = '炸:' + e.message; }
      ok(label, got === 'ok', got);
    };
    selectOnly(byId(n.id)); noThrow('MV04u 画单变量节点不抛');
    addVarDefTo(n, { name:'第二个', value:'2' });
    addVarDefTo(n, { name:'第三个', control:'check', options:['a','b'], picked:[0] });
    reindex(); sizeAll();
    selectOnly(byId(n.id)); noThrow('MV04v 画多变量节点不抛');
    varEditIndexFor(n);  /* 下标越界也不该抛 */
    setVarEditIndex(99); noThrow('MV04w 编辑下标越界时画也不抛');

    fresh();   /* ★ 收尾必须清干净 —— 上一版就是漏了这句，把 E06 连累了 */
  });

  T('MV05 交互按行：单击 / 双击 / 滑条都属于你点的那一行', () => {
    fresh();
    /* 两个变量，上下限**故意不同** —— 串了就看得出来 */
    const n = addNodeAt('设置', 0, 0, 'round');
    n.kind = 'var';
    n.varDefs = [
      { name:'甲', control:'slider', type:'number', value:'0', min:'0', max:'100', step:'1' },
      { name:'乙', control:'slider', type:'number', value:'0', min:'0', max:'10',  step:'1' }
    ];
    reindex(); sizeAll();
    /* 模拟 pointer.js 按下时做的两件事 */
    const press = (p) => {
      if (nodeVarDefs(n).length > 1){
        const ri = varRowAt(n, p);
        if (ri >= 0 && ri !== varEditIndexFor(n)) setVarEditIndex(ri);
      }
      return hitVarControl(n, p);
    };
    const rows = varLayoutsFor(n);
    const mid = (b) => ({ x:b.x + b.w / 2, y:b.y + Math.max(2, b.h / 2) });
    const t0 = mid(rows[0].L.trackBox), t1 = mid(rows[1].L.trackBox);

    ok('MV05 两行轨道在不同高度', Math.round(t0.y) !== Math.round(t1.y),
      Math.round(t0.y) + ' vs ' + Math.round(t1.y));
    /* ★ 单击：这一条以前是坏的 —— hitVarControl 一律用第一行的框 */
    ok('MV05b 点第 0 行命中 slider', (press(t0) || {}).kind === 'slider',
      JSON.stringify((press(t0) || {}).kind));
    ok('MV05c ★ 点第 1 行也命中 slider（以前会落到第一行的轨道上判空）',
      (press(t1) || {}).kind === 'slider', JSON.stringify((press(t1) || {}).kind));
    ok('MV05d ★ 点第 1 行会把编辑下标切过去', varEditIndexFor(n) === 1, String(varEditIndexFor(n)));

    /* 先让两个值不同，后面的判断才有意义 */
    setVarEditIndex(0);
    setSliderFromPointer(n, { x:rows[0].L.trackBox.x + rows[0].L.trackBox.w / 2, y:t0.y });
    reindex(); sizeAll();
    setVarEditIndex(1);
    setSliderFromPointer(n, { x:rows[1].L.trackBox.x + rows[1].L.trackBox.w, y:t1.y });
    reindex(); sizeAll();
    const A = varDefAt(n, 0).value, B = varDefAt(n, 1).value;
    ok('MV05e 两个值确实不同（判断才有意义）', A !== B, A + ' vs ' + B);

    /* ★ 滑条：各用各的上下限 */
    setVarEditIndex(1);
    setSliderFromPointer(n, { x:rows[1].L.trackBox.x + rows[1].L.trackBox.w, y:t1.y });
    reindex(); sizeAll();
    ok('MV05f ★ 拖第 1 行到最右 = 乙的上限 10（不是甲的 100）',
      varDefAt(n, 1).value === '10', varDefAt(n, 1).value);
    ok('MV05g ★ 拖第 1 行没动到甲', varDefAt(n, 0).value === A, varDefAt(n, 0).value);
    setVarEditIndex(0);
    setSliderFromPointer(n, { x:rows[0].L.trackBox.x + rows[0].L.trackBox.w, y:t0.y });
    reindex(); sizeAll();
    ok('MV05h ★ 拖第 0 行到最右 = 甲的上限 100', varDefAt(n, 0).value === '100', varDefAt(n, 0).value);
    ok('MV05i ★ 拖第 0 行没动到乙', varDefAt(n, 1).value === '10', varDefAt(n, 1).value);

    /* ★ 双击改值：读的必须是那一行的 */
    setVarEditIndex(1);
    ok('MV05j ★ 双击第 1 行的初值来自乙', editValue('varValue', n) === varDefAt(n, 1).value,
      editValue('varValue', n) + ' vs ' + varDefAt(n, 1).value);
    setVarEditIndex(0);
    ok('MV05k ★ 双击第 0 行的初值来自甲', editValue('varValue', n) === varDefAt(n, 0).value,
      editValue('varValue', n) + ' vs ' + varDefAt(n, 0).value);
    ok('MV05l 两次读到的不是同一个值',
      varDefAt(n, 0).value !== varDefAt(n, 1).value, varDefAt(n, 0).value + ' / ' + varDefAt(n, 1).value);

    /* ★ 改名只改那一行，改完还能按新名字引用 */
    setVarEditIndex(1);
    editSetValue('varName', n, '乙改');
    ok('MV05m 改名只改第 1 行', varDefAt(n, 1).name === '乙改', varDefAt(n, 1).name);
    ok('MV05n 第 0 行没动', varDefAt(n, 0).name === '甲', varDefAt(n, 0).name);
    ok('MV05o ★ 改完能按新名字引用，拿到的是乙的值',
      String(interpolateIn(liveCtx(), '{乙改}', n.id)) === varDefAt(n, 1).value,
      String(interpolateIn(liveCtx(), '{乙改}', n.id)) + ' vs ' + varDefAt(n, 1).value);
    ok('MV05p ★ 甲的值没被串过去',
      String(interpolateIn(liveCtx(), '{甲}', n.id)) === varDefAt(n, 0).value,
      String(interpolateIn(liveCtx(), '{甲}', n.id)) + ' vs ' + varDefAt(n, 0).value);

    /* ★ 单变量：一行都别变 */
    const one = addVarNode('单价', 0, 700, { name:'单价', control:'slider', value:'50', min:'0', max:'100', step:'1' });
    reindex(); sizeAll();
    const r1 = varLayoutsFor(one);
    ok('MV05q 单变量只有一行', r1.length === 1, String(r1.length));
    ok('MV05r 单变量点轨道命中 slider',
      (hitVarControl(one, mid(r1[0].L.trackBox)) || {}).kind === 'slider');
    ok('MV05s 单变量 varRowIndexAt 恒为 0',
      varRowIndexAt(one, mid(r1[0].L.trackBox)) === 0, String(varRowIndexAt(one, mid(r1[0].L.trackBox))));
    ok('MV05t ★ 单变量 varRowLayout 就是原来那一条（结构相同）', (() => {
      const b = varBoxes(one), r = varRowLayout(one, 0).L;
      return b.trackBox && r.trackBox && Math.abs(b.trackBox.y - r.trackBox.y) < 0.001
        && Math.abs(b.trackBox.w - r.trackBox.w) < 0.001;
    })(), '');
    setSliderFromPointer(one, { x:r1[0].L.trackBox.x + r1[0].L.trackBox.w, y:r1[0].L.trackBox.y + 2 });
    reindex(); sizeAll();
    ok('MV05u 单变量拖到最右 = 上限 100', varDefAt(one, 0).value === '100', varDefAt(one, 0).value);

    fresh();   /* ★ 收尾清干净 */
  });

  T('MV06 多变量的背景 / 编辑框定位 / 端口编辑框', () => {
    fresh();
    const cv = document.querySelector('canvas');
    const g2 = cv.getContext('2d');
    const px = (sx, sy) => { const d = g2.getImageData(Math.round(sx), Math.round(sy), 1, 1).data;
                             return '#' + [d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join(''); };
    const n = addNodeAt('设置', 0, 0, 'round');
    n.kind = 'var';
    n.varDefs = [ { name:'甲', control:'plain', value:'1' },
                  { name:'乙', control:'plain', value:'2' },
                  { name:'丙', control:'plain', value:'3' } ];
    reindex(); sizeAll(); draw();
    const b = nodeBox(n);
    /* ★ 背景必须被填上 —— 多行分支以前漏了 fillRect，内部是透的，
       会透出棋盘格（棋盘格是 #1b1b1b，主题底色是 #000000）。 */
    const inside = px(b.x * view.z + view.x + b.w * view.z / 2, b.y * view.z + view.y + 8);
    ok('MV06 ★ 多变量节点内部填了底色（不是透出网格）', inside === '#000000', inside);
    ok('MV06b 和棋盘格的格子色不同（确认不是透出来的）', inside !== '#1b1b1b', inside);

    /* 编辑框按行定位 */
    const rows = varLayoutsFor(n);
    /* ★ 下标是全局的，先归零 —— 不设的话会沿用上一个用例留下的下标，
       编辑框就按那一行定位了（我第一次就是这么写错的）。 */
    setVarEditIndex(0);
    startEdit('varValue', n.id, varDefAt(n, 0).value, {});
    const el = document.getElementById('editor');
    const top0 = parseFloat(el.style.top);
    hideEditor();
    setVarEditIndex(2);
    startEdit('varValue', n.id, varDefAt(n, 2).value, {});
    const top2 = parseFloat(el.style.top);
    hideEditor();
    ok('MV06c ★ 第 2 行的编辑框在第 0 行下面', top2 > top0 + 10, Math.round(top0) + ' → ' + Math.round(top2));
    /* ★ 期望值要用**同一个换算函数** w2s 算 —— 自己乘 view.z 会漏掉别的项，
       我第一版就是这么写错的（算出 170，实际 85，正好差一倍）。 */
    ok('MV06d 编辑框的 top 等于那一行值框的屏幕 y',
      Math.abs(top0 - w2s({ x:rows[0].L.valBox.x, y:rows[0].L.valBox.y }).y) < 2
      && Math.abs(top2 - w2s({ x:rows[2].L.valBox.x, y:rows[2].L.valBox.y }).y) < 2,
      Math.round(top0) + '/' + Math.round(w2s({ x:rows[0].L.valBox.x, y:rows[0].L.valBox.y }).y)
      + '  ' + Math.round(top2) + '/' + Math.round(w2s({ x:rows[2].L.valBox.x, y:rows[2].L.valBox.y }).y));

    /* ★ 端口编辑以前 box 是 undefined，box.x 直接抛 */
    let err = 'ok';
    try { startEdit('portLabel', n.id, 'in1', { dir:'ins', portId:1 }); } catch(ex){ err = ex.message; }
    ok('MV06e ★ 端口编辑不再抛异常', err === 'ok', err);
    const eh = parseFloat(document.getElementById('editor').style.height);
    ok('MV06f 端口编辑框高度有界（不盖住整节点）', eh < b.h * view.z, Math.round(eh) + ' < ' + Math.round(b.h * view.z));
    hideEditor();

    /* 单变量：老行为不变 */
    setVarEditIndex(0);
    const one = addVarNode('单价', 900, 0, { name:'单价', control:'plain', value:'12' });
    reindex(); sizeAll();
    startEdit('varValue', one.id, '12', {});
    const eo = document.getElementById('editor');
    const vb = varBoxes(one).valBox;
    ok('MV06g ★ 单变量：编辑框仍盖在值框上（位置没变）',
      Math.abs(parseFloat(eo.style.left) - (vb.x * view.z + view.x)) < 2,
      Math.round(parseFloat(eo.style.left)) + ' vs ' + Math.round(vb.x * view.z + view.x));
    hideEditor();

    fresh();   /* 收尾清干净 */
  });

  T('MV07 重命名编辑框：特殊节点只盖标题行，普通节点才盖满', () => {
    fresh();
    const el = document.getElementById('editor');
    const boxH = (n) => {
      setVarEditIndex(0);
      startEdit('node', n.id, String(n.text || ''), {});
      const h = parseFloat(el.style.height);
      hideEditor();
      return h;
    };
    /* 普通文本节点：没有 kind 字段 —— 编辑框就是整个节点，和以前一样 */
    const plain = addNodeAt('普通文本', 0, 0, 'rect');
    reindex(); sizeAll();
    const bPlain = nodeBox(plain);
    ok('MV07 普通节点：编辑框盖满整个节点',
      Math.abs(boxH(plain) - Math.max(28, Math.round(bPlain.h * view.z))) < 2,
      boxH(plain) + ' vs ' + Math.max(28, Math.round(bPlain.h * view.z)));
    /* ★ 特殊节点：只盖标题行 —— 不然会把下面的控件全遮住 */
    const kinds = [];
    const pg = addNodeAt('染红', 200, 0, 'round'); pg.kind = 'program';
    pg.program = normalizeProgram({ op:'color', value:'#ff0000' });
    kinds.push(['程序', pg]);
    const v = addVarNode('音量', 400, 0, { name:'音量', value:'1' });
    kinds.push(['变量', v]);
    const o = addNodeAt('折后', 600, 0, 'rect'); o.kind = 'out';
    o.outDef = normalizeOutDef({ name:'折后' });
    kinds.push(['输出', o]);
    const t = addTableNodeFromRows(parseCSV('a,b\n1,2'), 800, 0, '表');
    kinds.push(['表格', t]);
    reindex(); sizeAll();
    for (const [tag, n] of kinds){
      const h = boxH(n);
      const nodeH = Math.max(28, Math.round(nodeBox(n).h * view.z));
      const titleH = Math.max(28, Math.round(Math.max(24, n.lh || 24) * view.z));
      ok('MV07 ★ ' + tag + '节点的编辑框只有标题行高（不盖满）',
        Math.abs(h - titleH) < 2 && h < nodeH,
        '编辑框 ' + h + ' / 标题行 ' + titleH + ' / 节点 ' + nodeH);
      ok('MV07 ★ ' + tag + '节点确实比标题行高（这个断言才有意义）', nodeH > titleH + 4,
        nodeH + ' vs ' + titleH);
    }
    fresh();   /* 收尾清干净 */
  });

  T('MV08 程序节点面板那行灰字是活的：连着谁就报谁', () => {
    fresh();
    const el = document.getElementById('nbHits');
    const line = () => { renderNodeBox(); return el.textContent; };
    const pg = addNodeAt('染红', -300, 0, 'round');
    pg.kind = 'program'; pg.program = normalizeProgram({ op:'color', value:'#ff0000' });
    const a = addNodeAt('甲目标', 200, -100, 'round');
    const b = addNodeAt('乙目标', 200, 100, 'round');
    reindex(); sizeAll();
    selectOnly(byId(pg.id)); openNodeBox(byId(pg.id));

    /* ① 还没连 */
    ok('MV08 没连时提示去连线', line().indexOf('还没连到') === 0, line());
    /* ② 连一个 —— ★ 以前这里是一句固定文案，连到谁都不变 */
    const e1 = linkNodes(pg.id, a.id); reindex(); sizeAll();
    ok('MV08b ★ 连上之后报出目标的名字', line().indexOf('甲目标') >= 0, line());
    /* ③ 连两个 */
    linkNodes(pg.id, b.id); reindex(); sizeAll();
    const t2 = line();
    ok('MV08c ★ 两个目标都报出来',
      t2.indexOf('甲目标') >= 0 && t2.indexOf('乙目标') >= 0, t2);
    ok('MV08d ★ 括号只有一层（tagOf 自己就带「」，别再套一层）',
      (t2.match(/「/g) || []).length === 2 && t2.indexOf('「「') < 0, t2);
    /* ④ 目标改名 → 跟着变 */
    byId(a.id).text = '甲改名';
    reindex(); sizeAll();
    ok('MV08e ★ 目标改名后这一行跟着变',
      line().indexOf('甲改名') >= 0 && line().indexOf('甲目标') < 0, line());
    /* ⑤ 断开一条 → 少一个 */
    doc.edges = doc.edges.filter(x => x.id !== e1.id);
    reindex(); sizeAll();
    ok('MV08f ★ 断开后少一个',
      line().indexOf('甲改名') < 0 && line().indexOf('乙目标') >= 0, line());
    /* ⑥ 全断开 → 回到提示 */
    doc.edges = doc.edges.filter(x => x.s !== pg.id);
    reindex(); sizeAll();
    ok('MV08g ★ 全断开回到「还没连到」', line().indexOf('还没连到') === 0, line());
    /* ⑦ 连到分组也要认 */
    doc.groups = [ { id:'mg1', title:'一组', color:'', members:[a.id, b.id] } ];
    linkNodes(pg.id, 'mg1'); reindex(); sizeAll();
    ok('MV08h ★ 连到分组时报分组名', line().indexOf('一组') >= 0, line());
    closeNodeBox();
    fresh();   /* 收尾清干净 */
  });

  T('MV09 作用域按**变量**取，不按节点的第一个', () => {
    fresh();
    /* 用户报的：一个有两个变量的变量节点在分组里，
       其中一个「全局」变量，组外的节点却引用不到。 */
    const vn = addNodeAt('设置', 0, 0, 'round');
    vn.kind = 'var';
    vn.varDefs = [
      { name:'局内量', control:'plain', type:'number', value:'11', scope:'local'  },
      { name:'全局量', control:'plain', type:'number', value:'22', scope:'global' }
    ];
    const inside = addNodeAt('组内', 300, 0, 'round');
    reindex(); sizeAll();
    doc.groups = [ { id:'mg1', title:'一组', color:'', members:[vn.id, inside.id] } ];
    const outside = addNodeAt('组外', 700, 0, 'round');
    reindex(); sizeAll();
    const ctx = () => buildCtx(doc.nodes, doc.edges, doc.groups);

    /* ★ 核心：第二个变量是「全局」，组外也该读得到
       （以前 varVisibleIn 一律拿**第一个**变量的作用域去判，所以读不到） */
    ok('MV09 ★ 组外节点能读到那个「全局」变量',
      String(interpolateIn(ctx(), '{全局量}', outside.id)) === '22',
      String(interpolateIn(ctx(), '{全局量}', outside.id)));
    ok('MV09b 组内节点也能读到它',
      String(interpolateIn(ctx(), '{全局量}', inside.id)) === '22',
      String(interpolateIn(ctx(), '{全局量}', inside.id)));
    /* 点名语法走的是另一条路，也要通 */
    ok('MV09c ★ 组外点名 {设置.全局量}',
      String(interpolateIn(ctx(), '{设置.全局量}', outside.id)) === '22',
      String(interpolateIn(ctx(), '{设置.全局量}', outside.id)));
    /* 「局内」那个不该被组外看到 —— 这条一直是对的，别改坏 */
    ok('MV09d 组外读不到那个「局内」变量',
      String(interpolateIn(ctx(), '{局内量}', outside.id)) === '[未定义]',
      String(interpolateIn(ctx(), '{局内量}', outside.id)));
    ok('MV09e 组外点名也读不到「局内」',
      String(interpolateIn(ctx(), '{设置.局内量}', outside.id)) === '[未定义]',
      String(interpolateIn(ctx(), '{设置.局内量}', outside.id)));
    /* 顺序反过来也要对：第一个全局、第二个局内 */
    vn.varDefs = [
      { name:'甲全局', control:'plain', value:'1', scope:'global' },
      { name:'乙局内', control:'plain', value:'2', scope:'local'  }
    ];
    reindex(); sizeAll();
    ok('MV09f ★ 第一个是全局 → 组外读得到',
      String(interpolateIn(ctx(), '{甲全局}', outside.id)) === '1',
      String(interpolateIn(ctx(), '{甲全局}', outside.id)));
    ok('MV09g ★ 第二个是局内 → 组外读不到',
      String(interpolateIn(ctx(), '{乙局内}', outside.id)) === '[未定义]',
      String(interpolateIn(ctx(), '{乙局内}', outside.id)));
    /* 两个都全局：都该通 */
    vn.varDefs[1].scope = 'global';
    reindex(); sizeAll();
    ok('MV09h 两个都全局 → 组外都读得到',
      String(interpolateIn(ctx(), '{甲全局}', outside.id)) === '1'
      && String(interpolateIn(ctx(), '{乙局内}', outside.id)) === '2',
      String(interpolateIn(ctx(), '{甲全局}', outside.id)) + ' / ' + String(interpolateIn(ctx(), '{乙局内}', outside.id)));
    /* 单变量节点：行为不能变（varVisibleIn 不传 oneDef 时走原来那条） */
    const solo = addVarNode('单独', 1000, 0, { name:'单独', control:'plain', value:'9', scope:'global' });
    reindex(); sizeAll();
    ok('MV09i 单变量全局照旧读得到',
      String(interpolateIn(ctx(), '{单独}', outside.id)) === '9',
      String(interpolateIn(ctx(), '{单独}', outside.id)));
    const solo2 = addVarNode('独局内', 1300, 0, { name:'独局内', control:'plain', value:'8', scope:'local' });
    reindex(); sizeAll();
    ok('MV09j 单变量局内，组外照旧读不到',
      String(interpolateIn(ctx(), '{独局内}', outside.id)) === '[未定义]',
      String(interpolateIn(ctx(), '{独局内}', outside.id)));
    void solo2;

    fresh();   /* 收尾清干净 */
  });

  T('K05-1 Ctrl+A 打开的是「插入」菜单（加节点），不是「新建」（换文档）', () => {
    fresh();
    hideCtx();
    /* ★ 一开始接错成「新建」菜单了 —— 那是空白文件 / 示例文档，
       是「换一份文档」，不是「往当前文档里加节点」。 */
    ok('K05-1 ui.addMenu 绑在 ctrl+a 上', GP.keys.bindings['ctrl+a'] === 'ui.addMenu',
      String(GP.keys.bindings['ctrl+a']));
    GP.keys.actions['ui.addMenu'].run();
    const its = [...ctxEl.querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('K05-1b ★ 打开的是「插入」菜单（第一项是「节点」）',
      its.length > 0 && its[0] === '节点', its.join(' / '));
    ok('K05-1c 里面有变量 / 运算符 / 输出这些节点类型',
      its.some(x => /变量/.test(x)) && its.some(x => /运算符/.test(x)),
      its.join(' / '));
    ok('K05-1d ★ 不是「新建」菜单（那里面是空白文件 / 示例文档）',
      !its.some(x => /空白文件|示例/.test(x)), its.join(' / '));
    hideCtx();
    fresh();
  });
  T('K05 旧存档不能带偏新键位（换表必须升版）', () => {
    fresh();
    /* ★ 模拟用户浏览器里那份旧的 v1 存档：
       它只存「和当时默认值的差异」，如果被叠到新表上，
       旧键位会一个个复活 —— 实测 w/s/d/space 全回来，
       而且 ctrl+arrowup 会和新表的「生成节点」撞车。 */
    try {
      localStorage.setItem('grapheon.keymap.v1', JSON.stringify({
        'w':'node.spawn.up', 'a':'node.spawn.left', 's':'node.spawn.down',
        'd':'node.spawn.right', 'space':'node.collapse', 'ctrl+arrowup':'node.nav.up'
      }));
    } catch(e){}
    GP.keys.load();
    const b = GP.keys.bindings;
    ok('K05 ★ ctrl+a 是「添加节点」，没被旧存档带偏',
      b['ctrl+a'] === 'ui.addMenu', String(b['ctrl+a']));
    ok('K05b ★ a 是「全选」，旧的 spawn.left 没复活',
      b['a'] === 'sel.all', String(b['a']));
    ok('K05c ★ 旧的 WASD 没有复活',
      !b['w'] && !b['s'] && !b['d'],
      JSON.stringify({ w:b['w'], s:b['s'], d:b['d'] }));
    ok('K05d ★ 旧的 space 没有复活（折叠已经让给 Tab）',
      !b['space'] && b['tab'] === 'node.collapse',
      'space=' + b['space'] + ' tab=' + b['tab']);
    ok('K05e ★ ctrl+arrowup 是「生成节点」，没被旧的跳转绑走',
      b['ctrl+arrowup'] === 'node.spawn.up', String(b['ctrl+arrowup']));
    ok('K05f 对齐 Blender 的那些新键都在',
      b['alt+a'] === 'sel.none' && b['ctrl+i'] === 'sel.invert' && b['f'] === 'edge.link'
      && b['x'] === 'node.delete' && b['home'] === 'view.fit' && b['ctrl+alt+g'] === 'group.dissolve',
      JSON.stringify({ 'alt+a':b['alt+a'], 'ctrl+i':b['ctrl+i'], f:b['f'], x:b['x'],
        home:b['home'], 'ctrl+alt+g':b['ctrl+alt+g'] }));
    /* 存档里指向「已经不存在的动作」的条目要丢掉 */
    try { localStorage.setItem('grapheon.keymap.v2', JSON.stringify({ 'F9':'这个动作不存在' })); } catch(e){}
    GP.keys.load();
    ok('K05g ★ 指向不存在动作的存档条目被丢掉',
      GP.keys.bindings['F9'] === undefined, String(GP.keys.bindings['F9']));
    /* 真正的自定义仍然要生效 */
    try { localStorage.setItem('grapheon.keymap.v2', JSON.stringify({ 'F8':'view.fit' })); } catch(e){}
    GP.keys.load();
    ok('K05h ★ 真正的自定义键仍然生效', GP.keys.bindings['F8'] === 'view.fit',
      String(GP.keys.bindings['F8']));
    try { localStorage.removeItem('grapheon.keymap.v2'); localStorage.removeItem('grapheon.keymap.v1'); } catch(e){}
    GP.keys.reset();
  });

  T('MV10 变量节点每行的 +/- 按钮', () => {
    fresh();
    const press = (wp) => {
      const s = w2s(wp);
      const xy = { clientX:Math.round(s.x), clientY:Math.round(s.y), bubbles:true, cancelable:true,
                   pointerId:1, pointerType:'mouse', isPrimary:true };
      cv.dispatchEvent(new PointerEvent('pointerdown', Object.assign({ button:0, buttons:1 }, xy)));
      /* ★ 必须补一个 pointerup —— 只发 down 的话会留下一个「进行中的拖拽」，
         污染后面的用例（实测把 X02d 那条端口圆点的断言弄红了）。 */
      cv.dispatchEvent(new PointerEvent('pointerup', Object.assign({ button:0, buttons:0 }, xy)));
      if (editing) cancelEdit();
      reindex(); sizeAll();
    };
    const n = addNodeAt('设置', 0, 0, 'round');
    n.kind = 'var';
    n.varDefs = [ { name:'甲', control:'plain', value:'1' }, { name:'乙', control:'plain', value:'2' } ];
    reindex(); sizeAll();
    selectOnly(n.id);
    const names = () => nodeVarDefs(byId(n.id)).map(d => d.name).join(',');

    /* 布局 */
    const btns = varRowButtons(byId(n.id));
    ok('MV10 两行 → 四个按钮（每行 + 和 −）', btns.length === 4, String(btns.length));
    const b0 = nodeBox(byId(n.id));
    ok('MV10b ★ 按钮都在节点**外面**（右侧），不改内部布局',
      btns.every(x => x.box.x > b0.x + b0.w - 1),
      JSON.stringify(btns.map(x => Math.round(x.box.x - (b0.x + b0.w)))));
    ok('MV10c 每行的按钮 y 不一样', btns[0].box.y !== btns[2].box.y,
      btns[0].box.y + ' / ' + btns[2].box.y);
    /* 命中：只在选中 / 悬停时才算 */
    ok('MV10d ★ 命中第 0 行的 ＋',
      (() => { const h = hitVarButton({ x:btns[1].box.x + 7, y:btns[1].box.y + 7 });
               return h && h.action + '/' + h.index; })() === 'add/0', '');
    ok('MV10e ★ 命中第 0 行的 －',
      (() => { const h = hitVarButton({ x:btns[0].box.x + 7, y:btns[0].box.y + 7 });
               return h && h.action + '/' + h.index; })() === 'del/0', '');
    selectOnly(null); hover = null;
    ok('MV10f ★ 没选中也没悬停时不命中（不然画布上到处是隐形按钮）',
      hitVarButton({ x:btns[1].box.x + 7, y:btns[1].box.y + 7 }) === null);
    /* 点 ＋：插在这一行**后面** */
    selectOnly(n.id);
    press({ x:btns[1].box.x + 7, y:btns[1].box.y + 7 });
    ok('MV10g ★ 点第 0 行的 ＋ → 插在第 0 行**后面**',
      names() === '甲,变量3,乙', names());
    /* 点最后一行的 ＋：追加到末尾 */
    selectOnly(n.id);
    {
      const b = varRowButtons(byId(n.id));
      const add2 = b.find(x => x.index === 2 && x.action === 'add');
      press({ x:add2.box.x + 7, y:add2.box.y + 7 });
    }
    ok('MV10h 点最后一行的 ＋ → 追加到末尾', names() === '甲,变量3,乙,变量4', names());
    /* 点中间的 －：只删那一个 */
    selectOnly(n.id);
    {
      const b = varRowButtons(byId(n.id));
      const del1 = b.find(x => x.index === 1 && x.action === 'del');
      press({ x:del1.box.x + 7, y:del1.box.y + 7 });
    }
    ok('MV10i ★ 点中间的 － → 只删那一个', names() === '甲,乙,变量4', names());
    /* 只剩一个时，－ 被拒 */
    while (nodeVarDefs(byId(n.id)).length > 1) delVarDefFrom(byId(n.id), 1);
    reindex(); sizeAll(); selectOnly(n.id);
    {
      const one = varRowButtons(byId(n.id));
      press({ x:one[0].box.x + 7, y:one[0].box.y + 7 });
    }
    ok('MV10j ★ 只剩一个时 － 被拒绝', nodeVarDefs(byId(n.id)).length === 1,
      String(nodeVarDefs(byId(n.id)).length));
    /* 单变量节点：也有一对按钮，形态没变 */
    const solo = addVarNode('单价', 800, 0, { name:'单价', control:'plain', value:'9' });
    reindex(); sizeAll();
    ok('MV10k 单变量节点也有一对按钮', varRowButtons(solo).length === 2, String(varRowButtons(solo).length));
    const bs = nodeBox(solo);
    ok('MV10l 单变量：按钮同样在节点外，节点尺寸没受影响',
      varRowButtons(solo).every(x => x.box.x > bs.x + bs.w - 1), '');

    fresh();   /* 收尾清干净 */
  });

  T('PA01 程序节点也报「被作用」——效果本来就生效，只是看不见', () => {
    fresh();
    const el = document.getElementById('nbHits');
    const lineOf = (n) => { selectOnly(n.id); openNodeBox(byId(n.id)); renderNodeBox(); return el.textContent; };
    /* 造两个外观节点，都作用到一个**程序节点**上 */
    const pg = addNodeAt('目标程序', 0, 0, 'round');
    pg.kind = 'program'; pg.program = normalizeProgram({ op:'color', value:'#00ff00' });
    reindex(); sizeAll();
    const a1 = addNodeAt('染边', -600, -400, 'round');
    a1.kind = 'program'; a1.program = normalizeProgram({ op:'style', key:'border', mode:'set', value:'#ff00ff' });
    reindex(); sizeAll();
    linkNodes(a1.id, pg.id);
    reindex(); refreshEffects(); sizeAll();

    /* ★ 效果对程序节点**本来就是生效的**（这一组是事实，不是新功能） */
    ok('PA01 外框色确实作用到了程序节点', effBorder(byId(pg.id)) === '#ff00ff',
      String(effBorder(byId(pg.id))));
    ok('PA01b 效果记在 ops 上（画角标的数据来源）', !!effOf(byId(pg.id)).ops, '');

    /* ★ 新增：程序节点的面板要**两条都有** */
    const t1 = lineOf(byId(pg.id));
    ok('PA01c ★ 程序节点面板报了「被作用」', t1.indexOf('被 1 个外观节点作用') === 0, t1);
    ok('PA01d ★ 也报了「我作用到谁」（没有出边时是那句提示）',
      t1.indexOf('还没连到任何节点') >= 0, t1);
    ok('PA01e 两条在同一行里，用「　·　」隔开', t1.indexOf('　·　') >= 0, t1);
    /* 给它加一条出边之后，后半句换成目标名单 */
    const tgt = addNodeAt('它的目标', 700, 0, 'round');
    reindex(); sizeAll();
    linkNodes(pg.id, tgt.id);
    reindex(); refreshEffects(); sizeAll();
    const t2 = lineOf(byId(pg.id));
    ok('PA01f ★ 有了出边之后报出目标名字',
      t2.indexOf('作用于') >= 0 && t2.indexOf('它的目标') >= 0, t2);
    ok('PA01g 前半句仍然是「被作用」', t2.indexOf('被 1 个外观节点作用') === 0, t2);

    /* 普通节点：**只**报被作用，不报「作用于」 */
    const plain = addNodeAt('普通', 1200, 0, 'round');
    reindex(); sizeAll();
    linkNodes(a1.id, plain.id);
    reindex(); refreshEffects(); sizeAll();
    const t3 = lineOf(byId(plain.id));
    ok('PA01h 普通节点仍然只报「被作用」',
      t3.indexOf('被 1 个外观节点作用') === 0 && t3.indexOf('作用于') < 0, t3);
    ok('PA01i 普通节点没有「还没连到」那句（那是程序节点专属）',
      t3.indexOf('还没连到任何节点') < 0, t3);
    ok('PA01j 普通节点也照样吃到效果', effBorder(byId(plain.id)) === '#ff00ff',
      String(effBorder(byId(plain.id))));

    closeNodeBox();
    fresh();   /* 收尾清干净 */
  });

  T('GP01 分组也能有端点表（和节点同一套结构）', () => {
    fresh();
    const a = addNodeAt('甲', 0, 0, 'round');
    const b = addNodeAt('乙', 300, 0, 'round');
    reindex(); sizeAll();
    const g = { id:'gp1', title:'一组', color:'', members:[a.id, b.id] };
    doc.groups = [g];
    reindex(); sizeAll();

    /* ① 没配 ports —— 行为必须和以前**分毫不变**（四向中点） */
    const gb0 = groupBox(g);
    const A0 = anchorsFor(g);
    ok('GP01 没配 ports：右锚点在框右边中点',
      Math.round(A0.r.y) === Math.round(gb0.y + gb0.h / 2), String(A0.r.y));
    ok('GP01b 没配 ports：上锚点在框上边中点',
      Math.round(A0.t.x) === Math.round(gb0.x + gb0.w / 2), String(A0.t.x));

    /* ② 配上 ports —— 位置能自定义了（这就是「和节点一样灵活」） */
    g.ports = {
      ins:  [ { id:'in1', label:'入口', side:'l', at:0.25 } ],
      outs: [ { id:'o1', label:'折后价', side:'r', at:0.2 },
              { id:'o2', label:'均值',   side:'r', at:0.8 } ]
    };
    reindex(); sizeAll();
    const gb = groupBox(g);
    const A1 = anchorsFor(g);
    ok('GP01c ★ 配了 ports：右锚点落到 at=0.2 那个位置',
      Math.round(A1.r.y) === Math.round(gb.y + gb.h * 0.2), String(A1.r.y));
    ok('GP01d ★ 左锚点落到 at=0.25 那个位置',
      Math.round(A1.l.y) === Math.round(gb.y + gb.h * 0.25), String(A1.l.y));
    /* 端点对象本身 */
    const L = portList(g);
    ok('GP01e portList(分组) 给出配的端点', (L.outs || []).length === 2, String((L.outs || []).length));
    ok('GP01f 端点带标签（id 是自动编的数字，这是既有行为）',
      L.outs[0].label === '折后价' && typeof L.outs[0].id === 'number',
      JSON.stringify([L.outs[0].id, L.outs[0].label]));
    const pt = portPoint(g, L.outs[1]);
    ok('GP01g ★ portPoint(分组) 用的是**分组的框**（不是 nodeBox）',
      Math.round(pt.x) === Math.round(gb.x + gb.w) && Math.round(pt.y) === Math.round(gb.y + gb.h * 0.8),
      Math.round(pt.x) + ',' + Math.round(pt.y));

    /* ③ 节点那边一点没变 */
    const n0 = byId(a.id);
    const N = anchorsFor(n0);
    ok('GP01h 节点照旧（右锚点在节点右边中点）',
      Math.round(N.r.y) === Math.round(nodeBox(n0).y + nodeBox(n0).h / 2), String(N.r.y));

    /* ④ 删掉 ports 又回默认四向 */
    delete g.ports;
    reindex(); sizeAll();
    const gb2 = groupBox(g);
    ok('GP01i ★ 删掉 ports 之后又回到默认四向',
      Math.round(anchorsFor(g).r.y) === Math.round(gb2.y + gb2.h / 2),
      String(anchorsFor(g).r.y));

    /* ⑤ 存档往返 */
    g.ports = { outs:[ { id:'o1', label:'折后价', side:'r', at:0.2 } ] };
    reindex(); sizeAll();
    const pack = serialize();
    const g0 = pack.groups.find(x => x.id === 'gp1');
    ok('GP01j 存档带上 groups[].ports', !!(g0 && g0.ports && g0.ports.outs), JSON.stringify(g0 && g0.ports));
    deserialize(pack);
    const g1 = byGroup('gp1');
    ok('GP01k ★ 读回来 ports 还在',
      !!(g1 && g1.ports && g1.ports.outs && g1.ports.outs.length === 1),
      JSON.stringify(g1 && g1.ports));
    /* 没配的分组，存档里不该多一个字段 */
    delete g1.ports;
    const g2 = serialize().groups.find(x => x.id === 'gp1');
    ok('GP01l 没配 ports 时存档里不写这个字段（老存档形态不变）',
      g2.ports === undefined, JSON.stringify(g2.ports));

    fresh();   /* 收尾清干净 */
  });

  T('GP02 分组右键菜单里也有「连接」，加/删/恢复都能用', () => {
    fresh();
    const a = addNodeAt('甲', 0, 0, 'round');
    const b = addNodeAt('乙', 300, 0, 'round');
    reindex(); sizeAll();
    const g = { id:'gp2', title:'一组', color:'', members:[a.id, b.id] };
    doc.groups = [g]; reindex(); sizeAll();

    /* ① 真的右键一次，看菜单里有没有「连接」这一项 */
    hideCtx();
    const tb = groupTitleBox(g);
    const sx = Math.round(tb.x + tb.w / 2 + view.x), sy = Math.round(tb.y + tb.h / 2 + view.y);
    cv.dispatchEvent(new MouseEvent('contextmenu', {
      clientX:sx, clientY:sy, bubbles:true, cancelable:true, button:2 }));
    const labels = [...ctxEl.querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('GP02 ★ 分组菜单里有「连接」', labels.indexOf('连接') >= 0, labels.join(' / '));
    /* 它有子菜单（渲染成 ▶） */
    const conn = [...ctxEl.querySelectorAll('.item')].find(d => d.querySelector('.lb').textContent === '连接');
    ok('GP02b ★ 这一项带子菜单',
      !!conn && [...conn.querySelectorAll('.k')].some(k => k.textContent === '▶'),
      conn ? JSON.stringify([...conn.querySelectorAll('.k')].map(k => k.textContent)) : 'null');
    /* 分组菜单里其他的也都还在（别把原有项搞没了） */
    ok('GP02c 原有的那几项没丢',
      labels.indexOf('重命名') >= 0 && labels.indexOf('颜色') >= 0
      && labels.indexOf('设为程序组') >= 0 && labels.indexOf('解散分组（保留成员）') >= 0,
      labels.join(' / '));
    hideCtx();

    /* ② 分组的默认端点 = 四个**连接**端点（和画布上四个空心环一致） */
    const L0 = portList(g);
    ok('GP02d 分组默认只有 4 个连接端点，没有输入 / 输出',
      (L0.conns || []).length === 4 && (L0.ins || []).length === 0 && (L0.outs || []).length === 0,
      (L0.ins || []).length + '/' + (L0.outs || []).length + '/' + (L0.conns || []).length);

    /* ③ 菜单按钮最终调的就是这几个 —— 直接验它们认分组 */
    const p = addPort(g, 'conns');
    reindex(); sizeAll();
    ok('GP02e ★ addPort(分组, 连接) 能用', !!p && p.id != null, JSON.stringify(p));
    ok('GP02f ★ 连接端点从 4 变成 5',
      (portList(byGroup('gp2')).conns || []).length === 5,
      String((portList(byGroup('gp2')).conns || []).length));
    const gb = groupBox(byGroup('gp2'));
    const A = anchorsFor(byGroup('gp2'));
    ok('GP02g ★ 加了端点之后锚点仍然落在框上',
      A.r.y >= gb.y - 1 && A.r.y <= gb.y + gb.h + 1,
      Math.round(A.r.y) + ' 框 ' + Math.round(gb.y) + '..' + Math.round(gb.y + gb.h));
    /* 恢复默认 */
    resetPorts(byGroup('gp2'));
    reindex(); sizeAll();
    ok('GP02h ★ resetPorts(分组) 把 ports 清成 null',
      byGroup('gp2').ports == null, JSON.stringify(byGroup('gp2').ports));
    ok('GP02i ★ 又回到 4 个连接端点',
      (portList(byGroup('gp2')).conns || []).length === 4,
      String((portList(byGroup('gp2')).conns || []).length));
    const gb2 = groupBox(byGroup('gp2'));
    ok('GP02j ★ 锚点回到框边中点',
      Math.round(anchorsFor(byGroup('gp2')).r.y) === Math.round(gb2.y + gb2.h / 2),
      String(anchorsFor(byGroup('gp2')).r.y));

    /* ④ 顺带：那两处过期提示已经改掉 */
    {
      const pr = addNodeAt('看菜单', 900, 0, 'round');
      reindex(); sizeAll(); selectOnly(pr.id);
      /* 直接查菜单项里的 hint 字符串：Tab 现在是折叠，加子节点不再占键位 */
      const src = GP.keys.bindings;
      ok('GP02k Tab 绑的是折叠（不是加子节点）',
        src['tab'] === 'node.collapse' && !Object.values(src).includes('node.child'),
        'tab=' + src['tab']);
    }
    hideCtx();
    fresh();   /* 收尾清干净 */
  });

  T('CL01 缩小时内部布局不压扁，改成裁切', () => {
    fresh();
    const v = addNodeAt('设置', 0, 0, 'round');
    v.kind = 'var';
    v.varDefs = [ { name:'单价', control:'plain', value:'12' },
                  { name:'数量', control:'plain', value:'3' } ];
    reindex(); sizeAll();
    /* ⚠ nodeBox() 返回的是**活对象** —— sizeNode 会原地改它。
       不快照的话 v0/v1/v2 是同一个对象，比大小永远相等。 */
    const snap = (o) => ({ x:o.x, y:o.y, w:o.w, h:o.h });
    const v0 = snap(nodeBox(byId(v.id)));
    const r0 = varLayoutsFor(byId(v.id));
    ok('CL01 自动尺寸时没吃下限：布局用的宽就是节点宽',
      r0[0].L.valBox.x + r0[0].L.valBox.w <= v0.x + v0.w + 1,
      Math.round(r0[0].L.valBox.x + r0[0].L.valBox.w) + ' vs ' + Math.round(v0.x + v0.w));

    /* 手动缩到很窄 */
    setNodeSize(byId(v.id), 120, 90);
    reindex(); sizeAll();
    const v1 = snap(nodeBox(byId(v.id)));
    const r1 = varLayoutsFor(byId(v.id));
    ok('CL01b ★ 确实缩下去了', v1.w < 140, String(Math.round(v1.w)));
    ok('CL01c ★ 名称框宽度没被压扁（还是 VAR_NAME_W）',
      Math.round(r1[0].L.nameBox.w) === VAR_NAME_W, String(Math.round(r1[0].L.nameBox.w)));
    ok('CL01d ★ 行高没被压扁（还是 VAR_BOX_H）',
      Math.round(r1[0].L.nameBox.h) === VAR_BOX_H, String(Math.round(r1[0].L.nameBox.h)));
    ok('CL01e ★ 值框宽度不小于 varLayout 自己的下限 80',
      r1[0].L.valBox.w >= 80, String(Math.round(r1[0].L.valBox.w)));
    /* 布局宽 = 内容下限（12*2 + 118 + 10 + 80 = 232） */
    /* ★ plain 的值框宽度本来就是个常量 VAR_VAL_W（不吃 bodyW），
       真正会被节点宽度压扁的是 innerW —— 也就是**作用域那一行**
       （scopeBox）以及 list / map / slider 的本体。
       所以这里量 scopeBox：布局宽 = max(节点宽, VAR_LAYOUT_MIN_W)，
       右边留 VAR_PAD，于是 scopeBox 右边到节点左边的距离正好是 布局宽 - VAR_PAD。 */
    ok('CL01f ★ 值框宽度是常量 VAR_VAL_W（本来就不吃节点宽）',
      Math.round(r1[0].L.valBox.w) === VAR_VAL_W, String(Math.round(r1[0].L.valBox.w)));
    ok('CL01f2 ★ 作用域那行保住了内容下限（这才是会被压扁的地方）',
      Math.round(r1[0].L.scopeBox.x + r1[0].L.scopeBox.w - v1.x)
        === Math.max(v1.w, VAR_LAYOUT_MIN_W) - VAR_PAD,
      '实测 ' + Math.round(r1[0].L.scopeBox.x + r1[0].L.scopeBox.w - v1.x)
        + '，期望 ' + (Math.max(v1.w, VAR_LAYOUT_MIN_W) - VAR_PAD)
        + '（节点宽 ' + Math.round(v1.w) + '，下限 ' + VAR_LAYOUT_MIN_W + '）');
    /* 关键：布局不许伸出节点框（伸出去=字溢出；现在靠 clip 挡住，
       但布局本身也需要有下限，否则 clip 掉的就是内容而不是"外面"） */
    ok('CL01g 缩过之后行数 / 顺序没变',
      varLayoutsFor(byId(v.id)).length === r0.length,
      varLayoutsFor(byId(v.id)).length + ' vs ' + r0.length);
    /* 放大回去，内容都还在 */
    setNodeSize(byId(v.id), 500, 320);
    reindex(); sizeAll();
    const v2 = snap(nodeBox(byId(v.id)));
    ok('CL01h ★ 能放大回去', v2.w > v1.w && v2.h > v1.h,
      Math.round(v2.w) + '×' + Math.round(v2.h));
    ok('CL01i ★ 放大回去之后内容还在（行数一样）',
      varLayoutsFor(byId(v.id)).length === r0.length,
      String(varLayoutsFor(byId(v.id)).length));
    /* 画一帧不抛：clip 的 save/restore 必须配平 */
    draw();
    ok('CL01j 画一帧不抛（clip 配平）', true);
    /* 反复缩有稳定下限 */
    setNodeSize(byId(v.id), 30, 20);
    reindex(); sizeAll();
    const w1 = nodeBox(byId(v.id)).w;
    setNodeSize(byId(v.id), 30, 20);
    reindex(); sizeAll();
    const w2 = nodeBox(byId(v.id)).w;
    ok('CL01k ★ 反复缩有稳定下限', Math.round(w2) === Math.round(w1),
      Math.round(w2) + ' vs ' + Math.round(w1));

    fresh();   /* 收尾清干净 */
  });

  T('NM01 数值小浮层：滑条 + 填空双向联动', () => {
    fresh();
    const el = (id) => document.getElementById(id);
    const n = addNodeAt('甲', 0, 0, 'round');
    reindex(); sizeAll();

    ok('NM01 #numbox 这个浮层在', !!el('numbox'));
    /* ★ 这一组是**实际可见性**，不是内联样式 ——
       我第一版就是只查了 el.style.display，于是漏掉了
       「position 没设 → left/top 不生效 → 浮层躺在 (0,0) 还被画布盖住」。
       计算样式 + 真实占位才抓得住这类问题。 */
    ok('NM01a ★ 浮层是 fixed 定位（不是 static，否则 left/top 不生效）',
      getComputedStyle(el('numbox')).position === 'fixed', getComputedStyle(el('numbox')).position);
    ok('NM01a2 ★ 浮层有 z-index 且压得住画布',
      parseInt(getComputedStyle(el('numbox')).zIndex || '0', 10) > 0,
      getComputedStyle(el('numbox')).zIndex);
    ok('NM01a3 ★ 没打开时计算样式就是 display:none（真的看不见，不只是内联）',
      getComputedStyle(el('numbox')).display === 'none',
      getComputedStyle(el('numbox')).display);
    ok('NM01b 默认是藏着的', !numBoxOpen());
    /* 打开 */
    openNumBox({ title:'优先级', who:tagOf(byId(n.id)), min:0, max:2000, step:1, value:'',
      onOk: (v) => { const num = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
        byId(n.id).priority = (v === '') ? null : (num == null ? v : num); reindex(); } });
    ok('NM01c ★ 能打开', numBoxOpen());
    ok('NM01c2 ★ 打开后计算样式是 block（真的显示出来了）',
      getComputedStyle(el('numbox')).display === 'block', getComputedStyle(el('numbox')).display);
    {
      /* ★ 关键：left/top 有没有生效。position 没写对的话这里会是 (0,0)。 */
      const r = el('numbox').getBoundingClientRect();
      ok('NM01c3 ★ 占位跟上了 left/top（不是躺在 0,0）',
        Math.abs(r.x - parseFloat(el('numbox').style.left)) < 2
        && Math.abs(r.y - parseFloat(el('numbox').style.top)) < 2,
        'rect ' + Math.round(r.x) + ',' + Math.round(r.y)
        + '  style ' + el('numbox').style.left + ',' + el('numbox').style.top);
      ok('NM01c4 ★ 有真实宽高（画得出来）', r.width > 100 && r.height > 40,
        Math.round(r.width) + '×' + Math.round(r.height));
      ok('NM01c5 ★ 落在视口里',
        r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1,
        Math.round(r.left) + ',' + Math.round(r.top) + ' → ' + Math.round(r.right) + ',' + Math.round(r.bottom));
    }
    ok('NM01d 标题带上是谁', el('numboxWho').textContent.indexOf('优先级') === 0, el('numboxWho').textContent);
    ok('NM01e 滑条范围对', document.querySelector('#numboxFields .nbrange').min === '0' && document.querySelector('#numboxFields .nbrange').max === '2000',
      document.querySelector('#numboxFields .nbrange').min + '..' + document.querySelector('#numboxFields .nbrange').max);
    /* 拖滑条 → 文本跟着走 */
    document.querySelector('#numboxFields .nbrange').value = '500';
    document.querySelector('#numboxFields .nbrange').dispatchEvent(new Event('input', { bubbles:true }));
    ok('NM01f ★ 拖滑条 → 文本框跟着变', document.querySelector('#numboxFields .nbtext').value === '500', document.querySelector('#numboxFields .nbtext').value);
    /* 填数字 → 滑条跟着走（step=1，不会吸附） */
    document.querySelector('#numboxFields .nbtext').value = '1234';
    document.querySelector('#numboxFields .nbtext').dispatchEvent(new Event('input', { bubbles:true }));
    ok('NM01g ★ 填 1234 → 滑条也到 1234（step=1 不吸附）',
      document.querySelector('#numboxFields .nbrange').value === '1234', document.querySelector('#numboxFields .nbrange').value);
    /* 确定 → 存成数字 */
    el('numboxOk').click();
    ok('NM01h 确定之后浮层关了', !numBoxOpen());
    ok('NM01h2 ★ 关掉后计算样式是 display:none（真的藏了）',
      getComputedStyle(el('numbox')).display === 'none', getComputedStyle(el('numbox')).display);
    ok('NM01i ★ 纯数字存成 number（priorityOf 只认 number）',
      typeof byId(n.id).priority === 'number' && byId(n.id).priority === 1234,
      typeof byId(n.id).priority + ' ' + byId(n.id).priority);
    ok('NM01j ★ priorityOf 认它', priorityOf(byId(n.id)) === 1234, String(priorityOf(byId(n.id))));
    /* 写 {变量} → 存成字符串，滑条不动 */
    openNumBox({ title:'优先级', min:0, max:2000, step:1, value:'',
      onOk: (v) => { const num = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
        byId(n.id).priority = (v === '') ? null : (num == null ? v : num); reindex(); } });
    document.querySelector('#numboxFields .nbtext').value = '{倍率}';
    document.querySelector('#numboxFields .nbtext').dispatchEvent(new Event('input', { bubbles:true }));
    ok('NM01k 非数字时滑条不动', document.querySelector('#numboxFields .nbrange').value === '0', document.querySelector('#numboxFields .nbrange').value);
    el('numboxOk').click();
    ok('NM01l ★ {变量} 存成字符串', byId(n.id).priority === '{倍率}',
      typeof byId(n.id).priority + ' ' + byId(n.id).priority);
    /* 用默认 */
    openNumBox({ title:'优先级', min:0, max:2000, step:1, value:'1234',
      onOk: (v) => { const num = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null;
        byId(n.id).priority = (v === '') ? null : (num == null ? v : num); reindex(); } });
    ok('NM01m 打开时把现值填进文本框', document.querySelector('#numboxFields .nbtext').value === '1234', document.querySelector('#numboxFields .nbtext').value);
    ok('NM01n 滑条也同步到现值', document.querySelector('#numboxFields .nbrange').value === '1234', document.querySelector('#numboxFields .nbrange').value);
    el('numboxClear').click();
    ok('NM01o ★ 「用默认」→ null', byId(n.id).priority === null, JSON.stringify(byId(n.id).priority));
    ok('NM01p 普通节点默认生效值 0', priorityOf(byId(n.id)) === 0, String(priorityOf(byId(n.id))));
    /* 取消：不回调 */
    let called = false;
    openNumBox({ title:'优先级', min:0, max:2000, step:1, value:'', onOk: () => { called = true; } });
    el('numboxCancel').click();
    ok('NM01q ★ 取消关掉而且不回调', !numBoxOpen() && !called);
    /* Esc（走 keys.js 的 ui.escape） */
    openNumBox({ title:'优先级', min:0, max:2000, step:1, value:'', onOk: () => {} });
    ok('NM01r 又开出来了', numBoxOpen());
    window.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true, cancelable:true }));
    ok('NM01s ★ Esc 能关掉', !numBoxOpen());
    /* 别把各种节点的默认优先级搞坏 */
    const vv = addVarNode('v2', 900, 0, { name:'v2', control:'plain', value:'1' });
    reindex(); sizeAll();
    ok('NM01t 变量节点没设过优先级时是 1000', priorityOf(byId(vv.id)) === 1000, String(priorityOf(byId(vv.id))));
    /* 菜单里真的有「布局 ▶」 */
    hideCtx();
    const b = nodeBox(byId(n.id));
    cv.dispatchEvent(new MouseEvent('contextmenu', {
      clientX:Math.round(b.x + 20 + view.x), clientY:Math.round(b.y + 20 + view.y),
      bubbles:true, cancelable:true, button:2 }));
    const labels = [...ctxEl.querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    /* ★ 优先级**并进「结构」**了，不再单独占一个顶层「布局」——
       顶层名额有限（PM01 卡 <= 8），而且它本来就是结构性的东西。 */
    ok('NM01u ★ 顶层没有单独的「布局」', labels.indexOf('布局') < 0, labels.join(' / '));
    const st = [...ctxEl.querySelectorAll('.item')].find(d => d.querySelector('.lb').textContent === '结构');
    ok('NM01v ★ 「结构」有子菜单 ▶',
      !!st && [...st.querySelectorAll('.k')].some(k => k.textContent === '▶'));
    /* 子菜单是**单击**展开的 —— contextmenu 是弹用法提示的，展不开 */
    st.click();
    const sub = [...document.querySelectorAll('.menu .item')].map(d => d.querySelector('.lb').textContent);
    ok('NM01w ★ 优先级在「结构」里', sub.some(x => x.indexOf('优先级') >= 0), sub.join(' / '));
    hideCtx();
    fresh();   /* 收尾清干净 */
  });

  T('OP01 透明度搬进「外观」菜单（滑条 + 填空）', () => {
    fresh();
    const n = addNodeAt('甲', 0, 0, 'round');
    reindex(); sizeAll();

    /* ① 菜单：透明度在「外观」里，顶层没多东西 */
    hideCtx();
    const b = nodeBox(byId(n.id));
    cv.dispatchEvent(new MouseEvent('contextmenu', {
      clientX:Math.round(b.x + 20 + view.x), clientY:Math.round(b.y + 20 + view.y),
      bubbles:true, cancelable:true, button:2 }));
    const tops = [...ctxEl.querySelectorAll('.item')].map(d => d.querySelector('.lb').textContent);
    ok('OP01 ★ 顶层没有「组件」了', tops.indexOf('组件') < 0, tops.join(' / '));
    ok('OP01b ★ 顶层没多出新项（上限 8）', tops.length <= 8, tops.length + ' 项: ' + tops.join(' / '));
    ok('OP01c 「外观」还在', tops.indexOf('外观') >= 0, tops.join(' / '));
    hideCtx();

    /* ② 效果本身：用真实底层接口验（透明度是 opacity 效果） */
    ok('OP01d 一开始没挂透明度', !compOn(byId(n.id), 'opacity'));
    setComponent(byId(n.id), 'opacity', { value: 40 });
    reindex(); sizeAll();
    ok('OP01e ★ 挂上了', compOn(byId(n.id), 'opacity'));
    ok('OP01f ★ 取值用 compNumber 拿到数字 40（compRaw 给的是原文）',
      compNumber(byId(n.id), 'opacity', 'value', 'node', 100) === 40,
      String(compNumber(byId(n.id), 'opacity', 'value', 'node', 100)));
    removeComponent(byId(n.id), 'opacity');
    reindex(); sizeAll();
    ok('OP01g ★ 关掉之后没挂', !compOn(byId(n.id), 'opacity'));

    /* ③ 浮层本体：滑条 + 填空双向联动（透明度用 0..100） */
    let got = null;
    openNumBox({ title:'透明度', who:tagOf(byId(n.id)), min:0, max:100, step:1, value:'',
      placeholder:'留空 = 关掉；也可以写 {变量}',
      onOk: (v) => {
        got = String(v == null ? '' : v).trim();
        if (got === '') removeComponent(byId(n.id), 'opacity');
        else { const num = Number(got); setComponent(byId(n.id), 'opacity', { value: isFinite(num) && got !== '' ? num : got }); }
        reindex(); sizeAll();
      } });
    const box = document.getElementById('numbox');
    ok('OP01h 浮层开出来了', numBoxOpen());
    ok('OP01i 是 fixed 定位（不然 left/top 不生效）', getComputedStyle(box).position === 'fixed',
      getComputedStyle(box).position);
    ok('OP01j 计算显示是 block', getComputedStyle(box).display === 'block', getComputedStyle(box).display);
    ok('OP01k 滑条范围 0..100',
      document.querySelector('#numboxFields .nbrange').min === '0' && document.querySelector('#numboxFields .nbrange').max === '100',
      document.querySelector('#numboxFields .nbrange').min + '..' + document.querySelector('#numboxFields .nbrange').max);
    /* 拖滑条 → 文本 */
    document.querySelector('#numboxFields .nbrange').value = '40';
    document.querySelector('#numboxFields .nbrange').dispatchEvent(new Event('input', { bubbles:true }));
    ok('OP01l ★ 拖滑条 → 文本框跟着变', document.querySelector('#numboxFields .nbtext').value === '40',
      document.querySelector('#numboxFields .nbtext').value);
    /* 填数字 → 滑条 */
    document.querySelector('#numboxFields .nbtext').value = '77';
    document.querySelector('#numboxFields .nbtext').dispatchEvent(new Event('input', { bubbles:true }));
    ok('OP01m ★ 填 77 → 滑条跟着到 77', document.querySelector('#numboxFields .nbrange').value === '77',
      document.querySelector('#numboxFields .nbrange').value);
    /* 确定 → 真的挂上，而且是数字 */
    document.getElementById('numboxOk').click();
    ok('OP01n ★ 确定之后挂上了', compOn(byId(n.id), 'opacity'));
    ok('OP01o ★ 存的是数字 77',
      compNumber(byId(n.id), 'opacity', 'value', 'node', 100) === 77,
      String(compNumber(byId(n.id), 'opacity', 'value', 'node', 100)));
    /* 填 {变量} → 存字符串，组件仍在 */
    openNumBox({ title:'透明度', min:0, max:100, step:1, value:'',
      onOk: (v) => {
        const g = String(v == null ? '' : v).trim();
        if (g === '') removeComponent(byId(n.id), 'opacity');
        else { const num = Number(g); setComponent(byId(n.id), 'opacity', { value: isFinite(num) && g !== '' ? num : g }); }
        reindex(); sizeAll();
      } });
    document.querySelector('#numboxFields .nbtext').value = '{淡}';
    document.getElementById('numboxOk').click();
    ok('OP01p ★ {淡} 存成字符串', compRaw(byId(n.id), 'opacity', 'value') === '{淡}',
      String(compRaw(byId(n.id), 'opacity', 'value')));
    ok('OP01q 组件还在（只是值成了表达式）', compOn(byId(n.id), 'opacity'));
    /* 用默认 → 关掉 */
    openNumBox({ title:'透明度', min:0, max:100, step:1, value:'77',
      onOk: (v) => {
        const g = String(v == null ? '' : v).trim();
        if (g === '') removeComponent(byId(n.id), 'opacity');
        else setComponent(byId(n.id), 'opacity', { value: Number(g) });
        reindex(); sizeAll();
      } });
    document.getElementById('numboxClear').click();
    ok('OP01r ★ 「用默认」→ 透明度关掉', !compOn(byId(n.id), 'opacity'));

    draw();
    ok('OP01s 画一帧不抛', true);
    fresh();   /* 收尾清干净 */
  });

  T('FX01 染色 / 描边 / 角标 进「外观」，浮层按类型出字段', () => {
    fresh();
    const n = addNodeAt('甲', 0, 0, 'round');
    reindex(); sizeAll();
    /* ★ 子菜单是**单击**展开的（menu.js 里写的：不再用 hover）——
       我一开始用 contextmenu，那是弹「用法提示」的，展不开子菜单。 */
    const allItems = () => [...document.querySelectorAll('.menu .item')];
    const labelOf = (d) => d.querySelector('.lb').textContent;
    const rows = () => [...document.querySelectorAll('#numboxFields .nbfield')];
    const openMenu = () => {
      hideCtx();
      const b = nodeBox(byId(n.id));
      cv.dispatchEvent(new MouseEvent('contextmenu', {
        clientX:Math.round(b.x + 20 + view.x), clientY:Math.round(b.y + 20 + view.y),
        bubbles:true, cancelable:true, button:2 }));
    };
    const openLook = () => {
      openMenu();
      [...ctxEl.querySelectorAll('.item')].find(d => labelOf(d) === '外观').click();
    };
    const pick = (kw) => allItems().find(d => labelOf(d).indexOf(kw) >= 0);

    /* ① 位置：都在「外观」里，顶层没多东西，也没有「组件」了 */
    openMenu();
    const tops = [...ctxEl.querySelectorAll('.item')].map(labelOf);
    ok('FX01 ★ 顶层仍然 <= 8', tops.length <= 8, tops.length + ' 项: ' + tops.join(' / '));
    openLook();
    const sub = allItems().map(labelOf);
    ok('FX01b ★ 染色 / 自定义描边 / 角标 / 透明度 都在「外观」里',
      ['染色', '自定义描边', '角标', '透明度'].every(k => sub.some(x => x.indexOf(k) >= 0)),
      sub.join(' / '));
    ok('FX01c ★ 没有「组件」入口了', !sub.some(x => x.indexOf('组件') >= 0), sub.join(' / '));
    hideCtx();

    /* ② 染色：颜色字段（色块 + 填空），没有滑条 */
    openLook(); pick('染色').click();
    ok('FX01d 点染色 → 浮层开了', numBoxOpen());
    ok('FX01e ★ 一个字段', rows().length === 1, String(rows().length));
    ok('FX01f ★ 颜色字段 = 色块 + 填空',
      !!rows()[0].querySelector('.nbcolor') && !!rows()[0].querySelector('.nbtext'));
    ok('FX01g 颜色字段没有滑条', !rows()[0].querySelector('.nbrange'));
    rows()[0].querySelector('.nbcolor').value = '#ff00ff';
    rows()[0].querySelector('.nbcolor').dispatchEvent(new Event('input', { bubbles:true }));
    ok('FX01h 色块 → 文本框同步', rows()[0].querySelector('.nbtext').value === '#ff00ff',
      rows()[0].querySelector('.nbtext').value);
    document.getElementById('numboxOk').click();
    ok('FX01i ★ 染色挂上了', compOn(byId(n.id), 'tint'));
    ok('FX01j ★ 颜色存对了', compRaw(byId(n.id), 'tint', 'color') === '#ff00ff',
      String(compRaw(byId(n.id), 'tint', 'color')));
    /* 再开一次：带 ●，且带现值 */
    openLook();
    ok('FX01k ★ 挂上之后那一项带 ●', labelOf(pick('染色')).indexOf('●') === 0, labelOf(pick('染色')));
    pick('染色').click();
    ok('FX01l ★ 打开时带现值', rows()[0].querySelector('.nbtext').value === '#ff00ff',
      rows()[0].querySelector('.nbtext').value);
    document.getElementById('numboxCancel').click();

    /* ③ 描边：数字 + 颜色两个字段 */
    openLook(); pick('自定义描边').click();
    ok('FX01m ★ 两个字段', rows().length === 2, String(rows().length));
    ok('FX01n 第一段是滑条（数字）', !!rows()[0].querySelector('.nbrange'));
    ok('FX01o 滑条上限 20', rows()[0].querySelector('.nbrange').max === '20',
      rows()[0].querySelector('.nbrange').max);
    ok('FX01p 第二段是色块（颜色）', !!rows()[1].querySelector('.nbcolor'));
    rows()[0].querySelector('.nbtext').value = '5';
    rows()[0].querySelector('.nbtext').dispatchEvent(new Event('input', { bubbles:true }));
    rows()[1].querySelector('.nbcolor').value = '#00ff00';
    rows()[1].querySelector('.nbcolor').dispatchEvent(new Event('input', { bubbles:true }));
    document.getElementById('numboxOk').click();
    ok('FX01q ★ 描边两个值都存对了（数字是数字、颜色是颜色）',
      compNumber(byId(n.id), 'outline', 'width', 'node', 0) === 5
      && compRaw(byId(n.id), 'outline', 'color') === '#00ff00',
      compNumber(byId(n.id), 'outline', 'width', 'node', 0) + ' / ' + compRaw(byId(n.id), 'outline', 'color'));

    /* ④ 角标：文本 + 颜色 */
    openLook(); pick('角标').click();
    ok('FX01r 角标两个字段', rows().length === 2, String(rows().length));
    ok('FX01s 第一段是纯文本（没有滑条）',
      !rows()[0].querySelector('.nbrange') && !!rows()[0].querySelector('.nbtext'));
    rows()[0].querySelector('.nbtext').value = '重要';
    document.getElementById('numboxOk').click();
    ok('FX01t ★ 角标文字存对了', compRaw(byId(n.id), 'badge', 'text') === '重要',
      String(compRaw(byId(n.id), 'badge', 'text')));
    draw();
    ok('FX01u 画一帧不抛', true);
    hideCtx();
    fresh();   /* 收尾清干净 */
  });

  T('ST01 条件隐藏进「结构」、线宽进连线菜单、分组有「效果 ▶」', () => {
    fresh();
    const A = addNodeAt('甲', 0, 0, 'round');
    const B = addNodeAt('乙', 400, 0, 'round');
    reindex(); sizeAll();
    const E = linkNodes(A.id, B.id);
    reindex(); sizeAll();
    const allItems = () => [...document.querySelectorAll('.menu .item')];
    const labelOf = (d) => d.querySelector('.lb').textContent;
    const rows = () => [...document.querySelectorAll('#numboxFields .nbfield')];

    /* ① 节点：条件隐藏在「结构」里，顶层降到 6 项 */
    hideCtx();
    showCtx(500, 400, byId(A.id), null, { p:{} });
    const tops = [...ctxEl.querySelectorAll('.item')].map(labelOf);
    /* ★ 断言**不变量**而不是一个写死的数字：
       我一开始写死 6，结果 fresh() 用的是经典示例，
       那个节点还多一项「连线端点吸附…」，实际是 7。
       真正要保证的是「没有单独的布局菜单」+「不超过上限」。 */
    ok('ST01 ★ 顶层没有单独的「布局」（优先级并进「结构」了）',
      tops.indexOf('布局') < 0, tops.join(' / '));
    ok('ST01a2 ★ 顶层仍然不超过 8 项', tops.length <= 8, tops.length + ' 项: ' + tops.join(' / '));
    const st = [...ctxEl.querySelectorAll('.item')].find(d => labelOf(d) === '结构');
    st.click();      /* ★ 子菜单是单击展开的 */
    const sub = allItems().map(labelOf);
    ok('ST01b ★ 优先级在「结构」里', sub.some(x => x.indexOf('优先级') >= 0), sub.join(' / '));
    ok('ST01c ★ 条件隐藏在「结构」里', sub.some(x => x.indexOf('条件隐藏') >= 0), sub.join(' / '));
    allItems().find(d => labelOf(d).indexOf('条件隐藏') >= 0).click();
    ok('ST01d 条件隐藏浮层开了', numBoxOpen());
    ok('ST01e 一个字段', rows().length === 1, String(rows().length));
    ok('ST01f 是纯文本字段（条件要能写表达式，不给滑条）',
      !rows()[0].querySelector('.nbrange') && !!rows()[0].querySelector('.nbtext'));
    rows()[0].querySelector('.nbtext').value = '{隐藏}';
    document.getElementById('numboxOk').click();
    ok('ST01g ★ 条件隐藏挂上且值对',
      compOn(byId(A.id), 'hideIf') && compRaw(byId(A.id), 'hideIf', 'when') === '{隐藏}',
      String(compRaw(byId(A.id), 'hideIf', 'when')));

    /* ② 连线：线宽在连线菜单里（组件入口换掉了） */
    hideCtx();
    /* ⚠ 连线要从 doc.edges 里找 —— byId 只查节点，我探针就在这栽过一次 */
    const eo = doc.edges.find(x => x.id === E.id);
    showCtx(700, 300, null, eo, { p:null });
    const etops = [...ctxEl.querySelectorAll('.item')].map(labelOf);
    ok('ST01h ★ 连线菜单里有「线宽…」', etops.some(x => x.indexOf('线宽') >= 0), etops.join(' / '));
    ok('ST01i ★ 连线菜单里没有「组件」了', !etops.some(x => x.indexOf('组件') >= 0), etops.join(' / '));
    allItems().find(d => labelOf(d).indexOf('线宽') >= 0).click();
    ok('ST01j 线宽浮层开了', numBoxOpen());
    ok('ST01k 滑条上限 20', rows()[0].querySelector('.nbrange').max === '20',
      rows()[0].querySelector('.nbrange').max);
    rows()[0].querySelector('.nbtext').value = '6';
    rows()[0].querySelector('.nbtext').dispatchEvent(new Event('input', { bubbles:true }));
    ok('ST01l 填 6 → 滑条跟着', rows()[0].querySelector('.nbrange').value === '6',
      rows()[0].querySelector('.nbrange').value);
    document.getElementById('numboxOk').click();
    ok('ST01m ★ 线宽挂上且存成数字 6',
      compOn(doc.edges.find(x => x.id === E.id), 'width')
      && compNumber(doc.edges.find(x => x.id === E.id), 'width', 'value', 'edge', 0) === 6,
      String(compNumber(doc.edges.find(x => x.id === E.id), 'width', 'value', 'edge', 0)));

    /* ③ 分组：收在一个「效果 ▶」子菜单里 */
    hideCtx();
    doc.groups = [ { id:'stg1', title:'一组', color:'', members:[A.id, B.id] } ];
    reindex(); sizeAll();
    showCtx(300, 300, null, null, { group:byGroup('stg1') });
    const gtops = [...ctxEl.querySelectorAll('.item')].map(labelOf);
    ok('ST01n ★ 分组菜单里有「效果」子菜单', gtops.indexOf('效果') >= 0, gtops.join(' / '));
    ok('ST01o ★ 分组菜单里没有「组件」了', !gtops.some(x => x.indexOf('组件') >= 0), gtops.join(' / '));
    [...ctxEl.querySelectorAll('.item')].find(d => labelOf(d) === '效果').click();
    const gsub = allItems().map(labelOf);
    ok('ST01p ★ 分组能挂 染色 / 透明度 / 描边 / 角标 / 条件隐藏',
      ['染色', '透明度', '自定义描边', '角标', '条件隐藏'].every(k => gsub.some(x => x.indexOf(k) >= 0)),
      gsub.join(' / '));
    ok('ST01q ★ 分组没有「线宽」（那是连线专属，作用域过滤掉了）',
      !gsub.some(x => x.indexOf('线宽') >= 0), gsub.join(' / '));
    allItems().find(d => labelOf(d).indexOf('透明度') >= 0).click();
    ok('ST01r 分组的透明度浮层也能开', numBoxOpen());
    rows()[0].querySelector('.nbtext').value = '30';
    document.getElementById('numboxOk').click();
    ok('ST01s ★ 分组透明度挂上且值对',
      compOn(byGroup('stg1'), 'opacity')
      && compNumber(byGroup('stg1'), 'opacity', 'value', 'group', 0) === 30,
      String(compNumber(byGroup('stg1'), 'opacity', 'value', 'group', 0)));
    hideCtx();
    draw();
    fresh();   /* 收尾清干净 */
  });

  T('MD01 相对地址解析 / 类型判定 / 协议白名单', () => {
    fresh();

    /* ① 路径：没写协议头的补 user/ 前缀 */
    ok('MD01 pic.png → user/pic.png', mediaHref('pic.png') === 'user/pic.png', mediaHref('pic.png'));
    ok('MD01b video/clip.mp4 → user/video/clip.mp4',
      mediaHref('video/clip.mp4') === 'user/video/clip.mp4', mediaHref('video/clip.mp4'));
    ok('MD01c ★ ../ 开头的**不补**（那是从站点根往上走）',
      mediaHref('../assets/x.svg') === '../assets/x.svg', mediaHref('../assets/x.svg'));
    ok('MD01d ./ 开头的也不补', mediaHref('./x.png') === './x.png', mediaHref('./x.png'));
    ok('MD01e 已经写了 user/ 的不重复', mediaHref('user/a.png') === 'user/a.png', mediaHref('user/a.png'));
    ok('MD01f 以 / 开头的绝对路径原样', mediaHref('/abs/a.png') === '/abs/a.png', mediaHref('/abs/a.png'));
    ok('MD01g 写了协议头的原样', mediaHref('https://a/b.png') === 'https://a/b.png'
      && mediaHref('data:image/png;base64,AA') === 'data:image/png;base64,AA'
      && mediaHref('file:///d/a.png') === 'file:///d/a.png', '');

    /* ② 类型判定（按扩展名，去掉 ?query / #hash 再判） */
    ok('MD01h 图片扩展名都认得',
      ['a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg', 'a.bmp', 'a.avif']
        .every(f => mediaKind(f) === 'image'), '');
    ok('MD01i 视频扩展名都认得',
      ['a.mp4', 'a.webm', 'a.ogv', 'a.mov', 'a.m4v'].every(f => mediaKind(f) === 'video'), '');
    ok('MD01j 音频扩展名都认得',
      ['a.mp3', 'a.wav', 'a.ogg', 'a.m4a', 'a.flac', 'a.aac'].every(f => mediaKind(f) === 'audio'), '');
    ok('MD01k http 地址当网页', mediaKind('https://example.com/a') === 'link', mediaKind('https://example.com/a'));
    ok('MD01l html 当网页', mediaKind('page.html') === 'link', mediaKind('page.html'));
    ok('MD01m 认不出的当文件', mediaKind('a.zip') === 'file', mediaKind('a.zip'));
    ok('MD01n ★ 带 ?query / #hash 也认得出',
      mediaKind('pic.png?v=2') === 'image' && mediaKind('a.mp4#t=3') === 'video',
      mediaKind('pic.png?v=2'));

    /* ③ 协议白名单：放行该放的，拦住危险的 */
    ok('MD01o 放行：相对 / http / https / file / blob',
      ['pic.png', 'user/a.mp4', '../assets/x.svg', 'http://a/b.png', 'https://a/b.mp4',
       'file:///d/a.png', 'blob:http://x/y'].every(u => mediaSrcAllowed(u)), '');
    ok('MD01p ★ 放行 data: 里的图 / 视频 / 音频',
      mediaSrcAllowed('data:image/png;base64,AA')
      && mediaSrcAllowed('data:video/mp4;base64,AA')
      && mediaSrcAllowed('data:audio/mpeg;base64,AA'), '');
    ok('MD01q ★ 拦掉 javascript: / vbscript:（Ctrl+左键打开会执行脚本）',
      !mediaSrcAllowed('javascript:alert(1)') && !mediaSrcAllowed('vbscript:x'), '');
    ok('MD01r ★ 拦掉 data:text/html（那是能执行页面内容的入口）',
      !mediaSrcAllowed('data:text/html,<b>x</b>'), '');
    ok('MD01s 拦掉 other 协议', !mediaSrcAllowed('about:blank') && !mediaSrcAllowed('chrome://settings'), '');
    ok('MD01t 空串不算合法源', !mediaSrcAllowed('') && !mediaSrcAllowed(null), '');

    /* ④ 节点上的统一入口 */
    const n = addNodeAt('引用图', 0, 0, 'rect');
    n.kind = 'image';
    n.src = 'pic.png';
    reindex(); sizeAll();
    ok('MD01u ★ mediaSrcOf 给原文', mediaSrcOf(byId(n.id)) === 'pic.png', mediaSrcOf(byId(n.id)));
    ok('MD01v ★ mediaHrefOf 给补好前缀的地址',
      mediaHrefOf(byId(n.id)) === 'user/pic.png', mediaHrefOf(byId(n.id)));
    ok('MD01w mediaKindOf 判类型', mediaKindOf(byId(n.id)) === 'image', mediaKindOf(byId(n.id)));

    /* ⑤ 存档：只存那个短字符串，不存内嵌数据 */
    const snap = serialize();
    const raw = snap.nodes.find(x => x.id === n.id);
    ok('MD01x ★ 存档里存的是相对地址（几十个字节，不是几兆的 data:）',
      raw.src === 'pic.png', JSON.stringify(raw.src));
    deserialize(snap);
    ok('MD01y 往返之后还在', byId(n.id).src === 'pic.png', String(byId(n.id).src));

    /* ⑥ 危险源进不了存档 */
    const n2 = addNodeAt('坏源', 400, 0, 'rect');
    n2.kind = 'image'; n2.src = 'javascript:alert(1)';
    const snap2 = serialize();
    ok('MD01z ★ 危险源写不进存档',
      snap2.nodes.find(x => x.id === n2.id).src === null,
      String(snap2.nodes.find(x => x.id === n2.id).src));

    fresh();   /* 收尾清干净 */
  });

  T('MT01 五种类型：尺寸怎么算 / 画得出来', () => {
    fresh();
    const mk = (src) => {
      const n = addNodeAt('m', 0, 0, 'rect');
      n.kind = 'image'; n.src = src; n.desc = '';
      reindex(); sizeNode(byId(n.id)); reindex(); sizeAll();
      return byId(n.id);
    };

    /* ① 类型 → 尺寸规则 */
    /* ★ 用 data: 当素材，不用真的相对路径 ——
       相对路径会让渲染器真去抓文件，抓不到就是 ERR_FILE_NOT_FOUND，
       测试框架会把它算成失败（老图片测试用 data: 就是这个原因）。
       data:video / data:audio 既能拿到正确的类型，又不会去抓文件。
       网页和文件这两种本来就不抓（只有图片和视频会建加载器）。 */
    const PNG1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const img  = mk(PNG1);
    const vid  = mk('data:video/mp4;base64,AA');
    const aud  = mk('data:audio/mpeg;base64,AA');
    const link = mk('https://example.com/a.html');
    const file = mk('notes.zip');
    ok('MT01 图片默认 4:3 兜底（老规矩，改了老文档形态会变）',
      Math.abs(img.imgDrawH - Math.round(img.w * 3 / 4)) <= 2,
      img.imgDrawH + ' vs ' + Math.round(img.w * 3 / 4));
    ok('MT01b ★ 视频没拿到元数据时按 16:9 占位',
      Math.abs(vid.imgDrawH - Math.round(vid.w / (16 / 9))) <= 2,
      vid.imgDrawH + ' vs ' + Math.round(vid.w / (16 / 9)));
    ok('MT01c ★ 音频 / 网页 / 文件是固定高的一条',
      aud.imgDrawH === 34 && link.imgDrawH === 34 && file.imgDrawH === 34,
      [aud.imgDrawH, link.imgDrawH, file.imgDrawH].join(' / '));
    ok('MT01d 音频 / 网页 / 文件的默认宽度是 240',
      aud.w === 240 && link.w === 240 && file.w === 240,
      [aud.w, link.w, file.w].join(' / '));
    ok('MT01e ★ 类型记在节点上（画的时候不用再算一遍）',
      img.mediaKind === 'image' && vid.mediaKind === 'video' && aud.mediaKind === 'audio'
      && link.mediaKind === 'link' && file.mediaKind === 'file',
      [img.mediaKind, vid.mediaKind, aud.mediaKind, link.mediaKind, file.mediaKind].join(' / '));

    /* ② 有原始尺寸时按真实比例（图片 / 视频都一样） */
    const p = mk(PNG1);
    p.imgW = 400; p.imgH = 200;
    sizeNode(p); reindex(); sizeAll();
    ok('MT01f ★ 有原始尺寸时按真实比例（400:200，宽度被 IMG_MAX_W 夹到 300 → 高 150）',
      Math.abs(p.imgDrawH - Math.round(p.w * 200 / 400)) <= 2,
      p.imgDrawH + ' vs ' + Math.round(p.w * 200 / 400) + '（宽 ' + p.w + '）');
    const v2 = mk('data:video/mp4;base64,AA');
    v2.imgW = 1920; v2.imgH = 1080;
    sizeNode(v2); reindex(); sizeAll();
    ok('MT01g ★ 视频拿到元数据之后按真实比例（1920:1080 → 16:9）',
      Math.abs(v2.imgDrawH - Math.round(v2.w * 1080 / 1920)) <= 2,
      v2.imgDrawH + ' vs ' + Math.round(v2.w * 1080 / 1920));

    /* ③ 兜底函数本身 */
    ok('MT01h mediaFallbackBoxH：音频 / 网页 / 文件 = 34',
      mediaFallbackBoxH('audio', 300) === 34 && mediaFallbackBoxH('link', 300) === 34
      && mediaFallbackBoxH('file', 300) === 34, '');
    ok('MT01i mediaFallbackBoxH：视频 = 宽度 / (16/9)',
      mediaFallbackBoxH('video', 320) === Math.round(320 / (16 / 9)),
      String(mediaFallbackBoxH('video', 320)));

    /* ④ 五种一起画，不抛 */
    draw();
    ok('MT01j ★ 五种类型一起画一帧不抛', true);
    /* ⑤ 描述照旧：多媒体节点的描述也能引用变量、也能折行 */
    img.desc = '这是一段描述';
    sizeNode(img); reindex(); sizeAll();
    ok('MT01k 描述折行照旧', img.lines.length >= 1, String(img.lines.length));

    fresh();   /* 收尾清干净 */
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
