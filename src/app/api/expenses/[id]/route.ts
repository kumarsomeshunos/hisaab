import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

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
      .select({ id: expenses.id, createdById: expenses.createdById })
      .from(expenses)
      .where(eq(expenses.id, parsed.data))
      .limit(1);

    if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
    if (expense.createdById !== user.id) {
      return NextResponse.json({ error: "Only the creator can delete this expense." }, { status: 403 });
    }

    await db.delete(expenses).where(and(eq(expenses.id, parsed.data), eq(expenses.createdById, user.id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expenses/[id]/DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
