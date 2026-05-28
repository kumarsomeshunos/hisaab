import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { friendships, settlements } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const schema = z.object({
  friendUserId: z.string().uuid(),
  amount: z.number().positive(),
  direction: z.enum(["i_paid", "they_paid"]),
  note: z.string().max(200).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const { friendUserId, amount, direction, note } = parsed.data;

    const [friendship] = await db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(and(eq(friendships.userId, user.id), eq(friendships.friendId, friendUserId)))
      .limit(1);

    if (!friendship) {
      return NextResponse.json({ error: "Not a friend." }, { status: 403 });
    }

    const paise = Math.round(amount * 100);
    const fromUserId = direction === "i_paid" ? user.id : friendUserId;
    const toUserId = direction === "i_paid" ? friendUserId : user.id;

    await db.insert(settlements).values({
      groupId: null,
      fromUserId,
      fromGuestId: null,
      toUserId,
      toGuestId: null,
      amount: paise,
      note: note ?? null,
      recordedById: user.id,
    });

    await writeActivity({
      type: "settlement_recorded",
      actorId: user.id,
      groupId: null,
      payload: { amount: paise, note: note ?? null },
      visibleToUserIds: [user.id, friendUserId],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settlements/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
