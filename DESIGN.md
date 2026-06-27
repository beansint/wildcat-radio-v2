# Wildcat Radio v2 — Design System

> **What this is.** The visual design layer for the v2 product: the Wildcat Radio brand kit
> (assets in [`design-references/`](./design-references/)) turned into **buildable design tokens and
> rules**, mapped onto the product defined in [`EVOLUTION.md`](./EVOLUTION.md),
> [`README.md`](./README.md), and [`REFERENCE-pages-and-access.md`](./REFERENCE-pages-and-access.md).
> Read it to know *how the app should look* and *which brand asset belongs on which surface*.
>
> **What this is not.** A new product *layer* in the EVOLUTION sense — it adds no behavior. It is a
> derived reference (like `REFERENCE-pages-and-access.md`): when a layer changes the page surface,
> update the affected rows here. Provenance is tagged per row (vN.x).
>
> **Token conventions** follow the shadcn/ui + Tailwind `name` / `name-foreground` semantic-token
> model (the project's Next.js/Vercel stack — v2.0), so the `:root` / `.dark` blocks below drop
> straight into `globals.css`. UI quality bar follows the `ui-ux-pro-max` rule set (accessibility →
> touch → performance → style).

The station is **CIT-U Wildcat Radio** — the campus radio station of the **Cebu Institute of
Technology – University** (Cebu, PH). The brand is a collegiate-varsity sports identity (a snarling
bobcat mascot, a chunky athletic wordmark, school maroon-and-gold) adapted for a live audio product.
Two standing product laws govern every decision here:

- **The broadcast comes first** (v2.4) — nothing in the UI interrupts the listen; chrome recedes, the
  player and the live moment lead. (The skill's top anti-pattern for this product type is literally
  *"poor audio player UX"* — heed it.)
- **Speed first / mobile-first** (v1 lesson + v2.5) — the public site is mobile-first; anything
  tedious gets bypassed in reality, so the design defaults to the fast path.

---

## 1. Brand foundations

### 1.1 Logos → [`design-references/wildcat-radio-logos/`](./design-references/wildcat-radio-logos/)

| Asset | File | Use in the product |
|---|---|---|
| **Wordmark lockup** | [`logo-wordmark-lockup.png`](./design-references/wildcat-radio-logos/logo-wordmark-lockup.png) | Primary brand mark: gold athletic "WILDCAT / RADIO" with the bobcat head as the final "O". Landing hero, `/listen` header, broadcast overlays, OG/share image. Needs a dark or photographic backdrop. |
| **Mascot mark** | [`logo-mascot-mark.png`](./design-references/wildcat-radio-logos/logo-mascot-mark.png) | Standalone bobcat head. App icon / favicon / PWA icon, persistent-player avatar when no show art, booth-identity glyph, compact nav mark. |
| **CIT-U seal** | [`logo-citu-seal.png`](./design-references/wildcat-radio-logos/logo-citu-seal.png) | Institutional endorsement only — footer, About, media-kit/export headers (v2.6), legal pages (v2.7). Never the primary mark; it co-signs, the wildcat leads. |

The **logo + icon family** sheet
([`brand-logo-and-icons.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-logo-and-icons.jpg))
ships the mascot head in **two finishes** — full-color gold and **grayscale**. The grayscale mascot
is the brand's own muted variant; in-app it is the canonical **offline / station-rotation / disabled /
deactivated** state (see §1.6 dark register and §2.1).

### 1.2 Color → [`brand-color-palette.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-color-palette.jpg)

The kit specifies six values. These are the **source-of-truth primitives** — never use raw hex in
components; map them to the semantic tokens in §1.4.

| Primitive | Hex | Character |
|---|---|---|
| **Wildcat Gold** | `#ffdf01` | Primary brand / "live" / energy. |
| **Amber** | `#da9101` | Secondary gold; hover/pressed, fills on light. |
| **Maroon** | `#820001` | School color; primary dark-brand surface + danger. |
| **Deep Maroon** | `#630001` | Maroon shade; gradients, depth, footers. |
| **White** | `#ffffff` | Light surface / on-dark text. |
| **Ink** | `#151414` | Near-black; dark surface + body text on light. |

**Two public voices + one staff voice** (the brand uses the colors this way, not as light/dark of one
hue):
- **Maroon = "established / school"** — about, starting-soon, congrats, landing hero.
- **Gold = "loud / live / fun"** — tuned-in, word-of-the-day, requests, the LIVE badge.
- **Black + gold = "staff tools"** — confirmed by the staff polo merch; the `/mod` + `/studio` register.

### 1.3 Accessibility — contrast pairs (CRITICAL, `ui-ux-pro-max` §1)

Gold and amber are **bright** — they are *fills and large display type, not body text*. Verified
pairings (WCAG AA needs 4.5:1 for body, 3:1 for large/UI):

| Foreground → background | Ratio | Verdict |
|---|---|---|
| Ink `#151414` → Gold `#ffdf01` | ~14:1 | ✅ AAA — the way to put text on gold |
| Gold `#ffdf01` → Ink `#151414` | ~14:1 | ✅ AAA |
| Gold `#ffdf01` → Maroon `#820001` | ~10:1 | ✅ AAA — the wordmark/hero combo |
| White `#ffffff` → Maroon `#820001` | ~13:1 | ✅ AAA |
| White `#ffffff` → Deep Maroon `#630001` | ~15:1 | ✅ AAA |
| Maroon `#820001` → White `#ffffff` | ~13:1 | ✅ AAA — maroon as body/danger text on light |
| Amber `#da9101` → Ink `#151414` | ~6.6:1 | ✅ AA |
| **Gold `#ffdf01` → White** | **~1.1:1** | ❌ never — illegible |
| **Amber `#da9101` → White** | **~2.8:1** | ❌ body; ⚠ large only |

Rule: **gold/amber are never small text on white.** For text-on-gold use ink or maroon.

### 1.4 Semantic tokens (drop into `globals.css`)

shadcn/Tailwind `name` / `name-foreground` convention. **Light is the public-site default; the app
also ships a dark register (§1.6) — design both together** (`ui-ux-pro-max` `dark-mode-pairing`).
Brand maroon and the live state get dedicated tokens beyond the shadcn base.

```css
:root {
  /* brand primitives (source of truth) */
  --gold:        #ffdf01;
  --amber:       #da9101;
  --maroon:      #820001;
  --maroon-deep: #630001;
  --ink:         #151414;

  /* semantic — light / public site */
  --background:            #ffffff;
  --foreground:            #151414;
  --card:                  #ffffff;
  --card-foreground:       #151414;
  --popover:               #ffffff;
  --popover-foreground:    #151414;

  --primary:               #ffdf01;  /* gold — CTAs, active nav, badges */
  --primary-foreground:    #151414;  /* ink on gold (passes AAA)        */
  --secondary:             #820001;  /* school maroon surface           */
  --secondary-foreground:  #ffffff;

  --brand-maroon:          #820001;  /* hero / "school" surfaces        */
  --brand-maroon-foreground:#ffffff;
  --live:                  #ffdf01;  /* on-air badge / ● Live           */
  --live-foreground:       #151414;

  --muted:                 #f5f5f4;
  --muted-foreground:      #57534e;  /* AA on white                     */
  --accent:               #fff6cc;   /* pale gold hover wash            */
  --accent-foreground:     #151414;
  --destructive:           #820001;  /* school red doubles as danger (v2.3 strikes/bans) */
  --destructive-foreground:#ffffff;

  --border:                #e7e5e4;
  --input:                 #d6d3d1;
  --ring:                  #da9101;  /* amber focus ring — visible on light & gold */

  /* chart palette (v2.6 analytics) — brand-derived, colour-blind-safe ordering */
  --chart-1:#820001; --chart-2:#da9101; --chart-3:#151414;
  --chart-4:#a8763a; --chart-5:#5c5552;

  --radius: 0.875rem;   /* the brand is generously rounded (cards, pill chips) */
}
```

`primary` is gold because gold is the brand's call-to-action energy; `secondary`/`brand-maroon` carry
the school voice. **`--destructive` is intentionally maroon** — school red is already the brand's
warning color, so v2.3 strikes/mutes/bans read as on-brand danger.

### 1.5 Typography → [`brand-typography-hurme-geometric.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-typography-hurme-geometric.jpg)

The visual-identity font is **Hurme Geometric Sans 4** — **Black** for headings, **Regular** for body.

| Tier | Face | Where |
|---|---|---|
| **Display / wordmark** | Custom athletic-varsity letterform (the lockup) | Logo artwork only — not running text. |
| **Headings / UI emphasis** | Hurme Geometric Sans 4 **Black** (600–700) | H1–H3, badges, button labels, loud headlines. |
| **Body / UI** | Hurme Geometric Sans 4 **Regular** (400), labels 500 | Paragraphs, captions, fields, metadata. |

Web fallback if Hurme isn't licensed for the app — a geometric sans, validated against the skill's
music-product font mood (Poppins is its pick for entertainment/music):

```css
--font-sans: "Hurme Geometric Sans", "Poppins", "Montserrat", system-ui, sans-serif;
```

- Body **16px** minimum (avoids iOS auto-zoom), line-height **1.5–1.6**, measure **65–75ch** desktop /
  35–60ch mobile. Type scale: `12 · 14 · 16 · 18 · 24 · 32 · 48`.
- A **rounded geometric sans** (Quicksand/Comfortaa-like) appears on the broadcast-state overlays and a
  few social cards. Treat it as an **optional friendly display face for broadcast-state screens only**;
  keep all *product* UI on the Hurme stack for consistency.
- Use **tabular figures** for the on-air clock, listener counts, and analytics columns (prevents
  layout shift — `ui-ux-pro-max` `number-tabular`).

### 1.6 Dark register (`.dark`) — the broadcast-native mode

The brand's own broadcast surfaces are dark (ink "ended" screen, maroon "starting soon", the live
frame). Audio is often a low-light / night activity, so the app must pair a dark mode with the light
one — not invert it (`ui-ux-pro-max` `color-dark-mode`: desaturate, re-check contrast).

```css
.dark {
  --background:            #151414;
  --foreground:            #ffffff;
  --card:                  #1f1c1c;
  --card-foreground:       #ffffff;
  --popover:               #1f1c1c;
  --popover-foreground:    #ffffff;

  --primary:               #ffdf01;  /* gold stays the accent  */
  --primary-foreground:    #151414;
  --secondary:             #630001;  /* deep maroon surface     */
  --secondary-foreground:  #ffffff;

  --brand-maroon:          #630001;
  --brand-maroon-foreground:#ffffff;
  --live:                  #ffdf01;
  --live-foreground:       #151414;

  --muted:                 #292524;
  --muted-foreground:      #c4bdb8;  /* ≥3:1 secondary on dark  */
  --accent:                #3a2e00;  /* dim gold wash           */
  --accent-foreground:     #ffdf01;
  --destructive:           #b91c1c;  /* lift maroon for dark legibility */
  --destructive-foreground:#ffffff;

  --border:                rgba(255,255,255,0.12);
  --input:                 rgba(255,255,255,0.16);
  --ring:                  #ffdf01;
}
```

Modal/sheet scrim on either mode: **40–60% black** so foreground stays legible.

### 1.7 Pattern, voice & shape

- **Pattern** = the lowercase "wildcat" wordmark tiled & rotated, two colorways:
  [`brand-pattern-maroon.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-pattern-maroon.jpg)
  (tonal, dark surfaces) and
  [`brand-pattern-gold.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-pattern-gold.jpg)
  (amber-on-gold, energetic). *Texture only — low contrast, always behind content, never foreground.*
  The canonical hero composition is
  [`brand-cover-poster.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-cover-poster.jpg).
  *(A byte-identical export is kept as `brand-pattern-maroon-duplicate.jpg`.)*
- **Shape**: generously rounded (`--radius: 0.875rem`); the brand leans on pill chips and rounded
  cards (see the social templates and DJ nameplates).
- **Voice** ([`brand-about-statement.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-about-statement.jpg)):
  warm, casual, campus-insider — lowercase friendly headlines ("hello wildcat", "are you tuned in?"),
  Bisaya/Taglish flavor ("hatdog", "bangga sa balak"). Copy reads like a student org talking to peers,
  matching the v2.3 identity model and v2.5 derived-content posture.
- **Icons**: SVG set (Lucide), one stroke width, ≥44pt tap area, no emoji as *structural* icons.
  **Exception by design:** `🎙 <show>` (booth identity) and `🐾`/mascot glyphs are **brand content
  marks**, not UI controls — fine inside chat/nameplates, never as nav or settings icons.

---

## 2. Brand asset → product surface map

The kit ships ready-made screens for the exact moments the product needs. Each maps to a real route or
state in [`REFERENCE-pages-and-access.md`](./REFERENCE-pages-and-access.md).

### 2.1 Broadcast-state screens (the stream lifecycle)

These are the visual vocabulary for the v2.1 stream states and the v2.5 **global persistent player**
(it lives in the Next.js root layout and never unmounts — so every state below needs a consistent
look):

| Asset | Stream state | Surface |
|---|---|---|
| [`overlay-broadcast-starting-soon.jpg`](./design-references/wildcat-radio-brand-identitiy/overlay-broadcast-starting-soon.jpg) | Pre-show / scheduled (maroon) | Player + `/listen` pre-roll, driven by the v2.2 schedule. |
| [`template-social-live.jpg`](./design-references/wildcat-radio-brand-identitiy/template-social-live.jpg) · [`template-social-next-broadcast.jpg`](./design-references/wildcat-radio-brand-identitiy/template-social-next-broadcast.jpg) | **LIVE** | On-air look: gold `● Live` badge, wordmark, now-playing. Landing hero + player live state. |
| [`overlay-broadcast-ended.jpg`](./design-references/wildcat-radio-brand-identitiy/overlay-broadcast-ended.jpg) | Ended / off-air (ink, "thank you for tuning in") | Player + `/listen` when the episode auto-closes (v2.2 actual-time boundary). **Grayscale** mascot register. |
| [`overlay-live-stream-frame.jpg`](./design-references/wildcat-radio-brand-identitiy/overlay-live-stream-frame.jpg) | Live stream frame | Studio outbound overlay: `● Live`, wordmark, **per-DJ nameplates**, ticker, on-air clock (tabular figures). |

The third v2.2 state, **`STATION_ROTATION`** (unattended auto-DJ, renamed from `AUTODJ`), needs its
own treatment: reuse the **grayscale mascot + "on rotation"** label so a hosted live show reads
differently from automated playback at a glance.

### 2.2 DJ / roster identity → [`overlay-live-stream-frame.jpg`](./design-references/wildcat-radio-brand-identitiy/overlay-live-stream-frame.jpg)

The frame's **`🐾 DJ CHA` / `DJ NATZ` nameplates** are the visual form of v2.2 roster + booth identity:
- DJs are **roster entries, not accounts** — the nameplate renders the roster `streamer_name`. The gold
  pill + mascot glyph is the booth-identity chip.
- In `/studio` chat and the v2.4 inbox the booth posts as **`🎙 <show>`** (never a named person) — same
  gold/mascot chip.
- `/djs/[id]` profiles and show lineups (v2.5/v2.2) reuse the chip for credits.

### 2.3 Engagement templates → v2.4 surfaces

Public-facing twins of the in-app engagement features (under "enhance, don't clutter"):

| Asset | Maps to |
|---|---|
| [`template-social-song-requests.jpg`](./design-references/wildcat-radio-brand-identitiy/template-social-song-requests.jpg) | The `[+]` **requests / dedications / Q&A** entry on `/listen`; DJ inbox CTA. |
| [`template-social-tuned-in.jpg`](./design-references/wildcat-radio-brand-identitiy/template-social-tuned-in.jpg) | `/listen` welcome / empty-chat state (`empty-states`). Grayscale mascot = the "quiet room". |
| [`template-social-word-of-the-day.jpg`](./design-references/wildcat-radio-brand-identitiy/template-social-word-of-the-day.jpg) | The reusable **derived-content card** layout (v2.5) — charts, pins, announcements. |
| [`template-quote-card.jpg`](./design-references/wildcat-radio-brand-identitiy/template-quote-card.jpg) | Pinned-topic banner (v2.4) / dedication ("bati") display; on-air quote highlight. |
| [`template-social-congratulations.jpg`](./design-references/wildcat-radio-brand-identitiy/template-social-congratulations.jpg) | **Announcement with photo** (v2.5 hybrid-approval lifecycle) — the featured-announcement layout. |

### 2.4 Marketing / showcase

- [`brand-social-mockups.jpg`](./design-references/wildcat-radio-brand-identitiy/brand-social-mockups.jpg) — posts in a real feed; the consistent footer signature is **`f CIT-U Wildcat Radio` + CIT-U seal**. Reuse that dual signature in app footers and OG cards.
- [`merch-polo-front.webp`](./design-references/wildcat-radio-brand-identitiy/merch-polo-front.webp) · [`merch-polo-front-angle.webp`](./design-references/wildcat-radio-brand-identitiy/merch-polo-front-angle.webp) · [`merch-polo-back.webp`](./design-references/wildcat-radio-brand-identitiy/merch-polo-back.webp) — staff polo (black + gold, back: **"RADIO ENGINEER"**). Off-product, but it fixes the **black + gold staff register** used for `/mod` and `/studio` chrome.

---

## 3. Applying it to the page surface

Palette/voice tied to the role-scoped routes (v2.0–v2.7), following the brand's three registers.

| Surface | Register | Notes |
|---|---|---|
| `/` landing (v2.5, v2.1) | Maroon hero + gold | Cover-poster composition over maroon pattern; gold `● Live` badge; ▶ never needs an account. |
| `/listen` (v2.4, v2.3) | Gold/ink, live | Player leads; engagement chips gold; broadcast-state overlays §2.1; sign-in gate only at the interaction point. |
| `/schedule` `/shows` `/djs` `/charts` `/announcements` (v2.5, v2.2) | Maroon/gold public | Derived-content cards (§2.3); roster chips (§2.2); congrats layout for featured items. |
| `/login` · `/register` (v2.3) | Maroon/gold | Microsoft Entra (campus) + guest email; semantic input types; CIT-U seal present, wildcat leads. |
| `/profile*` `/notifications` (v2.0, v2.3, v2.6) | Light + gold accents | Receipts ("♪ queued!", "📣 read on air") as gold-accent toasts (`aria-live`, auto-dismiss 3–5s); standing/strikes use `--destructive` (maroon). |
| `/mod/*` `/admin/*` (v2.2, v2.3, v2.5, v2.6) | **Black + gold (staff)** | Data-dense; sidebar nav (`adaptive-navigation`); muted mascot; one primary CTA per view; every action audit-logged. |
| `/studio` (v2.2, v2.4) | Black + gold + live overlays | Broadcast PC: attendance mode → schedule; episode mode → console + §2.1/§2.2 overlays; booth chip everywhere. |
| Media kit / export (v2.6) | Maroon/gold + CIT-U seal | Sponsor/partner-facing; aggregate-only; chart palette §1.4; seal co-signs the header. |

---

## 4. Standing design rules

1. **Wildcat leads, CIT-U co-signs** — mascot/wordmark always primary; the seal endorses in footers,
   About, legal, media kits.
2. **Two public voices, one staff voice** — maroon = school; gold = live; black+gold = staff. Don't blur.
3. **Grayscale mascot = muted state** — off-air, station-rotation, disabled, deactivated.
4. **Gold/amber are fills, not body text** — fails contrast on white; use ink/maroon for text (§1.3).
5. **Pattern is texture** — low contrast, behind content, never foreground.
6. **The broadcast comes first** (v2.4) — player + live moment win every layout conflict; chrome recedes.
7. **Design light & dark together** (§1.6) — the broadcast surfaces are dark-native; re-check contrast,
   don't invert.
8. **Mobile-first** (v2.5) — bottom mini-player, bottom-sheet actions, Media Session lock-screen
   controls, safe-area insets, touch targets ≥44pt.
9. **One primary CTA per screen**; secondary actions visually subordinate.
10. **Campus-insider tone** — warm, lowercase, Taglish/Bisaya-friendly.

### Pre-build checklist (condensed from `ui-ux-pro-max`)
- [ ] Text contrast ≥4.5:1 (≥3:1 large) in **both** light and dark — verify against §1.3.
- [ ] No emoji as structural icons (Lucide SVG); 🎙/🐾 only as booth/brand content marks.
- [ ] Touch targets ≥44pt; visible focus ring (`--ring`); keyboard order = visual order.
- [ ] Player never unmounts on navigation; consistent state look across §2.1.
- [ ] `prefers-reduced-motion` respected; micro-interactions 150–300ms, `transform`/`opacity` only.
- [ ] Responsive at 375 / 768 / 1024 / 1440; no horizontal scroll; `min-h-dvh` not `100vh`.
- [ ] Images WebP/AVIF with width/height (no CLS); skeletons for >300ms loads.
- [ ] Semantic tokens only — no raw brand hex in components.

---

## 5. Asset index (relabelled)

Originals renamed from opaque CDN hashes to descriptive slugs. Folders:
[`design-references/wildcat-radio-logos/`](./design-references/wildcat-radio-logos/) ·
[`design-references/wildcat-radio-brand-identitiy/`](./design-references/wildcat-radio-brand-identitiy/).

**Logos:** `logo-wordmark-lockup.png` · `logo-mascot-mark.png` · `logo-citu-seal.png`

**Brand sheets:** `brand-logo-and-icons.jpg` · `brand-color-palette.jpg` ·
`brand-typography-hurme-geometric.jpg` · `brand-about-statement.jpg` · `brand-cover-poster.jpg` ·
`brand-pattern-maroon.jpg` (+`-duplicate`) · `brand-pattern-gold.jpg` · `brand-social-mockups.jpg`

**Broadcast overlays:** `overlay-broadcast-starting-soon.jpg` · `overlay-broadcast-ended.jpg` ·
`overlay-live-stream-frame.jpg`

**Social / content templates:** `template-social-live.jpg` · `template-social-next-broadcast.jpg` ·
`template-social-song-requests.jpg` · `template-social-tuned-in.jpg` ·
`template-social-word-of-the-day.jpg` · `template-social-congratulations.jpg` · `template-quote-card.jpg`

**Merch:** `merch-polo-front.webp` · `merch-polo-front-angle.webp` · `merch-polo-back.webp`

## Implementation notes / gotchas

- **`.wc-container` uses `padding-inline`, not the `padding` shorthand.** Under Tailwind v4,
  a `padding: 0 1rem` shorthand on `.wc-container` overrides the `py-*` utilities on the same
  element at equal specificity (source order), silently collapsing every section's vertical
  rhythm to 0. Keep it `padding-inline` so `py-8`/`md:py-14` on `.wc-container` sections apply.
- **Brand "wildcat" pattern is the `<BrandPattern>` component**
  (`src/components/brand/brand-pattern.tsx`), not the raster `brand-pattern-maroon.jpg`. It's an
  inline-SVG `<pattern>` with a true brick offset (renders in Poppins; swap to Hurme via one
  `@font-face`), kept low-opacity so the maroon gradient bleeds through for organic tone. Use it
  on maroon surfaces (landing hero, auth brand panes).
</content>
