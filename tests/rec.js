// 錄音比對（語音辨識）不會卡住：手機沒通知結束、按了下一句、離開畫面、切到背景、舊的辨識晚到的結束訊息
// 用假的 SpeechRecognition 模擬各種手機行為（真的麥克風在無頭瀏覽器無法測）
// 用法：node tests/rec.js
const { chromium, devices } = require('playwright');
const { start, blockExternal } = require('./server');

let fail = 0;
const result = (name, bad) => { bad = bad || []; if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 10).join('\n   ') : '')); };

// 假的語音辨識：window.__mode 決定 stop() 之後會不會通知結束；所有實例記在 window.__recs
const FAKE = () => {
  window.__mode = 'normal'; window.__recs = [];
  window.SpeechRecognition = class {
    constructor() { this.st = 'new'; window.__recs.push(this); }
    start() {
      const live = window.__recs.filter(r => r !== this && r.st === 'on');
      if (live.length) throw new Error('InvalidStateError: 已經有一個在錄音');   // 跟手機一樣：同時只能一個
      this.st = 'on';
      setTimeout(() => { if (this.st !== 'on') return; const r = [{ transcript: 'hello how are you' }]; r.isFinal = false; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }, 20);
    }
    stop() { if (this.st !== 'on') return; this.st = 'stopping'; if (window.__mode === 'hang') return;
      setTimeout(() => { const r = [{ transcript: 'hello how are you' }]; r.isFinal = true; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); this.st = 'off'; this.onend && this.onend(); }, 30); }
    abort() { this.st = 'aborted'; setTimeout(() => { this.onend && this.onend(); this.lateSent = true; }, 40); }   // 真的瀏覽器 abort 之後也會晚一點送結束
  };
};

(async () => {
  const srv = await start(), b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 5'] });
  const p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(FAKE);
  await blockExternal(p);
  await p.goto(srv.url); await p.waitForSelector('#pname');
  await p.fill('#pname', '錄音測試'); await p.click('[data-act=e-save]');
  await p.waitForFunction(() => U.view === 'home');
  const toShadow = async () => { await p.evaluate(() => { cur.mode = 'full'; S.mode = 'full'; U.dict = false; leaveActivity(); startTopic(TOPICS[0].id); U.step = 3; render(); }); await p.waitForSelector('[data-act=mic]'); };
  const live = () => p.evaluate(() => window.__recs.filter(r => r.st === 'on' || r.st === 'stopping').length);

  // R1 一般情況：按錄音 → 我說完了 → 出現分數
  { const bad = [];
    await toShadow(); await p.evaluate(() => { window.__mode = 'normal'; });
    await p.click('[data-act=mic]'); await p.waitForFunction(() => U.rec);
    await p.click('[data-act=mic]');
    await p.waitForFunction(() => !U.rec && U.shadow, null, { timeout: 3000 }).catch(() => bad.push('沒有出現結果'));
    if (!/100%|完美/.test(await p.textContent('#main'))) bad.push('分數不對');
    result('R1 一般錄音：說完出現比對結果', bad); }

  // R2 手機按「我說完了」之後辨識不通知結束：一下子就自己收工，用已經聽到的內容算分
  { const bad = [];
    await toShadow(); await p.evaluate(() => { window.__mode = 'hang'; });
    await p.click('[data-act=mic]'); await p.waitForFunction(() => U.rec);
    await p.waitForFunction(() => document.querySelector('#live') && /hello/.test(document.querySelector('#live').textContent));
    await p.click('[data-act=mic]');
    await p.waitForFunction(() => !U.rec && U.shadow, null, { timeout: 5000 }).catch(() => bad.push('按了「我說完了」一直卡在錄音中'));
    if (!(await p.textContent('#main')).includes('hello how are you')) bad.push('沒有用聽到的內容算分');
    // 收工後可以再錄一次
    await p.evaluate(() => { window.__mode = 'normal'; });
    await p.click('[data-act=mic]'); await p.waitForFunction(() => U.rec, null, { timeout: 2000 }).catch(() => bad.push('卡住後不能再錄'));
    await p.click('[data-act=mic]'); await p.waitForFunction(() => !U.rec && U.shadow, null, { timeout: 3000 }).catch(() => bad.push('第二次錄音沒有結果'));
    result('R2 手機 stop 之後沒有通知結束：2.5 秒內自動收工、用聽到的內容算分、可以再錄', bad); }

  // R3 完全沒按「我說完了」，辨識也一直不結束：最長時間到就收工
  { const bad = [];
    await toShadow(); await p.evaluate(() => { window.__mode = 'hang'; REC_MAX = 400; });
    await p.click('[data-act=mic]');
    await p.waitForFunction(() => !U.rec && U.shadow, null, { timeout: 3000 }).catch(() => bad.push('一直停在錄音中'));
    await p.evaluate(() => { REC_MAX = 20000; window.__mode = 'normal'; });
    result('R3 辨識永遠不結束：時間到自動收工', bad); }

  // R4 錄音中直接按「下一句」：麥克風關掉；下一句可以馬上錄；上一句晚到的結束訊息不會蓋掉新的
  { const bad = [];
    await toShadow();
    await p.click('[data-act=mic]'); await p.waitForFunction(() => U.rec);
    await p.evaluate(() => { ACT['next-sent'] ? ACT['next-sent']() : null; U.step = 3; render(); });
    if (await live()) bad.push('換下一句後麥克風還開著');
    await p.click('[data-act=mic]');
    await p.waitForFunction(() => U.rec, null, { timeout: 2000 }).catch(() => bad.push('下一句按錄音沒反應（兩個辨識打架）'));
    // 等上一個被關掉的辨識送出晚到的結束訊息
    await p.waitForFunction(() => window.__recs.filter(r => r.st === 'aborted').every(r => r.lateSent));
    if (!(await p.evaluate(() => U.rec))) bad.push('上一句晚到的結束訊息把新的錄音關掉了');
    await p.click('[data-act=mic]'); await p.waitForFunction(() => !U.rec && U.shadow, null, { timeout: 3000 }).catch(() => bad.push('新的錄音沒有結果'));
    result('R4 錄音中按下一句：麥克風關掉、下一句能馬上錄、舊的結束訊息不干擾', bad); }

  // R5 錄音中離開（回首頁）、R6 錄音中切到別的 App：麥克風都要關掉
  { const bad = [];
    await toShadow(); await p.click('[data-act=mic]'); await p.waitForFunction(() => U.rec);
    await p.evaluate(() => ACT.exit ? ACT.exit() : ACT.go({ dataset: { v: 'home' } }));
    if (await live()) bad.push('離開練習後麥克風還開著');
    await toShadow(); await p.click('[data-act=mic]'); await p.waitForFunction(() => U.rec);
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    if (await live()) bad.push('切到背景後麥克風還開著');
    if (await p.evaluate(() => U.rec)) bad.push('切到背景後畫面還顯示錄音中');
    await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
    await p.click('[data-act=mic]'); await p.waitForFunction(() => U.rec, null, { timeout: 2000 }).catch(() => bad.push('回來後不能錄音'));
    await p.click('[data-act=mic]'); await p.waitForFunction(() => !U.rec);
    result('R5 R6 錄音中離開或切到別的 App：麥克風關掉，回來可以再錄', bad); }

  // R7 連續快速按 20 次：不會有兩個辨識同時開著、不會出錯
  { const bad = [];
    await toShadow();
    for (let i = 0; i < 20; i++) await p.click('[data-act=mic]');
    if (await live() > 1) bad.push('同時開著好幾個辨識');
    if (await p.evaluate(() => micDenied)) bad.push('快速連按被當成麥克風壞掉');
    result('R7 快速連按 20 次：同時最多一個辨識、不會誤判麥克風壞掉', bad); }

  result('沒有網頁錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
