'use strict';
/* ==========================================================================
   GRAPHEON · ui/nodebox.js
   节点面板：程序算符（外观节点才有）+ 外观（字号 / 字体 / 字色 / 外框色 / 尺寸）。

   选中节点后右键 →「节点样式…」或直接按 E 打开。
   所有外观项都能选「默认」，意思是跟随主题（换主题时会一起变）；
   显示出来的是**有效值** —— 被外观节点改过的话，这里显示的就是改过之后的。
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
const nbBodyRowEl  = document.getElementById('nbBodyRow');
const nbBodyEl     = document.getElementById('nbBody');
const nbBodyHintEl = document.getElementById('nbBodyHint');
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
  nbSubEl.textContent = (prog ? '外观节点「' : '节点「') + (n.text || '未命名') + '」 · ' +
    n.w + ' × ' + n.h + (n.fixedW || n.fixedH ? '（手动尺寸）' : '（随文字自适应）');
  nbProgBtn.textContent = prog ? '转回普通节点' : '转成外观节点';

  // ---- 变量定义 ----
  const isVar = (n.kind === 'var' || n.kind === 'broadcast'), isOpr = n.kind === 'op';
  nbVarSecEl.style.display = isVar ? 'block' : 'none';
  nbOprSecEl.style.display = isOpr ? 'block' : 'none';
  if (isVar){
    const v = normalizeVarDef(n.varDef);
    /* 面板上只留一小行身份说明；「怎么引用」这种教学挪进悬停提示 */
    nbSubEl.textContent = '变量 ' + v.name;
    nbSubEl.title = '别的节点文本里写 {' + v.name + '} 就能引用它';
    buildOpts(nbVarScopeEl, SCOPE_OPTS, v.scope, (x) => {
      setVarDef(n, { scope:x }); afterNodeEdit();
      say('* 作用域改成「' + VAR_SCOPE_LABEL[x] + '」。');
    });
    buildOpts(nbVarTypeEl, VTYPE_OPTS, v.type, (x) => { setVarDef(n, { type:x }); afterNodeEdit(); });
    buildOpts(nbVarCtrlEl, CTRL_OPTS, v.control, (x) => {
      setVarControl(n, x);
      renderNodeBox();
      say('* 类型改成「' + VAR_CONTROL_LABEL[x] + '」。');
    });
    // 滑条才有上下限
    nbSlideRowEl.style.display = (v.control === 'slider') ? 'flex' : 'none';
    if (v.control === 'slider'){
      nbSlideMinEl.value = v.min; nbSlideMaxEl.value = v.max; nbSlideStepEl.value = v.step;
      for (const [el, key] of [[nbSlideMinEl, 'min'], [nbSlideMaxEl, 'max'], [nbSlideStepEl, 'step']]){
        el.onchange = () => { setSliderRange(n, { [key]: el.value }); renderNodeBox(); };
      }
    }
    /* 内容编辑器放在 isVar 块**里面** —— v 是在这块里声明的 */
    /* ---- 勾选 / 列表 / 地图的「内容」----
       这三种以前只能在右键菜单里改，面板上没入口。
       清单用逗号、列表一行一项、地图一行一对 key=value —— 和右键里那套完全一致。 */
    if (isVar && (v.control === 'check' || v.control === 'list' || v.control === 'map')){
      nbBodyRowEl.style.display = 'flex';
      const fmt = (v.control === 'check') ? v.options.join(', ')
                : (v.control === 'list')  ? v.items.join('\n')
                : v.pairs.map(p => p.k + '=' + p.v).join('\n');
      nbBodyEl.value = fmt;
      nbBodyHintEl.textContent = (v.control === 'check') ? '用逗号分隔；勾中的拼成一串'
        : (v.control === 'list') ? '一行一项；用 {' + v.name + '.序号} 取第几项（序号从 0 开始）'
        : '一行一对 key=value；用 {' + v.name + '.键} 取值';
      nbBodyEl.onchange = () => {
        const raw = String(nbBodyEl.value);
        if (v.control === 'check'){
          const options = raw.split(',').map(x => x.trim()).filter(x => x !== '');
          setVarDef(n, { options, picked: v.picked.filter(i => i < options.length) });
        } else if (v.control === 'list'){
          const items = raw.split('\n').map(x => x.replace(/\r$/, ''));
          while (items.length && items[items.length - 1].trim() === '') items.pop();
          setVarDef(n, { items: items.length ? items : ['0', '1', '2'] });
        } else {
          const pairs = raw.split('\n').map(line => {
            const i = line.indexOf('=');
            return (i < 0) ? { k:line.trim(), v:'' }
                           : { k:line.slice(0, i).trim(), v:line.slice(i + 1).trim() };
          }).filter(p => p.k !== '' || p.v !== '');
          setVarDef(n, { pairs: pairs.length ? pairs : [{ k:'key', v:'value' }] });
        }
        afterNodeEdit();
      };
    } else {
      nbBodyRowEl.style.display = 'none';
      nbBodyEl.onchange = null;
    }
  } else {
    /* ★ 不是变量节点：**主动把这两行收掉**。
       以前这里什么都不做，于是「滑条 / 勾选」那两行会留着上一次的状态 ——
       选中一个普通文本节点，面板上还挂着上个变量的上下限输入框。 */
    nbSlideRowEl.style.display = 'none';
    nbBodyRowEl.style.display = 'none';
    nbBodyEl.onchange = null;
    nbSlideMinEl.onchange = null; nbSlideMaxEl.onchange = null; nbSlideStepEl.onchange = null;
  }
  if (isOpr){
    const od = normalizeOpDef(n.opDef);
    nbSubEl.textContent = '运算符节点 · 作用在从它上游流下来的变量值上';
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

  // ---- 外观（读有效值：被外观节点改过就显示改过之后的） ----
  buildOpts(nbFsEl, FS_OPTS, effFsPx(n) || 0, (v) => { setNodeStyle(n, { fsPx: v || null }); afterNodeEdit(); });
  buildOpts(nbFontEl, Object.keys(NODE_FONTS).map(k => [k, NODE_FONT_LABEL[k]]), effFont(n) || 'auto', (v) => { setNodeStyle(n, { font: v }); afterNodeEdit(); });
  buildSwatches(nbColorEl, effColor(n), (v) => { setNodeStyle(n, { color: v }); afterNodeEdit(); });
  buildSwatches(nbBorderEl, effBorder(n), (v) => { setNodeStyle(n, { border: v }); afterNodeEdit(); });
  /* 「尺寸」那行大多数时候**没有可操作的东西** —— 要么只有一句
     「拖节点右下角手柄可改尺寸」的说明（那不是控件），
     要么有个「恢复自适应尺寸」按钮。没按钮就把整行收掉，别白占一行。
     说明本身挂到悬停提示上。 */
  nbSizeEl.title = '拖节点右下角的手柄可以改尺寸';
  nbSizeEl.innerHTML = '';
  const sizeRow = nbSizeEl.parentElement;
  if (n.fixedW || n.fixedH){
    if (sizeRow) sizeRow.style.display = '';
    const d = el('div', 'opt on', '<span class="hrt"></span><span>恢复自适应尺寸</span>');
    d.onclick = () => { autoSizeNode(n); afterNodeEdit(); };
    nbSizeEl.appendChild(d);
  } else if (sizeRow){
    sizeRow.style.display = 'none';
  }

  // ---- 这个节点身上叠了哪些算符 ----
  const hits = programHits(n.id);
  if (prog){
    nbHitsEl.textContent = doc.edges.some(e => e.s === n.id)
      ? '算符会沿着从它出发的连线叠加到目标上；多个外观节点按连线先后依次累加。'
      : '还没连到任何节点：从它拉一条线到目标节点，算符才会生效。';
  } else if (hits.length){
    const ev = effOf(n);
    nbHitsEl.textContent = '被 ' + hits.length + ' 个外观节点作用：' +
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
  inp.title = '填数字，或者写 {变量}';
  inp.onchange = () => {
    const raw = String(inp.value).trim();
    /* ★ 含 { } 就**原样存字符串** —— 解析交给 resolveProgramValue 在求值时做。
       以前这里无条件 Math.round(+v)，{变量} 会被吃成 0。 */
    if (raw.indexOf('{') >= 0) setProgram(n, { value:raw });
    else setProgram(n, { value:Math.round(+raw) || 0 });
    afterNodeEdit();
  };
  nbValEl.appendChild(inp);

  /* ★ 数值类再来一条**滑条**（字号 / 偏移量）。滑条只出数字，
     想引用变量就填它上面那个框 —— 两条路并存。

     ⚠ 但**值本身是 {变量} 的时候，滑条必须停用**：
       以前照样渲染，Number('{倍数}') → 0，滑条就停在 0；
       更糟的是它还给 oninput 挂着，用户随手碰一下滑条，
       刚写好的 {变量} 就被一个数字冲掉了 —— 而且看不出是怎么没的。 */
  const isDelta = (p.mode === 'add');
  const isExpr = (typeof p.value === 'string' && p.value.indexOf('{') >= 0);
  const lo = isDelta ? -32 : 8, hi = isDelta ? 32 : 72;
  const numNow = isExpr ? (isDelta ? 0 : 16)
    : (typeof p.value === 'number') ? p.value : (Number(String(p.value).trim()) || 0);
  const rg = el('input', 'nbval-range');
  rg.type = 'range';
  rg.min = String(Math.min(lo, numNow));
  rg.max = String(Math.max(hi, numNow));
  rg.step = '1';
  rg.value = String(numNow);
  if (isExpr){
    rg.disabled = true;
    rg.title = '当前值写的是变量引用（' + p.value + '），滑条用不了 —— 把上面框里改回数字就恢复';
    rg.oninput = null; rg.onchange = null;
  } else {
    rg.disabled = false;
    rg.title = isDelta ? '拖动改增量（-32 ~ +32）' : '拖动改字号（8 ~ 72）';
    /* 拖动时**只重画不进历史** —— 一次拖动会触发几百下，进历史就没法撤销了。
       松手（change）才算一次编辑。 */
    rg.oninput = () => {
      inp.value = rg.value;
      setProgram(n, { value:+rg.value });
      reindex(); mark();
    };
    rg.onchange = () => afterNodeEdit();
  }
  nbValEl.appendChild(rg);
  if (isExpr){
    const note = el('div', 'sub nbexprnote', '↑ 值写的是变量引用，滑条已停用（改回数字就恢复）');
    nbValEl.appendChild(note);
  }
}

function afterNodeEdit(){
  renderNodeBox();
  const n = byId(nbNodeId);
  if (n){
    if (isProgram(n)) say('* ' + tagOf(n) + '：' + programLabel(n.program));
    else {
      const hits = programHits(n.id);
      const ev = effOf(n);
      const extra = (ev && ev.value != null) ? '（数值 = ' + ev.value + '）' : '';
      say('* ' + tagOf(n) + '：' + nodeStyleText(n) + (hits.length ? '（被 ' + hits.length + ' 个外观节点作用）' : ''));
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
