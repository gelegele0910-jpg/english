// 跟讀比對放寬與寶物放大看：發音相近、漏掉小字不扣分、多個辨識猜測挑最好的；點寶物圖片放大
// 用法：node tests/speech-zoom.js
const { chromium, devices } = require('playwright');
const { start, blockExternal } = require('./server');

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

// 假的語音辨識：開始後送出一段結果（含多個猜測），再結束
const FAKE_SR = () => {
  window.__srAlts = [['hello']];
  window.SpeechRecognition = class {
    start() {
      setTimeout(() => {
        const r = window.__srAlts.map(a => { const x = a.map(t => ({ transcript: t, confidence: .5 })); x.isFinal = true; return x; });
        this.onresult && this.onresult({ resultIndex: 0, results: r });
        this.onend && this.onend();
      }, 30);
    }
    stop() {}
    abort() {}
  };
};

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(FAKE_SR);
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '跟讀測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');

  const props = await p.evaluate(() => {
    const out = [], sc = (t, x) => compareText(t, x).score;
    // V1 每一句課程句子念得一模一樣都是 100 分
    let bad = [], all = [];
    TOPICS.forEach(tp => Object.values(tp.lv).forEach(L => L.forEach(x => all.push(x[0]))));
    ARTICLES.forEach(a => a.s.forEach(x => all.push(x[0])));
    all.forEach(t => { const s = sc(t, t); if (s !== 100) bad.push(`${s}：${t}`); });
    out.push([`V1 ${all.length} 句課程句子原文照念都是 100 分`, bad]);

    // V2 小朋友常見的念法要算對（發音相近、字尾沒念清楚、漏掉小字）
    bad = [];
    const easy = [
      ['This is very good.', 'dis is bery good', 100],
      ['I like dogs.', 'I like dog', 100],
      ['She played with the cat.', 'she play with cat', 100],
      ['Thank you very much.', 'sank you very much', 100],
      ['I want to eat an apple.', 'I want eat apple', 100],
      ['We are going to the park.', 'we going park', 100],
      ['My father is a teacher.', 'my fader is teacher', 100],
      ['I have three books.', 'I have tree book', 100]
    ];
    easy.forEach(([t, x, need]) => { const s = sc(t, x); if (s < need) bad.push(`「${x}」對「${t}」只有 ${s} 分`); });
    out.push(['V2 發音相近、字尾 s／ed 沒念出來、漏掉 a／the／to 等小字都算對', bad]);

    // V3 還是要分得出念錯：完全不同的句子、沒有聲音、只念小字
    bad = [];
    const hard = [
      ['I like to play basketball after school.', 'what time is it now', 35],
      ['The weather is sunny today.', '', 1],
      ['My brother likes swimming.', 'my is', 35],
      ['Elephants are very big animals.', 'monkeys are small', 35]
    ];
    hard.forEach(([t, x, lt]) => { const s = sc(t, x); if (s >= lt) bad.push(`「${x}」對「${t}」竟然有 ${s} 分`); });
    // 漏掉一個主要的字一定扣分
    if (sc('I like dogs and cats.', 'I like dogs') >= 100) bad.push('漏掉 cats 還是 100 分');
    out.push(['V3 念錯的句子、沒聲音、漏掉主要的字仍然會扣分', bad]);

    // V4 隨機測試：分數在 0～100、拿掉越多主要的字分數不會變高
    bad = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 400; k++) {
      const t = all[Math.floor(rnd() * all.length)], w = t.split(/\s+/);
      const cut = Math.floor(rnd() * w.length);
      const s1 = sc(t, w.slice(0, w.length - cut).join(' ')), s2 = sc(t, w.slice(0, Math.max(0, w.length - cut - 1)).join(' '));
      if (s1 < 0 || s1 > 100) bad.push('分數超出範圍：' + s1);
      if (s2 > s1) { bad.push(`少念一個字分數反而變高：${t}`); }
    }
    out.push(['V4 400 組隨機截短：分數在 0～100，少念字分數不會變高', bad]);

    // V5 多個辨識猜測：組合正確、挑分數最高的
    bad = [];
    const alts = heardAlts([['I like dog', 'I like dogs'], ['and cat', 'and cats']], 'I like dog and cat');
    if (!alts.includes('I like dogs and cats')) bad.push('第二個猜測沒有組起來：' + JSON.stringify(alts));
    if (new Set(alts).size !== alts.length) bad.push('猜測有重複');
    const bh = bestHeard('Can you swim?', ['can you swing', 'can you swim', 'cannot']);
    if (bh.t !== 'can you swim' || bh.c.score !== 100) bad.push('沒有挑到最好的猜測：' + bh.t);
    if (bestHeard('Hi.', []).c.score !== 0) bad.push('沒有猜測時應該 0 分');
    out.push(['V5 多個辨識猜測會組成完整句子，並挑分數最高的', bad]);
    return out;
  });
  props.forEach(([n, bad]) => result(n, bad));

  // V6 實際流程：假的麥克風回傳「第一個猜測錯、第二個猜測對」，畫面要用對的那個算分
  {
    const bad = [];
    await p.evaluate(() => { startTopic(TOPICS[0].id); render(); });
    await p.waitForFunction(() => U.view === 'lesson');
    const en = await p.evaluate(() => { U.step = 3; render(); return curSent().en; });
    await p.evaluate(en => { window.__srAlts = [['blah blah', en]]; }, en);
    const coins0 = await p.evaluate(() => RW().coins);
    await p.click('[data-act=mic]');
    await p.waitForFunction(() => U.shadow && !U.rec);
    const txt = await p.textContent('#main');
    if (!/完美|很棒/.test(txt)) bad.push('第二個猜測正確卻沒有得到好分數');
    if (txt.includes('blah blah')) bad.push('畫面顯示的是比較差的那個猜測');
    const coins1 = await p.evaluate(() => RW().coins);
    if (coins1 <= coins0) bad.push('跟讀高分沒有得到金幣');
    result('V6 假的麥克風：多個猜測裡用最好的一個算分並顯示（真的語音辨識在無頭瀏覽器無法驗證）', bad);
  }

  // Z1～Z3 放大看寶物
  {
    const bad = [];
    await p.evaluate(() => { U.view = 'shop'; U.shopTab = 'shop'; U.shopCat = 'set'; U.sheet = null; render(); });
    const name = await p.evaluate(() => { const b = document.querySelector('.zoomb'); return RW_BY[b.dataset.id].id; });
    await p.click('.zoomb');
    await p.waitForSelector('.zoomsheet');
    const z = await p.evaluate(() => { const r = document.querySelector('.zoomart svg').getBoundingClientRect(); return { w: r.width, t: document.querySelector('.zoomsheet').textContent }; });
    if (z.w < 180) bad.push('放大的圖只有 ' + Math.round(z.w) + 'px');
    const nm = await p.evaluate(id => rwName(RW_BY[id]), name);
    if (!z.t.includes(nm)) bad.push('放大視窗沒有寫名字');
    await p.click('.zoomsheet [data-act=zoom-shut]');
    await p.waitForFunction(() => !document.querySelector('.zoomsheet') && U.sheet === null);
    result('Z1 商店點寶物圖片會放大（240px）並寫名字，按 ✕ 關閉', bad);
  }
  {
    const bad = [];
    // 放大不會影響原本的購買按鈕（兩段確認）
    await p.evaluate(() => { RW().coins = 999; U.arm = null; render(); });
    const id = await p.evaluate(() => document.querySelector('.shopit [data-act=rw-buy]:not([disabled])').dataset.id);
    await p.click(`.shopit [data-act=rw-buy][data-id="${id}"]`);
    if (await p.evaluate(() => U.sheet)) bad.push('按購買卻打開了放大視窗');
    await p.click(`.shopit [data-act=rw-buy][data-id="${id}"]`);
    if (!(await p.evaluate(id => !!RW().own[id], id))) bad.push('點兩次沒有買到');
    // 動作也能放大，而且會一直動
    await p.evaluate(() => { U.shopTab = 'book'; U.shopCat = 'x'; render(); });
    await p.click('.zoomb');
    await p.waitForSelector('.zoomsheet .mv');
    // 點背景也能關閉
    await p.click('.sheet-bg', { position: { x: 10, y: 10 } });
    await p.waitForFunction(() => !document.querySelector('.zoomsheet'));
    result('Z2 購買按鈕照常（兩段確認）、動作也能放大播放、點背景關閉', bad);
  }
  {
    const bad = [];
    // 沒收集的隱藏版是黑影，不可以放大偷看；收集到的可以
    await p.evaluate(() => { U.shopTab = 'book'; U.shopCat = 'h'; render(); });
    if (await p.$('.shopit .sil')) { if (await p.evaluate(() => [...document.querySelectorAll('.shopit')].some(c => c.querySelector('.sil') && c.querySelector('.zoomb')))) bad.push('黑影可以放大'); }
    const hid = await p.evaluate(() => { const it = REWARDS.find(x => x.c === 'h'); U.zoomId = it.id; U.sheet = 'zoom'; render(); return it.id; });
    if (await p.$('.zoomsheet')) bad.push('沒收集的隱藏版直接開放大也看得到');
    await p.evaluate(id => { RW().own[id] = 1; U.sheet = null; render(); }, hid);
    await p.click(`.zoomb[data-id="${hid}"]`);
    await p.waitForSelector('.zoomsheet .hmon svg');
    await p.evaluate(() => { U.sheet = null; render(); });
    // 深色風格也看得到
    await p.evaluate(() => { document.body.dataset.skin = 'minimaldark'; U.shopTab = 'shop'; U.shopCat = 't'; render(); });
    await p.click('.zoomb');
    await p.waitForSelector('.zoomsheet');
    result('Z3 沒收集的隱藏版不能放大；收集到的可以；深色風格正常', bad);
  }

  result('沒有網頁錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
