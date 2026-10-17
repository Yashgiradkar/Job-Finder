import { candidateProfile } from '../interviews/candidateProfile.js';

/**
 * Escapes HTML characters safely.
 */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Generates personalized subject, HTML, and text versions of the cold outreach email.
 */
export function buildOutreachEmail(row, options = {}) {
  const { name: fullName, company, role, link } = row;
  const firstName = fullName ? fullName.trim().split(/\s+/)[0] : '';
  const roleDisplay = role ? esc(role) : 'Generative AI & Backend Engineer';
  const companyDisplay = company ? esc(company) : 'your team';

  // Candidate information from candidateProfile or options
  const profile = options.candidateProfile || candidateProfile;
  const resumeUrl = options.resumeUrl || profile.portfolio;
  const linkedinUrl = options.linkedinUrl || profile.linkedin;
  const githubUrl = options.githubUrl || profile.github;
  const contactPhone = options.phone || profile.phone;
  const candidateName = options.candidateName || profile.name;

  const subject = roleDisplay && companyDisplay !== 'your team' 
    ? `${candidateName} — Generative AI & Backend Systems (${roleDisplay} at ${companyDisplay})`
    : `${candidateName} — Generative AI & Backend Systems Engineer`;

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14.5px; line-height: 1.6; color: #111827; max-width: 580px; margin: 0 auto; padding: 4px;">
  <p style="margin-bottom: 14px;">Hi ${firstName || 'there'},</p>

  <p style="margin-bottom: 14px;">I've been closely following ${companyDisplay}'s work and wanted to reach out regarding engineering roles${roleDisplay ? ` for a <b>${roleDisplay}</b>` : ''}${link ? ` (<a href="${esc(link)}" style="color: #2563eb; text-decoration: underline;">job post</a>)` : ''}.</p>

  <p style="margin-bottom: 14px;">Over the past 2–4 years, my focus has been on high-throughput backend infrastructure and production Generative AI systems. A few key highlights of what I've delivered:</p>

  <p style="margin-bottom: 8px;">&bull; <b>Agentic AI & RAG:</b> Multi-agent orchestration (LangChain, LangGraph), dynamic tool-calling, and hybrid vector retrieval achieving <b>94.6% Precision@5</b> (Avion AI Support Platform).</p>
  <p style="margin-bottom: 8px;">&bull; <b>High-Concurrency Backend:</b> Node.js, TypeScript, NestJS API Gateways and Python/FastAPI microservices (reduced production API latency by <b>83%</b>).</p>
  <p style="margin-bottom: 14px;">&bull; <b>Production Infrastructure:</b> Scalable MongoDB aggregations (repaired 70K+ records during an incident), PostgreSQL, Redis caching, Docker, and automated AWS (ECS/Fargate) CI/CD.</p>

  <p style="margin-bottom: 14px;">I've attached my resume for your review. Would you or someone on the engineering team have 10 minutes this week for a brief introductory chat?</p>

  <p style="margin-top: 20px; font-size: 14px; color: #374151;">
    Best regards,<br>
    <strong style="color: #111827;">${esc(candidateName)}</strong><br>
    Generative AI & Backend Systems Engineer<br>
    <a href="${esc(resumeUrl)}" style="color: #2563eb; text-decoration: none;">Portfolio</a> &bull; 
    <a href="${esc(linkedinUrl)}" style="color: #2563eb; text-decoration: none;">LinkedIn</a> &bull; 
    <a href="${esc(githubUrl)}" style="color: #2563eb; text-decoration: none;">GitHub</a>
    ${contactPhone ? ` &bull; ${esc(contactPhone)}` : ''}
  </p>
</div>
`;

  const text = `Hi ${firstName || 'there'},

I've been closely following ${companyDisplay}'s work and wanted to reach out regarding engineering roles${roleDisplay ? ` for a ${roleDisplay}` : ''}.

Over the past 2–4 years, my focus has been on high-throughput backend infrastructure and production Generative AI systems. A few key highlights of what I've delivered:

• Agentic AI & RAG: Multi-agent orchestration (LangChain, LangGraph), dynamic tool-calling, and hybrid vector retrieval achieving 94.6% Precision@5 (Avion AI Support Platform).
• High-Concurrency Backend: Node.js, TypeScript, NestJS API Gateways and Python/FastAPI microservices (reduced production API latency by 83%).
• Production Infrastructure: Scalable MongoDB aggregations (repaired 70K+ records during an incident), PostgreSQL, Redis caching, Docker, and automated AWS (ECS/Fargate) CI/CD.

I've attached my resume for your review. Would you or someone on the engineering team have 10 minutes this week for a brief introductory chat?

Best regards,
${candidateName}
Generative AI & Backend Systems Engineer
Portfolio: ${resumeUrl} | LinkedIn: ${linkedinUrl} | GitHub: ${githubUrl} | Phone: ${contactPhone}
`;

  return { subject, html, text };
}
