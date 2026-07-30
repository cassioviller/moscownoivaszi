# @workspace/scripts

O que sobrou aqui é **`post-merge.sh`**: o que rodar depois de puxar código que
mexeu no schema — `pnpm install --frozen-lockfile` e `pnpm --filter db push`.

O pacote nasceu do template com um `src/hello.ts` que imprimia
`"Hello from @workspace/scripts"`, um `hello` no `package.json` e um `tmp/`
vazio. Três anos de scaffolding sobrevivendo ao lado de um script real — e o
`typecheck` do repo abria um `tsc` a mais por causa do arquivo de exemplo.
Ficou o que se usa.
