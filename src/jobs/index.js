import 'dotenv/config';
import path from 'node:path';
import { parseCompaniesFile } from './companyParser.js';
import { fetchAgenticStartups } from './googleSheetFetcher.js';
import { crawlCompanyPortal } from './crawler.js';
import { evaluateExperience } from './experienceFilter.js';
import { scoreJobMatch } from './scorer.js';
import { evaluateLocation, evaluateFreshness } from './locationFreshness.js';
import { matchResumeForJob } from './resumeMatcher.js';
import { enrichJobContacts } from './enricher.js';
import { generateJobOutputs } from './outputGenerator.js';
import { sendJobIntelligenceEmail } from './emailReporter.js';

/**
 * Parses CLI arguments.
 */
function parseCliArgs() {
  const args = process.argv.slice(2);
  const getArgVal = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  return {
    limit: getArgVal('--limit') ? parseInt(getArgVal('--limit'), 10) : null,
    companiesFile: getArgVal('--companies-file') || null,
    source: getArgVal('--source') || 'companies-file',
    sheetUrl: getArgVal('--sheet-url') || null,
    usePlaywright: args.includes('--playwright'),
    skipEmail: args.includes('--no-email') || args.includes('--skip-email'),
    dryRun: args.includes('--dry-run')
  };
}

/**
 * Main Job Discovery, Intelligence & Application Pipeline.
 */
export async function runJobIntelligencePipeline(options = {}) {
  const opts = { ...parseCliArgs(), ...options };

  console.log('\n======================================================');
  console.log('🤖 AI Job Hunter — Full Intelligence & Discovery Pipeline');
  console.log('======================================================\n');

  // STEP 1 — Load Companies from configured source(s)
  console.log(`[Step 1] Loading company list (source: ${opts.source})...`);

  let companies = [];
  let sourcePath = '';

  if (opts.source === 'google-sheet') {
    console.log('[Step 1] Fetching Agentic AI Startups from Google Sheet...');
    const sheetResult = await fetchAgenticStartups(opts.sheetUrl);
    companies = sheetResult.companies;
    sourcePath = sheetResult.sourcePath;
    console.log(`Loaded ${companies.length} startups from Google Sheet.`);
  } else if (opts.source === 'both') {
    console.log('[Step 1] Merging /jobs/companies.md + Google Sheet...');
    const [fileResult, sheetResult] = await Promise.all([
      parseCompaniesFile(opts.companiesFile),
      fetchAgenticStartups(opts.sheetUrl)
    ]);
    // Deduplicate by careerUrl
    const seen = new Set();
    for (const c of [...fileResult.companies, ...sheetResult.companies]) {
      if (!seen.has(c.careerUrl)) { seen.add(c.careerUrl); companies.push(c); }
    }
    sourcePath = `${fileResult.sourcePath} + ${sheetResult.sourcePath}`;
    console.log(`Loaded ${companies.length} total companies (merged + deduped).`);
  } else {
    // Default: /jobs/companies.md
    const fileResult = await parseCompaniesFile(opts.companiesFile);
    companies = fileResult.companies;
    sourcePath = fileResult.sourcePath;
    console.log(`Loaded ${companies.length} companies from: ${sourcePath}`);
  }

  const targetCompanies = opts.limit ? companies.slice(0, opts.limit) : companies;
  console.log(`Processing batch of ${targetCompanies.length} company portal(s)...\n`);

  let portalsSuccessful = 0;
  let portalsFailed = 0;
  const failureReports = [];
  const rawDiscoveredJobs = [];

  // STEP 2 & 3 — Crawl and Extract Jobs
  for (let i = 0; i < targetCompanies.length; i++) {
    const compRecord = targetCompanies[i];
    const progress = `[${i + 1}/${targetCompanies.length}]`;
    console.log(`${progress} Visiting career portal: ${compRecord.company} (${compRecord.careerUrl})...`);

    const crawlResult = await crawlCompanyPortal(compRecord, { usePlaywright: opts.usePlaywright });
    if (crawlResult.success) {
      portalsSuccessful++;
      rawDiscoveredJobs.push(...crawlResult.jobs);
      console.log(`  ↳ Discovered ${crawlResult.jobs.length} opening(s).`);
    } else {
      portalsFailed++;
      failureReports.push({
        company: compRecord.company,
        careerUrl: compRecord.careerUrl,
        failureReason: crawlResult.failureReason || 'Failed to fetch',
        retryRecommendation: crawlResult.retryRecommendation || 'Retry with Playwright browser'
      });
      console.log(`  ↳ ⚠️ Failed: ${crawlResult.failureReason}`);
    }
  }

  // STEP 9 — Deduplication
  const deduplicatedMap = new Map();
  for (const job of rawDiscoveredJobs) {
    if (!deduplicatedMap.has(job.jobId)) {
      deduplicatedMap.set(job.jobId, job);
    }
  }
  const allJobsList = [...deduplicatedMap.values()];

  console.log(`\n[Step 9] Total Discovered: ${rawDiscoveredJobs.length} | Unique Deduplicated: ${allJobsList.length}`);

  const matchedJobs = [];
  const rejectedJobs = [];
  const recentJobs = [];
  const applicationQueue = [];

  let countWithinExperience = 0;
  let countMatchingSkills = 0;

  // STEPS 4–12 — Process, Score, Filter & Enrich Each Job
  for (const rawJob of allJobsList) {
    // STEP 4 — Experience Filter
    const experienceEval = evaluateExperience(rawJob);
    if (experienceEval.isAccepted) {
      countWithinExperience++;
    }

    // STEP 7 — Location Filter
    const locationEval = evaluateLocation(rawJob.location, rawJob.remotePolicy);

    // STEP 8 — Freshness
    const freshnessEval = evaluateFreshness(rawJob.postedAt);

    // STEP 5 & 6 — Role Matching & Categorization
    const matchScoreResult = scoreJobMatch(rawJob, experienceEval, locationEval);

    if (matchScoreResult.matchedSkills.length > 0) {
      countMatchingSkills++;
    }

    // STEP 10 — Resume Matching
    const resumeInfo = matchResumeForJob(matchScoreResult.roleCategory, rawJob.title, rawJob.description);

    // STEP 11 — Contact Enrichment
    const contactInfo = await enrichJobContacts(rawJob);

    // STEP 12 — Create Full Intelligence Record
    const intelligenceRecord = {
      jobId: rawJob.jobId,
      company: rawJob.company,
      title: rawJob.title,
      location: locationEval.rawLocation,
      locationCategory: locationEval.locationCategory,
      remote: rawJob.remote,
      salaryRange: rawJob.salary || 'Not Disclosed',
      postedAt: freshnessEval.postedAt,
      freshness: freshnessEval.freshness,
      experienceRequirement: experienceEval.experienceRequirement,
      experienceConfidence: experienceEval.experienceConfidence,
      jobUrl: rawJob.jobUrl,
      overallMatchScore: matchScoreResult.overallMatchScore,
      roleMatchScore: matchScoreResult.roleMatchScore,
      skillMatchScore: matchScoreResult.skillMatchScore,
      aiLlmRelevanceScore: matchScoreResult.aiLlmRelevanceScore,
      backendRelevanceScore: matchScoreResult.backendRelevanceScore,
      experienceMatchScore: matchScoreResult.experienceMatchScore,
      locationMatchScore: matchScoreResult.locationMatchScore,
      matchedSkills: matchScoreResult.matchedSkills,
      missingSkills: matchScoreResult.missingSkills,
      requiredSkillsMatched: matchScoreResult.requiredSkillsMatched,
      preferredSkillsMatched: matchScoreResult.preferredSkillsMatched,
      roleCategory: matchScoreResult.roleCategory,
      resumeName: resumeInfo.resumeName,
      resumePath: resumeInfo.resumePath,
      hrEmail: contactInfo.hrEmail,
      recruiterName: contactInfo.recruiterName,
      recruiterLinkedIn: contactInfo.recruiterLinkedIn,
      publicLinkedInCompany: contactInfo.publicLinkedInCompany,
      description: rawJob.description,
      responsibilities: rawJob.responsibilities || [],
      requiredSkills: rawJob.requiredSkills || [],
      preferredSkills: rawJob.preferredSkills || [],
      applicationStatus: 'not_applied'
    };

    // Experience Filter Decision
    if (!experienceEval.isAccepted) {
      rejectedJobs.push({
        ...intelligenceRecord,
        rejectionReason: experienceEval.rejectionReason
      });
      continue;
    }

    // Skill Match Minimum Threshold
    if (matchScoreResult.overallMatchScore < 50) {
      rejectedJobs.push({
        ...intelligenceRecord,
        rejectionReason: `Low overall match score (${matchScoreResult.overallMatchScore}%)`
      });
      continue;
    }

    // Candidate Matched
    matchedJobs.push(intelligenceRecord);

    // Freshness check (<= 48 hours)
    if (freshnessEval.isRecent48h) {
      recentJobs.push(intelligenceRecord);
    }

    // STEP 16 — Application Queue Threshold (Score >= 70)
    if (intelligenceRecord.overallMatchScore >= 70) {
      applicationQueue.push(intelligenceRecord);
    }
  }

  // Sort matched jobs by match score descending
  matchedJobs.sort((a, b) => b.overallMatchScore - a.overallMatchScore);
  recentJobs.sort((a, b) => b.overallMatchScore - a.overallMatchScore);
  applicationQueue.sort((a, b) => b.overallMatchScore - a.overallMatchScore);

  // STEP 13 & 14 — Output Files Generation
  console.log('\n[Step 13 & 14] Generating output datasets and Markdown report...');
  const outputFiles = await generateJobOutputs({
    allJobs: allJobsList,
    matchedJobs,
    recentJobs,
    applicationQueue,
    rejectedJobs
  });
  console.log(`Generated:
  - ${outputFiles.allJobsPath}
  - ${outputFiles.matchedJobsPath}
  - ${outputFiles.recentJobsPath}
  - ${outputFiles.queuePath}
  - ${outputFiles.rejectedPath}
  - ${outputFiles.reportPath}`);

  // STEP 15 — Email Digest
  if (!opts.skipEmail && !opts.dryRun) {
    console.log('\n[Step 15] Sending Job Intelligence email digest with attachments...');
    const reportStats = {
      companiesScanned: targetCompanies.length,
      portalsSuccessful,
      portalsFailed,
      discoveredCount: allJobsList.length,
      withinExperienceCount: countWithinExperience,
      matchedCount: matchedJobs.length,
      recent48hCount: recentJobs.length,
      queueCount: applicationQueue.length
    };

    await sendJobIntelligenceEmail(reportStats, matchedJobs, outputFiles);
  }

  // STEP 17 — Produce Full Run Summary
  console.log('\n======================================================');
  console.log('📊 STEP 17 — RUN SUMMARY');
  console.log('======================================================');
  console.log(`Companies scanned: ${targetCompanies.length}`);
  console.log(`Career portals successful: ${portalsSuccessful}`);
  console.log(`Career portals failed: ${portalsFailed}`);
  console.log(`Jobs discovered: ${rawDiscoveredJobs.length}`);
  console.log(`Jobs deduplicated: ${allJobsList.length}`);
  console.log(`Jobs within 2–4 years: ${countWithinExperience}`);
  console.log(`Jobs matching skills: ${countMatchingSkills}`);
  console.log(`Jobs posted within 48 hours: ${recentJobs.length}`);
  console.log(`High-match jobs (Score ≥ 75): ${matchedJobs.filter(j => j.overallMatchScore >= 75).length}`);
  console.log(`Applications requiring review (Queue ≥ 70): ${applicationQueue.length}`);

  if (failureReports.length > 0) {
    console.log('\n⚠️ Portal Failures Breakdown:');
    failureReports.forEach(f => {
      console.log(`- Company: ${f.company}`);
      console.log(`  Career URL: ${f.careerUrl}`);
      console.log(`  Failure Reason: ${f.failureReason}`);
      console.log(`  Retry Recommendation: ${f.retryRecommendation}`);
    });
  }

  console.log('======================================================\n');

  return {
    success: true,
    totalDiscovered: allJobsList.length,
    matchedCount: matchedJobs.length,
    recentCount: recentJobs.length,
    queueCount: applicationQueue.length,
    rejectedCount: rejectedJobs.length,
    outputFiles
  };
}

// Execute when run directly via node
if (process.argv[1]?.endsWith('src/jobs/index.js') || process.argv[1]?.endsWith('src/jobs')) {
  runJobIntelligencePipeline().catch(err => {
    console.error('Fatal error running pipeline:', err);
    process.exit(1);
  });
}
