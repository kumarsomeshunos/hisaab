"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, Check, BookUser, UserPlus, Plus, Minus, Paperclip } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import { useOfflineMutate } from "@/lib/offline/hooks";

// ── Types ─────────────────────────────────────────────────────────────────────

type SplitMode = "equal" | "exact" | "percentage" | "shares" | "one_owes_all" | "adjustment";

type UserParticipant = {
  kind: "user";
  id: string;
  name: string | null;
  username: string | null;
  rawValue: string;
};

type GuestParticipant = {
  kind: "guest";
  localId: string;
  guestId: string | null;
  name: string;
  phone: string | null;
  rawValue: string;
};

type Participant = UserParticipant | GuestParticipant;

type PaidByRef =
  | { kind: "user"; id: string }
  | { kind: "guest"; localId: string };

type AppFriend = { id: string; name: string | null; username: string | null };
type SavedGuest = { id: string; name: string; phone: string | null; email?: string | null };
type CategoryItem = { key: string; name: string; icon: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function participantKey(p: Participant): string {
  return p.kind === "user" ? `user:${p.id}` : `guest:${p.localId}`;
}

function participantName(p: Participant, currentUserId: string): string {
  if (p.kind === "user") return p.id === currentUserId ? "You" : (p.name ?? p.username ?? "?");
  return p.name;
}

function participantInitials(p: Participant, currentUserId: string): string {
  return participantName(p, currentUserId).trim().charAt(0).toUpperCase();
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

const SPLIT_MODES: { mode: SplitMode; label: string }[] = [
  { mode: "equal", label: "Equally" },
  { mode: "exact", label: "Exact" },
  { mode: "percentage", label: "By %" },
  { mode: "shares", label: "By Shares" },
  { mode: "adjustment", label: "Adjust" },
  { mode: "one_owes_all", label: "One Owes All" },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface EditInitial {
  id: string;
  title: string;
  notes: string;
  amountRupees: number;
  date: string;
  category: string | null;
  splitMode: string;
  paidBy: { type: "user" | "guest"; id: string; name: string | null; username?: string | null };
  splits: { type: "user" | "guest"; id: string; name: string | null; username?: string | null; rawValue: string | null }[];
}

interface AddExpenseSheetProps {
  currentUser: { id: string; name: string | null; username: string | null };
  onClose: () => void;
  onSaved: () => void;
  groupId?: string;
  groupName?: string;
  groupMembers?: { type: "user" | "guest"; id: string; name: string | null; username?: string | null; phone?: string | null }[];
  editInitial?: EditInitial;
}

export function AddExpenseSheet({ currentUser, onClose, onSaved, groupId, groupName, groupMembers: initialGroupMembers, editInitial }: AddExpenseSheetProps) {
  // Form fields
  const [title, setTitle] = useState(editInitial?.title ?? "");
  const [notes, setNotes] = useState(editInitial?.notes ?? "");
  const [notesExpanded, setNotesExpanded] = useState(!!editInitial?.notes);
  const [amountStr, setAmountStr] = useState(editInitial ? String(editInitial.amountRupees) : "");
  const [dateStr, setDateStr] = useState(editInitial?.date ?? todayStr());
  const [splitMode, setSplitMode] = useState<SplitMode>((editInitial?.splitMode as SplitMode) ?? "equal");
  const [category, setCategory] = useState<string | null>(editInitial?.category ?? null);

  // Participants — seeded from editInitial in edit mode, else current user (+ group members)
  const [participants, setParticipants] = useState<Participant[]>(() => {
    if (editInitial) {
      return editInitial.splits.map((s) =>
        s.type === "user"
          ? ({ kind: "user", id: s.id, name: s.name, username: s.username ?? null, rawValue: s.rawValue ?? "" } as UserParticipant)
          : ({ kind: "guest", localId: s.id, guestId: s.id, name: s.name ?? "", phone: null, rawValue: s.rawValue ?? "" } as GuestParticipant)
      );
    }
    const self: UserParticipant = { kind: "user", id: currentUser.id, name: currentUser.name, username: currentUser.username, rawValue: "" };
    if (!initialGroupMembers) return [self];
    const extras: Participant[] = initialGroupMembers
      .filter((m) => !(m.type === "user" && m.id === currentUser.id))
      .map((m) =>
        m.type === "user"
          ? { kind: "user", id: m.id, name: m.name, username: m.username ?? null, rawValue: "" } as UserParticipant
          : { kind: "guest", localId: crypto.randomUUID(), guestId: m.id, name: m.name ?? "", phone: m.phone ?? null, rawValue: "" } as GuestParticipant
      );
    return [self, ...extras];
  });
  const [paidByRef, setPaidByRef] = useState<PaidByRef>(() => {
    if (editInitial) {
      return editInitial.paidBy.type === "user"
        ? { kind: "user", id: editInitial.paidBy.id }
        : { kind: "guest", localId: editInitial.paidBy.id };
    }
    return { kind: "user", id: currentUser.id };
  });

  // Search
  const [friendQuery, setFriendQuery] = useState("");
  const [allFriends, setAllFriends] = useState<AppFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);
  const [userSearchResults, setUserSearchResults] = useState<AppFriend[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const [savedGuests, setSavedGuests] = useState<SavedGuest[]>([]);
  const [guestQuery, setGuestQuery] = useState("");
  const [manualGuestName, setManualGuestName] = useState("");

  // Categories
  const [customCategories, setCustomCategories] = useState<CategoryItem[]>([]);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [uploadPhase, setUploadPhase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate } = useOfflineMutate();

  // Media attachments
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_ATTACH_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
  const MAX_ATTACH = 5;

  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setTimeout(() => titleRef.current?.focus(), 150); }, []);

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
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCustomCategories(d.custom ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (friendQuery.trim().length < 2) { setUserSearchResults([]); return; }
    const t = setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(friendQuery.trim())}`);
        const data = await res.json();
        setUserSearchResults(data.users ?? []);
      } catch { /* ignore */ } finally {
        setUserSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [friendQuery]);

  const allCategories: CategoryItem[] = [
    ...DEFAULT_CATEGORIES.map((c) => ({ key: c.key, name: c.name, icon: c.icon as string })),
    ...customCategories,
  ];

  // ── Participant helpers ────────────────────────────────────────────────────

  const handleModeChange = useCallback((mode: SplitMode) => {
    setSplitMode(mode);
    setParticipants((prev) => prev.map((p) => ({ ...p, rawValue: "" })));
  }, []);

  const addUserParticipant = useCallback((friend: AppFriend) => {
    setParticipants((prev) => [...prev, { kind: "user", id: friend.id, name: friend.name, username: friend.username, rawValue: "" }]);
    setFriendQuery("");
  }, []);

  const addGuestParticipant = useCallback((name: string, phone: string | null, guestId: string | null = null) => {
    setParticipants((prev) => [...prev, { kind: "guest", localId: crypto.randomUUID(), guestId, name, phone, rawValue: "" }]);
  }, []);

  const removeParticipant = useCallback((key: string) => {
    setParticipants((prev) => prev.filter((p) => participantKey(p) !== key));
    setPaidByRef((ref) => {
      const refKey = ref.kind === "user" ? `user:${ref.id}` : `guest:${ref.localId}`;
      return refKey === key ? { kind: "user", id: currentUser.id } : ref;
    });
  }, [currentUser.id]);

  const updateRawValue = useCallback((key: string, val: string) => {
    setParticipants((prev) => prev.map((p) => participantKey(p) === key ? { ...p, rawValue: val } : p));
  }, []);

  const nudgeExact = useCallback((key: string, delta: number) => {
    setParticipants((prev) => prev.map((p) => {
      if (participantKey(p) !== key) return p;
      const next = Math.max(0, (parseFloat(p.rawValue) || 0) + delta);
      return { ...p, rawValue: next.toFixed(2) };
    }));
  }, []);

  const setDebtor = useCallback((key: string) => {
    setParticipants((prev) => prev.map((p) => ({ ...p, rawValue: participantKey(p) === key ? "all" : "0" })));
  }, []);

  // ── Contact Picker ─────────────────────────────────────────────────────────

  const handleContactPicker = useCallback(async () => {
    try {
      // @ts-expect-error — Contact Picker API not in TS lib
      const contacts = await navigator.contacts.select(["name", "tel"], { multiple: true });
      for (const contact of contacts) {
        const name: string = contact.name?.[0] ?? "Unknown";
        const phone: string | null = contact.tel?.[0] ?? null;
        if (name) addGuestParticipant(name, phone, null);
      }
    } catch { /* User cancelled */ }
  }, [addGuestParticipant]);

  // ── Split display ──────────────────────────────────────────────────────────

  const totalPaise = Math.round((parseFloat(amountStr) || 0) * 100);
  const n = participants.length;

  const equalBase = n > 0 ? Math.floor(totalPaise / n) : 0;
  const equalRemainder = n > 0 ? totalPaise - equalBase * n : 0;
  const equalSplit = (idx: number) => equalBase + (idx < equalRemainder ? 1 : 0);

  const exactTotal = participants.reduce((s, p) => s + Math.round((parseFloat(p.rawValue) || 0) * 100), 0);
  const exactRemaining = totalPaise - exactTotal;
  const exactSumsMatch = exactTotal === totalPaise && totalPaise > 0;

  const pctTotal = participants.reduce((s, p) => s + (parseFloat(p.rawValue) || 0), 0);
  const pctValid = totalPaise > 0 && Math.abs(pctTotal - 100) <= 0.01;
  const computedPctAmount = (idx: number) => Math.round((totalPaise * (parseFloat(participants[idx].rawValue) || 0)) / 100);

  const shareTotal = participants.reduce((s, p) => s + (parseFloat(p.rawValue) || 0), 0);
  const sharesValid = totalPaise > 0 && shareTotal > 0 && participants.every((p) => (parseFloat(p.rawValue) || 0) > 0);
  const computedShareAmount = (idx: number) => shareTotal > 0 ? Math.round((totalPaise * (parseFloat(participants[idx].rawValue) || 0)) / shareTotal) : 0;

  const debtorParticipant = participants.find((p) => p.rawValue === "all");
  const debtorKey = debtorParticipant ? participantKey(debtorParticipant) : null;
  const oneOwesAllValid = totalPaise > 0 && debtorKey != null;

  // ── Payer ──────────────────────────────────────────────────────────────────

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

  const splitValid = (() => {
    if (n < 2 || totalPaise <= 0) return false;
    if (splitMode === "equal") return true;
    if (splitMode === "exact" || splitMode === "adjustment") return exactSumsMatch;
    if (splitMode === "percentage") return pctValid;
    if (splitMode === "shares") return sharesValid;
    if (splitMode === "one_owes_all") return oneOwesAllValid;
    return false;
  })();

  const canSubmit = title.trim().length > 0 && splitValid && !submitting;

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

      const buildParticipant = (p: Participant) => {
        if (p.kind === "user") return { type: "user" as const, userId: p.id };
        if (p.guestId) return { type: "guest" as const, guestId: p.guestId };
        return { type: "guest_new" as const, name: p.name, phone: p.phone ?? undefined };
      };

      const rawValues: Record<string, string> | undefined = splitMode === "equal"
        ? undefined
        : (() => {
            const rv: Record<string, string> = {};
            let guestNewIdx = 0;
            for (const p of participants) {
              // API expects: user:${userId}, guest:${realGuestId}, guest_new:${index}
              // The internal participantKey uses localId for guests — must translate here.
              let apiKey: string;
              if (p.kind === "user") {
                apiKey = `user:${p.id}`;
              } else if (p.guestId) {
                apiKey = `guest:${p.guestId}`;
              } else {
                apiKey = `guest_new:${guestNewIdx++}`;
              }
              rv[apiKey] = p.rawValue;
            }
            return rv;
          })();

      const body = {
        title: title.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        amount: parseFloat(amountStr),
        date: dateStr,
        paidBy: buildPaidBy(),
        splitMode,
        ...(category ? { category } : {}),
        ...(groupId ? { groupId } : {}),
        participants: participants.map(buildParticipant),
        ...(rawValues ? { rawValues } : {}),
      };

      const result = await mutate({
        url: editInitial ? `/api/expenses/${editInitial.id}` : "/api/expenses",
        method: editInitial ? "PATCH" : "POST",
        body,
        label: editInitial ? "Edit expense" : "Add expense",
      });

      if (result.queued) {
        onClose();
        return;
      }

      const data = await result.response.json();
      if (!result.response.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      // Upload any pending media files
      if (pendingFiles.length > 0) {
        setSubmitting(false);
        setUploadPhase(true);
        const expenseId = editInitial?.id ?? data.expense?.id;
        let uploadFailed = false;
        if (expenseId) {
          for (const file of pendingFiles) {
            try {
              const presignRes = await fetch(`/api/expenses/${expenseId}/media/presign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
              });
              if (!presignRes.ok) { uploadFailed = true; continue; }
              const { uploadUrl, key } = await presignRes.json();
              const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
              if (!putRes.ok) { uploadFailed = true; continue; }
              await fetch(`/api/expenses/${expenseId}/media`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key, mimeType: file.type, sizeBytes: file.size }),
              });
            } catch { uploadFailed = true; }
          }
        }
        setUploadPhase(false);
        if (uploadFailed) setError("Expense saved — some media failed to upload.");
      }

      onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, title, notes, amountStr, dateStr, paidByParticipant, splitMode, category, participants, groupId, editInitial, pendingFiles, onSaved, onClose, mutate]);

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const addedUserIds = new Set(participants.filter((p): p is UserParticipant => p.kind === "user").map((p) => p.id));
  const friendResults = friendQuery.trim().length >= 1
    ? allFriends.filter((f) =>
        !addedUserIds.has(f.id) &&
        ((f.name ?? "").toLowerCase().includes(friendQuery.toLowerCase()) ||
         (f.username ?? "").toLowerCase().includes(friendQuery.toLowerCase()))
      )
    : [];
  const friendIds = new Set(allFriends.map((f) => f.id));
  const nonFriendResults = userSearchResults.filter((u) => !addedUserIds.has(u.id) && !friendIds.has(u.id));

  const addedGuestIds = new Set(participants.filter((p): p is GuestParticipant => p.kind === "guest" && p.guestId != null).map((p) => p.guestId!));
  const top3Guests = savedGuests.filter((g) => !addedGuestIds.has(g.id)).slice(0, 3);
  const searchedGuests = guestQuery.trim()
    ? savedGuests.filter((g) => !addedGuestIds.has(g.id) && (g.name.toLowerCase().includes(guestQuery.toLowerCase()) || (g.email?.toLowerCase().includes(guestQuery.toLowerCase()) ?? false))).slice(0, 5)
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:top-6 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[512px] md:rounded-2xl md:shadow-[0_8px_40px_rgba(0,0,0,0.16)]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] shrink-0 md:rounded-t-2xl">
          <button onClick={onClose} className="text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150 min-w-[56px]">
            Cancel
          </button>
          <div className="text-center">
            <span className="text-[17px] font-light tracking-[-0.02em]">{editInitial ? "Edit expense" : "Add expense"}</span>
            {groupName && <p className="text-[12px] font-light text-muted-foreground">{groupName}</p>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || uploadPhase}
            className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150 min-w-[56px] text-right"
          >
            {uploadPhase ? <Loader2 className="h-4 w-4 animate-spin ml-auto" /> : submitting ? <Loader2 className="h-4 w-4 animate-spin ml-auto" /> : "Save"}
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-4 py-5 space-y-6 pb-10">

          {/* DETAILS */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Details</p>
            <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                <span className="text-[13px] font-light text-muted-foreground w-16 shrink-0">Title</span>
                <Input
                  ref={titleRef}
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Dinner at Social"
                  maxLength={200}
                  className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {!notesExpanded ? (
                <button
                  onClick={() => setNotesExpanded(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06] text-left hover:bg-black/[0.02] transition-colors duration-150"
                >
                  <span className="text-[13px] font-light text-muted-foreground/60 w-16 shrink-0">Notes</span>
                  <span className="text-[13px] font-light text-muted-foreground/40">+ Add notes</span>
                </button>
              ) : (
                <div className="border-b border-black/[0.06] px-4 py-3">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes…"
                    maxLength={1000}
                    rows={3}
                    autoFocus
                    className="w-full resize-none bg-transparent text-[14px] font-light text-foreground placeholder:text-muted-foreground/40 focus:outline-none leading-relaxed"
                  />
                </div>
              )}

              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                <span className="text-[13px] font-light text-muted-foreground w-16 shrink-0">Amount</span>
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
                <span className="text-[13px] font-light text-muted-foreground w-16 shrink-0">Date</span>
                <Input
                  type="date"
                  value={dateStr}
                  onChange={(e) => setDateStr(e.target.value)}
                  className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>

              {/* Attachments row */}
              <div className="border-t border-black/[0.06] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-light text-muted-foreground w-16 shrink-0">Attach</span>
                  <div className="flex flex-1 flex-wrap gap-1.5 items-center">
                    {pendingFiles.map((f, i) => (
                      <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[12px] font-light text-muted-foreground max-w-[120px]">
                        <span className="truncate">{f.name}</span>
                        <button onClick={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))} className="shrink-0 hover:text-foreground">
                          <X className="h-3 w-3" strokeWidth={2} />
                        </button>
                      </span>
                    ))}
                    {pendingFiles.length < MAX_ATTACH && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1 text-[13px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150"
                      >
                        <Paperclip className="h-3.5 w-3.5" strokeWidth={1.5} />
                        {pendingFiles.length === 0 ? "Add files" : "More"}
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files ?? []).filter((f) => ALLOWED_ATTACH_TYPES.has(f.type));
                    setPendingFiles((prev) => [...prev, ...selected].slice(0, MAX_ATTACH));
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          </div>

          {/* CATEGORY */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Category</p>
            <div className="flex flex-wrap gap-2">
              {allCategories.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key === category ? null : cat.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-[10px] text-[13px] font-light whitespace-nowrap transition-colors duration-150 border",
                    cat.key === category
                      ? "bg-emerald-500 text-white border-emerald-500 font-medium"
                      : "bg-card border-black/[0.06] text-foreground hover:bg-black/[0.03]"
                  )}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.name}</span>
                </button>
              ))}
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
                  <AvatarFallback className={cn("text-[11px] font-medium", paidByParticipant?.kind === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                    {paidByParticipant ? participantInitials(paidByParticipant, currentUser.id) : "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[15px] font-light">{paidByParticipant ? participantName(paidByParticipant, currentUser.id) : "Select"}</span>
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

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="Search friends…"
                  value={friendQuery}
                  onChange={(e) => setFriendQuery(e.target.value)}
                  className="h-10 rounded-xl border-black/[0.1] bg-white pl-4 pr-10 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                />
                {friendsLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {contactPickerSupported && (
                <button onClick={handleContactPicker} title="Pick from contacts" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.1] bg-white text-muted-foreground hover:bg-black/[0.03] hover:text-foreground transition-colors duration-150">
                  <BookUser className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}
            </div>

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

            {userSearchLoading && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}

            {nonFriendResults.length > 0 && (
              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                <p className="px-4 py-2 text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground border-b border-black/[0.06]">Not yet friends</p>
                {nonFriendResults.map((u, i) => (
                  <div key={u.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-zinc-200 text-zinc-600 text-[12px] font-medium">
                        {(u.name ?? u.username ?? "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-light truncate">{u.name ?? u.username}</p>
                      {u.username && <p className="text-[12px] text-muted-foreground font-light">@{u.username}</p>}
                    </div>
                    <Button size="sm" onClick={() => addUserParticipant(u)} className="h-7 px-3 rounded-lg bg-zinc-700 text-white text-[12px] font-medium hover:bg-zinc-800">Add</Button>
                  </div>
                ))}
              </div>
            )}

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
                  onClick={() => { if (manualGuestName.trim()) { addGuestParticipant(manualGuestName.trim(), null, null); setManualGuestName(""); } }}
                  disabled={!manualGuestName.trim()}
                  className="flex h-10 items-center gap-1.5 px-3 rounded-xl bg-zinc-100 text-zinc-700 text-[13px] font-light hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-150 shrink-0"
                >
                  <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add
                </button>
              </div>
            )}

            {savedGuests.length > 0 && (
              <div className="space-y-1.5">
                <Input
                  type="text"
                  placeholder="Search saved guests…"
                  value={guestQuery}
                  onChange={(e) => setGuestQuery(e.target.value)}
                  className="h-10 rounded-xl border-black/[0.1] bg-white pl-4 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                />
                {(guestQuery.trim() ? searchedGuests : top3Guests).length > 0 && (
                  <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                    {(guestQuery.trim() ? searchedGuests : top3Guests).map((g, i) => (
                      <div key={g.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarFallback className="bg-zinc-200 text-zinc-600 text-[12px] font-medium">{g.name.charAt(0).toUpperCase()}</AvatarFallback>
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

            {participants.length > 0 && (
              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                {participants.map((p, i) => (
                  <div key={participantKey(p)} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className={cn("text-[12px] font-medium", p.kind === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                        {participantInitials(p, currentUser.id)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[14px] font-light flex-1 truncate">{participantName(p, currentUser.id)}</span>
                    {p.kind === "guest" && <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md shrink-0">Guest</span>}
                    {!(p.kind === "user" && p.id === currentUser.id) && (
                      <button onClick={() => removeParticipant(participantKey(p))} className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.06] transition-colors duration-150" aria-label="Remove">
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

              <div className="grid grid-cols-3 gap-1.5">
                {SPLIT_MODES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    onClick={() => handleModeChange(mode)}
                    className={cn(
                      "py-2.5 rounded-[10px] text-[12px] font-light transition-colors duration-150 border",
                      splitMode === mode
                        ? "bg-emerald-500 text-white border-emerald-500 font-medium"
                        : "bg-card border-black/[0.06] text-muted-foreground hover:bg-black/[0.02]"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                {participants.map((p, i) => {
                  const key = participantKey(p);
                  const isDebtor = key === debtorKey;

                  return (
                    <div key={key} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                      <span className="text-[14px] font-light flex-1 truncate">{participantName(p, currentUser.id)}</span>
                      {p.kind === "guest" && <span className="text-[10px] text-zinc-400 shrink-0">Guest</span>}

                      {splitMode === "equal" && (
                        <span className="text-[14px] font-light text-muted-foreground tabular-nums">₹{formatPaise(equalSplit(i))}</span>
                      )}

                      {splitMode === "exact" && (
                        <div className="flex items-center gap-1">
                          <span className="text-[14px] font-light text-muted-foreground">₹</span>
                          <Input type="number" inputMode="decimal" value={p.rawValue} onChange={(e) => updateRawValue(key, e.target.value)} placeholder="0" min="0" step="0.01" className="h-7 w-24 border-0 bg-transparent p-0 text-right text-[14px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                        </div>
                      )}

                      {splitMode === "adjustment" && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => nudgeExact(key, -1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors duration-150 shrink-0">
                            <Minus className="h-3 w-3" strokeWidth={2} />
                          </button>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[14px] font-light text-muted-foreground">₹</span>
                            <Input type="number" inputMode="decimal" value={p.rawValue} onChange={(e) => updateRawValue(key, e.target.value)} placeholder="0" min="0" step="0.01" className="h-7 w-20 border-0 bg-transparent p-0 text-right text-[14px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          </div>
                          <button onClick={() => nudgeExact(key, 1)} className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors duration-150 shrink-0">
                            <Plus className="h-3 w-3" strokeWidth={2} />
                          </button>
                        </div>
                      )}

                      {splitMode === "percentage" && (
                        <div className="flex items-center gap-1">
                          <Input type="number" inputMode="decimal" value={p.rawValue} onChange={(e) => updateRawValue(key, e.target.value)} placeholder="0" min="0" max="100" step="0.01" className="h-7 w-16 border-0 bg-transparent p-0 text-right text-[14px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <span className="text-[14px] font-light text-muted-foreground">%</span>
                          {totalPaise > 0 && p.rawValue && (
                            <span className="text-[12px] font-light text-muted-foreground/60 tabular-nums ml-1">₹{formatPaise(computedPctAmount(i))}</span>
                          )}
                        </div>
                      )}

                      {splitMode === "shares" && (
                        <div className="flex items-center gap-1.5">
                          <Input type="number" inputMode="decimal" value={p.rawValue} onChange={(e) => updateRawValue(key, e.target.value)} placeholder="1" min="0" step="0.5" className="h-7 w-16 border-0 bg-transparent p-0 text-right text-[14px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <span className="text-[12px] font-light text-muted-foreground/60">shares</span>
                          {totalPaise > 0 && shareTotal > 0 && p.rawValue && (
                            <span className="text-[12px] font-light text-muted-foreground/60 tabular-nums">₹{formatPaise(computedShareAmount(i))}</span>
                          )}
                        </div>
                      )}

                      {splitMode === "one_owes_all" && (
                        <button
                          onClick={() => setDebtor(key)}
                          className={cn(
                            "text-[12px] font-medium px-2.5 py-1 rounded-lg transition-colors duration-150",
                            isDebtor ? "bg-rose-500 text-white" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                          )}
                        >
                          {isDebtor ? `Owes ₹${formatPaise(totalPaise)}` : "₹0"}
                        </button>
                      )}
                    </div>
                  );
                })}

                {(splitMode === "exact" || splitMode === "adjustment") && totalPaise > 0 && (
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
                {splitMode === "percentage" && totalPaise > 0 && (
                  <div className={cn("flex items-center px-4 py-2.5 border-t", pctValid ? "border-emerald-100 bg-emerald-50" : "border-black/[0.06] bg-amber-50")}>
                    <span className={cn("text-[12px] font-light", pctValid ? "text-emerald-700" : "text-amber-700")}>
                      {pctValid
                        ? <span className="flex items-center gap-1"><Check className="h-3 w-3" strokeWidth={2.5} /> 100%</span>
                        : `${pctTotal.toFixed(1)}% of 100% — adjust to match`}
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
