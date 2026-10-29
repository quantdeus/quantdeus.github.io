import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const script=join(root,'scripts/growth-three-funnel-pilot.mjs');
const source=join(root,'coordination/growth/three-funnel-pipeline.json');

function runWithConfig(change){
  const dir=mkdtempSync(join(tmpdir(),'qd-growth-gate-'));
  try{
    const config=JSON.parse(readFileSync(source,'utf8'));
    change(config);
    const path=join(dir,'coordination/growth/three-funnel-pipeline.json');
    mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,JSON.stringify(config));
    return spawnSync(process.execPath,[script],{
      cwd:dir,encoding:'utf8',timeout:5000,
      env:{...process.env,GITHUB_STEP_SUMMARY:''}
    });
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('Согласованный dry-run успешно проходит проверку',()=>{
  const result=runWithConfig(()=>{});
  assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).mode,'dry-run');
});

test('При отключённом согласовании dry-run завершается ошибкой',()=>{
  const result=runWithConfig(config=>{config.rules.human_approval_required=false;});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/обязательно подтверждение человеком/);
});

test('При отсутствии флага согласования dry-run завершается ошибкой',()=>{
  const result=runWithConfig(config=>{delete config.rules.human_approval_required;});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/обязательно подтверждение человеком/);
});
