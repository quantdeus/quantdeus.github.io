const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('metaverse/index.html', 'utf8');
const solidity = fs.readFileSync('metaverse/qd/contracts/QDGenesisBadge.sol', 'utf8');
const metadata = JSON.parse(fs.readFileSync('metaverse/qd/metadata.json', 'utf8'));
test('Портал на русском, читает реальный статус Seven', () => {
 assert.match(html, /lang="ru"/);
 assert.match(html, /quantdeus-seven-bridge\.quantdeus-galactic-swarm\.workers\.dev\/api\/status/);
 assert.match(html, /cache:'no-store'/);
 assert.match(html, /role!=='seven-of-nine'/);
 assert.match(html, /Статус недоступен/);
});
test('Нет команд на запись и ключей в публичном коде', () => {
 assert.doesNotMatch(html, /method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
 assert.doesNotMatch(html, /private[_-]?key|cloudflare_api_token|GITHUB_TOKEN/i);
 assert.doesNotMatch(html, /ethereum\.request|window\.ethereum/);
 assert.match(html, /10 000 LLM/);
});
test('QD — контролируемый ERC-721, а не ERC-20', () => {
 assert.match(solidity, /ERC721\("QuantDeus Genesis Badge", "QD"\)/);
 assert.match(solidity, /onlyOwner/);
 assert.match(solidity, /MAX_SUPPLY = 10000/);
 assert.match(solidity, /_requireOwned\(tokenId\)/);
 assert.match(solidity, /^pragma solidity \^0\.8\.24;/m);
 assert.match(metadata.image, /\/metaverse\/qd\/badge\.svg$/);
});
