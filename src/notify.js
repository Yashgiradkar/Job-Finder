import nodemailer from 'nodemailer';
import { config } from '../config.js';

export async function sendDigest(jobs) {
  if (!config.email.user || !config.email.pass || !config.email.to) return;
  const transport = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: { user: config.email.user, pass: config.email.pass }
  });

  const rows = jobs.map(j => `
    <tr>
      <td>${esc(j.company || j.source)}</td>
      <td>${esc(j.title)}</td>
      <td>${j.matchScore}</td>
      <td>${esc((j.matched || []).slice(0, 8).join(', '))}</td>
      <td><a href="${esc(j.url)}">Job</a></td>
      <td>${esc((j.hrEmails || []).join(', '))}</td>
      <td>${j.linkedinContact ? `<a href="${esc(j.linkedinContact)}">LinkedIn</a>` : ''}</td>
    </tr>`).join('');

  await transport.sendMail({
    from: config.email.user,
    to: config.email.to,
    subject: `Job Hunter: ${jobs.length} matched openings`,
    html: `<h2>Recent matched openings</h2><table border="1" cellpadding="6"><tr><th>Company</th><th>Role</th><th>Score</th><th>Matched skills</th><th>Opening</th><th>HR email</th><th>LinkedIn</th></tr>${rows}</table>`
  });
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
