// 前端屬性測試與內容完整性檢查（在瀏覽器裡直接呼叫 index.html 的函式）
// 用法：node tests/front-props.js
const { chromium } = require('playwright');
const { start, blockExternal } = require('./server');

(async () => {
  const srv = await start();
  const b = await chromium.launch(), p = await b.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');

  const res = await p.evaluate(() => {
    const out = [];
    let seed = 777; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }, ri = n => Math.floor(rnd() * n);
    const text = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };

    // F1 highlight()：去掉標籤後必須等於原句，而且只標記生字
    let bad = [], n = 0;
    for (const s of Object.values(SENT)) {
      n++; const html = highlight(s.en, s.w);
      if (text(html) !== s.en) bad.push(s.id + ' 原句被改動');
      const d = document.createElement('div'); d.innerHTML = html;
      d.querySelectorAll('.kw').forEach(k => { if (!s.w.some(([w]) => w.toLowerCase() === k.textContent.toLowerCase())) bad.push(s.id + ' 標記了非生字 ' + k.textContent); });
    }
    const CH = "abcAB z'.,!?-<>&\"中😀";
    for (let i = 0; i < 1000; i++) {
      let en = ''; for (let j = 0, L = ri(40); j < L; j++) en += CH[ri(CH.length)];
      const words = []; for (let j = 0, k = ri(4); j < k; j++) { let w = ''; for (let m = 0, L = 1 + ri(3); m < L; m++) w += 'abcAB'[ri(5)]; words.push([w, 'x']); }
      n++; if (text(highlight(en, words)) !== en) bad.push('隨機句 ' + JSON.stringify(en));
    }
    out.push([`F1 highlight() 不改動原句、只標記生字（${n} 句，含 1000 組隨機）`, bad]);

    // F2 findWord()：只匹配完整單字
    bad = [];
    for (let i = 0; i < 1000; i++) {
      const w = 'abc'.slice(0, 1 + ri(3)), pre = ['', 'x', ' ', '-', "'"][ri(5)], post = ['', 'y', ' ', '.', "'"][ri(5)], en = pre + w + post;
      const expect = !/[A-Za-z]$/.test(pre) && !/^[A-Za-z]/.test(post);
      if (!!findWord(en, w) !== expect) bad.push(JSON.stringify([en, w]));
    }
    out.push(['F2 findWord() 只匹配完整單字（1000 組）', [...new Set(bad)]]);

    // F3 migrate()：冪等，且舊格式一律轉成合法值
    bad = []; const P0 = P;
    const avs = ['🐰', '🦄', '👦', 'bunny', 'xx', null, { b: 'round' }], sks = ['bunny', 'ocean', 'simple', 'night', 'zzz', undefined], pts = ['bobo', 'nope', undefined];
    for (let i = 0; i < 200; i++) {
      P = { updated: 1, list: [{ id: 'a', name: 'n', avatar: avs[ri(avs.length)], skin: sks[ri(sks.length)], partner: pts[ri(pts.length)] }] };
      migrate(); const once = JSON.stringify(P); const changed = migrate();
      if (changed || JSON.stringify(P) !== once) bad.push('不冪等 ' + once);
      const q = P.list[0];
      if (!SKINS.find(s => s.id === q.skin) || !PARTNERS.includes(q.partner) || !(typeof q.avatar === 'object' || AVATAR_IDS.includes(q.avatar))) bad.push('非法值 ' + once);
    }
    P = P0;
    out.push(['F3 migrate() 冪等且轉成合法值（200 組）', bad]);

    // F4 內容完整性（CLAUDE.md R-04）
    bad = [];
    TOPICS.forEach(t => [1, 2, 3, 4, 5].forEach(lv => (t.lv[lv] || []).forEach((a, i) => {
      const id = t.id + '-' + lv + '-' + i;
      if (!(Array.isArray(a) && a.length === 3 && typeof a[0] === 'string' && typeof a[1] === 'string' && Array.isArray(a[2]))) { bad.push('句子格式錯誤 ' + id); return; }
      a[2].forEach(([w]) => { if (!findWord(a[0], w)) bad.push(`生字不在句中 ${id}: "${w}"`); });
    })));
    const aids = new Set();
    ARTICLES.forEach(ar => {
      if (aids.has(ar.id)) bad.push('文章 id 重複 ' + ar.id); aids.add(ar.id);
      (ar.q || []).forEach((q, i) => { if (!(q[2] >= 0 && q[2] < q[1].length)) bad.push(`題目答案超出選項範圍 ${ar.id} 第 ${i + 1} 題`); });
      ar.w.forEach(([w]) => { if (!ar.s.some(s => findWord(s[0], w))) bad.push(`文章生字不在文中 ${ar.id}: "${w}"`); });
    });
    const tids = TOPICS.map(t => t.id); if (new Set(tids).size !== tids.length) bad.push('主題 id 重複');
    let vn = 0; Object.keys(VOCAB).forEach(k => VOCAB[k].forEach(v => { vn++; if (!(Array.isArray(v) && v.length === 6)) bad.push('單字格式錯誤 ' + k + ':' + v[0]); }));
    out.push([`F4 內容完整性（${TOPICS.length} 主題、${Object.keys(SENT).length} 句、${ARTICLES.length} 篇文章、${vn} 個分級單字）`, bad]);

    // F5 h() 跳脫
    const evil = '<img src=x onerror=alert(1)>"\'&';
    out.push(['F5 h() 正確跳脫 HTML', text(h(evil)) === evil && !/<img/.test(h(evil)) ? [] : ['h() 失效']]);
    return out;
  });

  let fail = 0;
  for (const [name, bad] of res) {
    if (bad.length) fail++;
    console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 15).join('\n   ') + (bad.length > 15 ? `\n   …共 ${bad.length} 筆` : '') : ''));
  }

  // F6 惡意名字端到端：建立學習者後切換多個畫面，不可執行
  let fired = false; p.on('dialog', d => { fired = true; d.dismiss(); });
  await p.fill('#pname', '<img src=x onerror=alert(1)>'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');
  await p.evaluate(() => { for (const v of ['home', 'settings', 'profiles', 'board']) { U.view = v; render(); } });
  await p.waitForTimeout(300);
  if (fired) fail++;
  console.log((fired ? 'FAIL' : 'PASS') + ' F6 惡意名字在首頁、設定、選人、家長看板都不會執行');

  if (errs.length) { fail++; console.log('FAIL 頁面錯誤：' + errs.join(' | ')); }
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
