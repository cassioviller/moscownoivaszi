# Spec — DRE por categoria (resultado do mês: receitas − despesas)

> **Fatia 3 de 3** melhorias do financeiro (2026-06-14): (1) Projeção de caixa [feita],
> (2) Cobrança/inadimplência [feita], (3) **DRE por categoria** [esta]. Um demonstrativo
> simples do mês: *quanto entrou, para onde foi (por categoria) e quanto sobrou.* Leitura
> **pura** sobre o que S4/S5 já gravam — **sem tabela nova, sem migração, sem escrita**.

---

## 1. Problema

O Fluxo de caixa (S7) mostra entradas e saídas do mês como **dois números** e uma linha do
tempo, mas não responde *"para onde foi o dinheiro?"*. Falta o demonstrativo de resultado
(DRE) simples: **receitas − despesas agrupadas por categoria = resultado do mês**. É o que o
dono precisa para entender a saúde do atelier mês a mês.

## 2. O que já existe (e a spec reusa, sem alterar)

- **Receita realizada** = `Parcela` `status=PAGA` (`valorRecebido`, `recebidoEm`).
- **Despesa realizada** = `Pagamento` (`data`, `valorPago`) com `itens` `PagamentoItem`
  (`valor`, `contaPagarId`) → `ContaPagar` (`categoria String?`, `tipo` DESPESA/FORNECEDOR/SALARIO/COMISSAO).
  Um pagamento quita N contas; cada `PagamentoItem.valor` é quanto daquele pagamento foi para aquela conta.
- `@/lib/financeiro/datas`: `competenciaValida`, `competenciaAtual`, `competenciaRange(comp)` → `{ gte, lt }`.
- `@/lib/financeiro/fluxo.ts`: `resumoCaixa`/`resumoCaixaIntervalo` (o realizado consolidado — mesma fonte).
- `@/lib/dinheiro` (centavos), `tenantPrisma`, gate `financeiro` (`exigirAcesso`).

## 3. Princípios

1. **Regime de caixa (realizado), não competência.** Decisão do dono: o DRE mostra o que **de
   fato** entrou (parcela paga por `recebidoEm`) e saiu (pagamento por `data`) no mês — bate com
   o caixa e com o S7. Não é o "regime contábil por competência".
2. **Despesa por categoria, com fallback no tipo.** Decisão do dono: agrupa pela `categoria`
   (texto livre) quando houver; senão pelo rótulo do `tipo` (Salários/Comissões/Fornecedores/Despesas).
   Nada fica como "sem categoria".
3. **Receita é uma linha só.** Parcela/Contrato não têm categoria de receita — então receita é
   um total ("Recebimentos"), sem subdivisão. (YAGNI: não inventar dimensão que o dado não tem.)
4. **Leitura pura.** Sem tabela nova, sem migração, sem Server Action. Tela read-only, gate `financeiro:ver`.
5. **Centavos, sem float. Competência YYYY-MM. Multi-tenant fechado.**

## 4. Decisões travadas no brainstorming (2026-06-14)

| Pergunta | Decisão |
|---|---|
| Regime | **Caixa / realizado** (recebidoEm / data do pagamento). |
| Agrupamento de despesa | **Por `categoria`, com fallback no rótulo do `tipo`.** |
| Receita | **Uma linha** (sem categoria — o dado não existe). |
| Período | **Competência mensal** selecionável (default mês atual), via `?comp=`. |

## 5. Modelo de dados

**Nenhuma mudança.** Tudo deriva de `Parcela`, `Pagamento`, `PagamentoItem`, `ContaPagar`.

## 6. Motor — `src/lib/financeiro/dre.ts` (novo)

### 6.1 `rotuloCategoria` (pura)
```
import type { ContaPagarTipo } from "@/generated/prisma/client";
rotuloCategoria(categoria: string | null, tipo: ContaPagarTipo): string
```
- `categoria?.trim()` se não vazio → usa a categoria livre.
- senão → rótulo do tipo: `DESPESA→"Despesas"`, `FORNECEDOR→"Fornecedores"`, `SALARIO→"Salários"`, `COMISSAO→"Comissões"`.

### 6.2 `dreDoMes` (leitura)
```
type LinhaDespesa = { rotulo: string; total: string };
type DRE = {
  competencia: string;
  receitas: string;
  despesas: LinhaDespesa[]; // maior total primeiro
  totalDespesas: string;
  resultado: string; // receitas − totalDespesas (pode ser negativo)
};
dreDoMes(lojaId: string, competencia: string): Promise<DRE>
```
- `competencia` inválida → DRE zerado (`receitas:"0.00"`, `despesas:[]`, etc.), espelhando `resumoCaixa`.
- `{ gte, lt } = competenciaRange(competencia)`.
- **Receitas** = `db.parcela.aggregate({ where: { status: "PAGA", recebidoEm: { gte, lt } }, _sum: { valorRecebido } })`.
- **Despesas** = `db.pagamentoItem.findMany({ where: { pagamento: { data: { gte, lt } } }, select: { valor, contaPagar: { select: { categoria, tipo } } } })`,
  agrupadas em memória por `rotuloCategoria(categoria, tipo)`, somando `valor` (centavos). `despesas` ordenado por total desc.
- `totalDespesas` = soma de todas as linhas. `resultado` = receitas − totalDespesas.
- Tudo em centavos; strings só na borda (`deCentavos`).

> Consistência com o S7: a soma de `PagamentoItem.valor` de um pagamento iguala seu `valorPago`,
> então `totalDespesas` bate com as saídas do `resumoCaixa` do mês.

## 7. Tela — `/loja/[lojaId]/financeiro/dre`
Server Component, `force-dynamic`, gate `financeiro:ver` (`exigirAcesso("financeiro")`). Read-only.

1. **Cabeçalho** — "Resultado do mês" (ou "DRE") + link "← Fluxo de caixa".
2. **Seletor de competência** — mês anterior / próximo via `?comp=YYYY-MM` (reusa `competenciaRange`/navegação
   de mês; default `competenciaAtual()`); rótulo do mês por extenso.
3. **Receitas** — uma linha: "Recebimentos" + total (tinta).
4. **Despesas por categoria** — lista (maior primeiro): `{rótulo} · −{total}`.
5. **Resultado do mês** — número grande; **bordô se negativo**, tinta se positivo.
6. **Estado vazio** — se receitas e despesas forem zero no mês: "Nenhum movimento neste mês."
7. Link de entrada a partir do **Fluxo de caixa** (`/financeiro`).

**Sem gráfico** (DESIGN §13) — listas legíveis. Tom Concierge; bordô só no resultado negativo.

## 8. Testes (TDD)

**Unitário puro — `rotuloCategoria`:**
- categoria "Aluguel" → "Aluguel"; categoria `"  "`/null + tipo SALARIO → "Salários"; null + FORNECEDOR → "Fornecedores"; null + COMISSAO → "Comissões"; null + DESPESA → "Despesas".

**Integração — `dreDoMes`** (Postgres real, prefixo `MARK`, limpeza em `afterAll`):
- monta receita (parcela PAGA recebida na competência) + um Pagamento com 2 itens (uma conta com
  `categoria="Aluguel"`, outra `tipo=SALARIO` sem categoria) com `data` na competência;
- confere `receitas`, `despesas` (linha "Aluguel" e linha "Salários" com totais certos, maior primeiro),
  `totalDespesas` e `resultado`;
- movimento de outra competência **não** entra; competência inválida → DRE zerado;
- isolamento de loja.

## 9. Transversais
- Centavos via `@/lib/dinheiro`; competência via `@/lib/financeiro/datas`.
- Multi-tenant: queries via `tenantPrisma` (PagamentoItem/Parcela já em `TENANT_MODELS`).
- Gate `financeiro:ver`. **Sem escrita** → sem `financeiro:editar`, sem Server Action, sem migração.
- Gates verdes (`tsc` limpo + `vitest`) antes de cada commit na `main`.

## 10. Não-objetivos (YAGNI)
- Regime de competência (a-vencer).
- Categoria de receita (o dado não existe; não criar).
- Gráficos/charts; exportação (PDF/planilha) — a contabilidade já tem export próprio (S5).
- Comparação entre meses / tendência (o S7 já tem `tendenciaCaixa`).
- Edição de categoria pela tela do DRE.

## 11. Arquivos (visão macro)
**Criar:**
- `src/lib/financeiro/dre.ts` — `rotuloCategoria` (pura) + `dreDoMes`.
- `src/lib/financeiro/__tests__/dre.test.ts` — unit + integração.
- `src/app/(app)/loja/[lojaId]/financeiro/dre/page.tsx` — a tela.

**Modificar:**
- `src/app/(app)/loja/[lojaId]/financeiro/page.tsx` — link "Resultado do mês / DRE".

## 12. Definição de pronto
Tela `/financeiro/dre` mostrando, por competência selecionável, receitas, despesas por categoria
(com fallback no tipo) e o resultado (bordô se negativo); `rotuloCategoria` e `dreDoMes` testados;
`tsc` limpo e `vitest` verde; commits na `main`.
