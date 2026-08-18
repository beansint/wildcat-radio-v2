import { expect, test } from '@playwright/test';
import { WEB_BASE } from './_fixtures';

/**
 * Global player bar — regression guard for the redesign.
 *
 * The bar was rebuilt to be a quiet status shelf rather than the loudest
 * element on the page: soft #303030 instead of a near-black gradient, ~58px
 * instead of ~71px, a hairline shadow instead of a 34px plume that bled over
 * real content, and a 32px play disc inside a 44px hit area.
 *
 * These assert the *properties that carry the intent* (surface colour, height
 * ceiling, touch-target floor, no oversized shadow) rather than pixel-exact
 * values, so ordinary tweaks don't fail but a regression to the old heavy
 * treatment does.
 */

const PLAYER = '.wc-player';

test.describe('global player bar', () => {
  test('is a soft charcoal shelf, not a heavy near-black bar', async ({ page }) => {
    await page.goto(WEB_BASE);
    const player = page.locator(PLAYER);
    await expect(player).toBeVisible();

    const style = await player.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        shadow: cs.boxShadow,
        height: el.getBoundingClientRect().height,
      };
    });

    // #303030 — the SoundCloud-calibrated surface.
    expect(style.bg).toBe('rgb(48, 48, 48)');
    // The old build painted a linear-gradient; a flat surface is the point.
    expect(style.bgImage).toBe('none');
    // Old shadow was `0 -10px 34px`. Anything with a blur that large is a
    // regression — it smudged ~34px of dark up over page content.
    expect(style.shadow).not.toMatch(/\b(1[0-9]|[2-9][0-9])px\b/);
    // Was ~71px. Keep it under 64 so it reads as chrome, not a toolbar.
    expect(style.height).toBeLessThanOrEqual(64);
  });

  test('play control keeps a 44px touch target around a smaller disc', async ({ page }) => {
    await page.goto(WEB_BASE);
    const button = page.locator('[data-testid="player-play"]');
    await expect(button).toBeVisible();

    const box = await button.boundingBox();
    // Apple HIG / Material floor. Shrinking the *button* to 32px would have
    // failed this — only the visual disc shrank.
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    const disc = await button.locator('span').first().boundingBox();
    expect(disc!.width).toBeLessThan(box!.width);
  });

  test('meta text clears WCAG AA against the player surface', async ({ page }) => {
    await page.goto(WEB_BASE);
    const ratio = await page.locator(`${PLAYER} .sub`).evaluate((el) => {
      const lum = (rgb: number[]) => {
        const [r, g, b] = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const parse = (s: string) =>
        (s.match(/rgba?\(([^)]+)\)/)?.[1] ?? '0,0,0')
          .split(',')
          .slice(0, 3)
          .map((v) => parseFloat(v.trim()));
      // The sub-line is semi-transparent white; composite it over the bar.
      const cs = getComputedStyle(el);
      const fgRaw = parse(cs.color);
      const alpha = parseFloat(cs.color.match(/rgba?\([^)]*,\s*([\d.]+)\)/)?.[1] ?? '1');
      const bg = parse(getComputedStyle(el.closest('.wc-player')!).backgroundColor);
      const fg = fgRaw.map((c, i) => c * alpha + bg[i] * (1 - alpha));
      const l1 = lum(fg);
      const l2 = lum(bg);
      const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
      return (hi + 0.05) / (lo + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('publishes Media Session metadata for OS / lock-screen controls', async ({ page }) => {
    await page.goto(WEB_BASE);
    // Was scoped in FE#2 ("player shell + Media Session") and never built.
    // For a radio product this is the control surface that matters most —
    // the phone is in a pocket for most of a broadcast.
    // Metadata is published from an effect, so it lands after hydration —
    // sampling once right after goto() races it.
    await page.waitForFunction(() => Boolean(navigator.mediaSession?.metadata), null, {
      timeout: 10_000,
    });

    const ms = await page.evaluate(() => {
      const s = navigator.mediaSession;
      if (!s || !s.metadata) return null;
      return {
        title: s.metadata.title,
        album: s.metadata.album,
        artwork: s.metadata.artwork.length,
        playbackState: s.playbackState,
      };
    });
    expect(ms).not.toBeNull();
    expect(ms!.title).toBeTruthy();
    expect(ms!.album).toContain('Wildcat Radio');
    expect(ms!.artwork).toBeGreaterThan(0);
    expect(ms!.playbackState).toBe('paused');
  });

  test('spacebar toggles playback but never hijacks typing or a focused control', async ({
    page,
  }) => {
    await page.goto(WEB_BASE);

    const captured = (selector?: string) =>
      page.evaluate((sel) => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        if (sel) (document.querySelector(sel) as HTMLElement | null)?.focus();
        const e = new KeyboardEvent('keydown', {
          code: 'Space',
          key: ' ',
          bubbles: true,
          cancelable: true,
        });
        document.body.dispatchEvent(e);
        return e.defaultPrevented;
      }, selector ?? null);

    // Plain page: the shortcut applies.
    expect(await captured()).toBe(true);

    // A focused link or button must keep its own space behaviour — space
    // activates buttons, and stealing it would break the whole page.
    expect(await captured('a[href="/listen"]')).toBe(false);
    expect(await captured('[data-testid="player-mute"]')).toBe(false);

    // Typing must never be hijacked — this would eat spaces in the chat composer.
    const inTextField = await page.evaluate(() => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      const e = new KeyboardEvent('keydown', {
        code: 'Space',
        key: ' ',
        bubbles: true,
        cancelable: true,
      });
      input.dispatchEvent(e);
      const prevented = e.defaultPrevented;
      input.remove();
      return prevented;
    });
    expect(inTextField).toBe(false);
  });

  test('volume is desktop-only and the bar never scrolls sideways at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(WEB_BASE);
    await expect(page.locator(PLAYER)).toBeVisible();

    // The OS volume keys are one press away on touch; the slider would only
    // eat width on a 375px bar.
    await expect(page.locator('.wc-player-vol')).toBeHidden();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflows).toBe(false);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator('.wc-player-vol')).toBeVisible();
  });
});
