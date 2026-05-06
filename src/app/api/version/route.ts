// 公開端點（middleware whitelist），給 home-butler 後端 runtime 撈使用者體感版本。
// Source of truth 是 package.json:version；next.config.ts 在 build-time 注入到
// process.env.APP_VERSION。這樣 home-butler 就不需要鏡像維護 APP_VERSION，
// 體感變化只需要改 Dashboard 一處 + push 一次。
export function GET() {
  return Response.json({ version: process.env.APP_VERSION ?? "unknown" });
}
