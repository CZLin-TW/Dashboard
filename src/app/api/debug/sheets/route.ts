import { NextResponse } from "next/server";
import { getFamilyMembers } from "@/lib/sheets";

export async function GET() {
  try {
    const members = await getFamilyMembers();
    return NextResponse.json({ ok: true, count: members.length, sample: members[0] ?? null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json({ ok: false, error: message, stack }, { status: 500 });
  }
}
