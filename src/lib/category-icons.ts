/** Curated emoji set for category picker (no external icon font). */
export const CATEGORY_ICON_OPTIONS: string[] = [
  '🛒',
  '🍽️',
  '🥡',
  '☕',
  '🍷',
  '🏠',
  '🛋️',
  '🔧',
  '🚗',
  '✈️',
  '🚕',
  '🅿️',
  '⛽',
  '💡',
  '📱',
  '💻',
  '🎬',
  '🎮',
  '🎵',
  '🏋️',
  '⚽',
  '👕',
  '💄',
  '💊',
  '🏥',
  '🐕',
  '👶',
  '🎁',
  '📚',
  '✏️',
  '🏷️',
  '💳',
  '🏦',
  '📈',
  '💰',
  '🧾',
  '🌴',
  '🎟️',
  '🍿',
  '🧹',
  '🌿',
  '⚡',
  '🛍️',
  '🎨',
  '📦',
  '🧰',
  '🔑',
  '☂️',
  '🎯',
  '📁',
];

/** Default categories from DB used lucide-style names; map to emoji for display & picker. */
const LEGACY_ICON_TO_EMOJI: Record<string, string> = {
  'shopping-cart': '🛒',
  utensils: '🍽️',
  car: '🚗',
  zap: '💡',
  film: '🎬',
  'shopping-bag': '🛍️',
  heart: '💊',
  plane: '✈️',
  repeat: '📱',
  'more-horizontal': '📁',
};

const NAME_KEYWORDS: { match: RegExp; emoji: string }[] = [
  { match: /grocery|groceries|food shop/i, emoji: '🛒' },
  { match: /restaurant|dining|eat out|takeout|uber\s*eats|doordash/i, emoji: '🍽️' },
  { match: /coffee|starbucks|cafe/i, emoji: '☕' },
  { match: /bar|nightlife|wine|beer/i, emoji: '🍷' },
  { match: /rent|mortgage|housing/i, emoji: '🏠' },
  { match: /home|furniture|ikea|decor/i, emoji: '🛋️' },
  { match: /utilit|electric|water|gas bill|internet|phone plan/i, emoji: '💡' },
  { match: /car|auto|vehicle|gas|fuel|parking/i, emoji: '🚗' },
  { match: /uber|lyft|taxi|transit|train|metro/i, emoji: '🚕' },
  { match: /flight|travel|hotel|airbnb/i, emoji: '✈️' },
  { match: /gym|fitness|sport/i, emoji: '🏋️' },
  { match: /health|doctor|pharmacy|medical|dental/i, emoji: '🏥' },
  { match: /pet|vet|dog|cat/i, emoji: '🐕' },
  { match: /baby|child|daycare|kid/i, emoji: '👶' },
  { match: /shop|retail|amazon|clothes|apparel/i, emoji: '🛍️' },
  { match: /beauty|cosmetic|salon|spa|personal care/i, emoji: '💄' },
  { match: /subscription|streaming|netflix|spotify/i, emoji: '📱' },
  { match: /entertain|movie|show|concert|game/i, emoji: '🎬' },
  { match: /gift|holiday/i, emoji: '🎁' },
  { match: /education|book|course|tuition/i, emoji: '📚' },
  { match: /business|etsy|software|saas/i, emoji: '💻' },
  { match: /invest|savings|retirement/i, emoji: '📈' },
  { match: /misc|other|general/i, emoji: '📁' },
];

export function suggestEmojiFromCategoryName(name: string): string {
  const t = name.trim();
  if (!t) return '📁';
  for (const { match, emoji } of NAME_KEYWORDS) {
    if (match.test(t)) return emoji;
  }
  return '📁';
}

/** Resolve stored `categories.icon` (emoji or legacy slug) to a display emoji. */
export function categoryIconToEmoji(icon: string | null | undefined, categoryName: string): string {
  if (!icon) return suggestEmojiFromCategoryName(categoryName);
  const legacy = LEGACY_ICON_TO_EMOJI[icon];
  if (legacy) return legacy;
  return icon;
}
