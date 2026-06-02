'use client';

import { Card, Button } from '@/components/ui';

interface CategorizationWorkflowHubProps {
  highConfidenceCount: number;
  swipeModeCount: number;
  ownerReviewCount: number;
  personAName: string;
  personBName: string;
  /** True when month filter hides uncategorized rows from the list below */
  listHiddenByMonth?: boolean;
  monthLabel?: string;
  onShowAllMonths?: () => void;
  onReviewHighConfidence: () => void;
  onStartCategorizationMode: () => void;
  onStartOwnerReview: () => void;
}

export function CategorizationWorkflowHub({
  highConfidenceCount,
  swipeModeCount,
  ownerReviewCount,
  personAName,
  personBName,
  listHiddenByMonth,
  monthLabel,
  onShowAllMonths,
  onReviewHighConfidence,
  onStartCategorizationMode,
  onStartOwnerReview,
}: CategorizationWorkflowHubProps) {
  const hasAny =
    highConfidenceCount > 0 || swipeModeCount > 0 || ownerReviewCount > 0;
  if (!hasAny) return null;

  return (
    <div className="mb-3 space-y-3">
      {listHiddenByMonth && monthLabel && onShowAllMonths && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          Quick categorize uses <span className="font-medium">all months</span>. None
          uncategorized in {monthLabel}.{' '}
          <button
            type="button"
            onClick={onShowAllMonths}
            className="font-medium text-[#0D9488] underline-offset-2 hover:underline"
          >
            Show all months
          </button>
        </p>
      )}

      {highConfidenceCount > 0 && (
        <Card className="border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-teal-50/80 p-4">
          <p className="text-sm font-medium text-gray-900">
            {highConfidenceCount} high-confidence suggestion
            {highConfidenceCount === 1 ? '' : 's'} ready
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Review the full list before applying — fix any row one-by-one.
          </p>
          <Button className="mt-3" onClick={onReviewHighConfidence}>
            Review & apply
          </Button>
        </Card>
      )}

      {swipeModeCount > 0 && (
        <Card className="border-violet-200/80 bg-gradient-to-r from-violet-50/80 to-fuchsia-50/60 p-4">
          <p className="text-sm font-medium text-gray-900">
            {swipeModeCount} need a category
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Swipe to confirm or fix the suggested category — owners come next.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={onStartCategorizationMode}>
            Start categorization mode
          </Button>
        </Card>
      )}

      {ownerReviewCount > 0 && (
        <Card className="border-sky-200/80 bg-gradient-to-r from-sky-50/90 to-cyan-50/70 p-4">
          <p className="text-sm font-medium text-gray-900">
            {ownerReviewCount} need a budget owner
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Swipe → {personAName} · ← {personBName} · ↑ Joint · ↓ later
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-sky-200 bg-white"
            onClick={onStartOwnerReview}
          >
            Start owner review
          </Button>
        </Card>
      )}
    </div>
  );
}
