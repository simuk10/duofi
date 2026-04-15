const STORAGE_KEY = 'duofi_saved_friends';

export function getSavedFriends(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addSavedFriends(names: string[]): void {
  if (typeof window === 'undefined') return;
  const existing = getSavedFriends();
  const set = new Set(existing.map((n) => n.toLowerCase()));
  const merged = [...existing];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed && !set.has(trimmed.toLowerCase())) {
      merged.push(trimmed);
      set.add(trimmed.toLowerCase());
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
}

export function removeSavedFriend(name: string): void {
  if (typeof window === 'undefined') return;
  const existing = getSavedFriends();
  const filtered = existing.filter(
    (n) => n.toLowerCase() !== name.toLowerCase()
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}
