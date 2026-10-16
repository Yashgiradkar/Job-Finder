import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(rootDir, 'public')));

// Active SSE client connections for streaming logs
const sseClients = new Set();
let runningProcess = null;

function broadcastLog(data, type = 'info') {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    type,
    message: String(data)
  });
  for (const res of sseClients) {
    res.write(`data: ${payload}\n\n`);
  }
}

// --------------------------------------------------------------------------
// SSE Log Stream
// --------------------------------------------------------------------------
app.get('/api/action/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('\n');
  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// --------------------------------------------------------------------------
// API: Stats Overview
// --------------------------------------------------------------------------
app.get('/api/stats', async (req, res) => {
  try {
    const readJson = async (rel) => {
      const p = path.join(rootDir, rel);
      if (existsSync(p)) {
        const text = await fs.readFile(p, 'utf-8');
        try { return JSON.parse(text); } catch { return []; }
      }
      return [];
    };

    const allJobs = await readJson('jobs/output/all-jobs.json');
    const matchedJobs = await readJson('jobs/output/matched-jobs.json');
    const recentJobs = await readJson('jobs/output/recent-jobs.json');
    const queueJobs = await readJson('jobs/output/application-queue.json');
    const rejectedJobs = await readJson('jobs/output/rejected-jobs.json');

    // Interviews
    let interviewCount = 0;
    const upcomingPath = path.join(rootDir, 'interviews/upcoming.md');
    if (existsSync(upcomingPath)) {
      const content = await fs.readFile(upcomingPath, 'utf-8');
      const matches = content.match(/^##\s+\d+\./gm);
      interviewCount = matches ? matches.length : 0;
    }

    // Outreach
    let outreachCount = 0;
    const excelPath = path.join(rootDir, 'list.xlsx');
    if (existsSync(excelPath)) {
      try {
        const wb = xlsx.readFile(excelPath);
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = xlsx.utils.sheet_to_json(ws);
        outreachCount = rows.length;
      } catch {}
    }

    res.json({
      success: true,
      data: {
        totalDiscovered: allJobs.length,
        matchedCount: matchedJobs.length,
        recentCount: recentJobs.length,
        queueCount: queueJobs.length,
        rejectedCount: rejectedJobs.length,
        interviewCount,
        outreachCount,
        highMatchCount: matchedJobs.filter(j => (j.overallMatchScore || 0) >= 75).length,
        systemStatus: runningProcess ? 'BUSY' : 'READY'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Jobs Dataset
// --------------------------------------------------------------------------
app.get('/api/jobs', async (req, res) => {
  try {
    const type = req.query.type || 'matched'; // 'matched' | 'all' | 'queue' | 'recent' | 'rejected'
    const fileMap = {
      matched: 'jobs/output/matched-jobs.json',
      all: 'jobs/output/all-jobs.json',
      queue: 'jobs/output/application-queue.json',
      recent: 'jobs/output/recent-jobs.json',
      rejected: 'jobs/output/rejected-jobs.json'
    };

    const targetFile = path.join(rootDir, fileMap[type] || fileMap.matched);
    if (!existsSync(targetFile)) {
      return res.json({ success: true, count: 0, jobs: [] });
    }

    const data = JSON.parse(await fs.readFile(targetFile, 'utf-8'));
    res.json({ success: true, count: data.length, jobs: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Markdown Report Content
// --------------------------------------------------------------------------
app.get('/api/report', async (req, res) => {
  try {
    const reportPath = path.join(rootDir, 'jobs/output/job-report.md');
    if (!existsSync(reportPath)) {
      return res.json({ success: true, content: '# No report generated yet\n\nRun a job scan to generate the report.' });
    }
    const content = await fs.readFile(reportPath, 'utf-8');
    res.json({ success: true, content });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Interviews & Notebooks
// --------------------------------------------------------------------------
app.get('/api/interviews', async (req, res) => {
  try {
    const upcomingPath = path.join(rootDir, 'interviews/upcoming.md');
    let rawContent = '';
    if (existsSync(upcomingPath)) {
      rawContent = await fs.readFile(upcomingPath, 'utf-8');
    }

    // Parse entries
    const entries = [];
    const blocks = rawContent.split(/^---\s*$/m);
    for (const block of blocks) {
      const companyMatch = block.match(/-\s*\*\*company\*\*:\s*([^\n]+)/i);
      const roleMatch = block.match(/-\s*\*\*role\*\*:\s*([^\n]+)/i);
      const dateMatch = block.match(/-\s*\*\*interview_date\*\*:\s*([^\n]+)/i);
      const locMatch = block.match(/-\s*\*\*location\*\*:\s*([^\n]+)/i);
      const resumeMatch = block.match(/-\s*\*\*resume_version\*\*:\s*([^\n]+)/i);
      const urlMatch = block.match(/-\s*\*\*job_url\*\*:\s*([^\n]+)/i);
      const jdMatch = block.match(/-\s*\*\*job_description\*\*:\s*([\s\S]*?)(?=(?:-\s*\*\*|$))/i);

      if (companyMatch && roleMatch) {
        const company = companyMatch[1].trim();
        const role = roleMatch[1].trim();
        const date = dateMatch ? dateMatch[1].trim() : 'Unspecified';

        // Check for workspace
        const safeCompany = company.replace(/[^a-zA-Z0-9_-]/g, '-');
        const safeRole = role.replace(/[^a-zA-Z0-9_-]/g, '-');
        const workspaceDir = path.join(rootDir, 'interviews', safeCompany, safeRole);
        const artifactsDir = path.join(workspaceDir, 'artifacts');

        let artifacts = [];
        if (existsSync(artifactsDir)) {
          const files = await fs.readdir(artifactsDir);
          artifacts = files.filter(f => f.endsWith('.md')).sort();
        }

        entries.push({
          company,
          role,
          date,
          location: locMatch ? locMatch[1].trim() : 'Remote / Hybrid',
          resumeVersion: resumeMatch ? resumeMatch[1].trim() : 'Default',
          jobUrl: urlMatch ? urlMatch[1].trim() : '#',
          jobDescription: jdMatch ? jdMatch[1].trim() : '',
          workspaceExists: existsSync(workspaceDir),
          workspaceDir,
          artifacts
        });
      }
    }

    res.json({ success: true, interviews: entries, rawUpcoming: rawContent });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Read single interview dossier artifact
app.get('/api/interviews/artifact', async (req, res) => {
  try {
    const { company, role, filename } = req.query;
    if (!company || !role || !filename) {
      return res.status(400).json({ success: false, error: 'Missing company, role, or filename' });
    }

    const safeCompany = company.replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeRole = role.replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeFilename = path.basename(filename);

    const artifactPath = path.join(rootDir, 'interviews', safeCompany, safeRole, 'artifacts', safeFilename);
    if (!existsSync(artifactPath)) {
      return res.status(404).json({ success: false, error: 'Artifact not found' });
    }

    const content = await fs.readFile(artifactPath, 'utf-8');
    res.json({ success: true, filename: safeFilename, content });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Outreach Contacts & History
// --------------------------------------------------------------------------
app.get('/api/outreach', async (req, res) => {
  try {
    const excelPath = path.join(rootDir, 'list.xlsx');
    let recipients = [];
    let sheetNames = [];

    if (existsSync(excelPath)) {
      const wb = xlsx.readFile(excelPath);
      sheetNames = wb.SheetNames;
      const ws = wb.Sheets[wb.SheetNames[0]];
      recipients = xlsx.utils.sheet_to_json(ws);
    }

    // Outreach history
    const historyPath = path.join(rootDir, 'data/outreach-history.json');
    let history = [];
    if (existsSync(historyPath)) {
      try { history = JSON.parse(await fs.readFile(historyPath, 'utf-8')); } catch {}
    }

    res.json({
      success: true,
      sheetNames,
      recipients,
      history,
      resumePath: process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf',
      resumeExists: existsSync(path.join(rootDir, process.env.RESUME_PATH || 'Yash_Giradkar_Resume.pdf'))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Update Application Queue Status (Approve / Reject / Apply)
// --------------------------------------------------------------------------
app.post('/api/application/update', async (req, res) => {
  try {
    const { jobId, status } = req.body;
    if (!jobId || !status) {
      return res.status(400).json({ success: false, error: 'Missing jobId or status' });
    }

    const queuePath = path.join(rootDir, 'jobs/output/application-queue.json');
    if (!existsSync(queuePath)) {
      return res.status(404).json({ success: false, error: 'Queue file not found' });
    }

    const jobs = JSON.parse(await fs.readFile(queuePath, 'utf-8'));
    let found = false;
    for (const j of jobs) {
      if (j.jobId === jobId) {
        j.applicationStatus = status;
        j.statusUpdatedAt = new Date().toISOString();
        found = true;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ success: false, error: 'Job ID not found in queue' });
    }

    await fs.writeFile(queuePath, JSON.stringify(jobs, null, 2), 'utf-8');
    res.json({ success: true, message: `Job ${jobId} status updated to ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Run Workflows via child_process
// --------------------------------------------------------------------------
app.post('/api/action/run-workflow', (req, res) => {
  if (runningProcess) {
    return res.status(409).json({
      success: false,
      error: 'Another workflow is already running. Please wait for it to complete.'
    });
  }

  const { workflow, options = {} } = req.body;
  let cmd = 'node';
  let args = [];

  switch (workflow) {
    case 'jobs-companies':
      args = ['src/jobs/index.js', '--source', 'companies-file'];
      if (options.limit) args.push('--limit', String(options.limit));
      if (options.usePlaywright) args.push('--playwright');
      if (options.noEmail !== false) args.push('--no-email');
      break;

    case 'jobs-startups':
      args = ['src/jobs/index.js', '--source', 'google-sheet'];
      if (options.limit) args.push('--limit', String(options.limit));
      if (options.usePlaywright) args.push('--playwright');
      if (options.noEmail !== false) args.push('--no-email');
      break;

    case 'jobs-both':
      args = ['src/jobs/index.js', '--source', 'both'];
      if (options.limit) args.push('--limit', String(options.limit));
      if (options.usePlaywright) args.push('--playwright');
      if (options.noEmail !== false) args.push('--no-email');
      break;

    case 'outreach-dry-run':
      args = ['src/outreach/index.js', '--dry-run'];
      break;

    case 'outreach-send':
      args = ['src/outreach/index.js'];
      break;

    case 'interview-prep':
      args = ['src/interviews/index.js', '--force'];
      break;

    default:
      return res.status(400).json({ success: false, error: `Unknown workflow: ${workflow}` });
  }

  broadcastLog(`🚀 Starting workflow: ${workflow} (${cmd} ${args.join(' ')})`, 'system');

  try {
    runningProcess = spawn(cmd, args, { cwd: rootDir, env: { ...process.env, FORCE_COLOR: '1' } });

    runningProcess.stdout.on('data', (data) => {
      broadcastLog(data.toString(), 'stdout');
    });

    runningProcess.stderr.on('data', (data) => {
      broadcastLog(data.toString(), 'stderr');
    });

    runningProcess.on('close', (code) => {
      broadcastLog(`🏁 Workflow finished with exit code ${code}`, code === 0 ? 'success' : 'error');
      runningProcess = null;
    });

    res.json({
      success: true,
      message: `Workflow started: ${workflow}`,
      command: `${cmd} ${args.join(' ')}`
    });
  } catch (err) {
    runningProcess = null;
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Cancel Running Workflow
// --------------------------------------------------------------------------
app.post('/api/action/cancel-workflow', (req, res) => {
  if (!runningProcess) {
    return res.json({ success: false, message: 'No workflow currently running' });
  }
  try {
    runningProcess.kill('SIGTERM');
    broadcastLog('🛑 Workflow cancelled by user request', 'warn');
    runningProcess = null;
    res.json({ success: true, message: 'Process cancelled' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🌐 AI Job Hunter — Mission Control UI`);
  console.log(`🚀 Dashboard running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
});
