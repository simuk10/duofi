export const OWNER_SWIPE_THRESHOLD = 72;

export interface OwnerSwipeFeedback {
  personAOpacity: number;
  personBOpacity: number;
  jointOpacity: number;
  laterOpacity: number;
  cardRotate: number;
  cardScale: number;
  cardBg: string;
  cardBorder: string;
  cardShadow: string;
}

type OwnerSwipeDirection = 'person_a' | 'person_b' | 'joint' | 'later';

const DIRECTION_STYLES: Record<
  OwnerSwipeDirection,
  { bgMix: string; borderRgb: string; shadowRgb: string }
> = {
  person_a: {
    bgMix: '#eff6ff',
    borderRgb: '59, 130, 246',
    shadowRgb: '59, 130, 246',
  },
  person_b: {
    bgMix: '#eff6ff',
    borderRgb: '59, 130, 246',
    shadowRgb: '59, 130, 246',
  },
  joint: {
    bgMix: '#f5f3ff',
    borderRgb: '139, 92, 246',
    shadowRgb: '139, 92, 246',
  },
  later: {
    bgMix: '#f3f4f6',
    borderRgb: '156, 163, 175',
    shadowRgb: '107, 114, 128',
  },
};

export function computeOwnerSwipeFeedback(
  dragX: number,
  dragY: number,
  labels: { personAName: string; personBName: string },
  threshold = OWNER_SWIPE_THRESHOLD
): OwnerSwipeFeedback {
  const ax = Math.abs(dragX);
  const ay = Math.abs(dragY);
  const horizontalDominant = ax >= ay && ax > 6;

  const personATint =
    horizontalDominant && dragX > 0 ? Math.min(1, dragX / threshold) : 0;
  const personBTint =
    horizontalDominant && dragX < 0 ? Math.min(1, -dragX / threshold) : 0;
  const jointTint =
    !horizontalDominant && dragY < 0 ? Math.min(1, -dragY / threshold) : 0;
  const laterTint =
    !horizontalDominant && dragY > 0 ? Math.min(1, dragY / threshold) : 0;

  const ranked: Array<{ direction: OwnerSwipeDirection; tint: number; label: string }> = [
    { direction: 'person_a', tint: personATint, label: labels.personAName },
    { direction: 'person_b', tint: personBTint, label: labels.personBName },
    { direction: 'joint', tint: jointTint, label: 'Joint' },
    { direction: 'later', tint: laterTint, label: 'Later' },
  ];
  const dominant = ranked.reduce((best, entry) =>
    entry.tint > best.tint ? entry : best
  );

  const maxTint = Math.max(personATint, personBTint, jointTint, laterTint);
  const styles = DIRECTION_STYLES[dominant.direction];

  return {
    personAOpacity: personATint,
    personBOpacity: personBTint,
    jointOpacity: jointTint,
    laterOpacity: laterTint,
    cardRotate: Math.max(-10, Math.min(10, dragX / 24)),
    cardScale: 1 + maxTint * 0.04,
    cardBg:
      maxTint > 0
        ? `color-mix(in srgb, ${styles.bgMix} ${Math.round(dominant.tint * 88)}%, white)`
        : '#ffffff',
    cardBorder:
      maxTint > 0
        ? `rgba(${styles.borderRgb}, ${0.25 + dominant.tint * 0.65})`
        : 'rgba(229, 231, 235, 1)',
    cardShadow:
      maxTint > 0
        ? `0 12px 40px -8px rgba(${styles.shadowRgb}, ${0.15 + dominant.tint * 0.35})`
        : '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
  };
}
