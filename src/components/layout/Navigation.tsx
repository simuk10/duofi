'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  FileText,
  PieChart,
  LineChart,
  Users,
  Settings,
} from 'lucide-react';

const tabs = [
  { href: '/transactions', label: 'Import', icon: FileText },
  { href: '/budget', label: 'Overview', icon: PieChart },
  { href: '/insights', label: 'Insights', icon: LineChart },
  { href: '/settlement', label: 'Settlement', icon: Users },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/transactions') {
      return pathname === '/transactions' || pathname === '/dashboard' || pathname === '/dashboard/upload';
    }
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-inset-bottom">
      <div className="flex justify-around items-center h-16 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex flex-col items-center justify-center flex-1 h-full transition-colors"
            >
              <Icon
                className={cn(
                  'w-5 h-5 mb-1 transition-colors',
                  active ? 'text-[#14B8A6]' : 'text-gray-400'
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={cn(
                  'text-[9px] transition-colors sm:text-[10px]',
                  active ? 'text-[#14B8A6] font-medium' : 'text-gray-400'
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
