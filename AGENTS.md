# v1.56.0 HB 空調自動關機恢復

使用者要求恢復 Dashboard 自動關機，沿用智能居家「自動關機小時數」整數欄位；0／空白停用。
HA 空調的執行者是 HB，不建立 HA 自動化；每 60 秒觀察 HA 已知電源，初次接手已開機從觀察時計時。
HA／Apple Home 開機同樣涵蓋，但無法偵測離線或兩次檢查間完整發生的短暫關開；不可聲稱精確開機事件時間。
調溫／模式不重置；更改時數會從下次可用觀察重新計時（在線保存即評估），相同時數保存不重置。
來源「自動（HA）」的排程列同時保存本次計時狀態，執行後仍保留至確認關機／設定改變，避免重啟或未知結果重送。
不可封存／刪除／改寫仍有效的 cycle；手動 pending／未知／失敗 off 優先，解除優先後保留原截止時間。
原防黴、回饋與舊來源「自動」排程仍不對 HA 空調執行。非 HA 空調沿用原控制端與 timer。
新 /api/ac/auto-off 只有完整 Dashboard 身分可用；重用既有 Sheets 欄位、不加入 HA 權限、不需更新 HA 組件。
具體語意、部署及復原見 docs/ac-auto-off.md（後端 repo）。部署先後端再 Dashboard。

# v1.55.0 HA 空調手動排程與控制樣式

Dashboard 空調可新增／修改／取消指定日期時間的一次性排程，由 HB 每 60 秒檢查、經 HA 控制。
新建或明確編輯的 HA 手動排程使用來源「使用者（HA）」；舊列不自動升級，自動／防黴列不能轉換。
執行時重驗來源與目前 provider；切換不一致則取消，不能 fallback 直接 IR。未知結果維持待確認、不重送。
HB 舊自動關機、防黴與回饋仍不對 HA 空調執行；這不是 HA 自動化的編輯器，也不是每日重複排程。
排程共用 Dropdown／38px 控制項與收合卡片；keepMounted 保留草稿，其他延遲載入面板仍按原設定卸載。
html 預留 scrollbar-gutter: stable，舊瀏覽器以 overflow-y: scroll 備援，避免色盤展開引起左右位移。
部署先 HB 再 Dashboard；不需更新 HA 整合或 Sheets 欄位。

# v1.54.0 照明光色控制

照明卡保留電源／亮度，加入白光色溫與可展開的 HSV 二維色盤；特效／場景直接顯示。
通知操作已從日常照明卡移除，既有 ToDo breathe 提醒保留，通知效果編輯器尚未實作。
需要 HA home_butler 1.5.0 才宣告 color_control；舊 HA／PC 不顯示新控制，不可默默忽略色彩請求。
只向允許燈組內支援的燈具送色彩／色溫；HS 經 HA 公開色彩工具套每燈 gamut，色溫使用共同範圍。
調色不附帶開機；白光和彩色不能同時下發，整批預驗證後寫入，未知／部分完成不重送。
色盤放開、滑桿放開／鍵盤完成才送；模式切換只選擇編輯工具，調整後才套用。
目前讀值來自 Bridge；混合光色不平均，mirek 取整後 K 值可能與輸入有小幅差異。
這版聚焦光色卡片；HA 區域統一、HB 除濕機區域對應及 ToDo 效果編輯仍是下一階段，不能宣稱已完成。

# v1.53.0 照明精簡與除濕機保留

使用者決定除濕機完整留在 HB（新家預計中央除濕），不再列 HA 遷移待辦。
HB 夜燈引擎／背景工作／Webhook 及 HA 快照評估已移除；舊 Sheet 保留不執行，規則寫入回 410。
Hub 更新提示與備援轮詢保持；待辦燈光提醒改用 lighting_transport.send_command_sync，不可依賴已刪夜燈模組。
照明卡常駐電源／亮度／場景，效果通知與區域設定收合；除濕機自動／手動設定收合，HB 控制語意不變。
這是既有卡片整理，尚未改成新的全站控制 Layout。部署先後端再 Dashboard，無須重裝 HA 整合。

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI 開發與獨立測試模式

v1.46.0 HA 空調遷移：後端 controlProvider=home_assistant 時，Dashboard 使用整數溫度，隱藏回饋補償；v1.55.0 恢復明確手動排程，舊自動排程仍停用。HA 是狀態來源，失聯顯示未知並停用控制；命令結果未知不可自動重送。其餘設備行為不變。SwitchBot Cloud 仍走雲端，IR 狀態是最後指令而非實體回讀。


v1.45.0 空間感測：`home-assistant-panel.tsx` 只讀 HA 的選定觀測，一般成員可見、
kid 不開放。BFF 驗證 session；資料只在 query store 記憶體保存。
`age_seconds` 加瀏覽器本次讀取後經過時間判斷過期，不比較兩台電腦的絕對時鐘；
失敗、過期、unavailable 均顯示未知，不能把 false／0 與缺值混淆。

本專案已有可操作的模擬家庭，不需建立測試帳號或取得正式登入憑證。
新的 session 處理 UI、響應式排版或前端互動時，先讀 [測試模式說明](docs/demo-mode.md)，優先使用此模式驗證。

- 在不含正式 `.env.local` 或真實憑證的獨立 checkout 中執行 `npm ci`、`npm run demo`，開啟 `http://127.0.0.1:3001`；啟動器會設定 `DASHBOARD_DEMO_MODE=1`。
- 確認頁面頂端有「測試模式 · 模擬家庭」黃色列，再操作模擬設備。可切換正常、空資料、設備離線、API 失敗，或重設資料。
- 不要假設前一個 session 的本機伺服器、瀏覽器分頁或測試資料仍存在。需要時重新啟動；連接埠已占用時先確認服務身分，不要任意停止其他程序。
- 不移除正式環境的憑證來遷就 demo；改用獨立 checkout。不可用 query、cookie、通用密碼或修改正式登入流程來繞過驗證。
- demo 只驗證 UI 與模擬資料互動；不能據此宣稱真實家電、登入權限、後端排程或推播已通過測試。手機 viewport 檢查也不等於 iPhone Safari 實機測試。
- 新增或修改 API 資料格式時，同步更新 `src/lib/demo/fixtures.ts`、`src/lib/demo/simulator.ts` 與 `tests/demo.test.ts`；未知 API 應維持拒絕，不得退回真實後端。
- 修改 demo／API 契約後執行 `npm run test:demo`；程式變更依範圍執行 lint、build 與相關 UI 操作檢查。純文件修改不需重跑應用測試，也不 bump 版本。

# 版本管理

v1.51.0：照明 API `agent_id=home_assistant` 顯示 Home Assistant；Hub `light_level` 為 1–20 級，
`source=home_assistant` 的 age_seconds 是 HA 同步年齡，不是設備量測時間。原感測歷史維持五分鐘，
HA 失聯 current 數值 null、history 保留。不得由 demo 通過推定家庭已啟用後端切換旗標。

v1.44.0：空調回饋 interval_min 可設整數 1–30、min_adjust_min 可設整數 1–60；預設仍 5／10 分鐘。後端 valid_config、Dashboard 進階欄位與 simulator 必須一致。回饋啟用且冷暖房開機時，其感測器約每分鐘取值；其他背景讀取及歷史仍每 300 秒。sensor_polling 共用每 ID 的鎖與每個 60 秒時段內的讀取結果，sensor_state.update_current 不寫歷史。1 分鐘查詢不等於設備有新測量，保留樣本去重、冷卻等待、關機／未知結果限制。

`package.json:version` 是整個系統（Dashboard + home-butler）的**使用者體感版本** source of truth。

**bump 時機**：使用者**體感得到**的變化才 bump（新功能、UI/行為改動、會被察覺的 bug fix）。純 refactor、註解、文件、type 整理**不 bump**。快取格式版本獨立由 `query-store.ts:CACHE_SCHEMA` 管理；UI 版本更新不再清除相容快取，只有不相容資料格式才調整 CACHE_SCHEMA。

**bump 流程**（只動 Dashboard 一處）：
1. 改 `package.json:version`
2. commit、push 到 `main`
3. 完。home-butler 會在 runtime 透過 `/api/version` 公開端點撈最新值（1 小時 cache），LINE bot 自然同步——不需要也不應該再去動 home-butler。

`/api/version` 是 middleware whitelist 的公開端點，純粹回 `{ version }`，給 home-butler 後端用；前端自己用 `process.env.APP_VERSION`（`next.config.ts` 在 build-time 從 package.json 注入）。

本專案不使用 git tag / GitHub Releases；版本以 `package.json` 為準，git history 自己就是版本軌跡。

# Git push 環境差異

這個 repo 會被多種 harness 操作（本機 VS Code、claude.ai/code web UI 等）。
如果 `git push` 失敗、錯誤是認證相關（no credentials / permission denied / could not read Username），**立刻停下來，不要繞路**：

- 不要設 git credential helper、token、或改寫 remote URL
- 不要用 curl 打 GitHub API 繞過
- 不要改 SSH

如果當下環境有 GitHub MCP 工具（`mcp__github__*`），直接切過去用；沒有就回報「這個環境沒有 push 權限」由 User 處理。

## v1.37.0 資料與私人待辦

- `useCachedFetch` 透過 `query-store.ts` 共用同一使用者／URL 的讀取與狀態；替換請求會取消前次，過期結果不能覆蓋新資料。失敗保留上次成功資料與時間，頁面上方顯示重試提示；首次失败不記成成功空資料。
- 快取按 LINE ID 與獨立 CACHE_SCHEMA 分區。待辦、週期規則及含待辦的 dashboard 只存記憶體。登出、跨分頁登出與私人端點 401／403 會清除身分和資料；舊版未分帳號快取會移除。其他資料可保存供快速顯示，過期時標示並可重試。
- 私人 routes 使用 `request-user.ts` 驗證 session，再由 butler helpers 加 `X-Dashboard-User`；不要直接轉送瀏覽器提供的同名 header，也不要把姓名前綴當授權。建立 Request 包裝只複製 URL／headers，不能消耗原始 mutation body。
- 待辦修改／完成傳後端「待辦ID」，同名事項不能靠畫面 index 選取。新增 schema 請同步 demo fixtures／simulator。部署順序先 home-butler 再 Dashboard；回復時先退 Dashboard。
- `npm run test:demo` 現在執行 tests 目錄所有測試，含 query store 並行、失敗、登出隔離及真實 route 的 JWT 邊界測試（後端呼叫為 fake）。

## v1.38.0 劇院整合

- 劇院 summary 已使用共用 query store；保留上次資料、顯示過時／離線，不再另建版本專用快取。開關写入期間鎖定，完成後替換讀取以免舊輪詢蓋回設定；不以反向值假裝回復。
- `health` 與設備 `stale` / `updated_at` 等都是可選欄位，需相容舊版 theater-agent。區分 API 離線、設備狀態過時、Apple TV 心跳與畫面恢復重試。
- Theater Agent 的 T1–T7 與現有八項架構清單分開。它在私人 repo，勿把其金鑰、配對或設備設定複製到 Dashboard。

## 文件維護

v1.43.0：空調目標步幅 0.5°C，不可用 parseInt 讀取。未啟用回饋時後端四捨五入；命令確認依 POST 的 state.lastTemperature（acAcceptedTemperature）輪詢，不能拿原始半度草稿等待。停用回饋設定後刷新父層裝置並清空草稿。demo 必須保留半度舒適目標與整數 IR 的區別，Apple Home 插件需 1.2.0。

v1.42.1：啟用時按鈕為「保存並立即評估」，無草稿時為「立即評估」；POST 明確傳 `evaluate_now`，無草稿不可傳 config 覆蓋後端。停用僅保存、不評估。顯示後端 `evaluation.status` 的實際結果，不把保存成功說成已發 IR；不可自動重送未知結果。

v1.42.0 空調回饋 UI 位於 `ac-feedback-panel.tsx`，首頁／裝置頁共用。`最後溫度`／`lastTemperature` 仍是舒適目標，IR 下發另讀 `/api/ac/feedback`；不要把补償值寫回面板或 HomeKit 目標。設定 API 必須驗證 Session 並拒絕 kid，後端只接受 owner Key。模擬設定需同步 fixtures、simulator、`tests/demo.test.ts`；保存設定不應觸發 `devices/control`。

先讀 [系統導覽](https://github.com/CZLin-TW/home-butler/blob/main/docs/system-overview.md) 與 [驗證紀錄](docs/verification.md)。修改行為時同步修正 README 原有段落、API 表格與相關註解，不只在文末追加版本說明。歷史實測需附日期／版本；模擬驗證不能寫成實機成功。
