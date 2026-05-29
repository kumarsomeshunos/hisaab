import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { checkRateLimit, getClientIp } from "@/lib/auth/ratelimit";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const { allowed } = checkRateLimit(`username:${ip}`, { limit: 30, windowMs: 5 * 60 * 1000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const sessionData = await getSessionUser(token);
  if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const username = request.nextUrl.searchParams.get("username") ?? "";

  if (!username || !/^[a-z0-9_]{3,30}$/.test(username)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const result = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);

  return NextResponse.json({ available: result.length === 0 });
}
