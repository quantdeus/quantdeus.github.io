const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { doctrineSummary } = require('./doctrine');

const PILLARS = [
  { id: 1, name: 'energy', title: '⚡ Energy Future' },
  { id: 2, name: 'justice', title: '⚖️ Algorithmic Justice' },
  { id: 3, name: 'unity', title: '🌍 Planetary Unity' },
  { id: 4, name: 'space', title: '🚀 Space Expansion' },
  { id: 5, name: 'potential', title: '🧬 Human Potential' },
  { id: 6, name: 'synthesis', title: '✨ Synthesis Aesthetics' },
];

function selectPillars(value = 'all') {
  const names = value.split(',').map(name => name.trim()).filter(Boolean);
  if (names.length === 1 && names[0] === 'all') return PILLARS;
  if (names.length === 0) {
    throw new Error(`PILLARS must be "all" or a comma-separated list of: ${PILLARS.map(p => p.name).join(', ')}`);
  }

  const unknown = [...new Set(names.filter(name => !PILLARS.some(p => p.name === name)))];
  if (unknown.length) {
    throw new Error(`Unknown PILLARS value(s): ${unknown.join(', ')}. Expected "all" or: ${PILLARS.map(p => p.name).join(', ')}`);
  }

  const requested = new Set(names);
  return PILLARS.filter(p => requested.has(p.name));
}

async function run() {
  const doctrine = doctrineSummary();
  const activePillars = selectPillars(process.env.PILLARS || 'all');
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const pillar of activePillars) {
      console.log(`Scanning ${pillar.title}...`);
      try {
        const scriptPath = path.join(__dirname, `pillar_${String(pillar.id).padStart(2, '0')}_${pillar.name}.js`);
        if (fs.existsSync(scriptPath)) {
          const scanner = require(scriptPath);
          const result = await scanner.scan(browser);
          results.push({ pillar: pillar.title, status: 'ok', data: result });
        }
      } catch (err) {
        results.push({ pillar: pillar.title, status: 'error', error: err.message });
      }
    }
    fs.writeFileSync('/tmp/quantdeus-report.json', JSON.stringify({ timestamp: new Date().toISOString(), doctrine, results }, null, 2));
    console.log('Report saved.');
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  run().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { selectPillars };
