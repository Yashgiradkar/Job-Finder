import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'jobs/output');

/**
 * Ensures output directory exists.
 */
async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

/**
 * Generates all JSON output files and Markdown report.
 */
export async function generateJobOutputs({ allJobs, matchedJobs, recentJobs, applicationQueue, rejectedJobs }) {
  await ensureOutputDir();

  const allJobsPath = path.join(OUTPUT_DIR, 'all-jobs.json');
  const matchedJobsPath = path.join(OUTPUT_DIR, 'matched-jobs.json');
  const recentJobsPath = path.join(OUTPUT_DIR, 'recent-jobs.json');
  const queuePath = path.join(OUTPUT_DIR, 'application-queue.json');
  const rejectedPath = path.join(OUTPUT_DIR, 'rejected-jobs.json');
  const reportPath = path.join(OUTPUT_DIR, 'job-report.md');

  await fs.writeFile(allJobsPath, JSON.stringify(allJobs, null, 2), 'utf-8');
  await fs.writeFile(matchedJobsPath, JSON.stringify(matchedJobs, null, 2), 'utf-8');
  await fs.writeFile(recentJobsPath, JSON.stringify(recentJobs, null, 2), 'utf-8');
  await fs.writeFile(queuePath, JSON.stringify(applicationQueue, null, 2), 'utf-8');
  await fs.writeFile(rejectedPath, JSON.stringify(rejectedJobs, null, 2), 'utf-8');

  // Generate Markdown Report
  const markdownContent = buildMarkdownReport({ allJobs, matchedJobs, recentJobs, applicationQueue, rejectedJobs });
  await fs.writeFile(reportPath, markdownContent, 'utf-8');

  return {
    allJobsPath,
    matchedJobsPath,
    recentJobsPath,
    queuePath,
    rejectedPath,
    reportPath
  };
}

/**
 * Builds the comprehensive Job Intelligence Markdown Report.
 */
function buildMarkdownReport({ allJobs, matchedJobs, recentJobs, applicationQueue, rejectedJobs }) {
  const dateStr = new Date().toISOString().split('T')[0];

  const renderTableRows = (jobs) => {
    return jobs.map(j => {
      const comp = j.company || '—';
      const id = j.jobId || '—';
      const role = j.title || '—';
      const loc = j.location || '—';
      const exp = j.experienceRequirement || '2–4 yrs';
      const score = `${j.overallMatchScore ?? '—'}%`;
      const posted = j.freshness || j.postedAt || 'Recent';
      const sal = j.salaryRange || '—';
      const rem = j.remote ? '🌐 Yes' : 'Hybrid/Office';
      const resume = j.resumeName || '—';
      const link = j.jobUrl ? `[Apply/View](${j.jobUrl})` : '—';
      return `| ${comp} | \`${id}\` | ${role} | ${loc} | ${exp} | **${score}** | ${posted} | ${sal} | ${rem} | \`${resume}\` | ${link} |`;
    }).join('\n');
  };

  const highMatch = matchedJobs.filter(j => (j.overallMatchScore || 0) >= 75);
  const medMatch = matchedJobs.filter(j => (j.overallMatchScore || 0) >= 55 && (j.overallMatchScore || 0) < 75);

  const genAiJobs = matchedJobs.filter(j => (j.roleCategory || []).includes('Generative AI') || (j.roleCategory || []).includes('LLM Engineer'));
  const backendJobs = matchedJobs.filter(j => (j.roleCategory || []).includes('Backend') || (j.roleCategory || []).includes('Distributed Systems'));
  const aiMlJobs = matchedJobs.filter(j => (j.roleCategory || []).includes('Machine Learning') || (j.roleCategory || []).includes('AI Engineer') || (j.roleCategory || []).includes('Applied AI'));
  const cloudInfraJobs = matchedJobs.filter(j => (j.roleCategory || []).includes('Data/AI Infrastructure') || (j.roleCategory || []).includes('Developer Platform') || (j.roleCategory || []).includes('AI Platform'));

  return `# 🎯 Job Intelligence Report — ${dateStr}

> Executive Discovery, Intelligence & Candidate Matching Summary for **Yash Giradkar** (Generative AI / LLM + Backend Engineer | 2–4 Years Experience).

---

## 📊 Run Overview
- **Total Discovered Openings:** ${allJobs.length}
- **Candidate Matched Openings:** ${matchedJobs.length}
- **High-Priority Application Queue (Score ≥ 70):** ${applicationQueue.length}
- **Fresh Openings (Last 48 Hours):** ${recentJobs.length}
- **Filtered / Rejected Openings:** ${rejectedJobs.length}

---

## 📋 Master Matched Jobs Table

| Company | Job ID | Role | Location | Experience | Match | Posted | Salary (LPA) | Remote | Resume | Job URL |
|---|---|---|---|---|---|---|---|---|---|---|
${renderTableRows(matchedJobs)}

---

## 🔥 New in Last 48 Hours (${recentJobs.length})

${recentJobs.length > 0 ? `| Company | Job ID | Role | Location | Match | Posted | Job URL |
|---|---|---|---|---|---|---|
${recentJobs.map(j => `| ${j.company} | \`${j.jobId}\` | ${j.title} | ${j.location} | **${j.overallMatchScore}%** | ${j.freshness} | [Opening](${j.jobUrl}) |`).join('\n')}` : '_No jobs posted in the last 48 hours._'}

---

## 🤖 Generative AI / LLM Roles (${genAiJobs.length})

${genAiJobs.length > 0 ? `| Company | Role | Match Score | Key Matched Skills | Resume Variant | Job URL |
|---|---|---|---|---|---|
${genAiJobs.map(j => `| ${j.company} | ${j.title} | **${j.overallMatchScore}%** | ${(j.matchedSkills || []).slice(0, 5).join(', ')} | \`${j.resumeName}\` | [Link](${j.jobUrl}) |`).join('\n')}` : '_No specific GenAI roles._'}

---

## ⚙️ Backend & Distributed Systems Roles (${backendJobs.length})

${backendJobs.length > 0 ? `| Company | Role | Match Score | Key Matched Skills | Resume Variant | Job URL |
|---|---|---|---|---|---|
${backendJobs.map(j => `| ${j.company} | ${j.title} | **${j.overallMatchScore}%** | ${(j.matchedSkills || []).slice(0, 5).join(', ')} | \`${j.resumeName}\` | [Link](${j.jobUrl}) |`).join('\n')}` : '_No specific Backend roles._'}

---

## 🧠 AI / ML Roles (${aiMlJobs.length})

${aiMlJobs.length > 0 ? `| Company | Role | Match Score | Key Matched Skills | Job URL |
|---|---|---|---|---|
${aiMlJobs.map(j => `| ${j.company} | ${j.title} | **${j.overallMatchScore}%** | ${(j.matchedSkills || []).slice(0, 5).join(', ')} | [Link](${j.jobUrl}) |`).join('\n')}` : '_No specific AI/ML roles._'}

---

## ☁️ Cloud & Infrastructure Roles (${cloudInfraJobs.length})

${cloudInfraJobs.length > 0 ? `| Company | Role | Match Score | Key Matched Skills | Job URL |
|---|---|---|---|---|
${cloudInfraJobs.map(j => `| ${j.company} | ${j.title} | **${j.overallMatchScore}%** | ${(j.matchedSkills || []).slice(0, 5).join(', ')} | [Link](${j.jobUrl}) |`).join('\n')}` : '_No specific Cloud/Infra roles._'}

---

## 🟢 High Match (Score ≥ 75%) — ${highMatch.length}

${highMatch.map(j => `### [${j.company}] ${j.title} (Match: ${j.overallMatchScore}%)
- **Job ID:** \`${j.jobId}\` &bull; **Location:** ${j.location} &bull; **Salary:** ${j.salaryRange || 'Not Disclosed'}
- **Matched Skills:** ${(j.matchedSkills || []).join(', ')}
- **Required Skills Matched:** ${(j.requiredSkillsMatched || []).join(', ') || 'All standard core skills'}
- **Missing Skills:** ${(j.missingSkills || []).join(', ') || 'None'}
- **Assigned Resume:** \`${j.resumeName}\`
- **Application Queue Status:** \`${j.applicationStatus}\`
- 🔗 **Opening URL:** [${j.jobUrl}](${j.jobUrl})
`).join('\n')}

---

## 🟡 Medium Match (Score 55–74%) — ${medMatch.length}

${medMatch.map(j => `- **${j.company}** — [${j.title}](${j.jobUrl}) (\`${j.jobId}\`) &bull; Match: **${j.overallMatchScore}%** &bull; Location: ${j.location}`).join('\n')}

---

## 🔴 Rejected Jobs (${rejectedJobs.length})

| Company | Role | Rejection Reason |
|---|---|---|
${rejectedJobs.map(j => `| ${j.company} | ${j.title} | ${j.rejectionReason} |`).join('\n')}
`;
}
