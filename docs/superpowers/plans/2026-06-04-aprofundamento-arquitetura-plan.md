# Plano — Aprofundamento de arquitetura (Moscow Noivas)

> Origem: revisão `improve-codebase-architecture` de 2026-06-04 (relatório HTML).
> Estes são **refactors de qualidade** (não bugs): transformar módulos rasos em profundos —
> mais *locality* (mudança/bug/conhecimento num lugar) e *leverage* (interface pequena, muito
> comportamento). **Regra do projeto:** cada fase é uma fatia vertical, `tsc` limpo + `vitest`
> verde antes de commitar **na `main`**. Sem mudança de comportamento observável (exceto onde
> dito). Ordem: menor risco / fundação → maior leverage → maior risco estrutural.

## Princípios deste plano

1. **Comportamento idêntico.** Cada fase é refactor puro; os 343 testes seguem verdes a cada commit.
2. **Fatias finas.** Nunca migrar 50 arquivos de uma vez — provar o seam em 2–3 chamadores, depois rolar.
3. **Profundidade real, não casca.** Se uma extração só repassa (adapter raso), não fazer — está
   marcado como **Fora** abaixo, com a razão.
4. **Sem reabrir decisões de domínio.** A jornada continua **derivada** (read); não introduzir
   write-seam só por simetria.

---

## Fase 0 — Fundações seguras (reuso puro)

Pré-requisito barato das demais; risco baixíssimo.

### 0a. Módulo único de tempo/UTC  *(Candidato 6a)*
- **Problema:** `hojeUTC` (×3), `meiaNoiteUTC` (×3), `diaValido` (×2) reimplementados em
  `disponibilidade/reservas.ts`, `atelier/provas.ts`, `atendimentos/atendimentos.ts`; convenção de
  fuso fragmentada entre `disponibilidade/datas.ts` e `financeiro/datas.ts`.
- **Seam:** `src/lib/tempo.ts` — `hojeUTC()`, `meiaNoiteUTC(d)`, `diaValido(ymd)`, `ymd(d)`.
  (Mantém a convenção “meia-noite UTC do dia-calendário em SP” num só lugar; `financeiro/datas.ts`
  e `disponibilidade/datas.ts` passam a reexportar/usar daí, sem quebrar imports.)
- **Dentro:** mover as 8 cópias; trocar imports.
- **Fora:** unificar `financeiro/datas.ts` e `disponibilidade/datas.ts` num arquivo só (deixar como
  reexports — mover tudo é churn sem ganho).
- **Testes:** já há testes de data; adicionar um teste pequeno de `tempo.ts` (borda de mês/fuso).
- **Risco:** baixo. **Verificação:** gates.

### 0b. Reuso do formatter de dinheiro  *(Candidato 3 — parte segura)*
- **Problema:** `brl`/`brlNoiva` redefinidos inline em `orcamentos/page`, `contratos/page`,
  `noivas/[id]/page` etc., apesar de `brl` já viver em `@/lib/dinheiro`.
- **Seam:** importar `brl` de `@/lib/dinheiro` em todas as páginas; apagar as cópias.
- **Fora (especulativo):** value object `Moeda` (encapsular centavos↔string↔Decimal). Os 3 helpers
  atuais bastam; classe nova tocaria todo o lib sem ganho claro. **Não fazer** sem necessidade.
- **Risco:** baixo. **Verificação:** gates + render das páginas.

---

## Fase 1 — Contrato de mensagens de erro type-safe  *(Candidato 1)*

- **Problema:** `motivo` (lib) → `?erro=` (action) → `AVISOS[motivo]` (page): três cópias do mesmo
  contrato, sem checagem; renomear o `motivo` deixa a página em branco (falha silenciosa).
- **Decisão de altitude (a confirmar no início):** manter a **mensagem pt-BR na borda (UI)** — não
  poluir o domínio com cópia — porém tornar o contrato `motivo↔mensagem` **verificável por tipo**:
  cada módulo do lib exporta o *union* de `motivo` (já exporta), e a página usa um mapa
  `satisfies Record<Motivo, string>` para que um motivo sem mensagem vire **erro de compilação**.
  - Alternativa (se preferir centralizar): `src/lib/mensagens.ts` com registro por módulo. Decidir antes.
- **Dentro:** exportar os tipos de `motivo` de cada data layer; converter os `AVISOS` das páginas para
  `satisfies`; rolar por feature (financeiro → orçamentos → contratos → atendimentos → reservas/provas/ajustes).
- **Fora:** unificar todos os textos num arquivo só (perde locality da cópia por tela).
- **Testes:** o ganho é em tempo de compilação; sem novo teste de runtime. `tsc` é o gate-chave.
- **Risco:** baixo-médio (muitos arquivos, mecânico). **Fatiar por feature.**

---

## Fase 2 — Seam de autorização  *(Candidato 2 — recomendação principal)*

O de maior leverage e maior risco. Provar pequeno antes de rolar.

### 2a. Desenhar e provar (financeiro)
- **Seam de action:** `acaoAutorizada(modulo, acao, fn)` — HOF que retorna uma Server Action;
  concentra `getSessaoComLoja` → `/login`, `podeNoModulo` → `redirect(volta)`, extração de
  `FormData`/`lojaId`, e o `redirect(comAviso(...))` final. A action vira só o corpo do negócio.
- **Seam de página:** `paginaProtegida(modulo, acao, render)` (ou helper que devolve `{sc, podeEditar}`)
  para o preâmbulo `getSessaoComLoja + podeNoModulo(...ver) + redirect`.
- **Provar** em `financeiro/{receber,pagar,comissoes}` (actions + pages) — medir redução de LOC e
  confirmar a semântica de Server Actions do Next (funções `async` exportadas; o HOF precisa devolver
  uma action válida — **ponto de validação crítico**).
- **Risco:** médio-alto (segurança + regras do Next). Se o HOF não casar com o modelo de Server Actions,
  recuar para um helper menor (só `guardEditar(...)` + `comAviso` compartilhado) que ainda dedup.

### 2b. Rollout
- Migrar as ~36 actions e ~14 pages restantes, **uma feature por commit**, gates verdes a cada uma.
- **Fora:** abstrair o `?ok/?erro` num framework próprio além do `comAviso` compartilhado.

---

## Fase 3 — Predicado de atraso (financeiro)  *(Candidato 4 — parte segura)*

- **Problema:** `atrasadaDe(status, vencimento, hoje)` duplicado em `receber.ts` e `pagar.ts`,
  aplicado em 5 lugares.
- **Seam:** `ehAtrasada(ob, hoje)` em um módulo financeiro compartilhado (ex.: `financeiro/obrigacao.ts`),
  sobre o tipo mínimo `{ status; vencimento }`. Receber e pagar importam.
- **Fora (avaliar, não commitar às cegas):** unificar **toda** a carteira (resumo + filtro + listagem)
  num módulo polimórfico. Receber dá baixa **por parcela**; pagar quita **N contas num Pagamento** —
  modelos de quitação diferentes; alto risco de virar abstração rasa com adapters que só repassam.
  **Decisão:** fazer só o predicado agora; a carteira fica para um grilling dedicado **se** doer.
- **Testes:** mover/garantir cobertura do predicado. **Risco:** baixo.

---

## Fase 4 — Consolidar a leitura da jornada  *(Candidato 5 — parte concreta)*

- **Problema:** `painel.ts` re-deriva a etapa e a regra de “noiva ativa”; `noivaAtiva()` é privada em
  `jornada.ts`; `ESTAGIOS_ATENCAO` hard-coded no painel; `INCLUDE_JORNADA` duplicado entre `leads.ts` e
  `painel.ts` (novo fato = editar 3+ lugares).
- **Seam:** concentrar em `leads/jornada` (ou `leads/jornada-queries.ts`): um único `INCLUDE_JORNADA`,
  exportar `noivaAtiva`, e bulk helpers (`noivasAtivas(lojaId)`, `estatisticasPorEstagio(lojaId)`,
  `noivasComAtencao(lojaId)`). `painel.ts` e a lista de noivas passam a **delegar**, não re-derivar.
- **Fora (especulativo):** **write-seam** central (“aplicar fato → mover jornada” que todos os módulos
  chamam). A derivação ser pura-leitura é uma feature do design atual; não introduzir só por simetria.
  Registrar como ADR se rejeitado em definitivo.
- **Testes:** a derivação pura já é testável; adicionar testes dos bulk helpers. **Risco:** baixo-médio.

---

## Fase 5 — Quebrar `reservas.ts` (530 linhas)  *(Candidato 6b)*

- **Problema:** um módulo faz 5 papéis (queries, mutações, ponte com o motor, máquina de estados de
  retirada/devolução, utils de data). Interface promete “reservar vestido”, esconde um saco de gatos.
- **Seam:** `reservas-queries.ts` (as ~11 leituras), `reservas-mutations.ts` (reservar/cancelar/
  movimentar). A **máquina de estados de retirada↔devolução** vira seu próprio seam testável.
  `reservas.ts` permanece como **fachada fina** (reexports) — sem quebrar imports atuais.
- **Fora:** mexer no motor puro (`motor.ts`) — já está bem separado.
- **Testes:** o split deve preservar os testes existentes; adicionar teste do seam de estados.
- **Risco:** médio (arquivo grande, central à operação). Fazer por último, com cuidado.

---

## Sequência e dependências

```
Fase 0 (0a tempo · 0b brl)        ── seguras, em paralelo, fundação
   └─ Fase 1 (erros type-safe)    ── mecânico, por feature
        └─ Fase 2 (autorização)   ── 2a provar no financeiro → 2b rollout
             └─ Fase 3 (ehAtrasada)
                  └─ Fase 4 (jornada-queries)
                       └─ Fase 5 (split reservas)
```

Cada fase é independente o bastante para parar entre elas. Fase 2 é a de maior valor — vale um
grilling antes de codar (semântica de Server Actions do Next).

## Explicitamente FORA (não fazer sem necessidade comprovada)

- Value object `Moeda` e `Competencia` como classes (os helpers atuais bastam).
- Unificação polimórfica total da carteira receber×pagar (modelos de quitação diferentes).
- Write-seam / event emitter da jornada (derivação pura é feature).
- Wrapper genérico de `$transaction` para auditoria (sem requisito de auditoria hoje).
- Repository pattern / cache de queries por tenant (escala não pede).

## Definição de pronto (do plano)

Os 6 candidatos endereçados nas suas **partes fortes/seguras**, com as partes especulativas
conscientemente adiadas (ou viradas ADR); `tsc` limpo e `vitest` verde a cada commit na `main`;
nenhuma mudança de comportamento observável nas telas.
