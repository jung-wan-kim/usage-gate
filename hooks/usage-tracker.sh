#!/bin/bash
# usage-tracker.sh
# UserPromptSubmit Hook: Fetch real-time usage from Anthropic Usage API
#
# Calls the Anthropic OAuth Usage API to get 5-hour and 7-day utilization
# percentages, caches the result, and displays warnings when approaching
# or exceeding configured thresholds.
#
# Environment variables:
#   CLAUDE_OPUS_LIMIT_5H: 5-hour opus limit % (default: 90)
#   CLAUDE_OPUS_LIMIT_7D: 7-day opus limit % (default: 90)
#   CLAUDE_USAGE_CACHE_TTL: Cache TTL in seconds (default: 60)

CACHE_FILE="/tmp/claude-usage-gate-cache.json"
LIMIT_5H="${CLAUDE_OPUS_LIMIT_5H:-90}"
LIMIT_7D="${CLAUDE_OPUS_LIMIT_7D:-90}"
CACHE_TTL="${CLAUDE_USAGE_CACHE_TTL:-60}"

# --- Get OAuth token (platform-aware) ---
get_token() {
  # 1. Environment variable (works on all platforms)
  if [ -n "$ANTHROPIC_ACCESS_TOKEN" ]; then
    echo "$ANTHROPIC_ACCESS_TOKEN"
    return 0
  fi

  # 2. macOS Keychain
  if command -v security &>/dev/null; then
    local creds
    creds=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null) || true
    if [ -n "$creds" ]; then
      echo "$creds" | python3 -c "import sys,json; print(json.load(sys.stdin).get('claudeAiOauth',{}).get('accessToken',''))" 2>/dev/null
      return 0
    fi
  fi

  # 3. Linux: check common credential file locations
  local cred_files=(
    "$HOME/.claude/credentials.json"
    "$HOME/.config/claude/credentials.json"
  )
  for cred_file in "${cred_files[@]}"; do
    if [ -f "$cred_file" ]; then
      python3 -c "import json; print(json.load(open('$cred_file')).get('claudeAiOauth',{}).get('accessToken',''))" 2>/dev/null
      return 0
    fi
  done

  return 1
}

# --- Check cache validity ---
is_cache_valid() {
  [ ! -f "$CACHE_FILE" ] && return 1
  command -v python3 &>/dev/null || return 1

  local now cached_at age
  now=$(date +%s)
  cached_at=$(python3 -c "import json; print(int(json.load(open('$CACHE_FILE')).get('cached_at',0)))" 2>/dev/null || echo 0)
  age=$((now - cached_at))
  [ "$age" -lt "$CACHE_TTL" ]
}

# --- Fetch usage from API & cache ---
fetch_usage() {
  local token
  token=$(get_token)
  [ -z "$token" ] && return 1

  local response
  response=$(curl -s --max-time 5 \
    -H "Authorization: Bearer $token" \
    -H "Accept: application/json" \
    -H "anthropic-beta: oauth-2025-04-20" \
    "https://api.anthropic.com/api/oauth/usage" 2>/dev/null)

  [ -z "$response" ] && return 1

  # Parse and cache
  python3 -c "
import json, sys, time
try:
    data = json.loads('''$response''')
    if 'five_hour' not in data and 'seven_day' not in data:
        sys.exit(1)
    cache = {
        'five_hour': data.get('five_hour', {}),
        'seven_day': data.get('seven_day', {}),
        'cached_at': int(time.time())
    }
    with open('$CACHE_FILE', 'w') as f:
        json.dump(cache, f)
except:
    sys.exit(1)
" 2>/dev/null
}

# --- Main logic ---

# Refresh cache if expired
if ! is_cache_valid; then
  fetch_usage 2>/dev/null
fi

# Display usage status
[ ! -f "$CACHE_FILE" ] && exit 0

export LIMIT_5H LIMIT_7D

python3 -c "
import json, sys, os

LIMIT_5H = int(os.environ.get('LIMIT_5H', '90'))
LIMIT_7D = int(os.environ.get('LIMIT_7D', '90'))

try:
    with open('$CACHE_FILE') as f:
        data = json.load(f)
except:
    sys.exit(0)

u5h = data.get('five_hour', {}).get('utilization', 0) or 0
u7d = data.get('seven_day', {}).get('utilization', 0) or 0

exceeded = u5h >= LIMIT_5H or u7d >= LIMIT_7D
warning_zone = u5h >= LIMIT_5H - 15 or u7d >= LIMIT_7D - 15

if exceeded:
    print(f'⚡ [Usage Gate] 5h:{u5h}% 7d:{u7d}% | Sub-agent: sonnet auto-applied')
elif warning_zone:
    print(f'📊 [Usage Gate] 5h:{u5h}% 7d:{u7d}% | Approaching threshold ({LIMIT_5H}%)')
" 2>/dev/null

exit 0
