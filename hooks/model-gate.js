#!/usr/bin/env node
// model-gate.js
// PreToolUse Hook: Auto-switch sub-agent models based on real-time usage %
//
// Reads cached usage from /tmp/claude-usage-gate-cache.json
// and blocks opus Task calls when usage exceeds thresholds.
//
// Exit codes:
//   0 = ALLOW
//   2 = BLOCK (Claude will retry with model: "sonnet")

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

function getToolInput() {
  // Try argv first (passed as $2 by Claude Code)
  if (process.argv[3]) return process.argv[3];

  // Try reading stdin (non-blocking)
  try {
    return fs.readFileSync("/dev/stdin", "utf8");
  } catch {
    return "";
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

  // Under threshold = allow
  if (u5h < LIMIT_5H && u7d < LIMIT_7D) process.exit(0);

  // Check if model param specifies a non-opus model
  const toolInput = getToolInput().toLowerCase();
  if (
    toolInput.includes("model") &&
    (toolInput.includes("sonnet") || toolInput.includes("haiku"))
  ) {
    process.exit(0);
  }

  // Determine which limit was exceeded and corresponding fallback model
  let exceededLimit = "";
  let fallbackModel = "";

  if (u5h >= LIMIT_5H && u7d >= LIMIT_7D) {
    // Both exceeded - use 7D fallback (more conservative)
    exceededLimit = `5시간(${u5h}%) 및 7일(${u7d}%)`;
    fallbackModel = FALLBACK_MODEL_7D;
  } else if (u5h >= LIMIT_5H) {
    exceededLimit = `5시간(${u5h}%)`;
    fallbackModel = FALLBACK_MODEL_5H;
  } else if (u7d >= LIMIT_7D) {
    exceededLimit = `7일(${u7d}%)`;
    fallbackModel = FALLBACK_MODEL_7D;
  }

  // Block
  const msg = [
    `⚡ [Usage Gate] ${exceededLimit} 사용률이 임계값을 초과했습니다.`,
    `   ${fallbackModel} 모델로 전환하세요.`,
    `   Example: Task({ ..., model: "${fallbackModel}" })`,
  ].join("\n");

  process.stderr.write(msg + "\n");
  process.exit(2);
}

main();
