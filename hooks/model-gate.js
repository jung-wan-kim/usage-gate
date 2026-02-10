#!/usr/bin/env node
// model-gate.js
// PreToolUse Hook: Auto-switch sub-agent models based on real-time usage %
//
// Reads cached usage from /tmp/claude-usage-gate-cache.json
// and automatically injects fallback model when usage exceeds thresholds.
//
// Uses `updatedInput` to modify Task parameters transparently.
// Exit code is always 0 (allow) - model is switched silently.

const fs = require("fs");
const os = require("os");
const path = require("path");

const CACHE_DIR =
  process.env.CLAUDE_USAGE_CACHE_DIR ||
  (process.platform === "win32"
    ? path.join(os.tmpdir(), "claude-usage-gate")
    : "/tmp");
const CACHE_FILE = path.join(CACHE_DIR, "claude-usage-gate-cache.json");
const LIMIT_5H = parseInt(process.env.CLAUDE_OPUS_LIMIT_5H || "90", 10);
const LIMIT_7D = parseInt(process.env.CLAUDE_OPUS_LIMIT_7D || "90", 10);
const FALLBACK_MODEL_5H = process.env.CLAUDE_FALLBACK_MODEL_5H || "sonnet";
const FALLBACK_MODEL_7D = process.env.CLAUDE_FALLBACK_MODEL_7D || "sonnet";
const GATE_ENABLED = process.env.CLAUDE_USAGE_GATE_ENABLED !== "false";

function readStdin() {
  try {
    const raw = fs.readFileSync("/dev/stdin", "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function main() {
  // If gate is disabled, allow all
  if (!GATE_ENABLED) process.exit(0);

  // No cache = allow (fail-open)
  if (!fs.existsSync(CACHE_FILE)) process.exit(0);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    process.exit(0);
  }

  const u5h = data.five_hour?.utilization ?? 0;
  const u7d = data.seven_day?.utilization ?? 0;

  // Under threshold = allow as-is
  if (u5h < LIMIT_5H && u7d < LIMIT_7D) process.exit(0);

  // Parse stdin to get tool_input
  const stdinData = readStdin();
  const toolInput = stdinData?.tool_input || {};

  // Already using a non-opus model = allow as-is
  const currentModel = (toolInput.model || "").toLowerCase();
  if (currentModel === "sonnet" || currentModel === "haiku") {
    process.exit(0);
  }

  // Determine fallback model
  let fallbackModel;
  let reason;

  if (u5h >= LIMIT_5H && u7d >= LIMIT_7D) {
    fallbackModel = FALLBACK_MODEL_7D;
    reason = `5h:${u5h}%/${LIMIT_5H}% 7d:${u7d}%/${LIMIT_7D}%`;
  } else if (u5h >= LIMIT_5H) {
    fallbackModel = FALLBACK_MODEL_5H;
    reason = `5h:${u5h}%/${LIMIT_5H}%`;
  } else {
    fallbackModel = FALLBACK_MODEL_7D;
    reason = `7d:${u7d}%/${LIMIT_7D}%`;
  }

  // Auto-switch: merge original tool_input + override model
  const updatedInput = Object.assign({}, toolInput, {
    model: fallbackModel,
  });

  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: `[Usage Gate] ${reason} → auto-switched to ${fallbackModel}`,
      updatedInput,
    },
  };

  process.stdout.write(JSON.stringify(output));
  process.exit(0);
}

main();
