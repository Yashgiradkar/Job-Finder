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
  const greeting = firstName ? `Greetings ${esc(firstName)},` : 'Greetings,';
  const roleDisplay = role ? esc(role) : 'Software Engineer';
  const companyDisplay = company ? esc(company) : 'your team';

  // Candidate information from candidateProfile or options
  const profile = options.candidateProfile || candidateProfile;
  const resumeUrl = options.resumeUrl || profile.portfolio;
  const linkedinUrl = options.linkedinUrl || profile.linkedin;
  const githubUrl = options.githubUrl || profile.github;
  const contactPhone = options.phone || profile.phone;
  const candidateName = options.candidateName || profile.name;

  const subject = `Request for an Interview Opportunity - ${roleDisplay} at ${companyDisplay}`;

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #2d3748; max-width: 600px;">
  <p>${greeting}</p>
  
  <p>I hope this email finds you well. I'm <b>${esc(candidateName)}</b>, a <b>Generative AI & Backend Systems Engineer</b>. I noticed that <b>${companyDisplay}</b> is looking for a <b>${roleDisplay}</b>${link ? ` (<a href="${esc(link)}" style="color: #2563eb; text-decoration: underline;">opening link</a>)` : ''}, and I would love to explore an opportunity to contribute to your engineering team.</p>

  <p>A quick overview of my background:</p>
  <ul style="padding-left: 20px; margin: 10px 0;">
    <li style="margin-bottom: 6px;"><b>Generative AI & LLM Systems:</b> Built multi-tenant RAG applications with dynamic tool calling, multimodal document parsing (PDF, HTML, images), and evaluated retrieval accuracy reaching <b>94.6% Precision@5</b>.</li>
    <li style="margin-bottom: 6px;"><b>High-Performance Backend:</b> Deep experience in <b>Node.js, TypeScript, NestJS, Express, and Python</b>; optimized production APIs and database queries, reducing latency by <b>83%</b> at SmartData Enterprises.</li>
    <li style="margin-bottom: 6px;"><b>Distributed Systems & Microservices:</b> Designed and maintained production-grade <b>TypeScript API Gateways</b> with Consul service discovery, circuit breaking, and centralized observability (ELK Stack & Correlation IDs).</li>
    <li style="margin-bottom: 6px;"><b>Database Integrity & Scalability:</b> Hands-on expertise in <b>MongoDB aggregations</b> (resolved 70K+ record data integrity incident with zero data loss), PostgreSQL, and Redis caching.</li>
    <li style="margin-bottom: 6px;"><b>Cloud & CI/CD:</b> Production containerization with <b>Docker, AWS (ECS, Fargate, S3, Secrets Manager)</b>, and automated GitHub Actions deployment pipelines.</li>
  </ul>

  <p>I am actively available for interviews and can join at the earliest. A referral or discussion regarding this role would mean a lot to my career.</p>

  <p>Please feel free to review my profiles:</p>
  <p style="margin: 8px 0;">
    📄 <a href="${esc(resumeUrl)}" style="color: #2563eb; font-weight: 600; text-decoration: underline;">Resume / Portfolio</a> &nbsp;|&nbsp; 
    💼 <a href="${esc(linkedinUrl)}" style="color: #2563eb; font-weight: 600; text-decoration: underline;">LinkedIn</a> &nbsp;|&nbsp; 
    💻 <a href="${esc(githubUrl)}" style="color: #2563eb; font-weight: 600; text-decoration: underline;">GitHub</a>
  </p>

  <p style="margin-top: 20px;">
    Thank you for your time and consideration.<br><br>
    Warm regards,<br>
    <b>${esc(candidateName)}</b><br>
    ${contactPhone ? `<span>📞 ${esc(contactPhone)}</span><br>` : ''}
    <span>✉️ ${esc(profile.email)}</span>
  </p>
</div>
`;

  const text = `${firstName ? `Greetings ${firstName},` : 'Greetings,'}

I'm ${candidateName}, a Generative AI & Backend Systems Engineer. I noticed that ${company} is looking for a ${role}, and I would love to explore an interview opportunity.

Summary of my background:
- Generative AI & LLM: Built multi-tenant RAG systems with dynamic tool calling and 94.6% Precision@5 retrieval.
- Backend & Performance: Node.js, TypeScript, NestJS, Express; reduced API latency by 83%.
- Microservices & Architecture: Production TypeScript API Gateways with Consul service discovery and ELK observability.
- Databases: MongoDB aggregations (repaired 70K+ production records), PostgreSQL, Redis.
- Cloud & DevOps: AWS (ECS, Fargate, S3, Secrets Manager), Docker, GitHub Actions CI/CD.

Portfolio / Resume: ${resumeUrl}
LinkedIn: ${linkedinUrl}
GitHub: ${githubUrl}

Thank you for your time and consideration.

Warm regards,
${candidateName}
${contactPhone ? `Phone: ${contactPhone}` : ''}
Email: ${profile.email}
`;

  return { subject, html, text };
}
