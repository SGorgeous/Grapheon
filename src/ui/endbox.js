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
  else { sel.clear(); selGroups.clear(); sel.add(target.id); selEdgeId = null; }
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
    /* ★ 选项 = 这个节点**真实存在的端点**，不再是无脑四条固定边。
       端口模型上来之后，「上/下/左/右」对默认节点（只有左/右两个端点）
       是选不中的 —— 选了没反应，看起来就是「端点连线改不掉」。
       分组没有端点表，还是退回四条边。 */
    const tn = byId(n.id);
    const PL = tn && (typeof portList === 'function') ? portList(tn) : null;
    /* ★ 三类端点都要算上。普通节点没有 ins/outs，只有 conns ——
       以前这里只看两个表，于是普通节点的面板里一个端点都列不出来。 */
    const outLike = PL ? PL.outs.concat(PL.conns || []) : [];
    const inLike  = PL ? PL.ins.concat(PL.conns || []) : [];
    const portOpts = PL
      ? (which === 'a' ? (outLike.length ? outLike : inLike)
                       : (inLike.length ? inLike : outLike))
          .map(p => [String(p.id),
                     '#' + p.id + (p.label ? ' ' + p.label : '') +
                     '（' + ({ t:'上', b:'下', l:'左', r:'右' })[p.side] + '）'])
      : END_OPTS.map(([v, l]) => [v, l]);
    const curPort = which === 'a' ? e.aPort : e.bPort;
    const cur = (curPort == null) ? 'auto' : String(curPort);
    // 注意 END_OPTS 里**本来就含「自动」**，端口那条路才需要自己补一个 —— 别补重了
    const optList = PL ? [['auto', '自动']].concat(portOpts) : END_OPTS;
    for (const [val, label] of optList){
      const on = cur === val;
      const d = el('div', 'opt' + (on ? ' on' : ''),
        '<span class="hrt"></span><span>' + label + '</span>');
      d.onclick = () => {
        if (val === 'auto'){
          if (which === 'a'){ e.aPort = null; e.aSide = null; }
          else { e.bPort = null; e.bSide = null; }
          say('* 端点：自动吸附。');
        } else if (!PL){
          // 分组没有端点表 —— 还是老的「钉死哪条边」
          setEdgeSide(e, which, val);
          say('* 端点：' + edgeSideText(e) + '。');
        } else {
          const p = portById(tn, +val);
          if (p) pinEdgePort(e, which, tn, p);
          say('* 端点：钉在 #' + val + (p && p.label ? ' ' + p.label : '') + '。');
        }
        reindex(); sizeAll();
        renderEndBox();
        pushHist(); mark();
      };
      opts.appendChild(d);
    }
    row.appendChild(opts);
    endListEl.appendChild(row);
  }
}
document.getElementById('endClose').onclick = closeEndBox;
