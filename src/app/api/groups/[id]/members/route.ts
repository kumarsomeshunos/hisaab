import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, groupMembers, friendships, guestContacts, users } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const addMemberSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: z.string().uuid() }),
  z.object({ type: z.literal("guest"), guestId: z.string().uuid() }),
  z.object({ type: z.literal("guest_new"), name: z.string().trim().min(1).max(60), phone: z.string().max(20).optional() }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { id: groupId } = await params;

    // Must be a member to add others
    const [myMembership] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me)));
    if (!myMembership) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const body = await request.json();
    const parsed = addMemberSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });

    const data = parsed.data;

    let resolvedUserId: string | null = null;
    let resolvedGuestId: string | null = null;
    let memberName: string = "";

    if (data.type === "user") {
      // Must be a friend
      const [friendship] = await db
        .select({ friendId: friendships.friendId })
        .from(friendships)
        .where(and(eq(friendships.userId, me), eq(friendships.friendId, data.userId)));
      if (!friendship) return NextResponse.json({ error: "You can only add friends." }, { status: 403 });

      // No duplicate members
      const [existing] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, data.userId)));
      if (existing) return NextResponse.json({ error: "Already a member." }, { status: 409 });

      resolvedUserId = data.userId;
      const [u] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, data.userId));
      memberName = u?.name ?? u?.username ?? "Someone";
    } else if (data.type === "guest") {
      const [guest] = await db
        .select({ id: guestContacts.id, name: guestContacts.name })
        .from(guestContacts)
        .where(and(eq(guestContacts.id, data.guestId), eq(guestContacts.ownerId, me)));
      if (!guest) return NextResponse.json({ error: "Invalid guest contact." }, { status: 403 });

      const [existing] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.guestId, data.guestId)));
      if (existing) return NextResponse.json({ error: "Already a member." }, { status: 409 });

      resolvedGuestId = data.guestId;
      memberName = guest.name;
    } else {
      // guest_new
      const [newGuest] = await db
        .insert(guestContacts)
        .values({ ownerId: me, name: data.name.trim(), phone: data.phone ?? null })
        .returning();
      resolvedGuestId = newGuest.id;
      memberName = data.name.trim();
    }

    const [newMember] = await db
      .insert(groupMembers)
      .values({ groupId, userId: resolvedUserId, guestId: resolvedGuestId, addedById: me })
      .returning();

    // Activity visible to all current user members of the group
    const userMemberRows = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId)));
    const visibleTo = userMemberRows.map((r) => r.userId).filter(Boolean) as string[];

    const [actor] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, me));
    const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));

    await writeActivity({
      type: "group_member_added",
      actorId: me,
      groupId,
      payload: {
        groupId,
        groupName: group?.name ?? "",
        memberName,
        actorName: actor?.name ?? actor?.username ?? "Someone",
      },
      visibleToUserIds: visibleTo,
    });

    return NextResponse.json({ member: { id: newMember.id } }, { status: 201 });
  } catch (err) {
    console.error("[groups/[id]/members/POST]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
