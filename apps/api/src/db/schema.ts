import { index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** Codes stay after they are used or replaced, so the per-email request limit can count them. */
export const signInCodes = pgTable(
  "sign_in_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
  },
  (table) => [index("sign_in_codes_email_created_at_idx").on(table.email, table.createdAt)],
);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  /**
   * The hash of the group's invite token, like `sessions.tokenHash`: the token itself is never
   * stored. Null until a member makes a link; making another replaces it.
   */
  inviteTokenHash: text("invite_token_hash").unique(),
});

/** Who belongs to which group. A group's creator is its first member. */
export const groupMembers = pgTable(
  "group_members",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.userId] }),
    index("group_members_user_id_idx").on(table.userId),
  ],
);

/** What one member paid for the group, in whole VND. `payer_id` is a member of the group. */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    // Restrict, not cascade: removing a user must not silently remove what other people paid.
    payerId: uuid("payer_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("expenses_group_id_created_at_idx").on(table.groupId, table.createdAt)],
);

/** What each member of an expense's split owes for it, in whole VND; a share can be 0. */
export const expenseShares = pgTable(
  "expense_shares",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amount: integer("amount").notNull(),
  },
  (table) => [primaryKey({ columns: [table.expenseId, table.userId] })],
);
