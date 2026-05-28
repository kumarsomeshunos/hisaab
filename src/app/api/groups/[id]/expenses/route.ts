import { NextRequest, NextResponse } from "next/server";
import { eq, and, desc, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, expenseSplits, groupMembers, users, guestContacts } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { id: groupId } = await params;

    // Must be a member
    const [myMembership] = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, me)));
    if (!myMembership) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const expenseRows = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        date: expenses.date,
        createdById: expenses.createdById,
        paidById: expenses.paidById,
        paidByGuestId: expenses.paidByGuestId,
        paidByName: users.name,
        paidByUsername: users.username,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.paidById, users.id))
      .where(eq(expenses.groupId, groupId))
      .orderBy(desc(expenses.date));

    if (expenseRows.length === 0) return NextResponse.json({ expenses: [] });

    const ids = expenseRows.map((e) => e.id);

    const guestPayerIds = expenseRows.filter((e) => e.paidByGuestId != null).map((e) => e.paidByGuestId as string);
    const guestPayerMap = new Map<string, string>();
    if (guestPayerIds.length > 0) {
      const guestRows = await db
        .select({ id: guestContacts.id, name: guestContacts.name })
        .from(guestContacts)
        .where(inArray(guestContacts.id, guestPayerIds));
      for (const g of guestRows) guestPayerMap.set(g.id, g.name);
    }

    const userSplits = await db
      .select({ expenseId: expenseSplits.expenseId, userId: expenseSplits.userId, amount: expenseSplits.amount })
      .from(expenseSplits)
      .where(and(inArray(expenseSplits.expenseId, ids), isNotNull(expenseSplits.userId)));

    const myShareMap = new Map<string, number>();
    for (const s of userSplits) {
      if (s.userId === me) myShareMap.set(s.expenseId, s.amount);
    }

    const result = expenseRows.map((e) => ({
      id: e.id,
      description: e.description,
      amount: e.amount,
      date: e.date,
      createdById: e.createdById,
      paidBy: e.paidById
        ? { type: "user" as const, id: e.paidById, name: e.paidByName, username: e.paidByUsername }
        : { type: "guest" as const, id: e.paidByGuestId!, name: guestPayerMap.get(e.paidByGuestId!) ?? "Unknown" },
      myShare: myShareMap.get(e.id) ?? 0,
    }));

    return NextResponse.json({ expenses: result });
  } catch (err) {
    console.error("[groups/[id]/expenses/GET]", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
