import { skillGroups, targetTitles } from '../config.js';

const normalize = s => String(s || '').toLowerCase().replace(/[^a-z0-9+#./ -]/g, ' ');

export function scoreJob(job) {
  const text = normalize(`${job.title} ${job.description} ${(job.skills || []).join(' ')}`);
  let score = 0;
  const matched = [];
  const weights = { ai: 30, backend: 25, data: 15, cloud: 15, product: 10 };

  for (const [group, keywords] of Object.entries(skillGroups)) {
    const hits = keywords.filter(k => text.includes(normalize(k)));
    if (hits.length) {
      score += Math.min(weights[group], hits.length * Math.ceil(weights[group] / 4));
      matched.push(...hits);
    }
  }

  const title = normalize(job.title);
  if (targetTitles.some(t => title.includes(normalize(t)))) score += 20;
  if (/senior|staff|lead|principal/.test(title)) score += 5;
  if (/intern|internship|trainee/.test(title)) score -= 25;

  return { score: Math.min(100, score), matched: [...new Set(matched)] };
}
