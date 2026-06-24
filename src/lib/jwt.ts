// Session JWT 的 secret 解析 + 驗證——**edge-safe**（只用 jose，不碰 next/headers），
// 讓 node 端的 lib/auth.ts 與 edge 端的 proxy.ts(middleware) 共用同一份 secret 與
// 驗證邏輯，保證「簽發」與「閘門驗簽」用的金鑰完全一致，不會把有效 session 誤鎖。

import { jwtVerify } from "jose";

// role 決定權限分級：member = 完整 Dashboard；kid = 兒童遙控器，proxy.ts 只放行裝置頁。
// 選填 + 缺省當 member，讓加這欄之前簽出的舊 session 仍視為完整權限（向下相容）。
export type SessionRole = "member" | "kid";

export interface SessionUser {
  lineUserId: string;
  name: string;
  picture?: string;
  role?: SessionRole;
}

// SESSION_JWT_SECRET 為專用隨機值（openssl rand -hex 32），與 LINE_LOGIN_CHANNEL_SECRET
// 分開，好處：輪替 LINE Channel Secret 不會讓現有 session 全失效；任一外洩不波及另一。
// 向下相容 fallback 到 LINE_LOGIN_CHANNEL_SECRET，最後才到 dev-only 字串。
const SESSION_SECRET = process.env.SESSION_JWT_SECRET;
const LINE_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET;
const SECRET_SOURCE = SESSION_SECRET ?? LINE_SECRET ?? "dev-secret";

export const JWT_SECRET = new TextEncoder().encode(SECRET_SOURCE);

// fail-closed：production 下兩個 secret 都沒設（掉到公開可知的 'dev-secret'）時，
// 拒絕簽發/驗證 session，與後端 auth.py 對 HOME_BUTLER_API_KEY 的姿態一致。
// 關鍵：**不在 module 載入時 throw**——`next build` 的 NODE_ENV 也是 'production'，
// module-eval 時 throw 會在建置階段就炸掉。改在「實際操作」時 fail-closed：
// verifyToken 一律回 null（拒絕所有 token）、簽發走 assertCanIssueSession() 才 throw。
const INSECURE_IN_PROD =
  process.env.NODE_ENV === "production" && !SESSION_SECRET && !LINE_SECRET;

/** 簽發 session 前呼叫：production 下沒有真 secret 時 throw，拒絕用 dev-secret 簽發。 */
export function assertCanIssueSession(): void {
  if (INSECURE_IN_PROD) {
    throw new Error(
      "[auth] production 未設 SESSION_JWT_SECRET 或 LINE_LOGIN_CHANNEL_SECRET——" +
        "拒絕以公開的 'dev-secret' 簽發 session。",
    );
  }
}

/** 驗證 session JWT（驗簽 + 驗 exp）。有效回 user、無效/過期/設定不安全回 null。edge 與 node 皆可用。 */
export async function verifyToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) return null;
  if (INSECURE_IN_PROD) return null; // fail-closed：拒絕用 dev-secret 驗證任何 token
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      lineUserId: payload.lineUserId as string,
      name: payload.name as string,
      picture: payload.picture as string | undefined,
      role: payload.role === "kid" ? "kid" : "member",
    };
  } catch {
    return null;
  }
}
