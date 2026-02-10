# usage-gate

A Claude Code plugin that automatically switches sub-agent models from **opus to sonnet/haiku** when your Anthropic API usage approaches rate limits. Fully configurable via interactive setup command.

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

### Quick Setup (Recommended)

Use the interactive setup command:

```bash
/usage-gate:setup
```

This will guide you through:
1. **Enable/Disable** - Turn usage-gate on or off
2. **5H Threshold** - Set 5-hour usage limit and fallback model
3. **7D Threshold** - Set 7-day usage limit and fallback model

All settings are saved to `~/.claude/settings.json` automatically.

### Manual Configuration

You can also manually set thresholds via environment variables in your Claude Code settings:

```json
// ~/.claude/settings.json
{
  "env": {
    "CLAUDE_USAGE_GATE_ENABLED": "true",
    "CLAUDE_OPUS_LIMIT_5H": "90",
    "CLAUDE_FALLBACK_MODEL_5H": "sonnet",
    "CLAUDE_OPUS_LIMIT_7D": "90",
    "CLAUDE_FALLBACK_MODEL_7D": "sonnet",
    "CLAUDE_USAGE_CACHE_TTL": "60"
  }
}
```

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_USAGE_GATE_ENABLED` | `true` | Enable/disable the usage gate |
| `CLAUDE_OPUS_LIMIT_5H` | `90` | 5-hour usage threshold (%) |
| `CLAUDE_FALLBACK_MODEL_5H` | `sonnet` | Model to use when 5H limit exceeded (`sonnet` or `haiku`) |
| `CLAUDE_OPUS_LIMIT_7D` | `90` | 7-day usage threshold (%) |
| `CLAUDE_FALLBACK_MODEL_7D` | `sonnet` | Model to use when 7D limit exceeded (`sonnet` or `haiku`) |
| `CLAUDE_USAGE_CACHE_TTL` | `60` | API cache TTL (seconds) |

### Configuration Strategies

**Conservative** (Recommended - Early switch, maximize cost savings):
- 5H: 70% → sonnet
- 7D: 70% → sonnet

**Balanced**:
- 5H: 80% → sonnet
- 7D: 80% → sonnet

**Aggressive** (Use opus as much as possible):
- 5H: 90% → sonnet
- 7D: 90% → sonnet

**Very Aggressive** (Almost no limits):
- 5H: 95% → haiku
- 7D: 95% → haiku

## Slash Commands

- `/usage-gate:setup` - **Interactive configuration** - Set thresholds, fallback models, and enable/disable the gate

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
3. Claude sees the error message showing which threshold was exceeded (5H or 7D)
4. Claude **automatically retries** with the appropriate fallback model (`sonnet` or `haiku`)
5. The hook detects the fallback model in the parameters and **allows** the call

This happens transparently - you don't need to do anything.

### Smart Fallback Selection

- **5H limit exceeded** → Uses `CLAUDE_FALLBACK_MODEL_5H` (default: `sonnet`)
- **7D limit exceeded** → Uses `CLAUDE_FALLBACK_MODEL_7D` (default: `sonnet`)
- **Both exceeded** → Uses the 7D fallback (more conservative choice)

### Disabling the Gate

Set `CLAUDE_USAGE_GATE_ENABLED=false` to temporarily disable the gate without removing the plugin. Usage tracking will continue, but no blocking will occur.

## License

MIT
