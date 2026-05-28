import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, sql, ne } from "drizzle-orm";
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
});

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const sessionData = await getSessionUser(token);
    if (!sessionData) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { user } = sessionData;

    if (user.isOnboarded) {
      return NextResponse.json({ error: "Already set up." }, { status: 400 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }

    const { name, username } = parsed.data;

    // Username uniqueness check (case-insensitive, excluding current user)
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          sql`lower(${users.username}) = lower(${username})`,
          ne(users.id, user.id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Username is already taken." },
        { status: 409 }
      );
    }

    await db
      .update(users)
      .set({ name, username, isOnboarded: true, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[auth/setup] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 }
    );
  }
}
