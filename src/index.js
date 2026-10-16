import 'dotenv/config';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { crawlPortals, recentOnly } from './sources.js';
import { scoreJob } from './matcher.js';
import { enrichContact } from './contacts.js';
import { loadJobs, saveJobs } from './storage.js';
import { sendDigest } from './notify.js';

const args = new Set(process.argv.slice(2));

function id(job) {
  return crypto.createHash('sha256').update(`${job.source}|${job.title}|${job.url}`).digest('hex').slice(0, 16);
}

async function discover() {
  const raw = await crawlPortals();
  const recent = recentOnly(raw);
  const scored = recent.map(job => {
    const m = scoreJob(job);
    return { ...job, jobId: id(job), matchScore: m.score, matched: m.matched };
  }).filter(j => j.matchScore >= config.minMatchScore);

  const old = await loadJobs();
  const map = new Map([...old, ...scored].map(j => [j.jobId, j]));
  let jobs = [...map.values()].sort((a,b) => b.matchScore - a.matchScore);

  const enriched = [];
  for (const job of jobs.filter(j => !j.hrEmails)) {
    enriched.push(await enrichContact(job));
  }
  const enrichedMap = new Map(enriched.map(j => [j.jobId, j]));
  jobs = jobs.map(j => enrichedMap.get(j.jobId) || j);

  await saveJobs(jobs);
  await sendDigest(scored);

  console.table(scored.map(j => ({ jobId:j.jobId, company:j.source, title:j.title, score:j.matchScore, url:j.url })));
  console.log(`Saved ${jobs.length} jobs; ${scored.length} matched this run.`);
}

async function applyApproved() {
  const jobs = await loadJobs();
  const approved = jobs.filter(j => j.approved === true && j.applied !== true);
  if (!approved.length) return console.log('No approved jobs waiting for application.');
  if (!config.autoApply) {
    console.log('AUTO_APPLY=false. Mark jobs approved=true after reviewing data, then enable application automation for portals where it is permitted.');
    return;
  }
  console.log(`Application queue contains ${approved.length} jobs.`);
  console.log('Application adapters are intentionally portal-specific; implement only for portals that permit automated submission and do not bypass CAPTCHA/auth controls.');
}

if (args.has('--apply')) await applyApproved();
else await discover();
