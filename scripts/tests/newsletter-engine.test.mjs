import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { planDueMessages } from "../newsletter-engine.mjs";

const config = JSON.parse(fs.readFileSync("coordination/growth/newsletter-autofunnels.json", "utf8"));
const now = new Date("2026-10-30T12:00:00Z");
const fixture = (patch={}) => ({
  id:"synthetic-one",
  source:"newsletter_form",
  state:"confirmed",
  confirmed_at:"2026-10-10T12:00:00Z",
  consent:{source:"newsletter_form",checked:true,version:"pilot-v1",timestamp:"2026-10-10T11:59:00Z"},
  topics:["eco"],
  sent_message_ids:[],
  last_marketing_at:null,
  ...patch
});

test("confirmed opt-in may plan one synthetic welcome email", () => {
  const out=planDueMessages([fixture()],config,now);
  assert.equal(out.length,1);
  assert.equal(out[0].message_id,"eco-welcome");
});

test("pending, unsubscribed, paused, and suppressed are never eligible", () => {
  for(const state of ["pending_confirmation","unsubscribed","paused","suppressed"]){
    assert.deepEqual(planDueMessages([fixture({state})],config,now),[]);
  }
});

test("GitHub issue is not marketing consent", () => {
  assert.deepEqual(planDueMessages([fixture({source:"github_issue"})],config,now),[]);
  assert.deepEqual(planDueMessages([fixture({consent:{source:"github_issue",checked:true,version:"v1",timestamp:"2026-10-10T11:59:00Z"}})],config,now),[]);
});

test("missing verified marketing consent fails closed", () => {
  assert.deepEqual(planDueMessages([fixture({consent:{checked:false}})],config,now),[]);
  assert.deepEqual(planDueMessages([fixture({confirmed_at:null})],config,now),[]);
});

test("last send within seven days blocks all topics", () => {
  assert.deepEqual(planDueMessages([fixture({topics:["eco","ai"],last_marketing_at:"2026-10-29T12:00:00Z"})],config,now),[]);
});

test("sent message ids prevent duplicate planning", () => {
  const res=planDueMessages([fixture({sent_message_ids:["eco-welcome","eco-vision","eco-research"]})],config,now);
  assert.equal(res.length,0);
});

test("a single subscriber never gets more than one marketing message in one plan", () => {
  const out=planDueMessages([fixture({topics:["eco","ai","media"]}), fixture({topics:["books"]})],config,now);
  assert.equal(out.length,1);
});

test("send-enabled configuration is rejected", () => {
  const unsafe=structuredClone(config);
  unsafe.delivery.external_send_enabled=true;
  assert.throws(()=>planDueMessages([fixture()],unsafe,now),/Fail closed/);
});

test("real subscriber fetching is rejected", () => {
  const unsafe=structuredClone(config);
  unsafe.delivery.real_subscriber_fetch_enabled=true;
  assert.throws(()=>planDueMessages([fixture()],unsafe,now),/Fail closed/);
});

test("future or out-of-order confirmation is not eligible", () => {
  assert.deepEqual(planDueMessages([fixture({confirmed_at:"2026-11-01T12:00:00Z"})],config,now),[]);
  assert.deepEqual(planDueMessages([fixture({consent:{source:"newsletter_form",checked:true,version:"v1",timestamp:"2026-10-20T12:00:00Z"}})],config,now),[]);
});
