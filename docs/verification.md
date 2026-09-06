# 驗證方式與範圍

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
