#!/usr/bin/env node
/**
 * QuantDeus Galactic Mesh: live, read-only GitHub MCP handshake.
 *
 * Calls the actual github/github-mcp-server over MCP stdio; fetches the real
 * canonical GitHub Issue. No mock agents, simulated answers or social posting.
 * Invoked manually by .github/workflows/galactic-mcp-live.yml.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const REPOSITORY = "quantdeus/quantdeus.github.io";
const MCP_IMAGE = "ghcr.io/github/github-mcp-server:v2.0.2";
const repository = process.env.GITHUB_REPOSITORY || REPOSITORY;
const issueNumber = Number(process.env.ISSUE_NUMBER || "554");
const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (repository !== REPOSITORY) throw new Error("Canonical repository mismatch; refusing the MCP call");
if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 || issueNumber > 1000000) {
  throw new Error("ISSUE_NUMBER must be a valid positive integer");
}
if (!token) throw new Error("GITHUB_PERSONAL_ACCESS_TOKEN missing (provide ephemeral GITHUB_TOKEN in Actions)");

const registry = JSON.parse(readFileSync("coordination/agents.json", "utf8"));
if (!Array.isArray(registry.agents) || !registry.agents.some(a => a.id === "seven-of-nine")) {
  throw new Error("Canonical QuantDeus agent registry unavailable");
}
const timeoutMs = 45000;
const command = "docker";
const args = [
  "run", "--rm", "-i",
  "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
  "--pids-limit", "64", "--memory", "256m", "--cpus", "1",
  "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
  "-e", "GITHUB_TOOLSETS=issues",
  "-e", "GITHUB_READ_ONLY=1",
  MCP_IMAGE,
];
const child = spawn(command, args, {
  env: { PATH: process.env.PATH, GITHUB_PERSONAL_ACCESS_TOKEN: token },
  stdio: ["pipe", "pipe", "pipe"],
});
const pending = new Map();
let nextId = 0;
let buffered = "";
let stderrTail = "";
let stopped = false;

function rejectPending(error) {
  if (stopped) return;
  stopped = true;
  for (const [, p] of pending) {
    clearTimeout(p.timer);
    p.reject(error);
  }
  pending.clear();
}
child.on("error", error => rejectPending(new Error("GitHub MCP server process failed: " + error.message)));
child.on("exit", (code, signal) => rejectPending(new Error("GitHub MCP server exited: " + (signal || code))));
child.stderr.setEncoding("utf8");
child.stderr.on("data", chunk => {
  // Keep only a short local diagnostic; never echo token or raw stderr to logs.
  stderrTail = (stderrTail + String(chunk)).slice(-512);
});
child.stdout.setEncoding("utf8");
child.stdout.on("data", chunk => {
  buffered += String(chunk);
  if (buffered.length > 4000000) {
    rejectPending(new Error("MCP response too large"));
    child.kill("SIGTERM");
    return;
  }
  let newline;
  while ((newline = buffered.indexOf("\n")) >= 0) {
    const line = buffered.slice(0, newline).trim();
    buffered = buffered.slice(newline + 1);
    if (!line) continue;
    let message;
    try { message = JSON.parse(line); }
    catch { rejectPending(new Error("Malformed MCP JSON-RPC response")); return; }
    if (message.id === undefined || message.id === null) continue;
    const p = pending.get(message.id);
    if (!p) continue;
    pending.delete(message.id);
    clearTimeout(p.timer);
    if (message.error) p.reject(new Error("MCP server returned error " + message.error.code));
    else p.resolve(message.result);
  }
});
function send(message) {
  if (stopped || !child.stdin.writable) throw new Error("MCP transport unavailable");
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");
}
function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timed out during MCP " + method));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { send({ id, method, params }); }
    catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
  });
}
function unpackIssue(response) {
  if (!response || response.isError) throw new Error("MCP issue_read failed");
  const candidates = [response.structuredContent];
  for (const part of response.content || []) {
    if (part.type === "text" && typeof part.text === "string") {
      try { candidates.push(JSON.parse(part.text)); } catch { /* not a structured issue */ }
    }
  }
  for (const candidate of candidates) {
    const issue = candidate?.issue || candidate?.result?.issue || candidate;
    if (Number(issue?.number) === issueNumber &&
        typeof issue.title === "string" &&
        issue.html_url === "https://github.com/" + REPOSITORY + "/issues/" + issueNumber) {
      return issue;
    }
  }
  throw new Error("MCP response did not verify canonical Issue identity");
}
try {
  const initialized = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "quantdeus-galactic-mesh", version: "0.1.0" },
  });
  if (!initialized?.serverInfo?.name) throw new Error("MCP handshake was not acknowledged");
  send({ method: "notifications/initialized" });
  const listed = await request("tools/list", {});
  if (!listed?.tools?.some(t => t.name === "issue_read")) {
    throw new Error("GitHub MCP tool issue_read is not exposed");
  }
  const response = await request("tools/call", {
    name: "issue_read",
    arguments: {
      method: "get",
      owner: "quantdeus",
      repo: "quantdeus.github.io",
      issue_number: issueNumber,
    },
  });
  const issue = unpackIssue(response);
  const registered = registry.agents.length;
  const result = {
    status: "verified_live_mcp_read",
    timestamp: new Date().toISOString(),
    canonical_repository: REPOSITORY,
    mcp_server: initialized.serverInfo.name,
    mcp_transport: "stdio",
    mcp_tool: "issue_read",
    issue_number: issue.number,
    issue_url: issue.html_url,
    issue_title: issue.title,
    issue_state: issue.state,
    canonical_agents_registered: registered,
    live_agent_executions_proven_by_this_read: 0,
    calls_writing_external_content: 0,
    financial_spend_authorized: false,
  };
  console.log(JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      "## QuantDeus live GitHub MCP read\n\n" +
      "- MCP handshake: **verified**\n" +
      "- Issue: " + issue.html_url + "\n" +
      "- Registered canonical agents: **" + registered + "** (not concurrent executions)\n" +
      "- External writes: **none**\n");
  }
} catch (error) {
  // Never print raw untrusted issue body, subprocess environment or stderr.
  console.error("QuantDeus MCP live check failed: " + error.message);
  process.exitCode = 1;
} finally {
  child.stdin.end();
  child.kill("SIGTERM");
}
