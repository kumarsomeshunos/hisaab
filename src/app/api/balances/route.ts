import { NextRequest, NextResponse } from "next/server";
import { eq, and, or, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, friendships, expenses, expenseSplits, guestContacts, settlements } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const me = user.id;

    // ── Friend balances ──────────────────────────────────────────────────────

    const friendRows = await db
      .select({ friendId: friendships.friendId, name: users.name, username: users.username })
      .from(friendships)
      .innerJoin(users, eq(friendships.friendId, users.id))
      .where(eq(friendships.userId, me));

    // Splits on expenses I paid (theyOweMe)
    const theyOweRows = await db
      .select({ friendId: expenseSplits.userId, amount: expenseSplits.amount })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenses.paidById, me), isNotNull(expenseSplits.userId)));

    // My splits on expenses a friend paid (IOweThemRows)
    const iOweRows = await db
      .select({ friendId: expenses.paidById, amount: expenseSplits.amount })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenseSplits.userId, me), isNotNull(expenses.paidById)));

    // Settlements between me and any user (both direct and group)
    const settlementRows = await db
      .select({ fromUserId: settlements.fromUserId, toUserId: settlements.toUserId, amount: settlements.amount })
      .from(settlements)
      .where(
        or(
          and(eq(settlements.fromUserId, me), isNotNull(settlements.toUserId)),
          and(eq(settlements.toUserId, me), isNotNull(settlements.fromUserId))
        )
      );

    const friendSet = new Set(friendRows.map((f) => f.friendId));

    const theyOweMap = new Map<string, number>();
    for (const row of theyOweRows) {
      const fid = row.friendId;
      if (!fid || fid === me || !friendSet.has(fid)) continue;
      theyOweMap.set(fid, (theyOweMap.get(fid) ?? 0) + row.amount);
    }

    const iOweMap = new Map<string, number>();
    for (const row of iOweRows) {
      const fid = row.friendId;
      if (!fid || fid === me || !friendSet.has(fid)) continue;
      iOweMap.set(fid, (iOweMap.get(fid) ?? 0) + row.amount);
    }

    // I paid → reduces my debt → balance increases
    const iSettledMap = new Map<string, number>();
    // They paid → reduces their debt → balance decreases
    const theySettledMap = new Map<string, number>();
    for (const s of settlementRows) {
      if (s.fromUserId === me && s.toUserId) {
        iSettledMap.set(s.toUserId, (iSettledMap.get(s.toUserId) ?? 0) + (s.amount ?? 0));
      } else if (s.toUserId === me && s.fromUserId) {
        theySettledMap.set(s.fromUserId, (theySettledMap.get(s.fromUserId) ?? 0) + (s.amount ?? 0));
      }
    }

    const balances = friendRows.map((f) => ({
      userId: f.friendId,
      name: f.name,
      username: f.username,
      net: (theyOweMap.get(f.friendId) ?? 0) - (iOweMap.get(f.friendId) ?? 0) + (iSettledMap.get(f.friendId) ?? 0) - (theySettledMap.get(f.friendId) ?? 0),
    }));

    const totalOwedToYou = balances.filter((b) => b.net > 0).reduce((s, b) => s + b.net, 0);
    const totalYouOwe = balances.filter((b) => b.net < 0).reduce((s, b) => s + Math.abs(b.net), 0);
    const netTotal = totalOwedToYou - totalYouOwe;

    // ── Guest balances ───────────────────────────────────────────────────────

    // All guest contacts owned by me
    const myGuests = await db
      .select({ id: guestContacts.id, name: guestContacts.name, phone: guestContacts.phone })
      .from(guestContacts)
      .where(eq(guestContacts.ownerId, me));

    if (myGuests.length === 0) {
      return NextResponse.json({ balances, totalOwedToYou, totalYouOwe, netTotal, guestBalances: [], guestTotalOwedToYou: 0, guestTotalYouOwe: 0 });
    }

    // Splits on expenses I paid where the split participant is a guest (guest owes me)
    const guestOwesMeRows = await db
      .select({ guestId: expenseSplits.guestId, amount: expenseSplits.amount })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenses.paidById, me), isNotNull(expenseSplits.guestId)));

    // My splits on expenses a guest paid (I owe the guest)
    const iOweGuestRows = await db
      .select({ guestId: expenses.paidByGuestId, amount: expenseSplits.amount })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .where(and(eq(expenseSplits.userId, me), isNotNull(expenses.paidByGuestId)));

    // Guest settlements: I paid guest → balance increases; guest paid me → balance decreases
    const guestSettlementRows = await db
      .select({ fromUserId: settlements.fromUserId, fromGuestId: settlements.fromGuestId, toGuestId: settlements.toGuestId, amount: settlements.amount })
      .from(settlements)
      .where(
        or(
          and(eq(settlements.fromUserId, me), isNotNull(settlements.toGuestId)),
          and(eq(settlements.toUserId, me), isNotNull(settlements.fromGuestId))
        )
      );

    const guestSet = new Set(myGuests.map((g) => g.id));

    const guestOwesMap = new Map<string, number>();
    for (const row of guestOwesMeRows) {
      const gid = row.guestId;
      if (!gid || !guestSet.has(gid)) continue;
      guestOwesMap.set(gid, (guestOwesMap.get(gid) ?? 0) + row.amount);
    }

    const iOweGuestMap = new Map<string, number>();
    for (const row of iOweGuestRows) {
      const gid = row.guestId;
      if (!gid || !guestSet.has(gid)) continue;
      iOweGuestMap.set(gid, (iOweGuestMap.get(gid) ?? 0) + row.amount);
    }

    const iSettledGuestMap = new Map<string, number>();
    const guestSettledMap = new Map<string, number>();
    for (const s of guestSettlementRows) {
      if (s.fromUserId === me && s.toGuestId && guestSet.has(s.toGuestId)) {
        iSettledGuestMap.set(s.toGuestId, (iSettledGuestMap.get(s.toGuestId) ?? 0) + (s.amount ?? 0));
      } else if (s.fromGuestId && guestSet.has(s.fromGuestId)) {
        guestSettledMap.set(s.fromGuestId, (guestSettledMap.get(s.fromGuestId) ?? 0) + (s.amount ?? 0));
      }
    }

    // Only return guests with a non-zero balance
    const guestBalances = myGuests
      .map((g) => ({
        guestId: g.id,
        name: g.name,
        phone: g.phone,
        net: (guestOwesMap.get(g.id) ?? 0) - (iOweGuestMap.get(g.id) ?? 0) + (iSettledGuestMap.get(g.id) ?? 0) - (guestSettledMap.get(g.id) ?? 0),
      }))
      .filter((g) => g.net !== 0);

    const guestTotalOwedToYou = guestBalances.filter((g) => g.net > 0).reduce((s, g) => s + g.net, 0);
    const guestTotalYouOwe = guestBalances.filter((g) => g.net < 0).reduce((s, g) => s + Math.abs(g.net), 0);

    return NextResponse.json({ balances, totalOwedToYou, totalYouOwe, netTotal, guestBalances, guestTotalOwedToYou, guestTotalYouOwe });
  } catch (err) {
    console.error("[balances/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
