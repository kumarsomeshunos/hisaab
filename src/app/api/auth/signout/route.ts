import { NextRequest, NextResponse } from "next/server";
import { deleteSession, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      await deleteSession(token);
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    return response;
  } catch (err) {
    console.error("[auth/signout] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
