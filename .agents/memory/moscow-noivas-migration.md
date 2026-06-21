---
name: Moscow Noivas migration
description: Key decisions and gotchas from migrating this Next.js app to Vite+React+Express on Replit
---

## Vite proxy setup
Add `server.proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } }` to vite.config.ts. Use plain `/api` as the key (not `${basePath}/api`).

**Why:** basePath is `/` in this setup; the compound key broke the proxy match.

## Old Next.js files in src/
The migration left `src/app/**`, `src/lib/**`, and several `src/components/**` directories from Next.js. They import `next/link`, `next/navigation`, `@/generated/prisma/client`. Exclude them in tsconfig.json `exclude` array.

**Why:** Vite/tsc picks them up during typecheck and fails on missing next/* modules.

## UsuarioLoja table has no updatedAt
Schema has only `usuarioId`, `lojaId`, `perfilId`. Do not include `updatedAt` in inserts.

## Seed route
POST `/api/seed` — idempotent, creates: perfis (perfil-admin/vendedora/recepcao), super admin (`admin@moscownoivas.com` / `admin123`), one demo loja (`loja-demo` / "Moscow Noivas SP"), and links super-admin to it via UsuarioLoja.

## Port mapping
- API: port 8080 → external 80 (primary preview)
- Vite dev server: port 25188 → external 3000

## Design tokens (Tailwind v4 @theme)
`papel`, `papel-elevado`, `borda`, `borda-suave`, `cinza-fumo`, `grafite`, `tinta`, `bordo`, `champagne`, `papel-suave`, `rose-dust` — all defined in `artifacts/moscow-noivas/src/index.css` `@theme {}` block using oklch.

**Why:** Matches the original Next.js globals.css exactly. Components use `bg-papel`, `text-tinta`, `border-borda`, etc.

## Geist fonts
Loaded via Google Fonts CDN in index.html (not Next.js font system). Family names: "Geist Sans", "Geist Mono", "Cormorant Garamond".
