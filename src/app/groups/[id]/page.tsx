"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AddExpenseSheet } from "@/components/expenses/AddExpenseSheet";
import {
  ArrowLeft, Receipt, Users, UserPlus, UserMinus, Loader2, Trash2, BookUser, X, Plus, ExternalLink, Handshake
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ActivityEvent, describeEvent, eventHref, relativeTime } from "@/lib/activity-utils";

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Member = {
  memberId: string;
  type: "user" | "guest";
  id: string;
  name: string | null;
  username?: string | null;
  phone?: string | null;
  upiId?: string | null;
  net: number;
};

type GroupExpense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  createdById: string;
  paidBy: { type: "user" | "guest"; id: string; name: string | null; username?: string | null };
  myShare: number;
};

type SavedGuest = { id: string; name: string; phone: string | null };
type AppFriend = { id: string; name: string | null; username: string | null };

const contactPickerSupported =
  typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

export default function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = use(params);

  const [currentUser, setCurrentUser] = useState<{ id: string; name: string | null; username: string | null } | null>(null);
  const [group, setGroup] = useState<{ id: string; name: string; createdById: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [groupExpenses, setGroupExpenses] = useState<GroupExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState<Member | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settling, setSettling] = useState(false);

  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [actNextCursor, setActNextCursor] = useState<string | null>(null);
  const [actLoading, setActLoading] = useState(true);
  const [actLoadingMore, setActLoadingMore] = useState(false);

  // Member search state
  const [allFriends, setAllFriends] = useState<AppFriend[]>([]);
  const [savedGuests, setSavedGuests] = useState<SavedGuest[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [manualGuestName, setManualGuestName] = useState("");
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setCurrentUser(d.user ?? null)).catch(() => {});
  }, []);

  const fetchGroup = useCallback(async () => {
    const [groupRes, expRes] = await Promise.all([
      fetch(`/api/groups/${groupId}`),
      fetch(`/api/groups/${groupId}/expenses`),
    ]);
    const [groupData, expData] = await Promise.all([groupRes.json(), expRes.json()]);
    setGroup(groupData.group ?? null);
    setMembers(groupData.members ?? []);
    setGroupExpenses(expData.expenses ?? []);
    setLoading(false);
  }, [groupId]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  useEffect(() => {
    fetch(`/api/activity?groupId=${groupId}`)
      .then((r) => r.json())
      .then((d) => { setActivities(d.events ?? []); setActNextCursor(d.nextCursor ?? null); })
      .catch(() => {})
      .finally(() => setActLoading(false));
  }, [groupId]);

  const loadMoreActivity = useCallback(async () => {
    if (!actNextCursor || actLoadingMore) return;
    setActLoadingMore(true);
    try {
      const res = await fetch(`/api/activity?groupId=${groupId}&cursor=${encodeURIComponent(actNextCursor)}`);
      const data = await res.json();
      setActivities((prev) => [...prev, ...(data.events ?? [])]);
      setActNextCursor(data.nextCursor ?? null);
    } finally {
      setActLoadingMore(false);
    }
  }, [groupId, actNextCursor, actLoadingMore]);

  useEffect(() => {
    if (!addMemberOpen) return;
    fetch("/api/friends").then((r) => r.json()).then((d) => setAllFriends(d.friends ?? [])).catch(() => {});
    fetch("/api/guest-contacts").then((r) => r.json()).then((d) => setSavedGuests(d.guests ?? [])).catch(() => {});
  }, [addMemberOpen]);

  const handleDeleteExpense = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      setGroupExpenses((prev) => prev.filter((e) => e.id !== id));
      fetchGroup();
    } finally {
      setDeletingId(null);
    }
  }, [fetchGroup]);

  const addMember = useCallback(async (payload: object) => {
    setAddingMember(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setAddMemberOpen(false);
        setMemberQuery("");
        fetchGroup();
      }
    } finally {
      setAddingMember(false);
    }
  }, [groupId, fetchGroup]);

  const removeMember = useCallback(async (memberId: string) => {
    await fetch(`/api/groups/${groupId}/members/${memberId}`, { method: "DELETE" });
    fetchGroup();
  }, [groupId, fetchGroup]);

  const handleSettle = useCallback(async () => {
    if (!settleOpen || !settleAmount || settling) return;
    setSettling(true);
    try {
      const fromMemberId = settleOpen.net < 0
        ? members.find((m) => m.type === "user" && m.id === currentUser?.id)?.memberId
        : settleOpen.memberId;
      const toMemberId = settleOpen.net < 0
        ? settleOpen.memberId
        : members.find((m) => m.type === "user" && m.id === currentUser?.id)?.memberId;

      const res = await fetch(`/api/groups/${groupId}/settlements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromMemberId, toMemberId, amount: parseFloat(settleAmount), note: settleNote || undefined }),
      });
      if (res.ok) {
        setSettleOpen(null);
        setSettleAmount("");
        setSettleNote("");
        fetchGroup();
      }
    } finally {
      setSettling(false);
    }
  }, [settleOpen, settleAmount, settleNote, settling, members, currentUser, groupId, fetchGroup]);

  const memberQueryLower = memberQuery.toLowerCase();
  const existingMemberUserIds = new Set(members.filter((m) => m.type === "user").map((m) => m.id));
  const existingMemberGuestIds = new Set(members.filter((m) => m.type === "guest").map((m) => m.id));

  const filteredFriends = memberQuery.trim().length >= 1
    ? allFriends.filter((f) => !existingMemberUserIds.has(f.id) && (
        (f.name ?? "").toLowerCase().includes(memberQueryLower) ||
        (f.username ?? "").toLowerCase().includes(memberQueryLower)
      ))
    : [];

  const filteredGuests = savedGuests.filter((g) =>
    !existingMemberGuestIds.has(g.id) &&
    (memberQuery.trim() === "" || g.name.toLowerCase().includes(memberQueryLower))
  );

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!group) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
          <p className="text-[15px] font-light text-muted-foreground">Group not found.</p>
          <Link href="/groups" className="mt-3 text-[14px] text-emerald-600">Back to groups</Link>
        </div>
      </AppShell>
    );
  }

  const groupMembersForSheet = members.map((m) => ({
    type: m.type,
    id: m.id,
    name: m.name,
    username: m.username ?? null,
    phone: m.phone ?? null,
  }));

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Link href="/groups" className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] transition-colors duration-150">
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <h1 className="flex-1 text-[17px] font-light tracking-[-0.02em] truncate">{group.name}</h1>
          <span className="text-[12px] font-light text-muted-foreground shrink-0">{members.length} member{members.length !== 1 ? "s" : ""}</span>
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 space-y-8 max-w-2xl mx-auto w-full">

        {/* BALANCES */}
        <section>
          <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase mb-2 px-1">Balances</p>
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {members.filter((m) => !(m.type === "user" && m.id === currentUser?.id)).map((m, i) => {
              const canLink = m.type === "user" && m.username;
              return (
              <div key={m.memberId} className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                {canLink ? (
                  <Link href={`/friends/${m.username}`} className="flex flex-1 items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className={cn("text-[13px] font-medium", m.type === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                        {(m.name ?? "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-light truncate">{m.name ?? m.username ?? "Guest"}</p>
                      {m.type === "guest" && <span className="text-[10px] text-zinc-400">Guest</span>}
                    </div>
                    <div className="text-right shrink-0">
                      {m.net === 0 ? (
                        <p className="text-[13px] font-light text-muted-foreground">Settled</p>
                      ) : m.net > 0 ? (
                        <>
                          <p className="text-[14px] font-light text-emerald-600 tabular-nums">+₹{formatPaise(m.net)}</p>
                          <p className="text-[11px] font-light text-muted-foreground">owes you</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[14px] font-light text-rose-500 tabular-nums">-₹{formatPaise(Math.abs(m.net))}</p>
                          <p className="text-[11px] font-light text-muted-foreground">you owe</p>
                        </>
                      )}
                    </div>
                  </Link>
                ) : (
                  <>
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarFallback className={cn("text-[13px] font-medium", m.type === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                        {(m.name ?? "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-light truncate">{m.name ?? m.username ?? "Guest"}</p>
                      {m.type === "guest" && <span className="text-[10px] text-zinc-400">Guest</span>}
                    </div>
                    <div className="text-right shrink-0">
                      {m.net === 0 ? (
                        <p className="text-[13px] font-light text-muted-foreground">Settled</p>
                      ) : m.net > 0 ? (
                        <>
                          <p className="text-[14px] font-light text-emerald-600 tabular-nums">+₹{formatPaise(m.net)}</p>
                          <p className="text-[11px] font-light text-muted-foreground">owes you</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[14px] font-light text-rose-500 tabular-nums">-₹{formatPaise(Math.abs(m.net))}</p>
                          <p className="text-[11px] font-light text-muted-foreground">you owe</p>
                        </>
                      )}
                    </div>
                  </>
                )}
                {m.net !== 0 && (
                  <button
                    onClick={() => { setSettleOpen(m); setSettleAmount(formatPaise(Math.abs(m.net)).replace(/,/g, "")); }}
                    className="ml-1 shrink-0 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-medium hover:bg-emerald-100 transition-colors duration-150"
                  >
                    Settle
                  </button>
                )}
              </div>
              );
            })}
            {members.filter((m) => !(m.type === "user" && m.id === currentUser?.id)).length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-[14px] font-light text-muted-foreground">Add members to start splitting.</p>
              </div>
            )}
          </div>
        </section>

        {/* EXPENSES */}
        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase">Expenses</p>
            {currentUser && (
              <button
                onClick={() => setAddExpenseOpen(true)}
                className="flex items-center gap-1 text-[13px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors duration-150"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add
              </button>
            )}
          </div>
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {groupExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Receipt className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <p className="text-[14px] font-light text-muted-foreground">No expenses yet</p>
              </div>
            ) : groupExpenses.map((e, i) => {
              const isMyExpense = e.createdById === currentUser?.id;
              const payerLabel = e.paidBy.type === "user" && e.paidBy.id === currentUser?.id
                ? "You paid"
                : `${e.paidBy.name ?? e.paidBy.username ?? "Someone"} paid`;
              return (
                <div key={e.id} className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                  <Link href={`/expenses/${e.id}`} className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80 transition-opacity duration-150">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-light truncate">{e.title}</p>
                      <p className="text-[12px] text-muted-foreground font-light">
                        {payerLabel} · {new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[14px] font-light tabular-nums">₹{formatPaise(e.amount)}</p>
                      <p className="text-[11px] font-light text-muted-foreground tabular-nums">your share ₹{formatPaise(e.myShare)}</p>
                    </div>
                  </Link>
                  {isMyExpense && (
                    <button
                      onClick={() => handleDeleteExpense(e.id)}
                      disabled={deletingId === e.id}
                      className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-rose-50 hover:text-rose-500 transition-colors duration-150 disabled:opacity-40"
                      aria-label="Delete expense"
                    >
                      {deletingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* MEMBERS */}
        <section>
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase">Members</p>
            <button
              onClick={() => setAddMemberOpen(true)}
              className="flex items-center gap-1 text-[13px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors duration-150"
            >
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2} /> Add
            </button>
          </div>
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {members.map((m, i) => {
              const isMe = m.type === "user" && m.id === currentUser?.id;
              const canLink = m.type === "user" && m.username && !isMe;
              const rowContent = (
                <>
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className={cn("text-[13px] font-medium", m.type === "user" ? "bg-emerald-500/15 text-emerald-700" : "bg-zinc-200 text-zinc-600")}>
                      {(m.name ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-light truncate">{m.name ?? m.username ?? "Guest"}{isMe && " (you)"}</p>
                    {m.username && <p className="text-[12px] text-muted-foreground">@{m.username}</p>}
                    {m.type === "guest" && m.phone && <p className="text-[12px] text-muted-foreground">{m.phone}</p>}
                  </div>
                  {m.type === "guest" && <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 bg-zinc-100 px-1.5 py-0.5 rounded-md shrink-0">Guest</span>}
                </>
              );
              return (
                <div key={m.memberId} className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                  {canLink ? (
                    <Link href={`/friends/${m.username}`} className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80 transition-opacity duration-150">
                      {rowContent}
                    </Link>
                  ) : m.type === "guest" ? (
                    <Link href={`/contacts/${m.id}`} className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80 transition-opacity duration-150">
                      {rowContent}
                    </Link>
                  ) : (
                    <div className="flex flex-1 items-center gap-3 min-w-0">
                      {rowContent}
                    </div>
                  )}
                  {group.createdById === currentUser?.id && !isMe && (
                    <button
                      onClick={() => removeMember(m.memberId)}
                      className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.06] transition-colors duration-150"
                      aria-label="Remove member"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ACTIVITY */}
        <section className="pb-4 md:pb-0">
          <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase mb-2 px-1">Activity</p>
          {actLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-2xl bg-card border border-black/[0.06] text-center">
              <p className="text-[14px] font-light text-muted-foreground">No activity yet</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
              {activities.map((event, i) => {
                const href = eventHref(event);
                const rowClass = cn("flex items-start gap-3 px-4 py-3.5", href && "hover:bg-black/[0.02] transition-colors duration-150", i > 0 && "border-t border-black/[0.06]");
                const iconBg =
                  event.type === "expense_added" ? "bg-emerald-500/15" :
                  event.type === "expense_deleted" ? "bg-rose-100" :
                  event.type === "settlement_recorded" ? "bg-amber-100" :
                  "bg-muted";
                const iconColor =
                  event.type === "expense_added" ? "text-emerald-700" :
                  event.type === "expense_deleted" ? "text-rose-500" :
                  event.type === "settlement_recorded" ? "text-amber-700" :
                  "text-muted-foreground";
                const EventIcon =
                  event.type === "expense_added" || event.type === "expense_deleted" ? <Receipt className="h-4 w-4" strokeWidth={1.5} /> :
                  event.type === "settlement_recorded" ? <Handshake className="h-4 w-4" strokeWidth={1.5} /> :
                  event.type === "friend_added" ? <UserPlus className="h-4 w-4" strokeWidth={1.5} /> :
                  event.type === "friend_removed" ? <UserMinus className="h-4 w-4" strokeWidth={1.5} /> :
                  <Users className="h-4 w-4" strokeWidth={1.5} />;
                const content = (
                  <>
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5", iconBg)}>
                      <span className={iconColor}>{EventIcon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-light leading-snug">
                        {currentUser ? describeEvent(event, currentUser.id) : "…"}
                      </p>
                      <p className="text-[12px] font-light text-muted-foreground mt-0.5">{relativeTime(event.createdAt)}</p>
                    </div>
                  </>
                );
                return href ? (
                  <Link key={event.id} href={href} className={rowClass}>{content}</Link>
                ) : (
                  <div key={event.id} className={rowClass}>{content}</div>
                );
              })}
              {actNextCursor && (
                <div className="border-t border-black/[0.06]">
                  <button
                    onClick={loadMoreActivity}
                    disabled={actLoadingMore}
                    className="w-full py-3.5 text-[13px] font-light text-muted-foreground hover:text-foreground hover:bg-black/[0.02] transition-colors duration-150 flex items-center justify-center gap-2"
                  >
                    {actLoadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

      </div>

      {/* Add expense sheet */}
      {addExpenseOpen && currentUser && (
        <AddExpenseSheet
          currentUser={currentUser}
          groupId={groupId}
          groupName={group.name}
          groupMembers={groupMembersForSheet}
          onClose={() => setAddExpenseOpen(false)}
          onSaved={() => { setAddExpenseOpen(false); fetchGroup(); window.dispatchEvent(new CustomEvent("expense-added")); }}
        />
      )}

      {/* Add member sheet */}
      {addMemberOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setAddMemberOpen(false)} />
          <div className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:top-6 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-[480px] md:rounded-2xl md:shadow-[0_8px_40px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] shrink-0 md:rounded-t-2xl">
              <button onClick={() => setAddMemberOpen(false)} className="text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150 min-w-[56px]">Cancel</button>
              <span className="text-[17px] font-light">Add member</span>
              <div className="min-w-[56px]" />
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-5 space-y-4 pb-10">
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Search friends or guests…"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  className="h-10 flex-1 rounded-xl border-black/[0.1] bg-white pl-4 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                />
                {contactPickerSupported && (
                  <button
                    onClick={async () => {
                      try {
                        // @ts-expect-error — Contact Picker API not in TS lib yet
                        const contacts = await navigator.contacts.select(["name", "tel"], { multiple: true });
                        for (const c of contacts) {
                          const name = c.name?.[0] ?? "Unknown";
                          if (name) await addMember({ type: "guest_new", name, phone: c.tel?.[0] ?? undefined });
                        }
                      } catch { /* cancelled */ }
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.1] bg-white text-muted-foreground hover:bg-black/[0.03] transition-colors duration-150"
                  >
                    <BookUser className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>

              {/* Friend results */}
              {filteredFriends.length > 0 && (
                <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                  {filteredFriends.map((f, i) => (
                    <div key={f.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[12px] font-medium">
                          {(f.name ?? f.username ?? "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-light truncate">{f.name ?? f.username}</p>
                        {f.username && <p className="text-[12px] text-muted-foreground">@{f.username}</p>}
                      </div>
                      <Button size="sm" disabled={addingMember} onClick={() => addMember({ type: "user", userId: f.id })} className="h-7 px-3 rounded-lg bg-emerald-500 text-white text-[12px] font-medium hover:bg-emerald-600">Add</Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Saved guest results */}
              {filteredGuests.length > 0 && (
                <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                  {filteredGuests.slice(0, 5).map((g, i) => (
                    <div key={g.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-zinc-200 text-zinc-600 text-[12px] font-medium">
                          {g.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-light truncate">{g.name}</p>
                        {g.phone && <p className="text-[12px] text-muted-foreground">{g.phone}</p>}
                      </div>
                      <Button size="sm" disabled={addingMember} onClick={() => addMember({ type: "guest", guestId: g.id })} className="h-7 px-3 rounded-lg bg-zinc-700 text-white text-[12px] font-medium hover:bg-zinc-800">Add</Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Manual guest fallback */}
              {!contactPickerSupported && (
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Add guest by name…"
                    value={manualGuestName}
                    onChange={(e) => setManualGuestName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualGuestName.trim()) {
                        addMember({ type: "guest_new", name: manualGuestName.trim() });
                        setManualGuestName("");
                      }
                    }}
                    className="h-10 flex-1 rounded-xl border-black/[0.1] bg-white pl-4 text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
                  />
                  <button
                    disabled={!manualGuestName.trim() || addingMember}
                    onClick={() => { addMember({ type: "guest_new", name: manualGuestName.trim() }); setManualGuestName(""); }}
                    className="flex h-10 items-center gap-1.5 px-3 rounded-xl bg-zinc-100 text-zinc-700 text-[13px] font-light hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-150 shrink-0"
                  >
                    <UserPlus className="h-3.5 w-3.5" strokeWidth={1.5} /> Add
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Settle up sheet */}
      {settleOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSettleOpen(null)} />
          <div className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:top-6 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:w-[400px] md:rounded-2xl md:shadow-[0_8px_40px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] shrink-0 md:rounded-t-2xl">
              <button onClick={() => setSettleOpen(null)} className="text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150 min-w-[56px]">Cancel</button>
              <span className="text-[17px] font-light">Settle up</span>
              <button
                onClick={handleSettle}
                disabled={!settleAmount || settling}
                className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150 min-w-[56px] text-right"
              >
                {settling ? <Loader2 className="h-4 w-4 animate-spin ml-auto" /> : "Save"}
              </button>
            </div>
            <div className="px-4 py-5 space-y-3">
              <p className="text-[13px] font-light text-muted-foreground px-1">
                {settleOpen.net > 0
                  ? `${settleOpen.name ?? "They"} pays you`
                  : `You pay ${settleOpen.name ?? "them"}`}
              </p>
              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-black/[0.06]">
                  <span className="text-[13px] font-light text-muted-foreground w-16 shrink-0">Amount</span>
                  <div className="flex items-center gap-1 flex-1">
                    <span className="text-[15px] font-light text-muted-foreground">₹</span>
                    <Input
                      autoFocus
                      type="number"
                      inputMode="decimal"
                      value={settleAmount}
                      onChange={(e) => setSettleAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="text-[13px] font-light text-muted-foreground w-16 shrink-0">Note</span>
                  <Input
                    type="text"
                    value={settleNote}
                    onChange={(e) => setSettleNote(e.target.value)}
                    placeholder="Optional note"
                    maxLength={200}
                    className="h-8 flex-1 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              {settleOpen.net < 0 && settleOpen.type === "user" && settleOpen.upiId && (
                <a
                  href={`upi://pay?pa=${encodeURIComponent(settleOpen.upiId)}&pn=${encodeURIComponent(settleOpen.name ?? "")}&am=${settleAmount || "0"}&cu=INR`}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-50 text-emerald-700 text-[14px] font-light hover:bg-emerald-100 transition-colors duration-150"
                >
                  <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                  Pay via UPI
                </a>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
