import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "./jwt";

export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function requestUser(request: Request): Promise<string> {
  const token = new NextRequest(request.url, { headers: request.headers }).cookies.get("dashboard_session")?.value;
  const user = await verifyToken(token);
  if (!user?.lineUserId) throw new RequestError("請先登入。", 401);
  if (user.role === "kid") throw new RequestError("此帳號無法存取生活資料。", 403);
  return user.lineUserId;
}
export function requestError(error: unknown) {
  const status = error instanceof RequestError ? error.status : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : "操作失敗，請稍後重試。" }, { status });
}
