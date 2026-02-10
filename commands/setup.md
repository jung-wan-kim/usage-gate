---
description: Interactive configuration for usage-gate plugin
---

# Usage Gate Setup

Configure usage-gate interactively with 3 simple steps.

## Overview

This command will guide you through:
1. **Enable/Disable** - Turn usage-gate on or off
2. **5H Threshold** - Set 5-hour usage limit and fallback model
3. **7D Threshold** - Set 7-day usage limit and fallback model

All settings are saved to `~/.claude/settings.json` in the `env` section.

---

## Steps

### Step 1: Show Current Status

First, read and display the current configuration:

```bash
# Read current settings
cat ~/.claude/settings.json | grep -A 20 '"env"' | grep 'CLAUDE_'
```

Display:
- Current enabled status (CLAUDE_USAGE_GATE_ENABLED, default: true)
- Current 5H limit (CLAUDE_OPUS_LIMIT_5H, default: 90)
- Current 5H fallback (CLAUDE_FALLBACK_MODEL_5H, default: sonnet)
- Current 7D limit (CLAUDE_OPUS_LIMIT_7D, default: 90)
- Current 7D fallback (CLAUDE_FALLBACK_MODEL_7D, default: sonnet)

Also read `/tmp/claude-usage-gate-cache.json` to show current usage:
- 5-hour utilization %
- 7-day utilization %

---

### Step 2: Question 1 - Enable/Disable

Use **AskUserQuestion** tool:

```json
{
  "questions": [
    {
      "question": "usage-gate를 활성화하시겠습니까?",
      "header": "Enable Gate",
      "multiSelect": false,
      "options": [
        {
          "label": "✅ 활성화 (권장)",
          "description": "사용률 초과 시 자동으로 저렴한 모델로 전환합니다. 비용 절감에 효과적입니다."
        },
        {
          "label": "❌ 비활성화",
          "description": "게이트 체크를 건너뛰고 항상 Opus를 사용합니다. 사용률 추적은 계속됩니다."
        }
      ]
    }
  ]
}
```

- If user selects "비활성화", set `CLAUDE_USAGE_GATE_ENABLED=false` and **skip to Step 5** (save settings).
- If user selects "활성화", set `CLAUDE_USAGE_GATE_ENABLED=true` and continue to Step 3.

---

### Step 3: Question 2 - 5H Threshold

Use **AskUserQuestion** tool:

```json
{
  "questions": [
    {
      "question": "5시간 사용률이 몇 %를 넘으면 어떤 모델로 전환할까요?",
      "header": "5H Threshold",
      "multiSelect": false,
      "options": [
        {
          "label": "70% → sonnet",
          "description": "매우 보수적. 일찍 전환하여 비용 절감을 극대화합니다."
        },
        {
          "label": "80% → sonnet",
          "description": "보수적. 안전한 마진을 확보합니다."
        },
        {
          "label": "90% → sonnet (권장)",
          "description": "기본 설정. 균형있는 선택입니다."
        },
        {
          "label": "95% → haiku",
          "description": "관대. 거의 한계까지 Opus를 사용하고, 초과 시 Haiku로 빠르게 전환합니다."
        }
      ]
    }
  ]
}
```

Parse the user's answer:
- Extract threshold value (70, 80, 90, 95)
- Extract fallback model (sonnet, haiku)
- Set `CLAUDE_OPUS_LIMIT_5H={threshold}`
- Set `CLAUDE_FALLBACK_MODEL_5H={model}`

---

### Step 4: Question 3 - 7D Threshold

Use **AskUserQuestion** tool:

```json
{
  "questions": [
    {
      "question": "7일 사용률이 몇 %를 넘으면 어떤 모델로 전환할까요?",
      "header": "7D Threshold",
      "multiSelect": false,
      "options": [
        {
          "label": "70% → sonnet",
          "description": "매우 보수적. 일찍 전환하여 비용 절감을 극대화합니다."
        },
        {
          "label": "80% → sonnet",
          "description": "보수적. 안전한 마진을 확보합니다."
        },
        {
          "label": "90% → sonnet (권장)",
          "description": "기본 설정. 균형있는 선택입니다."
        },
        {
          "label": "95% → haiku",
          "description": "관대. 거의 한계까지 Opus를 사용하고, 초과 시 Haiku로 빠르게 전환합니다."
        }
      ]
    }
  ]
}
```

Parse the user's answer:
- Extract threshold value (70, 80, 90, 95)
- Extract fallback model (sonnet, haiku)
- Set `CLAUDE_OPUS_LIMIT_7D={threshold}`
- Set `CLAUDE_FALLBACK_MODEL_7D={model}`

---

### Step 5: Save Settings to ~/.claude/settings.json

**IMPORTANT**: Use Node.js script to safely update settings.json:

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');

// Read existing settings
let settings = {};
if (fs.existsSync(settingsPath)) {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error('Failed to parse settings.json:', err.message);
    process.exit(1);
  }
}

// Create backup
const backupPath = settingsPath + '.backup.' + Date.now();
if (fs.existsSync(settingsPath)) {
  fs.copyFileSync(settingsPath, backupPath);
  console.log(`✅ Backup created: ${backupPath}`);
}

// Ensure env section exists
if (!settings.env) {
  settings.env = {};
}

// Update environment variables
settings.env.CLAUDE_USAGE_GATE_ENABLED = "{ENABLED}";
settings.env.CLAUDE_OPUS_LIMIT_5H = "{LIMIT_5H}";
settings.env.CLAUDE_FALLBACK_MODEL_5H = "{MODEL_5H}";
settings.env.CLAUDE_OPUS_LIMIT_7D = "{LIMIT_7D}";
settings.env.CLAUDE_FALLBACK_MODEL_7D = "{MODEL_7D}";

// Write back to file
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
console.log('✅ Settings saved to ~/.claude/settings.json');
```

**Replace placeholders** with actual values from user's answers:
- `{ENABLED}` → "true" or "false"
- `{LIMIT_5H}` → "70", "80", "90", or "95"
- `{MODEL_5H}` → "sonnet" or "haiku"
- `{LIMIT_7D}` → "70", "80", "90", or "95"
- `{MODEL_7D}` → "sonnet" or "haiku"

---

### Step 6: Display Summary

Show the final configuration:

```
✅ usage-gate 설정 완료!

📊 설정 내역:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 활성화: {ENABLED}

 5시간 설정:
  └─ 임계값: {LIMIT_5H}%
  └─ 초과 시 모델: {MODEL_5H}

 7일 설정:
  └─ 임계값: {LIMIT_7D}%
  └─ 초과 시 모델: {MODEL_7D}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 설정이 즉시 적용됩니다.
💡 언제든지 /usage-gate:setup 명령어로 재설정할 수 있습니다.
```

---

## Error Handling

1. **settings.json이 없는 경우**:
   - 새로 생성 (`{}`)
   - `env` 섹션 추가

2. **JSON 파싱 실패**:
   - 에러 메시지 표시
   - 수동 수정 안내

3. **권한 에러**:
   - `chmod +w ~/.claude/settings.json` 안내

4. **백업 실패**:
   - 경고만 표시하고 계속 진행
