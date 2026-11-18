// 後端屬性測試：用模擬的 Google 試算表執行 apps-script/Code.gs
// 用法：node tests/backend-props.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT, seeded } = require('./server');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8');

/* ---------- 模擬 SpreadsheetApp ---------- */
class Sheet {
  constructor(name) { this.name = name; this.cells = new Map(); this.maxCols = 26; }
  _k(r, c) { return r + ',' + c; }
  getName() { return this.name; } setName(n) { this.name = n; } setFrozenRows() {} setColumnWidth() {}
  getLastRow() { let m = 0; for (const [k, v] of this.cells) { const r = +k.split(',')[0]; if (v !== '' && r > m) m = r; } return m; }
  getLastColumn() { let m = 0; for (const k of this.cells.keys()) { const c = +k.split(',')[1]; if (c > m) m = c; } return m; }
  getMaxColumns() { return this.maxCols; } insertColumnsAfter(a, n) { this.maxCols += n; }
  deleteRow(r) {
    const n = new Map();
    for (const [k, v] of this.cells) { let [rr, cc] = k.split(',').map(Number); if (rr === r) continue; if (rr > r) rr--; n.set(rr + ',' + cc, v); }
    this.cells = n;
  }
  getRange(r, c, nr = 1, nc = 1) {
    const sh = this;
    if (c + nc - 1 > sh.maxCols) throw new Error(`範圍超出欄數 ${c + nc - 1} > ${sh.maxCols}`);
    const R = {
      getValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = sh.cells.get(sh._k(r + i, c + j)); row.push(v === undefined ? '' : v); } o.push(row); } return o; },
      getValue() { return R.getValues()[0][0]; },
      setValues(v) {
        if (v.length !== nr || v[0].length !== nc) throw new Error('setValues 尺寸不符');
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) {
          const x = v[i][j];
          if (typeof x === 'string' && x.length > 50000) throw new Error('單格超過 50000 字');
          sh.cells.set(sh._k(r + i, c + j), x);
        }
        return R;
      },
      setValue(x) { return R.setValues([[x]]); },
      clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.cells.delete(sh._k(r + i, c + j)); return R; },
      setNumberFormat() { return R; }, setFontWeight() { return R; }, setBackground() { return R; }
    };
    return R;
  }
}
class Book {
  constructor() { this.sheets = [new Sheet('工作表1')]; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
  insertSheet(n, i) { const s = new Sheet(n); if (i === 0) this.sheets.unshift(s); else this.sheets.push(s); return s; }
  getUrl() { return 'mock://book'; } getId() { return 'mock-id'; }
}
/** 建立一個執行 Code.gs 的乾淨環境；props 可預先放入舊版指令碼屬性 */
function gasEnv(props = new Map()) {
  const book = new Book();
  const ctx = {
    console, Date, JSON, Math, String, Number, Object, Array,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)), getProperties: () => Object.fromEntries(props), deleteProperty: k => props.delete(k) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => book, openById: () => book, create: () => book },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log() {} }, HtmlService: {},
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 'json' } }
  };
  vm.createContext(ctx); vm.runInContext(CODE, ctx);
  ctx.book = book; ctx.props = props;
  ctx.call = (fn, ...args) => ctx[fn](...args);
  return ctx;
}

/* ---------- 隨機資料 ---------- */
const rnd = seeded(12345), ri = n => Math.floor(rnd() * n);
const POOL = ['a', 'Z', '0', '=', '+', '-', '@', '"', "'", '\n', '\t', ' ', '中', '文', '😀', '🐰', '\\', '{', '}', '<', '>', '&', '#'];
function rstr() {
  const L = [0, 1, 2, 44999, 45000, 45001, 89999, 90000, 90001, 135001, ri(200), ri(100000)][ri(12)];
  let s = ri(4) === 0 ? ['=', '+', '-', '@'][ri(4)] : '';
  while (s.length < L) s += POOL[ri(POOL.length)];
  return L === 0 ? s : s.slice(0, L);
}

let fail = 0;
function result(name, bad) { if (bad.length) fail++; console.log((bad.length ? 'FAIL ' : 'PASS ') + name + (bad.length ? '\n   ' + bad.slice(0, 8).join('\n   ') : '')); }

// B1 往返一致性：隨機寫入、覆寫、刪除後，每個鍵讀回都和最後寫入的相同
{
  const g = gasEnv(), truth = {}, bad = []; let reads = 0;
  for (let i = 0; i < 300; i++) {
    const id = ['a', 'b', 'c'][ri(3)], key = ri(4) === 0 ? 'profiles' : 'prog_' + id;
    if (ri(10) === 0 && key !== 'profiles') { g.call('deleteProgress', id); delete truth[key]; }
    else { const s = rstr(); g.call('writeKey_', key, s, ''); truth[key] = s; }
    for (const k of Object.keys(truth)) { reads++; const got = g.call('readKey_', k); if (got !== truth[k]) bad.push(`${k}: 預期 ${truth[k].length} 字，讀回 ${got && got.length}`); }
  }
  const sh = g.book.getSheetByName('資料');
  let maxLen = 0; for (const v of sh.cells.values()) if (typeof v === 'string') maxLen = Math.max(maxLen, v.length);
  if (maxLen > 45000) bad.push('有一格超過 45000 字：' + maxLen);
  const keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(r => r[0]).filter(Boolean);
  if (new Set(keys).size !== keys.length) bad.push('鍵值重複：' + keys);
  result(`B1 試算表分段存讀往返一致（300 次隨機寫入/刪除、${reads} 次讀回，含 0/45000/45001/135001 字與 = + 開頭）`, bad);
}

// B2 冪等性：同一份進度存兩次 = 存一次
{
  const bad = [];
  const snap = sh => [...sh.cells].filter(([k]) => !k.endsWith(',3')).sort().join('|'); // 第 3 欄是更新時間
  for (let i = 0; i < 50; i++) {
    const s = rstr(), a = gasEnv(), b = gasEnv();
    a.call('saveProgress', 'kid1', s); b.call('saveProgress', 'kid1', s); b.call('saveProgress', 'kid1', s);
    if (snap(a.book.getSheetByName('資料')) !== snap(b.book.getSheetByName('資料'))) bad.push('第 ' + i + ' 組不同');
  }
  result('B2 saveProgress 冪等（50 組）', bad);
}

// B3 doPost：只允許白名單函式、錯誤輸入安全回應、id 過濾
{
  const g = gasEnv(), bad = [];
  const post = body => JSON.parse(g.doPost({ postData: { contents: body } }).s);
  const call = (fn, args) => post(JSON.stringify({ fn, args }));
  const prof = JSON.stringify({ updated: 1, list: [{ id: 'p1', name: '小安' }] });
  if (call('saveProfiles', [prof]).ok !== true) bad.push('saveProfiles 失敗');
  if (call('getProfiles', []).result !== prof) bad.push('getProfiles 讀回不同');
  // 內部函式與 Object.prototype 上繼承來的名稱都不可呼叫
  for (const fn of ['writeKey_', 'setup', 'deleteKey_', 'book_', 'doGet', 'include', ...Object.getOwnPropertyNames(Object.prototype)])
    if (call(fn, []).ok !== false) bad.push(fn + ' 不應能遠端呼叫');
  if (post('{bad').ok !== false) bad.push('壞 JSON 未回錯誤');
  if (g.doPost(undefined) && JSON.parse(g.doPost(undefined).s).ok !== false) bad.push('空請求未回錯誤');
  call('saveProgress', ['../p1;=x', '{"a":1}']);
  if (call('getProgress', ['p1x']).result !== '{"a":1}') bad.push('safeId_ 未過濾特殊字元');
  if (call('getProgress', ['nobody']).result !== null) bad.push('不存在的進度應回 null');
  result('B3 doPost 白名單分派與輸入過濾', bad);
}

// B4 學員進度總覽：日期 key 與前端 dstr() 一致（月、日不補零），數字計算正確
{
  const g = gasEnv(), now = new Date(), dk = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  const log = {};
  log[dk(now)] = { s: 2, t: 300, sp: 2, ss: 170 };        // 今天：有練習
  log[dk(new Date(now - 864e5))] = { t: 30 };              // 昨天：只開 30 秒，不算練習
  log[dk(new Date(now - 2 * 864e5))] = { g: 1 };           // 前天：玩一次遊戲
  g.call('saveProfiles', JSON.stringify({ updated: Date.now(), list: [{ id: 'k1', name: '小安' }] }));
  g.call('saveProgress', 'k1', JSON.stringify({ done: { a: 1, b: 1 }, words: { x: [1] }, vk: { x: 1, y: 0 }, stars: 5, streak: { count: 3 }, log, updated: Date.now() }));
  const row = g.book.getSheetByName('學員進度').getRange(2, 1, 1, 11).getValues()[0].slice(0, 10);
  const exp = ['小安', '✅', 2, 6, 85, 2, 1, 1, 5, 3];
  result('B4 學員進度總覽計算正確', JSON.stringify(row) === JSON.stringify(exp) ? [] : ['得到 ' + JSON.stringify(row) + '，預期 ' + JSON.stringify(exp)]);
}

// B5 舊版資料搬家：跨段資料完整、舊屬性清除、只做一次
{
  const big = '舊'.repeat(70000) + 'END', bad = [];
  const props = new Map([
    ['profiles#n', '1'], ['profiles#0', '{"updated":1,"list":[{"id":"k9","name":"阿寶"}]}'],
    ['prog_k9#n', '2'], ['prog_k9#0', big.slice(0, 36000)], ['prog_k9#1', big.slice(36000)]
  ]);
  const g = gasEnv(props);
  if (g.call('getProgress', 'k9') !== big) bad.push('搬家後內容不完整');
  if (props.has('prog_k9#0') || props.has('prog_k9#n')) bad.push('舊屬性沒有清掉');
  if (props.get('MIGRATED') !== '1') bad.push('沒有標記 MIGRATED');
  const sh = g.book.getSheetByName('資料'), r = g.call('findRow_', sh, 'prog_k9');
  if (sh.getRange(r, 2).getValue() !== '阿寶') bad.push('沒有補上學員名字');
  const rows = sh.getLastRow();
  g.call('getProfiles'); // 再觸發一次 book_()
  if (sh.getLastRow() !== rows) bad.push('搬家執行了兩次');
  result('B5 舊版指令碼屬性資料搬進試算表（7 萬字跨段）', bad);
}

process.exit(fail ? 1 : 0);
