#!/bin/bash
#
# Off-bucket snapshot of production data (TD-019).
#
# The primary data bucket already has versioning enabled, which covers the
# overwhelmingly likely failure: a bad write. What versioning does NOT cover is
# loss of the bucket itself — deletion, a destructive lifecycle or policy
# change, or account compromise — and its noncurrent versions expire at 90 days,
# so there is no point-in-time recovery older than a quarter.
#
# This copies the data prefix into a separate bucket under a dated snapshot
# prefix. Dated prefixes (rather than a mirror) are what buy point-in-time
# recovery: a mirror of corrupted data is corrupted data.
#
# Read-only against production. It never writes to the source bucket.
#
# Usage:
#   ./scripts/backup-prod-snapshot.sh                 # take today's snapshot
#   ./scripts/backup-prod-snapshot.sh --dry-run       # show what would copy
#   ./scripts/backup-prod-snapshot.sh --list          # list existing snapshots
#   ./scripts/backup-prod-snapshot.sh --restore-to DIR --snapshot YYYY-MM-DD
#
# --restore-to downloads to a LOCAL directory on purpose. Restoring into
# production is a deliberate, reviewed act and is documented as manual steps in
# docs/AI-DEPLOYMENTS.md — a --restore flag that writes to prod is exactly the
# kind of convenience that eventually overwrites good data with old data.
#
# Environment:
#   PRODUCTION_S3_BUCKET_NAME  source bucket (required)
#   BACKUP_S3_BUCKET_NAME      destination bucket (required)
#   PRODUCTION_S3_PREFIX       source prefix (default: data/)
#   AWS_PROFILE / AWS_REGION   standard AWS resolution

set -euo pipefail

SOURCE_BUCKET="${PRODUCTION_S3_BUCKET_NAME:-}"
BACKUP_BUCKET="${BACKUP_S3_BUCKET_NAME:-}"
PREFIX="${PRODUCTION_S3_PREFIX:-data/}"
SNAPSHOT_DATE="$(date -u +%Y-%m-%d)"

DRY_RUN=false
LIST_ONLY=false
RESTORE_DIR=""
RESTORE_SNAPSHOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)     DRY_RUN=true; shift ;;
    --list)        LIST_ONLY=true; shift ;;
    --restore-to)  RESTORE_DIR="$2"; shift 2 ;;
    --snapshot)    RESTORE_SNAPSHOT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$SOURCE_BUCKET" || -z "$BACKUP_BUCKET" ]]; then
  echo "❌ PRODUCTION_S3_BUCKET_NAME and BACKUP_S3_BUCKET_NAME must both be set" >&2
  exit 1
fi

if [[ "$LIST_ONLY" == true ]]; then
  echo "Snapshots in s3://${BACKUP_BUCKET}/snapshots/"
  # Trailing slash + delimiter lists snapshot prefixes rather than every object.
  aws s3 ls "s3://${BACKUP_BUCKET}/snapshots/" | awk '{print "  " $2}'
  exit 0
fi

if [[ -n "$RESTORE_DIR" ]]; then
  if [[ -z "$RESTORE_SNAPSHOT" ]]; then
    echo "❌ --restore-to requires --snapshot YYYY-MM-DD (see --list)" >&2
    exit 1
  fi
  mkdir -p "$RESTORE_DIR"
  echo "⬇️  Downloading snapshot ${RESTORE_SNAPSHOT} → ${RESTORE_DIR}"
  aws s3 sync "s3://${BACKUP_BUCKET}/snapshots/${RESTORE_SNAPSHOT}/" "$RESTORE_DIR/"
  echo "✅ Restored locally. Nothing in production was modified."
  echo "   To push a file back to prod, see docs/AI-DEPLOYMENTS.md §Restoring from a snapshot."
  exit 0
fi

DEST="s3://${BACKUP_BUCKET}/snapshots/${SNAPSHOT_DATE}/"
echo "📦 Snapshot ${SNAPSHOT_DATE}"
echo "   from s3://${SOURCE_BUCKET}/${PREFIX}"
echo "   to   ${DEST}"

SYNC_ARGS=(--no-progress)
if [[ "$DRY_RUN" == true ]]; then
  SYNC_ARGS+=(--dryrun)
fi

aws s3 sync "s3://${SOURCE_BUCKET}/${PREFIX}" "$DEST" "${SYNC_ARGS[@]}"

if [[ "$DRY_RUN" == true ]]; then
  echo "🔍 Dry run — nothing copied."
  exit 0
fi

# Verify by count. A silent partial copy is worse than a loud failure, because
# it looks like a backup until the day it matters.
SOURCE_COUNT=$(aws s3 ls "s3://${SOURCE_BUCKET}/${PREFIX}" --recursive | wc -l | tr -d ' ')
DEST_COUNT=$(aws s3 ls "${DEST}" --recursive | wc -l | tr -d ' ')

echo "   source objects: ${SOURCE_COUNT}"
echo "   snapshot objects: ${DEST_COUNT}"

if [[ "$SOURCE_COUNT" != "$DEST_COUNT" ]]; then
  echo "❌ Object count mismatch — snapshot is incomplete." >&2
  exit 1
fi

echo "✅ Snapshot complete and verified (${DEST_COUNT} objects)"
