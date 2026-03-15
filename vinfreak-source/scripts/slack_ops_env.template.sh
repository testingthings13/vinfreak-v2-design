#!/usr/bin/env bash
# Copy this file to `scripts/slack_ops_env.sh`, fill values, then:
#   source scripts/slack_ops_env.sh
# or:
#   set -a; source scripts/slack_ops_env.sh; set +a

# Required for Slack slash command signature verification
export SLACK_COMMAND_SIGNING_SECRET="replace-with-slack-signing-secret"

# Optional legacy fallback token (leave empty unless you intentionally use it)
export SLACK_COMMAND_VERIFICATION_TOKEN=""

# Enable/disable Slack ops error alerts (5xx notifications)
export SLACK_ALERTS_ENABLED="true"

# Recommended: dedicated incoming webhook for ops channel
export SLACK_ALERT_WEBHOOK_URL="https://hooks.slack.com/services/REPLACE/THIS/URL"

# Optional channel override for ops alerts
export SLACK_ALERT_CHANNEL="#ops-alerts"

# Admin links shown in Slack status/alert messages
export ADMIN_CANONICAL_HOST="admin.vinfreak.com"
export ADMIN_CANONICAL_SCHEME="https"

# Optional: cap manual/single-run timeout (seconds) when an explicit limit is used.
# Slack `/run bat` without a limit now runs "until exhausted" and uses importer defaults.
export NEUROWRATH_MANUAL_IMPORT_TIMEOUT_SECONDS="900"

# Optional fallback webhook used by other Slack notifications in this app
# (also used for ops alerts when SLACK_ALERT_WEBHOOK_URL is blank)
export SLACK_WEBHOOK_URL=""
