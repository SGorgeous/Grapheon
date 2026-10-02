'use strict';
/* ==========================================================================
   GRAPHEON · core/log.js
   操作记录。

   数据源主要是 say() —— 每次操作它都会说一句「刚发生了什么」，
   这里就按时间存下来。文件 / 视图 / 设置那几类在调用处显式传 kind。

   只活在内存里：刷新就没了。它是「我刚才干了什么」的记事本，
   不是存档 —— 存档是 .json 那一套。
   ========================================================================== */

const LOG_MAX = 800;                       // 环形上限，超出丢最旧的
const LOG_KINDS = ['操作', '文件', '视图', '设置', '面板'];
let opLog = [];
let logSeq = 0;

/* kind 不认识就归到「操作」 */
function pushLog(kind, text){
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  const e = {
    id: ++logSeq,
    t: Date.now(),
    kind: (LOG_KINDS.indexOf(kind) >= 0 ? kind : '操作'),
    text: t,
  };
  opLog.push(e);
  if (opLog.length > LOG_MAX) opLog.splice(0, opLog.length - LOG_MAX);
  /* 面板开着就实时补一行（logbox.js 排在后面加载，所以要判一下） */
  if (typeof logPanelPush === 'function') logPanelPush(e);
  return e;
}
function clearLog(){ opLog = []; }
function logSize(){ return opLog.length; }
function logEntries(kind){
  return (!kind || kind === '全部') ? opLog.slice() : opLog.filter(e => e.kind === kind);
}
/* 每种分类各有多少条 —— 面板上的筛选按钮要显示数量 */
function logCounts(){
  const m = { '全部': opLog.length };
  for (const k of LOG_KINDS) m[k] = 0;
  for (const e of opLog) m[e.kind] = (m[e.kind] || 0) + 1;
  return m;
}
function logClock(ms){
  const d = new Date(ms);
  const p = (x) => (x < 10 ? '0' : '') + x;
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
/* 导出成纯文本 —— 时间是补零的 HH:MM:SS，方便直接贴进别处 */
function logAsText(kind){
  return logEntries(kind)
    .map(e => logClock(e.t) + '  [' + e.kind + ']  ' + e.text)
    .join('\n');
}
