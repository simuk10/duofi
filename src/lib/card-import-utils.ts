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

/** Per-card date ranges for pre-categorized rows (by source account name → card id). */
export function groupedDateRangesByCardName(
  rows: { date: string; sourceAccount: string }[],
  cardNameToId: Map<string, string>
): Map<string, { dateFrom: string; dateTo: string; count: number }> {
  const byCard = new Map<string, string[]>();
  for (const r of rows) {
    const id = cardNameToId.get(r.sourceAccount.toLowerCase());
    if (!id) continue;
    const arr = byCard.get(id) || [];
    arr.push(r.date);
    byCard.set(id, arr);
  }
  const out = new Map<string, { dateFrom: string; dateTo: string; count: number }>();
  for (const [cardId, dates] of byCard) {
    const { dateFrom, dateTo } = dateRangeFromRows(dates.map((d) => ({ date: d })));
    out.set(cardId, { dateFrom, dateTo, count: dates.length });
  }
  return out;
}
