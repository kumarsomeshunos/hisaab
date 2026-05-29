import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, expenseSplits, users, guestContacts, groups } from "@/lib/db/schema";
import { buildExpenseEmailHtml, buildExpenseEmailSubject } from "./templates/expense";

export async function notifyExpenseParticipants(params: {
  type: "created" | "edited" | "deleted";
  expenseId: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  try {
    const { type, expenseId, actorName } = params;

    // 1. Fetch expense
    const [expense] = await db
      .select({
        id: expenses.id,
        title: expenses.title,
        amount: expenses.amount,
        date: expenses.date,
        notes: expenses.notes,
        groupId: expenses.groupId,
        paidById: expenses.paidById,
        paidByGuestId: expenses.paidByGuestId,
      })
      .from(expenses)
      .where(eq(expenses.id, expenseId));

    if (!expense) return;

    // 2. Fetch splits with participant info
    const userSplitRows = await db
      .select({
        userId: expenseSplits.userId,
        amount: expenseSplits.amount,
        name: users.name,
        username: users.username,
        email: users.email,
        notificationEmails: users.notificationEmails,
      })
      .from(expenseSplits)
      .innerJoin(users, eq(expenseSplits.userId, users.id))
      .where(eq(expenseSplits.expenseId, expenseId));

    const guestSplitRows = await db
      .select({
        guestId: expenseSplits.guestId,
        amount: expenseSplits.amount,
        name: guestContacts.name,
        email: guestContacts.email,
      })
      .from(expenseSplits)
      .innerJoin(guestContacts, eq(expenseSplits.guestId, guestContacts.id))
      .where(eq(expenseSplits.expenseId, expenseId));

    // 3. Resolve payer name
    let paidByName = "Someone";
    if (expense.paidById) {
      const payer = userSplitRows.find((r) => r.userId === expense.paidById);
      paidByName = payer?.name ?? payer?.username ?? "Someone";
    } else if (expense.paidByGuestId) {
      const payer = guestSplitRows.find((r) => r.guestId === expense.paidByGuestId);
      paidByName = payer?.name ?? "Someone";
    }

    // 4. Resolve group name
    let groupName: string | null = null;
    if (expense.groupId) {
      const [grp] = await db.select({ name: groups.name }).from(groups).where(eq(groups.id, expense.groupId));
      groupName = grp?.name ?? null;
    }

    // 5. Build all-splits list for the breakdown
    const allSplits = [
      ...userSplitRows.map((r) => ({ id: `user:${r.userId}`, name: r.name ?? r.username ?? "Unknown", amount: r.amount })),
      ...guestSplitRows.map((r) => ({ id: `guest:${r.guestId}`, name: r.name, amount: r.amount })),
    ];

    // 6. Build recipient list — app users with notificationEmails=true + guests with email
    type Recipient = { email: string; name: string; participantId: string; share: number };
    const recipients: Recipient[] = [];
    const seenEmails = new Set<string>();

    for (const row of userSplitRows) {
      if (!row.notificationEmails) continue;
      const email = row.email.toLowerCase();
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      recipients.push({
        email,
        name: row.name ?? row.username ?? "there",
        participantId: `user:${row.userId}`,
        share: row.amount,
      });
    }

    for (const row of guestSplitRows) {
      if (!row.email) continue;
      const email = row.email.toLowerCase();
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);
      recipients.push({
        email,
        name: row.name,
        participantId: `guest:${row.guestId}`,
        share: row.amount,
      });
    }

    if (recipients.length === 0) return;

    // 7. Send via Resend batch
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.FROM_EMAIL ?? "Dutch <noreply@dutch.app>";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000";

    const dateStr = expense.date instanceof Date
      ? expense.date.toISOString()
      : String(expense.date);

    const batch = recipients.map((r) => {
      const data = {
        type,
        actorName,
        title: expense.title,
        totalAmount: expense.amount,
        date: dateStr,
        groupName,
        notes: expense.notes ?? null,
        paidByName,
        recipientShare: r.share,
        allSplits: allSplits.map((s) => ({ ...s, isRecipient: s.id === r.participantId })),
        expenseId,
        appUrl,
      };
      return {
        from,
        to: r.email,
        subject: buildExpenseEmailSubject(data),
        html: buildExpenseEmailHtml(data),
      };
    });

    if (process.env.RESEND_API_KEY) {
      await resend.batch.send(batch);
    } else {
      // Dev fallback: log to console
      for (const msg of batch) {
        console.log(`[DEV] Email to ${msg.to}: ${msg.subject}`);
      }
    }
  } catch {
    // Never block the primary operation
  }
}
