const { queryForPillar } = require('./doctrine');
async function scan(browser) {
  const page = await browser.newPage();
  const findings = [];
  try {
    const query = encodeURIComponent(queryForPillar('potential'));
    await page.goto(`https://news.google.com/search?q=${query}&hl=en`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('article', { timeout: 5000 });
    const headlines = await page.$$eval('article h3, article h4, article a[href]', els => {
      const titles = els
        .map(el => el.textContent.replace(/\s+/g, ' ').trim())
        .filter(text => text.length >= 12);
      return [...new Set(titles)].slice(0, 5);
    });
    findings.push({ source: 'Google News', headlines });
  } catch (err) {
    findings.push({ source: 'error', error: err.message });
  }
  await page.close();
  return findings;
}
module.exports = { scan };
