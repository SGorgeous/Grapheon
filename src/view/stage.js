'use strict';
/* ==========================================================================
   GRAPHEON · view/stage.js
   canvas 元素与 2D 上下文、DPR/视口尺寸。
   ========================================================================== */

/* ---------------- 画布 ---------------- */
const canvas = document.getElementById('stage');
const ctx    = canvas.getContext('2d');
let DPR = 1, VW = 0, VH = 0;

