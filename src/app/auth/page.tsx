"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Step = "email" | "otp";

export default function AuthPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Resend countdown starts fresh every time we enter the OTP step
  useEffect(() => {
    if (step !== "otp") return;
    setResendCountdown(60);
    setCanResend(false);
    const interval = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Auto-focus first digit box when OTP step appears
  useEffect(() => {
    if (step === "otp") {
      setTimeout(() => digitRefs.current[0]?.focus(), 50);
    }
  }, [step]);

  const code = digits.join("");

  async function sendOtp(targetEmail = email) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setStep("otp");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    if (code.length !== 6) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        if (typeof data.remainingAttempts === "number") {
          setRemainingAttempts(data.remainingAttempts);
        }
        return;
      }
      router.push(data.isNewUser ? "/auth/setup" : "/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);
    setError(null);
    setRemainingAttempts(null);
    if (digit && index < 5) digitRefs.current[index + 1]?.focus();
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    const next = ["", "", "", "", "", ""];
    pasted.split("").forEach((d, i) => { next[i] = d; });
    setDigits(next);
    digitRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  async function handleResend() {
    if (!canResend || loading) return;
    setDigits(["", "", "", "", "", ""]);
    setError(null);
    setRemainingAttempts(null);
    await sendOtp();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5">
      <div className="w-full max-w-[340px] space-y-10">

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-emerald-500 shadow-[0_2px_12px_rgba(16,185,129,0.35)]">
            <IndianRupee className="h-[26px] w-[26px] text-white" strokeWidth={2} />
          </div>
          <h1 className="text-[30px] font-thin tracking-[-0.04em] text-foreground">
            Hisaab
          </h1>
        </div>

        {step === "email" ? (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <p className="text-[22px] font-light tracking-[-0.02em]">Sign in</p>
              <p className="text-[14px] font-light text-muted-foreground leading-relaxed">
                Enter your email to get a sign-in code.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && email && sendOtp()}
                className="h-12 rounded-xl border-black/[0.1] bg-white px-4 text-[15px] font-light placeholder:text-muted-foreground/60 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                autoComplete="email"
                autoFocus
              />

              {error && (
                <p className="text-center text-[13px] font-light text-rose-500">{error}</p>
              )}

              <Button
                onClick={() => sendOtp()}
                disabled={!email.trim() || loading}
                className="w-full h-12 rounded-xl bg-emerald-500 text-white font-medium text-[15px] hover:bg-emerald-600 active:bg-emerald-700 transition-colors duration-150 disabled:opacity-40"
              >
                {loading ? "Sending…" : "Continue"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <p className="text-[22px] font-light tracking-[-0.02em]">Check your email</p>
              <p className="text-[14px] font-light text-muted-foreground leading-relaxed">
                We sent a 6-digit code to{" "}
                <button
                  onClick={() => { setStep("email"); setError(null); setDigits(["","","","","",""]); }}
                  className="text-foreground font-light underline underline-offset-2 hover:text-emerald-600 transition-colors duration-150"
                >
                  {email}
                </button>
              </p>
            </div>

            {/* 6-digit OTP boxes */}
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { digitRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleDigitKeyDown(i, e)}
                  className={cn(
                    "h-14 w-11 rounded-xl border text-center text-[22px] font-light outline-none caret-emerald-500",
                    "transition-all duration-150",
                    error
                      ? "border-rose-300 bg-rose-50/50 focus:border-rose-400 focus:ring-2 focus:ring-rose-400/20"
                      : "border-black/[0.1] bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  )}
                />
              ))}
            </div>

            {error && (
              <p className="text-center text-[13px] font-light text-rose-500">
                {error}
                {remainingAttempts !== null && remainingAttempts > 0 && (
                  <> &middot; {remainingAttempts} attempt{remainingAttempts !== 1 ? "s" : ""} left</>
                )}
              </p>
            )}

            <Button
              onClick={verifyOtp}
              disabled={code.length !== 6 || loading}
              className="w-full h-12 rounded-xl bg-emerald-500 text-white font-medium text-[15px] hover:bg-emerald-600 active:bg-emerald-700 transition-colors duration-150 disabled:opacity-40"
            >
              {loading ? "Verifying…" : "Verify"}
            </Button>

            <div className="text-center">
              {canResend ? (
                <button
                  onClick={handleResend}
                  className="text-[13px] font-light text-emerald-600 hover:text-emerald-700 transition-colors duration-150"
                >
                  Resend code
                </button>
              ) : (
                <p className="text-[13px] font-light text-muted-foreground">
                  Resend in {resendCountdown}s
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
