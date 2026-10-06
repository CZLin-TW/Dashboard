# 原生預覽三服務合成驗證

2026-10-06，Dashboard 1.66.0／Next 16.2.1／Chromium 140.0.7339.186：`scripts/test-native-hub.py` 首輪 9 組檢查通過。使用已建置 `next start`、實際 `/vision` 和 proxy，未使用 Next dev 或模擬 HTTP handlers。

控制路徑是兩個獨立 Dashboard process → 同一 HB media authority HTTP → mini 主動建立的 WebSocket → native Python sender HTTP。合成影格由 native 經 WebRTC 傳到瀏覽器，HB 不轉送影格。未接相機、模型、MQTT 或 HA。

Next child 的臨時 sandbox 只允許自身與 HB 的 HTTP port，以及 Unix IPC；沒有 native HTTP port 權限。以相同 sandbox 發出的無憑證 native GET probe 確認連線被拒。Dashboard runtime 只設定 HB fixture port/token，沒有 direct native 設定。其他子程序沿用 loopback-only sandbox，沒有外部 STUN/TURN。

通過項目：

1. Production runtime 拒絕預覽；JWT／preview grant／CSRF 生效，Next 不能直連 native。
2. 實際 VP8 640×360；燒入的 frame ID 3→4、decoded frames 4、bytes received 8167，selected pair 為 loopback，iceServers 為空。
3. 兩 Dashboard 共用單 viewer；跨 instance state／heartbeat／stop 成功，同 actor 重複 stop 安全；其他 actor 不能讀取或操作該 lease，第二 viewer 回 409。
4. 一個 Dashboard process 重啟後，HB lease 可由另一 instance 維持，重啟後仍可讀到 active state。
5. TTL 清理 native，UI 停止且不自動重送 offer。
6. HB 撤銷 synthetic-alice preview grant，回 403 並清理 active lease。
7. Outbound WS 中斷後 native 停止；HB 拒絕新 offer並保留 unknown quarantine。
8. 另一個全新 native case 驗證 HB 重啟：舊 lease 無效，新 offer 回 503／media_result_unknown，不跳過 67 秒 quarantine。
9. 無 browser page errors、無外部請求嘗試；全部自建子程序已停止。

`--fresh-native` 僅用於剛啟動的新 native process 的第一次 HB 啟動；實際 HB restart 不帶此旗標。兩個破壞連線的 case 使用兩個依序建立、完整清理的 native 生命週期；不縮短安全等待。

## 重跑

先用專案既有流程建置 Dashboard。從工作區根目錄執行：

```sh
NODE_BINARY=/path/to/existing/node \
PLAYWRIGHT_BROWSERS_PATH=/path/to/existing/browser-cache \
.local/phase3-venv/bin/python \
.local/phase1/dashboard/scripts/test-native-hub.py
```

Native 使用呼叫 wrapper 的 Python；HB／connector 預設使用現成 `.local/phase2-venv/bin/python`（包含 websockets）。可設定 `DASHBOARD_CHECKOUT`、`FLOOR_CHECKOUT`、`HB_CHECKOUT`、`WIRE_PYTHON_BINARY` 或 `CHROMIUM_BINARY` 指向其他既有隔離路徑。Runner 不安裝、不建置、不修改持久設定；Node watchdog 140 秒，Python 外層 150 秒。

忽略的本機證據：`artifacts/native-hub/verification.json`、`portrait-synthetic.png`、`landscape-synthetic.png`。JSON 無 SDP、candidate 位址、session token 或上游憑證。390×844、844×390 通過無水平溢出檢查並目視確認。

## 界線

Chromium touch emulation 不代表 iPhone／WebKit，後兩者未安裝或實測。HB 使用公開 synthetic credential/provider，未接正式帳號。只有單 HB authority；未驗多 HB instance、LAN／雲端傳輸、TURN、真相機或手機背景生命週期。等待結束後重開由單元測試涵蓋；本輪整合未等 67 秒後再開串流。
