/**
 * Contact enrichment using only publicly exposed metadata.
 */
export async function enrichJobContacts(job) {
  const company = job.company || '';
  const text = `${job.description || ''} ${job.responsibilities?.join(' ') || ''}`;

  // Extract any public recruiting email directly in the job post (e.g. careers@, jobs@, recruiting@)
  const emailMatch = text.match(/\b([a-zA-Z0-9._%+-]+@(careers\.[a-zA-Z0-9.-]+|jobs\.[a-zA-Z0-9.-]+|[a-zA-Z0-9.-]+\.com|[a-zA-Z0-9.-]+\.io))\b/i);
  let hrEmail = null;
  if (emailMatch && !emailMatch[1].includes('example.com') && !emailMatch[1].includes('sentry.io')) {
    hrEmail = emailMatch[1].toLowerCase();
  }

  // Public LinkedIn company page link
  const companySlug = company.toLowerCase().replace(/[^a-z0-9]/g, '');
  const publicLinkedInCompany = `https://www.linkedin.com/company/${companySlug}`;

  return {
    hrEmail,
    recruiterName: null,
    recruiterLinkedIn: null,
    publicLinkedInCompany
  };
}
