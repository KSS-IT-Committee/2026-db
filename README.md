# 2026-db

Canonical schema + migration owner for the shared **`appdata`** Postgres database.

This repo is the **single source of truth** for the schema of the one database
that all four 2026 apps share:

- `2026-event-week-top` — hosts `/login`; owns `users` + `sessions`
- `2026-sousakuten-equipment-management`
- `2026-sousakuten-info`
- `2026-taiikusai-top` — `users` + `sessions` (shared login only)

It is the **only** thing that ever runs `drizzle-kit migrate` against
production. The apps connect to `appdata` and read/write it, but no longer
migrate it themselves.

## Why this exists

All three apps point at the same database (`db: appdata` in the ansible
`group_vars`) so they can share data in real time. Previously each app ran
`drizzle-kit migrate` on boot against `appdata`, which is broken two ways:

1. **One shared migration-tracking table, three independent journals.** Drizzle
   tracks applied migrations in a single `drizzle.__drizzle_migrations` table
   using a global timestamp high-water-mark. With three repos' journals
   interleaving, whichever app booted with the newest-timestamped migration
   locked the others out — their tables were silently never created
   (`relation "..." does not exist`).
2. **Identical tables created twice.** equipment-management and sousakuten-info
   define the *same* tables (`deductions`, `announcements`,
   `announcement_classes`, `equipments`, `borrowings`, the `class_name` enum).
   Two `CREATE TABLE` of the same name in the same schema collide
   (`relation "..." already exists`).

Collapsing schema ownership into this one repo fixes both: **one journal** makes
the high-water-mark behave, and **one set of `CREATE`s** removes the collision.

## Layout

| Path | What |
|---|---|
| `db/schema.ts` | The unified schema — union of all four apps' tables. Source of truth. |
| `drizzle/` | Generated migrations + journal. The only journal that touches `appdata`. |
| `drizzle.config.ts` | Drizzle config; reads `DATABASE_URL` from the environment. |
| `Dockerfile` | Builds the one-shot **migrator image**. |

## Working on the schema

```bash
npm install
# edit db/schema.ts, then:
DATABASE_URL=postgres://placeholder npx drizzle-kit generate   # writes drizzle/NNNN_*.sql
```

`generate` evaluates the config's credential getter, so it needs `DATABASE_URL`
set even though it never connects — any placeholder works. Commit the generated
SQL + `drizzle/meta/` files; they are the source of truth.

**Schema-change rules (because the apps run side-by-side, blue/green):** keep
changes **additive** — add a table, add a nullable column, add an index. Renames,
drops, and type changes must be done in multiple steps (deploy compatible app
code first, change the column in a later step). See the per-app docs for detail.

## Running migrations

The migrator picks its target database from `DATABASE_URL` at run time, so the
same image migrates `appdata` or any per-PR clone. It is **idempotent** — it
applies pending migrations and no-ops when the journal is fully applied, so it
is safe to re-run.

The migrator **must** run as a container on the `web` Docker network: the
Postgres container publishes no host port (internal-only), so it is reachable
only by the hostname `postgres:5432` from inside that network — you can't run
`drizzle-kit migrate` straight from the VPS host.

### On the VPS — no CI, no registry (interim)

You do not need CI or a pushed image. Pick either:

**a) Build the image locally on the VPS** (mirrors how `image_repo`-less apps
already build):

```bash
git clone https://github.com/KSS-IT-Committee/2026-db.git /opt/2026-db   # or: git -C /opt/2026-db pull
cd /opt/2026-db
docker build -t 2026-db-migrator:local .

source /var/lib/server/state/postgres.env
docker run --rm --network web \
  -e DATABASE_URL="$APPDATA_DATABASE_URL" \
  2026-db-migrator:local
```

**b) No image build at all** — run `drizzle-kit migrate` in a stock Node
container with the checkout mounted:

```bash
source /var/lib/server/state/postgres.env
docker run --rm --network web \
  -v /opt/2026-db:/app -w /app \
  -e DATABASE_URL="$APPDATA_DATABASE_URL" \
  node:20-alpine sh -c "npm ci --no-audit --no-fund && npx drizzle-kit migrate --config=drizzle.config.ts"
```

### On the VPS — once CI publishes the image (later)

**Always pass `--pull always`.** CI rebuilds `:latest` on every merge to `main`,
but `docker run` reuses whatever `:latest` it pulled the first time — so without
this flag you silently re-run a stale migrator and a freshly-merged migration
looks like it "didn't apply" (the run still prints `migrations applied
successfully`, because to that old image there was nothing new).

```bash
source /var/lib/server/state/postgres.env
docker run --rm --network web --pull always \
  -e DATABASE_URL="$APPDATA_DATABASE_URL" \
  ghcr.io/kss-it-committee/2026-db/migrator:latest
```

The migrator never says *which* migrations it ran, so confirm against the DB —
expect the new table(s) in `\dt` and one more row in `__drizzle_migrations`:

```bash
docker run --rm --network web postgres:16-alpine \
  psql "$APPDATA_DATABASE_URL" -c "\dt" -c "table drizzle.__drizzle_migrations"
```

The two `schema "drizzle" already exists, skipping` / `relation
"__drizzle_migrations" already exists, skipping` NOTICEs on every run after the
first are normal — that's drizzle's own bookkeeping, not a failure.

### Locally

```bash
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=appdata postgres:16-alpine
DATABASE_URL=postgres://postgres:dev@localhost:5432/appdata npx drizzle-kit migrate
```

## How it fits the deploy pipeline

- **Now (interim, no ansible change):** run the migrator by hand on the VPS
  (command above) whenever the schema changes, *before* deploying app code that
  depends on the new schema.
- **Later (the proper trigger):** add this repo to the ansible poll loop as a
  SHA-gated first step each tick — if `2026-db`'s `main` moved, `docker run` the
  migrator against `appdata` *before* the three app deploys. Same pull-and-act
  pattern as `deploy-app.sh`, minus blue/green/nginx/health. Concurrency is a
  non-issue: the poll loop is serial and SHA-gated.

## Per-PR previews

PR preview containers run against a clone of `appdata` named
`appdata_<app>_pr_<N>`. Because clones are made from `appdata`'s current schema,
keep schema changes **additive and merged here first** — then every PR clone
inherits the already-migrated schema and never needs its own migrate. If you
must preview an unmerged migration, point the migrator at the clone's DSN
manually.

## What the apps must do

1. Change `start` from `drizzle-kit migrate --config=drizzle.config.ts && next start`
   to just `next start`. The apps no longer migrate.
2. Keep their own `db/schema.ts` for queries + types, in lockstep with this
   repo's schema. (Drizzle never issues DDL at runtime, so "just connect" is
   safe as long as the tables this repo creates match what they query.)
3. Do **not** run `drizzle-kit migrate` from an app repo against `appdata` — that
   reintroduces the collision. Removing the migrate step from `start` (and,
   ideally, the unused `drizzle/` + `drizzle.config.ts` from the app images)
   prevents this.
