/**
 * 英文聽力樂園 — Google Apps Script 後端（試算表版）
 *
 * 學員名單與學習進度存在一個 Google 試算表裡：
 *  - 「資料」工作表：網站實際讀寫的資料（請不要手動修改）
 *  - 「學員進度」工作表：給人看的進度總覽，每次存檔自動更新
 *
 * 試算表從哪裡來？
 *  - 如果這個程式是從試算表的「擴充功能 → Apps Script」建立的，就直接用那個試算表。
 *  - 如果是獨立專案，第一次執行時會自動在你的雲端硬碟建立
 *    「英文聽力樂園－學習資料」試算表。也可以手動執行 setup() 先建立。
 *  - 舊版存在「指令碼屬性」的資料，第一次執行時會自動搬進試算表。
 */

var SHEET_NAME = '資料';
var SUMMARY_NAME = '學員進度';
var CELL = 45000;          // 每格最多放的字數（Google 試算表單格上限 50,000）
var BOOK_TITLE = '英文聽力樂園－學習資料';

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('英文聽力樂園')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * 給 GitHub Pages 版網頁呼叫的入口（網頁放在別的網址時，用 POST 呼叫這裡）
 * 部署時「誰可以存取」必須選「任何人」。
 */
var API_FNS = { getProfiles: getProfiles, saveProfiles: saveProfiles, getProgress: getProgress,
                saveProgress: saveProgress, deleteProgress: deleteProgress };

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // 只認 API_FNS 自己的屬性，避免 "constructor"、"toString" 等繼承來的名稱繞過白名單
    var fn = Object.prototype.hasOwnProperty.call(API_FNS, req.fn) ? API_FNS[req.fn] : null;
    if (!fn) throw new Error('unknown function: ' + req.fn);
    out = { ok: true, result: fn.apply(null, req.args || []) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** 讓 Index.html 把 Data / Vocab / Art 的內容載進來 */
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ---------- 第一次設定（可手動執行） ---------- */

/** 建立（或找到）試算表並搬移舊資料。執行後在「執行記錄」會看到試算表網址。 */
function setup() {
  var ss = book_();
  Logger.log('學習資料試算表：' + ss.getUrl());
  return ss.getUrl();
}

/* ---------- 前端呼叫的函式 ---------- */

function getProfiles() {
  return readKey_('profiles');
}

function saveProfiles(json) {
  return withLock_(function () {
    writeKey_('profiles', json, '學員名單');
    refreshSummary_();
    return true;
  });
}

function getProgress(id) {
  return readKey_('prog_' + safeId_(id));
}

function saveProgress(id, json) {
  return withLock_(function () {
    writeKey_('prog_' + safeId_(id), json, nameOf_(id));
    refreshSummary_();
    return true;
  });
}

function deleteProgress(id) {
  return withLock_(function () {
    deleteKey_('prog_' + safeId_(id));
    refreshSummary_();
    return true;
  });
}

/* ---------- 試算表 ---------- */

var _book = null;

function book_() {
  if (_book) return _book;
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  if (!ss) {
    var id = props.getProperty('SHEET_ID');
    if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(BOOK_TITLE);
    props.setProperty('SHEET_ID', ss.getId());
  }
  _book = ss;
  ensureSheets_(ss);
  migrateFromProps_(ss);
  return ss;
}

function ensureSheets_(ss) {
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    var first = ss.getSheets()[0];
    // 新建立的試算表只有一張空白的「工作表1」，直接改名使用
    if (ss.getSheets().length === 1 && first.getLastRow() === 0) { sh = first; sh.setName(SHEET_NAME); }
    else sh = ss.insertSheet(SHEET_NAME);
    sh.getRange(1, 1, 1, 5).setValues([['鍵值', '說明', '更新時間', '段數', '內容（網站自動讀寫，請勿修改）']])
      .setFontWeight('bold').setBackground('#fde2ec');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 120); sh.setColumnWidth(3, 150);
  }
  if (!ss.getSheetByName(SUMMARY_NAME)) {
    var s2 = ss.insertSheet(SUMMARY_NAME, 0);
    s2.getRange(1, 1, 1, SUMMARY_HEAD.length).setValues([SUMMARY_HEAD])
      .setFontWeight('bold').setBackground('#fff3c4');
    s2.setFrozenRows(1);
  }
  return sh;
}

function dataSheet_() {
  return book_().getSheetByName(SHEET_NAME) || ensureSheets_(book_());
}

/** 找到某個鍵值所在的列（找不到回傳 0） */
function findRow_(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) return i + 2;
  return 0;
}

function readKey_(key) {
  var sh = dataSheet_();
  var r = findRow_(sh, key);
  if (!r) return null;
  var n = Number(sh.getRange(r, 4).getValue() || 0);
  if (!n) return null;
  var vals = sh.getRange(r, 5, 1, n).getValues()[0];
  return vals.map(function (v) { return String(v); }).join('');
}

function writeKey_(key, str, note) {
  var sh = dataSheet_();
  str = String(str || '');
  var parts = [];
  for (var i = 0; i < str.length; i += CELL) parts.push(str.substring(i, i + CELL));
  if (!parts.length) parts.push('');
  var r = findRow_(sh, key);
  if (!r) { r = Math.max(sh.getLastRow(), 1) + 1; }
  var oldN = Number(sh.getRange(r, 4).getValue() || 0);
  var need = 4 + Math.max(parts.length, oldN);
  if (sh.getMaxColumns() < need) sh.insertColumnsAfter(sh.getMaxColumns(), need - sh.getMaxColumns());
  // 內容欄設成純文字，避免以 = 或 + 開頭的字被當成公式
  sh.getRange(r, 5, 1, parts.length).setNumberFormat('@').setValues([parts]);
  if (oldN > parts.length) sh.getRange(r, 5 + parts.length, 1, oldN - parts.length).clearContent();
  sh.getRange(r, 1, 1, 4).setValues([[key, note || '', new Date(), parts.length]]);
}

function deleteKey_(key) {
  var sh = dataSheet_();
  var r = findRow_(sh, key);
  if (r) sh.deleteRow(r);
}

/* ---------- 給人看的「學員進度」 ---------- */

function profileList_() {
  try { var p = JSON.parse(readKey_('profiles') || '{}'); return p.list || []; } catch (e) { return []; }
}

function nameOf_(id) {
  var list = profileList_();
  for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i].name || '';
  return '';
}

var SUMMARY_HEAD = ['學員', '今天有練習', '近7天練習天數', '近7天練習分鐘', '跟讀平均分(近7天)',
                    '練過的句子/文章', '生字本字數', '已認識單字', '星星', '連續天數', '最後練習'];

function dkey_(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

function dayActive_(d) {
  if (!d) return false;
  var n = 0;
  ['s', 'a', 'w', 'v', 'r', 'g', 'c', 'sp'].forEach(function (f) { n += d[f] || 0; });
  return n > 0 || (d.t || 0) >= 60;
}

function refreshSummary_() {
  try {
    var ss = book_();
    var s2 = ss.getSheetByName(SUMMARY_NAME);
    if (!s2) return;
    var W = SUMMARY_HEAD.length;
    if (s2.getMaxColumns() < W) s2.insertColumnsAfter(s2.getMaxColumns(), W - s2.getMaxColumns());
    s2.getRange(1, 1, 1, W).setValues([SUMMARY_HEAD]).setFontWeight('bold').setBackground('#fff3c4');
    var now = new Date(), DAY = 864e5;
    var rows = profileList_().map(function (p) {
      var g = {};
      try { g = JSON.parse(readKey_('prog_' + safeId_(p.id)) || '{}'); } catch (e) {}
      var words = g.words || {}, vk = g.vk || {}, log = g.log || {};
      var known = Object.keys(vk).filter(function (k) { return vk[k] === 1; }).length;
      var days = 0, sec = 0, sp = 0, sc = 0;
      for (var i = 0; i < 7; i++) {
        var d = log[dkey_(new Date(now.getTime() - i * DAY))];
        if (dayActive_(d)) days++;
        if (d) { sec += d.t || 0; sp += d.sp || 0; sc += d.ss || 0; }
      }
      var todayOk = dayActive_(log[dkey_(now)]) ? '✅' : '—';
      var last = g.updated ? new Date(g.updated) : '';
      return [p.name || '', todayOk, days, Math.round(sec / 60), sp ? Math.round(sc / sp) : '',
              Object.keys(g.done || {}).length, Object.keys(words).length, known, g.stars || 0,
              (g.streak && g.streak.count) || 0, last];
    });
    var old = s2.getLastRow();
    if (old > 1) s2.getRange(2, 1, old - 1, Math.max(W, s2.getLastColumn ? s2.getLastColumn() : W)).clearContent();
    if (rows.length) s2.getRange(2, 1, rows.length, W).setValues(rows);
    s2.getRange(2, W, Math.max(rows.length, 1), 1).setNumberFormat('yyyy/mm/dd hh:mm');
  } catch (e) { /* 總覽失敗不影響存檔 */ }
}

/* ---------- 舊版資料搬家（指令碼屬性 → 試算表），只做一次 ---------- */

function migrateFromProps_(ss) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIGRATED') === '1') return;
  var all = props.getProperties();
  var keys = Object.keys(all).filter(function (k) { return /#n$/.test(k); })
    .map(function (k) { return k.slice(0, -2); });
  keys.forEach(function (key) {
    var n = Number(all[key + '#n'] || 0), s = '';
    for (var i = 0; i < n; i++) s += all[key + '#' + i] || '';
    if (s) writeKey_(key, s, key === 'profiles' ? '學員名單' : '');
  });
  // 搬完後清掉舊的分段資料，只留下設定
  keys.forEach(function (key) {
    var n = Number(all[key + '#n'] || 0);
    for (var i = 0; i < n; i++) props.deleteProperty(key + '#' + i);
    props.deleteProperty(key + '#n');
  });
  props.setProperty('MIGRATED', '1');
  if (keys.length) {
    // 補上學員名字
    var sh = ss.getSheetByName(SHEET_NAME);
    var list = profileList_();
    list.forEach(function (p) {
      var r = findRow_(sh, 'prog_' + safeId_(p.id));
      if (r) sh.getRange(r, 2).setValue(p.name || '');
    });
    refreshSummary_();
  }
}

/* ---------- 其他工具 ---------- */

function safeId_(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '');
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
