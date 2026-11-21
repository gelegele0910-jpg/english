// 單字意思對照：同一個字在不同句子裡意思不同時（leaves 出發／葉子），句子裡要顯示那一句的意思；單字本與遊戲列出全部意思
// 用法：node tests/words.js
const { chromium, devices } = require('playwright');
const { start, blockExternal } = require('./server');

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '單字測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');

  const props = await p.evaluate(() => {
    const out = [];
    const zOf = html => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.wrow')].map(r => [r.dataset.k, r.querySelector('.z').textContent]);
    // W1 每一句（主題＋文章）的生字表：顯示的意思就是那一句寫的意思
    let bad = [], n = 0;
    const check = (pairs, where) => {
      const got = zOf(wordRows(pairs.map(x => x[0].toLowerCase()), pairs));
      pairs.forEach(([w, zh]) => { n++; const g = got.find(x => x[0] === w.toLowerCase()); if (!g) bad.push(`${where} 沒有顯示 ${w}`); else if (g[1] !== zh && pairs.filter(x => x[0].toLowerCase() === w.toLowerCase()).length === 1) bad.push(`${where} ${w}：顯示「${g[1]}」，句子寫「${zh}」`); });
    };
    TOPICS.forEach(t => Object.values(t.sents).forEach(L => L.forEach(s => check(s.w, s.id))));
    ARTICLES.forEach(a => check(a.w, 'a-' + a.id));
    out.push([`W1 ${n} 個生字（所有主題句與文章）在句子裡都顯示那一句自己的意思`, bad]);

    // W2 句子裡的螢光字：點下去提示的也是這一句的意思
    bad = [];
    TOPICS.forEach(t => Object.values(t.sents).forEach(L => L.forEach(s => {
      const d = new DOMParser().parseFromString(highlight(s.en, s.w), 'text/html');
      d.querySelectorAll('.kw').forEach(el => { const pr = s.w.find(x => x[0].toLowerCase() === el.dataset.k); if (pr && el.dataset.z !== pr[1]) bad.push(`${s.id} ${el.dataset.k}：${el.dataset.z}`); });
    })));
    out.push(['W2 句子裡點螢光字，提示的是這一句的意思', bad]);

    // W3 沒有句子可對照的地方（單字本、遊戲）：列出所有不同的意思、不重複；只是換個說法的不另外列
    bad = [];
    const must = { leaves: ['出發', '葉子'], light: ['燈', '輕', '點燃'], lost: ['迷路', '輸'], present: ['發表', '禮物'], cook: ['煮飯', '廚師'], bill: ['帳單', '紙鈔'], play: ['玩', '戲劇'] };
    Object.entries(must).forEach(([k, parts]) => parts.forEach(x => { if (!WORDS[k].zh.includes(x)) bad.push(`${k} 少了「${x}」：${WORDS[k].zh}`); }));
    Object.values(WORDS).forEach(w => { if (w.zhs && new Set(w.zhs).size !== w.zhs.length) bad.push('重複：' + w.k); });
    SAME_SENSE.forEach(k => { if (WORDS[k] && WORDS[k].zh.includes('／')) bad.push('同義卻列了兩個：' + k + ' ' + WORDS[k].zh); });
    ['dog', 'apple', 'rabbit'].forEach(k => { if (WORDS[k].zh.includes('／')) bad.push('單一意思的字被合併：' + k); });
    out.push(['W3 單字本與遊戲列出全部不同意思（leaves 出發／葉子…），不重複、同義不重列', bad]);
    return out;
  });
  props.forEach(([n, bad]) => result(n, bad));

  // W4 實際畫面：大自然主題「The leaves are green.」看字幕那一步，生字是「葉子」，不是「出發」
  {
    const bad = [];
    await p.evaluate(() => { cur.level = 1; startTopic('nature'); const i = U.list.findIndex(s => /leaves/i.test(s.en)); U.si = i; U.step = 2; render(); });
    await p.waitForSelector('.wrow[data-k=leaves]');
    const z = await p.textContent('.wrow[data-k=leaves] .z');
    if (!z.includes('葉子') || z.includes('出發')) bad.push('生字表顯示：' + z);
    await p.click('.sub-en .kw[data-k=leaves]');
    await p.waitForFunction(() => /leaves ＝/.test(document.querySelector('#toast').textContent));
    const t = await p.textContent('#toast');
    if (!t.includes('葉子') || t.includes('出發')) bad.push('點螢光字提示：' + t);
    // 交通主題那一句仍是「出發」
    await p.evaluate(() => { cur.level = 3; startTopic('move'); const i = U.list.findIndex(s => /leaves/i.test(s.en)); U.si = i; U.step = 2; render(); });
    await p.waitForSelector('.wrow[data-k=leaves]');
    const z2 = await p.textContent('.wrow[data-k=leaves] .z');
    if (!z2.includes('出發')) bad.push('交通主題顯示：' + z2);
    result('W4 實際畫面：大自然的 leaves 顯示「葉子」、交通的 leaves 顯示「出發」（生字表與點螢光字）', bad);
  }
  // W5 單字本搜尋「葉子」找得到 leaves，並列出兩個意思
  {
    const bad = [];
    const html = await p.evaluate(() => { S.words.leaves = [0, Date.now(), Date.now()]; U.wf = 'all'; U.q = '葉子'; return wordListHtml(); });
    if (!html.includes('data-k="leaves"')) bad.push('搜尋「葉子」找不到 leaves');
    if (!/出發[^<]*／[^<]*葉子|葉子[^<]*／[^<]*出發/.test(html)) bad.push('單字本沒有列出兩個意思');
    result('W5 單字本列出全部意思（leaves：出發；離開／葉子）', bad);
  }
  result('沒有網頁錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
