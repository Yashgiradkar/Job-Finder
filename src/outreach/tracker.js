import fs from 'node:fs/promises';
import path from 'node:path';

const LOG_FILE = path.resolve(process.cwd(), 'data/outreach-sent.json');

/**
 * Loads the list of already contacted recipients.
 */
export async function loadSentLog() {
  try {
    const content = await fs.readFile(LOG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Checks if an email has already been sent to this recipient for this role/company.
 */
export async function isAlreadySent(email, company, role) {
  const log = await loadSentLog();
  const normEmail = String(email || '').trim().toLowerCase();
  const normComp = String(company || '').trim().toLowerCase();
  return log.some(entry => 
    entry.email?.toLowerCase() === normEmail && 
    (!company || entry.company?.toLowerCase() === normComp)
  );
}

/**
 * Records a successful email dispatch in the tracking log.
 */
export async function recordSent(entry) {
  const log = await loadSentLog();
  const record = {
    email: entry.email,
    name: entry.name,
    company: entry.company,
    role: entry.role,
    link: entry.link || null,
    sentAt: new Date().toISOString()
  };
  log.push(record);
  await fs.mkdir(path.dirname(LOG_FILE), { recursive: true });
  await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
}
