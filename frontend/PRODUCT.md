# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router, Server Components) frontend + AdonisJS backend that talks to Robinhood's official Trading MCP server over OAuth. Auth: Better Auth (email/password), backed by SQLite. Component library: HeroUI on Tailwind v4.

## Users

Nicolas and his family. Multiple people will log in with their own accounts (sign-up enabled, not a single seeded user) to view the same portfolio.

## Product Purpose

A personal investing dashboard that reads Nicolas's real Robinhood account (stocks/ETFs + crypto) through Robinhood's MCP and shows current balance, positions, cost basis, and return — at a glance, without opening the Robinhood app.

## Positioning

Unlike Robinhood's own app, this is a read-only, family-shared view of one portfolio, built on the official Agentic Trading MCP (not scraped/unofficial APIs) — so it reflects live account data without ever being able to place a trade.

## Operating Context

Backend holds the Robinhood OAuth session (one connected account, `node ace robinhood:login`) and exposes internal read-only endpoints (`/api/v1/balance`, `/api/v1/positions`). The Next.js app is the only public-facing surface; it calls the backend server-side, never from the browser. Currently local dev; user intends to eventually deploy (e.g. a VPS) so multiple family members can reach it from anywhere, not just the home network.

## Capabilities and Constraints

- Read-only: the backend's `callTool` guard only allows MCP tools prefixed `get_`; no order placement, ever.
- One Robinhood account is connected app-wide — all logged-in users see the same portfolio (not per-user brokerage connections). Per-user connections are explicitly out of scope for now.
- Auth is multi-user with self-service sign-up (family members create their own login).
- Numbers shown: total portfolio value, per-account balances, per-position quantity/avg cost/current price/market value/return %, for both equities and crypto.

## Evidence on Hand

Real, live data from the user's own Robinhood account via the connected MCP session (not sample/mock data) — verified balance and position-level data during development.

## Product Principles

1. Never write, only read — the app must be structurally incapable of placing/canceling trades.
2. Show real numbers or a clear error — never silently fall back to placeholder/mock data.
3. One shared portfolio, many viewers — auth gates who can see it, not whose account they see.
4. Keep the Robinhood-facing backend internal-only; the browser only ever talks to the Next.js app.

## Accessibility & Inclusion

No accessibility requirement stated beyond standard web defaults.
