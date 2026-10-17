import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildSalesLink} from '../social-sales-links.mjs';

test('Отслеживаемые ссылки указывают только на собственные проверенные предложения', () => {
  const yt=buildSalesLink({channel:'youtube',offer:'automation',campaign:'autumn-2026',content:'short-01'});
  const vk=buildSalesLink({channel:'vk',offer:'concert',campaign:'autumn-2026',content:'clip-01'});
  const a=new URL(yt.url),b=new URL(vk.url);
  assert.equal(a.origin,'https://quantdeus.ru');
  assert.equal(a.pathname,'/services/');
  assert.equal(a.searchParams.get('utm_source'),'youtube');
  assert.equal(a.searchParams.get('utm_medium'),'shorts');
  assert.equal(a.searchParams.get('utm_content'),'short-01');
  assert.equal(b.pathname,'/ksenia-cherednikova/');
  assert.equal(b.searchParams.get('utm_source'),'vk');
  assert.equal(b.searchParams.get('utm_medium'),'clips');
  assert.ok(vk.cta.includes('заявку'));
});

test('Запрещаем произвольные адреса и некорректные идентификаторы', () => {
  assert.throws(()=>buildSalesLink({channel:'spam',offer:'automation',campaign:'autumn-2026',content:'clip-01'}));
  assert.throws(()=>buildSalesLink({channel:'youtube',offer:'https://evil.example',campaign:'autumn-2026',content:'clip-01'}));
  assert.throws(()=>buildSalesLink({channel:'youtube',offer:'automation',campaign:'../foo',content:'clip-01'}));
  assert.throws(()=>buildSalesLink({channel:'youtube',offer:'automation',campaign:'autumn-2026',content:'c?api_key=leak'}));
});

function report(campaigns) {
  const dir=mkdtempSync(join(tmpdir(),'qd-sales-'));
  try {
    const file=join(dir,'scorecard.json');
    writeFileSync(file,JSON.stringify({campaigns}));
    return JSON.parse(execFileSync(process.execPath,[resolve('scripts/marketing-funnel-report.js'),file],{encoding:'utf8',timeout:5000}));
  } finally {rmSync(dir,{recursive:true,force:true});}
}
test('Не превращаем неизвестные показатели в ноль и выручку', () => {
  const d=report([{campaign_id:'c1',channel:'youtube',metrics:{visits:null,paid_orders:null,revenue_rub:null}}]);
  assert.equal(d.campaigns[0].metrics.visits,null);
  assert.equal(d.campaigns[0].metrics.paid_orders,null);
  assert.equal(d.campaigns[0].metrics.revenue_rub,null);
  assert.equal(d.aggregate_metrics.revenue_rub,null);
  assert.equal(d.aggregate_rates.visit_to_paid_order_pct,null);
  assert.equal(d.aggregate_rates.revenue_per_paid_order_rub,null);
});
test('Суммируем подтвержденные продажи и показываем пробелы данных', () => {
  const d=report([
    {campaign_id:'c1',metrics:{visits:100,paid_orders:2,revenue_rub:50000}},
    {campaign_id:'c2',metrics:{visits:40,paid_orders:1,revenue_rub:25000}}
  ]);
  assert.equal(d.aggregate_metrics.paid_orders,3);
  assert.equal(d.aggregate_metrics.revenue_rub,75000);
  assert.equal(d.aggregate_rates.revenue_per_paid_order_rub,25000);
  assert.equal(d.metrics_evidence_coverage.known_campaigns_by_metric.revenue_rub,2);
  const partial=report([
    {campaign_id:'c1',metrics:{paid_orders:2,revenue_rub:50000}},
    {campaign_id:'c2',metrics:{paid_orders:null,revenue_rub:null}}
  ]);
  assert.equal(partial.aggregate_metrics.paid_orders,null);
  assert.equal(partial.aggregate_metrics.revenue_rub,null);
});
