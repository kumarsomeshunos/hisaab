"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { enqueueMutation, getAllMutations, clearErrors, type PendingMutation } from "./db";
import { syncQueue, registerBackgroundSync } from "./sync";

// ---------------------------------------------------------------------------
// useOnlineStatus
// ---------------------------------------------------------------------------

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  const hasBackgroundSync =
    typeof window !== "undefined" && "SyncManager" in window;

  return { isOnline, isIOS, hasBackgroundSync };
}

// ---------------------------------------------------------------------------
// useOfflineMutate
// ---------------------------------------------------------------------------

type MutateOpts = {
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: object;
  label: string;
};

type MutateResult =
  | { queued: true }
  | { queued: false; response: Response };

export function useOfflineMutate() {
  const { isOnline } = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(async () => {
    const all = await getAllMutations();
    setPendingCount(all.filter((m) => m.status === "pending").length);
  }, []);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  const mutate = useCallback(
    async (opts: MutateOpts): Promise<MutateResult> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const body = opts.body !== undefined ? JSON.stringify(opts.body) : null;

      if (isOnline) {
        const response = await fetch(opts.url, {
          method: opts.method,
          headers,
          body: body ?? undefined,
        });
        return { queued: false, response };
      }

      // Offline — enqueue
      const id = crypto.randomUUID();
      await enqueueMutation({
        id,
        url: opts.url,
        method: opts.method,
        body,
        headers,
        label: opts.label,
        timestamp: Date.now(),
      });

      await registerBackgroundSync();
      await refreshCount();

      return { queued: true };
    },
    [isOnline, refreshCount]
  );

  return { mutate, isOnline, pendingCount };
}

// ---------------------------------------------------------------------------
// useSyncManager  (mount once in AppShell)
// ---------------------------------------------------------------------------

export function useSyncManager() {
  const [pendingCount, setPendingCount] = useState(0);
  const [errors, setErrors] = useState<PendingMutation[]>([]);
  const syncingRef = useRef(false);

  const refreshState = useCallback(async () => {
    const all = await getAllMutations();
    setPendingCount(all.filter((m) => m.status === "pending").length);
    setErrors(all.filter((m) => m.status === "error"));
  }, []);

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      await syncQueue();
      await refreshState();
    } finally {
      syncingRef.current = false;
    }
  }, [refreshState]);

  const dismissErrors = useCallback(async () => {
    await clearErrors();
    await refreshState();
  }, [refreshState]);

  useEffect(() => {
    refreshState();

    // Sync on reconnect
    const handleOnline = () => runSync();
    window.addEventListener("online", handleOnline);

    // Sync on app load if already online
    if (navigator.onLine) runSync();

    // Listen for Background Sync postMessage from SW
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "sync-requested") runSync();
    };
    navigator.serviceWorker?.addEventListener("message", handleMessage);

    // Refresh counts when any mutation completes
    const handleRefresh = () => refreshState();
    window.addEventListener("dutch-data-refresh", handleRefresh);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("dutch-data-refresh", handleRefresh);
      navigator.serviceWorker?.removeEventListener("message", handleMessage);
    };
  }, [runSync, refreshState]);

  return { pendingCount, errors, dismissErrors };
}
