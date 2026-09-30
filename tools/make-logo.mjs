'use strict';
/* 生成 Grapheon 的全套标识。
   改这里的常量就能重出：颜色 / 描边 / 节点大小 / 字号 / 间距。

   设计：G = 一条**正交折线**（就是画布上那种直角走线）+ 两端的**方形节点**。
   小尺寸另有一套简化版（去掉方块，用强调色的一小段保住身份）——
   方块在 ≤24px 下会和描边粘成一坨，实测 16px 完全认不出。 */
import { writeFileSync, mkdirSync } from 'node:fs';

/* ---- 可调项 ---- */
const INK = '#ffffff';          // 主色：和棋盘主题的 --w 一致
const ACCENT = '#ffd800';       // 强调色：和棋盘主题的 --y 一致
const BG = '#000000';
const MARK = 72;                // 标记的逻辑尺寸
const S = 9;                    // 骨架描边粗细
const NODE = 18;                // 节点方块边长
const PX = 9;                   // 字标一个像素的大小（5×7 字模）
const GAP = 30;                 // 标记和字标之间的距离

/* ---- 5×7 像素字模，手绘 ---- */
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
const WORD = 'GRAPHEON';
const LETTER_W = 5 * PX, LETTER_H = 7 * PX, LETTER_GAP = PX;

function wordmarkRects(){
  const out = [];
  let x = 0;
  for (const ch of WORD){
    const g = FONT[ch];
    for (let r = 0; r < 7; r++)
      for (let c = 0; c < 5; c++)
        if (g[r][c] === '#')
          out.push(`<rect x="${x + c * PX}" y="${r * PX}" width="${PX}" height="${PX}"/>`);
    x += LETTER_W + LETTER_GAP;
  }
  return { svg: out.join(''), width: x - LETTER_GAP };
}

/* 骨架的路径。一笔就是 G：上边 → 左边 → 下边 → 右边往上 → 中间那一横。
   右边只走到 y=41 就停 —— 那个缺口正好是 G 的嘴。 */
const G_PATH = (P) => `M${P(63)} ${P(9)} H${P(9)} V${P(63)} H${P(63)} V${P(41)} H${P(41)}`;
const ACCENT_SEG = (P) => `M${P(63)} ${P(9)} H${P(30)}`;

/* ---- 完整标记（≥32px 用）：折线 + 两端方块 ---- */
function markSVG(x0, y0, size){
  const k = size / MARK;
  const P = (v) => (v * k).toFixed(2);
  const X = (v) => (x0 + v * k).toFixed(2);
  const Y = (v) => (y0 + v * k).toFixed(2);
  const half = NODE / 2;
  const node = (cx, cy, c) =>
    `<rect x="${X(cx - half)}" y="${Y(cy - half)}" width="${P(NODE)}" height="${P(NODE)}"` +
    ` fill="${c}" shape-rendering="crispEdges"/>`;
  return `
  <!-- G 的骨架：正交折线。走线就是画布上那套直角路由 -->
  <path d="${G_PATH(P)}" fill="none" stroke="${INK}" stroke-width="${P(S)}"
        stroke-linecap="butt" stroke-linejoin="miter" shape-rendering="crispEdges"/>
  <!-- 两端各一个方形节点。右上那个是强调色，代表「输出端」 -->
  ${node(63, 9, ACCENT)}
  ${node(41, 41, INK)}`;
}

/* ---- 简化标记（≤24px 用）：没有方块，改用强调色的一小段 ---- */
function markSmallSVG(x0, y0, size){
  const k = size / MARK;
  const P = (v) => (v * k).toFixed(2);
  const sw = P(11);                                  // 小尺寸下描边相对粗一点
  return `
  <path d="${G_PATH(P)}" transform="translate(${x0},${y0})" fill="none" stroke="${INK}"
        stroke-width="${sw}" stroke-linecap="butt" stroke-linejoin="miter"
        shape-rendering="crispEdges"/>
  <path d="${ACCENT_SEG(P)}" transform="translate(${x0},${y0})" fill="none" stroke="${ACCENT}"
        stroke-width="${sw}" stroke-linecap="butt" shape-rendering="crispEdges"/>`;
}

function svgWrap(w, h, body, label){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
     role="img" aria-label="${label}">
  <title>${label}</title>${body}
</svg>
`;
}

/* ---- 拼装 ---- */
const wm = wordmarkRects();
const totalH = Math.max(MARK, LETTER_H);
const wmX = MARK + GAP;
const wmY = Math.round((totalH - LETTER_H) / 2);
const totalW = wmX + wm.width;
const wmGroup = `<g fill="${INK}" shape-rendering="crispEdges" transform="translate(${wmX},${wmY})">${wm.svg}</g>`;

/* ① 完整标识 */
writeFileSync('assets/logo.svg', svgWrap(totalW, totalH,
  markSVG(0, 0, MARK) + '\n  ' + wmGroup, 'Grapheon'));

/* ② 只要标记 */
writeFileSync('assets/logo-mark.svg', svgWrap(MARK, MARK, markSVG(0, 0, MARK), 'Grapheon'));

/* ③ 小尺寸专用（favicon / 头像） */
writeFileSync('assets/logo-mark-small.svg', svgWrap(32, 32, markSmallSVG(0, 0, 32), 'Grapheon'));

/* ④ 深色底预览：完整标识 + 一排小尺寸检验 */
const pad = 36;
const smalls = [48, 32, 24, 16];
let sx = 0;
const smallRow = smalls.map((s) => {
  const y = (48 - s) / 2;
  const el = markSmallSVG(sx, y, s);
  sx += s + 14;
  return el;
}).join('');
const previewH = totalH + pad * 3 + 30;
writeFileSync('assets/logo-preview.svg', svgWrap(totalW + pad * 2, previewH, `
  <rect width="100%" height="100%" fill="${BG}"/>
  <g transform="translate(${pad},${pad})">
    ${markSVG(0, 0, MARK)}
    ${wmGroup}
  </g>
  <g transform="translate(${pad},${totalH + pad + 26})">${smallRow}</g>
  <text x="${pad + sx + 6}" y="${totalH + pad + 26 + 30}" fill="#777777"
        font-size="13" font-family="monospace">${smalls.join(' / ')} px</text>
`, 'Grapheon'));

console.log('写出 logo.svg / logo-mark.svg / logo-mark-small.svg / logo-preview.svg');
console.log('完整标识 ' + totalW + '×' + totalH);
