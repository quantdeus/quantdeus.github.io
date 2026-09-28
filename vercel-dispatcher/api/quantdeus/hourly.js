const REPO = "quantdeus/quantdeus.github.io";
const ISSUE = 154;
const DOCTRINE_VERSION = "2026.09-post-scarcity-v3";
const MANIFEST_ID = "neon-horizon-v3";
const MANIFEST_NAME = "Манифест Неонового Горизонта — QuantDeus v3.0";
const MANIFEST_ARCHIVE = "Dropbox /quantdeus/QuantDeus_Manifest_Neon_Horizon_v3.0.pdf";

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers?.authorization || "";
  return auth === `Bearer ${secret}`;
}

async function github(path, options = {}) {
  const token = process.env.QUANTDEUS_GITHUB_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    headers
  });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok) {
    throw new Error(`GitHub ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const readOnly = req.method === "GET";

  // GET is a public read-only pulse.
  // POST is reserved for the protected execution path.
  if (!readOnly && !authorized(req)) {
    return res.status(401).json({ ok: false, error: "vercel_cron_auth_failed" });
  }

  const startedAt = new Date().toISOString();

  try {
    const [repo, issues, pulls] = await Promise.all([
      github(""),
      github("/issues?state=open&per_page=30&sort=updated&direction=desc"),
      github("/pulls?state=open&per_page=30&sort=updated&direction=desc")
    ]);

    const issueOnly = issues.filter(item => !item.pull_request);
    const actionable = issueOnly
      .filter(item => (item.labels || []).some(label => ["coord:ready", "coord:active"].includes(label.name)))
      .map(item => ({
        number: item.number,
        title: item.title,
        labels: (item.labels || []).map(label => label.name),
        updated_at: item.updated_at,
        html_url: item.html_url
      }));

    return res.status(200).json({
      ok: true,
      status: readOnly ? "dispatcher_readonly_pulse" : "dispatcher_bootstrap_ready",
      started_at: startedAt,
      source_of_truth: REPO,
      dispatcher_issue: ISSUE,
      doctrine: {
        version: DOCTRINE_VERSION,
        manifest_id: MANIFEST_ID,
        manifest_name: MANIFEST_NAME,
        manifest_archive: MANIFEST_ARCHIVE
      },
      repository: {
        default_branch: repo.default_branch,
        pushed_at: repo.pushed_at
      },
      queue: actionable.slice(0, 10),
      open_prs: pulls.slice(0, 10).map(pr => ({
        number: pr.number,
        title: pr.title,
        updated_at: pr.updated_at,
        html_url: pr.html_url
      })),
      execution: {
        mode: readOnly ? "read-only" : "protected",
        state: "pending_mcp_execution_adapter",
        note: readOnly
          ? "Read-only pulse: reads canonical GitHub state only and performs no GitHub writes."
          : "Protected dispatcher path. Project writes must use the approved GitHub execution adapter."
      }
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "dispatcher_bootstrap_failed",
      detail: String(error?.message || error)
    });
  }
}
