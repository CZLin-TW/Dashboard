<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
