/**
 * Fetches and parses the Agentic AI Startups Google Sheet.
 * Returns startup records in the same format as parseCompaniesFile().
 */

/**
 * Parse a single CSV line, handling quoted fields.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Maps ATS stage to a salary estimate (LPA) since sheet has no salary data.
 */
function estimateSalary(stage = '') {
  const s = stage.toLowerCase();
  if (s.includes('unicorn') || s.includes('late-stage')) return '30–70 LPA (est.)';
  if (s.includes('series c') || s.includes('growth')) return '30–60 LPA (est.)';
  if (s.includes('series b')) return '25–50 LPA (est.)';
  if (s.includes('series a')) return '20–40 LPA (est.)';
  if (s.includes('seed')) return '15–30 LPA (est.)';
  return 'Not Disclosed';
}

/**
 * Determines remote policy from india office and HQ information.
 */
function deriveRemotePolicy(country = '', indiaOffice = '') {
  const hasIndia = indiaOffice && indiaOffice !== '—' && indiaOffice.trim().length > 1;
  if (hasIndia) return 'hybrid';
  // Startups generally hire remote for engineering
  return '🌐';
}

/**
 * Fetches agentic AI startups from the public Google Sheet.
 */
export async function fetchAgenticStartups(sheetUrl = null) {
  const csvUrl = sheetUrl ||
    'https://docs.google.com/spreadsheets/d/1WgpCK_uuGDevBG2GcEwA9GlQPI_C13VnER9871DVmO0/export?format=csv&gid=0';

  let csvText = '';
  try {
    const res = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'text/csv,text/plain,*/*'
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) {
      throw new Error(`Google Sheet fetch failed: HTTP ${res.status}`);
    }
    csvText = await res.text();
  } catch (err) {
    throw new Error(`Could not fetch Google Sheet: ${err.message}`);
  }

  const lines = csvText.replace(/\r/g, '').split('\n').filter(Boolean);

  let headerFound = false;
  const companies = [];

  for (const line of lines) {
    const cells = parseCSVLine(line);

    if (!headerFound) {
      // Locate header row
      if (cells[0] && cells[0].trim() === 'Startup') {
        headerFound = true;
      }
      continue;
    }

    const name = cells[0]?.trim();
    const careerUrl = cells[1]?.trim();
    const hq = cells[3]?.trim() || '';
    const country = cells[4]?.trim() || '';
    const indiaOffice = cells[5]?.trim() || '—';
    const stage = cells[7]?.trim() || '';
    const category = cells[9]?.trim() || 'Agentic AI';
    const description = cells[10]?.trim() || '';

    // Only include rows with a valid career URL
    if (!name || !careerUrl || !careerUrl.startsWith('http')) continue;

    companies.push({
      company: name,
      salaryRange: estimateSalary(stage),
      remotePolicy: deriveRemotePolicy(country, indiaOffice),
      careerUrl,
      // Extra metadata retained for reporting
      meta: {
        hq,
        country,
        indiaOffice: indiaOffice !== '—' ? indiaOffice : null,
        stage,
        category,
        description,
        source: 'google-sheet-agentic-ai'
      }
    });
  }

  return {
    sourcePath: csvUrl,
    totalCompanies: companies.length,
    companies
  };
}
