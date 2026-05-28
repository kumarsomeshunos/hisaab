"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Receipt, UserPlus, UserMinus, Users, Loader2, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityEvent = {
  id: string;
  type: string;
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

function EventIcon({ type }: { type: string }) {
  const cls = "h-4 w-4";
  if (type === "expense_added" || type === "expense_deleted")
    return <Receipt className={cls} strokeWidth={1.5} />;
  if (type === "friend_added")
    return <UserPlus className={cls} strokeWidth={1.5} />;
  if (type === "friend_removed")
    return <UserMinus className={cls} strokeWidth={1.5} />;
  if (type === "settlement_recorded")
    return <Handshake className={cls} strokeWidth={1.5} />;
  return <Users className={cls} strokeWidth={1.5} />;
}

function eventBgColor(type: string): string {
  if (type === "expense_added") return "bg-emerald-500/15";
  if (type === "expense_deleted") return "bg-rose-100";
  if (type === "friend_added") return "bg-blue-100";
  if (type === "friend_removed") return "bg-zinc-100";
  if (type === "settlement_recorded") return "bg-amber-100";
  return "bg-muted";
}

function eventIconColor(type: string): string {
  if (type === "expense_added") return "text-emerald-700";
  if (type === "expense_deleted") return "text-rose-500";
  if (type === "friend_added") return "text-blue-600";
  if (type === "friend_removed") return "text-zinc-500";
  if (type === "settlement_recorded") return "text-amber-700";
  return "text-muted-foreground";
}

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function describeEvent(event: ActivityEvent, currentUserId: string): string {
  const p = event.payload;
  const isActor = event.actorId === currentUserId;
  const actor = isActor ? "You" : ((p.actorName as string | undefined) ?? "Someone");

  switch (event.type) {
    case "expense_added": {
      const desc = (p.title ?? p.description) as string;
      const amount = p.amount as number;
      const groupName = p.groupName as string | undefined;
      return `${actor} added "${desc}" ₹${formatPaise(amount)}${groupName ? ` in ${groupName}` : ""}`;
    }
    case "expense_deleted": {
      const desc = (p.title ?? p.description) as string;
      return `${actor} deleted "${desc}"`;
    }
    case "friend_added": {
      if (isActor) return `You added ${(p.friendName ?? p.friendUsername ?? "someone") as string} as a friend`;
      return `${actor} added you as a friend`;
    }
    case "friend_removed": {
      if (isActor) return `You removed ${(p.friendName ?? p.friendUsername ?? "someone") as string}`;
      return `${actor} removed you`;
    }
    case "settlement_recorded": {
      const from = p.fromName as string;
      const to = p.toName as string;
      const amount = p.amount as number;
      const groupName = p.groupName as string | undefined;
      return `${from} paid ${to} ₹${formatPaise(amount)}${groupName ? ` (${groupName})` : ""}`;
    }
    case "group_created": {
      const name = p.groupName as string;
      return `${actor} created group "${name}"`;
    }
    case "group_member_added": {
      const member = p.memberName as string;
      const group = p.groupName as string;
      return `${actor} added ${member} to ${group}`;
    }
    default:
      return event.type.replace(/_/g, " ");
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function ActivityPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setCurrentUserId(d.user?.id ?? null)).catch(() => {});
  }, []);

  const fetchActivity = useCallback(async (cursor?: string) => {
    const url = cursor ? `/api/activity?cursor=${encodeURIComponent(cursor)}` : "/api/activity";
    const res = await fetch(url);
    const data = await res.json();
    return { events: (data.events ?? []) as ActivityEvent[], nextCursor: data.nextCursor as string | null };
  }, []);

  useEffect(() => {
    fetchActivity().then(({ events, nextCursor }) => {
      setEvents(events);
      setNextCursor(nextCursor);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [fetchActivity]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { events: more, nextCursor: nc } = await fetchActivity(nextCursor);
      setEvents((prev) => [...prev, ...more]);
      setNextCursor(nc);
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, fetchActivity]);

  return (
    <AppShell>
      <header className="sticky top-0 z-40 glass border-b border-black/[0.06]">
        <div className="flex h-14 items-center px-5 md:px-6">
          <h1 className="text-[17px] font-light tracking-[-0.02em] md:hidden">Activity</h1>
          <h1 className="hidden md:block text-[15px] font-medium tracking-[-0.01em]">Activity</h1>
        </div>
      </header>

      <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Receipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="text-[15px] font-light">Nothing yet</p>
            <p className="text-[13px] font-light text-muted-foreground mt-1">Activity will appear here as you add expenses and friends.</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-card border border-black/[0.06] overflow-hidden">
            {events.map((event, i) => (
              <div key={event.id} className={cn("flex items-start gap-3 px-4 py-3.5", i > 0 && "border-t border-black/[0.06]")}>
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full mt-0.5", eventBgColor(event.type))}>
                  <span className={eventIconColor(event.type)}>
                    <EventIcon type={event.type} />
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-light leading-snug">
                    {currentUserId ? describeEvent(event, currentUserId) : "…"}
                  </p>
                  <p className="text-[12px] font-light text-muted-foreground mt-0.5">{relativeTime(event.createdAt)}</p>
                </div>
              </div>
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
      </div>
    </AppShell>
  );
}
