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

O pacote nasceu do template com um `src/hello.ts` que imprimia
`"Hello from @workspace/scripts"`, um `hello` no `package.json` e um `tmp/`
vazio. Três anos de scaffolding sobrevivendo ao lado de um script real — e o
`typecheck` do repo abria um `tsc` a mais por causa do arquivo de exemplo.
Ficou o que se usa.
