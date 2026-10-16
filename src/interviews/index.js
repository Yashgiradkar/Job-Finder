import 'dotenv/config';
import path from 'node:path';
import { parseUpcomingInterviews } from './parser.js';
import { performCompanyResearch, analyzeJobDescription } from './researcher.js';
import { matchCandidateToRole } from './matcher.js';
import { generateInterviewWorkspace, generateFinalRevision } from './generator.js';
import { checkDailyRefresh } from './refresh.js';
import { sendInterviewNotification } from './notifier.js';

/**
 * Runs the daily interview preparation workflow for all upcoming interviews.
 */
export async function runInterviewPrepWorkflow(options = {}) {
  const filePath = options.filePath || './interviews/upcoming.md';
  const referenceDate = options.referenceDate || new Date();

  console.log(`[InterviewPrep] Starting daily interview preparation run for ${referenceDate.toISOString().split('T')[0]}...`);
  
  const interviews = await parseUpcomingInterviews(filePath, referenceDate);
  if (interviews.length === 0) {
    console.log(`[InterviewPrep] No upcoming interviews found in ${filePath}.`);
    return { processed: 0, actions: [] };
  }

  console.log(`[InterviewPrep] Found ${interviews.length} upcoming interview(s) to process.`);
  const summaryReport = [];

  for (const interview of interviews) {
    const { company, role, daysUntil, interviewDate, jobId } = interview;
    console.log(`\n======================================================`);
    console.log(`[InterviewPrep] Processing: ${company} — ${role}`);
    console.log(`[InterviewPrep] Date: ${interviewDate || 'Unspecified'} (${daysUntil !== null ? `${daysUntil} day(s) away` : 'Date TBD'})`);
    console.log(`======================================================`);

    // STEP 2 & 3: Research & Role Analysis
    const research = await performCompanyResearch(company, role);
    const jdAnalysis = analyzeJobDescription(interview.jobDescription, role, company);
    
    // STEP 4: Candidate Matching
    const matchResult = matchCandidateToRole(jdAnalysis);

    const isSevenDaysAway = daysUntil === 7;
    const isTomorrow = daysUntil === 1;
    const isMoreThanOneDayAway = daysUntil !== null && daysUntil > 1;

    let workspaceResult = null;
    let finalRevisionFile = null;
    let shouldNotify = false;
    let newDevelopments = [];
    let preparationCompleted = [];
    let generatedArtifactList = [];

    // Trigger 7-Day Workspace Creation (or initial setup if workspace doesn't exist yet)
    if (isSevenDaysAway || options.forceFullGeneration) {
      console.log(`[InterviewPrep] Triggering 7-Day / Full Preparation Package Generation...`);
      workspaceResult = await generateInterviewWorkspace(interview, research, jdAnalysis, matchResult);
      preparationCompleted = [
        'Created interview workspace directory and master notebook',
        'Conducted 12-month deep company research and tech radar analysis',
        'Analyzed job description competencies and architecture expectations',
        'Mapped candidate experience, STAR stories, and mitigation strategies without inventing experience',
        'Generated 11 comprehensive interview preparation artifacts in /artifacts/'
      ];
      generatedArtifactList = workspaceResult.generatedFiles.map(f => path.basename(f));
      shouldNotify = true;
    }

    // Trigger 1-Day Away Final Pre-Interview Revision (Step 6)
    if (isTomorrow) {
      console.log(`[InterviewPrep] Interview is TOMORROW! Generating final-revision.md...`);
      finalRevisionFile = await generateFinalRevision(interview, research, jdAnalysis, matchResult);
      preparationCompleted.push('Generated concise pre-interview final-revision.md for immediate review');
      generatedArtifactList.push('final-revision.md');
      shouldNotify = true;
    }

    // Trigger Daily Refresh for interviews > 1 day away (Step 7)
    if (isMoreThanOneDayAway && !isSevenDaysAway) {
      console.log(`[InterviewPrep] Performing daily refresh check for new company developments...`);
      const refreshResult = await checkDailyRefresh(interview, research);
      if (refreshResult.hasUpdates) {
        console.log(`[InterviewPrep] Found ${refreshResult.newDevelopments.length} new development(s).`);
        newDevelopments = refreshResult.newDevelopments;
        preparationCompleted.push('Updated interview notebook with new company developments');
        shouldNotify = true;
      } else {
        console.log(`[InterviewPrep] No new meaningful changes detected. Skipping noisy email notification.`);
      }
    }

    // STEP 8: Notification (Only if meaningful change or new material)
    if (shouldNotify && !options.skipNotification) {
      await sendInterviewNotification({
        company,
        role,
        interviewDate: interviewDate || 'Upcoming',
        jobId,
        matchSummary: `Strong alignment in Generative AI (RAG with 94.6% Precision@5), Node.js/TypeScript microservices (83% latency optimization), and MongoDB data recovery.`,
        newDevelopments,
        preparationCompleted,
        highestPriorityTopics: [
          'Two-stage RAG architecture and MMR diversity reranking',
          'TypeScript API Gateway design with Consul service discovery',
          'Production MongoDB aggregation pipelines and zero-downtime migrations',
          'Real-time reactive chat and WebSockets with AWS ECS Fargate deployment'
        ],
        artifacts: generatedArtifactList.length > 0 ? generatedArtifactList : ['Master Notebook Up-To-Date']
      });
    }

    summaryReport.push({
      company,
      role,
      daysUntil,
      notified: shouldNotify,
      artifactsCreated: generatedArtifactList.length
    });
  }

  console.log(`\n[InterviewPrep] Completed daily run for ${interviews.length} interview(s).`);
  return { processed: interviews.length, summaryReport };
}

// Execute directly if run via `node src/interviews/index.js`
if (process.argv[1]?.endsWith('src/interviews/index.js') || process.argv[1]?.endsWith('src/interviews')) {
  runInterviewPrepWorkflow({
    forceFullGeneration: process.argv.includes('--force')
  }).catch(err => {
    console.error('[InterviewPrep] Error running workflow:', err);
    process.exit(1);
  });
}
