import 'dotenv/config';
import path from 'node:path';
import { readOutreachSheet } from './sheetReader.js';
import { createTransporter, verifyConnection, sendOutreachEmail, delayWithJitter } from './mailer.js';
import { buildOutreachEmail } from './template.js';
import { isAlreadySent, recordSent } from './tracker.js';
import { config } from '../../config.js';

/**
 * Parses CLI arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const getArgVal = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  return {
    sheetPath: getArgVal('--sheet') || './list.xlsx',
    sheetName: getArgVal('--sheet-name') || null,
    isDryRun: args.includes('--dry-run'),
    limit: getArgVal('--limit') ? parseInt(getArgVal('--limit'), 10) : null,
    baseDelayMs: getArgVal('--delay') ? parseInt(getArgVal('--delay'), 10) * 1000 : 20000,
    attachResume: !args.includes('--no-attach'),
    skipDedup: args.includes('--skip-dedup')
  };
}

/**
 * Executes the outreach email automation.
 */
export async function runOutreach(options = {}) {
  const opts = { ...parseArgs(), ...options };

  console.log('\n======================================================');
  console.log('🚀 Automated Cold Outreach & Referral Engine');
  console.log('======================================================');
  console.log(`Sheet: ${opts.sheetPath}`);
  console.log(`Mode: ${opts.isDryRun ? '🔍 DRY RUN (No emails will be sent)' : '⚡ LIVE DISPATCH'}`);

  let sheetData;
  try {
    sheetData = readOutreachSheet(opts.sheetPath, opts.sheetName);
  } catch (err) {
    console.error(`❌ Error reading sheet: ${err.message}`);
    return { success: false, error: err.message };
  }

  console.log(`Loaded Sheet: "${sheetData.sheetName}" | Total Rows: ${sheetData.totalRows} | Valid Recipients: ${sheetData.validRows.length}`);

  if (sheetData.validRows.length === 0) {
    console.log('No valid recipients found with email and company/role.');
    return { success: true, sent: 0, skipped: 0, failed: 0 };
  }

  let transporter = null;
  if (!opts.isDryRun) {
    try {
      transporter = createTransporter();
      console.log('Verifying SMTP connection...');
      const verification = await verifyConnection(transporter);
      if (!verification.success) {
        console.error(`❌ SMTP verification failed: ${verification.error}`);
        return { success: false, error: verification.error };
      }
      console.log('✅ SMTP connection verified successfully.\n');
    } catch (err) {
      console.error(`❌ Error initializing SMTP: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const rowsToProcess = opts.limit ? sheetData.validRows.slice(0, opts.limit) : sheetData.validRows;

  for (let i = 0; i < rowsToProcess.length; i++) {
    const row = rowsToProcess[i];
    const progress = `[${i + 1}/${rowsToProcess.length}]`;

    // Deduplication check
    if (!opts.skipDedup && (await isAlreadySent(row.email, row.company, row.role))) {
      console.log(`${progress} ⏭️  Skipping already contacted: ${row.email} (${row.company || 'Unknown'})`);
      skippedCount++;
      continue;
    }

    const emailContent = buildOutreachEmail(row);

    if (opts.isDryRun) {
      console.log(`\n${progress} 📧 [DRY RUN PREVIEW]`);
      console.log(`To: ${row.name ? `${row.name} <${row.email}>` : row.email}`);
      console.log(`Company: ${row.company} | Role: ${row.role}`);
      console.log(`Subject: ${emailContent.subject}`);
      console.log(`Opening Link: ${row.link || 'None'}`);
      console.log(`Resume Attachment: ${opts.attachResume && config.resumePath ? config.resumePath : 'Disabled'}`);
      console.log('--- Email Body Snippet ---');
      console.log(emailContent.text.slice(0, 220) + '...\n');
      sentCount++;
      continue;
    }

    // Live dispatch
    console.log(`${progress} 📤 Sending email to ${row.name || 'Recipient'} <${row.email}> (${row.company} - ${row.role})...`);
    
    const sendResult = await sendOutreachEmail(transporter, {
      to: row.email,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      resumePath: opts.attachResume ? config.resumePath : null
    });

    if (sendResult.success) {
      console.log(`✅ Sent successfully (Message ID: ${sendResult.messageId})`);
      await recordSent(row);
      sentCount++;
    } else {
      console.error(`❌ Failed to send to ${row.email}: ${sendResult.error}`);
      failedCount++;
    }

    // Delay before next recipient if more rows remain
    if (i < rowsToProcess.length - 1) {
      await delayWithJitter(opts.baseDelayMs, 10000);
    }
  }

  console.log('\n======================================================');
  console.log('📊 Outreach Campaign Summary');
  console.log('======================================================');
  console.log(`Total Processed: ${rowsToProcess.length}`);
  console.log(`Successfully Sent: ${sentCount}`);
  console.log(`Skipped (Duplicates): ${skippedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log('======================================================\n');

  return {
    success: true,
    sent: sentCount,
    skipped: skippedCount,
    failed: failedCount
  };
}

// Execute when run directly via node
if (process.argv[1]?.endsWith('src/outreach/index.js') || process.argv[1]?.endsWith('src/outreach')) {
  runOutreach().catch(err => {
    console.error('Fatal error running outreach:', err);
    process.exit(1);
  });
}
