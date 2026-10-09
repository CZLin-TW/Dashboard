## 2026-10-09 部署前先跑檢查與測試

本機以三種環境執行 89 項測試：乾淨環境 89 通過；帶正式環境會有的變數但經 `env -i` 清除後 89 通過；不清除時 71 通過、18 失敗，確認清除是必要的。Vercel 上的實際建置結果需在部署記錄確認，repo 內無法驗證。

## 2026-10-09 v1.73.3：SoC 溫度線改用全站的溫度色

89 項隔離測試、TypeScript、ESLint、demo build 通過。只換一個既有的顏色變數，未另做畫面檢查。

## 2026-10-09 v1.73.2：電腦用量圖的記憶體線改色

以 OKLab 色差計算（淺色卡片底 #FFFEFA，三色兩兩比較）：原赭黃與 GPU 陶土的一般視覺色差 7.7、色覺異常模擬最差 4.7；改為 #4C9C92 後三色最差分別為 19.1 與 11.2，對底色對比皆 ≥3:1。三色彩度偏低是整體配色的既有取向，未調整。89 項隔離測試、TypeScript、ESLint、demo build 通過；demo 模式 375px 目視確認 Mac 與 Windows 卡。

## 2026-10-09 v1.73.1：電腦卡移除重複的文字數值

89 項隔離測試、TypeScript、ESLint、demo build 通過。demo 模式 375px 確認 Mac 與 Windows 卡在 CPU／GPU 兩行之後直接接圖表，沒有 SoC 溫度、記憶體壓力、RAM 使用率文字列，無水平溢出。警告／嚴重時的提示列未在畫面上實測（demo 的當下狀態為正常）。此為 demo 驗證。

## 2026-10-09 v1.73.0：Mac 卡改顯示單一 SoC 溫度

89 項隔離測試、TypeScript、ESLint、demo build 通過。demo 模式（模擬家庭）以 375px 手機寬度確認 Mac 卡 CPU／GPU 行只有使用率、有「SoC 溫度」一行、溫度圖為單一 SoC 線、沒有 TCMb／TCMz 與感測器資訊、無水平溢出；Windows 卡不變。tcmb_c 的意義依據 2026-10-09 在 M6 Mac mini（macOS 27.0.1）的唯讀負載測試：閒置約 53°C、CPU 滿載 102°C、GPU 滿載 85°C，全程等於晶片上 CPU 與 GPU 兩個熱點值的較大者。此為 demo 驗證，未連正式後端。

## 2026-10-09 v1.71.1：精簡 Mac 電腦卡

86 項既有隔離測試、ESLint、demo webpack build（含 TypeScript）通過。隔離 Chrome 桌機與 390px 手機確認僅兩張圖、CPU/GPU/記憶體壓力共用圖例、無獨立面積圖、感測器說明可展開、Windows RAM 保留、離線為未知且無水平溢出。此為 demo 驗證，未修改或重啟正式 agent。

## 2026-10-09 v1.71.0：連續記憶體壓力曲線

Mac 顯示 pct 連續數值與獨立系統等級；0–100% 面積曲線以系統 level 決定綠／黃／紅，未知等級灰色，缺值／舊 level-only／斷線空白。每分鐘採樣，最多本次後端執行期間 24h。無 RAM 換名、無三級映射或自行訂定顏色百分比門檻；Windows 保留原 RAM。

86 項隔離測試、tsc、ESLint、demo webpack build 通過。新 Chrome profile 僅允許 localhost：桌機與 390px 手機檢查數值、面積曲線、Windows RAM、離線數值／狀態未知與無水平溢出；這是 demo 瀏覽器驗證，非真實資料或 iPhone Safari 實測。

## 2026-10-09 v1.70.0：Mac 記憶體壓力

86 項離線測試、ESLint、TypeScript 與隔離 demo webpack 建置通過。測試涵蓋三種狀態、非法／缺失值、歷史 gap、正常壓力與高 RAM 不混淆、Mac fixture 與舊 Windows 相容。
Chrome 1440×1000／390×844 的獨立無憑證 demo 驗證正常標籤、狀態圖與 Windows RAM；手機無橫向溢出。僅本機 demo，不將模擬畫面當成正式後端收值證據。原生 agent 的自動切版另由 home-butler 驗證。

## 2026-10-06 v1.68.0：既有家庭驗證＋HB Sheets 視覺授權（未部署）

- 80/80 unit tests；ESLint、TypeScript 與 `next build --webpack` 通過。未改 UI，未重跑相機／native／UI 全套。
- `scripts/test-status-pilot.py`：10/10，真 built Next → verified HTTPS HB → verified outbound WSS，只有 fake Sheets rows。
- 不設定 `DASHBOARD_VISION_GRANTS` 或第二個 vision service token、不建 SQLite；JWT user/member role/expiry 由 server 衍生，client header、kid 父母 LINE ID 與家庭 API key 冒充 device 均拒絕。
- 重複請求重用 HB snapshot；reader 失敗、撤權、late response、mock source 重啟與 TLS wrong CA/hostname 均維持 fail closed。
- 所有自建程序停止，暫存 CA/private keys/fake rows 清除；證據 `artifacts/status-pilot/verification.json`。詳見 [本輪驗證](vision-shared-auth-verification.md)。

## 2026-10-05 v1.64.0：視覺入口第一階段（本機分支，未部署）

- 來源 Dashboard `755f5f8`；本機獨立 checkout，不改現役 mini、Dashboard／HB 原 checkout。
- `npm run test:demo`：49/49。包含真實 vision route 缺失／錯誤／過期 JWT、kid、獨立 grants、default deny、Origin／JSON／body validation、production fail closed、禁止外送，以及 timeout／abort 清理測試。
- `npm run lint`、`npm run typecheck`、`npm run build`：通過。
- `npm run test:vision-ui`：9/9。Chromium 320×740、390×844、844×390、1440×1000，另含 touch emulation；合成 preview、draft cancel/save/undo、重複寫入、401／403 清除、offline、離頁取消、取消後晚到結果不可恢復預覽。
- 看圖確認手機直向及橫向畫面；窄螢幕導覽與提示對比已修正。這不是實體 iPhone Safari 驗收。
- 瀏覽器腳本先 build，使用 localhost:3014 `next start` + 隔離 demo，完成自動關閉；圖片與結果只在忽略的 artifacts/。沒有相機影像、YOLO推論、正式串流、ROI寫入、MQTT或HA實機測試。
- 一次開發模式重跑發生 Next 子程序異常增生，停止該測試程序樹並確認沒有殘留；撤回實驗性的 root 設定，驗收啟動改用建置產物。未將該失敗計為通過，也未斷言已定位 Next 根因。現役 8768／8771 listener PID 未改變。測試過程短暫增加主機資源負載，與現役 vision 程式修復無關。
- 剩餘邊界：正式 transport 固定 unavailable；沒有設定任何實際 grants／憑證或公開通道。後續必須依 docs/vision-phases.md 分階段驗收，不直接替換現役安裝。

# 驗證方式與範圍

## 2026-10-03 Mac mini 電腦卡（v1.62.0，未部署）

基於 GitHub main `0c77919` 獨立 checkout；卡頭顯示 hostname 與 IP，CPU/GPU 缺值顯示 unavailable（零值仍是零），新增 RAM 當下百分比；沒有溫度歷史時顯示 unavailable 提示。沒有新增 API 欄位，與 home-butler 獨立 macOS collector 共用既有契約。Demo 同時提供 Windows 與 Mac mini，Mac CPU=18%、RAM=56%、GPU／溫度=null。

依現有 package-lock 使用 npm ci --ignore-scripts 安裝後：**38 項離線測試、ESLint、TypeScript --noEmit、Next.js 16.2.1 webpack 正式建置（DASHBOARD_DEMO_MODE=1）通過**。新增測試涵蓋零值與缺值、history gap、Mac fixture／status、offline／empty；沒有正式憑證。

內建瀏覽器 `127.0.0.1:3001/devices` 的 AX／DOM 確認黃色測試模式列、兩張電腦卡、Mac unavailable、RAM 與無溫度資料提示。390×844 viewport document width/scrollWidth 都是 390，GPU 溫度文字完整落在 x=265..341；離線情境 Mac 標離線，空資料情境 Mac 卡數為 0。已恢復 viewport。截圖 API 多次回報 Unable to capture screenshot，故**未完成像素／截图視覺驗收**；不宣稱 iPhone Safari 實機驗證。既有 Windows 卡仍有數值與溫度歷史，獨立劇院卡保留。

沒有 push、部署、正式登入、真實 heartbeat 或家電操作。Mac 真實 CPU/RAM/GPU 單點採樣在 home-butler 驗證紀錄，不把 UI 假資料當作端到端接入成功。正式目的地、憑證與常駐仍待授權；版本為待發布 1.62.0。

## 2026-10-03 首頁釘選設備排程編輯（v1.61.4）

隔離 checkout 與無正式憑證 demo，使用內建瀏覽器操作首頁「HA 測試空調」。
修正前開啟排程編輯，等待下一輪 15 秒更新後，表單消失、排程區回到收合狀態。
原因是載入／錯誤提示取代 ScheduleSection，造成元件卸載與草稿狀態清除。
修正後成功資料由 hasData 判斷，背景載入／錯誤提示與排程區獨立渲染。
實際確認編輯表單跨多輪更新保持展開，關機改成開機、溫度改成 27°C 的未儲存草稿保留。
原生時間欄位的自動 fill 沒有提交 React 草稿，不能把該操作列為改時驗收。

36 項離線測試、ESLint、TypeScript 與 Next.js webpack 正式建置（DASHBOARD_DEMO_MODE=1）通過；
以 bundled Node 直接執行對應 CLI，本機沒有 npm。API／demo 資料契約未修改。
初次驗證時未 push／部署；未驗證 iPhone Safari、正式家庭資料、API 失敗的瀏覽器情境或真實家電。

發布追記：依使用者授權，修正提交 `8603637` 已推送 main；[CI 通過](https://github.com/CZLin-TW/Dashboard/actions/runs/37039270405)，
[該提交的 Vercel 部署](https://vercel.com/czlin-tws-projects/dashboard/4iUzVEnusaocHeXdMtwG9VhNPGBj) commit status 為 success。
此為發布結果，不代表 iPhone Safari 或真實家電驗收。

## 2026-10-02 Mac mini 劇院遷移文件核對

以 origin/main `7786440` 為基準，保留既有首頁設備卡新提交與未提交發布紀錄。本次只改 README／AGENTS／驗證文件；已核對程式依 `agent_id=home_assistant` 顯示獨立劇院卡，BFF 只代理 HB，不持有 HA／Mac LAN 位址或金鑰，因此不需改 UI、API、demo fixture 或系統顯示版本。

HB 正式唯讀摘要已核對為 HA 中繼，Mac 兩程序及 Apple TV 健康正常；未操作 Dashboard 正式開關或家電，不把後端健康當成前端或實體連動驗收。純文件差異／連結核對，不重跑 UI 測試與 build。

發布追記：文件提交 `d636305` 已推送 main，[CI 建置通過](https://github.com/CZLin-TW/Dashboard/actions/runs/36892359723)，該提交的 Vercel commit status 為 success。此為文件發布，未新增 UI 或實體設備驗收。

## 2026-09-28 排程編輯時間格式（v1.61.3，未部署）

以合成自動排程 `2026-09-29 7:00` 重現：修正前 input 的 value attribute 是 `7:00`，
瀏覽器實際 value 為空字串；修正後兩者均為 `07:00`。後端 Sheet 以 FORMATTED_VALUE 讀取，
GET schedules 原樣回傳；本次未讀正式家庭資料，因此不宣稱已核對正式那筆排程的原始回應。

36 項離線測試、ESLint 與 Next.js 正式建置（`DASHBOARD_DEMO_MODE=1`、`--webpack`）通過。
新增測試涵蓋未補零日期／小時、空白、午夜、12:30／23:59、不因補零送出改時、
保留原始時間定位，以及合成自動排程修改後重讀保留時間、來源 metadata 與設備狀態。
本機預設 Turbopack 遇到 spawning node ENOENT，改用 Webpack；初次 build 字型下載被網路限制，
允許下載專案既有 Google Fonts 後成功，沒有替換字型或修改建置設定。

Codex 瀏覽器 demo 確認 `7:00` 開啟編輯顯示 `07:00`；原生時間欄位改為 `19:00`，
跨過 15 秒輪詢仍保留草稿，保存、重新載入、重開編輯均為 `19:00`。
390×844 viewport 再以原始案例確認 `07:00` 正常顯示；這不是 iPhone Safari 實機驗收，
使用者回報的手機原生選擇器跳掉仍待發布後實機確認。
開發伺服器沿用啟動時版本標籤 1.61.2；本次 package.json 與正式建置為 1.61.3。
未 push、部署、操作正式 Sheets／HA／家電；既有驗證文件未提交的發布紀錄已保留。

2026-09-28 發布確認：使用者授權後，`7be45799049e29ed4495ce12a8273b6c55999653` 已推送 main。
GitHub Actions [36415881893](https://github.com/CZLin-TW/Dashboard/actions/runs/36415881893) 結果 success；
Vercel Production deployment `6708766879` 與該提交 Vercel status 均為 success。
手機原生時間選擇器與正式排程編輯由使用者接續驗收；本次沒有操作正式家電或排程。

## 2026-09-23 同名待辦修正（v1.61.2）

僅更新 package.json 系統版本，JSON 解析與差異檢查通過；未重跑 UI 測試或 build。功能與離線測試位於 home-butler，見該 repo 驗證紀錄。未 push 或部署。

2026-09-23 發布確認：`db6af50793c69e123c9f169c46631435139118fb` 已推送 main，GitHub Actions 35821043697 成功；Vercel Production deployment 6606807444 與 commit status 均為 success。部署網址的 `/api/version` 回重導，未取得版本 JSON；不以此宣稱正式網址版本 API 已驗證。後端實際 Render SHA 仍待登入核對，見 home-butler 驗證紀錄。

## 2026-09-23 排程自動同步（v1.61.1）

首頁設備控制展開與裝置頁改用既有 useAutoRefresh 每 15 秒讀取排程，回前景立即讀取；
useCachedFetch disabled 時不送請求，保留首頁收合後的按需讀取邊界。
32 項既有離線測試、ESLint、Next.js 正式建置通過。模擬家庭瀏覽器確認首頁 HA 空調
排程可展開並顯示「關機 · 自動產生」。未操作正式空調或 Sheets；未驗證實體開機後的端到端延遲。

## 2026-09-20 ToDo 多區域提醒（v1.61.0）

本機 32 項測試、ESLint 與 Next.js 正式建置通過。新增模擬 API 測試涵蓋普通待辦與週期模板
保存多區域、重新讀取、無關編輯保留、縮減為一區、停用清除及無效／空區域拒絕。
Codex 獨立瀏覽器在本機 demo 將原本單區域待辦改選客廳＋臥室，保存、重新整理與重新開啟編輯
均保留兩個勾選；取消全部後顯示提示且儲存鈕停用，再選臥室可保存為單區域。
只使用模擬家庭資料，未操作正式 HA、Sheets、LINE 或燈具；未宣稱 iPhone Safari 實機驗收。
先部署支援 `light_area_ids` 的 home-butler，再發布此介面。

2026-09-14 v1.57.0：時數僅由 Sheet 管理，Dashboard 使用原排程區編輯／刪除自動產生的本輪排程。
238 項後端測試與 34 項 Dashboard 測試、lint、正式 build 通過；涵蓋編輯後重啟保留、刪除不補回、off 清理不碰未來手動排程、改成 on 保留、未知不重送及舊 paused 相容。
封存測試確認已關閉 cycle 可清理而不等待同設備的未來手動排程；舊設定 POST 回 410 且不讀寫 Sheet。
Chrome 模擬家庭確認無時數面板、自動排程可編輯／保存／重新載入後保留、刪除後清單消失。
390×844 時頁面 scrollWidth=375，無水平溢出；不是 iPhone Safari 實機驗收。
未修改家庭 Sheet 時數、未操作實體空調或正式排程；正式部署與 CI 狀態另記。

2026-09-14 v1.54.0（部署前驗證）：216 項 HB 離線測試、30 項 Dashboard 測試、lint、正式 build 通過。
本機 demo 驗證彩色／白光切換、二維色盤點選、飽和度鍵盤操作、色溫回讀；390px 無橫向溢出。
HA 新增色彩能力、互斥與全批預驗證、混合燈組／部分支援／去重測試，框架 CI 待 push 後確認。
尚未操作家庭燈具，未驗證 iPhone Safari 實機；HA 1.5.0 安裝狀態另記，不能由程式完成推定已安裝。


2026-09-14 v1.53.0：照明卡共用家電開關／38px 下拉選單／收合列，常駐電源、亮度、場景；
效果通知與改名收合，移除夜燈 UI／請求。電源與亮度鎖定後回讀，錯誤獨立顯示、不自動重送。
除濕機自動設定／手動模式收合，外層保留電源、自動模式及計時提示，控制仍全部由 HB 執行。
28 項離線測試、lint、正式 build 通過。既有無正式憑證的 localhost demo 經 HMR 驗證新 UI；
舊開發程序的頂部版本字串仍為啟動時版本，正式 1.53.0 以本次 build／部署為準。
模擬家庭：1280 桌機與 390 手機寬度無橫向溢出，照明下拉高度 38px；展開單卡不拉高鄰卡。
照明開關、數字亮度、場景、效果、通知、改名及離線提示已測；除濕機監控時間由 5 改 10 分，
保存後收合重開仍保留。自動模式下感測器／手動模式鎖仍在。未連真實家電，非 iPhone Safari 實測。

2026-09-14 README 重整（僅文件）：更新 HA／HB／PC 控制分工、HA 空調的整數溫度與排程限制，
新增不用 HA 的 main 路徑及 v1.44.0 成套版本下載入口。核對本 repo `2c31431` 的版本 1.44.0，
及其為首次 HA 介面 `6316c03` 的父 commit；版本表、連結／錨點與 git diff --check 通過。
沒有 UI／程式變更，不調整 package 版本；沒有重跑 demo 或家電測試，不代表舊版已重新實機驗收。

2026-09-14 v1.51.0：照明來源辨識 Home Assistant，Hub 光照顯示「級」及 HA 同步年齡。
demo 感測即時值採 HA 契約，失聯時 null、歷史保留。28 項 test:demo、lint、隔離 demo production build 通過；
瀏覽器實際操作亮度偵測顯示「目前 4 級・HA 同步於剛剛」，版面正常。未控制家中燈具。
後端／HA 通道及家庭啟用狀態見 home-butler 的驗證文件，demo 成功不代表 HA 已切換。

2026-09-14 v1.50.0：本 repo 只更新整體版本。Hub 2 Push 觸發 HA 更新的功能與測試位於 home-butler；
Dashboard UI／API 契約不變，實機驗證見後端 docs/verification.md。

2026-09-13 v1.49.0：系統版本更新，新增功能位於後端 repo 的 HA Hub 2 光照整合。
本次不改 Dashboard UI／API；Hub 2 光照等級不是 lux，不混入現有 FP2 照度通道。

2026-09-13 v1.48.0：HA 電扇遙控按鈕功能位於 home-butler；本 repo 僅更新系統版本與文件。
原 IR 按鈕 payload 與 UI 不變，後端以 HOME_ASSISTANT_IR_NAMES 將選定電扇切到 HA；
成功表示 API 接受，非實體狀態回讀。家庭安裝與驗收結果以 home-butler/docs/verification.md 為準。

2026-09-13 v1.47.1：後端 HA 分流補上 Dashboard 中文模式／風速的正規化；本 repo 只更新系統版本與文件。
原本相同設定的面板檢查不足以驗證控制送達；真實中文 payload 的回歸測試與端到端驗證記錄以 home-butler/docs/verification.md 為準。

2026-09-13 v1.47.0：本 repo 僅更新整體系統版本與文件，UI、API 契約沒有改動。新功能與 HA 框架測試位於 home-butler 的 `homeassistant/custom_components/ac_room_temperature`；HA 實機設定與 Apple Home 驗收進度見後端驗證紀錄。

2026-09-13 v1.46.0 HA 空調：27 項離線測試、lint 與正式建置通過。
模擬頁面確認 HA 空調 26→27°C 一度步進及保存後同步、取消回饋與排程編輯。
離線情境顯示未知並拒絕控制；檢查後再移除離線時會誤導的預設溫度／電源面板，lint／型別檢查通過。
[b035472 CI](https://github.com/CZLin-TW/Dashboard/actions/runs/34749494347) 通過，正式 /api/version 已確認 1.46.0。
2026-09-13 晚間使用者確認 HA 實際控制正常後，已切換後端三台空調控制權。
正式 Dashboard 三台均顯示「由 HA 管理」；客廳冷氣 28°C／自動與 HA 一致，舊回饋與排程介面退出。
正式頁面送出一次客廳相同設定，完成 HA 確認、回到「未變更」，沒有自動重送。
Apple Home 新配件實機驗收及舊 Homebridge 清理仍待使用者確認。
其餘 legacy 空調保留原情境。正式建置使用既有 Google Fonts，需要網路下載字型。

2026-09-13 v1.45.0 已推送 main：26 項離線測試、lint、Next 建置、最終 TypeScript 檢查通過。
新增 HA 觀測格式／讀取時效、未知不當 false、匿名與 kid 拒絕的測試。
模擬家庭瀏覽器檢查正常資料與設備離線；一般寬度及 390×844 檢查新卡片，無橫向截斷。
修正顯示時計稍早於新讀取時間造成短暫顯示未知的問題，再跑 26 項測試及型別檢查通過。
Dashboard [6316c03 CI](https://github.com/CZLin-TW/Dashboard/actions/runs/34745746323) 通過，
後端 HA Core 2026.9.2 框架 CI 亦通過。這不是 iPhone Safari 或家庭 HA 的實機驗證；
Render 專用 key、家中 HA 安裝與 FP2 真實同步仍待設定及驗收。

## 2026-09-09 一分鐘間隔與感測說明（v1.44.0）

24 項測試、ESLint 及正式建置通過。進階設定的評估／最短調整間隔下限改為 1 分鐘；模擬 API 保存及重新載入兩個 1 分鐘值，拒絕 0、非整數及越界值。預設維持 5／10 分鐘。UI 說明同步後端的回饋使用中每分鐘取值／歷史每五分鐘分離機制。這次未操作正式服務／家電，快速取值與寫入隔離由後端離線測試驗證。

## 2026-09-08 半度目標（v1.43.0）

24 項測試、ESLint 及正式建置通過。demo 已操作未啟用回饋時 26.5→27°C 且確認流程正常結束，啟用時面板與舒適目標保留 26.5°C、IR 顯示 27°C，停用設定後面板同步整數目標。390×844 viewport 下視覺檢查半度數字與三欄讀值，內容未橫向溢出（含捲軸的有效內容寬度 375px），完成後恢復原尺寸。這是本機模擬環境，未使用正式憑證、未操作真實設備，也不等同 iPhone Safari 實機驗證。

## 2026-09-08 立即評估（v1.42.1）

23 項測試、ESLint 與正式建置通過。demo 新增明確評估、僅 IR 調整、重複樣本去重及停用／離線狀態測試。瀏覽器已操作「保存並立即評估」，看到「設定已保存；已評估：溫度在容許範圍，保持補償」，再按「立即評估」可再次取得結果。室溫 26.4°C、舒適目標 26°C、IR 25°C 保持不變。只驗證模擬互動，未觸發正式後端或家電。

## 2026-09-08 空調室溫補償（v1.42.0）

22 項測試、ESLint 及 Next.js production build 通過。新增 demo 設定保存／重載、目標與 IR 溫度分離、設定不操作空調或排程、手動控制重置 IR、參數拒絕，以及真實 BFF route 的匿名／kid Session 拒絕測試（後端呼叫為 fake）。

本機 demo 已操作啟用回饋、展開進階設定、修改評估間隔並保存，确认舒適目標及 IR 溫度沒有因設定保存而改變；桌面及 390×844 viewport 視覺檢查通過，手機沒有橫向溢出。API 失敗情境顯示資料未取得提示，測試後恢復正常資料及桌面 viewport。這不等同 iPhone Safari 實機驗證，也沒有測量實際冷氣的溫控效果。

## 開發檢查

```sh
npm ci
npm run test:demo
npm run lint
npm run build
```

`test:demo` 實際執行 `tests/*.test.ts` 全部測試，包含模擬 API、query store、私人 route 身分邊界與劇院元件；route 測試的後端仍為 fake。瀏覽器操作依 [demo 說明](demo-mode.md)，不要用正式憑證啟動測試模式。

純文件／註解變更檢查差異、連結及不改行為即可，不需為此重跑 UI 或 bump 版本；GitHub 自動 CI 仍依 [設定](../.github/workflows/ci.yml) 執行。

## 2026-09-06 驗證紀錄

| 範圍 | 已觀察／驗證 | 不能推論的事項 |
| --- | --- | --- |
| `b1640d6`／v1.38.0 | 20 個測試、lint、build 與 CI 通過 | 不等於正式登入與所有硬體控制測試 |
| 本機 demo | 劇院開關儲存期間全部停用、回讀與重新整理保留模擬設定、健康提示渲染 | 不執行真實 KEF 訂閱、設備喚醒或 agent 更新 |
| 正式 Dashboard | 可見 v1.38.0，能讀劇院摘要、兩程序版本與 Apple TV 運行狀態 | 不代表所有裝置可控；服務資料也會過時 |
| 手機畫面 | 先前有響應式 UI 整理；本次劇院整合以桌面瀏覽器觀察 | 不宣稱已完成 iPhone Safari 實機驗證 |

CI：[v1.38.0 執行紀錄](https://github.com/CZLin-TW/Dashboard/actions/runs/34017951441)。未來變更需記錄當次版本與實際結果，不能沿用上表當成新版本證明。

三個 repo 的責任與部署順序见 [系統導覽](https://github.com/CZLin-TW/home-butler/blob/main/docs/system-overview.md)；劇院硬體驗證由私人 theater-agent 的文件記錄，不複製部署憑證到本 repo。

## 2026-10-04 TCMb / TCMz integration (local only)

Optional smc_temperature={tcmb_c,tcmz_c} travels collector -> strict backend schema -> bounded current/history -> Dashboard. No CPU/GPU field reuse. Null, unsupported and missing sensors remain unavailable; labels disclose AppleSMC, OSHI interpretation and unconfirmed M6 mapping. New temperatures have in-memory history only (maximum 24h); existing Sheet columns are unchanged and restart loses this history. Old agent payloads remain compatible.

Backend: 253 offline tests passed; after adding the child-timeout/invalid-value case, all 7 targeted collector/schema tests passed. Dashboard: 39 tests, typecheck, lint and production build passed. Native staged sender fake-only tests passed for strict nested fields, ranges, booleans, nulls and unknown fields; no Keychain/network access. Actual localhost demo UI confirmed TCMb value/line, TCMz unavailable and source/retention labels. IAB screenshot tool failed, so no pixel screenshot verification claimed. No push, deployment, runtime/LaunchAgent/Keychain changes.

Mobile DOM verification: 390px viewport, document scrollWidth390; TCMb label/value, TCMz unavailable and source text present. Real collector Python -I sample (stdout only, no send): TCMb46.3C, TCMznull.


## 2026-10-05 loopback HB transport milestone

Server-side HTTP transport已實作，預設disabled且production拒絕fixture設定。
GET status/config及PUT config保持session/grant/Origin/schema邊界；preview仍unavailable。
53 unit tests（含4項真正HTTP socket）／全repo ESLint／TypeScript／Next webpack build通過。
build初次sandbox無法取得公共Google字型，限定build網路重跑通過，未改layout/config。
已建置產物next start browser9/9通過（6.3s），沒有啟動Next dev。

`scripts/test-vision-live-fixture.ts`由HB三repo runner呼叫，
用真HTTP BFF→HTTP HB→mini outbound WS→temporary fixture磁碟驗證；兩client同revision
取得200/409、舊revision拒絕，reload確認保存。沒有正式端點／credential／相機／HA publish。
詳見vision-http-fixture.md；正式部署與media relay仍須分別批准。

## 2026-10-06 Dashboard native synthetic preview (v1.65.0, local only)

Reusable React preview uses authenticated same-origin BFF leases with independent
preview permission, single viewer, bounded TTL and no automatic retry. Late offer
cancellation and late heartbeat after stop have regression coverage. Production
activation remains disabled; no camera, model inference, HA or external relay.

67 unit/API tests passed, including 8 media-server and 6 native-client tests;
repository ESLint, TypeScript and `npm run build -- --webpack` passed. Default
Turbopack build was cancelled after no progress; the previously verified webpack
path completed without configuration changes. Existing synthetic application UI:
9/9 passed on built `next start` (6.6 seconds). The offline assertion was narrowed
to the status error because the independent native preview can now show a second
alert; authentication assertions remain unchanged. No `next dev` was started.

Real-component/native integration evidence and mobile screenshots are kept under
`artifacts/native-dashboard/`; see [scope and reproduction](vision-native-preview.md).
Single-process fixture proof does not establish multi-worker Next deployment,
Safari/iPhone behavior or immediate server-side JWT logout revocation.

Actual React → authenticated HTTP route handlers → Python native WebRTC →
Chromium 140.0.7339.186: 9/9 integration checks passed, exit 0, owned native server
confirmed stopped. Received VP8 640×360; pixel frame ID 3→4, decoded frames 4→5,
bytes 8023→9437; selected ICE pair loopback, zero ICE servers. Checks include
401/403, cross-user lease isolation, explicit stop, late-response cancellation,
hidden/unmount/navigation, TTL/no retry, portrait/landscape and no page errors.
Late cancellation after BFF completion proves no UI resurrection and native TTL
cleanup, not immediate cancellation. A test initialization error on about:blank
was fixed by guarding absent mediaDevices; no product failure was concealed.
Screenshots precede the final success-message wording correction; final webpack
build includes that correction. Viewport emulation is not iPhone Safari evidence.

## 2026-10-06 actual Next start media integration (v1.65.1, local only)

`test-native-next.py` exercised the production webpack build through real Next
16.2.1 `start`, `/vision`, session proxy and BFF routes: 13/13 checks passed.
Production runtime rejected media despite fixture flags; the same build streamed
only with explicit test runtime. Chromium140 received native VP8 640×360, pixel
ID3→4, decoded4→5, bytes8026→9383, loopback ICE pair and no STUN/TURN. Cross-route
state/heartbeat/stop shared one lease, another viewer got409, another user could
not stop it, and stop/cancel/re-entry/navigation/TTL checks passed. Restart lost
BFF lease ownership as expected: old lease404 and native TTL closed the orphan.
This is not durable ownership or multi-worker support. Owned Next/native processes
were stopped; no external browser requests were observed.

First actual-page run exposed two integration issues: NextURL canonicalizes
numeric loopback to localhost, so the runner now uses canonical localhost Origin
without changing strict server Origin validation; embedded light text needed its
own dark background inside Dashboard's light card, now fixed and visually checked.
Native artifacts: `artifacts/native-next/verification.json`, portrait/landscape
synthetic screenshots. No WebKit binary was installed, so there is no Safari or
real iPhone claim. DOM visibility events are not a physical mobile background test.

69 unit/API tests, repository lint, TypeScript and webpack build passed. Existing
application UI9/9 passed (6.4s). Full-site authentication was unchanged. Formal
activation recipients/credentials/data/cost and independent work boundaries are
summarized in `vision-native-preview.md`; none of those external actions occurred.

## 2026-10-06 authority consolidation and three-service path (v1.66.0)

Read-only GitHub deployment metadata confirmed Vercel Production deployments;
therefore Next process affinity is not assumed. Added a stateless HB BFF path,
dedicated HB media authority/WS and mini outbound connector. New signaling is
Dashboard → HB → mini outbound WS → native, not Dashboard → native loopback.
The bounded `test-native-hub.py` integration passed9/9 on its first complete run.
Two independent built Next instances shared one HB lease; a Dashboard restart kept
that lease, while HB restart rejected new offers during unknown quarantine.
The Next child sandbox permitted only owned Next/HB ports; a probe confirmed
native HTTP was denied. Actual browser VP8 640×360 advanced pixelID3→4 with
loopback ICE and zero STUN/TURN. Grant revoke, WS loss, TTL/no retry, actor
isolation and all-owned-process cleanup passed. Evidence/screenshots:
`artifacts/native-hub/verification.json`, portrait/landscape synthetic PNGs.

Independent code review found and fixed await-boundary credential expiry/revocation,
wall-clock-based quarantine and inactive-state loss of unknown semantics. HB now
uses monotonic quarantine; native connector rechecks before dispatch/publish;
BFF preserves the authoritative unknown reason. Final HB325 tests passed3.100s,
floor167 passed8.444s, Dashboard72 tests plus lint/typecheck/webpack build passed.
HB commit24b81aa5d9a7454b73cbab29c0e7bb931054038a;
floor commit1f5a326b97d0094fbde698c961c4f01b420c4854.

No formal TLS adapter/provider, durable enrollment/revocation, multi-HB coordination,
TURN, camera, iPhone or production deployment is claimed. This milestone is not
production-ready; see `vision-deployment-review.md` for the exact remaining list
and delayed credential creation/activation order. Existing services were untouched.

## 2026-10-06 status-only TLS pilot (v1.67.0, not activated)

Implemented fixed-host verified HTTPS BFF, server credential-provider abstraction,
post-await JWT/grant/credential/deadline checks and explicit denial of config/edit/
media. HB implements default-off main route registration, digest-only private
SQLite enrollment/revocation, fail-closed reads and a single-filesystem authority
lock. Floor implements a protected-file provider and explicit bounded production
WSS CLI with system trust, no proxy/redirect/retry and status.get-only execution.

Independent read-only security review found no remaining blocker for isolated TLS
validation after final deadline/re-authorization fixes. `test-status-pilot.py`
passed9/9: actual built Next HTTPS → HB official status installer/SQLite → verified
outbound WSS floor; wrongCA/hostname rejected before ASGI on both clients; writes/
config/media refused; service/device revocation survived restart; invalid/expired
providers made no network request. Temporary CA/keys/credentials/DB removed, all
owned processes stopped, no trust-store change. Evidence is
`artifacts/status-pilot/verification.json`.

Final Dashboard75 tests, lint/typecheck/webpack build passed. HB334 tests passed;
floor183 tests passed8.907s. HB0098e33e57b605ddc5a582590e96fcf527242a5a;
floor5e9ca7bf72f98d3209c7e9f96f2031df0d2b1b2c. Synthetic metadata does not validate
camera/model/occupancy. Actual Render/Vercel secrets, persistent mount, singleton
platform configuration and public TLS endpoints remain unconfigured/unverified.
See `vision-status-pilot-operations.md` for concentrated approval and rollback.

## 2026-10-06 credential/storage proposal correction (docs only)

The default mini credential proposal is a dedicated native Keychain broker, not
a plaintext token file. Python file credentials remain fixture-only; native
source/mock validation does not establish signing, installation or real Keychain
acceptance. HB already uses Google Sheets, so a paid Render disk is not assumed
mandatory. The current SQLite adapter is the least code change for strict fresh
revocation checks; a Sheets registry requires additional quota/consistency work.
No storage purchase, deployment, credential or Keychain operation occurred.
Documentation diff checked; no application code/version change in Dashboard.


## 2026-10-06 Dashboard1.69.0 owner-only HTTP health

85/85 unit tests, lint/typecheck and production webpack build passed.
The updated test-status-pilot.py passed13/13 real Next + verified TLS/WSS + fake
Sheets checks: owner page200, other granted member/missing pin page404 andAPI403,
unreachable/invalid/denied refresh clears prior health, responsive mobile/desktop,
no image/edit controls, current revoke and fail-closed TLS. All child processes
stopped and temporary material removed. Evidence: artifacts/owner-health/
verification.json and annotated owner/nonowner screenshots. Health payloads were
simulated; the fixed native HTTP adapter was not run against8768/8771. This is
not camera/model, Keychain, real owner identity or deployment acceptance. The
historical9-case VisionPanel demo-page suite is superseded, not reported passed.


## 2026-10-06 native package preparation and rollback correction (docs only)

Documented completed native enrollment/manual reconnect/packaging source and its
unsigned inactive package, 200 Floor tests and bounded mock soak. Published Floor
rollback is main 9772b55; unrelated original local 837f544 is a separate live-source
reference, never an overwrite target. Owner identity remains unverified, with the
exact authenticated mapping procedure and actual Sheets read scope documented.
No Dashboard application code or version change (1.69.0); diff check passed.
Signing, Keychain, installation, production network and deployment remain unrun.


## 2026-10-06 approved activation preflight (docs only)

Batch authorization received with a seven-day native enrollment period. Activation
paused for actual Render single-authority/rollout and SPREADSHEET_ID verification;
Render documentation establishes ordinary zero-downtime instance overlap. Public
code-signing identity lookup returned zero valid identities. No secrets, Sheet
writes, signing, install or push performed. User confirmed member uniqueness and
enabled status; no identity inserted into fixtures. Documentation diff checked.


## 2026-10-06 status-only rollout and identity correction (docs only)

Replaced the exclusive-authority setup with per-instance fail-closed status routing;
no disk, household suspension or false single-authority ACK. Media remains off.
Corrected zero-valid-identity inference: original self-signed camera identity exists,
and its installed app passes a pinned public-certificate requirement without trust
changes. Source package codesign inline requirement syntax was corrected separately
in Floor. No private key bytes/secret or identity metadata copied into fixtures.


## 2026-10-06 overlap-compatible status regression

HB359/359 including five two-instance tests; Floor201/201 including inline
codesign requirement regression. Existing production-built Dashboard + loopback
verified TLS/WSS + fake Sheets suite13/13 passed against the updated HB. All owned
processes stopped and temporary fixture material removed. No real Sheets/native
Keychain/signing/installation/production deployment tested. Dashboard code and
version unchanged; docs diff checked.


## 2026-10-09 zone editor entry (v1.72.0)

`tests/zone-editor.test.ts` 3/3 (config validation, ticket contents and expiry,
fragment-only entry address); full `tests/*.test.ts` 89/89; lint, typecheck and
`next build` clean. A ticket produced by this code with a throwaway key was accepted
once and refused the second time by the home machine's gateway code. Not verified:
the deployed route with real environment variables, the redirect on iPhone Safari
or the installed PWA, and the kid role against the deployed proxy.
