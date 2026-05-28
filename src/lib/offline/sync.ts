import {
  getAllMutations,
  markMutationError,
  removeMutation,
} from "./db";

export async function syncQueue(): Promise<void> {
  const mutations = await getAllMutations();
  if (mutations.length === 0) return;

  let anySynced = false;

  for (const mutation of mutations) {
    if (mutation.status === "error") continue;

    try {
      const res = await fetch(mutation.url, {
        method: mutation.method,
        headers: mutation.headers,
        body: mutation.body ?? undefined,
      });

      if (res.ok) {
        await removeMutation(mutation.id);
        anySynced = true;
      } else {
        let message: string;
        try {
          const json = await res.json();
          message = json?.error ?? `HTTP ${res.status}`;
        } catch {
          message = `HTTP ${res.status}`;
        }
        await markMutationError(mutation.id, message);
      }
    } catch {
      // Network failure — stop syncing, try again later
      break;
    }
  }

  if (anySynced) {
    window.dispatchEvent(new CustomEvent("dutch-data-refresh"));
  }
}

export async function registerBackgroundSync(): Promise<void> {
  if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register("dutch-sync");
  } catch {
    // Background Sync not available — online event fallback is sufficient
  }
}
