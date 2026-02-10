#!/usr/bin/env node
// usage-gate statusline
// Displays usage-gate status persistently under the Claude Code prompt.
//
// Reads session JSON from stdin (Claude Code status line protocol),
// reads cached usage data, and outputs a formatted status bar.
//
// Can optionally chain with another statusline command (e.g., claude-dashboard)
// by setting USAGE_GATE_CHAIN_CMD environment variable.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

// ─── Colors (ANSI 256) ───────────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[38;5;151m",    // mint - safe
  yellow: "\x1b[38;5;222m",   // warm - warning
  red: "\x1b[38;5;210m",      // coral - danger
  cyan: "\x1b[38;5;117m",     // soft cyan - label
  gray: "\x1b[38;5;249m",     // light gray - secondary
  dimGray: "\x1b[38;5;242m",  // dim gray - separator
  orange: "\x1b[38;5;216m",   // soft orange - fallback
};

const SEP = `${C.dimGray}\u2502${C.reset}`;

// ─── Config ──────────────────────────────────────────────────────────
const CACHE_DIR =
  process.env.CLAUDE_USAGE_CACHE_DIR ||
  (process.platform === "win32"
    ? path.join(os.tmpdir(), "claude-usage-gate")
    : "/tmp");
const CACHE_FILE = path.join(CACHE_DIR, "claude-usage-gate-cache.json");
const LIMIT_5H = parseInt(process.env.CLAUDE_OPUS_LIMIT_5H || "90", 10);
const LIMIT_7D = parseInt(process.env.CLAUDE_OPUS_LIMIT_7D || "90", 10);
const FALLBACK_5H = process.env.CLAUDE_FALLBACK_MODEL_5H || "sonnet";
const FALLBACK_7D = process.env.CLAUDE_FALLBACK_MODEL_7D || "sonnet";
const GATE_ENABLED = process.env.CLAUDE_USAGE_GATE_ENABLED !== "false";
const CHAIN_CMD = process.env.USAGE_GATE_CHAIN_CMD || "";

// ─── Helpers ─────────────────────────────────────────────────────────
function colorForPercent(pct, limit) {
  if (pct >= limit) return C.red;
  if (pct >= limit * 0.8) return C.yellow;
  return C.green;
}

function readStdin() {
  try {
    const chunks = [];
    const fd = fs.openSync("/dev/stdin", "r");
    const buf = Buffer.alloc(65536);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length)) > 0) {
      chunks.push(buf.slice(0, n));
    }
    fs.closeSync(fd);
    return Buffer.concat(chunks).toString("utf-8");
  } catch {
    return "";
  }
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function formatModel(model) {
  const m = (model || "").toLowerCase();
  if (m.includes("sonnet")) return "S";
  if (m.includes("haiku")) return "H";
  if (m.includes("opus")) return "O";
  return m.charAt(0).toUpperCase();
}

// ─── Format Status ───────────────────────────────────────────────────
function formatGateStatus(cache) {
  if (!cache) {
    return `${C.dim}[Usage Gate] no data${C.reset}`;
  }

  const u5h = cache.five_hour?.utilization ?? 0;
  const u7d = cache.seven_day?.utilization ?? 0;
  const ex5h = u5h >= LIMIT_5H;
  const ex7d = u7d >= LIMIT_7D;
  const anyExceeded = ex5h || ex7d;

  // Gate disabled
  if (!GATE_ENABLED) {
    const c5 = colorForPercent(u5h, LIMIT_5H);
    const c7 = colorForPercent(u7d, LIMIT_7D);
    return [
      `${C.dim}Gate OFF${C.reset}`,
      SEP,
      `${C.gray}5h ${c5}${u5h}%${C.reset}`,
      SEP,
      `${C.gray}7d ${c7}${u7d}%${C.reset}`,
    ].join(" ");
  }

  // Gate enabled - build segments
  const parts = [];

  // Gate icon + status
  if (anyExceeded) {
    parts.push(`${C.orange}Gate${C.reset} ${C.red}ACTIVE${C.reset}`);
  } else {
    parts.push(`${C.green}Gate${C.reset} ${C.dim}standby${C.reset}`);
  }

  // 5-hour segment
  const c5 = colorForPercent(u5h, LIMIT_5H);
  if (ex5h) {
    parts.push(
      `${C.gray}5h ${c5}${u5h}%${C.reset}${C.dim}/${LIMIT_5H}%${C.reset} ${C.orange}\u2192${formatModel(FALLBACK_5H)}${C.reset}`
    );
  } else {
    parts.push(
      `${C.gray}5h ${c5}${u5h}%${C.reset}${C.dim}/${LIMIT_5H}%${C.reset}`
    );
  }

  // 7-day segment
  const c7 = colorForPercent(u7d, LIMIT_7D);
  if (ex7d) {
    parts.push(
      `${C.gray}7d ${c7}${u7d}%${C.reset}${C.dim}/${LIMIT_7D}%${C.reset} ${C.orange}\u2192${formatModel(FALLBACK_7D)}${C.reset}`
    );
  } else {
    parts.push(
      `${C.gray}7d ${c7}${u7d}%${C.reset}${C.dim}/${LIMIT_7D}%${C.reset}`
    );
  }

  return parts.join(` ${SEP} `);
}

// ─── Chain with another statusline ───────────────────────────────────
function runChainCmd(stdinStr) {
  if (!CHAIN_CMD) return null;
  try {
    // Parse CHAIN_CMD into command and args
    const parts = CHAIN_CMD.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);
    const result = execFileSync(cmd, args, {
      input: stdinStr,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch {
    return null;
  }
}

// ─── Main ────────────────────────────────────────────────────────────
function main() {
  const stdinStr = readStdin();
  const cache = readCache();
  const gateLine = formatGateStatus(cache);

  // If chaining, run the other statusline first
  const chainOutput = runChainCmd(stdinStr);

  if (chainOutput) {
    // Output chain first, then gate status as second line
    console.log(chainOutput);
    console.log(gateLine);
  } else {
    console.log(gateLine);
  }
}

main();
