'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { safeNum, buildReport } = require('../marketing-funnel-report');

test('unknown marketing metrics remain null instead of coercing to zero', () => {
  assert.equal(safeNum(null), null);
  assert.equal(safeNum(undefined), null);
  assert.equal(safeNum(''), null);
  assert.equal(safeNum('   '), null);
  assert.equal(safeNum(false), null);
  assert.equal(safeNum('0'), 0);
  assert.equal(safeNum(7), 7);
});

test('aggregate CTR and conversion rates use only matching campaign cohorts', () => {
  const report = buildReport({
    campaigns: [
      {campaign_id:'impressions-only',metrics:{impressions:100,clicks:null,qualified_leads:10,conversions:null}},
      {campaign_id:'numerators-only',metrics:{impressions:null,clicks:10,qualified_leads:null,conversions:3}},
      {campaign_id:'matched',metrics:{impressions:100,clicks:20,qualified_leads:5,conversions:2}}
    ]
  }, 'fixture');
  assert.equal(report.campaigns[0].metrics.clicks, null);
  assert.equal(report.campaigns[1].metrics.impressions, null);
  assert.equal(report.aggregate_rates.ctr_pct, 20);
  assert.equal(report.aggregate_rate_cohorts.ctr_pct, 1);
  assert.equal(report.aggregate_rates.qualified_to_conversion_pct, 40);
  assert.equal(report.aggregate_rate_cohorts.qualified_to_conversion_pct, 1);
});

test('aggregate rate stays unknown when no campaign has both sides of the rate', () => {
  const report = buildReport({
    campaigns: [
      {campaign_id:'a',metrics:{impressions:100,clicks:null}},
      {campaign_id:'b',metrics:{impressions:null,clicks:9}}
    ]
  }, 'fixture');
  assert.equal(report.aggregate_rates.ctr_pct, null);
  assert.equal(report.aggregate_rate_cohorts.ctr_pct, 0);
});
