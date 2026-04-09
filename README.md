# Smart Home Dashboard

家庭智慧中控面板，[家庭 AI 管家系統](https://github.com/czlin-tw/home-butler)的網頁版操作介面。使用 Next.js + TypeScript + Tailwind CSS 建置。

本專案 100% 由 Claude AI 協作完成，包含架構設計、所有程式碼、文件撰寫。

核心理念：
- **視覺化操作**：LINE Bot 用自然語言，Dashboard 用按鈕和表格，兩者互補
- **即時控制**：家電開關、溫度調整、排程設定，一鍵完成
- **行動優先**：響應式設計，手機和桌機都好用
- **零後端**：所有 API 代理到 home-butler，Dashboard 本身只做 UI 層

### 功能一覽

| 功能 | 說明 |
|------|------|
| 首頁總覽 | 天氣、室內溫濕度、釘選設備快速控制、今日待辦、即將過期食品 |
| 設備控制 | 空調（電源/溫度/模式/風速，顯示最後設定狀態）、除濕機（模式/濕度）、IR 設備（自訂按鈕） |
| 設備釘選 | 常用設備釘選到首頁，快速存取 |
| 待辦事項 | 新增、修改、完成、查看待辦，支援日期/時間/負責人/公開私人 |
| 食品庫存 | 新增、修改、消耗食品，顯示過期倒數 |
| 排程管理 | 新增、查看、取消設備定時排程 |
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
| [Tailwind CSS](https://tailwindcss.com/) 4 | 樣式 |
| [Lucide React](https://lucide.dev/) | 圖示 |
| [jose](https://github.com/panva/jose) | JWT Session 管理 |

---

## 頁面說明

### 首頁 `/`

一頁式總覽，快速掌握家庭狀態：
- **天氣**：今日/明日天氣預報
- **室內感測器**：即時溫度與濕度
- **釘選設備**：常用家電快速控制（展開可調整詳細參數）
- **今日待辦**：篩選當前使用者負責的待辦
- **食品到期提醒**：3 天內即將過期的食品

### 設備 `/devices`

完整設備管理介面：
- 空調：電源開關、溫度 ±1°C 調整（16~30°C）、模式切換、風速調整
- 除濕機：電源開關、模式切換、目標濕度調整（狀態每 10 秒輪詢更新）
- IR 設備：自訂按鈕面板（電源、風速、擺頭等）
- 感測器：溫度/濕度即時顯示
- 釘選/取消釘選設備到首頁

### 待辦事項 `/todos`

- 查看所有待辦（含外部行事曆同步項目）
- 新增待辦（事項、日期、時間、負責人、公開/私人）
- 修改待辦內容
- 勾選完成（動畫回饋）
- 唯讀項目（來自 Notion）顯示標記，無法修改

### 食品庫存 `/food`

- 查看所有有效食品及過期日
- 新增食品（品名、數量、單位、過期日）
- 修改食品資訊
- 標記消耗

### 排程 `/schedules`

- 查看所有待執行排程
- 新增設備定時排程
- 取消排程

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
| /api/devices | GET | 列出所有裝置及即時狀態 |
| /api/devices/options | GET | 裝置控制選項（空調模式/風速、除濕機模式/濕度） |
| /api/devices/control | POST | 控制裝置（空調/IR/除濕機） |
| /api/todos | GET | 列出所有待辦事項 |
| /api/todos | POST | 新增待辦 |
| /api/todos | PATCH | 修改待辦 |
| /api/todos | DELETE | 完成（刪除）待辦 |
| /api/food | GET | 列出食品庫存 |
| /api/food | POST | 新增食品 |
| /api/food | PATCH | 修改食品 |
| /api/food | DELETE | 消耗食品 |
| /api/schedules | GET | 列出排程 |
| /api/schedules | POST | 新增排程 |
| /api/schedules | DELETE | 取消排程 |
| /api/weather | GET | 查詢天氣（參數：date, location） |

---

## 前端架構

### 元件

| 路徑 | 說明 |
|------|------|
| components/ui/card.tsx | 通用 Card 元件 |
| components/layout/desktop-nav.tsx | 桌面版側邊導覽列 |
| components/layout/mobile-nav.tsx | 手機版底部導覽列 |
| components/layout/mobile-header.tsx | 手機版頂部標題列 |
| components/layout/user-selector.tsx | 使用者切換下拉選單 |
| components/layout/user-picker-modal.tsx | 使用者選擇彈窗 |
| components/layout/nav-items.ts | 導覽項目定義 |

### Custom Hooks

| Hook | 說明 |
|------|------|
| use-user.ts | 取得當前使用者 Session、登出功能 |
| use-cached-fetch.ts | 帶 sessionStorage 快取的 fetch（先顯示快取，背景更新最新資料） |
| use-pinned-devices.ts | 管理釘選設備清單（localStorage 儲存） |

### 工具函式

| 檔案 | 說明 |
|------|------|
| lib/butler.ts | HTTP 客戶端（butlerGet / butlerPost / butlerPatch / butlerDelete），25 秒 timeout |
| lib/auth.ts | JWT Session 管理（建立、讀取、Cookie 設定） |
| lib/utils.ts | 通用工具（cn 等） |

---

## 環境變數

| 變數名稱 | 說明 | 必要 |
|----------|------|------|
| HOME_BUTLER_URL | home-butler 後端網址（預設 `https://home-butler.onrender.com`） | 必要 |
| HOME_BUTLER_API_KEY | home-butler 認證金鑰，必須與 home-butler 那邊設定的 `HOME_BUTLER_API_KEY` 相同 | 必要 |
| LINE_LOGIN_CHANNEL_ID | LINE Login Channel ID | 必要 |
| LINE_LOGIN_CHANNEL_SECRET | LINE Login Channel Secret | 必要 |

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

- **深色主題**：gray-950 底色，低對比護眼
- **響應式設計**：手機 2 欄、桌面 4 欄 grid，觸控友善的按鈕尺寸
- **樂觀更新**：操作後立即顯示視覺回饋（動畫、狀態變化），不等 API 回應
- **快取優先**：sessionStorage 快取 API 回應，先顯示舊資料，背景靜默更新
- **除濕機狀態輪詢**：操作後每 10 秒輪詢實際狀態，確認設備回應

---

## 與 home-butler 的關係

Dashboard 是 home-butler 的**視覺化前端**，兩者共用同一套後端 API：

- **LINE Bot**（home-butler）：自然語言介面，適合口語化操作（「開冷氣 24 度」「牛奶快沒了」）
- **Dashboard**（本專案）：圖形化介面，適合瀏覽總覽和精確控制（滑桿調溫度、表格管庫存）

兩者操作同一份 Google Sheets 資料，互不衝突。
