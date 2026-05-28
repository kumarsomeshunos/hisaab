import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, count } from "drizzle-orm";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { expenses, expenseSplits, expenseMedia } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { r2, R2_BUCKET, R2_PUBLIC_URL } from "@/lib/r2";

const MAX_ATTACHMENTS = 5;

const confirmSchema = z.object({
  key: z.string().regex(/^media\/[0-9a-f-]{36}\/[0-9a-f-]+\.(jpg|jpeg|png|webp|heic|pdf)$/),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
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

    const [expense] = await db
      .select({ id: expenses.id, createdById: expenses.createdById })
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1);

    if (!expense) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

    const [myParticipation] = await db
      .select({ id: expenseSplits.id })
      .from(expenseSplits)
      .where(and(eq(expenseSplits.expenseId, expenseId), eq(expenseSplits.userId, user.id)))
      .limit(1);

    if (!myParticipation && expense.createdById !== user.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const body = await request.json();
    const parsed = confirmSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const { key, mimeType, sizeBytes } = parsed.data;

    // Key must belong to this expense
    if (!key.startsWith(`media/${expenseId}/`)) {
      return NextResponse.json({ error: "Key does not belong to this expense." }, { status: 400 });
    }

    // Verify the object actually exists in R2
    try {
      await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch {
      return NextResponse.json({ error: "Upload not found in storage. Upload the file first." }, { status: 400 });
    }

    // Race guard: re-check count
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(expenseMedia)
      .where(eq(expenseMedia.expenseId, expenseId));

    if (cnt >= MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `Maximum ${MAX_ATTACHMENTS} attachments per expense.` }, { status: 400 });
    }

    const [row] = await db
      .insert(expenseMedia)
      .values({ expenseId, uploadedById: user.id, key, mimeType, sizeBytes })
      .returning();

    return NextResponse.json({
      id: row.id,
      key: row.key,
      url: `${R2_PUBLIC_URL}/${row.key}`,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt,
    });
  } catch (err) {
    console.error("[expenses/[id]/media/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
