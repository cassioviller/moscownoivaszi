# O deploy em produção — Docker + EasyPanel

Este arquivo é o guia da instalação real: o que a imagem faz, o que o EasyPanel
precisa saber, e o que conferir antes de clicar em **Implantar**. O que ele
descreve foi medido em 17/08/2026, com o `docker build` e o contêiner rodando
contra um PostgreSQL de verdade — os números aqui são de execução, não de
intenção.

## 1. O que este sistema é, de verdade

| Pergunta | Resposta medida |
|---|---|
| Linguagem | TypeScript, em toda parte |
| Runtime | **Node 24** (o `.replit` fixa `nodejs-24`; a imagem usa `node:24-bookworm-slim`) |
| Gerenciador | **pnpm 10.26.1**, workspace com **11 pacotes** (`pnpm-workspace.yaml`) |
| Lockfile | `pnpm-lock.yaml` (268 KB), respeitado com `--frozen-lockfile` |
| Servidor | **Express 5** (`artifacts/api-server`), empacotado pelo esbuild em `dist/index.mjs` |
| Tela | **React 19 + Vite 7** (`artifacts/moscow-noivas`), `vite build` → `dist/public` |
| Banco | **PostgreSQL** por `pg` + **drizzle-orm** (`lib/db`) |
| Migrações | `lib/db/migrations` — **34 migrações versionadas** pelo `drizzle-kit generate` |
| Sessão | cookie `moscow_sessao` — `httpOnly`, `sameSite=lax`, `secure` quando `NODE_ENV=production` |
| Health check | **`GET /api/healthz`**, público, já existia (`routes/health.ts:6`) |
| Escrita em disco | **só** `backups/` (o `pg_dump` do botão de administração) |
| Fila, cron, worker, WebSocket, SSE | **não existem.** O único trabalho fora de requisição é o backup, e ele é disparado por gesto (botão) ou por chamada externa |
| Serviço externo | nenhum. Sem SMTP, sem S3, sem gateway de pagamento |

**Não há servidor de aplicação intermediário** (nada de gunicorn/pm2): o
processo Node É o servidor, e `app.listen(port)` do Express escuta em
`0.0.0.0` por default — confirmado no contêiner, que responde pela porta
publicada de fora.

**A tela e a API saem do MESMO processo, na MESMA porta.** Não é economia de
contêiner: o cliente gerado chama caminho relativo (`/api/…`) e ninguém no
repositório chama `setBaseUrl`, então same-origin é o que faz o cookie de
sessão chegar à API sem CORS e sem `SameSite=None`. O Express serve o `dist` do
Vite quando `FRONTEND_DIR` aponta para ele (a imagem aponta).

## 2. Os arquivos que este deploy trouxe

| Arquivo | O que faz |
|---|---|
| `Dockerfile` | Build em dois estágios: oficina (pnpm + vite + esbuild) → imagem de produção (Node + `pg_dump`, sem `node_modules`) |
| `.dockerignore` | Tira 7 GB do contexto — `.claude` (4,7 GB de worktrees), `.local`, `.cache`, `node_modules`, `.git` — e **todo `.env`** |
| `docker-entrypoint.sh` | Aplica as migrações, ajusta o dono do volume de backups e troca para o usuário `node` |
| `artifacts/api-server/src/scripts/migrar.ts` | O migrador de produção: drizzle migrator + os extras de SQL, sem `drizzle-kit` e sem `tsx` |
| `artifacts/api-server/src/__tests__/varredura-do-conteiner.test.ts` | A régua que impede a imagem de envelhecer calada |
| `artifacts/api-server/src/scripts/importar-legado.ts` + `docs/legado/*.json` | O caderno de papel do ateliê, para importar depois da primeira subida — ver [`importar-o-legado.md`](importar-o-legado.md) |
| `docs/migracoes/2026-08-17-e271-perfil-proprietario.sql` | Só para bases que já existiam: o perfil `Proprietária` vira `Proprietário`. **A instalação nova já nasce certa** |

E três mudanças pequenas no sistema, todas exigidas pelo contêiner:

- `app.ts` — serve a tela quando `FRONTEND_DIR` está posto (e **falha na subida**
  se o caminho não tiver `index.html`), e acrescenta `blob:` ao `img-src` do
  CSP, porque a pré-visualização da foto do vestido usa `URL.createObjectURL`;
- `index.ts` — trata `SIGTERM`/`SIGINT`: para de aceitar conexão, espera o que
  está em voo, fecha o pool. Sem isso, o `SIGTERM` de todo redeploy seria
  ignorado (Node não tem tratador default) e o contêiner morreria de `SIGKILL`
  com requisição no meio. Medido: `docker stop` leva **316 ms**;
- `build.mjs` — a segunda entrada do esbuild (o migrador).

## 3. Serviço no EasyPanel

| Campo | Valor |
|---|---|
| Projeto | `moscow` |
| Serviço | `app` (o nome sugerido; o host interno vira `moscow_app`) |
| Tipo | **App** |
| Source | o repositório Git deste projeto, branch `main` |
| Build | **Dockerfile**, arquivo `Dockerfile`, context `.` |
| Target/Internal Port | **5002** |
| Published Port | **não configurar** — quem publica é o proxy |
| Réplicas | **1** (ver §9) |

**Domínio**: EasyPanel → serviço `app` → **Domains** → *Add Domain* → o domínio
desejado, **Target Port `5002`**, HTTPS/Let's Encrypt ligado. O caminho é
`Internet → HTTPS → proxy do EasyPanel → moscow_app:5002`.

## 4. As variáveis de ambiente

**Obrigatórias** — sem elas o contêiner não sobe (o entrypoint recusa sem
`DATABASE_URL`) ou sobe inseguro:

| Variável | Valor | Por quê |
|---|---|---|
| `DATABASE_URL` | `postgres://postgres:SENHA@moscow_moscow:5432/moscow?sslmode=disable` | O **único** nome que a biblioteca de banco lê, e isso é invariante escrito no código (`lib/db/src/index.ts:9-19`). `sslmode=disable` porque o PostgreSQL do EasyPanel não fala TLS na rede interna e o `pg` não tenta TLS sem pedido — o parâmetro é explícito, não mágico |
| `SEED_PROPRIETARIO_EMAIL` | o e-mail do superadministrador | **Sem ela o sistema nasce com `admin@moscownoivas.com`** |
| `SEED_PROPRIETARIO_SENHA` | uma senha forte | **Sem ela o sistema nasce com `admin123`** e o log grita isso na subida |
| `SEED_PROPRIETARIO_NOME` | `Renato Nascimento de Brito` | O nome que aparece na tela e no rastro de quem fez cada coisa. **Desde o E271 este é o default** — a variável só é necessária para instalar em nome de outra pessoa |

**Opcionais** — só se você quiser mudar o default:

| Variável | Default | Quando mexer |
|---|---|---|
| `PORT` | `5002` (posto na imagem) | Só se o EasyPanel exigir outra porta interna |
| `NODE_ENV` | `production` (posto na imagem) | Nunca. É o que faz o cookie de sessão sair `Secure` |
| `LOG_LEVEL` | `info` | `debug` para investigar; o log é JSON no stdout |
| `CORS_ORIGINS` | vazio | Só se um cliente de OUTRA origem for falar com esta API. Vazio = nenhuma origem cruzada é aceita, que é o certo aqui |
| `MIGRAR_NA_SUBIDA` | `true` | `false` separa a migração do deploy (§6) |
| `SEED_LOJA_*` | os dados do contrato de São José dos Campos | Só numa instalação de OUTRA loja |
| `SEED_EXEMPLOS_FINANCEIROS` | `true` | `false` nasce sem escada de comissão e sem as 4 recorrências |
| `SEED_IPCA_EXEMPLO` | `false` | **Não ligue.** Índice de exemplo vira mora cobrada como fato (E242) |

**Não existe** `DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USER`/`DB_PASSWORD` neste
sistema, e inventá-las seria mudar a arquitetura de conexão sem necessidade: a
biblioteca lê `DATABASE_URL` e só. A senha entra montada dentro dela, no
ambiente do serviço — nunca em arquivo.

## 5. O banco

| Campo | Valor |
|---|---|
| Serviço | `moscow` (PostgreSQL) no projeto `moscow` |
| Host interno | `moscow_moscow` |
| Porta interna | `5432` — **sem publicação** |
| Banco | `moscow` |
| Usuário | `postgres` |

A porta 5432 fica na rede interna do projeto. O app a alcança pelo nome do
serviço; a internet, não.

## 6. As migrações

**O que roda, e quando:** o entrypoint chama `node dist/migrar.mjs` **antes** de
o servidor subir, em toda subida. Ele:

1. aplica as migrações versionadas ainda não aplicadas (o drizzle guarda o
   aplicado em `drizzle.__drizzle_migrations`);
2. aplica os extras de SQL que o drizzle não gerencia — as extensões
   `btree_gist` e `pg_trgm`, a `CHECK` da reserva e a `EXCLUDE` que impede dois
   bloqueios do mesmo vestido se sobreporem, tudo com `IF NOT EXISTS`.

**Por que é seguro:** não há `DROP`, não há `--force`, não há reset. Rodar duas
vezes é rodar uma — medido: a segunda subida contra o mesmo banco imprime
"migrações em dia" e não toca em nada. Se a migração falhar, **o servidor não
sobe** — que é a diferença entre "o deploy não subiu" e "o deploy subiu e a
primeira tela dá 500".

**Que ele produz o schema certo não é promessa, é medição.** Dois bancos
virgens, um provisionado pelo migrador e outro pelo `drizzle-kit push` (o
caminho do desenvolvimento, que a régua do banco virgem exercita), foram
comparados coluna a coluna: **506 colunas, 120 índices, 174 constraints e 22
enums idênticos**, zero diferenças. A única diferença é a tabela de controle do
próprio migrador.

**Quem quiser separar** a migração do deploy põe `MIGRAR_NA_SUBIDA=false` e roda
`node dist/migrar.mjs` pelo console do serviço, numa janela combinada.

**A primeira subida também configura a loja.** Com o banco vazio (nenhum
usuário), o servidor aplica a configuração inicial: 5 perfis, a conta do
proprietário, 3 cabines, o horário, 9 atributos de catálogo com 66 opções, a
escada de comissão e 4 recorrências. **Um banco em uso nunca é tocado na
subida** — a guarda é "existe algum usuário?".

## 7. Volumes

**Um, e só um:**

| Mount Path | Por quê |
|---|---|
| `/app/backups` | O botão *Fazer backup agora* roda `pg_dump` DENTRO do contêiner e grava aqui (`lib/backup.ts:19`). Sem volume, todo redeploy apaga os dumps e a tela de administração passa a listar arquivos que não existem |

O volume nasce pertencendo a root; o entrypoint o entrega ao usuário `node`
antes de trocar de usuário. Medido: o dump gravado pelo contêiner sai com dono
`1000:1000` e o download pela tela devolve os mesmos 15.391 bytes.

Nada mais é escrito em disco. As fotos dos vestidos vivem no banco, os PDFs de
contrato são gerados na hora, e os cinco manuais em PDF são versionados dentro
da imagem (`/app/manuais`).

## 8. Health check

| Campo | Valor |
|---|---|
| Caminho | `/api/healthz` |
| Porta | `5002` |
| Intervalo | 30 s, timeout 5 s, 3 tentativas, 40 s de carência na subida |

É **liveness**: responde `{"status":"ok"}` sem sessão e sem tocar o banco.
**Prontidão (readiness) não precisa de rota**, e é de propósito: as migrações
terminam antes de a porta abrir, então "a porta responde" já significa "o
schema está aplicado". A imagem traz o mesmo teste como `HEALTHCHECK`.

## 9. O que conferir antes de clicar em Implantar

1. **Troque a senha do PostgreSQL.** Ela apareceu num print e numa conversa;
   trate-a como vazada. EasyPanel → serviço `moscow` → alterar a senha → e
   atualizar a `DATABASE_URL` do app.
2. **Cadastre `SEED_PROPRIETARIO_EMAIL` e `SEED_PROPRIETARIO_SENHA` ANTES da primeira
   subida.** Depois da primeira subida o banco tem usuário, o seed nunca mais
   roda, e trocar a conta do proprietário passa a ser trabalho de tela.
3. **O dinheiro que o seed cria é EXEMPLO, e a loja corrige no primeiro dia.**
   Com `SEED_EXEMPLOS_FINANCEIROS=true` (o default, e o recomendado) a
   instalação nasce com a ESTRUTURA financeira de pé: quatro contas fixas —
   aluguel R$ 4.500, energia R$ 380, internet R$ 180 e a quarta —, que somam
   R$ 5.710/mês, e a escada de comissão 5% / 6% / 7% + R$ 500. **Os números são
   exemplo; a estrutura é que não é** — sem eles a projeção de caixa mente por
   omissão, mostrando a entrada da noiva e escondendo o aluguel. Corrija os
   valores em *Financeiro → Folha* e *Comissão* antes de fechar o primeiro mês.
   Quem preferir começar do zero põe `SEED_EXEMPLOS_FINANCEIROS=false` e
   cadastra as quatro na tela.
4. **Réplicas = 1.** O rate-limit de login é por processo, o backup grava num
   disco só, e duas réplicas subindo juntas rodariam migração ao mesmo tempo.
5. **A primeira subida é a mais lenta**: o build instala o workspace inteiro e
   constrói a tela (~20 s de Vite) e a API. As subidas seguintes reaproveitam a
   camada de dependências enquanto o `pnpm-lock.yaml` não mudar.
6. **HTTPS é obrigatório**, não opcional: com `NODE_ENV=production` o cookie de
   sessão sai `Secure` e o navegador não o guarda em HTTP. Se o domínio subir
   sem certificado, ninguém consegue entrar.
7. **O `pg_dump` da imagem é o 17.** Ele lê servidor 16 e 17; se o PostgreSQL do
   EasyPanel for **18 ou mais novo**, o botão de backup falha com *server
   version mismatch* e o cliente da imagem precisa subir junto.

## 10. Testar localmente

O build não precisa de rede interna nenhuma:

```sh
docker build -t moscow-app .
```

Para rodar, o contêiner precisa de um PostgreSQL que ele alcance — **`moscow_moscow`
só existe dentro do EasyPanel**. Com um Postgres na sua máquina:

```sh
# 1. um banco vazio para a instalação nascer nele
createdb moscow_local

# 2. o contêiner, com o banco do HOST (Linux: --network host resolve o
#    endereço; no Docker Desktop use host.docker.internal)
docker run --rm -p 5002:5002 \
  -e DATABASE_URL='postgres://postgres:SENHA@host.docker.internal:5432/moscow_local' \
  -e SEED_PROPRIETARIO_EMAIL='voce@exemplo.com' \
  -e SEED_PROPRIETARIO_SENHA='uma-senha-forte' \
  -e SEED_PROPRIETARIO_NOME='Renato Nascimento de Brito' \
  -v moscow-backups:/app/backups \
  moscow-app
```

Depois: `curl http://127.0.0.1:5002/api/healthz` responde `{"status":"ok"}`, e
`http://127.0.0.1:5002/` abre a tela de login. **Em HTTP o login não guarda o
cookie** (ele sai `Secure`): para exercitar a sessão localmente, acrescente
`-e NODE_ENV=development` — e só localmente.

## 11. O que foi medido, e não afirmado

Tudo abaixo rodou em 17/08/2026, nesta árvore:

| Verificação | Resultado |
|---|---|
| `docker build` | verde, imagem de **369 MB** |
| Contêiner contra banco virgem | migrações → configuração inicial → `Server listening` na 5002 |
| Contêiner contra banco já provisionado (o redeploy) | migrações em dia, seed **não** roda, login segue valendo |
| `GET /api/healthz` | 200 `{"status":"ok"}` |
| `GET /` e rota funda do SPA | 200 `text/html`, com `Cache-Control: no-cache` no HTML e `max-age=31536000` nos assets com hash |
| `POST /api/auth/login` | 200, cookie `HttpOnly; Secure; SameSite=Lax` |
| `GET /api/manuais/proprietario.pdf` | 200, `application/pdf`, 3.499.033 bytes |
| Backup pelo botão | `pg_dump` dentro do contêiner, 15.391 bytes no volume, dono `1000:1000` (não-root), download 200 |
| `docker stop` | **316 ms** (com o tratador de `SIGTERM`; sem ele seriam os 10 s do prazo) |
| Migrador contra `drizzle-kit push` | 506 colunas · 120 índices · 174 constraints · 22 enums — **idênticos** |
| Segredo na imagem | nenhum `.env`, nenhuma credencial; toda conexão vem do ambiente |
