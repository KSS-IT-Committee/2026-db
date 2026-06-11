import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Canonical, app-neutral schema for the shared `appdata` Postgres database.
 *
 * This file is the SINGLE source of truth for every table in `appdata`,
 * which all four Next.js apps share:
 *
 *   - 2026-event-week-top              -> users, sessions (sessions are
 *                                         validated + renewed by ALL apps;
 *                                         only event-week-top creates them)
 *   - 2026-sousakuten-equipment-management
 *   - 2026-sousakuten-info             -> deductions, announcements,
 *                                         announcement_classes, equipments,
 *                                         borrowings, class_name enum
 *   - 2026-taiikusai-top               -> users, sessions (login only)
 *
 * equipment-management and sousakuten-info defined an IDENTICAL set of tables;
 * here they collapse onto the same tables on purpose — that shared set is the
 * real-time data both apps read and write.
 *
 * Only this repo runs `drizzle-kit migrate` against production. The apps keep
 * their own copy of (the parts of) this schema they query, but never migrate.
 */

// 学年+組. Must stay identical to each consuming app's copy:
// equipment-management hardcodes this inline; sousakuten-info exports it from
// lib/classes.ts. Both are 1A..6D today — keep them in lockstep with this list.
export const CLASSNAMES = [
  "1A", "1B", "1C", "1D",
  "2A", "2B", "2C", "2D",
  "3A", "3B", "3C", "3D",
  "4A", "4B", "4C", "4D",
  "5A", "5B", "5C", "5D",
  "6A", "6B", "6C", "6D",
] as const;

export const classEnum = pgEnum("class_name", CLASSNAMES);

/* ───────────────────────── shared login ───────────────────────── */

// Login credentials, loaded out-of-band from 2026-account-generator's
// users.sql. event-week-top hosts the /login page; every app reads this
// table indirectly through `sessions`.
export const users = pgTable("users", {
  // Students are 4 chars (`1A01`); the wider cap is headroom for non-student
  // (teacher / committee / admin) logins. varchar length is free in Postgres.
  username: varchar("username", { length: 32 }).primaryKey(),
  passwordHash: varchar("password_hash", { length: 60 }).notNull(),
  // Latches true on the account's first successful login and never goes back
  // to false. Lets us tell which accounts have ever been used (e.g. to find
  // students who never picked up / activated their card).
  hasLoggedIn: boolean("has_logged_in").notNull().default(false),
});

// Login sessions, shared by every *.2026 app. The browser cookie holds a
// random token; `id` is the SHA-256 hex of that token, so a leaked table
// dump cannot be replayed as a cookie. Expiry slides on access: apps renew
// `expires_at` to now + TTL (default 2 days) when they validate a session.
export const sessions = pgTable(
  "sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    username: varchar("username", { length: 32 })
      .notNull()
      .references(() => users.username, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("sessions_username_idx").on(table.username),
    index("sessions_expires_at_idx").on(table.expiresAt),
    // Belt-and-braces: `id` must be a lowercase SHA-256 hex digest (what the
    // apps store). Rejects a raw token accidentally inserted as the id, which
    // would otherwise be a replayable cookie value.
    check("session_id_is_sha256_hex", sql`${table.id} ~ '^[0-9a-f]{64}$'`),
  ],
);

/* ───────── shared by equipment-management + sousakuten-info ───────── */

// 減点クラスDB — per-class deductions.
export const deductions = pgTable("deductions", {
  id: serial("id").primaryKey(),
  className: classEnum("class_name").notNull(),
  content: text("content").notNull(),
  points: integer("points").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 伝達内容DB — announcement bodies.
export const announcements = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 伝達クラスDB — junction linking announcements to the classes they target.
export const announcementClasses = pgTable(
  "announcement_classes",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => announcements.id, { onDelete: "cascade" }),
    className: classEnum("class_name").notNull(),
  },
  (table) => [unique().on(table.announcementId, table.className)],
);

// 備品DB
export const Equipments = pgTable(
  "equipments",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    picture: text("picture"),
  },
  (table) => [check("quantity_positive", sql`${table.quantity} > 0`)],
);

// 備品貸出DB
export const Borrowings = pgTable(
  "borrowings",
  {
    id: serial("id").primaryKey(),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => Equipments.id),
    class: classEnum("class").notNull(),
    borrowedAt: timestamp("borrowed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
  },
  (table) => [
    index("equipment_idx").on(table.equipmentId),
    index("class_idx").on(table.class),
    check(
      "returned_at_after_borrowed_at",
      sql`${table.returnedAt} IS NULL OR ${table.returnedAt} >= ${table.borrowedAt}`,
    ),
  ],
);

export const announcementsRelations = relations(announcements, ({ many }) => ({
  classes: many(announcementClasses),
}));

export const announcementClassesRelations = relations(
  announcementClasses,
  ({ one }) => ({
    announcement: one(announcements, {
      fields: [announcementClasses.announcementId],
      references: [announcements.id],
    }),
  }),
);
