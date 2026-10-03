'use strict';
/* ==========================================================================
   GRAPHEON · core/formula.js
   {=…} 里的公式求值 —— 类 Excel 的写法。

     {=单价 * 数量}
     {=IF(数量 > 10, 批发价 * 数量, 零售价 * 数量)}
     {=ROUND(总价 / 3, 2)}
     {=CONCAT(姓, 名)}          或   {=姓 & 名}
     {=名单.0 + 名单.1}          列表 / 地图也能进公式

   设计上和 Excel 一条心：
     · 变量名直接写，不用再套一层花括号
     · 支持 + - * / % ^、比较（= <> < > <= >=）、& 拼字符串
     · 函数一大把，见 FUNCS
   求值结果是数字就返回数字，是字符串就返回字符串 —— 交给调用方去显示。
   ========================================================================== */

/* ---------------- 值 ---------------- */
const F_NUM = 'n', F_STR = 's', F_BOOL = 'b';
function fToNum(v){
  if (v == null) return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).trim();
  if (s === '') return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
function fToStr(v){
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? '真' : '假';
  return String(v);
}
/* Excel 的真值规则：0 / 空串 / 假 都是假，别的都真 */
function fTruthy(v){
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return fToStr(v).trim() !== '';
}
/* 比较：两边都像数字就按数字比，否则按字符串比（中文排序才不会乱） */
function fCmp(a, b){
  const na = Number(String(a).trim()), nb = Number(String(b).trim());
  const bothNum = String(a).trim() !== '' && String(b).trim() !== ''
    && !isNaN(na) && !isNaN(nb);
  if (bothNum) return na < nb ? -1 : na > nb ? 1 : 0;
  const sa = fToStr(a), sb = fToStr(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/* ---------------- 函数库 ----------------
   参数是**已经求过值**的数组。返回数字或字符串。 */
const FUNCS = {
  /* 统计 */
  SUM:   (a) => a.reduce((s, v) => s + fToNum(v), 0),
  AVG:   (a) => a.length ? a.reduce((s, v) => s + fToNum(v), 0) / a.length : 0,
  AVERAGE: (a) => FUNCS.AVG(a),
  MAX:   (a) => a.length ? Math.max(...a.map(fToNum)) : 0,
  MIN:   (a) => a.length ? Math.min(...a.map(fToNum)) : 0,
  COUNT: (a) => a.filter(v => String(v).trim() !== '' && !isNaN(Number(v))).length,
  COUNTA:(a) => a.filter(v => fToStr(v).trim() !== '').length,
  /* 数字 */
  ROUND: (a) => { const d = a.length > 1 ? Math.round(fToNum(a[1])) : 0;
                  const p = Math.pow(10, d); return Math.round(fToNum(a[0]) * p) / p; },
  INT:   (a) => Math.floor(fToNum(a[0])),
  FLOOR: (a) => Math.floor(fToNum(a[0])),
  CEIL:  (a) => Math.ceil(fToNum(a[0])),
  CEILING: (a) => Math.ceil(fToNum(a[0])),
  ABS:   (a) => Math.abs(fToNum(a[0])),
  SQRT:  (a) => Math.sqrt(Math.max(0, fToNum(a[0]))),
  POW:   (a) => Math.pow(fToNum(a[0]), fToNum(a[1])),
  MOD:   (a) => { const b = fToNum(a[1]); return b === 0 ? 0 : fToNum(a[0]) % b; },
  SIGN:  (a) => Math.sign(fToNum(a[0])),
  /* 逻辑 */
  IF:    (a) => fTruthy(a[0]) ? a[1] : a[2],
  AND:   (a) => a.every(fTruthy),
  OR:    (a) => a.some(fTruthy),
  NOT:   (a) => !fTruthy(a[0]),
  ISBLANK: (a) => fToStr(a[0]).trim() === '',
  /* 文本 */
  LEN:   (a) => [...fToStr(a[0])].length,
  CONCAT:(a) => a.map(fToStr).join(''),
  CONCATENATE: (a) => a.map(fToStr).join(''),
  UPPER: (a) => fToStr(a[0]).toUpperCase(),
  LOWER: (a) => fToStr(a[0]).toLowerCase(),
  TRIM:  (a) => fToStr(a[0]).trim(),
  LEFT:  (a) => [...fToStr(a[0])].slice(0, Math.max(0, fToNum(a[1]))).join(''),
  RIGHT: (a) => [...fToStr(a[0])].slice(-Math.max(0, fToNum(a[1]))).join(''),
  MID:   (a) => { const s = [...fToStr(a[0])], st = Math.max(1, fToNum(a[1])) - 1;
                  return s.slice(st, st + Math.max(0, fToNum(a[2]))).join(''); },
  REPT:  (a) => fToStr(a[0]).repeat(Math.max(0, Math.min(200, Math.floor(fToNum(a[1]))))),
  TEXT:  (a) => fToStr(a[0]),
  VALUE: (a) => fToNum(a[0]),
  /* 中文也来两个常用的 */
  IFERROR: (a) => (a[0] === undefined || a[0] === null || a[0] === '') ? a[1] : a[0],
};
const FUNC_NAMES = Object.keys(FUNCS);

/* ---------------- 词法 ---------------- */
/* 中文名也能当变量：汉字、字母、下划线开头；后面可以带数字和点（点用于 列表.0） */
const F_NAME = /^[A-Za-z_\u4e00-\u9fa5][A-Za-z0-9_\u4e00-\u9fa5]*(?:\.[A-Za-z0-9_\u4e00-\u9fa5]+)*/;
function fLex(src){
  const t = [];
  let i = 0;
  while (i < src.length){
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r'){ i++; continue; }
    if (c >= '0' && c <= '9' || (c === '.' && src[i + 1] >= '0' && src[i + 1] <= '9')){
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      t.push({ k:'num', v:parseFloat(src.slice(i, j)) }); i = j; continue;
    }
    if (c === '"' || c === "'"){
      let j = i + 1, out = '';
      while (j < src.length && src[j] !== c){ out += src[j]; j++; }
      t.push({ k:'str', v:out }); i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    /* ★ 双字符必须先判：不然 && 会被拆成两个 &，
       而 || 的 | 不在字符集里，直接词法报错。 */
    if (two === '&&' || two === '||'){ t.push({ k:'op', v:two }); i += 2; continue; }
    if (two === '<=' || two === '>=' || two === '<>' || two === '!=' || two === '=='){
      t.push({ k:'op', v:(two === '<>' || two === '!=') ? '!=' : (two === '==' ? '=' : two) });
      i += 2; continue;
    }
    if ('+-*/%^()&|,<>=!'.indexOf(c) >= 0){ t.push({ k:'op', v:c }); i++; continue; }
    const m = src.slice(i).match(F_NAME);
    if (m){ t.push({ k:'name', v:m[0] }); i += m[0].length; continue; }
    throw new Error('看不懂这个符号：' + c);
  }
  t.push({ k:'end', v:'' });
  return t;
}

/* ---------------- 语法 / 求值（递归下降） ----------------
   resolve(name) 由调用方给 —— 它负责按当前作用域去找变量。 */
function fParse(tokens, resolve){
  let p = 0;
  const peek = () => tokens[p];
  const eat = (v) => { if (tokens[p].k === 'op' && tokens[p].v === v){ p++; return true; } return false; };
  const expect = (v) => { if (!eat(v)) throw new Error('缺一个 ' + v); };

  function expr(){ return or(); }
  function or(){
    let a = and();
    while (peek().k === 'op' && peek().v === '||'){ p++; const b = and(); a = fTruthy(a) || fTruthy(b); }
    return a;
  }
  function and(){
    let a = cmp();
    while (peek().k === 'op' && peek().v === '&&'){ p++; const b = cmp(); a = fTruthy(a) && fTruthy(b); }
    return a;
  }
  function cmp(){
    let a = cat();
    for (;;){
      const o = peek();
      if (o.k === 'op' && ['=','!=','<','>','<=','>='].indexOf(o.v) >= 0){
        p++;
        const b = cat();
        const c = fCmp(a, b);
        a = o.v === '='  ? c === 0
          : o.v === '!=' ? c !== 0
          : o.v === '<'  ? c < 0
          : o.v === '>'  ? c > 0
          : o.v === '<=' ? c <= 0 : c >= 0;
      } else return a;
    }
  }
  function cat(){
    let a = add();
    while (peek().k === 'op' && peek().v === '&'){ p++; a = fToStr(a) + fToStr(add()); }
    return a;
  }
  function add(){
    let a = mul();
    for (;;){
      if (eat('+')) a = fToNum(a) + fToNum(mul());
      else if (eat('-')) a = fToNum(a) - fToNum(mul());
      else return a;
    }
  }
  function mul(){
    let a = unary();
    for (;;){
      if (eat('*')) a = fToNum(a) * fToNum(unary());
      else if (eat('/')){ const b = fToNum(unary()); a = b === 0 ? 0 : fToNum(a) / b; }
      else if (eat('%')){ const b = fToNum(unary()); a = b === 0 ? 0 : fToNum(a) % b; }
      else return a;
    }
  }
  function unary(){
    if (eat('-')) return -fToNum(unary());
    if (eat('+')) return fToNum(unary());
    if (eat('!')) return !fTruthy(unary());
    return power();
  }
  function power(){
    const a = primary();
    if (eat('^')) return Math.pow(fToNum(a), fToNum(unary()));
    return a;
  }
  function primary(){
    const t = peek();
    if (t.k === 'num'){ p++; return t.v; }
    if (t.k === 'str'){ p++; return t.v; }
    if (t.k === 'op' && t.v === '('){ p++; const v = expr(); expect(')'); return v; }
    if (t.k === 'name'){
      p++;
      const nm = t.v;
      if (peek().k === 'op' && peek().v === '('){
        p++;
        const args = [];
        if (!(peek().k === 'op' && peek().v === ')')){
          args.push(expr());
          while (eat(',')) args.push(expr());
        }
        expect(')');
        const fn = FUNCS[nm.toUpperCase()];
        if (!fn) throw new Error('没有这个函数：' + nm);
        return fn(args);
      }
      /* 常量 */
      const up = nm.toUpperCase();
      if (up === 'TRUE') return true;
      if (up === 'FALSE') return false;
      if (up === 'PI') return Math.PI;
      if (up === 'E') return Math.E;
      return resolve(nm);
    }
    throw new Error('表达式在这里断了');
  }
  const v = expr();
  if (peek().k !== 'end') throw new Error('表达式后面还有多余的东西');
  return v;
}

/* 入口：算一段公式（**不含**最外层那个 = 和花括号）。
   出错返回 null —— 调用方会显示 [公式错误]，不炸整块画布。 */
function evalFormula(src, resolve){
  const s = String(src == null ? '' : src).trim();
  if (!s) return null;
  try { return fParse(fLex(s), resolve); }
  catch(e){ formulaLastError = e.message; return null; }
}
let formulaLastError = '';
