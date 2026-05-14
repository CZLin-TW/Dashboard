# Smart Home Dashboard

家庭智慧中控面板，[家庭 AI 管家系統](https://github.com/CZLin-TW/home-butler)的網頁版操作介面。使用 Next.js + TypeScript + Tailwind CSS 建置。

本專案 100% 由 Claude AI 協作完成，包含架構設計、所有程式碼、文件撰寫。

核心理念：
- **視覺化操作**：LINE Bot 用自然語言，Dashboard 用按鈕和表格，兩者互補
- **即時控制**：家電開關、溫度調整、排程設定，一鍵完成
- **行動優先**：響應式設計，手機和桌機都好用
- **零後端**：所有 API 代理到 home-butler，Dashboard 本身只做 UI 層

### 功能一覽

| 功能 | 說明 |
|------|------|
| 首頁總覽 | 天氣、室內溫濕度、釘選設備快速控制、未來 5 天 / 已過期的待辦與食品 |
| 設備控制 | 空調（電源/溫度/模式/風速 + 送出後輪詢確認）、除濕機（模式/濕度 + 條件式自動模式 toggle）、IR 設備（自訂按鈕）；環境感測器（溫度/濕度即時值，含 SwitchBot Meter Pro CO2 三合一） |
| 設備釘選 | 常用設備（最多 4 個）+ 一個感測器釘選到首頁，快速存取 |
| 待辦事項 | 新增、修改、完成、查看；隱私邏輯只顯示「自己負責 + 公開」項目；過期/今日提醒 highlight |
| 庫存 | 食品的新增、修改、刪除；過期/今日項目整 row 警示底色 |
| 排程管理 | 新增、查看、預覽、刪除設備定時排程（編輯功能等後端 PATCH route 上線） |
| PC 監控 | 家中 PC 跑 agent 推指標到後端，Dashboard 顯示當下值（CPU/GPU 用量+溫度）+ 24h 折線圖（CPU/GPU/RAM 用量、CPU/GPU 溫度） |
| LINE 登入 | LINE OAuth 2.1 認證，僅限家庭成員使用 |

---

## 系統架構

```
使用者（瀏覽器）
    ↓
Next.js（前端 + API Routes）
    ↓
home-butler（FastAPI 後端）
    ↓
Google Sheets / SwitchBot / Panasonic / 氣象署
```

Dashboard 本身不做業務邏輯，所有 API Routes 都是代理層，轉發到 home-butler 後端處理。

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
- **天氣**：今日/明日天氣預報（溫濕度排版跟感測器卡一致）
- **室內感測器**：使用者釘選的感測器即時溫度/濕度
- **裝置快捷**：釘選設備 tile 網格（手機 2 欄、桌機 4 欄），點擊展開 inline 控制面板
- **今日待辦**：未來 5 天內 + 已過期的「自己 + 公開」項目（最多 5 筆），可勾選完成
- **食品到期提醒**：5 天內 + 已過期項目，全列出

### 設備 `/devices`

分為三段：

**環境感測**（H1）
- 感測器卡（grid，桌機 3 欄、手機 1 欄）
- 每張卡片標題 = sheet 裝置名稱
- 卡片頂部大字 readout（°C · % · ppm），CO2 sensor 多顯示 ppm 欄
- 24h chart：溫度（warm）+ 濕度（cool）+（可選）CO2（amber）三條獨立 panel 堆疊
- chart 背景疊該 sensor 位置對應的 AC on 區段色塊（看冷氣何時開）
- 右上 PinButton 釘選一個到首頁

**裝置控制**（H1）
- 按房間分群顯示所有可控設備
- 空調：ON/OFF + 溫度 ±1°C（範圍由後端 options 定）+ 模式 + 風速 + 送出設定按鈕（dirty 才亮）
- 除濕機：
  - 手動：電源 toggle / 模式 / 目標濕度（操作後 10 秒輪詢雲端真實狀態確認）
  - 自動模式：toggle 啟用後 UI 自動把模式切到「連續除濕」(避開機體內部達標停機問題)，並依綁定感測器 + 持續時間 + 目標濕度當門檻做條件式 ON/OFF
  - 啟用期間電源 / 模式 / 目標濕度 / 感測器 / 監控時間全部鎖住灰化（faint 色，只有自動模式 toggle 可操作）
  - 規則 phase 為 armed_above / armed_below / sensor_lost_warning 時顯示倒數提示
- IR 設備：自訂按鈕面板
- 每個 panel 右上 PinButton 釘選到首頁（最多 4 個）

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
- 新增（事項、日期、選用時間、私人/公開）
- 修改（inline edit form：標題 / 日期 / 時間 / 類型）
- 勾選完成（樂觀更新動畫，refetch 後一次消失，不閃爍）
- 唯讀項目（來自 Notion 等外部來源）顯示鎖頭，無法修改

### 庫存 `/food`

- 列出所有有效食品，按過期日排序
- 過期/今日 row 整列 warm-bg highlight；右側顯示「已過期 / 今天到期 / N 天後到期」
- 新增（品名、數量、單位、過期日）
- 修改（inline 三段式 edit：品名 / 過期日+數量+單位 / 儲存取消）
- 刪除（confirm dialog 確認）

### 排程 `/schedules`

- 列出所有待執行排程，按觸發時間排序
- 點 Eye 按鈕展開預覽：跟新增排程同樣 layout 但全 disabled，顯示該排程會做什麼動作（含日期/時間）
- 預覽底部標示「目前僅支援預覽，編輯功能等後端 PATCH route 上線」
- 新增排程（選裝置 → 設定目標狀態 → 設定觸發時間）
- 刪除排程

### 登入 `/login`

- LINE OAuth 2.1 登入
- 自動驗證是否為家庭成員
- 非成員顯示錯誤提示
- 已登入自動導向首頁

---

## API Routes

所有 API Routes 代理到 home-butler 後端，Dashboard 不直接操作資料。

### 認證

| 路徑 | 方法 | 說明 |
|------|------|------|
| /api/auth/login | GET | 導向 LINE OAuth 授權頁面 |
| /api/auth/callback | GET | OAuth 回調，建立 JWT Session（7 天效期） |
| /api/auth/me | GET | 取得當前登入使用者 |
| /api/auth/logout | POST | 登出，清除 Session |

### 資料

| 路徑 | 方法 | 說明 |
|------|------|------|
| /api/dashboard | GET | 首頁彙整（天氣、裝置、待辦、庫存，減少往返次數） |
| /api/devices | GET | 列出所有裝置基本資料（名稱、類型、位置、IR 按鈕、AC 上次指令快照），不含即時讀值 |
| /api/devices/status | GET | 裝置即時讀值（感應器溫濕度、除濕機目前狀態），key 為裝置名稱 |
| /api/devices/options | GET | 裝置控制選項（空調模式/風速、除濕機模式/濕度） |
| /api/devices/control | POST | 控制裝置（空調/IR/除濕機）；除濕機自動模式啟用時拒收 |
| /api/sensors/status | GET | 所有感測器當下值 + 24h history（溫度 / 濕度 / CO2），proxy 到 home-butler in-memory ring buffer |
| /api/ac/status | GET | 所有空調當下狀態 + 24h history，給感測器 chart 背景畫 AC on 區段用 |
| /api/dehumidifier/auto-rule | GET / POST | 除濕機條件式自動規則的讀寫；POST 設定 toggle ON 時後端會立即評估 sensor 當下值決定 fire ON/OFF |
| /api/todos | GET | 列出所有待辦事項 |
| /api/todos | POST | 新增待辦 |
| /api/todos | PATCH | 修改待辦 |
| /api/todos | DELETE | 完成（刪除）待辦 |
| /api/food | GET | 列出食品庫存 |
| /api/food | POST | 新增食品 |
| /api/food | PATCH | 修改食品 |
| /api/food | DELETE | 刪除食品 |
| /api/schedules | GET | 列出排程 |
| /api/schedules | POST | 新增排程 |
| /api/schedules | DELETE | 刪除排程 |
| /api/weather | GET | 查詢天氣（參數：date, location） |
| /api/version | GET | 公開端點，回 `{version}`（給 home-butler runtime 撈使用者體感版本，middleware whitelist） |
| /api/computers/status | GET | PC 監控：proxy 到 home-butler in-memory ring buffer，回所有 PC 的 current snapshot + 24h raw history |

> 排程 PATCH（編輯）尚未實作，frontend 已備好預覽 UI scaffold，等 home-butler 後端 PATCH route 上線後接上即可改成可編輯。

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
| device-quick-control.tsx | 首頁釘選裝置 tile 網格 + 點擊展開 motion 動畫 panel（內部 compose `<DeviceController />`） |
| todo-list-card.tsx | 我的待辦（用 useCompleteTodo hook） |
| food-alert-card.tsx | 即期食品 |

### 設備頁專用 (`components/devices/`)

| 檔案 | 說明 |
|------|------|
| computer-card.tsx | PC 監控卡（IP + 在線指示燈 + CPU/GPU 當下值橫排 + 兩張 Recharts 折線圖；内部 useMemo transform raw history → chart shape） |

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
| use-user.ts | 取得當前使用者 Session、登出功能 |
| use-cached-fetch.ts | 帶 localStorage 快取的 fetch（先顯示快取，背景更新最新資料；APP_VERSION 變更會自動失效） |
| use-pinned-devices.ts | 管理釘選設備清單（localStorage 儲存），支援釘選感測器 / 釘選裝置 / 全部重置 |
| use-complete-todo.ts | 待辦勾選完成的樂觀更新邏輯（包含動畫 + refetch 同步避免閃爍），首頁 + todos 頁共用 |

### 工具函式 (`lib/`)

| 檔案 | 說明 |
|------|------|
| types.ts | 整套 domain 型別 + helper：DeviceData / DeviceOptions / AcPendingState / TodoData / FoodData / acPendingFromDevice / daysUntilExpiry / todoUrgency / foodUrgency / urgencyRowClass / relativeDateLabel / expiryLabel / DEVICE_ICONS |
| computer.ts | PC 監控相關型別 + helper：ComputerPC / ComputerHistoryRaw / toChartHistory（unix sec → ms + 欄位重命名給 Recharts dataKey）/ relativeFromHeartbeat |
| butler.ts | HTTP 客戶端（butlerGet / butlerPost / butlerPatch / butlerDelete），25 秒 timeout |
| auth.ts | JWT Session 管理（建立、讀取、Cookie 設定） |
| utils.ts | 通用工具（cn 等） |

---

## 環境變數

| 變數名稱 | 說明 | 必要 |
|----------|------|------|
| HOME_BUTLER_URL | home-butler 後端網址（預設 `https://home-butler.onrender.com`） | 必要 |
| HOME_BUTLER_API_KEY | home-butler 認證金鑰，必須與 home-butler 那邊設定的 `HOME_BUTLER_API_KEY` 相同 | 必要 |
| LINE_LOGIN_CHANNEL_ID | LINE Login Channel ID | 必要 |
| LINE_LOGIN_CHANNEL_SECRET | LINE Login Channel Secret | 必要 |
| SESSION_JWT_SECRET | 簽 session JWT 用，建議 `openssl rand -hex 32` 產生。**未設定時 fallback 到 LINE_LOGIN_CHANNEL_SECRET**，但會把 OAuth secret 跟 session secret 綁在一起（其中一個輪替就會踩到另一個），不建議長期混用 | 建議 |

> LINE Login 與 LINE Messaging API 是不同的 Channel，需要分別在 LINE Developers Console 建立。

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

## LINE Login 設定

1. 前往 [LINE Developers Console](https://developers.line.biz/)
2. 在同一個 Provider 下建立新的 **LINE Login** Channel（不是 Messaging API）
3. 設定 Callback URL：`https://你的網域/api/auth/callback`
4. 記下 Channel ID 和 Channel Secret，填入環境變數

---

## 設計特色

### Palette / Design tokens

低飽和 light theme，所有色號透過 Tailwind 4 `@theme` 集中在 `globals.css`，整體換色只改一處：

| Token | Hex | 語義 |
|---|---|---|
| `cool` | `#3A6289` | 深藍 — Segment active / link / scroll-target ring / 「被選中」一致語意 |
| `fresh` | `#3C977D` | 鼠尾草 — ON / 運轉中 / primary action / 完成 |
| `warm` | `#DF766E` | 珊瑚 — OFF / IR 型別 / destructive / 過期警示 |
| `amber` | `#B88324` | 琥珀 — pending / 待執行 |
| `pin` | `#7B6BA8` | 柔和紫 — 釘選狀態獨立色，跟 cool/fresh/warm/amber 都不重疊 |

每個 accent 都搭一個 `*-bg` 淺底色（cool-bg / fresh-bg / warm-bg / amber-bg / pin-bg）給 pill / row highlight 用。

### Pill 系統

幾乎所有按鈕都是 `rounded-full`，少數場景用 `rounded-[10px]/[12px]/[14px]`：

- Toggle2 / Segment：外框 `rounded-[19px]`、內按鈕 `rounded-full`，padding 設計成同心圓弧
- 主動作 button (新增 / 確認新增 / 送出設定)：`rounded-full`
- 列表 row：`rounded-[12px]`
- 表單 input：`rounded-[10px]`
- Card：`rounded-[18px]`
- Panel：`rounded-[14px]`

### Tile 視覺

首頁裝置 tile 採 flat 風格（白底 + border + 細微 shadow），active 統一 `cool` 色（不依 device type 換色 — type 由 icon 形狀辨識，避免跟 OFF/ON 的 warm/fresh 語意混淆）。

### 過期 highlight

待辦 / 庫存 list row 跟首頁兩張卡，依 urgency 自動上樣式：

- **overdue**：`bg-warm-bg/70 + inset 3px warm bar + font-semibold`（最強警示）
- **today**：`bg-warm-bg/30 + inset 3px warm bar`（次強）
- **normal**：維持原樣

inset shadow 不破 row 的 `rounded-[12px]`。

### 響應式

桌機保留 `desktop-nav` 頂部 + 寬版 grid；手機 `mobile-nav` 底部 + 縮 1 欄。觸控友善的按鈕尺寸（最小 26×26）。

### 互動細節

- **iOS 風 spring**：tile 點按 scale 0.95 + spring 回彈；展開/收合 ease curve（為避免 CSS Grid `gap` 在 unmount 瞬間造成 snap，panel 刻意渲染在 grid 外）
- **icon 全 lucide**：所有 emoji 換成 SVG（含天氣、設備、狀態指示燈），strokeWidth 統一
- **樂觀更新**：操作後立即顯示視覺回饋，refetch 完成後同一輪 React batch 一起 render（避免動畫結束→項目消失之間的閃爍）
- **快取優先**：localStorage 快取 API 回應，先顯示舊資料再背景靜默更新；cache key 含 APP_VERSION 避免 schema drift
- **空調命令確認**：IR 沒法回讀，POST 後輪詢 `/api/dashboard` 10 秒等 home-butler 寫回 last 狀態，匹配才清 pending、解鎖 UI（避免 B→A→B 閃爍 + 期間 disable 防連發 race）
- **除濕機狀態輪詢**：操作後每 10 秒輪詢雲端真實狀態，確認設備回應

### Pending / dirty 邏輯（空調）

「送出設定」按鈕亮綠（dirty）的條件 = pending 跟 device 的 last\* 任一欄位不同（power/temperature/mode/fan_speed 純值比對）。送出後輪詢匹配成功才清 pending、回到「未變更」。A→B→A 改回原值會自動回到「未變更」。

---

## 與 home-butler 的關係

Dashboard 是 home-butler 的**視覺化前端**，兩者共用同一套後端 API：

- **LINE Bot**（home-butler）：自然語言介面，適合口語化操作（「開冷氣 24 度」「牛奶快沒了」）
- **Dashboard**（本專案）：圖形化介面，適合瀏覽總覽和精確控制（滑桿調溫度、表格管庫存）

兩者操作同一份 Google Sheets 資料，互不衝突。

**版本同步**：`package.json:version` 跟 home-butler 的 `config.py:APP_VERSION` 必須維持一致，因為 LINE Bot 跟 Dashboard header 都會顯示版本，不同步會混淆使用者。
