# 既有家庭驗證＋HB Sheets 視覺授權驗證

2026-10-06，Dashboard 1.68.0／Next 16.2.1。status-only pilot 沿用既有 LINE 配對/JWT 與 server `HOME_BUTLER_API_KEY`。HB 的成員＋明確 vision grants snapshot 是權威，不再另設 vision service token、Dashboard grants 或 SQLite。既有登入流程及全域 butler helper 未修改。

Dashboard 驗證 JWT、拒 kid，再產生唯一的 `X-Dashboard-User`、`X-Dashboard-Role: member`、`X-Dashboard-Session-Expires`；不轉送瀏覽器提供的同名 header，不把原始 JWT 送 HB。HTTP request deadline 受同一 wire deadline、JWT expiry、7 秒上限與 monotonic elapsed time 約束。回覆前重查 shared key、JWT 與 HB access。這次 activation 一律關閉 preview/edit/media。

## 證據

- 80/80 unit tests 通過，包含偽造 actor header、kid 共用家長 LINE ID、JWT 缺 expiry/過期、HB refresh failure、late revoke、API key rotation、回覆時 JWT 過期。
- ESLint、`tsc --noEmit`、正式 webpack build 通過。
- `scripts/test-status-pilot.py` 10/10：真正 built Next → verified HTTPS HB factory → verified WSS floor client。fixture 只讀本地 fake Sheets rows，沒有 SQLite 或真 Sheets API。
- Production/test fixture gate、default deny、成員/grant拒絕、重複請求共用 snapshot、reader failure立即拒絕舊 allow、late response再驗權限、mock source重啟撤權、device撤權、家庭 API key不能登入 device path，全通過。
- Wrong CA/hostname 在 HTTP/WS application 前拒絕；ASGI counters未增加。Node錯誤為 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 與 `ERR_TLS_CERT_ALTNAME_INVALID`。
- 所有 owned subprocess停止；暫存CA/privatekeys/fake tokens/rows移除。忽略的 `artifacts/status-pilot/verification.json` 不含 token、JWT、private key、真成員或裝置資訊。

TLS fixture 的 late-response case 先保留 HB 已產生的 HTTP response，再刷新假授權並釋放回覆，驗證 BFF 回傳前的授權重查。HB 的命令 await 前後檢查與 30 秒 refresh／60 秒最大 snapshot age 則另有 fake-clock unit tests；本輪不以真實等待 30/60 秒取代其時鐘測試。

## 重跑與限制

先完成既有 Dashboard build，從工作區根目錄執行：

```sh
NODE_BINARY=/path/to/existing/node \
.local/phase2-venv/bin/python \
.local/phase1/dashboard/scripts/test-status-pilot.py
```

可設定 `DASHBOARD_CHECKOUT`、`FLOOR_CHECKOUT`、`HB_CHECKOUT`、`WIRE_PYTHON_BINARY` 指向現有隔離環境。Runner 使用現有 OpenSSL 建暫存 CA，不安裝依賴、不改 trust store。Node watchdog 140秒、Python外層150秒。fixture控制檔的強制 refresh/response hold只存在測試 wrapper，沒有增加 production API。

Mini 的獨立原生 Keychain broker/device credential 未改；此測試用 private fake file驅動Python WSS fixture，不是實際 Keychain 讀寫或正式native驗收。沒有真LINE登入、Sheets、hosting secrets、Render/Vercel、相機、推論、ROI、媒體、MQTT/HA、服務安裝或部署。正式啟用仍依 [操作文件](vision-status-pilot-operations.md) 的單批授權與實機驗收。
