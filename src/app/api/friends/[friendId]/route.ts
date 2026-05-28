import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, users } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const paramSchema = z.string().uuid("Invalid friend ID.");

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ friendId: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const { friendId } = await params;

    const parsed = paramSchema.safeParse(friendId);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const existing = await db
      .select({ userId: friendships.userId })
      .from(friendships)
      .where(and(eq(friendships.userId, user.id), eq(friendships.friendId, parsed.data)))
      .limit(1);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Friend not found." }, { status: 404 });
    }

    // Fetch friend name for activity payload before deleting
    const [friend] = await db
      .select({ name: users.name, username: users.username })
      .from(users)
      .where(eq(users.id, parsed.data));

    await db
      .delete(friendships)
      .where(
        or(
          and(eq(friendships.userId, user.id), eq(friendships.friendId, parsed.data)),
          and(eq(friendships.userId, parsed.data), eq(friendships.friendId, user.id))
        )
      );

    await writeActivity({
      type: "friend_removed",
      actorId: user.id,
      payload: { friendId: parsed.data, friendName: friend?.name, friendUsername: friend?.username },
      visibleToUserIds: [user.id, parsed.data],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[friends/[friendId]/DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
