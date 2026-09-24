---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["app/login/page.tsx","middleware.ts"]
---

## Scope

Operate mode. Primary route `app/page.tsx` (the portfolio dashboard) plus its auth gate (`app/login/page.tsx`, `middleware.ts`) and shared chrome. Audience: Nicolas and family, logged in, checking real Robinhood balances/positions at a glance. Task: scan total value, per-account balance, and per-position return without friction. Proof/content: real live numbers from `/api/v1/balance` and `/api/v1/positions`. Constraint: read-only data, must stay legible with financial figures as the primary content — no decoration competing with numbers.

## Direction contract

**THESIS:** The portfolio as a Notion *page* — a title, a properties panel, and two database-table views — not a trading-terminal dashboard. Refuses both the neon-candlestick ticker cliché and the disguised version of it (one giant hero number with an accent glow); Notion itself never leads with a hero metric, it leads with a page.

**OWN-WORLD:** Notion's literal page anatomy, user-pinned: near-white `#ffffff` / near-black `#191111`→`#191919` grounds, no card-soup anywhere — 1px hairline dividers only. A page title (~40px, Inter, weight 700) sits where Notion's page title sits, left-aligned, with a small emoji-style icon glyph before it (a simple colored square, not a stock emoji). Directly under the title: a compact **properties block** — label/value pairs in a 2-column grid exactly like Notion page properties (11px uppercase tracked gray label on the left in a fixed-width column, value on the right, each row a hairline-separated row, values in tabular-mono for money). Below that: two **database table views** (Stocks & ETFs, Crypto) — real `<table>` column headers in 11px gray caps, 1px row dividers, row hover = flat gray fill (no shadow, no lift), a small colored-square "icon" per row showing the ticker's first letter (deterministic hue per symbol, Notion-tag style). One neutral gray scale plus a single accent (indigo `#6366f1`) for links, focus rings, and the primary button only. Red/green restricted to the return-% cell. System sans (Inter) throughout, one family, 1.125 scale ratio.

**STORY:** Log in → land on a page titled "Portfolio" → its properties panel gives the whole-account numbers at a glance (total value, cash, today's accounts) in the same breath as any other page fact, not a hero → scroll into the two database tables to scan individual positions, each row answering "how much, bought at what, worth what now, up or down how much."

**FIRST VIEWPORT:** Centered single-column content (max 760px), left-aligned, generous top padding like an empty Notion page. Slim workspace top bar above it (app name left, user menu right, 48px, bottom hairline only, no shadow). Then: icon + "Portfolio" title, properties block immediately below (this is the coverage for balances — sized as page properties, not a hero: values ~15px/tabular-mono, never larger than the title). Then the first database table starts within the first viewport's lower third. No hero imagery, no gradients, no big glowing number.

**FORM:** User-pinned world (Notion) + user-pinned component library (HeroUI); mode is Operate, request was precisely specified, so the concept-seed roll was skipped per new-work.md §3 ("never run the script for a local extension or a precisely specified narrow request"). No image generation tool is available in this harness, so the build is code-led by contract, not by drift.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

None outstanding — user confirmed Notion look + HeroUI directly in chat.
