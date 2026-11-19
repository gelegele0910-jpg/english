// 雲端同步測試：攔截 Apps Script 請求、回傳模擬資料，驗證「較新的一方勝出」
// 不會連到真正的試算表。用法：node tests/sync.js
const { chromium } = require('playwright');
const { start } = require('./server');

const prof = (updated, names) => JSON.stringify({ updated, list: names.map((n, i) => ({ id: 'id' + i, name: n, avatar: 'bunny', skin: 'sticker', partner: 'bobo', level: 1, mode: 'full' })) });
const prog = (updated, stars) => JSON.stringify({ done: {}, words: {}, streak: { last: '', count: 0 }, todays: { date: '', n: 0 }, stars, updated });

let fail = 0;
async function scenario(browser, url, name, local, cloud, check) {
  const ctx = await browser.newContext(), p = await ctx.newPage(), calls = [], errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.route(/script\.google\.com/, async r => {
    const req = JSON.parse(r.request().postData()); calls.push(req);
    const result = req.fn === 'getProfiles' ? cloud.profiles : req.fn === 'getProgress' ? (cloud.prog || null) : true;
    await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ ok: true, result }) });
  });
  await p.addInitScript(l => { if (!sessionStorage.getItem('seeded')) { for (const [k, v] of Object.entries(l)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, local);
  await p.goto(url);
  await p.waitForTimeout(2500); // 等背景同步完成（含 1.5 秒存檔防抖）
  const st = await p.evaluate(() => ({ view: U.view, cur: cur && cur.name, names: P.list.map(x => x.name), stars: S && S.stars }));
  const ok = check(st, calls) && !errs.length;
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n   狀態 ' + JSON.stringify(st) + '\n   呼叫 ' + calls.map(c => c.fn).join(',') + (errs.length ? '\n   錯誤 ' + errs.join(' | ') : '')));
  await ctx.close();
}

(async () => {
  const srv = await start(), b = await chromium.launch();
  await scenario(b, srv.url, 'S1 雲端名單較新 → 採用雲端',
    { 'elp-profiles': prof(100, ['舊名']), 'elp-last': 'id0' }, { profiles: prof(200, ['新名', '第二人']) },
    (s, c) => s.cur === '新名' && s.names.length === 2 && !c.some(x => x.fn === 'saveProfiles'));
  await scenario(b, srv.url, 'S2 本機名單較新 → 推上雲端',
    { 'elp-profiles': prof(300, ['本機名']), 'elp-last': 'id0' }, { profiles: prof(200, ['雲端名']) },
    (s, c) => s.cur === '本機名' && c.some(x => x.fn === 'saveProfiles' && JSON.parse(x.args[0]).updated === 300));
  await scenario(b, srv.url, 'S3 雲端進度較新 → 採用雲端',
    { 'elp-profiles': prof(100, ['小安']), 'elp-last': 'id0', 'elp-prog-id0': prog(100, 3) }, { profiles: prof(100, ['小安']), prog: prog(500, 42) },
    (s, c) => s.stars === 42 && !c.some(x => x.fn === 'saveProgress'));
  await scenario(b, srv.url, 'S4 本機進度較新 → 推上雲端、不被舊資料蓋掉',
    { 'elp-profiles': prof(100, ['小安']), 'elp-last': 'id0', 'elp-prog-id0': prog(900, 7) }, { profiles: prof(100, ['小安']), prog: prog(500, 42) },
    (s, c) => s.stars === 7 && c.some(x => x.fn === 'saveProgress' && JSON.parse(x.args[1]).stars === 7));
  await scenario(b, srv.url, 'S5 新裝置（本機沒有資料）→ 從雲端載入',
    {}, { profiles: prof(100, ['雲端小安']) },
    (s) => s.names[0] === '雲端小安' && ['profiles', 'home'].includes(s.view));

  // ---------- 存檔失敗與重試（R-02） ----------
  // handler(req, n) 回傳 {delay, ok}；n 是這個函式第幾次被呼叫。log 記錄每個請求與「回應完成」
  const until = async (cond, ms, what) => { const t0 = Date.now(); while (!cond()) { if (Date.now() - t0 > ms) throw new Error('等不到：' + what); await new Promise(z => setTimeout(z, 50)); } };
  async function saveCase(name, local, handler, act, check) {
    const ctx = await b.newContext(), p = await ctx.newPage(), log = { calls: [], done: {} }, errs = [], count = {};
    p.on('pageerror', e => errs.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.route(/script\.google\.com/, async r => {
      const req = JSON.parse(r.request().postData()); count[req.fn] = (count[req.fn] || 0) + 1; log.calls.push(req);
      const h = req.fn === 'getProfiles' ? { ok: true, result: local['elp-profiles'] } : req.fn === 'getProgress' ? { ok: true, result: null } : handler(req, count[req.fn]);
      if (h.delay) await new Promise(z => setTimeout(z, h.delay));
      await r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(h.ok ? { ok: true, result: h.result === undefined ? true : h.result } : { ok: false, error: 'busy' }) }).catch(() => {});
      log.done[req.fn] = (log.done[req.fn] || 0) + 1;
    });
    await p.addInitScript(l => { for (const [k, v] of Object.entries(l)) localStorage.setItem(k, v); }, local);
    await p.goto(srv.url);
    await p.waitForFunction(() => typeof cur !== 'undefined' && cur && U.view === 'home');
    await p.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = x => { window.__toasts.push(String(x)); t(x); }; });
    let bad = [];
    try { await act(p, log); } catch (e) { bad.push(e.message); }
    const toasts = await p.evaluate(() => window.__toasts);
    bad = bad.concat(check(log.calls, toasts) || []);
    if (errs.length) bad.push('頁面錯誤 ' + errs.join(' | '));
    if (bad.length) fail++;
    console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.join('\n   ') : ''));
    await ctx.close();
  }
  const base = { 'elp-profiles': prof(100, ['小安']), 'elp-last': 'id0' };
  const saved = calls => calls.filter(c => c.fn === 'saveProfiles');
  const failToast = ts => ts.filter(t => t.includes('雲端儲存失敗')).length;

  // S6 大的進度還在上傳（雲端回應慢）時又存名單：兩個都要送出、不可出現失敗提示。
  // 進度做成「不到 6 萬字、但約 65,300 位元組」（中文一字 3 位元組）：舊版會用 keepalive 送，再存名單時合計超過瀏覽器 64KB 上限而被直接拒絕。
  // 這個上限只有真的走網路才會生效（Playwright 攔截請求時不算），所以這一項改送到本機的模擬後端。
  {
    const http = require('http'), got = [], doneN = {};
    const mock = http.createServer((q, r) => {
      if (q.method === 'OPTIONS') { r.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); r.end(); return; }
      let body = ''; q.on('data', c => body += c); q.on('end', () => {
        const req = JSON.parse(body); got.push(req.fn);
        const result = req.fn === 'getProfiles' ? base['elp-profiles'] : req.fn === 'getProgress' ? null : true;
        setTimeout(() => { r.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); r.end(JSON.stringify({ ok: true, result })); doneN[req.fn] = (doneN[req.fn] || 0) + 1; }, req.fn === 'saveProgress' ? 3000 : 100);
      });
    });
    await new Promise(z => mock.listen(0, '127.0.0.1', z));
    const mockUrl = 'http://127.0.0.1:' + mock.address().port + '/exec';
    const ctx = await b.newContext(), p = await ctx.newPage(), errs = [], bad = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.addInitScript(([l, u]) => {
      for (const [k, v] of Object.entries(l)) localStorage.setItem(k, v);
      const f = window.fetch; window.fetch = (url, o) => f(String(url).includes('script.google.com') ? u : url, o);   // 只換網址，keepalive 等設定照舊
    }, [base, mockUrl]);
    await p.goto(srv.url);
    await p.waitForFunction(() => typeof cur !== 'undefined' && cur && U.view === 'home');
    await p.evaluate(() => { window.__toasts = []; const t = window.toast; window.toast = x => { window.__toasts.push(String(x)); t(x); }; });
    try {
      const size = await p.evaluate(() => {
        const bytes = () => new Blob([JSON.stringify({ fn: 'saveProgress', args: [cur.id, JSON.stringify(S)] })]).size;
        S.pad = ''; S.pad = '中'.repeat(Math.floor((65300 - bytes()) / 3));
        lsSet('elp-prog-' + cur.id, JSON.stringify(S));
        // 上限只在請求內容還在上傳時計算；手機網路上傳 60KB 要一段時間，這裡讓兩個存檔同時開始來重現
        pushProg(); cur.partner = 'bobo'; saveProfiles();
        return { bytes: bytes(), chars: JSON.stringify([cur.id, JSON.stringify(S)]).length };
      });
      if (!(size.chars < 60000 && size.bytes > 65000)) throw new Error('測試資料大小不對 ' + JSON.stringify(size));
      await until(() => doneN.saveProgress >= 1, 8000, '進度存檔完成');
      await until(() => doneN.saveProfiles >= 1, 12000, '名單存檔完成（被瀏覽器擋掉了）');
    } catch (e) { bad.push(e.message); }
    const toasts = await p.evaluate(() => window.__toasts);
    if (failToast(toasts)) bad.push('出現了雲端儲存失敗');
    if (errs.length) bad.push('頁面錯誤 ' + errs.join(' | '));
    if (bad.length) fail++;
    console.log((bad.length ? 'FAIL ' : 'PASS ') + 'S6 大進度上傳中又存學習者名單 → 兩個都送到、沒有失敗提示' + (bad.length ? '\n   ' + bad.join('\n   ') : ''));
    await ctx.close(); mock.close();
  }

  // S9 平常存檔不用 keepalive；頁面隱藏（切走、關掉）時才用 keepalive 立刻送出
  await saveCase('S9 平常存檔不用 keepalive，頁面隱藏時才用 keepalive 送出進度',
    base, () => ({ ok: true }),
    async (p, log) => {
      await p.evaluate(() => { window.__ka = []; const f = window.fetch; window.fetch = (u, o) => { if (String(u).includes('script.google.com')) window.__ka.push([JSON.parse(o.body).fn, !!o.keepalive]); return f(u, o); }; });
      await p.evaluate(() => { cur.name = '平常'; saveProfiles(); S.stars++; saveProg(); });
      await until(() => log.done.saveProfiles >= 1, 5000, '名單存檔');
      await p.evaluate(() => { S.stars++; saveProg(); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await until(() => (log.done.saveProgress || 0) >= 1, 5000, '隱藏時送出進度');
      const ka = await p.evaluate(() => window.__ka);
      if (!ka.length || ka.find(([f]) => f === 'saveProfiles')[1]) throw new Error('平常的名單存檔用了 keepalive：' + JSON.stringify(ka));
      const hid = ka.filter(([f]) => f === 'saveProgress');
      if (hid.length !== 1 || !hid[0][1]) throw new Error('頁面隱藏時的進度存檔應該用 keepalive（且只送一次）：' + JSON.stringify(ka));
    },
    () => []);

  // S7 名單前兩次存檔失敗、第三次成功 → 不提示；重試期間改了名字，之後送的都是最新的名字（舊資料不會蓋掉新的）
  await saveCase('S7 名單存檔失敗會自動重試，重試送最新資料，成功就不提示',
    base,
    (req, n) => req.fn === 'saveProfiles' ? { ok: n >= 3 } : { ok: true },
    async (p, log) => {
      await p.evaluate(() => { cur.name = '改名一'; saveProfiles(); });
      await until(() => log.done.saveProfiles >= 1, 5000, '第一次存檔回應');
      await p.evaluate(() => { cur.name = '改名二'; saveProfiles(); });
      await until(() => log.done.saveProfiles >= 3, 15000, '第三次存檔回應');
    },
    (calls, toasts) => {
      const bad = [], sv = saved(calls).map(c => JSON.parse(c.args[0]).list[0].name);
      if (sv[sv.length - 1] !== '改名二') bad.push('最後送出的不是最新的名字：' + sv);
      const i = sv.indexOf('改名二'); if (i >= 0 && sv.slice(i).some(n => n !== '改名二')) bad.push('較新的名字之後又送了舊名字：' + sv);
      if (failToast(toasts)) bad.push('最後成功了卻還是提示失敗');
      return bad;
    });

  // S8 一直失敗 → 試 3 次後才提示一次
  await saveCase('S8 雲端一直失敗：試 3 次後才提示，而且只提示一次',
    base,
    req => req.fn === 'saveProfiles' ? { ok: false } : { ok: true },
    async (p, log) => {
      await p.evaluate(() => { cur.name = '小明'; saveProfiles(); });
      await until(() => log.done.saveProfiles >= 3, 15000, '三次存檔回應');
      await p.waitForFunction(() => window.__toasts.some(t => t.includes('雲端儲存失敗')), null, { timeout: 3000 });
    },
    (calls, toasts) => {
      const bad = [], n = saved(calls).length;
      if (n !== 3) bad.push('應該試 3 次，實際 ' + n);
      if (failToast(toasts) !== 1) bad.push('應該提示 1 次，實際 ' + failToast(toasts));
      return bad;
    });

  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
