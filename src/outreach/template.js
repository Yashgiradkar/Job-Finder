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
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14.5px; line-height: 1.6; color: #1e293b; max-width: 580px; margin: 0 auto; padding: 4px;">
  <p style="margin-bottom: 12px; font-size: 15px;">Hi ${firstName || 'there'},</p>

  <p style="margin-bottom: 12px;">I've been closely following <b>${companyDisplay}</b>'s rapid innovation${roleDisplay ? ` and saw you're looking for a <b>${roleDisplay}</b>` : ''}${link ? ` (<a href="${esc(link)}" style="color: #4f46e5; text-decoration: underline;">job posting</a>)` : ''}.</p>

  <p style="margin-bottom: 14px;">Most candidates build simple prompt wrappers. My focus over the last <b>2–4 years</b> has been the actual hard engineering: <b>production multi-agent systems, sub-second vector retrieval, and high-throughput backend infrastructure</b> that make AI dependable at scale.</p>

  <div style="background: #f8fafc; border-left: 3px solid #6366f1; border-radius: 4px; padding: 12px 16px; margin: 14px 0;">
    <p style="margin: 0 0 8px 0; font-weight: 600; color: #0f172a; font-size: 13.5px; text-transform: uppercase; letter-spacing: 0.5px;">Key Impact I Bring to ${companyDisplay}:</p>
    <ul style="margin: 0; padding-left: 18px; color: #334155; font-size: 14px;">
      <li style="margin-bottom: 6px;"><b>Agentic AI & RAG:</b> Multi-agent orchestration (LangChain, LangGraph), deterministic tool-calling, and hybrid vector retrieval achieving <b>94.6% Precision@5</b>.</li>
      <li style="margin-bottom: 6px;"><b>High-Concurrency Backend:</b> Node.js, TypeScript, NestJS API Gateways & Python/FastAPI microservices (reduced production API latency by <b>83%</b>).</li>
      <li style="margin-bottom: 0;"><b>Production Infrastructure:</b> Scalable MongoDB aggregations, PostgreSQL, Redis caching, Docker containerization, and automated AWS (ECS/Fargate) CI/CD.</li>
    </ul>
  </div>

  <p style="margin-bottom: 14px;">I've attached my resume for your convenience. Would you or the engineering hiring team be open to a brief <b>10-minute sync this week</b> to discuss how I can contribute immediately?</p>

  <p style="margin-top: 18px; color: #475569; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 13.5px;">
    Best regards,<br>
    <strong style="color: #0f172a; font-size: 15px;">${esc(candidateName)}</strong><br>
    <span style="font-size: 13px; color: #64748b;">Generative AI / LLM & Backend Systems Engineer</span><br>
    <span style="font-size: 12.5px; margin-top: 4px; display: inline-block;">
      <a href="${esc(resumeUrl)}" style="color: #4f46e5; text-decoration: none; font-weight: 500;">🌐 Portfolio</a> &bull; 
      <a href="${esc(linkedinUrl)}" style="color: #4f46e5; text-decoration: none; font-weight: 500;">💼 LinkedIn</a> &bull; 
      <a href="${esc(githubUrl)}" style="color: #4f46e5; text-decoration: none; font-weight: 500;">🐙 GitHub</a>
      ${contactPhone ? ` &bull; <span style="color: #334155;">📞 ${esc(contactPhone)}</span>` : ''}
    </span>
  </p>
</div>
`;

  const text = `Hi ${firstName || 'there'},

I've been closely following ${companyDisplay}'s rapid innovation${roleDisplay ? ` and saw you're looking for a ${roleDisplay}` : ''}.

Most candidates build simple prompt wrappers. My focus over the last 2–4 years has been the actual hard engineering: production multi-agent systems, sub-second vector retrieval, and high-throughput backend infrastructure that make AI dependable at scale.

Key Impact I Bring to ${companyDisplay}:
• Agentic AI & RAG: Multi-agent orchestration (LangChain, LangGraph), deterministic tool-calling, and hybrid vector retrieval achieving 94.6% Precision@5.
• High-Concurrency Backend: Node.js, TypeScript, NestJS API Gateways & Python/FastAPI microservices (reduced production API latency by 83%).
• Production Infrastructure: Scalable MongoDB aggregations, PostgreSQL, Redis caching, Docker containerization, and automated AWS (ECS/Fargate) CI/CD.

I've attached my resume for your convenience. Would you or the engineering hiring team be open to a brief 10-minute sync this week to discuss how I can contribute immediately?

Best regards,
${candidateName}
Generative AI & Backend Systems Engineer
Portfolio: ${resumeUrl} | LinkedIn: ${linkedinUrl} | GitHub: ${githubUrl} | Phone: ${contactPhone}
`;

  return { subject, html, text };
}
