'use strict';
/* ==========================================================================
   GRAPHEON · ui/exporter.js
   导出面板：范围选择、标题与文件名、PNG 输出。
   ========================================================================== */

/* ---------------- 导出 ---------------- */
const expEl      = document.getElementById('exp');
const expNameEl  = document.getElementById('expName');
const expTitleEl = document.getElementById('expTitle');
const expScopesEl= document.getElementById('expScopes');
const expInfoEl  = document.getElementById('expInfo');
const expGoEl    = document.getElementById('expGo');
const EXP_PAD = 90, EXP_SCALE = 2;
const EXP_PREF_KEY = 'grapheon.export.v1';
let expScope = 'all';

function sanitizeFile(s){
  const t = String(s == null ? '' : s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '').trim();
  return t || 'grapheon';
}
/* 标题只去掉换行，其余原样保留（引号、斜杠等都允许，它只画在图上不进文件名） */
const sanitizeTitle = (s) => String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim();

function saveExportPrefs(){
  try {
    localStorage.setItem(EXP_PREF_KEY, JSON.stringify({
      name: expNameEl.value, title: expTitleEl.value, scope: expScope
    }));
  } catch (e) {}
}
function loadExportPrefs(){
  try {
    const p = JSON.parse(localStorage.getItem(EXP_PREF_KEY) || '{}');
    if (p && typeof p === 'object'){
      if (p.name) expNameEl.value = p.name;
      if (p.title) expTitleEl.value = p.title;
      if (p.scope) expScope = p.scope;
    }
  } catch (e) {}
}
function exportScopes(){
  // 折叠藏起来的节点不算在导出范围里（所见即所得）
  const visible = doc.nodes.filter(n => !isHidden(n.id));
  const all = visible;
  const picked = visible.filter(n => sel.has(n.id));
  let sub = [];
  if (sel.size === 1){
    const r = byId([...sel][0]);
    if (r){ const ids = new Set([r.id, ...descendants(r.id)]); sub = visible.filter(n => ids.has(n.id)); }
  }
  return {
    all:{ label:'全部节点',     nodes:all,    hint: all.length + ' 个' },
    sel:{ label:'仅选中的节点', nodes:picked, hint: picked.length ? picked.length + ' 个' : '未选中任何节点' },
    sub:{ label:'选中的子树',   nodes:sub,    hint: sel.size === 1 ? sub.length + ' 个' : '需恰好选中 1 个节点' }
  };
}
const currentExportSet = () => exportScopes()[expScope].nodes;
function exportGeometry(nodes, groups){
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes){
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w); maxY = Math.max(maxY, n.y + n.h);
  }
  // 分组框一般比成员大一圈（内边距 + 标题带），不算进来会被裁掉
  for (const grp of (groups || [])){
    const r = groupBox(grp);
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  return { minX, minY, w:Math.max(1, maxX - minX), h:Math.max(1, maxY - minY) };
}
function openExport(){
  if (!doc.nodes.length){ say('* 画布上还没有节点，没什么可导出的。'); return; }
  hideCtx(); closeHelp();
  if (typeof closeEdgeBox === 'function') closeEdgeBox();
  if (typeof closeEndBox === 'function') closeEndBox();
  if (typeof closeNodeBox === 'function') closeNodeBox();
  if (!exportScopes()[expScope].nodes.length) expScope = 'all';
  if (!expNameEl.value) expNameEl.value = 'grapheon-' + new Date().toISOString().slice(0, 10);
  renderScopes();
  expEl.style.display = 'block';
  expNameEl.focus();
  try { expNameEl.setSelectionRange(0, expNameEl.value.length); } catch (e) {}
}
function closeExport(){ saveExportPrefs(); expEl.style.display = 'none'; mark(); }
function renderScopes(){
  const sets = exportScopes();
  expScopesEl.innerHTML = '';
  for (const id of ['all', 'sel', 'sub']){
    const s = sets[id];
    const usable = s.nodes.length > 0;
    const d = document.createElement('div');
    d.className = 'opt' + (expScope === id ? ' on' : '') + (usable ? '' : ' off');
    d.innerHTML = '<span class="hrt"></span><span>' + s.label + '</span><span class="cnt">' + s.hint + '</span>';
    if (usable) d.onclick = () => { expScope = id; renderScopes(); };
    expScopesEl.appendChild(d);
  }
  updateExportInfo();
}
function updateExportInfo(){
  const nodes = currentExportSet();
  expGoEl.disabled = !nodes.length;
  if (!nodes.length){ expInfoEl.textContent = '这个范围里没有节点'; return; }
  const ids = new Set(nodes.map(n => n.id));
  const edges = doc.edges.filter(e => ids.has(e.s) && ids.has(e.t));
  const bb = exportGeometry(nodes);
  const W = Math.ceil((bb.w + EXP_PAD * 2) * EXP_SCALE);
  const H = Math.ceil((bb.h + EXP_PAD * 2) * EXP_SCALE);
  const title = sanitizeTitle(expTitleEl.value);
  expInfoEl.textContent = '将导出 ' + nodes.length + ' 个节点 · ' + edges.length + ' 条连线 · ' +
    W + ' × ' + H + ' 像素' + (title ? ' · 左上角标题「' + title + '」' : '');
}
function buildExportCanvas(nodesIn, titleIn){
  // 走 exportPlan：它会保留「至少一端是分组」的边。
  // 以前这里自己算了一遍 ids.has(e.s) && ids.has(e.t)，把指向分组的线全滤掉了。
  const plan = exportPlan(nodesIn);
  const nodes = plan.nodes;
  const edges = plan.edges;
  const bb = exportGeometry(nodes, plan.drawGroups);
  const W = Math.ceil((bb.w + EXP_PAD * 2) * EXP_SCALE);
  const H = Math.ceil((bb.h + EXP_PAD * 2) * EXP_SCALE);
  const title = sanitizeTitle(titleIn != null ? titleIn : (expTitleEl ? expTitleEl.value : ''));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  g.setTransform(EXP_SCALE, 0, 0, EXP_SCALE, (EXP_PAD - bb.minX) * EXP_SCALE, (EXP_PAD - bb.minY) * EXP_SCALE);
  drawGraphForExport(g, nodes, edges);
  g.setTransform(1, 0, 0, 1, 0, 0);

  // 白框
  g.strokeStyle = C.white; g.lineWidth = 8;
  g.strokeRect(26, 26, W - 52, H - 52);

  // 左上角：用户标题（32px，超宽自动截断加省略号）
  if (title){
    setFont(g, FS_BIG, 'normal');
    g.fillStyle = C.white; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText(fitText(g, title, W - 112), 56, 94);
  }
  // 左下角品牌水印 + 右下角日期
  setFont(g, FS, 'normal');
  g.textAlign = 'left'; g.fillStyle = C.gray;
  g.fillText('* GRAPHEON', 56, H - 54);
  g.textAlign = 'right';
  g.fillText(new Date().toLocaleDateString(), W - 56, H - 54);
  return c;
}
/* 导出时到底画哪些分组框、哪些连线。
   端点只要「会被画出来」这条边就留着 —— 以前只认节点集合，
   结果**指向分组的连线被整条丢掉**：框画了，连到框上的线却没了。 */
function exportPlan(nodes){
  const list = nodes || doc.nodes;
  const inSet = new Set(list.map(n => n.id));
  const drawGroups = (idx.groupOrder || doc.groups || [])
    .filter(grp => !isHidden(grp.id) && groupAllNodes(grp.id).some(id => inSet.has(id)));
  const gset = new Set(drawGroups.map(grp => grp.id));
  const drawable = (id) => inSet.has(id) || gset.has(id);
  return { nodes:list, drawGroups, edges:doc.edges.filter(e => drawable(e.s) && drawable(e.t)) };
}
function drawGraphForExport(g, nodes, edges){
  const plan = exportPlan(nodes);
  nodes = plan.nodes;
  if (!edges) edges = plan.edges;
  const savedHover = hover, savedEdge = hoverEdge, savedSel = sel, savedSelEdge = selEdgeId;
  const savedGrp = selGroups, savedHoverGrp = hoverGrp;
  hover = null; hoverEdge = null; sel = new Set(); selEdgeId = null;   // 导出图里不要选中态和手柄
  selGroups = new Set(); hoverGrp = null;
  for (const grp of plan.drawGroups) drawGroup(g, grp);
  for (const e of edges) drawEdge(g, e);
  for (const n of nodes) drawNode(g, n);
  hover = savedHover; hoverEdge = savedEdge; sel = savedSel; selEdgeId = savedSelEdge;
  selGroups = savedGrp; hoverGrp = savedHoverGrp;
}
function doExport(){
  const nodes = currentExportSet();
  if (!nodes.length){ say('* 这个范围里没有节点。'); return; }
  const name = sanitizeFile(expNameEl.value.replace(/\.png$/i, ''));
  const title = sanitizeTitle(expTitleEl.value);
  // 图片节点要等解码完再画，不然导出的会是「图片加载中…」占位
  const go = () => {
    try {
      const c = buildExportCanvas(nodes, title);
      const finish = () => {
        closeExport();
        say('* 已把 ' + nodes.length + ' 个节点导出为 ' + name + '.png' + (title ? '（标题：' + title + '）' : ''));
      };
      if (c.toBlob) c.toBlob((blob) => { downloadBlob(blob, name + '.png'); finish(); }, 'image/png');
      else { downloadBlob(dataURLtoBlob(c.toDataURL('image/png')), name + '.png'); finish(); }
    } catch (err){
      say('* 导出失败了：' + err.message);
    }
  };
  say('* 正在导出……');
  const pending = ensureImagesLoaded();
  if (pending && pending.then) pending.then(go, go); else go();
}
function onExportFieldKey(ev){
  ev.stopPropagation();
  if (ev.key === 'Enter'){ ev.preventDefault(); doExport(); }
  else if (ev.key === 'Escape'){ ev.preventDefault(); closeExport(); }
}
expNameEl.addEventListener('keydown', onExportFieldKey);
expTitleEl.addEventListener('keydown', onExportFieldKey);
expTitleEl.addEventListener('input', updateExportInfo);
document.getElementById('expGo').onclick = doExport;
document.getElementById('expCancel').onclick = closeExport;

