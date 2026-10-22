# Dashboard 維護入口

這份檔案是**現況**與**約束**。歷史版本的逐版決定移到
[版本變更紀錄](docs/agents-history.md)，那裡按時間保留原始描述，不隨新版改寫。

**加新行為時請修正本檔的現況章節與 README 的原段落，不要在開頭追加新的版本章節。**
變更內容另外寫進版本變更紀錄與 [驗證紀錄](docs/verification.md)。

先讀 [系統導覽](https://github.com/CZLin-TW/home-butler/blob/main/docs/system-overview.md)
與 [驗證紀錄](docs/verification.md)。歷史實測需附日期／版本；模擬驗證不能寫成實機成功。

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# 和 HomeButler 的連線（v2，2026-10 重寫）

- 瀏覽器只呼叫本站的 `/api/hb/<路徑>`，由 `src/app/api/hb/[...path]/route.ts` 轉給 HomeButler 的 `/v2/<路徑>`。
  能過去的路徑與身分列在 `src/lib/hb-rules.ts`：**預設拒絕**，遙控器（`role: kid`）只到裝置頁用得到的那幾條。
  新增功能時在那張表加一列；`proxy.ts` 對遙控器放行 `/api/hb/*`，實際的允許與否由那張表決定。
- 呼叫時帶兩樣東西，都只在伺服器端：Dashboard 自己的金鑰（`HOME_BUTLER_DASHBOARD_KEY`），以及代表誰在操作的短效簽章
  （`DASHBOARD_ASSERTION_KEY` 簽的 HS256，60 秒，成員用 LINE ID、遙控器用遙控器編號）。瀏覽器送來的同名標頭一律不轉。
  任一個沒設定就回 503，不會用空金鑰簽。
- 資料以編號操作（待辦、食品、排程、照明區域），不再用名稱或列號定位。型別在 `src/lib/api.ts`。
- 裝置頁一次一個請求（`/v2/devices`，只讀資料庫與 HA 最新狀態），每 7 秒重讀；每張卡顯示「幾秒／分鐘前更新」。
  圖表歷史另一個請求（`/v2/history`），每 5 分鐘。首頁沒展開設備時 30 秒一次。
- `src/lib/devices.ts` 把裝置頁的回應整理成一個設備清單與各圖表要的序列；圖表元件本身沒改。
- **房間順序（v1.79.0）**：裝置頁回應的 `rooms` 是後端排好的房間清單（每戶一份、全家共用，存在 HomeButler 的 `rooms` 表；沒排過的房間依名稱接在後面）。
  前端只照它排（`byRoom`、`roomGroups`），**不要在前端另存順序**（例如 localStorage），否則每支手機各排一份、家人看到的不一樣。
  成員用裝置控制標題列的「房間順序」以上下鍵調整，存檔是 `PUT rooms/order`（只限成員）；不用拖曳，因為手機上捲動時容易誤觸。
  「房間」就是設備的位置文字（試算表「智能居家」的位置，空白時用 HA 區域），改名後的房間會被當成新房間排在後面。
- Vercel 函式跑在 Portland（`vercel.json` 的 `regions`），靠近 Oregon 的後端。

# 空調控制與排程

空調目標一律整數 16–30°C。以 HA 為狀態來源；HA 斷線或上次指令未確認時顯示未知並停用控制，**指令結果未知不可自動重送**。
指令送出後 HomeButler 在 HA 確認後才回應，所以送出後重讀一次就是最新狀態，不需要輪詢猜測。

排程有兩種來源：`user`（家人建立）與 `auto_off`（HomeButler 依「智能居家」的「自動關機小時數／暫緩時段」在空調開機後建立的本輪關機）。
自動關機那筆可以改時間、改成別的動作（只限同一台空調）或刪除；刪除後這一輪不會補回。
失敗與待確認的排程留在列表上，只能「移除紀錄」，不能編輯或重送。

排程區的「自動關機」摘要來自裝置頁回應的 `auto_off`：後端對兩個儲存格的解讀、填錯的警告，以及「若現在開機會排在幾點關」。
預覽時間由後端計算，**不要在前端重算**；`autoOffSummary`（`src/lib/ac.ts`）只負責排字。設定仍只在試算表改。

# 已退役的功能

- v2 起舊的四十幾支 BFF 路由（`/api/devices`、`/api/todos`……）與夜燈退役後保留的 `/api/lighting/auto/**` 都已移除；
  舊客戶端在切換後重新整理即可。
- 待辦燈光提醒可複選照明區域（`light_area_ids`，照明區域的編號）。預設區域由照明區域的 `is_default` 決定。

# 空間感測與資料新鮮度

空間感測的資料在裝置頁回應的 `presence`（HA 的選定觀測）；**遙控器拿不到**，`/api/hb` 會把它從回應裡拿掉。
`age_seconds` 加瀏覽器本次讀取後經過的時間判斷是否過期，不比較兩台電腦的絕對時鐘；
失敗、過期、unavailable 均顯示未知，不能把 false／0 與缺值混淆。

# 區域編輯入口（v1.72.0）

裝置頁「空間感測」標題列的「編輯區域」是一般連結，指向 `/api/zone-editor/enter`。
該路由用 `requestUser` 擋未登入與 kid（`proxy.ts` 的 kid 白名單也沒有它），以
`ZONE_EDITOR_SIGNING_KEY` 簽一張 ES256 通行票後 302 到 `ZONE_EDITOR_URL/enter#ticket=…`。
票 60 秒過期、對方只收一次、只含 iss／aud／iat／exp／jti 與本站網址 `ret`，**不含使用者身分**。
票放在 fragment，不進任何伺服器記錄；不要改成 query 參數。
Dashboard 不代理影像或設定——那些只在家中主機與瀏覽器之間。兩個環境變數缺一即整個關閉，
裝置頁回應裡的 `zone_editor`（由 `/api/hb` 依本站設定加上）為 false、按鈕不顯示。
更早另一套經雲端轉送的設計（`/vision` 頁、`src/lib/vision-*`、`src/components/vision/*`、`/api/vision/v1/*`）
已於 2026-10-10 整個移除；需要參考時從 git 歷史取回，不要重建。

# 登入與 session 效期（v1.75.0）

只有兩種身分，兩條登入路，效期都是「有在用就延長」：

| 身分 | 怎麼登入 | 效期 | 資格（延長前向後端確認） |
| --- | --- | --- | --- |
| 成員（`role: member`） | 登入頁顯示六位數字，在 LINE 傳給管家 | 30 天 | `POST /v2/sign-in/member`：成員仍啟用 |
| 遙控器（`role: kid`，受限，只能用裝置頁） | 登入頁「遙控器模式」輸入密碼 | 14 天 | `GET /v2/sign-in/remote/<編號>`：那台遙控器仍啟用 |

`role` 的值 `kid` 是沿用的舊名，指的就是遙控器。原本另有經 LINE「配對兒童」取得受限身分的入口（`?kid=1`），
使用者 2026-10-11 決定移除，因為兩條路做同一件事、而且那條在 iOS 主畫面圖示下本來就不可靠。**不要加回來。**

延長做在 `/api/auth/me`：session 簽發超過 `SESSION_RENEW_AFTER`（一天）時確認資格再重簽。

- **三種結果要分清楚**：`active: true` 重簽；`active: false` 清 cookie 回 401；其他任何情況（連不上、5xx、404、格式不對）
  **兩者都不做**。不要把「無法確認」當成停用，那會讓後端一掛全家被登出；也不要在沒確認時延長。
- 延長不做在 `proxy.ts`：那裡每個請求都會經過，不適合打後端。
- 開著不重新整理的頁面靠 `use-user.ts` 的 `keepSessionAlive`（每 6 小時、或畫面切回前景時）再打一次 `/api/auth/me`。
  少了它，一直亮著的遙控器平板會在 14 天後於使用中被登出。它只把明確的 401 當成登出，網路錯誤不動畫面。
- 沒有簽發時間的舊 session（v1.75.0 之前簽的）視為需要重簽，下次載入就升級成新效期。
- 遙控器只改密碼不會讓已登入的失效，要取消那一列的「啟用」。session 裡記著遙控器編號（`remoteId`）；**沒有編號的遙控器 session（v2 之前簽的）在 `verifyToken` 就視為未登入**（`usable`），所以閘門直接導到登入頁、`/api/auth/me` 回 401 並清 cookie，不等每天一次的資格檢查。v1.79.1 之前只在那個檢查裡處理，前一天剛延長過的手機會停在讀不到資料的頁面、不會被要求登入（2026-10-22 實際發生）。
- 配對的瀏覽器密語（device_token）只放在 POST 內容裡，不出現在網址。
- 移除前由「配對兒童」簽的受限 session 同樣沒有遙控器編號，照上一條立即結束，請使用者改用密碼登入。
- 配對（`device-poll`）只簽成員；後端若回別的角色就拒絕，不降級處理。

# UI 開發與獨立測試模式

本專案已有可操作的模擬家庭，不需建立測試帳號或取得正式登入憑證。
新的 session 處理 UI、響應式排版或前端互動時，先讀 [測試模式說明](docs/demo-mode.md)，優先使用此模式驗證。

- 在不含正式 `.env.local` 或真實憑證的獨立 checkout 中執行 `npm ci`、`npm run demo`，開啟 `http://127.0.0.1:3001`；啟動器會設定 `DASHBOARD_DEMO_MODE=1`。
- 確認頁面頂端有「測試模式 · 模擬家庭」黃色列，再操作模擬設備。可切換正常、空資料、設備離線、API 失敗，或重設資料。
- 不要假設前一個 session 的本機伺服器、瀏覽器分頁或測試資料仍存在。需要時重新啟動；連接埠已占用時先確認服務身分，不要任意停止其他程序。
- 不移除正式環境的憑證來遷就 demo；改用獨立 checkout。不可用 query、cookie、通用密碼或修改正式登入流程來繞過驗證。
- demo 只驗證 UI 與模擬資料互動；不能據此宣稱真實家電、登入權限、後端排程或推播已通過測試。手機 viewport 檢查也不等於 iPhone Safari 實機測試。
- 測試模式模擬的是 HomeButler v2 經 `/api/hb` 的回應。新增或修改 API 資料格式時，同步更新 `src/lib/demo/fixtures.ts`、`src/lib/demo/simulator.ts` 與 `tests/demo.test.ts`；未知 API 應維持拒絕，不得退回真實後端。
- 修改 demo／API 契約後執行 `npm run test:demo`；程式變更依範圍執行 lint、build 與相關 UI 操作檢查。純文件修改不需重跑應用測試，也不 bump 版本。

# 版本管理

`package.json:version` 是整個系統（Dashboard + home-butler）的**使用者體感版本** source of truth。

**bump 時機**：使用者**體感得到**的變化才 bump（新功能、UI/行為改動、會被察覺的 bug fix）。純 refactor、註解、文件、type 整理**不 bump**。快取格式版本獨立由 `query-store.ts:CACHE_SCHEMA` 管理；UI 版本更新不再清除相容快取，只有不相容資料格式才調整 CACHE_SCHEMA。

**bump 流程**（只動 Dashboard 一處）：
1. 改 `package.json:version`
2. commit、push 到 `main`
3. 完。home-butler 會在 runtime 透過 `/api/version` 公開端點撈最新值（1 小時 cache），LINE bot 自然同步——不需要也不應該再去動 home-butler。

`/api/version` 是 middleware whitelist 的公開端點，純粹回 `{ version }`，給 home-butler 後端用；前端自己用 `process.env.APP_VERSION`（`next.config.ts` 在 build-time 從 package.json 注入）。

本專案不使用 git tag / GitHub Releases；版本以 `package.json` 為準，git history 自己就是版本軌跡。

# 部署前的把關

Vercel 推 `main` 就建置並部署，**不會等 GitHub 的 CI**。所以 `vercel.json` 把建置指令改成先跑 lint 與 `test:demo`，
任何一項失敗建置就失敗，Vercel 保留上一版不動。測試用 `env -i` 在只有 `PATH`／`HOME` 的環境跑：
正式環境變數存在時有 18 項測試會失敗（它們假設那些變數不存在），而且測試也不該看得到正式金鑰。
新增測試時維持這個前提——不要讓測試依賴建置環境的變數。改文件也會觸發部署，但不停機、沒有會被清掉的狀態。

# Git push 環境差異

這個 repo 會被多種 harness 操作（本機 VS Code、claude.ai/code web UI 等）。
如果 `git push` 失敗、錯誤是認證相關（no credentials / permission denied / could not read Username），**立刻停下來，不要繞路**：

- 不要設 git credential helper、token、或改寫 remote URL
- 不要用 curl 打 GitHub API 繞過
- 不要改 SSH

如果當下環境有 GitHub MCP 工具（`mcp__github__*`），直接切過去用；沒有就回報「這個環境沒有 push 權限」由 User 處理。

# 資料快取與私人資料邊界

- `useCachedFetch` 透過 `query-store.ts` 共用同一使用者／網址的讀取與狀態；替換請求會取消前次，過期結果不能覆蓋新資料。失敗保留上次成功資料與時間，頁面上方顯示重試提示；首次失敗不記成成功空資料。
- 快取按 LINE ID 與 `CACHE_SCHEMA` 分區。待辦、首頁、裝置頁（含誰在哪個房間）只存記憶體；其他可保存供快速顯示，過期時標示並可重試。登出、跨分頁登出與私人端點 401／403 會清除身分和資料。
- 誰能看哪些待辦由後端決定（自己的與公開的）；Dashboard 不再自己過濾，也不送任何「使用者是誰」的標頭，只送簽章。
- 部署順序先 HomeButler 再 Dashboard；回復時先退 Dashboard。
- `npm run test:demo` 執行 tests 目錄所有測試，含 query store、`/api/hb` 的白名單與簽章、登入延長（後端呼叫為 fake）。

# 「自動化」區塊（v1.76.0）

裝置頁原本的「劇院」區塊改名為「自動化」：在背景依規則自己動作的東西都放這裡，目前是 Home Assistant 卡與劇院 Agent 卡。
用意是家人看到某個東西自己動了，只有一個地方要找（使用者 2026-10-11 的決定；區塊名稱用「自動化」而不是「Agent」，因為後者是開發用語）。

- **Home Assistant 卡**（`automation-card.tsx`）一直顯示，資料來自裝置頁回應的 `automations`：最近的執行記錄與全部規則的上次執行時間。
  空清單一定要說明原因（後端未設定／HA 未勾選分享／HA 離線／HA 重啟後還沒執行過），不能讓「沒接上」看起來像「今天沒事發生」。
- **純顯示。** 後端沒有改動自動化的路徑，`hb-rules.ts` 也沒有。之後若要加「暫停／恢復某條規則」的開關，位置預留在規則清單每一列右側；
  那是開關不是編輯，但仍要走後端的白名單指令，不是讓 Dashboard 直接碰 HA。
- 遙控器看得到這張卡；空間感測仍然只給成員。
- 劇院卡的顯示規則沒有變，只是從自己的區塊搬進這個區塊（見下一節）。

# 劇院整合

- 劇院 summary 已使用共用 query store；保留上次資料、顯示過時／離線，不再另建版本專用快取。開關写入期間鎖定，完成後替換讀取以免舊輪詢蓋回設定；不以反向值假裝回復。
- `health` 與設備 `stale` / `updated_at` 等都是可選欄位，需相容舊版 theater-agent。區分 API 離線、設備狀態過時、Apple TV 心跳與畫面恢復重試。
- **劇院卡掛在哪由 `agent_id` 決定**：對上某台 PC 的 hostname 就接在那張電腦卡底部（走 PC agent），
  否則獨立成一張「劇院」卡（`agent_id = home_assistant`，即 `THEATER_VIA_HA=true`，或 PC agent 已移除）。
  UI 只認 `agent_id`，不需要知道後端走哪條。**不要把劇院區塊改回只掛在電腦卡上**——
  PC agent 一拿掉劇院控制就會整組消失，v1.58.1 修的就是這個。
- **讀不到又沒有快取時仍然要畫出這張卡**，內容換成錯誤訊息與重新整理鈕。靜靜不渲染會讓
  「中繼壞掉」和「這個家沒有劇院」長得一模一樣；實際發生過，症狀是切換 `THEATER_VIA_HA`
  之後整個區塊消失、畫面上沒有任何線索。
- Theater Agent 的 T1–T7 與現有八項架構清單分開。它在私人 repo，勿把其金鑰、配對或設備設定複製到 Dashboard。
- Mac 主機遷移只需 HA 本地整合改址；Dashboard 不保存劇院 LAN 位址，也不需為新主機建立 PC 卡。Windows 僅回報指標時，其在線狀態不再代表劇院健康。

# 電腦指標

卡片使用既有 heartbeat/status 契約，文字只留 hostname（fallback IP）與 CPU／GPU 兩行（型號、使用率；Windows 另有溫度），其餘當下數值一律看圖，不另外寫成文字（v1.73.1 起移除 SoC 溫度、記憶體壓力、RAM 使用率的文字列）。有 memory_pressure 的 Mac 在百分比圖畫連續 pct（0–100）折線，與 CPU/GPU 共用固定系列顏色；折線看不出系統等級，所以只有在線且 level 為警告／嚴重時才多一行文字提示，正常、未知或離線不顯示，不能由三級狀態虛構百分比。Windows／舊 agent 的 RAM 畫在同一張圖。缺少指標顯示 unavailable；無溫度歷史不畫溫度圖。Mac collector 位於 home-butler `agent/macos_metrics.py`，與劇院／vision 分離。Mac 的 CPU／GPU 在同一顆晶片上，所以只顯示一個「SoC 溫度」：取 smc_temperature.tcmb_c（2026-10-09 在 M6 Mac mini 以負載測試確認它是整顆晶片的最高點，CPU 或 GPU 滿載都會跟著升；Apple 未公開此感測器），空值 unavailable。有 smc_temperature 的卡片 CPU／GPU 行不顯示溫度，SoC 溫度只在溫度圖畫單一 SoC 線；tcmz_c 不使用。Windows 仍用 cpu_temp_c／gpu_temp_c。SoC 溫度與記憶體壓力的 24h 歷史自 2026-10-11 起由後端寫進試算表，後端重啟後會讀回（之前只留記憶體、重啟歸零）。整機功耗（v1.78.0，2026-10-18）：Mac 的 heartbeat 帶 `system_power_w`（SMC 的 PSTR，瓦，每分鐘取約一秒平均）。**卡片的圖分兩層**（使用者決定）：使用率與溫度一直顯示；其他圖收在下方「更多圖表」（共用的 `Collapse`，收合時卸載），目前只有「整機功耗 (W)」一張，以後新增的圖也放這裡，不要再疊到既有圖上或用副座標軸（v1.77 曾把功耗畫在溫度圖的右軸，線互相遮蓋，已改掉）。收合區只在有內容時出現，Windows 卡沒有。功耗圖 Y 軸 0 起、上限至少 10 W 往上取 5 的倍數，線色深海藍。歷史同樣寫進試算表（`system_power_w` 欄）、重啟後讀回。Demo 提供連續數值及三種系統狀態的假資料；Mac 正式 agent 已接入，由 home-butler 簽署更新器管理。
