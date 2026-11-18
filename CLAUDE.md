# CLAUDE.md

## 專案概述

「英文聽力樂園」：給台灣國小～高中（學測）學生的英文聽力／口說練習網頁 App。介面全部是繁體中文（zh-Hant），以可愛角色、多種介面風格、星星與連續天數鼓勵學習。

- **沒有建置流程、沒有套件、沒有測試框架**：純 HTML + CSS + 原生 JavaScript，直接用瀏覽器開啟 `index.html` 即可。
- 檔案：
  - `index.html`（約 9,600 行）：全部的樣式、課程內容、單字庫、SVG 角色與 App 邏輯（GitHub Pages 版）。
  - `config.js`：一行，設定 `window.ELP_API`（Google Apps Script Web App 的 `/exec` 網址）。
  - `apps-script/Code.gs`：Google Apps Script 後端（資料存在 Google 試算表）。

## 兩個版本的對應關係

同一套前端有兩種形式，**內容必須保持一致**：

| GitHub Pages 版（本 repo） | Apps Script 專案 |
|---|---|
| `index.html` 第一個 `<script>` 區塊（課程內容） | `Data.html` |
| `index.html` 第二個 `<script>` 區塊（單字庫） | `Vocab.html` |
| `index.html` 第三個 `<script>` 區塊（SVG 角色） | `Art.html` |
| `index.html` 其餘部分 | `Index.html`（用 `<?!= include('Data'); ?>` 等載入上面三個檔） |
| `<script src="config.js"></script>` | （無，Apps Script 版直接用 `google.script.run`） |

也就是說：把 Apps Script 的 `Index.html` 中三行 `include(...)` 換成對應檔案內容、再加上 `config.js` 那行，就等於 repo 的 `index.html`。Apps Script 專案目前只有 `Code.gs` 放進 repo；修改前端後若要更新 Apps Script 版，需依上表把 `index.html` 拆回四個 `.html` 檔貼上。

## 執行與部署

兩種執行方式（見 `index.html` 中「資料儲存」區段 `gas()`）：

1. **放在 Apps Script 上**：`doGet()` 回傳 `Index.html`；前端偵測到 `google.script.run` 時直接呼叫後端函式。
2. **放在 GitHub Pages 等靜態空間**：用 `fetch` POST 到 `config.js` 的 `ELP_API`，body 為 `{"fn": 函式名, "args": [...]}`（`Content-Type: text/plain`，避免 CORS preflight），由 `doPost()` 經 `API_FNS` 白名單分派，回應格式 `{ok, result, error}`。Web App 部署時「誰可以存取」必須選「任何人」。
   - 修改 `Code.gs` 後要在 Apps Script「管理部署作業」建立**新版本**，`/exec` 網址才會生效；若重新部署成新的部署 ID，`config.js` 的網址也要跟著改。

老師班級模式：網址加 `?k=<部署ID>&n=<班級名稱>`，會改連到老師自己的 Apps Script，且 localStorage key 會加上前綴 `NS`（`c` + 部署 ID 後 12 碼 + `:`），避免和家裡的資料混在一起。

本機測試：`python3 -m http.server` 後開瀏覽器即可。沒有後端時會只存在 localStorage。

## 後端（`apps-script/Code.gs`）

- 對外函式：`getProfiles`、`saveProfiles(json)`、`getProgress(id)`、`saveProgress(id, json)`、`deleteProgress(id)`。新增後端函式時，要同時加進 `API_FNS`，GitHub Pages 版才能呼叫。
- 資料都以 **JSON 字串**存取，後端不解析結構（只有總覽例外，見下）。
- 試算表：由「擴充功能 → Apps Script」建立就用該試算表，否則用指令碼屬性 `SHEET_ID`，都沒有就自動建立「英文聽力樂園－學習資料」。可手動執行 `setup()`。
  - 「資料」工作表：每列一個鍵值（`profiles`、`prog_<id>`），欄位為 鍵值／說明／更新時間／段數／內容…；內容超過 45,000 字會切成多格（E 欄之後），讀取時再接回。內容欄設為純文字格式。
  - 「學員進度」工作表：每次存檔由 `refreshSummary_()` 重算，給家長／老師看。
- 寫入都包在 `withLock_()`（ScriptLock）裡；`safeId_()` 會過濾 id 中的非 `[A-Za-z0-9_-]` 字元。
- `migrateFromProps_()`：舊版資料存在指令碼屬性（`key#0…`、`key#n`），第一次執行時搬進試算表並設 `MIGRATED=1`。
- **耦合注意**：`refreshSummary_()` 會讀進度 JSON 的欄位 `done`、`words`、`vk`（值為 1 代表已認識）、`stars`、`streak.count`、`updated`，以及每日紀錄 `log["YYYY-M-D"]` 內的 `s a w v r g c sp`（各類練習次數）、`t`（秒數）、`ss`（跟讀分數加總）。日期 key 格式需與前端 `dstr()` 一致（月、日不補零）。修改前端進度結構時要同步更新這裡。

## index.html 結構（依 `<script>` 區塊）

| 行數（約） | 內容 |
|---|---|
| 1–405 | `<style>`：介面風格（skin）CSS 變數、元件樣式 |
| 406–417 | HTML 骨架：`#deco`、`#top`、`#main`、`#tabs`、`#toast`、`#pop`、`#sheet` |
| 419–1264 | **課程內容**：`LEVELS`（5 級）、`TOPICS`（主題句子）、`ARTICLES`（文章） |
| 1266–7271 | **分級單字庫** `VOCAB`（來源：大考中心《高中英文參考詞彙表》，1–6 級） |
| 7273–7761 | SVG 角色、頭像、圖示：`AVATAR_LIST`、`MON`（學習夥伴）、`BUDDY_LINES`、小怪獸頭像工作室 `MA_SHAPES` |
| 7764–結尾 | **App 主程式** |

主程式內以 `/* ================= 區段名稱 ================= */` 分段，搜尋這些標題最快定位：基本設定、建立內容索引、分級單字庫、資料儲存、進度工具、語音、介面狀態、各「畫面：…」、遊戲中心、練習情境、學習紀錄、繪製、動作。

## 資料格式

- 主題句子：`TOPICS[i].lv[等級] = [["英文", "中文", [["單字","中文意思"], ...]], ...]`
- 文章：`{id, lv, ic, t, zh, s:[[英,中],...], w:[[單字,中文],...], q:[[題目,[選項...],正確索引],...]}`
- 單字庫：`VOCAB[級別] = [[單字, 詞性, 中文, 例句, 例句中文, 適合小朋友(0/1)], ...]`
- 句子 ID：主題 `"<topicId>-<lv>-<i>"`、文章 `"a-<articleId>-<i>"`。**這些 ID 是學習進度的 key，不要改動既有項目的順序或 id，新增請加在陣列尾端**，否則使用者進度會錯位。

## 架構重點

- **全域狀態**：`P`（所有學習者 profiles）、`cur`（目前學習者）、`S`（目前學習者的進度）、`U`（介面狀態，`U.view` 決定畫面）。
- **繪製**：`render()` 依 `U.view` 從 `map` 取出 `vXxx()` 函式，回傳 HTML 字串整個塞進 `#main`。新增畫面要：寫 `vXxx()`、加進 `render()` 的 `map`，若是全螢幕練習畫面也加進 `focus` 陣列。
- **事件**：用事件委派。元素加 `data-act="名稱"`（其他參數放 `data-*`），處理函式放在 `ACT` / `GAME_ACT` / `VOCAB_ACT` / `MODE_ACT` / `REC_ACT` 物件裡（最後 `Object.assign` 合併）。
- **輸出 HTML 時一律用 `h()` 跳脫**使用者或內容文字。
- **儲存**：先寫 localStorage（`lsGet/lsSet/lsDel`，會自動加 `NS` 前綴），再同步到雲端（進度存檔有 1.5 秒防抖，頁面隱藏時立即送出）；以 `updated` 時間戳決定雲端或本機哪邊較新。修改資料結構時要寫 `migrate()` 相容舊資料，並檢查後端 `refreshSummary_()`。
- **語音**：播放用 Web Speech `speechSynthesis`（`speakEn()`，優先挑美式英文聲音）；口說辨識用 `SpeechRecognition`。
- **練習情境**（`MODES`）：`full` 聽說、`quiet` 安靜（不能說，改拼字/排句子）、`silent` 靜音（不發聲，附 KK 音標）。新功能需考慮三種情境下的行為。
- **介面風格**（`SKINS`）：`sticker`、`notebook`、`jelly`、`night`、`minimal`、`minimaldark`，以 `body[data-skin=...]` 切換 CSS 變數。可愛風（`kind:"cute"`）用彩色圖示，簡約風用線條圖示（`ic()` / `li()`）。新樣式請使用 CSS 變數（`--ink`、`--card`、`--accent`、`--r` 等），確保六種風格都正常，尤其深色的 `night`、`minimaldark`。

## 開發慣例

- 維持單檔架構，不要引入框架、打包工具或外部 JS 套件（字型來自 Google Fonts）。
- 程式碼註解與介面文字使用繁體中文；使用者訊息用 `toast()`。
- 目標使用者是小朋友，介面以手機為主（`viewport` 響應式），文字親切、按鈕要大。
- `index.html` 很大，請用搜尋（區段標題、函式名、`data-act` 名稱）定位，不要整檔讀取。
- 修改後用瀏覽器（可用 Playwright）實際開啟確認無 console 錯誤，並切換幾種風格與情境檢查。
- `config.js` 的 `ELP_API` 是正式後端網址，除非使用者要求，不要更動。
