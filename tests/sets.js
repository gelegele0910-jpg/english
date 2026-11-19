// 主題套裝與節慶限定測試：集滿獎勵、稱號、整套穿上、節慶期間（2026～2030）、節慶商店與禮物
// 用法：node tests/sets.js
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal } = require('./server');
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

// 每個節慶的「當天」（國曆），用來檢查期間邊界
const DAYS = {
  cny: { 2026: [2, 17], 2027: [2, 6], 2028: [1, 26], 2029: [2, 13], 2030: [2, 3] },
  duanwu: { 2026: [6, 19], 2027: [6, 9], 2028: [5, 28], 2029: [6, 16], 2030: [6, 5] },
  midautumn: { 2026: [9, 25], 2027: [9, 15], 2028: [10, 3], 2029: [9, 22], 2030: [9, 12] },
  halloween: Object.fromEntries([2026, 2027, 2028, 2029, 2030].map(y => [y, [10, 31]])),
  xmas: Object.fromEntries([2026, 2027, 2028, 2029, 2030].map(y => [y, [12, 25]]))
};

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { let s = 31; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '套裝測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');

  // 在網頁裡把「現在」設成某一天（Date.now() 與 new Date() 都跟著換）
  await p.evaluate(() => {
    window.__RealDate = Date;
    window.setToday = (y, m, d) => {
      const RD = window.__RealDate, t = new RD(y, m - 1, d, 10).getTime();
      window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
    };
    window.realToday = () => { window.Date = window.__RealDate; };
  });

  const props = await p.evaluate((DAYS) => {
    const out = [];
    const reset = () => { S.rw = newRw(); S.log = {}; S.todays = { date: '', n: 0 }; S.streak = { last: '', count: 0 }; U.rwq = []; U.sheet = null; };

    // T1 新部件都畫得出來、套裝的 4 件分在不同欄位（可以同時穿）
    let bad = [];
    for (const st of SETS) {
      const slots = st.items.map(id => id.split(':')[0]);
      if (new Set(slots).size !== slots.length) bad.push(st.n + ' 有兩件在同一個欄位：' + slots);
      for (const id of st.items) if (!RW_BY[id] || RW_BY[id].price == null) bad.push(st.n + ' 的 ' + id + ' 不能在商店買');
      const svg = maSvg(setLook(st), 80); if (/undefined|NaN/.test(svg)) bad.push(st.n + ' 整套畫壞了');
      // 預覽只能改套裝裡的欄位，不能多戴套裝以外的東西（否則孩子會以為整套包含它）
      const base = previewAv(), look = setLook(st);   // slots 沿用上面算好的套裝欄位
      Object.keys(look).forEach(k => { if (!slots.includes(k) && look[k] !== base[k]) bad.push(st.n + ' 的預覽多改了「' + k + '」'); });
    }
    const fests = REWARDS.filter(it => it.fest);
    if (fests.length !== 12) bad.push('節慶寶物應有 12 件，實際 ' + fests.length);
    for (const it of fests) if (!(it.fp > 0) || !FEST[it.fest]) bad.push(it.id + ' 沒有節慶價格');
    out.push([`T1 ${SETS.length} 組套裝的 4 件都在不同欄位、都能單買、整套畫得出來；12 件節慶寶物都有價格`, bad]);

    // T2 集滿才送稱號與金幣，只送一次；買到第 3 件時不會送
    bad = []; reset();
    const st = SETS[0];
    S.rw.coins = 9999;
    st.items.slice(0, 3).forEach(id => { U.arm = ''; ACT['rw-buy']({ dataset: { id } }); ACT['rw-buy']({ dataset: { id } }); });
    if (S.rw.sets[st.id] || S.rw.title) bad.push('只有 3 件就送了套裝獎勵');
    const c0 = S.rw.coins, last = RW_BY[st.items[3]];
    U.arm = ''; ACT['rw-buy']({ dataset: { id: last.id } }); ACT['rw-buy']({ dataset: { id: last.id } });
    if (!S.rw.sets[st.id] || S.rw.title !== st.title) bad.push('集滿沒有拿到稱號');
    if (S.rw.coins !== c0 - last.price + SET_BONUS) bad.push(`集滿的金幣不對：${S.rw.coins - c0}`);
    if (!U.rwq.includes('set:' + st.id)) bad.push('集滿沒有彈出視窗');
    const c1 = S.rw.coins; saveProg(); saveProg(); rwAch();
    if (S.rw.coins !== c1) bad.push('套裝獎勵重複送');
    out.push(['T2 套裝集滿 4 件才送稱號＋100 金幣，只送一次', bad]);

    // T3 節慶期間：2026～2030 每年都在正確的日子開始與結束
    bad = [];
    for (const [f, years] of Object.entries(DAYS)) for (const [y, [m, d]] of Object.entries(years)) {
      const F = FEST[f], c = dayNo(new window.__RealDate(+y, m - 1, d, 12).getTime());
      const chk = (t, want, label) => { if (festActive(f, t) !== want) bad.push(`${F.n} ${y}/${m}/${d} ${label} 應為 ${want}`); };
      chk(c, true, '當天'); chk(c - F.pre, true, `前 ${F.pre} 天`); chk(c + F.post, true, `後 ${F.post} 天`);
      chk(c - F.pre - 1, false, `前 ${F.pre + 1} 天`); chk(c + F.post + 1, false, `後 ${F.post + 1} 天`);
    }
    // 2031 年農曆節日還沒有日期：不可以誤開
    const t2031 = dayNo(new window.__RealDate(2031, 0, 25, 12).getTime());
    for (let k = 0; k < 60; k++) if (festActive('cny', t2031 + k)) { bad.push('2031 年沒有日期卻開了春節'); break; }
    out.push(['T3 五個節慶在 2026～2030 年都剛好在期間內開放、期間外關閉；沒有日期的年份不開放', bad]);
    return out;
  }, DAYS);
  props.forEach(([n, bad]) => result(n, bad));

  // T4 節慶商店：期間外買不到、期間內買得到、過了還能用；期間內第一次簽到送一樣禮物（每年一次）
  {
    const bad = [];
    const r = await p.evaluate(() => {
      const out = []; S.rw = newRw(); S.rw.coins = 1000; U.rwq = []; U.sheet = null;
      setToday(2026, 11, 20);                       // 沒有節慶
      const santa = RW_BY['t:santa'];
      if (itemPrice(santa) !== null) out.push('11/20 聖誕帽就有價格');
      U.arm = ''; ACT['rw-buy']({ dataset: { id: 't:santa' } }); ACT['rw-buy']({ dataset: { id: 't:santa' } });
      if (S.rw.own['t:santa'] || S.rw.coins !== 1000) out.push('期間外還是買到了');
      setToday(2026, 12, 20);                       // 聖誕節期間
      if (itemPrice(santa) !== santa.fp) out.push('聖誕期間沒有價格');
      U.arm = ''; ACT['rw-buy']({ dataset: { id: 't:santa' } }); ACT['rw-buy']({ dataset: { id: 't:santa' } });
      if (!S.rw.own['t:santa'] || S.rw.coins !== 1000 - santa.fp) out.push('期間內沒買到');
      // 禮物：聖誕期間第一次簽到
      S.todays = { date: '', n: 0 }; S.streak = { last: '', count: 0 }; bump(); claimCheckin();
      const xmasOwned = REWARDS.filter(it => it.fest === 'xmas' && S.rw.own[it.id]).length;
      if (xmasOwned !== 2) out.push('聖誕期間簽到沒有送禮物，現有聖誕寶物 ' + xmasOwned);
      setToday(2026, 12, 21); bump(); claimCheckin();
      if (REWARDS.filter(it => it.fest === 'xmas' && S.rw.own[it.id]).length !== 2) out.push('同一年聖誕節送了第二次禮物');
      setToday(2027, 1, 10);                        // 過了聖誕節
      if (itemPrice(santa) !== null) out.push('過了聖誕節還在賣');
      if (!canUsePart(S.rw.own)('t', 'santa', MA_TOPS)) out.push('過了期間就不能戴已經買的聖誕帽');
      setToday(2027, 12, 15); bump(); claimCheckin();
      if (REWARDS.filter(it => it.fest === 'xmas' && S.rw.own[it.id]).length !== 3) out.push('隔年聖誕節沒有再送禮物');
      // 全部都有了改給金幣
      REWARDS.filter(it => it.fest === 'xmas').forEach(it => { S.rw.own[it.id] = 1; });
      setToday(2028, 12, 15); const c = S.rw.coins; bump(); claimCheckin();
      if (S.rw.coins !== c + 10 + 30) out.push('節慶寶物都有了，簽到應該多給 30 金幣：' + (S.rw.coins - c));
      realToday();
      return out;
    });
    result('T4 節慶寶物只在期間內能買、買了永久能用；期間內第一次簽到送禮物，每年一次，都有了改給金幣', r);
  }

  // ---------- 端到端 ----------
  // E1 商店預設「套裝」：進度、單買、集滿彈出視窗、整套穿上、頂端顯示稱號
  {
    const bad = [];
    await p.evaluate(() => { S.rw = newRw(); S.rw.coins = 600; cur.avatar = maFix({ b: 'round', c: 'sky' }); U.rwq = []; U.sheet = null; U.shopCat = null; U.shopTab = null; U.view = 'home'; render(); });
    await p.click('[data-act=shop-open]');
    const nSets = await p.evaluate(() => SETS.length);
    if ((await p.$$('.setbox')).length !== nSets) bad.push(`套裝分類應有 ${nSets} 組`);
    const ids = await p.evaluate(() => SETS.find(s => s.id === 'detect').items);
    for (const id of ids) { await p.click(`[data-act=rw-buy][data-id="${id}"]`); await p.click(`[data-act=rw-buy][data-id="${id}"]`); }
    if (!(await p.$('.rwpop')) || !(await p.textContent('.rwpop')).includes('集滿「小偵探」套裝')) bad.push('集滿沒有彈出視窗');
    await p.screenshot({ path: path.join(OUT, 'sets-complete.png') });
    await p.click('.rwpop [data-act=set-wear]');
    const av = await p.evaluate(() => maFix(cur.avatar));
    if (!(av.t === 'deerstalker' && av.n === 'redbow' && av.a === 'bigglass' && av.k === 'magnifier')) bad.push('整套穿上沒有穿齊：' + JSON.stringify(av));
    await p.evaluate(() => { U.view = 'home'; render(); });
    if (!(await p.textContent('.top small')).includes('名偵探')) bad.push('頂端沒有顯示稱號');
    // 部分收集也能「穿上有的」
    await p.click('[data-act=shop-open]');
    const id0 = await p.evaluate(() => SETS.find(s => s.id === 'ninja').items[0]);
    await p.click(`[data-act=rw-buy][data-id="${id0}"]`); await p.click(`[data-act=rw-buy][data-id="${id0}"]`);
    await p.click('[data-act=set-wear][data-s=ninja]');
    if ((await p.evaluate(() => maFix(cur.avatar).t)) !== 'ninjaband') bad.push('「穿上有的 1 件」沒有作用');
    await p.screenshot({ path: path.join(OUT, 'sets-shop.png') });
    result('E1 套裝：商店預設顯示全部套裝、單買集滿彈出視窗、整套穿上、頂端顯示稱號、部分收集也能穿', bad);
  }

  // E2 節慶分類：沒有活動時顯示下次日期；聖誕期間顯示活動並能買；頭像工作室沒買的上鎖
  {
    const bad = [];
    await p.evaluate(() => { setToday(2026, 11, 20); render(); });
    await p.click('[data-act=shop-cat][data-c=fest]');
    let txt = await p.textContent('#main');
    if (!txt.includes('現在沒有節慶活動') || !txt.includes('聖誕節 下次 12/10 開始')) bad.push('沒有活動時的說明不對');
    if (await p.$('.shopit')) bad.push('沒有活動時商店卻有節慶寶物');
    await p.evaluate(() => { setToday(2026, 12, 20); S.rw.coins = 300; render(); });
    txt = await p.textContent('#main');
    if (!txt.includes('聖誕節活動中')) bad.push('聖誕期間沒有顯示活動');
    const n = await p.evaluate(() => document.querySelectorAll('.shopit [data-act=rw-buy]').length);
    if (n !== 3) bad.push('聖誕期間應該有 3 件可以買，實際 ' + n);
    await p.screenshot({ path: path.join(OUT, 'fest-xmas.png') });
    await p.click('[data-act=shop-tab][data-t=book]');
    if ((await p.evaluate(() => document.querySelectorAll('.shopit').length)) !== 12) bad.push('收藏冊的節慶分類應有 12 件');
    await p.click('[data-act=shop-close]');
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=ab-open]'); await p.click('[data-act=ab-tab][data-k=t]');
    if (!(await p.$('.abopt.locked[data-id="t:santa"]'))) bad.push('沒買的聖誕帽在頭像工作室沒有上鎖');
    await p.click('[data-act=ab-cancel]');
    for (const sk of ['night', 'minimaldark']) {
      await p.evaluate(sk => { cur.skin = sk; applySkin(); U.view = 'home'; render(); }, sk);
      await p.click('[data-act=shop-open]'); await p.click('[data-act=shop-tab][data-t=shop]'); await p.click('[data-act=shop-cat][data-c=set]');
      if (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) bad.push(sk + ' 套裝頁超出寬度');
      await p.screenshot({ path: path.join(OUT, `sets-${sk}.png`) });
      await p.click('[data-act=shop-close]');
    }
    await p.evaluate(() => { realToday(); cur.skin = 'sticker'; applySkin(); render(); });
    result('E2 節慶分類：沒活動顯示下次日期、聖誕期間可以買 3 件、收藏冊 12 件、頭像工作室上鎖、深色不超出寬度', bad);
  }

  // E3 舊資料：沒有 sets／title／fgift 欄位
  {
    const bad = [];
    await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('elp-prog-' + cur.id)); delete g.rw.sets; delete g.rw.title; delete g.rw.fgift; localStorage.setItem('elp-prog-' + cur.id, JSON.stringify(g)); });
    await p.reload(); await p.waitForFunction(() => U.view === 'home');
    const s = await p.evaluate(() => ({ sets: RW().sets, title: RW().title, fg: RW().fgift }));
    if (!s.sets || s.title == null || !s.fg) bad.push('舊進度沒有補上欄位 ' + JSON.stringify(s));
    await p.click('[data-act=shop-open]');
    if (errs.length) bad.push(errs.join(' | '));
    result('E3 舊版進度（沒有套裝與節慶欄位）正常', bad);
  }

  result('E4 全程沒有頁面錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
