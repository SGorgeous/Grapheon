'use strict';
/* ==========================================================================
   GRAPHEON · ui/logbox.js
   操作记录浮层：按时间倒序列出这次会话里发生过的所有事。
   ========================================================================== */

const logboxEl  = document.getElementById('logbox');
const logListEl = document.getElementById('logList');
const logFootEl = document.getElementById('logFoot');
let logFilter = '全部';
let logFollow = true;            // 面板开着时是否跟着新记录滚（暂停了就不打扰你看旧的）

function openLogbox(){
  if (typeof closeSettings === 'function') closeSettings();
  if (typeof closeHelp === 'function') closeHelp();
  if (typeof closeNodeBox === 'function') closeNodeBox();
  if (typeof closeEdgeBox === 'function') closeEdgeBox();
  hideCtx();
  logboxEl.style.display = 'block';
  renderLog();
}
function closeLogbox(){ logboxEl.style.display = 'none'; }

/* 日志有更新时被 core/log.js 调到（只在面板开着时才真的重画） */
function logPanelPush(){
  if (logboxEl.style.display === 'block') renderLog();
}

function renderLog(){
  const counts = logCounts();
  /* 筛选按钮：分类 + 数量 */
  const bar = document.getElementById('logBar');
  if (bar){
    bar.innerHTML = '';
    for (const k of ['全部'].concat(LOG_KINDS)){
      const n = counts[k] || 0;
      if (k !== '全部' && !n) continue;          // 空分类不占位置
      const b = document.createElement('button');
      b.className = 'ud-btn' + (logFilter === k ? ' on' : '');
      b.textContent = k + ' ' + n;
      b.onclick = () => { logFilter = k; renderLog(); };
      bar.appendChild(b);
    }
  }
  const rows = logEntries(logFilter);
  logListEl.innerHTML = '';
  if (!rows.length){
    const d = document.createElement('div');
    d.className = 'empty';
    d.textContent = logSize() ? '这一类里还没有记录。' : '还没有操作记录 —— 动一下试试。';
    logListEl.appendChild(d);
  } else {
    /* 新的在上面：倒序 */
    for (let i = rows.length - 1; i >= 0; i--){
      const e = rows[i];
      const d = document.createElement('div');
      d.className = 'logrow k-' + e.kind;
      const tm = document.createElement('span'); tm.className = 'lt'; tm.textContent = logClock(e.t);
      const kd = document.createElement('span'); kd.className = 'lk'; kd.textContent = e.kind;
      const tx = document.createElement('span'); tx.className = 'lx'; tx.textContent = e.text;
      d.appendChild(tm); d.appendChild(kd); d.appendChild(tx);
      logListEl.appendChild(d);
    }
    if (logFollow) logListEl.scrollTop = 0;
  }
  logFootEl.textContent = '共 ' + logSize() + ' 条' +
    (logFilter === '全部' ? '' : '（当前只看「' + logFilter + '」）') +
    (logSize() >= 800 ? ' · 只留最近 800 条' : '') +
    ' · 记录只活在这次会话里，刷新就没了 · 关闭：Esc 或点框外';
}

/* ---- 复制 / 导出 / 清空 ---- */
function logCopyAll(){
  const txt = logAsText(logFilter);
  if (!txt){ say('* 记录还是空的。', '面板', { noLog:true }); return; }
  const done = () => say('* 已复制 ' + logEntries(logFilter).length + ' 条记录。', '面板', { noLog:true });
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done));
  } else fallbackCopy(txt, done);
}
function fallbackCopy(txt, done){
  /* clipboard 在 file:// 下有可能被挡 —— 退回到一个隐藏的 textarea */
  try {
    const ta = document.createElement('textarea');
    ta.value = txt;
    ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    done();
  } catch(e){ say('* 复制失败了，可以点「导出」存成文件。', '面板', { noLog:true }); }
}
function logSaveFile(){
  const txt = logAsText(logFilter);
  if (!txt){ say('* 记录还是空的。', '面板', { noLog:true }); return; }
  const d = new Date();
  const p = (x) => (x < 10 ? '0' : '') + x;
  const name = 'grapheon-log-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.txt';
  downloadBlob(new Blob([txt], { type: 'text/plain;charset=utf-8' }), name);
  say('* 已导出 ' + logEntries(logFilter).length + ' 条记录：' + name, '面板', { noLog:true });
}
function logClearAll(){
  if (!logSize()){ say('* 记录本来就是空的。', '面板', { noLog:true }); return; }
  clearLog();
  renderLog();
  say('* 记录已清空。', '面板', { noLog:true });
}

/* ---- 关闭行为：和帮助面板一致 ---- */
logboxEl.addEventListener('click', (ev) => ev.stopPropagation());
window.addEventListener('pointerdown', (ev) => {
  if (logboxEl.style.display === 'block' && !logboxEl.contains(ev.target)) closeLogbox();
});
/* 滚到顶部就恢复跟随，往下翻就暂停 —— 免得你翻旧记录时被新记录顶走 */
logListEl.addEventListener('scroll', () => { logFollow = (logListEl.scrollTop <= 4); });
for (const [id, fn] of [['logCopy', logCopyAll], ['logSave', logSaveFile], ['logClear', logClearAll]]){
  const b = document.getElementById(id);
  if (b) b.onclick = fn;
}
