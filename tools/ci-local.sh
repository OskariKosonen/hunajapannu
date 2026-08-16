#!/usr/bin/env bash
#
# Runs the backend CI suite — schema, migrations, seed and all the endpoint
# assertions — against a throwaway Postgres 16 container on this machine.
#
# The point is to stop learning about broken assertions from a push. The
# assertions themselves are not duplicated here: this extracts the "Boot
# against a real database" step out of .github/workflows/ci.yml and runs that,
# so there is one copy of the checks and it is the one CI runs.
#
# There is no psql client on the dev box, which is why this looked impossible
# for a while. It isn't: a shim on PATH forwards psql to the container, reading
# any -f file on the host and piping it in, since the container cannot see host
# paths.
#
# Usage:  tools/ci-local.sh
# Needs:  docker, jq, python3 (with pyyaml), node

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
CONTAINER=ci-local-pg
PGPORT_HOST=55432

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "--- starting postgres 16 ---"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=cowrie_db \
  -p "$PGPORT_HOST:5432" postgres:16 >/dev/null

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -d cowrie_db >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres -d cowrie_db >/dev/null 2>&1 || {
  echo "postgres did not come up"; exit 1; }

# psql shim. Arguments pass through untouched except -f, whose file is read
# here and fed over stdin — apply-migrations.sh already uses `-f -` for the
# same reason (the postgres user cannot traverse /home/admin in production).
mkdir -p "$WORK/bin"
cat > "$WORK/bin/psql" <<EOF
#!/usr/bin/env bash
args=(); file=""
while [ \$# -gt 0 ]; do
  case "\$1" in
    -f) file="\$2"; shift 2 ;;
    *)  args+=("\$1"); shift ;;
  esac
done
if [ -n "\$file" ] && [ "\$file" != "-" ]; then
  docker exec -i -e PGPASSWORD=postgres $CONTAINER psql "\${args[@]}" -f - < "\$file"
else
  docker exec -i -e PGPASSWORD=postgres $CONTAINER psql "\${args[@]}" \${file:+-f -}
fi
EOF
chmod +x "$WORK/bin/psql"

echo "--- extracting the assertions from ci.yml ---"
python3 - "$REPO" "$WORK/boot.sh" <<'PY'
import sys, yaml
repo, out = sys.argv[1], sys.argv[2]
wf = yaml.safe_load(open(f"{repo}/.github/workflows/ci.yml"))
steps = wf["jobs"]["backend"]["steps"]
step = next(s for s in steps if s.get("name") == "Boot against a real database")
open(out, "w").write(step["run"])
print(f"  {len(step['run'].splitlines())} lines")
PY

[ -d "$REPO/backend/node_modules" ] || (cd "$REPO/backend" && npm ci >/dev/null)

echo "--- running ---"
cd "$REPO/backend"
PATH="$WORK/bin:$PATH" \
PGHOST=localhost PGPORT="$PGPORT_HOST" PGUSER=postgres PGPASSWORD=postgres \
PGDATABASE=cowrie_db INGEST_API_KEY=ci-test-key PORT=3999 \
  bash "$WORK/boot.sh"
