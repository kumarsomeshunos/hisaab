"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Loader2, ChevronRight, X, ArrowLeft, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineMutate } from "@/lib/offline/hooks";

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Group = { id: string; name: string; memberCount: number; myBalance: number };
type AppFriend = { id: string; name: string | null; username: string | null };
type SavedGuest = { id: string; name: string; phone: string | null };

type PendingMember =
  | { type: "user"; id: string; name: string | null; username: string | null }
  | { type: "guest"; localId: string; guestId: string | null; name: string; phone: string | null };

function memberKey(m: PendingMember): string {
  return m.type === "user" ? `user:${m.id}` : `guest:${m.localId}`;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupEmoji, setNewGroupEmoji] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { mutate } = useOfflineMutate();

  // Step 2 search state
  const [allFriends, setAllFriends] = useState<AppFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [savedGuests, setSavedGuests] = useState<SavedGuest[]>([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [guestQuery, setGuestQuery] = useState("");
  const [manualGuestName, setManualGuestName] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<AppFriend[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const userSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch { /* leave state unchanged */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const openSheet = useCallback(() => {
    setStep(1);
    setNewGroupName("");
    setNewGroupEmoji("");
    setNewGroupDescription("");
    setPendingMembers([]);
    setFriendQuery("");
    setGuestQuery("");
    setManualGuestName("");
    setError(null);
    setSheetOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
  }, []);

  const goToStep2 = useCallback(() => {
    if (!newGroupName.trim()) return;
    setStep(2);
    setFriendsLoading(true);
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => setAllFriends(d.friends ?? []))
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
    fetch("/api/guest-contacts")
      .then((r) => r.json())
      .then((d) => setSavedGuests(d.guests ?? []))
      .catch(() => {});
  }, [newGroupName]);

  // Debounced non-friend user search
  useEffect(() => {
    if (step !== 2) return;
    if (userSearchTimer.current) clearTimeout(userSearchTimer.current);
    const q = friendQuery.trim();
    if (q.length < 2) { setUserSearchResults([]); return; }
    userSearchTimer.current = setTimeout(async () => {
      setUserSearchLoading(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setUserSearchResults(data.users ?? []);
      } catch { /* leave unchanged */ } finally {
        setUserSearchLoading(false);
      }
    }, 300);
  }, [friendQuery, step]);

  const addFriend = useCallback((f: AppFriend) => {
    setPendingMembers((prev) => {
      if (prev.some((m) => m.type === "user" && m.id === f.id)) return prev;
      return [...prev, { type: "user", id: f.id, name: f.name, username: f.username }];
    });
    setFriendQuery("");
    setUserSearchResults([]);
  }, []);

  const addGuest = useCallback((name: string, phone: string | null, guestId: string | null = null) => {
    setPendingMembers((prev) => [...prev, { type: "guest", localId: crypto.randomUUID(), guestId, name, phone }]);
  }, []);

  const removeMember = useCallback((key: string) => {
    setPendingMembers((prev) => prev.filter((m) => memberKey(m) !== key));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newGroupName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const memberUserIds = pendingMembers.filter((m): m is Extract<PendingMember, { type: "user" }> => m.type === "user").map((m) => m.id);
      const memberGuests = pendingMembers
        .filter((m): m is Extract<PendingMember, { type: "guest" }> => m.type === "guest")
        .map((m) => ({ ...(m.guestId ? { guestId: m.guestId } : {}), name: m.name, ...(m.phone ? { phone: m.phone } : {}) }));

      const body: Record<string, unknown> = { name: newGroupName.trim() };
      if (newGroupEmoji.trim()) body.emoji = newGroupEmoji.trim();
      if (newGroupDescription.trim()) body.description = newGroupDescription.trim();
      if (memberUserIds.length > 0) body.memberUserIds = memberUserIds;
      if (memberGuests.length > 0) body.memberGuests = memberGuests;

      const result = await mutate({ url: "/api/groups", method: "POST", body, label: "Create group" });
      setSheetOpen(false);
      if (result.queued) return;
      const data = await result.response.json();
      if (!result.response.ok) { setError(data.error ?? "Something went wrong."); return; }
      fetchGroups();
    } finally {
      setCreating(false);
    }
  }, [newGroupName, newGroupEmoji, newGroupDescription, creating, pendingMembers, fetchGroups, mutate]);

  const addedUserIds = new Set(pendingMembers.filter((m) => m.type === "user").map((m) => (m as Extract<PendingMember, { type: "user" }>).id));
  const addedGuestIds = new Set(
    pendingMembers
      .filter((m): m is Extract<PendingMember, { type: "guest" }> => m.type === "guest" && m.guestId != null)
      .map((m) => m.guestId!)
  );

  const friendResults = friendQuery.trim().length >= 1
    ? allFriends.filter((f) =>
        !addedUserIds.has(f.id) &&
        ((f.name ?? "").toLowerCase().includes(friendQuery.toLowerCase()) ||
         (f.username ?? "").toLowerCase().includes(friendQuery.toLowerCase()))
      )
    : [];

  const friendIdSet = new Set(allFriends.map((f) => f.id));
  const nonFriendResults = userSearchResults.filter((u) => !addedUserIds.has(u.id) && !friendIdSet.has(u.id));

  const filteredSavedGuests = savedGuests.filter(
    (g) => !addedGuestIds.has(g.id) && (guestQuery.trim() === "" || g.name.toLowerCase().includes(guestQuery.toLowerCase()))
  );

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center justify-between px-5 md:px-6">
          <h1 className="text-[17px] font-light tracking-[-0.02em] md:hidden">Groups</h1>
          <h1 className="hidden md:block text-[15px] font-medium tracking-[-0.01em]">Groups</h1>
          <button onClick={openSheet} className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors duration-150">
            New
          </button>
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto w-full space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                <Users className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-[15px] font-light mb-1">No groups yet</p>
              <p className="text-[13px] font-light text-muted-foreground max-w-[220px] leading-relaxed mb-5">
                Create a group to split expenses with friends or flatmates.
              </p>
              <button onClick={openSheet} className="px-5 py-2 rounded-xl bg-emerald-500 text-white text-[14px] font-medium hover:bg-emerald-600 transition-colors duration-150">
                Create group
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {groups.map((g, i) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                className={cn("flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors duration-150", i > 0 && "border-t border-black/[0.06]")}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[14px] font-medium">
                    {g.name.trim().charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-light truncate">{g.name}</p>
                  <p className="text-[12px] font-light text-muted-foreground">{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</p>
                </div>
                <div className="text-right shrink-0 mr-1">
                  {g.myBalance !== 0 && (
                    <p className={cn("text-[13px] font-light tabular-nums", g.myBalance > 0 ? "text-emerald-600" : "text-rose-500")}>
                      {g.myBalance > 0 ? "+" : "-"}₹{formatPaise(Math.abs(g.myBalance))}
                    </p>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" strokeWidth={1.5} />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* New group sheet */}
      {sheetOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={closeSheet} />
          <div className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:top-6 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[440px] md:rounded-2xl md:shadow-[0_8px_40px_rgba(0,0,0,0.16)]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] shrink-0 md:rounded-t-2xl">
              {step === 1 ? (
                <button onClick={closeSheet} className="text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150 min-w-[56px]">
                  Cancel
                </button>
              ) : (
                <button onClick={() => setStep(1)} className="flex items-center gap-1 text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150 min-w-[56px]">
                  <ArrowLeft className="h-4 w-4" strokeWidth={1.5} /> Back
                </button>
              )}
              <span className="text-[17px] font-light tracking-[-0.02em]">
                {step === 1 ? "New group" : "Add members"}
              </span>
              {step === 1 ? (
                <button
                  onClick={goToStep2}
                  disabled={!newGroupName.trim()}
                  className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150 min-w-[56px] text-right"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150 min-w-[56px] text-right"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin ml-auto" /> : "Create"}
                </button>
              )}
            </div>

            {/* Step 1: Name */}
            {step === 1 && (
              <div className="px-4 py-5 space-y-3">
                <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                    <label className="text-[13px] font-light text-muted-foreground w-20 shrink-0">Name</label>
                    <Input
                      autoFocus
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && newGroupName.trim() && goToStep2()}
                      placeholder="Goa Trip"
                      maxLength={80}
                      className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                    <label className="text-[13px] font-light text-muted-foreground w-20 shrink-0">Emoji</label>
                    <Input
                      type="text"
                      value={newGroupEmoji}
                      onChange={(e) => setNewGroupEmoji(e.target.value)}
                      maxLength={10}
                      placeholder="🏖️"
                      className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <label className="text-[13px] font-light text-muted-foreground w-20 shrink-0 pt-0.5">About</label>
                    <textarea
                      value={newGroupDescription}
                      onChange={(e) => setNewGroupDescription(e.target.value)}
                      maxLength={300}
                      rows={3}
                      placeholder="What's this group for?"
                      className="flex-1 bg-transparent text-[15px] font-light resize-none border-0 p-0 outline-none placeholder:text-muted-foreground/40 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-center text-[13px] font-light text-muted-foreground">You can add members in the next step</p>
              </div>
            )}

            {/* Step 2: Members */}
            {step === 2 && (
              <div className="overflow-y-auto flex-1 px-4 py-5 space-y-4 pb-8">
                {/* User search (friends + anyone) */}
                <div className="relative">
                  <Input
                    autoFocus
                    type="text"
                    placeholder="Search users…"
                    value={friendQuery}
                    onChange={(e) => setFriendQuery(e.target.value)}
                    className="h-10 rounded-xl border-black/[0.1] bg-white pl-4 pr-10 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                  />
                  {(friendsLoading || userSearchLoading) && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                {friendResults.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1">Friends</p>
                    <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                      {friendResults.map((f, i) => (
                        <div key={f.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[12px] font-medium">
                              {(f.name ?? f.username ?? "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-light truncate">{f.name ?? f.username}</p>
                            {f.username && <p className="text-[12px] text-muted-foreground font-light">@{f.username}</p>}
                          </div>
                          <Button size="sm" onClick={() => addFriend(f)} className="h-7 px-3 rounded-lg bg-emerald-500 text-white text-[12px] font-medium hover:bg-emerald-600">Add</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {nonFriendResults.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1">Other users</p>
                    <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
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
                          <Button size="sm" onClick={() => addFriend(u)} className="h-7 px-3 rounded-lg bg-zinc-100 text-zinc-700 text-[12px] font-medium hover:bg-zinc-200 border-0">Add</Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual guest */}
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Add guest by name…"
                    value={manualGuestName}
                    onChange={(e) => setManualGuestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualGuestName.trim()) {
                        addGuest(manualGuestName.trim(), null, null);
                        setManualGuestName("");
                      }
                    }}
                    className="h-10 flex-1 rounded-xl border-black/[0.1] bg-white pl-4 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                  />
                  <button
                    onClick={() => { if (manualGuestName.trim()) { addGuest(manualGuestName.trim(), null, null); setManualGuestName(""); } }}
                    disabled={!manualGuestName.trim()}
                    className="flex h-10 items-center gap-1.5 px-3 rounded-xl bg-zinc-100 text-zinc-700 text-[13px] font-light hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-150 shrink-0"
                  >
                    <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add
                  </button>
                </div>

                {/* Saved guests */}
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
                              <AvatarFallback className="bg-zinc-200 text-zinc-600 text-[12px] font-medium">{g.name.charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-light truncate">{g.name}</p>
                              {g.phone && <p className="text-[12px] text-muted-foreground font-light">{g.phone}</p>}
                            </div>
                            <Button size="sm" onClick={() => addGuest(g.name, g.phone, g.id)} className="h-7 px-3 rounded-lg bg-zinc-700 text-white text-[12px] font-medium hover:bg-zinc-800">Add</Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Selected members */}
                {pendingMembers.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1">Members to add</p>
                    <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                      {pendingMembers.map((m, i) => (
                        <div key={memberKey(m)} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                          <Avatar className="h-8 w-8 shrink-0">
                            <AvatarFallback className={cn("text-[12px] font-medium", m.type === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                              {(m.name ?? (m.type === "user" ? m.username : null) ?? "?").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-[14px] font-light flex-1 truncate">
                            {m.name ?? (m.type === "user" ? m.username : null) ?? "?"}
                          </span>
                          {m.type === "guest" && <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md shrink-0">Guest</span>}
                          <button onClick={() => removeMember(memberKey(m))} className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.06] transition-colors duration-150" aria-label="Remove">
                            <X className="h-3.5 w-3.5" strokeWidth={2} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingMembers.length === 0 && (
                  <p className="text-center text-[13px] font-light text-muted-foreground">
                    Search above or skip — you can add members later from the group page.
                  </p>
                )}

                {error && <p className="text-center text-[13px] font-light text-rose-500">{error}</p>}
              </div>
            )}
          </div>
        </>
      )}
    </AppShell>
  );
}
