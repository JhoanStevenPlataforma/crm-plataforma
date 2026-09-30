#!/bin/sh
#
# Deploys this repository to a self-hosted Supabase on a single server.
#
# Run it on the server, from anywhere inside the clone:
#
#   sh deploy/ec2/deploy.sh
#
# It expects:
#   - the Supabase docker project created by Supabase's setup.sh in
#     $SUPABASE_DIR (default ~/supabase), already running;
#   - Caddy (or any web server) serving $WEB_ROOT (default /var/www/crm) as a
#     single-page app;
#   - Node.js matching .nvmrc.
#
# Every step is idempotent, so a failed run can simply be run again.

set -eu

REPO_DIR=$(cd "$(dirname "$0")/../.." && pwd)
SUPABASE_DIR=${SUPABASE_DIR:-$HOME/supabase}
WEB_ROOT=${WEB_ROOT:-/var/www/crm}

step() { printf '\n==> %s\n' "$1"; }

env_value() {
    grep "^$1=" "$SUPABASE_DIR/.env" | head -n1 | cut -d= -f2-
}

psql_db() {
    docker exec -i -e PGPASSWORD="$(env_value POSTGRES_PASSWORD)" supabase-db \
        psql -h 127.0.0.1 -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 "$@"
}

[ -f "$SUPABASE_DIR/.env" ] || {
    echo "No Supabase project at $SUPABASE_DIR (set SUPABASE_DIR)." >&2
    exit 1
}

cd "$REPO_DIR"

step "Updating the code"
git pull --ff-only

# Same bookkeeping table as the Supabase CLI, so `supabase db push --db-url`
# from a workstation agrees with this script about what is applied.
step "Applying database migrations"
psql_db <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
);
SQL
applied=$(psql_db -At -c "select version from supabase_migrations.schema_migrations")
pending=0
for file in supabase/migrations/*.sql; do
    base=$(basename "$file" .sql)
    version=${base%%_*}
    name=${base#*_}
    if printf '%s\n' "$applied" | grep -qx "$version"; then
        continue
    fi
    echo "  $base"
    {
        cat "$file"
        printf "\ninsert into supabase_migrations.schema_migrations (version, name) values ('%s', '%s');\n" \
            "$version" "$name"
    } | psql_db --single-transaction
    pending=$((pending + 1))
done
echo "  $pending applied"

step "Deploying edge functions"
rsync -a --delete \
    --exclude '/main' --exclude '/deno.jsonc' --exclude '.env' --exclude '*.test.ts' \
    supabase/functions/ "$SUPABASE_DIR/volumes/functions/"
cp deploy/ec2/docker-compose.crm.yml "$SUPABASE_DIR/"
(
    cd "$SUPABASE_DIR"
    grep -q '^COMPOSE_FILE=.*docker-compose.crm.yml' .env || sh run.sh config add crm
    docker compose up -d functions
    docker compose restart functions
)

step "Building the front-end"
cat > .env.production <<EOF
VITE_SUPABASE_URL=$(env_value SUPABASE_PUBLIC_URL)
VITE_SB_PUBLISHABLE_KEY=$(env_value SUPABASE_PUBLISHABLE_KEY)
VITE_IS_DEMO=false
VITE_ATTACHMENTS_BUCKET=attachments
EOF
npm ci --no-audit --no-fund
# vite alone: the type check belongs to development and CI, and tsc on top of
# the running stack is what would push a small server into swap. Source maps
# are off for the same reason (they dominate the build's memory, and would
# publish the readable source); Node's default heap on a 2 GB machine is too
# small for this bundle, so it may borrow from swap.
NODE_OPTIONS=--max-old-space-size=3072 npx vite build --sourcemap false
sudo rsync -a --delete dist/ "$WEB_ROOT/"

step "Done"
echo "  $(env_value SITE_URL)"
