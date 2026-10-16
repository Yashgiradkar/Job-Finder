import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Extracts URL from Markdown link [text](url) or returns plain URL.
 */
function extractUrl(text) {
  const all = extractAllUrls(text);
  return all.length > 0 ? all[0] : '';
}

/**
 * Extracts ALL URLs from Markdown links or raw URLs in text.
 */
function extractAllUrls(text) {
  if (!text) return [];
  const urls = [];
  const mdRegex = /\[(?:[^\]]*)\]\((https?:\/\/[^\s\)]+)\)/gi;
  let match;
  while ((match = mdRegex.exec(text)) !== null) {
    urls.push(match[1].trim());
  }
  if (urls.length === 0) {
    const plainRegex = /https?:\/\/[^\s\),]+/gi;
    while ((match = plainRegex.exec(text)) !== null) {
      urls.push(match[0].trim());
    }
  }
  return [...new Set(urls)];
}

/**
 * Parses /jobs/companies.md into structured company records.
 */
export async function parseCompaniesFile(customPath = null) {
  const possiblePaths = [
    customPath,
    path.resolve(process.cwd(), 'jobs/companies.md'),
    path.resolve(process.cwd(), 'company-list-sorted.md'),
    path.resolve(process.cwd(), 'companies.md')
  ].filter(Boolean);

  let content = '';
  let foundPath = '';

  for (const p of possiblePaths) {
    try {
      content = await fs.readFile(p, 'utf-8');
      foundPath = p;
      break;
    } catch {
      continue;
    }
  }

  if (!content) {
    throw new Error(`Could not find companies markdown file in paths: ${possiblePaths.join(', ')}`);
  }

  const companies = [];
  const lines = content.split('\n');

  let isTable = false;
  let tableHeaderFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for Markdown table row
    if (line.startsWith('|')) {
      isTable = true;
      const cells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      
      if (cells.length >= 4) {
        const col0 = cells[0].toLowerCase();
        // Skip header or divider rows
        if (col0.includes('company') || col0.includes('---') || cells[0].startsWith(':') || cells[0].startsWith('-')) {
          tableHeaderFound = true;
          continue;
        }

        const company = cells[0].replace(/[*_`]/g, '').trim();
        const salaryRange = cells[1].trim();
        const remotePolicy = cells[2].trim();
        const urls = extractAllUrls(cells[3]);

        if (company && urls.length > 0) {
          for (const u of urls) {
            companies.push({
              company,
              salaryRange: salaryRange && salaryRange !== '—' ? salaryRange : 'Not Disclosed',
              remotePolicy: remotePolicy || 'Not Specified',
              careerUrl: u,
              careerUrls: urls
            });
          }
        }
      }
    }
  }

  // If not parsed as table, attempt block/line parsing
  if (companies.length === 0) {
    let current = {};
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#') || line.startsWith('---')) continue;

      if (line.match(/^https?:\/\//i) || line.includes('[careers](') || line.includes('http')) {
        current.careerUrl = extractUrl(line);
        if (current.company) {
          companies.push({
            company: current.company,
            salaryRange: current.salaryRange || 'Not Disclosed',
            remotePolicy: current.remotePolicy || 'Not Specified',
            careerUrl: current.careerUrl
          });
          current = {};
        }
      } else if (!current.company) {
        current.company = line;
      } else if (!current.salaryRange && (line.match(/\d+/) || line.toLowerCase().includes('lpa'))) {
        current.salaryRange = line;
      } else if (!current.remotePolicy) {
        current.remotePolicy = line;
      }
    }
  }

  return {
    sourcePath: foundPath,
    totalCompanies: companies.length,
    companies
  };
}
