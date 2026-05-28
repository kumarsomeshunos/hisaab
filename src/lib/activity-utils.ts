export type ActivityEvent = {
  id: string;
  type: string;
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function describeEvent(event: ActivityEvent, currentUserId: string): string {
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
      const from = (p.fromName as string | undefined) ?? (isActor ? "You" : actor);
      const to = (p.toName as string | undefined) ?? "someone";
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

export function eventHref(event: ActivityEvent): string | null {
  const p = event.payload as Record<string, string | undefined>;
  switch (event.type) {
    case "expense_added":
    case "expense_edited":
    case "expense_deleted":
      return p.expenseId ? `/expenses/${p.expenseId}` : null;
    case "friend_added":
    case "friend_removed":
      return p.friendUsername ? `/friends/${p.friendUsername}` : null;
    case "settlement_recorded":
      if (p.groupId) return `/groups/${p.groupId}`;
      if (p.friendUsername) return `/friends/${p.friendUsername}`;
      if (p.guestId) return `/contacts/${p.guestId}`;
      return null;
    case "group_created":
    case "group_member_added":
      return p.groupId ? `/groups/${p.groupId}` : null;
    default:
      return null;
  }
}

export function relativeTime(iso: string): string {
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
