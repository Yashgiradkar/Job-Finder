import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

/**
 * Escapes HTML characters.
 */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Sends the comprehensive Job Intelligence email report with file attachments.
 */
export async function sendJobIntelligenceEmail(reportStats, topJobs, fileAttachments = {}) {
  if (!config.email.user || !config.email.pass || !config.email.to) {
    console.log('[EmailReporter] Email credentials missing; skipping email dispatch.');
    return { success: false, error: 'Missing SMTP credentials' };
  }

  const transport = nodemailer.createTransport({
    host: config.email.host || 'smtp.gmail.com',
    port: config.email.port || 465,
    secure: config.email.secure !== false,
    auth: {
      user: config.email.user,
      pass: config.email.pass
    }
  });

  const dateStr = new Date().toISOString().split('T')[0];
  const subject = `Job Intelligence — ${dateStr} — ${reportStats.matchedCount} New Matches`;

  // Build Top Matching Jobs Rows
  const topJobsHtml = topJobs.slice(0, 15).map(j => `
    <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; margin-bottom: 12px; background-color: #ffffff;">
      <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px;">
        <h4 style="margin: 0; font-size: 16px; color: #111827;">
          <a href="${esc(j.jobUrl)}" style="color: #2563eb; text-decoration: none; font-weight: 600;">${esc(j.company)} — ${esc(j.title)}</a>
        </h4>
        <span style="background-color: #ecfdf5; color: #065f46; font-weight: 700; padding: 2px 8px; border-radius: 9999px; font-size: 12px; border: 1px solid #a7f3d0;">${j.overallMatchScore}% Match</span>
      </div>

      <table style="width: 100%; font-size: 13px; color: #4b5563; border-collapse: collapse; margin-bottom: 8px;">
        <tr>
          <td style="padding: 2px 0; width: 120px;"><strong>Job ID:</strong> <code>${esc(j.jobId)}</code></td>
          <td style="padding: 2px 0;"><strong>Location:</strong> ${esc(j.location)} ${j.remote ? '(🌐 Remote)' : ''}</td>
        </tr>
        <tr>
          <td style="padding: 2px 0;"><strong>Experience:</strong> ${esc(j.experienceRequirement || '2–4 years')}</td>
          <td style="padding: 2px 0;"><strong>Salary:</strong> ${esc(j.salaryRange || 'Not Disclosed')}</td>
        </tr>
        <tr>
          <td style="padding: 2px 0;"><strong>Posted:</strong> ${esc(j.freshness || j.postedAt || 'Recent')}</td>
          <td style="padding: 2px 0;"><strong>Resume:</strong> <code>${esc(j.resumeName)}</code></td>
        </tr>
      </table>

      <div style="font-size: 12px; color: #374151; margin-bottom: 6px;">
        <strong>Matched Skills:</strong> ${(j.matchedSkills || []).slice(0, 8).join(', ')}
      </div>

      ${j.missingSkills && j.missingSkills.length > 0 ? `
        <div style="font-size: 12px; color: #9ca3af; margin-bottom: 6px;">
          <strong>Missing Skills:</strong> ${j.missingSkills.join(', ')}
        </div>
      ` : ''}

      <div style="font-size: 12px; color: #6b7280; display: flex; justify-content: space-between; border-top: 1px dashed #e5e7eb; padding-top: 6px; margin-top: 6px;">
        <span><strong>Public Contact:</strong> ${j.hrEmail ? `<a href="mailto:${esc(j.hrEmail)}">${esc(j.hrEmail)}</a>` : 'Standard Career Portal'}</span>
        <span><a href="${esc(j.jobUrl)}" style="color: #2563eb; font-weight: 600;">View & Apply &rarr;</a></span>
      </div>
    </div>
  `).join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 700px; margin: 0 auto; color: #1f2937; line-height: 1.6; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; background-color: #f9fafb;">
      <div style="background: linear-gradient(135deg, #0f172a, #1e293b); color: #ffffff; padding: 24px;">
        <h1 style="margin: 0 0 6px 0; font-size: 22px;">🎯 Daily Job Intelligence Digest</h1>
        <p style="margin: 0; font-size: 14px; opacity: 0.85;">${dateStr} &bull; Candidate: Yash Giradkar (Generative AI / LLM & Backend)</p>
      </div>

      <div style="padding: 20px;">
        <!-- Stats Grid -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; background-color: #ffffff; border-radius: 6px; border: 1px solid #e5e7eb; text-align: center;">
          <tr>
            <td style="padding: 12px; border-right: 1px solid #e5e7eb;">
              <div style="font-size: 20px; font-weight: 700; color: #1e3a8a;">${reportStats.companiesScanned}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Companies</div>
            </td>
            <td style="padding: 12px; border-right: 1px solid #e5e7eb;">
              <div style="font-size: 20px; font-weight: 700; color: #059669;">${reportStats.discoveredCount}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Discovered</div>
            </td>
            <td style="padding: 12px; border-right: 1px solid #e5e7eb;">
              <div style="font-size: 20px; font-weight: 700; color: #2563eb;">${reportStats.matchedCount}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Skills Matched</div>
            </td>
            <td style="padding: 12px; border-right: 1px solid #e5e7eb;">
              <div style="font-size: 20px; font-weight: 700; color: #d97706;">${reportStats.recent48hCount}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Last 48h</div>
            </td>
            <td style="padding: 12px;">
              <div style="font-size: 20px; font-weight: 700; color: #dc2626;">${reportStats.queueCount}</div>
              <div style="font-size: 11px; color: #6b7280; text-transform: uppercase;">Queue (≥70)</div>
            </td>
          </tr>
        </table>

        <h3 style="font-size: 16px; color: #111827; margin: 0 0 12px 0;">Top Matching Openings</h3>
        ${topJobsHtml}

        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 14px; margin-top: 20px; font-size: 13px; color: #4b5563;">
          <h4 style="margin: 0 0 6px 0; color: #111827;">Attached Intelligence Reports:</h4>
          <ul style="margin: 0; padding-left: 20px;">
            <li><code>job-report.md</code> — Full Markdown Report with tables & breakdowns</li>
            <li><code>matched-jobs.json</code> — Candidate-matched dataset</li>
            <li><code>recent-jobs.json</code> — Openings posted within last 48 hours</li>
            <li><code>application-queue.json</code> — High-match openings requiring application approval</li>
          </ul>
        </div>
      </div>

      <div style="background-color: #f3f4f6; border-top: 1px solid #e5e7eb; padding: 12px 20px; font-size: 12px; color: #6b7280; text-align: center;">
        AI Job Hunter &bull; Automated Discovery & Career Intelligence System
      </div>
    </div>
  `;

  // Attachments
  const attachments = [];
  const addAttachment = (filePath, filename) => {
    if (filePath && fs.existsSync(filePath)) {
      attachments.push({
        filename,
        path: filePath
      });
    }
  };

  addAttachment(fileAttachments.matchedJobsPath, 'matched-jobs.json');
  addAttachment(fileAttachments.recentJobsPath, 'recent-jobs.json');
  addAttachment(fileAttachments.queuePath, 'application-queue.json');
  addAttachment(fileAttachments.reportPath, 'job-report.md');

  try {
    const info = await transport.sendMail({
      from: `"AI Job Hunter" <${config.email.user}>`,
      to: config.email.to,
      subject,
      html,
      attachments
    });

    console.log(`[EmailReporter] Job Intelligence email digest sent successfully to ${config.email.to} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EmailReporter] Error sending email: ${err.message}`);
    return { success: false, error: err.message };
  }
}
