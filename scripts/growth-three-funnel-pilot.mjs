import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('coordination/growth/three-funnel-pipeline.json','utf8'));
const required=['community','automation','concert'];
for(const key of required){if(!config.funnels[key]?.destination?.startsWith('https://'))throw Error('Invalid funnel '+key);}
if(config.rules.external_send_enabled || !config.rules.dry_run)throw Error('Pilot must remain dry-run');
if(config.rules.max_messages_per_day>100 || config.rules.max_vk_messages_per_day>10)throw Error('Message caps exceeded');
const report={mode:'dry-run',date:new Date().toISOString(),funnels:required.map(id=>({id,owner:config.funnels[id].owner,cta:config.funnels[id].cta,destination:config.funnels[id].destination,status:'configured-not-sent'})),outbound_messages:0,leads_collected:0,conversions_verified:0,warning:'No discovery, outreach, CRM writes or external API calls were performed.'};
console.log(JSON.stringify(report,null,2));
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## QuantDeus three-funnel pilot\n\n'+required.map(id=>'- '+id+': configured (dry-run)').join('\n')+'\n\nNo external messages sent.\n');
