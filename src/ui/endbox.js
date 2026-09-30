'use strict';
/* ==========================================================================
   GRAPHEON · ui/endbox.js
   连线端点面板 —— 从**节点**右键菜单进入，逐个指定「这个节点上的每条连线接在哪条边」。

   默认是「自动」：路由按两个节点的相对位置挑最合适的一对锚点。
   只有显式选了某个方向，才会把那一端钉死在指定边上。
   ========================================================================== */

const endBoxEl = document.getElementById('endbox');
const endSubEl = document.getElementById('endSub');
const endListEl = document.getElementById('endList');
let endNodeId = null;

const END_OPTS = [['auto', '自动'], ['t', '上'], ['r', '右'], ['b', '下'], ['l', '左']];

/* 这个节点上挂着的所有连线，以及各自是哪一端。先列出去的，再列进来的。 */
function nodeEdges(n){
  const out = [], inc = [];
  for (const e of doc.edges){
    if (e.s === n.id) out.push({ e, which:'a' });
    else if (e.t === n.id) inc.push({ e, which:'b' });
  }
  return out.concat(inc);
}
function openEndBox(n){
  if (!n){ say('* 先在节点上右键。'); return; }
  if (!nodeEdges(n).length){ say('* 这个节点上还没有连线。'); return; }
  hideCtx(); closeHelp(); closeExport();
  if (typeof closeEdgeBox === 'function') closeEdgeBox();
  if (typeof closeNodeBox === 'function') closeNodeBox();
  endNodeId = n.id;
  sel.clear(); sel.add(n.id); selEdgeId = null;
  renderEndBox();
  endBoxEl.style.display = 'block';
  mark();
}
function closeEndBox(){ endBoxEl.style.display = 'none'; endNodeId = null; mark(); }
function renderEndBox(){
  const n = byId(endNodeId);
  if (!n){ closeEndBox(); return; }
  endSubEl.textContent = '节点「' + (n.text || '未命名') + '」上的 ' + nodeEdges(n).length + ' 条连线';
  endListEl.innerHTML = '';
  for (const { e, which } of nodeEdges(n)){
    const other = byId(which === 'a' ? e.t : e.s);
    const row = el('div', 'endrow');
    row.appendChild(el('span', 'endname',
      (which === 'a' ? '→ 连到「' : '← 来自「') + ((other && other.text) || '未命名') + '」'));
    const opts = el('div', 'opts');
    for (const [val, label] of END_OPTS){
      const cur = (which === 'a' ? e.aSide : e.bSide) || 'auto';
      const on = cur === val;
      const d = el('div', 'opt' + (on ? ' on' : ''),
        '<span class="hrt"></span><span>' + label + '</span>');
      d.onclick = () => {
        setEdgeSide(e, which, val === 'auto' ? null : val);
        renderEndBox();
        pushHist();
        say('* 端点：' + edgeSideText(e) + (val === 'auto' ? '（自动吸附）' : '（已钉在' + label + '边）'));
      };
      opts.appendChild(d);
    }
    row.appendChild(opts);
    endListEl.appendChild(row);
  }
}
document.getElementById('endClose').onclick = closeEndBox;
