#!/bin/bash
#
# FixIT Chat — Backup script
# Creates a timestamped backup of PostgreSQL database and uploads directory.
#
# Can run from host (uses docker exec) or from inside backend container (uses pg_dump directly).
#
# Usage:
#   ./scripts/backup.sh              # from host
#   make backup                      # from host via Makefile
#   bash /scripts/backup.sh          # from inside backend container
#

set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
log() { echo -e "${GREEN}[backup]${NC} $1"; }
err() { echo -e "${RED}[backup]${NC} $1" >&2; }

# Detect if running inside container or on host
if [ -f /app/app/main.py ]; then
    # Inside backend container
    BACKUP_DIR="/backups"
    UPLOAD_DIR="/app/uploads"
    PGDUMP="pg_dump"
    # Parse DATABASE_URL for pg_dump
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:\/]*\).*/\1/p')
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\)$/\1/p')
    export PGPASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
else
    # On host
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    BACKUP_DIR="$SCRIPT_DIR/../backups"
    UPLOAD_DIR=""
    PGDUMP="docker exec fixit-chat-postgres-1 pg_dump"
    DB_HOST=""
    DB_USER="fixit"
    DB_NAME="fixit_chat"
fi

mkdir -p "$BACKUP_DIR"

# 1. Database
DB_FILE="$BACKUP_DIR/db_${TIMESTAMP}.sql.gz"
log "Backing up PostgreSQL..."

if [ -n "$DB_HOST" ]; then
    $PGDUMP -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$DB_FILE"
else
    $PGDUMP -U "$DB_USER" "$DB_NAME" 2>/dev/null | gzip > "$DB_FILE"
fi

if [ -s "$DB_FILE" ]; then
    log "DB: $DB_FILE ($(du -h "$DB_FILE" | cut -f1))"
else
    err "Database backup failed!"
    rm -f "$DB_FILE"
    exit 1
fi

# 2. Uploads
UPLOADS_FILE="$BACKUP_DIR/uploads_${TIMESTAMP}.tar.gz"
if [ -n "$UPLOAD_DIR" ] && [ -d "$UPLOAD_DIR" ]; then
    log "Backing up uploads..."
    tar czf "$UPLOADS_FILE" -C "$UPLOAD_DIR" . 2>/dev/null || true
    if [ -s "$UPLOADS_FILE" ]; then
        log "Uploads: $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))"
    else
        rm -f "$UPLOADS_FILE"
    fi
elif [ -z "$UPLOAD_DIR" ]; then
    # On host — copy from container
    log "Backing up uploads..."
    docker cp fixit-chat-backend-1:/app/uploads - 2>/dev/null | gzip > "$UPLOADS_FILE" || true
    if [ -s "$UPLOADS_FILE" ]; then
        log "Uploads: $UPLOADS_FILE ($(du -h "$UPLOADS_FILE" | cut -f1))"
    else
        rm -f "$UPLOADS_FILE"
    fi
fi

# 3. Cleanup
DELETED=$(find "$BACKUP_DIR" -name "*.gz" -mtime +$RETENTION_DAYS -delete -print 2>/dev/null | wc -l)
[ "$DELETED" -gt 0 ] && log "Deleted $DELETED old backup(s)"

# Done
TOTAL=$(find "$BACKUP_DIR" -name "*.gz" 2>/dev/null | wc -l)
log "Done! $TOTAL backup(s) in $BACKUP_DIR"
