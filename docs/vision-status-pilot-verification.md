> 歷史紀錄：本頁為 v1.67.0 的 SQLite／第二 service token 驗證；v1.68.0 已改用家庭 API key 與 HB Sheets 授權。舊命令不是目前操作流程，當時 artifact 路徑已由新一輪驗證取代。請依 [目前操作](vision-status-pilot-operations.md) 與 [v1.68.0 驗證](vision-shared-auth-verification.md)。

# Status-only pilot 本機 TLS 驗證

2026-10-06，Dashboard 1.67.0／Next 16.2.1：`scripts/test-status-pilot.py` 最終 9 組檢查全部通過。使用真正已建置的 `next start`、HB `install_status_pilot`、持久 SQLite registry，以及 floor credential provider／WSS status client；只有合成狀態，不啟動相機、模型、媒體、MQTT 或家電 API。

鏈路是本機 HTTP 測試客戶端 → Dashboard 實際 JWT/proxy/status BFF → 驗證憑證與 hostname 的 HTTPS → HB status-only authority → 驗證憑證與 hostname 的 outbound WSS → floor synthetic status adapter。這不是 Render／Vercel 部署驗收。

Runner 用現有 OpenSSL 在新建的私有暫存目錄產生 local CA、正常 SAN 憑證、錯誤 hostname 憑證與另一個不信任 CA；不修改 OS trust store。只將指定 CA 傳給測試 TLS context；`rejectUnauthorized`／`CERT_REQUIRED`／hostname checking 均保持啟用。所有子程序限 loopback sandbox，沒有呼叫正式 endpoint。

通過項目：

1. Registry 以 0600 保存 digest；SQLite bytes 不含兩個測試 token 原文，installer 預設不安裝 route（404）。
2. Dashboard pilot 預設關閉；production runtime 不接受 loopback TLS fixture；JWT 與 grant 邊界生效。
3. 真 HTTPS＋WSS status 成功：`source=synthetic`、`online=true`，capabilities 僅 status，preview/edit 為 false。
4. HB 拒絕 config.get、detector.configure 及其他不支援 action；Dashboard 拒絕 config 讀寫與 media offer，即使假使用者原始 grants 包含 edit/preview。
5. HTTPS wrong CA／hostname 拒絕。Node 診斷分別為 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`、`ERR_TLS_CERT_ALTNAME_INVALID`。
6. WSS wrong CA／hostname 不能取得 welcome。第 5、6 項的 fixture ASGI counters 都沒有新增，確認拒絕發生在 HTTP／WebSocket application 之前，而非後續權限拒絕。
7. Service token 撤銷後 BFF 拒絕；重啟 HB 並保留同一 SQLite 後仍拒絕（直 HB 已知撤銷 token 回 403）。
8. Device token 撤銷使既有 WSS 結束；重啟 HB 後同 token 仍不能取得 welcome。
9. 不安全權限的 credential file、過期 floor credential、過期 Dashboard provider 均在建立應用請求前拒絕，ASGI counters 不增加。

所有自建子程序已停止；CA private keys、fake tokens、credential files、SQLite／lockfile 與憑證全部刪除。保留的 `artifacts/status-pilot/verification.json` 只含測試結果與安全錯誤代碼，不含 token、DB、private key 或使用者資料。

## 重跑

先使用專案既有流程完成 Dashboard build，再從工作區根目錄執行：

```sh
NODE_BINARY=/path/to/existing/node \
.local/phase2-venv/bin/python \
.local/phase1/dashboard/scripts/test-status-pilot.py
```

使用現有 Node、phase2 Python 與 `/usr/bin/openssl`；不安裝依賴、不建置、不改持久設定。可指定 `DASHBOARD_CHECKOUT`、`FLOOR_CHECKOUT`、`HB_CHECKOUT`、`WIRE_PYTHON_BINARY` 指向其他既有隔離 checkout/runtime。Node watchdog 140 秒，Python 外層上限 150 秒。

`scripts/status-pilot-tls-fixture.py` 僅包裝正式 installer 與純計數 ASGI wrapper；不 import household main。Fixture TLS listener 只綁 127.0.0.1；registry enrollment/revocation 使用正式 offline CLI，token 透過暫存 private file 提供，沒有放入 argv。

## 未驗收範圍

未接正式 token、hosting secrets、Render/Vercel、正式持久磁碟、LAN、實體相機或真模型。未啟動 production CLI 或正式 endpoint。測試是一個 authority 與一個 Dashboard process，沒有聲稱多 authority 協調或正式可用性。沒有新增或修改系統 trust store、服務安裝、tunnel 或對外 listener。
