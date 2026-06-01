# Central de permissões (templates globais + override por loja) — Design

**Data:** 2026-05-29 · **Revisão:** v2 (pós spec-document-reviewer)
**Fatia pai:** Base / Multitenant — primeira UI de gestão das permissões granulares introduzidas no Módulo Vestidos.
**Depende de:** Módulo Vestidos + permissões granulares (helper `podeNoModulo`, shape `acessosModulos = { módulo: { ver, criar, editar } }` — fechada), B.2-T2 (`tenantPrisma` — fechada), B.3 F1–2 (gestão de usuários, `ehAdminDaLoja` — fechada).
**Próxima fatia depois desta:** módulos Leads/Interesses (consomem `podeNoModulo` e passam a aparecer na grade conforme ganham superfície real); CRUD restante de Vestido.

---

## 1. Objetivo

Entregar as **telas de gestão de permissões** que editam o que o helper `podeNoModulo` já consome. Hoje o modelo (`Perfil.acessosModulos` granular) e o enforcement (`podeNoModulo`) existem, mas não há tela — as permissões só mudam via `seed.ts`.

Esta fatia entrega **duas superfícies** sobre um modelo de **templates globais + override por loja**:

1. **`/admin/perfis`** (super-admin) — edita os **templates globais** de cada perfil (`Perfil.acessosModulos`), o default que toda loja herda.
2. **`/loja/[lojaId]/permissoes`** (admin da loja) — edita o **override** da loja ativa: uma customização que substitui o template **só para aquela loja**.

**Não** entrega: edição do perfil Admin (é acesso total travado); o módulo `config` na grade (sem superfície real ainda); novos perfis/CRUD de perfil; auditoria/histórico de mudanças; UI de criação de perfis operacionais novos.

**Muda o schema:** sim — **uma tabela nova aditiva** (`PerfilOverrideLoja`). Sem migração de dados (ausência de linha = herda o template).

## 2. Contexto

### Métrica de produto que esta fatia move

**Autonomia da loja sobre seus papéis sem vazar configuração entre tenants.** Até aqui, ajustar o que uma Vendedora pode fazer exigia editar o seed (mudança global, dev-only). Sinal de "fechou": a admin de uma loja liga `vestidos.criar` para a Vendedora **da sua loja**, a vendedora daquela loja passa a criar vestidos, e **nenhuma outra loja** é afetada.

### Decisões de produto (fechadas via brainstorming + grill-me, 2026-05-29)

Cada decisão foi estressada com a prática recomendada da indústria antes de fechar:

1. **Modelo:** templates globais + **override por loja** (não delta por célula).
2. **Isolamento:** `PerfilOverrideLoja` **passa pelo `tenantPrisma`** — toda tabela com `lojaId` passa pelo guard, sem exceção. A exceção do `UsuarioLoja` **não** se aplica (ele é lido cross-loja por `usuarioId`, antes de existir loja ativa; o override é sempre lido dentro de uma loja).
3. **Semântica:** **snapshot** — ao customizar, a loja vira dona da matriz daquele perfil; o template para de propagar para ela. **+ normalização na leitura** (fail-closed para shape novo).
4. **Superfícies:** super-admin edita template em `/admin/perfis`; admin da loja edita override em `/loja/[lojaId]/permissoes`. Separação rígida `/admin/*` = plataforma, `/loja/[lojaId]/*` = tenant.
5. **Perfil Admin:** acesso total **permanente e não-editável** nas duas telas (read-only). Sem override possível para Admin.
6. **Coerência de ações:** `criar || editar ⇒ ver`. `criar` e `editar` independentes entre si.
7. **Módulo `config`:** fora da grade editável por ora (permanece em `MODULOS` para o shape). Grade renderiza só módulos de produto com efeito real: **leads, interesses, vestidos**.
8. **UI:** um único componente `MatrizPermissoes` reutilizado pelas duas telas; save por perfil; badge Padrão/Personalizado; "Restaurar padrão" deleta o override (com confirmação leve).

### O que já existe (reaproveitar, não recriar)

| Peça | Onde | Uso aqui |
|---|---|---|
| Helper de enforcement `podeNoModulo(usuarioId, lojaId, modulo, acao)` | `src/lib/permissoes/modulos.ts` | **Alterado** para consultar override antes do template |
| `MODULOS`, `ACOES`, tipos `Modulo`/`Acao`/`AcessosModulos` | `src/lib/permissoes/modulos.ts` | Fonte da verdade do shape |
| Helper `acessos()` (preenche shape completo) | `prisma/seed.ts` | Lógica **generalizada** em `normalizarAcessos` reutilizável (o seed pode passar a usá-la) |
| `tenantPrisma(prisma, lojaId)` + `TENANT_MODELS` | `src/lib/tenant.ts` | I/O do override passa por aqui; `PerfilOverrideLoja` entra em `TENANT_MODELS` (add de 1 linha). **Premissa do guard:** Prisma 7 `extendedWhereUnique` |
| Gates sessão + espelhamento + `force-dynamic` | `src/app/(app)/loja/[lojaId]/layout.tsx` | Tela de override (nested) herda de graça |
| `getSessaoComLoja()` → `{ usuario, loja }` | `@/lib/auth` | Sessão + loja ativa |
| `ehAdminDaLoja(usuarioId, lojaId)` (super-admin OU `perfilId === PERFIL_ADMIN_ID`) | `src/lib/admin/usuarios.ts` | Guard da tela de override |
| Guard `isSuperAdmin` do grupo `/admin` | `src/app/admin/layout.tsx` | Guard da tela de templates |
| `PERFIL_ADMIN_ID`, `PERFIL_VENDEDORA_ID` | `src/lib/admin/usuarios.ts` | Identificar Admin (travado) e operacionais. **`PERFIL_RECEPCAO_ID` falta como constante** — o perfil `perfil-recepcao` **já está seedado** (`seed.ts` 99–107); só falta a constante TS. **Sem mudança de seed.** |
| Link condicional no dashboard (`podeGerenciarEquipe && <Link href="/equipe">`) | `src/app/(app)/loja/[lojaId]/page.tsx:51` | Molde do link "Permissões" |
| Padrão CRUD 3 camadas (page/actions/form) + `Field`/`Submit`/linha de lista | `src/app/(app)/equipe/*`, `src/app/admin/*` | Molde das rotas/actions/UI |
| Tokens do `DESIGN.md` (bordô ≤5%, neutros warm, flat, type-carries-hierarchy) | `DESIGN.md` | Toda a UI |

### Restrição de plataforma

Notas de ambiente das fatias anteriores (ver `docs/estado-atual.md`): testes via `node node_modules/vitest/vitest.mjs run`; `tsc` via `node node_modules/typescript/bin/tsc --noEmit`; smoke em porta própria (5050), não na 5000.

---

## 3. Modelo de dados

### Tabela nova: `PerfilOverrideLoja`

```prisma
model PerfilOverrideLoja {
  lojaId         String
  perfilId       String
  acessosModulos Json     // snapshot COMPLETO: { modulo: { ver, criar, editar } }
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  loja   Loja   @relation(fields: [lojaId], references: [id], onDelete: Cascade)
  perfil Perfil @relation(fields: [perfilId], references: [id], onDelete: Cascade)

  @@id([lojaId, perfilId])
}
```

- Back-relations virtuais em `Loja` (`overridesPermissao PerfilOverrideLoja[]`) e `Perfil` (`overrides PerfilOverrideLoja[]`).
- **PK composta `(lojaId, perfilId)`**: no máximo um override por par loja×perfil.
- **Migration aditiva** (tabela nova). Sem `seed` de override e sem migração de dados: ausência de linha = herda o template.
- `Perfil` permanece **global** (sem `lojaId`) — é o template. Nenhuma mudança em `Perfil`/`UsuarioLoja`.

### Entra no `tenantPrisma` — e o padrão de I/O guard-friendly

`"PerfilOverrideLoja"` é adicionado a `TENANT_MODELS` em `src/lib/tenant.ts` (add de 1 linha). Consequências:
- Leitura/escrita do override **sempre** via `tenantPrisma(prisma, lojaId)`; `prisma.perfilOverrideLoja.*` direto é bug de segurança (coberto pelo canário anti-raw).
- O guard carimba `lojaId` no `create` e o injeta no `where` de toda operação.

**Padrão de I/O escolhido (resolve a interação guard × PK composta):** todo acesso ao override usa `where` **não-único** `{ perfilId }` — nunca o input de PK composta `{ lojaId_perfilId: {...} }`. O guard adiciona `lojaId` ao `where`; como `(lojaId, perfilId)` é único, o resultado é exatamente a linha da loja (ou nada). Assim evitamos o atrito "PK composta + lojaId top-level" que tornou o `UsuarioLoja` uma exceção, e ganhamos isolamento limpo:
- **ler:** `tp.perfilOverrideLoja.findFirst({ where: { perfilId } })`
- **listar (todos da loja):** `tp.perfilOverrideLoja.findMany({})` (guard filtra por `lojaId`)
- **criar:** `tp.perfilOverrideLoja.create({ data: { perfilId, acessosModulos } })` (guard carimba `lojaId`)
- **atualizar:** `tp.perfilOverrideLoja.updateMany({ where: { perfilId }, data: { acessosModulos } })`
- **remover:** `tp.perfilOverrideLoja.deleteMany({ where: { perfilId } })` — **idempotente** (count 0 se não existir; sem `P2025` para tratar)

**Regra oficial confirmada:** toda tabela com `lojaId` passa pelo guard. Visão cross-loja dos overrides para o super-admin (auditoria/suporte), se um dia existir, será **função explícita, nomeada e de uso restrito**, nunca o caminho padrão.

---

## 4. Enforcement e normalização

Funções puras vivem em `src/lib/permissoes/modulos.ts` (mesmo arquivo de `podeNoModulo`, que as consome).

### `normalizarAcessos(raw): AcessosModulos`

Fonte da verdade do shape e da coerência. Generaliza o `acessos()` do seed. Aplicada em **toda leitura e escrita** de `acessosModulos` (template e override).

Regras (reconciliação contra `MODULOS × ACOES` atual):
- chave **conhecida** com `true`/`false` → respeita o valor salvo;
- chave **desconhecida** (módulo/ação fora de `MODULOS`/`ACOES`) → descartada;
- **módulo novo** ausente no snapshot → todas as ações `false`;
- **ação nova** ausente em módulo existente → `false`;
- **coerência:** `criar === true || editar === true ⇒ ver = true`.

Saída sempre com shape completo (`Record<Modulo, Record<Acao, boolean>>`). O banco nunca é fonte de shape nem de estado incoerente; o código é. Módulo novo fica **negado por padrão** em loja já customizada (fail-closed).

### `resolverAcessosEfetivos(template, override): AcessosModulos`

`override != null ? normalizarAcessos(override) : normalizarAcessos(template)`. Snapshot puro — se há override, o template é ignorado para aquele perfil×loja. Usada pelo enforcement e pelo pré-preenchimento das telas.

### `podeNoModulo` (alterado)

```
1. usuario.isSuperAdmin → true
2. vinculo = prisma.usuarioLoja.findUnique({ usuarioId_lojaId }) → perfilId + perfil.acessosModulos
   (UsuarioLoja segue lido via prisma DIRETO — é a exceção documentada do guard)
   sem vínculo → false (falha-fechada)
3. perfilId === PERFIL_ADMIN_ID → true  (Admin = acesso total escopado à loja)
4. tp = tenantPrisma(prisma, lojaId)
   override = await tp.perfilOverrideLoja.findFirst({ where: { perfilId } })  // guard injeta lojaId
   efetivo = resolverAcessosEfetivos(perfil.acessosModulos, override?.acessosModulos ?? null)
5. return efetivo[modulo][acao] === true
```

- Passo 3 (Admin → true) torna o enforcement do Admin independente de qualquer flag — blinda contra normalização negar algo do Admin por shape novo e dispensa gravar override para ele.
- `tenantPrisma` exige `lojaId` válido para instanciar → checar permissão sem loja válida **lança** (falha-fechada por construção). `podeNoModulo` só é chamado dentro de uma loja ativa.

---

## 5. Telas

Ambas usam `MatrizPermissoes` (§6), `export const dynamic = "force-dynamic"`, e revalidam papel server-side nas actions (defesa em profundidade).

### 5.1 `/admin/perfis` — templates globais (super-admin)

- **Grupo:** `/admin/*` (guard `isSuperAdmin` já existe no layout).
- **Lê:** `listarPerfis()` → todos os perfis globais `{ id, nome, acessosModulos }`.
- **Renderiza:** uma seção por perfil. **Admin** read-only (acesso total). **Vendedora**/**Recepção** editáveis, grade pré-preenchida com `normalizarAcessos(template)`.
- **Salva:** `salvarTemplateAction(perfilId, formData)` — guard `isSuperAdmin`; recusa `perfilId === PERFIL_ADMIN_ID`; `normalizarAcessos` → `prisma.perfil.update({ where:{id}, data:{ acessosModulos } })`. Save por perfil.
- **Navegação:** link "Perfis" na página `/admin`.

### 5.2 `/loja/[lojaId]/permissoes` — override da loja (admin da loja)

- **Grupo:** `(app)/loja/[lojaId]/*` — **nested** (como `/loja/[lojaId]/vestidos`, não como o `/equipe` flat legado). Herda gate de sessão, espelhamento (`resolverAcessoLoja`) e `force-dynamic` do layout. Nesting é intencional: é o que dá os gates de loja de graça.
- **Guard adicional:** `ehAdminDaLoja(usuario.id, loja.id)` → vendedora/recepção redirecionam para `/loja/[lojaId]`. (Super-admin passa — `ehAdminDaLoja` retorna true; pode editar override de qualquer loja que selecionar.)
- **Lê:** `listarPerfis()` (templates) + `listarOverridesDaLoja(lojaId)` (via `tenantPrisma`). Para cada perfil computa o efetivo e se está **personalizado** (tem override) ou **padrão** (não tem).
- **Renderiza:** uma seção por perfil.
  - **Admin:** read-only, todas marcadas, nota "Acesso total — perfil do sistema", sem Salvar nem Restaurar.
  - **Vendedora/Recepção:** grade editável pré-preenchida com `resolverAcessosEfetivos`; badge **Padrão**/**Personalizado**; botão **Salvar**; botão **Restaurar padrão** só quando Personalizado.
- **Grade renderiza só:** `leads`, `interesses`, `vestidos` (não `config`).
- **Actions:**
  - `salvarOverrideAction(perfilId, formData)` — re-checa `ehAdminDaLoja`; recusa `perfilId === PERFIL_ADMIN_ID`; `normalizarAcessos`; `salvarOverride(lojaId, perfilId, acessos)` (read-then-write guard-friendly, §3). Primeiro save vira **Personalizado**.
  - `restaurarPadraoAction(perfilId)` — re-checa guard; `removerOverride(lojaId, perfilId)` (`deleteMany`, idempotente). Volta a **Padrão** e a herdar o template.
- **Navegação:** link "Permissões" no dashboard `src/app/(app)/loja/[lojaId]/page.tsx`, condicional a `ehAdminDaLoja`, apontando para `/loja/${lojaId}/permissoes` (ao lado do link "Equipe").

### Confirmação de "Restaurar padrão"

Confirmação leve (sem fluxo pesado). Texto:
> "Restaurar padrão? As permissões personalizadas desta loja serão removidas e este perfil voltará a seguir o modelo global."
>
> Botões: **Cancelar** · **Restaurar padrão**

---

## 6. Componente `MatrizPermissoes`

Client Component reutilizado pelas duas telas, parametrizado por props:

- `perfilNome: string`, `valores: AcessosModulos` (efetivo, já normalizado).
- `modo: "editavel" | "readonly"` (Admin → `readonly`).
- `modulosVisiveis: Modulo[]` (hoje `["leads","interesses","vestidos"]`).
- `estado?: "padrao" | "personalizado"` (só na tela de override → badge).
- `salvarAction`, `restaurarAction?` (server actions; `restaurarAction` ausente OU `estado==="padrao"` esconde o botão Restaurar).

Grade `módulos (linhas) × ações (colunas: Ver/Criar/Editar)` com checkboxes.

**Modo `readonly` (Admin):** todas as caixas marcadas e **desabilitadas**, nota "Acesso total — perfil do sistema", **sem** botão Salvar nem Restaurar, **sem** `<form>` de submit.

**Modo `editavel` — coerência no cliente** (UX espelhando a regra do servidor):
- marcar **Criar** ou **Editar** → marca **Ver** e desabilita desmarcar **Ver**;
- desmarcar **Ver** → desmarca **Criar** e **Editar**.

O servidor (`normalizarAcessos`) é a fonte da verdade: mesmo que o form envie estado incoerente, é corrigido antes de gravar. `useActionState` para feedback localizado por perfil.

Labels pt-BR: módulos (Leads, Interesses, Vestidos), ações (Ver, Criar, Editar). Estética conforme `DESIGN.md`. Componente reutilizável desde o início (atende o flag DRY da revisão `ui-ux-pro-max`).

---

## 7. Camada de dados

Novo módulo `src/lib/permissoes/perfis.ts`. Puros `normalizarAcessos`/`resolverAcessosEfetivos` ficam em `src/lib/permissoes/modulos.ts` (consumidos por `podeNoModulo`).

| Função | Faz | Guard (na action que chama) |
|---|---|---|
| `listarPerfis()` | `prisma.perfil.findMany` → `{ id, nome, acessosModulos }`, ordenados por nome | — (leitura) |
| `salvarTemplate(perfilId, acessos)` | `normalizarAcessos` → `prisma.perfil.update` | `isSuperAdmin`; recusa Admin |
| `listarOverridesDaLoja(lojaId)` | `tenantPrisma(prisma,lojaId).perfilOverrideLoja.findMany({})` → `Map<perfilId, acessosModulos>` | — (leitura escopada) |
| `salvarOverride(lojaId, perfilId, acessos)` | `normalizarAcessos`; `findFirst({where:{perfilId}})` → `updateMany` se existe, senão `create` | `ehAdminDaLoja`; recusa Admin |
| `removerOverride(lojaId, perfilId)` | `tenantPrisma(...).perfilOverrideLoja.deleteMany({ where:{ perfilId } })` (idempotente) | `ehAdminDaLoja` |

Adicionar `PERFIL_RECEPCAO_ID = "perfil-recepcao"` às constantes em `usuarios.ts`. Definir a lista de **perfis operacionais editáveis** = todo perfil com `id !== PERFIL_ADMIN_ID`.

---

## 8. Tratamento de erros / casos de borda

- **Sem permissão** (super-admin/admin) nas actions → redirect/retorno de erro (não silenciar). Defesa em profundidade além do guard de página.
- **Tentativa de editar Admin** (form forjado) → action recusa explicitamente (`perfilId === PERFIL_ADMIN_ID`).
- **Estado incoerente** do form → corrigido por `normalizarAcessos` antes de gravar.
- **Shape velho no snapshot** após adição de módulo/ação → `normalizarAcessos` reconcilia (fail-closed).
- **Restaurar override inexistente** → `deleteMany` idempotente (count 0; sem exceção).
- **Concorrência** no mesmo `(lojaId, perfilId)`: PK composta impede duplicata; um `create` em corrida lança `P2002` (aceitável numa tela de config; raríssimo).
- **`force-dynamic`** nas duas páginas → estado de permissão nunca cacheado entre requests.
- **Cascade:** apagar loja/perfil remove os overrides associados.

---

## 9. Testes

- **`normalizarAcessos`** (puro): respeita conhecidas; descarta desconhecidas; módulo/ação novo → `false`; coerção `criar||editar ⇒ ver`; shape completo de saída.
- **`resolverAcessosEfetivos`** (puro): override presente → usa override normalizado; ausente (`null`) → template normalizado.
- **`podeNoModulo`** (Prisma real): override > template; ausência de override → template; super-admin → true; perfil Admin → true (independe de flags); sem vínculo → false; módulo novo em loja customizada → false.
- **Data layer** (`perfis.ts`, Prisma real via `tenantPrisma`): `salvarTemplate`; `salvarOverride` (cria, depois atualiza, vira Personalizado); `removerOverride` (volta a Padrão / idempotente); `listarOverridesDaLoja` **escopado** — zero-vazamento entre lojas (usar `proveZeroVazamento` de `tests/tenant.proveZeroVazamento.test.ts`).
- **`seed.test`**: inalterado (templates seguem o seed). Opcional: assertar `listarPerfis()`.
- **Smoke** (porta 5050): admin liga `vestidos.criar` da Vendedora → vendedora **daquela loja** cria vestido; outra loja não afetada; "Restaurar padrão" → vendedora volta read-only. Super-admin altera template em `/admin/perfis` → reflete em loja sem override.

Gates: `npm test` verde, `tsc --noEmit` limpo, smoke end-to-end.

---

## 10. Fora de escopo (YAGNI / fatias futuras)

- Edição do perfil Admin (acesso total por definição).
- Módulo `config` na grade (entra quando houver superfície gateada por ele).
- Criação/remoção de perfis operacionais novos via UI.
- Auditoria/histórico de quem mudou permissão e quando.
- Visão cross-loja de overrides para o super-admin (função explícita separada, se um dia necessária).
- Semântica delta por célula (decidido: snapshot).
