import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, expenses, expenseSplits, guestContacts, groups, settlements, expenseComments, friendships, groupMembers } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

// ---------- Shared split helper (duplicated from route.ts to avoid a shared import cycle) ----------

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

// ---------- GET ----------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid expense ID." }, { status: 400 });
    }

    const [expense] = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        notes: expenses.notes,
        amount: expenses.amount,
        splitMode: expenses.splitMode,
        category: expenses.category,
        date: expenses.date,
        groupId: expenses.groupId,
        paidById: expenses.paidById,
        paidByGuestId: expenses.paidByGuestId,
        createdById: expenses.createdById,
        groupName: groups.name,
        paidByName: users.name,
        paidByUsername: users.username,
      })
      .from(expenses)
      .leftJoin(groups, eq(expenses.groupId, groups.id))
      .leftJoin(users, eq(expenses.paidById, users.id))
      .where(eq(expenses.id, id))
      .limit(1);

    if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

    // User must be a participant to view
    const [myParticipation] = await db
      .select({ id: expenseSplits.id })
      .from(expenseSplits)
      .where(and(eq(expenseSplits.expenseId, id), eq(expenseSplits.userId, user.id)))
      .limit(1);

    if (!myParticipation && expense.createdById !== user.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    // Fetch all splits
    const userSplitRows = await db
      .select({
        splitId: expenseSplits.id,
        userId: expenseSplits.userId,
        amount: expenseSplits.amount,
        rawValue: expenseSplits.rawValue,
        name: users.name,
        username: users.username,
      })
      .from(expenseSplits)
      .innerJoin(users, eq(expenseSplits.userId, users.id))
      .where(and(eq(expenseSplits.expenseId, id), isNotNull(expenseSplits.userId)));

    const guestSplitRows = await db
      .select({
        splitId: expenseSplits.id,
        guestId: expenseSplits.guestId,
        amount: expenseSplits.amount,
        rawValue: expenseSplits.rawValue,
        name: guestContacts.name,
      })
      .from(expenseSplits)
      .innerJoin(guestContacts, eq(expenseSplits.guestId, guestContacts.id))
      .where(and(eq(expenseSplits.expenseId, id), isNotNull(expenseSplits.guestId)));

    // Compute pairwise balance for settlement status: net amount between me and each user participant
    const otherUserIds = userSplitRows.map((s) => s.userId!).filter((uid) => uid !== user.id);

    // Settlement status: settled if their net balance with me is 0 in this group context
    // We compute per-person: (what they owe me from all group expenses) - (what I owe them)
    // Simplified: just check settlements table for direct payments in this expense's group
    const settlementMap = new Map<string, number>(); // userId → net paise owed to me (positive = they owe me)

    if (expense.groupId && otherUserIds.length > 0) {
      const settlementRows = await db
        .select({ fromUserId: settlements.fromUserId, toUserId: settlements.toUserId, amount: settlements.amount })
        .from(settlements)
        .where(
          and(
            eq(settlements.groupId, expense.groupId),
            inArray(settlements.fromUserId, [user.id, ...otherUserIds])
          )
        );

      for (const s of settlementRows) {
        if (s.fromUserId === user.id && s.toUserId && otherUserIds.includes(s.toUserId)) {
          settlementMap.set(s.toUserId, (settlementMap.get(s.toUserId) ?? 0) + (s.amount ?? 0));
        } else if (s.toUserId === user.id && s.fromUserId && otherUserIds.includes(s.fromUserId)) {
          settlementMap.set(s.fromUserId, (settlementMap.get(s.fromUserId) ?? 0) - (s.amount ?? 0));
        }
      }
    }

    // Resolve guest payer name if needed
    let paidByGuestName: string | null = null;
    if (expense.paidByGuestId) {
      const [g] = await db
        .select({ name: guestContacts.name })
        .from(guestContacts)
        .where(eq(guestContacts.id, expense.paidByGuestId))
        .limit(1);
      paidByGuestName = g?.name ?? null;
    }

    const splits = [
      ...userSplitRows.map((s) => ({
        id: s.splitId,
        type: "user" as const,
        participantId: s.userId!,
        name: s.name,
        username: s.username,
        amount: s.amount,
        rawValue: s.rawValue,
        settlementStatus: s.userId === user.id
          ? "self"
          : (settlementMap.get(s.userId!) ?? 0) >= s.amount ? "settled" : "pending",
      })),
      ...guestSplitRows.map((s) => ({
        id: s.splitId,
        type: "guest" as const,
        participantId: s.guestId!,
        name: s.name,
        username: null,
        amount: s.amount,
        rawValue: s.rawValue,
        settlementStatus: "pending" as const,
      })),
    ];

    // Fetch comments
    const commentRows = await db
      .select({
        id: expenseComments.id,
        userId: expenseComments.userId,
        body: expenseComments.body,
        createdAt: expenseComments.createdAt,
        userName: users.name,
        userUsername: users.username,
      })
      .from(expenseComments)
      .innerJoin(users, eq(expenseComments.userId, users.id))
      .where(eq(expenseComments.expenseId, id))
      .orderBy(expenseComments.createdAt);

    return NextResponse.json({
      expense: {
        id: expense.id,
        title: expense.title,
        notes: expense.notes,
        amount: expense.amount,
        splitMode: expense.splitMode,
        category: expense.category,
        date: expense.date,
        groupId: expense.groupId,
        groupName: expense.groupName ?? null,
        createdById: expense.createdById,
        paidBy: expense.paidById
          ? { type: "user", id: expense.paidById, name: expense.paidByName, username: expense.paidByUsername }
          : { type: "guest", id: expense.paidByGuestId!, name: paidByGuestName },
        splits,
        comments: commentRows.map((c) => ({
          id: c.id,
          userId: c.userId,
          userName: c.userName,
          userUsername: c.userUsername,
          body: c.body,
          createdAt: c.createdAt,
        })),
      },
    });
  } catch (err) {
    console.error("[expenses/[id]/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// ---------- PATCH ----------

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

const editSchema = z.object({
  title: z.string().trim().min(1).max(200),
  notes: z.string().trim().max(1000).optional(),
  amount: z.number().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  paidBy: paidBySchema,
  splitMode: z.enum(["equal", "exact", "percentage", "shares", "one_owes_all", "adjustment"]).default("equal"),
  category: z.string().max(50).optional(),
  participants: z
    .array(z.discriminatedUnion("type", [userParticipant, guestParticipant, guestNewParticipant]))
    .min(2, "At least 2 participants required"),
  rawValues: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const { id } = await params;

    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ error: "Invalid expense ID." }, { status: 400 });
    }

    const [expense] = await db
      .select({ id: expenses.id, title: expenses.title, amount: expenses.amount, groupId: expenses.groupId, createdById: expenses.createdById })
      .from(expenses)
      .where(eq(expenses.id, id))
      .limit(1);

    if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    if (expense.createdById !== user.id) {
      return NextResponse.json({ error: "Only the creator can edit this expense." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const { title, notes, amount, date, paidBy, splitMode, category, participants, rawValues } = parsed.data;

    const hasCurrentUser = participants.some((p) => p.type === "user" && p.userId === user.id);
    if (!hasCurrentUser) {
      return NextResponse.json({ error: "You must be a participant." }, { status: 400 });
    }

    const totalPaise = Math.round(amount * 100);

    const otherUserIds = participants
      .filter((p): p is z.infer<typeof userParticipant> => p.type === "user")
      .map((p) => p.userId)
      .filter((uid) => uid !== user.id);

    if (otherUserIds.length > 0) {
      const friendRows = await db
        .select({ friendId: friendships.friendId })
        .from(friendships)
        .where(and(eq(friendships.userId, user.id), inArray(friendships.friendId, otherUserIds)));
      const friendSet = new Set(friendRows.map((r) => r.friendId));
      if (otherUserIds.some((uid) => !friendSet.has(uid))) {
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

    let paidByGuestNewId: string | null = null;
    if (paidBy.type === "guest_new") {
      const [g] = await db
        .insert(guestContacts)
        .values({ ownerId: user.id, name: paidBy.name.trim(), phone: paidBy.phone ?? null })
        .returning({ id: guestContacts.id });
      paidByGuestNewId = g.id;
    }

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

    // Delete old splits then insert new ones
    await db.delete(expenseSplits).where(eq(expenseSplits.expenseId, id));

    const splitRows = participants.map((p, i) => {
      const key = participantKeys[i];
      const { amount: amt, rawValue } = splitResult.get(key)!;
      if (p.type === "user") {
        return { expenseId: id, userId: p.userId, guestId: null as string | null, amount: amt, rawValue };
      } else if (p.type === "guest") {
        return { expenseId: id, userId: null as string | null, guestId: p.guestId, amount: amt, rawValue };
      } else {
        return { expenseId: id, userId: null as string | null, guestId: newGuestIds.get(key)!, amount: amt, rawValue };
      }
    });

    await db.insert(expenseSplits).values(splitRows);

    await db
      .update(expenses)
      .set({
        title,
        notes: notes ?? null,
        amount: totalPaise,
        splitMode,
        category: category ?? null,
        paidById: resolvedPaidById,
        paidByGuestId: resolvedPaidByGuestId,
        date: new Date(date),
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, id));

    const participantUserIds = participants
      .filter((p): p is z.infer<typeof userParticipant> => p.type === "user")
      .map((p) => p.userId);

    await writeActivity({
      type: "expense_edited",
      actorId: user.id,
      groupId: expense.groupId ?? null,
      payload: { expenseId: id, title, amount: totalPaise },
      visibleToUserIds: participantUserIds,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expenses/[id]/PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

// ---------- DELETE ----------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const { id } = await params;

    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return NextResponse.json({ error: "Invalid expense ID." }, { status: 400 });

    const [expense] = await db
      .select({ id: expenses.id, title: expenses.title, amount: expenses.amount, groupId: expenses.groupId, createdById: expenses.createdById })
      .from(expenses)
      .where(eq(expenses.id, parsed.data))
      .limit(1);

    if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    if (expense.createdById !== user.id) {
      return NextResponse.json({ error: "Only the creator can delete this expense." }, { status: 403 });
    }

    const splitUserRows = await db
      .select({ userId: expenseSplits.userId })
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, parsed.data));
    const visibleTo = splitUserRows.map((r) => r.userId).filter(Boolean) as string[];

    await db.delete(expenses).where(and(eq(expenses.id, parsed.data), eq(expenses.createdById, user.id)));

    await writeActivity({
      type: "expense_deleted",
      actorId: user.id,
      groupId: expense.groupId ?? null,
      payload: { expenseId: expense.id, title: expense.title, amount: expense.amount },
      visibleToUserIds: visibleTo,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expenses/[id]/DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
