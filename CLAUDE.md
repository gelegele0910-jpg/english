# CLAUDE.md

## 專案概述

「英文聽力樂園」（英文名 **Echo Island**，網頁標題與手機主畫面名稱）：給台灣國小～高中（學測）學生的英文聽力／口說練習網頁 App。介面全部是繁體中文（zh-Hant），以可愛角色、多種介面風格、星星與連續天數鼓勵學習。

- **沒有建置流程、沒有套件**：純 HTML + CSS + 原生 JavaScript，直接用瀏覽器開啟 `index.html` 即可。測試是 `tests/` 裡的獨立 Node 腳本（只需要 Playwright）。
- 檔案：
  - `index.html`（約 12,500 行）：全部的樣式、課程內容、單字庫、SVG 角色與 App 邏輯（GitHub Pages 版）。
  - `config.js`：一行，設定 `window.ELP_API`（Google Apps Script Web App 的 `/exec` 網址）。
  - `apps-script/Code.gs`：Google Apps Script 後端（資料存在 Google 試算表）。
  - `tests/`：測試腳本，`node tests/run-all.js` 全部執行（見「驗證與測試規範」）。
  - 手機主畫面圖示：`icon-512.png`、`icon-192.png`、`apple-touch-icon.png`（180）、`favicon-32.png` 與 `manifest.webmanifest`，都由 `node tools/make-icons.js` 從 App 裡的啵啵畫出來（選定款式 `CHOSEN`＝D 字島；`--preview` 產生所有款式預覽；改圖示請改這支程式再重新產生）。manifest 的 `display` 用 `minimal-ui`：Android Chrome 會把網站安裝成 App（主畫面圖示沒有 Chrome 小標誌，需要 `sw.js`）；iPhone 不支援 minimal-ui，會照舊用 Safari 開（不可改成 `standalone`：iPhone 的獨立 App 模式和 Safari 不共用 localStorage，會讓已加到主畫面的人看起來資料不見）。`sw.js` 只轉送網頁開啟、不做快取，只在 https 註冊。Apps Script 版沒有這些圖檔。

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

老師班級模式：設定頁「建立班級連結」有給老師的部署步驟（〔複製程式碼〕從同一個網站讀 `apps-script/Code.gs` 複製）。網址加 `?k=<部署ID>&n=<班級名稱>`，會改連到老師自己的 Apps Script，且 localStorage key 會加上前綴 `NS`（`c` + 部署 ID 後 12 碼 + `:`），避免和家裡的資料混在一起。

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
| 10–534 | `<style>`：介面風格（skin）CSS 變數、元件樣式 |
| 537–545 | HTML 骨架：`#deco`、`#top`、`#main`、`#tabs`、`#toast`、`#pop`、`#sheet` |
| 548–2009 | **課程內容**：`LEVELS`（5 級）、`TOPICS`（24 主題 × 5 級 × 8 句）、`ARTICLES`（每級 16 篇） |
| 2011–8016 | **分級單字庫** `VOCAB`（來源：大考中心《高中英文參考詞彙表》，1–6 級）與 KK 音標 `PRON` |
| 8018–9905 | SVG 角色、頭像、圖示：`AVATAR_LIST`、`MON`（學習夥伴）、`BUDDY_LINES`、小怪獸頭像工作室 `MA_SHAPES` |
| 9908–結尾 | **App 主程式** |

主程式內以 `/* ================= 區段名稱 ================= */` 分段，搜尋這些標題最快定位：基本設定、建立內容索引、分級單字庫、資料儲存、進度工具、語音、介面狀態、各「畫面：…」、遊戲中心、練習情境、學習紀錄、繪製、動作。

## 資料格式

- 主題句子：`TOPICS[i].lv[等級] = [["英文", "中文", [["單字","中文意思"], ...]], ...]`
- 文章：`{id, lv, ic, t, zh, s:[[英,中],...], w:[[單字,中文],...], q:[[題目,[選項...],正確索引],...]}`。題數依等級固定：入門 2、基礎 3、進階 4、高中 5、學測 6；選項高中與學測 4 個、其他 3 個（`front-props.js` 檢查）。高中以上題型要混合細節、主旨、字義、推論。顯示時選項會打亂（`U.qperm`），加選項一律接在尾端，正確索引不變。
- 單字庫：`VOCAB[級別] = [[單字, 詞性, 中文, 例句, 例句中文, 適合小朋友(0/1)], ...]`
- 拼字紀錄：`S.sp[單字] = {l, d, last, m, ok, ng, pc, pw}`（見「拼字複習」）。
- 獎勵紀錄：`S.rw = {coins, own, ci, day, taskDays, perfect, topics, egg, night, morning, hi90, speedBest, sets, title, fgift, sky}`（見「獎勵」）。
- 小怪獸頭像：`{b 身體, c 顏色, e 眼睛, m 嘴巴, t 頭頂, a 臉上, n 脖子, o 衣服, w 手上, f 身旁, k 身後, p 花紋, g 背景色, s 場景, x 動作}`，一律經過 `maFix()`（補預設值、舊版放在 `a` 的領結／圍巾／鈴鐺／項鍊會搬到 `n`）。
- 密碼：孩子的在 `P.list[i].pin`、管理者（家長或老師）的在 `P.parent = {pin, q, a}`（提示問題與答案），都只存 `pinHash()`（SHA-256，鹽是學習者 id／`parent`／`parent-a`），不可存原本的數字。
- 句子 ID：主題 `"<topicId>-<lv>-<i>"`、文章 `"a-<articleId>-<i>"`。**這些 ID 是學習進度的 key，不要改動既有項目的順序或 id，新增請加在陣列尾端**，否則使用者進度會錯位。

## 架構重點

- **全域狀態**：`P`（所有學習者 profiles）、`cur`（目前學習者）、`S`（目前學習者的進度）、`U`（介面狀態，`U.view` 決定畫面）。
- **繪製**：`render()` 依 `U.view` 從 `map` 取出 `vXxx()` 函式，回傳 HTML 字串整個塞進 `#main`。新增畫面要：寫 `vXxx()`、加進 `render()` 的 `map`，若是全螢幕練習畫面也加進 `focus` 陣列。
- **事件**：用事件委派。元素加 `data-act="名稱"`（其他參數放 `data-*`），處理函式放在 `ACT` / `GAME_ACT` / `VOCAB_ACT` / `MODE_ACT` / `REC_ACT` 物件裡（最後 `Object.assign` 合併）。
- **輸出 HTML 時一律用 `h()` 跳脫**使用者或內容文字。
- **儲存**：先寫 localStorage（`lsGet/lsSet/lsDel`，會自動加 `NS` 前綴），再同步到雲端（進度存檔有 1.5 秒防抖，頁面隱藏時立即送出）；以 `updated` 時間戳決定雲端或本機哪邊較新。上傳一律經過 `cloudSaver()`（`pushProfiles`、`pushProg`）：同一種同時只送一個、失敗依 `GAS_RETRY` 再試 2 次，每次都送當下最新的資料，3 次都失敗才 `cloudFail()` 提示（一分鐘最多一次）。**`keepalive` 只在頁面隱藏時用（`gasLeaving`），且以位元組計算要小於 60KB**：瀏覽器限制同時上傳中的 keepalive 請求合計 64KB，平常也用的話第二個存檔會被直接拒絕。修改資料結構時要寫 `migrate()` 相容舊資料，並檢查後端 `refreshSummary_()`。
- **語音**：播放用 Web Speech `speechSynthesis`（`speakEn()`，優先挑美式英文聲音）；口說辨識用 `SpeechRecognition`。
- **練習情境**（`MODES`）：`full` 聽說、`quiet` 安靜（不能說，改拼字/排句子）、`silent` 靜音（不發聲，附 KK 音標）。新功能需考慮三種情境下的行為。
- **小怪獸畫風**（`ART_STYLE`，目前 `"flat"`）：平面、沒有框線、白色大眼睛＋黑眼珠、沒有腳下影子。`flatify()` 把畫好的 SVG 去掉色塊外框、把指定顏色換成 `vivid()` 的清爽色（肚子比身體淺）；`monster()`、`hiddenMon()`、`maSvg()` 都會套用。另外保留 `"soft"`（立體漸層 `softify()`）與 `"line"`（原本的框線）可切換比較。六隻原始夥伴用新造型 `BUDDY_ART`（跟隱藏版同一套 `hmFace`／`hmEyes`／`hmArms`，表情 normal／happy／cheer／think／oops／sleepy），啵啵是小蜜桃（`BOBO_LOOK="peach"`，另有 `bunny`、`buns` 兩款候選）。新增角色請照隱藏版的寫法：只畫色塊、不加 stroke 外框。
- **介面風格**（`SKINS`）：`sticker`、`notebook`、`jelly`、`night`、`minimal`、`minimaldark`，以 `body[data-skin=...]` 切換 CSS 變數。可愛風（`kind:"cute"`）用彩色圖示，簡約風用線條圖示（`ic()` / `li()`）。新樣式請使用 CSS 變數（`--ink`、`--card`、`--accent`、`--r` 等），確保六種風格都正常，尤其深色的 `night`、`minimaldark`。

## 密碼（`index.html`「密碼（4 位數字）」區段）

- 家庭用的鎖（防兄弟姊妹互用、防偷看），不是真正的資安：資料照舊存在試算表，`getProfiles` 也拿得到雜湊。
- 孩子密碼可以不設。有密碼的學習者：點頭像（`tryEnter()`）、開 App 自動進入（`boot()`）都要先輸入；這個分頁輸入過就記在 `sessionStorage` 的 `elp-unlock`（重新整理不用再輸入），切換學習者（`go` → profiles）會清掉。
- 管理者密碼（介面叫「管理者密碼」，程式仍叫 parent；設了才生效）用 `needParent(說明, 接著做的事)` 擋：學習看板、刪除學習者；新增學習者只有在開關 `P.addLock`（預設關閉，切換也要管理者密碼）打開時才擋，方便請朋友一起玩；也能代替孩子密碼進入任何孩子（`pin-parent-enter`），以及改／取消孩子密碼時代替舊密碼（`pin-parent-ok`）。還沒設管理者密碼時孩子忘記密碼，會先請管理者設定一個。
- 忘記管理者密碼：回答提示問題（`pq-forgot`，答案不分大小寫與空白）後重設，並繼續原本要做的事。
- 數字鍵盤 `askPin({k:"check"|"set", ...})`（`U.sheet="pin"`）：`set` 要輸入兩次；錯 5 次要等 30 秒（`U.pinWait`）；電腦可直接用鍵盤輸入。新增要密碼的動作時，在 `tests/pin.js` 補測試。

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

## 獎勵（`index.html`「獎勵」區段）

- **金幣**（`S.rw.coins`）只用來買東西；**星星**（`S.stars`）照舊只增不減，家長看板與試算表照常使用。
- **部件上鎖**：`MA_TOPS`、`MA_ACC`、`MA_NECK`、`MA_BACK`、`MA_EYES`、`MA_MOUTHS`、`MA_SCENE` 中標 `lock:true` 的是獎勵品，要在 `S.rw.own["分類:代號"]` 裡才能用。取得方式寫在 `REWARDS`（數字＝商店價格，字串＝`RW_SRC` 的來源）。頭像工作室、`maRandom(canUsePart(own))`、`ab-set` 都會擋上鎖部件；新增頭像時（`U.abFrom==="edit"`）一律當作沒有任何寶物。
- **賺金幣（做越多得越多）**：
  - 每次練習：新句子 +2（重練 +1）、文章 +5（重聽 +2）、複習一個字 +1、拼字複習拼對一個字 +1、跟讀 80 分以上 +1。
  - 遊戲：8 種遊戲**每種每天第一次**玩完 +`GAME_COIN`（5）（`rwDay().games`），同一種再玩只給星星；拼字複習不佔遊戲金幣。
  - 簽到（當天有練習才能領）+10；每日任務 3 個（`TASKS`，讀 `S.log` 今天的 `s/a/g/r`）各 +10，三個都領送下一個任務寶物，送完改 +20；完成主題（每個主題＋難度只算一次）+15；當天拼字複習全部完成 +20。
  - **每天打折**（`COIN_TIERS`）：當天已賺 150 枚以前全額、150～300 減半、300 以上四分之一；零頭累積在 `rwDay().frac`，湊滿 1 枚才給。`earn(n, why, true)` 是成就類獎勵（套裝、寶箱、神秘蛋、節慶禮物），不打折。首頁「今天賺到的金幣」（`coinNote()`）顯示目前倍率。
- **寶物**：連續練習 3／7／14 天、簽到滿 3 天、每日任務滿 10 天、拼字複習全對 5 次各送指定寶物；連續練習每 7 天開一個寶箱（`openChest()` 只開沒有的，都有了改給 50 金幣）。寶箱不在商店賣。
- `grant(id)` 送寶物並排進 `U.rwq`，以 `U.sheet="reward"` 彈出視窗；商店購買要點兩次確認（`U.arm`）。
- **動作**（`MA_MOVES`，頭像的 `x`，預設 `bounce` 跳跳免費）：`moveHtml(內容, 動作, loop)` 包上 `.mv .mv-代號` 播 CSS 動畫（`loop` 一直動，用在商店與頭像工作室預覽；否則播兩次）。`meDance(size, play)` 是自己的小怪獸，`play` 為假時加 `.mv-still` 不動。會動的時機：首頁「今天的任務」點小怪獸（`me-dance`）、領取簽到或任務、答對（`pop()`）、完成主題與遊戲畫面（`.duo`）。動畫在 `prefers-reduced-motion: reduce` 時全部停止。
- `RW()` 會**原地**補齊舊資料缺的欄位，不可換成新物件（否則持有舊參照的函式會遺失修改）。
- **隱藏版小怪獸**（`HIDDEN`，Art 區塊）：16 隻獨立造型，`hiddenMon(id, size, bare, 表情)` 繪製（表情 normal／cheer／oops／think，`HM_EXPR` 把夥伴的 6 種表情對應過去）。啟動時加進 `MON`、`PROFILE`、`BUDDY_LINES`（標 `hidden:true`），所以 `monster()`、`buddy()`、`bline()` 都直接支援。**收集到（`S.rw.own["h:代號"]`）才能當夥伴**：`partnerOk()`／`partnerId()` 會退回 `bobo`；選擇夥伴畫面（`partnerGrid(sel, act, true)`）才顯示上鎖的黑影，新增學習者畫面不顯示。
- **成就**（`ACH`）：達成就解鎖對應隱藏版，`rwAch()` 在每次 `saveProg()` 時檢查（有 `achBusy` 防止遞迴）。條件：連續練習 30 天、拼字熟練 30 字、聽完 20 篇文章、完成一個難度全部主題、每日任務 5 天、快問快答 20 題、跟讀 90 分以上 10 次（`logSpeak`）、晚上 8 點後練習 7 天（`rwPractice`）；第二批：早上 8 點前練習 5 天（`S.rw.morning`）、累計練習 50 天（`logTotal()` > 0 的日子）、複習生字認得 100 字（`S.vk`）、累計玩 50 次遊戲（`log.g`）、累積 500 顆星星、點亮 5 個星座（`S.rw.sky` 不算 `all`）、集滿 3 組套裝、收集 40 件寶物（不算 `h:`）。新增隱藏版要同時加 `HIDDEN`、`HM_INFO`、`BUDDY_LINES`、`ACH`、`RW_SRC`，並在 `tests/hidden.js` 的 H4 補一組「差一點／剛好達到」。
- **神秘蛋**（`S.rw.egg = {d, last, n}`）：`bump()` 呼叫 `rwPractice()`，每天第一次練習長大一天（不用連續），滿 `EGG_DAYS`（5）天可在首頁孵化，`hatchEgg()` 孵出沒有的隱藏版，全部收集完給 100 金幣；孵化當天的練習不算進下一顆蛋。
- 隱藏版在收藏冊的「隱藏版」分類（商店分頁不顯示），未收集顯示 `silhouette()` 黑影、條件與進度（`achProgress()`）。
- **衣服／手上／身旁**：`MA_OUTFIT`（`f(s,L,c)`，`maSvg` 用以身體形狀 `s.d` 做的 `clipPath` 裁切，再補畫一次身體外框；`MA_UID` 讓每張頭像的 clipPath id 不重複）、`MA_HAND`（右下方，`maPaw()` 畫小圓手握著）、`MA_FLOAT`（左上方的小東西）。身後的東西若跟手上衝突，放左邊。
- **主題套裝**（`SETS`）：每組 4 件，**必須分在不同欄位**才能一起穿；各件都能在商店單買。集滿時 `rwSets()`（跟著 `rwAch()` 在 `saveProg()` 檢查）送稱號（`S.rw.title`，顯示在頂端名字下方）＋`SET_BONUS` 金幣並彈出視窗（`U.rwq` 放 `"set:代號"`），每套只送一次（`S.rw.sets`）。`set-wear` 一次穿上擁有的件數。目前 33 組（第一批 4 組、第二批 17 組、公主系列 12 組）。新增套裝：在 Art 區塊加部件（`lock:true`）→ `REWARDS` 加價格 → `SETS` 加一筆 → 用畫廊截圖（每套整套穿在圓圓／方塊／雲朵三種身體）確認沒有互相擋住。
- **節慶限定**（`FEST`）：`REWARDS` 的 `get` 寫 `"fest:代號"`，價格在 `FEST_PRICE`；`itemPrice(it)` 只在 `festActive()` 期間回傳價格，買了永久保留。期間 = 節日當天往前 `pre` 天、往後 `post` 天。**農曆節日（春節、端午、中秋）的國曆日期寫死在 `FEST[...].dates`，目前只有 2026～2030 年，之後要補新的年份**（沒有日期的年份不會開放）；萬聖節、聖誕節用 `fixed`。節日期間第一次簽到 `festGift()` 送一樣該節慶沒有的寶物，每個節慶每年一次（`S.rw.fgift["代號-年"]`），都有了改給 30 金幣。
- 商店分類：「套裝」（預設）、「節慶」再接各欄位；隱藏版只在收藏冊。寶物卡片統一用 `rwCard(it, tab)`。
- **星空圖**（`SKY`，Art 區塊；畫面 `vSky()`，點頂端星星 `sky-open`）：用**累積的星星**（`S.stars`）點亮星座，星星不會被扣掉。14 個星座 93 顆星點，第 i 個星座每顆要 `SKY_BASE + SKY_STEP × i`（10 + 5i）顆星星，累計門檻在 `SKY_NEED`，全部 `SKY_TOTAL`（4105）。`rwSky()`（跟著 `rwAch()`）點亮一整個星座送「星座徽章」（`n:zod_代號`），全部點亮送「滿天星座」場景與稱號；一次點亮多個時直接收下、只跳一則提示（`S.rw.sky[代號]` 記錄點亮日期；舊資料是 1）。每個星座有 `en`（英文名）與 `fact`（給孩子的小知識）；點星座縮圖（`sky-view`）以 `U.sheet="sky"` 開欣賞視窗（`vSkySheet()`：大圖、聽英文、點亮日期、戴上徽章），一顆都沒亮的不開。閃爍效果：背景 `.tw`（`skyField()`）、點亮的星點 `.sg`／`.sd`，減少動態時停止。
- 設計草稿見對話中的「小怪獸獎勵圖鑑」；之後可以再加新的套裝。

## 開發慣例

- 維持單檔架構，不要引入框架、打包工具或外部 JS 套件（字型來自 Google Fonts）。
- 程式碼註解與介面文字使用繁體中文；使用者訊息用 `toast()`。
- 目標使用者是小朋友，介面以手機為主（`viewport` 響應式），文字親切、按鈕要大。
- **手機版面**：最小要支援 320 寬（iPhone SE）。格子用 `repeat(auto-fill, minmax(...))` 依寬度自動排，不要寫死欄數；flex 裡放文字的子元素要 `min-width:0`；分類標籤要能換行（不要藏在橫向捲動裡）；英文大字用 `clamp()` 跟著螢幕縮小。高度用 `dvh`（寫在 `vh` 後面當備援），iPhone Safari 的工具列出現時，彈出視窗才不會被推出螢幕。新增畫面後把它加進 `tests/mobile.js` 的 `SCENES`。
- **平板與電腦**：`font-size` 一律寫成 `calc(Npx*var(--fz))`（含 JS 裡的 inline style），`--fz` 在 700 寬以上是 1.2，平板的字才不會太小；`.app` 最寬 720px。1000 寬以上下方頁籤改成左側直排（`body.side`，內容留出 180px）。
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
| `check-syntax.js` | `index.html` 所有 `<script>`、`Code.gs`、`config.js` 的語法檢查；`font-size` 不可寫死成 px；主畫面圖示與 manifest 的檔案存在、尺寸正確 |
| `backend-props.js` | 用模擬試算表執行 `Code.gs`：分段存讀往返一致、存檔冪等、`doPost` 白名單、學員進度總覽計算、舊資料搬家 |
| `front-props.js` | `highlight()` / `findWord()` 不變量、`migrate()` 冪等、課程內容完整性（R-04）、`h()` 跳脫與惡意名字 |
| `spelling.js` | 拼字間隔規則（含 2000 步隨機不變量）、逐字對照、三種拼字遊戲的訂正與重出題、隔天首頁複習、舊資料相容 |
| `rewards.js` | 金幣帳目（1500 步隨機買賣）、簽到、連續天數里程碑、每日任務、遊戲金幣上限、寶箱不重複、上鎖部件、商店兩段確認與穿脫、動作播放與減少動態設定、舊資料相容 |
| `hidden.js` | 隱藏版 16 隻與原始 6 隻新造型 × 6 表情繪製與台詞、夥伴上鎖、神秘蛋（一天一次、不用連續、不重複）、每個成就剛好達到才解鎖（每隻都要有測試）、收藏冊與設成夥伴、舊資料相容 |
| `sets.js` | 套裝 4 件不同欄位、集滿才送且只送一次、稱號與整套穿上；五個節慶 2026～2030 期間邊界、期間外買不到、買了永久能用、節慶禮物每年一次 |
| `sky.js` | 星點門檻遞增與總數、0～全部逐一檢查點亮數、星座徽章不重複、一次點亮多個只提示一次、全部點亮送場景與稱號、星空圖畫面與舊資料 |
| `mobile.js` | 46 個畫面（含遊戲、商店、星空、頭像工作室、彈出視窗）× 9 種尺寸（手機 320～414、平板 820／1024／1180、電腦 1440）：不可超出螢幕或卡片、文字被截斷或擠成直排、按鈕內容擠出、大字單字被拆行、被底部選單（或左側頁籤）蓋住、彈出視窗跑出螢幕。`--shots` 另存 320 寬截圖 |
| `pin.js` | 孩子密碼（雜湊、錯的進不去、切換後重新輸入、重新整理與新分頁）、管理者密碼擋學習看板／刪除、新增學習者的開關（預設不用密碼）、孩子忘記密碼由家長進入並重設、忘記管理者密碼用提示問題、錯 5 次等 30 秒、鍵盤輸入、深淺風格、舊資料 |
| `sync.js` | 攔截 Apps Script 回傳模擬資料，驗證雲端／本機「較新的一方勝出」；大進度上傳中又存名單不會失敗（S6 走本機模擬後端，才有真正的 keepalive 上限）、失敗自動重試且送最新資料、一直失敗才提示一次、只有頁面隱藏時用 keepalive |
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
- 模擬換日時要同時換掉 `Date.now()` 和 `new Date()`（`today()` 用的是 `new Date()`），寫法見 `tests/rewards.js`。
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
| R-04 | 改了 `TOPICS` / `ARTICLES` / `VOCAB` 內容 | 只在陣列尾端新增，未改動既有順序（句子 ID 是進度 key；既有文章要加句子也只能接在 `s` 尾端）；單字有出現在句子中（`findWord` 找得到）；每個生字在 `PRON` 都有 KK 音標（`front-props.js` 會檢查） |
| R-05 | 改了 `apps-script/Code.gs` | 新函式已加進 `API_FNS`；寫入有包在 `withLock_()` 中；`backend-props.js` 通過；提醒使用者要部署新版本 |
| R-06 | 把內容輸出成 HTML | 使用者輸入（學習者名字等）與內容文字都經過 `h()` 跳脫 |
| R-07 | 新增 log、錯誤回報或外部請求 | 不可把學習者名字、進度等個人資料送到 Apps Script 以外的地方或印進記錄 |
| R-08 | 改了 `S.sp`、`spRecall` / `spPick`、拼字遊戲 | `spelling.js` 通過；選拼法不可讓間隔延長；重出的題目不可寫入跨天紀錄 |
| R-09 | 改了 `S.rw`、`REWARDS`、上鎖部件、賺金幣的地方、隱藏版、成就、套裝、節慶或星空圖 | `rewards.js`、`hidden.js`、`sets.js`、`sky.js` 通過；在 `saveProg()` 裡觸發的提示與獎勵要有「已送過」紀錄，不可每次存檔重複出現；新套裝的 4 件要在不同欄位；沒收集的隱藏版不可當夥伴；金幣不可能變負數或重複領；隨機頭像與頭像工作室不可拿到沒收集的部件 |
| R-10 | 改了 CSS、版面或新增畫面 | `mobile.js` 通過；新畫面加進 `SCENES`；至少看一次 320 寬的截圖（`node tests/mobile.js --shots`） |

### 9. 把漏網之魚變成規則

發現先前漏掉的 bug 時：

1. 分析為什麼當時沒抓到，以及能不能從 diff 的觸發條件辨識出來（先想想會不會誤報太多）。
2. 每次都該擋下的確定性問題 → 在 `tests/` 加一個會失敗的測試；常犯的慣性錯誤 → 在「開發慣例」加一行禁令；特定模組的陷阱 → 在上表加一列。
3. 順便刪掉重複或過時的規則，保持本檔精簡。
