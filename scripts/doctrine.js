const fs = require('fs');
const path = require('path');

const DOCTRINE_PATH = path.join(process.cwd(), 'coordination', 'civilization-doctrine.json');

function loadDoctrine() {
  const doctrine = JSON.parse(fs.readFileSync(DOCTRINE_PATH, 'utf8'));
  if (doctrine.schema_version !== 1 || !doctrine.version || !Array.isArray(doctrine.execution_gates)) {
    throw new Error('Invalid civilization doctrine');
  }
  return doctrine;
}

function doctrineSummary() {
  const d = loadDoctrine();
  return {
    version: d.version,
    objective: d.objective,
    operating_rule: d.operating_rule,
    execution_gates: d.execution_gates,
  };
}

const PILLAR_QUERIES = {
  energy: 'clean abundant energy grid storage fusion renewables efficiency resource productivity closed loop energy evidence',
  justice: 'resource allocation public infrastructure automation access algorithmic accountability human override privacy abundance economics',
  unity: 'open science voluntary cooperation ecological restoration circular systems climate resilience community infrastructure',
  space: 'space life support photobioreactor ISRU robotics propulsion wormhole research deep space infrastructure dual use technology',
  potential: 'education accessibility human AI augmentation evidence based health prevention creativity skills future of work',
  synthesis: 'science communication future cities systems design documentary visualization public engagement technology culture'
};

function queryForPillar(name) {
  const d = loadDoctrine();
  const base = PILLAR_QUERIES[name];
  if (!base || !d.priority_tracks[name]) throw new Error(`Unknown doctrine pillar: ${name}`);
  return base;
}

module.exports = { DOCTRINE_PATH, loadDoctrine, doctrineSummary, queryForPillar };
