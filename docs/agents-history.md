## 2026-10-06 v1.69.0: owner-only HTTP health (not deployed)

The actual /vision SSR page checks HB owner pin, enabled membership and status grant before rendering. Missing/non-owner access denies. Read-only cards distinguish mini reply from local HTTP health; strict metadata has no image/model/ROI controls. Previous modules remain; historical 9-case demo-page suite is not counted as new page acceptance. 85 unit tests, lint/typecheck/webpack build and13 fake-Sheets TLS/actual Next browser groups passed. Screenshots explicitly label simulated health; no live8768/8771, camera or production host was contacted. Actual owner pin, native HTTP/Keychain and deployment remain unverified.

## 2026-10-06 v1.68.0：視覺狀態沿用家庭登入與 HB 授權（未部署）

status-only pilot 不再要求第二個 vision service token、Dashboard 本地 grants 或 SQLite。沿用既有 LINE/JWT 與 server `HOME_BUTLER_API_KEY`，只轉送驗證後的 user/member role/session expiry；HB Sheets snapshot 是成員與分權唯一 authority。固定 verified HTTPS、default deny/kid deny、7 秒上限、晚到回覆再驗權限，preview/edit/media 仍未啟用。mini 的獨立原生 Keychain device credential 邊界不變，未實際簽名、註冊、讀取或驗收 Keychain。全80 tests、lint/typecheck/webpack build 與10組 fake-Sheets TLS 整合通過，沒有正式 Sheets、相機、憑證或部署操作。

## 2026-10-05 v1.64.0：視覺感測第一階段（本機分支，未部署）

新增手機友善 vision 頁面、可注入 transport、default-deny 伺服器 status／preview／edit 授權，以及隔離合成互動。正式通道與媒體未接通，現役 mini 不變。

## 2026-10-03 v1.62.0：Mac mini 電腦指標顯示（未部署）

電腦卡顯示主機名稱、IP 與 RAM；缺值明確 unavailable，沒有溫度歷史不畫溫度圖。Demo 增加 Mac mini 與 Windows 並列，保持既有 API 與劇院綁定語意。home-butler 新增獨立 macOS collector，正式接入尚未部署。

## 2026-10-03 v1.61.4：首頁排程編輯草稿保留

首頁釘選設備排程每 15 秒背景更新時，載入／失敗提示不再替換整個排程區。
成功讀取後保留元件與新增／編輯草稿，首次讀取仍等待成功才提供表單。
API、後端與設備控制不變。

## 2026-09-28 v1.61.3：排程編輯時間格式

修正 Sheet 讀回未補零的 `7:00` 直接帶入原生時間欄位而顯示空白的問題；
日期／小時先補零，不改時區或實際排程時間。比對時忽略補零差異，API 定位仍傳原始值。
列表 key 改用正規化的排程身分，避免其他列增刪或格式更新時重建編輯表單。
demo 增加未補零的自動排程案例；後端、HA 與 API 契約不變。

# v1.61.1 排程自動同步

## 2026-09-23 v1.61.2：同名待辦完成定位

本 repo 僅更新系統顯示版本；LINE／Siri 的任務 ID 定位與同名澄清修正位於 home-butler。Dashboard 原有 ID API 契約、UI 與 demo 不變；發布時先後端再 Dashboard。本次未部署。

首頁展開設備控制面板與裝置頁停留前景時，每 15 秒自動讀取排程；回到分頁立即更新。首頁面板收合或分頁在背景時不輪詢排程。HB 每 60 秒觀察開機後建立排程，因此仍有後端觀察及下一次讀取的延遲，不需手動重新整理。
沿用共用 query store 與可見性刷新，不新增排程或重送設備指令。

# Dashboard 版本變更紀錄

## 2026-09-20 v1.61.0：待辦提醒區域複選

新增／編輯待辦及建立週期模板可選多個既有照明區域；單區域舊資料保留。
固定 breathe、每區域每分鐘最多一次、完成／停用後停止，提醒頻率與效果不變。
本次不統一 HA 區域、不新增效果編輯器。先後端再前端部署，HA 整合無需重裝。
多區域存於既有「燈光區域ID」JSON 陣列，退版後端需保留解析能力，避免多區域提醒失效。

這裡是**歷史**：每個版本當時的決定與限制，按時間新到舊排列。
目前行為一律以 [AGENTS.md](../AGENTS.md) 的現況章節與程式碼為準；
**不要把這裡的舊版描述改寫成最新版**。若某條舊限制到現在仍然成立，
它應該同時出現在 AGENTS.md 的現況章節。

# v1.57.0 自動關機改用一般排程編輯

使用者要求時數只在 Sheet「自動關機小時數」管理；Dashboard 移除設定面板與 BFF，舊後端 POST 回 410。
HB 每 60 秒觀察 HA，首次 on 依 Sheet 產生來源「自動（HA）」的一筆排程；正整數時數變更用於下輪，0 取消本輪。
Dashboard 原排程區可編輯時間／同一空調參數或刪除，不能編輯未知／失敗結果；刪除後不補回。
以來源與既有 JSON metadata 追蹤本輪；_auto_edited 保留修改，_auto_deleted 的已取消列是隱藏去重紀錄，確認 off 前不能封存。
確認 off 只取消本輪尚未執行的 off；另建的手動排程完全保留。若明確編成 on／調溫則結束 cycle、保留為一般未來排程。
已關閉的成功／取消 cycle 可獨立封存，即使該設備還有未來手動排程。下次 on 才依 Sheet 重新產生。
v1.56 _auto_paused 舊列會恢復為可編輯排程，保留期限；不再因另有手動 off 隱藏或重建此列。
排程增改刪與背景 reconcile／dispatch／archive 共用 cycle lock；寫入前查即時列，歧義拒絕。未知結果不重送。
不新增 Sheet 欄位或 HA 自動化，HA 組件不用更新；不可用家庭家電操作測試。詳見後端 docs/ac-auto-off.md。

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

v1.46.0 HA 空調遷移：後端 controlProvider=home_assistant 時，Dashboard 使用整數溫度，隱藏回饋補償；v1.55.0 恢復明確手動排程，舊自動排程仍停用。HA 是狀態來源，失聯顯示未知並停用控制；命令結果未知不可自動重送。其餘設備行為不變。SwitchBot Cloud 仍走雲端，IR 狀態是最後指令而非實體回讀。


v1.45.0 空間感測：`home-assistant-panel.tsx` 只讀 HA 的選定觀測，一般成員可見、
kid 不開放。BFF 驗證 session；資料只在 query store 記憶體保存。
`age_seconds` 加瀏覽器本次讀取後經過時間判斷過期，不比較兩台電腦的絕對時鐘；
失敗、過期、unavailable 均顯示未知，不能把 false／0 與缺值混淆。

v1.51.0：照明 API `agent_id=home_assistant` 顯示 Home Assistant；Hub `light_level` 為 1–20 級，
`source=home_assistant` 的 age_seconds 是 HA 同步年齡，不是設備量測時間。原感測歷史維持五分鐘，
HA 失聯 current 數值 null、history 保留。不得由 demo 通過推定家庭已啟用後端切換旗標。

v1.44.0：空調回饋 interval_min 可設整數 1–30、min_adjust_min 可設整數 1–60；預設仍 5／10 分鐘。後端 valid_config、Dashboard 進階欄位與 simulator 必須一致。回饋啟用且冷暖房開機時，其感測器約每分鐘取值；其他背景讀取及歷史仍每 300 秒。sensor_polling 共用每 ID 的鎖與每個 60 秒時段內的讀取結果，sensor_state.update_current 不寫歷史。1 分鐘查詢不等於設備有新測量，保留樣本去重、冷卻等待、關機／未知結果限制。

# 空調回饋與半度（未遷移設備才適用）

v1.43.0：空調目標步幅 0.5°C，不可用 parseInt 讀取。未啟用回饋時後端四捨五入；命令確認依 POST 的 state.lastTemperature（acAcceptedTemperature）輪詢，不能拿原始半度草稿等待。停用回饋設定後刷新父層裝置並清空草稿。demo 必須保留半度舒適目標與整數 IR 的區別，Apple Home 插件需 1.2.0。

v1.42.1：啟用時按鈕為「保存並立即評估」，無草稿時為「立即評估」；POST 明確傳 `evaluate_now`，無草稿不可傳 config 覆蓋後端。停用僅保存、不評估。顯示後端 `evaluation.status` 的實際結果，不把保存成功說成已發 IR；不可自動重送未知結果。

v1.42.0 空調回饋 UI 位於 `ac-feedback-panel.tsx`，首頁／裝置頁共用。`最後溫度`／`lastTemperature` 仍是舒適目標，IR 下發另讀 `/api/ac/feedback`；不要把补償值寫回面板或 HomeKit 目標。設定 API 必須驗證 Session 並拒絕 kid，後端只接受 owner Key。模擬設定需同步 fixtures、simulator、`tests/demo.test.ts`；保存設定不應觸發 `devices/control`。

## 2026-10-04 SMC temperature integration (unpublished)

Added independent optional TCMb/TCMz fields, strict validation, bounded memory history, UI source labels and null handling. No Sheet-column additions or credential changes. Dashboard version prepared as 1.63.0.


## 2026-10-05 vision loopback HTTP integration

新增server-only固定127.0.0.1 HTTP transport與既有route wiring；production仍拒fixture，
不跟redirect／不重試，strict回應validation。53 unit、lint/typecheck/build、9 UI通過，
三repo實際HTTP/WS/fixture writer串接完成。未部署；media與正式connector仍未啟用。

## 2026-10-06 isolated native media Next runtime validation

Added a bounded real `next start` integration runner for the production build.
Streaming remains confined to explicit test runtime; production runtime keeps
media disabled. The media gate reads runtime NODE_ENV without build-time inlining,
and fixed branded errors preserve safe code/status across separate route bundles.
Process-local lease limits, restart behavior and the unapproved external activation
proposal are documented in `vision-native-preview.md`. No site-wide authentication,
production credentials, camera, HA, provider enrollment or deployment changes.

## 2026-10-06 HB media authority consolidation (v1.66.0, isolated)

Vercel deployment metadata ruled out reliance on a Dashboard singleton. The new
BFF is stateless and delegates leases/revocation to a dedicated HB media channel;
mini initiates the WS and owns local native cleanup. Unknown/restart quarantine
uses monotonic time, await boundaries recheck credentials, and unknown remains
unknown in state responses. Local two-Dashboard/three-service synthetic validation
passed; formal TLS credentials, provider enrollment, relay and deployment remain
unfinished and unauthorized. No short-lived credentials should be minted until
an approved activation window.

## 2026-10-06 reviewable status-only pilot code (v1.67.0)

Added fixed HTTPS/WSS clients and injectable credential providers, HB persistent
digest registry/revocation and explicit main route gates. Pilot masks broader
Dashboard grants and denies config/edit/media; no fallback to old fixture when
pilot credentials are unavailable. Post-await authority checks close expiry/
revocation races. Offline TLS+restart acceptance passed. This completes the code
milestone for status-only pilot review, not activation, media enrollment or a
Keychain adapter. Formal storage/credentials/hosting changes await explicit approval.

## 2026-10-06 credential/storage proposal correction (docs only)

The default mini credential proposal is a dedicated native Keychain broker, not
a plaintext token file. Python file credentials remain fixture-only; native
source/mock validation does not establish signing, installation or real Keychain
acceptance. HB already uses Google Sheets, so a paid Render disk is not assumed
mandatory. The current SQLite adapter is the least code change for strict fresh
revocation checks; a Sheets registry requires additional quota/consistency work.
No storage purchase, deployment, credential or Keychain operation occurred.
Documentation diff checked; no application code/version change in Dashboard.


## 2026-10-06 native package preparation and rollback correction (docs only)

Documented completed native enrollment/manual reconnect/packaging source and its
unsigned inactive package, 200 Floor tests and bounded mock soak. Published Floor
rollback is main 9772b55; unrelated original local 837f544 is a separate live-source
reference, never an overwrite target. Owner identity remains unverified, with the
exact authenticated mapping procedure and actual Sheets read scope documented.
No Dashboard application code or version change (1.69.0); diff check passed.
Signing, Keychain, installation, production network and deployment remain unrun.
