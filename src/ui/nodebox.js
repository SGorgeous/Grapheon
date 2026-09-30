'use strict';
/* ==========================================================================
   GRAPHEON · ui/nodebox.js
   节点面板：程序算符（程序节点才有）+ 外观（字号 / 字体 / 字色 / 外框色 / 尺寸）。

   选中节点后右键 →「节点样式…」或直接按 E 打开。
   所有外观项都能选「默认」，意思是跟随主题（换主题时会一起变）；
   显示出来的是**有效值** —— 被程序节点改过的话，这里显示的就是改过之后的。
   ========================================================================== */

const nodeBoxEl = document.getElementById('nodebox');
const nbSubEl    = document.getElementById('nbSub');
const nbProgEl   = document.getElementById('nbProg');
const nbOpEl     = document.getElementById('nbOp');
const nbKeyEl    = document.getElementById('nbKey');
const nbKeyRowEl = document.getElementById('nbKeyRow');
const nbModeEl   = document.getElementById('nbMode');
const nbModeRowEl= document.getElementById('nbModeRow');
const nbValEl    = document.getElementById('nbVal');
const nbHitsEl   = document.getElementById('nbHits');
const nbFsEl     = document.getElementById('nbFs');
const nbFontEl   = document.getElementById('nbFont');
const nbColorEl  = document.getElementById('nbColor');
const nbBorderEl = document.getElementById('nbBorder');
const nbSizeEl   = document.getElementById('nbSize');
const nbProgBtn  = document.getElementById('nbProgToggle');
const nbVarSecEl = document.getElementById('nbVarSec');
const nbVarScopeEl = document.getElementById('nbVarScope');
const nbVarTypeEl  = document.getElementById('nbVarType');
const nbOprSecEl   = document.getElementById('nbOprSec');
const nbOprKindEl  = document.getElementById('nbOprKind');
const nbOprTypeEl  = document.getElementById('nbOprType');
const nbPrioEl     = document.getElementById('nbPrio');
const nbVarCtrlEl  = document.getElementById('nbVarCtrl');
const nbSlideRowEl = document.getElementById('nbSlideRow');
const nbSlideMinEl = document.getElementById('nbSlideMin');
const nbSlideMaxEl = document.getElementById('nbSlideMax');
const nbSlideStepEl = document.getElementById('nbSlideStep');
const CTRL_OPTS = VAR_CONTROLS.map(c => [c, VAR_CONTROL_LABEL[c]]);
const SCOPE_OPTS = VAR_SCOPES.map(s => [s, VAR_SCOPE_LABEL[s]]);
const VTYPE_OPTS = VAR_TYPES.map(x => [x, VAR_TYPE_LABEL[x]]);
const OPR_OPTS   = OPERATORS.map(o => [o.id, o.label]);   // 走注册表，以后加算符这里自动跟上
const PRIO_OPTS  = [[1000, '最高 1000'], [100, '100'], [10, '10'], [0, '默认']];
let nbNodeId = null;

const FS_OPTS    = NODE_FS_CHOICES.map(v => [v, NODE_FS_LABEL(v)]);
/* 字体列表在打开面板时才算：从文件加载的自定义字体要能立刻出现在里面 */
const OP_OPTS    = PROGRAM_OPS.map(o => [o, PROGRAM_OP_LABEL[o]]);
const MODE_OPTS  = PROGRAM_MODES.map(m => [m, PROGRAM_MODE_LABEL[m]]);
const SHAPE_OPTS = SHAPES.map(s => [s, SHAPE_LABEL[s]]);
/* 数值预设：手输太慢，常用量直接点 */
const PROG_PRESETS = {
  fsAdd: [-16, -8, -4, 4, 8, 16],
  fsSet: [16, 24, 32, 48],
  move:  [-120, -60, -20, 20, 60, 120],
  value: [-10, -5, -1, 1, 5, 10]
};

function openNodeBox(n){
  if (!n){ say('* 先选中一个节点。'); return; }
  hideCtx(); closeHelp(); closeExport();
  if (typeof closeEdgeBox === 'function') closeEdgeBox();
  if (typeof closeEndBox === 'function') closeEndBox();
  nbNodeId = n.id;
  selectOnly(n.id);
  renderNodeBox();
  nodeBoxEl.style.display = 'block';
  mark();
}
function closeNodeBox(){ nodeBoxEl.style.display = 'none'; nbNodeId = null; mark(); }

function renderNodeBox(){
  const n = byId(nbNodeId);
  if (!n){ closeNodeBox(); return; }
  const prog = isProgram(n);
  nbSubEl.textContent = (prog ? '程序节点「' : '节点「') + (n.text || '未命名') + '」 · ' +
    n.w + ' × ' + n.h + (n.fixedW || n.fixedH ? '（手动尺寸）' : '（随文字自适应）');
  nbProgBtn.textContent = prog ? '转回普通节点' : '转成程序节点';

  // ---- 变量定义 ----
  const isVar = (n.kind === 'var' || n.kind === 'broadcast'), isOpr = n.kind === 'op';
  nbVarSecEl.style.display = isVar ? 'block' : 'none';
  nbOprSecEl.style.display = isOpr ? 'block' : 'none';
  if (isVar){
    const v = normalizeVarDef(n.varDef);
    nbSubEl.textContent = '变量定义「' + v.name + '」 · 别的节点文本里用 {' + v.name + '} 引用';
    buildOpts(nbVarScopeEl, SCOPE_OPTS, v.scope, (x) => {
      setVarDef(n, { scope:x }); afterNodeEdit();
      say('* 作用域：' + VAR_SCOPE_LABEL[x] + '（' + (x === 'global' ? '哪儿都能用'
        : x === 'local' ? '只有它的下游能用' : '把它连到一个分组，组内才能用') + '）');
    });
    buildOpts(nbVarTypeEl, VTYPE_OPTS, v.type, (x) => { setVarDef(n, { type:x }); afterNodeEdit(); });
    buildOpts(nbVarCtrlEl, CTRL_OPTS, v.control, (x) => {
      setVarControl(n, x);
      renderNodeBox();
      say('* 控件改成「' + VAR_CONTROL_LABEL[x] + '」。' + (x === 'cond'
        ? '它放在连接中间：关掉之后这条连接逻辑上就断了。'
        : x === 'check' ? '点方框勾选，右键「编辑选项…」加减选项。'
        : x === 'slider' ? '拖圆点实时改值。' : ''));
    });
    // 滑条才有上下限
    nbSlideRowEl.style.display = (v.control === 'slider') ? 'flex' : 'none';
    if (v.control === 'slider'){
      nbSlideMinEl.value = v.min; nbSlideMaxEl.value = v.max; nbSlideStepEl.value = v.step;
      for (const [el, key] of [[nbSlideMinEl, 'min'], [nbSlideMaxEl, 'max'], [nbSlideStepEl, 'step']]){
        el.onchange = () => { setSliderRange(n, { [key]: el.value }); renderNodeBox(); };
      }
    }
  }
  if (isOpr){
    const od = normalizeOpDef(n.opDef);
    nbSubEl.textContent = '运算节点 · 作用在从它上游流下来的变量值上';
    buildOpts(nbOprKindEl, OPR_OPTS, od.op, (x) => { setOpDef(n, { op:x }); afterNodeEdit(); });
    buildOpts(nbOprTypeEl, VTYPE_OPTS, od.type, (x) => { setOpDef(n, { type:x }); afterNodeEdit(); });
  }
  // ---- 优先级（变量默认最高） ----
  const prio = priorityOf(n);
  nbPrioEl.parentElement.style.display = (isVar || isOpr || prog) ? 'flex' : 'none';
  const shown = (isVar && !n.priority) ? '最高 1000' : (isOpr && !n.priority) ? '100' : String(prio);
  buildOpts(nbPrioEl, PRIO_OPTS, (n.priority == null ? (isVar ? 1000 : isOpr ? 100 : 0) : n.priority),
    (x) => { setPriority(n, x); afterNodeEdit(); });
  nbPrioEl.title = '当前 ' + shown;
  // ---- 程序算符 ----
  nbProgEl.style.display = prog ? 'block' : 'none';
  if (prog) renderProgRows(n);

  // ---- 外观（读有效值：被程序节点改过就显示改过之后的） ----
  buildOpts(nbFsEl, FS_OPTS, effFsPx(n) || 0, (v) => { setNodeStyle(n, { fsPx: v || null }); afterNodeEdit(); });
  buildOpts(nbFontEl, Object.keys(NODE_FONTS).map(k => [k, NODE_FONT_LABEL[k]]), effFont(n) || 'auto', (v) => { setNodeStyle(n, { font: v }); afterNodeEdit(); });
  buildSwatches(nbColorEl, effColor(n), (v) => { setNodeStyle(n, { color: v }); afterNodeEdit(); });
  buildSwatches(nbBorderEl, effBorder(n), (v) => { setNodeStyle(n, { border: v }); afterNodeEdit(); });
  nbSizeEl.innerHTML = '';
  if (n.fixedW || n.fixedH){
    const d = el('div', 'opt on', '<span class="hrt"></span><span>恢复自适应尺寸</span>');
    d.onclick = () => { autoSizeNode(n); afterNodeEdit(); };
    nbSizeEl.appendChild(d);
  } else {
    nbSizeEl.appendChild(el('div', 'opt off', '<span class="hrt"></span><span>拖节点右下角手柄可改尺寸</span>'));
  }

  // ---- 这个节点身上叠了哪些算符 ----
  const hits = programHits(n.id);
  if (prog){
    nbHitsEl.textContent = doc.edges.some(e => e.s === n.id)
      ? '算符会沿着从它出发的连线叠加到目标上；多个程序节点按连线先后依次累加。'
      : '还没连到任何节点：从它拉一条线到目标节点，算符才会生效。';
  } else if (hits.length){
    const ev = effOf(n);
    nbHitsEl.textContent = '被 ' + hits.length + ' 个程序节点作用：' +
      hits.map(h => '「' + (h.text || '程序') + '」').join('、') +
      (ev && ev.value != null ? '　当前数值 = ' + ev.value : '');
  } else {
    nbHitsEl.textContent = '';
  }
}

/* 数值那一行长什么样，取决于算符改的是什么 */
function renderProgRows(n){
  const p = normalizeProgram(n.program);
  buildOpts(nbOpEl, OP_OPTS, p.op, (v) => {
    setProgram(n, { op:v, key:PROGRAM_KEYS[v][0][0], mode:(v === 'style' ? p.mode : 'add') });
    afterNodeEdit();
  });
  const keys = PROGRAM_KEYS[p.op];
  nbKeyRowEl.style.display = keys.length > 1 ? 'flex' : 'none';
  buildOpts(nbKeyEl, keys.map(k => [k[0], k[1]]), p.key, (v) => { setProgram(n, { key:v }); afterNodeEdit(); });
  // 形状 / 位置没有「累加还是覆盖」可言
  nbModeRowEl.style.display = (p.op === 'shape' || p.op === 'move') ? 'none' : 'flex';
  buildOpts(nbModeEl, MODE_OPTS, p.mode, (v) => { setProgram(n, { mode:v }); afterNodeEdit(); });

  nbValEl.innerHTML = '';
  if (p.op === 'style' && (p.key === 'color' || p.key === 'border')){
    buildSwatches(nbValEl, p.value, (v) => { setProgram(n, { value:v }); afterNodeEdit(); });
    return;
  }
  if (p.op === 'style' && p.key === 'font'){
    buildOpts(nbValEl, FONT_OPTS, p.value || 'auto', (v) => { setProgram(n, { value:v }); afterNodeEdit(); });
    return;
  }
  if (p.op === 'shape'){
    buildOpts(nbValEl, SHAPE_OPTS, p.value, (v) => { setProgram(n, { value:v }); afterNodeEdit(); });
    return;
  }
  const presetKey = (p.op === 'move') ? 'move'
                  : (p.key === 'fsPx') ? (p.mode === 'add' ? 'fsAdd' : 'fsSet')
                  : 'value';
  for (const v of PROG_PRESETS[presetKey]){
    const d = el('div', 'opt' + (p.value === v ? ' on' : ''),
      '<span class="hrt"></span><span>' + (v >= 0 ? '+' : '') + v + '</span>');
    d.onclick = () => { setProgram(n, { value:v }); afterNodeEdit(); };
    nbValEl.appendChild(d);
  }
  const inp = el('input', 'ud-input nbnum');
  inp.type = 'text';
  inp.value = String(p.value);
  inp.title = '也可以直接填一个数';
  inp.onchange = () => { setProgram(n, { value:Math.round(+inp.value) || 0 }); afterNodeEdit(); };
  nbValEl.appendChild(inp);
}

function afterNodeEdit(){
  renderNodeBox();
  const n = byId(nbNodeId);
  if (n){
    if (isProgram(n)) say('* 程序节点：' + programLabel(n.program));
    else {
      const hits = programHits(n.id);
      const ev = effOf(n);
      const extra = (ev && ev.value != null) ? '（数值 = ' + ev.value + '）' : '';
      say('* 节点外观：' + nodeStyleText(n) + (hits.length ? '　被 ' + hits.length + ' 个程序节点作用' + extra : ''));
    }
  }
  pushHist();
  mark();
}
document.getElementById('nbClose').onclick = closeNodeBox;
document.getElementById('nbReset').onclick = () => {
  const n = byId(nbNodeId);
  if (n){ resetNodeStyle(n); renderNodeBox(); pushHist(); }
};
nbProgBtn.onclick = () => {
  const n = byId(nbNodeId);
  if (!n) return;
  toggleProgramNode(n);
  renderNodeBox();
  mark();
};
