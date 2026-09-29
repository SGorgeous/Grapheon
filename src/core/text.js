'use strict';
/* ==========================================================================
   GRAPHEON · core/text.js
   Unifont 文本度量、中英混排换行、节点尺寸计算。
   ========================================================================== */

/* ---------------- 文本度量 ---------------- */
const mctx = document.createElement('canvas').getContext('2d');
const HAS_LS = ('letterSpacing' in mctx);
function setFont(g, size, weight){
  g.font = (weight || 'normal') + ' ' + size + 'px ' + FONT;
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
function wrapText(text, maxW, size, weight){
  setFont(mctx, size, weight);
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
function sizeNode(n){
  const big = !!n.big;
  const size = big ? FS_BIG : FS;
  const weight = 'normal';   // Unifont 无粗体
  setFont(mctx, size, weight);
  const raw = String(n.text == null ? '' : n.text);
  let natural = 0;
  for (const p of raw.split('\n')) natural = Math.max(natural, mctx.measureText(p).width);

  const dia  = n.shape === 'diamond';
  const cap  = (big ? MAXW + 90 : MAXW) * (dia ? 1.5 : 1);
  const need = natural + PADX * 2 + 14;
  n.w = Math.round(Math.max(big ? 210 : MINW, Math.min(cap, need * (dia ? 1.6 : 1))));

  const avail = dia ? n.w * 0.54 : n.w - PADX * 2;
  n.lines = wrapText(raw, avail, size, weight);
  n.lh  = Math.round(size * 1.32);
  n.fs  = size;
  n.fw  = weight;
  let h = n.lines.length * n.lh + PADY * 2;
  if (dia) h = Math.max(h, n.w * 0.52);
  n.h = Math.round(Math.max(big ? 68 : MINH, h));
}

