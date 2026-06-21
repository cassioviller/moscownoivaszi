# Multitenant B.1 — Identidade (login, sessão, logout)

**Data:** 2026-05-28
**Origem:** grill sobre "qual é a próxima fatia". A recomendação inicial (Disponibilidade do Vestido) foi descartada — o seed não cria Vestido/Lead/Bloqueio, logo a tela seria vazia, e qualquer fatia operacional pressupõe multitenant estruturado.
**Tipo:** primeira fatia de UI; estabelece o primitivo de identidade pra todas as fatias seguintes.
**Sub-fatia de:** Multitenant nível B (login + sessão + seleção de loja, sem RBAC). B.2 (multitenant) virá depois.

## 1. Problema

O app tem schema completo de multitenant (`Loja`, `Usuario`, `UsuarioLoja`, `Perfil` e `lojaId` em toda entidade de operação), mas **nenhuma identidade**: o admin seedeado (`admin@moscownoivas.local` / `admin123`) não tem como entrar no app. Sem isso, qualquer fatia operacional teria que ou hardcodar `lojaId` (dívida imediata) ou ser construída pra um único usuário invisível (refator quando o login chegar).

A fatia B.1 entrega o primitivo de **quem é o usuário e ele está autenticado** — sem ainda lidar com **qual loja** ele está operando (isso é B.2).

## 2. Decisões fechadas no grill

| # | Tema | Decisão |
|---|---|---|
| 1 | Stack de auth | **Rolar próprio** — cookie + sessão DB-backed + `bcryptjs`. Sem next-auth/lucia/better-auth. Razão: caso é email+senha puro; framework adicionaria abstração sem benefício, com risco de upgrade do Next quebrando. |
| 2 | Modelo de sessão | **DB-backed** (tabela `Sessao`), valor do cookie = `sessionId` opaco com 32 bytes de entropia. **Sem HMAC, sem JWT**: id forjado não existe no banco, então adulterar o cookie não dá acesso. |
| 3 | TTL | **8h absolute, sem rolling.** Produto de loja física; turno define a sessão. Máquina compartilhada → sessão eterna seria vazamento ambulante. Trade aceito: turno >8h relogar (5 segundos). |
| 4 | Cleanup | **Lazy** — `DELETE FROM Sessao WHERE usuarioId = ? AND expiraEm < now()` no login. Sem cron, sem dependência externa. |
| 5 | Cookie flags | `httpOnly`, `secure`, `sameSite: 'lax'`, `path: '/'`, `expires` espelhando `expiraEm`. |
| 6 | Mensagem de erro de login | **Genérica** — "Credenciais inválidas" (não revela se email existe). |
| 7 | Recovery / "esqueci a senha" | **Fora de escopo.** Spec da Base §2 ("YAGNI rigoroso"); MVP não pede. |
| 8 | Edição de perfil/senha pelo usuário | **Fora de escopo.** Idem. |
| 9 | CRUD admin de Lojas/Perfis/Usuários | **Fora de escopo.** Criação continua via seed/migration; o CRUD admin é fatia separada e fica melhor **depois** do RBAC pra já criar perfis com permissões reais. |
| 10 | Throttling / rate limit no login | **Fora de escopo.** MVP, app interno. Entra junto com hardening de produção. |

## 3. Abordagem

### 3.1 Schema — tabela `Sessao`

```prisma
model Sessao {
  id        String   @id                 // 32 bytes random, base64url — gerado em criarSessao()
  usuarioId String
  criadaEm  DateTime @default(now())
  expiraEm  DateTime                     // criadaEm + 8h

  usuario   Usuario  @relation(fields: [usuarioId], references: [id], onDelete: Cascade)

  @@index([expiraEm])                    // suporta cleanup eficiente
  @@index([usuarioId])                   // cleanup por usuário no login
}
```

Adicionar `sessoes Sessao[]` no model `Usuario`. Migration nova, sem `dev reset` (não destruir o admin seedeado).

### 3.2 Helpers em `src/lib/auth/`

Arquivos:
- `sessao.ts` — criar/buscar/destruir; geração de id; cleanup lazy.
- `senha.ts` — `verificarSenha(plain, hash)`; `gerarHash(plain)` (não usado pela UI agora, mas é o ponto único pra mexer custo do bcrypt depois).
- `cookie.ts` — nome do cookie, flags, `setCookie(sessao)`, `getCookie()`, `clearCookie()`.
- `index.ts` — barrel.

API conceitual:

```ts
// sessao.ts
export async function criarSessao(usuarioId: string): Promise<Sessao>
export async function getSessao(): Promise<{ sessao: Sessao; usuario: Usuario } | null>
export async function destruirSessao(sessionId: string): Promise<void>

// senha.ts
export async function verificarSenha(plain: string, hash: string): Promise<boolean>
export async function gerarHash(plain: string): Promise<string>

// cookie.ts
export const COOKIE_NOME = "moscow_sessao"
export async function setCookieSessao(sessao: Sessao): Promise<void>
export async function getCookieSessao(): Promise<string | null>
export async function clearCookieSessao(): Promise<void>
```

`getSessao()` lê o cookie, busca a sessão por id, verifica `expiraEm > now()`, e retorna `{ sessao, usuario }` ou `null`. Não estende, não revalida — TTL absolute.

### 3.3 Rotas (App Router, Next 16)

Estrutura proposta com route groups:

```
src/app/
  layout.tsx                       # shell mínimo (html, body, fontes)
  (public)/
    login/
      page.tsx                     # form (email, senha, botão)
      actions.ts                   # 'use server'; loginAction()
  (app)/
    layout.tsx                     # assertSessao() → redirect /login; passa user ao children
    page.tsx                       # "olá, {user.nome}" + form logout (Server Action)
    logout/
      actions.ts                   # 'use server'; logoutAction() → destrói + clearCookie + redirect
```

Convenções:
- Server Components por padrão; só o `<form>` da `/login` precisa de `useFormStatus`/`useActionState` se quisermos `pending` state — provavelmente sim.
- `loginAction` retorna `{ erro: string } | nunca` (em sucesso, `redirect('/')` — joga sem retorno).
- O layout `(app)` é o único ponto que chama `getSessao()` + `redirect('/login')`. Filhos confiam que `getSessao()` retorna não-null.

### 3.4 Segredos

Sem `AUTH_SECRET` necessário (não há HMAC). O único segredo é a senha do admin (já no seed). Adicionar `BCRYPT_COST` no `.env` é over-engineering — o `bcrypt.hash(_, 10)` do seed já está no padrão.

## 4. UI

A `/login` é a **primeira tela** do produto. O `impeccable` entra aqui pra estabelecer a linguagem visual:
- Centralizada, formulário compacto, sem barra de navegação (usuário ainda não pertence ao app).
- Mensagem de erro inline (sem toast — formulário pequeno, contexto local).
- Pending state no botão durante o request.
- Mobile-first (loja pode acessar do celular).

`/` (pós-login) é deliberadamente **mínima e feia** nesta fatia: serve só de prova-de-vida ("a sessão funciona, conheço o usuário"). B.2 reescreve essa rota pra redirect `→ /lojas` ou `→ /loja/[única]/...`.

## 5. Testes

Vitest cobre os helpers de `src/lib/auth/` (puros ou mockáveis):

- `senha.ts`: `verificarSenha` retorna `true` pra hash correto, `false` pra senha errada / hash inválido / senha vazia.
- `sessao.ts` (com Prisma real, na linha do `seed.test.ts`):
  - `criarSessao(usuarioId)` insere com `expiraEm ≈ now + 8h` (tolerância de segundos), `id` único de 32 bytes.
  - `getSessao()` retorna `null` se cookie ausente, se id inexistente, se `expiraEm <= now`.
  - `destruirSessao(id)` remove a linha.
  - Cleanup: ao criar sessão pra `usuarioX`, sessões expiradas do mesmo usuário são removidas.
- `cookie.ts` testado indiretamente pelas rotas no `verify` manual.

UI da `/login` é coberta pela checagem manual no `verify` (skill `verify` rodando `npm run dev` e logando com `admin@moscownoivas.local` / `admin123`).

## 6. Fora de escopo (esta fatia)

- **Seleção de loja, layout `/loja/[lojaId]/`, scoping multitenant** — fatia B.2.
- **RBAC** — depois de B.2.
- **CRUD admin, recovery, edição de perfil, rate limit, "lembrar de mim"** — ver decisões #7-#10 acima.
- **Polish visual além do necessário** — o `impeccable` entra na fatia, mas só na `/login`. A `/` pós-login é deliberadamente crua nesta fatia.
- **Email/notificação** — não há.

## 7. Docs a atualizar junto

- `docs/estado-atual.md` — após o REVIEW, registrar B.1 fechada e B.2 como próxima.
- `docs/workflow-skills.md` — bump do snapshot.

## 8. Critério de sucesso

1. Migration aplicada; `Sessao` existe com os índices.
2. `npm test` + `npx tsc --noEmit` verdes.
3. `npm run dev` + login com `admin@moscownoivas.local` / `admin123` funciona; redireciona pra `/`; mostra "olá, Admin"; botão logout invalida sessão e volta pra `/login`.
4. Cookie inspecionável no devtools com flags corretas (`HttpOnly`, `Secure` em prod, `SameSite=Lax`, `Expires` ≈ +8h).
5. Acessar `/` sem cookie → redirect pra `/login`. Acessar `/login` com cookie válido → redirect pra `/` (UX).
6. Tentativa de login com email inválido **ou** senha inválida mostra a mesma mensagem ("Credenciais inválidas").
7. Sessão criada há >8h é tratada como inválida (`getSessao()` retorna `null`).
