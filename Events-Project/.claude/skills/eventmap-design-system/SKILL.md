---
name: eventmap-design-system
description: The EventMap visual language approved in Nov/2026 (home hero, events gallery, map panel and map cards). Use whenever building or restyling any EventMap screen or component — pages, cards, sections, filters, popovers, empty/loading states — so new UI matches the published home and map.
metadata:
  origin: project
  approved: 2026-11-24
  reference: components/MyComponents/home/LuxuryHomePresentation.tsx, HeroDiscovery.tsx, HomeDiscoveryClient.tsx, MapEventCard.module.css
---

# EventMap design system

This is the look the owner approved for the public home (hero, gallery, feature cards, CTA banner) and the map discovery screen. Every new or restyled screen should read as part of the same product. Follow `.codex/frontend-agent.md` and `AGENTS.md` too; this skill only adds the visual rules.

## Foundations

- **Font:** Geist (already loaded). Never add another typeface.
- **Colors:** only the tokens in `app/globals.css`, written as `hsl(var(--token))`:
  - `--primary` / `--brand`: electric blue, for links, icons and the active segmented control.
  - `--cta` / `--cta-foreground`: lime with dark text, for the primary action, pills and decorations.
  - `--foreground`, `--card`, `--border`, `--muted-foreground`: surfaces and text.
  - **Light and dark are both required.** Check every new surface in both themes.
- **Radii:**
  - cards: `22px`;
  - large banners: `26–30px`;
  - inputs and search cards: `16–18px`;
  - pills, chips and buttons: `999px`;
  - small tiles: `14px`.
- **Shadows (layered, never one hard shadow):**
  - card: `0 1px 2px hsl(var(--foreground)/.04), 0 14px 34px -22px hsl(var(--foreground)/.22)`;
  - elevated card or popover: `0 2px 4px hsl(var(--foreground)/.05), 0 26px 48px -26px hsl(var(--foreground)/.3)`;
  - on dark surfaces: `0 1px 2px rgb(0 0 0/.3), 0 18px 40px -24px rgb(0 0 0/.6)`.
- **Borders:** 1px `hsl(var(--border))`, or primary at low opacity on hover or selection.

## Typography

- **Section and hero titles:** weight 700, `letter-spacing: -.035em`, line-height ~1.02, `text-wrap: balance`. The hero runs 44px on mobile up to ~86px on wide screens; sections run ~36–56px.
- **One highlighted word per title:**
  - It has a hand-drawn lime underline, an inline SVG that is `aria-hidden`, for example `<path d="M3 9C34 4 70 3 137 6M10 12c30-3 62-4 104-3" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" fill="none"/>` in `text-cta`.
  - Hero: the word is `--cta` with `-webkit-text-stroke: .75px hsl(var(--cta-foreground)/.14)` in light mode only.
  - Section titles in light mode: the word is `#4E7A00`, a dark lime chosen for contrast. In dark mode, and on dark banners, it is `--cta`.
  - Examples in production: "perto de você", "descobrir", "possibilidades", "lugar", "cidade", "mapa".
- **Eyebrow above a title:** a small primary-colored label with an 18×3px lime dash before it.
- **Body text:** `--muted-foreground`, 15–17px, line-height ~1.7.

## Components (reuse before inventing)

- **Event card** (gallery and map hover card):
  - Image: the full-bleed image on top, `object-fit: cover` anchored center-top, rendered through `HomeEventImage` so the fallbacks work.
  - Pills over the image: a lime category pill with an icon.
  - Paid highlights: always use the shared `FeaturedBadge` (`components/MyComponents/FeaturedBadge.tsx`), restyled through `className` if needed. Its accessible name says "patrocinado", and dropping it breaks transparency and `scripts/verify-promotions.cjs`.
  - Body: a date block ("26" over "NOV", primary-tinted tile), the title (max 2 lines), the address with a `MapPin` icon, a price chip or "Grátis" (hidden when unknown), and the lime "Ver detalhes →" button.
  - Hover: lift 2–4px and zoom the image ~4%, disabled under reduced motion.
  - Avoid nested links: the whole card is one link, or only the button is.
- **Map card anchored to a pin:**
  - Same body as the event card, with a white tail that blends into the card.
  - It opens above the pin when it fits, below otherwise. Content order never flips.
  - A "‹ 1/3 ›" pager sits in a dark translucent pill. Tilt ≤2°.
- **Search card:** one white card holding fields separated by thin vertical dividers. Each field has a small icon and a label above its value, and the big lime "Buscar eventos" button sits at the end.
- **Chips:**
  - Categories: pill, icon + label, 44px tall, horizontal scroll with scroll-snap on mobile. Show only categories that exist in the loaded events.
  - Periods: the active one is filled lime, the others are outlined.
- **Feature card:** an icon in a 52px rounded square (lime or primary), a title, one line of text and a "Link →" in primary.
- **Dark CTA banner:** `--foreground` background in light mode, an elevated card in dark mode. White title with the highlight in `--cta`, the lime button, and a decorative lime ring cut by the banner edge.
- **Stats bar:** a white rounded card with dividers, a primary icon per cell, and a bold number with a muted label.
- **Segmented control** (e.g. "Mapa | Lista"): pill container, active segment filled primary, `aria-pressed`.
- **Popovers and listboxes:** rounded-2xl, layered shadow, subtle border, hover and selected states in a soft primary/lime tint, full keyboard support (arrows, Enter, Esc) and closing on outside click. Never ship an unstyled native `<select>` dropdown in these screens.
- **Decorations:** organic lime blobs and rings (CSS/SVG, `aria-hidden`), clipped by the full-width section with `overflow: clip`. Never let them cause horizontal scroll, and lower their opacity to ~.3 in dark mode.

## Non-negotiable rules

- **No invented data.** Numbers, counts and labels come from real loaded data. Hide a cell or element when its value is 0 or unknown; never show placeholder figures like "2.000+".
- **Accessibility:**
  - `alt` and labels on everything;
  - visible `focus-visible`;
  - touch targets ≥44px;
  - contrast checked, which is why light mode uses the dark lime `#4E7A00` for highlighted words;
  - `aria-live` on pagers;
  - `prefers-reduced-motion` disables tilt animations, autoplay and zoom.
- **Motion:** short (≤200–320ms), opacity/scale/translate only. Nothing heavy on the map (AGENTS.md).
- **Privacy:**
  - Google Maps stays opt-in, behind the "Ativar Google Maps" consent card.
  - Geolocation is requested only on an explicit click.
  - Coordinates and the reverse-geocoded address live only in React state. Never put them in localStorage, the URL, the server or logs.
- **Responsive:** check 390, 768, 1024, 1440 and 1672px. No horizontal page scroll. Mobile stacks: copy, then card, then a 2×2 stats grid, and the map panel becomes the bottom sheet.

## How to verify a new screen

1. `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run test:offline`.
2. Render it locally against the disposable Postgres, never the production database, and capture screenshots at the widths above in both themes. The home scrolls inside an inner container, so scroll that element and not the window.
3. Compare against the published home and map before shipping.
