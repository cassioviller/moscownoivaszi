# Unificação `main` × `feat/orcamentos` — Mapa de cobertura tela↔backend + Plano

> Data: 2026-07-15. Decisão de estratégia: **unificar** (não escolher-e-descartar).
> **Tronco = `main`** (backend tipado maduro: 15 rotas modulares, schema Drizzle de
> 12 arquivos, openapi de 2573 linhas, 113 testes de API + 39 E2E verdes).
> **Ativo colhido do `feat/orcamentos` = a camada de UI/telas** (~43 telas em
> `src/app`, o dobro-a-triplo do frontend do `main`), re-fiada de server-actions
> para o **client tipado gerado** do `main`.

## Por que esta direção

Os dois lados são o **mesmo stack** (Vite + Express + Drizzle) mas amadureceram em
camadas opostas: `main` no backend/contrato/dados+testes; `orcamentos` na largura
de produto do frontend. Como a re-fiação de dados do frontend (server-actions →
client gerado) **acontece de qualquer forma**, o tronco certo é o que preserva o
maior ativo já testado — o **backend do `main`**. Reconstruir backend+schema+113
testes sobre o orcamentos seria muito mais caro e jogaria fora o ativo testado.

Os 3 branches antigos (`conserto-provas-ajustes`, `dia-do-atelier`,
`jornada-derivada`) usam layout pré-monorepo e estão **contidos no orcamentos** →
superados, seguros para arquivar.

---

## Mapa de cobertura agregado (≈43 telas)

Legenda: **COBERTO** (endpoint+schema do `main` já servem) · **AGREG-CLIENTE**
(dados existem, cálculo no front) · **GAP-ENDPOINT** (schema OK, falta forma de
rota) · **GAP-SCHEMA** (falta coluna/tabela ou o modelo diverge) · **GAP-NOVO**
(capacidade inexistente no backend).

| Módulo | Telas | COBERTO / AGREG | GAP-ENDPOINT | GAP-SCHEMA | GAP-NOVO |
|---|---|---|---|---|---|
| Catálogo & Vestidos | 8 | **8** | — (niceties) | — | — |
| Agenda/Atend./Ajustes/Provas/Reservas | 8 | 4 | 4 | — | — |
| Noivas/Leads & Orçamentos | 7 | 6 | 1 | — | — |
| Contratos | 4 | 2 | 1 | — | 1 (PDF) |
| Financeiro | 10 | 1 | 4 | 3 | 2 |
| Admin/Equipe/Permissões/Auth | 6 | 3 | 1 | 2 | — |
| **Total** | **43** | **~24** | **~11** | **~5** | **~3** |

**Leitura:** ~56% das telas já têm backend pronto no `main`; ~26% precisam só de
forma de endpoint (schema já cobre); ~12% exigem mudança de schema; ~7% são
capacidade nova. **O grosso do esforço é frontend** (portar+re-fiar 43 telas); os
gaps de backend são concentrados e nomeáveis (abaixo).

---

## Os gaps de backend, por alavancagem

### Alta alavancagem (destravam vários)
1. **`pagamentos` é write-only** — o `main` grava `pagamentos` dentro de
   `POST …/pagar` mas **nunca os lê de volta**. Um único `GET /financeiro/pagamentos`
   (filtro por intervalo/colaborador) destrava o *caixa realizado* de **fluxo, DRE
   (despesas regime-caixa), projeção (saldoHoje), folha (histórico) e exportar**.
2. **Enriquecimento relacional nos GET** — `GET /atendimentos|/ajustes|/bloqueios`
   retornam linhas planas; as telas de fila/lista/detalhe precisam de joins
   (vestido código/nome, noiva, casamentoData via bloqueio, contagem de checklist,
   provas com ajustes aninhados). Adicionar params `with`/include (sem migração).

### GAP-SCHEMA (exigem migração + ajuste de contrato/motor)
3. **Comissão** — orcamentos tem faixas **por vendedora** com `minAcumulado`/
   `maxAcumulado`/`bonusFixo`/`vigenciaInicio`/`bonusAcumulaFaixas` e fechamento com
   `valorBonus`/`percentualAplicado`/`valorTotal`; `main` só tem faixas **globais**
   planas (`minimoVenda`+`percentual`) e `regraGlobal` como texto. Remodelar
   `comissao_regras`/`comissao_faixas`/`comissao_fechamentos` + motor de fechamento.
4. **RBAC nível-ação** — orcamentos usa `acessosModulos = {modulo:{ver,criar,editar}}`
   com `podeNoModulo(...,acao)`; `main` é **flat por módulo** (`record<string,boolean>`)
   nos bodies Zod (`PerfilInput`/`PerfilUpdate`/`PerfilOverrideInput`) e no guard
   (`requireModulo` any-true). A coluna já é `jsonb` (aceita o shape aninhado); mudar
   os schemas Zod de input + o middleware de enforcement.
5. **`saldos_referencia`** — `main` chaveia por `competencia` (YYYY-MM,
   `unique(loja,competencia)`); a projeção do orcamentos ancora por
   `dataReferencia` (dia específico). Adicionar/trocar coluna.

### GAP-NOVO (capacidade net-new)
6. **PDF de contrato** — `main` não tem NENHUMA geração de PDF (grep zerado). Portar
   o gerador (`lib/contratos/pdf.ts`) + endpoint `GET /contratos/{id}/pdf` (dados já
   existem; expor `loja.nome` e `lead.whatsapp` na resposta).
7. **Folha de pagamento** — gerar folha idempotente a partir de salários
   recorrentes, listar pagamentos por colaborador, flag `enviadoContabilidadeEm`
   (campo existe, sem rota) e **exportar XLSX** por período.

### GAP-ENDPOINT pontuais (schema já suporta)
- `PATCH /orcamentos/itens/{itemId}` (editar valor/qtd/desc do item — hoje só add/remove).
- Checklist de ajustes: sub-recurso `/ajustes/{id}/checklist` (POST/PATCH/DELETE) — tabela `ajuste_checklist_itens` existe, zero rotas.
- Contratos: `cancelar` com `destinoPago` (estornar parcelas PAGAS) + gerar-plano/remover-parcela/estornar-recebimento.
- Financeiro: `estornarRecebimento`, `DELETE conta`, `estornarPagamento`, pagamento **multi-conta** (1 saída quita N contas — `pagamento_itens` já suporta).
- Admin: listar "admins com suas lojas" + criação composta Usuário+vínculos (`POST /admin/usuarios` hoje só grava a linha de usuário).

---

## Plano de unificação (ondas com portão de qualidade)

Cada onda termina com **typecheck verde + testes verdes** antes da próxima.
Frontend: cada tela portada troca server-action → **client gerado + react-query**.

### Onda 0 — Fundação
- Confirmar tronco = `main` (working tree atual).
- **Decisão de navegação/roteamento**: adotar a estrutura rica do orcamentos
  (`/loja/[lojaId]/…`) reimplementada em **Vite + react-router** consumindo o client
  gerado (abandonar server-components/`'use server'`). Montar layout/rotas base.
- Arquivar os 3 branches superados.

### Onda 1 — Módulos COBERTO (baixo risco, valor imediato)
Portar: **Catálogo, Vestidos, Leads/Noivas, Orçamentos, Auth, Equipe**.
Fechar junto os GAP-ENDPOINT triviais: `PATCH /orcamentos/itens/{id}`, derivações de
GET-by-id. Sem migração de banco.

### Onda 2 — Enriquecimento relacional + sub-recursos ✅ (backend 973af4c, telas 883882b)
Adicionar params `with`/include em `GET atendimentos|ajustes|bloqueios`; checklist
CRUD; listagens de provas/reservas; detalhe de contrato (cancelar `destinoPago`,
plano de parcelas, estornos). Portar: **Agenda/Atendimentos/Ajustes/Provas/Reservas
+ Contratos** (menos PDF). Sem migração.

### Onda 3 — `GET pagamentos` + financeiro realizado ✅ (backend c60c847, núcleo 71334f3, telas)
Expor pagamentos (filtro intervalo/colaborador). Destrava e porta: **fluxo, DRE,
projeção (curva), cobrança, receber, pagar** — a maioria vira agregação-cliente.
Fechar estornos/DELETE/multi-conta. Sem migração (só leitura + rotas sobre schema
existente).

`/financeiro` passou a ser o **fluxo de caixa** (o hub, leitura pura), com as
demais como recorte (`dre`, `projecao`) ou ação (`receber`, `pagar`, `cobranca`);
o `index.tsx` de placeholder saiu. Agregação toda no núcleo testado de
`src/lib/financeiro` (82 testes), telas só resolvem intervalo, buscam e desenham.
E2E: 39 → 58.

Dívidas conhecidas, deliberadas:
- **Folha** — `financeiro/pagar` mostra os salários recorrentes só para leitura,
  para a capacidade não sumir da interface; gerar folha/histórico/XLSX é Onda 5.
- **Projeção** — ancora no saldo da *competência* mais recente aplicável, não no
  dia: é o GAP-SCHEMA nº 5, que a Onda 4 resolve trocando a coluna.
- **Cobrança** — sem o histórico/registro de cobrança inline:
  `listRegistrosCobranca` é por lead e exigiria N requests; cabe atrás de um
  accordion por noiva (query lazy) numa onda futura.
- **Gate de permissão por ação** (`financeiro:ver/editar`) não existe no cliente
  em nenhuma tela — a sidebar filtra por módulo e o backend gateia. É a Onda 4.

### Onda 4 — GAP-SCHEMA (migração de banco)
- ✅ `saldos_referencia`: competência→data (ancora a projeção).
- **Comissão**: remodelar regras/faixas por-vendedora + campos de fechamento + motor.
- ✅ **RBAC nível-ação**: `acessosModulos` record<bool> → record<{ver,criar,editar}>.
Cada migração aplicada via `pnpm --filter @workspace/db run push` no banco de dev.

**Saldos (feito).** `competencia` (YYYY-MM) → `dataReferencia` (dia), `unique(loja,
dataReferencia)`. A tabela estava vazia, então nada foi migrado. A peça que faltava
não era a coluna: `valor` é o saldo no **início** do dia ancorado, e o saldo de hoje
é âncora **+ realizado desde ela** (`lib/financeiro/saldo.ts`, 11 testes). Sem esse
rolamento a curva inteira nasce no nível errado.

**RBAC (feito).** Duas invariantes, testadas: o shape vem do **código** (fail-closed
— chave desconhecida descartada, ausente = false) e `criar || editar ⇒ ver`. O guard
deriva a ação do método HTTP (GET→ver, POST→criar, resto→editar); passe a ação
explícita quando a rota mentir sobre o que faz. **Sem migração de dados**: `true`
valia o módulo inteiro e é traduzido na leitura e na escrita, então um perfil gravado
antes não é trancado para fora (o `/auth/me` passa com a linha plana ainda no banco)
e as linhas se normalizam sozinhas na próxima escrita.

> `drizzle-kit push` pede confirmação **interativa** ao dropar/renomear coluna e não
> tem TTY aqui: aplique o DDL equivalente por `psql` e rode o push depois para
> confirmar que o schema bate ("Changes applied", sem prompt).

### Onda 5 — GAP-NOVO
- **PDF de contrato** (gerador + endpoint).
- **Folha**: geração idempotente + histórico de pagamentos + flag contabilidade +
  export XLSX. Portar as telas `financeiro/pagar/folha[/exportar]`.

### Onda 6 — Verificação
Estender a suíte (113 API + 39 E2E) cobrindo os novos endpoints e as telas portadas.
Meta: typecheck verde, testes de API verdes, E2E cobrindo os módulos unificados.

---

## Riscos / decisões

Decisões fechadas em 2026-07-15:

- **Roteamento**: **confirmado** manter `/loja/[lojaId]/…` (orcamentos),
  reimplementado em react-router aninhado consumindo o client gerado.
- **Comissão e RBAC nível-ação**: **confirmado** remodelar na Onda 4 conforme o
  plano (fidelidade total ao orcamentos), sem adiar.

Riscos:

- **Custo real = frontend** (portar+re-fiar 43 telas). É a maior fatia e o maior
  risco de prazo; as ondas 1–3 entregam a maior parte com backend já pronto.
- **PDF/Folha/XLSX** (Onda 5) são isoláveis — podem ir por último sem bloquear nada.
