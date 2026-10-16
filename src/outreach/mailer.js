import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

/**
 * Creates a reusable connection-pooled SMTP transporter.
 */
export function createTransporter() {
  if (!config.email.user || !config.email.pass) {
    throw new Error('SMTP credentials missing. Please configure SMTP_USER and SMTP_PASS in .env file.');
  }

  return nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    host: config.email.host || 'smtp.gmail.com',
    port: config.email.port || 465,
    secure: config.email.secure !== false,
    auth: {
      user: config.email.user,
      pass: config.email.pass
    }
  });
}

/**
 * Verifies SMTP connection before starting dispatch.
 */
export async function verifyConnection(transporter) {
  try {
    await transporter.verify();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Sends a single cold outreach email.
 */
export async function sendOutreachEmail(transporter, emailData) {
  const { to, subject, html, text, fromName, fromEmail, attachmentPath, resumePath } = emailData;

  const senderName = (fromName || 'Yash Giradkar').trim();
  const senderEmail = (fromEmail || config.email.user).trim();
  const fromAddress = `"${senderName}" <${senderEmail}>`;

  const mailOptions = {
    from: fromAddress,
    replyTo: fromAddress,
    to: to.trim(),
    subject: subject.trim(),
    html,
    text
  };

  // Optional attachment (Resume PDF or custom document)
  const attachCandidate = attachmentPath || resumePath;
  if (attachCandidate) {
    const absPath = path.isAbsolute(attachCandidate)
      ? attachCandidate
      : path.resolve(process.cwd(), attachCandidate);

    if (fs.existsSync(absPath)) {
      mailOptions.attachments = [
        {
          filename: path.basename(absPath),
          path: absPath
        }
      ];
    }
  }

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Delays execution with randomized jitter to prevent rate-limit detection.
 */
export async function delayWithJitter(baseDelayMs = 25000, maxJitterMs = 15000) {
  const jitter = Math.floor(Math.random() * maxJitterMs);
  const totalDelay = baseDelayMs + jitter;
  console.log(`[Outreach] Sleeping for ${(totalDelay / 1000).toFixed(1)}s before next dispatch...`);
  return new Promise(resolve => setTimeout(resolve, totalDelay));
}
