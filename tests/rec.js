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
      if (window.__mode === 'script') {   // 照劇本：每開一次辨識拿一步
        const step = window.__steps.shift() || { hang: true };
        this.st = 'on'; this.step = step;
        setTimeout(() => {
          if (this.st !== 'on') return;
          if (step.text) { const r = [{ transcript: step.text }]; r.isFinal = step.final !== false; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }
          if (step.err) this.onerror && this.onerror({ error: step.err });
          if (!step.hang) { this.st = 'off'; this.onend && this.onend(); }
        }, 20);
        return;
      }
      const live = window.__recs.filter(r => r !== this && r.st === 'on');
      if (live.length) throw new Error('InvalidStateError: 已經有一個在錄音');   // 跟手機一樣：同時只能一個
      this.st = 'on';
      setTimeout(() => { if (this.st !== 'on') return; const r = [{ transcript: 'hello how are you' }]; r.isFinal = false; this.onresult && this.onresult({ resultIndex: 0, results: [r] }); }, 20);
    }
    stop() { if (this.st !== 'on') return;
      if (window.__mode === 'script') { this.st = 'off'; setTimeout(() => { this.onend && this.onend(); }, 20); return; } this.st = 'stopping'; if (window.__mode === 'hang') return;
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
  // 這個測試只看錄音；先把隱藏版都收好，跟讀高分時才不會跳出獲得隱藏版的視窗擋住按鈕
  await p.evaluate(() => { Object.keys(HIDDEN).forEach(k => { RW().own['h:' + k] = 1; }); saveProg(); });
  // 跟讀高分多次會解鎖隱藏版（彈出視窗），每次先關掉
  const toShadow = async () => { await p.evaluate(() => { cur.mode = 'full'; S.mode = 'full'; U.dict = false; leaveActivity(); startTopic(TOPICS[0].id); U.si = 0; resetStep(); U.step = 3; U.rwq = []; U.sheet = null; render(); }); await p.waitForSelector('[data-act=mic]'); };
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

  // N 收不到聲音的各種情況（照劇本的假辨識）。目標句：Hello! How are you?
  const runScript = async (steps, opt) => {
    opt = opt || {};
    await toShadow();
    await p.evaluate(([steps, max]) => { window.__mode = 'script'; window.__steps = steps; window.__recs = []; REC_MAX = max || 20000; }, [steps, opt.max]);
    await p.click('[data-act=mic]');
    if (opt.stopAfter) { await p.waitForFunction(n => window.__recs.length >= n && document.querySelector('#live') && document.querySelector('#live').textContent !== '請開始說…', opt.stopAfter); await p.click('[data-act=mic]'); }
    await p.waitForFunction(() => !U.rec, null, { timeout: 6000 }).catch(() => {});
    return p.evaluate(() => ({ rec: U.rec, heard: U.shadow && U.shadow.heard, n: window.__recs.length, denied: micDenied, err: micErr, txt: document.querySelector('#main').textContent, toast: document.querySelector('#toast').textContent }));
  };
  { const bad = [];
    let r = await runScript([{ err: 'no-speech' }, { err: 'no-speech' }, { text: 'hello how are you' }]);
    if (r.rec || r.heard !== 'hello how are you' || r.n !== 3) bad.push('還沒開口就結束時沒有自動再聽：' + JSON.stringify(r));
    if (!/完美|很棒/.test(r.txt)) bad.push('再聽一次後沒有算出好分數：' + r.txt.slice(0, 200));
    result('N1 小朋友還沒開口，辨識就結束（no-speech）：自動再聽，聽到後正常算分', bad); }
  { const bad = [];
    const r = await runScript([{ text: 'hello' }, { text: 'how are you' }]);
    if (r.heard !== 'hello how are you' || r.n !== 2) bad.push('念到一半停頓被切掉，沒有接著聽：' + JSON.stringify(r));
    result('N2 念到一半停頓、辨識先結束：還沒按「我說完了」就自動接著聽，前後接起來', bad); }
  { const bad = [];
    const r = await runScript([{ err: 'audio-capture' }, { text: 'hello how are you' }]);
    if (r.denied || r.heard !== 'hello how are you') bad.push('麥克風暫時被佔住就判定壞掉：' + JSON.stringify(r));
    const r2 = await runScript([{ err: 'network' }, { text: 'hello how are you' }]);
    if (r2.denied || r2.heard !== 'hello how are you') bad.push('網路閃一下就判定壞掉：' + JSON.stringify(r2));
    result('N3 剛播完聲音麥克風還被佔住、網路閃一下：自動重試，不會說麥克風壞掉', bad); }
  { const bad = [];
    const r = await runScript([{ err: 'not-allowed' }, { text: 'hello' }]);
    if (!r.denied || r.n !== 1) bad.push('沒有權限時應該馬上說明、不要一直重試：' + JSON.stringify(r));
    const r2 = await runScript([{ err: 'network' }, { err: 'network' }, { err: 'network' }, { text: 'x' }]);
    if (!r2.denied || r2.err !== 'network' || r2.n !== 3) bad.push('網路一直不通時應該重試 2 次後說明：' + JSON.stringify(r2));
    if (!r2.toast.includes('網路')) bad.push('網路問題的提示沒有說是網路');
    result('N4 沒有麥克風權限：馬上說明不重試；網路一直不通：重試 2 次後告訴孩子是網路問題', bad); }
  { const bad = [];
    const r = await runScript([{ text: 'hello', final: false, hang: true }, { text: 'how are you' }], { stopAfter: 1 });
    if (r.heard !== 'hello' || r.n !== 1) bad.push('按了「我說完了」還自動接著聽：' + JSON.stringify(r));
    result('N5 按了「我說完了」就不再接著聽，用已聽到的算分（還沒變成正式結果的字也算）', bad); }
  { const bad = [];
    const r = await runScript(Array(200).fill({ err: 'no-speech' }), { max: 1800 });
    if (r.rec) bad.push('一直沒聲音時停不下來');
    if (r.denied) bad.push('只是沒聲音卻說麥克風壞掉');
    if (r.n < 2) bad.push('沒有聲音時沒有再聽');
    const r2 = await runScript([{ text: 'hello how are you', final: false }]);
    if (r2.heard !== 'hello how are you') bad.push('手機只給「還沒確定」的結果就結束時，聽到的字不見了：' + JSON.stringify(r2));
    await p.evaluate(() => { REC_MAX = 20000; window.__mode = 'normal'; });
    result('N6 一直沒聲音：時間到就停、不誤判麥克風壞掉；只給未確定結果就結束的手機：字不會不見', bad); }

  result('沒有網頁錯誤', errs);
  await b.close(); srv.close();
  process.exit(fail ? 1 : 0);
})();
