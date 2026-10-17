'use strict';

const fs = require('fs');

const file = process.argv[2] || 'coordination/growth/marketing-scorecard.json';
const scorecard = JSON.parse(fs.readFileSync(file, 'utf8'));
const campaigns = Array.isArray(scorecard.campaigns) ? scorecard.campaigns : [];

const safeNum = value => value !== null && value !== undefined && value !== '' && !Array.isArray(value) && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const rate = (a,b) => (a !== null && b !== null && b > 0) ? a / b : null;
const pct = value => value === null ? null : Math.round(value * 10000) / 100;

const rows = campaigns.map(c => {
  const m = c.metrics || {};
  const impressions=safeNum(m.impressions);
  const clicks=safeNum(m.clicks);
  const visits=safeNum(m.visits);
  const optIns=safeNum(m.opt_ins);
  const qualified=safeNum(m.qualified_leads);
  const conversions=safeNum(m.conversions);
  const retained=safeNum(m.retained);
  const unsub=safeNum(m.unsubscribes);
  const orders=safeNum(m.paid_orders);
  const revenueRub=safeNum(m.revenue_rub);
  return {
    campaign_id:String(c.campaign_id||''),
    owner_agent:String(c.owner_agent||''),
    funnel_stage:String(c.funnel_stage||''),
    channel:String(c.channel||''),
    evidence:Array.isArray(c.evidence)?c.evidence:[],
    metrics:{impressions,clicks,visits,opt_ins:optIns,qualified_leads:qualified,conversions,paid_orders:orders,revenue_rub:revenueRub,retained,unsubscribes:unsub},
    rates:{
      ctr_pct:pct(rate(clicks,impressions)),
      visit_to_opt_in_pct:pct(rate(optIns,visits)),
      opt_in_to_qualified_pct:pct(rate(qualified,optIns)),
      qualified_to_conversion_pct:pct(rate(conversions,qualified)),
      visit_to_paid_order_pct:pct(rate(orders,visits)),
      revenue_per_paid_order_rub:rate(revenueRub,orders) === null ? null : Math.round((revenueRub / orders) * 100) / 100,
      conversion_to_retained_pct:pct(rate(retained,conversions)),
      unsubscribe_per_opt_in_pct:pct(rate(unsub,optIns))
    }
  };
});

const metricNames=['impressions','clicks','visits','opt_ins','qualified_leads','conversions','paid_orders','revenue_rub','retained','unsubscribes'];
// Не выдавать неполные суммы кампаний за общий итог; ноль != неизвестно.
const aggregate=Object.fromEntries(metricNames.map(key => [key,
  rows.length > 0 && rows.every(row => row.metrics[key] !== null)
    ? rows.reduce((sum,row)=>sum + row.metrics[key],0) : null
]));
const coverage=Object.fromEntries(metricNames.map(key => [key,
  rows.filter(row=>row.metrics[key] !== null).length
]));

const aggregateRates={
  ctr_pct:pct(rate(aggregate.clicks ?? null, aggregate.impressions ?? null)),
  visit_to_opt_in_pct:pct(rate(aggregate.opt_ins ?? null, aggregate.visits ?? null)),
  opt_in_to_qualified_pct:pct(rate(aggregate.qualified_leads ?? null, aggregate.opt_ins ?? null)),
  qualified_to_conversion_pct:pct(rate(aggregate.conversions ?? null, aggregate.qualified_leads ?? null)),
  conversion_to_retained_pct:pct(rate(aggregate.retained ?? null, aggregate.conversions ?? null)),
  unsubscribe_per_opt_in_pct:pct(rate(aggregate.unsubscribes ?? null, aggregate.opt_ins ?? null)),
  visit_to_paid_order_pct:pct(rate(aggregate.paid_orders, aggregate.visits)),
  revenue_per_paid_order_rub:aggregate.paid_orders > 0 && aggregate.revenue_rub !== null ? Math.round((aggregate.revenue_rub / aggregate.paid_orders)*100)/100 : null
};

const report={
  generated_at:new Date().toISOString(),
  source:file,
  campaigns:rows,
  aggregate_metrics:aggregate,
  aggregate_rates:aggregateRates,
  metrics_evidence_coverage:{campaigns:rows.length,known_campaigns_by_metric:coverage},
  note:'Неизвестные значения остаются null, а не нулём. Продажи и выручка должны подтверждаться заказами/кассой и проверяемыми источниками, а не просмотрами.'
};
console.log(JSON.stringify(report,null,2));
