'use strict';
const fs = require('fs');
const { chromium } = require('playwright');
const dir = 'browser-artifacts';
const report = 'browser-result.md';
function write(status, lines) {
  fs.writeFileSync(report, ['## 🌐 Browser Playwright — Skyrim Space Program', '', '**Status:** ' + status, '', ...lines, '', '_Read-only Playwright Chrome in isolated GitHub Actions branch; no login or secrets._', ''].join('\n'));
}
async function main() {
  let browser;
  try {
    const issue = JSON.parse(fs.readFileSync('browser-issue.json', 'utf8'));
    const labels = (issue.labels || []).map(x => typeof x === 'string' ? x : x.name);
    if (!labels.includes('governance:passed') || !labels.includes('agent:control-tower')) throw new Error('Missing approved governance labels');
    if (issue.number !== 598) throw new Error('This experiment is limited to issue #598');
    const found = String(issue.body || '').match(/<!-- qd-browser-task:start -->\s*~~~json\s*([\s\S]*?)\s*~~~\s*<!-- qd-browser-task:end -->/i);
    if (!found) throw new Error('Missing task manifest');
    const manifest = JSON.parse(found[1]);
    const url = new URL(manifest.url);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.searchParams.get('v') !== 'V2DqmzJYLz8') throw new Error('Unexpected target URL');
    fs.mkdirSync(dir, { recursive: true });
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, locale: 'en-US' });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message).slice(0,160)));
    const response = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 55000 });
    await page.waitForTimeout(3500);
    await page.screenshot({path: dir + '/01-youtube-page.png'});
    const firstTitle = await page.title();
    const before = await page.locator('body').innerText().catch(() => '');
    const gate = /verify you are human|captcha|sign in to confirm you.re not a bot/i.test(before);
    if (gate) {
      write('human_handoff_required', ['- YouTube displayed a verification gate. No bypass attempted.', '- Page title: ' + firstTitle, '- Screenshot: 01-youtube-page.png']);
      return;
    }
    const button = page.locator('.ytp-large-play-button');
    let playAction = 'no play button available';
    if (await button.count()) {
      await button.first().click({timeout:12000}).then(() => playAction='clicked YouTube play button').catch(e => playAction='play click failed: ' + String(e.message).slice(0,100));
    } else if (await page.locator('video').count()) {
      await page.locator('video').first().click({timeout:12000}).then(() => playAction='clicked video').catch(() => {});
    }
    await page.waitForTimeout(3500);
    await page.screenshot({path: dir + '/02-after-play.png'});
    const state1 = await page.evaluate(() => { const v=document.querySelector('video'); return v ? { currentTime:v.currentTime, duration:v.duration, paused:v.paused, readyState:v.readyState, error:v.error && v.error.message } : { noVideoElement:true }; });
    await page.waitForTimeout(4000);
    await page.screenshot({path: dir + '/03-video-frame.png'});
    const state2 = await page.evaluate(() => { const v=document.querySelector('video'); return v ? { currentTime:v.currentTime, duration:v.duration, paused:v.paused, readyState:v.readyState, error:v.error && v.error.message } : { noVideoElement:true }; });
    const played = state2.currentTime > (state1.currentTime || 0) + 0.5;
    write(played ? 'completed_video_playing' : 'completed_page_only', [
      '- URL: ' + page.url(),
      '- Page title: ' + firstTitle,
      '- HTTP status: ' + (response ? response.status() : 'unknown'),
      '- Playback action: ' + playAction,
      '- Video state after click: ' + JSON.stringify(state1),
      '- Video state 4 seconds later: ' + JSON.stringify(state2),
      '- Captured: 01-youtube-page.png, 02-after-play.png, 03-video-frame.png',
      ...(errors.length ? ['- Page script errors: ' + errors.slice(0,2).join(' | ')] : [])
    ]);
  } catch (e) {
    write('blocked', ['- Reason: ' + String(e.message || e).replace(/\n/g, ' ').slice(0,450)]);
    process.exitCode = 1;
  } finally { if (browser) await browser.close(); }
}
main();