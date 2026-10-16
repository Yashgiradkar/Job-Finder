import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

/**
 * Normalizes an object's keys to lowercase for flexible column lookup.
 */
function normalizeRow(rawRow) {
  const row = {};
  for (const [key, value] of Object.entries(rawRow)) {
    const cleanKey = key.trim().toLowerCase().replace(/[\s_-]+/g, '');
    row[cleanKey] = typeof value === 'string' ? value.trim() : value;
  }

  // Find matching columns
  const getVal = (possibleKeys) => {
    for (const pk of possibleKeys) {
      const matchKey = Object.keys(row).find(k => k === pk.toLowerCase().replace(/[\s_-]+/g, ''));
      if (matchKey && row[matchKey] !== undefined && row[matchKey] !== null) {
        return String(row[matchKey]).trim();
      }
    }
    return '';
  };

  const name = getVal(['name', 'contact', 'recipient', 'hrname', 'candidatename', 'first_name']);
  const company = getVal(['company', 'companyname', 'org', 'organization']);
  const email = getVal(['email', 'mail', 'emailaddress', 'e-mail']);
  const role = getVal(['role', 'jobtitle', 'title', 'position', 'jobrole']);
  const link = getVal(['link', 'joblink', 'joburl', 'url', 'opening']);
  const status = getVal(['status', 'state', 'sent']);

  return {
    raw: rawRow,
    name,
    company,
    email,
    role,
    link,
    status
  };
}

/**
 * Reads and parses an Excel file (.xlsx, .xls, .csv).
 */
export function readOutreachSheet(filePath = './list.xlsx', targetSheetName = null) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Outreach sheet not found at path: ${resolvedPath}`);
  }

  const workbook = xlsx.readFile(resolvedPath);
  const sheetNames = workbook.SheetNames;

  if (sheetNames.length === 0) {
    throw new Error(`Excel file ${filePath} has no sheets.`);
  }

  const sheetName = targetSheetName && sheetNames.includes(targetSheetName)
    ? targetSheetName
    : sheetNames[0];

  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet);

  const parsedRows = rawData
    .map(normalizeRow)
    .filter(row => {
      // Must have at least an email and company/role
      return row.email && row.email.includes('@') && (row.company || row.role);
    });

  return {
    sheetName,
    availableSheets: sheetNames,
    totalRows: rawData.length,
    validRows: parsedRows
  };
}
