import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { planDueMessages } from "./newsletter-engine.mjs";

const cfg = JSON.parse(fs.readFileSync("coordination/growth/newsletter-autofunnels.json", "utf8"));
if (cfg.status !== "dry-run-only" ||
    cfg.delivery.external_send_enabled !== false ||
    cfg.delivery.provider !== null ||
    cfg.delivery.real_subscriber_fetch_enabled !== false ||
    process.env.QD_NEWSLETTER_SEND_ENABLED !== "false") {
  throw new Error("Fail closed: dry-run activation guard");
}

// Fixture only. No recipient email address, subscriber database, or network request.
const now = new Date("2026-10-30T12:00:00Z");
const fixtures = [
  { id:"synthetic-01", state:"confirmed", source:"newsletter_form", confirmed_at:"2026-10-20T12:00:00Z",
    consent:{ source:"newsletter_form", checked:true, version:"pilot-v1", timestamp:"2026-10-20T11:50:00Z" },
    topics:["eco"], sent_message_ids:["eco-welcome"], last_marketing_at:"2026-10-20T12:00:00Z" },
  { id:"synthetic-02", state:"pending_confirmation", source:"newsletter_form",
    consent:{ source:"newsletter_form", checked:true, version:"pilot-v1", timestamp:"2026-10-20T11:50:00Z" },
    topics:["ai"], sent_message_ids:[] }
];
const planned = planDueMessages(fixtures, cfg, now);
const report = {
  mode:"synthetic-dry-run",
  orchestration:"GitHub Actions",
  source:"static non-personal fixture",
  selected_topics:Object.keys(cfg.segments),
  mock_subscribers:fixtures.length,
  planned_mock_messages:planned.length,
  external_send_enabled:false,
  external_messages_sent:0,
  real_subscribers_accessed:0,
  note:"No contact lists loaded. No email provider connected. No network calls or CRM writes."
};
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "## QuantDeus Newsletter — dry-run only\n\n" +
    "- Synthetic records: " + report.mock_subscribers + "\n" +
    "- Eligible planned mock messages: " + report.planned_mock_messages + "\n" +
    "- **External emails: 0**\n\n" +
    "No real subscribers, external requests, marketing sends, or CRM writes.\n");
}
