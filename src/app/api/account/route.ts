import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(60),
  username: z
    .string()
    .regex(
      /^[a-z0-9_]{3,30}$/,
      "Username must be 3–30 characters: letters, numbers, underscores only."
    ),
  upiId: z
    .string()
    .trim()
    .max(50)
    .refine((v) => v === "" || v.includes("@"), { message: "UPI ID must contain @." })
    .optional(),
  avatar: z.string().max(4).nullable().optional(),
  phone: z
    .string()
    .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number.")
    .optional()
    .nullable(),
  notificationEmails: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }

    const { name, username, upiId, avatar, phone, notificationEmails } = parsed.data;

    // Username uniqueness — exclude current user so they can keep their own
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.username}) = lower(${username})`, ne(users.id, user.id)))
      .limit(1);

    if (taken.length > 0) {
      return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
    }

    const resolvedUpiId = upiId === "" ? null : (upiId ?? undefined);
    const resolvedAvatar = avatar === undefined ? undefined : (avatar ?? null);
    const resolvedPhone = phone === "" ? null : (phone ?? undefined);

    await db
      .update(users)
      .set({
        name,
        username,
        ...(resolvedUpiId !== undefined ? { upiId: resolvedUpiId } : {}),
        ...(resolvedAvatar !== undefined ? { avatarUrl: resolvedAvatar } : {}),
        ...(resolvedPhone !== undefined ? { phone: resolvedPhone } : {}),
        ...(notificationEmails !== undefined ? { notificationEmails } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return NextResponse.json({ success: true, user: { name, username, upiId: resolvedUpiId ?? null, avatar: resolvedAvatar ?? null, phone: resolvedPhone ?? null } });
  } catch (err) {
    console.error("[account/PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
