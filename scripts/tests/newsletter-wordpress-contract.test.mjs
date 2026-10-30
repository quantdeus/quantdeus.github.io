import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("coordination/growth/newsletter-autofunnels.json","utf8"));
const drafts = JSON.parse(fs.readFileSync("coordination/growth/newsletter-message-drafts.json","utf8"));

test("WordPress владеет будущей рассылкой; GitHub только тестирует", () => {
  assert.equal(config.wordpress.crm_plugin,"groundhogg");
  assert.equal(config.wordpress.transport_plugin,"fluent-smtp");
  assert.equal(config.wordpress.queue_owner,"groundhogg");
  assert.equal(config.wordpress.github_actions_role,"ci-and-synthetic-dry-run-only");
  assert.equal(config.orchestrator,"github-actions-ci-dry-run-only");
  assert.equal(config.delivery.external_send_enabled,false);
  assert.equal(config.delivery.real_subscriber_fetch_enabled,false);
  assert.equal(config.delivery.provider,null);
  assert.equal(config.delivery.contact_store,"none-configured");
  assert.equal(config.wordpress.plugin_installation_approved_on_production,false);
  assert.equal(config.wordpress.mail_service_provider_approved,false);
});
test("Требования подтверждения и отписки зафиксированы до staging", () => {
  const s=config.wordpress.staging_requirements;
  assert.equal(s.only_send_to_confirmed,true);
  assert.equal(s.confirmation_grace_period_days,0);
  assert.equal(s.enable_gdpr_features,true);
  assert.equal(s.do_not_send_email_without_consent,true);
  assert.equal(s.consent_checkbox_default_checked,false);
  assert.equal(s.honour_global_frequency_days,7);
  assert.equal(s.single_active_topic_until_cross_topic_cap_verified,true);
  assert.equal(s.working_unsubscribe_and_suppression,true);
  assert.equal(config.delivery.multi_topic_delivery_enabled,false);
});
test("Каждое письмо имеет проверяемую посадочную страницу и ссылку отписки", () => {
  assert.equal(drafts.status,"draft-only-no-send");
  const ids=new Set();
  const welcomes=[];
  for(const [segmentId,segment] of Object.entries(config.segments)){
    assert.ok(["eco","books","ai","media"].includes(segmentId));
    for(const message of segment.messages){
      assert.ok(!ids.has(message.id),"Message ID reused");
      ids.add(message.id);
      const draft=drafts.messages[message.id];
      assert.ok(draft && draft.preview === true, "Missing preview "+message.id);
      assert.ok(draft.body_plain.includes("{{cta_url}}"));
      assert.ok(draft.body_plain.includes("{{unsubscribe_url}}"));
      assert.ok(draft.body_plain.includes("{{preferences_url}}"));
      assert.ok(draft.body_plain.length > 140);
      assert.match(message.url,/^https:\/\/quantdeus\.ru\/[a-z0-9/-]+\/$/);
      assert.ok(message.subject && message.subject.length >= 5);
      assert.ok(draft.cta_label.length >= 4);
      if(message.after_days===0)welcomes.push(segmentId);
    }
  }
  assert.equal(ids.size,10);
  assert.equal(Object.keys(drafts.messages).length,10);
  assert.deepEqual(welcomes.sort(),["ai","books","eco","media"]);
});
test("Нет ложных метрик или автоматической публикации",()=>{
  assert.equal(config.delivery.public_newsletter_signup_enabled,false);
  assert.equal(config.delivery.secure_private_subscriber_storage_verified,false);
  assert.equal(config.delivery.unsubscribe_endpoint_verified,false);
  assert.equal(config.delivery.sender_identity_verified,false);
  for(const v of Object.values(config.measured)) assert.equal(v,null);
  assert.equal(config.consent.github_issue_is_not_newsletter_consent,true);
});
