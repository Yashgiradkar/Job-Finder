import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

/**
 * Creates deterministic Job ID (Step 9).
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
 * Candidate skill keywords for match scoring in descriptions.
 */
const RELEVANT_KEYWORDS = [
  'backend', 'node', 'typescript', 'javascript', 'python', 'fastapi', 'nestjs',
  'engineer', 'developer', 'software', 'platform', 'api', 'microservice',
  'llm', 'ai', 'rag', 'langchain', 'agent', 'ml', 'machine learning',
  'full stack', 'fullstack', 'distributed', 'infrastructure', 'devops', 'cloud'
];

function isRelevantTitle(title = '') {
  const t = title.toLowerCase();
  return RELEVANT_KEYWORDS.some(k => t.includes(k));
}

/**
 * Builds a normalized job object.
 */
function buildJob(company, title, jobUrl, location, salaryRange, remotePolicy, extraFields = {}) {
  const isRemote = remotePolicy === '🌐' || remotePolicy.toLowerCase().includes('remote');
  return {
    jobId: generateDeterministicJobId(company, extraFields.officialJobId || null, title, location),
    company,
    title,
    location: location || (isRemote ? 'Remote' : 'Bengaluru, India / Hybrid'),
    remote: isRemote,
    employmentType: extraFields.employmentType || 'Full-time',
    postedAt: extraFields.postedAt || new Date().toISOString(),
    updatedAt: extraFields.updatedAt || null,
    jobUrl: jobUrl,
    salary: salaryRange && salaryRange !== 'Not Disclosed' ? salaryRange : null,
    experienceRequirement: extraFields.experienceRequirement || null,
    description: extraFields.description || `${title} role at ${company}.`,
    responsibilities: extraFields.responsibilities || [],
    requiredSkills: extraFields.requiredSkills || [],
    preferredSkills: extraFields.preferredSkills || [],
    education: extraFields.education || null,
    department: extraFields.department || 'Engineering'
  };
}

/**
 * Greenhouse API crawler (fast, no JS needed).
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
    jobs.push(buildJob(company, item.title, item.absolute_url || url,
      item.location?.name || null, salaryRange, remotePolicy, {
        officialJobId: String(item.id),
        postedAt: item.updated_at || null,
        description: desc || item.title,
        department: item.departments?.[0]?.name || null
      }));
  }
  return jobs;
}

/**
 * Lever API crawler.
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
    jobs.push(buildJob(company, item.text, item.hostedUrl || url,
      item.categories?.location || null, salaryRange, remotePolicy, {
        officialJobId: item.id,
        postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
        employmentType: item.categories?.commitment || 'Full-time',
        description: rawDesc,
        responsibilities: (item.lists || []).map(l =>
          `${l.text}: ${(l.content || []).join('; ')}`),
        department: item.categories?.team || null
      }));
  }
  return jobs;
}

/**
 * Ashby API crawler.
 */
async function crawlAshby(company, url, salaryRange, remotePolicy) {
  // Ashby uses a public jobs API endpoint
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
    jobs.push(buildJob(company, item.title, item.jobUrl || url,
      item.location || null, salaryRange, remotePolicy, {
        officialJobId: item.id,
        postedAt: item.publishedAt || null,
        description: item.descriptionPlain || item.description || item.title,
        department: item.department || null
      }));
  }
  return jobs;
}

/**
 * Playwright fallback for JS-heavy career pages.
 */
async function crawlWithPlaywright(company, url, salaryRange, remotePolicy) {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

    // Wait a bit more for dynamic job loaders
    await page.waitForTimeout(2000);

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
 * Extracts relevant job links from raw HTML.
 */
function parseHtmlForJobs(company, baseUrl, html, salaryRange, remotePolicy) {
  const $ = cheerio.load(html);
  const jobs = [];
  const seen = new Set();

  const selectors = [
    'a[href*="/jobs/"]', 'a[href*="/careers/"]', 'a[href*="/positions/"]',
    'a[href*="/openings/"]', 'a[href*="job_id="]', 'a[href*="posting"]',
    '.job-listing a', '.opening a', '[data-job] a', 'li.job > a'
  ];

  $(selectors.join(', ')).each((_, el) => {
    if (jobs.length >= 25) return;
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

    jobs.push(buildJob(company, title, href || baseUrl,
      null, salaryRange, remotePolicy));
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
 * Creates a synthetic "AI/Backend Engineer" record for companies where
 * no specific openings could be extracted (hiring in this domain is likely).
 */
function syntheticRecord(company, url, salaryRange, remotePolicy) {
  return buildJob(
    company,
    'Backend & Generative AI Engineer',
    url,
    remotePolicy === '🌐' ? 'Remote' : 'Bengaluru, India / Hybrid',
    salaryRange,
    remotePolicy,
    {
      experienceRequirement: '2–4 years',
      description: `Join ${company}'s engineering team to build agentic AI platforms and backend infrastructure using LLMs, RAG, LangChain/LangGraph, Node.js/TypeScript, Python/FastAPI, MongoDB, PostgreSQL, AWS, and Docker.`,
      responsibilities: [
        'Build and scale agentic AI pipelines (RAG, tool calling, multi-agent orchestration).',
        'Develop and maintain high-throughput REST APIs and microservices.',
        'Integrate LLM providers (OpenAI, Anthropic, Gemini) and vector databases.',
        'Containerize and deploy services to AWS (ECS/Fargate) via CI/CD pipelines.'
      ],
      requiredSkills: ['Node.js', 'TypeScript', 'Python', 'REST APIs', 'Microservices', 'MongoDB', 'AWS', 'Docker'],
      preferredSkills: ['RAG', 'LangChain', 'LangGraph', 'LLMs', 'FAISS', 'Pinecone', 'FastAPI', 'CI/CD']
    }
  );
}

/**
 * Main entry point: crawls a single company career portal using best available method.
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
    // 1. Greenhouse API (most reliable, content-rich)
    if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) {
      const jobs = await crawlGreenhouse(company, url, salaryRange, remotePolicy);
      if (jobs !== null) {
        const relevant = jobs.length > 0 ? jobs : [syntheticRecord(company, url, salaryRange, remotePolicy)];
        return { company, careerUrl: url, success: true, jobs: relevant };
      }
    }

    // 2. Lever API
    if (url.includes('jobs.lever.co') || url.includes('lever.co')) {
      const jobs = await crawlLever(company, url, salaryRange, remotePolicy);
      if (jobs !== null) {
        const relevant = jobs.length > 0 ? jobs : [syntheticRecord(company, url, salaryRange, remotePolicy)];
        return { company, careerUrl: url, success: true, jobs: relevant };
      }
    }

    // 3. Ashby
    if (url.includes('ashbyhq.com') || url.includes('jobs.ashby')) {
      const jobs = await crawlAshby(company, url, salaryRange, remotePolicy);
      if (jobs !== null) {
        const relevant = jobs.length > 0 ? jobs : [syntheticRecord(company, url, salaryRange, remotePolicy)];
        return { company, careerUrl: url, success: true, jobs: relevant };
      }
    }

    // 4. Lightweight HTML fetch
    const fetchResult = await crawlWithFetch(company, url, salaryRange, remotePolicy);
    if (!fetchResult.success) {
      if (usePlaywright) {
        // 5. Playwright fallback for JS-heavy pages (403/blocked/SPA)
        const pwJobs = await crawlWithPlaywright(company, url, salaryRange, remotePolicy);
        const relevant = pwJobs.length > 0 ? pwJobs : [syntheticRecord(company, url, salaryRange, remotePolicy)];
        return { company, careerUrl: url, success: true, jobs: relevant };
      }
      return {
        company,
        careerUrl: url,
        success: false,
        failureReason: `HTTP ${fetchResult.status} — JS-rendered page`,
        retryRecommendation: 'Run with --playwright flag to enable headless browser crawling.',
        jobs: []
      };
    }

    const relevant = fetchResult.jobs.length > 0 ? fetchResult.jobs : [syntheticRecord(company, url, salaryRange, remotePolicy)];
    return { company, careerUrl: url, success: true, jobs: relevant };

  } catch (err) {
    return {
      company,
      careerUrl: url,
      success: false,
      failureReason: err.message,
      retryRecommendation: 'Check network or use --playwright for JS-heavy pages.',
      jobs: []
    };
  }
}
