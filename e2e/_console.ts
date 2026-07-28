import type { Page, Response } from '@playwright/test';

/**
 * INV-8 — console + network cleanliness helper shared by all three FE#9
 * specs. Attach once per test (`attachConsoleGuard(page)`), drive the flow,
 * then call `assertClean()` at the end. A test that deliberately provokes an
 * error response (429/404/409 edge cases) must pass the offending URL(s) in
 * `allowlistUrls` to `assertClean()` — never silently swallow an unexpected
 * one.
 */

export interface ConsoleGuard {
  /** Returns every captured `console.error`/`console.warn` text, in order. */
  errors(): string[];
  /** Returns every response with status >= 400, as `{ url, status }`. */
  badResponses(): Array<{ url: string; status: number }>;
  /**
   * Asserts zero console errors/warnings and zero >=400 responses except
   * those whose URL matches one of `allowlist` (string = exact match,
   * RegExp = pattern match — e.g. the URL a 429/404 edge case intentionally
   * provokes).
   */
  assertClean(allowlist?: Array<string | RegExp>): void;
}

export function attachConsoleGuard(page: Page): ConsoleGuard {
  const consoleEntries: string[] = [];
  const responses: Array<{ url: string; status: number }> = [];

  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning') {
      consoleEntries.push(`[${type}] ${message.text()}`);
    }
  });

  page.on('pageerror', (error) => {
    consoleEntries.push(`[pageerror] ${error.message}`);
  });

  page.on('response', (response: Response) => {
    const status = response.status();
    if (status >= 400) {
      responses.push({ url: response.url(), status });
    }
  });

  function isAllowed(url: string, allowlist: Array<string | RegExp>): boolean {
    return allowlist.some((entry) => (typeof entry === 'string' ? url === entry : entry.test(url)));
  }

  return {
    errors: () => [...consoleEntries],
    badResponses: () => [...responses],
    assertClean(allowlist: Array<string | RegExp> = []) {
      if (consoleEntries.length > 0) {
        throw new Error(
          `Expected zero console.error/warn entries (INV-8), found ${consoleEntries.length}:\n${consoleEntries.join('\n')}`,
        );
      }
      const unexpected = responses.filter((response) => !isAllowed(response.url, allowlist));
      if (unexpected.length > 0) {
        throw new Error(
          `Expected zero unallowlisted >=400 responses (INV-8), found ${unexpected.length}:\n${unexpected
            .map((response) => `${response.status} ${response.url}`)
            .join('\n')}`,
        );
      }
    },
  };
}

/**
 * Next.js injects its own `<div id="__next-route-announcer__" role="alert">`
 * into every page for route-change announcements, so a bare
 * `page.getByRole('alert')` always matches one extra node that no product
 * form owns. INV-2 ("exactly one alert region per form") is about the app's
 * own alert regions, so specs assert against this locator instead.
 */
export function appAlerts(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}
