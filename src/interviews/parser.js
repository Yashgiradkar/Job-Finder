import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Sanitizes a string for filesystem folder names.
 */
export function slugify(str) {
  return String(str || '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Normalizes date and computes day difference between interview date and today.
 */
export function getDaysUntil(interviewDateStr, referenceDate = new Date()) {
  const d = new Date(interviewDateStr);
  if (isNaN(d.getTime())) return null;

  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - ref.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Parses upcoming.md into structured interview objects.
 */
export async function parseUpcomingInterviews(filePath = './interviews/upcoming.md', referenceDate = new Date()) {
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Try root /interviews/upcoming.md or create a starter template
      try {
        content = await fs.readFile(path.resolve(process.cwd(), 'interviews/upcoming.md'), 'utf-8');
      } catch {
        return [];
      }
    } else {
      throw err;
    }
  }

  return parseInterviewsContent(content, referenceDate);
}

/**
 * Parses markdown text content for interview entries.
 */
export function parseInterviewsContent(content, referenceDate = new Date()) {
  const entries = [];
  if (!content || !content.trim()) return entries;

  // Split by markdown headers (## or ### or --- dividers)
  const sections = content.split(/\n(?=## |\n---\n)/g);

  for (const rawSection of sections) {
    const section = rawSection.trim();
    if (!section) continue;

    // Extract fields
    const getField = (keys) => {
      for (const key of keys) {
        // Match - **key**: value or key: value or - key: value
        const regex = new RegExp(`(?:^|\\n)[\\s*-]*(?:\\*\\*)?${key}(?:\\*\\*)?\\s*[:=]\\s*(.*)`, 'i');
        const match = section.match(regex);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      return '';
    };

    const company = getField(['company', 'company_name', 'organization']);
    const role = getField(['role', 'job_title', 'title', 'position']);
    const jobId = getField(['job_id', 'jobId', 'id']);
    const jobUrl = getField(['job_url', 'jobUrl', 'url', 'link']);
    const location = getField(['location', 'workplace', 'city']);
    const interviewDate = getField(['interview_date', 'interviewDate', 'date']);
    const resumeVersion = getField(['resume_version', 'resumeVersion', 'resume']);

    // Extract job description (can be multi-line under "job_description:" or "### Job Description")
    let jobDescription = '';
    const jdHeaderMatch = section.match(/(?:(?:^|\n)[\\s*-]*(?:\*\*)?job_description(?:\*\*)?\s*[:=]|###\s*Job\s*Description\s*\n)([\s\S]*)/i);
    if (jdHeaderMatch && jdHeaderMatch[1]) {
      // Cut off at the next field if any
      const text = jdHeaderMatch[1].trim();
      const endMatch = text.search(/\n[\\s*-]*(?:\*\*)?(?:company|role|job_id|job_url|location|interview_date|resume_version)(?:\*\*)?\s*[:=]/i);
      jobDescription = endMatch !== -1 ? text.slice(0, endMatch).trim() : text;
    }

    if (company && role) {
      const daysUntil = interviewDate ? getDaysUntil(interviewDate, referenceDate) : null;
      entries.push({
        company,
        role,
        jobId: jobId || `${slugify(company)}-${slugify(role)}`,
        jobUrl: jobUrl || '',
        location: location || 'Remote',
        interviewDate: interviewDate || '',
        daysUntil,
        resumeVersion: resumeVersion || 'default',
        jobDescription: jobDescription || `${role} at ${company}`,
        companySlug: slugify(company),
        roleSlug: slugify(role),
        workspaceDir: path.join('interviews', slugify(company), slugify(role))
      });
    }
  }

  return entries;
}
