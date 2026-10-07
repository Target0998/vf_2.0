#!/usr/bin/env sh
# Backup of a running site: database + uploaded files (images, PDFs, media).
# Run on the server, in the repo folder:
#     scripts/backup.sh [target-dir]          (default: ./backups)
# Produces <target>/vf-<date>-db.sql.gz and <target>/vf-<date>-content.tar.gz.
# Not included (they live elsewhere): the theme and routes.yaml (git), .env (copy it by hand).
# Restore on staging: scripts/restore-staging.sh. Contains personal data (members) – keep it private.
set -eu

DC="${DC:-docker compose -f docker-compose.yml -f docker-compose.prod.yml}"   # override only for testing
DIR="${1:-backups}"
STAMP="$(date +%Y-%m-%d-%H%M)"
mkdir -p "$DIR"
umask 077

echo "→ database"
# utf8mb4 explicitly, or the Hungarian accents get mangled; single transaction = consistent dump while Ghost runs
$DC exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --default-character-set=utf8mb4 --single-transaction --routines --no-tablespaces ghost' \
    | gzip > "$DIR/vf-$STAMP-db.sql.gz"

echo "→ uploaded files (images, files, media)"
$DC exec -T ghost tar czf - -C /var/lib/ghost/content images files media > "$DIR/vf-$STAMP-content.tar.gz"

ls -lh "$DIR/vf-$STAMP-"*
echo "✓ done. Copy both files off the server (e.g. scp) – a backup on the same disk is not a backup."
