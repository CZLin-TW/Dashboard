import { NextResponse } from "next/server";

const LINE_AUTH_URL = "https://access.line.me/oauth2/v2.1/authorize";
const CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID ?? "";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const callbackUrl = `${origin}/api/auth/callback`;

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CHANNEL_ID,
    redirect_uri: callbackUrl,
    state,
    scope: "profile openid",
  });

  const response = NextResponse.redirect(`${LINE_AUTH_URL}?${params}`);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300, // 5 minutes
  });

  return response;
}
