'use client';

import { useState, useMemo, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, Input } from '@/components/ui';
import { getSavedFriends } from '@/lib/saved-friends';
import { formatCurrency } from '@/lib/utils';
import { Minus, Plus, Users, X } from 'lucide-react';
import type { CoveredSplit, Transaction } from '@/types/database';

interface CoveredSplitModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  userName: string;
  onConfirm: (split: CoveredSplit, newAmount: number) => void;
}

type SplitType = 'even' | 'itemized';

interface ItemRow {
  description: string;
  amount: string;
  assignedTo: string;
}

export function CoveredSplitModal({
  isOpen,
  onClose,
  transaction,
  userName,
  onConfirm,
}: CoveredSplitModalProps) {
  const [step, setStep] = useState(1);
  const [friendCount, setFriendCount] = useState(1);
  const [friendNames, setFriendNames] = useState<string[]>(['']);
  const [splitType, setSplitType] = useState<SplitType>('even');
  const [items, setItems] = useState<ItemRow[]>([
    { description: '', amount: '', assignedTo: '' },
  ]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  const existingSplit = transaction.covered_split;
  const totalAmount = existingSplit ? existingSplit.originalAmount : transaction.amount;
  const savedFriends = useMemo(() => getSavedFriends(), []);

  useEffect(() => {
    if (isOpen) {
      setEditingIdx(null);
      setEditValue('');
      setError('');

      if (existingSplit) {
        const names = existingSplit.friends.map((f) => f.name);
        setFriendCount(names.length);
        setFriendNames(names);
        setSplitType(existingSplit.splitType);
        setItems(
          existingSplit.friends.map((f) => ({
            description: f.name,
            amount: f.amount.toFixed(2),
            assignedTo: f.name,
          }))
        );
        setStep(1);
      } else {
        setStep(1);
        setFriendCount(1);
        setFriendNames(['']);
        setSplitType('even');
        setItems([{ description: '', amount: '', assignedTo: '' }]);
      }
    }
  }, [isOpen, existingSplit]);

  const allPeople = [userName, ...friendNames.filter((n) => n.trim())];
  const evenShare = allPeople.length > 0 ? totalAmount / allPeople.length : 0;

  const itemizedTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const person of allPeople) totals[person] = 0;
    for (const item of items) {
      const amt = parseFloat(item.amount) || 0;
      if (item.assignedTo === '__even__') {
        const share = amt / allPeople.length;
        for (const person of allPeople) totals[person] += share;
      } else if (item.assignedTo && totals[item.assignedTo] !== undefined) {
        totals[item.assignedTo] += amt;
      }
    }
    return totals;
  }, [items, allPeople]);

  const itemizedSum = useMemo(
    () => items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0),
    [items]
  );
  const itemizedRemaining = +(totalAmount - itemizedSum).toFixed(2);

  const reviewShares: { name: string; amount: number }[] = useMemo(() => {
    if (splitType === 'even') {
      return allPeople.map((name) => ({
        name,
        amount: +evenShare.toFixed(2),
      }));
    }
    return allPeople.map((name) => ({
      name,
      amount: +(itemizedTotals[name] || 0).toFixed(2),
    }));
  }, [splitType, allPeople, evenShare, itemizedTotals]);

  const reviewTotal = reviewShares.reduce((s, r) => s + r.amount, 0);
  const reviewValid = Math.abs(reviewTotal - totalAmount) < 0.02;

  // --- Step 1 handlers ---
  const handleFriendCountChange = (delta: number) => {
    const next = Math.max(1, Math.min(10, friendCount + delta));
    setFriendCount(next);
    setFriendNames((prev) => {
      const arr = [...prev];
      while (arr.length < next) arr.push('');
      return arr.slice(0, next);
    });
  };

  const handleFriendNameChange = (idx: number, value: string) => {
    setFriendNames((prev) => {
      const arr = [...prev];
      arr[idx] = value;
      return arr;
    });
  };

  const handleSuggestionTap = (name: string) => {
    const emptyIdx = friendNames.findIndex((n) => !n.trim());
    if (emptyIdx >= 0) {
      handleFriendNameChange(emptyIdx, name);
    } else if (friendCount < 10) {
      setFriendCount((c) => c + 1);
      setFriendNames((prev) => [...prev, name]);
    }
  };

  const step1Valid = friendNames.every((n) => n.trim().length > 0);

  // --- Step 2 handlers ---
  const handleItemChange = (
    idx: number,
    field: keyof ItemRow,
    value: string
  ) => {
    setItems((prev) => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: value };
      return arr;
    });
  };

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { description: '', amount: '', assignedTo: '' },
    ]);

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const step2Valid =
    splitType === 'even' || Math.abs(itemizedRemaining) < 0.02;

  // --- Step 3 handlers ---
  const handleInlineEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(reviewShares[idx].amount.toFixed(2));
  };

  const commitInlineEdit = () => {
    if (editingIdx === null) return;
    const newAmt = parseFloat(editValue);
    if (!Number.isFinite(newAmt) || newAmt < 0) {
      setEditingIdx(null);
      return;
    }
    if (splitType === 'even') setSplitType('itemized');
    const person = reviewShares[editingIdx].name;
    const diff = newAmt - (itemizedTotals[person] || evenShare);
    setItems((prev) => [
      ...prev,
      { description: 'Adjustment', amount: String(diff), assignedTo: person },
    ]);
    setEditingIdx(null);
  };

  const handleConfirm = () => {
    const myShare = reviewShares.find((r) => r.name === userName)?.amount ?? 0;
    if (!reviewValid) {
      setError('Amounts must add up to ' + formatCurrency(totalAmount));
      return;
    }
    const split: CoveredSplit = {
      originalAmount: totalAmount,
      myShare,
      splitType,
      friends: reviewShares
        .filter((r) => r.name !== userName)
        .map((r) => ({ name: r.name, amount: r.amount, status: 'pending' as const })),
    };
    onConfirm(split, myShare);
  };

  const usedSuggestions = new Set(
    friendNames.map((n) => n.trim().toLowerCase())
  );
  const availableSuggestions = savedFriends.filter(
    (s) => !usedSuggestions.has(s.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Split This Tab">
      <div className="space-y-5">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  s === step
                    ? 'bg-[#14B8A6] text-white'
                    : s < step
                      ? 'bg-teal-100 text-[#0D9488]'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {s}
              </div>
              {s < 3 && (
                <div
                  className={`h-px w-8 ${s < step ? 'bg-[#14B8A6]' : 'bg-gray-200'}`}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-500">
          Step {step} of 3 &mdash;{' '}
          {step === 1
            ? 'Who Was There?'
            : step === 2
              ? 'How to Split?'
              : 'Review'}
        </p>

        {/* ====== STEP 1 ====== */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-500">You</p>
              <p className="font-medium text-gray-900">{userName}</p>
            </div>

            <div>
              <label className="mb-2 block text-sm text-gray-600">
                Split with how many others?
              </label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleFriendCountChange(-1)}
                  disabled={friendCount <= 1}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-lg font-semibold text-gray-900">
                  {friendCount}
                </span>
                <button
                  type="button"
                  onClick={() => handleFriendCountChange(1)}
                  disabled={friendCount >= 10}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {friendNames.map((name, idx) => (
                <Input
                  key={idx}
                  placeholder={`Friend ${idx + 1}`}
                  value={name}
                  onChange={(e) => handleFriendNameChange(idx, e.target.value)}
                />
              ))}
            </div>

            {availableSuggestions.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-gray-500">Recent friends</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSuggestionTap(s)}
                      className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <Button
              className="w-full"
              disabled={!step1Valid}
              onClick={() => setStep(2)}
            >
              Next
            </Button>
          </div>
        )}

        {/* ====== STEP 2 ====== */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSplitType('even')}
                className={`rounded-xl border-2 p-4 text-center transition-colors ${
                  splitType === 'even'
                    ? 'border-[#14B8A6] bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-xl">⚖️</span>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  Even Split
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSplitType('itemized')}
                className={`rounded-xl border-2 p-4 text-center transition-colors ${
                  splitType === 'itemized'
                    ? 'border-[#14B8A6] bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <span className="text-xl">🧾</span>
                <p className="mt-1 text-sm font-medium text-gray-900">
                  Itemized
                </p>
              </button>
            </div>

            {splitType === 'even' && (
              <div className="rounded-xl bg-gray-50 p-4">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  {formatCurrency(totalAmount)} ÷ {allPeople.length} people
                </p>
                <div className="space-y-1">
                  {allPeople.map((person) => (
                    <div
                      key={person}
                      className="flex justify-between text-sm text-gray-600"
                    >
                      <span>{person}</span>
                      <span className="font-medium">
                        {formatCurrency(evenShare)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {splitType === 'itemized' && (
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="relative rounded-xl border border-gray-200 p-3 space-y-2"
                  >
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="absolute right-2 top-2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <Input
                      placeholder="Item description"
                      value={item.description}
                      onChange={(e) =>
                        handleItemChange(idx, 'description', e.target.value)
                      }
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Amount"
                        type="text"
                        inputMode="decimal"
                        value={item.amount}
                        onChange={(e) =>
                          handleItemChange(idx, 'amount', e.target.value)
                        }
                        className="flex-1"
                      />
                      <select
                        value={item.assignedTo}
                        onChange={(e) =>
                          handleItemChange(idx, 'assignedTo', e.target.value)
                        }
                        className="h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-[#14B8A6] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20"
                      >
                        <option value="">Assign to…</option>
                        <option value="__even__">Split evenly</option>
                        {allPeople.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={addItem}
                >
                  + Add Item
                </Button>

                <p
                  className={`text-center text-sm font-medium ${
                    Math.abs(itemizedRemaining) < 0.02
                      ? 'text-[#0D9488]'
                      : 'text-red-600'
                  }`}
                >
                  {Math.abs(itemizedRemaining) < 0.02
                    ? 'Fully assigned ✓'
                    : itemizedRemaining > 0
                      ? `${formatCurrency(itemizedRemaining)} remaining`
                      : `${formatCurrency(Math.abs(itemizedRemaining))} over`}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={!step2Valid}
                onClick={() => {
                  setError('');
                  setStep(3);
                }}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* ====== STEP 3 ====== */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
              {reviewShares.map((row, idx) => {
                const isUser = row.name === userName;
                return (
                  <div
                    key={row.name}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-900">
                        {isUser ? `${row.name} (you)` : row.name}
                      </span>
                    </div>
                    {editingIdx === idx ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-500">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={commitInlineEdit}
                          onKeyDown={(e) =>
                            e.key === 'Enter' && commitInlineEdit()
                          }
                          autoFocus
                          className="w-20 rounded-lg border border-[#14B8A6] bg-white px-2 py-1 text-right text-sm text-gray-900 focus:outline-none"
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => !isUser && handleInlineEdit(idx)}
                        disabled={isUser}
                        className={`text-sm font-medium ${
                          isUser
                            ? 'text-gray-500 cursor-default'
                            : 'text-[#14B8A6] hover:underline'
                        }`}
                      >
                        {formatCurrency(row.amount)}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-sm font-medium text-gray-700">Total</span>
              <span
                className={`text-sm font-semibold ${reviewValid ? 'text-gray-900' : 'text-red-600'}`}
              >
                {formatCurrency(reviewTotal)} / {formatCurrency(totalAmount)}
              </span>
            </div>

            {error && (
              <p className="text-center text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(2)}
              >
                Adjust
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirm}
                disabled={!reviewValid}
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
