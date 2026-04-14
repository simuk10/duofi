'use client';

import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout';
import {
  Card,
  Button,
  Input,
  Modal,
} from '@/components/ui';
import { useAuth, useTransactions, useRepayments } from '@/hooks';
import { calculateSettlement } from '@/lib/settlement';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import type { BudgetOwner } from '@/types/database';

export default function SettlementPage() {
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { household } = useAuth();
  const { transactions, loading: txLoading } = useTransactions({
    householdId: household?.id ?? null,
    filter: 'categorized',
  });
  const {
    repayments,
    loading: repLoading,
    recordRepayment,
    deleteRepayment,
  } = useRepayments({
    householdId: household?.id ?? null,
  });

  const settlement = useMemo(() => {
    return calculateSettlement(
      transactions,
      repayments,
      household?.person_a_name || 'Person A',
      household?.person_b_name || 'Person B'
    );
  }, [transactions, repayments, household]);

  // Calculate totals for the "how calculated" section
  const calculationDetails = useMemo(() => {
    let personAPaidForShared = 0;
    let personBPaidForShared = 0;

    transactions.forEach((tx) => {
      if (!tx.is_categorized || !tx.budget_owner) return;

      // Count expenses where someone paid for shared (joint) or the other person's expenses
      if (tx.paid_by === 'person_a') {
        if (tx.budget_owner === 'joint' || tx.budget_owner === 'person_b') {
          personAPaidForShared += tx.amount;
        }
      } else if (tx.paid_by === 'person_b') {
        if (tx.budget_owner === 'joint' || tx.budget_owner === 'person_a') {
          personBPaidForShared += tx.amount;
        }
      }
    });

    return {
      personAPaidForShared,
      personBPaidForShared,
    };
  }, [transactions]);

  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const paidBy: BudgetOwner = settlement.personAOwes ? 'person_a' : 'person_b';
      const paidTo: BudgetOwner = settlement.personAOwes ? 'person_b' : 'person_a';

      await recordRepayment(paidBy, paidTo, amount, paymentNotes || undefined);
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRepayment = async (id: string) => {
    if (!confirm('Delete this payment record?')) return;
    try {
      await deleteRepayment(id);
    } catch (err) {
      console.error('Failed to delete repayment:', err);
    }
  };

  const handleSettleUp = () => {
    setPaymentAmount(Math.abs(settlement.netBalance).toFixed(2));
    setShowPaymentModal(true);
  };

  const loading = txLoading || repLoading;

  const owingPerson = settlement.personAOwes
    ? household?.person_a_name
    : household?.person_b_name;
  const owedPerson = settlement.personAOwes
    ? household?.person_b_name
    : household?.person_a_name;

  return (
    <AppLayout>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-4">
        <h1 className="text-xl text-center tracking-tight text-gray-900">Settlement</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Hero Balance Card */}
            <Card className="p-6 mb-4">
              <div className="flex items-center justify-center mb-6">
                <div className="flex items-center gap-4">
                  {/* Person B Avatar */}
                  <div className="w-16 h-16 rounded-full gradient-pink flex items-center justify-center">
                    <span className="text-xl text-white">
                      {(household?.person_b_name || 'B').charAt(0)}
                    </span>
                  </div>

                  {/* Arrow */}
                  <ArrowRight 
                    className={`w-6 h-6 text-[#14B8A6] ${
                      settlement.personAOwes ? 'rotate-180' : ''
                    }`} 
                    strokeWidth={2.5} 
                  />

                  {/* Person A Avatar */}
                  <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center">
                    <span className="text-xl text-white">
                      {(household?.person_a_name || 'A').charAt(0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-center mb-6">
                <p className="text-sm text-gray-600 mb-2">Current Balance</p>
                {Math.abs(settlement.netBalance) < 0.01 ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-[#10B981]/10 flex items-center justify-center mx-auto mb-2">
                      <Check className="w-6 h-6 text-[#10B981]" />
                    </div>
                    <h2 className="text-2xl text-gray-900 mb-1">All Settled!</h2>
                    <p className="text-sm text-gray-600">You're all even</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-3xl text-gray-900 mb-1">
                      {formatCurrency(Math.abs(settlement.netBalance))}
                    </h2>
                    <p className="text-sm text-gray-600">
                      <span className="text-gray-900">{owingPerson}</span> owes{' '}
                      <span className="text-gray-900">{owedPerson}</span>
                    </p>
                  </>
                )}
              </div>

              <button 
                onClick={() => setShowDetailsModal(true)}
                className="flex items-center justify-center gap-2 w-full text-[#14B8A6] hover:text-[#0D9488] transition-colors py-2"
              >
                <span className="text-sm">View details of why</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </Card>

            {/* Primary Action */}
            {Math.abs(settlement.netBalance) >= 0.01 && (
              <Button onClick={handleSettleUp} className="w-full mb-6" size="lg">
                Record a Repayment
              </Button>
            )}

            {/* Historical Ledger */}
            <Card className="p-5">
              <h3 className="text-sm text-gray-600 mb-4">Repayment History</h3>
              {repayments.length === 0 ? (
                <p className="text-center text-gray-500 py-4">
                  No repayments recorded yet
                </p>
              ) : (
                <div className="space-y-3">
                  {repayments.map((repayment, index) => (
                    <div
                      key={repayment.id}
                      className={`pb-3 ${
                        index !== repayments.length - 1 ? 'border-b border-gray-100' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex-1">
                          <p className="text-sm text-gray-700 mb-0.5">
                            {repayment.paid_by === 'person_a'
                              ? household?.person_a_name
                              : household?.person_b_name}{' '}
                            paid{' '}
                            {repayment.paid_to === 'person_a'
                              ? household?.person_a_name
                              : household?.person_b_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDate(repayment.date)}
                            {repayment.notes && ` • ${repayment.notes}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-900">
                            {formatCurrency(repayment.amount)}
                          </p>
                          <button
                            onClick={() => handleDeleteRepayment(repayment.id)}
                            className="p-1 text-gray-400 hover:text-[#EF4444]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2">
                        <div className="w-4 h-4 rounded-full bg-[#10B981]/10 flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 text-[#10B981]" strokeWidth={3} />
                        </div>
                        <span className="text-xs text-[#10B981]">Marked as Paid</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* How Calculated Section */}
            <Card className="p-5 mt-4">
              <h3 className="text-sm text-gray-600 mb-3">How This Balance Was Calculated</h3>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {household?.person_a_name} paid for shared expenses
                  </span>
                  <span className="text-gray-900">
                    {formatCurrency(calculationDetails.personAPaidForShared)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {household?.person_b_name} paid for shared expenses
                  </span>
                  <span className="text-gray-900">
                    {formatCurrency(calculationDetails.personBPaidForShared)}
                  </span>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">Net balance after repayments</span>
                    <span className="text-[#14B8A6]">
                      {formatCurrency(Math.abs(settlement.netBalance))}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Record Payment Modal */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => {
          setShowPaymentModal(false);
          setPaymentAmount('');
          setPaymentNotes('');
          setError('');
        }}
        title="Record Payment"
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444]">
              {error}
            </div>
          )}

          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                <span className="text-sm text-white">
                  {(owingPerson || 'A').charAt(0)}
                </span>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
              <div className="w-10 h-10 rounded-full gradient-pink flex items-center justify-center">
                <span className="text-sm text-white">
                  {(owedPerson || 'B').charAt(0)}
                </span>
              </div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {owingPerson} pays {owedPerson}
            </p>
          </div>

          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            placeholder="0.00"
          />

          <Input
            label="Notes (optional)"
            type="text"
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            placeholder="e.g., Venmo transfer"
          />

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowPaymentModal(false);
                setPaymentAmount('');
                setPaymentNotes('');
                setError('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} loading={saving} className="flex-1">
              Record Payment
            </Button>
          </div>
        </div>
      </Modal>

      {/* Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        title="Settlement Rules"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Here's how we calculate who owes what:
          </p>

          <div className="space-y-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                When {household?.person_a_name} pays
              </h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• {household?.person_a_name}'s expense → No debt</li>
                <li>• {household?.person_b_name}'s expense → {household?.person_b_name} owes 100%</li>
                <li>• Joint expense → {household?.person_b_name} owes 50%</li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                When {household?.person_b_name} pays
              </h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• {household?.person_b_name}'s expense → No debt</li>
                <li>• {household?.person_a_name}'s expense → {household?.person_a_name} owes 100%</li>
                <li>• Joint expense → {household?.person_a_name} owes 50%</li>
              </ul>
            </div>

            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                When paid jointly (50/50)
              </h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Joint expense → No debt</li>
                <li>• {household?.person_a_name}'s expense → {household?.person_a_name} owes 50%</li>
                <li>• {household?.person_b_name}'s expense → {household?.person_b_name} owes 50%</li>
              </ul>
            </div>
          </div>

          <Button onClick={() => setShowDetailsModal(false)} className="w-full">
            Got it
          </Button>
        </div>
      </Modal>
    </AppLayout>
  );
}
