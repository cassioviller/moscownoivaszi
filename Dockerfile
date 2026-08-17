# syntax=docker/dockerfile:1
#
# A imagem de produção do Moscow Noivas — UM processo servindo a tela e a API.
#
# O sistema são dois pacotes de um monorepo pnpm: `artifacts/moscow-noivas` (a
# tela, React + Vite) e `artifacts/api-server` (Express 5 + drizzle sobre
# PostgreSQL). Eles são SEMPRE da mesma origem — o cliente gerado chama caminho
# relativo (`/api/…`) e ninguém no repositório chama `setBaseUrl` —, e é isso
# que faz o cookie de sessão (`httpOnly`, `SameSite=Lax`) chegar à API sem CORS.
# Por isso a imagem é uma só: o Express serve o `dist` do Vite (`FRONTEND_DIR`)
# na mesma porta em que atende `/api`.
#
# A base é DEBIAN, e não Alpine, por medição e não por gosto: o
# `pnpm-workspace.yaml` deste repositório remove dos overrides os binários musl
# (`@rollup/rollup-linux-x64-musl`, `@tailwindcss/oxide-linux-x64-musl`,
# `lightningcss-linux-x64-musl` estão como `'-'`), então em Alpine o `vite build`
# não teria o que carregar.

# ─────────────────────────────────────────────────────────────────────────────
# 1. A oficina — instala o workspace inteiro e constrói as duas metades.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS oficina

# O pnpm é PREGADO na versão que gerou o `pnpm-lock.yaml` (medida em 17/08/2026).
# `corepack enable` sozinho escolheria a versão que vier na imagem, e um pnpm de
# outra major recusa ou reescreve o lockfile — que é justamente o que
# `--frozen-lockfile` existe para impedir.
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app

# Os manifestos primeiro, e TODOS: o pnpm resolve o workspace inteiro, e um
# `package.json` de pacote ausente muda o grafo e derruba o `--frozen-lockfile`.
# Esta camada só se refaz quando uma dependência muda — o código não a invalida.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY artifacts/api-server/package.json      artifacts/api-server/
COPY artifacts/mockup-sandbox/package.json  artifacts/mockup-sandbox/
COPY artifacts/moscow-noivas/package.json   artifacts/moscow-noivas/
COPY lib/agenda-core/package.json           lib/agenda-core/
COPY lib/api-client-react/package.json      lib/api-client-react/
COPY lib/api-spec/package.json              lib/api-spec/
COPY lib/api-zod/package.json               lib/api-zod/
COPY lib/db/package.json                    lib/db/
COPY lib/financeiro-core/package.json       lib/financeiro-core/
COPY lib/funil-core/package.json            lib/funil-core/
COPY scripts/package.json                   scripts/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

# A tela. As duas variáveis são exigidas pelo `vite.config.ts` (ele lança sem
# elas): `BASE_PATH` vira o `base` do bundle e o `basename` do roteador
# (`App.tsx:357`) — `/` porque o domínio do EasyPanel serve a aplicação na raiz.
# O `PORT` daqui é só o do servidor de desenvolvimento do Vite, que não sobe na
# imagem; ele fica igual ao da API para não haver dois números na mesma casa.
RUN PORT=5002 BASE_PATH=/ NODE_ENV=production \
    pnpm --filter @workspace/moscow-noivas run build

# A API e o migrador, empacotados pelo esbuild (`build.mjs`). O pacote é
# AUTOSSUFICIENTE — medido: `dist/index.mjs` roda numa pasta sem `node_modules`
# —, e é por isso que a imagem final não carrega dependência nenhuma.
RUN pnpm --filter @workspace/api-server run build

# ─────────────────────────────────────────────────────────────────────────────
# 2. A imagem que roda — sem pnpm, sem código-fonte, sem dependência instalada.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:24-bookworm-slim AS producao

# `pg_dump` é dependência de RUNTIME, e não conveniência de operador: o botão
# "Fazer backup agora" da tela de administração o executa dentro do contêiner
# (`lib/backup.ts:88`). O cliente 17 lê servidor 16 e 17; o contrário não vale —
# o pg_dump recusa servidor mais NOVO que ele, e é por isso que não serve o
# `postgresql-client` 15 que o Debian bookworm traz por default.
#
# `gosu` é o que deixa o processo rodar como `node` mesmo com um volume montado
# por cima de `/app/backups`: o volume nasce de root, e quem o ajusta é o
# entrypoint, que então TROCA de usuário e sai da frente (sem supervisor no
# meio, para o SIGTERM chegar ao Node).
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl gnupg gosu; \
    install -d /usr/share/postgresql-common/pgdg; \
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
      -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc; \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list; \
    apt-get update; \
    apt-get install -y --no-install-recommends postgresql-client-17; \
    apt-get purge -y curl gnupg; \
    apt-get autoremove -y; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=oficina /app/artifacts/api-server/dist        ./dist
COPY --from=oficina /app/artifacts/moscow-noivas/dist/public ./public
# As migrações versionadas são LIDAS EM EXECUÇÃO pelo migrador do drizzle — elas
# são arquivo, não código, e por isso viajam soltas.
COPY --from=oficina /app/lib/db/migrations                ./migrations
# Os cinco PDFs que `GET /api/manuais/:qual.pdf` entrega (E236). Só os PDFs: a
# mesma pasta versiona o HTML de impressão de cada um (15 MB que servidor nenhum
# lê), e `caminhoDoManual` só monta `<qual>.pdf`.
COPY --from=oficina /app/docs/manuais/pdf/*.pdf           ./manuais/
# O caderno de papel do ateliê, empacotado (E272): 157 KB que viajam na imagem
# para a importação ser um comando no console, sem upload de arquivo. Como
# rodá-la está em `docs/deploy/importar-o-legado.md`.
COPY --from=oficina /app/docs/legado                      ./legado
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /app/backups \
    && chown -R node:node /app

# O que é decisão da IMAGEM fica aqui; o que é decisão da INSTALAÇÃO
# (`DATABASE_URL`, as senhas do seed, `CORS_ORIGINS`) entra pelo ambiente do
# EasyPanel e não tem default nenhum neste arquivo — de propósito.
ENV NODE_ENV=production \
    PORT=5002 \
    FRONTEND_DIR=/app/public \
    MIGRACOES_DIR=/app/migrations \
    MANUAIS_PDF_DIR=/app/manuais \
    LEGADO_DIR=/app/legado

# A porta é INTERNA: quem publica é o proxy do EasyPanel, apontado para 5002.
EXPOSE 5002

# O mesmo `/api/healthz` que a aplicação já servia antes deste arquivo existir
# (`routes/health.ts:6`) — sem sessão, sem tocar o banco: ele responde "o
# processo está de pé e atendendo", que é liveness. Prontidão de verdade é o
# `migrar` do entrypoint ter terminado, e ele termina ANTES de o servidor subir.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5002)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "--enable-source-maps", "dist/index.mjs"]
