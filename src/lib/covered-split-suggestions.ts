import { merchantFingerprint, brandClusterKey } from '@/lib/merchant-fingerprint';
import type { Transaction } from '@/types/database';

export interface CoveredSplitSuggestion {
  transactionId: string;
  score: number;
  reasons: string[];
  hint: string;
}

const MIN_SCORE = 0.55;

const GROUP_CATEGORY_PATTERNS = [
  /restaurant/i,
  /dining/i,
  /bar/i,
  /nightlife/i,
  /^entertainment$/i,
  /travel/i,
];

const EXCLUDE_CATEGORY_PATTERNS = [
  /grocer/i,
  /utilities/i,
  /rent/i,
  /mortgage/i,
  /subscription/i,
  /healthcare/i,
  /pharmacy/i,
  /transport/i,
  /uber/i,
  /condo/i,
  /\bcar\b/i,
  /personal care/i,
  /^home$/i,
  /fitness/i,
  /etsy/i,
  /shopping/i,
];

const EXCLUDE_MERCHANT_KEYS = new Set([
  'mta',
  'starbucks',
  'uber',
  'wholefoods',
  'walmart',
  'netflix',
  'spotify',
  'amazon',
  'resilientmind',
  'strivepharmacy',
  'gelato',
]);

const GROUP_DESCRIPTION_PATTERNS = [
  /\btst\*/i,
  /\b(grill|kitchen|taqueria|taco|bistro|steakhouse|sushi|pizzeria|brewery|brasserie|cantina)\b/i,
  /\b(bar|pub|lounge|nightclub|tavern)\b/i,
  /doordash|grubhub|seamless|uber eats|postmates/i,
  /\brestaurant\b/i,
  /\bcafe\b/i,
  /\bcomidas\b/i,
];

function notesMentionSplit(notes: string | null | undefined): boolean {
  if (!notes) return false;
  return /split|venmo|covered|friends|group tab|owed/i.test(notes);
}

function isCreditOrRefund(tx: Transaction): boolean {
  if (Number(tx.amount) <= 0) return true;
  return /platinum.*credit|\bcredit\b|refund|reversal/i.test(tx.description);
}

function categoryExcluded(categoryName: string): boolean {
  return EXCLUDE_CATEGORY_PATTERNS.some((p) => p.test(categoryName));
}

function categorySuggestsGroup(categoryName: string): boolean {
  return GROUP_CATEGORY_PATTERNS.some((p) => p.test(categoryName));
}

/** Merchants the household has previously marked as "I covered this". */
export function buildCoveredSplitLearnedMerchants(transactions: Transaction[]): Set<string> {
  const learned = new Set<string>();
  for (const tx of transactions) {
    if (!tx.is_covered) continue;
    learned.add(merchantFingerprint(tx.description));
  }
  return learned;
}

export function scoreCoveredSplitCandidate(
  tx: Transaction,
  learnedMerchants: Set<string>
): CoveredSplitSuggestion | null {
  if (tx.is_covered) return null;
  if (isCreditOrRefund(tx)) return null;

  const amount = Number(tx.amount);
  if (amount < 25) return null;

  const fingerprint = merchantFingerprint(tx.description);
  const brand = brandClusterKey(tx.description);
  if (EXCLUDE_MERCHANT_KEYS.has(fingerprint) || (brand && EXCLUDE_MERCHANT_KEYS.has(brand))) {
    return null;
  }
  if (/platinum|uber one|paygo|tips\*|key food/i.test(tx.description) && amount < 50) {
    return null;
  }

  const categoryName = tx.category?.name ?? '';
  if (categoryName && categoryExcluded(categoryName) && !learnedMerchants.has(fingerprint)) {
    return null;
  }

  let score = 0;
  const reasons: string[] = [];

  if (learnedMerchants.has(fingerprint)) {
    score += 0.45;
    reasons.push('You split similar merchants before');
  }

  if (notesMentionSplit(tx.notes)) {
    score += 0.5;
    reasons.push('Notes mention splitting with others');
  }

  if (categoryName && categorySuggestsGroup(categoryName)) {
    score += 0.35;
    reasons.push(`${categoryName} is often a shared tab`);
  }

  if (/\btst\*/i.test(tx.description) || brand === 'toast') {
    score += 0.35;
    reasons.push('Restaurant tab (Toast POS)');
  }

  if (GROUP_DESCRIPTION_PATTERNS.some((p) => p.test(tx.description))) {
    score += 0.22;
    reasons.push('Looks like dining or group delivery');
  }

  if (amount >= 80) {
    score += 0.35;
    reasons.push('Larger check — common for group tabs');
  } else if (amount >= 50) {
    score += 0.28;
    reasons.push('Typical group dinner amount');
  } else if (amount >= 35) {
    score += 0.18;
  } else if (amount >= 25) {
    score += 0.1;
  }

  if (amount >= 40 && Math.abs(amount - Math.round(amount)) < 0.01) {
    score += 0.06;
  }

  if (score < MIN_SCORE) return null;

  return {
    transactionId: tx.id,
    score,
    reasons: reasons.slice(0, 2),
    hint: 'You may have covered this for friends — split it to track Venmo requests.',
  };
}

export function listCoveredSplitSuggestions(
  transactions: Transaction[],
  options?: {
    dismissedIds?: Set<string>;
    monthYear?: string;
    minScore?: number;
  }
): CoveredSplitSuggestion[] {
  const dismissed = options?.dismissedIds ?? new Set<string>();
  const minScore = options?.minScore ?? MIN_SCORE;
  const learned = buildCoveredSplitLearnedMerchants(transactions);

  let pool = transactions.filter((t) => !dismissed.has(t.id));
  if (options?.monthYear) {
    pool = pool.filter((t) => t.date.slice(0, 7) === options.monthYear);
  }

  const scored: CoveredSplitSuggestion[] = [];
  for (const tx of pool) {
    const hit = scoreCoveredSplitCandidate(tx, learned);
    if (hit && hit.score >= minScore) scored.push(hit);
  }

  return scored.sort((a, b) => b.score - a.score);
}

export function coveredSplitSuggestionMap(
  suggestions: CoveredSplitSuggestion[]
): Map<string, CoveredSplitSuggestion> {
  return new Map(suggestions.map((s) => [s.transactionId, s]));
}
