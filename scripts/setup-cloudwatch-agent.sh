#!/bin/bash
#
# Install and start the CloudWatch agent on the production EC2 instance (TD-017).
#
# Runs ON the instance, not from a laptop. Reach it with either:
#   aws ssm start-session --target i-05cd17258cce207a3
#   aws ssm send-command --instance-ids i-05cd17258cce207a3 \
#     --document-name AWS-RunShellScript --parameters 'commands=["sudo bash /home/appuser/app/scripts/setup-cloudwatch-agent.sh"]'
#
# Idempotent: safe to re-run, and re-running is the intended way to verify the
# agent is still configured as expected after an AMI change or instance replace.
#
# Why this exists as a script rather than the copy-paste block that used to live
# in AI-DEPLOYMENTS.md: that block said `yum install`, and this instance runs
# Ubuntu — so the documented procedure could never have worked. A script that is
# actually executed cannot drift from reality the way prose does.
#
# What is deliberately NOT collected:
#   - Host metrics (CPU/memory/disk). The `metrics` block is omitted on purpose.
#     EC2 already publishes basic metrics free, and the gap TD-017 exists to
#     close is *log* retention, not observability breadth. Adding metrics here
#     would also make `cloudwatch:PutMetricData` a hard requirement.
#   - nginx / system logs. Only the app's own Pino output is forwarded, because
#     that is the stream that answers "what did the backend do at 03:00".

set -euo pipefail

LOG_GROUP="/aws/ec2/budget-app"
RETENTION_DAYS=90
CONFIG_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cloudwatch-agent-config.json"
CONFIG_DEST="/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json"
AGENT_CTL="/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "❌ Must run as root (sudo bash $0)" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_SRC" ]]; then
  echo "❌ Config not found at $CONFIG_SRC" >&2
  exit 1
fi

echo "🔎 Checking prerequisites"

# The agent tails files owned by appuser, so it must run as root — that is set
# in the config's `agent.run_as_user`. Verify the files it will tail exist, or
# the agent starts happily and forwards nothing.
#
# Globs, not literal names, because PM2 writes `output-0.log` (its instance-index
# naming) even though ecosystem.config.js specifies `output.log` — the running
# process was not started from that file. The glob matches both, and deliberately
# does not match rotated siblings (`output-0.log.1`, `.2.gz`), which would
# re-ingest old data on every rotation.
shopt -s nullglob
for pattern in '/home/appuser/logs/output*.log' '/home/appuser/logs/error*.log'; do
  matches=( $pattern )
  if (( ${#matches[@]} == 0 )); then
    echo "   ⚠️  no file matches $pattern — agent will wait for one to appear"
  else
    for f in "${matches[@]}"; do
      echo "   ✓ $f ($(stat -c%s "$f") bytes)"
    done
  fi
done
shopt -u nullglob

if ! command -v amazon-cloudwatch-agent-ctl >/dev/null 2>&1 && [[ ! -x "$AGENT_CTL" ]]; then
  echo "📦 Installing amazon-cloudwatch-agent"
  # Architecture is detected rather than hardcoded: this instance family has
  # been changed before, and a hardcoded amd64 .deb fails confusingly on arm64.
  ARCH="$(dpkg --print-architecture)"
  TMP_DEB="$(mktemp -d)/amazon-cloudwatch-agent.deb"
  wget -q -O "$TMP_DEB" \
    "https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/${ARCH}/latest/amazon-cloudwatch-agent.deb"
  dpkg -i -E "$TMP_DEB"
  rm -f "$TMP_DEB"
else
  echo "   ✓ agent already installed"
fi

echo "📝 Installing config → $CONFIG_DEST"
install -D -m 0644 "$CONFIG_SRC" "$CONFIG_DEST"

echo "▶️  Starting agent"
"$AGENT_CTL" -a fetch-config -m ec2 -s -c "file:${CONFIG_DEST}"

# Survive a reboot. `-ctl -s` starts it now but does not always enable the unit.
systemctl enable amazon-cloudwatch-agent >/dev/null 2>&1 || true

echo "🔁 Status"
"$AGENT_CTL" -a status -m ec2

# Retention is set here rather than in the agent config so it applies even if
# the group is later recreated by something else. Without it the group inherits
# "never expire", which is how the 1.7 GB Lambda group in this account happened.
echo "🕒 Setting ${RETENTION_DAYS}d retention on ${LOG_GROUP}"
aws logs put-retention-policy \
  --log-group-name "$LOG_GROUP" \
  --retention-in-days "$RETENTION_DAYS" 2>/dev/null \
  && echo "   ✓ retention set" \
  || echo "   ⚠️  could not set retention from the instance — run it from a laptop with admin creds"

echo
echo "✅ Done. Verify from your laptop (allow ~60s for the first flush):"
echo "   AWS_PROFILE=budget-app-prod aws logs tail ${LOG_GROUP} --follow"
