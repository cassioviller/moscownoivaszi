# Jornada da noiva — derivada dos fatos (+ marcos manuais)

> Registrado em **2026-06-01**. Sub-projeto **A** de três temas levantados (os outros:
> B = foto no cadastro do vestido; C = agenda em calendário). Este spec cobre só a jornada.

## Contexto / problema

A "jornada da noiva" é o coração do produto, mas hoje está **congelada**: `Lead.etapa`
nasce `NOVO` (`leads.ts`) e **nada no sistema avança a etapa** — nem preencher interesses,
nem reservar, nem registrar prova; e o formulário da noiva não tem campo de etapa. Resultado:
toda noiva aparece eternamente em "Novo". Além disso a **ordem** das etapas é de funil
comercial e não reflete o atelier (ex.: interesses como 2º passo, sendo que na prática é
preenchido na prova).

**Decisão (do dono):** a etapa passa a ser **derivada dos fatos** (nunca guardada/desatualizada);
onde não há fato no sistema, a equipe conclui a etapa com um **marco manual** (clique). A ordem
correta da jornada é:

1. Cadastrada · 2. Prova marcada · 3. Interesses preenchidos · 4. Orçamento aberto ·
5. Contrato fechado · 6. Em provas · 7. Vestido retirado · 8. Casamento realizado · 9. Devolução.

## Modelo das etapas (derivado + marco)

A etapa atual = **a etapa de maior índice cujo sinal está satisfeito** (as anteriores aparecem
como concluídas). Sinais:

| # | Etapa | Sinal de conclusão | Tipo |
|---|---|---|---|
| 1 | Cadastrada | a noiva existe | auto (base) |
| 2 | Prova marcada | existe uma Prova com comparecimento **AGENDADA** (em qualquer reserva da noiva) | auto |
| 3 | Interesses preenchidos | `LeadInteresse` com ≥1 característica (`LeadInteresseAtributo`) | auto |
| 4 | Orçamento aberto | `Lead.orcamentoAbertoEm` preenchido | **marco manual (provisório)** |
| 5 | Contrato fechado | `Lead.contratoFechadoEm` preenchido | **marco manual (provisório)** |
| 6 | Em provas | existe Prova com comparecimento **COMPARECEU** | auto |
| 7 | Vestido retirado | alguma reserva da noiva com `retiradaDataReal` | auto |
| 8 | Casamento realizado | `casamentoData` < hoje (meia-noite UTC de São Paulo) | auto |
| 9 | Devolução | alguma reserva com `devolucaoDataReal` | auto |

**Terminal "Perdida/Desistiu":** `Lead.perdidaEm` preenchido (marco manual) → jornada
**encerrada** com rótulo "Perdida", fora da linha normal (espelha o tratamento atual de
`DEVOLVIDO`/`PERDIDO` como "encerrada"). Devolução (#9) também encerra (positiva).

> **Provisório (#4/#5):** os marcos manuais de Orçamento/Contrato são ponte. A **próxima fatia**
> (Orçamento com histórico de negociação — entidade própria com valor, status Aberto→Fechado e
> trilha de alterações) substitui esses marcos por derivação real: #4 = orçamento aberto, #5 =
> orçamento fechado. Ver "Fora de escopo".

## Mudanças de dados

- **`Lead`** ganha 3 campos opcionais (migration aditiva, nullable): `orcamentoAbertoEm DateTime?`,
  `contratoFechadoEm DateTime?`, `perdidaEm DateTime?`.
- A coluna **`Lead.etapa`** (enum `LeadEtapa`) deixa de ser lida/escrita — fica **deprecada**
  (sem migração destrutiva, como `provaDataReal`). O enum permanece no schema enquanto a coluna
  existir. `criarLead` segue sem setar etapa (default do banco, ignorado).

## Função derivada (pura, testável)

Novo módulo `src/lib/leads/jornada.ts` (extrai/substitui o atual `jornadaDaNoiva` de `leads.ts`):

```ts
export type EstagioChave =
  | "cadastrada" | "prova_marcada" | "interesses" | "orcamento_aberto"
  | "contrato_fechado" | "em_provas" | "retirado" | "casamento" | "devolucao";

export type FatosJornada = {
  temProvaAgendada: boolean;
  temInteresse: boolean;
  orcamentoAbertoEm: Date | null;
  contratoFechadoEm: Date | null;
  temProvaRealizada: boolean;
  temRetirada: boolean;
  casamentoPassou: boolean;
  temDevolucao: boolean;
  perdidaEm: Date | null;
};

export type PassoJornada = { chave: EstagioChave; rotulo: string; estado: "feito" | "atual" | "futuro" };

export function estagioDaNoiva(f: FatosJornada): {
  passos: PassoJornada[];          // os 9 passos com estado
  atual: EstagioChave | null;      // null só se perdida sem nenhum passo satisfeito além de cadastrada
  encerrada: string | null;        // "Perdida" | "Devolvido" | null
};
```

Regra: calcula o maior índice satisfeito; marca passos < atual como `feito`, o atual como `atual`,
os demais `futuro`. `perdidaEm` → `encerrada: "Perdida"`. `temDevolucao` (#9 atual) → `encerrada:
"Devolvido"`. `ROTULO_ESTAGIO: Record<EstagioChave, string>` para os rótulos.

**Coleta dos fatos** (`src/lib/leads/jornada.ts` + data layer): a partir de um `Lead` com relações
— `interesse.atributos` (count), `bloqueios` (RESERVA_CASAMENTO: `retiradaDataReal`/`devolucaoDataReal`)
e suas `provas` (comparecimento) — montar `FatosJornada`. Helpers:
- `fatosDaNoiva(lojaId, leadId)` → `FatosJornada` (1 noiva, via `tenantPrisma` com include).
- `estagiosDasNoivas(lojaId)` → `Map<leadId, {atual, encerrada}>` (lote: carrega noivas ativas com
  as relações mínimas e computa em memória — barato no tamanho de uma boutique).

## Consumidores a migrar (deixam de ler `Lead.etapa`)

- **Perfil da noiva** (`noivas/[leadId]/page.tsx` + `PainelJornadaNoiva`): usa `estagioDaNoiva(fatosDaNoiva(...))`.
  Ganha controles de **marco manual** (gate `leads:editar`): "Marcar orçamento aberto", "Marcar
  contrato fechado", "Marcar como perdida" — cada um com desfazer. (`PassoJornada.etapa`→`chave`.)
- **Lista de noivas** (`noivas/page.tsx`): rótulo da etapa por noiva → `estagiosDasNoivas`.
- **Livro de reservas** (`reservas.ts: listarReservasDaLoja` / `reservas/page.tsx`): hoje inclui
  `lead.etapa`; passa a derivar o estágio da noiva da reserva (lote).
- **Dashboard** (`src/lib/loja/painel.ts`): hoje faz `groupBy("etapa")` e monta "atenções" filtrando
  `EM_PROVAS`/`ORCAMENTO_ABERTO`. Passa a **calcular o estágio derivado** das noivas ativas em memória:
  contagem por estágio (painel "jornada") e "atenções" = casamento ≤14d **e** estágio em
  {em_provas, orcamento_aberto}. `ROTULO_ETAPA`/`EtapaJornada` migram para os rótulos/chaves novos.

## Server Actions (marcos manuais)

Em `noivas/[leadId]/` (gate `leads:editar`, falha-fechada via `tenantPrisma`, redirect `?ok`/`?erro`):
- `marcarOrcamentoAbertoAction` / desfazer → seta/limpa `orcamentoAbertoEm`.
- `marcarContratoFechadoAction` / desfazer → `contratoFechadoEm`.
- `marcarPerdidaAction` / desfazer → `perdidaEm`.
Camada de dados em `src/lib/leads/leads.ts`: `definirMarcoJornada(lojaId, leadId, campo, ligar: boolean)`.

## Testes

- **`jornada.test.ts`** (puro, sem banco): tabela de combinações de `FatosJornada` → estágio atual +
  estados dos passos. Casos: só cadastrada; prova agendada (#2); interesse (#3); marcos manuais no meio
  (#4/#5); prova realizada com marcos vazios (#6, anteriores = feito); retirada (#7); casamento passou
  (#8); devolução (#9, encerrada "Devolvido"); perdida (encerrada "Perdida"); "maior índice satisfeito".
- **Integração** (`leads`/`painel`/`reservas`): `fatosDaNoiva`/`estagiosDasNoivas` refletem
  interesse/prova/reserva reais; `definirMarcoJornada` é escopado por loja; dashboard conta por estágio derivado.
- Gates: `node node_modules/vitest/vitest.mjs run` verde; `node node_modules/typescript/bin/tsc --noEmit` limpo.

## Verificação manual

App no ar (`:5000`): noiva nova mostra "Cadastrada"; reservar + registrar prova agendada → "Prova marcada";
preencher interesses → "Interesses preenchidos"; marcar orçamento/contrato → avança; prova com "Compareceu"
→ "Em provas"; retirada/casamento/devolução refletem; "Marcar como perdida" encerra. **Após a migração,
reiniciar o app (Run)** para recarregar o client Prisma.

## Fora de escopo (fast-follow / outros sub-projetos)

- **Orçamento com histórico de negociação** (próxima fatia): entidade `Orcamento` (valor, status
  Aberto→Fechado, trilha de alterações com valor/data/responsável/observação) ligada à noiva; substitui
  os marcos manuais #4/#5 por derivação real.
- **B — Foto no cadastro do vestido** e **C — Agenda em calendário**: sub-projetos separados, specs próprios.
- Remoção física da coluna `Lead.etapa` e do enum `LeadEtapa`: adiada (sem migração destrutiva agora).
