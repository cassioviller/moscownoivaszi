# 4 melhorias (financeiro + ateliê) — Design

**Data:** 2026-06-05
**Status:** Aprovado para planejamento
**Contexto:** ver `docs/FLUXO_DE_DADOS.md`

Quatro melhorias independentes, decididas com o dono:

1. **Exportação à contabilidade** em **XLSX**, itens pagos no período, e **baixar marca como enviado**.
2. **Paginação real** nas 5 listas operacionais/financeiras.
3. **Cobrir lacuna de teste** (atendimentos no intervalo / marcador de atendimento).
4. **DRY** do wiring do filtro de intervalo no financeiro.

Pontos abertos resolvidos: aceito o dep **`exceljs`**; paginação só nas **5 listas** (provas, ajustes, receber, pagar, pagamentos) — demais reusam o helper depois.

---

## #1 — Exportação à contabilidade (XLSX)

**Dependência nova:** `exceljs`.

**Camada de dados** — `src/lib/financeiro/contabilidade.ts`:
```ts
export type ItemContabil = {
  dataPagamento: Date;
  quem: string | null;        // colaborador.nome ?? fornecedor
  tipo: ContaPagarTipo;       // DESPESA | FORNECEDOR | SALARIO | COMISSAO
  descricao: string;
  competencia: string | null;
  valor: string;              // "1234.56"
  forma: string | null;
};
// Itens (PagamentoItem) cujo Pagamento.data ∈ [gte, lt). join pagamento + contaPagar.
export async function itensPagosNoIntervalo(lojaId: string, intervalo: { gte: Date; lt: Date }): Promise<ItemContabil[]>;
// Carimba enviadoContabilidadeEm dos Pagamentos do período ainda não marcados. Retorna quantos.
export async function marcarEnviadosNoIntervalo(lojaId: string, intervalo: { gte: Date; lt: Date }): Promise<number>;
```

**Planilha** — `src/lib/financeiro/planilha-contabilidade.ts` (isola o exceljs, testável no shape):
```ts
export async function montarPlanilhaContabilidade(itens: ItemContabil[]): Promise<Buffer>;
// 1 aba "Pagamentos", cabeçalho (Data, Quem, Tipo, Descrição, Competência, Valor, Forma) + linhas.
```

**Entrega** — route GET `src/app/(app)/loja/[lojaId]/financeiro/pagar/folha/exportar/route.ts`:
- `exigirAcesso("financeiro")`; lê `ini`/`fim` via `resolverIntervalo`.
- `itens = itensPagosNoIntervalo(...)`; se vazio, ainda gera planilha só com cabeçalho.
- `marcarEnviadosNoIntervalo(...)` (efeito de envio).
- Responde com `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` e `Content-Disposition: attachment; filename="contabilidade-<ini>-a-<fim>.xlsx"`.

**UI** — na página da Folha: botão `<a download href=".../exportar?ini&fim">Exportar à contabilidade (xlsx)</a>` (link `<a>` puro, não prefetcha; carrega `ini`/`fim` correntes). Texto ajuda: "Baixa os pagamentos do período e marca como enviados à contabilidade."

**Testes:** `montarPlanilhaContabilidade` (a planilha tem N+1 linhas; cabeçalho correto) — sem banco. `itensPagosNoIntervalo`/`marcarEnviadosNoIntervalo` — integração leve espelhando fixtures de pagamento.

---

## #2 — Paginação real (5 listas)

**Helper puro** — `src/lib/paginacao.ts`:
```ts
export const TAMANHO_PAGINA = 30;
export function paginar(paginaRaw: string | number | undefined, tamanho = TAMANHO_PAGINA): { pagina: number; skip: number; take: number };
// pagina ≥ 1 (inválida → 1); skip = (pagina-1)*tamanho; take = tamanho.
export function totalPaginas(total: number, tamanho = TAMANHO_PAGINA): number; // ceil, mínimo 1
```

**Mudança de contrato das leituras** — passam a aceitar `opts.pagina?` e a devolver `{ itens, total }` (um `count` a mais na mesma transação):
- `listarProvasDaLoja(lojaId, opts) → { itens: ProvaDaLoja[]; total: number }`
- `listarAjustesPendentes(lojaId, opts) → { itens: AjustePendente[]; total: number }`
- `listarContasAReceber(lojaId, opts) → { itens: ContaReceberView[]; total: number }`
- `listarContasAPagar(lojaId, opts) → { itens: ContaPagarView[]; total: number }`
- `listarPagamentos(lojaId, opts) → { itens: PagamentoView[]; total: number }`

**Callers a atualizar** (porque o retorno mudou de array → `{itens,total}`):
- páginas `/provas`, `/ajustes`, `/financeiro/receber`, `/financeiro/pagar`, `/financeiro/pagar/folha`;
- a aba **Provas & ajustes do calendário** (`AbaProvasAjustes`) — passa a pedir `tamanho`/página pequena e usa `.itens` (resolve de quebra o "preview sem cap");
- todos os testes que hoje fazem `(await listar...).length` / `.map` → `.itens`.

**UI de paginação** (Server Component, sem JS de cliente): rodapé com **‹ Anterior / Próxima ›** (links que preservam status/intervalo + `?p=`) e "Página X de Y · N itens". Some quando `total ≤ TAMANHO_PAGINA`.

**Testes:** `paginar`/`totalPaginas` puros (bordas: página 0/negativa → 1; skip/take; ceil). Integração: uma lista com > tamanho retorna `total` correto e a página certa.

---

## #3 — Cobrir lacuna de teste

**Arquivo:** estende `src/lib/calendario/__tests__/dados.test.ts` (ou novo `dados-atendimentos.test.ts`).
- `beforeAll`: cria loja, lead, **cabine**, **vendedora** (via `prisma.usuarioLoja` + usuário), e um **Atendimento** (via `agendarAtendimento` de `src/lib/atendimentos/atendimentos.ts`, ou create direto) com `inicio` dentro de um intervalo conhecido.
- Casos:
  - `atendimentosNoIntervalo(loja, [ini,fim))` inclui o atendimento dentro e exclui um fora.
  - `marcadoresNoIntervalo` contém um marcador `tipo: "atendimento"` no dia certo.
- `afterAll`: limpa por prefixo `MARK`.

---

## #4 — DRY do filtro do financeiro

**Helper** — `src/lib/financeiro/intervalo-params.ts` (ou adicionar a `ui.tsx`):
```ts
// Resolve ini/fim + página de um searchParams já awaited, e dá a querystring preservada.
export function lerFiltroFinanceiro(sp: Record<string, string | undefined>): {
  intervalo: IntervaloFinanceiro;     // { iniYMD, fimYMD, gte, lt }
  pagina: number;
  // monta querystring preservando ini/fim (+ extras), p/ links de status/paginação:
  qs(extra?: Record<string, string | number | undefined>): string;
};
```
As 5 páginas trocam o bloco repetido (`resolverIntervalo(sp.ini, sp.fim)` + montagem manual de querystring nos `href`) por `lerFiltroFinanceiro(sp)`. A render de `<FiltroIntervalo>` continua por página (cada uma com seu `hidden`), mas leitura + preservação ficam centralizadas. **Tem que conviver com #2** (preservar `p`) — por isso #4 entra antes de #2 no wiring das páginas.

**Teste:** `lerFiltroFinanceiro` puro (default = mês atual; `qs` preserva ini/fim e mescla extras; troca de filtro não perde o intervalo).

---

## Estratégia de execução (paralelismo seguro)

Como commitamos na `main` **sem worktrees**, edições paralelas no mesmo arquivo colidem. As páginas do financeiro são compartilhadas por #1/#2/#4. Plano:

- **Paralelo (fase 1):** trabalho de **camada-lib e arquivos novos**, em arquivos majoritariamente disjuntos:
  - #3 inteiro (testes de calendário) — isolado.
  - #1 camada: `contabilidade.ts` + `planilha-contabilidade.ts` + `exceljs` (+ testes).
  - #2 camada: `paginacao.ts` + mudança de contrato em `provas.ts`/`ajustes.ts`/`receber.ts`/`pagar.ts` (+ atualizar **testes** dessas libs) — NÃO toca páginas ainda.
  - #4 helper: `intervalo-params.ts` (+ teste) — não toca páginas ainda.
- **Serial (fase 2):** wiring das **páginas** (arquivos compartilhados), em ordem para não colidir:
  1. #4 — aplica `lerFiltroFinanceiro` nas 5 páginas.
  2. #2 — adiciona rodapé de paginação + usa `.itens` nas páginas (provas, ajustes, receber, pagar, folha) e na aba do calendário.
  3. #1 — botão de exportar na Folha + a route GET.

Gates a cada commit: `node node_modules/typescript/bin/tsc --noEmit` limpo e `npm run test` verde. Commits pequenos na `main`.

## Fora de escopo (YAGNI)
- Paginação em noivas/vestidos/contratos/orçamentos/reservas (reusam o helper depois).
- Formato de export além de XLSX; agendamento/envio automático à contabilidade.
- Paginação por cursor (offset basta nesta escala).
