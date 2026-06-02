/** Stable fingerprint for duplicate detection (same card + date range in DB). */
export function transactionFingerprint(
  date: string,
  amount: number,
  description: string
): string {
  const norm = description.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${date}|${Number(amount).toFixed(2)}|${norm}`;
}

export function dateRangeFromRows<T extends { date: string }>(rows: T[]): {
  dateFrom: string;
  dateTo: string;
} {
  if (rows.length === 0) {
    const t = new Date().toISOString().split('T')[0];
    return { dateFrom: t, dateTo: t };
  }
  let min = rows[0].date;
  let max = rows[0].date;
  for (const r of rows) {
    if (r.date < min) min = r.date;
    if (r.date > max) max = r.date;
  }
  return { dateFrom: min, dateTo: max };
}

/** Calendar month YYYY-MM is covered by [dateFrom, dateTo] inclusive. */
export function monthCoveredByImportRange(
  monthYm: string,
  dateFrom: string,
  dateTo: string
): boolean {
  const fromYm = dateFrom.slice(0, 7);
  const toYm = dateTo.slice(0, 7);
  return monthYm >= fromYm && monthYm <= toYm;
}

export async function sha256HexFromFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** True if this exact file was already imported for the household. */
export async function hasDuplicateFileHash(
  supabase: any,
  householdId: string,
  fileHash: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('card_imports')
    .select('id')
    .eq('household_id', householdId)
    .eq('file_hash', fileHash)
    .limit(1);

  if (error) {
    console.warn('hasDuplicateFileHash', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Samples for duplicate UI: first N rows whose fingerprint exists in DB. */
export async function duplicateSamplesForRows(
  supabase: any,
  householdId: string,
  creditCardId: string,
  dateFrom: string,
  dateTo: string,
  rows: { date: string; amount: number; description: string }[],
  maxSamples: number
): Promise<{ count: number; samples: { date: string; description: string; amount: number }[] }> {
  const { data: existing, error } = await supabase
    .from('transactions')
    .select('date, description, amount')
    .eq('household_id', householdId)
    .eq('credit_card_id', creditCardId)
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (error) throw error;

  const existingRows = (existing ?? []) as {
    date: string;
    amount: number | string;
    description: string;
  }[];

  const existingSet = new Set(
    existingRows.map((t) =>
      transactionFingerprint(t.date, Number(t.amount), t.description)
    )
  );

  const samples: { date: string; description: string; amount: number }[] = [];
  let count = 0;
  for (const r of rows) {
    const fp = transactionFingerprint(r.date, r.amount, r.description);
    if (existingSet.has(fp)) {
      count++;
      if (samples.length < maxSamples) {
        samples.push({
          date: r.date,
          description: r.description,
          amount: r.amount,
        });
      }
    }
  }

  return { count, samples };
}

export interface CardImportLogRow {
  credit_card_id: string;
  file_hash: string;
  date_from: string;
  date_to: string;
  transaction_count: number;
}

/** Last calendar day of YYYY-MM (local date math). */
export function lastDayOfMonthYm(monthYm: string): string {
  const [y, m] = monthYm.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

export function calendarMonthBounds(monthYm: string): {
  dateFrom: string;
  dateTo: string;
} {
  return { dateFrom: `${monthYm}-01`, dateTo: lastDayOfMonthYm(monthYm) };
}

/**
 * One card_imports row per (card, calendar month) that has transactions in the file.
 * Ensures statement coverage reflects every card/month present in a pre-categorized upload.
 */
export function buildCardImportLogRowsFromCategorized(
  rows: { date: string; sourceAccount: string }[],
  cardNameToId: Map<string, string>,
  fileHash: string
): CardImportLogRow[] {
  const counts = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const cardId = cardNameToId.get(r.sourceAccount.toLowerCase());
    if (!cardId) continue;
    const monthYm = r.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthYm)) continue;
    let monthMap = counts.get(cardId);
    if (!monthMap) {
      monthMap = new Map();
      counts.set(cardId, monthMap);
    }
    monthMap.set(monthYm, (monthMap.get(monthYm) || 0) + 1);
  }

  const out: CardImportLogRow[] = [];
  for (const [cardId, monthMap] of counts) {
    for (const [monthYm, transaction_count] of monthMap) {
      const { dateFrom, dateTo } = calendarMonthBounds(monthYm);
      out.push({
        credit_card_id: cardId,
        file_hash: `${fileHash}:${cardId}:${monthYm}`,
        date_from: dateFrom,
        date_to: dateTo,
        transaction_count,
      });
    }
  }
  return out;
}

/** Per-card, per-month coverage for a single-card CSV import. */
export function buildCardImportLogRowsForCard(
  rows: { date: string }[],
  creditCardId: string,
  fileHash: string
): CardImportLogRow[] {
  const monthCounts = new Map<string, number>();
  for (const r of rows) {
    const monthYm = r.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(monthYm)) continue;
    monthCounts.set(monthYm, (monthCounts.get(monthYm) || 0) + 1);
  }

  return [...monthCounts.entries()].map(([monthYm, transaction_count]) => {
    const { dateFrom, dateTo } = calendarMonthBounds(monthYm);
    return {
      credit_card_id: creditCardId,
      file_hash: `${fileHash}:${creditCardId}:${monthYm}`,
      date_from: dateFrom,
      date_to: dateTo,
      transaction_count,
    };
  });
}
