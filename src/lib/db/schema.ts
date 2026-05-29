import { pgTable, uuid, text, varchar, boolean, timestamp, integer, primaryKey, check, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique().notNull(),
  name: text("name"),
  username: text("username").unique(),
  avatarUrl: text("avatar_url"),
  upiId: text("upi_id"),
  phone: text("phone"),
  isOnboarded: boolean("is_onboarded").default(false).notNull(),
  notificationEmails: boolean("notification_emails").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const otpCodes = pgTable("otp_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
});

export const friendships = pgTable(
  "friendships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.friendId] }),
    check("no_self_friendship", sql`${t.userId} != ${t.friendId}`),
  ]
);

// People who don't have a Dutch account, added by an app user
export const guestContacts = pgTable("guest_contacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  upiId: text("upi_id"),
  email: text("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  emoji: varchar("emoji", { length: 10 }),
  description: text("description"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "restrict" }),
    guestId: uuid("guest_id")
      .references(() => guestContacts.id, { onDelete: "restrict" }),
    addedById: uuid("added_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("group_member_exactly_one", sql`num_nulls(${t.userId}, ${t.guestId}) = 1`),
  ]
);

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    groupId: uuid("group_id")
      .references(() => groups.id, { onDelete: "cascade" }),
    fromUserId: uuid("from_user_id").references(() => users.id, { onDelete: "restrict" }),
    fromGuestId: uuid("from_guest_id").references(() => guestContacts.id, { onDelete: "restrict" }),
    toUserId: uuid("to_user_id").references(() => users.id, { onDelete: "restrict" }),
    toGuestId: uuid("to_guest_id").references(() => guestContacts.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    note: text("note"),
    recordedById: uuid("recorded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("settlement_from_one", sql`num_nulls(${t.fromUserId}, ${t.fromGuestId}) = 1`),
    check("settlement_to_one", sql`num_nulls(${t.toUserId}, ${t.toGuestId}) = 1`),
  ]
);

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  groupId: uuid("group_id")
    .references(() => groups.id, { onDelete: "cascade" }),
  payload: jsonb("payload").notNull(),
  visibleToUserIds: text("visible_to_user_ids").array().notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userCategories = pgTable("user_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    title: text("title").notNull().default("Untitled"),
    notes: text("notes"),
    amount: integer("amount").notNull(),
    splitMode: text("split_mode").notNull().default("equal"),
    category: text("category"),
    groupId: uuid("group_id")
      .references(() => groups.id, { onDelete: "restrict" }),
    // Exactly one of paidById / paidByGuestId must be non-null (enforced by check constraint)
    paidById: uuid("paid_by_id")
      .references(() => users.id, { onDelete: "restrict" }),
    paidByGuestId: uuid("paid_by_guest_id")
      .references(() => guestContacts.id, { onDelete: "restrict" }),
    createdById: uuid("created_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    date: timestamp("date", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("expense_exactly_one_payer", sql`num_nulls(${t.paidById}, ${t.paidByGuestId}) = 1`),
  ]
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    // Exactly one of userId / guestId must be non-null (enforced by check constraint)
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "restrict" }),
    guestId: uuid("guest_id")
      .references(() => guestContacts.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    rawValue: text("raw_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check("split_exactly_one_participant", sql`num_nulls(${t.userId}, ${t.guestId}) = 1`),
  ]
);

export const expenseComments = pgTable("expense_comments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const expenseMedia = pgTable("expense_media", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id, { onDelete: "cascade" }),
  uploadedById: uuid("uploaded_by_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  key: text("key").notNull().unique(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type OtpCode = typeof otpCodes.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type GuestContact = typeof guestContacts.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type GroupMember = typeof groupMembers.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type UserCategory = typeof userCategories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseSplit = typeof expenseSplits.$inferSelect;
export type ExpenseComment = typeof expenseComments.$inferSelect;
export type ExpenseMedia = typeof expenseMedia.$inferSelect;
