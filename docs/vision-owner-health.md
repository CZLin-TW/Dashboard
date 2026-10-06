# Owner-only HTTP 健康頁（1.69.0，未部署）

`/vision` 在 SSR render 之前，用既有有效 JWT 衍生的身分向 HB `/api/vision/v1/access` 查詢。只有明確 owner pin＋目前啟用的家庭 member＋status grant 才能進入。缺少 owner pin、另一個有 status grant 的 member、HB 無法驗證時不呈現頁面；404 不會被當作已登入即有權。API 仍獨立驗證，不能靠頁面 gate 替代。真 owner pin 尚未核對／設定，正式缺省全部拒絕。

HB 為 owner／membership／grant authority；Dashboard 不猜 LINE ID，不以 SIRI_USER_ID 或本地 grants 覆蓋它。既有登入／API key／kid 邊界不改。正式核對與發布影響見 [release review](vision-phase1-release.md)。

## 資料與畫面

只接收 `adapter=local-health` 的精確白名單：available、reason 與 service 的 reachable/app_version/mode/config_schema。成功時 metadata 全部必須有效；失敗時全部為 null。額外字段、URL、越界/非整數 schema、尾換行 semver、synthetic detector metadata 都拒絕。

画面分開表示：

- **mini → HB 通道**：這次收到 mini 的有效回報。
- **本機服務 HTTP 健康**：健康端點是否有效回應。即使 HTTP 未回應，mini 通道仍可能已回覆。

只列服務版本、執行模式、設定格式版本和 Dashboard 本次收到時間。沒有來源 timestamp，因此不能說影像／模型結果是新鮮的。HTTP200 不代表相機、YOLO 或區域 occupancy 正常。頁面無影像、模型調校、ROI、媒體或家電入口；重新讀取是唯一操作。失敗/撤權/無效 payload 清除舊健康資料，不保留假成功。

## 本機驗證

85 unit、lint、typecheck、webpack build 通過。使用目前 build 執行 `npm run test:vision-ui`，或從工作區根目錄執行：

```sh
NODE_BINARY=/path/to/existing/node \
PLAYWRIGHT_BROWSERS_PATH=/path/to/existing/browser-cache \
.local/phase2-venv/bin/python \
.local/phase1/dashboard/scripts/test-status-pilot.py
```

現有 phase2 Python、Chromium 與 OpenSSL 即可，不安裝依賴、不改 trust store。13 組 real Next＋verified TLS/WSS＋fake Sheet/member/owner checks 通過；UI 在 390×844、844×390、1440×1000 驗證無水平溢出、無影像/編輯控制、無效 JSON 不外露內容、HTTP失敗與撤權清除舊資料。

證據為忽略的 `artifacts/owner-health/verification.json`、`owner-simulated-health-390x844.png`、`owner-simulated-health-1440x1000.png`、`nonowner-denied-page.png`。截圖標示「隔離驗證 · 假 health 回應」，沒有私人身分或影像。`vision-health-device-fixture.py` 只從臨時檔讀 **simulated health payload** 經 WSS 回報；沒有讀取真實 localhost8768/8771，也沒有執行原生 HTTP adapter。不能將此驗證說成真服務/相機驗收。

舊 VisionPanel 與原生媒體模組保留為獨立可重用模組。舊 `playwright.vision.config.ts`／9 個 demo-page cases 已標註歷史用途，因真正 `/vision` 已改為 owner-only，這次不宣稱舊 page suite 通過；新的 `test:vision-ui` 入口驗收現在的頁面。
