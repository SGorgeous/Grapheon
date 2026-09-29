'use strict';
/* ==========================================================================
   GRAPHEON · ui/edgebox.js
   连线样式面板：箭头 / 线型 / 走线 / 标签。
   选中一条连线后，右键 →「连线样式…」或直接按 E 打开。
   ========================================================================== */

const edgeBoxEl = document.getElementById('edgebox');
const ebArrowEl = document.getElementById('ebArrow');
const ebDashEl  = document.getElementById('ebDash');
const ebRouteEl = document.getElementById('ebRoute');
const ebLabelEl = document.getElementById('ebLabel');
let ebEdgeId = null;

const ARROW_OPTS = [['none', '无箭头'], ['end', '单向箭头'], ['both', '双向箭头']];
const DASH_OPTS  = [[false, '实线'], [true, '虚线']];
const ROUTE_OPTS = [['ortho', '正交折线'], ['curve', '曲线']];

function openEdgeBox(){
  const e = selectedEdge();
  if (!e){ say('* 先点选一条连线，再打开样式面板。'); return; }
  hideCtx(); closeHelp(); closeExport();
  if (typeof closeEndBox === 'function') closeEndBox();
  ebEdgeId = e.id;
  renderEdgeBox();
  edgeBoxEl.style.display = 'block';
  mark();
}
function closeEdgeBox(){
  edgeBoxEl.style.display = 'none';
  ebEdgeId = null;
  mark();
}
/* 一排单选：点一下就换，立即作用到真实的那条连线上 */
function buildOpts(host, list, cur, onPick){
  host.innerHTML = '';
  for (const [val, label] of list){
    const on = String(cur) === String(val);
    const d = el('div', 'opt' + (on ? ' on' : ''), '<span class="hrt"></span><span>' + label + '</span>');
    d.onclick = () => onPick(val);
    host.appendChild(d);
  }
}
function renderEdgeBox(){
  const e = doc.edges.find(x => x.id === ebEdgeId);
  if (!e){ closeEdgeBox(); return; }
  buildOpts(ebArrowEl, ARROW_OPTS, e.arrow, (v) => { setEdgeStyle(e, { arrow:v }); afterEdgeEdit(); });
  buildOpts(ebDashEl,  DASH_OPTS,  e.dash,  (v) => { setEdgeStyle(e, { dash:v });  afterEdgeEdit(); });
  buildOpts(ebRouteEl, ROUTE_OPTS, e.route, (v) => { setEdgeStyle(e, { route:v }); afterEdgeEdit(); });
  if (document.activeElement !== ebLabelEl) ebLabelEl.value = e.label || '';
}
function afterEdgeEdit(){
  renderEdgeBox();
  const e = doc.edges.find(x => x.id === ebEdgeId);
  if (e) say('* 连线类型：' + edgeStyleLabel(e) + ' / ' + ROUTE_LABEL[e.route]);
  pushHist();
  mark();
}
/* 标签边打边生效，但只在打完（change/blur）时记一次历史，免得每敲一个字都进撤销栈 */
ebLabelEl.addEventListener('input', () => {
  const e = doc.edges.find(x => x.id === ebEdgeId);
  if (e){ e.label = ebLabelEl.value.replace(/[\r\n]+/g, ' '); mark(); }
});
ebLabelEl.addEventListener('change', () => { if (ebEdgeId) pushHist(); });
ebLabelEl.addEventListener('keydown', (ev) => {
  ev.stopPropagation();
  if (ev.key === 'Enter' || ev.key === 'Escape'){ ev.preventDefault(); closeEdgeBox(); }
});
document.getElementById('ebClose').onclick = closeEdgeBox;
