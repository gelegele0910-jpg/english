// 端到端冒煙測試：在真實瀏覽器（手機尺寸）裡操作網站
// 用法：node tests/e2e.js [--clicks=300] [--seed=1]
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal } = require('./server');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const CLICKS = +arg('clicks', 300), SEED = +arg('seed', 1);
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const result = (name, ok, info) => { if (!ok) fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); };

(async () => {
  const srv = await start();
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  // 固定網頁內的 Math.random，讓題目順序與隨機點擊都可以重現
  await ctx.addInitScript(seed => { let s = seed; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }, SEED);
  const p = await ctx.newPage();
  const errs = []; let where = 'boot', gasCalls = 0;
  p.on('pageerror', e => errs.push(`[${where}] ${e.message}`));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errs.push(`[${where}] console: ${m.text()}`); });
  p.on('request', r => { if (/script\.google\.com/.test(r.url())) gasCalls++; });
  await blockExternal(p);

  await p.goto(srv.url);
  await p.waitForSelector('#pname');

  // 1. 建立學習者
  where = 'edit';
  await p.fill('#pname', '測試小安');
  await p.click('[data-act=e-lv][data-l="2"]');
  await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');
  const prof = await p.evaluate(() => JSON.parse(localStorage.getItem('elp-profiles')));
  result('E1 建立學習者', prof.list.length === 1 && prof.list[0].name === '測試小安' && prof.list[0].level === 2);
  await p.screenshot({ path: path.join(OUT, 'home.png') });

  // 2. 三種練習情境各完成一個主題（照真實步驟點）
  let last;
  for (const [ti, md] of [[0, 'full'], [1, 'quiet'], [2, 'silent']]) {
    where = 'lesson-' + md;
    await p.evaluate(m => { cur.mode = m; saveProfiles(); }, md);
    const before = await p.evaluate(() => ({ done: Object.keys(S.done).length, stars: S.stars, words: Object.keys(S.words).length }));
    await p.evaluate(i => startTopic(TOPICS[i].id), ti);
    const n = await p.evaluate(() => U.list.length);
    for (let guard = 0; guard < 200; guard++) {
      const st = await p.evaluate(() => ({ v: U.view, step: U.step, picked: U.picked }));
      if (st.v !== 'lesson') break;
      if (st.step === 0) { if (await p.$('[data-act=play]')) await p.click('[data-act=play]'); await p.click('[data-act=to-step][data-s="1"]'); }
      else if (st.step === 1 && st.picked == null) { const i = await p.evaluate(() => U.opts.findIndex(o => o.ok)); await p.click(`[data-act=pick][data-i="${i}"]`); }
      else if (st.step === 1) await p.click('[data-act=to-step][data-s="2"]');
      else if (st.step === 2) await p.click('[data-act=to-step][data-s="3"]');
      else await p.click('[data-act=next-sent]');
    }
    last = await p.evaluate(() => ({ done: Object.keys(S.done).length, stars: S.stars, words: Object.keys(S.words).length, view: U.view }));
    const ok = last.view === 'tdone' && last.done - before.done === n && last.stars > before.stars && last.words > before.words;
    result(`E2 句子練習（${md}）完成主題 ${ti}（${n} 句）`, ok, JSON.stringify(before) + ' → ' + JSON.stringify(last));
    if (md === 'full') await p.screenshot({ path: path.join(OUT, 'topic-done.png') });
    await p.evaluate(() => { U.view = 'home'; render(); });
  }

  // 3. 進度有存進 localStorage
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('elp-prog-' + cur.id) || 'null'));
  result('E3 進度存進 localStorage', !!stored && Object.keys(stored.done).length === last.done);

  // 4. 重新整理後資料還在
  where = 'reload';
  await p.reload(); await p.waitForFunction(() => U.view === 'home');
  const re = await p.evaluate(() => ({ name: cur && cur.name, done: Object.keys(S.done).length }));
  result('E4 重新整理後資料保留', re.name === '測試小安' && re.done === last.done, JSON.stringify(re));

  // 5. 每種風格 × 情境 × 主要畫面都能繪製（不需先經過按鈕初始化狀態的畫面）
  where = 'matrix';
  const mat = await p.evaluate(() => {
    const bad = [], views = ['home', 'topics', 'articles', 'words', 'settings', 'profiles', 'games', 'board', 'vlist', 'partner'];
    const sk0 = cur.skin, m0 = cur.mode;
    for (const sk of SKINS.map(s => s.id)) for (const md of Object.keys(MODES)) for (const v of views) {
      cur.skin = sk; cur.mode = md; applySkin(); U.view = v;
      try { render(); if (!document.querySelector('#main').innerHTML.trim()) bad.push(`${sk}/${md}/${v}: 空白`); } catch (e) { bad.push(`${sk}/${md}/${v}: ${e.message}`); }
    }
    cur.skin = sk0; cur.mode = m0; applySkin(); U.view = 'home'; render(); return bad;
  });
  result('E5 6 風格 × 3 情境 × 10 畫面都能繪製', !mat.length, mat.slice(0, 10).join('; '));

  // 6. 隨機點擊（每種情境 CLICKS 次），不得出現執行錯誤
  const errBefore = errs.length;
  for (const md of ['full', 'quiet', 'silent']) {
    where = 'monkey-' + md;
    await p.evaluate(m => { if (!cur) enterProfile(P.list[0].id); cur.mode = m; U.view = 'home'; applySkin(); render(); }, md);
    for (let i = 0; i < CLICKS; i++) {
      await p.evaluate(() => {
        if (!cur) { enterProfile(P.list[0].id); return; }
        const els = [...document.querySelectorAll('[data-act]')].filter(e => !e.disabled && e.offsetParent !== null && !/del-profile|reset|clear|wipe/.test(e.dataset.act));
        if (!els.length) { U.view = 'home'; render(); return; }
        els[Math.floor(Math.random() * els.length)].click();
        (window.__seen = window.__seen || new Set()).add(U.view);
      });
      if (i % 25 === 0) await p.waitForTimeout(100);
    }
  }
  const seen = await p.evaluate(() => [...window.__seen].sort());
  result(`E6 隨機點擊 3 × ${CLICKS} 次無錯誤`, errs.length === errBefore, '走過 ' + seen.length + ' 個畫面：' + seen.join(','));
  await p.evaluate(() => { if (!cur) enterProfile(P.list[0].id); });

  // 7. 手機寬度沒有水平捲動
  const hs = await p.evaluate(() => { const bad = []; for (const v of ['home', 'topics', 'articles', 'words', 'settings']) { U.view = v; render(); if (document.documentElement.scrollWidth > innerWidth + 1) bad.push(v); } return bad; });
  result('E7 手機寬度無水平捲動', !hs.length, hs.join(','));

  result('E8 全程沒有頁面錯誤', !errs.length, [...new Set(errs)].slice(0, 10).join(' | '));
  console.log(`   （Apps Script 請求 ${gasCalls} 次，已全部擋下；截圖在 tests/output/）`);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
