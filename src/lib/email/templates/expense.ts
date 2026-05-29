function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

type Split = { name: string; amount: number; isRecipient: boolean };

type ExpenseEmailData = {
  type: "created" | "edited" | "deleted";
  actorName: string;
  title: string;
  totalAmount: number;
  date: string;
  groupName: string | null;
  notes: string | null;
  paidByName: string;
  recipientShare: number;
  allSplits: Split[];
  expenseId: string;
  appUrl: string;
};

function eventLabel(type: ExpenseEmailData["type"]): string {
  if (type === "created") return "added";
  if (type === "edited") return "updated";
  return "deleted";
}

export function buildExpenseEmailSubject(data: ExpenseEmailData): string {
  if (data.type === "deleted") {
    return `"${data.title}" was deleted by ${data.actorName}`;
  }
  return `${data.paidByName} ${eventLabel(data.type)} "${data.title}" — your share ₹${formatPaise(data.recipientShare)}`;
}

export function buildExpenseEmailHtml(data: ExpenseEmailData): string {
  const showShare = data.type !== "deleted";
  const showBreakdown = data.type !== "deleted";
  const showCta = data.type !== "deleted";

  const breakdownRows = data.allSplits
    .map((s) => `
      <tr>
        <td style="padding: 8px 0; font-size: 14px; font-weight: 300; color: ${s.isRecipient ? "#111827" : "#374151"};">
          ${escHtml(s.name)}${s.isRecipient ? " <span style=\"font-size:11px;color:#6b7280;\">(you)</span>" : ""}
        </td>
        <td style="padding: 8px 0; font-size: 14px; font-weight: 300; color: #111827; text-align: right; font-variant-numeric: tabular-nums;">
          ₹${formatPaise(s.amount)}
        </td>
      </tr>`)
    .join("");

  const groupRow = data.groupName
    ? `<tr><td style="padding: 4px 0; font-size: 13px; color: #6b7280; font-weight: 300;">Group</td><td style="padding: 4px 0; font-size: 13px; color: #111827; font-weight: 300; text-align: right;">${escHtml(data.groupName)}</td></tr>`
    : "";

  const notesBlock = data.notes
    ? `<div style="margin: 0 24px 20px; padding: 14px 16px; background: #f9fafb; border-radius: 10px; font-size: 13px; font-weight: 300; color: #4b5563; line-height: 1.5;">
        <span style="font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af;">Notes</span><br/>${escHtml(data.notes)}
       </div>`
    : "";

  const shareBlock = showShare
    ? `<div style="text-align: center; padding: 24px 24px 8px;">
        <p style="margin: 0 0 4px; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af;">Your share</p>
        <p style="margin: 0; font-size: 40px; font-weight: 100; color: #10b981; letter-spacing: -0.03em;">₹${formatPaise(data.recipientShare)}</p>
       </div>`
    : "";

  const breakdownBlock = showBreakdown && breakdownRows
    ? `<div style="margin: 16px 24px 8px;">
        <p style="margin: 0 0 8px; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af;">Breakdown</p>
        <table style="width: 100%; border-collapse: collapse;">${breakdownRows}</table>
       </div>`
    : "";

  const ctaBlock = showCta
    ? `<div style="text-align: center; padding: 20px 24px;">
        <a href="${escAttr(data.appUrl)}/expenses/${escAttr(data.expenseId)}" style="display: inline-block; padding: 10px 24px; background: #10b981; color: white; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 400;">
          View expense
        </a>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#10b981;padding:24px;text-align:center;">
          <p style="margin:0;font-size:22px;font-weight:300;color:#ffffff;letter-spacing:-0.02em;">Dutch</p>
        </td></tr>

        <!-- Event title -->
        <tr><td style="padding:24px 24px 16px;">
          <p style="margin:0 0 4px;font-size:13px;font-weight:300;color:#6b7280;">${escHtml(data.actorName)} ${eventLabel(data.type)} an expense</p>
          <p style="margin:0;font-size:22px;font-weight:300;color:#111827;letter-spacing:-0.02em;">${escHtml(data.title)}</p>
        </td></tr>

        <!-- Summary card -->
        <tr><td style="padding:0 24px 16px;">
          <table style="width:100%;background:#f9fafb;border-radius:10px;padding:14px 16px;border-collapse:collapse;">
            <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;font-weight:300;">Paid by</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:300;text-align:right;">${escHtml(data.paidByName)}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;font-weight:300;">Total</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:300;text-align:right;font-variant-numeric:tabular-nums;">₹${formatPaise(data.totalAmount)}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;font-weight:300;">Date</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:300;text-align:right;">${formatDate(data.date)}</td></tr>
            ${groupRow}
          </table>
        </td></tr>

        <!-- Your share -->
        <tr><td>${shareBlock}</td></tr>

        <!-- Breakdown -->
        <tr><td>${breakdownBlock}</td></tr>

        <!-- Notes -->
        <tr><td>${notesBlock}</td></tr>

        <!-- CTA -->
        <tr><td>${ctaBlock}</td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 24px;border-top:1px solid #f3f4f6;text-align:center;">
          <p style="margin:0;font-size:12px;font-weight:300;color:#9ca3af;line-height:1.6;">
            You're receiving this because you're a participant in this expense.<br>
            Manage email preferences in Dutch → Account settings.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escHtml(str: string | null | undefined): string {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escAttr(str: string): string {
  return str.replace(/"/g, "&quot;");
}
