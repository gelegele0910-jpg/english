// 星空圖測試：星點門檻、用累積星星點亮、星座徽章與滿天星座、一次點亮多個時不連跳視窗、畫面與舊資料
// 用法：node tests/sky.js
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal } = require('./server');
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '星空測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');

  const props = await p.evaluate(() => {
    const out = [];
    // K1 門檻：第 i 個星座每顆要 10 + 5i 顆，總數和公式一樣，而且一路遞增
    let bad = [], sum = 0;
    const flat = [].concat(...SKY_NEED);
    SKY.forEach((c, i) => c.p.forEach(() => { sum += SKY_BASE + SKY_STEP * i; }));
    if (SKY_TOTAL !== sum) bad.push(`總共需要 ${SKY_TOTAL}，公式算出 ${sum}`);
    if (flat[0] !== SKY_BASE) bad.push('第一顆不是 ' + SKY_BASE);
    for (let i = 1; i < flat.length; i++) if (flat[i] <= flat[i - 1]) { bad.push('門檻沒有遞增，第 ' + i + ' 顆'); break; }
    if (SKY.length !== 14) bad.push('星座數不是 14');
    for (const c of SKY) for (const [a, b2] of c.l) if (!c.p[a] || !c.p[b2]) bad.push(c.n + ' 的連線指到不存在的星點');
    out.push([`K1 ${SKY.length} 個星座、${flat.length} 顆星點，門檻依序遞增，全部點亮需要 ${SKY_TOTAL} 顆星星`, bad]);

    // K2 從 0 顆到全部：點亮數只增不減、剛好達到門檻才亮、「還差幾顆」正確
    bad = [];
    let prev = -1;
    for (let st = 0; st <= SKY_TOTAL + 5; st++) {
      const s = skyState(st), litAll = s.lit.reduce((a, x) => a + x, 0);
      if (litAll < prev) { bad.push('星星變多，點亮數反而變少：' + st); break; }
      if (litAll !== flat.filter(n => st >= n).length) { bad.push('點亮數不對：' + st); break; }
      if (!s.all && s.left !== s.next - st) { bad.push('還差幾顆算錯：' + st); break; }
      if (s.all !== (st >= SKY_TOTAL)) { bad.push('全部點亮的判斷錯：' + st); break; }
      prev = litAll;
    }
    out.push([`K2 從 0 到 ${SKY_TOTAL} 顆星星逐一檢查：點亮數只增不減、剛好達到門檻才亮、還差幾顆正確`, bad]);

    // K3 點亮一個星座送徽章（彈出視窗）、不會重複送；一次點亮好幾個時直接收下、不連跳視窗；全部點亮送場景與稱號
    bad = [];
    S.rw = newRw(); U.rwq = []; U.sheet = null;
    S.stars = SKY_NEED[0].slice(-1)[0] - 1; saveProg();
    if (S.rw.own['n:zod_dipper']) bad.push('還差 1 顆就送了徽章');
    S.stars += 1; saveProg();
    if (!S.rw.own['n:zod_dipper'] || !U.rwq.includes('n:zod_dipper')) bad.push('點亮北斗七星沒有送徽章或沒彈出視窗');
    const q0 = U.rwq.length; saveProg(); saveProg();
    if (U.rwq.length !== q0) bad.push('同一個徽章重複送');
    let toasts = 0; const realToast = window.toast; window.toast = t => { if (String(t).includes('個星座')) toasts++; realToast(t); };
    S.stars = SKY_NEED[6].slice(-1)[0]; saveProg();   // 一次點亮第 2～7 個
    saveProg(); saveProg();
    if (toasts !== 1) bad.push('一次點亮多個星座的提示應該只出現 1 次，實際 ' + toasts + ' 次');
    if (SKY.slice(0, 7).some(c => !S.rw.sky[c.id])) bad.push('點亮的星座沒有記錄在 S.rw.sky');
    window.toast = realToast;
    const got = SKY.slice(0, 7).filter(c => S.rw.own['n:zod_' + c.id]).length;
    if (got !== 7) bad.push('一次點亮多個時，徽章應有 7 個，實際 ' + got);
    if (U.rwq.length !== q0) bad.push('一次點亮多個時不該連跳視窗');
    if (S.rw.own['s:allsky'] || S.rw.title === SKY_TITLE) bad.push('還沒全部點亮就送了滿天星座');
    S.stars = SKY_TOTAL; saveProg();
    if (!S.rw.own['s:allsky'] || S.rw.title !== SKY_TITLE) bad.push('全部點亮沒有送滿天星座或稱號');
    if (SKY.some(c => !S.rw.own['n:zod_' + c.id])) bad.push('全部點亮時有星座沒拿到徽章');
    out.push(['K3 點亮一個星座送徽章並彈出視窗、不重複；一次點亮多個時直接收下不連跳；全部點亮送「滿天星座」與稱號', bad]);

    // K4 徽章與場景畫得出來、星星不會被扣掉
    bad = [];
    for (const sh of Object.keys(MA_SHAPES)) for (const c of SKY) { const svg = maSvg(maFix({ b: sh, n: 'zod_' + c.id }), 60); if (/undefined|NaN/.test(svg)) bad.push(sh + '/' + c.id); }
    if (/undefined|NaN/.test(maSvg(maFix({ s: 'allsky' }), 60))) bad.push('滿天星座畫壞了');
    const before = S.stars; rwSky(); vSky(); if (S.stars !== before) bad.push('打開星空圖後星星變少了');
    out.push([`K4 ${SKY.length} 個徽章 × ${Object.keys(MA_SHAPES).length} 種身體、滿天星座都畫得出來；星星不會被扣掉`, bad]);

    S.stars = 0; S.rw = newRw(); U.rwq = []; U.sheet = null; saveProg();
    return out;
  });
  props.forEach(([n, bad]) => result(n, bad));

  // E1 點頂端星星打開星空圖：大圖亮的星點數正確、14 個縮圖、關閉回到原畫面、答對拿到的星星會累積進去
  {
    const bad = [];
    await p.evaluate(() => { S.stars = 23; U.view = 'home'; render(); });   // 北斗七星門檻 10, 20, 30 … → 亮 2 顆
    await p.click('[data-act=sky-open]');
    if ((await p.evaluate(() => U.view)) !== 'sky') bad.push('點星星沒有打開星空圖');
    const lit = await p.evaluate(() => document.querySelectorAll('.skybig circle[fill="#fff6c8"]').length);
    if (lit !== 2) bad.push('23 顆星星應該亮 2 顆，實際 ' + lit);
    if (!(await p.textContent('.skyinfo')).includes('再 7 顆星星')) bad.push('還差幾顆的文字不對：' + await p.textContent('.skyinfo'));
    if ((await p.$$('.skyit')).length !== 14) bad.push('縮圖不是 14 個');
    await p.screenshot({ path: path.join(OUT, 'sky.png') });
    await p.click('[data-act=sky-close]');
    if ((await p.evaluate(() => U.view)) !== 'home') bad.push('關閉後沒有回到首頁');
    const s0 = await p.evaluate(() => S.stars);
    await p.evaluate(() => { reward(3); });
    if ((await p.evaluate(() => S.stars)) !== s0 + 3) bad.push('拿到的星星沒有累積');
    for (const sk of ['night', 'minimaldark', 'notebook']) {
      await p.evaluate(sk => { cur.skin = sk; applySkin(); U.view = 'sky'; render(); }, sk);
      if (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) bad.push(sk + ' 星空圖超出寬度');
    }
    await p.screenshot({ path: path.join(OUT, 'sky-night.png') });
    await p.evaluate(() => { cur.skin = 'sticker'; applySkin(); S.stars = SKY_TOTAL; saveProg(); U.view = 'sky'; render(); });
    if (!(await p.textContent('.skyinfo')).includes('全部點亮')) bad.push('全部點亮時文字不對');
    await p.evaluate(() => { U.rwq = []; U.sheet = null; U.view = 'home'; render(); });
    result('E1 點頂端星星打開星空圖：亮的星點與還差幾顆正確、14 個縮圖、可以關閉、星星會累積、各風格不超出寬度', bad);
  }

  // E2 收藏冊有星座徽章；舊資料沒有 sky 欄位
  {
    const bad = [];
    await p.click('[data-act=shop-open]'); await p.click('[data-act=shop-tab][data-t=book]'); await p.click('[data-act=shop-cat][data-c=n]');
    const n = await p.evaluate(() => [...document.querySelectorAll('.shopit b')].filter(b => b.textContent.endsWith('徽章')).length);
    if (n < 14) bad.push('收藏冊的脖子分類沒有 14 個星座徽章，實際 ' + n);
    await p.click('[data-act=shop-close]');
    await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('elp-prog-' + cur.id)); delete g.rw.sky; g.stars = 15; localStorage.setItem('elp-prog-' + cur.id, JSON.stringify(g)); });
    await p.reload(); await p.waitForFunction(() => U.view === 'home');
    const s = await p.evaluate(() => ({ sky: RW().sky, lit: skyState().lit[0] }));
    if (!s.sky || s.lit !== 1) bad.push('舊資料載入後星空不對 ' + JSON.stringify(s));
    result('E2 收藏冊有 14 個星座徽章；舊版進度（沒有星空欄位）正常', bad);
  }

  // E4 閃閃發亮與欣賞：背景星星和亮的星點有動畫；已點亮的星座可以點開大圖（英文名、小知識、點亮日期、戴上徽章）；沒點亮的點了不會開
  {
    const bad = [];
    await p.evaluate(() => { S.stars = SKY_NEED[2][1] + 1;   /* 北斗七星、獵戶座全亮，牡羊座亮 2 顆（主畫面才有發光的星點可以檢查） */ S.rw.sky = {}; U.rwq = []; U.sheet = null; saveProg(); U.rwq = []; U.sheet = null; U.view = 'sky'; render(); });
    const anim = await p.evaluate(() => ({
      tw: document.querySelectorAll('.skybig .tw').length, twName: getComputedStyle(document.querySelector('.skybig .tw')).animationName,
      glow: getComputedStyle(document.querySelector('.skybig .sg')).animationName
    }));
    if (anim.tw < 20 || anim.twName !== 'twinkle') bad.push('背景星星沒有閃爍 ' + JSON.stringify(anim));
    if (anim.glow !== 'glowPulse') bad.push('點亮的星點沒有發光動畫');
    // 已點亮的北斗七星
    await p.click('[data-act=sky-view][data-c=dipper]');
    if ((await p.evaluate(() => U.sheet)) !== 'sky') bad.push('點已點亮的星座沒有打開欣賞視窗');
    const t = await p.textContent('.skysheet');
    if (!t.includes('Big Dipper') || !t.includes('北極星')) bad.push('欣賞視窗沒有英文名字或小知識');
    const md = await p.evaluate(() => { const d = new Date(); return `${d.getMonth() + 1}/${d.getDate()}`; });
    if (!t.includes(md + ' 點亮')) bad.push('沒有顯示點亮日期 ' + md);
    const lit = await p.evaluate(() => document.querySelectorAll('.skysheet .skybig circle[fill="#fff6c8"]').length);
    if (lit !== 7) bad.push('北斗七星大圖應該 7 顆全亮，實際 ' + lit);
    await p.screenshot({ path: path.join(OUT, 'sky-view.png') });
    await p.click('.skysheet [data-act=rw-wear]');
    if ((await p.evaluate(() => maFix(cur.avatar).n)) !== 'zod_dipper') bad.push('戴上徽章沒有作用');
    if ((await p.evaluate(() => U.sheet)) !== 'sky') bad.push('戴上徽章後視窗被關掉了');
    await p.click('.skysheet [data-act=sky-shut]');
    if (await p.evaluate(() => U.sheet)) bad.push('關不掉欣賞視窗');
    // 還沒開始的星座
    await p.click('[data-act=sky-view][data-c=pisces]');
    if (await p.evaluate(() => U.sheet)) bad.push('還沒點亮的星座也打開了視窗');
    // 正在點的星座可以看進度
    await p.click('[data-act=sky-view][data-c=aries]');
    if (!(await p.textContent('.skysheet')).includes('正在點亮')) bad.push('正在點的星座沒有顯示進度');
    await p.click('.skysheet [data-act=sky-shut]');
    // 減少動態效果
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.evaluate(() => render());
    if ((await p.evaluate(() => getComputedStyle(document.querySelector('.skybig .tw')).animationName)) !== 'none') bad.push('減少動態效果時還在閃');
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    if (await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) bad.push('星空圖超出寬度');
    await p.evaluate(() => { U.view = 'home'; render(); });
    result('E4 閃閃發亮（背景閃爍、星點發光、減少動態時停止）；點開已點亮的星座欣賞（英文名、小知識、點亮日期、戴上徽章）；沒點亮的不會開', bad);
  }

  result('E3 全程沒有頁面錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
