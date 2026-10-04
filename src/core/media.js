'use strict';
/* ==========================================================================
   GRAPHEON · core/media.js
   多媒体节点的「源」怎么解析。

   约定（和 user/放这里.txt 里写的一致）：
     · 没写协议头的地址**自动补 user/ 前缀**
         pic.png            → user/pic.png
         video/clip.mp4     → user/video/clip.mp4
     · 写了协议头的原样用
         https://…         网页 / 在线媒体
         data:…            内嵌的数据
         file:///…         绝对路径
     · 以 / 开头的绝对路径也不动

   类型按扩展名猜（猜错的以后可以在菜单里手动改）。
   网页（http/https）没扩展名时按「网页」算。

   ⚠ 这个文件里**一个正则都没有** ——
     我的写文件管线吃过反斜杠（\d 变成 d），正则静默失配过一次。
     用 indexOf / slice / lastIndexOf 能做的一律不用正则。
   ========================================================================== */

const MEDIA_USER_DIR = 'user/';

const MEDIA_EXT_IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico'];
const MEDIA_EXT_VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
const MEDIA_EXT_AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac'];
const MEDIA_EXT_LINK  = ['html', 'htm'];

const MEDIA_KIND_LABEL = {
  image:'图片', video:'视频', audio:'音频', link:'网页', file:'文件'
};
/* 节点当前生效的类型名（给提示语用） */
function mediaKindLabelOf(n){
  const k = mediaKindOf(n);
  return MEDIA_KIND_LABEL[k] || '未定';
}

/* 扩展名（小写，不含点）。会先去掉 ?query 和 #hash。 */
function mediaExtOf(s){
  let p = String(s == null ? '' : s).trim();
  const q = p.indexOf('?'); if (q >= 0) p = p.slice(0, q);
  const h = p.indexOf('#'); if (h >= 0) p = p.slice(0, h);
  const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  const dot = p.lastIndexOf('.');
  if (dot < 0 || dot <= slash + 1) return '';
  return p.slice(dot + 1).toLowerCase();
}
/* 有没有写协议头（写了就不补 user/ 前缀） */
function mediaHasProtocol(s){
  const t = String(s == null ? '' : s).trim().toLowerCase();
  if (t.indexOf('data:') === 0 || t.indexOf('blob:') === 0) return true;
  if (t.indexOf('//') === 0) return true;              // 协议相对地址
  const i = t.indexOf('://');
  return i > 0;                                        // http:// https:// file:// …
}
/* 相对地址 → 补 user/ 前缀；写了协议头 / 以 / 开头 / 已经写了 user/ 的原样返回。
   `./` `../` 开头的也**不补** —— 那是「从站点根往上走」的意思
   （user/../assets/x.svg 虽然也能解析对，但存进 JSON 里又长又难认）。 */
function mediaHref(raw){
  const t = String(raw == null ? '' : raw).trim();
  if (t === '') return '';
  if (mediaHasProtocol(t)) return t;
  if (t.charAt(0) === '/') return t;
  if (t.indexOf(MEDIA_USER_DIR) === 0) return t;
  if (t.indexOf('../') === 0 || t.indexOf('./') === 0) return t;
  return MEDIA_USER_DIR + t;
}
/* 类型：image / video / audio / link / file */
function mediaKind(raw){
  const t = String(raw == null ? '' : raw).trim().toLowerCase();
  if (t === '') return '';
  /* data: 按 MIME 头判 */
  if (t.indexOf('data:') === 0){
    if (t.indexOf('data:image/') === 0) return 'image';
    if (t.indexOf('data:video/') === 0) return 'video';
    if (t.indexOf('data:audio/') === 0) return 'audio';
    return 'file';
  }
  const e = mediaExtOf(t);
  if (MEDIA_EXT_IMAGE.indexOf(e) >= 0) return 'image';
  if (MEDIA_EXT_VIDEO.indexOf(e) >= 0) return 'video';
  if (MEDIA_EXT_AUDIO.indexOf(e) >= 0) return 'audio';
  if (MEDIA_EXT_LINK.indexOf(e) >= 0) return 'link';
  /* 网页：http(s) 开头，没认出扩展名也当网页 */
  if (t.indexOf('http://') === 0 || t.indexOf('https://') === 0) return 'link';
  return 'file';
}
/* 这个源能不能就地显示（图片 / 视频 / 音频），还是只能当文件 / 网页 */
const mediaInlineKind = (k) => k === 'image' || k === 'video' || k === 'audio';

/* 取协议头（'https://a' → 'https'，'pic.png' → ''）。
   没有正则：只看 ':' 前面有没有 '/' '?' '#'。 */
function mediaSchemeOf(s){
  const t = String(s == null ? '' : s).trim().toLowerCase();
  const i = t.indexOf(':');
  if (i <= 0) return '';
  const j = t.indexOf('/'); if (j >= 0 && j < i) return '';
  const q = t.indexOf('?'); if (q >= 0 && q < i) return '';
  const h = t.indexOf('#'); if (h >= 0 && h < i) return '';
  return t.slice(0, i);
}
/* ★ 这个名字像不像协议头？RFC 3986 规定协议头只能是字母。
   为什么单独有这个判断：`example.com:8080` 里 ':' 前面的 "example.com"
   会被 mediaSchemeOf 抠出来，但那是**主机:端口**，不是协议头。
   不区分的话：① 白名单会把它当未知协议**拒掉**（明明是能用的地址）；
             ② 「网页链接…」也不会给它补 https://。 */
function mediaIsScheme(sc){
  const t = String(sc == null ? '' : sc);
  if (t === '') return false;
  for (let i = 0; i < t.length; i++){
    const c = t.charAt(i);
    if (c < 'a' || c > 'z') return false;
  }
  return true;
}
/* =========================================================================
   补全网页链接：用户填 example.com 就当成 https://example.com。
   只在「网页链接…」那个入口用 ——
   「相对地址…」和「换源…」**不能**补：那两处的 pic.png 是相对地址、
   data: 是内嵌数据，补上 https:// 就全坏了。
   ========================================================================= */
function mediaUrlOf(raw){
  const t = String(raw == null ? '' : raw).trim();
  if (t === '') return '';
  const low = t.toLowerCase();
  if (low.indexOf('http://') === 0 || low.indexOf('https://') === 0) return t;
  if (t.indexOf('//') === 0) return 'https:' + t;          // 协议相对地址
  const sc = mediaSchemeOf(t);
  /* 已经写了别的协议头（ftp: javascript: file: …）就原样返回，
     让白名单去决定收不收 —— 不在这一步替用户改。 */
  if (mediaIsScheme(sc)) return t;
  return 'https://' + t;
}
/* ★ 只放行这几种协议头。
   为什么要有这道闸：多媒体节点的源会被拿去 new Image() / <video> / window.open，
   `javascript:` 这类一旦进去，Ctrl+左键就成了执行脚本的入口。
   相对地址（没有协议头）一律放行。
   这条是**旧契约里唯一值得留的东西** —— 以前写死了「只收 data:image/」，
   现在放宽成「相对 / http / https / file / data / blob」，其余照样不要。 */
const MEDIA_OK_SCHEMES = ['http', 'https', 'file', 'blob'];
function mediaSrcAllowed(raw){
  const t = String(raw == null ? '' : raw).trim();
  if (t === '') return false;
  const sc = mediaSchemeOf(t);
  /* ★ 得「像协议头」才算协议头 —— example.com:8080 里冒号前面那截是
     **主机:端口**，不是协议。不这么判的话这种地址会被当未知协议拒掉
     （明明是能用的地址）。 */
  if (!mediaIsScheme(sc)) return true;     // 相对地址
  /* data: 单独看 —— 只放行「图 / 视频 / 音频」这三类 MIME。
     data:text/html 之类的要拦：那个源可能被 window.open 打开，
     等于给了一个执行任意页面内容的入口。
     （写死前缀比较，不用正则 —— 见文件头的说明。） */
  if (sc === 'data'){
    const t2 = t.toLowerCase();
    return t2.indexOf('data:image/') === 0
        || t2.indexOf('data:video/') === 0
        || t2.indexOf('data:audio/') === 0;
  }
  return MEDIA_OK_SCHEMES.indexOf(sc) >= 0;
}

/* ---------------- 节点上的统一入口 ---------------- */

/* 节点上写的原文（相对地址就是它） */
function mediaSrcOf(n){
  return (n && typeof n.src === 'string') ? n.src.trim() : '';
}
/* 真正拿去找文件的地址（相对地址已经补好 user/ 前缀） */
function mediaHrefOf(n){
  return mediaHref(mediaSrcOf(n));
}
/* 节点上的类型：优先用手动指定的（n.mediaType），没有才按扩展名猜。
   为什么要手动指定：地址里没有扩展名（比如 /api/img?id=3）、
   或者扩展名和真实内容对不上时，猜出来的类型是错的，得给条退路。 */
const MEDIA_KINDS = ['image', 'video', 'audio', 'link', 'file'];

function mediaKindOf(n){
  const t = (n && typeof n.mediaType === 'string') ? n.mediaType : '';
  if (MEDIA_KINDS.indexOf(t) >= 0) return t;
  return mediaKind(mediaSrcOf(n));
}
/* 手动指定类型（传空 / 不认识的就把手动值清掉，回到自动判定） */
function setMediaType(n, k){
  if (!n) return false;
  if (MEDIA_KINDS.indexOf(k) >= 0) n.mediaType = k;
  else delete n.mediaType;
  if (typeof reindex === 'function') reindex();
  if (typeof sizeNode === 'function') sizeNode(n);
  if (typeof sizeAll === 'function') sizeAll();
  if (typeof mark === 'function') mark();
  return true;
}
/* 多媒体节点 —— 沿用 kind:'image'（第二步整体改名时再动，避免一次改太多） */
function isMediaNode(n){
  return !!n && n.kind === 'image';
}

/* =========================================================================
   画的时候要用的默认尺寸
   ========================================================================= */

/* 内容区的高度（宽度由节点宽度定）。
   图片和视频按**原始比例**算高度，这几种没有比例可言，给固定值。 */
const MEDIA_BOX_H = { audio: 34, link: 34, file: 34 };

/* 视频还没拿到元数据时先按 16:9 占位，拿到之后再按真实比例重排。
   音频 / 网页 / 文件用上面的固定高度，这个比例对它们没意义。 */
const MEDIA_DEFAULT_RATIO = 16 / 9;

/* 内容区该多高（还没加载出真实尺寸时的兜底） */
function mediaFallbackBoxH(kind, w){
  if (kind === 'audio' || kind === 'link' || kind === 'file'){
    return (MEDIA_BOX_H[kind] || 34);
  }
  return Math.max(24, Math.round(w / MEDIA_DEFAULT_RATIO));
}
