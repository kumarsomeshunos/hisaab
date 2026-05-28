import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
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
