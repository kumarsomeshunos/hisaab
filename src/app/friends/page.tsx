"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { UserPlus, X, Loader2, UserX, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppShell } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";

type Friend = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  since: string;
};

type SearchUser = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

type AddState = "idle" | "loading" | "done";

function initials(name: string | null, username: string | null): string {
  if (name) return name.trim().charAt(0).toUpperCase();
  if (username) return username.trim().charAt(0).toUpperCase();
  return "?";
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addStates, setAddStates] = useState<Record<string, AddState>>({});

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load friends list
  useEffect(() => {
    fetch("/api/friends")
      .then((r) => r.json())
      .then((d) => setFriends(d.friends ?? []))
      .catch(() => {})
      .finally(() => setFriendsLoading(false));
  }, []);

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
    else { setQuery(""); setSearchResults([]); }
  }, [searchOpen]);

  // Debounced search
  useEffect(() => {
    const raw = query.trim();
    if (raw.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(raw)}`);
        const data = await res.json();
        setSearchResults(data.users ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleAdd = useCallback(async (user: SearchUser) => {
    setAddStates((s) => ({ ...s, [user.id]: "loading" }));
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usernameOrEmail: user.username ?? user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddStates((s) => ({ ...s, [user.id]: "idle" }));
        return;
      }
      setAddStates((s) => ({ ...s, [user.id]: "done" }));
      // Optimistically add to friends list
      setFriends((prev) => [
        ...prev,
        { id: data.friend.id, name: data.friend.name, username: data.friend.username, avatarUrl: data.friend.avatarUrl, since: new Date().toISOString() },
      ].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")));
      // Remove from search results
      setSearchResults((prev) => prev.filter((u) => u.id !== user.id));
    } catch {
      setAddStates((s) => ({ ...s, [user.id]: "idle" }));
    }
  }, []);

  const handleRemove = useCallback(async (friendId: string) => {
    setRemovingId(friendId);
    setOpenMenuId(null);
    try {
      await fetch(`/api/friends/${friendId}`, { method: "DELETE" });
      setFriends((prev) => prev.filter((f) => f.id !== friendId));
    } catch {
      // silently leave list unchanged on failure
    } finally {
      setRemovingId(null);
    }
  }, []);

  return (
    <AppShell>
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center justify-between px-5 md:px-6">
          <h1 className="text-[17px] font-light tracking-[-0.02em] md:hidden">Friends</h1>
          <h1 className="hidden md:block text-[17px] font-light tracking-[-0.02em]">Friends</h1>
          <button
            onClick={() => setSearchOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors duration-150 hover:bg-black/[0.04] text-foreground"
            aria-label={searchOpen ? "Close search" : "Add friend"}
          >
            {searchOpen
              ? <X className="h-[18px] w-[18px]" strokeWidth={1.5} />
              : <UserPlus className="h-[18px] w-[18px]" strokeWidth={1.5} />
            }
          </button>
        </div>
      </header>

      <div className="px-4 py-5 md:px-6 md:py-6 max-w-2xl mx-auto space-y-6 pb-20 md:pb-6">

        {/* Search panel */}
        {searchOpen && (
          <div className="space-y-3">
            <div className="relative">
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="@username or email"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-11 rounded-xl border-black/[0.1] bg-white pl-4 pr-10 text-[15px] font-light placeholder:text-muted-foreground/60 focus-visible:ring-emerald-500/25 focus-visible:border-emerald-400"
              />
              {searchLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
                {searchResults.map((u, i) => {
                  const state = addStates[u.id] ?? "idle";
                  return (
                    <div key={u.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[13px] font-medium">
                          {initials(u.name, u.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-light truncate">{u.name ?? u.username}</p>
                        {u.username && <p className="text-[12px] text-muted-foreground font-light">@{u.username}</p>}
                      </div>
                      {state === "done" ? (
                        <span className="text-[12px] font-light text-emerald-600">Added</span>
                      ) : (
                        <Button
                          size="sm"
                          disabled={state === "loading"}
                          onClick={() => handleAdd(u)}
                          className="h-7 px-3 rounded-lg bg-emerald-500 text-white text-[12px] font-medium hover:bg-emerald-600 disabled:opacity-50"
                        >
                          {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add"}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {query.trim().length >= 2 && !searchLoading && searchResults.length === 0 && (
              <p className="text-center text-[13px] font-light text-muted-foreground py-2">No users found.</p>
            )}
          </div>
        )}

        {/* Friends list */}
        {friendsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : friends.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Users className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-light">No friends yet</p>
            <p className="text-[13px] font-light text-muted-foreground max-w-[220px] leading-relaxed">
              Search by username or email to add your first friend.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-muted-foreground px-1 pb-1">
              {friends.length} {friends.length === 1 ? "Friend" : "Friends"}
            </p>
            <div className="rounded-2xl border border-black/[0.06] bg-card overflow-hidden">
              {friends.map((friend, i) => (
                <div key={friend.id} className={cn("flex items-center gap-3 px-4 py-3", i > 0 && "border-t border-black/[0.06]")}>
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-emerald-500/15 text-emerald-700 text-[14px] font-medium">
                      {initials(friend.name, friend.username)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-light truncate">{friend.name ?? friend.username}</p>
                    {friend.username && (
                      <p className="text-[13px] text-muted-foreground font-light">@{friend.username}</p>
                    )}
                  </div>

                  {/* Balance placeholder */}
                  <span className="text-[15px] font-thin text-muted-foreground tabular-nums">₹0</span>

                  {/* Remove menu */}
                  <div className="relative">
                    <button
                      onClick={() => setOpenMenuId(openMenuId === friend.id ? null : friend.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-black/[0.04] transition-colors duration-150 text-[16px] leading-none"
                      aria-label="More options"
                    >
                      ···
                    </button>

                    {openMenuId === friend.id && (
                      <div className="absolute right-0 top-8 z-10 min-w-[140px] rounded-xl border border-black/[0.06] bg-white shadow-[0_4px_16px_rgba(0,0,0,0.10)] overflow-hidden">
                        <button
                          onClick={() => handleRemove(friend.id)}
                          disabled={removingId === friend.id}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-[13px] font-light text-rose-500 hover:bg-rose-50 transition-colors duration-150 disabled:opacity-50"
                        >
                          {removingId === friend.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <UserX className="h-3.5 w-3.5" strokeWidth={1.5} />
                          }
                          Remove friend
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dismiss menu on outside click */}
      {openMenuId && (
        <div className="fixed inset-0 z-[5]" onClick={() => setOpenMenuId(null)} />
      )}
    </AppShell>
  );
}
