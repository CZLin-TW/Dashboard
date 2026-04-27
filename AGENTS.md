<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 版本管理

`package.json:version` 是整個系統（Dashboard + home-butler）的**使用者體感版本** source of truth。

**bump 時機**：使用者**體感得到**的變化才 bump（新功能、UI/行為改動、會被察覺的 bug fix）。純 refactor、註解、文件、type 整理**不 bump**。bump 副作用：所有使用者的 localStorage 快取會被清空（`use-cached-fetch.ts` 用 APP_VERSION 當 key prefix），首次載入會慢一拍——這也是不亂 bump 的另一個理由。

**bump 流程**（兩 repo 必須同步）：
1. Dashboard 改 `package.json:version`
2. home-butler 也要改 `config.py:APP_VERSION` 成同一個值（LINE bot 會用這個值回答「目前版本？」）
3. 兩邊各 commit、各 `git tag v<新版本>` 後 push（tag 也要 push：`git push origin v<新版本>`）
4. 若只動其中一邊，bot 跟 Dashboard header 顯示的版本會對不上

# Git push 環境差異

這個 repo 會被多種 harness 操作（本機 VS Code、claude.ai/code web UI 等）。
如果 `git push` 失敗、錯誤是認證相關（no credentials / permission denied / could not read Username），**立刻停下來，不要繞路**：

- 不要設 git credential helper、token、或改寫 remote URL
- 不要用 curl 打 GitHub API 繞過
- 不要改 SSH

如果當下環境有 GitHub MCP 工具（`mcp__github__*`），直接切過去用；沒有就回報「這個環境沒有 push 權限」由 User 處理。
