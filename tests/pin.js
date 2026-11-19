// 密碼測試：孩子密碼、家長密碼、忘記密碼、錯太多次、重新整理、鍵盤輸入、舊資料相容
// 用法：node tests/pin.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start, blockExternal } = require('./server');
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const result = (name, bad) => { if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.join('\n   ') : '')); };

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');

  const st = () => p.evaluate(() => ({ view: U.view, cur: cur && cur.name, sheet: U.sheet, err: U.pin && U.pin.err }));
  const type = async code => { for (const k of code) { await p.click(`.pinkey[data-k="${k}"]`); } await p.waitForFunction(() => !U.pin || U.pin.val.length === 0 || U.pin.val.length === 4); await p.waitForFunction(() => !U.pin || U.pin.val.length < 4); };
  const sheetOpen = () => p.waitForSelector('.pinpad');
  const addKid = async name => {
    await p.evaluate(() => { U.view = 'profiles'; cur = null; S = null; render(); });
    await p.click('[data-act=new-profile]');
    if (await p.$('.pinpad')) { await type('9999'); }
    await p.waitForSelector('#pname'); await p.fill('#pname', name); await p.click('[data-act=e-save]');
    await p.waitForFunction(() => U.view === 'home');
  };
  const toProfiles = async () => { await p.click('.top .who'); await p.waitForFunction(() => U.view === 'profiles'); };
  const kidCard = name => p.evaluate(n => P.list.find(x => x.name === n).id, name).then(id => `.pcard[data-act=enter][data-id="${id}"]`);

  // 建兩個孩子
  await p.fill('#pname', '小安'); await p.click('[data-act=e-save]'); await p.waitForFunction(() => U.view === 'home');
  await addKid('小美');

  // P1 沒有密碼：點頭像就進去；設定密碼後存的是雜湊、不是數字
  {
    const bad = [];
    await toProfiles();
    await p.click(await kidCard('小安'));
    if ((await st()).view !== 'home') bad.push('沒有密碼卻不能直接進去');
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=pw-set]'); await sheetOpen();
    await type('1234'); await type('1234');
    await p.waitForFunction(() => !U.sheet);
    const pr = await p.evaluate(() => JSON.parse(localStorage.getItem('elp-profiles')).list.find(x => x.name === '小安'));
    if (!pr.pin || pr.pin.length !== 64 || JSON.stringify(pr).includes('1234')) bad.push('密碼沒有用雜湊存：' + pr.pin);
    result('P1 沒密碼直接進；設定密碼要輸入兩次，存的是雜湊', bad);
  }

  // P2 有密碼：要輸入才進得去；錯的進不去；對了進去；切換學習者後要再輸入
  {
    const bad = [];
    await toProfiles();
    if (!(await p.$(`${await kidCard('小安')} .plock`))) bad.push('有密碼的頭像沒有顯示鎖');
    await p.click(await kidCard('小安')); await sheetOpen();
    await type('0000');
    let s = await st();
    if (s.view !== 'profiles' || !s.err) bad.push('密碼錯了卻進去了或沒有提示 ' + JSON.stringify(s));
    await type('1234');
    await p.waitForFunction(() => U.view === 'home');
    if ((await st()).cur !== '小安') bad.push('密碼對了沒有進到小安');
    await p.screenshot({ path: path.join(OUT, 'pin-home.png') });
    await toProfiles(); await p.click(await kidCard('小安'));
    if (!(await p.$('.pinpad'))) bad.push('切換學習者後再進來不用密碼');
    await p.click('.sheet [data-act=pin-close]');
    result('P2 有密碼要輸入才能進；錯的不行；切換學習者後要重新輸入', bad);
  }

  // P3 重新整理：同一個分頁不用再輸入；新開分頁（關掉再開）要輸入
  {
    const bad = [];
    await p.click(await kidCard('小安')); await sheetOpen(); await type('1234'); await p.waitForFunction(() => U.view === 'home');
    await p.reload(); await p.waitForFunction(() => typeof U !== 'undefined' && (U.view === 'home' || U.view === 'profiles'));
    if ((await st()).view !== 'home') bad.push('重新整理後要重新輸入密碼');
    const p2 = await ctx.newPage(); await blockExternal(p2); await p2.goto(srv.url);
    await p2.waitForFunction(() => typeof U !== 'undefined' && U.view === 'profiles' && U.sheet === 'pin');
    const s2 = await p2.evaluate(() => ({ view: U.view, cur: cur && cur.name }));
    if (s2.cur) bad.push('新分頁沒輸入密碼就進到 ' + s2.cur);
    await p2.close();
    result('P3 重新整理不用再輸入；新開的分頁停在選人畫面並要求密碼', bad);
  }

  // P4 家長密碼：設定（含提示問題）→ 家長看板、新增、刪除都要輸入；錯的不行
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=pp-set]'); await sheetOpen(); await type('8888'); await type('8888');
    await p.waitForSelector('#pqQ'); await p.fill('#pqQ', '我們家的貓叫什麼'); await p.fill('#pqA', ' Mi Mi ');
    await p.screenshot({ path: path.join(OUT, 'pin-question.png') });
    await p.click('[data-act=pq-save]'); await p.waitForFunction(() => !U.sheet);
    const par = await p.evaluate(() => JSON.parse(localStorage.getItem('elp-profiles')).parent);
    if (!par || par.pin.length !== 64 || par.a.length !== 64 || /mi|8888/i.test(par.pin + par.a)) bad.push('家長密碼或答案沒有用雜湊存');
    // 家長看板
    await p.click('[data-act=board-open]'); await sheetOpen();
    await type('1234');
    if ((await st()).view === 'board') bad.push('用孩子的密碼打開了家長看板');
    await type('8888'); await p.waitForFunction(() => U.view === 'board');
    await p.click('[data-act=board-exit]');
    // 新增學習者
    await toProfiles(); await p.click('[data-act=new-profile]'); await sheetOpen();
    if ((await st()).view === 'edit') bad.push('沒輸入家長密碼就能新增');
    await type('8888'); await p.waitForFunction(() => U.view === 'edit');
    await p.click('[data-act=go][data-v=profiles]');
    // 刪除學習者（小美）
    await p.click(await kidCard('小美')); await p.waitForFunction(() => U.view === 'home');
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=del-profile]'); await p.click('[data-act=del-profile]'); await sheetOpen();
    await p.click('.sheet [data-act=pin-close]');
    if (!(await p.evaluate(() => P.list.some(x => x.name === '小美')))) bad.push('沒輸入家長密碼就刪掉了');
    await p.click('[data-act=del-profile]'); await p.click('[data-act=del-profile]'); await sheetOpen(); await type('8888');
    await p.waitForFunction(() => U.view === 'profiles');
    if (await p.evaluate(() => P.list.some(x => x.name === '小美'))) bad.push('輸入家長密碼後沒有刪除');
    result('P4 家長密碼（含提示問題）：家長看板、新增、刪除學習者都要家長密碼；孩子的密碼不行', bad);
  }

  // P5 孩子忘記密碼：家長密碼可以進去，並在設定裡用家長密碼改掉孩子的密碼
  {
    const bad = [];
    await p.click(await kidCard('小安')); await sheetOpen();
    await p.click('[data-act=pin-parent-enter]'); await type('8888');
    await p.waitForFunction(() => U.view === 'home');
    if ((await st()).cur !== '小安') bad.push('家長密碼沒有進到小安');
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=pw-change]'); await sheetOpen();
    await p.click('[data-act=pin-parent-ok]'); await type('8888');
    await p.waitForFunction(() => U.pin && U.pin.k === 'set');
    await type('5678'); await type('5678'); await p.waitForFunction(() => !U.sheet);
    await toProfiles(); await p.click(await kidCard('小安')); await sheetOpen();
    await type('1234'); if ((await st()).view === 'home') bad.push('舊密碼還能用');
    await type('5678'); await p.waitForFunction(() => U.view === 'home');
    result('P5 孩子忘記密碼：家長密碼可以進去、也能幫忙改成新密碼，舊密碼失效', bad);
  }

  // P6 忘記家長密碼：答錯不行、答對（不分大小寫空白）重設；舊的家長密碼失效
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=board-open]'); await sheetOpen();
    await p.click('[data-act=pq-forgot]'); await p.waitForSelector('#pqA');
    if (!(await p.textContent('#sheet')).includes('我們家的貓叫什麼')) bad.push('沒有顯示提示問題');
    await p.fill('#pqA', '咪咪'); await p.click('[data-act=pq-check]');
    if (!(await p.textContent('#sheet')).includes('答案不對')) bad.push('答錯沒有提示');
    await p.fill('#pqA', 'mimi'); await p.click('[data-act=pq-check]');
    await p.waitForSelector('.pinpad'); await type('4321'); await type('4321');
    await p.waitForFunction(() => U.view === 'board');   // 重設後直接繼續打開家長看板
    await p.click('[data-act=board-exit]');
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=board-open]'); await sheetOpen(); await type('8888');
    if ((await st()).view === 'board') bad.push('舊的家長密碼還能用');
    await type('4321'); await p.waitForFunction(() => U.view === 'board');
    await p.click('[data-act=board-exit]');
    result('P6 忘記家長密碼：答錯不行，答對（不分大小寫、空白）可重設並繼續原本的動作，舊密碼失效', bad);
  }

  // P7 錯 5 次要等 30 秒（等的時候連對的也不行）；電腦可以用鍵盤輸入
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=board-open]'); await sheetOpen();
    for (let i = 0; i < 5; i++) await type('0000');
    await type('4321');
    if ((await st()).view === 'board') bad.push('錯 5 次後馬上就能打開');
    if (!/30 秒/.test((await st()).err || '')) bad.push('沒有提示要等 30 秒');
    await p.evaluate(() => { U.pinWait = 0; });   // 模擬 30 秒過去
    await p.keyboard.type('4321');
    await p.waitForFunction(() => U.view === 'board');
    await p.click('[data-act=board-exit]');
    result('P7 錯 5 次要等 30 秒；可以用鍵盤輸入數字', bad);
  }

  // P8 三種情境、深淺風格的密碼鍵盤都不超出畫面
  {
    const bad = [];
    for (const [skin, mode] of [['sticker', 'full'], ['night', 'quiet'], ['minimaldark', 'silent']]) {
      await p.evaluate(([s, m]) => { cur.skin = s; cur.mode = m; applySkin(); render(); }, [skin, mode]);
      await toProfiles(); await p.click(await kidCard('小安')); await sheetOpen();
      const over = await p.evaluate(() => { const r = document.querySelector('.pinpad').getBoundingClientRect(); return r.right > innerWidth + 1 || r.top < 0 || document.documentElement.scrollWidth > innerWidth + 1; });
      if (over) bad.push(skin + ' 鍵盤超出畫面');
      if (skin === 'night') await p.screenshot({ path: path.join(OUT, 'pin-pad-night.png') });
      await type('5678'); await p.waitForFunction(() => U.view === 'home');
    }
    result('P8 sticker／night／minimaldark × 三種情境，密碼鍵盤都正常', bad);
  }

  // P9 舊資料（沒有任何密碼欄位）：不會跳出密碼，家長看板直接打開
  {
    const bad = [];
    const p3 = await (await b.newContext()).newPage(); await blockExternal(p3);
    await p3.addInitScript(() => { localStorage.setItem('elp-profiles', JSON.stringify({ updated: 1, list: [{ id: 'old1', name: '舊的', avatar: 'bunny', skin: 'sticker', partner: 'bobo', level: 1 }] })); localStorage.setItem('elp-last', 'old1'); });
    await p3.goto(srv.url); await p3.waitForFunction(() => typeof U !== 'undefined' && U.view === 'home');
    await p3.evaluate(() => ACT['board-open']()); await p3.waitForFunction(() => U.view === 'board');
    if (await p3.evaluate(() => U.sheet === 'pin')) bad.push('舊資料跳出了密碼');
    await p3.close();
    result('P9 舊資料沒有密碼：照常直接進入、家長看板直接打開', bad);
  }

  result('P10 全程沒有頁面錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
