import { NextRequest, NextResponse } from "next/server";
import { eq, and, inArray, desc, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, friendships, expenses, expenseSplits, groups, groupMembers, settlements } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { username } = await params;

    const [target] = await db
      .select({ id: users.id, name: users.name, username: users.username, upiId: users.upiId })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (!target) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (target.id === me) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // Must be friends
    const [friendship] = await db
      .select({ userId: friendships.userId })
      .from(friendships)
      .where(and(eq(friendships.userId, me), eq(friendships.friendId, target.id)))
      .limit(1);

    if (!friendship) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // --- Mutual groups ---
    const myGroupRows = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, me));

    const theirGroupRows = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, target.id));

    const myGroupIds = new Set(myGroupRows.map((r) => r.groupId));
    const mutualGroupIds = theirGroupRows.map((r) => r.groupId).filter((id) => myGroupIds.has(id));

    let mutualGroups: { id: string; name: string; myBalance: number }[] = [];

    if (mutualGroupIds.length > 0) {
      const groupRows = await db
        .select({ id: groups.id, name: groups.name })
        .from(groups)
        .where(inArray(groups.id, mutualGroupIds));

      // Balance per mutual group: (what I paid that they owe) - (what they paid that I owe) +/- settlements
      const iPaidSplits = await db
        .select({ groupId: expenses.groupId, splitUserId: expenseSplits.userId, amount: expenseSplits.amount })
        .from(expenses)
        .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
        .where(and(eq(expenses.paidById, me), eq(expenseSplits.userId, target.id), inArray(expenses.groupId, mutualGroupIds)));

      const theyPaidSplits = await db
        .select({ groupId: expenses.groupId, amount: expenseSplits.amount })
        .from(expenses)
        .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
        .where(and(eq(expenses.paidById, target.id), eq(expenseSplits.userId, me), inArray(expenses.groupId, mutualGroupIds)));

      const settlementRows = await db
        .select({ groupId: settlements.groupId, fromUserId: settlements.fromUserId, toUserId: settlements.toUserId, amount: settlements.amount })
        .from(settlements)
        .where(and(
          inArray(settlements.groupId, mutualGroupIds),
          inArray(settlements.fromUserId, [me, target.id])
        ));

      const balanceByGroup = new Map<string, number>();

      for (const r of iPaidSplits) {
        if (!r.groupId) continue;
        balanceByGroup.set(r.groupId, (balanceByGroup.get(r.groupId) ?? 0) + r.amount);
      }
      for (const r of theyPaidSplits) {
        if (!r.groupId) continue;
        balanceByGroup.set(r.groupId, (balanceByGroup.get(r.groupId) ?? 0) - r.amount);
      }
      for (const s of settlementRows) {
        if (!s.groupId) continue;
        if (s.fromUserId === me && s.toUserId === target.id) {
          balanceByGroup.set(s.groupId, (balanceByGroup.get(s.groupId) ?? 0) + (s.amount ?? 0));
        } else if (s.fromUserId === target.id && s.toUserId === me) {
          balanceByGroup.set(s.groupId, (balanceByGroup.get(s.groupId) ?? 0) - (s.amount ?? 0));
        }
      }

      mutualGroups = groupRows.map((g) => ({ id: g.id, name: g.name, myBalance: balanceByGroup.get(g.id) ?? 0 }));
    }

    // --- Net balance (overall, across all shared expenses not just groups) ---
    const allMutualGroupIds = mutualGroupIds.filter(Boolean) as string[];

    const iPaidRows = await db
      .select({ amount: expenseSplits.amount })
      .from(expenses)
      .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenses.paidById, me), eq(expenseSplits.userId, target.id)));

    const theyPaidRows = await db
      .select({ amount: expenseSplits.amount })
      .from(expenses)
      .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenses.paidById, target.id), eq(expenseSplits.userId, me)));

    let balance = 0;
    for (const r of iPaidRows) balance += r.amount;
    for (const r of theyPaidRows) balance -= r.amount;

    if (allMutualGroupIds.length > 0) {
      const groupSettlements = await db
        .select({ fromUserId: settlements.fromUserId, toUserId: settlements.toUserId, amount: settlements.amount })
        .from(settlements)
        .where(and(
          inArray(settlements.groupId, allMutualGroupIds),
          inArray(settlements.fromUserId, [me, target.id])
        ));
      for (const s of groupSettlements) {
        if (s.fromUserId === me && s.toUserId === target.id) balance += s.amount ?? 0;
        else if (s.fromUserId === target.id && s.toUserId === me) balance -= s.amount ?? 0;
      }
    }

    // Direct settlements (no group)
    const directSettlements = await db
      .select({ fromUserId: settlements.fromUserId, toUserId: settlements.toUserId, amount: settlements.amount })
      .from(settlements)
      .where(
        and(
          isNull(settlements.groupId),
          or(
            and(eq(settlements.fromUserId, me), eq(settlements.toUserId, target.id)),
            and(eq(settlements.fromUserId, target.id), eq(settlements.toUserId, me)),
          )
        )
      );
    for (const s of directSettlements) {
      if (s.fromUserId === me) balance += s.amount ?? 0;
      else balance -= s.amount ?? 0;
    }

    // --- Shared expenses (paginated) ---
    const sp = request.nextUrl.searchParams;
    const cursorParam = sp.get("cursor") || null;
    const limit = 20;

    let cursorDate: Date | null = null;
    let cursorId: string | null = null;
    if (cursorParam) {
      try {
        const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf8"));
        cursorDate = new Date(decoded.date);
        cursorId = decoded.id;
      } catch { /* ignore */ }
    }

    // Expenses where both me and target appear as participants
    const myExpenseIds = await db
      .selectDistinct({ id: expenseSplits.expenseId })
      .from(expenseSplits)
      .where(eq(expenseSplits.userId, me));

    const theirExpenseIds = await db
      .selectDistinct({ id: expenseSplits.expenseId })
      .from(expenseSplits)
      .where(eq(expenseSplits.userId, target.id));

    const mySet = new Set(myExpenseIds.map((r) => r.id));
    const sharedIds = theirExpenseIds.map((r) => r.id).filter((id) => mySet.has(id));

    let sharedExpenses: { id: string; title: string; amount: number; date: Date; myShare: number; iMine: boolean }[] = [];
    let nextCursor: string | null = null;

    if (sharedIds.length > 0) {
      let filtered = sharedIds;
      // Simple cursor: filter by date/id from expense rows
      const expenseRows = await db
        .select({
          id: expenses.id,
          title: expenses.title,
          amount: expenses.amount,
          date: expenses.date,
          createdById: expenses.createdById,
          paidById: expenses.paidById,
        })
        .from(expenses)
        .where(inArray(expenses.id, filtered))
        .orderBy(desc(expenses.date), desc(expenses.id));

      const mySplitRows = await db
        .select({ expenseId: expenseSplits.expenseId, amount: expenseSplits.amount })
        .from(expenseSplits)
        .where(and(eq(expenseSplits.userId, me), inArray(expenseSplits.expenseId, filtered)));

      const mySplitMap = new Map(mySplitRows.map((r) => [r.expenseId, r.amount]));

      let rows = expenseRows;
      if (cursorDate && cursorId) {
        const idx = rows.findIndex((r) => r.id === cursorId);
        rows = idx >= 0 ? rows.slice(idx + 1) : rows;
      }

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      if (hasMore) {
        const last = page[page.length - 1];
        nextCursor = Buffer.from(JSON.stringify({ date: last.date.toISOString(), id: last.id })).toString("base64");
      }

      sharedExpenses = page.map((e) => ({
        id: e.id,
        title: e.title,
        amount: e.amount,
        date: e.date,
        myShare: mySplitMap.get(e.id) ?? 0,
        iMine: e.createdById === me,
      }));
    }

    return NextResponse.json({
      user: { id: target.id, name: target.name, username: target.username, upiId: target.upiId },
      balance,
      mutualGroups,
      expenses: sharedExpenses,
      nextCursor,
    });
  } catch (err) {
    console.error("[users/[username]/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
