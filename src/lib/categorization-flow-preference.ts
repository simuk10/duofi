export type CategorizationFlowMode = 'combined' | 'separate';

export const CATEGORIZATION_FLOW_STORAGE_KEY = 'duofi_categorization_flow';

export const CATEGORIZATION_FLOW_CHANGED_EVENT = 'duofi:categorization-flow-changed';

export function readCategorizationFlowMode(): CategorizationFlowMode {
  if (typeof window === 'undefined') return 'separate';
  const raw = localStorage.getItem(CATEGORIZATION_FLOW_STORAGE_KEY);
  return raw === 'combined' ? 'combined' : 'separate';
}

export function writeCategorizationFlowMode(mode: CategorizationFlowMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CATEGORIZATION_FLOW_STORAGE_KEY, mode);
  window.dispatchEvent(new CustomEvent(CATEGORIZATION_FLOW_CHANGED_EVENT));
}

export function categorizationFlowLabel(mode: CategorizationFlowMode): string {
  return mode === 'combined' ? 'Category + owner together' : 'Category, then owner';
}

export function categorizationFlowDescription(mode: CategorizationFlowMode): string {
  return mode === 'combined'
    ? 'After each category, assign the budget owner on the same card. Confidence scores update as you finish each transaction.'
    : 'Set categories first, then assign budget owners in a separate review pass.';
}
