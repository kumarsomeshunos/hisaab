import { NextRequest, NextResponse } from "next/server";
import { eq, or, desc, lt, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const limit = 20;

    const cursorParam = request.nextUrl.searchParams.get("cursor");

    const visibility = or(
      eq(activityLog.actorId, me),
      sql`${me} = ANY(${activityLog.visibleToUserIds})`
    );

    const whereClause = cursorParam
      ? and(visibility, lt(activityLog.createdAt, new Date(cursorParam)))
      : visibility;

    const rows = await db
      .select()
      .from(activityLog)
      .where(whereClause)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? events[events.length - 1].createdAt.toISOString() : null;

    return NextResponse.json({ events, nextCursor });
  } catch (err) {
    console.error("[activity/GET]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
