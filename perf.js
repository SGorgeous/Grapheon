setTimeout(function(){
  const out = [];
  const T = (label, fn) => { const t0 = performance.now(); const r = fn(); const dt = performance.now() - t0;
    out.push('  ' + label.padEnd(46) + (dt.toFixed(1) + ' ms').padStart(10)); return r; };
  (async () => {
    const wait = (ms) => new Promise(r => setTimeout(r, ms));
    try {
      applyTheme('board'); newDocument('blank'); reindex(); sizeAll();
      const MB = 1024 * 1024;
      /* 造一个 5MB 的假 flac（内容无所谓，只看字符串操作的代价） */
      const bytes = new Uint8Array(5 * MB);
      for (let i = 0; i < bytes.length; i += 997) bytes[i] = i & 255;
      const f = new File([bytes], 'big.flac', { type:'audio/flac' });
      out.push('  假 flac 大小: ' + (f.size / MB).toFixed(1) + ' MB');
      out.push('');

      out.push('【纯字符串操作的代价】');
      const b64 = T('FileReader 读成 data: URL', () => 'x');   // 占位，真正读在下面
      const url = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(f); });
      out.push('  data: URL 长度: ' + (url.length / MB).toFixed(1) + ' M 字符');
      const fakeNode = { kind:'image', src:url };
      T('mediaSrcOf(fakeNode)', () => mediaSrcOf(fakeNode));
      T('mediaHrefOf(fakeNode)  ×1', () => mediaHrefOf(fakeNode));
      T('mediaKindOf(fakeNode)  ×1', () => mediaKindOf(fakeNode));
      T('★ mediaHrefOf ×60（一秒钟的帧数）', () => { for (let i = 0; i < 60; i++) mediaHrefOf(fakeNode); });
      T('★ mediaKindOf ×60', () => { for (let i = 0; i < 60; i++) mediaKindOf(fakeNode); });
      T('★ mediaElOf ×60（markPlayingMedia 每帧走一遍）', () => { for (let i = 0; i < 60; i++) mediaElOf(fakeNode); });
      out.push('');

      out.push('【真的走一遍 insertMediaFile】');
      const before = doc.nodes.length;
      const t0 = performance.now();
      const dt = new DataTransfer(); dt.items.add(f);
      window.dispatchEvent(new DragEvent('drop', { bubbles:true, cancelable:true, dataTransfer:dt }));
      for (let i = 0; i < 400 && doc.nodes.length === before; i++) await wait(20);
      out.push('  建节点耗时（含读文件）: ' + (performance.now() - t0).toFixed(0) + ' ms');
      const n = doc.nodes[doc.nodes.length - 1];
      out.push('  节点 src 长度: ' + (String(n.src).length / MB).toFixed(1) + ' M 字符');
      out.push('  类型: ' + mediaKindOf(n) + '   mediaType=' + JSON.stringify(n.mediaType));
      out.push('');
      T('★ sizeAll()（改类型 / 改尺寸都会走）', () => sizeAll());
      T('★ reindex()', () => reindex());
      T('★ pushHist()（每一步撤销都要深拷一份文档）', () => pushHist());
      T('★ serialize()（存档 / 导出 / 自动保存都走它）', () => serialize());
      T('★ 画一帧 draw()', () => draw());
      out.push('');
      out.push('【localStorage 装得下吗】');
      try {
        const s = JSON.stringify(serialize());
        out.push('  JSON 长度: ' + (s.length / MB).toFixed(1) + ' M 字符');
        const t2 = performance.now();
        localStorage.setItem('__probe_tmp', s);
        out.push('  ★ 写 localStorage 成功，耗时 ' + (performance.now() - t2).toFixed(0) + ' ms');
        localStorage.removeItem('__probe_tmp');
      } catch (e) {
        out.push('  ★ 写 localStorage 失败: ' + e.name + ' —— ' + String(e.message).slice(0, 60));
      }
    } catch(ex){ out.push('炸@ ' + ex.message + ' | ' + (ex.stack||'').split('\n')[1]); }
    const note = document.getElementById('uiNote');
    if (note){ note.style.display = 'block'; note.style.whiteSpace = 'pre'; note.textContent = out.join('\n'); }
  })();
}, 1500);
