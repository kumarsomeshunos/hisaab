import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { groups, groupMembers, users, guestContacts, expenses, expenseSplits, settlements } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

const renameSchema = z.object({ name: z.string().trim().min(1).max(80) });

async function requireMembership(groupId: string, userId: string) {
  const [row] = await db
    .select({ id: groupMembers.id })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)));
  return row ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { id: groupId } = await params;

    const membership = await requireMembership(groupId, me);
    if (!membership) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
    if (!group) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Fetch all members with user/guest info
    const userMemberRows = await db
      .select({
        memberId: groupMembers.id,
        userId: groupMembers.userId,
        name: users.name,
        username: users.username,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(and(eq(groupMembers.groupId, groupId), isNotNull(groupMembers.userId)));

    const guestMemberRows = await db
      .select({
        memberId: groupMembers.id,
        guestId: groupMembers.guestId,
        name: guestContacts.name,
        phone: guestContacts.phone,
      })
      .from(groupMembers)
      .innerJoin(guestContacts, eq(groupMembers.guestId, guestContacts.id))
      .where(and(eq(groupMembers.groupId, groupId), isNotNull(groupMembers.guestId)));

    // Compute pairwise balances relative to current user
    // Expenses in this group paid by a user member
    const groupExpenseRows = await db
      .select({ id: expenses.id, paidById: expenses.paidById, paidByGuestId: expenses.paidByGuestId })
      .from(expenses)
      .where(eq(expenses.groupId, groupId));

    const groupExpenseIds = groupExpenseRows.map((e) => e.id);

    let splitRows: { expenseId: string; userId: string | null; guestId: string | null; amount: number }[] = [];
    if (groupExpenseIds.length > 0) {
      splitRows = await db
        .select({ expenseId: expenseSplits.expenseId, userId: expenseSplits.userId, guestId: expenseSplits.guestId, amount: expenseSplits.amount })
        .from(expenseSplits)
        .where(inArray(expenseSplits.expenseId, groupExpenseIds));
    }

    const settlementRows = await db
      .select()
      .from(settlements)
      .where(eq(settlements.groupId, groupId));

    // Build net map: memberId → net amount (positive = they owe me, negative = I owe them)
    // Key by composite "user:uuid" or "guest:uuid"
    const netMap = new Map<string, number>();

    const expensePayerMap = new Map(groupExpenseRows.map((e) => [
      e.id,
      e.paidById ? `user:${e.paidById}` : `guest:${e.paidByGuestId}`,
    ]));

    const meKey = `user:${me}`;

    for (const split of splitRows) {
      const splitKey = split.userId ? `user:${split.userId}` : `guest:${split.guestId}`;
      const payerKey = expensePayerMap.get(split.expenseId);
      if (!payerKey) continue;

      if (payerKey === meKey && splitKey !== meKey) {
        // I paid, someone else owes me
        netMap.set(splitKey, (netMap.get(splitKey) ?? 0) + split.amount);
      } else if (splitKey === meKey && payerKey !== meKey) {
        // Someone else paid, I owe them
        netMap.set(payerKey, (netMap.get(payerKey) ?? 0) - split.amount);
      }
    }

    // Adjust for settlements
    for (const s of settlementRows) {
      const fromKey = s.fromUserId ? `user:${s.fromUserId}` : `guest:${s.fromGuestId}`;
      const toKey = s.toUserId ? `user:${s.toUserId}` : `guest:${s.toGuestId}`;

      if (fromKey === meKey) {
        // I paid someone → I owe them less (or they owe me more)
        netMap.set(toKey, (netMap.get(toKey) ?? 0) + s.amount);
      } else if (toKey === meKey) {
        // Someone paid me → they owe me less
        netMap.set(fromKey, (netMap.get(fromKey) ?? 0) - s.amount);
      }
    }

    const members = [
      ...userMemberRows.map((m) => ({
        memberId: m.memberId,
        type: "user" as const,
        id: m.userId!,
        name: m.name,
        username: m.username,
        phone: null as string | null,
        net: netMap.get(`user:${m.userId}`) ?? 0,
      })),
      ...guestMemberRows.map((m) => ({
        memberId: m.memberId,
        type: "guest" as const,
        id: m.guestId!,
        name: m.name,
        username: undefined,
        phone: m.phone,
        net: netMap.get(`guest:${m.guestId}`) ?? 0,
      })),
    ];

    return NextResponse.json({ group: { id: group.id, name: group.name, createdById: group.createdById }, members });
  } catch (err) {
    console.error("[groups/[id]/GET]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { id: groupId } = await params;

    const [group] = await db.select().from(groups).where(and(eq(groups.id, groupId), eq(groups.createdById, me)));
    if (!group) return NextResponse.json({ error: "Not found or not authorized." }, { status: 404 });

    const body = await request.json();
    const parsed = renameSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });

    await db.update(groups).set({ name: parsed.data.name }).where(eq(groups.id, groupId));

    return NextResponse.json({ group: { id: groupId, name: parsed.data.name } });
  } catch (err) {
    console.error("[groups/[id]/PATCH]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
