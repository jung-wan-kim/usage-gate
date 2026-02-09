#!/usr/bin/env node
// usage-tracker.js
// UserPromptSubmit Hook: Fetch real-time usage from Anthropic Usage API
//
// Fetches 5-hour and 7-day utilization, caches the result,
// and displays warnings when approaching or exceeding thresholds.

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const CACHE_DIR =
  process.env.CLAUDE_USAGE_CACHE_DIR ||
  (process.platform === "win32"
    ? path.join(os.tmpdir(), "claude-usage-gate")
    : "/tmp");
const CACHE_FILE = path.join(CACHE_DIR, "claude-usage-gate-cache.json");
const LIMIT_5H = parseInt(process.env.CLAUDE_OPUS_LIMIT_5H || "90", 10);
const LIMIT_7D = parseInt(process.env.CLAUDE_OPUS_LIMIT_7D || "90", 10);
const CACHE_TTL = parseInt(process.env.CLAUDE_USAGE_CACHE_TTL || "60", 10);

// --- OAuth token retrieval (cross-platform) ---
function getToken() {
  // 1. Environment variable (all platforms)
  if (process.env.ANTHROPIC_ACCESS_TOKEN) {
    return process.env.ANTHROPIC_ACCESS_TOKEN;
  }

  // 2. macOS Keychain
  if (process.platform === "darwin") {
    try {
      const raw = execFileSync(
        "security",
        ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      const creds = JSON.parse(raw);
      const token = creds?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {}
  }

  // 3. Windows Credential Manager
  if (process.platform === "win32") {
    try {
      const raw = execFileSync(
        "powershell",
        [
          "-Command",
          "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String((cmdkey /generic:'Claude Code-credentials' /pass 2>$null)))",
        ],
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      if (raw) {
        const creds = JSON.parse(raw);
        const token = creds?.claudeAiOauth?.accessToken;
        if (token) return token;
      }
    } catch {}
  }

  // 4. Credential files (Linux / fallback)
  const credPaths = [
    path.join(os.homedir(), ".claude", "credentials.json"),
    path.join(os.homedir(), ".config", "claude", "credentials.json"),
  ];
  for (const p of credPaths) {
    try {
      const creds = JSON.parse(fs.readFileSync(p, "utf8"));
      const token = creds?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch {}
  }

  return null;
}

// --- Cache validation ---
function isCacheValid() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    const age = Math.floor(Date.now() / 1000) - (data.cached_at || 0);
    return age < CACHE_TTL;
  } catch {
    return false;
  }
}

// --- API fetch ---
function fetchUsage(token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/api/oauth/usage",
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "anthropic-beta": "oauth-2025-04-20",
        },
        timeout: 5000,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            if (!data.five_hour && !data.seven_day) {
              return reject(new Error("Invalid response"));
            }
            const cache = {
              five_hour: data.five_hour || {},
              seven_day: data.seven_day || {},
              cached_at: Math.floor(Date.now() / 1000),
            };
            fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
            resolve(cache);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
    req.end();
  });
}

// --- Display usage status ---
function displayStatus(data) {
  const u5h = data.five_hour?.utilization ?? 0;
  const u7d = data.seven_day?.utilization ?? 0;
  const exceeded = u5h >= LIMIT_5H || u7d >= LIMIT_7D;
  const warning = u5h >= LIMIT_5H - 15 || u7d >= LIMIT_7D - 15;

  if (exceeded) {
    process.stderr.write(
      `⚡ [Usage Gate] 5h:${u5h}% 7d:${u7d}% | Sub-agent: sonnet auto-applied\n`
    );
  } else if (warning) {
    process.stderr.write(
      `📊 [Usage Gate] 5h:${u5h}% 7d:${u7d}% | Approaching threshold (${LIMIT_5H}%)\n`
    );
  }
}

// --- Main ---
async function main() {
  // Ensure cache directory exists (Windows uses a subdirectory)
  if (!fs.existsSync(CACHE_DIR)) {
    try {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    } catch {}
  }

  if (!isCacheValid()) {
    const token = getToken();
    if (token) {
      try {
        await fetchUsage(token);
      } catch {}
    }
  }

  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    displayStatus(data);
  } catch {}

  process.exit(0);
}

main();
