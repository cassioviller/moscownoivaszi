---
name: Moscow Noivas app layout
description: Which of the two Moscow Noivas apps actually runs, and how the web artifact is wired.
---

# Moscow Noivas: which app is live

There are TWO complete apps in this repo:
- **Next.js app at repo root `app/`** (`next dev`, package `moscow-noivas@0.1.0`, Prisma client output `app/src/generated/prisma`). **This is the live app the user wants.**
- Vite + React app at `artifacts/moscow-noivas` + Express `artifacts/api-server` — the migration target, now **retired**.

The web artifact (`artifacts/moscow-noivas/.replit-artifact/artifact.toml`) dev command runs the Next.js app via an absolute path:
`bash -c 'cd /home/runner/workspace/app && npm run dev -- -p 25188 -H 0.0.0.0'`
(absolute path because the artifact workflow's cwd is NOT the repo root — a relative `cd app` fails).

**Why:** User explicitly chose the Next.js app ("Vite retired") on 2026-06-27. This contradicts `replit.md`, which still documents the Vite+Express architecture — treat replit.md as stale on this point until updated.

**How to apply:**
- After cloning/recovery, run `cd app && npx prisma generate` (client is gitignored) or the app crashes with a missing Prisma client.
- The artifact's `production` config still builds the Vite app (static) — that is INCONSISTENT with running Next.js. If the user wants to deploy, production must be switched to a Next.js build/serve.
- `app/` is currently untracked in git (not committed).
