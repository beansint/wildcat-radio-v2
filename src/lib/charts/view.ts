/**
 * Weekly-chart view model: rank entries by play count, stable-sorted so
 * ties keep the server's original order, and report an explicit empty
 * state rather than an empty-looking table.
 */
import { formatDate } from "@/components/standing/format";

export interface ChartEntryInput {
  title: string;
  count: number;
}

export interface ChartRow {
  rank: number;
  title: string;
  count: number;
}

export interface ChartViewInput {
  weekOf: string;
  entries: readonly ChartEntryInput[];
}

export interface ChartView {
  isEmpty: boolean;
  weekLabel: string;
  rows: ChartRow[];
}

export function chartView(input: ChartViewInput): ChartView {
  // Array.prototype.sort is a stable sort (guaranteed since ES2019), so
  // equal counts keep their original (server) order.
  const ranked = [...input.entries].sort((a, b) => b.count - a.count);

  return {
    isEmpty: input.entries.length === 0,
    weekLabel: `Week of ${formatDate(input.weekOf)}`,
    rows: ranked.map((entry, index) => ({ rank: index + 1, title: entry.title, count: entry.count })),
  };
}
