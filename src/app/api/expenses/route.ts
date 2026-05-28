import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, or, inArray, desc, and, sql, ilike, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, friendships, expenses, expenseSplits, guestContacts, groups, groupMembers } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

// ---------- Split computation ----------

type SplitResult = { amount: number; rawValue: string | null };

function computeSplits(
  splitMode: string,
  participantKeys: string[],
  totalPaise: number,
  rawValues?: Record<string, string>
): Map<string, SplitResult> | string {
  const n = participantKeys.length;

  if (splitMode === "equal") {
    const base = Math.floor(totalPaise / n);
    const remainder = totalPaise - base * n;
    return new Map(participantKeys.map((k, i) => [k, { amount: base + (i < remainder ? 1 : 0), rawValue: null }]));
  }

  if (splitMode === "exact" || splitMode === "adjustment") {
    if (!rawValues) return "rawValues required for this split mode.";
    const result = new Map<string, SplitResult>();
    let total = 0;
    for (const k of participantKeys) {
      const raw = rawValues[k];
      if (raw == null) return "Missing amount for a participant.";
      const paise = Math.round(parseFloat(raw) * 100);
      if (isNaN(paise) || paise < 0) return "Invalid amount for a participant.";
      total += paise;
      result.set(k, { amount: paise, rawValue: raw });
    }
    if (total !== totalPaise) {
      return `Split amounts (₹${(total / 100).toFixed(2)}) don't match total (₹${(totalPaise / 100).toFixed(2)}).`;
    }
    return result;
  }

  if (splitMode === "percentage") {
    if (!rawValues) return "rawValues required for percentage split.";
    const result = new Map<string, SplitResult>();
    let totalPct = 0;
    const pcts: number[] = [];
    for (const k of participantKeys) {
      const raw = rawValues[k];
      if (raw == null) return "Missing percentage for a participant.";
      const pct = parseFloat(raw);
      if (isNaN(pct) || pct < 0) return "Invalid percentage for a participant.";
      totalPct += pct;
      pcts.push(pct);
    }
    if (Math.abs(totalPct - 100) > 0.01) {
      return `Percentages must sum to 100% (got ${totalPct.toFixed(2)}%).`;
    }
    let assigned = 0;
    participantKeys.forEach((k, i) => {
      let amount: number;
      if (i === participantKeys.length - 1) {
        amount = totalPaise - assigned;
      } else {
        amount = Math.round((totalPaise * pcts[i]) / 100);
        assigned += amount;
      }
      result.set(k, { amount, rawValue: rawValues![k] });
    });
    return result;
  }

  if (splitMode === "shares") {
    if (!rawValues) return "rawValues required for shares split.";
    const result = new Map<string, SplitResult>();
    let totalShares = 0;
    const shares: number[] = [];
    for (const k of participantKeys) {
      const raw = rawValues[k];
      if (raw == null) return "Missing share for a participant.";
      const share = parseFloat(raw);
      if (isNaN(share) || share <= 0) return "Shares must be positive numbers.";
      totalShares += share;
      shares.push(share);
    }
    let assigned = 0;
    participantKeys.forEach((k, i) => {
      let amount: number;
      if (i === participantKeys.length - 1) {
        amount = totalPaise - assigned;
      } else {
        amount = Math.round((totalPaise * shares[i]) / totalShares);
        assigned += amount;
      }
      result.set(k, { amount, rawValue: rawValues![k] });
    });
    return result;
  }

  if (splitMode === "one_owes_all") {
    if (!rawValues) return "rawValues required for one_owes_all split.";
    const result = new Map<string, SplitResult>();
    let debtorCount = 0;
    for (const k of participantKeys) {
      if (rawValues[k] === "all") {
        debtorCount++;
        result.set(k, { amount: totalPaise, rawValue: "all" });
      } else {
        result.set(k, { amount: 0, rawValue: "0" });
      }
    }
    if (debtorCount !== 1) return "Exactly one participant must be marked as the debtor.";
    return result;
  }

  return "Unknown split mode.";
}

// ---------- Schemas ----------

const userParticipant = z.object({ type: z.literal("user"), userId: z.string().uuid() });
const guestParticipant = z.object({ type: z.literal("guest"), guestId: z.string().uuid() });
const guestNewParticipant = z.object({
  type: z.literal("guest_new"),
  name: z.string().trim().min(1).max(60),
  phone: z.string().max(20).optional(),
});

const paidBySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user"), userId: z.string().uuid() }),
  z.object({ type: z.literal("guest"), guestId: z.string().uuid() }),
  z.object({ type: z.literal("guest_new"), name: z.string().trim().min(1).max(60), phone: z.string().max(20).optional() }),
]);

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(1000).optional(),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  paidBy: paidBySchema,
  splitMode: z.enum(["equal", "exact", "percentage", "shares", "one_owes_all", "adjustment"]).default("equal"),
  category: z.string().max(50).optional(),
  groupId: z.string().uuid().optional(),
  participants: z
    .array(z.discriminatedUnion("type", [userParticipant, guestParticipant, guestNewParticipant]))
    .min(2, "At least 2 participants required"),
  rawValues: z.record(z.string(), z.string()).optional(),
});

// ---------- POST ----------

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
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const { title, notes, amount, date, paidBy, splitMode, category, groupId, participants, rawValues } = parsed.data;

    const hasCurrentUser = participants.some((p) => p.type === "user" && p.userId === user.id);
    if (!hasCurrentUser) {
      return NextResponse.json({ error: "You must be a participant." }, { status: 400 });
    }

    if (groupId) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)));
      if (!membership) return NextResponse.json({ error: "You are not a member of this group." }, { status: 403 });
    }

    const totalPaise = Math.round(amount * 100);

    const otherUserIds = participants
      .filter((p): p is z.infer<typeof userParticipant> => p.type === "user")
      .map((p) => p.userId)
      .filter((id) => id !== user.id);

    if (otherUserIds.length > 0) {
      const friendRows = await db
        .select({ friendId: friendships.friendId })
        .from(friendships)
        .where(and(eq(friendships.userId, user.id), inArray(friendships.friendId, otherUserIds)));
      const friendSet = new Set(friendRows.map((r) => r.friendId));
      if (otherUserIds.some((id) => !friendSet.has(id))) {
        return NextResponse.json({ error: "All app-user participants must be your friends." }, { status: 403 });
      }
    }

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

    const participantKeys = participants.map((p, i) => {
      if (p.type === "user") return `user:${p.userId}`;
      if (p.type === "guest") return `guest:${p.guestId}`;
      return `guest_new:${i}`;
    });

    const splitResult = computeSplits(splitMode, participantKeys, totalPaise, rawValues);
    if (typeof splitResult === "string") {
      return NextResponse.json({ error: splitResult }, { status: 400 });
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

    // Resolve guest_new paidBy → insert guest_contact
    let paidByGuestNewId: string | null = null;
    if (paidBy.type === "guest_new") {
      const [g] = await db
        .insert(guestContacts)
        .values({ ownerId: user.id, name: paidBy.name.trim(), phone: paidBy.phone ?? null })
        .returning({ id: guestContacts.id });
      paidByGuestNewId = g.id;
    }

    // Resolve guest_new participants → insert guest_contacts
    const newGuestIds = new Map<string, string>();
    const guestNewEntries = participants
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.type === "guest_new") as { p: z.infer<typeof guestNewParticipant>; i: number }[];

    for (const { p, i } of guestNewEntries) {
      const key = `guest_new:${i}`;
      const isSameAsPaidBy =
        paidByGuestNewId &&
        paidBy.type === "guest_new" &&
        paidBy.name.trim() === p.name.trim() &&
        (paidBy.phone ?? null) === (p.phone ?? null);
      if (isSameAsPaidBy) {
        newGuestIds.set(key, paidByGuestNewId!);
      } else {
        const [g] = await db
          .insert(guestContacts)
          .values({ ownerId: user.id, name: p.name.trim(), phone: p.phone ?? null })
          .returning({ id: guestContacts.id });
        newGuestIds.set(key, g.id);
      }
    }

    const resolvedPaidById = paidBy.type === "user" ? paidBy.userId : null;
    const resolvedPaidByGuestId =
      paidBy.type === "guest" ? paidBy.guestId : paidBy.type === "guest_new" ? paidByGuestNewId : null;

    const [expense] = await db
      .insert(expenses)
      .values({
        title,
        notes: notes ?? null,
        amount: totalPaise,
        splitMode,
        category: category ?? null,
        groupId: groupId ?? null,
        paidById: resolvedPaidById,
        paidByGuestId: resolvedPaidByGuestId,
        createdById: user.id,
        date: new Date(date),
      })
      .returning();

    const splitRows = participants.map((p, i) => {
      const key = participantKeys[i];
      const { amount: amt, rawValue } = splitResult.get(key)!;
      if (p.type === "user") {
        return { expenseId: expense.id, userId: p.userId, guestId: null as string | null, amount: amt, rawValue };
      } else if (p.type === "guest") {
        return { expenseId: expense.id, userId: null as string | null, guestId: p.guestId, amount: amt, rawValue };
      } else {
        return { expenseId: expense.id, userId: null as string | null, guestId: newGuestIds.get(key)!, amount: amt, rawValue };
      }
    });

    await db.insert(expenseSplits).values(splitRows);

    const participantUserIds = participants
      .filter((p): p is z.infer<typeof userParticipant> => p.type === "user")
      .map((p) => p.userId);

    let groupName: string | undefined;
    if (groupId) {
      const [g] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, groupId));
      groupName = g?.name;
    }

    await writeActivity({
      type: "expense_added",
      actorId: user.id,
      groupId: groupId ?? null,
      payload: { expenseId: expense.id, title, amount: totalPaise, groupName },
      visibleToUserIds: participantUserIds,
    });

    return NextResponse.json(
      { expense: { id: expense.id, title: expense.title, amount: expense.amount, date: expense.date } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[expenses/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// ---------- GET ----------

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const sp = request.nextUrl.searchParams;

    const q = sp.get("q")?.trim() || null;
    const categoryFilter = sp.get("category") || null;
    const groupIdFilter = sp.get("groupId") || null;
    const fromFilter = sp.get("from") || null;
    const toFilter = sp.get("to") || null;
    const cursorParam = sp.get("cursor") || null;
    const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10) || 20, 100);

    let cursorDate: Date | null = null;
    let cursorId: string | null = null;
    if (cursorParam) {
      try {
        const decoded = JSON.parse(Buffer.from(cursorParam, "base64").toString("utf8"));
        cursorDate = new Date(decoded.date);
        cursorId = decoded.id;
      } catch {
        // invalid cursor — ignore and start from beginning
      }
    }

    const conditions = [eq(expenseSplits.userId, user.id)];

    if (q) conditions.push(ilike(expenses.title, `%${q}%`));
    if (categoryFilter) conditions.push(eq(expenses.category, categoryFilter));
    if (groupIdFilter) conditions.push(eq(expenses.groupId, groupIdFilter));
    if (fromFilter) conditions.push(gte(expenses.date, new Date(fromFilter)));
    if (toFilter) {
      const toDate = new Date(toFilter);
      toDate.setDate(toDate.getDate() + 1);
      conditions.push(lt(expenses.date, toDate));
    }
    if (cursorDate && cursorId) {
      conditions.push(
        or(
          lt(expenses.date, cursorDate),
          and(sql`${expenses.date} = ${cursorDate}::timestamptz`, lt(expenses.id, cursorId))
        )!
      );
    }

    const rows = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        category: expenses.category,
        amount: expenses.amount,
        date: expenses.date,
        groupId: expenses.groupId,
        groupName: groups.name,
        paidById: expenses.paidById,
        paidByGuestId: expenses.paidByGuestId,
        paidByName: users.name,
        paidByUsername: users.username,
        myShare: expenseSplits.amount,
      })
      .from(expenseSplits)
      .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
      .leftJoin(users, eq(expenses.paidById, users.id))
      .leftJoin(groups, eq(expenses.groupId, groups.id))
      .where(and(...conditions))
      .orderBy(desc(expenses.date), desc(expenses.id))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const guestPayerIds = page.filter((r) => r.paidByGuestId).map((r) => r.paidByGuestId as string);
    const guestPayerMap = new Map<string, string>();
    if (guestPayerIds.length > 0) {
      const guestRows = await db
        .select({ id: guestContacts.id, name: guestContacts.name })
        .from(guestContacts)
        .where(inArray(guestContacts.id, guestPayerIds));
      for (const g of guestRows) guestPayerMap.set(g.id, g.name);
    }

    let nextCursor: string | null = null;
    if (hasMore) {
      const last = page[page.length - 1];
      nextCursor = Buffer.from(JSON.stringify({ date: last.date.toISOString(), id: last.id })).toString("base64");
    }

    const result = page.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      amount: r.amount,
      date: r.date,
      groupId: r.groupId,
      groupName: r.groupName ?? null,
      myShare: r.myShare,
      paidBy: r.paidById
        ? { type: "user" as const, id: r.paidById, name: r.paidByName, username: r.paidByUsername }
        : { type: "guest" as const, id: r.paidByGuestId!, name: guestPayerMap.get(r.paidByGuestId!) ?? "Unknown" },
    }));

    return NextResponse.json({ expenses: result, nextCursor });
  } catch (err) {
    console.error("[expenses/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
