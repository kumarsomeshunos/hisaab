"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Receipt, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initials(name: string | null, username: string | null): string {
  if (name) return name.trim().charAt(0).toUpperCase();
  if (username) return username.trim().charAt(0).toUpperCase();
  return "?";
}

type FriendProfile = {
  id: string;
  name: string | null;
  username: string | null;
  upiId: string | null;
  avatar: string | null;
  phone: string | null;
  isFriend?: boolean;
};

type MutualGroup = { id: string; name: string; myBalance: number };

type SharedExpense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  myShare: number;
  isMine: boolean;
};

export default function FriendProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [friend, setFriend] = useState<FriendProfile | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [mutualGroups, setMutualGroups] = useState<MutualGroup[]>([]);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleAmountStr, setSettleAmountStr] = useState("");
  const [settleNote, setSettleNote] = useState("");
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setCurrentUserId(d.user?.id ?? null)).catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/users/${encodeURIComponent(username)}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        const data = await res.json();
        setFriend(data.user ?? null);
        setBalance(data.balance ?? 0);
        setMutualGroups(data.mutualGroups ?? []);
        setExpenses(data.expenses ?? []);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [username]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || !friend) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}?cursor=${encodeURIComponent(nextCursor)}`);
      const data = await res.json();
      setExpenses((prev) => [...prev, ...(data.expenses ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, username, friend]);

  const handleSettle = useCallback(async () => {
    const amount = parseFloat(settleAmountStr);
    if (isNaN(amount) || amount <= 0 || !friend) return;
    setSettling(true);
    try {
      const direction = balance < 0 ? "i_paid" : "they_paid";
      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendUserId: friend.id, amount, direction, note: settleNote.trim() || undefined }),
      });
      if (!res.ok) return;
      const paise = Math.round(amount * 100);
      setBalance((b) => direction === "i_paid" ? b + paise : b - paise);
      window.dispatchEvent(new CustomEvent("settlement-recorded"));
      setSettleOpen(false);
      setSettleAmountStr("");
      setSettleNote("");
    } finally {
      setSettling(false);
    }
  }, [settleAmountStr, settleNote, balance, friend]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !friend) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
          <p className="text-[15px] font-light text-muted-foreground">Friend not found.</p>
          <Link href="/friends" className="mt-3 text-[14px] text-emerald-600">Back to friends</Link>
        </div>
      </AppShell>
    );
  }

  const upiAmount = (Math.abs(balance) / 100).toFixed(2);
  const isFriend = friend.isFriend ?? true;

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Link
            href={isFriend ? "/friends" : "/groups"}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] transition-colors duration-150"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <h1 className="flex-1 text-[17px] font-light tracking-[-0.02em] truncate">{friend.name ?? `@${friend.username}`}</h1>
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto w-full space-y-6 pb-20 md:pb-8">

        {/* Hero */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <Avatar className="h-20 w-20">
            <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[32px] font-light">
              {friend.avatar ?? initials(friend.name, friend.username)}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="text-[20px] font-light tracking-[-0.02em]">{friend.name ?? "—"}</p>
            {friend.username && (
              <p className="text-[14px] text-muted-foreground font-light">@{friend.username}</p>
            )}
            {!isFriend && (
              <span className="mt-1 inline-block text-[11px] font-medium uppercase tracking-wide text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">Group member</span>
            )}
          </div>
          {friend.upiId && (
            <a
              href={`upi://pay?pa=${encodeURIComponent(friend.upiId)}&pn=${encodeURIComponent(friend.name ?? friend.username ?? "")}&am=${upiAmount}&cu=INR`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-[13px] font-light hover:bg-emerald-100 transition-colors duration-150"
            >
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
              Pay via UPI
            </a>
          )}
          {friend.phone && (
            <a
              href={`tel:${friend.phone}`}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-zinc-50 text-zinc-700 text-[13px] font-light hover:bg-zinc-100 transition-colors duration-150"
            >
              Call
            </a>
          )}
        </div>

        {/* Balance tile */}
        {isFriend && (
        <div className={cn(
          "rounded-2xl px-5 py-5 text-center",
          balance > 0 ? "bg-emerald-50" : balance < 0 ? "bg-rose-50" : "bg-muted"
        )}>
          <p className={cn(
            "text-[36px] font-thin tracking-[-0.04em] leading-none",
            balance > 0 ? "text-emerald-600" : balance < 0 ? "text-rose-500" : "text-muted-foreground"
          )}>
            {balance !== 0 && <span className="text-[24px]">{balance > 0 ? "+" : "-"}</span>}
            ₹{formatPaise(Math.abs(balance))}
          </p>
          <p className="mt-2 text-[13px] font-light text-muted-foreground">
            {balance === 0
              ? "All settled up"
              : balance > 0
              ? `${friend.name ?? friend.username ?? "They"} owes you`
              : `You owe ${friend.name ?? friend.username ?? "them"}`}
          </p>
        </div>
        )}

        {/* Settle Up */}
        {isFriend && balance !== 0 && (
          settleOpen ? (
            <div className="rounded-2xl border border-black/[0.06] bg-card px-5 py-4 space-y-3">
              <p className="text-[13px] font-light text-muted-foreground text-center">
                {balance < 0
                  ? `Recording that you paid ${friend.name ?? friend.username}`
                  : `Recording that ${friend.name ?? friend.username} paid you`}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-light text-muted-foreground shrink-0">₹</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={settleAmountStr}
                  onChange={(e) => setSettleAmountStr(e.target.value)}
                  placeholder={(Math.abs(balance) / 100).toFixed(2)}
                  className="h-9 flex-1 text-[15px] font-light rounded-xl border-black/[0.1]"
                />
              </div>
              <Input
                type="text"
                placeholder="Note (optional)"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                maxLength={200}
                className="h-9 text-[14px] font-light rounded-xl border-black/[0.1]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setSettleOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-[13px] font-light text-muted-foreground hover:text-foreground border border-black/[0.06] transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSettle}
                  disabled={settling || !settleAmountStr || parseFloat(settleAmountStr) <= 0}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-[13px] font-medium hover:bg-emerald-600 disabled:opacity-40 transition-colors duration-150 flex items-center justify-center"
                >
                  {settling ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setSettleOpen(true); setSettleAmountStr((Math.abs(balance) / 100).toFixed(2)); }}
              className="w-full py-3 rounded-2xl border border-emerald-200 text-emerald-700 text-[14px] font-light hover:bg-emerald-50 transition-colors duration-150"
            >
              Settle Up
            </button>
          )
        )}

        {/* Mutual groups */}
        {mutualGroups.length > 0 && (
          <section>
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Mutual groups</p>
            <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
              {mutualGroups.map((g, i) => (
                <Link
                  key={g.id}
                  href={`/groups/${g.id}`}
                  className={cn("flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors duration-150", i > 0 && "border-t border-black/[0.06]")}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                    <span className="text-[13px] font-medium text-emerald-700">{g.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <p className="flex-1 text-[14px] font-light truncate">{g.name}</p>
                  {g.myBalance !== 0 && (
                    <p className={cn("text-[13px] font-light tabular-nums shrink-0", g.myBalance > 0 ? "text-emerald-600" : "text-rose-500")}>
                      {g.myBalance > 0 ? "+" : "-"}₹{formatPaise(Math.abs(g.myBalance))}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Shared expenses */}
        {isFriend && (
        <section>
          <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">Shared expenses</p>
          {expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-black/[0.06] bg-card text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Receipt className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <p className="text-[14px] font-light text-muted-foreground">No shared expenses yet</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
              {expenses.map((e, i) => (
                <Link
                  key={e.id}
                  href={`/expenses/${e.id}`}
                  className={cn("flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors duration-150", i > 0 && "border-t border-black/[0.06]")}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-light truncate">{e.title}</p>
                    <p className="text-[12px] font-light text-muted-foreground">
                      {e.isMine ? "You paid" : `${friend.name ?? friend.username ?? "They"} paid`}
                      {" · "}
                      {new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-light tabular-nums">₹{formatPaise(e.amount)}</p>
                    <p className="text-[11px] font-light text-muted-foreground tabular-nums">your share ₹{formatPaise(e.myShare)}</p>
                  </div>
                </Link>
              ))}
              {nextCursor && (
                <div className="border-t border-black/[0.06]">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="w-full py-3.5 text-[13px] font-light text-muted-foreground hover:text-foreground hover:bg-black/[0.02] transition-colors duration-150 flex items-center justify-center gap-2"
                  >
                    {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load more"}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
        )}
      </div>
    </AppShell>
  );
}
