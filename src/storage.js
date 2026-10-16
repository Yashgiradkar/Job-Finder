import { promises as fs } from 'node:fs';
const FILE = './data/jobs.json';

export async function loadJobs() {
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')); }
  catch { return []; }
}

export async function saveJobs(jobs) {
  await fs.mkdir('./data', { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(jobs, null, 2));
}
