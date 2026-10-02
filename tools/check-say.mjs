'use strict';
/* 检查所有 say() 的提示语合不合统一写法。
   用法：node tools/check-say.mjs
   ─────────────────────────────────────────────────────────────
   规矩（底栏只有一行，写不下教程）：
     ① 一律以 '* ' 开头
     ② 一句话，别超过 28 字
     ③ 结尾用 '。'（后面接变量的除外，那种按字面量前缀看）
     ④ 不写快捷键 —— 方向键 / WASD / Tab / Enter / Esc / Space / Ctrl / Shift
        这些去帮助面板（按 H）
   退出码 0 = 全合规。 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAXLEN = 28;
const DYNLEN = 40;   // 带拼接的放宽一点（动态内容长短不一）
const OLDNAMES = ['程序节点', '运算节点', '通路节点', '滑条节点', '程序化节点'];
const KEYWORDS = ['方向键', 'WASD', 'Tab ', 'Enter ', 'Esc', 'Space', 'Ctrl', 'Shift', '按 E', '按 H'];

function walk(d, out = []){
  for (const f of readdirSync(d)){
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
/* 把 say( ... ) 里所有字符串字面量拼起来，近似还原文案 */
function sayTexts(file){
  const s = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const out = [];
  const re = /say\(/g; let m;
  while ((m = re.exec(s))){
    let i = m.index + 4, d = 1, start = i;
    while (i < s.length && d > 0){
      const c = s[i];
      if (c === '(') d++;
      else if (c === ')') d--;
      else if (c === "'"){ i++; while (i < s.length && s[i] !== "'"){ if (s[i] === '\\') i++; i++; } }
      i++;
    }
    const body = s.slice(start, i - 1);
    if (body.indexOf("'* ") < 0) continue;         // 不是提示语（比如拼出来的别的函数调用）
    const lits = [...body.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]);
    const txt = lits.join('');
    if (!txt.startsWith('* ')) continue;
    const line = s.slice(0, m.index).split('\n').length;
    /* say(a ? '* 甲' : '* 乙') 会把两个分支拼在一起 —— 拆开分别检查 */
    const parts = txt.split(/(?=\* )/).filter(x => x.trim());
    for (const one of parts){
      out.push({ line, txt: one.trim(), dynamic: /['"]\s*\+/.test(body) });
    }
  }
  return out;
}

let bad = 0, total = 0;
const longest = [];
for (const f of walk('src')){
  const rel = f.replace(/\\/g, '/');
  for (const m of sayTexts(f)){
    total++;
    const problems = [];
    if (!m.txt.startsWith('* ')) problems.push('没有 "* " 前缀');
    /* 有拼接的按「静态那段」算长度，动态内容不算 */
    const staticLen = m.dynamic ? m.txt.split('{')[0].length : m.txt.length;
    const cap = m.dynamic ? DYNLEN : MAXLEN;
    if (m.txt.length > cap) problems.push('太长（' + m.txt.length + ' > ' + cap + '）');
    if (!m.dynamic && !/[。！？」]$/.test(m.txt)) problems.push('结尾不是句号');
    for (const k of KEYWORDS) if (m.txt.indexOf(k) >= 0) problems.push('写了快捷键「' + k.trim() + '」');
    for (const k of OLDNAMES) if (m.txt.indexOf(k) >= 0) problems.push('用了旧名字「' + k + '」');
    if (problems.length){
      console.log('  ✗ ' + rel + ':' + m.line);
      console.log('      ' + m.txt);
      console.log('      → ' + problems.join('、'));
      bad++;
    }
    longest.push({ len: m.txt.length, rel, line: m.line, txt: m.txt });
  }
}
longest.sort((a, b) => b.len - a.len);
console.log('');
console.log('提示语 ' + total + ' 条，' + (bad ? '有 ' + bad + ' 条不合规' : '全部合规 ✓'));
console.log('最长的 5 条：');
for (const x of longest.slice(0, 5)) console.log('  [' + x.len + '] ' + x.txt);
process.exit(bad ? 1 : 0);
