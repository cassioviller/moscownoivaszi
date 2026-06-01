# Módulo Vestidos (1ª página de módulo) + permissões granulares por ação — Design

**Data:** 2026-05-29
**Fatia pai:** Base / Multitenant — primeira página de módulo operacional dentro de `/loja/[lojaId]/`.
**Depende de:** B.2-T3 (rota `/loja/[lojaId]/` + gates de sessão/espelhamento — fechada), B.2-T2 (`tenantPrisma` — fechada).
**Próxima fatia depois desta:** UI central de gestão de permissões (consome o mesmo helper `podeNoModulo`); depois, módulos Leads/Interesses e o resto do CRUD de Vestido (atributos, bloqueios, excluir/arquivar).

---

## 1. Objetivo

Entregar o **primeiro módulo operacional** (Vestidos: listar + criar + editar) e, junto, a **API de permissões granulares** que ele consome. Isso:

1. Põe o guard `tenantPrisma` num fluxo de escrita real (`create`/`update` carimbando `lojaId`).
2. Fecha o CTA que o dashboard (B.2-T3) prometeu ("Nenhum vestido cadastrado ainda" passa a ter destino).
3. Evolui `Perfil.acessosModulos` de liga-desliga por módulo para **`{ módulo: { ver, criar, editar } }`** por perfil, com enforcement via helper `podeNoModulo`.

**Não** entrega: a UI central de edição de permissões (fatia seguinte); atributos/bloqueios/disponibilidade; excluir/arquivar; enforcement em outros módulos. **Sem mudança de schema** (o shape granular cabe no `Json` que já existe).

## 2. Contexto

### Métrica de produto que esta fatia move

**Primeiro valor operacional real.** Até aqui o sistema autentica, escopa e administra usuários, mas nenhuma funcionária *faz o trabalho dela* nele. Vestidos é a primeira tarefa de varejo de verdade (montar o catálogo). Sinal de "fechou": uma admin cadastra um vestido e ele aparece na lista escopado à loja; uma vendedora abre a mesma tela e **consulta** sem poder mutar.

### O que já existe (reaproveitar, não recriar)

| Peça | Onde | Uso aqui |
|---|---|---|
| Gates sessão + espelhamento | `src/app/(app)/loja/[lojaId]/layout.tsx` | Rotas de vestidos herdam de graça |
| `getSessaoComLoja()` → `{ usuario, loja }` | `@/lib/auth` | Sessão + loja ativa |
| `tenantPrisma(prisma, lojaId)` (Vestido ∈ TENANT_MODELS) | `src/lib/tenant.ts` | Todo I/O de vestido passa por aqui |
| `prisma` singleton | `@/lib/db` | Base do guard |
| Padrão CRUD 3 camadas (page/actions/form + data layer) | `src/app/(app)/equipe/*`, `src/lib/admin/usuarios.ts` | Molde das rotas/actions |
| Primitivas de UI `Field` / `Submit` / linha de lista | `src/app/(app)/equipe/vendedora-form.tsx`, `equipe/page.tsx` | Reuso direto |
| `ehAdminDaLoja(usuarioId, lojaId)` | `src/lib/admin/usuarios.ts` | **Permanece** só para gestão de equipe (`/equipe`); ortogonal a permissão de módulo |
| Tokens do `DESIGN.md` (bordô ≤5%, neutros warm, flat, type-carries-hierarchy) | `DESIGN.md` | Toda a UI |

### Restrição de plataforma

Next 16: `params` é `Promise<{...}>` (sempre `await`). Rotas que leem sessão/`cookies()` são dinâmicas. Antes de codar, conferir contrato em `node_modules/next/dist/docs/`. Ambiente: `node` no PATH; rodar testes/tsc via `node node_modules/vitest/vitest.mjs run` e `node node_modules/typescript/bin/tsc --noEmit` (binários `.bin/*` dão permission denied).

### Modelo `Vestido` (campos escalares desta fatia)

`codigo` (obrigatório, **único por loja** — `@@unique([lojaId, codigo])`), `nome` (obrigatório), `precoBase` (Decimal, obrigatório), `tamanho?`, `cor?`, `categoria?`, `observacoes?`, `status` (default `"ativo"`). Atributos/bloqueios ficam fora.

## 3. Decisões de design (fechadas no brainstorming + grill-me + consulta `impeccable`)

| # | Decisão | Razão |
|---|---|---|
| D1 | **Permissões granulares por ação** em `acessosModulos`: `{ módulo: { ver, criar, editar } }` por perfil. Abordagem JSON aninhado (não tabela). | A coluna já é `Json` → sem migration; a futura central só edita esse JSON. Tabela normalizada seria YAGNI. |
| D2 | **Helper `podeNoModulo(usuarioId, lojaId, modulo, acao)`** é a única porta de enforcement. super-admin → sempre `true`; senão lê o perfil do vínculo; ausência → `false` (falha-fechada). | Centraliza a regra; cada módulo futuro consome o mesmo helper. É a forma granular da B.3-F3. |
| D3 | **Admin muta, vendedora/recepção só veem** (defaults no seed, editáveis pela central depois). | Espelha o negócio (catálogo é território da dona; vendedora consulta). Dá distinção de papel testável. |
| D4 | **Criar e editar em rotas dedicadas** (`/novo`, `/[vestidoId]/editar`), mesmo componente de form. Lista não embute form. | 7 campos sob um catálogo que cresce = rolagem hostil (anti-ERP). Simetria novo/editar. |
| D5 | **Lista, não tabela nem cards.** Linha: código+nome+preço; metadata em sub-linha; status só se `≠ ativo`. | Sem scroll horizontal no tablet do salão; cards seriam decoração. Densidade média do `DESIGN.md`. |
| D6 | **Read-only da vendedora = mesma lista sem CTA e sem links de editar.** Sem banner "você é read-only". | A ausência do CTA já comunica; banner seria ruído. |
| D7 | **`acessosModulos` granular cabe no `Json` existente — sem schema change.** Seed reescreve os 3 perfis no shape novo. | Aditivo no dado, não no schema. |
| D8 | **Enforcement só de `vestidos` nesta fatia.** Outros módulos recebem defaults no seed mas não têm página nem checagem. | Escopo mínimo; não inflar. |

## 4. Arquitetura

### 4.1 Permissões — `src/lib/permissoes/modulos.ts`

```
export const MODULOS = ["leads", "interesses", "vestidos", "config"] as const;
export const ACOES = ["ver", "criar", "editar"] as const;
export type Modulo = (typeof MODULOS)[number];
export type Acao = (typeof ACOES)[number];
export type AcessosModulos = Record<Modulo, Record<Acao, boolean>>;

// super-admin → true. Senão: vínculo UsuarioLoja → perfil.acessosModulos[modulo]?.[acao] === true.
// Sem vínculo / módulo ausente / flag ausente → false (falha-fechada).
export async function podeNoModulo(
  usuarioId: string, lojaId: string, modulo: Modulo, acao: Acao,
): Promise<boolean>
```

Lê via `prisma` direto (não `tenantPrisma`): `UsuarioLoja` é tabela de acesso, fora do guard (convenção em `src/lib/tenant.ts`). Filtra por `usuarioId`+`lojaId`.

### 4.2 Seed — defaults granulares

`prisma/seed.ts`: reescrever `acessosModulos` dos 3 perfis no shape `{ módulo: { ver, criar, editar } }`.

| Perfil | leads | interesses | vestidos | config |
|---|---|---|---|---|
| **Admin** | v/c/e | v/c/e | v/c/e | v/c/e |
| **Vendedora** | v/c/e | v/c/e | **v** (só ver) | — (nenhum) |
| **Recepção** | v/c | v | **v** (só ver) | — |

(`v/c/e` = ver+criar+editar; `—` = todas as ações `false`, escritas **explicitamente** no JSON, para o shape ser sempre `Record<Modulo, Record<Acao, boolean>>` completo. Só `vestidos` é enforçado nesta fatia; demais valores são intenção que páginas futuras vão obedecer.)
`src/lib/__tests__/seed.test.ts` migra das asserções booleanas (`acessos.config === true`) para o shape granular (`acessos.config.ver`).

### 4.3 Data layer — `src/lib/vestidos/vestidos.ts`

Tudo por `tenantPrisma(prisma, lojaId)`:

```
type NovoVestido = { codigo: string; nome: string; precoBase: string;
  tamanho?: string; cor?: string; categoria?: string; observacoes?: string };
type EdicaoVestido = NovoVestido;

listarVestidos(lojaId): Promise<Vestido[]>          // findMany, orderBy nome asc
obterVestido(lojaId, vestidoId): Promise<Vestido|null> // findUnique escopado (outra loja → null)
criarVestido(lojaId, input: NovoVestido): Promise<Vestido> // create (guard carimba lojaId)
editarVestido(lojaId, vestidoId, input: EdicaoVestido): Promise<Vestido> // update escopado
```

Validação compartilhada (lança `Error` com mensagem pt-BR):
- `codigo`/`nome` trim não-vazios.
- `precoBase`: normaliza pt-BR ("2.400,00" / "2400") → número > 0; senão "Informe um preço válido".
- Código duplicado na loja (`@@unique` → Prisma `P2002`): capturar e relançar "Já existe um vestido com esse código".

### 4.4 Rotas — `src/app/(app)/loja/[lojaId]/vestidos/`

```
page.tsx                    lista (gate podeNoModulo ver) + CTA "Novo vestido" (só se criar)
actions.ts                  criarVestidoAction / editarVestidoAction
vestido-form.tsx            Client form (useFormStatus), reusado por novo e editar
novo/page.tsx               form de criar (gate criar → senão redirect /loja/{id}/vestidos)
[vestidoId]/editar/page.tsx form pré-preenchido (gate editar; obterVestido escopado, null → redirect /loja/{id}/vestidos)
```

- **Gate de página:** cada `page.tsx` chama `podeNoModulo` com a ação correspondente; sem permissão → `redirect` (falha-fechada). `export const dynamic = "force-dynamic"`.
- **Gate de action (defesa em profundidade):** `criarVestidoAction`/`editarVestidoAction` revalidam `podeNoModulo(criar|editar)` server-side antes de mutar; erro → `redirect(/vestidos?erro=...)`; sucesso → `redirect(/vestidos?ok=1)`. Padrão idêntico ao de `equipe/actions.ts`.
- **Dashboard:** `loja/[lojaId]/page.tsx` ganha link "Ver vestidos →" (e o empty state passa a apontar pra cá). Ajuste pequeno, dentro do escopo.

### 4.5 UI (direção `impeccable`, ancorada no `DESIGN.md`)

- **Lista** (`ul divide-y divide-borda-suave rounded-md border border-borda bg-papel-elevado`): linha primária `código` (Grafite, `tabular-nums`) + `nome` (Tinta) à esquerda; `preço` pt-BR (`Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})`, Tinta, `tabular-nums`) à direita. Sub-linha Micro/Cinza-fumo `tamanho · cor · categoria` (omitindo vazios). `status` só renderiza se `≠ "ativo"` (tag discreto "inativo"). Ordenado por nome.
- **Read-only (vendedora):** mesma lista, sem CTA e sem linhas-link.
- **Form:** grupo obrigatório (`código` autoFocus, `nome`, `preço` com adorno "R$", `inputMode="decimal"`) → subhead "Opcional" → `tamanho`, `cor`, `categoria`, `observações` (textarea ~3 linhas). Reusa `Field`/`Submit`; Submit pending → "Salvando…".
- **Estados:** vazio-admin ("Nenhum vestido cadastrado ainda." + "Cadastre o primeiro vestido do catálogo." + botão "Novo vestido"); vazio-vendedora (mesma frase + "Peça à administração para cadastrar o catálogo.", sem CTA); erro (`role="alert"`, bordô, mensagens da §4.3); sucesso (`?ok=1` → linha discreta Grafite + a linha já na lista); loading (só Submit). Server-rendered → sem skeleton.
- **Conformidade:** bordô só em CTA/Submit/erro (≤5%); flat; back-link "← {loja.nome}"; sem scroll horizontal; pt-BR direto, sem travessões.

## 5. Testes

Lógica testável vive no data layer e no helper (rotas/cookies → smoke, como B.2-T3). Vitest + Postgres real, fixtures dedicadas, limpeza por cascade.

| ID | Cenário | Esperado |
|---|---|---|
| P1 | `podeNoModulo` super-admin | `true` p/ qualquer módulo/ação |
| P2 | Admin em `vestidos`: ver/criar/editar | `true` nos três |
| P3 | Vendedora em `vestidos`: ver / criar / editar | `true` / `false` / `false` |
| P4 | sem vínculo / módulo ausente / flag ausente | `false` (falha-fechada) |
| V1 | `criarVestido` ignora `lojaId` forjado, usa o da sessão | `lojaId` = loja ativa |
| V2 | `criarVestido` código duplicado na loja | erro "Já existe um vestido com esse código" |
| V3 | `criarVestido` validação (código/nome vazio; preço ≤0/ inválido) | erro específico pt-BR |
| V4 | `listarVestidos` escopado | só os da loja; ordenado por nome (loja A não vê B) |
| V5 | `obterVestido` de outra loja | `null` |
| V6 | `editarVestido` altera campos; não re-tenanta | atualiza; `lojaId` imutável |
| S1 | Seed: `acessosModulos` dos 3 perfis | shape `{módulo:{ver,criar,editar}}` correto |

**Smoke (porta 5000):** vendedora — lista sem CTA, `/vestidos/novo` redireciona; admin — cria e vê a linha, edita e vê a alteração; `/vestidos/{id}/editar` de outra loja → falha-fechada; dashboard linka pra `/vestidos`.

**Gates:** suíte 100% verde; `tsc --noEmit` limpo.

## 6. Fora de escopo (YAGNI)

UI central de permissões (próxima fatia — consome `podeNoModulo`); enforcement de leads/interesses/config (só defaults no seed); `VestidoAtributo`/atributos; `BloqueioVestido`/disponibilidade; excluir/arquivar; toggle de status pela UI; mudança de schema.

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Vazamento entre lojas na escrita | Todo I/O por `tenantPrisma`; V1/V4/V5 provam carimbo e isolamento. |
| Permissão burlada via rota direta | Gate na page **e** na action (defesa em profundidade); P3/P4 cobrem; smoke confirma `/novo` da vendedora. |
| Migração do shape de `acessosModulos` quebra dados de dev | Seed reescreve os 3 perfis; S1 trava o shape; `podeNoModulo` falha-fechada se vier shape antigo (flag ausente → false). |
| Preço Decimal mal-parseado (vírgula pt-BR) | Normalização explícita + V3. |
| Contrato `params`/cache do Next 16 | Ler `node_modules/next/dist/docs/` antes de codar (AGENTS.md). |
