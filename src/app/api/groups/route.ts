import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, groupMembers, users, expenses, expenseSplits, settlements } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;

    // Groups where I am a member
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

    // Member counts per group
    const memberCountRows = await db
      .select({ groupId: groupMembers.groupId, count: sql<string>`count(*)` })
      .from(groupMembers)
      .where(inArray(groupMembers.groupId, groupIds))
      .groupBy(groupMembers.groupId);

    const memberCountMap = new Map(memberCountRows.map((r) => [r.groupId, parseInt(r.count)]));

    // My balance in each group: sum of splits others owe me (I paid) minus sum of my splits on their expenses
    // Expenses I paid in each group
    const iPaidRows = await db
      .select({ groupId: expenses.groupId, splitUserId: expenseSplits.userId, amount: expenseSplits.amount })
      .from(expenses)
      .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenses.paidById, me), inArray(expenses.groupId, groupIds)));

    // My splits on expenses others paid in each group
    const theyPaidRows = await db
      .select({ groupId: expenses.groupId, amount: expenseSplits.amount })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenseSplits.userId, me), inArray(expenses.groupId, groupIds)));

    // Settlements in these groups involving me
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

    const [group] = await db
      .insert(groups)
      .values({ name: parsed.data.name, createdById: me })
      .returning();

    await db.insert(groupMembers).values({ groupId: group.id, userId: me, addedById: me });

    // Fetch name for activity payload
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
