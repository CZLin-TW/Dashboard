# Dashboard 版本變更紀錄

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
