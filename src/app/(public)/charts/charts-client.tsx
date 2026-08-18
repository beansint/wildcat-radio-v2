"use client";

/**
 * Public `/charts` — the current week's most-requested tracks, via
 * `chartView()` (src/lib/charts/view.ts, already unit-tested — reused, not
 * reimplemented). `ChartEntryDto` is `{title, count}` only — no artist —
 * so the prototype's artist subline is dropped (see feature report).
 */
import { TrendingUp } from "lucide-react";
import { useChartsPublicControllerGetCurrent } from "@/lib/api/endpoints/charts-public/charts-public";
import { chartView } from "@/lib/charts/view";
import { classifyQueryError } from "@/lib/content/format";
import { PublicEmpty, PublicGenericError, PublicRateLimited } from "@/components/public/public-states";

export function ChartsClient() {
  const query = useChartsPublicControllerGetCurrent({ query: { retry: false } });
  const err = query.isError ? classifyQueryError(query.error) : null;
  const data = query.data;

  const view = data
    ? chartView({ weekOf: data.weekOf ?? new Date().toISOString(), entries: data.entries })
    : null;
  const weekLabel = data?.weekOf ? view!.weekLabel : "This week";

  return (
    <div className="pb-16">
      <section className="wc-container py-6 md:py-8">
        <div className="mb-1 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-maroon" aria-hidden="true" />
          <h1 className="text-2xl font-extrabold">Most requested this week</h1>
        </div>
        <p className="wc-muted">
          {weekLabel} · auto-generated from listener requests.
        </p>
      </section>

      <section className="wc-container pb-10">
        {query.isLoading ? (
          <p className="wc-muted">Loading the chart…</p>
        ) : err?.rateLimited ? (
          <PublicRateLimited onRetry={() => query.refetch()} />
        ) : err ? (
          <PublicGenericError message={err.message} />
        ) : !view || view.isEmpty ? (
          <PublicEmpty message={`No requests recorded yet for ${weekLabel}.`} />
        ) : (
          <div className="wc-card divide-y" data-testid="public-chart-rows">
            {view.rows.map((row) => (
              <div key={row.rank} className="wc-card-pad flex items-center gap-3">
                <span
                  className={`text-2xl font-extrabold w-9 tnum ${row.rank <= 3 ? "text-maroon text-3xl" : "wc-muted"}`}
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
        )}
      </section>
    </div>
  );
}
