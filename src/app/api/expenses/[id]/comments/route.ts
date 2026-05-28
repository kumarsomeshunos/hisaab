import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenseComments, expenseSplits, expenses, users } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { writeActivity } from "@/lib/activity";

const createSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const { id: expenseId } = await params;

    if (!z.string().uuid().safeParse(expenseId).success) {
      return NextResponse.json({ error: "Invalid expense ID." }, { status: 400 });
    }

    // User must be a participant
    const [participation] = await db
      .select({ id: expenseSplits.id })
      .from(expenseSplits)
      .where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.userId, user.id)))
      .limit(1);

    if (!participation) {
      return NextResponse.json({ error: "You are not a participant in this expense." }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const [comment] = await db
      .insert(expenseComments)
      .values({ expenseId, userId: user.id, body: parsed.data.body })
      .returning();

    // Notify other participants
    const splitUserRows = await db
      .select({ userId: expenseSplits.userId })
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId));
    const visibleTo = splitUserRows.map((r) => r.userId).filter(Boolean) as string[];

    const [expense] = await db.select({ groupId: expenses.groupId }).from(expenses).where(eq(expenses.id, expenseId)).limit(1);
    const [actor] = await db.select({ name: users.name, username: users.username }).from(users).where(eq(users.id, user.id)).limit(1);

    await writeActivity({
      type: "expense_commented",
      actorId: user.id,
      groupId: expense?.groupId ?? null,
      payload: { expenseId, commentId: comment.id, actorName: actor?.name ?? actor?.username ?? "Someone" },
      visibleToUserIds: visibleTo,
    });

    return NextResponse.json({ comment: { id: comment.id, body: comment.body, createdAt: comment.createdAt } }, { status: 201 });
  } catch (err) {
    console.error("[expenses/[id]/comments/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
