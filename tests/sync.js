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
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
