import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

/**
 * Creates deterministic Job ID (Step 9).
 * Prefers: company + officialJobId
 * If officialJobId unavailable: company + normalizedTitle + normalizedLocation
 */
export function generateDeterministicJobId(company, officialJobId, title, location) {
  if (officialJobId) {
    const cleanId = String(officialJobId).replace(/[^a-zA-Z0-9-_]/g, '');
    return `${slug(company)}-${cleanId}`;
  }
  const hash = crypto.createHash('sha256')
    .update(`${slug(company)}|${slug(title)}|${slug(location)}`)
    .digest('hex')
    .slice(0, 12);
  return `${slug(company)}-${hash}`;
}

function slug(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Relevant engineering keywords to filter out non-technical roles.
 */
const RELEVANT_KEYWORDS = [
  'backend', 'node', 'typescript', 'javascript', 'python', 'fastapi', 'nestjs', 'express',
  'engineer', 'developer', 'software', 'platform', 'api', 'microservice', 'microservices',
  'llm', 'ai', 'rag', 'langchain', 'langgraph', 'agent', 'ml', 'machine learning',
  'full stack', 'fullstack', 'distributed', 'infrastructure', 'devops', 'cloud',
  'data engineer', 'systems', 'solution'
];

function isRelevantTitle(title = '') {
  const t = title.toLowerCase();
  return RELEVANT_KEYWORDS.some(k => t.includes(k));
}

/**
 * Builds a normalized Job object conforming strictly to STEP 3 specification:
 * {
 *   jobId,
 *   company,
 *   title,
 *   location,
 *   remote,
 *   employmentType,
 *   postedAt,
 *   updatedAt,
 *   jobUrl,
 *   salary,
 *   experienceRequirement,
 *   description,
 *   responsibilities,
 *   requiredSkills,
 *   preferredSkills,
 *   education,
 *   department
 * }
 * Never invents missing information; defaults missing fields to null.
 */
function buildJob(company, title, jobUrl, location, salaryRange, companyRemotePolicy, extraFields = {}) {
  const locStr = location ? String(location).trim() : null;
  const isRemote = (locStr && locStr.toLowerCase().includes('remote')) ||
                   (extraFields.description && extraFields.description.toLowerCase().includes('remote')) ||
                   (companyRemotePolicy === '🌐' && (!locStr || locStr.toLowerCase().includes('remote')));

  return {
    jobId: generateDeterministicJobId(company, extraFields.officialJobId || null, title, locStr),
    company,
    title: title ? String(title).trim() : null,
    location: locStr,
    remote: Boolean(isRemote),
    employmentType: extraFields.employmentType || null,
    postedAt: extraFields.postedAt || null,
    updatedAt: extraFields.updatedAt || null,
    jobUrl: jobUrl || null,
    salary: (salaryRange && salaryRange !== 'Not Disclosed' && salaryRange !== '—') ? salaryRange : null,
    experienceRequirement: extraFields.experienceRequirement || null,
    description: extraFields.description || null,
    responsibilities: extraFields.responsibilities && extraFields.responsibilities.length > 0 ? extraFields.responsibilities : null,
    requiredSkills: extraFields.requiredSkills && extraFields.requiredSkills.length > 0 ? extraFields.requiredSkills : null,
    preferredSkills: extraFields.preferredSkills && extraFields.preferredSkills.length > 0 ? extraFields.preferredSkills : null,
    education: extraFields.education || null,
    department: extraFields.department || null
  };
}

/**
 * Greenhouse ATS Crawler.
 */
async function crawlGreenhouse(company, url, salaryRange, remotePolicy) {
  const token = url.replace(/.*?boards\.greenhouse\.io\/([^/?#]+).*/, '$1')
    || url.replace(/.*?greenhouse\.io\/([^/?#]+).*/, '$1')
    || url.split('/').filter(Boolean).pop();

  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;

  const data = await res.json();
  const jobs = [];
  for (const item of (data.jobs || [])) {
    if (!isRelevantTitle(item.title)) continue;
    const $ = cheerio.load(item.content || '');
    const desc = $.text().replace(/\s+/g, ' ').trim();
    
    // Extract experience if mentioned in description
    const expMatch = desc.match(/(?:(\d+)\s*(?:-|to|–)\s*(\d+))\s*(?:\+)?\s*(?:years?|yrs?)/i) ||
                     desc.match(/(?:(?:minimum|at\s*least|min)?\s*(\d+)\s*\+\s*(?:years?|yrs?))/i);

    jobs.push(buildJob(company, item.title, item.absolute_url || url,
      item.location?.name || null, salaryRange, remotePolicy, {
        officialJobId: String(item.id),
        postedAt: item.updated_at || null,
        description: desc || null,
        experienceRequirement: expMatch ? expMatch[0] : null,
        department: item.departments?.[0]?.name || null
      }));
  }
  return jobs;
}

/**
 * Lever ATS Crawler.
 */
async function crawlLever(company, url, salaryRange, remotePolicy) {
  const token = url.replace(/.*?jobs\.lever\.co\/([^/?#]+).*/, '$1')
    || url.split('/').filter(Boolean).pop();

  const apiUrl = `https://api.lever.co/v0/postings/${token}?mode=json`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;

  const data = await res.json();
  const jobs = [];
  for (const item of (Array.isArray(data) ? data : [])) {
    if (!isRelevantTitle(item.text)) continue;
    const rawDesc = item.descriptionPlain || item.description || '';
    const expMatch = rawDesc.match(/(?:(\d+)\s*(?:-|to|–)\s*(\d+))\s*(?:\+)?\s*(?:years?|yrs?)/i) ||
                     rawDesc.match(/(?:(?:minimum|at\s*least|min)?\s*(\d+)\s*\+\s*(?:years?|yrs?))/i);

    jobs.push(buildJob(company, item.text, item.hostedUrl || url,
      item.categories?.location || null, salaryRange, remotePolicy, {
        officialJobId: item.id,
        postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
        employmentType: item.categories?.commitment || null,
        description: rawDesc || null,
        experienceRequirement: expMatch ? expMatch[0] : null,
        responsibilities: (item.lists || []).map(l => `${l.text}: ${(l.content || []).join('; ')}`),
        department: item.categories?.team || null
      }));
  }
  return jobs;
}

/**
 * Ashby ATS Crawler.
 */
async function crawlAshby(company, url, salaryRange, remotePolicy) {
  const orgSlug = url.replace(/.*?jobs\.ashbyhq\.com\/([^/?#]+).*/, '$1')
    || url.replace(/.*?ashby\.io\/([^/?#]+).*/, '$1')
    || url.split('/').filter(Boolean).pop();

  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${orgSlug}`;
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) return null;

  const data = await res.json();
  const jobs = [];
  for (const item of (data.jobs || [])) {
    if (!isRelevantTitle(item.title)) continue;
    const desc = item.descriptionPlain || item.description || '';
    const expMatch = desc.match(/(?:(\d+)\s*(?:-|to|–)\s*(\d+))\s*(?:\+)?\s*(?:years?|yrs?)/i) ||
                     desc.match(/(?:(?:minimum|at\s*least|min)?\s*(\d+)\s*\+\s*(?:years?|yrs?))/i);

    jobs.push(buildJob(company, item.title, item.jobUrl || url,
      item.location || null, salaryRange, remotePolicy, {
        officialJobId: item.id,
        postedAt: item.publishedAt || null,
        description: desc || null,
        experienceRequirement: expMatch ? expMatch[0] : null,
        department: item.department || null
      }));
  }
  return jobs;
}

/**
 * Playwright Interactive Crawler for JS-rendered career pages.
 * Navigates through: search filters, load-more controls, pagination, categories.
 */
async function crawlWithPlaywright(company, url, salaryRange, remotePolicy) {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });

    // Handle initial cookie popups/modals if present
    const cookieButtons = ['#onetrust-accept-btn-handler', 'button:has-text("Accept")', 'button:has-text("Agree")'];
    for (const btnSelector of cookieButtons) {
      try {
        const btn = page.locator(btnSelector).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click({ timeout: 1000 });
        }
      } catch {
        // Ignore cookie dismiss errors
      }
    }

    // Attempt interactive search / filter if search input is available
    try {
      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="job" i]').first();
      if (await searchInput.isVisible({ timeout: 1500 })) {
        await searchInput.fill('engineer');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
      }
    } catch {
      // Continue if search input not available
    }

    // Scroll and click "Load More" / pagination controls (up to 3 times)
    for (let scrollIdx = 0; scrollIdx < 3; scrollIdx++) {
      await page.evaluate(() => window.scrollBy(0, 1000));
      await page.waitForTimeout(1000);

      const loadMoreBtn = page.locator('button:has-text("Load More"), button:has-text("Show More"), a:has-text("Load More")').first();
      try {
        if (await loadMoreBtn.isVisible({ timeout: 1000 })) {
          await loadMoreBtn.click({ timeout: 1000 });
          await page.waitForTimeout(1500);
        }
      } catch {
        // Continue if no load more button
      }
    }

    const html = await page.content();
    await browser.close();
    browser = null;

    return parseHtmlForJobs(company, url, html, salaryRange, remotePolicy);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return [];
  }
}

/**
 * Extracts relevant job links and listings from raw HTML.
 */
function parseHtmlForJobs(company, baseUrl, html, salaryRange, remotePolicy) {
  const $ = cheerio.load(html);
  const jobs = [];
  const seen = new Set();

  const selectors = [
    'a[href*="/jobs/"]', 'a[href*="/careers/"]', 'a[href*="/positions/"]',
    'a[href*="/openings/"]', 'a[href*="job_id="]', 'a[href*="posting"]',
    '.job-listing a', '.opening a', '[data-job] a', 'li.job > a', '.career-item a'
  ];

  $(selectors.join(', ')).each((_, el) => {
    if (jobs.length >= 35) return;
    const title = $(el).text().trim().replace(/\s+/g, ' ');
    let href = $(el).attr('href') || '';

    if (!title || title.length < 4 || title.length > 130) return;
    if (!isRelevantTitle(title)) return;

    if (href && !href.startsWith('http')) {
      try { href = new URL(href, baseUrl).href; } catch { href = baseUrl; }
    }
    const dedupeKey = `${slug(title)}-${href}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    // Extract surrounding location text if available
    const parentText = $(el).parent().text().replace(/\s+/g, ' ');
    let loc = null;
    if (parentText.toLowerCase().includes('remote')) loc = 'Remote';
    else if (parentText.toLowerCase().includes('bengaluru') || parentText.toLowerCase().includes('bangalore')) loc = 'Bengaluru';
    else if (parentText.toLowerCase().includes('india')) loc = 'India';

    jobs.push(buildJob(company, title, href || baseUrl, loc, salaryRange, remotePolicy));
  });

  return jobs;
}

/**
 * Lightweight HTTP fetch + cheerio fallback.
 */
async function crawlWithFetch(company, url, salaryRange, remotePolicy) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,*/*;q=0.8'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    return { success: false, status: res.status, jobs: [] };
  }

  const html = await res.text();
  const jobs = parseHtmlForJobs(company, url, html, salaryRange, remotePolicy);
  return { success: true, jobs };
}

/**
 * Main entry point: crawls a single company career portal using best available method.
 * Never invents fake/synthetic records. If no openings found, returns empty jobs list.
 */
export async function crawlCompanyPortal(companyRecord, options = {}) {
  const { company, careerUrl, salaryRange, remotePolicy } = companyRecord;
  const usePlaywright = options.usePlaywright ?? false;

  let url;
  try {
    url = new URL(careerUrl.startsWith('http') ? careerUrl : `https://${careerUrl}`).href;
  } catch {
    return { company, careerUrl, success: false, failureReason: 'Invalid URL', jobs: [] };
  }

  try {
    // 1. Greenhouse API (direct ATS)
    if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) {
      const jobs = await crawlGreenhouse(company, url, salaryRange, remotePolicy);
      if (jobs !== null) {
        return { company, careerUrl: url, success: true, jobs };
      }
    }

    // 2. Lever API (direct ATS)
    if (url.includes('jobs.lever.co') || url.includes('lever.co')) {
      const jobs = await crawlLever(company, url, salaryRange, remotePolicy);
      if (jobs !== null) {
        return { company, careerUrl: url, success: true, jobs };
      }
    }

    // 3. Ashby API (direct ATS)
    if (url.includes('ashbyhq.com') || url.includes('jobs.ashby')) {
      const jobs = await crawlAshby(company, url, salaryRange, remotePolicy);
      if (jobs !== null) {
        return { company, careerUrl: url, success: true, jobs };
      }
    }

    // 4. Lightweight HTML fetch
    const fetchResult = await crawlWithFetch(company, url, salaryRange, remotePolicy);
    if (!fetchResult.success) {
      if (usePlaywright) {
        // 5. Playwright fallback for JS-heavy or blocked pages
        const pwJobs = await crawlWithPlaywright(company, url, salaryRange, remotePolicy);
        return { company, careerUrl: url, success: true, jobs: pwJobs };
      }
      return {
        company,
        careerUrl: url,
        success: false,
        failureReason: `HTTP ${fetchResult.status} — JS-rendered or protected page`,
        retryRecommendation: 'Run with --playwright flag to execute headless browser crawl.',
        jobs: []
      };
    }

    // If fetch succeeded but returned 0 jobs and Playwright is enabled, try Playwright
    if (fetchResult.jobs.length === 0 && usePlaywright) {
      const pwJobs = await crawlWithPlaywright(company, url, salaryRange, remotePolicy);
      return { company, careerUrl: url, success: true, jobs: pwJobs };
    }

    return { company, careerUrl: url, success: true, jobs: fetchResult.jobs };

  } catch (err) {
    return {
      company,
      careerUrl: url,
      success: false,
      failureReason: err.message,
      retryRecommendation: 'Check connectivity or run with --playwright for JS-heavy pages.',
      jobs: []
    };
  }
}
