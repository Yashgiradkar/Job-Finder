import nodemailer from 'nodemailer';
import { config } from '../../config.js';

/**
 * Escapes HTML characters.
 */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Sends the structured interview preparation update email.
 */
export async function sendInterviewNotification(notificationData) {
  if (!config.email.user || !config.email.pass || !config.email.to) {
    console.log('[Notifier] Email configuration missing in .env; skipping email notification.');
    return;
  }

  const transport = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: { user: config.email.user, pass: config.email.pass }
  });

  const {
    company,
    role,
    interviewDate,
    jobId,
    matchSummary,
    newDevelopments,
    preparationCompleted,
    highestPriorityTopics,
    artifacts
  } = notificationData;

  const subject = `[Interview Prep] ${company} — ${role} (${interviewDate || 'Upcoming'})`;

  const textContent = `Company: ${company}
Role: ${role}
Interview date: ${interviewDate}
Job ID: ${jobId}

Match summary:
${matchSummary}

New company developments:
${newDevelopments.length > 0 ? newDevelopments.map(d => `- ${d}`).join('\n') : '- None recorded today'}

Preparation completed:
${preparationCompleted.length > 0 ? preparationCompleted.map(p => `- ${p}`).join('\n') : '- Up to date'}

Highest-priority topics:
${highestPriorityTopics.length > 0 ? highestPriorityTopics.map(t => `- ${t}`).join('\n') : '- Core system design and RAG evaluation review'}

Artifacts:
${artifacts.map(a => `- ${a}`).join('\n')}
`;

  const htmlContent = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1f2937; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: #ffffff; padding: 24px;">
        <h1 style="margin: 0 0 8px 0; font-size: 22px;">🎯 Interview Preparation Briefing</h1>
        <p style="margin: 0; font-size: 14px; opacity: 0.9;">${esc(company)} &bull; ${esc(role)}</p>
      </div>

      <div style="padding: 24px;">
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 6px 0; font-weight: 600; width: 140px; color: #4b5563;">Company:</td>
            <td style="padding: 6px 0; font-weight: 700; color: #111827;">${esc(company)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600; color: #4b5563;">Role:</td>
            <td style="padding: 6px 0; color: #111827;">${esc(role)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600; color: #4b5563;">Interview Date:</td>
            <td style="padding: 6px 0; color: #dc2626; font-weight: 600;">${esc(interviewDate)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: 600; color: #4b5563;">Job ID:</td>
            <td style="padding: 6px 0; font-family: monospace; color: #4b5563;">${esc(jobId)}</td>
          </tr>
        </table>

        <div style="background-color: #f3f4f6; border-left: 4px solid #3b82f6; padding: 12px 16px; margin-bottom: 20px; border-radius: 4px;">
          <h3 style="margin: 0 0 6px 0; font-size: 15px; color: #1e3a8a;">Match Summary</h3>
          <p style="margin: 0; font-size: 14px; color: #374151;">${esc(matchSummary)}</p>
        </div>

        <h3 style="font-size: 16px; color: #111827; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">New Company Developments</h3>
        <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 14px; color: #374151;">
          ${(newDevelopments.length > 0 ? newDevelopments : ['No new developments detected today']).map(d => `<li style="margin-bottom: 6px;">${esc(d)}</li>`).join('')}
        </ul>

        <h3 style="font-size: 16px; color: #111827; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">Preparation Completed</h3>
        <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 14px; color: #374151;">
          ${preparationCompleted.map(p => `<li style="margin-bottom: 6px;">${esc(p)}</li>`).join('')}
        </ul>

        <h3 style="font-size: 16px; color: #111827; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">Highest-Priority Topics</h3>
        <ul style="margin: 0 0 20px 0; padding-left: 20px; font-size: 14px; color: #374151;">
          ${highestPriorityTopics.map(t => `<li style="margin-bottom: 6px;"><strong>${esc(t)}</strong></li>`).join('')}
        </ul>

        <h3 style="font-size: 16px; color: #111827; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px;">Generated Artifacts</h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 13px; font-family: monospace; color: #4b5563;">
          ${artifacts.map(a => `<li style="margin-bottom: 4px;">${esc(a)}</li>`).join('')}
        </ul>
      </div>

      <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 12px 24px; font-size: 12px; color: #6b7280; text-align: center;">
        AI Job Hunter &bull; Automated 9:00 AM Interview Preparation System
      </div>
    </div>
  `;

  await transport.sendMail({
    from: `"AI Job Hunter" <${config.email.user}>`,
    to: config.email.to,
    subject,
    text: textContent,
    html: htmlContent
  });

  console.log(`[Notifier] Notification email sent successfully to ${config.email.to} for ${company} — ${role}`);
}
