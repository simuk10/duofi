'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ChevronDown, User, TrendingUp, TrendingDown, AlertCircle, Check } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { INSIGHT_CHART_COLORS, type InsightsDashboardModel } from '@/lib/insights-dashboard';
import type {
  InsightRangePreset,
  InsightOwnerFilter,
  InsightSelectedPerson,
} from '@/app/insights/page';

const RANGE_OPTIONS: { value: InsightRangePreset | 'custom'; label: string }[] = [
  { value: 12, label: 'Last 12 Months' },
  { value: 9, label: 'Last 9 Months' },
  { value: 6, label: 'Last 6 Months' },
  { value: 3, label: 'Last 3 Months' },
  { value: 1, label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

interface Props {
  model: InsightsDashboardModel;
  rangePreset: InsightRangePreset | 'custom';
  rangeLabel: string;
  onRangePresetChange: (m: InsightRangePreset | 'custom') => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
  ownerFilter: InsightOwnerFilter;
  onOwnerFilterChange: (f: InsightOwnerFilter) => void;
  selectedPerson: InsightSelectedPerson;
  onSelectedPersonChange: (p: InsightSelectedPerson) => void;
  personALabel: string;
  personBLabel: string;
  isPersonB?: boolean;
}

export function InsightsDashboard({
  model,
  rangePreset,
  rangeLabel,
  onRangePresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
  ownerFilter,
  onOwnerFilterChange,
  selectedPerson,
  onSelectedPersonChange,
  personALabel,
  personBLabel,
  isPersonB,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const {
    monthlySpending,
    categorySpendingAvg,
    categoryTrends,
    categoryTrendSeries,
    categoryTrendColors,
    topVendors,
    spendingBehavior,
    kpis,
    insightBullets,
  } = model;

  const pieData = categorySpendingAvg.map((cat) => ({
    name: cat.category,
    value: cat.avg,
  }));

  const mom = kpis.monthOverMonthChange;
  const sixMo = kpis.sixMonthTrend;

  const displayMonths =
    rangePreset === 'custom'
      ? model.monthlySpending.length
      : rangePreset;

  return (
    <div className="flex flex-col bg-[#F9FAFB]">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-5 pb-4 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h1 className="text-xl tracking-tight text-gray-900">Insights</h1>
          <div className="flex items-center gap-3">
            {/* Range dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 transition-colors hover:bg-gray-100"
              >
                <span className="max-w-[10rem] truncate text-sm text-gray-700">
                  {rangeLabel}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-gray-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 z-50 mt-1.5 w-60 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                  {RANGE_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => {
                        onRangePresetChange(opt.value);
                        if (opt.value !== 'custom') setDropdownOpen(false);
                      }}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ${
                        rangePreset === opt.value
                          ? 'bg-[#14B8A6]/10 text-[#0D9488]'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                      {rangePreset === opt.value && (
                        <Check className="h-4 w-4 text-[#14B8A6]" />
                      )}
                    </button>
                  ))}

                  {rangePreset === 'custom' && (
                    <div className="border-t border-gray-100 px-4 py-3">
                      <label className="mb-1 block text-xs text-gray-500">From</label>
                      <input
                        type="date"
                        value={customFrom}
                        onChange={(e) => onCustomFromChange(e.target.value)}
                        className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#14B8A6] focus:outline-none focus:ring-1 focus:ring-[#14B8A6]"
                      />
                      <label className="mb-1 block text-xs text-gray-500">To</label>
                      <input
                        type="date"
                        value={customTo}
                        onChange={(e) => onCustomToChange(e.target.value)}
                        className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-[#14B8A6] focus:outline-none focus:ring-1 focus:ring-[#14B8A6]"
                      />
                      <button
                        type="button"
                        disabled={!customFrom || !customTo}
                        onClick={() => setDropdownOpen(false)}
                        className="w-full rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0D9488] disabled:opacity-40"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Link
              href="/dashboard/settings"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#14B8A6] to-[#0891B2]"
              aria-label="Settings"
            >
              <User className="h-4 w-4 text-white" />
            </Link>
          </div>
        </div>
        <p className="text-xs text-gray-500">Spending analytics and trends</p>

        {/* Person A / B — drives which personal / total-share slice is shown */}
        <div className="mt-3 flex rounded-lg bg-gray-100 p-1">
          {([
            isPersonB ? 'B' : 'A',
            isPersonB ? 'A' : 'B',
          ] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectedPersonChange(key)}
              className={`flex-1 rounded-lg py-2.5 px-3 text-sm font-medium transition-all ${
                selectedPerson === key
                  ? 'bg-[#14B8A6] text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {key === 'A' ? personALabel : personBLabel}
            </button>
          ))}
        </div>

        {/* Owner toggle */}
        <div className="mt-2 flex rounded-lg bg-gray-100 p-1">
          {(
            [
              { key: 'personal', label: 'Personal' },
              { key: 'joint', label: 'Joint' },
              { key: 'total', label: 'Total share' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onOwnerFilterChange(opt.key)}
              className={`flex-1 rounded-lg px-2 py-2 text-center text-xs font-medium transition-all sm:text-sm ${
                ownerFilter === opt.key
                  ? 'bg-white text-[#0D9488] shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-24 pt-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-gradient-to-br from-[#14B8A6] to-[#0891B2] p-4 text-white">
            <p className="mb-1 text-xs text-white/80">Highest Month</p>
            <p className="mb-0.5 text-2xl tabular-nums">
              {formatCurrency(kpis.highestMonth.total)}
            </p>
            <p className="text-xs text-white/80">{kpis.highestMonth.fullLabel}</p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs text-gray-500">Top Category</p>
            <p className="mb-0.5 text-2xl tabular-nums text-gray-900">
              {formatCurrency(kpis.topCategory.avg)}
            </p>
            <p className="text-xs text-gray-600">{kpis.topCategory.category}</p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs text-gray-500">vs Last Month</p>
            {mom == null ? (
              <p className="text-2xl text-gray-400">&mdash;</p>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  {mom >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-[#EF4444]" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-[#10B981]" />
                  )}
                  <p
                    className={`text-2xl tabular-nums ${
                      mom >= 0 ? 'text-[#EF4444]' : 'text-[#10B981]'
                    }`}
                  >
                    {Math.abs(mom).toFixed(1)}%
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">
                  {mom >= 0 ? 'Increase' : 'Decrease'}
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs text-gray-500">6 Mo Trend</p>
            {sixMo == null ? (
              <p className="text-2xl text-gray-400">&mdash;</p>
            ) : (
              <>
                <div className="flex items-center gap-1">
                  {sixMo >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-[#EF4444]" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-[#10B981]" />
                  )}
                  <p
                    className={`text-2xl tabular-nums ${
                      sixMo >= 0 ? 'text-[#EF4444]' : 'text-[#10B981]'
                    }`}
                  >
                    {Math.abs(sixMo).toFixed(1)}%
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-gray-600">
                  {formatCurrency(kpis.last6MonthsAvg)}/mo avg
                </p>
              </>
            )}
          </div>
        </div>

        {/* Monthly Spending Trend */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm text-gray-900">
            Monthly Spending ({displayMonths} {displayMonths === 1 ? 'Month' : 'Months'})
          </h3>
          <div className="h-[180px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlySpending} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  interval={displayMonths > 12 ? 'preserveStartEnd' : 0}
                />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  axisLine={{ stroke: '#e5e7eb' }}
                  width={44}
                  tickFormatter={(v) =>
                    v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value) => {
                    const n = typeof value === 'number' ? value : Number(value);
                    return Number.isFinite(n)
                      ? [formatCurrency(n), 'Total']
                      : ['', ''];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="#14B8A6"
                  strokeWidth={2}
                  dot={{ fill: '#14B8A6', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm text-gray-900">Category Distribution (Avg / Month)</h3>
          {pieData.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Categorize transactions to see this chart.
            </p>
          ) : (
            <>
              <div className="h-[200px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name }) => name}
                      outerRadius={70}
                      dataKey="value"
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={INSIGHT_CHART_COLORS[index % INSIGHT_CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => {
                        const n = typeof value === 'number' ? value : Number(value);
                        return Number.isFinite(n) ? formatCurrency(n) : '';
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {categorySpendingAvg.map((cat, idx) => (
                  <div key={cat.category} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 shrink-0 rounded"
                      style={{
                        backgroundColor:
                          INSIGHT_CHART_COLORS[idx % INSIGHT_CHART_COLORS.length],
                      }}
                    />
                    <span className="text-xs text-gray-600">
                      {cat.category}: {formatCurrency(cat.avg)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Category Trends */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm text-gray-900">Category Spending Trends (6 Months)</h3>
          {categoryTrendSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Not enough categorized history for multi-category trends.
            </p>
          ) : (
            <div className="h-[200px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={categoryTrends} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={{ stroke: '#e5e7eb' }}
                  />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    axisLine={{ stroke: '#e5e7eb' }}
                    width={44}
                    tickFormatter={(v) =>
                      v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value) => {
                      const n = typeof value === 'number' ? value : Number(value);
                      return Number.isFinite(n) ? formatCurrency(n) : '';
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px' }}
                    iconType="circle"
                    iconSize={8}
                  />
                  {categoryTrendSeries.map((name, i) => (
                    <Line
                      key={name}
                      type="monotone"
                      dataKey={name}
                      stroke={categoryTrendColors[i] ?? INSIGHT_CHART_COLORS[i]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Top Vendors */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm text-gray-900">Most Frequent Vendors</h3>
          {topVendors.length === 0 ? (
            <p className="text-sm text-gray-500">No vendor data yet.</p>
          ) : (
            <div className="space-y-3">
              {topVendors.map((vendor, index) => (
                <div key={vendor.name}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#14B8A6]/20 to-[#0891B2]/20">
                        <span className="text-xs text-[#0891B2]">{index + 1}</span>
                      </div>
                      <span className="truncate text-sm text-gray-900">{vendor.name}</span>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular-nums text-gray-900">
                        {formatCurrency(vendor.total)}
                      </p>
                      <p className="text-xs text-gray-500">{vendor.count} visits</p>
                    </div>
                  </div>
                  {index < topVendors.length - 1 && <div className="mt-3 h-px bg-gray-100" />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quarterly Spending Behavior */}
        <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm text-gray-900">Quarterly Spending Behavior</h3>
          <div className="space-y-3">
            {spendingBehavior.map((period) => (
              <div
                key={period.period}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
              >
                <div>
                  <p className="text-sm text-gray-900">{period.period}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatCurrency(period.avgMonthly)}/mo avg
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {period.trend === 'increase' ? (
                    <>
                      <TrendingUp className="h-4 w-4 text-[#EF4444]" />
                      <span className="text-xs text-[#EF4444]">Up</span>
                    </>
                  ) : period.trend === 'decrease' ? (
                    <>
                      <TrendingDown className="h-4 w-4 text-[#10B981]" />
                      <span className="text-xs text-[#10B981]">Down</span>
                    </>
                  ) : (
                    <>
                      <div className="h-0.5 w-4 rounded bg-gray-400" />
                      <span className="text-xs text-gray-600">Stable</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Insights & Highlights */}
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <h3 className="mb-1 text-sm text-amber-900">Highlights</h3>
              <p className="text-xs text-amber-700">Patterns from your recent activity</p>
            </div>
          </div>
          <div className="space-y-2">
            {insightBullets.map((text, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                <p className="text-xs text-amber-900">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
