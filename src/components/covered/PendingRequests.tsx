'use client';

import { useState, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTransactions } from '@/hooks';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Check, ChevronDown, ChevronUp, ExternalLink, Users } from 'lucide-react';
import type { CoveredSplit, CoveredSplitFriend } from '@/types/database';

interface PendingRequestsProps {
  householdId: string | null;
}

interface FlatRequest {
  transactionId: string;
  transactionDescription: string;
  transactionDate: string;
  friendIdx: number;
  friend: CoveredSplitFriend;
}

export function PendingRequests({ householdId }: PendingRequestsProps) {
  const [showPast, setShowPast] = useState(false);
  const [celebrateKey, setCelebrateKey] = useState<string | null>(null);

  const { transactions, refetch } = useTransactions({
    householdId,
    filter: 'all',
  });

  const supabase = createClient();

  const coveredTxs = useMemo(
    () => transactions.filter((tx) => tx.is_covered && tx.covered_split),
    [transactions]
  );

  const { pending, completed } = useMemo(() => {
    const p: FlatRequest[] = [];
    const c: FlatRequest[] = [];
    for (const tx of coveredTxs) {
      const split = tx.covered_split!;
      split.friends.forEach((friend, idx) => {
        const item: FlatRequest = {
          transactionId: tx.id,
          transactionDescription: tx.description,
          transactionDate: tx.date,
          friendIdx: idx,
          friend,
        };
        if (friend.status === 'pending') p.push(item);
        else c.push(item);
      });
    }
    return { pending: p, completed: c };
  }, [coveredTxs]);

  const totalRequests = pending.length + completed.length;
  const sentCount = completed.length;
  const allSent = totalRequests > 0 && pending.length === 0;

  const toggleStatus = async (req: FlatRequest) => {
    const tx = transactions.find((t) => t.id === req.transactionId);
    if (!tx?.covered_split) return;

    const newSplit: CoveredSplit = {
      ...tx.covered_split,
      friends: tx.covered_split.friends.map((f, i) =>
        i === req.friendIdx
          ? { ...f, status: f.status === 'pending' ? 'sent' as const : 'pending' as const }
          : f
      ),
    };

    const allNowSent = newSplit.friends.every((f) => f.status === 'sent');

    await supabase
      .from('transactions')
      .update({ covered_split: newSplit as unknown as Record<string, unknown> })
      .eq('id', req.transactionId);

    await refetch();

    if (allNowSent) {
      setCelebrateKey(req.transactionId);
      setTimeout(() => setCelebrateKey(null), 2500);
    }
  };

  const venmoUrl = (friend: CoveredSplitFriend, description: string) => {
    const params = new URLSearchParams({
      txn: 'charge',
      recipients: friend.name,
      amount: friend.amount.toFixed(2),
      note: description,
    });
    return `venmo://paycharge?${params.toString()}`;
  };

  const venmoFallback = 'https://venmo.com/';

  if (totalRequests === 0) return null;

  return (
    <div className="space-y-3">
      {/* Pending section */}
      {allSent && celebrateKey ? (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#14B8A6] animate-[celebrate_0.6s_ease-out]">
            <Check className="h-7 w-7 text-white" />
          </div>
          <p className="text-base font-semibold text-gray-900">All caught up!</p>
          <p className="mt-1 text-sm text-gray-600">
            All Venmo requests have been sent.
          </p>
        </div>
      ) : allSent ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center">
          <p className="text-sm font-medium text-[#0D9488]">
            All caught up! All Venmo requests sent.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-[#14B8A6]" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Pending Requests
                </h3>
              </div>
              <span className="text-xs text-gray-500">
                {sentCount} of {totalRequests} sent
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-[#14B8A6] transition-all duration-500"
                style={{
                  width: `${totalRequests > 0 ? (sentCount / totalRequests) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {pending.map((req) => (
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
                    {req.transactionDescription} · {formatDate(req.transactionDate)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-gray-900">
                  {formatCurrency(req.friend.amount)}
                </span>
                <a
                  href={venmoUrl(req.friend, req.transactionDescription)}
                  onClick={(e) => {
                    setTimeout(() => {
                      window.location.href = venmoFallback;
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
        </div>
      )}

      {/* Past requests collapsible */}
      {completed.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setShowPast(!showPast)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <span>Past Requests ({completed.length})</span>
            {showPast ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showPast && (
            <div className="divide-y divide-gray-100 border-t border-gray-100">
              {completed.map((req) => (
                <div
                  key={`${req.transactionId}-${req.friendIdx}`}
                  className="flex items-center gap-3 px-4 py-3 opacity-60"
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
        </div>
      )}

      <style jsx>{`
        @keyframes celebrate {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
