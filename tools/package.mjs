'use strict';
/* 打一个能直接跑的包。
   ─────────────────────────────────────────────────────────────
   这个项目**没有构建步骤** —— 运行时只要 index.html + src + styles + assets。
   （Unifont 是系统字体，走 font-family 的 fallback，没有字体文件要带。）

   用法：node tools/package.mjs
   产物：dist/Grapheon-DEV003/   —— 双击里面的「启动.cmd」就能跑
        再用 tools 里的提示压成 zip */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const VER = 'DEV006';
const OUT = join('dist', 'Grapheon-' + VER);

/* 运行时真正要的东西 */
const COPY = [
  ['index.html', 'index.html'],
  ['styles', 'styles'],
  ['src', 'src'],
];
/* 只有这个是运行时真要的（index.html 的 favicon）。
   另外三个 SVG 是 make-logo.mjs 的输出、没被任何页面引用，已经归档到 archive/assets/。 */
const ASSETS = ['logo-mark-small.svg'];

/* 说明性的（带上，方便别人看懂这是什么） */
const DOCS = [
  ['README.md', 'README.md'],
  ['VERSION.md', 'VERSION.md'],
  ['启动.cmd', '启动.cmd'],
  /* README 里引用到的图 —— 不带的话打开 README 图全是裂的。
     只放被引用的那几张，其它界面快照已经归档到 archive/ 了。 */
  ['docs-structure.png', 'docs-structure.png'],
  ['docs-var-types.png', 'docs-var-types.png'],
  ['docs-var-panel.png', 'docs-var-panel.png'],
  /* ★ 下面这些 README 也引用了 —— 不带的话包里的 README 图是裂的。
     以前只带了三张，加图的时候忘了同步这里。 */
  ['docs-menu.png', 'docs-menu.png'],
  ['docs-csv.png', 'docs-csv.png'],
  ['docs-multivar-node.png', 'docs-multivar-node.png'],
  ['docs-theme-paper.png', 'docs-theme-paper.png'],
  ['docs-theme-ripple.png', 'docs-theme-ripple.png'],
  ['docs-blank.png', 'docs-blank.png'],
  ['docs-clip.png', 'docs-clip.png'],
];

function walk(dir, out = []){
  for (const f of readdirSync(dir)){
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const [from, to] of COPY){
  if (!existsSync(from)){ console.log('  ✗ 缺 ' + from); process.exit(1); }
  cpSync(from, join(OUT, to), { recursive: true });
}
for (const [from, to] of DOCS){
  if (!existsSync(from)){ console.log('  ! 跳过 ' + from); continue; }
  cpSync(from, join(OUT, to));
  const d = dirname(join(OUT, to));
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

mkdirSync(join(OUT, 'assets'), { recursive: true });
for (const a of ASSETS){
  const p = join('assets', a);
  if (!existsSync(p)){ console.log('  ! 缺素材 ' + p); continue; }
  cpSync(p, join(OUT, 'assets', a));
}

/* 包里的说明（比 README 短，只讲怎么跑） */
writeFileSync(join(OUT, '怎么用.txt'),
`Grapheon ${VER} —— 节点与连线
================================

怎么启动
--------
双击本文件夹里的「启动.cmd」。
它会用你的默认浏览器打开 index.html。

（也可以直接双击 index.html —— 效果一样。）

没有安装步骤、没有构建步骤、不需要联网。
整个文件夹拷到哪都能跑。

怎么保存
--------
· 「保存」按钮下载一个 .json，下次用「打开」读回来
· 浏览器里也有自动保存
· 素材库（图片 / 文件 / 主题）在「设置 → 素材库」里，
  它可能要求你选一个本地文件夹来存

想改点什么
----------
源码就在 src/ 里，全是普通 .js，没有打包、没有编译。
index.html 里按顺序引它们，**加载顺序就是依赖顺序**。

按 ? 看全部快捷键。

随机附带一份示例：「新建 → 示例：全部功能」。
`);

const files = walk(OUT);
const bytes = files.reduce((a, f) => a + statSync(f).size, 0);
console.log('打出 ' + OUT);
console.log('  ' + files.length + ' 个文件 / ' + Math.round(bytes / 1024) + ' KB');
for (const [from] of COPY) console.log('  · ' + from);
console.log('  · assets/(' + ASSETS.join(' ') + ')');
console.log('  · 启动.cmd  怎么用.txt  README.md  VERSION.md');
console.log('');
console.log('压成 zip：');
console.log('  Compress-Archive -Path "' + OUT + '" -DestinationPath "dist/Grapheon-' + VER + '.zip" -Force');
