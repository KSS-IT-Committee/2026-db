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
  "1A",
  "1B",
  "1C",
  "1D",
  "2A",
  "2B",
  "2C",
  "2D",
  "3A",
  "3B",
  "3C",
  "3D",
  "4A",
  "4B",
  "4C",
  "4D",
  "5A",
  "5B",
  "5C",
  "5D",
  "6A",
  "6B",
  "6C",
  "6D",
] as const;

export const ROLENAMES = [
  // Committee roles — granted by hand (SQL UPDATE) to individual accounts.
  "IT",
  "Sousakuten",
  "Taiikusai",
  // Population roles — every roster account carries them via
  // 2026-account-generator's users.sql: students get G<grade> + Class<letter>
  // + Students, staff accounts get Teachers. AuthGuard/Internal gate on these
  // instead of username patterns. Append-only: Postgres enums cannot drop or
  // reorder values, so new roles go at the end.
  "G1",
  "G2",
  "G3",
  "G4",
  "G5",
  "G6",
  "ClassA",
  "ClassB",
  "ClassC",
  "ClassD",
  "Students",
  "Teachers",
  "SousakutenMain",
] as const;

// Who a lottery entry applies for: the student themselves, or their
// parents/guardians (who log in with the student's account).
export const LOTTERY_APPLICANT_TYPES = ["student", "parent"] as const;

export const classEnum = pgEnum("class_name", CLASSNAMES);
export const roleEnum = pgEnum("role", ROLENAMES);
export const lotteryApplicantTypeEnum = pgEnum(
  "lottery_applicant_type",
  LOTTERY_APPLICANT_TYPES,
);

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
  roles: roleEnum("roles")
    .array()
    .notNull()
    .default(sql`'{}'`),
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

/* ─────────────── viewing lottery (event-week-top) ─────────────── */

// 公演観覧抽選 希望DB — one row per (lottery, slot, account, applicant type):
// the ranked act preferences one applicant submitted for one performance
// slot. Lottery definitions (slots, acts, eligibility, windows) are app-side
// config in 2026-event-week-top's lib/lotteries.ts, not rows here — adding a
// future lottery only introduces new `lottery_id` values, no schema change.
export const lotteryEntries = pgTable(
  "lottery_entries",
  {
    id: serial("id").primaryKey(),
    lotteryId: varchar("lottery_id", { length: 64 }).notNull(),
    slotId: varchar("slot_id", { length: 64 }).notNull(),
    // Parents apply through their child's student account, so this is the
    // child's username for `parent` entries too.
    username: varchar("username", { length: 32 })
      .notNull()
      .references(() => users.username, { onDelete: "cascade" }),
    applicantType: lotteryApplicantTypeEnum("applicant_type").notNull(),
    // Ranked choices among the lottery's act ids (class codes today). The app
    // validates them against its lottery definition before writing.
    firstChoice: varchar("first_choice", { length: 64 }).notNull(),
    secondChoice: varchar("second_choice", { length: 64 }),
    thirdChoice: varchar("third_choice", { length: 64 }),
    // 観覧人数 — seats this entry claims if drawn (保護者 entries may bring
    // up to 2 people; 本人 entries are always 1). The exact per-applicant
    // maximum is app policy; the DB only sanity-checks positivity.
    partySize: integer("party_size").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One submission per slot per account per applicant type; resubmitting
    // replaces it. Doubles as the draw-time (lottery, slot) scan index.
    unique("lottery_entries_slot_applicant_unique").on(
      table.lotteryId,
      table.slotId,
      table.username,
      table.applicantType,
    ),
    index("lottery_entries_username_idx").on(table.username),
    check("party_size_positive", sql`${table.partySize} >= 1`),
    // Ranks fill top-down: no third choice without a second.
    check(
      "choice_ranks_fill_top_down",
      sql`${table.thirdChoice} IS NULL OR ${table.secondChoice} IS NOT NULL`,
    ),
    // A slot's choices never repeat an act.
    check(
      "choices_are_distinct",
      sql`${table.secondChoice} IS DISTINCT FROM ${table.firstChoice} AND ${table.thirdChoice} IS DISTINCT FROM ${table.firstChoice} AND (${table.thirdChoice} IS NULL OR ${table.secondChoice} IS NULL OR ${table.thirdChoice} <> ${table.secondChoice})`,
    ),
  ],
);

// 公演観覧抽選 当選DB — one row per seat awarded to a school account: the
// slot the applicant watches and which act they got. Written in bulk by the
// draw (2026-lottery emits the INSERTs; nothing in the apps writes here), and
// read by event-week-top's /lottery/results page.
//
// A missing row is a loss, not an error: pair it with `lottery_entries` to
// tell "applied and lost" from "never applied". External (non-school)
// applicants are deliberately absent — they have no `users` row to reference
// and are told their result through the form provider; a later additive
// table can cover them without touching this one.
export const lotteryResults = pgTable(
  "lottery_results",
  {
    id: serial("id").primaryKey(),
    lotteryId: varchar("lottery_id", { length: 64 }).notNull(),
    slotId: varchar("slot_id", { length: 64 }).notNull(),
    // Parents watch on their child's account, exactly as in lottery_entries.
    //
    // Deliberately NOT a foreign key to `users`, unlike lottery_entries: no
    // app ever writes this table — the draw (2026-lottery) emits the INSERTs
    // out of band, the same way 2026-account-generator's users.sql is loaded
    // — and every username in it is copied from an already-FK-checked
    // lottery_entries row. A key here would only break the schema-only PR
    // preview clones, whose `users` table is empty, in exchange for
    // protection the loader already provides. An orphan row is inert: the
    // page reads results by session username, so a row nobody can log in as
    // is simply never shown. The generated SQL reports orphans as a NOTICE
    // after loading, which is what the constraint was really for.
    username: varchar("username", { length: 32 }).notNull(),
    applicantType: lotteryApplicantTypeEnum("applicant_type").notNull(),
    // The act won — a class code for sousaku, a performance id for kaitaku.
    actId: varchar("act_id", { length: 64 }).notNull(),
    // 観覧人数 admitted by this seat; copied from the winning entry.
    partySize: integer("party_size").notNull().default(1),
    // Which ranked choice won (1 = 第1希望). Lets the page show 第2希望 etc.
    choiceRank: integer("choice_rank").notNull(),
    // True for a 保護者 seat granted by the child's-class guarantee rather
    // than by the draw proper.
    isPriority: boolean("is_priority").notNull().default(false),
    drawnAt: timestamp("drawn_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // One seat per slot per account per applicant type — nobody can be in two
    // rooms at the same time, and re-running the draw overwrites in place.
    unique("lottery_results_slot_applicant_unique").on(
      table.lotteryId,
      table.slotId,
      table.username,
      table.applicantType,
    ),
    index("lottery_results_username_idx").on(table.username),
    index("lottery_results_lottery_slot_idx").on(table.lotteryId, table.slotId),
    check("result_party_size_positive", sql`${table.partySize} >= 1`),
    check("result_choice_rank_range", sql`${table.choiceRank} BETWEEN 1 AND 3`),
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
    deleted: boolean("deleted").notNull().default(false),
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
    // This is awful actually to have equipmentId and equipmentIdentifier both,
    // it really doesn't make sense.
    // To make some comment here, equipmentIdentifier is used for identifying
    // which specific equipment was borrowed, while equipmentId is representing
    // the type of equipment. For example, if there are 10 microphones, they
    // will all have the same equipmentId, but each microphone will have a unique
    // equipmentIdentifier(and they are continuous integers).
    equipmentIdentifier: integer("equipment_identifier"),
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
