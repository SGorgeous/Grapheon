'use strict';
/* 生成 Grapheon 的 logo。
   设计：G = 一条**正交折线**（就是画布上那种直角走线）+ 两端的**方形节点**。
   字标用 Unifont 那套 5×7 像素字模手绘，和 App 里的像素风一致。 */
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = '#ffffff';          // 主色：和棋盘主题的 --w 一致
const ACCENT = '#ffd800';       // 强调色：和棋盘主题的 --y 一致
const BG = '#000000';

/* 5×7 像素字模，手绘 */
const FONT = {
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#']
};

const PX = 9;                   // 字标一个像素 9 个单位
const LETTER_W = 5 * PX, LETTER_H = 7 * PX, LETTER_GAP = PX;

function wordmarkRects(x0, y0){
  const out = [];
  let x = x0;
  for (const ch of 'GRAPHEON'){
    const g = FONT[ch];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r][c] === '#')
          out.push(`<rect x="${x + c * PX}" y="${y0 + r * PX}" width="${PX}" height="${PX}"/>`);
    x += LETTER_W + LETTER_GAP;
  }
  return { svg: out.join(''), width: x - LETTER_GAP - x0 };
}

/* 标记本体：72×72。
   一条正交折线画出 G 的骨架（和画布上的走线同一种语言），
   **两端各一个方形节点** —— 右上那个是强调色，代表「输出端」。 */
const MARK = 72, S = 9, NODE = 18;
function markSVG(x0, y0, size){
  const k = size / MARK;
  const P = (v) => (v * k).toFixed(2);
  const X = (v) => (x0 + v * k).toFixed(2);
  const Y = (v) => (y0 + v * k).toFixed(2);
  const half = NODE / 2;
  const nb = (n) => `<rect x="${X(n.x - half)}" y="${Y(n.y - half)}" width="${P(NODE)}" height="${P(NODE)}" fill="${n.c}" shape-rendering="crispEdges"/>`;
  // 折线两端的节点：右上（强调）/ 那一横的末端（主色）
  const n1 = { x:63, y:9, c:ACCENT };
  const n2 = { x:41, y:41, c:INK };
  return `
  <!-- G 的骨架：正交折线。走线就是画布上那套直角路由 -->
  <path d="M${P(63)} ${P(9)} H${P(9)} V${P(63)} H${P(63)} V${P(41)} H${P(41)}"
        fill="none" stroke="${INK}" stroke-width="${P(S)}"
        stroke-linecap="butt" stroke-linejoin="miter" shape-rendering="crispEdges"/>
  <!-- 两端各一个方形节点 -->
  ${nb(n1)}
  ${nb(n2)}`;
}

/* ---- 1) 完整标识：标记 + 字标 ---- */
const markBox = MARK;                    // 72
const wm = wordmarkRects(0, 0);
const gap = 30;
const totalH = Math.max(markBox, LETTER_H);
const wmX = markBox + gap;
const wmY = (totalH - LETTER_H) / 2;
const totalW = wmX + wm.width;

const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}"
     viewBox="0 0 ${totalW} ${totalH}" role="img" aria-label="Grapheon">
  <title>Grapheon</title>
${markSVG(0, (totalH - markBox) / 2, markBox)}
  <g fill="${INK}" shape-rendering="crispEdges" transform="translate(${wmX},${wmY})">${wm.svg}</g>
</svg>
`;

/* ---- 2) 只要标记（头像 / favicon）---- */
const markOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="${MARK}" height="${MARK}"
     viewBox="0 0 ${MARK} ${MARK}" role="img" aria-label="Grapheon">
  <title>Grapheon</title>
${markSVG(0, 0, MARK)}
</svg>
`;

/* ---- 3) 深色底预览 ---- */
const pad = 36;
const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW + pad * 2}" height="${totalH + pad * 2 + 70}"
     viewBox="0 0 ${totalW + pad * 2} ${totalH + pad * 2 + 70}">
  <rect width="100%" height="100%" fill="${BG}"/>
  <g transform="translate(${pad},${pad})">
    ${markSVG(0, (totalH - markBox) / 2, markBox)}
    <g fill="${INK}" shape-rendering="crispEdges" transform="translate(${wmX},${wmY})">${wm.svg}</g>
  </g>
</svg>
`;

mkdirSync('assets', { recursive: true });
writeFileSync('assets/logo.svg', full);
writeFileSync('assets/logo-mark.svg', markOnly);
writeFileSync('assets/logo-preview.svg', preview);
console.log('写出 assets/logo.svg / logo-mark.svg   尺寸 ' + totalW + '×' + totalH);
