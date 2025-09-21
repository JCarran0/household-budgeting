# AWS Local Setup for Production Data Sync

## Overview
This guide helps developers set up AWS credentials to sync production data locally for debugging. This enables reproducing production issues in your local development environment.

## Prerequisites
- Node.js 20+
- AWS CLI installed (optional but recommended)
- Access to the production S3 bucket

## AWS Credentials Setup

### Method 1: AWS CLI Profiles (Recommended)

1. **Install AWS CLI** (if not already installed):
   ```bash
   # macOS
   brew install awscli

   # Ubuntu/Debian
   sudo apt-get install awscli

   # Windows
   # Download from https://aws.amazon.com/cli/
   ```

2. **Configure AWS Profile**:
   ```bash
   aws configure --profile budget-app-prod
   ```

   Enter when prompted:
   - **AWS Access Key ID**: Your IAM user access key
   - **AWS Secret Access Key**: Your IAM user secret key
   - **Default region**: `us-east-1` (or your bucket's region)
   - **Default output format**: `json`

3. **Verify Setup**:
   ```bash
   aws s3 ls s3://your-production-bucket-name --profile budget-app-prod
   ```

### Method 2: Environment Variables

1. **Set Environment Variables**:
   ```bash
   # Add to your shell profile (.bashrc, .zshrc, etc.)
   export AWS_ACCESS_KEY_ID=your_access_key_here
   export AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
   export AWS_DEFAULT_REGION=us-east-1
   ```

2. **Reload Shell**:
   ```bash
   source ~/.bashrc  # or ~/.zshrc
   ```

3. **Verify Setup**:
   ```bash
   aws s3 ls s3://your-production-bucket-name
   ```

### Method 3: AWS Session Tokens (Temporary Access)

For enhanced security, use temporary credentials:

1. **Generate Session Token**:
   ```bash
   aws sts get-session-token --duration-seconds 3600 --profile your-main-profile
   ```

2. **Set Temporary Credentials**:
   ```bash
   export AWS_ACCESS_KEY_ID=ASIA...
   export AWS_SECRET_ACCESS_KEY=...
   export AWS_SESSION_TOKEN=...
   ```

## Required IAM Permissions

Your AWS user needs these minimum permissions for production data sync:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::your-production-bucket-name",
                "arn:aws:s3:::your-production-bucket-name/*"
            ]
        }
    ]
}
```

**Security Note**: These are read-only permissions. The sync utility cannot modify production data.

## Environment Configuration

### Option 1: Profile-Based (.env)
```bash
# AWS Configuration
AWS_PROFILE=budget-app-prod
AWS_REGION=us-east-1

# Production S3 Configuration
PRODUCTION_S3_BUCKET_NAME=your-production-bucket-name
PRODUCTION_S3_PREFIX=data/
```

### Option 2: Direct Credentials (.env)
```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_access_key_here
AWS_REGION=us-east-1

# Production S3 Configuration
PRODUCTION_S3_BUCKET_NAME=your-production-bucket-name
PRODUCTION_S3_PREFIX=data/
```

**⚠️ Security Warning**: Never commit AWS credentials to version control. Add `.env` to `.gitignore`.

## Usage

### Sync All Production Data
```bash
npm run sync:production
```

### Dry Run (Preview Only)
```bash
npm run sync:production:dry-run
```

### Sync Specific User Data
```bash
npm run sync:production:user -- --user-id="specific-user-id"
```

### Backup Local Data Before Sync
```bash
npm run backup:local
```

## Data Security & Privacy

### Handling Production Data Locally

1. **Never commit production data** to version control
2. **Use data anonymization** when possible
3. **Delete production data** after debugging
4. **Secure your local environment** (disk encryption, etc.)

### Automatic Data Sanitization

The sync utility offers data sanitization options:

```bash
# Sync with PII anonymization
npm run sync:production -- --anonymize
```

This will:
- Replace real names with "User 1", "User 2", etc.
- Mask account numbers
- Replace real transaction descriptions with generic ones
- Preserve transaction amounts and dates for debugging

### Local Data Cleanup

```bash
# Remove all local production data
npm run cleanup:production-data

# Restore original local data from backup
npm run backup:restore
```

## Troubleshooting

### Common Issues

#### "Access Denied" Errors
```bash
Error: Access Denied
```
**Solutions**:
1. Verify IAM permissions include S3 read access
2. Check bucket name is correct
3. Ensure AWS credentials are properly configured

#### "No such bucket" Errors
```bash
Error: The specified bucket does not exist
```
**Solutions**:
1. Verify bucket name in environment variables
2. Check AWS region matches bucket region
3. Confirm you have ListBucket permission

#### "Token has expired" Errors
```bash
Error: The provided token has expired
```
**Solutions**:
1. Regenerate session token if using temporary credentials
2. Update AWS credentials if using permanent keys
3. Check system clock is synchronized

#### Profile Not Found
```bash
Error: The config profile 'budget-app-prod' could not be found
```
**Solutions**:
1. Run `aws configure --profile budget-app-prod` to create profile
2. Check profile name matches exactly
3. Verify `~/.aws/credentials` file exists

### Debug Mode

Enable verbose logging for troubleshooting:

```bash
DEBUG=true npm run sync:production
```

This will show:
- AWS credential resolution
- S3 API calls and responses
- File download progress
- Error stack traces

### AWS CLI Debug

Check AWS configuration:

```bash
# List configured profiles
aws configure list-profiles

# Test S3 access
aws s3 ls s3://your-bucket-name --profile your-profile

# Check current credentials
aws sts get-caller-identity --profile your-profile
```

## Best Practices

### Security
1. **Use IAM users** with minimal permissions (read-only S3)
2. **Rotate credentials** regularly
3. **Use temporary credentials** when possible
4. **Enable MFA** on AWS accounts
5. **Monitor AWS CloudTrail** for access logs

### Development Workflow
1. **Always backup** local data before sync
2. **Use dry-run mode** first to preview changes
3. **Sync specific data** when debugging focused issues
4. **Clean up** production data after debugging
5. **Document** any production issues found

### Performance
1. **Use selective sync** for large datasets
2. **Monitor data transfer costs** if using large amounts
3. **Consider regional S3 endpoints** for faster transfers
4. **Use compression** for large transaction datasets

## Example Workflow

Here's a complete workflow for debugging a production issue:

```bash
# 1. Backup your current local data
npm run backup:local

# 2. Preview what production data exists
npm run sync:production:dry-run

# 3. Sync specific user data (if known)
npm run sync:production:user -- --user-id="user123"

# 4. Or sync all data with anonymization
npm run sync:production -- --anonymize

# 5. Reproduce the issue locally
npm run dev

# 6. Debug using production data structure
# (your debugging work here)

# 7. Clean up production data
npm run cleanup:production-data

# 8. Restore original local data
npm run backup:restore
```

## Support

If you encounter issues:

1. Check this troubleshooting guide first
2. Enable debug mode for verbose logging
3. Verify AWS credentials and permissions
4. Contact the infrastructure team if bucket access is needed

## Security Reminder

🔒 **Remember**: Production data contains real user financial information. Handle with extreme care and follow all security protocols.