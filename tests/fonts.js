// 英文字型：每個選項都套用到英文、記在學習者自己身上、重新整理保留、舊資料預設「跟著風格」
// 用法：node tests/fonts.js
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
  await p.fill('#pname', '字型一號'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');
  const enFont = () => p.evaluate(() => { startTopic(TOPICS[0].id); U.step = 2; render(); return getComputedStyle(document.querySelector('.sub-en')).fontFamily; });
  const toSettings = () => p.evaluate(() => { leaveActivity(); U.view = 'settings'; render(); });

  // F1 每一個字型：設定頁點下去 → 課文英文換成那個字型、存進學習者資料；選「跟著風格」就回到介面風格的字
  { const bad = [];
    const base = await enFont();
    const list = await p.evaluate(() => FONTS_EN.map(f => [f.id, f.f || '']));
    for (const [id, fam] of list) {
      await toSettings(); await p.click(`[data-act=s-fonten][data-f=${id}]`);
      const got = await enFont();
      if (fam && !got.includes(fam.replace(/"/g, ''))) bad.push(`${id}：課文字型是 ${got}`);
      if (!fam && got !== base) bad.push(`跟著風格沒有回到原本的字：${got}`);
      const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('elp-profiles')).list.find(x => x.id === cur.id).fontEn);
      if (id === 'auto' ? saved !== undefined : saved !== id) bad.push(`${id}：存起來的是 ${saved}`);
    }
    // 換介面風格時，跟著風格的英文字也跟著換；選了字型的就不受風格影響
    await toSettings(); await p.click('[data-act=s-fonten][data-f=auto]');
    await p.evaluate(() => { ACT['s-skin']({ dataset: { s: 'notebook' } }); });
    if (!(await enFont()).includes('Gaegu')) bad.push('跟著風格時換成手繪筆記本，英文沒換成 Gaegu');
    await toSettings(); await p.click('[data-act=s-fonten][data-f=school]');
    await p.evaluate(() => { ACT['s-skin']({ dataset: { s: 'night' } }); });
    if (!(await enFont()).includes('Andika')) bad.push('選了課本體，換風格後被蓋掉');
    result(`F1 ${list.length} 種英文字型都會套用到課文、存在學習者資料；跟著風格會隨介面風格變`, bad); }

  // F2 重新整理後保留；每個學習者各自的設定
  { const bad = [];
    await p.reload(); await p.waitForFunction(() => U.view === 'home');
    if (!(await enFont()).includes('Andika')) bad.push('重新整理後字型沒有保留');
    await p.evaluate(() => { U.view = 'profiles'; cur = null; S = null; render(); });
    await p.click('[data-act=new-profile]');
    await p.waitForSelector('#pname'); await p.fill('#pname', '字型二號'); await p.click('[data-act=e-save]');
    await p.waitForFunction(() => U.view === 'home');
    if ((await enFont()).includes('Andika')) bad.push('新的學習者也被套用了別人的字型');
    result('F2 重新整理保留；每個學習者各自選字型', bad); }

  // F3 舊資料沒有這個欄位、或寫了不認識的值：當作跟著風格，不會出錯
  { const bad = [];
    const r = await p.evaluate(() => { cur.fontEn = 'nope'; applySkin(); const a = document.body.dataset.fen; delete cur.fontEn; applySkin(); return [a, document.body.dataset.fen, document.body.style.getPropertyValue('--font-en')]; });
    if (r[0] !== 'auto' || r[1] !== 'auto' || r[2]) bad.push('不認識或沒有設定時沒有回到跟著風格：' + r);
    result('F3 舊資料或不認識的值：當作跟著風格', bad); }

  // F4 深色風格與三種練習情境下設定頁、課文都正常
  { const bad = [];
    for (const sk of ['night', 'minimaldark']) for (const m of ['full', 'quiet', 'silent']) {
      await p.evaluate(([sk, m]) => { cur.skin = sk; cur.mode = m; S.mode = m; cur.fontEn = 'hand'; applySkin(); U.view = 'settings'; render(); }, [sk, m]);
      if (!(await p.$('.fopt.on[data-f=hand]'))) bad.push(`${sk}/${m}：設定頁沒有標出目前的字型`);
      const w = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (w > 1) bad.push(`${sk}/${m}：設定頁超出 ${w}px`);
      if (!(await enFont()).includes('Patrick Hand')) bad.push(`${sk}/${m}：課文沒有用手寫體`);
    }
    result('F4 深色風格 × 三種練習情境：設定頁與課文正常', bad); }

  result('沒有網頁錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
