'use strict';
/* ==========================================================================
   GRAPHEON · ui/endbox.js
   连线端点面板 —— 从**节点或分组**的右键菜单进入，
   逐个指定「挂在这个对象上的每条连线，接在它哪条边上」。

   默认是「自动」：路由按两个端点的相对位置挑最合适的一对锚点。
   只有显式选了某个方向，才会把那一端钉死在指定边上。

   节点和分组共用这一个入口：openEndBox() 接受任意「有 id 的端点对象」。
   ========================================================================== */

const endBoxEl = document.getElementById('endbox');
const endSubEl = document.getElementById('endSub');
const endListEl = document.getElementById('endList');
let endTargetId = null;              // 节点或分组的 id

const END_OPTS = [['auto', '自动'], ['t', '上'], ['r', '右'], ['b', '下'], ['l', '左']];

/* 挂在这个对象上的所有连线，以及各自是哪一端。先列出去的，再列进来的。 */
function anchorEdges(id){
  const out = [], inc = [];
  for (const e of doc.edges){
    if (e.s === id) out.push({ e, which:'a' });
    else if (e.t === id) inc.push({ e, which:'b' });
  }
  return out.concat(inc);
}
function openEndBox(target){
  if (!target){ say('* 先在一个节点或分组上右键。'); return; }
  if (!anchorEdges(target.id).length){ say('* 它上面还没有连线。'); return; }
  hideCtx(); closeHelp(); closeExport();
  if (typeof closeEdgeBox === 'function') closeEdgeBox();
  if (typeof closeNodeBox === 'function') closeNodeBox();
  endTargetId = target.id;
  // 注意：传进来的可能是裸的分组对象（右键菜单里那个），它没有 isGroup 标记，
  // 所以一律用 byGroup 查一次来判断，别信 target.isGroup。
  if (byGroup(target.id)) selectGroup(target.id);
  else { sel.clear(); sel.add(target.id); selEdgeId = null; selGroupId = null; }
  renderEndBox();
  endBoxEl.style.display = 'block';
  mark();
}
function closeEndBox(){ endBoxEl.style.display = 'none'; endTargetId = null; mark(); }
function renderEndBox(){
  const grp = byGroup(endTargetId);
  const n = grp || byId(endTargetId);
  if (!n){ closeEndBox(); return; }
  endSubEl.textContent = (grp ? '分组「' + (grp.title || '分组') : '节点「' + (n.text || '未命名')) +
    '」上的 ' + anchorEdges(n.id).length + ' 条连线';
  endListEl.innerHTML = '';
  for (const { e, which } of anchorEdges(n.id)){
    const other = anchorOf(which === 'a' ? e.t : e.s);
    const otherName = other
      ? (other.isGroup ? (other.group.title || '分组') : (other.text || '未命名'))
      : '未命名';
    const row = el('div', 'endrow');
    row.appendChild(el('span', 'endname',
      (which === 'a' ? '→ 连到「' : '← 来自「') + otherName + '」'));
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
