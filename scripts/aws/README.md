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

---

## `gh-actions-deployment-policy.json`

The **complete** managed policy for the CI deploy user
(`budget-app-gh-actions-user` → `BudgetAppGitHubActionsDeployment`). It is the
existing policy plus three statements that let the *Sync Secrets to SSM*
workflow write parameters and let the deploy workflow run its pre-flight check.

This is a full document, not a patch — updating a managed policy means creating
a new version containing everything.

**Apply:**

```bash
aws iam create-policy-version \
  --policy-arn arn:aws:iam::903733335979:policy/BudgetAppGitHubActionsDeployment \
  --policy-document file://scripts/aws/gh-actions-deployment-policy.json \
  --set-as-default
```

**Verify:**

```bash
ARN=arn:aws:iam::903733335979:policy/BudgetAppGitHubActionsDeployment
aws iam get-policy-version --policy-arn "$ARN" \
  --version-id "$(aws iam get-policy --policy-arn "$ARN" --query Policy.DefaultVersionId --output text)" \
  --query 'PolicyVersion.Document.Statement[].Sid' --output text
# expect WriteDeploymentSecrets, ListParametersForPreflight, EncryptSecureStringsViaSsmOnly
```

A managed policy keeps at most 5 versions. If `create-policy-version` fails with
`LimitExceeded`, delete the oldest non-default version first
(`aws iam list-policy-versions` → `aws iam delete-policy-version`).

### What was added and why

| Sid | Why |
|-----|-----|
| `WriteDeploymentSecrets` | `ssm:PutParameter` so the sync workflow can write `/budget-app/prod/*`. Scoped to that path — CI cannot touch other parameters. |
| `ListParametersForPreflight` | `ssm:DescribeParameters` for the deploy's pre-flight existence check. Must be `Resource: "*"` — the API does not support resource-level permissions. It returns metadata only, never values. |
| `EncryptSecureStringsViaSsmOnly` | SecureString writes need KMS. Constrained by `kms:ViaService` so it cannot be used outside SSM. |

Note this user is **not** an admin. It has a narrow, purpose-built policy —
worth preserving. Do not "fix" a permissions error here by attaching
`AdministratorAccess`; add the specific action to this document instead.

### Do not remove the existing inline policies

`ssm-session-logging` also grants the S3 session-log write, and
`budget-app-s3-policy` / `ec2_s3_data_access` carry the application's data
access. The managed `CloudWatchAgentServerPolicy` does not supersede any of
them.
