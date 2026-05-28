"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { IndianRupee, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function SetupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Debounced live username availability check
  useEffect(() => {
    const raw = username.toLowerCase();
    if (raw.length === 0) { setUsernameStatus("idle"); return; }
    if (raw.length < 3 || !/^[a-z0-9_]+$/.test(raw)) { setUsernameStatus("invalid"); return; }

    setUsernameStatus("checking");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/username-check?username=${encodeURIComponent(raw)}`);
        const data = await res.json();
        setUsernameStatus(data.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [username]);

  async function handleSubmit() {
    if (!name.trim() || usernameStatus !== "available" || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), username: username.toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        if (data.error?.toLowerCase().includes("taken")) setUsernameStatus("taken");
        return;
      }
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  const usernameHint: Record<UsernameStatus, React.ReactNode> = {
    idle: null,
    checking: (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
      </span>
    ),
    available: (
      <span className="flex items-center gap-1 text-emerald-600">
        <Check className="h-3 w-3" strokeWidth={2.5} /> Available
      </span>
    ),
    taken: (
      <span className="flex items-center gap-1 text-rose-500">
        <X className="h-3 w-3" strokeWidth={2.5} /> Already taken
      </span>
    ),
    invalid: (
      <span className="text-muted-foreground">
        3–30 characters — letters, numbers, underscores
      </span>
    ),
  };

  const canSubmit =
    name.trim().length >= 2 && usernameStatus === "available" && !loading;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5">
      <div className="w-full max-w-[340px] space-y-10">

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-emerald-500 shadow-[0_2px_12px_rgba(16,185,129,0.35)]">
            <IndianRupee className="h-[26px] w-[26px] text-white" strokeWidth={2} />
          </div>
          <h1 className="text-[30px] font-thin tracking-[-0.04em] text-foreground">
            Dutch
          </h1>
        </div>

        <div className="space-y-6">
          <div className="text-center space-y-1">
            <p className="text-[22px] font-light tracking-[-0.02em]">Welcome</p>
            <p className="text-[14px] font-light text-muted-foreground leading-relaxed">
              Let&apos;s set up your profile.
            </p>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1">
                Your name
              </label>
              <Input
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="h-12 rounded-xl border-black/[0.1] bg-white px-4 text-[15px] font-light placeholder:text-muted-foreground/60 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                autoComplete="name"
                autoFocus
              />
            </div>

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1">
                Username
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-light text-muted-foreground select-none">
                  @
                </span>
                <Input
                  type="text"
                  placeholder="yourname"
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                  }
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  maxLength={30}
                  autoComplete="off"
                  autoCapitalize="none"
                  className={cn(
                    "h-12 rounded-xl border-black/[0.1] bg-white pl-8 pr-4 text-[15px] font-light placeholder:text-muted-foreground/60 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400",
                    usernameStatus === "taken" && "border-rose-300 focus-visible:border-rose-400 focus-visible:ring-rose-400/20",
                    usernameStatus === "available" && "border-emerald-300"
                  )}
                />
              </div>
              {usernameStatus !== "idle" && (
                <p className="text-[12px] font-light px-1">{usernameHint[usernameStatus]}</p>
              )}
            </div>

            {error && (
              <p className="text-center text-[13px] font-light text-rose-500">{error}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full h-12 rounded-xl bg-emerald-500 text-white font-medium text-[15px] hover:bg-emerald-600 active:bg-emerald-700 transition-colors duration-150 disabled:opacity-40 mt-1"
            >
              {loading ? "Setting up…" : "Get started"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
