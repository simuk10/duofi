'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import {
  Card,
  Button,
  Select,
  Input,
  Modal,
} from '@/components/ui';
import { useAuth, useCreditCards, useTransactions, useCardImports } from '@/hooks';
import {
  parseCSV,
  parseCategorizedCSV,
  isCategorizedCSV,
  validateCSVFile,
  type ParsedTransaction,
  type ParsedCategorizedTransaction,
} from '@/lib/csv-parser';
import {
  clearImportProgress,
  dominantMonthFromDates,
  writeImportProgress,
} from '@/lib/gamification';
import {
  formatCurrency,
  getLatestCompleteMonthYear,
  getMonthYearDisplay,
  getPreviousMonths,
} from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  sha256HexFromFile,
  hasDuplicateFileHash,
  duplicateSamplesForRows,
  dateRangeFromRows,
} from '@/lib/card-import-utils';
import {
  Upload,
  FileText,
  Check,
  AlertCircle,
  Plus,
  ChevronLeft,
  Circle,
} from 'lucide-react';
import Link from 'next/link';
import type { CreditCard, PaidBy } from '@/types/database';

type UploadStep = 'upload' | 'preview' | 'success';

export default function UploadPage() {
  const [step, setStep] = useState<UploadStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [isCategorized, setIsCategorized] = useState(false);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [parsedCategorizedTransactions, setParsedCategorizedTransactions] = useState<
    ParsedCategorizedTransaction[]
  >([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [newCardName, setNewCardName] = useState('');
  const [newCardPaidBy, setNewCardPaidBy] = useState<PaidBy>('joint');
  const [showNewCard, setShowNewCard] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checklistMonth, setChecklistMonth] = useState(getLatestCompleteMonthYear);
  const [showDupFileModal, setShowDupFileModal] = useState(false);
  const [showDupTxModal, setShowDupTxModal] = useState(false);
  const [dupTxCount, setDupTxCount] = useState(0);
  const [dupTxSamples, setDupTxSamples] = useState<
    { date: string; description: string; amount: number }[]
  >([]);

  const consentRef = useRef({ file: false, tx: false });

  const router = useRouter();
  const { household, profile } = useAuth();
  const { creditCards, createCreditCard } = useCreditCards({
    householdId: household?.id ?? null,
  });
  const { importTransactions, importCategorizedTransactions } = useTransactions({
    householdId: household?.id ?? null,
  });
  const { refetch: refetchCardImports, isCardCoveredForMonth } = useCardImports({
    householdId: household?.id ?? null,
  });

  const coverageChecklist = (
    <Card className="p-5">
      <h4 className="text-sm text-gray-900 mb-2">Statement coverage by month</h4>
      <p className="text-xs text-gray-500 mb-4">
        A month is covered when an uploaded statement&apos;s date range includes that
        calendar month for that card.
      </p>
      {creditCards.length === 0 ? (
        <p className="text-xs text-gray-500">Add a credit card to track coverage.</p>
      ) : (
        <>
          <Select
            label="Month"
            options={getPreviousMonths(12).map((ym) => ({
              value: ym,
              label: getMonthYearDisplay(ym),
            }))}
            value={checklistMonth}
            onChange={(e) => setChecklistMonth(e.target.value)}
          />
          <ul className="mt-4 space-y-2">
            {creditCards.map((card) => {
              const ok = isCardCoveredForMonth(card.id, checklistMonth);
              return (
                <li
                  key={card.id}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-gray-900 truncate">{card.name}</span>
                  {ok ? (
                    <span className="flex items-center gap-1 shrink-0 text-[#10B981] text-xs">
                      <Check className="h-4 w-4" />
                      Covered
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 shrink-0 text-gray-400 text-xs">
                      <Circle className="h-3 w-3 fill-current" />
                      Not covered
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validationError = validateCSVFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    setFile(selectedFile);
    setError('');
    consentRef.current = { file: false, tx: false };

    let hash: string | null = null;
    try {
      hash = await sha256HexFromFile(selectedFile);
      setFileHash(hash);
    } catch {
      setFileHash(null);
    }

    const text = await selectedFile.text();

    if (isCategorizedCSV(text)) {
      const result = parseCategorizedCSV(text);
      setIsCategorized(true);
      setParsedCategorizedTransactions(result.transactions);
      setParsedTransactions(result.transactions);
      setParseErrors(result.errors);

      if (result.transactions.length > 0) {
        setStep('preview');
      } else {
        setError('No valid transactions found in the file');
      }
    } else {
      const result = parseCSV(text, 'joint');
      setIsCategorized(false);
      setParsedTransactions(result.transactions);
      setParsedCategorizedTransactions([]);
      setParseErrors(result.errors);

      if (result.transactions.length > 0) {
        setStep('preview');
      } else {
        setError('No valid transactions found in the file');
      }
    }
  }, []);

  const handleCreateCard = async () => {
    if (!newCardName.trim()) return;

    setLoading(true);
    try {
      const card = (await createCreditCard(
        newCardName,
        newCardPaidBy
      )) as CreditCard | null;
      if (!card?.id) throw new Error('Failed to create card');
      setSelectedCardId(card.id);
      setShowNewCard(false);
      setNewCardName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create card');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    const householdId = household?.id;
    if (!householdId) return;

    setLoading(true);
    setError('');

    try {
      const allowFile = consentRef.current.file;
      const allowTx = consentRef.current.tx;
      const supabase = createClient();
      const meta = fileHash ? { fileHash } : undefined;

      if (!allowFile && fileHash) {
        const dupFile = await hasDuplicateFileHash(supabase, householdId, fileHash);
        if (dupFile) {
          setShowDupFileModal(true);
          return;
        }
      }

      if (!allowTx) {
        let dupTotal = 0;
        let samples: { date: string; description: string; amount: number }[] = [];

        if (isCategorized) {
          const map = new Map(creditCards.map((c) => [c.name.toLowerCase(), c.id]));
          const byCard = new Map<string, ParsedCategorizedTransaction[]>();
          for (const r of parsedCategorizedTransactions) {
            const id = map.get(r.sourceAccount.toLowerCase());
            if (!id) continue;
            const arr = byCard.get(id) || [];
            arr.push(r);
            byCard.set(id, arr);
          }
          for (const [cardId, rows] of byCard) {
            const { dateFrom, dateTo } = dateRangeFromRows(rows);
            const { count, samples: s } = await duplicateSamplesForRows(
              supabase,
              householdId,
              cardId,
              dateFrom,
              dateTo,
              rows.map((r) => ({
                date: r.date,
                amount: r.amount,
                description: r.description,
              })),
              5
            );
            dupTotal += count;
            for (const row of s) {
              if (samples.length < 8) samples.push(row);
            }
          }
        } else {
          if (!selectedCardId) {
            setError('Please select a credit card');
            return;
          }
          const { dateFrom, dateTo } = dateRangeFromRows(parsedTransactions);
          const res = await duplicateSamplesForRows(
            supabase,
            householdId,
            selectedCardId,
            dateFrom,
            dateTo,
            parsedTransactions,
            8
          );
          dupTotal = res.count;
          samples = res.samples;
        }

        if (dupTotal > 0) {
          setDupTxCount(dupTotal);
          setDupTxSamples(samples);
          setShowDupTxModal(true);
          return;
        }
      }

      if (isCategorized) {
        await importCategorizedTransactions(
          parsedCategorizedTransactions,
          household?.person_a_name ?? 'Person A',
          household?.person_b_name ?? 'Person B',
          meta
        );
      } else {
        if (!selectedCardId) {
          setError('Please select a credit card');
          return;
        }
        const card = creditCards.find((c) => c.id === selectedCardId);
        if (!card) return;
        await importTransactions(
          parsedTransactions,
          selectedCardId,
          card.paid_by,
          meta
        );
      }

      consentRef.current = { file: false, tx: false };
      await refetchCardImports();
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (step === 'success') {
      clearImportProgress();
    }
    setStep('upload');
    setFile(null);
    setFileHash(null);
    setIsCategorized(false);
    setParsedTransactions([]);
    setParsedCategorizedTransactions([]);
    setParseErrors([]);
    setSelectedCardId('');
    setError('');
    consentRef.current = { file: false, tx: false };
    setShowDupFileModal(false);
    setShowDupTxModal(false);
  };

  useEffect(() => {
    if (step !== 'success' || parsedTransactions.length === 0) return;
    const dates = parsedTransactions.map((t) => t.date);
    const monthYear = dominantMonthFromDates(dates);
    writeImportProgress({
      monthYear,
      importedCount: parsedTransactions.length,
      fullyCategorizedOnImport: isCategorized,
      at: new Date().toISOString(),
    });
  }, [step, parsedTransactions, isCategorized]);

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

  return (
    <AppLayout>
      <Modal
        isOpen={showDupFileModal}
        onClose={() => setShowDupFileModal(false)}
        title="This file was already imported"
      >
        <p className="text-sm text-gray-600 mb-4">
          The same file (matching checksum) was uploaded before for your household. You can
          still import if you are sure you want duplicate rows.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setShowDupFileModal(false)}>
            Go back
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              consentRef.current.file = true;
              setShowDupFileModal(false);
              void handleImport();
            }}
          >
            Import anyway
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={showDupTxModal}
        onClose={() => setShowDupTxModal(false)}
        title="Possible duplicate transactions"
      >
        <p className="text-sm text-gray-600 mb-3">
          {dupTxCount} row{dupTxCount === 1 ? '' : 's'} in this file match existing
          transactions (same date, amount, and description) for the same card in this date
          range.
        </p>
        {dupTxSamples.length > 0 && (
          <div className="rounded-lg border border-gray-100 overflow-hidden mb-4 max-h-40 overflow-y-auto">
            {dupTxSamples.map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-50 last:border-0 text-xs"
              >
                <div className="min-w-0">
                  <p className="text-gray-900 truncate">{row.description}</p>
                  <p className="text-gray-500">{new Date(row.date).toLocaleDateString()}</p>
                </div>
                <span className="shrink-0 text-gray-900">{formatCurrency(row.amount)}</span>
              </div>
            ))}
          </div>
        )}
        {dupTxCount > dupTxSamples.length && (
          <p className="text-xs text-gray-500 mb-4">
            …and {dupTxCount - dupTxSamples.length} more
          </p>
        )}
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => setShowDupTxModal(false)}>
            Go back
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              consentRef.current.tx = true;
              setShowDupTxModal(false);
              void handleImport();
            }}
          >
            Import anyway
          </Button>
        </div>
      </Modal>

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-xl tracking-tight text-gray-900">Upload Statement</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
        {step === 'upload' && (
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 p-4 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-[#EF4444] flex-shrink-0" />
                <p className="text-sm text-[#EF4444]">{error}</p>
              </div>
            )}

            <Card className="p-0 overflow-hidden">
              <label className="flex flex-col items-center justify-center p-12 cursor-pointer hover:bg-gray-50 transition-colors">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20 flex items-center justify-center mb-4">
                  <Upload className="h-8 w-8 text-[#0891B2]" />
                </div>
                <p className="text-base text-gray-900 mb-1">
                  Click to upload
                </p>
                <p className="text-sm text-gray-500">CSV files only, max 5MB</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </Card>

            {coverageChecklist}

            <Card className="p-5">
              <h4 className="text-sm text-gray-900 mb-2">
                Supported Formats
              </h4>
              <p className="text-xs text-gray-500 mb-2">
                <span className="font-medium text-gray-700">Bank statements:</span> CSV with Date, Description, and Amount columns.
              </p>
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">Pre-categorized:</span> CSV with Date, Description, Amount, Budget Type, Category, and Source Account columns. Categories and cards are created automatically.
              </p>
            </Card>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#0891B2]" />
                </div>
                <div>
                  <p className="text-sm text-gray-900">{file?.name}</p>
                  <p className="text-xs text-gray-500">
                    {parsedTransactions.length} transactions found
                  </p>
                </div>
              </div>

              {parseErrors.length > 0 && (
                <div className="rounded-lg bg-amber-50 p-3 mb-4">
                  <p className="text-xs text-amber-800 mb-1">
                    Some rows could not be parsed:
                  </p>
                  <ul className="text-xs text-amber-700 list-disc list-inside">
                    {parseErrors.slice(0, 3).map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                    {parseErrors.length > 3 && (
                      <li>...and {parseErrors.length - 3} more</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="max-h-48 overflow-y-auto">
                  {parsedTransactions.slice(0, 10).map((tx, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0"
                    >
                      <div>
                        <p className="text-sm text-gray-900 truncate max-w-[180px]">
                          {tx.description}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(tx.date).toLocaleDateString()}
                        </p>
                      </div>
                      <p className={`text-sm ${tx.amount < 0 ? 'text-[#10B981]' : 'text-gray-900'}`}>
                        {formatCurrency(tx.amount)}
                      </p>
                    </div>
                  ))}
                </div>
                {parsedTransactions.length > 10 && (
                  <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 text-center">
                    +{parsedTransactions.length - 10} more transactions
                  </div>
                )}
              </div>
            </Card>

            {coverageChecklist}

            {isCategorized ? (
              <>
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Check className="h-4 w-4 text-[#10B981]" />
                    <h3 className="text-sm font-medium text-gray-900">Pre-categorized CSV detected</h3>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">
                    Categories, credit cards, and budget owners will be created automatically from your CSV data.
                  </p>
                  {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444] mb-4">
                      {error}
                    </div>
                  )}
                  <div className="space-y-2 text-xs text-gray-600">
                    <p><span className="font-medium text-gray-900">{[...new Set(parsedCategorizedTransactions.map(t => t.sourceAccount))].length}</span> credit cards</p>
                    <p><span className="font-medium text-gray-900">{[...new Set(parsedCategorizedTransactions.map(t => t.category))].length}</span> categories</p>
                    <p><span className="font-medium text-gray-900">{[...new Set(parsedCategorizedTransactions.map(t => t.budgetType))].length}</span> budget types</p>
                  </div>
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleImport()}
                    loading={loading}
                    className="flex-1"
                  >
                    Import {parsedCategorizedTransactions.length} Transactions
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Card className="p-5">
                  <h3 className="text-sm text-gray-900 mb-4">Assign Credit Card</h3>
                  
                  {error && (
                    <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444] mb-4">
                      {error}
                    </div>
                  )}

                  {!showNewCard ? (
                    <div className="space-y-4">
                      <Select
                        label="Credit Card"
                        options={creditCards.map((card) => ({
                          value: card.id,
                          label: `${card.name} (${
                            card.paid_by === 'person_a'
                              ? household?.person_a_name
                              : card.paid_by === 'person_b'
                              ? household?.person_b_name
                              : 'Joint'
                          })`,
                        }))}
                        value={selectedCardId}
                        onChange={(e) => setSelectedCardId(e.target.value)}
                        placeholder="Select a credit card"
                      />

                      <button
                        type="button"
                        onClick={() => setShowNewCard(true)}
                        className="flex items-center gap-2 text-sm text-[#14B8A6] hover:text-[#0D9488]"
                      >
                        <Plus className="h-4 w-4" />
                        Add new credit card
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Input
                        label="Card Name"
                        value={newCardName}
                        onChange={(e) => setNewCardName(e.target.value)}
                        placeholder="e.g., Chase Sapphire"
                      />

                      <Select
                        label="Paid By"
                        options={paidByOptions}
                        value={newCardPaidBy}
                        onChange={(e) => setNewCardPaidBy(e.target.value as PaidBy)}
                      />

                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={() => setShowNewCard(false)}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button onClick={handleCreateCard} loading={loading} className="flex-1">
                          Create Card
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={handleReset} className="flex-1">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void handleImport()}
                    loading={loading}
                    disabled={!selectedCardId}
                    className="flex-1"
                  >
                    Import
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'success' && (
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-[#10B981]/10 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-[#10B981]" />
            </div>
            <h3 className="text-xl text-gray-900 mb-2">
              Import Successful!
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              {parsedTransactions.length} transactions imported{isCategorized ? ' with categories.' : ' and ready to categorize.'}
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => router.push('/transactions')}>
                Categorize Transactions
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Upload Another
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
