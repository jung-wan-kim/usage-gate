---
description: Configure usage-gate thresholds and check current usage status
---

# Usage Gate Setup

When this command is invoked, help the user configure the usage-gate plugin.

## Steps

### 1. Check current usage
Read the cache file at `/tmp/claude-usage-gate-cache.json` and display current utilization:
- 5-hour utilization %
- 7-day utilization %
- Cache age (seconds since last API call)

### 2. Show current thresholds
Display the current environment variable settings:
- `CLAUDE_OPUS_LIMIT_5H` (default: 90)
- `CLAUDE_OPUS_LIMIT_7D` (default: 90)
- `CLAUDE_USAGE_CACHE_TTL` (default: 60)

### 3. Configuration guide
Explain how to change thresholds by adding environment variables to their Claude Code settings:

```json
// In ~/.claude/settings.json → "env" section:
{
  "env": {
    "CLAUDE_OPUS_LIMIT_5H": "90",
    "CLAUDE_OPUS_LIMIT_7D": "90",
    "CLAUDE_USAGE_CACHE_TTL": "60"
  }
}
```

Or for project-level settings, add to `.claude/settings.json` in the project root.

### 4. Test the gate
Offer to run a quick test:
- Read the current cache to verify API connectivity
- Show what would happen at current usage levels
- Explain the ALLOW/BLOCK logic
