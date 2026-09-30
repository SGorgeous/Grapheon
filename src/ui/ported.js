'use strict';
/* ==========================================================================
   GRAPHEON · ui/ported.js
   端点编辑弹窗：两个输入框，一个改 ID，一个改标签。

   为什么不做成就地编辑：端点的 ID 和标签是**两件独立的事**，
   塞进一行文字里要靠 `#7 系数` 这种约定，记不住也容易写错。
   两个框一目了然。
   ========================================================================== */

const portedEl    = document.getElementById('ported');
const portedIdEl  = document.getElementById('portedId');
const portedLbEl  = document.getElementById('portedLabel');
const portedWhoEl = document.getElementById('portedWho');
let portedTarget = null;          // { node, dir, portId }

const portedOpen = () => !!portedEl && portedEl.style.display === 'block';

function openPortEditor(n, dir, id){
  if (!n || !portedEl) return false;
  const p = portById(n, id);
  if (!p) return false;
  portedTarget = { node:n, dir, portId:id };
  portedWhoEl.textContent = (dir === 'ins' ? '输入端点' : '输出端点')
    + ' · ' + ({ t:'上', b:'下', l:'左', r:'右' })[p.side];
  portedIdEl.value = String(p.id);
  portedLbEl.value = p.label || '';
  portedEl.style.display = 'block';
  positionPortEditor(n, p);
  portedIdEl.focus();
  portedIdEl.select();
  return true;
}
function closePortEditor(){
  if (!portedEl) return;
  portedEl.style.display = 'none';
  portedTarget = null;
  mark();
}
/* 贴在端点旁边 */
function positionPortEditor(n, p){
  if (!p) return;
  const pt = portPoint(n, p);
  const sx = pt.x * view.z + view.x, sy = pt.y * view.z + view.y;
  const w = portedEl.offsetWidth || 220, h = portedEl.offsetHeight || 130;
  let x = sx + 20, y = sy - h / 2;
  if (p.side === 'l') x = sx - w - 20;
  if (p.side === 't') y = sy - h - 20;
  if (p.side === 'b') y = sy + 20;
  x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
  y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
  portedEl.style.left = Math.round(x) + 'px';
  portedEl.style.top = Math.round(y) + 'px';
}
/* 确定：两样一起改。ID 撞了就整条不生效 —— 不许出现「ID 没改、标签却改了」 */
function commitPortEditor(){
  if (!portedTarget) return false;
  const { node, dir, portId } = portedTarget;
  const wantId = Math.round(+String(portedIdEl.value).trim());
  const wantLb = String(portedLbEl.value);
  if (!isFinite(wantId) || wantId <= 0){
    say('* 端点 ID 得是正整数。');
    portedIdEl.focus();
    return false;
  }
  if (wantId !== portId){
    if (!setPortId(node, dir, portId, wantId)){
      portedIdEl.focus();
      portedIdEl.select();
      return false;                       // 撞车：整个操作取消，标签也不动
    }
    portedTarget.portId = wantId;
  }
  const p = portById(node, wantId);
  if (p && (p.label || '') !== wantLb) setPortLabel(node, dir, wantId, wantLb);
  pushHist();
  closePortEditor();
  say('* 端点 #' + wantId + (wantLb ? ' 「' + wantLb + '」' : '') + ' 改好了。');
  return true;
}

if (portedEl){
  document.getElementById('portedOk').addEventListener('click', commitPortEditor);
  document.getElementById('portedCancel').addEventListener('click', () => { closePortEditor(); });
  portedEl.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter'){ ev.preventDefault(); commitPortEditor(); }
    else if (ev.key === 'Escape'){ ev.preventDefault(); closePortEditor(); }
  });
  // 点别处收起
  window.addEventListener('pointerdown', (ev) => {
    if (!portedOpen()) return;
    if (portedEl.contains(ev.target)) return;
    closePortEditor();
  }, true);
}
