'use strict';

const fs = require('fs');

const safeNum = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  if (typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const rate = (a,b) => (a !== null && b !== null && b > 0) ? a / b : null;
const pct = value => value === null ? null : Math.round(value * 10000) / 100;

const RATE_DEFS = {
  ctr_pct: ['clicks','impressions'],
  visit_to_opt_in_pct: ['opt_ins','visits'],
  opt_in_to_qualified_pct: ['qualified_leads','opt_ins'],
  qualified_to_conversion_pct: ['conversions','qualified_leads'],
  conversion_to_retained_pct: ['retained','conversions'],
  unsubscribe_per_opt_in_pct: ['unsubscribes','opt_ins']
};

function normalizeCampaign(c = {}) {
  const m = c.metrics || {};
  const metrics = {
    impressions:safeNum(m.impressions),
    clicks:safeNum(m.clicks),
    visits:safeNum(m.visits),
    opt_ins:safeNum(m.opt_ins),
    qualified_leads:safeNum(m.qualified_leads),
    conversions:safeNum(m.conversions),
    retained:safeNum(m.retained),
    unsubscribes:safeNum(m.unsubscribes)
  };
  const rates = {};
  for (const [name,[numerator,denominator]] of Object.entries(RATE_DEFS)) {
    rates[name] = pct(rate(metrics[numerator], metrics[denominator]));
  }
  return {
    campaign_id:String(c.campaign_id||''),
    owner_agent:String(c.owner_agent||''),
    funnel_stage:String(c.funnel_stage||''),
    channel:String(c.channel||''),
    evidence:Array.isArray(c.evidence)?c.evidence:[],
    metrics,
    rates
  };
}

function aggregateMetrics(rows) {
  return rows.reduce((acc,row)=>{
    for(const [key,value] of Object.entries(row.metrics)){
      if(value !== null) acc[key]=(acc[key]||0)+value;
    }
    return acc;
  },{});
}

function matchedCohortRate(rows, numerator, denominator) {
  let numeratorTotal = 0;
  let denominatorTotal = 0;
  let matchedCampaigns = 0;
  for (const row of rows) {
    const n = row.metrics[numerator];
    const d = row.metrics[denominator];
    if (n === null || d === null) continue;
    numeratorTotal += n;
    denominatorTotal += d;
    matchedCampaigns += 1;
  }
  return {
    value:pct(rate(matchedCampaigns ? numeratorTotal : null, matchedCampaigns ? denominatorTotal : null)),
    matched_campaigns:matchedCampaigns
  };
}

function buildReport(scorecard = {}, source = 'coordination/growth/marketing-scorecard.json') {
  const campaigns = Array.isArray(scorecard.campaigns) ? scorecard.campaigns : [];
  const rows = campaigns.map(normalizeCampaign);
  const aggregate = aggregateMetrics(rows);
  const aggregateRates = {};
  const aggregateRateCohorts = {};
  for (const [name,[numerator,denominator]] of Object.entries(RATE_DEFS)) {
    const cohort = matchedCohortRate(rows,numerator,denominator);
    aggregateRates[name] = cohort.value;
    aggregateRateCohorts[name] = cohort.matched_campaigns;
  }
  return {
    generated_at:new Date().toISOString(),
    source,
    campaigns:rows,
    aggregate_metrics:aggregate,
    aggregate_rates:aggregateRates,
    aggregate_rate_cohorts:aggregateRateCohorts,
    note:'Unknown/null/blank metrics remain null. Aggregate rates use only campaigns where both numerator and denominator are known; unmatched campaigns never cross-contaminate a rate.'
  };
}

if (require.main === module) {
  const file = process.argv[2] || 'coordination/growth/marketing-scorecard.json';
  const scorecard = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(buildReport(scorecard,file),null,2));
}

module.exports = { safeNum, buildReport, matchedCohortRate };
