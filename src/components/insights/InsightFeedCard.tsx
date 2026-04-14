'use client';

import Link from 'next/link';
import { Card } from '@/components/ui';
import { InsightSparkline } from './InsightSparkline';
import type { InsightFeedCard as InsightFeedCardModel } from '@/lib/transaction-insights';

interface Props {
  card: InsightFeedCardModel;
}

export function InsightFeedCard({ card }: Props) {
  return (
    <Card className="overflow-hidden border border-gray-100 p-4 shadow-sm">
      <h2 className="text-base font-semibold leading-snug text-gray-900">{card.title}</h2>
      <div className="mt-3 -mx-1">
        <InsightSparkline values={card.sparklineValues} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">{card.explanation}</p>
      <Link
        href={card.ctaHref}
        className="mt-4 inline-flex text-sm font-medium text-[#14B8A6] hover:text-[#0D9488]"
      >
        {card.ctaLabel} →
      </Link>
    </Card>
  );
}
