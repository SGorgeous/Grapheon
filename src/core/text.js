'use strict';
/* ==========================================================================
   GRAPHEON · core/text.js
   文本度量、中英混排换行、节点尺寸计算。

   默认字体是 GNU Unifont（16px 点阵网格，16px 时 ASCII 8px/字、CJK 16px/字）。
   节点可以自己指定字体和字号；一旦指定，就用那个字体量宽高、折行。
   ========================================================================== */

/* ---------------- 文本度量 ---------------- */
const mctx = document.createElement('canvas').getContext('2d');
const HAS_LS = ('letterSpacing' in mctx);
function setFont(g, size, weight, family){
  g.font = (weight || 'normal') + ' ' + size + 'px ' + (family || FONT);
  if (HAS_LS) { try { g.letterSpacing = '1px'; } catch(e){} }
}
const CJK = /[\u1100-\u11ff\u2e80-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/;
function tokenize(s){
  const out = []; let buf = '';
  for (const ch of s){
    if (CJK.test(ch) || ch === ' ' || ch === '\t'){
      if (buf){ out.push(buf); buf = ''; }
      out.push(ch);
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}
function wrapText(text, maxW, size, weight, family){
  setFont(mctx, size, weight, family);
  const lines = [];
  for (const para of String(text == null ? '' : text).split('\n')){
    const toks = tokenize(para);
    let line = '';
    for (const t of toks){
      if (line && mctx.measureText((line + t).replace(/\s+$/,'')).width > maxW){
        lines.push(line.replace(/\s+$/,''));
        line = (t === ' ' || t === '\t') ? '' : t;
      } else line += t;
    }
    lines.push(line.replace(/\s+$/,''));
  }
  if (!lines.length) lines.push('');
  return lines;
}
/* 图片节点：尺寸由「名称带 + 图片（按原始比例）+ 描述」叠出来。
   拖右下角改宽度时图片等比缩放，高度自己跟着走。 */
function sizeImageNode(n){
  const natW = (+n.imgW > 0) ? +n.imgW : 4;
  const natH = (+n.imgH > 0) ? +n.imgH : 3;
  let w = (+n.fixedW > 0) ? Math.max(IMG_MIN_W, +n.fixedW)
                          : Math.min(IMG_MAX_W, Math.max(IMG_MIN_W, natW));
  w = Math.round(w);
  const imgH = Math.max(24, Math.round(natH * (w / natW)));
  n.imgDrawW = w;
  n.imgDrawH = imgH;
  const desc = String(n.desc == null ? '' : n.desc);
  n.lines = desc ? wrapText(desc, w - PADX * 2, FS, 'normal', FONT) : [];
  n.lh = Math.round(FS * 1.32);
  n.fs = FS; n.fw = 'normal'; n.fam = FONT;
  const descH = n.lines.length ? n.lines.length * n.lh + PADY * 2 : 0;
  n.w = w;
  n.h = IMG_NAME_H + imgH + descH;
}
/* 嵌入节点：尺寸完全手动（里面那张缩略图会等比铺满） */
function sizeEmbedNode(n){
  n.w = Math.round(Math.max(EMBED_MIN_W, +n.fixedW || EMBED_DEF_W));
  n.h = Math.round(Math.max(EMBED_MIN_H, +n.fixedH || EMBED_DEF_H));
  n.lines = [];
  n.lh = Math.round(FS * 1.32);
  n.fs = FS; n.fw = 'normal'; n.fam = FONT;
}
function sizeNode(n){
  if (n.kind === 'image'){ sizeImageNode(n); return; }
  if (n.kind === 'embed'){ sizeEmbedNode(n); return; }
  const size = nodeFontSize(n);
  const family = nodeFontFamily(n);
  const weight = 'normal';   // Unifont 无粗体；统一不用合成粗体
  setFont(mctx, size, weight, family);
  const raw = String(n.text == null ? '' : n.text);
  let natural = 0;
  for (const p of raw.split('\n')) natural = Math.max(natural, mctx.measureText(p).width);

  const dia  = n.shape === 'diamond';
  const big  = !!n.big;
  const cap  = (big ? MAXW + 90 : MAXW) * (dia ? 1.5 : 1);
  const need = natural + PADX * 2 + 14;
  let w = Math.max(big ? 210 : MINW, Math.min(cap, need * (dia ? 1.6 : 1)));
  // 手动拖过尺寸就用固定值；文字仍然按这个宽度重新折行
  if (n.fixedW) w = Math.max(MIN_FIXED_W, n.fixedW);
  n.w = Math.round(w);

  const avail = dia ? n.w * 0.54 : n.w - PADX * 2;
  n.lines = wrapText(raw, avail, size, weight, family);
  n.lh  = Math.round(size * 1.32);
  n.fs  = size;          // 实际用的字号（供绘制用）
  n.fw  = weight;
  n.fam = family;
  let h = n.lines.length * n.lh + PADY * 2;
  if (dia) h = Math.max(h, n.w * 0.52);
  h = Math.max(big ? 68 : MINH, h);
  if (n.fixedH) h = Math.max(MIN_FIXED_H, n.fixedH);
  n.h = Math.round(h);
}
