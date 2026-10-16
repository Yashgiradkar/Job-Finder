import { MongoClient } from 'mongodb';
import { config } from '../../config.js';

let client = null;
let db = null;
let isConnected = false;

const uri = config.mongodb?.uri || 'mongodb://127.0.0.1:27017';
const dbName = config.mongodb?.dbName || 'ai_job_hunter';

/**
 * Initializes and connects to the MongoDB database.
 */
export async function connectDB() {
  if (db && isConnected) return db;

  try {
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });

    await client.connect();
    db = client.db(dbName);
    isConnected = true;

    // Create Indexes
    await db.collection('outreach_logs').createIndex({ timestamp: -1 });
    await db.collection('outreach_logs').createIndex({ toEmail: 1 });
    await db.collection('outreach_logs').createIndex({ company: 1 });
    await db.collection('companies_contacts').createIndex({ company: 1, email: 1 });
    await db.collection('companies_contacts').createIndex({ company: 1 });

    console.log(`[MongoDB] Connected successfully to ${uri}/${dbName}`);
    return db;
  } catch (err) {
    console.error(`[MongoDB] Connection error: ${err.message}`);
    isConnected = false;
    return null;
  }
}

/**
 * Returns current DB instance.
 */
export function getDB() {
  return db;
}

/**
 * Returns true if DB is connected.
 */
export function isDBConnected() {
  return isConnected;
}

/**
 * Saves a dispatched outreach email record to MongoDB ONLY after it is really sent to real email ids.
 * Stores full email content (HTML and plain text), SMTP message ID, timestamps, and metadata.
 */
export async function saveOutreachLog(logData) {
  try {
    const toEmail = (logData.to || logData.toEmail || logData.email || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Guard 1: Must be a real, valid email address
    if (!toEmail || !emailRegex.test(toEmail)) {
      console.warn(`[MongoDB] Outreach log skipped: "${toEmail}" is not a valid email address.`);
      return null;
    }

    // Guard 2: Exclude fake, dummy, or test domains
    const lowerTo = toEmail.toLowerCase();
    if (lowerTo.endsWith('@example.com') || lowerTo.endsWith('@placeholder.com') || lowerTo.endsWith('@test.com') || lowerTo.endsWith('@fake.com')) {
      console.warn(`[MongoDB] Outreach log skipped: "${toEmail}" is a placeholder/test domain. Only real emails are logged.`);
      return null;
    }

    // Guard 3: Must NOT be a test preview email
    if (logData.subject && logData.subject.includes('[TEST PREVIEW]')) {
      console.warn(`[MongoDB] Outreach log skipped: Test preview emails to self are not logged in persistent campaign audit.`);
      return null;
    }

    // Guard 4: Must have actually been sent via SMTP with a valid messageId
    if (!logData.messageId || logData.status !== 'sent') {
      console.warn(`[MongoDB] Outreach log skipped: Email has not been confirmed sent via SMTP (missing messageId or status != sent).`);
      return null;
    }

    const database = await connectDB();
    if (!database) return null;

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeStr = now.toTimeString().split(' ')[0]; // HH:mm:ss

    const record = {
      company: logData.company || 'Unknown Company',
      recipientName: logData.recipientName || logData.name || 'Hiring Team',
      toEmail,
      fromName: logData.fromName || 'Yash Giradkar',
      fromEmail: logData.fromEmail || config.email.user,
      role: logData.role || 'Generative AI & Backend Engineer',
      subject: (logData.subject || '').trim(),
      emailContentHtml: logData.html || logData.emailContentHtml || '', // Full HTML email content stored in MongoDB
      emailContentText: logData.text || logData.emailContentText || '', // Full plain text email content stored in MongoDB
      attachment: logData.attachmentPath || logData.attachment || './Yash_Giradkar_Resume.pdf',
      location: logData.location || 'Remote / Hybrid',
      status: 'sent',
      messageId: logData.messageId,
      date: dateStr,
      time: timeStr,
      timestamp: now,
      source: logData.source || 'ui_dispatch',
      previewSnippet: (logData.text || logData.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
      createdAt: now
    };

    const result = await database.collection('outreach_logs').insertOne(record);
    console.log(`[MongoDB] Logged successfully sent production email to ${toEmail} (${record.company}) with full content stored. ID: ${result.insertedId}`);
    return { ...record, _id: result.insertedId };
  } catch (err) {
    console.error(`[MongoDB] Error saving outreach log: ${err.message}`);
    return null;
  }
}

/**
 * Fetches recent outreach logs from MongoDB.
 */
export async function getOutreachLogs(limit = 100) {
  try {
    const database = await connectDB();
    if (!database) return [];

    return await database.collection('outreach_logs')
      .find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  } catch (err) {
    console.error(`[MongoDB] Error fetching outreach logs: ${err.message}`);
    return [];
  }
}

/**
 * Saves or updates company HR / founding team contacts in MongoDB.
 */
export async function saveCompanyContact(contactData) {
  try {
    const database = await connectDB();
    if (!database) return null;

    const filter = {
      company: new RegExp(`^${contactData.company}$`, 'i'),
      ...(contactData.email ? { email: contactData.email } : { name: contactData.name })
    };

    const updateDoc = {
      $set: {
        company: contactData.company,
        name: contactData.name || 'Hiring Team',
        email: contactData.email || '',
        title: contactData.title || contactData.role || 'Founding Member / Recruiter',
        linkedinUrl: contactData.linkedinUrl || '',
        location: contactData.location || 'Remote',
        source: contactData.source || 'google_linkedin_search',
        verified: Boolean(contactData.email && contactData.email.includes('@')),
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    };

    const result = await database.collection('companies_contacts').updateOne(filter, updateDoc, { upsert: true });
    return result;
  } catch (err) {
    console.error(`[MongoDB] Error saving company contact: ${err.message}`);
    return null;
  }
}

/**
 * Finds all stored contacts for a company.
 */
export async function getCompanyContacts(companyName) {
  try {
    const database = await connectDB();
    if (!database) return [];

    return await database.collection('companies_contacts')
      .find({ company: new RegExp(companyName, 'i') })
      .toArray();
  } catch (err) {
    console.error(`[MongoDB] Error getting company contacts: ${err.message}`);
    return [];
  }
}

/**
 * Fetches all saved company contacts.
 */
export async function getAllCompanyContacts() {
  try {
    const database = await connectDB();
    if (!database) return [];

    return await database.collection('companies_contacts')
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();
  } catch (err) {
    console.error(`[MongoDB] Error getting all contacts: ${err.message}`);
    return [];
  }
}

/**
 * Returns summary stats for MongoDB database.
 */
export async function getDBStats() {
  try {
    const database = await connectDB();
    if (!database) {
      return { connected: false, uri, dbName, error: 'Database not connected' };
    }

    const logsCount = await database.collection('outreach_logs').countDocuments();
    const contactsCount = await database.collection('companies_contacts').countDocuments();

    return {
      connected: true,
      uri,
      dbName,
      collections: {
        outreach_logs: logsCount,
        companies_contacts: contactsCount
      }
    };
  } catch (err) {
    return { connected: false, uri, dbName, error: err.message };
  }
}
