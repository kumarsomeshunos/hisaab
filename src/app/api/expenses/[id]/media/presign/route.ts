import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, count, isNotNull } from "drizzle-orm";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/lib/db";
import { expenses, expenseSplits, expenseMedia } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { r2, R2_BUCKET } from "@/lib/r2";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ATTACHMENTS = 5;

const EXT_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const schema = z.object({
  filename: z.string().min(1).max(200),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
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

    // Verify expense exists and user is a participant/creator
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
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const { mimeType, sizeBytes } = parsed.data;

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ error: "File type not allowed. Use JPEG, PNG, WEBP, HEIC, or PDF." }, { status: 400 });
    }

    if (sizeBytes > MAX_BYTES) {
      return NextResponse.json({ error: "File too large. Maximum 10 MB." }, { status: 400 });
    }

    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(expenseMedia)
      .where(eq(expenseMedia.expenseId, expenseId));

    if (cnt >= MAX_ATTACHMENTS) {
      return NextResponse.json({ error: `Maximum ${MAX_ATTACHMENTS} attachments per expense.` }, { status: 400 });
    }

    const ext = EXT_MAP[mimeType];
    const key = `media/${expenseId}/${crypto.randomUUID()}.${ext}`;

    const uploadUrl = await getSignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ContentType: mimeType,
        ContentLength: sizeBytes,
      }),
      { expiresIn: 300 }
    );

    return NextResponse.json({ uploadUrl, key, expiresIn: 300 });
  } catch (err) {
    console.error("[expenses/[id]/media/presign] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
