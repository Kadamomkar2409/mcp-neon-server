import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Users Table
 * Stores identity information for registered users and MCP consumers.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_created_at_idx").on(table.createdAt),
  ]
);

/**
 * Records Table
 * User-owned records managed via MCP tools.
 */
export const records = pgTable(
  "records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("records_user_id_idx").on(table.userId),
    index("records_created_at_idx").on(table.createdAt),
    index("records_title_idx").on(table.title),
  ]
);

/**
 * Audit Logs Table
 * Tracks all MCP tool invocations, actions, statuses, and associated metadata.
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    toolName: varchar("tool_name", { length: 100 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_user_id_idx").on(table.userId),
    index("audit_logs_tool_name_idx").on(table.toolName),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  records: many(records),
  auditLogs: many(auditLogs),
}));

export const recordsRelations = relations(records, ({ one }) => ({
  user: one(users, {
    fields: [records.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

// Type Definitions
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type RecordItem = typeof records.$inferSelect;
export type NewRecordItem = typeof records.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

