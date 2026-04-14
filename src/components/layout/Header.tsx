'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks';
import {
  getLatestCompleteMonthYear,
  getMonthYearDisplay,
  getPreviousMonths,
} from '@/lib/utils';

export interface MonthOption {
  value: string;
  label: string;
}

interface HeaderProps {
  title: string;
  showMonthPicker?: boolean;
  selectedMonth?: string;
  /** Required for month pill to open and change month */
  onMonthChange?: (month: string) => void;
  monthOptions?: MonthOption[];
  action?: React.ReactNode;
  centerTitle?: boolean;
}

export function Header({
  title,
  showMonthPicker = false,
  selectedMonth,
  onMonthChange,
  monthOptions: monthOptionsProp,
  action,
  centerTitle = false,
}: HeaderProps) {
  const { profile } = useAuth();
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const monthPickerRef = useRef<HTMLDivElement>(null);

  const activeMonthValue =
    selectedMonth === undefined ? getLatestCompleteMonthYear() : selectedMonth;
  const displayLabel =
    activeMonthValue === ''
      ? 'All months'
      : getMonthYearDisplay(activeMonthValue);

  const monthOptions =
    monthOptionsProp ??
    getPreviousMonths(24).map((m) => ({
      value: m,
      label: getMonthYearDisplay(m),
    }));

  useEffect(() => {
    if (!monthMenuOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const el = monthPickerRef.current;
      if (el && !el.contains(e.target as Node)) {
        setMonthMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [monthMenuOpen]);

  useEffect(() => {
    if (!monthMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMonthMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [monthMenuOpen]);

  return (
    <header className="bg-white border-b border-gray-200 px-5 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        {centerTitle ? (
          <>
            <div className="w-8" />
            <h1 className="text-xl tracking-tight text-gray-900">{title}</h1>
            <div className="w-8" />
          </>
        ) : (
          <>
            <h1 className="text-xl tracking-tight text-gray-900">{title}</h1>
            <div className="flex items-center gap-3">
              {showMonthPicker && (
                <div className="relative" ref={monthPickerRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (onMonthChange) setMonthMenuOpen((o) => !o);
                    }}
                    disabled={!onMonthChange}
                    aria-expanded={monthMenuOpen}
                    aria-haspopup="listbox"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <span className="text-sm text-gray-700">
                      {displayLabel}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-gray-500 transition-transform ${monthMenuOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {monthMenuOpen && onMonthChange && (
                    <ul
                      role="listbox"
                      className="absolute right-0 top-full z-50 mt-1 max-h-64 min-w-[11rem] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                    >
                      {monthOptions.map((opt) => (
                        <li key={opt.value} role="option" aria-selected={opt.value === activeMonthValue}>
                          <button
                            type="button"
                            onClick={() => {
                              onMonthChange(opt.value);
                              setMonthMenuOpen(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                              opt.value === activeMonthValue
                                ? 'bg-teal-50 text-[#0D9488] font-medium'
                                : 'text-gray-800'
                            }`}
                          >
                            {opt.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <button
                type="button"
                className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center"
              >
                <span className="text-sm text-white font-medium">
                  {profile?.name?.charAt(0) ||
                    profile?.email?.charAt(0).toUpperCase() ||
                    'U'}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
      {action}
    </header>
  );
}
