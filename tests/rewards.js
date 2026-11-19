// 獎勵測試：金幣、簽到、每日任務、寶箱、商店、收藏冊、頭像上鎖與舊資料相容
// 用法：node tests/rewards.js
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal } = require('./server');
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { let s = 11; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '寶物測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');

  // ---------- 屬性測試 ----------
  const props = await p.evaluate(() => {
    // 模擬換日：Date.now() 與 new Date()（today() 用的）都要跟著走
    const out = [], RealDate = Date, base = RealDate.now();
    let day = 0;
    window.Date = class extends RealDate { constructor(...a) { if (a.length) super(...a); else super(base + day * DAY); } static now() { return base + day * DAY; } };
    const reset = () => { S.rw = newRw(); S.log = {}; S.todays = { date: '', n: 0 }; S.streak = { last: '', count: 0 }; U.rwq = []; U.sheet = null; };
    let seed = 5; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

    // P1 金幣帳目：餘額 = 賺的 − 花的，永遠不會是負數；不能重複買；錢不夠買不了
    let bad = []; reset();
    let earned = 0, spent = 0;
    const shopItems = REWARDS.filter(it => it.price != null);
    for (let i = 0; i < 1500; i++) {
      if (rnd() < 0.45) { const n = 1 + Math.floor(rnd() * 40); earn(n, '測試'); earned += n; }
      else {
        const it = shopItems[Math.floor(rnd() * shopItems.length)], before = { c: S.rw.coins, own: !!S.rw.own[it.id] };
        const sets0 = Object.keys(S.rw.sets).length;
        U.arm = ''; ACT['rw-buy']({ dataset: { id: it.id } }); ACT['rw-buy']({ dataset: { id: it.id } });
        const bonus = (Object.keys(S.rw.sets).length - sets0) * SET_BONUS;   // 這次購買剛好集滿套裝的獎金
        if (Object.keys(S.rw.sets).length - sets0 > 1) bad.push('一次購買送了不只一個套裝獎金');
        earned += bonus;
        if (!before.own && before.c >= it.price) { spent += it.price; if (!S.rw.own[it.id] || S.rw.coins !== before.c - it.price + bonus) bad.push('買得起卻沒買成 ' + it.id); }
        else if (S.rw.coins !== before.c) bad.push((before.own ? '重複購買扣錢 ' : '錢不夠還扣錢 ') + it.id);
      }
      if (S.rw.coins < 0) bad.push('金幣變成負數');
      if (S.rw.coins !== earned - spent) { bad.push(`帳目不符：${S.rw.coins} ≠ ${earned} − ${spent}`); break; }
    }
    if (Object.keys(S.rw.sets).length !== SETS.filter(st => st.items.every(id => S.rw.own[id])).length) bad.push('集滿的套裝數和獎金次數對不起來');
    out.push(['P1 金幣帳目正確（含集滿套裝獎金）、不會負數、不能重複買、錢不夠買不了（1500 步）', [...new Set(bad)]]);

    // P2 簽到：要先有練習、一天只能領一次
    bad = []; reset(); day = 0;
    if (ciState() !== 'wait') bad.push('還沒練習就能簽到');
    claimCheckin(); if (S.rw.coins !== 0) bad.push('還沒練習卻領到金幣');
    bump(); if (ciState() !== 'ready') bad.push('練習後不能簽到');
    claimCheckin(); claimCheckin();
    if (S.rw.coins !== 10 || S.rw.ci.days !== 1) bad.push('一天領了不只一次：' + JSON.stringify([S.rw.coins, S.rw.ci]));
    day = 1; if (ciState() !== 'wait') bad.push('隔天沒有重置');
    out.push(['P2 簽到要先練習、一天只能領一次', bad]);

    // P3 連續練習 14 天：各里程碑寶物都拿到、寶箱不重複
    bad = []; reset();
    const timeline = {};
    for (day = 0; day < 14; day++) { bump(); claimCheckin(); timeline[day + 1] = Object.keys(S.rw.own).sort().join(','); }
    const own = S.rw.own;
    for (const id of ['t:strawhat', 't:headband', 'k:cape', 's:meadow', 'x:hearts', 't:rainbow', 'x:float']) if (!own[id]) bad.push('沒拿到 ' + id);
    if (timeline[13].includes('x:float') || !timeline[14].includes('x:float')) bad.push('連續 14 天的動作時間不對');
    if (timeline[2].includes('t:headband') || !timeline[3].includes('t:headband')) bad.push('連續 3 天的寶物時間不對');
    if (timeline[6].includes('k:cape') || !timeline[7].includes('k:cape')) bad.push('連續 7 天的寶物時間不對');
    const chestOwned = REWARDS.filter(it => it.get === 'chest' && own[it.id]).length;
    if (chestOwned !== 2) bad.push('第 7、14 天應各開一個寶箱，實際 ' + chestOwned);
    if (U.rwq.length !== new Set(U.rwq).size) bad.push('彈出的寶物有重複');
    out.push(['P3 連續練習 3／7／14 天的寶物與寶箱都在正確的那天拿到', bad]);

    // P4 每日任務：達標才能領、一天一次；三個都領送任務寶物；滿 10 天送黑板；送完改 +20
    bad = []; reset();
    const taskItems = REWARDS.filter(it => it.get === 'task').map(it => it.id);
    for (day = 0; day < 12; day++) {
      S.log = { [today()]: { s: 2, g: 0, r: 0 } };
      claimTask('s'); if (rwDay().claim.s) bad.push('沒達標就領到');
      S.log[today()] = { s: 5, g: 1, r: 5 };
      const c0 = S.rw.coins;
      ['s', 'g', 'r', 's'].forEach(claimTask);
      const gain = S.rw.coins - c0, expectItem = day < taskItems.length;
      if (gain !== (expectItem ? 30 : 50)) bad.push(`第 ${day + 1} 天金幣 +${gain}`);
      if (S.rw.taskDays !== day + 1) bad.push('任務天數沒有累計：' + S.rw.taskDays);
    }
    if (!taskItems.every(id => S.rw.own[id])) bad.push('任務寶物沒有全部拿到');
    if (!S.rw.own['s:board']) bad.push('滿 10 天沒有拿到教室黑板');
    out.push(['P4 每日任務：達標才能領、不重複、任務寶物依序送、滿 10 天送黑板', bad]);

    // P5 遊戲金幣每天只算前 3 次；拼字複習完成 +20 一天一次；全對 5 次送金牌
    bad = []; reset(); day = 0; S.sp = {};
    for (let i = 0; i < 5; i++) rwGame({ stars: 9 });
    if (S.rw.coins !== 24) bad.push('一天玩 5 次拿到 ' + S.rw.coins + '（應為 3 × 8）');
    day = 1; rwGame({ stars: 0 }); if (S.rw.coins !== 29) bad.push('隔天沒有重置次數');
    const rv = { review: true, stars: 5, score: 4, qs: ['a', 'b', 'c', 'd'], rt: [0, 0, 0, 0] };
    const c1 = S.rw.coins; rwGame(rv); rwGame(rv);
    const per = Math.min(10, 5 + Math.floor(5 / 3));   // 星星 5 顆的遊戲金幣
    if (S.rw.coins - c1 !== per + per + 20) bad.push(`拼字複習完成獎勵不對：+${S.rw.coins - c1}（應為 ${per} + ${per} + 20）`);
    for (let i = 0; i < 3; i++) rwGame(rv);
    if (!S.rw.own['n:medal']) bad.push('全對 5 次沒有金牌');
    rwGame({ review: true, stars: 5, score: 3, qs: ['a', 'b', 'c', 'd', 'a'], rt: [0, 0, 0, 0, 1] });
    out.push(['P5 遊戲每天前 3 次給金幣、拼字複習完成一天一次、全對 5 次送金牌', bad]);

    // P6 寶箱一定開出沒有的；全部有了改給 50 金幣
    bad = []; reset();
    const pool = REWARDS.filter(it => it.get === 'chest');
    const got = []; for (let i = 0; i < pool.length; i++) got.push(openChest());
    if (new Set(got).size !== pool.length || got.includes(null)) bad.push('寶箱開出重複：' + got);
    const c2 = S.rw.coins; if (openChest() !== null || S.rw.coins !== c2 + 50) bad.push('全部都有時沒有改給金幣');
    out.push([`P6 寶箱 ${pool.length} 次開出 ${pool.length} 種不重複寶物，之後改給 50 金幣`, bad]);

    // P7 主題金幣只給第一次
    bad = []; reset();
    const t = TOPICS[0]; t.sents[1].forEach(x => { S.done[x.id] = 1; });
    rwTopic(t.id, 1); rwTopic(t.id, 1);
    if (S.rw.coins !== 15) bad.push('重複完成主題又給金幣：' + S.rw.coins);
    S.done = {}; rwTopic(TOPICS[1].id, 1); if (S.rw.coins !== 15) bad.push('沒完成就給金幣');
    out.push(['P7 完成主題的金幣每個主題只給一次', bad]);

    // P8 頭像：隨機只挑免費部件、上鎖判斷、舊配件搬到脖子、所有部件都畫得出來
    bad = [];
    for (let i = 0; i < 1000; i++) { const c = maRandom(); MA_CATS.forEach(([k, , o]) => { if (o[c[k]] && o[c[k]].lock) bad.push('隨機挑到上鎖部件 ' + k + ':' + c[k]); }); }
    const ok = canUsePart({ 't:wizard': 1 });
    if (!ok('t', 'wizard', MA_TOPS) || ok('t', 'pirate', MA_TOPS) || !ok('t', 'horns', MA_TOPS)) bad.push('canUsePart 判斷錯誤');
    const old = maFix({ b: 'round', a: 'scarf' });
    if (old.n !== 'scarf' || old.a !== 'none') bad.push('舊的圍巾沒有搬到脖子：' + JSON.stringify(old));
    if (JSON.stringify(maFix(old)) !== JSON.stringify(old)) bad.push('maFix 不是冪等');
    for (const sh of Object.keys(MA_SHAPES)) for (const it of REWARDS) {
      try { const svg = maSvg(Object.assign(maFix({ b: sh }), { [it.c]: it.k }), 60); if (!svg.includes('</svg>') || /undefined|NaN/.test(svg)) bad.push(`${sh}/${it.id} 畫壞了`); }
      catch (e) { bad.push(`${sh}/${it.id}: ${e.message}`); }
    }
    out.push([`P8 隨機頭像只挑免費部件、舊配件搬到脖子、${REWARDS.length} 件寶物 × ${Object.keys(MA_SHAPES).length} 種身體都畫得出來`, [...new Set(bad)]]);

    window.Date = RealDate; reset(); S.done = {}; saveProg();
    return out;
  });
  props.forEach(([n, bad]) => result(n, bad));

  // ---------- 端到端 ----------
  const state = () => p.evaluate(() => ({ coins: S.rw.coins, own: Object.keys(S.rw.own), av: JSON.parse(JSON.stringify(cur.avatar)), view: U.view, sheet: U.sheet }));

  // E1 首頁任務卡：練習前不能簽到，練完一個主題後可以簽到並領到金幣
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'home'; render(); });
    if (!(await p.$('.rwcard')) || !(await p.textContent('.rwcard')).includes('還沒練習')) bad.push('首頁沒有任務卡或簽到狀態不對');
    await p.evaluate(() => { cur.mode = 'full'; startTopic(TOPICS[0].id); });
    for (let guard = 0; guard < 60; guard++) {
      const st = await p.evaluate(() => ({ v: U.view, step: U.step, picked: U.picked }));
      if (st.v !== 'lesson') break;
      if (st.step === 0) { await p.click('[data-act=play]'); await p.click('[data-act=to-step][data-s="1"]'); }
      else if (st.step === 1 && st.picked == null) { const i = await p.evaluate(() => U.opts.findIndex(o => o.ok)); await p.click(`[data-act=pick][data-i="${i}"]`); }
      else if (st.step === 1) await p.click('[data-act=to-step][data-s="2"]');
      else if (st.step === 2) await p.click('[data-act=to-step][data-s="3"]');
      else await p.click('[data-act=next-sent]');
    }
    let s = await state();
    if (s.coins !== 15) bad.push('完成主題應該 +15，實際 ' + s.coins);
    await p.evaluate(() => { U.view = 'home'; render(); });
    await p.click('[data-act=rw-ci]');
    s = await state();
    if (s.coins !== 25) bad.push('簽到後應為 25，實際 ' + s.coins);
    if (await p.$('[data-act=rw-ci]')) bad.push('簽到後按鈕還在');
    await p.screenshot({ path: path.join(OUT, 'rewards-home.png') });
    result('E1 練完一個主題 +15、首頁簽到 +10，簽到按鈕只能按一次', bad);
  }

  // E2 商店：錢不夠不能買、兩段確認購買、穿上與脫下
  {
    const bad = [];
    await p.click('[data-act=shop-open]');
    if ((await state()).view !== 'shop') bad.push('打不開商店');
    await p.click('[data-act=shop-cat][data-c=t]');   // 商店預設分類是「套裝」，先切到頭飾
    if (await p.$('.shopit.lockd')) bad.push('商店裡還沒買的東西被畫成灰色（灰色只該在收藏冊）');
    const dis = await p.$eval('[data-act=rw-buy][data-id="t:wizard"]', el => el.disabled);
    if (!dis) bad.push('金幣不夠時購買按鈕沒有停用');
    await p.evaluate(() => { S.rw.coins = 500; render(); });
    await p.click('[data-act=rw-buy][data-id="t:wizard"]');
    if ((await state()).coins !== 500 || !(await p.textContent('[data-act=rw-buy][data-id="t:wizard"]')).includes('確定')) bad.push('第一次點沒有先確認');
    await p.click('[data-act=rw-buy][data-id="t:wizard"]');
    let s = await state();
    if (s.coins !== 350 || !s.own.includes('t:wizard')) bad.push('購買後金幣或擁有狀態不對：' + JSON.stringify(s));
    await p.click('[data-act=rw-wear][data-id="t:wizard"]');
    s = await state();
    if (s.av.t !== 'wizard') bad.push('穿上後頭像沒有戴魔法師帽');
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('elp-profiles')).list[0].avatar.t);
    if (saved !== 'wizard') bad.push('頭像沒有存檔');
    await p.screenshot({ path: path.join(OUT, 'rewards-shop.png') });
    await p.click('[data-act=rw-wear][data-id="t:wizard"]');
    if ((await state()).av.t !== 'none') bad.push('脫下沒有作用');
    await p.click('[data-act=rw-wear][data-id="t:wizard"]');
    // 收藏冊
    await p.click('[data-act=shop-tab][data-t=book]');
    const txt = await p.textContent('#main');
    const total = await p.evaluate(() => REWARDS.length);
    if (!txt.includes(`收藏冊（1/${total}）`)) bad.push('收藏冊數量不對');
    if (!(await p.$('.shopit.lockd .lockb'))) bad.push('收藏冊沒有顯示上鎖的寶物');
    result('E2 商店：錢不夠停用、兩段確認、扣款、穿上／脫下與存檔、收藏冊', bad);
  }

  // E3 頭像工作室：沒收集的部件上鎖，點了不會換；收集到的可以選
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=ab-open]');
    await p.click('[data-act=ab-tab][data-k=t]');
    if (!(await p.$('.abopt.locked[data-id="t:pirate"]'))) bad.push('海盜帽沒有上鎖');
    if (await p.$('.abopt.locked[data-id="t:wizard"]')) bad.push('已經買的魔法師帽還是上鎖');
    await p.click('.abopt.locked[data-id="t:pirate"]');
    if ((await p.evaluate(() => U.ab.t)) === 'pirate') bad.push('點上鎖部件還是換上了');
    await p.evaluate(() => ACT['ab-set']({ dataset: { k: 't', v: 'pirate' } }));
    if ((await p.evaluate(() => U.ab.t)) === 'pirate') bad.push('繞過按鈕直接設定上鎖部件也成功了');
    for (let i = 0; i < 40; i++) await p.evaluate(() => ACT['ab-rand']());
    const leaked = await p.evaluate(() => { const c = U.ab, own = S.rw.own; return MA_CATS.filter(([k, , o]) => o[c[k]] && o[c[k]].lock && !own[k + ':' + c[k]]).map(([k]) => k + ':' + c[k]); });
    if (leaked.length) bad.push('全部隨機挑到沒收集的部件：' + leaked);
    await p.screenshot({ path: path.join(OUT, 'rewards-avatar.png') });
    await p.click('[data-act=ab-cancel]');
    result('E3 頭像工作室：沒收集的部件上鎖、不能選、隨機也不會挑到', bad);
  }

  // E4 得到寶物的彈出視窗：馬上穿上
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'home'; render(); grant('k:cape'); render(); });
    if (!(await p.$('.rwpop'))) bad.push('沒有彈出獲得寶物視窗');
    await p.click('.rwpop [data-act=rw-wear]');
    const s = await state();
    if (s.av.k !== 'cape' || s.sheet) bad.push('馬上穿上沒有作用或視窗沒關');
    result('E4 獲得寶物時彈出視窗，可以馬上穿上', bad);
  }

  // E5 深色風格與手機寬度
  {
    const bad = [];
    for (const sk of ['night', 'minimaldark']) {
      await p.evaluate(sk => { cur.skin = sk; applySkin(); U.view = 'home'; render(); }, sk);
      if (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) bad.push(sk + ' 首頁超出寬度');
      await p.click('[data-act=shop-open]');
      if (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) bad.push(sk + ' 商店超出寬度');
      await p.screenshot({ path: path.join(OUT, `rewards-shop-${sk}.png`) });
      await p.click('[data-act=shop-close]');
    }
    await p.evaluate(() => { cur.skin = 'sticker'; applySkin(); render(); });
    result('E5 深色風格的首頁與商店不超出手機寬度', bad);
  }

  // E8 動作：首頁點小怪獸會動、商店買動作並使用、頭像工作室上鎖、答對與完成畫面一起動
  {
    const bad = [];
    const mvCls = () => p.evaluate(() => { const el = document.querySelector('.rwme .mv'); return el ? el.className : ''; });
    await p.evaluate(() => { cur.avatar = maFix({ b: 'round', c: 'mint' }); saveProfiles(); U.view = 'home'; render(); });
    if (!(await mvCls()).includes('mv-still')) bad.push('首頁小怪獸一進來就在動（應該等點了才動）');
    await p.click('[data-act=me-dance]');
    if (!/mv-bounce.*mv-once/.test(await mvCls())) bad.push('點首頁小怪獸沒有播放「跳跳」：' + await mvCls());
    const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.rwme .mv')).animationName);
    if (anim !== 'mvBounce') bad.push('跳跳的動畫沒有套用：' + anim);
    // 商店「動作」分類：會動的預覽、買搖擺舞、使用、換回跳跳
    await p.evaluate(() => { S.rw.coins = 200; });
    await p.click('[data-act=shop-open]'); await p.click('[data-act=shop-tab][data-t=shop]'); await p.click('[data-act=shop-cat][data-c=x]');   // 商店會記住上次的分頁，先切回「商店」
    const loops = await p.evaluate(() => document.querySelectorAll('.shopit .mv-loop').length);
    const sellN = await p.evaluate(() => REWARDS.filter(it => it.c === 'x' && it.price != null).length);
    if (loops !== sellN) bad.push(`動作預覽應該 ${sellN} 個都在動，實際 ${loops}`);
    await p.click('[data-act=rw-buy][data-id="x:wiggle"]'); await p.click('[data-act=rw-buy][data-id="x:wiggle"]');
    await p.click('[data-act=rw-wear][data-id="x:wiggle"]');
    if ((await p.evaluate(() => cur.avatar.x)) !== 'wiggle') bad.push('使用動作後頭像沒有換成搖擺舞');
    if (!(await p.textContent('[data-act=rw-wear][data-id="x:wiggle"]')).includes('換回跳跳')) bad.push('使用中的按鈕文字不對');
    await p.click('[data-act=shop-close]'); await p.click('[data-act=me-dance]');
    if (!(await mvCls()).includes('mv-wiggle')) bad.push('首頁沒有改播搖擺舞');
    // 頭像工作室「動作」分頁
    await p.evaluate(() => { U.view = 'settings'; render(); });
    await p.click('[data-act=ab-open]'); await p.click('[data-act=ab-tab][data-k=x]');
    if (!(await p.$('.abopt.locked[data-id="x:spin"]'))) bad.push('轉圈圈沒有上鎖');
    if (await p.$('.abopt.locked[data-id="x:wiggle"]')) bad.push('買過的搖擺舞還是上鎖');
    if (!(await p.$('.abprev .mv-loop'))) bad.push('動作分頁的大預覽沒有在動');
    await p.click('[data-act=ab-cancel]');
    // 答對時星星旁邊的小怪獸、完成主題畫面
    await p.evaluate(() => pop(1));
    if (!(await p.evaluate(() => document.querySelector('#pop').innerHTML.includes('mv-wiggle')))) bad.push('答對時沒有出現自己的小怪獸');
    await p.evaluate(() => { U.ti = TOPICS[0].id; U.list = TOPICS[0].sents[1]; U.view = 'tdone'; render(); });
    if (!(await p.$('.duo .mv-wiggle.mv-once'))) bad.push('完成主題畫面的小怪獸沒有動');
    // 減少動態效果：動畫要停掉
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.evaluate(() => { U.view = 'home'; render(); }); await p.click('[data-act=me-dance]');
    if ((await p.evaluate(() => getComputedStyle(document.querySelector('.rwme .mv')).animationName)) !== 'none') bad.push('系統設定「減少動態效果」時還在動');
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    // 舊頭像沒有 x → 跳跳；所有動作都畫得出來
    if ((await p.evaluate(() => maFix({ b: 'drop' }).x)) !== 'bounce') bad.push('舊頭像的預設動作不是跳跳');
    const broken = await p.evaluate(() => Object.keys(MA_MOVES).filter(x => { const h = moveHtml(avCircle(cur.avatar, 60), x, true); return !h.includes('mv-' + x) || /undefined/.test(h); }));
    if (broken.length) bad.push('動作畫壞了：' + broken);
    await p.screenshot({ path: path.join(OUT, 'rewards-moves.png') });
    result('E8 動作：點首頁小怪獸會動、商店買與使用、頭像工作室上鎖、答對與完成畫面一起動、尊重減少動態設定', bad);
  }

  // E6 舊資料：沒有 rw 的進度、配件是圍巾的舊頭像
  {
    const bad = [];
    await p.evaluate(() => {
      const g = JSON.parse(localStorage.getItem('elp-prog-' + cur.id)); delete g.rw; localStorage.setItem('elp-prog-' + cur.id, JSON.stringify(g));
      const P0 = JSON.parse(localStorage.getItem('elp-profiles')); P0.list[0].avatar = { b: 'round', c: 'mint', e: 'dots', m: 'cat', t: 'horns', a: 'scarf', p: 'belly', g: 'cream' }; localStorage.setItem('elp-profiles', JSON.stringify(P0));
    });
    await p.reload(); await p.waitForFunction(() => U.view === 'home');
    const s = await p.evaluate(() => ({ coins: RW().coins, card: !!document.querySelector('.rwcard'), neck: maFix(cur.avatar).n }));
    if (s.coins !== 0 || !s.card) bad.push('舊進度載入後獎勵資料不對 ' + JSON.stringify(s));
    if (s.neck !== 'scarf') bad.push('舊頭像的圍巾沒有出現在脖子');
    if (errs.length) bad.push(errs.join(' | '));
    result('E6 舊版進度（沒有獎勵資料）與舊頭像（圍巾在配件）正常', bad);
  }

  result('E7 全程沒有頁面錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
