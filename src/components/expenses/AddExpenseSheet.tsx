"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, Check, BookUser, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type UserParticipant = {
  kind: "user";
  id: string;
  name: string | null;
  username: string | null;
  amountStr: string;
};

type GuestParticipant = {
  kind: "guest";
  localId: string;     // client-side key (crypto.randomUUID())
  guestId: string | null;  // null = new, set after submit
  name: string;
  phone: string | null;
  amountStr: string;
};

type Participant = UserParticipant | GuestParticipant;

type PaidByRef =
  | { kind: "user"; id: string }
  | { kind: "guest"; localId: string };

type AppFriend = { id: string; name: string | null; username: string | null };
type SavedGuest = { id: string; name: string; phone: string | null };
type SplitType = "equal" | "exact";

// ── Helpers ───────────────────────────────────────────────────────────────────

function participantKey(p: Participant): string {
  return p.kind === "user" ? `user:${p.id}` : `guest:${p.localId}`;
}

function participantName(p: Participant, currentUserId: string): string {
  if (p.kind === "user") return p.id === currentUserId ? "You" : (p.name ?? p.username ?? "?");
  return p.name;
}

function participantInitials(p: Participant, currentUserId: string): string {
  const name = participantName(p, currentUserId);
  return name.trim().charAt(0).toUpperCase();
}

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

const contactPickerSupported =
  typeof navigator !== "undefined" &&
  "contacts" in navigator &&
  "ContactsManager" in window;

// ── Component ─────────────────────────────────────────────────────────────────

interface AddExpenseSheetProps {
  currentUser: { id: string; name: string | null; username: string | null };
  onClose: () => void;
  onSaved: () => void;
  groupId?: string;
  groupName?: string;
  groupMembers?: { type: "user" | "guest"; id: string; name: string | null; username?: string | null; phone?: string | null }[];
}

export function AddExpenseSheet({ currentUser, onClose, onSaved, groupId, groupName, groupMembers: initialGroupMembers }: AddExpenseSheetProps) {
  // Form fields
  const [description, setDescription] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [dateStr, setDateStr] = useState(todayStr());
  const [splitType, setSplitType] = useState<SplitType>("equal");

  // Participants — starts with current user (+ group members if provided)
  const [participants, setParticipants] = useState<Participant[]>(() => {
    const self: UserParticipant = { kind: "user", id: currentUser.id, name: currentUser.name, username: currentUser.username, amountStr: "" };
    if (!initialGroupMembers) return [self];
    const extras: Participant[] = initialGroupMembers
      .filter((m) => !(m.type === "user" && m.id === currentUser.id))
      .map((m) =>
        m.type === "user"
          ? { kind: "user", id: m.id, name: m.name, username: m.username ?? null, amountStr: "" } as UserParticipant
          : { kind: "guest", localId: crypto.randomUUID(), guestId: m.id, name: m.name ?? "", phone: m.phone ?? null, amountStr: "" } as GuestParticipant
      );
    return [self, ...extras];
  });
  const [paidByRef, setPaidByRef] = useState<PaidByRef>({ kind: "user", id: currentUser.id });

  // App friend search
  const [friendQuery, setFriendQuery] = useState("");
  const [allFriends, setAllFriends] = useState<AppFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  // Saved guest contacts
  const [savedGuests, setSavedGuests] = useState<SavedGuest[]>([]);
  const [guestQuery, setGuestQuery] = useState("");

  // Manual guest name fallback (when Contact Picker unavailable)
  const [manualGuestName, setManualGuestName] = useState("");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const descriptionRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => descriptionRef.current?.focus(), 150); }, []);

  // Load friends and saved guest contacts once on mount
  useEffect(() => {
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => setAllFriends(d.friends ?? []))
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
    fetch("/api/guest-contacts")
      .then((r) => r.json())
      .then((d) => setSavedGuests(d.guests ?? []))
      .catch(() => {});
  }, []);

  // ── Participant mutation helpers ────────────────────────────────────────────

  const addUserParticipant = useCallback((friend: AppFriend) => {
    setParticipants((prev) => [
      ...prev,
      { kind: "user", id: friend.id, name: friend.name, username: friend.username, amountStr: "" },
    ]);
    setFriendQuery("");
  }, []);

  const addGuestParticipant = useCallback((name: string, phone: string | null, guestId: string | null = null) => {
    const localId = crypto.randomUUID();
    setParticipants((prev) => [
      ...prev,
      { kind: "guest", localId, guestId, name, phone, amountStr: "" },
    ]);
  }, []);

  const removeParticipant = useCallback((key: string) => {
    setParticipants((prev) => {
      const next = prev.filter((p) => participantKey(p) !== key);
      return next;
    });
    // If removed participant was payer, revert to self
    setPaidByRef((ref) => {
      const refKey = ref.kind === "user" ? `user:${ref.id}` : `guest:${ref.localId}`;
      return refKey === key ? { kind: "user", id: currentUser.id } : ref;
    });
  }, [currentUser.id]);

  const updateExactAmount = useCallback((key: string, val: string) => {
    setParticipants((prev) =>
      prev.map((p) => participantKey(p) === key ? { ...p, amountStr: val } : p)
    );
  }, []);

  // ── Contact Picker ─────────────────────────────────────────────────────────

  const handleContactPicker = useCallback(async () => {
    try {
      // @ts-expect-error — Contact Picker API not in TS lib yet
      const contacts = await navigator.contacts.select(["name", "tel"], { multiple: true });
      for (const contact of contacts) {
        const name: string = contact.name?.[0] ?? "Unknown";
        const phone: string | null = contact.tel?.[0] ?? null;
        if (name) addGuestParticipant(name, phone, null);
      }
    } catch {
      // User cancelled or permission denied — silently ignore
    }
  }, [addGuestParticipant]);

  // ── Split computation ──────────────────────────────────────────────────────

  const totalPaise = Math.round((parseFloat(amountStr) || 0) * 100);
  const n = participants.length;
  const equalBase = n > 0 ? Math.floor(totalPaise / n) : 0;
  const equalRemainder = n > 0 ? totalPaise - equalBase * n : 0;
  const equalSplit = (idx: number) => equalBase + (idx < equalRemainder ? 1 : 0);

  const exactTotal = participants.reduce((s, p) => s + Math.round((parseFloat(p.amountStr) || 0) * 100), 0);
  const exactRemaining = totalPaise - exactTotal;
  const exactSumsMatch = exactTotal === totalPaise && totalPaise > 0;

  // ── Payer cycling ──────────────────────────────────────────────────────────

  const paidByParticipant = participants.find((p) => {
    if (paidByRef.kind === "user" && p.kind === "user") return p.id === paidByRef.id;
    if (paidByRef.kind === "guest" && p.kind === "guest") return p.localId === paidByRef.localId;
    return false;
  }) ?? participants[0];

  const cyclePayer = () => {
    const idx = participants.findIndex((p) => participantKey(p) === participantKey(paidByParticipant));
    const next = participants[(idx + 1) % participants.length];
    setPaidByRef(next.kind === "user" ? { kind: "user", id: next.id } : { kind: "guest", localId: next.localId });
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const canSubmit =
    description.trim().length > 0 &&
    totalPaise > 0 &&
    participants.length >= 2 &&
    participants.some((p) => participantKey(p) === participantKey(paidByParticipant)) &&
    (splitType === "equal" || exactSumsMatch) &&
    !submitting;

  // ── Submission ─────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const buildPaidBy = () => {
        if (paidByParticipant.kind === "user") return { type: "user" as const, userId: paidByParticipant.id };
        if (paidByParticipant.guestId) return { type: "guest" as const, guestId: paidByParticipant.guestId };
        return { type: "guest_new" as const, name: paidByParticipant.name, phone: paidByParticipant.phone ?? undefined };
      };

      const buildParticipant = (p: Participant, idx: number) => {
        const amountField = splitType === "exact" ? { amount: parseFloat(p.amountStr) || 0 } : {};
        if (p.kind === "user") return { type: "user" as const, userId: p.id, ...amountField };
        if (p.guestId) return { type: "guest" as const, guestId: p.guestId, ...amountField };
        return { type: "guest_new" as const, name: p.name, phone: p.phone ?? undefined, ...amountField };
      };

      const body = {
        description: description.trim(),
        amount: parseFloat(amountStr),
        date: dateStr,
        paidBy: buildPaidBy(),
        splitType,
        ...(groupId ? { groupId } : {}),
        participants: participants.map(buildParticipant),
      };

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, description, amountStr, dateStr, paidByParticipant, splitType, participants, onSaved, onClose]);

  // Saved guest search (client-side filter)
  const addedUserIds = new Set(
    participants.filter((p): p is UserParticipant => p.kind === "user").map((p) => p.id)
  );
  const friendResults = friendQuery.trim().length >= 1
    ? allFriends.filter((f) =>
        !addedUserIds.has(f.id) &&
        ((f.name ?? "").toLowerCase().includes(friendQuery.toLowerCase()) ||
         (f.username ?? "").toLowerCase().includes(friendQuery.toLowerCase()))
      )
    : [];

  // Saved guest search (client-side filter)
  const addedGuestIds = new Set(
    participants.filter((p): p is GuestParticipant => p.kind === "guest" && p.guestId != null).map((p) => p.guestId!)
  );
  const filteredSavedGuests = savedGuests.filter(
    (g) => !addedGuestIds.has(g.id) && (guestQuery.trim() === "" || g.name.toLowerCase().includes(guestQuery.toLowerCase()))
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Sheet panel — full-screen mobile, centered modal desktop */}
      <div className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:top-6 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[512px] md:rounded-2xl md:shadow-[0_8px_40px_rgba(0,0,0,0.16)]">

        {/* iOS-style nav bar header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] shrink-0 md:rounded-t-2xl">
          <button
            onClick={onClose}
            className="text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150 min-w-[56px]"
          >
            Cancel
          </button>
          <span className="text-[17px] font-light tracking-[-0.02em]">
            Add expense
            {groupName && <span className="block text-[12px] font-light text-muted-foreground tracking-normal">{groupName}</span>}
          </span>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150 min-w-[56px] text-right"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-auto" /> : "Save"}
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="overflow-y-auto flex-1 px-4 py-5 space-y-6 pb-10">

          {/* DETAILS */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Details</p>
            <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                <span className="text-[13px] font-light text-muted-foreground w-20 shrink-0">Description</span>
                <Input
                  ref={descriptionRef}
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Dinner at Social"
                  maxLength={200}
                  className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                <span className="text-[13px] font-light text-muted-foreground w-20 shrink-0">Amount</span>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-[15px] font-light text-muted-foreground">₹</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.01"
                    className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5">
                <span className="text-[13px] font-light text-muted-foreground w-20 shrink-0">Date</span>
                <Input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
            </div>
          </div>

          {/* PAID BY */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Paid by</p>
            <button
              onClick={cyclePayer}
              disabled={participants.length < 2}
              className="w-full rounded-2xl border border-black/[0.06] bg-card px-4 py-3.5 flex items-center justify-between hover:bg-black/[0.02] transition-colors duration-150 disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className={cn(
                    "text-[11px] font-medium",
                    paidByParticipant?.kind === "user"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-zinc-200 text-zinc-600"
                  )}>
                    {paidByParticipant ? participantInitials(paidByParticipant, currentUser.id) : "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px] font-light">
                  {paidByParticipant ? participantName(paidByParticipant, currentUser.id) : "Select"}
                </span>
                {paidByParticipant?.kind === "guest" && (
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md">Guest</span>
                )}
              </div>
              <span className="text-[12px] font-light text-muted-foreground">tap to change</span>
            </button>
          </div>

          {/* SPLIT WITH */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1">Split with</p>

            {/* App friend search + Contacts button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="Search friends…"
                  value={friendQuery}
                  onChange={(e) => setFriendQuery(e.target.value)}
                  className="h-10 rounded-xl border-black/[0.1] bg-white pl-4 pr-10 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                />
                {friendsLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {contactPickerSupported && (
                <button
                  onClick={handleContactPicker}
                  title="Pick from contacts"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.1] bg-white text-muted-foreground hover:bg-black/[0.03] hover:text-foreground transition-colors duration-150"
                >
                  <BookUser className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

            {/* App friend search results */}
            {friendResults.length > 0 && (
              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                {friendResults.map((friend, i) => (
                  <div key={friend.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[12px] font-medium">
                        {(friend.name ?? friend.username ?? "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-light truncate">{friend.name ?? friend.username}</p>
                      {friend.username && <p className="text-[12px] text-muted-foreground font-light">@{friend.username}</p>}
                    </div>
                    <Button size="sm" onClick={() => addUserParticipant(friend)} className="h-7 px-3 rounded-lg bg-emerald-500 text-white text-[12px] font-medium hover:bg-emerald-600">Add</Button>
                  </div>
                ))}
              </div>
            )}

            {/* Manual guest add (shown when Contact Picker not supported or as extra option) */}
            {!contactPickerSupported && (
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Add guest by name…"
                  value={manualGuestName}
                  onChange={(e) => setManualGuestName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualGuestName.trim()) {
                      addGuestParticipant(manualGuestName.trim(), null, null);
                      setManualGuestName("");
                    }
                  }}
                  className="h-10 flex-1 rounded-xl border-black/[0.1] bg-white pl-4 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                />
                <button
                  onClick={() => {
                    if (manualGuestName.trim()) {
                      addGuestParticipant(manualGuestName.trim(), null, null);
                      setManualGuestName("");
                    }
                  }}
                  disabled={!manualGuestName.trim()}
                  className="flex h-10 items-center gap-1.5 px-3 rounded-xl bg-zinc-100 text-zinc-700 text-[13px] font-light hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-150 shrink-0"
                >
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add
                </button>
              </div>
            )}

            {/* Saved guest contacts quick-search */}
            {savedGuests.length > 0 && (
              <div className="space-y-1.5">
                <Input
                  type="text"
                  placeholder="Search saved guests…"
                  value={guestQuery}
                  onChange={(e) => setGuestQuery(e.target.value)}
                  className="h-10 rounded-xl border-black/[0.1] bg-white pl-4 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                />
                {filteredSavedGuests.length > 0 && (
                  <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                    {filteredSavedGuests.slice(0, 5).map((g, i) => (
                      <div key={g.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-zinc-200 text-zinc-600 text-[12px] font-medium">
                            {g.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-light truncate">{g.name}</p>
                          {g.phone && <p className="text-[12px] text-muted-foreground font-light">{g.phone}</p>}
                        </div>
                        <Button size="sm" onClick={() => addGuestParticipant(g.name, g.phone, g.id)} className="h-7 px-3 rounded-lg bg-zinc-700 text-white text-[12px] font-medium hover:bg-zinc-800">Add</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Participant list */}
            {participants.length > 0 && (
              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                {participants.map((p, i) => (
                  <div key={participantKey(p)} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className={cn(
                        "text-[12px] font-medium",
                        p.kind === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600"
                      )}>
                        {participantInitials(p, currentUser.id)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[14px] font-light flex-1 truncate">{participantName(p, currentUser.id)}</span>
                    {p.kind === "guest" && (
                      <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md shrink-0">Guest</span>
                    )}
                    {!(p.kind === "user" && p.id === currentUser.id) && (
                      <button
                        onClick={() => removeParticipant(participantKey(p))}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.06] transition-colors duration-150"
                        aria-label="Remove"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* HOW TO SPLIT */}
          {participants.length >= 2 && (
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1">How to split</p>

              <div className="flex rounded-xl border border-black/[0.06] bg-card overflow-hidden">
                <button
                  onClick={() => setSplitType("equal")}
                  className={cn("flex-1 py-2.5 text-[13px] font-light transition-colors duration-150", splitType === "equal" ? "bg-emerald-500 text-white font-medium" : "text-muted-foreground hover:bg-black/[0.02]")}
                >
                  Equally
                </button>
                <button
                  onClick={() => setSplitType("exact")}
                  className={cn("flex-1 py-2.5 text-[13px] font-light transition-colors duration-150", splitType === "exact" ? "bg-emerald-500 text-white font-medium" : "text-muted-foreground hover:bg-black/[0.02]")}
                >
                  Custom amounts
                </button>
              </div>

              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                {participants.map((p, i) => (
                  <div key={participantKey(p)} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                    <span className="text-[14px] font-light flex-1 truncate">{participantName(p, currentUser.id)}</span>
                    {p.kind === "guest" && (
                      <span className="text-[10px] text-zinc-400 shrink-0">Guest</span>
                    )}
                    {splitType === "equal" ? (
                      <span className="text-[14px] font-light text-muted-foreground tabular-nums">₹{formatPaise(equalSplit(i))}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-[14px] font-light text-muted-foreground">₹</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          value={p.amountStr}
                          onChange={(e) => updateExactAmount(participantKey(p), e.target.value)}
                          placeholder="0"
                          min="0"
                          step="0.01"
                          className="h-7 w-24 border-0 bg-transparent p-0 text-right text-[14px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    )}
                  </div>
                ))}

                {splitType === "exact" && totalPaise > 0 && (
                  <div className={cn("flex items-center px-4 py-2.5 border-t", exactRemaining === 0 ? "border-emerald-100 bg-emerald-50" : "border-black/[0.06] bg-amber-50")}>
                    <span className={cn("text-[12px] font-light", exactRemaining === 0 ? "text-emerald-700" : "text-amber-700")}>
                      {exactRemaining === 0
                        ? <span className="flex items-center gap-1"><Check className="h-3 w-3" strokeWidth={2.5} /> Amounts match</span>
                        : exactRemaining > 0
                        ? `₹${formatPaise(exactRemaining)} left to allocate`
                        : `₹${formatPaise(Math.abs(exactRemaining))} over total`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-center text-[13px] font-light text-rose-500">{error}</p>}
        </div>
      </div>
    </>
  );
}
