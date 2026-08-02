#!/bin/bash
#
# One-time creation of the off-bucket backup target (TD-019).
#
# Idempotent: safe to re-run. Each step checks current state first, so this
# doubles as a way to verify the bucket is still configured as intended.
#
# Deliberately NOT done here:
#   - Cross-account replication. The only other AWS account available is a work
#     account; putting personal financial data there is worse than the risk it
#     mitigates. Same-account/second-bucket is the honest trade for a two-user
#     app, and it does leave account compromise uncovered — noted in TD-019.
#   - MFA-delete and Object Lock. Both add real operational friction (MFA-delete
#     can only be set by the root user) for a threat model that does not
#     justify it here.
#
# Usage:
#   AWS_PROFILE=budget-app-prod ./scripts/setup-backup-bucket.sh <bucket-name> [region]

set -euo pipefail

BUCKET="${1:-}"
REGION="${2:-${AWS_REGION:-us-east-1}}"

if [[ -z "$BUCKET" ]]; then
  echo "Usage: $0 <bucket-name> [region]" >&2
  exit 1
fi

echo "🪣 Target: s3://${BUCKET} (${REGION})"

if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo "   bucket already exists — verifying configuration"
else
  echo "   creating bucket"
  if [[ "$REGION" == "us-east-1" ]]; then
    # us-east-1 rejects a LocationConstraint; every other region requires one.
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=${REGION}"
  fi
fi

echo "🔒 Blocking all public access"
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo "🕒 Enabling versioning"
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

echo "🔐 Enabling default encryption (SSE-S3)"
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Snapshots are ~7 MB each and written weekly. Transitioning to Glacier Deep
# Archive after 30 days keeps two years of point-in-time history for cents,
# which is the specific gap versioning's 90-day expiry leaves open.
echo "♻️  Applying lifecycle (Deep Archive at 30d, expire at 730d)"
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {
        "ID": "snapshots-to-deep-archive",
        "Status": "Enabled",
        "Filter": {"Prefix": "snapshots/"},
        "Transitions": [{"Days": 30, "StorageClass": "DEEP_ARCHIVE"}],
        "Expiration": {"Days": 730}
      },
      {
        "ID": "abort-incomplete-uploads",
        "Status": "Enabled",
        "Filter": {"Prefix": ""},
        "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 7}
      }
    ]
  }'

echo "✅ Backup bucket ready: s3://${BUCKET}"
echo
echo "Next:"
echo "  1. Grant the EC2 instance role s3:PutObject/s3:ListBucket on this bucket."
echo "  2. Set BACKUP_S3_BUCKET_NAME=${BUCKET} in the backend .env."
echo "  3. Schedule: 0 4 * * 0  cd /home/appuser/app && ./scripts/backup-prod-snapshot.sh"
echo "  4. Run one restore drill — an untested backup is a hope, not a backup."
