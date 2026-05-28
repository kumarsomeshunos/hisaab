import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, or, inArray, desc, and, isNull, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, friendships, expenses, expenseSplits, guestContacts } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

// Participant discriminated union
const userParticipant = z.object({
  type: z.literal("user"),
  userId: z.string().uuid(),
  amount: z.number().positive().optional(),
});
const guestParticipant = z.object({
  type: z.literal("guest"),
  guestId: z.string().uuid(),
  amount: z.number().positive().optional(),
});
const guestNewParticipant = z.object({
  type: z.literal("guest_new"),
  name: z.string().trim().min(1).max(60),
  phone: z.string().max(20).optional(),
  amount: z.number().positive().optional(),
});

const paidBySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: z.string().uuid() }),
  z.object({ type: z.literal("guest"), guestId: z.string().uuid() }),
  z.object({ type: z.literal("guest_new"), name: z.string().trim().min(1).max(60), phone: z.string().max(20).optional() }),
]);

const createSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  paidBy: paidBySchema,
  splitType: z.enum(["equal", "exact"]),
  participants: z
    .array(z.discriminatedUnion("type", [userParticipant, guestParticipant, guestNewParticipant]))
    .min(2, "At least 2 participants required"),
});

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }

    const { description, amount, date, paidBy, splitType, participants } = parsed.data;

    // Current user must be a participant
    const hasCurrentUser = participants.some((p) => p.type === "user" && p.userId === user.id);
    if (!hasCurrentUser) {
      return NextResponse.json({ error: "You must be a participant." }, { status: 400 });
    }

    const totalPaise = Math.round(amount * 100);
    const n = participants.length;

    // Verify all app-user participants are friends with current user (or self)
    const userParticipantIds = participants
      .filter((p): p is z.infer<typeof userParticipant> => p.type === "user")
      .map((p) => p.userId)
      .filter((id) => id !== user.id);

    if (userParticipantIds.length > 0) {
      const friendRows = await db
        .select({ friendId: friendships.friendId })
        .from(friendships)
        .where(and(eq(friendships.userId, user.id), inArray(friendships.friendId, userParticipantIds)));
      const friendSet = new Set(friendRows.map((r) => r.friendId));
      const stranger = userParticipantIds.find((id) => !friendSet.has(id));
      if (stranger) {
        return NextResponse.json({ error: "All app-user participants must be your friends." }, { status: 403 });
      }
    }

    // Verify existing guest participants belong to current user
    const existingGuestIds = participants
      .filter((p): p is z.infer<typeof guestParticipant> => p.type === "guest")
      .map((p) => p.guestId);

    if (existingGuestIds.length > 0) {
      const guestRows = await db
        .select({ id: guestContacts.id })
        .from(guestContacts)
        .where(and(eq(guestContacts.ownerId, user.id), inArray(guestContacts.id, existingGuestIds)));
      if (guestRows.length !== existingGuestIds.length) {
        return NextResponse.json({ error: "Invalid guest contact." }, { status: 403 });
      }
    }

    // Compute split amounts
    let splitAmounts: Map<string, number>; // key = "user:uuid" | "guest:uuid" | "guest_new:index"

    const participantKeys = participants.map((p, i) => {
      if (p.type === "user") return `user:${p.userId}`;
      if (p.type === "guest") return `guest:${p.guestId}`;
      return `guest_new:${i}`;
    });

    if (splitType === "equal") {
      const base = Math.floor(totalPaise / n);
      const remainder = totalPaise - base * n;
      splitAmounts = new Map(participantKeys.map((k, i) => [k, base + (i < remainder ? 1 : 0)]));
    } else {
      const exactTotal = participants.reduce((sum, p) => {
        if (p.amount == null) throw new Error("Each participant needs an amount in exact mode.");
        return sum + Math.round(p.amount * 100);
      }, 0);
      if (exactTotal !== totalPaise) {
        return NextResponse.json(
          { error: `Split amounts (₹${(exactTotal / 100).toFixed(2)}) don't match total (₹${(totalPaise / 100).toFixed(2)}).` },
          { status: 400 }
        );
      }
      splitAmounts = new Map(participants.map((p, i) => [participantKeys[i], Math.round((p.amount ?? 0) * 100)]));
    }

    // Resolve guest_new entries → insert into guest_contacts and get IDs
    const guestNewIndices = participants
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.type === "guest_new") as { p: z.infer<typeof guestNewParticipant>; i: number }[];

    const newGuestIds = new Map<string, string>(); // "guest_new:index" → guestId

    let paidByGuestNewId: string | null = null;
    if (paidBy.type === "guest_new") {
      const [g] = await db
        .insert(guestContacts)
        .values({ ownerId: user.id, name: paidBy.name.trim(), phone: paidBy.phone ?? null })
        .returning({ id: guestContacts.id });
      paidByGuestNewId = g.id;
    }

    for (const { p, i } of guestNewIndices) {
      const key = `guest_new:${i}`;
      if (
        paidByGuestNewId &&
        paidBy.type === "guest_new" &&
        paidBy.name.trim() === p.name.trim() &&
        (paidBy.phone ?? null) === (p.phone ?? null)
      ) {
        newGuestIds.set(key, paidByGuestNewId);
      } else {
        const [g] = await db
          .insert(guestContacts)
          .values({ ownerId: user.id, name: p.name.trim(), phone: p.phone ?? null })
          .returning({ id: guestContacts.id });
        newGuestIds.set(key, g.id);
      }
    }

    // Resolve paidBy
    let resolvedPaidById: string | null = null;
    let resolvedPaidByGuestId: string | null = null;

    if (paidBy.type === "user") {
      resolvedPaidById = paidBy.userId;
    } else if (paidBy.type === "guest") {
      resolvedPaidByGuestId = paidBy.guestId;
    } else {
      resolvedPaidByGuestId = paidByGuestNewId;
    }

    // Validate payer is among participants
    const payerInParticipants = participants.some((p) => {
      if (paidBy.type === "user" && p.type === "user") return p.userId === paidBy.userId;
      if (paidBy.type === "guest" && p.type === "guest") return p.guestId === paidBy.guestId;
      if (paidBy.type === "guest_new" && p.type === "guest_new") {
        return p.name.trim() === paidBy.name.trim() && (p.phone ?? null) === (paidBy.phone ?? null);
      }
      return false;
    });
    if (!payerInParticipants) {
      return NextResponse.json({ error: "Payer must be a participant." }, { status: 400 });
    }

    const [expense] = await db
      .insert(expenses)
      .values({
        description,
        amount: totalPaise,
        paidById: resolvedPaidById,
        paidByGuestId: resolvedPaidByGuestId,
        createdById: user.id,
        date: new Date(date),
      })
      .returning();

    const splitRows = participants.map((p, i) => {
      const key = participantKeys[i];
      const amt = splitAmounts.get(key)!;
      if (p.type === "user") {
        return { expenseId: expense.id, userId: p.userId, guestId: null as string | null, amount: amt };
      } else if (p.type === "guest") {
        return { expenseId: expense.id, userId: null as string | null, guestId: p.guestId, amount: amt };
      } else {
        const gid = newGuestIds.get(key)!;
        return { expenseId: expense.id, userId: null as string | null, guestId: gid, amount: amt };
      }
    });

    await db.insert(expenseSplits).values(splitRows);

    return NextResponse.json(
      { expense: { id: expense.id, description: expense.description, amount: expense.amount, date: expense.date } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[expenses/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const limitParam = request.nextUrl.searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 100) : 50;

    // Find expense IDs the user is involved in (as payer or split participant)
    const myExpenseIds = await db
      .selectDistinct({ id: expenses.id })
      .from(expenses)
      .leftJoin(expenseSplits, eq(expenseSplits.expenseId, expenses.id))
      .where(or(eq(expenses.paidById, user.id), eq(expenseSplits.userId, user.id)))
      .limit(limit);

    if (myExpenseIds.length === 0) {
      return NextResponse.json({ expenses: [] });
    }

    const ids = myExpenseIds.map((r) => r.id);

    // Fetch expenses with payer info — join users for user payer
    const expenseRows = await db
      .select({
        id: expenses.id,
        description: expenses.description,
        amount: expenses.amount,
        date: expenses.date,
        paidById: expenses.paidById,
        paidByGuestId: expenses.paidByGuestId,
        createdById: expenses.createdById,
        paidByName: users.name,
        paidByUsername: users.username,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.paidById, users.id))
      .where(inArray(expenses.id, ids))
      .orderBy(desc(expenses.date));

    // For expenses with a guest payer, fetch guest names separately
    const guestPayerIds = expenseRows
      .filter((e) => e.paidByGuestId != null)
      .map((e) => e.paidByGuestId as string);

    const guestPayerMap = new Map<string, string>();
    if (guestPayerIds.length > 0) {
      const guestRows = await db
        .select({ id: guestContacts.id, name: guestContacts.name })
        .from(guestContacts)
        .where(inArray(guestContacts.id, guestPayerIds));
      for (const g of guestRows) guestPayerMap.set(g.id, g.name);
    }

    // Fetch splits (user splits)
    const userSplitRows = await db
      .select({
        expenseId: expenseSplits.expenseId,
        userId: expenseSplits.userId,
        amount: expenseSplits.amount,
        name: users.name,
        username: users.username,
      })
      .from(expenseSplits)
      .innerJoin(users, eq(expenseSplits.userId, users.id))
      .where(and(inArray(expenseSplits.expenseId, ids), isNotNull(expenseSplits.userId)));

    // Fetch splits (guest splits)
    const guestSplitRows = await db
      .select({
        expenseId: expenseSplits.expenseId,
        guestId: expenseSplits.guestId,
        amount: expenseSplits.amount,
        name: guestContacts.name,
      })
      .from(expenseSplits)
      .innerJoin(guestContacts, eq(expenseSplits.guestId, guestContacts.id))
      .where(and(inArray(expenseSplits.expenseId, ids), isNotNull(expenseSplits.guestId)));

    // Group by expense
    const splitsByExpense = new Map<string, { type: "user" | "guest"; id: string; name: string | null; username?: string | null; amount: number }[]>();

    for (const s of userSplitRows) {
      const arr = splitsByExpense.get(s.expenseId) ?? [];
      arr.push({ type: "user", id: s.userId!, name: s.name, username: s.username, amount: s.amount });
      splitsByExpense.set(s.expenseId, arr);
    }
    for (const s of guestSplitRows) {
      const arr = splitsByExpense.get(s.expenseId) ?? [];
      arr.push({ type: "guest", id: s.guestId!, name: s.name, amount: s.amount });
      splitsByExpense.set(s.expenseId, arr);
    }

    const result = expenseRows.map((e) => {
      const splits = splitsByExpense.get(e.id) ?? [];
      const myShare = splits.find((s) => s.type === "user" && s.id === user.id)?.amount ?? 0;

      const paidBy = e.paidById
        ? { type: "user" as const, id: e.paidById, name: e.paidByName, username: e.paidByUsername }
        : { type: "guest" as const, id: e.paidByGuestId!, name: guestPayerMap.get(e.paidByGuestId!) ?? "Unknown" };

      return { id: e.id, description: e.description, amount: e.amount, date: e.date, paidBy, splits, myShare };
    });

    return NextResponse.json({ expenses: result });
  } catch (err) {
    console.error("[expenses/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
