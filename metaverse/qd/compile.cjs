'use strict';
const fs = require('node:fs');
const path = require('node:path');
const solc = require('solc');
const name = 'QDGenesisBadge.sol';
const input = {
  language: 'Solidity',
  sources: { [name]: { content: fs.readFileSync(path.join(__dirname, 'contracts', name), 'utf8') } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }
  }
};
const result = JSON.parse(solc.compile(JSON.stringify(input), {
  import(file) {
    if (!file.startsWith('@openzeppelin/contracts/')) return { error: 'Разрешены только зависимости OpenZeppelin' };
    const full = path.resolve(__dirname, 'node_modules', file);
    if (!full.startsWith(path.join(__dirname,'node_modules','@openzeppelin','contracts')+path.sep)) return { error: 'Неправильный путь импорта' };
    return fs.existsSync(full) ? { contents: fs.readFileSync(full, 'utf8') } : { error: 'Файл не найден: '+file };
  }
}));
for (const issue of result.errors || []) {
  if (issue.severity === 'error') console.error(issue.formattedMessage);
}
if ((result.errors || []).some(e => e.severity === 'error')) process.exit(1);
const c = result.contracts?.[name]?.QDGenesisBadge;
if (!c || !c.evm?.bytecode?.object?.length || !c.abi.some(x => x.name === 'mintTo')) throw new Error('Нет рабочего bytecode или mintTo');
console.log('QD Genesis Badge: Solidity 0.8.24 + OpenZeppelin 5.4.0 compilation PASS');
