import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, friendships } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

const querySchema = z.object({
  q: z.string().trim().min(2, "Query must be at least 2 characters.").max(50),
});

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const q = request.nextUrl.searchParams.get("q") ?? "";
    const parsed = querySchema.safeParse({ q });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid query." },
        { status: 400 }
      );
    }

    const { q: query } = parsed.data;
    const isEmail = query.includes("@");

    // Subquery: IDs of users already friends with current user
    const friendIdsSq = db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(eq(friendships.userId, user.id));

    let results;

    if (isEmail) {
      results = await db
        .select({ id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl })
        .from(users)
        .where(
          sql`lower(${users.email}) = lower(${query})
          AND ${users.id} != ${user.id}
          AND ${users.id} NOT IN (${friendIdsSq})
          AND ${users.isOnboarded} = true`
        )
        .limit(5);
    } else {
      results = await db
        .select({ id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl })
        .from(users)
        .where(
          sql`lower(${users.username}) LIKE lower(${query}) || '%'
          AND ${users.id} != ${user.id}
          AND ${users.id} NOT IN (${friendIdsSq})
          AND ${users.isOnboarded} = true`
        )
        .limit(10);
    }

    return NextResponse.json({ users: results });
  } catch (err) {
    console.error("[users/search] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
