import { openDB, type DBSchema } from "idb";

interface DutchOfflineDB extends DBSchema {
  mutations: {
    key: string;
    value: PendingMutation;
    indexes: { "by-timestamp": number };
  };
}

export type PendingMutation = {
  id: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body: string | null;
  headers: Record<string, string>;
  label: string;
  timestamp: number;
  status: "pending" | "error";
  errorMessage?: string;
};

const DB_NAME = "dutch-offline";
const DB_VERSION = 1;

let dbPromise: ReturnType<typeof openDB<DutchOfflineDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<DutchOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore("mutations", { keyPath: "id" });
        store.createIndex("by-timestamp", "timestamp");
      },
    });
  }
  return dbPromise;
}

export async function enqueueMutation(
  mutation: Omit<PendingMutation, "status">
): Promise<void> {
  const db = await getDb();
  await db.put("mutations", { ...mutation, status: "pending" });
}

export async function getAllMutations(): Promise<PendingMutation[]> {
  const db = await getDb();
  return db.getAllFromIndex("mutations", "by-timestamp");
}

export async function markMutationError(
  id: string,
  errorMessage: string
): Promise<void> {
  const db = await getDb();
  const existing = await db.get("mutations", id);
  if (existing) {
    await db.put("mutations", { ...existing, status: "error", errorMessage });
  }
}

export async function removeMutation(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("mutations", id);
}

export async function clearErrors(): Promise<void> {
  const db = await getDb();
  const all = await db.getAll("mutations");
  const errorIds = all.filter((m) => m.status === "error").map((m) => m.id);
  if (errorIds.length === 0) return;
  const tx = db.transaction("mutations", "readwrite");
  await Promise.all(errorIds.map((id) => tx.store.delete(id)));
  await tx.done;
}
