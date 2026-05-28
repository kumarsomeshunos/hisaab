import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { guestContacts } from "@/lib/db/schema";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const sessionData = await getSessionUser(token);
    if (!sessionData) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const { user } = sessionData;

    const guests = await db
      .select({ id: guestContacts.id, name: guestContacts.name, phone: guestContacts.phone, upiId: guestContacts.upiId, email: guestContacts.email })
      .from(guestContacts)
      .where(eq(guestContacts.ownerId, user.id))
      .orderBy(asc(guestContacts.name));

    return NextResponse.json({ guests });
  } catch (err) {
    console.error("[guest-contacts/GET] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  phone: z.string().max(20).optional(),
  upiId: z.string().trim().max(50)
    .refine((v) => v === "" || v.includes("@"), { message: "UPI ID must contain @." })
    .optional().nullable(),
  email: z.string().trim().email("Enter a valid email address.").max(200).optional().nullable(),
});

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
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }

    const { name, phone, upiId, email } = parsed.data;

    const [guest] = await db
      .insert(guestContacts)
      .values({
        ownerId: user.id,
        name: name.trim(),
        phone: phone ?? null,
        upiId: upiId === "" ? null : (upiId ?? null),
        email: email ?? null,
      })
      .returning({ id: guestContacts.id, name: guestContacts.name, phone: guestContacts.phone, upiId: guestContacts.upiId, email: guestContacts.email });

    return NextResponse.json({ guest }, { status: 201 });
  } catch (err) {
    console.error("[guest-contacts/POST] Unexpected error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
