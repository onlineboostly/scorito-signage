'use client';

import { STALE_AFTER_MS } from '@/lib/config';
import { formatClock, formatLongDate } from '@/lib/format';
import { useNow, type Pager } from './hooks';

type Props = {
  title: string;
  subtitle?: string;
  /** ISO timestamp of the snapshot driving this screen. */
  scrapedAt?: string;
  pager?: Pager;
  children: React.ReactNode;
};

/**
 * Shared TV chrome: brand bar, header with title + "laatst bijgewerkt",
 * full-height content area and pagination dots.
 */
export default function ScreenShell({
  title,
  subtitle,
  scrapedAt,
  pager,
  children,
}: Props) {
  const now = useNow();
  const scraped = scrapedAt ? new Date(scrapedAt) : null;
  const isStale =
    now && scraped ? now.getTime() - scraped.getTime() > STALE_AFTER_MS : false;
  // Before mount, fall back to the snapshot time so SSR and hydration match.
  const dateSource = now ?? scraped;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden px-14 pb-8 pt-8">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-bisharp-orange via-bisharp-blue to-bisharp-green" />

      <header className="flex items-end justify-between border-b border-white/10 pb-5">
        <div className="flex items-center gap-7">
          <div className="flex items-center gap-3">
            <span className="h-4 w-4 rounded-sm bg-bisharp-orange" aria-hidden />
            <span className="font-heading text-2xl font-bold tracking-[0.25em]">
              BISHARP
            </span>
          </div>
          <div className="h-14 w-px bg-white/15" aria-hidden />
          <div>
            <h1 className="font-heading text-5xl font-bold leading-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 font-body text-xl italic text-bisharp-light/60">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div className="text-right">
          {dateSource ? (
            <div className="font-heading text-2xl font-semibold">
              {formatLongDate(dateSource)}
            </div>
          ) : null}
          {scraped ? (
            <div
              className={`mt-1 text-xl ${
                isStale ? 'text-bisharp-orange' : 'text-bisharp-light/60'
              }`}
            >
              Laatst bijgewerkt {formatClock(scraped)}
              {isStale ? ' (verouderd)' : ''}
            </div>
          ) : null}
        </div>
      </header>

      <main className="min-h-0 flex-1 pt-6">{children}</main>

      {pager && pager.count > 1 ? (
        <footer className="flex h-8 items-center justify-center gap-3 pt-2">
          {Array.from({ length: pager.count }, (_, i) => (
            <span
              key={i}
              className={`h-3 rounded-full transition-all duration-500 ${
                i === pager.index ? 'w-8 bg-bisharp-orange' : 'w-3 bg-white/20'
              }`}
            />
          ))}
        </footer>
      ) : null}
    </div>
  );
}
