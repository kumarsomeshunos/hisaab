import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenseComments } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const { commentId } = await params;

    if (!z.string().uuid().safeParse(commentId).success) {
      return NextResponse.json({ error: "Invalid comment ID." }, { status: 400 });
    }

    const [comment] = await db
      .select({ id: expenseComments.id, userId: expenseComments.userId })
      .from(expenseComments)
      .where(eq(expenseComments.id, commentId))
      .limit(1);

    if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    if (comment.userId !== user.id) {
      return NextResponse.json({ error: "You can only delete your own comments." }, { status: 403 });
    }

    await db.delete(expenseComments).where(and(eq(expenseComments.id, commentId), eq(expenseComments.userId, user.id)));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expenses/[id]/comments/[commentId]/DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
