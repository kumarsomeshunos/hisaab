import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, friendships, guestContacts, settlements } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const friendSchema = z.object({
  friendUserId: z.string().uuid(),
  amount: z.number().positive(),
  direction: z.enum(["i_paid", "they_paid"]),
  note: z.string().max(200).optional(),
});

const guestSchema = z.object({
  guestId: z.string().uuid(),
  amount: z.number().positive(),
  direction: z.enum(["i_paid", "they_paid"]),
  note: z.string().max(200).optional(),
});

const schema = z.union([friendSchema, guestSchema]);

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

    const { amount, direction, note } = parsed.data;
    const paise = Math.round(amount * 100);

    if ("guestId" in parsed.data) {
      const { guestId } = parsed.data;

      const [guestRow] = await db
        .select({ id: guestContacts.id, name: guestContacts.name })
        .from(guestContacts)
        .where(and(eq(guestContacts.id, guestId), eq(guestContacts.ownerId, user.id)))
        .limit(1);

      if (!guestRow) return NextResponse.json({ error: "Guest not found." }, { status: 404 });

      const fromUserId = direction === "i_paid" ? user.id : null;
      const fromGuestId = direction === "i_paid" ? null : guestId;
      const toUserId = direction === "i_paid" ? null : user.id;
      const toGuestId = direction === "i_paid" ? guestId : null;

      await db.insert(settlements).values({
        groupId: null,
        fromUserId,
        fromGuestId,
        toUserId,
        toGuestId,
        amount: paise,
        note: note ?? null,
        recordedById: user.id,
      });

      const myName = user.name ?? user.username ?? "Someone";
      await writeActivity({
        type: "settlement_recorded",
        actorId: user.id,
        groupId: null,
        payload: {
          amount: paise,
          note: note ?? null,
          fromName: direction === "i_paid" ? myName : guestRow.name,
          toName: direction === "i_paid" ? guestRow.name : myName,
          guestId,
        },
        visibleToUserIds: [user.id],
      });

      return NextResponse.json({ success: true });
    }

    // Friend branch
    const { friendUserId } = parsed.data;

    const [friendship] = await db
      .select({ friendId: friendships.friendId })
      .from(friendships)
      .where(and(eq(friendships.userId, user.id), eq(friendships.friendId, friendUserId)))
      .limit(1);

    if (!friendship) {
      return NextResponse.json({ error: "Not a friend." }, { status: 403 });
    }

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

    const [friendInfo] = await db
      .select({ name: users.name, username: users.username })
      .from(users)
      .where(eq(users.id, friendUserId))
      .limit(1);

    const myName = user.name ?? user.username ?? "Someone";
    const friendName = friendInfo?.name ?? friendInfo?.username ?? "Someone";

    await writeActivity({
      type: "settlement_recorded",
      actorId: user.id,
      groupId: null,
      payload: {
        amount: paise,
        note: note ?? null,
        fromName: direction === "i_paid" ? myName : friendName,
        toName: direction === "i_paid" ? friendName : myName,
        friendUsername: friendInfo?.username ?? null,
      },
      visibleToUserIds: [user.id, friendUserId],
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[settlements/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
