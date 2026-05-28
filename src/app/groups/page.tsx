"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Users, Loader2, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Group = { id: string; name: string; memberCount: number; myBalance: number };

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/groups");
      const data = await res.json();
      setGroups(data.groups ?? []);
    } catch {
      // leave state unchanged
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  const handleCreate = useCallback(async () => {
    if (!newGroupName.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      setSheetOpen(false);
      setNewGroupName("");
      fetchGroups();
    } finally {
      setCreating(false);
    }
  }, [newGroupName, creating, fetchGroups]);

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center justify-between px-5 md:px-6">
          <h1 className="text-[17px] font-light tracking-[-0.02em] md:hidden">Groups</h1>
          <h1 className="hidden md:block text-[15px] font-medium tracking-[-0.01em]">Groups</h1>
          <button
            onClick={() => setSheetOpen(true)}
            className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors duration-150"
          >
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
              <button
                onClick={() => setSheetOpen(true)}
                className="px-5 py-2 rounded-xl bg-emerald-500 text-white text-[14px] font-medium hover:bg-emerald-600 transition-colors duration-150"
              >
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
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setSheetOpen(false)} />
          <div className="fixed inset-0 z-50 flex flex-col bg-background md:inset-auto md:top-6 md:bottom-auto md:left-1/2 md:-translate-x-1/2 md:w-[400px] md:rounded-2xl md:shadow-[0_8px_40px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06] shrink-0 md:rounded-t-2xl">
              <button onClick={() => setSheetOpen(false)} className="text-[15px] font-light text-muted-foreground hover:text-foreground transition-colors duration-150 min-w-[56px]">
                Cancel
              </button>
              <span className="text-[17px] font-light tracking-[-0.02em]">New group</span>
              <button
                onClick={handleCreate}
                disabled={!newGroupName.trim() || creating}
                className="text-[15px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors duration-150 min-w-[56px] text-right"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin ml-auto" /> : "Create"}
              </button>
            </div>
            <div className="px-4 py-5">
              <div className="rounded-2xl border border-black/[0.06] bg-card px-4 py-3.5">
                <Input
                  autoFocus
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Group name (e.g. Goa Trip)"
                  maxLength={80}
                  className="h-8 border-0 bg-transparent p-0 text-[15px] font-light placeholder:text-muted-foreground/40 focus-visible:ring-0 focus-visible:ring-offset-0"
                />
              </div>
              {error && <p className="mt-3 text-center text-[13px] font-light text-rose-500">{error}</p>}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
