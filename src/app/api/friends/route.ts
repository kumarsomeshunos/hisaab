import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, asc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, friendships } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        avatarUrl: users.avatarUrl,
        since: friendships.createdAt,
      })
      .from(friendships)
      .innerJoin(users, eq(friendships.friendId, users.id))
      .where(eq(friendships.userId, user.id))
      .orderBy(asc(users.name));

    return NextResponse.json({ friends: rows });
  } catch (err) {
    console.error("[friends/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const addSchema = z.object({
  usernameOrEmail: z.string().trim().min(1, "Enter a username or email."),
});

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const body = await request.json();
    const parsed = addSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }

    const { usernameOrEmail } = parsed.data;
    const isEmail = usernameOrEmail.includes("@");

    const [target] = await db
      .select({ id: users.id, name: users.name, username: users.username, avatarUrl: users.avatarUrl })
      .from(users)
      .where(
        isEmail
          ? sql`lower(${users.email}) = lower(${usernameOrEmail})`
          : sql`lower(${users.username}) = lower(${usernameOrEmail})`
      )
      .limit(1);

    if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });
    if (target.id === user.id) return NextResponse.json({ error: "You can't add yourself." }, { status: 400 });

    const existing = await db
      .select({ userId: friendships.userId })
      .from(friendships)
      .where(and(eq(friendships.userId, user.id), eq(friendships.friendId, target.id)))
      .limit(1);

    if (existing.length > 0) return NextResponse.json({ error: "Already friends." }, { status: 409 });

    await db.insert(friendships).values([
      { userId: user.id, friendId: target.id },
      { userId: target.id, friendId: user.id },
    ]);

    await writeActivity({
      type: "friend_added",
      actorId: user.id,
      payload: { friendId: target.id, friendName: target.name, friendUsername: target.username },
      visibleToUserIds: [user.id, target.id],
    });

    return NextResponse.json({ success: true, friend: target });
  } catch (err) {
    console.error("[friends/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
