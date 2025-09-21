# Production Debug Workflow

Quick reference for debugging production issues using real production data.

## Prerequisites

1. **AWS Access**: Ensure you have read-only access to production S3 bucket
2. **Credentials Setup**: Follow [AWS-LOCAL-SETUP.md](./AWS-LOCAL-SETUP.md) for AWS configuration
3. **Environment**: Configure `.env` with production sync variables

## Quick Start

### 1. Backup Your Local Data
```bash
npm run backup:local -- --description="Before production sync"
```

### 2. Preview Production Data
```bash
npm run sync:production:dry-run
```

### 3. Sync Production Data
```bash
# Full sync with anonymization (recommended)
npm run sync:production -- --anonymize

# Or sync specific user data
npm run sync:production:user -- --user-id="user123" --anonymize
```

### 4. Debug the Issue
```bash
npm run dev
# Your app now runs with production data structure
```

### 5. Clean Up
```bash
# Restore your original data
npm run backup:restore

# Or clean up production data entirely
rm -rf backend/data/*
npm run backup:restore
```

## Available Commands

### Production Sync
- `npm run sync:production` - Interactive sync with safety prompts
- `npm run sync:production:dry-run` - Preview what would be synced
- `npm run sync:production:user -- --user-id="X"` - Sync specific user
- `npm run sync:production -- --anonymize` - Sync with PII protection
- `npm run sync:production -- --force` - Skip confirmation prompts

### Backup Management
- `npm run backup:local` - Create backup of current local data
- `npm run backup:list` - Show all available backups
- `npm run backup:restore` - Restore latest backup
- `npm run backup:restore -- --backup-dir="path"` - Restore specific backup
- `npm run backup:cleanup` - Remove old backups (keeps latest 5)

## Security Reminders

🔒 **Production data contains real user financial information**

- ✅ Use `--anonymize` flag when possible
- ✅ Delete production data after debugging
- ✅ Never commit production data to version control
- ✅ Use read-only AWS credentials
- ❌ Never share production data
- ❌ Never store production data permanently locally

## Troubleshooting

### AWS Access Issues
```bash
# Test AWS credentials
aws s3 ls s3://your-production-bucket --profile your-profile

# Check current AWS identity
aws sts get-caller-identity
```

### Missing Environment Variables
Add to your `.env`:
```bash
PRODUCTION_S3_BUCKET_NAME=your-bucket-name
AWS_PROFILE=your-aws-profile
# OR
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

### Large Dataset Performance
```bash
# Sync specific data types only
npm run sync:production -- --anonymize --user-id="specific-user"

# Use dry-run first to estimate size
npm run sync:production:dry-run
```

## Example Workflow

```bash
# 1. Investigate production issue report
echo "User reports transaction sync issues"

# 2. Backup current development data
npm run backup:local -- --description="Before investigating sync issue"

# 3. Preview production data structure
npm run sync:production:dry-run

# 4. Sync anonymized production data
npm run sync:production -- --anonymize

# 5. Start development server with production data
npm run dev

# 6. Reproduce the issue locally
# ... debug the transaction sync logic ...

# 7. Fix the issue and test
# ... make code changes ...

# 8. Clean up and restore original development data
npm run backup:restore
```

## Data Anonymization

When using `--anonymize`, the following PII is automatically masked:

- **Usernames**: Replaced with "user1", "user2", etc.
- **Account Names**: Replaced with "Account 1", "Account 2", etc.
- **Account Numbers**: Replaced with random masked numbers
- **Transaction Descriptions**: Replaced with generic merchant names
- **Preserved for Debugging**: Amounts, dates, categories, account types

## Support

For issues with this workflow:

1. Check [AWS-LOCAL-SETUP.md](./AWS-LOCAL-SETUP.md) troubleshooting section
2. Verify AWS credentials and permissions
3. Enable debug mode: `DEBUG=true npm run sync:production`
4. Contact infrastructure team for S3 access issues