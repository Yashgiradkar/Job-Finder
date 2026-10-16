import { chromium } from 'playwright';

// Contact enrichment is intentionally limited to publicly exposed company/contact pages.
// Do not scrape private LinkedIn profiles or bypass authentication/rate limits.
export async function enrichContact(job) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    const text = await page.locator('body').innerText().catch(() => '');
    const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []))];
    const links = await page.locator('a[href]').evaluateAll(as => as.map(a => ({ text: a.innerText, href: a.href })));
    const linkedin = links.find(x => /linkedin\.com\/in\//i.test(x.href))?.href || null;
    return { ...job, hrEmails: emails, linkedinContact: linkedin };
  } catch {
    return { ...job, hrEmails: [], linkedinContact: null };
  } finally {
    await browser.close();
  }
}
