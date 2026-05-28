import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { eq, and, gt, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { otpCodes } from "@/lib/db/schema";
import { generateOtp, hashOtp } from "@/lib/auth/otp";

const schema = z.object({
  email: z
    .string()
    .email("Invalid email address.")
    .transform((v) => v.toLowerCase().trim()),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid email address." },
        { status: 400 }
      );
    }

    const { email } = parsed.data;

    // Rate limit: max 3 OTP sends per email per hour (count rows, don't delete first)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(otpCodes)
      .where(and(eq(otpCodes.email, email), gt(otpCodes.createdAt, oneHourAgo)));

    if (cnt >= 3) {
      return NextResponse.json(
        { error: "Too many attempts. Try again in an hour." },
        { status: 429 }
      );
    }

    // Invalidate all previous unused OTPs for this email
    await db
      .update(otpCodes)
      .set({ used: true })
      .where(and(eq(otpCodes.email, email), eq(otpCodes.used, false)));

    // Generate and store new OTP
    const otp = generateOtp();
    const codeHash = await hashOtp(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await db.insert(otpCodes).values({ email, codeHash, expiresAt });

    // Development fallback: log OTP to console when no Resend key is set
    if (!process.env.RESEND_API_KEY) {
      console.log(`[DEV] OTP for ${email}: ${otp}`);
      return NextResponse.json({ success: true });
    }

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: emailError } = await resend.emails.send({
      from: process.env.FROM_EMAIL ?? "Hisaab <noreply@hisaab.app>",
      to: email,
      subject: `Your Hisaab sign-in code: ${otp}`,
      html: buildEmailHtml(otp),
    });

    if (emailError) {
      console.error("[otp/send] Resend error:", emailError);
      return NextResponse.json(
        { error: "Failed to send email. Try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[otp/send] Unexpected error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 }
    );
  }
}

function buildEmailHtml(otp: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:40px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,0.06);">
    <div style="background:#10b981;padding:24px 32px;">
      <p style="color:#ffffff;font-size:20px;font-weight:300;margin:0;letter-spacing:-0.02em;">Hisaab</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#111;font-size:16px;font-weight:300;margin:0 0 8px 0;">Your sign-in code</p>
      <p style="color:#666;font-size:14px;font-weight:300;margin:0 0 28px 0;line-height:1.6;">
        Enter this code to sign in to Hisaab. It expires in 10 minutes.
      </p>
      <div style="background:#f5f5f5;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
        <p style="font-size:40px;font-weight:200;letter-spacing:0.2em;color:#111;margin:0;">${otp}</p>
      </div>
      <p style="color:#999;font-size:13px;font-weight:300;margin:0;line-height:1.5;">
        If you didn&apos;t request this, you can safely ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}
