/* ==========================================================================
   生成 docs-structure.png —— 用 Grapheon 自己画的项目结构图。

   做法：把 tools/structure-diagram.js 注入 index.html 生成一个临时页面，
   用无头 Edge 打开它，页面内部走 Grapheon 自己的导出通道产出 PNG，
   再通过 CDP 把那张图取回来写到磁盘。

   用法： node tools/make-structure-diagram.mjs
   ========================================================================== */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TMP  = resolve(ROOT, '.structure-diagram.html');
const OUT  = resolve(ROOT, 'docs-structure.png');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = resolve(ROOT, '.structure-profile');

/* 1. 拼页面 */
const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
const scene = readFileSync(resolve(HERE, 'structure-diagram.js'), 'utf8');
writeFileSync(TMP, html.replace('</body>', '<script>\n' + scene + '\n</script>\n</body>'), 'utf8');

/* 2. 起浏览器 */
if (existsSync(profile)) rmSync(profile, { recursive:true, force:true });
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9333', '--user-data-dir=' + profile,
  '--window-size=1600,1000', 'file:///' + TMP.replace(/\\/g, '/')
], { stdio:'ignore' });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 3. 连调试口 */
let target = null;
for (let i = 0; i < 80 && !target; i++){
  try {
    const list = await (await fetch('http://127.0.0.1:9333/json')).json();
    target = list.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
  } catch (e){ /* 还没起来 */ }
  if (!target) await sleep(250);
}
if (!target) throw new Error('连不上 Edge 的调试端口');

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once:true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params) => new Promise(res => {
  const mid = ++id; pending.set(mid, res);
  ws.send(JSON.stringify({ id:mid, method, params:params || {} }));
});
await send('Runtime.enable');

/* 4. 等页面把图导出来 */
let dataUrl = null;
for (let i = 0; i < 160 && !dataUrl; i++){
  const r = await send('Runtime.evaluate', {
    expression: "(function(){var e=document.getElementById('shot');return e?e.src:null;})()",
    returnByValue: true
  });
  dataUrl = r.result && r.result.result && r.result.result.value;
  if (!dataUrl) await sleep(250);
}
if (!dataUrl) throw new Error('页面没有产出导出图（看图里的报错）');

const b64 = dataUrl.split(',')[1];
const buf = Buffer.from(b64, 'base64');
writeFileSync(OUT, buf);
console.log('写出 ' + OUT + '  ' + Math.round(buf.length / 1024) + ' KB');

ws.close();
child.kill();
try { unlinkSync(TMP); } catch (e){}
try { rmSync(profile, { recursive:true, force:true }); } catch (e){}
process.exit(0);
