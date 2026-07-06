# Multitenant B.2-T1 — Loja ativa na sessão + seletor adaptativo

**Data:** 2026-05-28
**Fatia pai:** Multitenant nível B.2 (seleção de loja + scoping `/loja/[lojaId]/...`).
**Posição na B.2:** T1 (caminho crítico). T2 (`tenantPrisma`) já entregue, inerte sem T1.
**Próxima task depois desta:** B.2-T3 (rotas `/loja/[lojaId]/...` + dashboard scoped consumindo `tenantPrisma`).

---

## 1. Objetivo

Habilitar **uma loja ativa por sessão**, de forma que toda fatia operacional futura (B.2-T3+) possa chamar `tenantPrisma(prisma, sessao.lojaAtivaId)` com a certeza de que `lojaAtivaId` existe, é válida, e pertence ao usuário logado.

A entrega:
1. Adiciona `lojaAtivaId` à `Sessao` (nullable, FK pra `Loja`).
2. Cria rota `/selecionar-loja` com comportamento **adaptativo**: usuário com 1 loja é auto-selecionado e redirecionado; usuário com >1 loja escolhe.
3. Reforça o layout protegido: sem `lojaAtivaId`, redireciona pra `/selecionar-loja`.

Não migra rota nenhuma pra `tenantPrisma` (isso é T3). Não introduz UI de troca de loja (fora de escopo — fatia futura).

---

## 2. Contexto

### Métrica de produto que esta fatia move

**TTOL — Time To Onboard a Loja**. Sem `lojaAtivaId`, qualquer fatia operacional precisaria hardcodar loja ou pular RBAC; com `lojaAtivaId`, B.2-T3 destrava em horas e a partir daí cada loja nova é "criar `Loja` + `UsuarioLoja` + dar credencial" — sem deploy, sem código novo.

**Sinal de "fechou em produto" (check manual obrigatório):** vendedora logada cai direto na home da `loja-moscow` (auto-select); admin idem. Os dois fluxos provam que o sistema não tem mais nada hardcoded pro admin.

### O que já existe

| Peça | Onde | Status |
|---|---|---|
| `Sessao` (id, usuarioId, criadaEm, expiraEm) | `prisma/schema.prisma` | criada na B.1 |
| `UsuarioLoja` (PK composta `[usuarioId, lojaId]`, FK pra `Perfil`) | `prisma/schema.prisma` | criado no schema inicial; **já é M:N** |
| `getSessao()` retornando `{ sessao, usuario } \| null` | `src/lib/auth/sessao.ts` + `index.ts` | B.1 |
| Layout `(app)/layout.tsx` faz `getSessao() → redirect("/login")` | `src/app/(app)/layout.tsx` | B.1 |
| `tenantPrisma(base, lojaId)` | `src/lib/tenant.ts` | B.2-T2 — **não tocar** |
| Fixture: `admin@moscownoivas.local` ligada à `loja-moscow` como Admin | seed + B.1 | |
| Fixture: `vendedora@lojateste.local` / `vendedora123` ligada à `loja-moscow` como Vendedora | criada na verify da B.1 | |

### Decisão de produto já fechada

**Seletor adaptativo.** Usuário com exatamente 1 loja é auto-selecionado; usuário com >1 escolhe. Não construir dropdown obrigatório universal. Razão:
- 99% dos casos previstos no MVP são 1-loja (loja independente).
- O caso N-lojas (franquia, cerimonial com filiais) é raro mas precisa funcionar — schema `UsuarioLoja` M:N já suporta.
- Pergunta "vender 1-dono-N-lojas?" fica adiada sem fechar porta nenhuma.
- Custo de código: praticamente igual (a página renderiza diferente baseado em `lojas.length`).

---

## 3. Conceitos (vocabulário desta fatia)

Nomes que toda fatia futura vai usar. Ficam estáveis a partir daqui.

| Nome | Tipo | Significado |
|---|---|---|
| `Sessao.lojaAtivaId` | `String?` no schema; FK `onDelete: SetNull` pra `Loja` | Loja atualmente "aberta" naquela sessão. `null` enquanto o usuário não escolheu (ou se a loja foi deletada). |
| `listarLojasDoUsuario(usuarioId)` | `(string) => Promise<Loja[]>` | Lê `UsuarioLoja` filtrado por `usuarioId` (loja ativa = true), retorna lojas ordenadas por `nome`. **Não passa por `tenantPrisma`** — é a pergunta "que lojas esse user pode ver?", cross-loja por construção. |
| `selecionarLojaPorPadrao(usuarioId)` | `(string) => Promise<Loja \| null>` | Atalho do auto-select: se o user tem exatamente 1 loja, retorna ela; senão `null`. |
| `definirLojaAtiva(sessaoId, lojaId, usuarioId)` | `(string, string, string) => Promise<void>` | `UPDATE Sessao SET lojaAtivaId = $lojaId WHERE id = $sessaoId`. **Antes de gravar, valida** que `UsuarioLoja(usuarioId, lojaId)` existe — se não, lança `Error("acesso negado à loja")`. Não confia no input. |
| `getSessaoComLoja()` | `() => Promise<{ sessao, usuario, loja } \| null>` | Composição: `getSessao()` + carrega `Loja` por `lojaAtivaId`. Retorna `null` se sessão é null, **ou** `lojaAtivaId` é null, **ou** a loja foi desativada. |
| `gateSessaoLojaAtiva()` | `() => Promise<GateEstado>` | Função de estado que o layout chama. Retorna union: `{ tipo: "sem-sessao" } \| { tipo: "sem-loja-ativa", sessao } \| { tipo: "ok", sessao, usuario, loja }`. Layout mapeia → redirect. Separado pra ser testável sem `redirect()`. |
| `selecionarLojaAction(formData)` | Server Action | Lê `lojaId` do form, lê sessão atual, chama `definirLojaAtiva`, redirect `/`. Se acesso negado, redirect `/selecionar-loja?erro=acesso`. |

---

## 4. Critérios de aceite

### Comportamento

- [ ] Migration aplica `ALTER TABLE "Sessao" ADD COLUMN "lojaAtivaId" TEXT` + FK `onDelete: SetNull` pra `Loja`. Migration é aditiva (nullable).
- [ ] Layout `(app)/layout.tsx` redireciona pra `/login` se sem sessão; pra `/selecionar-loja` se com sessão mas sem `lojaAtivaId`; passa adiante se ambos.
- [ ] `/selecionar-loja` com user de **1 loja**: chama `selecionarLojaPorPadrao` + `definirLojaAtiva` server-side, redirect `/` — sem render visível.
- [ ] `/selecionar-loja` com user de **>1 loja**: renderiza lista de lojas com radio/botões + form que dispara `selecionarLojaAction`.
- [ ] `/selecionar-loja` com user de **0 lojas**: renderiza estado vazio com mensagem ("Sua conta não tem acesso a nenhuma loja. Procure o administrador.") + botão de logout. **Não** loop infinito.
- [ ] `selecionarLojaAction` **rejeita** `lojaId` que o usuário não tem acesso a (não está em `UsuarioLoja`). Redirect `/selecionar-loja?erro=acesso` (não 500).
- [ ] Logout limpa cookie (B.1) — não precisa zerar `lojaAtivaId` explicitamente porque a sessão será deletada (CASCADE).
- [ ] Login de novo cria nova sessão com `lojaAtivaId = null`, o que dispara o gate → auto-select (1 loja) ou seletor (>1).

### Invariantes de segurança

- [ ] Forjar `lojaId` no form de `/selecionar-loja` não dá acesso a loja alheia (rejeitado por `definirLojaAtiva`).
- [ ] Cookie sem mudar; nenhum dado de loja vai pro cliente além da lista que o user já tem direito a ver.
- [ ] Layout protegido nunca passa adiante sem `lojaAtivaId` válido (FK garante: se loja deletada, FK `SetNull` zera, gate força nova seleção).

---

## 5. Testes (gate verificação-primeiro)

Suíte nova: `src/lib/auth/__tests__/loja-ativa.test.ts`. Setup parecido com `sessao.test.ts` (Prisma real, cleanup com `deleteMany`).

### Helpers puros (sem cookies)

| # | Teste | Como prova |
|---|---|---|
| A1 | `listarLojasDoUsuario(adminId)` retorna `[loja-moscow]` | seed already provides this |
| A2 | `listarLojasDoUsuario(userSemLojas)` retorna `[]` | criar user sem `UsuarioLoja`, asserir array vazio |
| A3 | `listarLojasDoUsuario(userCom2Lojas)` retorna as 2 ordenadas por nome | criar 2ª loja temp + 2 `UsuarioLoja`, asserir ordem |
| B1 | `selecionarLojaPorPadrao(userCom1Loja)` retorna a loja | adminId |
| B2 | `selecionarLojaPorPadrao(userCom2Lojas)` retorna `null` | |
| B3 | `selecionarLojaPorPadrao(userCom0Lojas)` retorna `null` | |
| C1 | `definirLojaAtiva(sessao.id, loja.id, user.id)` grava; `lerSessao(sessao.id)` reflete | criar sessão, definir loja, reler |
| C2 | `definirLojaAtiva(sessao.id, lojaForaDoUser, user.id)` **lança** `Error` e **não grava** | criar 2ª loja sem vincular, tentar, asserir throw + sessão inalterada |
| D1 | `getSessaoComLoja()` com cookie válido + `lojaAtivaId` setado → retorna `{ sessao, usuario, loja }` | mockar `cookies()` ou usar variante `lerSessaoComLojaId(id)` que recebe id direto |
| D2 | `getSessaoComLoja()` com sessão válida mas `lojaAtivaId = null` → retorna `null` | |
| D3 | `getSessaoComLoja()` com `lojaAtivaId` apontando pra loja desativada → retorna `null` | desativar `Loja.ativo = false`, asserir |
| E1 | `gateSessaoLojaAtiva()` sem cookie → `{ tipo: "sem-sessao" }` | |
| E2 | `gateSessaoLojaAtiva()` com sessão mas sem `lojaAtivaId` → `{ tipo: "sem-loja-ativa", sessao }` | |
| E3 | `gateSessaoLojaAtiva()` com tudo → `{ tipo: "ok", sessao, usuario, loja }` | |

### Mock de `cookies()`

Padrão minimalista (sem framework novo):

```ts
import { vi } from "vitest";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => stub[name],
    set: () => {},
    delete: () => {},
  }),
}));
// stub é um objeto controlado por cada teste
```

Alternativa preferida (sem mock global): expor **variante por id** dos helpers — `lerSessaoComLojaId(sessionId)` — e usar nos testes. Mock só onde inevitável.

### Server Action `selecionarLojaAction`

Testar via import + chamada direta com `FormData` montado a mão. `cookies()` mockado pra retornar id da sessão de teste. Não usar curl/action-id.

---

## 6. Restrições

- **Não pode tocar:** `src/lib/tenant.ts` (B.2-T2 congelada nesta task), schema de qualquer tabela exceto `Sessao`, `src/app/(app)/page.tsx`, `loginAction`/`logoutAction`.
- **Migration aditiva apenas.** Sem rename, sem default backfill (existing sessions já podem ter `NULL`).
- **Sem framework de auth novo.** Continuar rolando próprio, sem next-auth.
- **Sem nova dependência.** Toda lógica em código do projeto + Prisma + Next.
- **Padrão de teste do projeto:** Prisma real (não mock), `src/.../__tests__/*.test.ts`, vitest. Cleanup com `deleteMany`.
- **Padrão de import:** `@/generated/prisma/client` pra tipos do Prisma; `@/lib/db` pro singleton.

### Verificação manual (entra na PR)

1. **Gates automáticos:** `npm test` ≥ 73 verdes; `tsc` limpo.
2. **Login vendedora** → vê "Olá, Vendedora" direto em `/` (auto-select da `loja-moscow`).
3. **Login admin** → vê "Olá, Administrador" direto em `/` (idem).
4. **Caso >1 loja (manual, SQL fornecido na PR):**
   ```sql
   INSERT INTO "Loja" (id, nome, ativo, "createdAt", "updatedAt")
     VALUES ('loja-teste-2', 'Filial Teste', true, NOW(), NOW());
   INSERT INTO "UsuarioLoja" ("usuarioId", "lojaId", "perfilId")
     VALUES ('user-vendedora-pzv', 'loja-teste-2', 'perfil-vendedora');
   ```
   Logar como vendedora → cai em `/selecionar-loja` com 2 opções → escolher uma → vai pra `/`.
   Cleanup: `DELETE FROM "Loja" WHERE id = 'loja-teste-2'` (CASCADE limpa o vínculo).
5. **Caso 0 lojas (manual):** criar user sem `UsuarioLoja`, logar, ver mensagem de estado vazio + botão sair (sem loop).
6. **Acesso forjado (manual ou test C2):** abrir devtools, alterar `value` do radio pra um `lojaId` que não pertence ao user, submeter → cai em `/selecionar-loja?erro=acesso` (não acessa).

---

## 7. Follow-up (fora desta task)

- **B.2-T3** — mover dashboard pra `/loja/[lojaId]/`, dashboard usa `tenantPrisma(prisma, sessao.lojaAtivaId)`. Teste D do gate original ("rota protegida chama `tenantPrisma`") vai pra cá.
- **B.2-T4** — primeira leitura real escopada (lista `Vestido`), exercitando o guard.
- **Trocar de loja em runtime** (botão "trocar loja" no header) — fatia futura, depois de T3.
- **Validar a hipótese 1-loja-99%** quando houver dado real (>30 lojas vendidas). Se >1-loja for mais comum, ajustar UX do seletor.
- **UX do estado "0 lojas"** — hoje é mensagem + logout. Pode evoluir pra "pedir acesso ao admin" via email.

---

## 8. Quebra em tasks de agente

**Uma task ponta a ponta, coesa.** Não quebrar por camada técnica.

### B.2-T1.AGENT — Loja ativa na sessão + seletor adaptativo

**Toca:** migration + helpers + página + Server Action + layout — **na mesma task de agente** (regra do harness: a menor unidade que entrega ponta a ponta sem colidir).

**Arquivos:**
- `prisma/schema.prisma` (apenas model `Sessao`)
- `prisma/migrations/<timestamp>_sessao_loja_ativa/migration.sql` (novo)
- `src/lib/auth/sessao.ts` (adicionar helpers; manter os existentes)
- `src/lib/auth/index.ts` (re-export)
- `src/app/(app)/layout.tsx` (substituir `getSessao() → redirect` por gate triplo)
- `src/app/(public)/selecionar-loja/page.tsx` (novo)
- `src/app/(public)/selecionar-loja/actions.ts` (novo)
- `src/app/(public)/selecionar-loja/selecao-form.tsx` (novo, só se >1 loja)
- `src/lib/auth/__tests__/loja-ativa.test.ts` (novo)

**Risco de colisão:** **médio** em `src/app/(app)/layout.tsx`. Nenhuma outra fatia ativa toca esse arquivo agora; mas se um agente paralelo entrar pra adicionar header/nav, sequenciar (T1 primeiro).

**Sem colisão:** o resto. `src/lib/tenant.ts` está congelado por restrição.

**Ordem interna de implementação** (não é colisão, é dependência):
1. Schema + migration.
2. Helpers em `sessao.ts` (com testes A–E rodando à medida).
3. Página `/selecionar-loja` + Server Action.
4. Atualizar layout `(app)` pra chamar `gateSessaoLojaAtiva()`.
5. Verificar manualmente os 6 cenários (Restrições §6) — não pular.

**Definition of done:**
- Todos os critérios de aceite (§4) marcados.
- Suite ≥73 verdes; tsc limpo.
- Verificação manual §6 passou.
- Snapshot em `docs/estado-atual.md` atualizado marcando T1 fechada e T3 como próximo.
- Commit único `feat(auth): loja ativa na sessão + seletor adaptativo (B.2-T1)`.
