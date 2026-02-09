#!/bin/bash
# model-gate.sh
# PreToolUse Hook: Auto-switch sub-agent models based on real-time usage %
#
# Reads usage data from /tmp/claude-usage-gate-cache.json (populated by usage-tracker.sh)
# and blocks opus Task calls when usage exceeds configured thresholds.
#
# Behavior:
#   usage < threshold  → ALLOW (opus OK)
#   usage >= threshold + model:"sonnet"/"haiku" → ALLOW
#   usage >= threshold + model:"opus"/unspecified → BLOCK (exit 2)
#
# Environment variables:
#   CLAUDE_OPUS_LIMIT_5H: 5-hour limit % (default: 90)
#   CLAUDE_OPUS_LIMIT_7D: 7-day limit % (default: 90)

TOOL_INPUT="${2:-}"
CACHE_FILE="/tmp/claude-usage-gate-cache.json"
LIMIT_5H="${CLAUDE_OPUS_LIMIT_5H:-90}"
LIMIT_7D="${CLAUDE_OPUS_LIMIT_7D:-90}"

# No cache = allow (fail-open)
[ ! -f "$CACHE_FILE" ] && exit 0

# No python3 = allow
command -v python3 &>/dev/null || exit 0

# Read from stdin if arg not provided (some versions pass via stdin)
if [ -z "$TOOL_INPUT" ] && [ ! -t 0 ]; then
  TOOL_INPUT=$(cat 2>/dev/null || echo "")
fi

# Check usage + model parameter
export LIMIT_5H LIMIT_7D TOOL_INPUT CACHE_FILE

RESULT=$(python3 -c '
import json, sys, os

CACHE = os.environ["CACHE_FILE"]
LIMIT_5H = int(os.environ["LIMIT_5H"])
LIMIT_7D = int(os.environ["LIMIT_7D"])
TOOL_INPUT = os.environ.get("TOOL_INPUT", "")

# Read cached usage data
try:
    with open(CACHE) as f:
        data = json.load(f)
except:
    print("ALLOW")
    sys.exit(0)

u5h = data.get("five_hour", {}).get("utilization", 0) or 0
u7d = data.get("seven_day", {}).get("utilization", 0) or 0

# Under threshold = allow
if u5h < LIMIT_5H and u7d < LIMIT_7D:
    print("ALLOW")
    sys.exit(0)

# Check if model param specifies a non-opus model
ti = TOOL_INPUT.lower()
if "model" in ti and ("sonnet" in ti or "haiku" in ti):
    print("ALLOW")
    sys.exit(0)

# Block opus/unspecified model
print(f"BLOCK:5h:{u5h}%|7d:{u7d}%")
' 2>/dev/null)

if [[ "$RESULT" == BLOCK:* ]]; then
  USAGE="${RESULT#BLOCK:}"
  echo "⚡ [Usage Gate] Usage exceeded ($USAGE): Task call blocked."
  echo "   Add model: \"sonnet\" parameter to retry."
  echo "   Example: Task({ ..., model: \"sonnet\" })"
  exit 2
fi

exit 0
