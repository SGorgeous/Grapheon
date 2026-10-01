'use strict';
/* 扫 canvas 的 save() / restore() 配对。
   失衡会让一部分绘制跑出世界变换 —— 症状是「节点悬浮、缩放不动」，
   没有报错，只能靠这个查。用法：node tools/check-balance.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
function walk(d, out = []){
  for (const f of readdirSync(d)){
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p, out); else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
let bad = 0;
for (const f of walk('src')){
  const lines = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let cur = null, saves = 0, restores = 0, depth = 0;
  const flush = () => {
    if (cur && saves !== restores){
      console.log('  ✗ ' + f.replace(/\\/g, '/') + ' :: ' + cur
        + '  save=' + saves + ' restore=' + restores + '（差 ' + (saves - restores) + '）');
      bad++;
    }
  };
  for (let i = 0; i < lines.length; i++){
    const ln = lines[i];
    const m = ln.match(/^(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\(|function))/);
    if (m && depth === 0){ flush(); cur = m[1] || m[2]; saves = 0; restores = 0; }
    if (cur){
      saves += (ln.match(/\b(?:g|ctx|g2)\.save\(\)/g) || []).length;
      restores += (ln.match(/\b(?:g|ctx|g2)\.restore\(\)/g) || []).length;
    }
    for (const ch of ln){ if (ch === '{') depth++; else if (ch === '}') depth--; }
  }
  flush();
}
console.log(bad ? ('有 ' + bad + ' 处失衡') : '所有 save / restore 都配平 ✓');
process.exit(bad ? 1 : 0);
