import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import xlsx from 'xlsx';
import 'dotenv/config';
import { fetchAgenticStartups } from './jobs/googleSheetFetcher.js';
import { createTransporter, sendOutreachEmail, delayWithJitter } from './outreach/mailer.js';
import { buildOutreachEmail } from './outreach/template.js';
import { recordSent } from './outreach/tracker.js';
import { 
  connectDB, 
  saveOutreachLog, 
  getOutreachLogs, 
  getDBStats, 
  saveCompanyContact, 
  getCompanyContacts, 
  getAllCompanyContacts 
} from './db/mongo.js';
import { enrichCompanyContacts } from './outreach/contactEnricher.js';
import { enhanceEmailWithPrompt, fetchCompanyLiveIntel } from './outreach/aiEnhancer.js';
import { 
  detectCompanyTimezone, 
  getNextTuesdayMorningUtc, 
  getNextWeekdayMorningUtc,
  saveScheduledEmail, 
  getDueScheduledEmails, 
  updateScheduledEmailStatus, 
  getScheduledEmails, 
  cancelScheduledEmail, 
  cancelAllScheduledEmails, 
  formatCountdown 
} from './outreach/scheduler.js';
import { config } from '../config.js';

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
// Outreach Queue Store Helpers (data/outreach-queue.json)
// --------------------------------------------------------------------------
const OUTREACH_QUEUE_FILE = path.join(rootDir, 'data/outreach-queue.json');

async function getOutreachQueue() {
  if (existsSync(OUTREACH_QUEUE_FILE)) {
    try {
      const text = await fs.readFile(OUTREACH_QUEUE_FILE, 'utf-8');
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  // Initialize from list.xlsx if queue file doesn't exist yet
  const excelPath = path.join(rootDir, 'list.xlsx');
  let initial = [];
  if (existsSync(excelPath)) {
    try {
      const wb = xlsx.readFile(excelPath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = xlsx.utils.sheet_to_json(ws);
      initial = rows.map((r, i) => ({
        id: `rec-excel-${i + 1}`,
        name: r.Name || '',
        company: r.Company || 'Company',
        email: r.Email || '',
        role: r.Role || 'Backend Engineer',
        link: r.Link || '',
        status: 'pending_preview', // 'pending_preview' | 'previewed' | 'ready' | 'sent'
        customSubject: null,
        customBody: null,
        lastPreviewedAt: null,
        sentAt: null
      }));
    } catch {}
  }

  await saveOutreachQueue(initial);
  return initial;
}

async function saveOutreachQueue(queue) {
  await fs.mkdir(path.dirname(OUTREACH_QUEUE_FILE), { recursive: true });
  await fs.writeFile(OUTREACH_QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf-8');
}

// --------------------------------------------------------------------------
// API: Outreach Queue, History & Status
// --------------------------------------------------------------------------
app.get('/api/outreach', async (req, res) => {
  try {
    const queue = await getOutreachQueue();

    // Sheet names
    let sheetNames = [];
    const excelPath = path.join(rootDir, 'list.xlsx');
    if (existsSync(excelPath)) {
      try {
        const wb = xlsx.readFile(excelPath);
        sheetNames = wb.SheetNames;
      } catch {}
    }

    // Outreach history
    const historyPath = path.join(rootDir, 'data/outreach-history.json');
    let history = [];
    if (existsSync(historyPath)) {
      try { history = JSON.parse(await fs.readFile(historyPath, 'utf-8')); } catch {}
    }

    // Attach 3 hiring manager LinkedIn contacts with IDs & hyperlinks to each company
    const enrichedRecipients = await Promise.all(queue.map(async (r) => {
      try {
        let contacts = await getCompanyContacts(r.company);
        if (!contacts || contacts.length < 3) {
          contacts = await enrichCompanyContacts(r.company, r.link);
        }
        const top3 = (contacts || []).slice(0, 3).map(c => {
          const lid = c.linkedinId || (c.linkedinUrl ? c.linkedinUrl.split('/in/').pop()?.split('?')[0]?.replace(/\/$/, '') : null);
          return {
            name: c.name,
            title: c.title,
            email: c.email,
            linkedinUrl: c.linkedinUrl || (lid ? `https://www.linkedin.com/in/${lid}` : null),
            linkedinId: lid,
            location: c.location
          };
        });
        return {
          ...r,
          linkedinContacts: top3
        };
      } catch {
        return r;
      }
    }));

    res.json({
      success: true,
      sheetNames,
      recipients: enrichedRecipients,
      history,
      targetTestEmail: config.email.to || config.email.user,
      resumePath: process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf',
      resumeExists: existsSync(path.join(rootDir, process.env.RESUME_PATH || 'Yash_Giradkar_Resume.pdf'))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Add New Recipient to Outreach Queue
app.post('/api/outreach/recipient', async (req, res) => {
  try {
    const { name, company, email, role, link } = req.body;
    if (!company) {
      return res.status(400).json({ success: false, error: 'Company name is required' });
    }

    const queue = await getOutreachQueue();
    const newRecipient = {
      id: `rec-custom-${Date.now()}`,
      name: name || '',
      company: company.trim(),
      email: (email || '').trim(),
      role: role ? role.trim() : 'Generative AI & Backend Engineer',
      link: link ? link.trim() : '',
      status: 'pending_preview',
      customSubject: null,
      customBody: null,
      lastPreviewedAt: null,
      sentAt: null
    };

    queue.unshift(newRecipient);
    await saveOutreachQueue(queue);

    res.json({ success: true, recipient: newRecipient, message: 'Recipient added to outreach queue' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Update Existing Recipient
app.put('/api/outreach/recipient/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, email, role, link, customSubject, customBody, status } = req.body;

    const queue = await getOutreachQueue();
    const idx = queue.findIndex(r => r.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    if (name !== undefined) queue[idx].name = name;
    if (company !== undefined) queue[idx].company = company;
    if (email !== undefined) queue[idx].email = email;
    if (role !== undefined) queue[idx].role = role;
    if (link !== undefined) queue[idx].link = link;
    if (customSubject !== undefined) queue[idx].customSubject = customSubject;
    if (customBody !== undefined) queue[idx].customBody = customBody;
    if (status !== undefined) queue[idx].status = status;

    await saveOutreachQueue(queue);
    res.json({ success: true, recipient: queue[idx], message: 'Recipient updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Delete Recipient
app.delete('/api/outreach/recipient/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const queue = await getOutreachQueue();
    const filtered = queue.filter(r => r.id !== id);
    if (filtered.length === queue.length) {
      return res.status(404).json({ success: false, error: 'Recipient not found' });
    }

    await saveOutreachQueue(filtered);
    res.json({ success: true, message: 'Recipient removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Populate 30 Startup Companies into Queue (from Google Sheet)
app.post('/api/outreach/populate-startups', async (req, res) => {
  try {
    const batchCount = parseInt(req.body.count || '30', 10);
    const startupsResult = await fetchAgenticStartups();
    const startups = startupsResult.companies.slice(0, batchCount);

    const queue = await getOutreachQueue();
    const existingCompanies = new Set(queue.map(q => q.company.toLowerCase()));

    let addedCount = 0;
    for (const s of startups) {
      if (!existingCompanies.has(s.company.toLowerCase())) {
        queue.push({
          id: `rec-startup-${Date.now()}-${addedCount}`,
          name: 'Founding Team / Recruiter',
          company: s.company,
          email: '', // to be reviewed or filled by user
          role: 'Generative AI & Backend Systems Engineer',
          link: s.careerUrl,
          status: 'pending_preview',
          customSubject: null,
          customBody: null,
          category: s.meta?.category || 'AI Startup',
          description: s.meta?.description || '',
          lastPreviewedAt: null,
          sentAt: null
        });
        existingCompanies.add(s.company.toLowerCase());
        addedCount++;
      }
    }

    await saveOutreachQueue(queue);
    res.json({
      success: true,
      message: `Added ${addedCount} startup companies to outreach campaign`,
      totalQueue: queue.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Generate Live Email Preview for Recipient
app.post('/api/outreach/preview', async (req, res) => {
  try {
    const { id, name, company, email, role, link, customSubject, customBody } = req.body;
    let rec = {};

    if (id) {
      const queue = await getOutreachQueue();
      const found = queue.find(q => q.id === id);
      if (found) {
        rec = { ...found };
      }
    }

    if (name) rec.name = name;
    if (company) rec.company = company;
    if (email) rec.email = email;
    if (role) rec.role = role;
    if (link) rec.link = link;
    if (customSubject !== undefined) rec.customSubject = customSubject;
    if (customBody !== undefined) rec.customBody = customBody;

    const defaultBuilt = buildOutreachEmail({
      name: rec.name || 'Hiring Manager',
      company: rec.company || 'Company',
      role: rec.role || 'Generative AI & Backend Engineer',
      link: rec.link || '',
      email: rec.email || ''
    });

    const subject = rec.customSubject || defaultBuilt.subject;
    const bodyHtml = rec.customBody || defaultBuilt.html;
    const bodyText = defaultBuilt.text;

    // Mark as previewed in queue if id provided
    if (id) {
      const queue = await getOutreachQueue();
      const qItem = queue.find(q => q.id === id);
      if (qItem) {
        qItem.status = 'previewed';
        qItem.lastPreviewedAt = new Date().toISOString();
        if (customSubject) qItem.customSubject = customSubject;
        if (customBody) qItem.customBody = customBody;
        await saveOutreachQueue(queue);
      }
    }

    res.json({
      success: true,
      subject,
      html: bodyHtml,
      text: bodyText,
      recipient: rec
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Verify Attachment Path on Server
app.post('/api/outreach/verify-attachment', async (req, res) => {
  try {
    const target = req.body.path || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf';
    const absPath = path.isAbsolute(target) ? target : path.resolve(rootDir, target);
    if (existsSync(absPath)) {
      const stats = await fs.stat(absPath);
      res.json({
        success: true,
        exists: true,
        filename: path.basename(absPath),
        sizeKb: (stats.size / 1024).toFixed(1),
        path: target
      });
    } else {
      res.json({
        success: true,
        exists: false,
        error: `File not found at: ${target}`
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: AI Email Personalization & Prompt Enhancer
app.post('/api/outreach/enhance-email', async (req, res) => {
  try {
    const { id, company, role, recipientName, link, prompt, provider, apiKey, model, ollamaUrl } = req.body;
    
    if (!company) {
      return res.status(400).json({ success: false, error: 'Company name is required for AI enhancement.' });
    }

    broadcastLog(`🤖 Researching ${company} (what it does, headlines, passion, latest moves)...`, 'system');

    const result = await enhanceEmailWithPrompt({
      company,
      role,
      recipientName,
      link,
      userPrompt: prompt,
      provider: provider || 'gemini',
      apiKey: apiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
      model,
      ollamaUrl
    });

    if (id) {
      const queue = await getOutreachQueue();
      const item = queue.find(q => q.id === id);
      if (item) {
        item.customSubject = result.subject;
        item.customBody = result.html;
        item.status = 'previewed';
        item.aiEnhanced = true;
        item.lastEnhancedAt = new Date().toISOString();
        await saveOutreachQueue(queue);
      }
    }

    broadcastLog(`✨ AI Email enhancement finished for ${company} (${result.providerUsed})`, 'success');
    res.json({
      success: true,
      subject: result.subject,
      html: result.html,
      text: result.text,
      companyIntel: result.companyIntel,
      companyHighlightsUsed: result.companyHighlightsUsed || [],
      reasoning: result.reasoning || '',
      providerUsed: result.providerUsed,
      warning: result.warning,
      note: result.note
    });
  } catch (err) {
    broadcastLog(`❌ AI enhancement error: ${err.message}`, 'error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Live Company Intelligence Search
app.post('/api/outreach/company-intel', async (req, res) => {
  try {
    const { company, role, link } = req.body;
    if (!company) {
      return res.status(400).json({ success: false, error: 'Company name is required.' });
    }
    const intel = await fetchCompanyLiveIntel(company, role, link);
    res.json({ success: true, intel });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Send Test Email ONLY to User's Address (Strict Safety Guardrail)
app.post('/api/outreach/send-test', async (req, res) => {
  try {
    const { id, subject, html, text, fromName, fromEmail, attachmentPath } = req.body;
    const userEmail = config.email.to || config.email.user;

    if (!userEmail) {
      return res.status(400).json({ success: false, error: 'No user email configured in .env (EMAIL_TO / SMTP_USER)' });
    }

    const transporter = createTransporter();
    const testSubject = `[TEST PREVIEW] ${subject || 'Outreach Email Preview'}`;

    broadcastLog(`📨 Sending safe test preview to YOUR email (${userEmail})...`, 'system');

    const result = await sendOutreachEmail(transporter, {
      to: userEmail,
      fromName: fromName || 'Yash Giradkar',
      fromEmail: fromEmail || config.email.user,
      subject: testSubject,
      html: html || '<p>Test email body</p>',
      text: text || 'Test email body',
      attachmentPath: attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf'
    });

    if (!result.success) {
      broadcastLog(`❌ Failed to send test email: ${result.error}`, 'error');
      return res.status(500).json({ success: false, error: result.error });
    }

    broadcastLog(`✅ Test preview sent to ${userEmail} (ID: ${result.messageId}). Zero emails were sent to external contacts.`, 'success');

    // Mark recipient as previewed
    if (id) {
      const queue = await getOutreachQueue();
      const qItem = queue.find(q => q.id === id);
      if (qItem) {
        qItem.status = 'previewed';
        qItem.lastPreviewedAt = new Date().toISOString();
        await saveOutreachQueue(queue);
      }
    }

    res.json({
      success: true,
      message: `Test email sent to your inbox (${userEmail}). No third party was contacted.`,
      messageId: result.messageId
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Send Single Approved Email (Data passed 100% from UI - NO JSON dependency)
app.post('/api/outreach/send-single', async (req, res) => {
  try {
    const {
      to,
      fromName,
      fromEmail,
      recipientName,
      company,
      role,
      subject,
      html,
      text,
      attachmentPath,
      id,
      confirmed
    } = req.body;

    if (!confirmed) {
      return res.status(400).json({ success: false, error: 'Explicit user confirmation required.' });
    }

    // Strict Production Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const recipientEmail = (to || '').trim();
    if (!recipientEmail || !emailRegex.test(recipientEmail)) {
      return res.status(400).json({ success: false, error: `Invalid recipient email address: "${to}". Must be a valid corporate email.` });
    }

    // Reject fake / test placeholder domains in production dispatch
    const lowerTo = recipientEmail.toLowerCase();
    if (lowerTo.endsWith('@example.com') || lowerTo.endsWith('@placeholder.com') || lowerTo.endsWith('@test.com')) {
      return res.status(400).json({ success: false, error: `Refusing to send to fake/test domain (${recipientEmail}). Please enter a verified email in the UI.` });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ success: false, error: 'Email subject cannot be empty.' });
    }

    if (subject.includes('{{') || (html && html.includes('{{'))) {
      return res.status(400).json({ success: false, error: 'Unreplaced template tokens detected. Please resolve all {{tokens}} before sending.' });
    }

    if (!html || !html.trim()) {
      return res.status(400).json({ success: false, error: 'Email body cannot be empty.' });
    }

    // Verify attachment if specified
    if (attachmentPath) {
      const absAttachment = path.isAbsolute(attachmentPath) ? attachmentPath : path.resolve(rootDir, attachmentPath);
      if (!existsSync(absAttachment)) {
        return res.status(400).json({ success: false, error: `Attachment file does not exist at path: ${attachmentPath}` });
      }
    }

    broadcastLog(`📤 Dispatching approved outreach email to ${recipientName || 'Hiring Team'} <${recipientEmail}> (${company || 'Company'})...`, 'system');

    const transporter = createTransporter();
    const sendResult = await sendOutreachEmail(transporter, {
      to: recipientEmail,
      fromName: fromName || 'Yash Giradkar',
      fromEmail: fromEmail || config.email.user,
      subject: subject.trim(),
      html,
      text: text || html.replace(/<[^>]+>/g, ' '),
      attachmentPath: attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf'
    });

    if (sendResult.success) {
      // Audit log sent record to file tracker
      await recordSent({
        email: recipientEmail,
        name: recipientName || '',
        company: company || 'Company',
        role: role || '',
        subject: subject.trim(),
        timestamp: new Date().toISOString()
      });

      // Save complete record directly to MongoDB on localhost:27017 (database: ai_job_hunter)
      await saveOutreachLog({
        company: company || 'Company',
        recipientName: recipientName || '',
        toEmail: recipientEmail,
        fromName: fromName || 'Yash Giradkar',
        fromEmail: fromEmail || config.email.user,
        role: role || '',
        subject: subject.trim(),
        html: html,
        text: text || html.replace(/<[^>]+>/g, ' '),
        attachmentPath: attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf',
        location: req.body.location || 'Remote / Hybrid',
        status: 'sent',
        messageId: sendResult.messageId,
        source: 'ui_single_dispatch'
      });

      // Update in queue tracking if ID provided
      if (id) {
        const queue = await getOutreachQueue();
        const rec = queue.find(q => q.id === id);
        if (rec) {
          rec.status = 'sent';
          rec.sentAt = new Date().toISOString();
          await saveOutreachQueue(queue);
        }
      }

      broadcastLog(`✅ Outreach email successfully sent to ${recipientEmail} (ID: ${sendResult.messageId})`, 'success');
      res.json({ success: true, message: `Email sent to ${recipientEmail}`, messageId: sendResult.messageId });
    } else {
      broadcastLog(`❌ Failed to send to ${recipientEmail}: ${sendResult.error}`, 'error');
      res.status(500).json({ success: false, error: sendResult.error });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Send Approved Batch (Data passed 100% from UI - NO JSON dependency)
app.post('/api/outreach/send-batch', async (req, res) => {
  try {
    const { batch, confirmed } = req.body;
    if (!confirmed) {
      return res.status(400).json({ success: false, error: 'Explicit batch confirmation required.' });
    }

    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients provided in batch payload.' });
    }

    // Enterprise Pre-Flight Validation for the entire batch
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validationErrors = [];

    batch.forEach((item, idx) => {
      const num = idx + 1;
      const to = (item.to || '').trim();
      const comp = item.company || 'Unknown Company';

      if (!to || !emailRegex.test(to)) {
        validationErrors.push(`[#${num} ${comp}] Missing or invalid email address: "${to}"`);
        return;
      }

      const lower = to.toLowerCase();
      if (lower.endsWith('@example.com') || lower.endsWith('@placeholder.com') || lower.endsWith('@test.com')) {
        validationErrors.push(`[#${num} ${comp}] Fake/placeholder domain detected: "${to}"`);
        return;
      }

      if (!item.subject || !item.subject.trim()) {
        validationErrors.push(`[#${num} ${comp}] Subject line is empty`);
        return;
      }

      if (item.subject.includes('[TEST') || item.subject.includes('{{') || (item.html && item.html.includes('{{'))) {
        validationErrors.push(`[#${num} ${comp}] Subject or body contains unreplaced tokens or test markers`);
        return;
      }

      if (!item.html || !item.html.trim()) {
        validationErrors.push(`[#${num} ${comp}] Email body is empty`);
        return;
      }

      if (item.attachmentPath) {
        const absAttachment = path.isAbsolute(item.attachmentPath) ? item.attachmentPath : path.resolve(rootDir, item.attachmentPath);
        if (!existsSync(absAttachment)) {
          validationErrors.push(`[#${num} ${comp}] Attachment missing on disk: ${item.attachmentPath}`);
        }
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Production Batch Validation Failed (${validationErrors.length} issue(s) detected). Zero emails sent.\n${validationErrors.join('\n')}`
      });
    }

    // Acknowledge launch immediately
    res.json({
      success: true,
      message: `Production batch of ${batch.length} verified emails launched with rate-limiting. Monitor terminal for live progress.`
    });

    // Run batch send directly from UI payload
    (async () => {
      broadcastLog(`🚀 Starting verified production batch of ${batch.length} emails...`, 'system');
      const transporter = createTransporter();
      const queue = await getOutreachQueue();

      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        const progress = `[${i + 1}/${batch.length}]`;

        broadcastLog(`${progress} Sending to ${item.recipientName || 'Hiring Team'} at ${item.company} (${item.to})...`, 'system');

        const sendRes = await sendOutreachEmail(transporter, {
          to: item.to,
          fromName: item.fromName || 'Yash Giradkar',
          fromEmail: item.fromEmail || config.email.user,
          subject: item.subject,
          html: item.html,
          text: item.text || item.html.replace(/<[^>]+>/g, ' '),
          attachmentPath: item.attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf'
        });

        if (sendRes.success) {
          await recordSent({
            email: item.to,
            name: item.recipientName || '',
            company: item.company || 'Company',
            role: item.role || '',
            subject: item.subject,
            timestamp: new Date().toISOString()
          });

          // Save complete record directly to MongoDB on localhost:27017 (database: ai_job_hunter)
          await saveOutreachLog({
            company: item.company || 'Company',
            recipientName: item.recipientName || '',
            toEmail: item.to,
            fromName: item.fromName || 'Yash Giradkar',
            fromEmail: item.fromEmail || config.email.user,
            role: item.role || '',
            subject: item.subject,
            html: item.html,
            text: item.text || item.html.replace(/<[^>]+>/g, ' '),
            attachmentPath: item.attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf',
            location: item.location || 'Remote / Hybrid',
            status: 'sent',
            messageId: sendRes.messageId,
            source: 'ui_batch_dispatch'
          });

          if (item.id) {
            const qItem = queue.find(q => q.id === item.id);
            if (qItem) {
              qItem.status = 'sent';
              qItem.sentAt = new Date().toISOString();
              await saveOutreachQueue(queue);
            }
          }

          broadcastLog(`${progress} ✅ Delivered to ${item.to} (ID: ${sendRes.messageId})`, 'success');
        } else {
          broadcastLog(`${progress} ❌ Error sending to ${item.to}: ${sendRes.error}`, 'error');
        }

        if (i < batch.length - 1) {
          broadcastLog(`⏳ Rate-limiting: waiting 15s before next dispatch...`, 'info');
          await delayWithJitter(15000, 5000);
        }
      }

      broadcastLog(`🏁 Batch outreach complete. All ${batch.length} production emails processed.`, 'success');
    })();

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: MongoDB Connection & Statistics
// --------------------------------------------------------------------------
app.get('/api/db/stats', async (req, res) => {
  try {
    const stats = await getDBStats();
    res.json({ success: true, db: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Outreach Logs from MongoDB
app.get('/api/outreach/mongo-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const logs = await getOutreachLogs(limit);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Company HR & Founder Contact Enrichment (Search LinkedIn / Google & Save in MongoDB)
app.post('/api/outreach/enrich-contact', async (req, res) => {
  try {
    const { company, link, id } = req.body;
    if (!company) {
      return res.status(400).json({ success: false, error: 'Company name is required' });
    }

    broadcastLog(`🔍 Searching LinkedIn / Google for HR & Founding members of ${company}...`, 'system');
    const contacts = await enrichCompanyContacts(company, link);

    // If an id was provided, auto-update the queue recipient with top discovered contact
    if (id && contacts.length > 0) {
      const topContact = contacts[0];
      const queue = await getOutreachQueue();
      const rec = queue.find(q => q.id === id);
      if (rec) {
        rec.name = topContact.name || rec.name;
        rec.email = topContact.email || rec.email;
        rec.role = topContact.title || rec.role;
        rec.linkedinUrl = topContact.linkedinUrl || rec.linkedinUrl;
        rec.location = topContact.location || rec.location;
        rec.status = 'previewed';
        await saveOutreachQueue(queue);
      }
    }

    broadcastLog(`✅ Found ${contacts.length} verified contact(s) for ${company} and saved to MongoDB.`, 'success');
    res.json({ success: true, contacts, count: contacts.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Batch Auto-Enrichment for Outreach Queue
app.post('/api/outreach/enrich-batch', async (req, res) => {
  try {
    const queue = await getOutreachQueue();
    // Find recipients without email or with placeholder
    const targets = queue.filter(r => !r.email || r.email.endsWith('@example.com'));
    if (targets.length === 0) {
      return res.json({ success: true, message: 'All recipients in queue already have corporate contacts.', enrichedCount: 0 });
    }

    res.json({ success: true, message: `Auto-enrichment started for ${targets.length} companies in background. Monitor terminal for live progress.` });

    // Background runner
    (async () => {
      broadcastLog(`⚡ Launching auto-enrichment for ${targets.length} startup companies...`, 'system');
      let count = 0;
      for (const rec of targets) {
        try {
          broadcastLog(`🔍 [${count + 1}/${targets.length}] Finding HR & Founders for ${rec.company}...`, 'info');
          const contacts = await enrichCompanyContacts(rec.company, rec.link);
          if (contacts.length > 0) {
            rec.name = contacts[0].name || rec.name;
            rec.email = contacts[0].email || rec.email;
            rec.role = contacts[0].title || rec.role;
            rec.location = contacts[0].location || 'Remote';
            rec.status = 'previewed';
            broadcastLog(`✓ ${rec.company}: Found ${contacts[0].name} (${contacts[0].email})`, 'success');
          }
          count++;
          await saveOutreachQueue(queue);
          await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
          console.error(e);
        }
      }
      broadcastLog(`🏁 Contact enrichment complete. ${count} companies updated and stored in MongoDB.`, 'success');
    })();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get All Company Contacts from MongoDB
app.get('/api/contacts', async (req, res) => {
  try {
    const company = req.query.company;
    const contacts = company 
      ? await getCompanyContacts(company) 
      : await getAllCompanyContacts();
    res.json({ success: true, count: contacts.length, contacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --------------------------------------------------------------------------
// API: Tuesday Morning Timezone-Aware Outreach Scheduler
// --------------------------------------------------------------------------

// Preview timezones and calculated morning slots (Tue/Wed/Thu, etc.) for companies
app.post('/api/outreach/preview-schedule-timezones', (req, res) => {
  try {
    const { companies = [], scheduledDay = 2, scheduledHour = 9 } = req.body;
    const dayIndex = Math.min(6, Math.max(0, parseInt(scheduledDay) ?? 2));
    const hourIndex = Math.min(23, Math.max(0, parseInt(scheduledHour) ?? 9));
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = DAY_NAMES[dayIndex] || 'Tuesday';

    const results = companies.map(c => {
      const tz = detectCompanyTimezone(c);
      const slot = getNextWeekdayMorningUtc(tz, dayIndex, hourIndex);
      return {
        company: c.company,
        location: c.location,
        timezone: tz,
        scheduledLocal: slot.localTimeStr,
        scheduledUtc: slot.scheduledUtc,
        dayName,
        scheduledHour: hourIndex,
        countdown: formatCountdown(slot.scheduledUtc)
      };
    });
    res.json({ success: true, timezones: results, dayName, scheduledHour: hourIndex });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Schedule batch of emails for Tuesday 9 AM in each company's timezone
app.post('/api/outreach/schedule-tuesday', async (req, res) => {
  try {
    const { batch, scheduledDay = 2, scheduledHour = 9 } = req.body;
    // scheduledDay: 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
    // scheduledHour: 0-23 local time
    const dayIndex = Math.min(6, Math.max(0, parseInt(scheduledDay) || 2));
    const hourIndex = Math.min(23, Math.max(0, parseInt(scheduledHour) || 9));
    const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName = DAY_NAMES[dayIndex] || 'Tuesday';

    if (!Array.isArray(batch) || batch.length === 0) {
      return res.status(400).json({ success: false, error: 'No recipients provided in batch.' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validationErrors = [];
    batch.forEach((item, idx) => {
      const to = (item.to || '').trim().toLowerCase();
      if (!to || !emailRegex.test(to) || to.endsWith('@example.com') || to.endsWith('@placeholder.com') || to.endsWith('@test.com')) {
        validationErrors.push(`[#${idx + 1} ${item.company || 'Company'}] Invalid or placeholder email: "${item.to}"`);
      }
      if (!item.subject || !item.subject.trim()) {
        validationErrors.push(`[#${idx + 1} ${item.company || 'Company'}] Missing subject`);
      }
      if (!item.html || !item.html.trim()) {
        validationErrors.push(`[#${idx + 1} ${item.company || 'Company'}] Missing email body`);
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Validation failed for scheduled batch:\n${validationErrors.join('\n')}`
      });
    }

    const queue = await getOutreachQueue();
    const scheduledList = [];

    for (const item of batch) {
      const tz = detectCompanyTimezone({
        company: item.company,
        location: item.location,
        link: item.link,
        role: item.role
      });

      const nextSlot = getNextWeekdayMorningUtc(tz, dayIndex, hourIndex);

      const jobRecord = await saveScheduledEmail({
        company: item.company,
        recipientName: item.recipientName || 'Hiring Team',
        toEmail: item.to.trim(),
        fromName: item.fromName || 'Yash Giradkar',
        fromEmail: item.fromEmail || config.email.user,
        role: item.role,
        subject: item.subject,
        html: item.html,
        text: item.text,
        attachmentPath: item.attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf',
        timezone: tz,
        scheduledUtc: nextSlot.scheduledUtc,
        scheduledLocal: nextSlot.localTimeStr,
        scheduledDay: dayIndex,
        scheduledHour: hourIndex
      });

      if (jobRecord) {
        scheduledList.push({
          company: item.company,
          to: item.to,
          timezone: tz,
          scheduledLocal: nextSlot.localTimeStr,
          scheduledUtc: nextSlot.scheduledUtc,
          dayName,
          scheduledHour: hourIndex
        });

        // Update queue item status to 'scheduled'
        const qItem = queue.find(q => q.id === item.id || (q.company && q.company.toLowerCase() === (item.company || '').toLowerCase()));
        if (qItem) {
          qItem.status = 'scheduled';
          qItem.scheduledFor = nextSlot.localTimeStr;
          qItem.scheduledUtc = nextSlot.scheduledUtc.toISOString();
        }
      }
    }

    await saveOutreachQueue(queue);
    broadcastLog(`📅 Scheduled ${scheduledList.length} email(s) for ${dayName} ${String(hourIndex).padStart(2,'0')}:00 AM across local company timezones!`, 'success');

    res.json({
      success: true,
      message: `Scheduled ${scheduledList.length} email(s) for ${dayName} ${String(hourIndex).padStart(2,'0')}:00 in each company's local timezone.`,
      scheduledList,
      dayName,
      scheduledHour: hourIndex
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Get top 3 LinkedIn hiring manager profiles for a company
app.post('/api/outreach/linkedin-contacts', async (req, res) => {
  try {
    const { company, link } = req.body;
    if (!company) {
      return res.status(400).json({ success: false, error: 'Company name is required.' });
    }
    // Use existing enricher which already does LinkedIn scraping
    const contacts = await enrichCompanyContacts(company, link);
    // Return at most 3 with LinkedIn URLs highlighted
    const top3 = contacts.slice(0, 3).map(c => {
      const lid = c.linkedinId || (c.linkedinUrl ? c.linkedinUrl.split('/in/').pop()?.split('?')[0]?.replace(/\/$/, '') : null);
      return {
        name: c.name,
        title: c.title,
        email: c.email,
        linkedinUrl: c.linkedinUrl || (lid ? `https://www.linkedin.com/in/${lid}` : null),
        linkedinId: lid,
        location: c.location,
        company: c.company || company
      };
    });
    res.json({ success: true, contacts: top3, company });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all scheduled emails
app.get('/api/outreach/scheduled', async (req, res) => {
  try {
    const list = await getScheduledEmails(200);
    const enriched = list.map(item => ({
      ...item,
      countdown: formatCountdown(item.scheduledUtc)
    }));
    res.json({ success: true, count: list.length, scheduledEmails: enriched });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cancel scheduled email(s)
app.post('/api/outreach/scheduled/cancel', async (req, res) => {
  try {
    const { id, all } = req.body;
    if (all) {
      const count = await cancelAllScheduledEmails();
      broadcastLog(`🛑 Cancelled all (${count}) scheduled email jobs.`, 'warn');
      return res.json({ success: true, count, message: `Cancelled all ${count} scheduled emails.` });
    }
    if (!id) {
      return res.status(400).json({ success: false, error: 'Missing scheduled job id.' });
    }
    const ok = await cancelScheduledEmail(id);
    if (ok) {
      broadcastLog(`🛑 Cancelled scheduled job ${id}.`, 'warn');
      res.json({ success: true, message: 'Scheduled email cancelled.' });
    } else {
      res.status(404).json({ success: false, error: 'Job not found or already executed.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Background runner for Tuesday Morning Scheduler
function initSchedulerRunner() {
  console.log('⏰ [Scheduler] Tuesday Morning Timezone Scheduler runner initialized (interval: 60s)');
  setInterval(async () => {
    try {
      const dueJobs = await getDueScheduledEmails();
      if (!dueJobs || dueJobs.length === 0) return;

      broadcastLog(`⏰ [Scheduler] Found ${dueJobs.length} scheduled email(s) ready to fire now!`, 'system');
      const transporter = createTransporter();
      const queue = await getOutreachQueue();

      for (const job of dueJobs) {
        broadcastLog(`🚀 [Scheduler] Sending scheduled Tuesday email to ${job.recipientName || 'Hiring Team'} at ${job.company} (${job.toEmail})...`, 'info');
        
        const sendRes = await sendOutreachEmail(transporter, {
          to: job.toEmail,
          fromName: job.fromName || 'Yash Giradkar',
          fromEmail: job.fromEmail || config.email.user,
          subject: job.subject,
          html: job.html,
          text: job.text || (job.html ? job.html.replace(/<[^>]+>/g, ' ') : ''),
          attachmentPath: job.attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf'
        });

        if (sendRes.success) {
          await recordSent({
            email: job.toEmail,
            name: job.recipientName || '',
            company: job.company || 'Company',
            role: job.role || '',
            subject: job.subject,
            timestamp: new Date().toISOString()
          });

          await saveOutreachLog({
            company: job.company || 'Company',
            recipientName: job.recipientName || '',
            toEmail: job.toEmail,
            fromName: job.fromName || 'Yash Giradkar',
            fromEmail: job.fromEmail || config.email.user,
            role: job.role || '',
            subject: job.subject,
            html: job.html,
            text: job.text || (job.html ? job.html.replace(/<[^>]+>/g, ' ') : ''),
            attachmentPath: job.attachmentPath || process.env.RESUME_PATH || './Yash_Giradkar_Resume.pdf',
            location: job.timezone || 'Remote / Hybrid',
            status: 'sent',
            messageId: sendRes.messageId,
            source: 'scheduled_tuesday_dispatcher'
          });

          await updateScheduledEmailStatus(job._id, 'sent', {
            sentAt: new Date(),
            messageId: sendRes.messageId
          });

          const qItem = queue.find(q => q.email === job.toEmail || q.company === job.company);
          if (qItem) {
            qItem.status = 'sent';
            qItem.sentAt = new Date().toISOString();
            await saveOutreachQueue(queue);
          }

          broadcastLog(`✅ [Scheduler] Tuesday dispatch delivered to ${job.toEmail} (${job.company})! ID: ${sendRes.messageId}`, 'success');
        } else {
          await updateScheduledEmailStatus(job._id, 'failed', {
            error: sendRes.error,
            failedAt: new Date()
          });
          broadcastLog(`❌ [Scheduler] Error sending scheduled email to ${job.toEmail}: ${sendRes.error}`, 'error');
        }

        await delayWithJitter(10000, 3000);
      }
    } catch (err) {
      console.error('[Scheduler Runner Error]:', err.message);
    }
  }, 60000);
}


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

app.listen(PORT, async () => {
  console.log(`\n======================================================`);
  console.log(`🌐 AI Job Hunter — Mission Control UI`);
  console.log(`🚀 Dashboard running at: http://localhost:${PORT}`);
  console.log(`======================================================\n`);
  try {
    await connectDB();
    initSchedulerRunner();
  } catch (err) {
    console.error('[MongoDB Startup Error]:', err.message);
  }
});

