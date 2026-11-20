// 隱藏版小怪獸測試：繪製、夥伴上鎖、神秘蛋、每個成就、收藏冊與設成夥伴
// 用法：node tests/hidden.js
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal } = require('./server');
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { let s = 21; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '隱藏版測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');

  const props = await p.evaluate(() => {
    const out = [], RealDate = Date;
    // 模擬換日（也可以指定幾點）：Date.now() 與 new Date() 都要跟著走
    const base = new RealDate(); base.setHours(10, 0, 0, 0);
    let day = 0, hour = 10;
    const nowMs = () => base.getTime() + day * DAY + (hour - 10) * 36e5;
    window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(nowMs()); } static now() { return nowMs(); } };
    const reset = () => { S.rw = newRw(); S.log = {}; S.sp = {}; S.done = {}; S.vk = {}; S.stars = 0; S.todays = { date: '', n: 0 }; S.streak = { last: '', count: 0 }; U.rwq = []; U.sheet = null; };
    const IDS = Object.keys(HIDDEN);

    // H1 8 隻 × 6 種表情都畫得出來
    let bad = [];
    for (const id of IDS) for (const e of EXPR) { const svg = monster(id, e, 80); if (!svg.includes('</svg>') || /undefined|NaN/.test(svg)) bad.push(id + '/' + e); }
    for (const id of IDS) if (/undefined|NaN/.test(silhouette(id, 80))) bad.push('黑影 ' + id);
    for (const id of Object.keys(BUDDY_ART)) for (const e of EXPR) { const svg = monster(id, e, 80); if (!svg.includes('</svg>') || /undefined|NaN/.test(svg)) bad.push('夥伴新造型 ' + id + '/' + e); }
    for (const st of [0, 1, 2]) if (/undefined|NaN/.test(eggSvg(st, 40))) bad.push('蛋 ' + st);
    for (const id of IDS) for (const k of ['greet', 'right', 'wrong', 'done']) if (!(BUDDY_LINES[id][k] || []).length) bad.push('沒有台詞 ' + id + '.' + k);
    out.push([`H1 ${IDS.length} 隻隱藏版 × ${EXPR.length} 種表情、黑影、神秘蛋都畫得出來，台詞齊全`, bad]);

    // H2 沒收集到不能當夥伴；收集到後台詞換成隱藏版的
    bad = []; reset();
    cur.partner = 'luna';
    if (partnerId() !== 'bobo') bad.push('沒收集到的隱藏版被當成夥伴');
    S.rw.own['h:luna'] = 1;
    if (partnerId() !== 'luna') bad.push('收集到後還是不能當夥伴');
    const lines = new Set([...BUDDY_LINES.luna.right]);
    for (let i = 0; i < 10; i++) if (!lines.has(bline('right'))) bad.push('台詞不是星光獨角獸的');
    cur.partner = 'bobo';
    out.push(['H2 隱藏版要收集到才能當夥伴，當夥伴後用自己的台詞', [...new Set(bad)]]);

    // H3 神秘蛋：一天只長大一次、不用連續、滿 5 天孵化、孵出來不重複、全部收集完給 100 金幣
    bad = []; reset(); day = 0;
    for (let k = 0; k < 4; k++) bump();
    if (S.rw.egg.d !== 1) bad.push('同一天練習好幾次，蛋長了 ' + S.rw.egg.d + ' 天');
    day = 3; bump(); day = 9; bump(); day = 10; bump(); day = 20; bump();   // 中間斷掉也沒關係
    if (S.rw.egg.d !== 5) bad.push('不連續的 5 天沒有長滿：' + S.rw.egg.d);
    day = 21; bump(); if (S.rw.egg.d !== 5) bad.push('長滿後還在長');
    const got = [];
    for (let n = 0; n < IDS.length; n++) {
      if (n) { for (let k = 0; k < 5; k++) { day++; bump(); } }
      const k = hatchEgg(); got.push(k);
      if (S.rw.egg.d !== 0) bad.push('孵化後蛋沒有重新開始');
      bump(); if (S.rw.egg.d !== 0) bad.push('孵化當天的練習又算進下一顆蛋');
    }
    if (new Set(got).size !== IDS.length || got.includes(null)) bad.push('孵出來的有重複或空的：' + got);
    for (let k = 0; k < 5; k++) { day++; bump(); }
    const c0 = S.rw.coins; if (hatchEgg() !== null || S.rw.coins !== c0 + 100) bad.push('全部收集完沒有改給 100 金幣');
    if (hatchEgg() !== null || S.rw.coins !== c0 + 100) bad.push('蛋還沒長大就能孵');
    out.push([`H3 神秘蛋：一天只長一次、不用連續、滿 5 天孵化，${IDS.length} 次孵出 ${IDS.length} 隻不重複，之後給 100 金幣`, bad]);

    // H4 8 個成就：差一點不會解鎖，達到就解鎖
    bad = [];
    const cases = {
      luna:  [() => { S.streak = { last: today(), count: 29 }; }, () => { S.streak.count = 30; }],
      rex:   [() => { for (let i = 0; i < 29; i++) S.sp['w' + i] = { m: 1, l: 5, d: 0 }; }, () => { S.sp.w29 = { m: 1, l: 5, d: 0 }; }],
      octo:  [() => { for (let i = 0; i < 19; i++) S.done['art:x' + i] = 1; }, () => { S.done['art:x19'] = 1; }],
      shroom:[() => { TOPICS.slice(1).forEach(t => t.sents[1].forEach(x => { S.done[x.id] = 1; })); }, () => { TOPICS[0].sents[1].forEach(x => { S.done[x.id] = 1; }); }],
      scoop: [() => { S.rw.taskDays = 4; }, () => { S.rw.taskDays = 5; }],
      ember: [() => { rwGame({ id: 'speed', score: 19, stars: 10 }); }, () => { rwGame({ id: 'speed', score: 20, stars: 10 }); }],
      cacti: [() => { for (let i = 0; i < 9; i++) logSpeak(95); logSpeak(89); }, () => { logSpeak(90); }],
      hoot:  [() => { hour = 21; for (let i = 0; i < 6; i++) { day++; bump(); } hour = 19; day++; bump(); }, () => { hour = 21; day++; bump(); hour = 10; }],
      sunny: [() => { hour = 7; for (let i = 0; i < 4; i++) { day++; bump(); } hour = 8; day++; bump(); }, () => { hour = 7; day++; bump(); hour = 10; }],
      tito:  [() => { for (let i = 0; i < 49; i++) S.log['2020-1-' + i] = { s: 1 }; S.log['2020-3-1'] = { t: 30 }; }, () => { S.log['2020-2-1'] = { w: 2 }; }],
      kiko:  [() => { for (let i = 0; i < 99; i++) S.vk['w' + i] = 1; }, () => { S.vk.w99 = 1; }],
      pixel: [() => { S.log['2020-1-1'] = { g: 30 }; S.log['2020-1-2'] = { g: 19 }; }, () => { S.log['2020-1-3'] = { g: 1 }; }],
      jelly: [() => { S.stars = 499; }, () => { S.stars = 500; }],
      nova:  [() => { ['a', 'b', 'c', 'd'].forEach(k => { S.rw.sky[k] = 1; }); S.rw.sky.all = 1; }, () => { S.rw.sky.e = 1; }],
      peaco: [() => { S.rw.sets.a = 1; S.rw.sets.b = 1; }, () => { S.rw.sets.c = 1; }],
      hammy: [() => { for (let i = 0; i < 39; i++) S.rw.own['t:x' + i] = 1; for (let i = 0; i < 5; i++) S.rw.own['h:y' + i] = 1; }, () => { S.rw.own['t:x39'] = 1; }]
    };
    for (const [id, [almost, reach]] of Object.entries(cases)) {
      reset(); day += 100; hour = 10;
      almost(); saveProg();
      if (S.rw.own['h:' + id]) bad.push(id + ' 還沒達到就解鎖');
      reach(); saveProg();
      if (!S.rw.own['h:' + id]) bad.push(id + ' 達到條件卻沒解鎖：' + achProgress(id));
      const others = IDS.filter(k => k !== id && S.rw.own['h:' + k]);
      if (others.length) bad.push(id + ' 的條件順便解鎖了 ' + others);
    }
    out.push([`H4 ${Object.keys(cases).length} 個成就各自在剛好達到時解鎖，不會提早、不會連帶解鎖別隻`, bad]);
    if (Object.keys(cases).length !== IDS.length) bad.push('有隱藏版沒有成就測試');

    window.Date = RealDate; reset(); S.done = {}; saveProg();
    return out;
  });
  props.forEach(([n, bad]) => result(n, bad));

  // ---------- 端到端 ----------
  // E1 新增學習者時看不到隱藏版；選擇夥伴畫面有上鎖的黑影，點了不會選
  {
    const bad = [];
    await p.evaluate(() => { openEdit(); });
    if (await p.$('.pk.locked')) bad.push('新增學習者畫面出現了隱藏版');
    await p.evaluate(() => { U.view = 'home'; render(); });
    await p.evaluate(() => { U.ppick = null; U.view = 'partner'; render(); });
    const n = await p.evaluate(() => document.querySelectorAll('.pk.locked').length);
    const nH = await p.evaluate(() => Object.keys(HIDDEN).length);
    if (n !== nH) bad.push(`選擇夥伴畫面應該有 ${nH} 個上鎖的隱藏版，實際 ` + n);
    await p.click('.pk.locked[data-p=ember]');
    if ((await p.evaluate(() => U.ppick)) === 'ember') bad.push('點上鎖的隱藏版還是選到了');
    await p.evaluate(() => ACT['p-pick']({ dataset: { p: 'ember' } }));
    if ((await p.evaluate(() => U.ppick)) === 'ember') bad.push('繞過按鈕也選到了');
    if (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) bad.push('選擇夥伴畫面超出寬度');
    result('E1 新增學習者看不到隱藏版；選擇夥伴畫面顯示所有上鎖黑影，不能選', bad);
  }

  // E2 神秘蛋在首頁孵化 → 彈出隱藏版 → 設成學習夥伴 → 首頁與答題都換成牠
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'home'; render(); });
    if (!(await p.textContent('.rwcard')).includes('神秘蛋')) bad.push('首頁沒有神秘蛋');
    await p.evaluate(() => { S.rw.egg.d = EGG_DAYS; render(); });
    await p.click('[data-act=rw-hatch]');
    const k = await p.evaluate(() => U.rwq[0] && U.rwq[0].slice(2));
    if (!k || !(await p.$('.rwpop'))) bad.push('孵化後沒有彈出隱藏版');
    else {
      if (!(await p.textContent('.rwpop')).includes('隱藏版小怪獸出現了')) bad.push('彈出視窗標題不對');
      await p.screenshot({ path: path.join(OUT, 'hidden-hatch.png') });
      await p.click('.rwpop [data-act=rw-wear]');
      const st = await p.evaluate(() => ({ partner: cur.partner, pid: partnerId(), sheet: U.sheet, saved: JSON.parse(localStorage.getItem('elp-profiles')).list[0].partner, egg: S.rw.egg.d }));
      if (st.partner !== k || st.pid !== k || st.saved !== k) bad.push('沒有設成夥伴或沒有存檔 ' + JSON.stringify(st));
      if (st.sheet) bad.push('視窗沒有關');
      if (st.egg !== 0) bad.push('孵化後蛋沒有重新開始');
      const hero = await p.textContent('.hero .bubble');
      if (!hero.startsWith(await p.evaluate(k => MON[k].name, k))) bad.push('首頁夥伴沒有換成隱藏版：' + hero);
      // 答題時的反應
      await p.evaluate(() => { U.gsrc = 'new'; startGame('meaning'); });
      const i = await p.evaluate(() => U.g.opts.indexOf(U.g.qs[0]));
      await p.click(`[data-act=gpick][data-i="${i}"]`);
      const said = await p.evaluate(() => U.react && U.react.t);
      const ok = await p.evaluate(([k, t]) => BUDDY_LINES[k].right.includes(t), [k, said]);
      if (!ok) bad.push('答對時說的不是隱藏版的台詞：' + said);
      await p.screenshot({ path: path.join(OUT, 'hidden-partner-game.png') });
      await p.evaluate(() => { leaveActivity(); U.view = 'home'; render(); });
    }
    result('E2 神秘蛋孵出隱藏版 → 設成夥伴 → 首頁問候與答題反應都換成牠', bad);
  }

  // E3 收藏冊「隱藏版」：收集到的彩色可設成夥伴，沒收集的黑影＋條件＋進度；商店不顯示這一類
  {
    const bad = [];
    await p.click('[data-act=shop-open]');
    await p.click('[data-act=shop-tab][data-t=shop]');
    if (await p.$('[data-act=shop-cat][data-c=h]')) bad.push('商店分頁出現了隱藏版分類');
    await p.click('[data-act=shop-tab][data-t=book]'); await p.click('[data-act=shop-cat][data-c=h]');
    const info = await p.evaluate(() => ({ cards: document.querySelectorAll('.shopit').length, unknown: [...document.querySelectorAll('.shopit b')].filter(b => b.textContent === '？？？').length, prog: /\d+ \/ \d+/.test(document.querySelector('#main').textContent) }));
    const nH2 = await p.evaluate(() => Object.keys(HIDDEN).length);
    if (info.cards !== nH2 || info.unknown !== nH2 - 1) bad.push(`收藏冊應有 ${nH2} 張、${nH2 - 1} 張未收集，實際 ` + JSON.stringify(info));
    if (!info.prog) bad.push('沒收集的沒有顯示進度');
    if (!(await p.$('.shopit.own'))) bad.push('收集到的沒有顯示');
    await p.screenshot({ path: path.join(OUT, 'hidden-book.png') });
    // 換回原本的夥伴，再從收藏冊設回來
    await p.evaluate(() => { cur.partner = 'bobo'; render(); });
    await p.click('.shopit.own [data-act=rw-wear]');
    if ((await p.evaluate(() => MON[cur.partner].hidden)) !== true) bad.push('從收藏冊設成夥伴沒有作用');
    for (const sk of ['night', 'minimaldark']) {
      await p.evaluate(sk => { cur.skin = sk; applySkin(); render(); }, sk);
      if (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) bad.push(sk + ' 收藏冊超出寬度');
    }
    await p.screenshot({ path: path.join(OUT, 'hidden-book-night.png') });
    await p.evaluate(() => { cur.skin = 'sticker'; applySkin(); U.view = 'home'; render(); });
    result('E3 收藏冊隱藏版：未收集顯示黑影、條件與進度；收集到的可以設成夥伴；商店不賣', bad);
  }

  // E4 舊資料：沒有蛋與成就欄位的進度、夥伴設成沒收集的隱藏版
  {
    const bad = [];
    await p.evaluate(() => {
      const g = JSON.parse(localStorage.getItem('elp-prog-' + cur.id)); delete g.rw.egg; delete g.rw.night; delete g.rw.hi90; delete g.rw.speedBest; g.rw.own = {}; localStorage.setItem('elp-prog-' + cur.id, JSON.stringify(g));
    });
    await p.reload(); await p.waitForFunction(() => U.view === 'home');
    const s = await p.evaluate(() => ({ egg: RW().egg, pid: partnerId(), card: (document.querySelector('.rwcard') || {}).textContent || '' }));
    if (!s.egg || s.egg.d !== 0) bad.push('舊進度沒有補上神秘蛋 ' + JSON.stringify(s.egg));
    if (s.pid !== 'bobo') bad.push('沒收集到的隱藏版夥伴沒有退回啵啵：' + s.pid);
    if (!s.card.includes('神秘蛋')) bad.push('首頁沒有神秘蛋');
    result('E4 舊版進度（沒有蛋與成就欄位）正常；夥伴是沒收集的隱藏版時退回預設', bad);
  }

  result('E5 全程沒有頁面錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
