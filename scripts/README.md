# @workspace/scripts

**`post-merge.sh`** — o que rodar depois de puxar código que mexeu no schema:
`pnpm install --frozen-lockfile` e `pnpm --filter db push`.

**`banco-virgem.ts`** — a régua da PRIMEIRA execução (S-D43):

```
cd artifacts/api-server && ./node_modules/.bin/tsx ../../scripts/banco-virgem.ts
```

Cria um banco descartável, aplica o schema, roda o seed, confere que o resumo
impresso descreve o que o banco guarda, sobe o `global-setup` do E2E e prova a
idempotência do seed — depois apaga o banco. **É a única régua que exercita o
ramo "banco vazio"**, que nenhuma das três suítes percorre porque todas rodam
contra o `DATABASE_URL` de sempre. Detalhes e quando rodar: `replit.md`.

Ela sai por `tsx` do `api-server` de propósito: este pacote não tem dependência
nenhuma além de tipos, e um script de régua não é motivo para ganhar uma.

**`capturar-telas.ts`** — a ferramenta de captura da revisão de design (S-D1),
contra um app JÁ de pé:

```
BASE_URL=http://localhost:5173 CAPTURAS_DIR=/caminho/absoluto/para/capturas \
  ./artifacts/api-server/node_modules/.bin/tsx scripts/capturar-telas.ts
```

(`tsx` direto, como o `banco-virgem`: o wrapper `pnpm exec` imprime um
`undefined` solto e o caminho do pacote no meio do resumo — medido na primeira
validação, 78 capturas em ~90 s.)

Lê as 27 rotas do manifest das capturas de 2026-07-30 (sobreponível com
`MANIFEST_ROTAS`), captura cada uma em `--claro`/`--escuro` (1280×800) e
`--390` (390×844), página inteira, com sessão do E2E (`e2e/.auth/admin.json`,
sobreponível com `STORAGE_STATE`) — e grava no manifest de saída o bloco
`ambiente` que faltou nas 81 originais (S-D2): navegador+versão, locale
**pt-BR fixada** (contexto e `--lang` — a rodada 7 capturou em en-US sem
saber), timezone America/Sao_Paulo, viewport, tema, data. As env obrigatórias
**falham alto**: o destino das 81 nasceu `undefined/` por env ausente.
Opcionais: `LOJA_ID` (troca o UUID embutido nas rotas), `NOIVA_TOKEN` (portal
da noiva; sem ele a rota vai para `falharam`), `PLAYWRIGHT_CHROMIUM_PATH`
(o mesmo do `playwright.config.ts`). O `@playwright/test` resolve do
`node_modules` da raiz, como nos specs de `e2e/`.

O pacote nasceu do template com um `src/hello.ts` que imprimia
`"Hello from @workspace/scripts"`, um `hello` no `package.json` e um `tmp/`
vazio. Três anos de scaffolding sobrevivendo ao lado de um script real — e o
`typecheck` do repo abria um `tsc` a mais por causa do arquivo de exemplo.
Ficou o que se usa.
