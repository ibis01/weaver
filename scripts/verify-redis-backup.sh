#!/bin/sh
set -eu

: "${1:?usage: verify-redis-backup.sh /path/to/redis-snapshot.rdb}"
file="$1"
test -s "$file"
redis-check-rdb "$file" >/dev/null
if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256")
fi
printf '%s\n' "backup_verified file=$file"
