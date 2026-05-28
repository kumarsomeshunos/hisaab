import { db } from "@/lib/db";
import { activityLog } from "@/lib/db/schema";

export async function writeActivity(params: {
  type: string;
  actorId: string;
  groupId?: string | null;
  payload: Record<string, unknown>;
  visibleToUserIds: string[];
}): Promise<void> {
  try {
    await db.insert(activityLog).values({
      type: params.type,
      actorId: params.actorId,
      groupId: params.groupId ?? null,
      payload: params.payload,
      visibleToUserIds: params.visibleToUserIds,
    });
  } catch {
    // Activity write failure must never block the primary operation
  }
}
