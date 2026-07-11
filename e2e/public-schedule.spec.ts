import { expect, test } from '@playwright/test';

// FE#5 public schedule golden path (AC-7): anonymous visitors see the weekly
// Time x Day grid, with the seeded "Afternoon Vibes" show (MON/WED/FRI
// 13:00-16:00) present, and no /mod chrome or auth redirect.

test('AC-7 golden: anonymous /schedule renders the weekly grid with Afternoon Vibes', async ({ page }) => {
  await page.goto('/schedule');

  await expect(page).toHaveURL(/\/schedule$/);

  const grid = page.getByTestId('schedule-grid');
  await expect(grid).toBeVisible({ timeout: 10_000 });

  const showCell = page.getByTestId('schedule-cell').filter({ hasText: 'Afternoon Vibes' });
  await expect(showCell.first()).toBeVisible({ timeout: 10_000 });
  // Mon + Wed + Fri => 3 filled cells for the seeded show.
  await expect(showCell).toHaveCount(3);
});
