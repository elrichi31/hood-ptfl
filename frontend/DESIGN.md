# Design

<!-- impeccable:design-schema 1 -->

## World

Notion's page anatomy, restyled onto HeroUI v3's token system (`app/globals.css` overrides `@heroui/react/styles`' CSS custom properties, unlayered so they win over the library defaults). Light + dark, toggled via `data-theme` on `<html>` (`components/ThemeToggle.tsx`), persisted to `localStorage`, defaulting to the OS preference on first visit. A blocking inline script in `app/layout.tsx` sets the attribute before paint — no flash.

## Palette

- `--background` / `--surface`: `#ffffff`
- `--foreground`: `#191919`
- `--surface-secondary` / `--surface-hover`: `#f7f7f5` / `#f2f1ee`
- `--muted` (secondary text, labels): `#9b9a97`
- `--border` / `--separator` (all dividers, 1px, no card shadows): `#e9e9e7`
- `--accent` (links, primary button, focus ring, page icon): `#2383e2`
- `--danger` / `--success` (return % only): `#e03e3e` / `#0f7b6c`
- Ticker chips: deterministic `oklch(0.55 0.12 <hash(symbol)>)` per row — see `tickerHue()` in `app/page.tsx`.

Dark (`[data-theme="dark"]`): background `#191919`, foreground `#e6e6e5`, surface-hover `#2a2a2a`, border `#2f2f2f`, accent `#529cca` (lightened for contrast on near-black), danger `#ff7369`, success `#4dab9a`.

## Type

Inter (`--font-inter`, via `next/font/google`) for everything except money/quantity figures, which use Geist Mono (`--font-geist-mono`) with `font-variant-numeric: tabular-nums` (`.font-figures` utility in `globals.css`). Page title 2.5rem/700; section labels 11px uppercase tracked gray; body/table 14px (`text-sm`).

## Components

HeroUI (`@heroui/react`, Tailwind v4, no Provider needed): `Form`, `TextField`, `Label`, `Input`, `FieldError`, `Button` (auth forms), `Avatar` + `Dropdown` (top-bar user menu), `Modal` (symbol enrichment). Position tables are plain semantic `<table>` styled with the same CSS variables — HeroUI's `Table` is a React Aria collection component built for sortable/selectable interactive tables; these are static read-only listings, so a native table was the leaner, equally-on-brand choice (still 100% HeroUI's palette/tokens).

`Card` (`components/Card.tsx`) is hand-rolled, not `@heroui/react`'s: HeroUI's default `Card` ships a ~32px radius and no border (it relies on `shadow-surface`, which is `--surface-shadow`, zeroed out globally for the flat look) — invisible on a same-color page background. Ours: `border border-[var(--border)] bg-[var(--surface)] rounded-[var(--radius)] p-5`, optional uppercase-label title, same tokens as everything else.

`--radius` / `--field-radius`: `0.375rem` (tighter than HeroUI's 0.5rem default, closer to Notion's chrome).

## Layout — dashboard grid (revised; was single-column)

The first pass was a literal single-column Notion "page" (`max-w-[760px]`, no cards, hairline dividers only). The user explicitly rejected that: "todo muy amontonado hacia abajo... hazlo mas como un dashboard donde esten cards." This is a structural pivot the user asked for directly, not a taste call made unilaterally — `craft-floor.md`'s default ban on card-grid scaffolds is earned back by an explicit request. The palette, type, and every data-visualization decision carried over unchanged; only the composition changed, from a stacked "page" to a real dashboard.

- `max-w-[1280px]`, `<Card>` everywhere — no bare hairline sections left at the page level.
- Row 1: 4 stat cards (`grid-cols-2 lg:grid-cols-4`) — Total value, Cash, Realized P&L, Accounts.
- Row 2: Value-over-time chart (`lg:col-span-8`) + Allocation (`lg:col-span-4`).
- Row 3: Accounts list (`lg:col-span-4`) + Top movers (`lg:col-span-8`).
- Row 4: Concentration, full width (needs the horizontal room for 8-9 bars).
- Row 5: Stocks & ETFs, Crypto, Recent orders — each its own full-width card (a 6-column table needs the width; forcing it into a half-width card would just reintroduce the horizontal-scroll problem the mobile fix already solved once).
- Below `lg` (1024px), every grid collapses to 1–2 columns; verified no horizontal overflow at 375px.
- Position tables keep their own `overflow-x-auto` wrapper sized to the *card's* padding (`-mx-5 px-5`, was `-mx-6 px-6` against the page's own padding) — same mobile-scroll fix, now scoped to the card instead of the page.

## States

Table rows: `hover:bg-[var(--surface-hover)]`. Auth forms: inline field errors (`FieldError`), a page-level error line, disabled+"..." button label while submitting. Dropdown/menu keyboard nav and focus rings come from React Aria (HeroUI's base).

## Chart

`components/PortfolioChart.tsx` — single-series line chart (total portfolio value from `/api/v1/history`, one point every 5 min, see backend `app/services/poller.ts`). Hand-rolled inline SVG, no charting library: one series doesn't need one. Follows the dataviz skill's marks spec — 2px round-cap line, ~10% opacity area wash, 4px end-dot with a surface-color ring, hairline recessive reference lines at min/max (direct-labeled, no full axis — the series is too short-lived yet for clean-number ticks), crosshair + value/date tooltip on hover, single series so no legend box. `<2` points (fresh install) shows a "Collecting data" line instead of a one-dot chart. Accent color validated colorblind-safe via the dataviz skill's `validate_palette.js`.

## Analysis charts

`components/AnalysisCharts.tsx` exports three independent chart components (`AllocationChart`, `TopMoversChart`, `ConcentrationChart`), each now living in its own `<Card>` in the grid rather than stacked in one shared section. Amplifies the system's own rectangular/bar vocabulary rather than introducing a foreign shape (no donuts/pies — this page is built from tables, hairlines, and a line chart; a circle would clash):

- **Allocation** — one segmented horizontal bar (Stocks/Crypto/Cash), 2px surface-color gaps between segments (mark spec), legend below (required — 3 series). New categorical token `--crypto` (`#c9750f` light / `#b8791f` dark), validated against `--accent` with the dataviz skill's `validate_palette.js` in both modes (CVD + contrast, all pass).
- **Top movers** — two columns (Gainers/Losers, stacks on mobile), magnitude bars in `--success`/`--danger`, sorted, top 5 each, direct % label at the bar end.
- **Concentration** — top 8 positions by portfolio %, single flat `--accent` bars (magnitude via length only — no ramp needed), rest folded into "Other" per the dataviz anti-pattern rule against >7-slice categorical breakdowns.

All three are server-rendered (no client JS) — direct labels on every bar already satisfy "every value reachable without hovering," so no tooltip layer was added for these (unlike the line chart, which does have one).

## Navigation (politician trades was buried in the avatar menu)

`components/TopBar.tsx` now renders a visible 2-item nav (`Portfolio`, `Politician trades`) left-aligned in the top bar, active route in full-strength foreground text, inactive in `--muted`. Removed from the dropdown menu, which now only holds the email + sign out.

## Additional surfaces (exprimir el MCP)

- **Realized P&L** — its own stat card, colored like the return % cells.
- **Recent orders table** — same visual language as the position tables, read-only, in its own card.
- **Enrich on click** (`components/PositionsTable.tsx`, `SymbolModal`) — clicking an equity row (not crypto — Robinhood has no fundamentals for crypto) opens a `Modal` fetching `/api/symbol/:symbol` on demand, never preloaded for every row. Proxied through `app/api/symbol/[symbol]/route.ts` so the browser still never talks to the backend directly. Originally a flat label/value grid; the user asked for it to be more graphical, so it's now three meters in the AnalysisCharts bar language (2px track, `--success`/`--muted`/`--danger`, direct labels, no legend box needed since each is self-labeled): a 52-week range meter (marker = current price position between low/high), an RSI gauge (oversold/neutral/overbought zones, marker at the live value), and a stacked buy/hold/sell analyst-ratings bar with the price target's % upside colored like every other return figure on the page. Remaining facts (market cap, P/E, dividend yield, next earnings) stay a plain stat grid below a hairline — not every fact earns a chart.
- **Politician trades** (`/politician-trades`) — its own page, not mixed into the serious financial page; linked from the top-bar user menu. Own page also because it's ~1 MCP call per held ticker — not something to run on every dashboard load.

## Known gaps

No loading skeletons (server-rendered, data is ready before paint). No empty-state design beyond the chart's (every account currently has data or a clean `$0.00` row). No date-range filter on the chart — not worth it until weeks of history exist.
