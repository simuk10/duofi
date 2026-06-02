/** Brand-level keys when bank descriptions share a merchant but strings differ. */
const BRAND_PREFIXES: Array<[RegExp, string]> = [
  [/^amazon\b|^amzn\b|^amazon\.com|^amazon mkt|^amazon tips|^amazon markeplace|^amazon prime|^amazon reta/i, 'amazon'],
  [/^uber\b|^uber trip|^uber one|^platinum uber/i, 'uber'],
  [/^gelato\b|^gelato usa|^gelato as\b/i, 'gelato'],
  [/^airbnb\b/i, 'airbnb'],
  [/^aplpay\b/i, 'aplpay'],
  [/^tst\*/i, 'toast'],
  [/^nyct paygo|^aplPay nyct/i, 'mta'],
  [/^whole foods/i, 'wholefoods'],
  [/^starbucks/i, 'starbucks'],
  [/^costco/i, 'costco'],
  [/^walmart/i, 'walmart'],
  [/^netflix/i, 'netflix'],
  [/^spotify/i, 'spotify'],
  [/^resilient mind/i, 'resilientmind'],
  [/^strive pharmacy/i, 'strivepharmacy'],
  [/^revolve\b/i, 'revolve'],
  [/^lululemon/i, 'lululemon'],
];

function stripNoise(s: string): string {
  let out = s.trim().toLowerCase().replace(/\s+/g, ' ');
  out = out.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ');
  out = out.replace(/\*+[a-z0-9]*/gi, ' ');
  out = out.replace(/#\d+/g, ' ');
  out = out.replace(/\bx{3,}\d*\b/gi, ' ');
  out = out.replace(/\b\d{3,}\b/g, ' ');
  out = out.replace(/\s+(us|usa|ca|ny|de|me|no|ar|pa)\s*$/i, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

/** Rough merchant key for grouping (CSV era; Plaid merchant_entity_id replaces this later). */
export function merchantFingerprint(description: string): string {
  const stripped = stripNoise(description);
  for (const [re, brand] of BRAND_PREFIXES) {
    if (re.test(stripped)) return brand;
  }
  const m = stripped.match(/^([a-z][a-z0-9\s&'.-]{2,40})/);
  return (m ? m[1].trim() : stripped.slice(0, 40)) || stripped;
}

export function brandClusterKey(description: string): string | null {
  const stripped = stripNoise(description);
  for (const [re, brand] of BRAND_PREFIXES) {
    if (re.test(stripped)) return brand;
  }
  return null;
}
