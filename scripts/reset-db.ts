/**
 * Wipes all data from every table. Run with:
 *   npx tsx scripts/reset-db.ts
 *
 * Requires DATABASE_URL in environment (.env.local is loaded automatically).
 */
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("placeholder")) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const sql = neon(url);

  // TRUNCATE with CASCADE in one statement — fastest, respects FK constraints.
  await sql`
    TRUNCATE TABLE
      expense_media,
      expense_comments,
      expense_splits,
      expenses,
      user_categories,
      activity_log,
      settlements,
      group_members,
      groups,
      guest_contacts,
      friendships,
      sessions,
      otp_codes,
      users
    RESTART IDENTITY CASCADE
  `;

  console.log("Database wiped. All tables are empty.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
