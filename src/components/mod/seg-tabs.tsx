"use client";

/**
 * Controlled segmented-pill tab bar over the `wc-seg` tokens (globals.css:
 * pill group, background var(--muted), active tab elevated onto
 * var(--card) with a shadow). Hand-rolled `<button>`s rather than the
 * shadcn Tabs primitive (`@/components/ui/tabs`) because this is a pure
 * filter control, not content panes — no `TabsContent` to switch between,
 * just a `value`/`onValueChange` callback the page uses to filter its own
 * query. Reach for the Tabs primitive instead when you need real
 * `role="tabpanel"` content switching.
 *
 * Used by /mod/queue (Reports/Appeals/Reinstatements), /mod/logs
 * (Audit/Broadcast activity), /admin/escalations (status filter).
 */
import type { ReactNode } from "react";

export interface SegTab {
  key: string;
  label: ReactNode;
  /** Trailing count, rendered with `.tnum` (e.g. queue size per kind). */
  count?: number;
}

interface SegTabsProps {
  tabs: SegTab[];
  value: string;
  onValueChange: (key: string) => void;
  /** Base testid; each tab gets `${testid}-${tab.key}`. */
  testid?: string;
  className?: string;
}

export function SegTabs({ tabs, value, onValueChange, testid, className }: SegTabsProps) {
  return (
    <div className={`wc-seg${className ? ` ${className}` : ""}`} role="tablist" data-testid={testid}>
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "active" : undefined}
            onClick={() => onValueChange(tab.key)}
            data-testid={testid ? `${testid}-${tab.key}` : undefined}
          >
            {tab.label}
            {tab.count !== undefined && <span className="tnum">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
