# AWS Systems Manager (SSM) Deployment Setup

This guide explains how to set up deployment using AWS Systems Manager instead of SSH. This is more secure as it doesn't require opening port 22 to the internet.

## Prerequisites

1. AWS CLI installed locally
2. AWS IAM user with appropriate permissions
3. Terraform already applied with SSM setup

## Step 1: Apply Terraform Changes

First, apply the SSM configuration to your infrastructure:

```bash
cd terraform
terraform apply
```

This will:
- Add SSM permissions to your EC2 instance's IAM role
- Enable the instance for Systems Manager
- Output the instance ID for SSM connections

## Step 2: Verify SSM Agent Status

Check that your EC2 instance appears in Systems Manager:

```bash
# List instances available via SSM
aws ssm describe-instance-information \
  --query "InstanceInformationList[?InstanceId=='YOUR_INSTANCE_ID']" \
  --region us-east-1
```

If your instance doesn't appear:
1. Wait a few minutes for the agent to register
2. Restart the SSM agent on the instance (if you have SSH access):
   ```bash
   ssh ubuntu@67.202.9.86 "sudo systemctl restart snap.amazon-ssm-agent.amazon-ssm-agent"
   ```

## Step 3: Create IAM User for GitHub Actions

Create an IAM user with permissions for SSM and S3:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ssm:SendCommand",
        "ssm:GetCommandInvocation",
        "ssm:DescribeInstanceInformation",
        "ssm:DescribeDocumentParameters",
        "ssm:DescribeDocument"
      ],
      "Resource": [
        "arn:aws:ssm:us-east-1:*:instance/YOUR_INSTANCE_ID",
        "arn:aws:ssm:us-east-1:*:document/AWS-RunShellScript",
        "arn:aws:ssm:us-east-1:*:command/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::budget-app-backups-*/*",
        "arn:aws:s3:::budget-app-backups-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances"
      ],
      "Resource": "*"
    }
  ]
}
```

## Step 4: Configure GitHub Secrets

Add these secrets to your GitHub repository:

### Required for SSM Deployment:
```bash
AWS_ACCESS_KEY_ID         # IAM user access key
AWS_SECRET_ACCESS_KEY     # IAM user secret key
AWS_REGION               # us-east-1 (or your region)
EC2_INSTANCE_ID          # Your EC2 instance ID (from terraform output)
S3_BACKUP_BUCKET         # budget-app-backups-f5b52f89 (from terraform)
```

### Remove These (No Longer Needed):
```bash
SSH_PRIVATE_KEY          # Not needed with SSM!
SSH_USER                 # Not needed with SSM!
PRODUCTION_HOST          # Not needed with SSM!
```

## Step 5: Use the New SSM Workflow

1. Go to GitHub Actions tab
2. Select "Deploy to Production (SSM)" workflow
3. Click "Run workflow"
4. Add optional deployment message
5. Click "Run workflow" button

## How SSM Deployment Works

1. **Build**: GitHub Actions builds the application
2. **Upload**: Deployment package is uploaded to S3
3. **Command**: SSM sends deployment commands to EC2
4. **Execute**: EC2 downloads from S3 and deploys
5. **Verify**: Health checks confirm success

## Benefits of SSM over SSH

- ✅ **No open ports**: Port 22 can be completely closed
- ✅ **IAM-based access**: Uses AWS credentials, not SSH keys
- ✅ **Audit trail**: All commands logged in CloudTrail
- ✅ **Session logging**: Can log all deployment output
- ✅ **More secure**: No SSH keys to manage or rotate

## Testing SSM Connection Locally

You can test SSM access from your local machine:

```bash
# Start an interactive session
aws ssm start-session --target YOUR_INSTANCE_ID --region us-east-1

# Run a command
aws ssm send-command \
  --instance-ids "YOUR_INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["echo Hello from SSM","date"]' \
  --region us-east-1
```

## Troubleshooting

### Instance Not Available in SSM
- Check IAM role has `AmazonSSMManagedInstanceCore` policy
- Verify SSM agent is running: `sudo systemctl status snap.amazon-ssm-agent.amazon-ssm-agent`
- Check instance can reach SSM endpoints (internet access or VPC endpoints)

### Deployment Fails
- Check CloudWatch logs: `/aws/ssm/AWS-RunShellScript`
- Verify S3 bucket permissions
- Check PM2 logs on instance: `pm2 logs budget-backend`

### Permission Denied Errors
- Verify IAM user has all required permissions
- Check EC2 instance IAM role has SSM and S3 access

## Rollback with SSM

The rollback workflow also needs updating for SSM. Use the same pattern:
- No SSH connection needed
- Commands sent via SSM
- Same AWS credentials

## Migration from SSH to SSM

1. Apply Terraform changes
2. Update GitHub secrets
3. Test SSM workflow
4. Once working, remove SSH workflows
5. Close port 22 in security group (optional but recommended)

## Security Best Practices

1. **Least privilege**: Only grant necessary IAM permissions
2. **Session logging**: Enable CloudWatch or S3 session logging
3. **MFA**: Require MFA for production deployments
4. **Rotation**: Rotate IAM credentials regularly
5. **Monitoring**: Set up CloudWatch alarms for SSM activities