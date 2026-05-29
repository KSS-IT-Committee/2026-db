# Migrator image for the shared `appdata` Postgres database.
#
# Holds the single canonical Drizzle journal and is the ONLY thing that applies
# migrations to production. The target database is chosen at run time via
# DATABASE_URL, so the same image migrates `appdata` or any per-PR clone:
#
#   source /var/lib/server/state/postgres.env
#   docker run --rm --network web \
#     -e DATABASE_URL="$APPDATA_DATABASE_URL" \
#     ghcr.io/kss-it-committee/2026-db/migrator:latest
#
# `drizzle-kit migrate` is idempotent: it applies pending migrations and no-ops
# when the journal is already fully applied, so it is safe to re-run every time.
ARG NODE_VERSION=20

FROM node:${NODE_VERSION}-alpine
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then \
      npm ci --no-audit --no-fund; \
    else \
      npm install --no-audit --no-fund; \
    fi

# `migrate` only needs the journal + config — not db/schema.ts. (Same as the
# apps' Dockerfiles, which also migrate without copying the schema source.)
COPY drizzle.config.ts ./
COPY drizzle ./drizzle

ENTRYPOINT ["npx", "drizzle-kit", "migrate", "--config=drizzle.config.ts"]
