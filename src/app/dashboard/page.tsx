"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowDownLeft, ArrowUpRight, Receipt, Users, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name: string | null, username: string | null): string {
  if (name) return name.trim().charAt(0).toUpperCase();
  if (username) return username.trim().charAt(0).toUpperCase();
  return "?";
}

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Expense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  paidBy: { type: "user" | "guest"; id: string; name: string | null; username?: string | null };
  myShare: number;
};

type Balances = {
  totalOwedToYou: number;
  totalYouOwe: number;
  netTotal: number;
  guestBalances: { guestId: string; name: string; phone: string | null; net: number }[];
};

type Group = { id: string; name: string; memberCount: number; myBalance: number };

export default function DashboardPage() {
  const [user, setUser] = useState<{ id: string; name: string | null; username: string | null } | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balances, setBalances] = useState<Balances>({ totalOwedToYou: 0, totalYouOwe: 0, netTotal: 0, guestBalances: [] });
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [expRes, balRes, grpRes] = await Promise.all([
        fetch("/api/expenses?limit=5"),
        fetch("/api/balances"),
        fetch("/api/groups"),
      ]);
      const [expData, balData, grpData] = await Promise.all([expRes.json(), balRes.json(), grpRes.json()]);
      setExpenses(expData.expenses ?? []);
      setBalances({
        totalOwedToYou: balData.totalOwedToYou ?? 0,
        totalYouOwe: balData.totalYouOwe ?? 0,
        netTotal: balData.netTotal ?? 0,
        guestBalances: balData.guestBalances ?? [],
      });
      setGroups(grpData.groups ?? []);
    } catch {
      // leave state unchanged on network error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const handler = () => fetchData();
    window.addEventListener("expense-added", handler);
    return () => window.removeEventListener("expense-added", handler);
  }, [fetchData]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      const balRes = await fetch("/api/balances");
      const balData = await balRes.json();
      setBalances({
        totalOwedToYou: balData.totalOwedToYou ?? 0,
        totalYouOwe: balData.totalYouOwe ?? 0,
        netTotal: balData.netTotal ?? 0,
        guestBalances: balData.guestBalances ?? [],
      });
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null);
    }
  }, []);

  const netSign = balances.netTotal >= 0 ? "+" : "-";
  const netAbs = Math.abs(balances.netTotal);

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center justify-between px-5 md:px-6">
          <h1 className="text-[17px] font-light tracking-[-0.02em] md:hidden">Dutch</h1>
          <h1 className="hidden md:block text-[15px] font-medium tracking-[-0.01em] text-foreground">Overview</h1>
          <Link href="/account">
            <Avatar className="h-8 w-8 cursor-pointer ring-[1.5px] ring-black/10">
              <AvatarFallback className="bg-emerald-500 text-white text-[13px] font-medium">
                {initials(user?.name ?? null, user?.username ?? null)}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 space-y-8 max-w-2xl mx-auto w-full">

        {/* Hero balance */}
        <section className="text-center pt-2 pb-1">
          <p className="text-[13px] font-light text-muted-foreground tracking-[0.04em] uppercase mb-1">Net Balance</p>
          <p className={cn(
            "text-[52px] font-thin tracking-[-0.04em] leading-none",
            balances.netTotal > 0 ? "text-emerald-600" : balances.netTotal < 0 ? "text-rose-500" : "text-foreground"
          )}>
            {balances.netTotal !== 0 && <span className="text-[32px]">{netSign}</span>}₹{formatPaise(netAbs)}
          </p>
          <p className="mt-2 text-[13px] font-light text-muted-foreground">
            {balances.netTotal === 0 ? "All settled up" : balances.netTotal > 0 ? "Overall you are owed" : "Overall you owe"}
          </p>
        </section>

        {/* Balance tiles */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-emerald-50 px-5 py-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
                <ArrowDownLeft className="h-3 w-3 text-emerald-600" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-light text-emerald-700 tracking-[0.02em] uppercase">Owed to you</span>
            </div>
            <p className="text-[28px] font-thin tracking-[-0.03em] leading-none text-emerald-600">
              ₹{formatPaise(balances.totalOwedToYou)}
            </p>
          </div>
          <div className="rounded-2xl bg-rose-50 px-5 py-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500/15">
                <ArrowUpRight className="h-3 w-3 text-rose-600" strokeWidth={2.5} />
              </div>
              <span className="text-[11px] font-light text-rose-700 tracking-[0.02em] uppercase">You owe</span>
            </div>
            <p className="text-[28px] font-thin tracking-[-0.03em] leading-none text-rose-500">
              ₹{formatPaise(balances.totalYouOwe)}
            </p>
          </div>
        </section>

        {/* Non-app debts (guest balances) */}
        {balances.guestBalances.length > 0 && (
          <section>
            <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase mb-2 px-1">
              Non-app debts
            </p>
            <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
              {balances.guestBalances.map((g, i) => (
                <div key={g.guestId} className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-zinc-200 text-zinc-600 text-[13px] font-medium">
                      {g.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-light truncate">{g.name}</p>
                    {g.phone && <p className="text-[12px] font-light text-muted-foreground">{g.phone}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    {g.net > 0 ? (
                      <>
                        <p className="text-[14px] font-light text-emerald-600 tabular-nums">+₹{formatPaise(g.net)}</p>
                        <p className="text-[11px] font-light text-muted-foreground">owes you</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[14px] font-light text-rose-500 tabular-nums">-₹{formatPaise(Math.abs(g.net))}</p>
                        <p className="text-[11px] font-light text-muted-foreground">you owe</p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recent Activity */}
        <section>
          <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase mb-2 px-1">Recent Activity</p>
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Receipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <p className="text-[15px] font-light text-foreground mb-1">No expenses yet</p>
                <p className="text-[13px] font-light text-muted-foreground max-w-[220px] leading-relaxed">
                  Tap + to add your first expense.
                </p>
              </div>
            ) : (
              expenses.map((expense, i) => {
                const isMyExpense = expense.paidBy.type === "user" && expense.paidBy.id === user?.id;
                const payerLabel = isMyExpense
                  ? "You paid"
                  : `${expense.paidBy.name ?? expense.paidBy.username ?? "Someone"} paid`;
                return (
                  <div key={expense.id} className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                    <Link href={`/expenses/${expense.id}`} className="flex flex-1 items-center gap-3 min-w-0 hover:opacity-80 transition-opacity duration-150">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-light truncate">{expense.title}</p>
                        <p className="text-[12px] text-muted-foreground font-light">
                          {payerLabel}
                          {" · "}
                          {new Date(expense.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[14px] font-light tabular-nums">₹{formatPaise(expense.amount)}</p>
                        <p className="text-[11px] font-light text-muted-foreground tabular-nums">
                          your share ₹{formatPaise(expense.myShare)}
                        </p>
                      </div>
                    </Link>
                    {isMyExpense && (
                      <button
                        onClick={() => handleDelete(expense.id)}
                        disabled={deletingId === expense.id}
                        className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-rose-50 hover:text-rose-500 transition-colors duration-150 disabled:opacity-40"
                        aria-label="Delete expense"
                      >
                        {deletingId === expense.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* Groups */}
        <section>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-[13px] font-medium text-muted-foreground tracking-[0.02em] uppercase">Groups</p>
            {groups.length > 0 && (
              <Link href="/groups" className="text-[12px] font-light text-emerald-600 hover:text-emerald-700 transition-colors duration-150">View all</Link>
            )}
          </div>
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                  <Users className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <p className="text-[15px] font-light text-foreground mb-1">No groups yet</p>
                <p className="text-[13px] font-light text-muted-foreground max-w-[220px] leading-relaxed">
                  Create a group to split expenses with friends or flatmates.
                </p>
              </div>
            ) : (
              <>
                {groups.slice(0, 3).map((g, i) => (
                  <Link key={g.id} href={`/groups/${g.id}`} className={cn("flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors duration-150", i > 0 && "border-t border-black/[0.06]")}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
                      <span className="text-[14px] font-medium text-emerald-700">{g.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-light truncate">{g.name}</p>
                      <p className="text-[12px] font-light text-muted-foreground">{g.memberCount} member{g.memberCount !== 1 ? "s" : ""}</p>
                    </div>
                    {g.myBalance !== 0 && (
                      <p className={cn("text-[13px] font-light tabular-nums shrink-0", g.myBalance > 0 ? "text-emerald-600" : "text-rose-500")}>
                        {g.myBalance > 0 ? "+" : "-"}₹{(Math.abs(g.myBalance) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </Link>
                ))}
                {groups.length > 3 && (
                  <Link href="/groups" className="flex items-center justify-center py-3 border-t border-black/[0.06] text-[13px] font-light text-emerald-600 hover:text-emerald-700 hover:bg-black/[0.02] transition-colors duration-150">
                    View all {groups.length} groups
                  </Link>
                )}
              </>
            )}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
