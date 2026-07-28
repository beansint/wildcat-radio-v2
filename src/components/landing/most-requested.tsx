"use client";

/**
 * Landing "Most requested this week" — wired to live data (was a static
 * mock). Uses `chartView()` (src/lib/charts/view.ts, already unit-tested)
 * for ranking. `ChartEntryDto` is `{title, count}` only — no artist — so
 * the prototype's artist subline is dropped (see feature report).
 */
import Link from "next/link";
import { useChartsPublicControllerGetCurrent } from "@/lib/api/endpoints/charts-public/charts-public";
import { chartView } from "@/lib/charts/view";

export function MostRequested() {
  const query = useChartsPublicControllerGetCurrent({ query: { retry: false } });
  const data = query.data;
  const view = data
    ? chartView({ weekOf: data.weekOf ?? new Date().toISOString(), entries: data.entries })
    : null;

  if (!view || view.isEmpty) return null;

  const top = view.rows.slice(0, 4);

  return (
    <section className="wc-container py-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-extrabold">Most requested this week</h2>
        <Link href="/charts" className="text-sm font-semibold text-maroon">
          View all →
        </Link>
      </div>
      <div className="wc-card divide-y">
        {top.map((row) => (
          <div key={row.rank} className="wc-card-pad flex items-center gap-3">
            <span
              className={`text-2xl font-extrabold w-7 tnum ${row.rank <= 3 ? "text-maroon" : "wc-muted"}`}
            >
              {row.rank}
            </span>
            <div className="flex-1 min-w-0">
              <div className="font-bold truncate">{row.title}</div>
            </div>
            <span className="wc-chip-ghost tnum">{row.count} reqs</span>
          </div>
        ))}
      </div>
    </section>
  );
}
