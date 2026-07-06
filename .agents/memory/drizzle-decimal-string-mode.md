---
name: Drizzle decimal columns default to string mode
description: decimal()/numeric() Drizzle columns return JS strings by default, which breaks zod number validation; use mode:"number" instead.
---

Drizzle ORM's `decimal()`/`numeric()` column builders return values as JS
strings by default (to avoid floating-point precision loss), not numbers.
If application code (zod response schemas, arithmetic, `.toLocaleString()`,
etc.) expects a JS `number`, this causes runtime crashes (e.g. ZodError
"expected number, received string") on every route that selects such a
column.

**Why:** Discovered while porting a Next.js/Prisma app to Drizzle — Prisma's
`Decimal` type is often treated as a number at the JS boundary, so a
line-by-line port that keeps zod schemas expecting `number` breaks silently
until an e2e test hits the route.

**How to apply:** When defining decimal/numeric columns in a Drizzle schema
that will be validated against a zod `number()` field, add `{ mode: "number" }`
to the column builder (supported natively in drizzle-orm v0.45+). This
auto-stringifies on insert (`mapToDriverValue`) and auto-converts to number
on select (`mapFromDriverValue"). Prefer this over manual `.toString()` /
`Number(...)` conversions scattered across route handlers — those become
redundant/incorrect once `mode: "number"` is set, and should be removed.
Apply consistently across ALL decimal columns in the schema at once, since
missing even one column reintroduces the same class of bug on that resource.
