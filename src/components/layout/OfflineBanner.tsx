"use client";

import { WifiOff, AlertCircle } from "lucide-react";
import { useOnlineStatus } from "@/lib/offline/hooks";
import type { PendingMutation } from "@/lib/offline/db";

type Props = {
  pendingCount: number;
  errors: PendingMutation[];
  onShowErrors: () => void;
};

export function OfflineBanner({ pendingCount, errors, onShowErrors }: Props) {
  const { isOnline, isIOS, hasBackgroundSync } = useOnlineStatus();

  if (isOnline && errors.length === 0) return null;

  return (
    <div className="fixed bottom-16 md:bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] bg-white/90 backdrop-blur-md px-4 py-2.5">
      {!isOnline && (
        <div className="flex items-center gap-2">
          <WifiOff className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={1.5} />
          <p className="text-sm font-light text-gray-700 flex-1">
            You&apos;re offline
            {pendingCount > 0 && (
              <span className="ml-1 font-medium">
                — {pendingCount} change{pendingCount !== 1 ? "s" : ""} pending
              </span>
            )}
          </p>
        </div>
      )}

      {!isOnline && isIOS && !hasBackgroundSync && (
        <p className="mt-0.5 text-xs font-light text-muted-foreground pl-6">
          Changes sync when you reopen the app online
        </p>
      )}

      {errors.length > 0 && (
        <button
          onClick={onShowErrors}
          className="mt-1 flex items-center gap-1.5 text-xs font-medium text-rose-500 pl-6"
        >
          <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />
          {errors.length} sync error{errors.length !== 1 ? "s" : ""} — tap to review
        </button>
      )}
    </div>
  );
}
