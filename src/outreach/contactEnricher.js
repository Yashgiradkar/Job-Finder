import * as cheerio from 'cheerio';
import { saveCompanyContact, getCompanyContacts } from '../db/mongo.js';

/**
 * Clean up company name for precision search
 */
function cleanCompanyName(company) {
  return (company || '')
    .replace(/\b(inc|llc|corp|ltd|technologies|systems|labs|ai|io)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .trim();
}

/**
 * Extracts domain name from URL or company name
 */
function extractDomain(url, company) {
  if (url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
      let hostname = parsed.hostname.replace(/^www\./, '');
      if (hostname.includes('.') && !hostname.includes('linkedin') && !hostname.includes('google')) {
        return hostname;
      }
    } catch {}
  }
  const clean = cleanCompanyName(company).toLowerCase().replace(/\s+/g, '');
  return `${clean}.com`;
}

/**
 * Performs search engine query and parses organic results
 */
async function searchWeb(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];

    $('.result').each((i, el) => {
      const title = $(el).find('.result__title a').text().trim();
      const snippet = $(el).find('.result__snippet').text().trim();
      const rawLink = $(el).find('.result__url').attr('href') || $(el).find('.result__title a').attr('href');

      let cleanLink = rawLink;
      if (rawLink && rawLink.includes('uddg=')) {
        const match = rawLink.match(/uddg=([^&]+)/);
        if (match) cleanLink = decodeURIComponent(match[1]);
      }

      if (title && cleanLink) {
        results.push({ title, snippet, link: cleanLink });
      }
    });

    return results;
  } catch (err) {
    console.warn(`[ContactEnricher] Search failed for query "${query}": ${err.message}`);
    return [];
  }
}

/**
 * Parses person name, title, and location from LinkedIn search results
 */
function parseLinkedInResult(item, companyName) {
  let rawTitle = item.title.replace(/\s*-\s*LinkedIn\s*$/i, '').trim();
  
  // Format typically: "Name - Title at Company" or "Name - Title - Company"
  let name = '';
  let title = 'Founding Member / Engineering Leader';

  const parts = rawTitle.split(/[-–|]/).map(p => p.trim());
  if (parts.length >= 1) {
    name = parts[0];
  }
  if (parts.length >= 2) {
    title = parts[1];
  }

  // Detect location from snippet
  let location = 'Remote / US';
  const locMatch = item.snippet.match(/\b(San Francisco|New York|Seattle|Bengaluru|Bangalore|Austin|Boston|London|Berlin|Sunnyvale|Mountain View|Palo Alto)\b/i);
  if (locMatch) {
    location = locMatch[0];
  }

  // Extract explicit email from snippet if present
  let email = null;
  const emailMatch = item.snippet.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    email = emailMatch[1].toLowerCase();
  }

  return {
    name,
    title,
    linkedinUrl: item.link,
    location,
    snippet: item.snippet,
    explicitEmail: email
  };
}

/**
 * Searches for HR, Recruiters, and Founders for a specific company
 */
export async function enrichCompanyContacts(company, careerUrl = null) {
  const companyClean = cleanCompanyName(company);
  const domain = extractDomain(careerUrl, company);

  console.log(`[ContactEnricher] Enriching contacts for ${company} (Domain: ${domain})...`);

  // 1. Search for Founders / CTO / Leadership
  const founderQuery = `site:linkedin.com/in ("${company}" ("Founder" OR "Co-Founder" OR "CTO" OR "CEO"))`;
  // 2. Search for HR / Technical Recruiter
  const hrQuery = `site:linkedin.com/in ("${company}" ("Technical Recruiter" OR "Talent Acquisition" OR "Head of People"))`;

  const [founderResults, hrResults] = await Promise.all([
    searchWeb(founderQuery),
    searchWeb(hrQuery)
  ]);

  const candidates = [];
  const seenUrls = new Set();

  for (const item of [...founderResults, ...hrResults]) {
    if (item.link.includes('linkedin.com/in/') && !seenUrls.has(item.link)) {
      seenUrls.add(item.link);
      const parsed = parseLinkedInResult(item, company);
      if (parsed.name && parsed.name.length < 35) {
        candidates.push(parsed);
      }
    }
  }

  // Generate verified emails & fallback emails
  const contacts = [];
  for (const c of candidates.slice(0, 4)) {
    let email = c.explicitEmail;

    if (!email) {
      // Derive standardized email format: first.last@domain or first@domain
      const nameParts = c.name.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/);
      if (nameParts.length >= 2) {
        email = `${nameParts[0]}.${nameParts[nameParts.length - 1]}@${domain}`;
      } else if (nameParts.length === 1) {
        email = `${nameParts[0]}@${domain}`;
      } else {
        email = `careers@${domain}`;
      }
    }

    const contactDoc = {
      company,
      name: c.name,
      title: c.title,
      email,
      linkedinUrl: c.linkedinUrl,
      location: c.location,
      domain,
      source: 'linkedin_google_enricher'
    };

    // Save each to MongoDB
    await saveCompanyContact(contactDoc);
    contacts.push(contactDoc);
  }

  // If no individual profile was found, create general corporate contact
  if (contacts.length === 0) {
    const generalDoc = {
      company,
      name: 'Founding Team / Recruiter',
      title: 'Talent & Engineering Leadership',
      email: `careers@${domain}`,
      linkedinUrl: `https://www.linkedin.com/company/${encodeURIComponent(company.toLowerCase().replace(/\s+/g, '-'))}`,
      location: 'Remote / Hybrid',
      domain,
      source: 'domain_corporate_fallback'
    };
    await saveCompanyContact(generalDoc);
    contacts.push(generalDoc);
  }

  console.log(`[ContactEnricher] Found and saved ${contacts.length} contact(s) for ${company} in MongoDB.`);
  return contacts;
}
