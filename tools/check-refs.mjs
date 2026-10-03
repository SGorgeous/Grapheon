/* 抓「调用了根本不存在的函数」
   ─────────────────────────────────────────────────────────────
   起因：我把 pushUndo 和 pushHist 搞混，发了两个坏功能
   （变量节点的 ＋ 按钮、CSV 导入），全靠用户碰到才发现。

   做法：收齐 src/ 里所有定义的名字（含缩进的、解构的），
   再扫所有 `名字(` 的调用点，报出「叫了但哪里都没定义」的。

   三处要当心（第一版全踩了）：
     ① 跨行的块注释要先整段去掉，否则注释里举的例子会被当成调用
     ② 定义可能在缩进里（demo.js 里一堆缩进写的 const 箭头函数）
     ③ 浏览器内建的白名单要够全，否则满屏误报

   它抓到过的真 bug（不是理论上的）：
     · pushUndo —— 项目里只有 pushHist，变量节点的 ＋ 按钮和 CSV 导入全废
     · insertImageBlob —— src/ 里**从来没有定义过**，素材库点「插入」图片必崩

   ⚠ 已知误报（还剩 4 个，都不影响它抓真 bug）：
     · res / rej      —— new Promise((res, rej) => …) 的形参
     · rgba           —— 出现在字符串里，字符串没抹干净
     · run            —— 同一行里的对象方法简写 { … , run(){ … } }
   所以它**只报不退**，是给人看的清单，不是门禁。 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d, out = []) => {
  for (const f of readdirSync(d)){
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
};

/* 去掉块注释和行注释，**保持行数不变**（行号才对得上） */
function stripComments(src){
  let s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  s = s.replace(/^([ \t]*)\/\/.*$/gm, '$1');
  s = s.replace(/([^:'"\\])\/\/[^\n]*$/gm, '$1');
  return s;
}

const files = walk('src');
const defs = new Set();
const calls = [];

for (const f of files){
  const src = stripComments(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  const lines = src.split('\n');
  for (const l of lines){
    let m;
    /* ★ 允许缩进 —— demo.js 里一堆缩进的 const 箭头函数 */
    if ((m = l.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/))) defs.add(m[1]);
    else if ((m = l.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/))) defs.add(m[1]);
    else if ((m = l.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/))) defs.add(m[1]);
    /* 解构：const { a, b } = … */
    if ((m = l.match(/^\s*(?:const|let|var)\s*\{([^}]*)\}\s*=/)))
      m[1].split(',').forEach(x => { const k = x.split(':').pop().trim(); if (k) defs.add(k); });
    /* ★ 对象方法的简写形式也算定义：async init(){ … } / ready(){ … } / get bindings(){ … }
       不加这条的话，「对象里定义一个方法」会被当成「调用了一个不存在的函数」。 */
    if ((m = l.match(/^\s*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/))
        && !/[=.)\]]\s*$/.test(l.slice(0, l.indexOf(m[1]))))
      defs.add(m[1]);
    /* 形参也算定义（函数内部调自己的参数） */
    if ((m = l.match(/^\s*(?:async\s+)?function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/))){
      m[1].split(',').forEach(x => { const k = x.trim().split('=')[0].trim(); if (/^[A-Za-z_$][\w$]*$/.test(k)) defs.add(k); });
    }
  }
}

/* 浏览器 / 语言内建 —— 宁可列全，也别误报 */
const BUILTIN = new Set(`if for while switch catch return typeof function new do else try
Object Array String Number Boolean Math JSON Date Map Set WeakMap WeakSet RegExp Promise Error
Symbol BigInt Proxy Reflect BigInt64Array BigUint64Array Float32Array Float64Array Int8Array
Int16Array Int32Array Uint8Array Uint8ClampedArray Uint16Array Uint32Array ArrayBuffer SharedArrayBuffer
DataView parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent encodeURI decodeURI
setTimeout clearTimeout setInterval clearInterval setImmediate requestAnimationFrame cancelAnimationFrame
requestIdleCallback cancelIdleCallback queueMicrotask structuredClone fetch alert confirm prompt
console performance getComputedStyle matchMedia reportError
Blob File FileReader URL URLSearchParams FormData Headers Request Response AbortController
TextEncoder TextDecoder btoa atob Image Audio Option Path2D DOMMatrix DOMPoint DOMRect
Event CustomEvent KeyboardEvent MouseEvent PointerEvent TouchEvent WheelEvent DragEvent
DOMParser XMLSerializer Node Element HTMLElement HTMLCanvasElement HTMLInputElement
WebSocket Worker SharedWorker MessageChannel BroadcastChannel FontFace ResizeObserver
MutationObserver IntersectionObserver PerformanceObserver ReportingObserver
OffscreenCanvas ImageBitmap createImageBitmap
sort map filter forEach reduce reduceRight find findIndex findLast some every join split
slice splice push pop shift unshift indexOf lastIndexOf includes startsWith endsWith
trim trimStart trimEnd replace replaceAll match matchAll search charAt charCodeAt codePointAt
padStart padEnd repeat toUpperCase toLowerCase toFixed toPrecision toExponential
toString valueOf concat keys values entries has get set delete add clear
then catch finally apply call bind test exec
abs floor ceil round min max pow sqrt sign random cbrt trunc hypot log log2 log10 exp
now stringify parse isArray from of assign freeze defineProperty getOwnPropertyNames
create getPrototypeOf setPrototypeOf toISOString getTime toLocaleTimeString toLocaleDateString
getFullYear getMonth getDate getHours getMinutes getSeconds setFullYear setMonth setDate
appendChild removeChild replaceChildren querySelector querySelectorAll getElementById
addEventListener removeEventListener dispatchEvent preventDefault stopPropagation
setAttribute getAttribute removeAttribute classList getBoundingClientRect focus blur click
remove append prepend insertBefore contains closest matches scrollIntoView setPointerCapture
releasePointerCapture hasPointerCapture setSelectionRange select insertAdjacentHTML
insertAdjacentElement replaceWith after before toggle item namedItem cloneNode normalize
getContext toDataURL toBlob drawImage fillText strokeText measureText beginPath closePath
moveTo lineTo arc arcTo rect fill stroke save restore translate scale rotate clip setLineDash
createLinearGradient createRadialGradient createPattern ellipse bezierCurveTo quadraticCurveTo
setTransform resetTransform transform isPointInPath getImageData putImageData createImageData
readAsText readAsDataURL readAsArrayBuffer open send abort revokeObjectURL createObjectURL
requestFullscreen exitFullscreen writeText readText getFile text arrayBuffer json blob
resolve reject all race allSettled any flat flatMap at copyWithin reverse toReversed
localeCompare isInteger toPrecision max min hypot sin cos tan atan2 sign fround clz32 imul
scrollTo scrollBy postMessage close terminate makeCurrent setLineDash
writeText readText showSaveFilePicker showDirectoryPicker`
  .split(/\s+/).filter(Boolean));

for (const f of files){
  const src = stripComments(readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
  src.split('\n').forEach((l, i) => {
    const re = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(l))){
      const name = m[2];
      if (BUILTIN.has(name) || defs.has(name)) continue;
      if (/^(if|for|while|switch|catch|return|typeof|new|do|else|try|in|of|case|delete|void|yield|await|async)$/.test(name)) continue;
      calls.push({ name, file:f, line:i + 1, text:l.trim().slice(0, 74) });
    }
  });
}

const unknown = new Map();
for (const c of calls){
  if (!unknown.has(c.name)) unknown.set(c.name, []);
  if (unknown.get(c.name).length < 3) unknown.get(c.name).push(c);
}
console.log('扫了 ' + files.length + ' 个文件 / 顶层与局部定义 ' + defs.size + ' 个 / 调用点 ' + calls.length + ' 个');
console.log('');
if (!unknown.size){ console.log('★ 没有「叫了但没定义」的函数 ✓'); process.exit(0); }
console.log('★ 可疑：以下名字在 src/ 里找不到定义（拼错？名字记混？）');
console.log('');
for (const [name, list] of [...unknown].sort()){
  console.log('  ' + name);
  for (const c of list) console.log('      ' + c.file + ':' + c.line + '   ' + c.text);
}
/* 注意：这个检查**有已知误报**（局部箭头函数、解构出来的名字等），
   所以只报不退 —— 它是给人看的清单，不是门禁。 */
process.exit(0);
