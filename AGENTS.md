<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI 開發與獨立測試模式

本專案已有可操作的模擬家庭，不需建立測試帳號或取得正式登入憑證。
新的 session 處理 UI、響應式排版或前端互動時，先讀 [測試模式說明](docs/demo-mode.md)，優先使用此模式驗證。

- 在不含正式 `.env.local` 或真實憑證的獨立 checkout 中執行 `npm ci`、`npm run demo`，開啟 `http://127.0.0.1:3001`；啟動器會設定 `DASHBOARD_DEMO_MODE=1`。
- 確認頁面頂端有「測試模式 · 模擬家庭」黃色列，再操作模擬設備。可切換正常、空資料、設備離線、API 失敗，或重設資料。
- 不要假設前一個 session 的本機伺服器、瀏覽器分頁或測試資料仍存在。需要時重新啟動；連接埠已占用時先確認服務身分，不要任意停止其他程序。
- 不移除正式環境的憑證來遷就 demo；改用獨立 checkout。不可用 query、cookie、通用密碼或修改正式登入流程來繞過驗證。
- demo 只驗證 UI 與模擬資料互動；不能據此宣稱真實家電、登入權限、後端排程或推播已通過測試。手機 viewport 檢查也不等於 iPhone Safari 實機測試。
- 新增或修改 API 資料格式時，同步更新 `src/lib/demo/fixtures.ts`、`src/lib/demo/simulator.ts` 與 `tests/demo.test.ts`；未知 API 應維持拒絕，不得退回真實後端。
- 修改 demo／API 契約後執行 `npm run test:demo`；程式變更依範圍執行 lint、build 與相關 UI 操作檢查。純文件修改不需重跑應用測試，也不 bump 版本。

# 版本管理

`package.json:version` 是整個系統（Dashboard + home-butler）的**使用者體感版本** source of truth。

**bump 時機**：使用者**體感得到**的變化才 bump（新功能、UI/行為改動、會被察覺的 bug fix）。純 refactor、註解、文件、type 整理**不 bump**。bump 副作用：所有使用者的 localStorage 快取會被清空（`use-cached-fetch.ts` 用 APP_VERSION 當 key prefix），首次載入會慢一拍——這也是不亂 bump 的另一個理由。

**bump 流程**（只動 Dashboard 一處）：
1. 改 `package.json:version`
2. commit、push 到 `main`
3. 完。home-butler 會在 runtime 透過 `/api/version` 公開端點撈最新值（1 小時 cache），LINE bot 自然同步——不需要也不應該再去動 home-butler。

`/api/version` 是 middleware whitelist 的公開端點，純粹回 `{ version }`，給 home-butler 後端用；前端自己用 `process.env.APP_VERSION`（`next.config.ts` 在 build-time 從 package.json 注入）。

本專案不使用 git tag / GitHub Releases；版本以 `package.json` 為準，git history 自己就是版本軌跡。

# Git push 環境差異

這個 repo 會被多種 harness 操作（本機 VS Code、claude.ai/code web UI 等）。
如果 `git push` 失敗、錯誤是認證相關（no credentials / permission denied / could not read Username），**立刻停下來，不要繞路**：

- 不要設 git credential helper、token、或改寫 remote URL
- 不要用 curl 打 GitHub API 繞過
- 不要改 SSH

如果當下環境有 GitHub MCP 工具（`mcp__github__*`），直接切過去用；沒有就回報「這個環境沒有 push 權限」由 User 處理。
