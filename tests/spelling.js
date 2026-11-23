// 拼字複習測試：間隔規則、逐字對照、三種拼字遊戲的實際操作與首頁「今天要複習的拼字」
// 用法：node tests/spelling.js
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal } = require('./server');
const OUT = path.join(__dirname, 'output'); fs.mkdirSync(OUT, { recursive: true });

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { let s = 7; Math.random = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '拼字測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');

  // ---------- 屬性測試：間隔規則 ----------
  const rules = await p.evaluate(() => {
    const out = [], real = Date.now, base = real();
    let day = 0; Date.now = () => base + day * DAY;
    const t0 = dayNo();
    const fresh = () => { S.sp = {}; };

    // R1 每天在複習日拼對：隔天 → 3 → 7 → 14 → 30 → 熟練
    let bad = []; fresh(); day = 0;
    const gaps = [];
    for (let n = 0; n < 6; n++) { spRecall('apple', true); const r = S.sp.apple; if (!r.m) { gaps.push(r.d - dayNo()); day = r.d - t0; } }
    if (JSON.stringify(gaps) !== '[1,3,7,14,30]') bad.push('間隔 ' + JSON.stringify(gaps));
    if (!S.sp.apple.m) bad.push('30 天後拼對沒有變成熟練');
    if (spIsDue(S.sp.apple)) bad.push('熟練的字不應該再排複習');
    out.push(['R1 間隔依序為 隔天 → 3 → 7 → 14 → 30 天 → 熟練', bad]);

    // R2 同一天拼對很多次只前進一格；提早拼對不前進
    bad = []; fresh(); day = 0;
    for (let n = 0; n < 10; n++) spRecall('apple', true);
    if (S.sp.apple.l !== 1 || S.sp.apple.d !== t0 + 1) bad.push('同一天拼對 10 次：' + JSON.stringify(S.sp.apple));
    day = 1; spRecall('apple', true); const after = JSON.stringify([S.sp.apple.l, S.sp.apple.d]);
    day = 2; spRecall('apple', true);
    if (JSON.stringify([S.sp.apple.l, S.sp.apple.d]) !== after) bad.push('還沒到複習日就前進了');
    out.push(['R2 一天最多前進一格，提早拼對不算', bad]);

    // R3 拼錯退回隔天，從頭累積
    bad = []; fresh(); day = 0;
    spRecall('apple', true); day = 1; spRecall('apple', true); day = 4; spRecall('apple', true); // 到 7 天階段
    day = 11; spRecall('apple', false);
    let r = S.sp.apple;
    if (r.l !== 0 || r.d !== t0 + 12 || r.ng !== 1) bad.push('拼錯後 ' + JSON.stringify(r));
    spRecall('apple', true);
    if (S.sp.apple.d !== t0 + 12) bad.push('拼錯當天再拼對不應前進');
    day = 12; spRecall('apple', true);
    if (S.sp.apple.d - dayNo() !== 1) bad.push('拼錯後隔天拼對，下一次應該是隔天：' + (S.sp.apple.d - dayNo()));
    out.push(['R3 拼錯退回隔天、當天不再前進、之後從頭累積', bad]);

    // R4 選拼法只記錄：選對不排程、不前進；選錯提早到隔天、不前進
    bad = []; fresh(); day = 0;
    spPick('apple', true);
    if (S.sp.apple.d !== null || S.sp.apple.pc !== 1) bad.push('選對不應排複習 ' + JSON.stringify(S.sp.apple));
    spRecall('apple', true); day = 1; spRecall('apple', true); // l=2, 3 天後
    const l0 = S.sp.apple.l;
    for (let n = 0; n < 5; n++) spPick('apple', true);
    if (S.sp.apple.l !== l0) bad.push('選對讓間隔前進了');
    spPick('apple', false);
    if (S.sp.apple.d !== dayNo() + 1 || S.sp.apple.l !== l0 || S.sp.apple.pw !== 1) bad.push('選錯後 ' + JSON.stringify(S.sp.apple));
    fresh(); spPick('kite', false);
    if (S.sp.kite.d !== dayNo() + 1) bad.push('沒有紀錄的字選錯，應該排到隔天');
    out.push(['R4 選拼法只記錄、不延長間隔；選錯讓複習提早到隔天', bad]);

    // R5 隨機序列不變量（2000 步）
    bad = []; fresh(); day = 0;
    let seed = 99; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let prev = { l: 0, day: -1 }, adv = {};
    for (let n = 0; n < 2000; n++) {
      if (rnd() < 0.3) day += 1 + Math.floor(rnd() * 5);
      const op = rnd(), w = ['apple', 'kite', 'zebra'][Math.floor(rnd() * 3)];
      const before = S.sp[w] ? { ...S.sp[w] } : null;
      if (op < 0.45) spRecall(w, true); else if (op < 0.6) spRecall(w, false); else if (op < 0.85) spPick(w, true); else spPick(w, false);
      const a = S.sp[w], t = dayNo();
      if (a.l < 0 || a.l > SP_INT.length) bad.push('l 超出範圍 ' + JSON.stringify(a));
      if (a.d != null && a.d - t > 30) bad.push('間隔超過 30 天 ' + JSON.stringify(a));
      if (a.m && a.l !== SP_INT.length) bad.push('熟練但階段不對 ' + JSON.stringify(a));
      if (before && a.l > before.l) { const key = w + '@' + t; adv[key] = (adv[key] || 0) + 1; if (adv[key] > 1) bad.push('同一天前進兩次 ' + key); }
      if (op >= 0.6 && before && a.l > before.l) bad.push('選拼法讓階段前進 ' + JSON.stringify([before, a]));
      if (op >= 0.85 && (a.d == null || a.d > t + 1)) bad.push('選錯後複習日晚於隔天 ' + JSON.stringify(a));
    }
    out.push(['R5 隨機 2000 步：階段範圍、間隔上限、一天最多前進一次、選拼法不延長', [...new Set(bad)]]);

    // D1 逐字對照：兩列各自還原原字，差異數等於編輯距離
    bad = [];
    const lev = (a, b2) => { const D = [...Array(a.length + 1)].map((_, i) => [i, ...Array(b2.length).fill(0)]); for (let j = 1; j <= b2.length; j++) D[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b2.length; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (a[i - 1] === b2[j - 1] ? 0 : 1)); return D[a.length][b2.length]; };
    for (let n = 0; n < 1000; n++) {
      const mk = () => { let x = ''; for (let i = 0, L = Math.floor(rnd() * 12); i < L; i++) x += 'abcdeu<&'[Math.floor(rnd() * 8)]; return x; };
      const a = mk(), c = rnd() < 0.2 ? a : mk(), ops = spDiff(a, c);
      if (ops.filter(o => o.t !== '+').map(o => o.a).join('') !== a) bad.push('上列還原失敗 ' + JSON.stringify([a, c]));
      if (ops.filter(o => o.t !== '-').map(o => o.b).join('') !== c) bad.push('下列還原失敗 ' + JSON.stringify([a, c]));
      if (ops.filter(o => o.t !== '=').length !== lev(a, c)) bad.push('不是最少差異 ' + JSON.stringify([a, c]));
      const d = document.createElement('div'); d.innerHTML = spDiffHtml(a, c);
      if (d.querySelector('img,script')) bad.push('HTML 沒有跳脫');
    }
    out.push(['D1 逐字對照：兩列都能還原、標出的差異最少（1000 組）', bad]);

    Date.now = real; S.sp = {}; saveProg();
    return out;
  });
  rules.forEach(([n, bad]) => result(n, bad));

  // ---------- 端到端 ----------
  const st = () => p.evaluate(() => ({ q: U.g && U.g.qs[U.g.i], i: U.g && U.g.i, qs: U.g && U.g.qs.slice(), rt: U.g && U.g.rt && U.g.rt.slice(), picked: U.g && U.g.picked, fixed: U.g && U.g.fixed, sp: JSON.parse(JSON.stringify(S.sp || {})), today: dayNo() }));
  const wrongOf = q => q.slice(1) + q[0] === q ? q + 'x' : q.slice(1) + q[0];

  // E1 打字：拼錯 → 顯示對照、必須訂正、隔 2～3 題再出現、再出現時拼對算當場訂正
  {
    const bad = [];
    await p.evaluate(() => { U.gsrc = 'new'; U.view = 'games'; render(); });
    await p.click('[data-act=gstart][data-g=type]');
    let s = await st(); const q = s.q;
    await p.fill('#spIn', wrongOf(q)); await p.press('#spIn', 'Enter');
    s = await st();
    if (s.picked !== 0) bad.push('拼錯沒有被判錯');
    if (!(await p.$('.dgrid')) || !(await p.$('.sp-correct'))) bad.push('沒有顯示逐字對照或大字正確拼法');
    if (await p.$('[data-act=gnext]')) bad.push('還沒訂正就能按下一題');
    if (!s.sp[q] || s.sp[q].ng !== 1 || s.sp[q].d !== s.today + 1 || s.sp[q].l !== 0) bad.push('拼字紀錄不對 ' + JSON.stringify(s.sp[q]));
    const again = s.qs.map((x, j) => x === q && j > s.i ? j : -1).filter(j => j >= 0);
    if (again.length !== 1 || ![s.i + 3, s.i + 4].includes(again[0]) || s.rt[again[0]] !== 1) bad.push(`沒有排在 2～3 題後：第 ${s.i} 題錯，再出現於 ${again}`);
    await p.screenshot({ path: path.join(OUT, 'spell-type-fix.png') });
    await p.fill('#spIn', wrongOf(q)); await p.press('#spIn', 'Enter');
    if ((await st()).fixed) bad.push('訂正打錯也算過關');
    await p.fill('#spIn', q.toUpperCase()); await p.press('#spIn', 'Enter');
    s = await st();
    if (!s.fixed || !(await p.$('[data-act=gnext]'))) bad.push('訂正正確後沒有出現下一題');
    if (s.sp[q].ok !== 0) bad.push('訂正不應該算成第一次拼對');
    // 答對接下來的題目直到錯字再出現
    for (let guard = 0; guard < 10; guard++) {
      await p.click('[data-act=gnext]'); s = await st();
      if (s.q === q) break;
      await p.fill('#spIn', s.q); await p.press('#spIn', 'Enter');
    }
    if (s.q !== q || !(await p.$('text=剛剛拼錯的字，再試一次！'))) bad.push('錯字沒有再出現或沒有提示');
    const recBefore = JSON.stringify(s.sp[q]);
    await p.fill('#spIn', q); await p.press('#spIn', 'Enter');
    s = await st();
    if (JSON.stringify(s.sp[q]) !== recBefore) bad.push('再出現時拼對不應改變跨天紀錄');
    if ((await p.evaluate(() => U.g.fixedN)) !== 1) bad.push('當場訂正沒有計入');
    result('E1 打字拼拼看：拼錯要訂正、隔 2～3 題再出現、當場訂正不算跨天', bad);
  }

  // E2 拼字積木：拼錯 → 重拼正確才能繼續；干擾字母變多
  {
    const bad = [];
    await p.evaluate(() => { U.gsrc = 'new'; U.view = 'games'; render(); });
    await p.click('[data-act=gstart][data-g=tiles]');
    const info = await p.evaluate(() => ({ q: U.g.qs[0], letters: U.g.letters.map(l => l.ch) }));
    if (info.letters.length - info.q.length < 3) bad.push('干擾字母太少：' + (info.letters.length - info.q.length));
    // 依序點出一個錯的拼法：正確字母的順序倒過來（若剛好一樣，換成干擾字母）
    const order = await p.evaluate(() => {
      const g = U.g, q = g.qs[0], used = new Set(), idx = [];
      for (const ch of q.split('')) { const j = g.letters.findIndex((L, k) => L.ch === ch && !used.has(k)); used.add(j); idx.push(j); }
      let w = idx.slice().reverse();
      if (w.map(j => g.letters[j].ch).join('') === q) { const extra = g.letters.findIndex(L => !q.includes(L.ch)); w[0] = extra; }
      return { wrong: w, right: idx };
    });
    for (const j of order.wrong) await p.click(`[data-act=tile][data-i="${j}"]`);
    let s = await st();
    if (s.picked !== 0 || !(await p.$('.dgrid'))) bad.push('拼錯後沒有顯示對照');
    if (await p.$('[data-act=gnext]')) bad.push('還沒重拼就能按下一題');
    if (!(await p.$('[data-act=tile]'))) bad.push('訂正時沒有字母積木可以點');
    await p.screenshot({ path: path.join(OUT, 'spell-tiles-fix.png') });
    for (const j of order.right) await p.click(`[data-act=tile][data-i="${j}"]`);
    s = await st();
    if (!s.fixed || !(await p.$('[data-act=gnext]'))) bad.push('重拼正確後沒有出現下一題');
    if (s.sp[info.q].ng !== 1) bad.push('積木拼錯沒有記錄');
    result('E2 拼字積木：干擾字母 ≥ 3、拼錯要重拼正確才能繼續', bad);
  }

  // E3 選拼法：選錯只記錄、提早複習，不需重拼
  {
    const bad = [];
    await p.evaluate(() => { U.gsrc = 'new'; U.view = 'games'; render(); });
    await p.click('[data-act=gstart][data-g=spell]');
    const { q, wrong } = await p.evaluate(() => ({ q: U.g.qs[0], wrong: U.g.opts.findIndex(o => o !== U.g.qs[0]) }));
    await p.click(`[data-act=gpick][data-i="${wrong}"]`);
    const s = await st(), r = s.sp[q];
    if (!r || r.pw !== 1 || r.l !== 0 || r.d !== s.today + 1 || r.ok || r.ng) bad.push('選錯的紀錄不對 ' + JSON.stringify(r));
    if (!(await p.$('.dgrid'))) bad.push('選錯沒有顯示對照');
    if (!(await p.$('[data-act=gnext]'))) bad.push('選拼法不需要重拼，應該直接有下一題');
    result('E3 哪個拼對了？：選錯只記錄、提早到隔天、顯示對照', bad);
  }

  // E4 隔天首頁出現「今天要複習的拼字」，進去複習、拼對後延長
  {
    const bad = [];
    await p.evaluate(() => { leaveActivity(); window.__realNow = Date.now; Date.now = () => window.__realNow() + DAY; U.view = 'home'; render(); });
    const due = await p.evaluate(() => spDue());
    if (!due.length) bad.push('隔天沒有到期的拼字');
    const banner = await p.$('[data-act=sp-review]');
    if (!banner || !(await p.textContent('#main')).includes(`今天要複習的拼字：${due.length} 個`)) bad.push('首頁沒有顯示拼字複習卡');
    await p.screenshot({ path: path.join(OUT, 'spell-home.png') });
    await banner.click();
    let g = await p.evaluate(() => ({ id: U.g.id, review: U.g.review, qs: U.g.qs.slice(), head: document.querySelector('.lhead b').textContent }));
    if (g.id !== 'tiles' || !g.review || g.head !== '拼字複習') bad.push('入門程度應該用拼字積木複習 ' + JSON.stringify(g));
    if (JSON.stringify(g.qs.slice().sort()) !== JSON.stringify(due.slice(0, 10).sort())) bad.push('複習題目不是到期的字');
    const before = await p.evaluate(() => JSON.parse(JSON.stringify(S.sp)));
    // 全部拼對
    for (let guard = 0; guard < 30; guard++) {
      const done = await p.evaluate(() => U.g.done); if (done) break;
      await p.evaluate(() => { const g = U.g, q = g.qs[g.i], used = new Set(); for (const ch of q) { const j = g.letters.findIndex((L, k) => L.ch === ch && !used.has(k)); used.add(j); ACT.tile({ dataset: { i: j } }); } });
      await p.click('[data-act=gnext]');
    }
    const s = await st();
    // 每個字都剛好前進一格，下次複習間隔 = 當時階段對應的天數
    const INT = [1, 3, 7, 14, 30];
    const notAdv = due.filter(k => !(s.sp[k].l === before[k].l + 1 && s.sp[k].d === s.today + INT[before[k].l]));
    if (notAdv.length) bad.push('複習拼對後沒有前進一格：' + notAdv.map(k => k + JSON.stringify([before[k], s.sp[k]])).join(' '));
    if (!due.some(k => before[k].l === 0) || !due.some(k => before[k].l === 1)) bad.push('測試資料應同時包含「昨天拼錯」與「昨天拼對」的字');
    if (!(await p.$('text=去遊戲中心')) || await p.$('[data-act=sp-review]')) bad.push('複習完成畫面按鈕不對');
    await p.evaluate(() => { U.view = 'home'; render(); });
    if (await p.$('[data-act=sp-review]')) bad.push('複習完首頁還有拼字卡');
    await p.evaluate(() => { Date.now = window.__realNow; });
    result(`E4 隔天首頁出現拼字複習（${due.length} 個），複習拼對後排到下一階段`, bad);
  }

  // E5 國中程度以上用打字、遊戲中心標示推薦；家長看板顯示拼字統計
  {
    const bad = [];
    await p.evaluate(() => { cur.level = 3; saveProfiles(); U.view = 'games'; render(); });
    const tag = await p.$('[data-g=type] .sptag'), tag2 = await p.$('[data-g=tiles] .sptag');
    if (!tag || tag2) bad.push('進階程度應推薦打字');
    if ((await p.evaluate(() => spSkill())) !== 'type') bad.push('spSkill 應為 type');
    await p.evaluate(() => { cur.level = 1; saveProfiles(); U.board = { data: { [cur.id]: S } }; U.view = 'board'; render(); });
    if (!(await p.textContent('#main')).match(/拼字：熟練 \d+ 字・學習中 \d+ 字・今天待複習 \d+ 字/)) bad.push('家長看板沒有拼字統計');
    result('E5 程度推薦（入門積木／進階打字）與家長看板拼字統計', bad);
  }

  // E6 深色風格、長單字訂正畫面不會超出手機寬度
  {
    const bad = [];
    for (const sk of ['night', 'minimaldark', 'notebook']) {
      await p.evaluate(sk => { cur.skin = sk; applySkin(); const q = Object.keys(WORDS).filter(k => /^[a-z]{10,11}$/.test(k))[0]; startGame('type', [q]); U.g.typed = ''; ACT['sp-submit'].call(null); }, sk);
      await p.fill('#spIn', 'qwertyuiopasdf'); await p.press('#spIn', 'Enter');
      const w = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (w > 1) bad.push(sk + ' 超出 ' + w + 'px');
      await p.screenshot({ path: path.join(OUT, `spell-fix-${sk}.png`) });
    }
    await p.evaluate(() => { cur.skin = 'sticker'; applySkin(); leaveActivity(); U.view = 'home'; render(); });
    result('E6 深色／手繪風格下長單字訂正畫面不超出寬度', bad);
  }

  // E7 舊資料（沒有 sp 欄位）可以正常玩拼字遊戲
  {
    const bad = [];
    await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('elp-prog-' + cur.id)); delete g.sp; localStorage.setItem('elp-prog-' + cur.id, JSON.stringify(g)); });
    await p.reload(); await p.waitForFunction(() => U.view === 'home');
    if ((await p.evaluate(() => typeof S.sp)) !== 'object') bad.push('舊資料載入後沒有 sp');
    await p.evaluate(() => { U.gsrc = 'mine'; U.view = 'games'; render(); });
    await p.click('[data-act=gstart][data-g=spell]');
    await p.click('[data-act=gpick][data-i="0"]');
    if (errs.length) bad.push(errs.join(' | '));
    result('E7 舊版進度（沒有拼字紀錄）載入與遊玩正常', bad);
  }

  // E9「哪個拼對了？」：不管正確答案在第幾格，答對時沒有任何一格變紅；答錯時只有點的那一格變紅
  {
    const bad = [];
    for (let pos = 0; pos < 4; pos++) for (const right of [true, false]) {
      await p.evaluate(() => { leaveActivity(); startGame('spell', ['hot', 'hot', 'hot']); render(); });
      await p.waitForSelector('.gopts [data-act=gpick]');
      const info = await p.evaluate(pos => { const g = U.g, q = g.qs[g.i], k = g.opts.indexOf(q); [g.opts[k], g.opts[pos]] = [g.opts[pos], g.opts[k]]; render(); return g.opts; }, pos);
      const tap = right ? pos : (pos + 1) % 4;
      await p.click(`.gopts [data-act=gpick][data-i="${tap}"]`);
      await p.waitForSelector('.gopts .opt.ok');
      const st = await p.evaluate(() => [...document.querySelectorAll('.gopts .opt')].map(b => b.classList.contains('no') ? 'no' : b.classList.contains('ok') ? 'ok' : ''));
      const want = info.map((o, i) => i === pos ? 'ok' : (!right && i === tap) ? 'no' : '');
      if (st.join() !== want.join()) bad.push(`正確答案在第 ${pos + 1} 格、${right ? '答對' : '點第 ' + (tap + 1) + ' 格答錯'}：畫面 ${st.join('|')}，應該 ${want.join('|')}`);
    }
    await p.evaluate(() => { leaveActivity(); U.view = 'home'; render(); });
    result('E9 哪個拼對了：正確答案在任何一格，答對不會有紅色、答錯只標點的那格', bad);
  }

  // E10 拼字積木的答案格子：不管單字多長、手機多窄，都排在同一行，字母不會擠出格子
  {
    const bad = [];
    const words = await p.evaluate(() => { const ks = Object.keys(WORDS).filter(k => /^[a-z]+$/.test(k)); ks.sort((a, b) => b.length - a.length); return [ks[0], ks[5], 'elephant', 'elephants', 'cat']; });
    for (const [w, hgt] of [[320, 640], [360, 740], [375, 740], [414, 860], [820, 1180]]) {
      await p.setViewportSize({ width: w, height: hgt });
      for (const word of words) {
        await p.evaluate(word => { leaveActivity(); startGame('tiles', [word]); render(); }, word);
        await p.waitForSelector('.slots .slot');
        // 先把字母全部填進去（模擬拼到最後一個字母前），看字母放不放得下
        const r = await p.evaluate(word => {
          const g = U.g; g.built = []; const used = new Set();
          for (const ch of word.slice(0, -1)) { const i = g.letters.findIndex((x, j) => x.ch === ch && !used.has(j)); used.add(i); g.built.push(i); }
          render();
          const sl = [...document.querySelectorAll('.slots .slot')], box = document.querySelector('.slots').getBoundingClientRect();
          const tops = new Set(sl.map(x => Math.round(x.getBoundingClientRect().top)));
          const over = sl.filter(x => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().right > box.right + 1 || x.getBoundingClientRect().left < box.left - 1).length;
          return { rows: tops.size, over, n: sl.length, page: document.documentElement.scrollWidth - innerWidth };
        }, word);
        if (r.rows !== 1) bad.push(`${w} 寬「${word}」（${word.length} 個字母）答案格子排成 ${r.rows} 行`);
        if (r.over) bad.push(`${w} 寬「${word}」有 ${r.over} 格的字母擠出格子`);
        if (r.page > 1) bad.push(`${w} 寬「${word}」畫面超出 ${r.page}px`);
      }
    }
    await p.setViewportSize({ width: 390, height: 844 });
    await p.evaluate(() => { leaveActivity(); U.view = 'home'; render(); });
    result(`E10 拼字積木答案格子：最長的字（${words[0]}）在 320～820 寬都排成一行、字母不擠出格子`, bad);
  }

  // E11 電腦用 Enter：打字拼拼看打完按 Enter 送出、再按 Enter 到下一題；課文各步驟也能用 Enter 往下
  {
    const bad = [];
    await p.setViewportSize({ width: 1280, height: 800 });
    await p.evaluate(() => { leaveActivity(); U.sheet = null; U.rwq = []; startGame('type', ['wind', 'rain', 'sun']); render(); });
    await p.waitForSelector('#spIn');
    await p.fill('#spIn', 'wind'); await p.press('#spIn', 'Enter');
    await p.waitForSelector('[data-act=gnext]');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => U.g.i === 1, null, { timeout: 2000 }).catch(() => bad.push('答對後按 Enter 沒有到下一題'));
    // 打錯：要先照正確拼法重打，Enter 不可以跳過訂正
    await p.waitForSelector('#spIn'); await p.fill('#spIn', 'rian'); await p.press('#spIn', 'Enter');
    await p.keyboard.press('Enter');
    if ((await p.evaluate(() => U.g.i)) !== 1) bad.push('拼錯還沒訂正，按 Enter 就跳到下一題');
    // 按住不放（連發）不會一次跳好幾題
    await p.evaluate(() => { leaveActivity(); startGame('type', ['wind', 'rain', 'sun']); render(); });
    await p.waitForSelector('#spIn'); await p.fill('#spIn', 'wind'); await p.press('#spIn', 'Enter');
    await p.waitForSelector('[data-act=gnext]');
    await p.evaluate(() => { for (let i = 0; i < 5; i++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', repeat: i > 0, bubbles: true })); });
    if ((await p.evaluate(() => U.g.i)) !== 1) bad.push('按住 Enter 一次跳了好幾題：' + (await p.evaluate(() => U.g.i)));
    // 課文：看字幕 → 換我說 → 下一句，都能用 Enter；「跳過」淡色按鈕不會被 Enter 按到
    await p.evaluate(() => { leaveActivity(); cur.mode = 'full'; S.mode = 'full'; applySkin(); startTopic(TOPICS[0].id); U.si = 0; resetStep(); U.step = 2; render(); });
    await p.keyboard.press('Enter');
    if ((await p.evaluate(() => U.step)) !== 3) bad.push('看字幕這步按 Enter 沒有往下');
    await p.keyboard.press('Enter');
    if ((await p.evaluate(() => U.si)) !== 1) bad.push('跟著說這步按 Enter 沒有到下一句');
    await p.evaluate(() => { cur.mode = 'quiet'; S.mode = 'quiet'; applySkin(); U.step = 3; U.bld = null; render(); });
    const si = await p.evaluate(() => U.si);
    await p.keyboard.press('Enter');
    if ((await p.evaluate(() => U.si)) !== si) bad.push('排句子還沒排就按 Enter 跳過了（淡色的跳過按鈕不該被 Enter 按）');
    // 有彈出視窗時不動
    await p.evaluate(() => { cur.mode = 'full'; S.mode = 'full'; applySkin(); U.step = 2; U.sheet = 'mode'; render(); });
    await p.keyboard.press('Enter');
    if ((await p.evaluate(() => U.step)) !== 2) bad.push('有彈出視窗時按 Enter 還是往下了');
    await p.evaluate(() => { U.sheet = null; leaveActivity(); U.view = 'home'; render(); });
    await p.setViewportSize({ width: 390, height: 844 });
    result('E11 Enter 往下一步：打字送出後到下一題、拼錯要先訂正、按住不連跳、課文各步驟、不按淡色的跳過、彈出視窗時不動', bad);
  }

  result('E8 全程沒有頁面錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
