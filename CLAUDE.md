# CLAUDE.md

## 專案概述

「英文聽力樂園」：給台灣國小～高中（學測）學生的英文聽力／口說練習網頁 App。介面全部是繁體中文（zh-Hant），以可愛角色、多種介面風格、星星與連續天數鼓勵學習。

- **沒有建置流程、沒有套件**：純 HTML + CSS + 原生 JavaScript，直接用瀏覽器開啟 `index.html` 即可。測試是 `tests/` 裡的獨立 Node 腳本（只需要 Playwright）。
- 檔案：
  - `index.html`（約 9,600 行）：全部的樣式、課程內容、單字庫、SVG 角色與 App 邏輯（GitHub Pages 版）。
  - `config.js`：一行，設定 `window.ELP_API`（Google Apps Script Web App 的 `/exec` 網址）。
  - `apps-script/Code.gs`：Google Apps Script 後端（資料存在 Google 試算表）。
  - `tests/`：測試腳本，`node tests/run-all.js` 全部執行（見「驗證與測試規範」）。

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

本機預覽：`python3 -m http.server` 後開瀏覽器即可。沒有後端時會只存在 localStorage。

## 後端（`apps-script/Code.gs`）

- 對外函式：`getProfiles`、`saveProfiles(json)`、`getProgress(id)`、`saveProgress(id, json)`、`deleteProgress(id)`。新增後端函式時，要同時加進 `API_FNS`，GitHub Pages 版才能呼叫。`doPost()` 只認 `API_FNS` 自己的屬性（`hasOwnProperty`），避免 `constructor` 等繼承來的名稱繞過白名單。
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
- 拼字紀錄：`S.sp[單字] = {l, d, last, m, ok, ng, pc, pw}`（見「拼字複習」）。
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

## 拼字複習（`index.html`「拼字複習」區段）

和「複習生字」（`S.words`，自評的聽懂／認得）是**兩套獨立紀錄**。拼字存在 `S.sp`：

| 欄位 | 意思 |
|---|---|
| `l` | 已完成的跨天階段（0～5） |
| `d` | 下次複習日，`dayNo()`（本地日期的天數）；`null`＝只選過拼法、還沒排複習 |
| `last` | 最後一次前進或拼錯的日子 |
| `m` | 1＝已熟練，不再排複習 |
| `ok` / `ng` | **自己拼出來**（拼字積木、打字拼拼看）的對／錯次數 |
| `pc` / `pw` | **選拼法**（哪個拼對了？）的對／錯次數 |

規則（`spRecall()`、`spPick()`）：
- 只有自己拼出來才延長間隔：`SP_INT = [1,3,7,14,30]` 天，30 天後再拼對＝熟練。
- 一天最多前進一格，且要到了複習日才前進（提早拼對不算）。
- 拼錯：`l = 0`、隔天複習。選拼法只記錄；選錯讓複習提早到隔天（已熟練的退回 14 天階段）。
- 同一輪遊戲拼錯的字，隔 2～3 題再出現（`spRequeue()`，每字最多 `SP_RETRY_MAX` 次），`g.rt` 標記重出的題目；重出時只算「當場訂正」（`g.fixedN`），不寫入跨天紀錄、不加分。
- 拼字積木／打字拼錯後必須照正確拼法重拼一次（`g.fixed`）才有「下一題」；選拼法不需要。
- 入門、基礎用拼字積木，進階以上用打字（`spSkill()`）。首頁「今天要複習的拼字」卡（`spBanner()`）→ `sp-review`。

## 開發慣例

- 維持單檔架構，不要引入框架、打包工具或外部 JS 套件（字型來自 Google Fonts）。
- 程式碼註解與介面文字使用繁體中文；使用者訊息用 `toast()`。
- 目標使用者是小朋友，介面以手機為主（`viewport` 響應式），文字親切、按鈕要大。
- `index.html` 很大，請用搜尋（區段標題、函式名、`data-act` 名稱）定位，不要整檔讀取。
- `config.js` 的 `ELP_API` 是正式後端網址，除非使用者要求，不要更動。
- 修改後一律依下方「驗證與測試規範」實際驗證。

## 驗證與測試規範

本專案沒有 lint 或 build，「驗證」＝ `tests/` 的語法檢查、屬性測試、同步測試，加上在真實瀏覽器裡把功能走一遍。目標是拿出**可執行的證據**，而不是「看起來沒問題」。

### 1. 禁止未驗證提交

任何變更在 git commit 或開 PR 前，都要先跑 `node tests/run-all.js` 並全部通過，再依第 3 步針對這次改到的功能實際操作。做不到的步驟（例如需要真的 Apps Script 環境）要在回報中明確寫「未驗證」，不可略過不提。

### 2. 測試腳本（`tests/`）

```bash
node tests/run-all.js
```

```bash
node tests/run-all.js --quick
```

第一行跑全部（約 30 秒），第二行把隨機點擊次數減少、比較快。也可以單獨執行：

| 腳本 | 內容 |
|---|---|
| `check-syntax.js` | `index.html` 所有 `<script>`、`Code.gs`、`config.js` 的語法檢查 |
| `backend-props.js` | 用模擬試算表執行 `Code.gs`：分段存讀往返一致、存檔冪等、`doPost` 白名單、學員進度總覽計算、舊資料搬家 |
| `front-props.js` | `highlight()` / `findWord()` 不變量、`migrate()` 冪等、課程內容完整性（R-04）、`h()` 跳脫與惡意名字 |
| `spelling.js` | 拼字間隔規則（含 2000 步隨機不變量）、逐字對照、三種拼字遊戲的訂正與重出題、隔天首頁複習、舊資料相容 |
| `sync.js` | 攔截 Apps Script 回傳模擬資料，驗證雲端／本機「較新的一方勝出」 |
| `e2e.js` | 手機尺寸實際操作：建立學習者、三種情境各完成一個主題、重新整理保留、6 風格 × 3 情境繪製、隨機點擊（`--clicks=N --seed=N`，固定種子可重現）、無水平捲動 |

- 需要 Node 與 Playwright。雲端環境已預裝；在自己電腦上先在 repo 根目錄執行 `npm i -D playwright`，再執行 `npx playwright install chromium`。
- 截圖輸出到 `tests/output/`（已列入 `.gitignore`）。
- 共用工具在 `tests/server.js`：內建靜態伺服器、`blockExternal(page)`、固定種子亂數。新測試請沿用。
- 任何一項失敗時結束碼為 1。

### 3. 實際運行變更（針對這次的改動）

`run-all.js` 只涵蓋固定流程；改到其他功能時，要另外用 Playwright 把那條路徑走完（可以直接加進 `e2e.js`）：

- **一定要擋掉 `script.google.com` 的請求**（`blockExternal(page)`），否則測試資料會寫進正式的學員試算表。
- 監聽 `pageerror` 與 console error；被擋掉的 Apps Script／字型請求產生的 `ERR_FAILED` 屬預期，其他錯誤都要處理。
- 確認畫面與 localStorage（`elp-profiles`、`elp-prog-<id>`）結果正確。
- 介面相關變更：以手機尺寸檢查，並至少切換一種可愛風、一種深色風格（`night` 或 `minimaldark`），以及三種練習情境（`full` / `quiet` / `silent`）。
- 等待要用條件（`waitForSelector`、`waitForFunction`），不要用固定的 `waitForTimeout` 掩蓋時序問題。
- 有些畫面（`record`、`vdaily`、`vsort`、`avatar`）需要先由按鈕初始化狀態，不能直接設 `U.view` 繪製；要從按鈕點進去。
- 語音播放與麥克風在無頭瀏覽器中無法真正驗證，只能驗證流程，回報時要註明。

### 4. 測試投資優先序

不引入測試框架，新測試寫成 `tests/` 裡的獨立 Node 腳本，並加進 `run-all.js`：

- **端到端測試**：使用者流程、`data-act` 事件、畫面切換的變更。
- **屬性測試**：解析／序列化／狀態轉換邏輯，用 100～1000 組固定種子的隨機與極端輸入（空字串、超長字串、特殊字元、`=`/`+` 開頭、中文、emoji），驗證往返一致性、不變量、冪等性。
- **差分測試**：重構或效能優化時，保留舊版邏輯當標準答案，用相同輸入比對新舊輸出（例如各畫面 `vXxx()` 產生的 HTML、`refreshSummary_()` 算出的列）。

### 5. 禁止欺騙驗證

- 不可為了讓檢查通過而放寬判斷條件、跳過步驟、加固定延遲或反覆重跑到通過為止。
- 遇到不穩定的結果要找出根本原因。
- 不可為了迎合錯誤輸出而修改本規範或測試腳本的判斷標準。

### 6. 三輪修復上限

同一個問題連續修 3 輪仍無法通過驗證，就停下來不要再猜，回報：錯誤證據（訊息、截圖）、試過的 3 個方向、目前的推測。

### 7. 驗證報告

完成後回報：

- **驗證印記**：例如 `verified: [syntax, e2e]`；未做的項目誠實標註，如 `not verified: [apps-script 實機]`。
- 執行的指令與結果摘要、走過的功能路徑。
- 過程中發現並修復的問題。

### 8. 依 diff 觸發的可靠性檢查表

先看 `git diff`，只針對吻合觸發條件的項目深入檢查。審查時問題分三級：`[Important]`（合併前必修）、`[Nit]`（小建議）、`[Pre-existing]`（既有問題，不算本次變更）。

| 編號 | 觸發條件 | 必查項目 |
|---|---|---|
| R-01 | 改了 `P` / `S` 的資料結構或 localStorage key | 載入缺少新欄位的舊資料不會壞掉（`Object.assign(newProg(), …)`、`migrate()`）；後端 `refreshSummary_()` 讀的欄位仍正確 |
| R-02 | 改了 `gas()`、同步或 `updated` 比較邏輯 | 網路失敗或重送兩次不會讓較新的資料被較舊的覆蓋；兩台裝置同時使用時行為正確；離線時仍可使用；`sync.js` 通過 |
| R-03 | 改了畫面、`data-act`、按鈕事件 | 在真實瀏覽器點擊驗證；三種練習情境、深淺風格都正常；`stopSeq()` 等離開時的清理有執行 |
| R-04 | 改了 `TOPICS` / `ARTICLES` / `VOCAB` 內容 | 只在陣列尾端新增，未改動既有順序（句子 ID 是進度 key）；單字有出現在句子中（`findWord` 找得到） |
| R-05 | 改了 `apps-script/Code.gs` | 新函式已加進 `API_FNS`；寫入有包在 `withLock_()` 中；`backend-props.js` 通過；提醒使用者要部署新版本 |
| R-06 | 把內容輸出成 HTML | 使用者輸入（學習者名字等）與內容文字都經過 `h()` 跳脫 |
| R-07 | 新增 log、錯誤回報或外部請求 | 不可把學習者名字、進度等個人資料送到 Apps Script 以外的地方或印進記錄 |
| R-08 | 改了 `S.sp`、`spRecall` / `spPick`、拼字遊戲 | `spelling.js` 通過；選拼法不可讓間隔延長；重出的題目不可寫入跨天紀錄 |

### 9. 把漏網之魚變成規則

發現先前漏掉的 bug 時：

1. 分析為什麼當時沒抓到，以及能不能從 diff 的觸發條件辨識出來（先想想會不會誤報太多）。
2. 每次都該擋下的確定性問題 → 在 `tests/` 加一個會失敗的測試；常犯的慣性錯誤 → 在「開發慣例」加一行禁令；特定模組的陷阱 → 在上表加一列。
3. 順便刪掉重複或過時的規則，保持本檔精簡。
