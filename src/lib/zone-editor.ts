// 區域編輯入口：替已登入的一般成員簽一張短效、單次使用的通行票，把瀏覽器交給家中主機上的
// 編輯工具。Dashboard 只持有私鑰；家中主機只有公鑰，能驗票但造不出票。
//
// 票放在網址的 fragment（#）裡：fragment 不會送到任何伺服器、不會進存取記錄，
// 對方頁面拿到後會立刻從網址列清掉。票 60 秒過期，且對方只接受一次。
import { SignJWT, importPKCS8 } from "jose";

const TICKET_SECONDS = 60;

export interface ZoneEditorConfig { url: string; key: string }

/** 兩個環境變數都合理才算啟用；任何一個缺或不對就當作沒有這個功能。 */
export function zoneEditorConfig(env: Record<string, string | undefined> = process.env): ZoneEditorConfig | null {
  const raw = env.ZONE_EDITOR_URL?.trim();
  // 有些平台把多行值存成字面上的 \n。
  const key = env.ZONE_EDITOR_SIGNING_KEY?.replace(/\\n/g, "\n").trim();
  if (!raw || !key || !key.includes("BEGIN PRIVATE KEY")) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { url: url.origin, key };
  } catch {
    return null;
  }
}

/** 給家中主機驗的票。對象固定是設定的那個網址，換一個站就不會被接受。 */
export async function zoneEditorTicket(config: ZoneEditorConfig, now = Date.now(), returnTo?: string): Promise<string> {
  const issued = Math.floor(now / 1000);
  const id = Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, "0")).join("");
  // ret：讓編輯工具知道「回 Dashboard」要連到哪裡；只是這個站自己的網址。
  return new SignJWT(returnTo ? { ret: returnTo } : {})
    .setProtectedHeader({ alg: "ES256", typ: "JWT" })
    .setIssuer("dashboard")
    .setAudience(config.url)
    .setIssuedAt(issued)
    .setExpirationTime(issued + TICKET_SECONDS)
    .setJti(id)
    .sign(await importPKCS8(config.key, "ES256"));
}

export async function zoneEditorEntry(config: ZoneEditorConfig, now = Date.now(), returnTo?: string): Promise<string> {
  return `${config.url}/enter#ticket=${await zoneEditorTicket(config, now, returnTo)}`;
}
