import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const sessionData = await getSessionUser(token);
    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { user } = sessionData;

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username,
        avatarUrl: user.avatarUrl,
        phone: user.phone,
        isOnboarded: user.isOnboarded,
        notificationEmails: user.notificationEmails,
      },
    });
  } catch (err) {
    console.error("[auth/me] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
