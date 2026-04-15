'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Check, ChevronDown, ChevronUp, ExternalLink, Users } from 'lucide-react';
import type { Transaction, CoveredSplit, CoveredSplitFriend } from '@/types/database';

interface PendingRequestsProps {
  householdId: string | null;
  personAName: string;
  personBName: string;
}

interface FlatRequest {
  transactionId: string;
  transactionDescription: string;
  transactionDate: string;
  friendIdx: number;
  friend: CoveredSplitFriend;
}

interface GroupedRequests {
  pending: FlatRequest[];
  completed: FlatRequest[];
}

function venmoUrl(friend: CoveredSplitFriend, description: string) {
  const params = new URLSearchParams({
    txn: 'charge',
    recipients: friend.name,
    amount: friend.amount.toFixed(2),
    note: description,
  });
  return `venmo://paycharge?${params.toString()}`;
}

export function PendingRequests({
  householdId,
  personAName,
  personBName,
}: PendingRequestsProps) {
  const [coveredTxs, setCoveredTxs] = useState<Transaction[]>([]);
  const [showPastByGroup, setShowPastByGroup] = useState<Record<string, boolean>>({});
  const [celebrateKey, setCelebrateKey] = useState<string | null>(null);

  const supabase = createClient();

  const fetchCovered = useCallback(async () => {
    if (!householdId) return;
    const { data } = await supabase
      .from('transactions')
      .select('id, description, date, paid_by, budget_owner, covered_split')
      .eq('household_id', householdId)
      .eq('is_covered', true)
      .not('covered_split', 'is', null);
    if (data) setCoveredTxs(data as unknown as Transaction[]);
  }, [householdId, supabase]);

  useEffect(() => {
    fetchCovered();
  }, [fetchCovered]);

  const grouped = useMemo(() => {
    const groups: Record<string, GroupedRequests> = {
      person_a: { pending: [], completed: [] },
      person_b: { pending: [], completed: [] },
      joint: { pending: [], completed: [] },
    };
    for (const tx of coveredTxs) {
      const split = tx.covered_split!;
      const owner = tx.budget_owner || 'joint';
      const bucket = groups[owner] ?? groups.joint;
      split.friends.forEach((friend, idx) => {
        const item: FlatRequest = {
          transactionId: tx.id,
          transactionDescription: tx.description,
          transactionDate: tx.date,
          friendIdx: idx,
          friend,
        };
        if (friend.status === 'pending') bucket.pending.push(item);
        else bucket.completed.push(item);
      });
    }
    return groups;
  }, [coveredTxs]);

  const totalAll =
    Object.values(grouped).reduce(
      (s, g) => s + g.pending.length + g.completed.length,
      0
    );

  const toggleStatus = async (req: FlatRequest) => {
    const tx = coveredTxs.find((t) => t.id === req.transactionId);
    if (!tx?.covered_split) return;

    const newSplit: CoveredSplit = {
      ...tx.covered_split,
      friends: tx.covered_split.friends.map((f, i) =>
        i === req.friendIdx
          ? { ...f, status: f.status === 'pending' ? ('sent' as const) : ('pending' as const) }
          : f
      ),
    };

    const allNowSent = newSplit.friends.every((f) => f.status === 'sent');

    await supabase
      .from('transactions')
      .update({ covered_split: newSplit as unknown as Record<string, unknown> })
      .eq('id', req.transactionId);

    await fetchCovered();

    if (allNowSent) {
      setCelebrateKey(req.transactionId);
      setTimeout(() => setCelebrateKey(null), 2500);
    }
  };

  if (totalAll === 0) return null;

  const groupOrder: { key: string; label: string }[] = [
    { key: 'person_a', label: `${personAName}'s Requests` },
    { key: 'person_b', label: `${personBName}'s Requests` },
    { key: 'joint', label: 'Joint Requests' },
  ];

  return (
    <div className="space-y-4">
      {/* Section header with divider */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-gray-200" />
        <div className="flex items-center gap-1.5 text-[#14B8A6]">
          <Users className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            Venmo Requests
          </span>
        </div>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {celebrateKey && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#14B8A6] animate-[celebrate_0.6s_ease-out]">
            <Check className="h-6 w-6 text-white" />
          </div>
          <p className="text-sm font-semibold text-gray-900">All caught up!</p>
          <p className="mt-0.5 text-xs text-gray-600">
            All Venmo requests for this tab have been sent.
          </p>
        </div>
      )}

      {groupOrder.map(({ key, label }) => {
        const group = grouped[key];
        const pendingCount = group.pending.length;
        const completedCount = group.completed.length;
        const total = pendingCount + completedCount;
        if (total === 0) return null;

        const allSent = pendingCount === 0;
        const showPast = showPastByGroup[key] ?? false;

        return (
          <div
            key={key}
            className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
          >
            {/* Group header */}
            <div className="px-4 pt-4 pb-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
                <span className="text-xs text-gray-500">
                  {completedCount} of {total} sent
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[#14B8A6] transition-all duration-500"
                  style={{
                    width: `${total > 0 ? (completedCount / total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            {allSent ? (
              <div className="px-4 pb-4">
                <p className="text-center text-xs font-medium text-[#0D9488]">
                  All sent ✓
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {group.pending.map((req) => (
                  <div
                    key={`${req.transactionId}-${req.friendIdx}`}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => void toggleStatus(req)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-gray-300 transition-colors hover:border-[#14B8A6]"
                      aria-label={`Mark ${req.friend.name} as sent`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {req.friend.name}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {req.transactionDescription} ·{' '}
                        {formatDate(req.transactionDate)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-gray-900">
                      {formatCurrency(req.friend.amount)}
                    </span>
                    <a
                      href={venmoUrl(req.friend, req.transactionDescription)}
                      onClick={() => {
                        setTimeout(() => {
                          window.location.href = 'https://venmo.com/';
                        }, 1500);
                      }}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#14B8A6]/10 text-[#14B8A6] transition-colors hover:bg-[#14B8A6]/20"
                      aria-label={`Open Venmo for ${req.friend.name}`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Past requests for this group */}
            {completedCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setShowPastByGroup((prev) => ({ ...prev, [key]: !showPast }))
                  }
                  className="flex w-full items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
                >
                  <span>Past ({completedCount})</span>
                  {showPast ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
                {showPast && (
                  <div className="divide-y divide-gray-100">
                    {group.completed.map((req) => (
                      <div
                        key={`${req.transactionId}-${req.friendIdx}`}
                        className="flex items-center gap-3 px-4 py-2.5 opacity-50"
                      >
                        <button
                          type="button"
                          onClick={() => void toggleStatus(req)}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 border-[#14B8A6] bg-[#14B8A6] transition-colors"
                          aria-label={`Unmark ${req.friend.name}`}
                        >
                          <Check className="h-3 w-3 text-white" />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 line-through">
                            {req.friend.name}
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {req.transactionDescription}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm text-gray-500">
                          {formatCurrency(req.friend.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      <style jsx>{`
        @keyframes celebrate {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
