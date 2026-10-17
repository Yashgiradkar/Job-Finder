/**
 * Timezone-Aware Tuesday Morning Email Scheduler
 * 
 * Determines the correct "Tuesday 9 AM" in the company's local timezone,
 * converts to UTC, stores the job in MongoDB `scheduled_emails`, and
 * provides the cron runner with ready-to-fire jobs.
 */

import { connectDB } from '../db/mongo.js';

// ---------------------------------------------------------------------------
// Company Location → IANA Timezone Mapping
// Covers major US, EU, Asia-Pacific, and India tech hubs.
// ---------------------------------------------------------------------------
const CITY_TIMEZONE_MAP = {
  // USA
  'san francisco': 'America/Los_Angeles',
  'sf':            'America/Los_Angeles',
  'bay area':      'America/Los_Angeles',
  'silicon valley':'America/Los_Angeles',
  'palo alto':     'America/Los_Angeles',
  'menlo park':    'America/Los_Angeles',
  'mountain view': 'America/Los_Angeles',
  'sunnyvale':     'America/Los_Angeles',
  'santa clara':   'America/Los_Angeles',
  'san jose':      'America/Los_Angeles',
  'oakland':       'America/Los_Angeles',
  'berkeley':      'America/Los_Angeles',
  'los angeles':   'America/Los_Angeles',
  'la':            'America/Los_Angeles',
  'seattle':       'America/Los_Angeles',
  'portland':      'America/Los_Angeles',
  'denver':        'America/Denver',
  'salt lake city':'America/Denver',
  'phoenix':       'America/Phoenix',
  'chicago':       'America/Chicago',
  'dallas':        'America/Chicago',
  'austin':        'America/Chicago',
  'houston':       'America/Chicago',
  'minneapolis':   'America/Chicago',
  'kansas city':   'America/Chicago',
  'new york':      'America/New_York',
  'nyc':           'America/New_York',
  'brooklyn':      'America/New_York',
  'manhattan':     'America/New_York',
  'boston':        'America/New_York',
  'washington':    'America/New_York',
  'dc':            'America/New_York',
  'atlanta':       'America/New_York',
  'miami':         'America/New_York',
  'raleigh':       'America/New_York',
  'charlotte':     'America/New_York',
  'philadelphia':  'America/New_York',
  'pittsburgh':    'America/New_York',
  // Canada
  'toronto':       'America/Toronto',
  'montreal':      'America/Toronto',
  'vancouver':     'America/Vancouver',
  // Europe
  'london':        'Europe/London',
  'uk':            'Europe/London',
  'berlin':        'Europe/Berlin',
  'germany':       'Europe/Berlin',
  'munich':        'Europe/Berlin',
  'hamburg':       'Europe/Berlin',
  'frankfurt':     'Europe/Berlin',
  'paris':         'Europe/Paris',
  'france':        'Europe/Paris',
  'amsterdam':     'Europe/Amsterdam',
  'netherlands':   'Europe/Amsterdam',
  'stockholm':     'Europe/Stockholm',
  'sweden':        'Europe/Stockholm',
  'oslo':          'Europe/Oslo',
  'copenhagen':    'Europe/Copenhagen',
  'zurich':        'Europe/Zurich',
  'switzerland':   'Europe/Zurich',
  'madrid':        'Europe/Madrid',
  'barcelona':     'Europe/Madrid',
  'milan':         'Europe/Rome',
  'rome':          'Europe/Rome',
  'dublin':        'Europe/Dublin',
  'ireland':       'Europe/Dublin',
  'helsinki':      'Europe/Helsinki',
  'warsaw':        'Europe/Warsaw',
  'prague':        'Europe/Prague',
  // India
  'bangalore':     'Asia/Kolkata',
  'bengaluru':     'Asia/Kolkata',
  'mumbai':        'Asia/Kolkata',
  'delhi':         'Asia/Kolkata',
  'hyderabad':     'Asia/Kolkata',
  'chennai':       'Asia/Kolkata',
  'pune':          'Asia/Kolkata',
  'india':         'Asia/Kolkata',
  // Asia-Pacific
  'singapore':     'Asia/Singapore',
  'tokyo':         'Asia/Tokyo',
  'japan':         'Asia/Tokyo',
  'seoul':         'Asia/Seoul',
  'korea':         'Asia/Seoul',
  'beijing':       'Asia/Shanghai',
  'shanghai':      'Asia/Shanghai',
  'china':         'Asia/Shanghai',
  'hong kong':     'Asia/Hong_Kong',
  'sydney':        'Australia/Sydney',
  'melbourne':     'Australia/Sydney',
  'australia':     'Australia/Sydney',
  'auckland':      'Pacific/Auckland',
  // Middle East
  'dubai':         'Asia/Dubai',
  'uae':           'Asia/Dubai',
  'riyadh':        'Asia/Riyadh',
  'tel aviv':      'Asia/Jerusalem',
  'israel':        'Asia/Jerusalem',
};

/**
 * Determines the most likely IANA timezone string for a company
 * based on its location field, LinkedIn URL, website domain, or HQ city.
 *
 * @param {Object} companyData - { company, location, link, role }
 * @returns {string} IANA timezone string (defaults to 'America/Los_Angeles' for US startups)
 */
export function detectCompanyTimezone(companyData) {
  const searchText = [
    companyData.location || '',
    companyData.company || '',
    companyData.link || '',
    companyData.role || ''
  ].join(' ').toLowerCase();

  // Try city/region map
  for (const [keyword, tz] of Object.entries(CITY_TIMEZONE_MAP)) {
    if (searchText.includes(keyword)) {
      return tz;
    }
  }

  // Default: US west coast (most AI startups are Bay Area based)
  return 'America/Los_Angeles';
}

// Day-of-week name → index (0=Sun … 6=Sat)
const WEEKDAY_INDEX = { 'Sunday':0,'Monday':1,'Tuesday':2,'Wednesday':3,'Thursday':4,'Friday':5,'Saturday':6 };

/**
 * Generic scheduler: returns the next occurrence of `targetWeekday` at `targetHour:00`
 * in the given IANA `timezone`, as a UTC Date.
 *
 * @param {string} timezone - IANA timezone string (e.g. 'America/Los_Angeles')
 * @param {number} targetWeekday - 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat (default 2=Tuesday)
 * @param {number} targetHour   - Local hour 0-23 (default 9 = 9:00 AM)
 * @returns {{ scheduledUtc: Date, localTimeStr: string, timezone: string, daysUntil: number }}
 */
export function getNextWeekdayMorningUtc(timezone, targetWeekday = 2, targetHour = 9) {
  const now = new Date();

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, weekday: 'long'
  });

  const parts = formatter.formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value;

  const localHour     = parseInt(get('hour'));
  const localWeekday  = get('weekday');
  const currentDayIdx = WEEKDAY_INDEX[localWeekday] ?? 1;

  let daysUntil = (targetWeekday - currentDayIdx + 7) % 7;

  // If today IS the target day but the time slot has already passed, push one week
  if (daysUntil === 0 && localHour >= targetHour) {
    daysUntil = 7;
  }

  const targetLocal = new Date(now);
  targetLocal.setDate(now.getDate() + daysUntil);

  const targetYear  = targetLocal.getFullYear();
  const targetMonth = String(targetLocal.getMonth() + 1).padStart(2, '0');
  const targetDay   = String(targetLocal.getDate()).padStart(2, '0');
  const targetHourStr = String(targetHour).padStart(2, '0');

  const localDateTimeStr = `${targetYear}-${targetMonth}-${targetDay}T${targetHourStr}:00:00`;
  const scheduledUtc = localToUtc(localDateTimeStr, timezone);

  const dayName = Object.keys(WEEKDAY_INDEX).find(k => WEEKDAY_INDEX[k] === targetWeekday) || 'Tuesday';

  return {
    scheduledUtc,
    localTimeStr: `${localDateTimeStr} ${dayName} ${targetHourStr}:00 (${timezone})`,
    timezone,
    daysUntil,
    dayName,
    targetHour
  };
}

/**
 * Backward-compatible alias: next Tuesday at 9:00 AM
 * @param {string} timezone
 */
export function getNextTuesdayMorningUtc(timezone) {
  return getNextWeekdayMorningUtc(timezone, 2, 9);
}

/**
 * Converts a local datetime string to a UTC Date by leveraging
 * the Intl API offset for that specific timezone.
 *
 * @param {string} localDateTimeStr - "2026-10-21T09:00:00"
 * @param {string} timezone - IANA timezone string
 * @returns {Date} UTC Date
 */
function localToUtc(localDateTimeStr, timezone) {
  // We need to find what UTC time corresponds to "localDateTimeStr" in `timezone`.
  // Strategy: binary-search is robust but overkill. Instead use the offset trick:
  // Parse as if UTC, then measure the Intl-reported local time, compute the offset.
  const naiveUtc = new Date(localDateTimeStr + 'Z');

  // Get what Intl reports for this naive UTC in the target tz
  const localReported = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).format(naiveUtc);

  // localReported format: "2026-10-21, 02:30:00" or "2026-10-21 02:30:00"
  const normalized = localReported.replace(',', '');
  const localDate  = new Date(normalized + 'Z');

  // Difference between what we want and what Intl reported
  const targetLocal = new Date(localDateTimeStr + 'Z');
  const offsetMs    = targetLocal - localDate;

  return new Date(naiveUtc.getTime() + offsetMs);
}

// ---------------------------------------------------------------------------
// MongoDB CRUD for scheduled_emails
// ---------------------------------------------------------------------------

/**
 * Saves a scheduled email job to MongoDB.
 *
 * @param {Object} jobData
 * @returns {Object|null} Inserted document
 */
export async function saveScheduledEmail(jobData) {
  try {
    const database = await connectDB();
    if (!database) return null;

    const now = new Date();
    const record = {
      company:        jobData.company || 'Unknown',
      recipientName:  jobData.recipientName || 'Hiring Team',
      toEmail:        jobData.toEmail,
      fromName:       jobData.fromName || 'Yash Giradkar',
      fromEmail:      jobData.fromEmail || '',
      role:           jobData.role || '',
      subject:        jobData.subject,
      html:           jobData.html,
      text:           jobData.text || '',
      attachmentPath: jobData.attachmentPath || './Yash_Giradkar_Resume.pdf',
      timezone:       jobData.timezone,
      scheduledUtc:   jobData.scheduledUtc,       // UTC Date when to send
      scheduledLocal: jobData.scheduledLocal,      // "2026-10-21T09:00:00 (America/Los_Angeles)"
      status:         'scheduled',                 // scheduled | sent | failed | cancelled
      createdAt:      now,
      updatedAt:      now,
      source:         'ui_tuesday_scheduler'
    };

    await database.collection('scheduled_emails').createIndex({ scheduledUtc: 1 });
    await database.collection('scheduled_emails').createIndex({ status: 1 });
    await database.collection('scheduled_emails').createIndex({ toEmail: 1 });

    const result = await database.collection('scheduled_emails').insertOne(record);
    console.log(`[Scheduler] Scheduled email to ${jobData.toEmail} (${jobData.company}) for ${jobData.scheduledLocal}. ID: ${result.insertedId}`);
    return { ...record, _id: result.insertedId };
  } catch (err) {
    console.error(`[Scheduler] Error saving scheduled email: ${err.message}`);
    return null;
  }
}

/**
 * Fetches all scheduled emails ready to send now (scheduledUtc <= now, status = 'scheduled').
 *
 * @returns {Array} Array of due job documents
 */
export async function getDueScheduledEmails() {
  try {
    const database = await connectDB();
    if (!database) return [];

    return await database.collection('scheduled_emails')
      .find({ status: 'scheduled', scheduledUtc: { $lte: new Date() } })
      .sort({ scheduledUtc: 1 })
      .toArray();
  } catch (err) {
    console.error(`[Scheduler] Error fetching due emails: ${err.message}`);
    return [];
  }
}

/**
 * Marks a scheduled email as sent, failed, or cancelled.
 *
 * @param {string|import('mongodb').ObjectId} id - Document _id
 * @param {string} status - 'sent' | 'failed' | 'cancelled'
 * @param {Object} extra - Extra fields to merge (messageId, error, etc.)
 */
export async function updateScheduledEmailStatus(id, status, extra = {}) {
  try {
    const database = await connectDB();
    if (!database) return;

    const { ObjectId } = await import('mongodb');
    await database.collection('scheduled_emails').updateOne(
      { _id: new ObjectId(String(id)) },
      { $set: { status, updatedAt: new Date(), ...extra } }
    );
  } catch (err) {
    console.error(`[Scheduler] Error updating job status: ${err.message}`);
  }
}

/**
 * Fetches recent scheduled emails for the UI panel.
 *
 * @param {number} limit
 * @returns {Array}
 */
export async function getScheduledEmails(limit = 200) {
  try {
    const database = await connectDB();
    if (!database) return [];

    return await database.collection('scheduled_emails')
      .find({})
      .sort({ scheduledUtc: 1, createdAt: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error(`[Scheduler] Error fetching scheduled emails: ${err.message}`);
    return [];
  }
}

/**
 * Cancels a specific scheduled email by ID.
 *
 * @param {string} id
 * @returns {boolean}
 */
export async function cancelScheduledEmail(id) {
  try {
    const database = await connectDB();
    if (!database) return false;

    const { ObjectId } = await import('mongodb');
    const result = await database.collection('scheduled_emails').updateOne(
      { _id: new ObjectId(String(id)), status: 'scheduled' },
      { $set: { status: 'cancelled', updatedAt: new Date() } }
    );
    return result.modifiedCount > 0;
  } catch (err) {
    console.error(`[Scheduler] Error cancelling job: ${err.message}`);
    return false;
  }
}

/**
 * Cancels all pending scheduled emails.
 *
 * @returns {number} Count of cancelled jobs
 */
export async function cancelAllScheduledEmails() {
  try {
    const database = await connectDB();
    if (!database) return 0;

    const result = await database.collection('scheduled_emails').updateMany(
      { status: 'scheduled' },
      { $set: { status: 'cancelled', updatedAt: new Date() } }
    );
    return result.modifiedCount;
  } catch (err) {
    console.error(`[Scheduler] Error cancelling all jobs: ${err.message}`);
    return 0;
  }
}

/**
 * Helper: Returns a human-readable countdown string from now to a target UTC date.
 *
 * @param {Date} targetUtc
 * @returns {string}
 */
export function formatCountdown(targetUtc) {
  const diffMs = new Date(targetUtc) - new Date();
  if (diffMs <= 0) return 'Due now';

  const totalSeconds = Math.floor(diffMs / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}
