'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import {
  Card,
  Button,
  Input,
  Select,
  Modal,
} from '@/components/ui';
import { useAuth, useCreditCards } from '@/hooks';
import { CreditCard as CreditCardIcon, Plus, Edit2, Trash2, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import type { CreditCard, PaidBy } from '@/types/database';

export default function CreditCardsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [cardName, setCardName] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [paidBy, setPaidBy] = useState<PaidBy>('joint');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { household, profile } = useAuth();
  const {
    creditCards,
    loading,
    createCreditCard,
    updateCreditCard,
    deleteCreditCard,
  } = useCreditCards({
    householdId: household?.id ?? null,
  });

  const paidByOptions = profile?.role === 'person_b'
    ? [
        { value: 'person_b', label: household?.person_b_name || 'Person B' },
        { value: 'person_a', label: household?.person_a_name || 'Person A' },
        { value: 'joint', label: 'Joint (50/50)' },
      ]
    : [
        { value: 'person_a', label: household?.person_a_name || 'Person A' },
        { value: 'person_b', label: household?.person_b_name || 'Person B' },
        { value: 'joint', label: 'Joint (50/50)' },
      ];

  const handleOpenCreate = () => {
    setEditingCard(null);
    setCardName('');
    setLastFour('');
    setPaidBy('joint');
    setError('');
    setShowModal(true);
  };

  const handleOpenEdit = (card: CreditCard) => {
    setEditingCard(card);
    setCardName(card.name);
    setLastFour(card.last_four || '');
    setPaidBy(card.paid_by);
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!cardName.trim()) {
      setError('Card name is required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      if (editingCard) {
        await updateCreditCard(editingCard.id, {
          name: cardName,
          paid_by: paidBy,
          last_four: lastFour || undefined,
        });
      } else {
        await createCreditCard(cardName, paidBy, lastFour || undefined);
      }
      setShowModal(false);
      setEditingCard(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save card');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (card: CreditCard) => {
    if (!confirm(`Delete "${card.name}"?`)) return;

    try {
      await deleteCreditCard(card.id);
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  };

  const getPaidByLabel = (paid_by: PaidBy) => {
    switch (paid_by) {
      case 'person_a':
        return household?.person_a_name || 'Person A';
      case 'person_b':
        return household?.person_b_name || 'Person B';
      case 'joint':
        return 'Joint';
    }
  };

  const getPaidByColor = (paid_by: PaidBy) => {
    switch (paid_by) {
      case 'person_a':
        return 'bg-[#14B8A6]';
      case 'person_b':
        return 'bg-[#EC4899]';
      case 'joint':
        return 'bg-[#0891B2]';
    }
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/settings"
              className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-xl tracking-tight text-gray-900">Credit Cards</h1>
          </div>
          <button
            onClick={handleOpenCreate}
            className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center"
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent" />
          </div>
        ) : creditCards.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20 flex items-center justify-center mx-auto mb-4">
              <CreditCardIcon className="w-8 h-8 text-[#0891B2]" />
            </div>
            <h3 className="text-lg text-gray-900 mb-2">No credit cards yet</h3>
            <p className="text-sm text-gray-600 mb-4">
              Add your credit cards to track who pays for what.
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Add Your First Card
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {creditCards.map((card) => (
              <Card key={card.id} className="p-4 relative overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 w-1 ${getPaidByColor(card.paid_by)}`}
                />
                <div className="flex items-center justify-between pl-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <CreditCardIcon className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <p className="text-[15px] text-gray-900">{card.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {card.last_four && (
                          <span className="text-xs text-gray-500">
                            •••• {card.last_four}
                          </span>
                        )}
                        <span className="text-xs text-[#14B8A6]">
                          {getPaidByLabel(card.paid_by)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(card)}
                      className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(card)}
                      className="p-2 text-gray-400 hover:text-[#EF4444] rounded-lg hover:bg-gray-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Card Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCard(null);
        }}
        title={editingCard ? 'Edit Credit Card' : 'Add Credit Card'}
      >
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444]">
              {error}
            </div>
          )}

          <Input
            label="Card Name"
            type="text"
            value={cardName}
            onChange={(e) => setCardName(e.target.value)}
            placeholder="e.g., Chase Sapphire"
          />

          <Input
            label="Last 4 Digits (optional)"
            type="text"
            maxLength={4}
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
            placeholder="1234"
          />

          <Select
            label="Paid By"
            options={paidByOptions}
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value as PaidBy)}
          />

          <p className="text-xs text-gray-500">
            This determines how transactions on this card are split in settlements.
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowModal(false);
                setEditingCard(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} className="flex-1">
              {editingCard ? 'Save' : 'Add Card'}
            </Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}
