/* ==========================================================================
   GRAPHEON · tests/run.mjs
   在真实 Edge 里跑 tests/regression.js 并汇报结果。
     node tests/run.mjs            跑一遍
     node tests/run.mjs --keep     跑完不删临时页面（方便手动打开调试）
   退出码：0 = 全部通过，1 = 有失败。
   ========================================================================== */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TMP  = join(ROOT, '.grapheon-test.html');
const PORT = 9411;
const KEEP = process.argv.includes('--keep');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];
const BROWSER = process.env.GRAPHEON_BROWSER || EDGE_CANDIDATES.find(p => existsSync(p));
if (!BROWSER){
  console.error('找不到 Edge / Chrome，可用 GRAPHEON_BROWSER 环境变量指定路径。');
  process.exit(2);
}

/* 把测试脚本注入 index.html 的副本（放在仓库根目录，这样 src/ 相对路径才解析得到）。
   额外在 <head> 最前面塞一个错误收集器：模块是在加载期就抛错的，
   而测试脚本最后才跑，靠它自己监听 window.onerror 是收不到更早的错误的。 */
const ERROR_COLLECTOR =
  '<script>window.__loadErrors=[];window.addEventListener("error",function(e){' +
  'window.__loadErrors.push((e.message||"")+" @ "+String(e.filename||"").split("/").pop()+":"+e.lineno);' +
  '});<\/script>';
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
writeFileSync(TMP, html
  .replace('<head>', '<head>' + ERROR_COLLECTOR)
  .replace('</body>', '<script src="tests/regression.js"></script>\n</body>'), 'utf8');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const profile = join(ROOT, '.grapheon-test-profile');
/* 每次都用全新 profile：否则上一轮留下的 localStorage（记住的文件名、改过的键位）
   会让断言之间互相污染，出现「单独跑能过、连着跑就挂」的假失败 */
try { rmSync(profile, { recursive:true, force:true }); } catch (e) {}

const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--window-size=1600,1000',
  'file:///' + TMP.replace(/\\/g, '/')
], { stdio: 'ignore' });

async function connect(){
  for (let i = 0; i < 100; i++){
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const t = list.find(x => x.type === 'page' && x.url && x.url.startsWith('file:')) || list.find(x => x.type === 'page');
      if (t && t.webSocketDebuggerUrl) return t.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('浏览器没起来');
}

let exitCode = 1;
try {
  const wsUrl = await connect();
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = [];
  let id = 0;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  });
  const send = (method, params) => new Promise(r => {
    const i = ++id; pending.set(i, r);
    ws.send(JSON.stringify({ id:i, method, params: params || {} }));
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Log.enable');
  await sleep(6000);   // 等断言跑完

  const res = await send('Runtime.evaluate', {
    expression: `(function(){
      var el = document.getElementById('testlog');
      var loadErrs = window.__loadErrors || [];
      if (!el) return { missing:true, title:document.title, booted:document.body.className, loadErrs:loadErrs };
      var lines = el.textContent.split('\\n');
      var m = lines[0].match(/total=(\\d+) failed=(\\d+)/) || [];
      return { total:+m[1] || 0, failed:+m[2] || 0, text:el.textContent, loadErrs:loadErrs };
    })()`,
    returnByValue: true
  });
  const v = res.result?.result?.value;
  // 未捕获异常走的是 Runtime.exceptionThrown，Log.entryAdded 收不到 —— 以前就是这么漏掉的
  const exceptions = events
    .filter(e => e.method === 'Runtime.exceptionThrown')
    .map(e => (e.params.exceptionDetails.exception && e.params.exceptionDetails.exception.description)
           || e.params.exceptionDetails.text);
  const consoleErrors = events
    .filter(e => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
    .map(e => e.params.entry.text);
  const loadErrs = (v && v.loadErrs) || [];

  if (!v || v.missing){
    console.error('没拿到测试结果。页面状态：', JSON.stringify(v));
    if (exceptions.length) console.error('未捕获异常：\n  ' + exceptions.join('\n  '));
    if (loadErrs.length) console.error('加载期错误：\n  ' + loadErrs.join('\n  '));
    if (consoleErrors.length) console.error('控制台错误：\n  ' + consoleErrors.join('\n  '));
    console.error('提示：加 --keep 保留临时页面，手动打开 .grapheon-test.html 看控制台。');
    exitCode = 1;
  } else {
    const lines = v.text.split('\n');
    for (const l of lines.slice(1)) if (!l.startsWith('PASS')) console.log(l);
    const jsErr = lines.find(l => l.startsWith('JSERRORS:'));
    console.log('');
    console.log(`断言 ${v.total} 项，失败 ${v.failed} 项`);
    console.log(jsErr || '');
    if (loadErrs.length) console.log('加载期错误（模块加载时就抛的）：\n  ' + loadErrs.join('\n  '));
    if (exceptions.length) console.log('运行期未捕获异常：\n  ' + exceptions.join('\n  '));
    if (consoleErrors.length) console.log('控制台错误：\n  ' + consoleErrors.join('\n  '));
    const bad = v.failed > 0 || consoleErrors.length > 0 || exceptions.length > 0 || loadErrs.length > 0 ||
      (jsErr && jsErr.indexOf('none') < 0);
    exitCode = bad ? 1 : 0;
    console.log(exitCode === 0 ? '\n全部通过 ✅' : '\n有失败 ❌');
  }
  try { ws.close(); } catch (e) {}
} catch (err) {
  console.error('运行出错：', err.message);
} finally {
  child.kill();
  if (!KEEP){
    try { unlinkSync(TMP); } catch (e) {}
  } else {
    console.log('\n临时页面保留在 ' + TMP);
  }
}
process.exit(exitCode);
