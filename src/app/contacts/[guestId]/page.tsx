"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Loader2, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type GuestProfile = { id: string; name: string; phone: string | null };

type SharedExpense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  myShare: number;
  isMine: boolean;
};

export default function ContactProfilePage({ params }: { params: Promise<{ guestId: string }> }) {
  const { guestId } = use(params);

  const [guest, setGuest] = useState<GuestProfile | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [expenses, setExpenses] = useState<SharedExpense[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/contacts/${encodeURIComponent(guestId)}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        const data = await res.json();
        setGuest(data.guest ?? null);
        setBalance(data.balance ?? 0);
        setExpenses(data.expenses ?? []);
        setNextCursor(data.nextCursor ?? null);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [guestId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/contacts/${encodeURIComponent(guestId)}?cursor=${encodeURIComponent(nextCursor)}`);
      const data = await res.json();
      setExpenses((prev) => [...prev, ...(data.expenses ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, guestId]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (notFound || !guest) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-64 text-center px-6">
          <p className="text-[15px] font-light text-muted-foreground">Contact not found.</p>
          <Link href="/dashboard" className="mt-3 text-[14px] text-emerald-600">Back to dashboard</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <Link
            href="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.05] transition-colors duration-150"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          </Link>
          <h1 className="flex-1 text-[17px] font-light tracking-[-0.02em] truncate">{guest.name}</h1>
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto w-full space-y-6 pb-20 md:pb-8">

        {/* Hero */}
        <div className="flex flex-col items-center gap-3 pt-2">
          <Avatar className="h-20 w-20">
            <AvatarFallback className="bg-zinc-200 text-zinc-600 text-[32px] font-light">
              {guest.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="text-[20px] font-light tracking-[-0.02em]">{guest.name}</p>
            {guest.phone && (
              <p className="text-[14px] text-muted-foreground font-light">{guest.phone}</p>
            )}
            <span className="mt-1 inline-block text-[11px] font-medium uppercase tracking-wide text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded-md">Guest</span>
          </div>
        </div>

        {/* Balance tile */}
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
              ? `${guest.name} owes you`
              : `You owe ${guest.name}`}
          </p>
        </div>

        {/* Shared expenses */}
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
                      {e.isMine ? "You paid" : `${guest.name} paid`}
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
      </div>
    </AppShell>
  );
}
