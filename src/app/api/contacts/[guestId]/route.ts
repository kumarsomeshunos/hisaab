import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, or, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { guestContacts, expenses, expenseSplits, settlements } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guestId: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const me = sessionData.user.id;
    const { guestId } = await params;

    if (!z.string().uuid().safeParse(guestId).success) {
      return NextResponse.json({ error: "Invalid guest ID." }, { status: 400 });
    }

    const [guest] = await db
      .select({ id: guestContacts.id, name: guestContacts.name, phone: guestContacts.phone, upiId: guestContacts.upiId, email: guestContacts.email, ownerId: guestContacts.ownerId })
      .from(guestContacts)
      .where(and(eq(guestContacts.id, guestId), eq(guestContacts.ownerId, me)))
      .limit(1);

    if (!guest) return NextResponse.json({ error: "Not found." }, { status: 404 });

    // Expenses where the guest participated and the current user created/participated
    const guestExpenseIds = await db
      .selectDistinct({ id: expenseSplits.expenseId })
      .from(expenseSplits)
      .where(eq(expenseSplits.guestId, guestId));

    const myExpenseIds = await db
      .selectDistinct({ id: expenseSplits.expenseId })
      .from(expenseSplits)
      .where(eq(expenseSplits.userId, me));

    const guestSet = new Set(guestExpenseIds.map((r) => r.id));
    const sharedIds = myExpenseIds.map((r) => r.id).filter((id) => guestSet.has(id));

    // Balance: I paid, guest owes → positive; guest paid, I owe → negative
    let balance = 0;

    if (sharedIds.length > 0) {
      const iPaidGuestOwes = await db
        .select({ amount: expenseSplits.amount })
        .from(expenses)
        .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
        .where(and(eq(expenses.paidById, me), eq(expenseSplits.guestId, guestId)));

      const guestPaidIOwes = await db
        .select({ amount: expenseSplits.amount })
        .from(expenses)
        .innerJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
        .where(and(eq(expenses.paidByGuestId, guestId), eq(expenseSplits.userId, me)));

      for (const r of iPaidGuestOwes) balance += r.amount;
      for (const r of guestPaidIOwes) balance -= r.amount;
    }

    // Adjust balance for settlements
    const guestSettlements = await db
      .select({ fromUserId: settlements.fromUserId, fromGuestId: settlements.fromGuestId, amount: settlements.amount })
      .from(settlements)
      .where(
        or(
          and(eq(settlements.fromUserId, me), eq(settlements.toGuestId, guestId)),
          and(eq(settlements.fromGuestId, guestId), eq(settlements.toUserId, me))
        )
      );

    for (const s of guestSettlements) {
      if (s.fromUserId === me) balance += s.amount ?? 0;  // I paid guest → my debt decreases
      else balance -= s.amount ?? 0;                      // guest paid me → their debt decreases
    }

    // Shared expenses (paginated)
    const sp = request.nextUrl.searchParams;
    const cursorParam = sp.get("cursor") || null;
    const limit = 20;

    let sharedExpenses: { id: string; title: string; amount: number; date: Date; myShare: number }[] = [];
    let nextCursor: string | null = null;

    if (sharedIds.length > 0) {
      const expenseRows = await db
        .select({ id: expenses.id, title: expenses.title, amount: expenses.amount, date: expenses.date })
        .from(expenses)
        .where(inArray(expenses.id, sharedIds))
        .orderBy(desc(expenses.date), desc(expenses.id));

      const mySplitRows = await db
        .select({ expenseId: expenseSplits.expenseId, amount: expenseSplits.amount })
        .from(expenseSplits)
        .where(and(eq(expenseSplits.userId, me), inArray(expenseSplits.expenseId, sharedIds)));

      const mySplitMap = new Map(mySplitRows.map((r) => [r.expenseId, r.amount]));

      let rows = expenseRows;
      if (cursorParam) {
        try {
          const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf8"));
          const cursorId = decoded.id;
          const idx = rows.findIndex((r) => r.id === cursorId);
          rows = idx >= 0 ? rows.slice(idx + 1) : rows;
        } catch { /* ignore */ }
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
      }));
    }

    return NextResponse.json({
      guest: { id: guest.id, name: guest.name, phone: guest.phone, upiId: guest.upiId, email: guest.email },
      balance,
      expenses: sharedExpenses,
      nextCursor,
    });
  } catch (err) {
    console.error("[contacts/[guestId]/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
