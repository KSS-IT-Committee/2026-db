import { relations, sql } from "drizzle-orm";
import {
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
 * This file is the SINGLE source of truth for every table in `appdata`. It is
 * the union of what the three apps used to each define for themselves:
 *
 *   - 2026-event-week-top              -> users
 *   - 2026-sousakuten-equipment-management
 *   - 2026-sousakuten-info             -> deductions, announcements,
 *                                         announcement_classes, equipments,
 *                                         borrowings, class_name enum
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

/* ───────────────────────── event-week-top ───────────────────────── */

// Login credentials for the event-week-top app.
export const users = pgTable("users", {
  username: varchar("username", { length: 8 }).primaryKey(),
  passwordHash: varchar("password_hash", { length: 60 }).notNull(),
});

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
    class: integer("class").notNull(),
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
