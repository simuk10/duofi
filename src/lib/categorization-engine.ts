import { normalizeDescriptionForSuggestions } from '@/lib/category-suggestions';
import { brandClusterKey, merchantFingerprint } from '@/lib/merchant-fingerprint';
import type { BudgetOwner, Transaction } from '@/types/database';

export type GuessSource =
  | 'exact'
  | 'fingerprint'
  | 'brand'
  | 'fallback';

export interface CategoryGuess {
  categoryId: string;
  budgetOwner: BudgetOwner;
  /** 0–1; higher = safer to auto-apply */
  confidence: number;
  source: GuessSource;
  /** Human-readable tier for UI sorting */
  confidenceTier: 'high' | 'medium' | 'low' | 'guess';
  basedOnCount: number;
  /** Share of training rows that agreed with this label (1 = unanimous) */
  agreementRatio: number;
}

interface LabelVote {
  categoryId: string;
  budgetOwner: BudgetOwner;
  count: number;
}

interface PatternEntry {
  votes: LabelVote[];
  total: number;
}

function labelKey(categoryId: string, budgetOwner: BudgetOwner): string {
  return `${categoryId}|${budgetOwner}`;
}

function addVote(map: Map<string, PatternEntry>, key: string, categoryId: string, budgetOwner: BudgetOwner) {
  if (!key) return;
  let entry = map.get(key);
  if (!entry) {
    entry = { votes: [], total: 0 };
    map.set(key, entry);
  }
  entry.total++;
  const lk = labelKey(categoryId, budgetOwner);
  const existing = entry.votes.find((v) => labelKey(v.categoryId, v.budgetOwner) === lk);
  if (existing) existing.count++;
  else entry.votes.push({ categoryId, budgetOwner, count: 1 });
}

function topVote(entry: PatternEntry): { vote: LabelVote; agreementRatio: number } {
  const sorted = [...entry.votes].sort((a, b) => b.count - a.count);
  const top = sorted[0];
  return { vote: top, agreementRatio: top.count / entry.total };
}

function tierFromConfidence(c: number): CategoryGuess['confidenceTier'] {
  if (c >= 0.85) return 'high';
  if (c >= 0.65) return 'medium';
  if (c >= 0.4) return 'low';
  return 'guess';
}

function scoreGuess(
  source: GuessSource,
  basedOnCount: number,
  agreementRatio: number
): number {
  if (source === 'exact') {
    if (basedOnCount >= 3 && agreementRatio === 1) return 0.97;
    if (basedOnCount >= 2 && agreementRatio === 1) return 0.92;
    if (basedOnCount === 1) return 0.58;
    return 0.75 * agreementRatio;
  }
  if (source === 'fingerprint') {
    if (basedOnCount >= 5 && agreementRatio === 1) return 0.9;
    if (basedOnCount >= 3 && agreementRatio === 1) return 0.84;
    if (basedOnCount >= 2 && agreementRatio === 1) return 0.78;
    if (basedOnCount >= 2) return 0.68 * agreementRatio;
    if (basedOnCount === 1) return 0.48;
    return 0.55 * agreementRatio;
  }
  if (source === 'brand') {
    if (basedOnCount >= 8 && agreementRatio >= 0.85) return 0.82;
    if (basedOnCount >= 4 && agreementRatio >= 0.75) return 0.72;
    if (basedOnCount >= 2) return 0.58 * agreementRatio;
    return 0.35;
  }
  if (source === 'fallback') {
    return 0.08;
  }
  return 0.05;
}

export interface CategorizationModel {
  exact: Map<string, PatternEntry>;
  fingerprint: Map<string, PatternEntry>;
  brand: Map<string, PatternEntry>;
  fallback: { categoryId: string; budgetOwner: BudgetOwner; count: number } | null;
  validCategoryIds: Set<string>;
}

export function buildCategorizationModel(
  transactions: Transaction[],
  validCategoryIds: Set<string>,
  options?: { otherCategoryId?: string | null }
): CategorizationModel {
  const exact = new Map<string, PatternEntry>();
  const fingerprint = new Map<string, PatternEntry>();
  const brand = new Map<string, PatternEntry>();
  const globalVotes = new Map<string, number>();

  for (const t of transactions) {
    if (!t.is_categorized || !t.category_id || !t.budget_owner) continue;
    if (!validCategoryIds.has(t.category_id)) continue;

    const exactKey = normalizeDescriptionForSuggestions(t.description);
    const fpKey = merchantFingerprint(t.description);
    const brandKey = brandClusterKey(t.description);

    addVote(exact, exactKey, t.category_id, t.budget_owner);
    addVote(fingerprint, fpKey, t.category_id, t.budget_owner);
    if (brandKey) addVote(brand, brandKey, t.category_id, t.budget_owner);

    const gk = labelKey(t.category_id, t.budget_owner);
    globalVotes.set(gk, (globalVotes.get(gk) ?? 0) + 1);
  }

  let fallback: CategorizationModel['fallback'] = null;
  if (options?.otherCategoryId && validCategoryIds.has(options.otherCategoryId)) {
    fallback = { categoryId: options.otherCategoryId, budgetOwner: 'joint', count: 0 };
  } else {
    let maxGlobal = 0;
    for (const [gk, count] of globalVotes) {
      if (count > maxGlobal) {
        maxGlobal = count;
        const [categoryId, budgetOwner] = gk.split('|') as [string, BudgetOwner];
        fallback = { categoryId, budgetOwner, count };
      }
    }
  }

  return { exact, fingerprint, brand, fallback, validCategoryIds };
}

export interface PredictOptions {
  /** Minimum training rows to use a pattern (default 1 — always guess) */
  minSamples?: number;
  /** If true, skip low-confidence brand/fingerprint when exact exists with conflict */
  preferUnanimous?: boolean;
}

/** Predict category + owner for any transaction; always returns a guess. */
export function predictCategory(
  tx: Pick<Transaction, 'description'>,
  model: CategorizationModel,
  options?: PredictOptions
): CategoryGuess {
  const minSamples = options?.minSamples ?? 1;

  const tryPattern = (
    map: Map<string, PatternEntry>,
    key: string,
    source: GuessSource
  ): CategoryGuess | null => {
    const entry = map.get(key);
    if (!entry || entry.total < minSamples) return null;
    const { vote, agreementRatio } = topVote(entry);
    if (!model.validCategoryIds.has(vote.categoryId)) return null;
    const confidence = scoreGuess(source, entry.total, agreementRatio);
    return {
      categoryId: vote.categoryId,
      budgetOwner: vote.budgetOwner,
      confidence,
      source,
      confidenceTier: tierFromConfidence(confidence),
      basedOnCount: entry.total,
      agreementRatio,
    };
  };

  const exactKey = normalizeDescriptionForSuggestions(tx.description);
  const exactGuess = tryPattern(model.exact, exactKey, 'exact');
  if (exactGuess && exactGuess.agreementRatio === 1 && exactGuess.basedOnCount >= 2) {
    return exactGuess;
  }

  const fpKey = merchantFingerprint(tx.description);
  const fpGuess = tryPattern(model.fingerprint, fpKey, 'fingerprint');

  const brandKey = brandClusterKey(tx.description);
  const brandGuess = brandKey ? tryPattern(model.brand, brandKey, 'brand') : null;

  // Prefer brand over loose fingerprint when descriptions vary (e.g. Amazon*)
  const candidates = [exactGuess, brandGuess, fpGuess].filter(
    (g): g is CategoryGuess => g !== null
  );
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0];
  }

  if (model.fallback) {
    const confidence = scoreGuess('fallback', model.fallback.count, 1);
    return {
      categoryId: model.fallback.categoryId,
      budgetOwner: model.fallback.budgetOwner,
      confidence,
      source: 'fallback',
      confidenceTier: tierFromConfidence(confidence),
      basedOnCount: model.fallback.count,
      agreementRatio: 1,
    };
  }

  const otherId = [...model.validCategoryIds][0];
  return {
    categoryId: otherId,
    budgetOwner: 'joint',
    confidence: 0.05,
    source: 'fallback',
    confidenceTier: 'guess',
    basedOnCount: 0,
    agreementRatio: 0,
  };
}

export function guessMatchesActual(
  guess: CategoryGuess,
  actual: { categoryId: string; budgetOwner: BudgetOwner }
): boolean {
  return (
    guess.categoryId === actual.categoryId &&
    guess.budgetOwner === actual.budgetOwner
  );
}

export function guessCategoryMatches(
  guess: CategoryGuess,
  actualCategoryId: string
): boolean {
  return guess.categoryId === actualCategoryId;
}
