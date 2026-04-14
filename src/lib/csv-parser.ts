import Papa from 'papaparse';
import type { BudgetOwner, PaidBy } from '@/types/database';

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
}

export interface ParsedCategorizedTransaction extends ParsedTransaction {
  budgetType: string;
  category: string;
  sourceAccount: string;
}

export interface CSVParseResult {
  success: boolean;
  transactions: ParsedTransaction[];
  errors: string[];
}

export interface CategorizedCSVParseResult {
  success: boolean;
  transactions: ParsedCategorizedTransaction[];
  errors: string[];
}

interface CSVRow {
  [key: string]: string;
}

const DATE_COLUMNS = ['date', 'transaction date', 'trans date', 'post date', 'posted date'];
const DESCRIPTION_COLUMNS = ['description', 'merchant', 'name', 'payee', 'transaction description', 'details'];
const AMOUNT_COLUMNS = ['amount', 'debit', 'charge', 'transaction amount'];
const CREDIT_COLUMNS = ['credit', 'payment'];

function normalizeColumnName(name: string): string {
  return name.toLowerCase().trim();
}

function findColumn(headers: string[], possibleNames: string[]): string | null {
  const normalizedHeaders = headers.map(normalizeColumnName);
  for (const name of possibleNames) {
    const index = normalizedHeaders.indexOf(name);
    if (index !== -1) {
      return headers[index];
    }
  }
  return null;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const cleaned = dateStr.trim();
  
  // Try various date formats
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,  // MM/DD/YY
    /^(\d{4})-(\d{2})-(\d{2})$/,         // YYYY-MM-DD
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,     // MM-DD-YYYY
  ];
  
  for (const format of formats) {
    const match = cleaned.match(format);
    if (match) {
      let year: number, month: number, day: number;
      
      if (format === formats[2]) {
        // YYYY-MM-DD
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        // MM/DD/YYYY or variants
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = parseInt(match[3]);
        if (year < 100) {
          year += 2000;
        }
      }
      
      // Validate
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  
  // Fallback to Date parsing
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

function parseAmount(amountStr: string): number | null {
  if (!amountStr) return null;
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = amountStr.replace(/[$,\s]/g, '').trim();
  
  // Handle parentheses for negative numbers
  const isNegative = cleaned.startsWith('(') && cleaned.endsWith(')');
  const value = isNegative ? cleaned.slice(1, -1) : cleaned;
  
  const amount = parseFloat(value);
  if (isNaN(amount)) return null;
  
  return isNegative ? -amount : amount;
}

export function parseCSV(
  csvContent: string,
  paidBy: PaidBy
): CSVParseResult {
  const errors: string[] = [];
  const transactions: ParsedTransaction[] = [];
  
  const result = Papa.parse<CSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  
  if (result.errors.length > 0) {
    result.errors.forEach((err) => {
      errors.push(`Row ${err.row}: ${err.message}`);
    });
  }
  
  if (result.data.length === 0) {
    return {
      success: false,
      transactions: [],
      errors: ['No data found in CSV file'],
    };
  }
  
  const headers = Object.keys(result.data[0]);
  
  const dateCol = findColumn(headers, DATE_COLUMNS);
  const descCol = findColumn(headers, DESCRIPTION_COLUMNS);
  const amountCol = findColumn(headers, AMOUNT_COLUMNS);
  const creditCol = findColumn(headers, CREDIT_COLUMNS);
  
  if (!dateCol) {
    errors.push('Could not find date column. Expected: ' + DATE_COLUMNS.join(', '));
  }
  if (!descCol) {
    errors.push('Could not find description column. Expected: ' + DESCRIPTION_COLUMNS.join(', '));
  }
  if (!amountCol && !creditCol) {
    errors.push('Could not find amount column. Expected: ' + AMOUNT_COLUMNS.join(', '));
  }
  
  if (!dateCol || !descCol || (!amountCol && !creditCol)) {
    return { success: false, transactions: [], errors };
  }
  
  result.data.forEach((row, index) => {
    const date = parseDate(row[dateCol]);
    const description = row[descCol]?.trim();
    
    // Handle amount - some banks split debits and credits
    let amount: number | null = null;
    if (amountCol) {
      amount = parseAmount(row[amountCol]);
    }
    
    // If there's a credit column, subtract credits from debits
    if (creditCol && row[creditCol]) {
      const credit = parseAmount(row[creditCol]);
      if (credit !== null) {
        amount = (amount || 0) - credit;
      }
    }
    
    if (!date) {
      errors.push(`Row ${index + 2}: Invalid date "${row[dateCol]}"`);
      return;
    }
    
    if (!description) {
      errors.push(`Row ${index + 2}: Missing description`);
      return;
    }
    
    if (amount === null || amount === 0) {
      return; // Skip zero or invalid amounts
    }
    
    // We only care about expenses (positive amounts after our parsing)
    // Some banks show credits as negative, some as positive in credit column
    const finalAmount = Math.abs(amount);
    
    transactions.push({
      date,
      description,
      amount: finalAmount,
    });
  });
  
  return {
    success: errors.length === 0 || transactions.length > 0,
    transactions,
    errors,
  };
}

const CATEGORY_COLUMNS = ['category', 'expense category', 'expense_category'];
const SOURCE_ACCOUNT_COLUMNS = ['source account', 'source_account', 'account', 'card', 'credit card'];

/** Prefer explicit "Budget Type" so a generic "Type" column (debit/credit, etc.) is not used by mistake. */
function findBudgetTypeColumn(headers: string[]): string | null {
  const pairs = headers.map((h) => ({ raw: h, n: normalizeColumnName(h) }));
  for (const { raw, n } of pairs) {
    if (n === 'budget type' || n === 'budget_type' || n === 'budgettype') return raw;
  }
  for (const { raw, n } of pairs) {
    if (n.includes('budget') && (n.includes('type') || n.includes('owner'))) return raw;
  }
  for (const { raw, n } of pairs) {
    if (n === 'budget owner' || n === 'budget_owner' || n === 'budgetowner') return raw;
  }
  return findColumn(headers, ['owner', 'type']);
}

export function isCategorizedCSV(csvContent: string): boolean {
  const firstLine = csvContent.split('\n')[0]?.toLowerCase() ?? '';
  return firstLine.includes('budget type') && firstLine.includes('category') && firstLine.includes('source account');
}

export function parseCategorizedCSV(csvContent: string): CategorizedCSVParseResult {
  const errors: string[] = [];
  const transactions: ParsedCategorizedTransaction[] = [];

  const result = Papa.parse<CSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    result.errors.forEach((err) => {
      errors.push(`Row ${err.row}: ${err.message}`);
    });
  }

  if (result.data.length === 0) {
    return { success: false, transactions: [], errors: ['No data found in CSV file'] };
  }

  const headers = Object.keys(result.data[0]);

  const dateCol = findColumn(headers, DATE_COLUMNS);
  const descCol = findColumn(headers, DESCRIPTION_COLUMNS);
  const amountCol = findColumn(headers, AMOUNT_COLUMNS);
  const budgetTypeCol = findBudgetTypeColumn(headers);
  const categoryCol = findColumn(headers, CATEGORY_COLUMNS);
  const sourceCol = findColumn(headers, SOURCE_ACCOUNT_COLUMNS);

  if (!dateCol) errors.push('Could not find date column');
  if (!descCol) errors.push('Could not find description column');
  if (!amountCol) errors.push('Could not find amount column');
  if (!budgetTypeCol) errors.push('Could not find budget type column');
  if (!categoryCol) errors.push('Could not find category column');
  if (!sourceCol) errors.push('Could not find source account column');

  if (!dateCol || !descCol || !amountCol || !budgetTypeCol || !categoryCol || !sourceCol) {
    return { success: false, transactions: [], errors };
  }

  result.data.forEach((row, index) => {
    const date = parseDate(row[dateCol]);
    const description = row[descCol]?.trim();
    const amount = parseAmount(row[amountCol]);
    const budgetType = row[budgetTypeCol]?.trim();
    const category = row[categoryCol]?.trim();
    const sourceAccount = row[sourceCol]?.trim();

    if (!date) {
      errors.push(`Row ${index + 2}: Invalid date "${row[dateCol]}"`);
      return;
    }
    if (!description) {
      errors.push(`Row ${index + 2}: Missing description`);
      return;
    }
    if (amount === null || amount === 0) return;
    if (!budgetType || !category || !sourceAccount) {
      errors.push(`Row ${index + 2}: Missing budget type, category, or source account`);
      return;
    }

    transactions.push({
      date,
      description,
      amount: Math.abs(amount),
      budgetType,
      category,
      sourceAccount,
    });
  });

  return {
    success: errors.length === 0 || transactions.length > 0,
    transactions,
    errors,
  };
}

export function validateCSVFile(file: File): string | null {
  if (!file.name.endsWith('.csv')) {
    return 'Please upload a CSV file';
  }
  
  if (file.size > 5 * 1024 * 1024) {
    return 'File size must be less than 5MB';
  }
  
  return null;
}

/** Normalized tokens that mean joint / shared budget (whole cell). */
const JOINT_BUDGET_EXACT = new Set([
  'joint',
  'shared',
  'household',
  'both',
  'together',
  'us',
  'split',
  'jy', // common shorthand
]);

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * True if a CSV budget-type label refers to the same person as a household display name.
 * Matches whole string, first-name-only, and substring (same idea as inferPaidBy for cards).
 */
export function budgetTypeLabelMatchesPersonName(
  labelRaw: string,
  householdName: string
): boolean {
  const label = norm(labelRaw);
  const name = norm(householdName);
  if (!label || !name) return false;
  if (label === name) return true;
  if (name.startsWith(label + ' ') || name === label) return true;
  if (label.startsWith(name + ' ') || label === name) return true;
  if (name.includes(label) || label.includes(name)) {
    const shorter = Math.min(label.length, name.length);
    if (shorter >= 2) return true;
  }
  return false;
}

/**
 * Map a categorized CSV "Budget Type" cell to `budget_owner`.
 * Previously this required the cell to exactly equal the household name; values like "Simran"
 * failed when settings used "Simran K." and fell through to joint.
 */
export function mapBudgetTypeToBudgetOwner(
  budgetTypeRaw: string,
  personAName: string,
  personBName: string
): BudgetOwner {
  const t = norm(budgetTypeRaw);
  if (!t) return 'joint';

  if (JOINT_BUDGET_EXACT.has(t) || /\bjoint\b/.test(t) || /\bshared\b/.test(t)) {
    return 'joint';
  }

  if (
    t === 'person_a' ||
    t === 'person a' ||
    t === 'p1' ||
    t === 'person1'
  ) {
    return 'person_a';
  }
  if (
    t === 'person_b' ||
    t === 'person b' ||
    t === 'p2' ||
    t === 'person2'
  ) {
    return 'person_b';
  }

  const matchA = budgetTypeLabelMatchesPersonName(budgetTypeRaw, personAName);
  const matchB = budgetTypeLabelMatchesPersonName(budgetTypeRaw, personBName);

  if (matchA && !matchB) return 'person_a';
  if (matchB && !matchA) return 'person_b';
  if (matchA && matchB) {
    // Ambiguous label (e.g. same first name); prefer exact normalized match
    const pA = norm(personAName);
    const pB = norm(personBName);
    if (t === pA) return 'person_a';
    if (t === pB) return 'person_b';
    return 'person_a';
  }

  return 'joint';
}
