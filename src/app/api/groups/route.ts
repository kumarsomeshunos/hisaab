import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, groupMembers, users, expenses, expenseSplits, settlements, friendships, guestContacts } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const memberGuestSchema = z.object({
  guestId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  phone: z.string().max(20).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  memberUserIds: z.array(z.string().uuid()).optional(),
  memberGuests: z.array(memberGuestSchema).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;

    const myMemberRows = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, me));

    if (myMemberRows.length === 0) {
      return NextResponse.json({ groups: [] });
    }

    const groupIds = myMemberRows.map((r) => r.groupId);

    const groupRows = await db
      .select({ id: groups.id, name: groups.name, createdById: groups.createdById, createdAt: groups.createdAt })
      .from(groups)
      .where(inArray(groups.id, groupIds));

    const memberCountRows = await db
      .select({ groupId: groupMembers.groupId, count: sql<string>`count(*)` })
      .from(groupMembers)
      .where(inArray(groupMembers.groupId, groupIds))
      .groupBy(groupMembers.groupId);

    const memberCountMap = new Map(memberCountRows.map((r) => [r.groupId, parseInt(r.count)]));

    const iPaidRows = await db
      .select({ groupId: expenses.groupId, splitUserId: expenseSplits.userId, amount: expenseSplits.amount })
      .from(expenses)
      .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenses.paidById, me), inArray(expenses.groupId, groupIds)));

    const theyPaidRows = await db
      .select({ groupId: expenses.groupId, amount: expenseSplits.amount })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenseSplits.userId, me), inArray(expenses.groupId, groupIds)));

    const settlementRows = await db
      .select({ groupId: settlements.groupId, fromUserId: settlements.fromUserId, toUserId: settlements.toUserId, amount: settlements.amount })
      .from(settlements)
      .where(inArray(settlements.groupId, groupIds));

    const balanceMap = new Map<string, number>();

    for (const r of iPaidRows) {
      if (!r.groupId || r.splitUserId === me) continue;
      const gid = r.groupId;
      balanceMap.set(gid, (balanceMap.get(gid) ?? 0) + r.amount);
    }
    for (const r of theyPaidRows) {
      if (!r.groupId) continue;
      const gid = r.groupId;
      balanceMap.set(gid, (balanceMap.get(gid) ?? 0) - r.amount);
    }
    for (const r of settlementRows) {
      if (!r.groupId) continue;
      const gid = r.groupId;
      if (r.fromUserId === me) {
        balanceMap.set(gid, (balanceMap.get(gid) ?? 0) + r.amount);
      } else if (r.toUserId === me) {
        balanceMap.set(gid, (balanceMap.get(gid) ?? 0) - r.amount);
      }
    }

    const result = groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      createdById: g.createdById,
      memberCount: memberCountMap.get(g.id) ?? 0,
      myBalance: balanceMap.get(g.id) ?? 0,
    }));

    return NextResponse.json({ groups: result });
  } catch (err) {
    console.error("[groups/GET]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const { name, memberUserIds, memberGuests } = parsed.data;

    const [group] = await db
      .insert(groups)
      .values({ name, createdById: me })
      .returning();

    await db.insert(groupMembers).values({ groupId: group.id, userId: me, addedById: me });

    // Add app-user members (must be friends of creator)
    if (memberUserIds && memberUserIds.length > 0) {
      const otherUserIds = memberUserIds.filter((id) => id !== me);
      if (otherUserIds.length > 0) {
        const friendRows = await db
          .select({ friendId: friendships.friendId })
          .from(friendships)
          .where(and(eq(friendships.userId, me), inArray(friendships.friendId, otherUserIds)));
        const friendSet = new Set(friendRows.map((r) => r.friendId));
        const stranger = otherUserIds.find((id) => !friendSet.has(id));
        if (stranger) {
          return NextResponse.json({ error: "All members must be your friends." }, { status: 403 });
        }
        for (const userId of otherUserIds) {
          await db.insert(groupMembers).values({ groupId: group.id, userId, addedById: me });
        }
      }
    }

    // Add guest members
    if (memberGuests && memberGuests.length > 0) {
      for (const guest of memberGuests) {
        let guestId = guest.guestId;
        if (!guestId) {
          const [g] = await db
            .insert(guestContacts)
            .values({ ownerId: me, name: guest.name.trim(), phone: guest.phone ?? null })
            .returning({ id: guestContacts.id });
          guestId = g.id;
        } else {
          const [existing] = await db
            .select({ id: guestContacts.id })
            .from(guestContacts)
            .where(and(eq(guestContacts.id, guestId), eq(guestContacts.ownerId, me)));
          if (!existing) {
            return NextResponse.json({ error: "Invalid guest contact." }, { status: 403 });
          }
        }
        await db.insert(groupMembers).values({ groupId: group.id, guestId, addedById: me });
      }
    }

    const [actor] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, me));

    await writeActivity({
      type: "group_created",
      actorId: me,
      groupId: group.id,
      payload: { groupId: group.id, groupName: group.name, actorName: actor?.name ?? actor?.username ?? "Someone" },
      visibleToUserIds: [me],
    });

    return NextResponse.json({ group: { id: group.id, name: group.name } }, { status: 201 });
  } catch (err) {
    console.error("[groups/POST]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
