/* .gitignore 被我追加的那几行是 CRLF（PowerShell Add-Content 干的），
   前面的又是 LF —— 变成混行尾了。统一成 LF，提交，再用 API 推一次。 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

/* ① 统一成 LF */
let s = readFileSync('.gitignore', 'utf8').replace(/\r\n/g, '\n');
writeFileSync('.gitignore', s);
console.log('① .gitignore 统一成 LF（' + s.length + ' 字节，' + s.split('\n').length + ' 行）');

/* ② 提交 */
execSync('git add -A', { stdio: 'inherit' });
execSync('git commit -q -m "把 .gitignore 的行尾统一成 LF\n\n上一版用 PowerShell Add-Content 追加的那几行是 CRLF，\n和前面从仓库里带下来的 LF 混在一起了。\n（这也是通过 Git Data API 推送时才看出来的 —— 普通 push 不会暴露这个。）"', { stdio: 'inherit' });
console.log('② 提交好了');

/* ③ API 推送 */
const TOK = process.env.GH_TOK;
const REPO = 'SGorgeous/Grapheon';
const H = { Authorization: 'Bearer ' + TOK, 'User-Agent': 'Grapheon', Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json' };
const api = 'https://api.github.com/repos/' + REPO;
async function call(url, method, body){
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch(_){}
  if (!r.ok) throw new Error(method + ' ' + url.replace(api, '') + ' → ' + r.status + ' ' + (j && j.message || txt.slice(0, 160)));
  return j;
}
const ref = await call(api + '/git/ref/heads/main', 'GET');
const baseSha = ref.object.sha;
const baseCommit = await call(api + '/git/commits/' + baseSha, 'GET');
const files = execSync('git diff --name-status ' + baseSha + ' HEAD', { encoding: 'utf8' }).trim().split('\n')
  .filter(Boolean).map(l => { const [st, ...r] = l.split('\t'); return { st, path: r.join('\t') }; });
console.log('③ 要推 ' + files.length + ' 个：' + files.map(f => f.path).join(', '));
const tree = [];
for (const f of files){
  if (f.st === 'D'){ tree.push({ path: f.path, mode:'100644', type:'blob', sha:null }); continue; }
  const blob = await call(api + '/git/blobs', 'POST',
    { content: readFileSync(f.path).toString('base64'), encoding: 'base64' });
  tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
}
const newTree = await call(api + '/git/trees', 'POST', { base_tree: baseCommit.tree.sha, tree });
const meta = execSync('git log -1 --format=%an%n%ae%n%aI%n%cn%n%ce%n%cI%n%B', { encoding: 'utf8' })
  .replace(/\r\n/g, '\n').split('\n');
const commit = await call(api + '/git/commits', 'POST', {
  message: meta.slice(6).join('\n').replace(/\n+$/, ''),
  tree: newTree.sha, parents: [baseSha],
  author:    { name: meta[0], email: meta[1], date: meta[2] },
  committer: { name: meta[3], email: meta[4], date: meta[5] },
});
await call(api + '/git/refs/heads/main', 'PATCH', { sha: commit.sha, force: false });
console.log('✓ 远程 main → ' + commit.sha.slice(0, 8));

/* ④ 核对：远程的 tree 应当和本地 HEAD 的 tree 一模一样了 */
const check = await call(api + '/git/commits/' + commit.sha, 'GET');
const localTree = execSync('git rev-parse HEAD^{tree}', { encoding: 'utf8' }).trim();
console.log('');
console.log('本地 tree: ' + localTree);
console.log('远程 tree: ' + check.tree.sha);
console.log(localTree === check.tree.sha ? '★ 完全一致 —— 内容和这次提交一模一样' : '✗ 还是不一致');
