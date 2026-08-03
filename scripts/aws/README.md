# AWS policy documents

IAM policy documents that are applied to production by hand. They live in the
repo so the grant is reviewable in a diff rather than existing only as console
state nobody can see.

Applying any of these needs credentials for the personal AWS account holding the
app — **not** the default profile, which is a work account:

```bash
export AWS_PROFILE=budget-app-prod        # account 903733335979
```

---

## `ec2-ssm-secrets-read-policy.json`

Lets the EC2 instance read its own runtime secrets from SSM Parameter Store at
deploy time (SA-25). Without it, `scripts/deploy-server.sh` cannot render
`.env` and the deploy aborts before touching the running app.

**Apply:**

```bash
aws iam put-role-policy \
  --role-name budget-app-ec2-s3-role \
  --policy-name budget-app-ssm-secrets-read \
  --policy-document file://scripts/aws/ec2-ssm-secrets-read-policy.json
```

**Verify:**

```bash
aws iam list-role-policies --role-name budget-app-ec2-s3-role
# expect budget-app-ssm-secrets-read alongside the existing three
```

### Why it is scoped the way it is

`AmazonSSMManagedInstanceCore` is already attached to the instance role and
grants `ssm:GetParameter` / `ssm:GetParameters`, but **not**
`ssm:GetParametersByPath` — which is what the deploy script uses to fetch the
whole set in one call. Hence the explicit grant.

The resource is pinned to `parameter/budget-app/prod/*` rather than `*` so the
instance cannot read unrelated parameters if the account ever holds any.

`kms:Decrypt` is required to read SecureStrings. It uses `Resource: "*"` with a
`kms:ViaService` condition rather than naming the key, because the parameters
use the AWS-managed `alias/aws/ssm` key whose ID is account-specific and can be
recreated. The condition is the real constraint: the role can only use KMS
*through SSM*, so this grant cannot be repurposed to decrypt anything else.

### Do not remove the existing inline policies

`ssm-session-logging` also grants the S3 session-log write, and
`budget-app-s3-policy` / `ec2_s3_data_access` carry the application's data
access. The managed `CloudWatchAgentServerPolicy` does not supersede any of
them.
