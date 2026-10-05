# 視覺感測整合：階段與驗收

此分支僅第一階段，尚未部署。現役 mini 安裝、相機、ROI、Keychain 與網路維持原狀。

來源：Dashboard main `755f5f8`、home-butler main `cd5da63`、floor-presence main `9772b55`。
Floor Presence 的乾淨來源採獨立開發命名空間，不能直接覆蓋現役安裝。

| 階段 | 交付與驗收 | 尚需決定／授權 |
| --- | --- | --- |
| 1：Dashboard 頁面與權限契約 | 手機直向控制、橫向預覽區；狀態／預覽／修改三種伺服器權限 default deny、kid deny、expired session 拒絕；未接通明確 unavailable；僅 demo 提供合成畫面與設定草稿、取消、復原、重複送出防護。手機／桌面 UI、權限、lint、typecheck、build 測試。 | 本機程式與合成測試已授權。無正式影像、串流或 ROI 寫入。 |
| 2：專用控制通道 | mini 主動連 HB 的 vision 專用協定；裝置 scope、短期操作授權、撤銷、request ID、revision 衝突、timeout unknown 不重送、斷線／重連與限流；固定命令 allowlist，不能代理任意 URL。 | 部署位置、裝置身分與金鑰保存／輪替、對外通道實際建立須確認。不得重用家庭 API key 或 HA socket。 |
| 3：媒體與 ROI | 獨立 WebRTC 媒體會話與 relay fallback；Dashboard 內嵌按需預覽、關閉／離頁／TTL 到期停止、背壓與有限緩衝；同影格結果對齊、凍結後才編輯 normalized polygon；大觸控點、undo/cancel/save、手機橫向測試。 | 媒體供應商／TURN、費用、家庭影像經哪些雲端節點、短期憑證與服務部署須確認。控制通道不能塞大影像佇列。 |
| 4：本地 occupancy → HA | 真 detector 接入地面點、追蹤與 debounce，再接本地 MQTT Discovery 或正式 HA integration；unknown 與 unavailable 分離、斷流不當無人、恢复需新鮮影像。 | 真相機驗證、MQTT broker publish／HA 寫入及安裝須個別授權。 |

階段 2 的媒體會話契約應預留第 3 階段所需的 frame/geometry ID、短期授權與取消；不先鎖定供應商。第 4 階段可在控制契約穩定後平行排程，無需依賴雲端預覽才能讓本地 HA 自動化工作。

## 第一階段正式模式

`/vision` 提供頁面外殼，所有資料及操作仍經 `/api/vision/v1/*` 驗證。UI 隱藏／disabled 不是授權。
伺服器設定 `DASHBOARD_VISION_GRANTS` 將已驗證使用者 ID 映射至 `status`、`preview`、`edit` 權限；預設空、錯誤設定拒絕，沒有成員預設全開。此分支沒有設定任何實際授權。
通道未實作；有權限的操作仍回 503，不會傳給 HB、HA、相機或 mini。
影像／session 回應不得持久快取，操作不自動重送；相機秘密只由本機原生介面管理，沒有 getter。

## 合成驗證

使用既有獨立 demo：`npm ci`、`npm run demo`，僅 `127.0.0.1:3001`。
所有 vision demo 請求由 simulator 處理；合成成功不代表正式儲存、串流、影像或相機成功。
`npm run test:demo` 檢查真實 route 的 session／權限邊界及 simulator；`npm run test:vision-ui` 檢查手機與桌面合成互動。首次安裝瀏覽器可執行 `npx playwright install chromium`。
本機 viewport 不是 iPhone Safari 實機驗證。正式權限測試與 demo UI 測試分開。

完成第一階段後回報並停在階段邊界，不自行部署或開始連線。
