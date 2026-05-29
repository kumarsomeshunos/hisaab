import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, gt, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { otpCodes, users, sessions } from "@/lib/db/schema";
import { hashOtp } from "@/lib/auth/otp";
import { hashToken } from "@/lib/auth/hash";
import { generateSessionToken, SESSION_COOKIE, SESSION_COOKIE_OPTIONS } from "@/lib/auth/session";
import { checkRateLimit, getClientIp } from "@/lib/auth/ratelimit";

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits."),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed } = checkRateLimit(`verify:${ip}`, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const { email, code } = parsed.data;

    // Find the latest valid OTP for this email
    const [otpRecord] = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.email, email),
          eq(otpCodes.used, false),
          gt(otpCodes.expiresAt, new Date())
        )
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1);

    if (!otpRecord || otpRecord.attempts >= 3) {
      return NextResponse.json(
        { error: "OTP is invalid or has expired." },
        { status: 400 }
      );
    }

    // Compare submitted code hash
    const submittedHash = await hashOtp(code);

    if (submittedHash !== otpRecord.codeHash) {
      const newAttempts = otpRecord.attempts + 1;
      await db
        .update(otpCodes)
        .set({
          attempts: newAttempts,
          ...(newAttempts >= 3 ? { used: true } : {}),
        })
        .where(eq(otpCodes.id, otpRecord.id));

      return NextResponse.json(
        {
          error: "Incorrect code.",
          remainingAttempts: Math.max(0, 3 - newAttempts),
        },
        { status: 400 }
      );
    }

    // OTP verified — mark used
    await db
      .update(otpCodes)
      .set({ used: true })
      .where(eq(otpCodes.id, otpRecord.id));

    // Find or create user
    await db.insert(users).values({ email }).onConflictDoNothing();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "Something went wrong. Try again." },
        { status: 500 }
      );
    }

    // Create session — store hashed token, set raw token in cookie
    const token = generateSessionToken();
    const tokenHash = await hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({ id: tokenHash, userId: user.id, expiresAt });

    const response = NextResponse.json({
      success: true,
      isNewUser: !user.isOnboarded,
    });
    response.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);

    return response;
  } catch (err) {
    console.error("[otp/verify] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 }
    );
  }
}
