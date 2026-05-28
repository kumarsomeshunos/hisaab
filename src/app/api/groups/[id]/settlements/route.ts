import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { settlements, groupMembers, groups, users, guestContacts } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const createSchema = z.object({
  fromMemberId: z.string().uuid(),
  toMemberId: z.string().uuid(),
  amount: z.number().positive(),
  note: z.string().max(200).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { id: groupId } = await params;

    const [myMembership] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me)));
    if (!myMembership) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const rows = await db
      .select()
      .from(settlements)
      .where(eq(settlements.groupId, groupId))
      .orderBy(desc(settlements.createdAt));

    return NextResponse.json({ settlements: rows });
  } catch (err) {
    console.error("[groups/[id]/settlements/GET]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { id: groupId } = await params;

    const [myMembership] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me)));
    if (!myMembership) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });

    const { fromMemberId, toMemberId, amount, note } = parsed.data;

    // Resolve from/to member rows
    const [fromMember] = await db
      .select({ userId: groupMembers.userId, guestId: groupMembers.guestId })
      .from(groupMembers)
      .where(and(eq(groupMembers.id, fromMemberId), eq(groupMembers.groupId, groupId)));
    const [toMember] = await db
      .select({ userId: groupMembers.userId, guestId: groupMembers.guestId })
      .from(groupMembers)
      .where(and(eq(groupMembers.id, toMemberId), eq(groupMembers.groupId, groupId)));

    if (!fromMember || !toMember) return NextResponse.json({ error: "Invalid member." }, { status: 400 });

    const amountPaise = Math.round(amount * 100);

    const [settlement] = await db
      .insert(settlements)
      .values({
        groupId,
        fromUserId: fromMember.userId,
        fromGuestId: fromMember.guestId,
        toUserId: toMember.userId,
        toGuestId: toMember.guestId,
        amount: amountPaise,
        note: note ?? null,
        recordedById: me,
      })
      .returning();

    // Fetch names for activity payload
    const getDisplayName = async (userId: string | null, guestId: string | null): Promise<string> => {
      if (userId) {
        const [u] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, userId));
        return u?.name ?? u?.username ?? "Someone";
      }
      if (guestId) {
        const [g] = await db.select({ name: guestContacts.name }).from(guestContacts).where(eq(guestContacts.id, guestId));
        return g?.name ?? "Guest";
      }
      return "Unknown";
    };

    const fromName = await getDisplayName(fromMember.userId, fromMember.guestId);
    const toName = await getDisplayName(toMember.userId, toMember.guestId);

    // Visibility: all app-user members of the group
    const userMemberRows = await db
      .select({ userId: groupMembers.userId })
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId));
    const visibleTo = userMemberRows.map((r) => r.userId).filter(Boolean) as string[];

    const [group] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));

    await writeActivity({
      type: "settlement_recorded",
      actorId: me,
      groupId,
      payload: { groupId, groupName: group?.name ?? "", fromName, toName, amount: amountPaise },
      visibleToUserIds: visibleTo,
    });

    return NextResponse.json({ settlement }, { status: 201 });
  } catch (err) {
    console.error("[groups/[id]/settlements/POST]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
