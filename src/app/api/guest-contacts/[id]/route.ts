import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { guestContacts } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  phone: z.string().max(20).optional().nullable(),
  upiId: z.string().trim().max(50)
    .refine((v) => v === "" || v.includes("@"), { message: "UPI ID must contain @." })
    .optional().nullable(),
  email: z.string().trim().email("Enter a valid email address.").max(200).optional().nullable(),
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

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input." }, { status: 400 });
    }

    const { name, phone, upiId, email } = parsed.data;

    const [updated] = await db
      .update(guestContacts)
      .set({
        name: name.trim(),
        phone: phone ?? null,
        upiId: upiId === "" ? null : (upiId ?? null),
        email: email ?? null,
      })
      .where(and(eq(guestContacts.id, id), eq(guestContacts.ownerId, user.id)))
      .returning({ id: guestContacts.id, name: guestContacts.name, phone: guestContacts.phone, upiId: guestContacts.upiId, email: guestContacts.email });

    if (!updated) return NextResponse.json({ error: "Guest not found." }, { status: 404 });

    return NextResponse.json({ guest: updated });
  } catch (err) {
    console.error("[guest-contacts/[id]/PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

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

    try {
      const [deleted] = await db
        .delete(guestContacts)
        .where(and(eq(guestContacts.id, id), eq(guestContacts.ownerId, user.id)))
        .returning({ id: guestContacts.id });

      if (!deleted) return NextResponse.json({ error: "Guest not found." }, { status: 404 });
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "23503") {
        return NextResponse.json(
          { error: "This guest has shared expenses and cannot be deleted." },
          { status: 400 }
        );
      }
      throw e;
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[guest-contacts/[id]/DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
