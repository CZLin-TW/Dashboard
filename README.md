# Smart Home Dashboard

> **獨立測試模式**：`npm ci` 後執行 `npm run demo`，開啟 `http://127.0.0.1:3001`，即可用模擬家庭資料查看與操作完整 UI，無須 LINE 配對。支援重設、空資料、離線與 API 失敗情境；不連接真實家電。詳見 [測試模式說明](docs/demo-mode.md)。

新開發者或 AI session 請先讀 [專案開發指引](AGENTS.md) 與[測試模式交接說明](docs/demo-mode.md#新-session-接手)。請在不含正式環境憑證的獨立 checkout 啟動 demo；本機服務與分頁不保證跨 session 保留。

家庭智慧中控面板，[家庭 AI 管家系統](https://github.com/CZLin-TW/home-butler)的網頁版操作介面。使用 Next.js + TypeScript + Tailwind CSS 建置。

本專案 100% 由 AI 協作完成，包含架構設計、所有程式碼、文件撰寫。

核心理念：
- **視覺化操作**：LINE Bot 用自然語言，Dashboard 用按鈕和表格，兩者互補
- **即時控制**：家電開關、溫度調整、排程設定，一鍵完成
- **行動優先**：響應式設計，手機和桌機都好用
- **前端與登入邊界**：Dashboard 提供 UI、Session 驗證與 API 代理；家庭資料寫入及設備規則由 home-butler／本機 agent 執行。

### 功能一覽

| 功能 | 說明 |
|------|------|
| 首頁總覽 | 天氣、室內溫濕度、釘選設備快速控制、未來 5 天 / 已過期的待辦與食品 |
| 設備控制 | 空調（電源/溫度/模式/風速 + 送出後輪詢確認）、除濕機（模式/濕度 + 條件式自動模式 toggle + 即時可調的目標濕度門檻）、IR 設備（自訂按鈕）；環境感測器（溫度/濕度即時值，含 SwitchBot Meter Pro CO2 三合一） |
| 設備釘選 | 常用設備（最多 4 個）+ 一個感測器釘選到首頁，快速存取 |
| 空調溫度回饋 | 空調控制區展開「溫度回饋補償」，選同房間感測器後啟用；顯示室溫、舒適目標及 IR 下發溫度。進階設定提供評估間隔、容許溫差、調整步幅、最短間隔與補償上限。預設關閉，只在已開機冷／暖房時補償；Apple Home 仍顯示舒適目標。kid 帳號無此設定權限。 |
| 待辦事項 | 新增、修改、完成、查看；支援週期任務（每天/每週/每月/間隔天的重複待辦，由模板自動生成當次待辦並以 🔁 標記）；隱私邏輯只顯示「自己負責 + 公開」項目；過期/今日提醒 highlight；有時間的待辦可勾選 Hue 燈光提醒並指定照明區域 |
| 庫存 | 食品的新增、修改、刪除；過期/今日項目整 row 警示底色 |
| 排程管理 | 完整 CRUD（新增 / 編輯 / 刪除）；直接內嵌在每張裝置卡片下方，過期排程也保留顯示 |
| 照明 | 列出 Hue 房間/區域，每區一張卡：套用 Hue App 場景、套用通知動作、套用支援燈效、電源 On/Off、亮度（slider + 數字輸入雙向）、可改 Dashboard 顯示名稱；只顯示 room/zone（隱藏「全家」與未分區燈群） |
| 自動夜燈 | 每張照明卡片下方的設定區塊：光感應器（SwitchBot Hub 2）、亮度門檻 1–20（附「偵測亮度」鈕實測當下值＋資料年齡）、觸發場景、開燈亮度、啟用時段（可跨午夜）。時段內亮度 ≤ 門檻且燈關著自動套場景、> 門檻自動關燈、時段結束關燈；規則由 home-butler 後端執行（SwitchBot webhook 秒級 + 5min 輪詢兜底），網頁關閉仍運作 |
| PC 監控 | 家中 PC 跑 agent 推指標到後端，Dashboard 顯示當下值（CPU/GPU 用量+溫度）+ 24h 折線圖（CPU/GPU/RAM 用量、CPU/GPU 溫度） |
| 劇院 agent 監控 | PC 卡片提供三個自動化開關：KEF 喇叭連動、電視畫面自動關閉、AVR 隨電視開啟；顯示兩程序版本、Apple TV 健康、設備過時提示與兩份 log。寫入期間鎖定所有開關，完成後重讀確認；失敗不以反向值假裝回復。資料經 home-butler → PC agent → 同機 theater-agent 轉送。 |
| 裝置配對登入 | 登入頁顯示 6 位驗證碼，在 LINE Bot 輸入「登入 <6位數字>」核准後前端輪詢取得 session，全程不離開 PWA 容器；僅限家庭成員使用 |
| PWA 主畫面 | 提供 manifest、standalone display、iOS web app meta 與 app icons，讓手機加入主畫面後更接近獨立 app |

---

## 系統架構

空調回饋的演算法、Sheet 欄位、失敗處理及 IR 無法讀回實體電源的限制，見[後端補償說明](https://github.com/CZLin-TW/home-butler/blob/main/docs/ac-temperature-feedback.md)。部署先更新後端，再更新 Dashboard；Apple Home 的半度調整需更新 Homebridge 插件至 1.2.0，保留既有配對。啟用時可「保存並立即評估」，保存後可隨時「立即評估」目前設定，符合條件才送 IR；仍遵守最短調整間隔等限制。Dashboard 以 0.5°C 調整；HomeKit 路徑也接受半度，但使用者實測 Apple Home 按鈕仍為 1°C，Siri 半度控制與畫面顯示正常。啟用回饋時保留半度舒適目標，IR 仍為整數；未啟用時由後端四捨五入（26.5→27），兩前端同步後端接受的目標。停用會把既有目標四捨五入，但保留上次 IR 溫度、不發指令，下一次手動送出才套用目標。

```
使用者（瀏覽器）
    ↓
Next.js（前端 + API Routes）
    ↓
home-butler（FastAPI 後端）
    ↓
Google Sheets / SwitchBot / Panasonic / 氣象署
```

家庭資料與設備操作主要轉交 home-butler。Dashboard 的 API Routes 同時負責登入配對、JWT Session、私人端點身分驗證與錯誤轉換；`/api/version` 在本地回應。劇院與 Hue 控制再由 home-butler 經 PC agent 轉送到區網。

### 首頁資料載入

- 生活摘要走 `/api/dashboard?include_weather=false`，後端只讀待辦／庫存兩張表，不等待天氣。天氣獨立查今天，今天無有效資料才查明天。
- 室內與除濕機摘要走 `/api/sensors/status?include_history=false`，保留 CO₂、當下讀值與上線狀態，`history` 為空陣列。
- 環境趨勢與除濕曲線展開後才掛載 `components/home/history-charts.tsx`；指定感測器名稱下載歷史，收合即移除定期更新。設備排程在展開控制面板後才讀取。
- 首頁定期更新統一使用 `useAutoRefresh`：背景分頁暫停，回到前景更新；歷史／摘要不追加雲端設備狀態專用的 5 秒補讀。裝置頁原有完整歷史查詢仍保留。
- 後端 query 預設維持舊版行為；部署先更新 home-butler，再更新 Dashboard。新參數不改變登入或設備控制權限。

Dashboard 也提供基本 PWA 設定：`/manifest.webmanifest`、192/512/maskable PNG icon、iOS `apple-mobile-web-app-capable` meta。目標是讓手機主畫面啟動時維持 standalone app 體驗。登入改用「裝置配對驗證碼」流程後，全程不再離開容器（不跳 Safari），正是為了解決 iOS PWA 加入主畫面後因 OAuth 外部跳轉被踢去系統瀏覽器、得重新加入主畫面的問題。

---

## 技術棧

| 技術 | 用途 |
|------|------|
| [Next.js](https://nextjs.org/) 16 | 全端框架（App Router） |
| [React](https://react.dev/) 19 | UI 渲染 |
| [TypeScript](https://www.typescriptlang.org/) 5 | 型別安全 |
| [Tailwind CSS](https://tailwindcss.com/) 4 | 樣式（含 `@theme` palette tokens） |
| [Motion](https://motion.dev/) | Spring 動畫（tile 點按、面板展開/收合） |
| [Lucide React](https://lucide.dev/) | 圖示（全站統一） |
| [Recharts](https://recharts.org/) | 折線圖（PC 監控的 24h CPU/GPU/RAM/溫度趨勢） |
| [jose](https://github.com/panva/jose) | JWT Session 管理 |

---

## 頁面說明

### 首頁 `/`

一頁式總覽，快速掌握家庭狀態：
- **環境摘要**：室外天氣與室內感測器並列，突出溫度、濕度與 CO₂；點擊室內數值可在下方展開全寬 24h 趨勢
- **裝置快捷**：釘選設備 tile 網格（手機 2 欄、桌機 4 欄），直接顯示狀態與主要數值，點擊展開控制面板；冷氣數值註明「上次設定」，一般紅外線遙控器不推測電源狀態
- **分層控制**：冷氣電源與溫度優先顯示，模式與風速可展開；除濕機濕度趨勢按需展開
- **今日待辦**：未來 5 天內 + 已過期的「自己 + 公開」項目（最多 5 筆），可勾選完成
- **食品到期提醒**：5 天內 + 已過期項目，全列出

### 設備 `/devices`

分為三段。**裝置控制排在最前面**：家電控制是這頁的主要用途，感測圖表與 PC 監控是輔助資訊，不該擋在它前面。

**裝置控制**（H1）
- 按房間分群顯示所有可控設備
- 空調：ON/OFF + 溫度 ±1°C（範圍由後端 options 定）+ 模式 + 風速 + 送出設定按鈕（dirty 才亮）
- 除濕機：
  - 手動：電源 toggle / 模式 / 目標濕度（操作後每秒輪詢單台雲端狀態，最多 30 秒）
  - 自動模式：toggle 啟用後 UI 自動把模式切到「連續除濕」(避開機體內部達標停機問題)，並依綁定感測器 + 持續時間 + 自訂門檻（45-65%）做條件式 ON/OFF；門檻是規則內部的判斷值、不下發給機器（避免 Panasonic 韌體把 mode flip 回「目標濕度」）
  - 啟用期間電源 / 模式 / 感測器鎖住；自動模式開關、監控時間與目標濕度可調整，設定送出期間再暫時鎖定；手動的「目標濕度」segment 隱藏（連續除濕模式下沒意義）
  - 規則 phase 為 armed_above / armed_below / sensor_lost_warning 時顯示倒數提示
- IR 設備：自訂按鈕面板
- 每個 panel 右上 PinButton 釘選到首頁（最多 4 個）

**環境感測**（H1）
- 感測器卡（grid，桌機 3 欄、手機 1 欄）
- 每張卡片標題 = sheet 裝置名稱
- 卡片頂部大字 readout（°C · % · ppm），CO2 sensor 多顯示 ppm 欄
- 24h chart：溫度（warm）+ 濕度（cool）+（可選）CO2（amber）三條獨立 panel 堆疊
- chart 背景疊該 sensor 位置對應的 AC on 區段色塊（看冷氣何時開）
- 右上 PinButton 釘選一個到首頁

**電腦**（H1）
- 列出所有最近有 heartbeat 的 PC（依 IP 排序，桌機 2 欄、手機 1 欄）
- 卡頭：IP + 在線指示燈（綠/灰）+ 「N 分鐘前回報」
- 當下值橫排：`CPU：型號  N% N°C` / `GPU：型號  N% N°C`（CPU 同色 fresh、GPU 同色 warm，跨兩張圖一致）
- 折線圖 1（使用率 %）：CPU / GPU / RAM 三條線
- 折線圖 2（溫度 °C）：CPU 溫 / GPU 溫
- 24h 範圍，X 軸從現在最近整點往前每 6 小時一個 tick；資料剛累積時圖會慢慢長滿
- 60 秒 auto-refetch（跟 agent push 節奏對齊）

### 待辦 `/todos`

- 永遠只顯示登入者的「自己負責 + 公開」項目（隱私）
- 列出時間排序，過期/今日 row 自動 highlight（warm-bg + 左邊 inset bar）
- 日期顯示帶相對描述：`2026-05-04 (明天)`、`2026-05-03 (過期 1 天)`等
- 新增（事項、日期、選用時間、私人/公開；有時間時可勾選燈光提醒並用下拉選擇照明區域）
- 週期任務（重複待辦）：新增表單可勾「重複（週期任務）」，選頻率「每天 / 每週（可多選星期）/ 每月（指定幾號）/ 間隔天（每隔 N 天）」+ 選填結束日期；模板存進「週期待辦模板」分頁，由 home-butler 依排程自動生成當次待辦（受後端 `RECURRING_TODO_ENABLED` 開關控制）
- 週期模板生成的當次待辦在列表以 🔁 標記；底部「週期提醒」Card 列出啟用中的模板，可永久停止整個週期（已生成的當次待辦不受影響）
- 修改（inline edit form：標題 / 日期 / 時間 / 類型 / 燈光提醒 / 提醒區域）
- 有燈光提醒的待辦在首頁卡片與待辦列表顯示燈泡 icon；實際到期呼吸燈由 home-butler 的 PC agent 執行
- 勾選完成（樂觀更新動畫，refetch 後一次消失，不閃爍）
- 唯讀項目（來自 Notion 等外部來源）顯示鎖頭，無法修改

### 庫存 `/food`

- 列出所有有效食品，按過期日排序
- 過期/今日 row 整列 warm-bg highlight；右側顯示「已過期 / 今天到期 / N 天後到期」
- 新增（品名、數量、單位、過期日）
- 修改（inline 三段式 edit：品名 / 過期日+數量+單位 / 儲存取消）
- 刪除（confirm dialog 確認）

### 照明 `/lighting`

- 透過 home-butler WebSocket 通道請家中 PC agent 向 Hue Bridge 讀取 rooms / zones / grouped_light（含各區當下 on/brightness、該區一般 scene / 全天 smart_scene、通知動作、可用燈效）
- **只列出房間 / 區域**（room / zone）；隱藏「全家」(bridge_home) 與沒掛在任何房間/區域的獨立燈群 (grouped_light)
- 每個區域一張卡片：
  - **顯示名稱**：輸入框 + 右側儲存鈕（只有改過才亮，Enter 也能存），寫回 Sheet「Hue 照明區域」
  - **場景**：Dropdown 列該區 Hue App 內已建立的一般場景與全天場景，選好後按「套用」；全天場景以 `· 全天` 標示
  - **通知**：Dropdown 列區域層級通知動作，固定提供 `呼吸燈`；若 Bridge 回傳 signaling 支援值也會列出
  - **效果**：Dropdown 列該區內燈具支援的 effect unique 結果；`*` 代表只有部分燈具支援，套用時只下發到支援的燈
  - **亮度**：slider + 數字輸入雙向綁定（1–100），拖曳放開 / 失焦或 Enter 才送；調亮度視為順便開燈
  - **電源**：On/Off Toggle 讀寫該區 grouped_light 的真實 on 狀態
  - **自動夜燈**：卡片底部獨立區塊——啟用開關、光感應器（SwitchBot Hub 2）、亮度門檻 1–20、觸發場景、開燈亮度、啟用時段（可跨午夜）。所有改動是草稿，按「儲存」才生效（啟用且當下在時段內，後端會立即評估一次）；底部顯示最近觸發事件（已自動開燈/關燈、時段結束關燈）
  - **偵測亮度鈕**（門檻列右側）：顯示系統當下可得的最新 lightLevel 與資料年齡——webhook 快取標「目前 X・N 分前」、status 雲端快取標「目前 X・雲端值」、該感應器不回報亮度則標「無亮度數值」。調門檻以這個數字為準（規則引擎看的就是同一份數據），SwitchBot APP 的直讀值官方雲端 API 拿不到，低亮度區間可能差 ±1~2 級
- 控制都走樂觀更新，失敗才背景重抓對齊真實狀態

### 登入 `/login`

- 裝置配對驗證碼登入：頁面顯示一組 6 位驗證碼，使用者在 LINE Bot 輸入「登入 <6位數字>」核准
- 前端每 3 秒輪詢 `/api/auth/device-poll`，核准後直接在此容器內發 session cookie，全程不離開 PWA（解決 iOS PWA 加主畫面後被踢去 Safari 的問題）
- 驗證碼 5 分鐘有效，過期可一鍵重新取得
- 自動驗證是否為家庭成員（身分取自「誰在 Bot 輸入驗證碼」），非成員顯示錯誤提示
- 已登入自動導向首頁

---

## API Routes

資料 routes 代理到 home-butler；認證 routes 管理配對與 Session，`/api/version` 回傳本專案版本。私人資料會先驗證 Session，再傳送可信的使用者身分。

### 認證

| 路徑 | 方法 | 說明 |
|------|------|------|
| /api/auth/device-code | POST | 裝置配對登入：proxy 到 home-butler `POST /api/auth/device/create`，回 `user_code`（6 位）+ `device_token` |
| /api/auth/device-poll | GET | 輪詢配對狀態（query `token`）：proxy 到 home-butler `GET /api/auth/device/status`，回 `approved` 時於此容器直接簽發 JWT Session（7 天效期）並寫入 `dashboard_session` cookie |
| /api/auth/me | GET | 取得當前登入使用者 |
| /api/auth/logout | POST | 登出，清除 Session |
| /api/auth/login | GET | （已淘汰、dormant）舊 LINE OAuth 授權導向，目前無前端引用 |
| /api/auth/callback | GET | （已淘汰、dormant）舊 OAuth 回調，目前無前端引用 |

### 資料

| 路徑 | 方法 | 說明 |
|------|------|------|
| /api/dashboard | GET | 首頁彙整（天氣、裝置、待辦、庫存，減少往返次數） |
| /api/devices | GET | 列出所有裝置基本資料（名稱、類型、位置、IR 按鈕、AC 上次指令快照），不含即時讀值 |
| /api/devices/status | GET | 統一裝置狀態快取（空調 last-command、感應器、除濕機），key 為裝置名稱 |
| /api/devices/options | GET | 裝置控制選項（空調模式/風速、除濕機模式/濕度）。回應是純常數，帶 `s-maxage=3600, stale-while-revalidate=3600` 讓 Vercel CDN 在邊緣回應——命中時連 Function 都不會被叫起來。只有成功回應加快取標頭 |
| /api/devices/control | POST | 控制裝置（空調/IR/除濕機）；除濕機自動模式啟用時拒收 |
| /api/sensors/status | GET | 所有感測器當下值 + 24h history（溫度 / 濕度 / CO2），proxy 到 home-butler in-memory ring buffer |
| /api/ac/status | GET | 所有空調當下狀態 + 24h history，給感測器 chart 背景畫 AC on 區段用 |
| /api/dehumidifier/auto-rule | GET / POST | 除濕機條件式自動規則的讀寫；等待選項為立即、5、10、15、20、25、30 分鐘，POST 設定 toggle ON 時後端會立即評估 sensor 當下值決定 fire ON/OFF |
| /api/lighting/areas | GET | 列出 Hue rooms / zones 對應的 grouped_light 區域，含 Dashboard 顯示名稱、各區當下 on/brightness、一般場景 / 全天場景、通知動作與可用燈效 |
| /api/lighting/areas/[id] | PATCH | 更新 Hue 區域顯示名稱 |
| /api/lighting/areas/[id]/state | PATCH | 控制該區 grouped_light 的電源 (on) 與亮度 (brightness)，經 home-butler → PC agent 下發 |
| /api/lighting/scenes/[id]/recall | POST | 套用 Hue App 內已建立的一般場景或全天場景 |
| /api/lighting/areas/[id]/notification | POST | 套用區域層級通知動作，例如 `alert:breathe` 呼吸燈 |
| /api/lighting/areas/[id]/effect | POST | 套用區域內支援的 Hue effect，部分支援時只套用支援的燈 |
| /api/lighting/breathe | POST | 對指定 Hue grouped_light 觸發 breathe（後端仍保留；照明頁使用較泛用的 notification route） |
| /api/lighting/auto/rules | GET | 自動夜燈：列出所有區域規則 + runtime state（時段旗標、最後亮度值與時間） |
| /api/lighting/auto/rules/[areaId] | PATCH / DELETE | 自動夜燈：設定該區域規則（光感應器、門檻、場景、開燈亮度、時段、啟用開關）/ 刪除規則 |
| /api/lighting/auto/sensors | GET | 自動夜燈：光感應器候選清單（home-butler「智能居家」啟用中的感應器） |
| /api/lighting/auto/sensors/[deviceId]/light-level | GET | 自動夜燈：感應器當下亮度（webhook 快取優先附 `age_seconds`，否則 status 雲端值） |
| /api/todos | GET | 列出登入者負責的私人待辦及公開項目 |
| /api/todos | POST | 新增待辦（含選用 `light_notify` / `light_area_id`，由 home-butler 寫入 `燈光提醒` 與 `燈光區域ID`） |
| /api/todos | PATCH | 依 `todo_id` 修改可操作的待辦（含選用 `light_notify` / `light_area_id`） |
| /api/todos | DELETE | 依 `todo_id` 完成可操作的待辦；Notion 項目保留完成記號 |
| /api/recurring-todos | GET | 列出登入者可見且啟用中的週期待辦模板（home-butler「週期待辦模板」分頁，附後端算好的「摘要」） |
| /api/recurring-todos | POST | 新增週期模板（`recur_type` 每天/每週/每月/間隔天 + `weekdays` / `month_day` / `interval_days` / `end_date` 等） |
| /api/recurring-todos | PATCH | 修改週期模板（`rule_id` 精準定位，或 `item` + `recur_type` 消歧） |
| /api/recurring-todos | DELETE | 停止整個週期（模板狀態 → 停用，以 `rule_id` 或 `item` 指定；已生成的當次待辦不受影響） |
| /api/food | GET | 列出食品庫存 |
| /api/food | POST | 新增食品 |
| /api/food | PATCH | 修改食品 |
| /api/food | DELETE | 刪除食品 |
| /api/schedules | GET | 預設列待執行；畫面傳 `include_attention=true` 加入失敗／待確認紀錄 |
| /api/schedules | POST | 新增排程 |
| /api/schedules | PATCH | 修改排程 |
| /api/schedules | DELETE | 取消待執行排程，或用 `execution_id` 移除需注意的紀錄；不撤回已送指令 |
| /api/weather | GET | 查詢天氣（參數：date, location） |
| /api/version | GET | 公開端點，回 `{version}`（給 home-butler runtime 撈使用者體感版本，proxy whitelist） |
| /api/computers/status | GET | PC 監控：proxy 到 home-butler in-memory ring buffer，回所有 PC 的 current snapshot + 24h raw history |

---

## 前端架構

分三層：**UI primitives** → **共用組合 component / hook** → **頁面**。

### UI primitives & 共用元件 (`components/ui/`)

| 檔案 | 說明 |
|------|------|
| card.tsx | 通用 Card 容器（圓角 18px、surface 底） |
| device-controls.tsx | 視覺 primitives：Toggle2 / Stepper / Segment / Field / PinButton / StatusLine / ClimateReadout / TabsPill / PillButton / IconActionButton + `PANEL_BASE` / `FIELD_LABEL` className |
| device-controller.tsx | `<DeviceController />` 整合 AC/DH/IR 完整控制邏輯（state + send + render fields），裝置頁跟首頁 device-quick-control 共用同一份；caller 只需提供 outer wrapper + 兩個 refetch callback |

### 頁面組合 (`components/home/`)

| 檔案 | 說明 |
|------|------|
| weather-card.tsx | 天氣總覽（用 ClimateReadout 顯示溫濕度，內含 `<WxIcon>` stable component） |
| indoor-sensor-card.tsx | 室內感測器即時值（用 ClimateReadout） |
| device-quick-control.tsx | 首頁釘選裝置 tile 網格 + 點擊展開 motion 動畫 panel（內部 compose `<DeviceController />` + `<ScheduleSection />`） |
| todo-list-card.tsx | 我的待辦（用 useCompleteTodo hook；燈光提醒項目顯示燈泡 icon） |
| food-alert-card.tsx | 即期食品 |

### 設備頁專用 (`components/devices/`)

| 檔案 | 說明 |
|------|------|
| lazy-charts.tsx | **所有 recharts 元件的唯一入口**：以 `next/dynamic({ ssr: false })` 包裝，把 391 KB 的圖表函式庫移出 `/` 與 `/devices` 的初始 chunk，家電控制不必等圖表載完才能互動。新增用到 recharts 的元件請一律加到這裡並從這裡 import |
| computer-card.tsx | PC 監控卡（IP + 在線指示燈 + CPU/GPU 當下值橫排；内部 useMemo transform raw history → chart shape，圖表本體在 computer-charts.tsx） |
| computer-charts.tsx | PC 卡的使用率 / 溫度兩張 Recharts 折線圖（從 computer-card 拆出來獨立成非同步 chunk） |
| sensor-chart.tsx | 感測器 24h 折線圖（溫度 / 濕度 / CO2 三層獨立 panel + AC on 區段背景） |
| auto-mode-chart.tsx | 除濕機自動模式專用：綁定 sensor 24h 濕度線 + 後端 API 提供的 hysteresis 上下界虛線 + 除濕機運轉中綠色背景區段 |
| schedule-section.tsx | 裝置卡內嵌的排程區段（lockedDevice 鎖在當前裝置）；inline 新增 / 編輯 / 刪除，共用 `src/lib/schedule.ts` 的 helpers |
| schedule-form.tsx | 排程新增 / 編輯共用表單，供裝置卡內嵌排程使用 |

### Layout (`components/layout/`)

| 檔案 | 說明 |
|------|------|
| desktop-nav.tsx | 桌面版頂部導覽列（含 LOGO + 版本號） |
| mobile-nav.tsx | 手機版底部導覽列 |
| mobile-header.tsx | 手機版頂部標題列 |
| user-selector.tsx | 使用者下拉選單（click-toggle，手機可用） |
| nav-items.ts | 導覽項目定義（路徑 + 中文標籤 + lucide icon） |

### Custom Hooks (`hooks/`)

| Hook | 說明 |
|------|------|
| use-user.ts | 取得當前使用者 Session、登出功能。**模組層共享 store（`useSyncExternalStore`）**：ScheduleSection 是每張裝置卡各一份，各自 fetch 的話裝置頁一掛載就會發出 N+1 個重複的 `/api/auth/me`，跟真正要用的裝置資料搶資源；現在整頁只打一次 |
| use-cached-fetch.ts | 使用者／URL 共用 query store；取消被替換的請求、保留上次成功資料及過時標記。快取版本用 `CACHE_SCHEMA`，私人生活資料只存記憶體。 |
| use-pinned-devices.ts | 管理釘選設備清單（localStorage 儲存），支援釘選感測器 / 釘選裝置 / 全部重置 |
| use-complete-todo.ts | 待辦勾選完成的樂觀更新邏輯（包含動畫 + refetch 同步避免閃爍），首頁 + todos 頁共用 |

### 工具函式 (`lib/`)

| 檔案 | 說明 |
|------|------|
| types.ts | 整套 domain 型別 + helper：DeviceData / DeviceOptions / AcPendingState / TodoData / FoodData / DehumidifierAutoRule / acPendingFromDevice / daysUntilExpiry / todoUrgency / todoLightNotify / foodUrgency / urgencyRowClass / relativeDateLabel / expiryLabel / DEVICE_ICONS |
| sensor.ts | 感測器歷史型別 + chart transform（unix sec → ms + 欄位重命名給 Recharts dataKey）；computeSensorDomains 算跨 sensor 共用 Y 範圍 |
| ac.ts | 空調 on/off 歷史型別 + segment transform（給 sensor-chart 背景畫 AC on 區段用） |
| dehumidifier.ts | 除濕機 on/off 歷史型別 + segment transform（給 auto-mode chart 背景畫運轉中綠色塊用） |
| schedule.ts | 排程共用：Schedule 型別、parseScheduleParams / toFormInitial / isPastTrigger / stableJson / createSchedule / updateSchedule / deleteSchedule（CRUD wrappers） |
| computer.ts | PC 監控相關型別 + helper：ComputerPC / ComputerHistoryRaw / toChartHistory（unix sec → ms + 欄位重命名給 Recharts dataKey）/ relativeFromHeartbeat |
| butler.ts | HTTP 客戶端（butlerGet / butlerPost / butlerPatch / butlerDelete），25 秒 timeout |
| jwt.ts | Session JWT 的 secret 解析 + 驗證，**edge-safe**（只用 jose，不碰 next/headers）：JWT_SECRET / verifyToken / assertCanIssueSession / SessionUser。secret 解析順序 `SESSION_JWT_SECRET ?? LINE_LOGIN_CHANNEL_SECRET ?? 'dev-secret'`，production 下兩個真 secret 都沒設時 fail-closed（verifyToken 回 null、assertCanIssueSession throw）。由 auth.ts(node) 與 proxy.ts(edge middleware) 共用，保證簽發與閘門驗簽用同一把金鑰 |
| auth.ts | node 端 Session 包裝：createSession / getSession / getSessionCookieOptions（簽發、讀 cookie、Cookie 設定）；secret 解析與驗證已移到 jwt.ts |
| utils.ts | 通用工具（cn 等） |

---

## 環境變數

| 變數名稱 | 說明 | 必要 |
|----------|------|------|
| HOME_BUTLER_URL | home-butler 後端網址（預設 `https://home-butler.onrender.com`） | 必要 |
| HOME_BUTLER_API_KEY | home-butler 認證金鑰，必須與 home-butler 那邊設定的 `HOME_BUTLER_API_KEY` 相同 | 必要 |
| LINE_LOGIN_CHANNEL_ID | LINE Login Channel ID（OAuth 流程已淘汰，目前程式未使用） | 選用 |
| LINE_LOGIN_CHANNEL_SECRET | LINE Login Channel Secret；登入改用驗證碼流程後，僅在未設 `SESSION_JWT_SECRET` 時作為 session JWT 的 fallback secret | 選用（建議改設 SESSION_JWT_SECRET） |
| SESSION_JWT_SECRET | 簽 / 驗 session JWT 用，建議 `openssl rand -hex 32` 產生。未設定時 fallback 到 `LINE_LOGIN_CHANNEL_SECRET`；**production 下兩者皆無時 fail-closed**——不再以公開的 `dev-secret` 簽發或驗證 session（`createSession` 會 throw、`verifyToken` 一律回 null）。建議獨立設定，與 LINE Channel Secret 分離 | 建議 |

> 登入已改用「裝置配對驗證碼」流程，不再需要 LINE Login OAuth 的 Callback URL；`LINE_LOGIN_CHANNEL_SECRET` 現在僅作為 session JWT 的 fallback secret。

---

## 建置與部署

### 本機開發

```bash
npm install
npm run dev
```

開啟 http://localhost:3000

### 建置

```bash
npm run build
npm run start
```

### 部署

本專案為標準 Next.js 應用，可部署到任何支援 Node.js 的平台：

1. 連結 GitHub repo
2. 設定環境變數（見上方）
3. Build Command：`npm run build`
4. Start Command：`npm run start`

---

## 登入設定（裝置配對驗證碼）

登入已改用「裝置配對驗證碼」流程，**不再需要設定 LINE Login OAuth 的 Callback URL**。舊的 `/api/auth/login`、`/api/auth/callback` 仍保留但 dormant（已無前端引用）。

- 設一組 `SESSION_JWT_SECRET`（`openssl rand -hex 32`）用來簽 / 驗 session JWT；未設時 fallback 到 `LINE_LOGIN_CHANNEL_SECRET`（見「環境變數」）
- 配對核准在 home-butler 的 LINE Bot 端進行：使用者在家庭管家 Bot 輸入「登入 <6 位驗證碼>」，由 webhook 的 user_id 決定登入身分（須為「家庭成員」分頁中狀態啟用者）
- 流程細節見 home-butler README 的「Dashboard 登入（裝置配對）」與 `/api/auth/device/*` 端點說明

---

## 設計特色

### Palette / Design tokens

「暖石白 × 深海藍」日間主題：頁面 `#F3F1EC`、卡片 `#FFFEFA`、控制底色 `#ECEAE4`，文字使用深灰綠。保留既有排版與控制尺寸，顏色透過 Tailwind 4 `@theme` 集中在 `globals.css`。

| Token | Hex | 語義 |
|---|---|---|
| `cool` | `#315B70` | 深海藍 — 主要操作、選取、連結、焦點 |
| `fresh` | `#47745D` | 植物綠 — ON、運轉、已完成 |
| `warm` | `#AC4943` | 磚紅 — 失敗、刪除、已過期；OFF 使用中性灰 |
| `amber` | `#855E18` | 琥珀 — 送出中、等待、即期提醒 |
| `pin` | 同 `cool` | 釘選沿用主色，以淺底與圖示區分 |
| `chart-temperature` | `#A75F40` | 陶土 — 環境溫度；PC 圖表 GPU 序列 |
| `chart-humidity` | `#315B70` | 深海藍 — 濕度與目標曲線；PC 圖表 CPU 序列 |
| `chart-co2` | `#855E18` | 赭黃 — CO₂；PC 圖表 RAM 序列 |

每個 accent 都搭一個 `*-bg` 淺底色（cool-bg / fresh-bg / warm-bg / amber-bg / pin-bg）給 pill / row highlight 用。

新增元件時依語意使用 token，不以設備種類分配警示色、不另用 Tailwind 預設亮黃／亮紅。圖表序列不借用錯誤色，數值維持深色，狀態同時提供文字／圖示。PWA 的 manifest 與瀏覽器主題色同步頁面底色。

### Pill 系統

幾乎所有按鈕都是 `rounded-full`，少數場景用 `rounded-[10px]/[12px]/[14px]`：

- Toggle2 / Segment：內按鈕高 32px、整組高 38px，並提供選取狀態與鍵盤焦點
- Dropdown：跨裝置統一高 38px、字級 16px、自訂箭頭與外觀；保留原生選項挑選器。監控感測器與目標濕度等寬
- 主動作 button (新增 / 確認新增 / 送出設定)：`rounded-full`
- 列表 row：`rounded-[12px]`
- 表單 input：`rounded-[10px]`
- Card：`rounded-[24px]`，細邊框與輕陰影
- Panel：`rounded-[22px]`

### Tile 視覺

首頁裝置 tile 以設備名稱、主要數值、輔助說明分層排列。展開時使用 `cool` 外框；`fresh` 表示運轉，灰色表示關閉或未知，並搭配文字區分。減少動態效果偏好會停用轉場。

### 過期 highlight

待辦 / 庫存 list row 跟首頁兩張卡，依 urgency 自動上樣式：

- **overdue**：`bg-warm-bg/70 + inset 3px warm bar + font-semibold`（最強警示）
- **today**：`bg-amber-bg/60 + inset 3px amber bar`（即期提醒）
- **normal**：維持原樣

inset shadow 不破 row 的 `rounded-[12px]`。

### 響應式

桌機保留 `desktop-nav` 頂部 + 寬版 grid；手機 `mobile-nav` 底部 + 縮 1 欄。觸控友善的按鈕尺寸（最小 26×26）。

### 互動細節

- **iOS 風 spring**：tile 點按 scale 0.95 + spring 回彈；展開/收合 ease curve（為避免 CSS Grid `gap` 在 unmount 瞬間造成 snap，panel 刻意渲染在 grid 外）
- **icon 全 lucide**：所有 emoji 換成 SVG（含天氣、設備、狀態指示燈），strokeWidth 統一
- **操作回饋**：待辦完成等操作保留樂觀動畫；劇院開關採儲存鎖與完成後回讀，不預先宣稱已成功。空調、除濕機各自有命令確認流程。
- **快取與隱私**：使用者／URL 共用 query store，快取格式使用獨立 `CACHE_SCHEMA`，不隨 `APP_VERSION` 清除。待辦、週期規則及含待辦的 dashboard 只存記憶體；其餘可存 localStorage，demo 改用 sessionStorage。失敗／過時有提示；登出與身分失效清除快取。
- **統一裝置狀態同步**：首頁與裝置頁每 60 秒刷新 `/api/devices/status`，PWA 或分頁回到前景時立即刷新並在 5 秒後補抓背景更新結果；後端先回 in-memory cache，再以 single-flight 背景更新雲端裝置
- **空調命令確認**：IR 沒法回讀，POST 後輪詢 `/api/devices/status?name=...` 10 秒等 home-butler 的 last-command cache 到位，以 POST 回傳 state.lastTemperature 為接受目標，匹配才清 pending、解鎖 UI（避免 B→A→B 閃爍 + 期間 disable 防連發 race）
- **除濕機狀態輪詢**：手動操作後每秒輪詢單一設備、最多 30 秒，匹配雲端真實狀態後才解鎖 UI；自動模式 ON/OFF 後立即刷新統一裝置狀態

### Pending / dirty 邏輯（空調）

「送出設定」按鈕呈主要操作色（dirty）的條件 = pending 跟 device 的 last\* 任一欄位不同（power/temperature/mode/fan_speed 純值比對）。送出後輪詢匹配成功才清 pending、回到「未變更」。A→B→A 改回原值會自動回到「未變更」。

---

## 與 home-butler 的關係

v1.43.1 僅同步系統版本與文件：Homebridge 插件 1.3.0 加入預設關閉的「半度測試空調」，用新配件排查 Apple Home 步幅，無真實家電操作。Dashboard 控制行為沿用 v1.43.0；[診斷操作](https://github.com/CZLin-TW/home-butler/blob/main/homebridge/README.md#半度步幅診斷插件-130)。

Dashboard 是 home-butler 的**視覺化前端**，兩者共用同一套後端 API：

- **LINE Bot**（home-butler）：自然語言介面，適合口語化操作（「開冷氣 24 度」「牛奶快沒了」）
- **Dashboard**（本專案）：圖形化介面，適合瀏覽總覽和精確控制（滑桿調溫度、表格管庫存）

兩者經 home-butler 操作同一份 Google Sheets 資料。待辦寫入以單程序共用鎖協調；多實例及直接手動改表不在鎖的保障範圍。

**裝置配對登入**：Dashboard 不再走 LINE OAuth 外部跳轉，改成在登入頁顯示 6 位驗證碼，由使用者在 LINE Bot 輸入「登入 <6位數字>」核准；身分（lineUserId / name / picture）取自在 Bot 輸入碼的那個 LINE 帳號。home-butler 端提供 `POST /api/auth/device/create` 與 `GET /api/auth/device/status`，Dashboard 以 `/api/auth/device-code`、`/api/auth/device-poll` BFF 代理，核准後在容器內直接發 session，全程不離開 PWA。

**版本同步**：Dashboard 的 `package.json:version` 是整個系統的使用者體感版本 source of truth。Dashboard 會在 build-time 注入 `APP_VERSION`，home-butler 則在 runtime 透過 Dashboard 的 `/api/version` 公開端點抓取版本並快取 1 小時；版本 bump 只需要改 Dashboard，不需要同步修改 home-butler。

## v1.37.0 資料與私人待辦

- `useCachedFetch` 透過 `query-store.ts` 共用同一使用者／URL 的讀取與狀態；替換請求會取消前次，過期結果不能覆蓋新資料。失敗保留上次成功資料與時間，頁面上方顯示重試提示；首次失败不記成成功空資料。
- 快取按 LINE ID 與獨立 CACHE_SCHEMA 分區。待辦、週期規則及含待辦的 dashboard 只存記憶體。登出、跨分頁登出與私人端點 401／403 會清除身分和資料；舊版未分帳號快取會移除。其他資料可保存供快速顯示，過期時標示並可重試。
- 私人 routes 使用 `request-user.ts` 驗證 session，再由 butler helpers 加 `X-Dashboard-User`；不要直接轉送瀏覽器提供的同名 header，也不要把姓名前綴當授權。建立 Request 包裝只複製 URL／headers，不能消耗原始 mutation body。
- 待辦修改／完成傳後端「待辦ID」，同名事項不能靠畫面 index 選取。新增 schema 請同步 demo fixtures／simulator。部署順序先 home-butler 再 Dashboard；回復時先退 Dashboard。
- `npm run test:demo` 現在執行 tests 目錄所有測試，含 query store 並行、失敗、登出隔離及真實 route 的 JWT 邊界測試（後端呼叫為 fake）。

## 劇院整合與維護入口

- `GET /api/theater/summary`、`POST /api/theater/flags`：代理到 home-butler，沿 PC agent 的 `theater` capability 到達劇院服務。
- `health` 與设备 `stale`／`updated_at` 為可選欄位，相容舊版 theater-agent；API 在線、Apple TV 程序有心跳和設備可讀是不同判斷。
- KEF 事件訂閱及 15 秒補漏在 theater-agent 內執行，不依賴 Dashboard 開著，也不是瀏覽器直接接喇叭 push。
- 三個 repo 的責任、部署與回復順序：[系統導覽](https://github.com/CZLin-TW/home-butler/blob/main/docs/system-overview.md)。
- 測試方式與已驗證範圍：[驗證紀錄](docs/verification.md)；新 session 先讀 [AGENTS.md](AGENTS.md) 與 [demo 說明](docs/demo-mode.md)。
