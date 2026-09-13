#!/bin/sh
set -eu

: "${REDIS_URL:?REDIS_URL is required}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
mkdir -p "$BACKUP_DIR"

backup="$TMP_DIR/redis-$STAMP.rdb"
redis-cli -u "$REDIS_URL" --rdb "$backup" >/dev/null
redis-check-rdb "$backup" >/dev/null
sha256sum "$backup" > "$backup.sha256"
cp "$backup" "$BACKUP_DIR/"
cp "$backup.sha256" "$BACKUP_DIR/"

# Verify the persisted snapshot is non-empty, structurally valid, and addressable.
test -s "$BACKUP_DIR/redis-$STAMP.rdb"
redis-check-rdb "$BACKUP_DIR/redis-$STAMP.rdb" >/dev/null
printf '%s\n' "backup_ok timestamp=$STAMP file=$BACKUP_DIR/redis-$STAMP.rdb"

# Retain the most recent seven snapshots unless explicitly overridden.
KEEP="${BACKUP_RETENTION_COUNT:-7}"
ls -1t "$BACKUP_DIR"/redis-*.rdb 2>/dev/null | tail -n +$((KEEP + 1)) | while IFS= read -r old; do
  rm -f "$old" "$old.sha256"
done
