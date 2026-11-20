// 手機版面檢查：每個畫面在多種手機、平板、電腦尺寸下，不可有東西超出螢幕、被截斷、或被底部選單蓋住
// 用法：node tests/mobile.js            （檢查並列出問題）
//       node tests/mobile.js --shots    （另外存每個畫面在 320 寬的截圖到 tests/output/mobile/）
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { start, blockExternal } = require('./server');
const SHOTS = process.argv.includes('--shots');
const OUT = path.join(__dirname, 'output', 'mobile'); if (SHOTS) fs.mkdirSync(OUT, { recursive: true });

// 寬 × 高：最小的 iPhone SE、常見 Android、iPhone 13 mini、iPhone 13、大螢幕；平板直放（字放大）、平板橫放與電腦（頁籤在左邊）
const SIZES = [[320, 568], [360, 640], [375, 667], [390, 844], [414, 896], [820, 1180], [1024, 768], [1180, 820], [1440, 900]];

// 每個畫面：名稱 → 在網頁裡把畫面準備好的程式（字串，在頁面裡執行）
const SCENES = {
  '首頁': `U.view='home'`,
  '首頁（拼字複習卡＋神秘蛋可孵化）': `S.sp={apple:{l:0,d:dayNo(),m:0}}; WORDS.apple=WORDS.apple||WORDS[Object.keys(WORDS)[0]]; S.rw.egg.d=EGG_DAYS; U.view='home'`,
  '句子列表': `U.view='topics'`,
  '文章列表': `U.view='articles'`,
  '單字': `U.view='words'`,
  '設定': `U.view='settings'`,
  '設定（管理者密碼＋班級步驟展開）': `P.parent={pin:'x',q:'q',a:'a'}; P.addLock=true; U.clOpen=true; U.view='settings'`,
  '選人': `U.view='profiles'`,
  '新增學習者': `openEdit()`,
  '密碼鍵盤': `askPin({t:'測試小朋友的名字 的密碼', av:avCircle(cur.avatar,64), sub:'輸入 4 位數字密碼', check:async()=>false, ok:()=>{}, links:[['忘記密碼？請家長輸入家長密碼','pin-parent-enter']]}); U.pin.val='12'`,
  '管理者提示問題': `U.pq={mode:'setq', err:'問題和答案都要填'}; U.sheet='pq'`,
  '選擇夥伴': `U.ppick=null; U.view='partner'`,
  '遊戲中心': `U.view='games'`,
  '學習看板': `U.board={data:{[cur.id]:S}}; U.view='board'`,
  '學習紀錄': `openRecord(cur.id,'home')`,
  '句子練習 步驟1': `cur.mode='full'; startTopic(TOPICS[0].id)`,
  '句子練習 選意思': `startTopic(TOPICS[0].id); U.plays=1; ACT['to-step']({dataset:{s:'1'}})`,
  '句子練習 看字幕': `startTopic(TOPICS[0].id); U.plays=1; ACT['to-step']({dataset:{s:'1'}}); ACT['to-step']({dataset:{s:'2'}})`,
  '句子練習 跟著說': `startTopic(TOPICS[0].id); U.plays=1; ACT['to-step']({dataset:{s:'1'}}); ACT['to-step']({dataset:{s:'2'}}); ACT['to-step']({dataset:{s:'3'}})`,
  '句子練習 排句子（安靜）': `cur.mode='quiet'; startTopic(TOPICS[2].id); U.plays=1; ACT['to-step']({dataset:{s:'1'}}); ACT['to-step']({dataset:{s:'2'}}); ACT['to-step']({dataset:{s:'3'}})`,
  '主題完成': `cur.mode='full'; U.ti=TOPICS[0].id; U.list=TOPICS[0].sents[1]; U.view='tdone'`,
  '文章': `ACT['open-art']({dataset:{a:ARTICLES[0].id}})`,
  '遊戲 聽音選意思': `U.gsrc='new'; startGame('meaning')`,
  '遊戲 哪個拼對了（選錯）': `U.gsrc='new'; startGame('spell'); ACT.gpick({dataset:{i:String(U.g.opts.findIndex(o=>o!==U.g.qs[0]))}})`,
  '遊戲 拼字積木': `U.gsrc='new'; startGame('tiles', [Object.keys(WORDS).filter(k=>/^[a-z]{11}$/.test(k))[0]])`,
  '遊戲 打字（拼錯長字）': `startGame('type', [Object.keys(WORDS).filter(k=>/^[a-z]{11}$/.test(k))[0]]); U.g.typed='qwertyuiopasdfgh'; ACT['sp-submit']()`,
  '遊戲 聽力填空': `U.gsrc='new'; startGame('cloze')`,
  '遊戲 句子重組': `U.gsrc='new'; startGame('order')`,
  '遊戲 翻牌配對': `U.gsrc='new'; startGame('memory')`,
  '遊戲 快問快答': `U.gsrc='new'; startGame('speed')`,
  '遊戲 結束畫面': `U.gsrc='new'; startGame('meaning'); U.g.score=7; finishGame()`,
  '複習生字': `ACT.review && ACT.review()`,
  '商店 套裝': `U.shopTab='shop'; U.shopCat='set'; U.view='shop'`,
  '商店 頭飾': `U.shopTab='shop'; U.shopCat='t'; U.view='shop'`,
  '商店 節慶': `U.shopTab='shop'; U.shopCat='fest'; U.view='shop'`,
  '收藏冊 隱藏版': `U.shopTab='book'; U.shopCat='h'; U.view='shop'`,
  '收藏冊 動作': `U.shopTab='book'; U.shopCat='x'; U.view='shop'`,
  '星空圖': `U.view='sky'`,
  '頭像工作室 頭頂': `U.view='settings'; render(); ACT['ab-open']({dataset:{from:'settings'}}); U.abTab='t'`,
  '頭像工作室 衣服': `U.view='settings'; render(); ACT['ab-open']({dataset:{from:'settings'}}); U.abTab='o'`,
  '商店 衣服': `U.shopTab='shop'; U.shopCat='o'; U.view='shop'`,
  '頭像工作室 動作': `U.view='settings'; render(); ACT['ab-open']({dataset:{from:'settings'}}); U.abTab='x'`,
  '彈出：練習情境': `U.view='home'; U.sheet='mode'`,
  '彈出：得到寶物': `U.view='home'; U.rwq=['t:wizard']; U.sheet='reward'`,
  '彈出：隱藏版': `U.view='home'; U.rwq=['h:ember']; U.sheet='reward'`,
  '彈出：集滿套裝': `U.view='home'; U.rwq=['set:detect']; U.sheet='reward'`,
  '彈出：星座欣賞': `U.view='sky'; U.skyC='dipper'; U.sheet='sky'`
};

// 在頁面裡找問題
const AUDIT = () => {
  const W = innerWidth, H = innerHeight, out = [];
  const name = el => { const t = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24); return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}「${t}」`; };
  const ancestors = function* (el, stop) { for (let a = el; a && a !== stop; a = a.parentElement) yield a; };
  const visible = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && el.getClientRects().length; };
  if (document.documentElement.scrollWidth > W + 1) out.push(`整頁可以左右捲動（寬 ${document.documentElement.scrollWidth} > ${W}）`);
  const root = [document.querySelector('#main'), document.querySelector('#top'), document.querySelector('#sheet'), document.querySelector('#tabs')].filter(Boolean);
  const els = root.flatMap(r => [...r.querySelectorAll('*')]);
  for (const el of els) {
    if (!visible(el) || el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    // 1. 超出螢幕左右
    if (r.right > W + 1 || r.left < -1) {
      if (!el.closest('.abtabs,.chips') || r.right > W + 40) out.push(`超出螢幕 ${Math.round(r.left)}～${Math.round(r.right)}：${name(el)}`);
    }
    // 2. 文字被截斷（有內容卻塞不下）
    const s = getComputedStyle(el);
    const clips = /hidden|clip/.test(s.overflowX) || s.textOverflow === 'ellipsis';
    if (clips && el.scrollWidth > el.clientWidth + 2 && el.innerText && el.innerText.trim() && !el.matches('.avc,.slot,svg')) out.push(`文字被截斷（${el.scrollWidth} > ${el.clientWidth}）：${name(el)}`);
    // 3. 按鈕裡的內容被擠出按鈕外（刻意凸出的絕對定位標籤不算）
    if (el.matches('button,.btn,.chip,.pill')) {
      const kids = [...el.querySelectorAll('*')].filter(k => visible(k) && !k.closest('svg') && ![...ancestors(k, el)].some(a => /absolute|fixed/.test(getComputedStyle(a).position)));
      const over = kids.find(k => { const kr = k.getBoundingClientRect(); return kr.width > 1 && (kr.right > r.right + 2 || kr.left < r.left - 2); });
      if (over) out.push(`按鈕裡的內容擠出按鈕外：${name(el)}`);
    }
    // 4. 文字被擠成一個字一行（直排）
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    const fs = parseFloat(s.fontSize);
    if (own.length >= 3 && r.width < fs * 1.8 && r.height > fs * 3)   /* 用實際寬度（行內元素的 clientWidth 是 0） */ out.push(`文字被擠成直排（寬 ${Math.round(r.width)}）：${name(el)}`);
    // 5. 超出所在的卡片或視窗邊緣（刻意凸出的絕對定位元素不算）
    const box = el.parentElement && el.parentElement.closest('.card,.sheet,.shopit,.setbox,.pk,.abopt');
    if (box && !/absolute|fixed/.test(s.position) && ![...ancestors(el, box)].some(a => /absolute|fixed/.test(getComputedStyle(a).position)) && !el.closest('.abtabs')) {
      const br = box.getBoundingClientRect();
      if (r.right > br.right + 2 || r.left < br.left - 2) out.push(`超出所在的卡片（${Math.round(r.left)}～${Math.round(r.right)}，卡片 ${Math.round(br.left)}～${Math.round(br.right)}）：${name(el)}`);
    }
    // 6. 英文單字在中間被拆成兩行（大字的正確拼法、單字）
    if (el.matches('.sp-correct,.big-word') && el.getClientRects().length && Math.round(r.height) > parseFloat(s.lineHeight || fs * 1.3) * 1.6) out.push(`大字單字被拆成兩行：${name(el)}`);
  }
  // 4. 最下面的內容被底部選單蓋住：捲到底後，main 的最後一個元素要在選單上方
  const tabs = document.querySelector('#tabs');
  const tr = tabs && tabs.getBoundingClientRect(), side = tr && tr.height > innerHeight / 2;   // 寬螢幕時頁籤在左邊
  if (tabs && side && getComputedStyle(tabs).display !== 'none') {
    // 4b. 頁籤在左邊：內容與頂端列不可被它蓋住
    for (const el of [document.querySelector('#main'), document.querySelector('#top')]) if (el && el.getBoundingClientRect().left < tr.right - 1) out.push(`內容被左邊的頁籤蓋住：${name(el)}`);
  } else if (tabs && getComputedStyle(tabs).display !== 'none') {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const tTop = tabs.getBoundingClientRect().top;
    const last = [...document.querySelectorAll('#main > *')].filter(visible).pop();
    if (last && last.getBoundingClientRect().bottom > tTop + 1) out.push(`最下面的內容被底部選單蓋住：${name(last)}`);
    window.scrollTo(0, 0);
  }
  // 5. 彈出視窗：內容比螢幕高時要能捲動，且頂端要看得到
  const sheet = document.querySelector('#sheet .sheet');
  if (sheet) {
    const r = sheet.getBoundingClientRect(), s = getComputedStyle(sheet);
    if (r.top < 0) out.push('彈出視窗的頂端跑出螢幕');
    if (sheet.scrollHeight > sheet.clientHeight + 2 && !/auto|scroll/.test(s.overflowY)) out.push('彈出視窗太長卻不能捲動');
  }
  return [...new Set(out)];
};

(async () => {
  const srv = await start(), b = await chromium.launch();
  const report = {};
  for (const [w, hgt] of SIZES) {
    const ctx = await b.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 1, isMobile: w < 1000, hasTouch: w < 1000 });
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await blockExternal(p);
    await p.goto(srv.url); await p.waitForSelector('#pname');
    await p.fill('#pname', '測試小朋友的名字'); await p.click('[data-act=e-save]');
    await p.waitForFunction(() => U.view === 'home');
    // 準備一些資料，讓畫面上有東西：星星、金幣、生字、寶物、稱號
    await p.evaluate(() => { S.stars = 120; S.rw.coins = 1234; S.rw.title = '太空小隊長'; S.rw.own['t:wizard'] = 1; S.rw.own['h:ember'] = 1; S.streak = { last: today(), count: 12 };
      Object.keys(WORDS).slice(0, 20).forEach(k => { S.words[k] = [2, Date.now() - 1, Date.now()]; }); saveProg(); U.rwq = []; U.sheet = null; });
    for (const [scene, setup] of Object.entries(SCENES)) {
      try {
        await p.evaluate(code => { leaveActivity(); U.sheet = null; U.rwq = []; cur.mode = 'full'; cur.skin = 'sticker'; applySkin(); eval(code); render(); }, setup);
      } catch (e) { (report[scene] = report[scene] || []).push(`${w}×${hgt} 準備畫面失敗：${e.message.split('\n')[0]}`); continue; }
      const issues = await p.evaluate(AUDIT);
      issues.forEach(t => (report[scene] = report[scene] || []).push(`${w}×${hgt} ${t}`));
      if (SHOTS && w === 320) await p.screenshot({ path: path.join(OUT, scene.replace(/[\\/：:（）() ＋+]/g, '_') + '.png'), fullPage: true });
    }
    if (errs.length) (report['頁面錯誤'] = report['頁面錯誤'] || []).push(`${w}×${hgt} ${[...new Set(errs)].join(' | ')}`);
    await ctx.close();
  }
  await b.close(); srv.close();
  const scenes = Object.keys(report);
  for (const s of Object.keys(SCENES)) console.log((report[s] ? 'FAIL ' : 'PASS ') + s + (report[s] ? '\n   ' + [...new Set(report[s])].slice(0, 12).join('\n   ') : ''));
  if (report['頁面錯誤']) console.log('FAIL 頁面錯誤\n   ' + report['頁面錯誤'].join('\n   '));
  console.log(`\n${Object.keys(SCENES).length} 個畫面 × ${SIZES.length} 種尺寸，有問題的畫面：${scenes.length}`);
  process.exit(scenes.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
