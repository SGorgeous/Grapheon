/* 本地那条提交里混进了探针 fixpush.mjs，远程没有 —— 清掉再推一次，
   然后把两边的 tree 对平。 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const TOK = process.env.GH_TOK;
const REPO = 'SGorgeous/Grapheon';
const H = { Authorization: 'Bearer ' + TOK, 'User-Agent': 'Grapheon',
            Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' };
const api = 'https://api.github.com/repos/' + REPO;
async function call(url, method, body){
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch(_){}
  if (!r.ok) throw new Error(method + ' ' + url.replace(api,'') + ' → ' + r.status + ' ' + (j && j.message || t.slice(0,160)));
  return j;
}

/* ① 找出本地有、远程没有的文件（基本就是那些探针） */
const ref = await call(api + '/git/ref/heads/main', 'GET');
const remoteSha = ref.object.sha;
const rt = await call(api + '/git/trees/' + remoteSha + '?recursive=1', 'GET');
const remotePaths = new Set(rt.tree.filter(x => x.type === 'blob').map(x => x.path));
const localPaths = execSync('git ls-tree -r --name-only HEAD', { encoding: 'utf8' })
  .split('\n').map(s => s.trim()).filter(Boolean);
const onlyLocal = localPaths.filter(p => !remotePaths.has(p) && !p.startsWith('"'));
console.log('本地有、远程没有的：' + (onlyLocal.length ? onlyLocal.join(', ') : '(无)'));

/* ② 从本地提交里删掉它们，重新提交 */
if (onlyLocal.length){
  for (const p of onlyLocal){
    try { execSync('git rm -q --cached ' + JSON.stringify(p), { stdio: 'ignore' }); } catch(_){}
  }
  execSync('git add -A', { stdio: 'inherit' });
  execSync('git commit -q -m "清掉误提交的探针文件"', { stdio: 'inherit' });
  console.log('② 本地已清掉并提交');
}

/* ③ 推上去：本地 → 远程（blob → tree → commit → ref） */
const base = await call(api + '/git/commits/' + remoteSha, 'GET');
const changed = execSync('git diff-tree -r --name-status ' + (process.env.PARENT_SHA || remoteSha) + ' HEAD',
  { encoding: 'utf8' }).trim();
let files = [];
try {
  files = changed.split('\n').filter(Boolean).map(l => {
    const [st, ...r] = l.split('\t'); return { st, path: r.join('\t') };
  });
} catch(_){}
if (!files.length){
  /* 远程那个 commit 本地没有，退回到「本地全部文件 vs 远程」的差集 */
  const lt = execSync('git ls-tree -r HEAD', { encoding: 'utf8' }).split('\n').filter(Boolean)
    .map(l => { const p = l.split(/\s+/); return { sha: p[2], path: p.slice(3).join(' ') }; });
  files = lt.filter(f => !remotePaths.has(f.path) || true).map(f => ({ st: 'M', path: f.path, sha: f.sha }));
  console.log('（远程那个 commit 本地没有，改成整体推 ' + files.length + ' 个文件）');
}
const tree = [];
for (const f of files){
  if (!existsSync(f.path)){ tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
  const blob = await call(api + '/git/blobs', 'POST',
    { content: readFileSync(f.path).toString('base64'), encoding: 'base64' });
  tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
}
const newTree = await call(api + '/git/trees', 'POST', { base_tree: base.tree.sha, tree });
const meta = execSync('git log -1 --format=%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%B', { encoding: 'utf8' })
  .replace(/\r\n/g, '\n').split('\n');
const commit = await call(api + '/git/commits', 'POST', {
  message: meta.slice(6).join('\n').replace(/\n+$/, '') || '同步',
  tree: newTree.sha, parents: [remoteSha],
  author:    { name: meta[0], email: meta[1], date: meta[2] },
  committer: { name: meta[3], email: meta[4], date: meta[5] },
});
await call(api + '/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
console.log('③ 推送成功 ' + commit.sha.slice(0, 8));

/* ④ 对 tree */
const lt2 = execSync('git rev-parse HEAD^{tree}', { encoding: 'utf8', shell: 'cmd.exe' }).trim();
const rt2 = (await call(api + '/git/commits/' + commit.sha, 'GET')).tree.sha;
console.log('');
console.log('本地 tree: ' + lt2);
console.log('远程 tree: ' + rt2);
console.log(lt2 === rt2 ? '★★ 完全一致' : '✗ 还是不一致');
