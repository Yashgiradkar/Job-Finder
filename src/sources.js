import { chromium } from 'playwright';
import * as cheerio from 'cheerio';
import { config, portals } from '../config.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function crawlPortals() {
  if (!portals.length) return [];
  const browser = await chromium.launch({ headless: config.headless });
  const results = [];

  try {
    for (const portal of portals) {
      const page = await browser.newPage({ userAgent: 'Mozilla/5.0 job-research-bot' });
      try {
        await page.goto(portal.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await sleep(500);

        const html = await page.content();
        const $ = cheerio.load(html);
        const links = new Map();
        $('a[href]').each((_, a) => {
          const title = $(a).text().trim();
          const href = new URL($(a).attr('href'), portal.url).href;
          if (title.length >= 3) links.set(href, title);
        });

        for (const [url, title] of links) {
          if (!/engineer|developer|ai|machine learning|software|backend|platform|llm|genai/i.test(title)) continue;
          const detail = await browser.newPage({ userAgent: 'Mozilla/5.0 job-research-bot' });
          try {
            await detail.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await detail.waitForLoadState('networkidle').catch(() => {});
            const body = await detail.locator('body').innerText().catch(() => '');
            const canonical = await detail.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
            const published = await detail.locator('time').first().getAttribute('datetime').catch(() => null);
            results.push({
              source: portal.company,
              title,
              url: canonical || url,
              description: body.slice(0, 30000),
              postedAt: parseDate(published)?.toISOString() || null,
              discoveredAt: new Date().toISOString()
            });
          } finally { await detail.close(); }
        }
      } catch (e) {
        console.warn(`[crawl] ${portal.company}: ${e.message}`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
  return results;
}

export function recentOnly(jobs) {
  const cutoff = Date.now() - config.lookbackHours * 60 * 60 * 1000;
  return jobs.filter(j => {
    if (!j.postedAt) return true; // retain unknown dates for manual verification
    return new Date(j.postedAt).getTime() >= cutoff;
  });
}
