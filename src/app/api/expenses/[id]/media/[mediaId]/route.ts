import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/lib/db";
import { expenseMedia } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { r2, R2_BUCKET } from "@/lib/r2";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;
    const { id: expenseId, mediaId } = await params;

    if (!z.string().uuid().safeParse(expenseId).success || !z.string().uuid().safeParse(mediaId).success) {
      return NextResponse.json({ error: "Invalid ID." }, { status: 400 });
    }

    const [media] = await db
      .select()
      .from(expenseMedia)
      .where(and(eq(expenseMedia.id, mediaId), eq(expenseMedia.expenseId, expenseId)))
      .limit(1);

    if (!media) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (media.uploadedById !== user.id) {
      return NextResponse.json({ error: "Only the uploader can delete this attachment." }, { status: 403 });
    }

    await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: media.key }));
    await db.delete(expenseMedia).where(eq(expenseMedia.id, mediaId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[expenses/[id]/media/[mediaId]/DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
