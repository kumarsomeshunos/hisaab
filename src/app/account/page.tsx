"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, LogOut, ChevronRight, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid" | "unchanged";

type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  upiId: string | null;
};

const EMOJI_OPTIONS = ["😊","😎","🤑","🙈","🦊","🐼","🐸","🦄","🌸","⭐","🍕","🍦","🎉","✈️","🏖️","⚽","🎵","📚","💼","🏠","🌈","❤️","🔥","💎","🎯"];

function initials(name: string | null, username: string | null): string {
  if (name) return name.trim().charAt(0).toUpperCase();
  if (username) return username.trim().charAt(0).toUpperCase();
  return "?";
}

export default function AccountPage() {
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [upiId, setUpiId] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const [savedGuests, setSavedGuests] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [editingGuestName, setEditingGuestName] = useState("");
  const [editingGuestPhone, setEditingGuestPhone] = useState("");
  const [savingGuestId, setSavingGuestId] = useState<string | null>(null);
  const [deletingGuestId, setDeletingGuestId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/guest-contacts")
      .then((r) => r.json())
      .then((d) => setSavedGuests(d.guests ?? []))
      .catch(() => {});
  }, []);

  // Enter edit mode — seed inputs from current user
  function startEditing() {
    if (!user) return;
    setName(user.name ?? "");
    setUsername(user.username ?? "");
    setUpiId(user.upiId ?? "");
    setAvatar(user.avatarUrl);
    setUsernameStatus("unchanged");
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
  }

  // Debounced username availability check
  useEffect(() => {
    if (!editing) return;
    const raw = username.toLowerCase();

    if (raw === (user?.username ?? "").toLowerCase()) {
      setUsernameStatus("unchanged");
      return;
    }
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
  }, [username, editing, user]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), username: username.toLowerCase(), upiId: upiId.trim(), avatar }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        if (data.error?.toLowerCase().includes("taken")) setUsernameStatus("taken");
        return;
      }
      setUser((u) => u ? { ...u, name: data.user.name, username: data.user.username, upiId: data.user.upiId ?? null, avatarUrl: data.user.avatar ?? null } : u);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [user, name, username, upiId, avatar]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      router.push("/auth");
    }
  }, [router]);

  function startEditingGuest(g: { id: string; name: string; phone: string | null }) {
    setEditingGuestId(g.id);
    setEditingGuestName(g.name);
    setEditingGuestPhone(g.phone ?? "");
  }

  async function saveGuest(id: string) {
    if (!editingGuestName.trim()) return;
    setSavingGuestId(id);
    try {
      const res = await fetch(`/api/guest-contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingGuestName.trim(), phone: editingGuestPhone.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) return;
      setSavedGuests((prev) => prev.map((g) => g.id === id ? { id, name: data.guest.name, phone: data.guest.phone } : g));
      setEditingGuestId(null);
    } finally {
      setSavingGuestId(null);
    }
  }

  async function deleteGuest(id: string) {
    setDeletingGuestId(id);
    try {
      const res = await fetch(`/api/guest-contacts/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Could not delete guest."); return; }
      setSavedGuests((prev) => prev.filter((g) => g.id !== id));
    } finally {
      setDeletingGuestId(null);
    }
  }

  const canSave =
    name.trim().length >= 2 &&
    (usernameStatus === "available" || usernameStatus === "unchanged") &&
    !saving;

  const usernameHint: Partial<Record<UsernameStatus, React.ReactNode>> = {
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
      <span className="text-muted-foreground">3–30 characters — letters, numbers, underscores</span>
    ),
  };

  return (
    <AppShell>
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center justify-between px-5 md:px-6">
          {editing ? (
            <>
              <button
                onClick={cancelEditing}
                className="text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150"
              >
                Cancel
              </button>
              <span className="text-[17px] font-light tracking-[-0.02em]">Account</span>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </button>
            </>
          ) : (
            <>
              <h1 className="text-[17px] font-light tracking-[-0.02em]">Account</h1>
              <button
                onClick={startEditing}
                disabled={!user}
                className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150"
              >
                Edit
              </button>
            </>
          )}
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto space-y-8 pb-20 md:pb-8">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : user ? (
          <>
            {/* Avatar + name hero */}
            <div className="flex flex-col items-center gap-3 pt-2">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[32px] font-light">
                  {editing ? (avatar ?? initials(user.name, user.username)) : (user.avatarUrl ?? initials(user.name, user.username))}
                </AvatarFallback>
              </Avatar>
              {editing ? (
                <div className="flex flex-wrap gap-2 justify-center max-w-xs">
                  {EMOJI_OPTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setAvatar(avatar === e ? null : e)}
                      className={cn(
                        "h-10 w-10 text-[22px] rounded-full flex items-center justify-center transition-colors duration-150",
                        avatar === e ? "bg-emerald-500/20 ring-2 ring-emerald-500/40" : "hover:bg-black/[0.05]"
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-[20px] font-light tracking-[-0.02em]">{user.name ?? "—"}</p>
                  {user.username && (
                    <p className="text-[14px] text-muted-foreground font-light">@{user.username}</p>
                  )}
                </div>
              )}
            </div>

            {/* Profile fields */}
            <div className="space-y-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">
                Profile
              </p>
              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">

                {/* Name */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                  <span className="text-[14px] font-light text-muted-foreground w-20 shrink-0">Name</span>
                  {editing ? (
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setError(null); }}
                      placeholder="Your name"
                      autoFocus
                      className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  ) : (
                    <span className="flex-1 text-[15px] font-light">{user.name ?? <span className="text-muted-foreground">—</span>}</span>
                  )}
                  {!editing && <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                </div>

                {/* Username */}
                <div className="px-4 py-3.5 border-b border-black/[0.06]">
                  <div className="flex items-center gap-3">
                    <span className="text-[14px] font-light text-muted-foreground w-20 shrink-0">Username</span>
                    {editing ? (
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-[15px] font-light text-muted-foreground select-none">@</span>
                        <Input
                          type="text"
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
                          }
                          maxLength={30}
                          autoComplete="off"
                          autoCapitalize="none"
                          className={cn(
                            "h-8 w-full border-0 bg-transparent pl-4 p-0 text-[15px] font-light focus-visible:ring-0 focus-visible:ring-offset-0",
                            usernameStatus === "taken" && "text-rose-500"
                          )}
                        />
                      </div>
                    ) : (
                      <span className="flex-1 text-[15px] font-light">
                        {user.username ? `@${user.username}` : <span className="text-muted-foreground">—</span>}
                      </span>
                    )}
                    {!editing && <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                  </div>
                  {editing && usernameStatus !== "idle" && usernameStatus !== "unchanged" && (
                    <p className="text-[12px] font-light mt-1.5 pl-24">{usernameHint[usernameStatus]}</p>
                  )}
                </div>

                {/* Email — always read-only */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                  <span className="text-[14px] font-light text-muted-foreground w-20 shrink-0">Email</span>
                  <span className="flex-1 text-[15px] font-light text-muted-foreground">{user.email}</span>
                </div>

                {/* UPI ID */}
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="text-[14px] font-light text-muted-foreground w-20 shrink-0">UPI ID</span>
                  {editing ? (
                    <Input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="yourname@upi"
                      maxLength={50}
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  ) : (
                    <span className="flex-1 text-[15px] font-light">
                      {user.upiId ?? <span className="text-muted-foreground">—</span>}
                    </span>
                  )}
                  {!editing && <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
                </div>
              </div>
            </div>

            {error && (
              <p className="text-center text-[13px] font-light text-rose-500">{error}</p>
            )}

            {/* Saved Guests */}
            {savedGuests.length > 0 && !editing && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Saved Guests</p>
                <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                  {savedGuests.map((g, i) => (
                    <div key={g.id} className={cn("px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                      {editingGuestId === g.id ? (
                        <div className="space-y-2">
                          <Input
                            value={editingGuestName}
                            onChange={(e) => setEditingGuestName(e.target.value)}
                            placeholder="Name"
                            autoFocus
                            className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                          <Input
                            value={editingGuestPhone}
                            onChange={(e) => setEditingGuestPhone(e.target.value)}
                            placeholder="Phone (optional)"
                            className="h-8 flex-1 border-0 bg-transparent p-0 text-[14px] font-light text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                          <div className="flex gap-3 pt-1">
                            <button
                              onClick={() => setEditingGuestId(null)}
                              className="text-[13px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveGuest(g.id)}
                              disabled={!editingGuestName.trim() || savingGuestId === g.id}
                              className="text-[13px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150 flex items-center gap-1"
                            >
                              {savingGuestId === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-light truncate">{g.name}</p>
                            {g.phone && <p className="text-[13px] text-muted-foreground font-light">{g.phone}</p>}
                          </div>
                          <button
                            onClick={() => startEditingGuest(g)}
                            aria-label="Edit guest"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.06] transition-colors duration-150"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => deleteGuest(g.id)}
                            disabled={deletingGuestId === g.id}
                            aria-label="Delete guest"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-rose-400 hover:bg-rose-50 transition-colors duration-150 disabled:opacity-40"
                          >
                            {deletingGuestId === g.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                            }
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sign out */}
            {!editing && (
              <Button
                variant="ghost"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full h-11 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 font-light text-[15px] gap-2 transition-colors duration-150"
              >
                {signingOut
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <LogOut className="h-4 w-4" strokeWidth={1.5} />
                }
                Sign out
              </Button>
            )}
          </>
        ) : (
          <p className="text-center text-[14px] font-light text-muted-foreground py-16">
            Could not load profile.
          </p>
        )}
      </div>
    </AppShell>
  );
}
