"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Receipt, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_CATEGORIES } from "@/lib/categories";

type Expense = {
  id: string;
  title: string;
  amount: number;
  date: string;
  category: string | null;
  groupId: string | null;
  groupName: string | null;
  myShare: number;
  paidBy: { type: "user" | "guest"; id: string; name: string | null; username?: string | null };
};

type Group = { id: string; name: string };

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function categoryIcon(key: string | null): string {
  if (!key) return "📦";
  if (key.startsWith("custom:")) return "📦";
  return DEFAULT_CATEGORIES.find((c) => c.key === key)?.icon ?? "📦";
}

export default function ExpensesPage() {
  const router = useRouter();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [customCategories, setCustomCategories] = useState<{ key: string; name: string; icon: string }[]>([]);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setCurrentUserId(d.user?.id ?? null)).catch(() => {});
    fetch("/api/groups").then((r) => r.json()).then((d) => setGroups((d.groups ?? []).map((g: { id: string; name: string }) => ({ id: g.id, name: g.name }))));
    fetch("/api/categories").then((r) => r.json()).then((d) => {
      const custom = (d.custom ?? []).map((c: { key: string; name: string; icon: string | null }) => ({ key: c.key, name: c.name, icon: c.icon ?? "📦" }));
      setCustomCategories(custom);
    }).catch(() => {});
  }, []);

  // Debounce search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  const buildUrl = useCallback((cursor?: string) => {
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (selectedCategory) params.set("category", selectedCategory);
    if (selectedGroupId) params.set("groupId", selectedGroupId);
    params.set("limit", "20");
    if (cursor) params.set("cursor", cursor);
    return `/api/expenses?${params.toString()}`;
  }, [debouncedQuery, selectedCategory, selectedGroupId]);

  const fetchExpenses = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await fetch(buildUrl(), { signal: ctrl.signal });
      const data = await res.json();
      setExpenses(data.expenses ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setExpenses([]);
    } finally {
      setLoading(false);
    }
  }, [buildUrl]);

  useEffect(() => { fetchExpenses(); }, [fetchExpenses]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await fetch(buildUrl(nextCursor));
      const data = await res.json();
      setExpenses((prev) => [...prev, ...(data.expenses ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, buildUrl]);

  const allCategories = [
    ...DEFAULT_CATEGORIES.map((c) => ({ key: c.key, name: c.name, icon: c.icon })),
    ...customCategories,
  ];

  const hasFilters = debouncedQuery || selectedCategory || selectedGroupId;

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center px-5 md:px-6">
          <h1 className="text-[17px] font-light tracking-[-0.02em] md:hidden">Expenses</h1>
          <h1 className="hidden md:block text-[15px] font-medium tracking-[-0.01em]">Expenses</h1>
        </div>
      </header>

      <div className="px-4 py-4 md:px-6 md:py-6 max-w-2xl mx-auto w-full space-y-4">

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" strokeWidth={1.5} />
          <Input
            type="search"
            placeholder="Search expenses…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9 pr-9 rounded-xl border-black/[0.1] bg-card text-[14px] font-light placeholder:text-muted-foreground/50 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors duration-150">
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Filter chips — categories */}
        <div className="flex flex-wrap gap-2">
          {allCategories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-light whitespace-nowrap transition-colors duration-150",
                selectedCategory === cat.key
                  ? "bg-emerald-500 text-white"
                  : "bg-card border border-black/[0.06] text-foreground hover:bg-black/[0.04]"
              )}
            >
              <span>{cat.icon}</span>
              {cat.name}
            </button>
          ))}
        </div>

        {/* Filter chips — groups */}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroupId(selectedGroupId === g.id ? null : g.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-light whitespace-nowrap transition-colors duration-150",
                  selectedGroupId === g.id
                    ? "bg-emerald-500 text-white"
                    : "bg-card border border-black/[0.06] text-foreground hover:bg-black/[0.04]"
                )}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Receipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-light">{hasFilters ? "No matching expenses" : "No expenses yet"}</p>
            <p className="text-[13px] font-light text-muted-foreground mt-1">
              {hasFilters ? "Try different filters." : "Tap + to add your first expense."}
            </p>
          </div>
        ) : (
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {expenses.map((expense, i) => {
              const isMyExpense = expense.paidBy.type === "user" && expense.paidBy.id === currentUserId;
              const payerLabel = isMyExpense
                ? "You paid"
                : `${expense.paidBy.name ?? expense.paidBy.username ?? "Someone"} paid`;
              return (
                <Link
                  key={expense.id}
                  href={`/expenses/${expense.id}`}
                  className={cn("flex items-center gap-3 px-4 py-3.5 hover:bg-black/[0.02] transition-colors duration-150", i > 0 && "border-t border-black/[0.06]")}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-[18px]">
                    {expense.category ? categoryIcon(expense.category) : <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-light truncate">{expense.title}</p>
                    <p className="text-[12px] font-light text-muted-foreground">
                      {payerLabel}
                      {" · "}
                      {new Date(expense.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {expense.groupName && <> · {expense.groupName}</>}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-light tabular-nums">₹{formatPaise(expense.amount)}</p>
                    <p className={cn("text-[11px] font-light tabular-nums", isMyExpense ? "text-emerald-600" : "text-rose-500")}>your share ₹{formatPaise(expense.myShare)}</p>
                  </div>
                </Link>
              );
            })}
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
      </div>
    </AppShell>
  );
}
