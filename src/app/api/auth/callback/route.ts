import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession, getSessionCookieOptions } from "@/lib/auth";
import { getFamilyMembers } from "@/lib/sheets";

const LINE_TOKEN_URL = "https://api.line.me/oauth2/v2.1/token";
const LINE_PROFILE_URL = "https://api.line.me/v2/profile";
const CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID ?? "";
const CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET ?? "";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/login?error=denied", url.origin));
  }

  const cookieStore = await cookies();
  const savedState = cookieStore.get("oauth_state")?.value;
  if (!state || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", url.origin));
  }

  const callbackUrl = `${url.origin}/api/auth/callback`;
  const tokenRes = await fetch(LINE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: callbackUrl,
      client_id: CHANNEL_ID,
      client_secret: CHANNEL_SECRET,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/login?error=token_failed", url.origin));
  }

  const profileRes = await fetch(LINE_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();

  if (!profile.userId) {
    return NextResponse.redirect(new URL("/login?error=profile_failed", url.origin));
  }

  try {
    const members = await getFamilyMembers();
    const member = members.find((m) =>
      m["Line User ID"] === profile.userId || m["LINE User ID"] === profile.userId
    );

    if (!member) {
      return NextResponse.redirect(new URL("/login?error=not_member", url.origin));
    }

    const sessionToken = await createSession({
      lineUserId: profile.userId,
      name: member["姓名"] ?? member["名稱"] ?? profile.displayName,
      picture: profile.pictureUrl,
    });

    const response = NextResponse.redirect(new URL("/", url.origin));
    const cookieOpts = getSessionCookieOptions();
    response.cookies.set(cookieOpts.name, sessionToken, cookieOpts);
    response.cookies.delete("oauth_state");

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=sheets_failed", url.origin));
  }
}
