# usage-gate

A Claude Code plugin that automatically switches sub-agent models from **opus to sonnet** when your Anthropic API usage approaches rate limits.

## How It Works

```
You submit a prompt
  ↓
usage-tracker.js fetches real-time usage from Anthropic API
  → Caches result (60s TTL)
  → Shows usage warning if approaching threshold
  ↓
Claude wants to spawn a sub-agent (Task tool)
  ↓
model-gate.js checks cached usage
  → Usage < 90%  →  ALLOW (opus OK)
  → Usage >= 90% + model:"sonnet"  →  ALLOW
  → Usage >= 90% + no model specified  →  BLOCK (exit 2)
  ↓
Claude automatically retries with model: "sonnet"
```

## Installation

```bash
claude plugin add /path/to/usage-gate
```

Or from GitHub:

```bash
claude plugin add github:jung-wankim/usage-gate
```

## Configuration

Set thresholds via environment variables in your Claude Code settings:

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_OPUS_LIMIT_5H": "90",
    "CLAUDE_OPUS_LIMIT_7D": "90",
    "CLAUDE_USAGE_CACHE_TTL": "60"
  }
}
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_OPUS_LIMIT_5H` | `90` | 5-hour usage threshold (%) |
| `CLAUDE_OPUS_LIMIT_7D` | `90` | 7-day usage threshold (%) |
| `CLAUDE_USAGE_CACHE_TTL` | `60` | API cache TTL (seconds) |

## Slash Commands

- `/usage-gate:setup` - Check current usage and configure thresholds

## Requirements

- **Claude Code** with plugin support
- **Node.js** (bundled with Claude Code)
- **macOS**, **Linux**, or **Windows**

No additional dependencies needed. Uses only Node.js built-in modules.

### Authentication

The plugin retrieves your OAuth token automatically:

1. **Environment variable**: `ANTHROPIC_ACCESS_TOKEN` (all platforms)
2. **macOS Keychain**: Reads from `Claude Code-credentials` (automatic)
3. **Windows Credential Manager**: Reads from stored credentials (automatic)
4. **Credential files**: `~/.claude/credentials.json` or `~/.config/claude/credentials.json` (Linux)

## How the Gate Works

When usage exceeds the threshold:

1. Claude tries to call `Task({ subagent_type: "...", prompt: "..." })`
2. The PreToolUse hook **blocks** the call with exit code 2
3. Claude sees the error message and **automatically retries** with `model: "sonnet"`
4. The hook detects `"sonnet"` in the parameters and **allows** the call

This happens transparently - you don't need to do anything.

## License

MIT
