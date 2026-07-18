# Plano — correção dos achados críticos da auditoria de 2026-07-16

> Diagnóstico completo (7 críticos, 15 importantes, 10 menores) verificado linha a
> linha em `main`. Este plano cobre a faixa **CRÍTICA** — risco agora. Os
> importantes seguem depois, por módulo.

Método, o mesmo que fechou o bug de cobrança: **provar o defeito com um teste que
falha antes**, corrigir, ver o teste passar, rodar a suíte inteira. Nada entra sem
regressão que trave a volta.

## Ordem de ataque

Escolhida por risco × custo: segurança barata primeiro, dinheiro sob concorrência
depois, integridade que a noiva vê por último.

| # | Achado | Arquivo âncora | Conserto recomendado |
|---|---|---|---|
| C1 | Equipe sem gate de módulo → auto-promoção a admin | `routes/equipe.ts:21` | `requireModulo("admin")` no router, como os demais |
| C5 | CSV da contabilidade: injeção de fórmula | `lib/folha.ts:130` | prefixar `'` quando o campo abre com `= + - @ tab` |
| C3 | Folha duplica salário sob concorrência | `schema/financeiro.ts:29` | unique parcial + `onConflictDoNothing` |
| C4 | Dois salários ativos → dobro | `routes/financeiro.ts:299` | unique parcial `WHERE ativo` + checagem no POST |
| C2 | Vazamento entre lojas por FK forjada | `routes/agenda.ts`,`reservas.ts` | validar cada FK contra `lojaId` antes do insert |
| C6 | Contrato soma parcelas em float | `routes/contratos.ts:134` | somar em centavos inteiros, igualdade exata |
| C7 | Snapshot do contrato perde o desconto | `routes/contratos.ts:124` | congelar o desconto no snapshot; itens − desconto = total |

C3 e C4 caem na mesma migração de schema (dois uniques em tabelas de folha), então
vão juntos. C2 toca três rotas com o mesmo padrão. C6/C7 são o mesmo fluxo de
criação de contrato — um PR só.

## Regras que valem para todos

- **Migração de schema sem TTY**: `drizzle-kit push` trava ao pedir confirmação;
  aplicar o DDL por `psql` numa transação com guarda, depois `push` para conferir
  ("Changes applied", sem prompt). Vale para C3/C4.
- **Contrato é a fonte da verdade**: se um conserto muda a resposta da API, editar
  `openapi.yaml`, rodar o codegen e `tsc --build` antes de tocar as rotas.
- **Cada crítico ganha teste de API** que falha antes do conserto — em especial os
  de concorrência (`Promise.all([post, post])`) e o de segurança (perfil sem
  módulo tentando a ação).

## Meta de aceite

Por crítico: teste-prova vermelho → verde. No fim: typecheck verde, suíte de API
verde, E2E verde. Doc de auditoria atualizado marcando cada crítico como fechado.

---

## Execução — todos os 7 críticos fechados (2026-07-16)

Cada um com teste que falhava antes do conserto. API 237 → **253**.

- ✅ **C1** — `requireModulo("admin")` no router de equipe. Prova: a vendedora
  criava membro (201), se auto-promovia (200) e removia colega (204); agora 403
  nas três. (`equipe-gate-api.test.ts`, 4 testes)
- ✅ **C5** — `escaparCsv` prefixa apóstrofo em campo que abre com `= + - @ tab`;
  número negativo legítimo (coluna Valor) é preservado. (`lote16-folha-unit`, +2)
- ✅ **C3+C4** — índices únicos parciais em `contas_pagar`
  (`WHERE tipo='SALARIO'`) e `salarios_recorrentes` (`WHERE ativo`), via psql +
  push. Geração com `onConflictDoNothing`; POST de salário dá 409. Prova: dois
  POSTs simultâneos geram `[0, 1]`, uma conta só no banco. (`lote16-folha-api`, +2)
- ✅ **C2** — `escopo-loja.ts`: lead/cabine/vendedora/reserva validados contra a
  loja antes do insert em atendimentos, reservas e bloqueios. FK de outra loja =
  404. (`escopo-loja-api.test.ts`, 6 testes)
- ✅ **C6** — soma de parcelas em CENTAVOS inteiros com igualdade exata; a
  `TOLERANCIA_CENTAVOS` de 0,01 saiu.
- ✅ **C7** — desconto do orçamento CONGELADO no contrato (schema +
  `descontoTipo`/`descontoValor` no contrato OpenAPI). O `valorTotal` é validado
  contra itens − desconto (fecha I5 na entrada por orçamento). Tela e PDF ganham
  a linha "Subtotal/Desconto" que reconcilia. Prova: PDF sai com 4.000 − 1.000 =
  3.000; total que não bate é 422. (`lote5-contratos-api` +2, `contrato-pdf-api` +1)

### IMPORTANTES — 13 fechados, 1 deferido, 1 coberto

Executados em sequência, mesmo método. API 253 → **273**, frontend 105 → **109**.

- ✅ **I1** — `classificarErro` marca o ZodError de saída com log próprio
  (`RESPOSTA_FORA_DO_CONTRATO`), sem virar 500 mudo. (`erros-unit`, 5)
- ✅ **I2** — `acaoDoRequest`: POST em `/cancelar` e `/estornar` exige `editar`,
  não `criar`. Perfil criar-only agora 403. (`permissoes` +2, `lote7` +1)
- ✅ **I3** — `QueryCache`/`MutationCache` derrubam a sessão em 401 de query de
  negócio (expiração), IGNORANDO o 401 do próprio getMe (senão trava o login —
  bug meu, pego pelo E2E). (`auth-erro`, 4)
- ✅ **I4** — `compararSenhaConstante` roda bcrypt sempre (dummy quando não há
  usuário): o tempo não denuncia e-mail cadastrado. (`login-timing-unit`, 3)
- ✅ **I5** — coberto por C6 (parcelas) e C7 (itens − desconto por orçamento).
- ✅ **I6** — `unique(contratoId, numero)`: gerar-plano concorrente é [201, 409].
- ✅ **I7** — `contratoAtivo()` barra receber/estornar em contrato cancelado.
- ✅ **I8** — `pgErrorCode` caminha a cadeia; fechar comissão concorrente é 409,
  não 500. (`lote9` +1)
- ✅ **I9** — regra sem vigência explícita (o caso da tela) nasce no 1º dia do
  mês seguinte, sem reprecificar retroativamente o mês corrente. (`lote9` +1)
- ⏸️ **I10** — DEFERIDO: estorno de vendedora sem venda é decisão de política
  contábil (baixa automática esconderia erro/fraude). Carregar é o seguro; o
  conserto é uma ação explícita de baixa, que precisa de sinal do produto.
- ✅ **I11b** — `saldo_referencia` ancorado ao meio-dia SP: o upsert por dia
  corrige em vez de empilhar. (`cobertura-i15`, 1) — **I11a (formulário de
  conferir saldo na tela) fica em aberto**: é net-new, e sem ele a projeção
  parte de zero.
- ✅ **I12** — join morto de `GET /parcelas` removido. Paginação e expor `lead`
  no schema (para a cobrança não rebuscar contratos) ficam como follow-up de
  performance.
- ✅ **I13** — "Novo Lead/Agendamento/Vestido" gateados por `podeNoModulo(criar)`.
- ✅ **I14** — `@ts-ignore`/`as any` removidos em agenda, orçamento e lead (o de
  orçamento revelou um override morto). vestidos/admin ficam de follow-up
  (transformações que pedem tipo próprio).
- ✅ **I15** — cobertura de recusar orçamento e regra de disponibilidade.

**Segue em aberto (consciente):** I10 (política de baixa de estorno), I11a
(formulário de saldo), a paginação do I12, a autoria-por-sessão do orçamento
(gêmea do vendedorId da cobrança), e a limpeza de casts em vestidos/admin.

### Fecho do backlog consciente (2026-07-17)

Tudo acima fechado, exceto I10 (segue aguardando sinal do produto):

- ✅ **I11a** — "Conferir saldo" na projeção (gate `criar` no financeiro):
  data limitada a hoje, valor pt-BR, reconferir corrige (upsert). Dia futuro é
  recusado; zero e negativo passam. (`validarConferencia`, frontend +6; E2E +1)
- ✅ **I12 follow-up** — `Parcela` ganha `contrato.leadId/lead` e a lista
  ganha `de`/`ate` por vencimento (dia local, inclusivo — padrão do GET
  /pagamentos; offset não faz sentido em telas agregadas). A cobrança parou de
  rebuscar todos os contratos; receber recorta no servidor; fluxo/DRE/projeção
  seguem sem janela de propósito. (API +3)
- ✅ **Autoria do orçamento** — vendedoraId sai do corpo e nasce da sessão;
  forjar autoria de outra pessoa é ignorado. (API +2)
- ✅ **Casts** — os dois `as any` de vestidos eram mortos; no seed, um
  escondia insert de comissão no formato pré-escada (quebrado em runtime) —
  corrigido para regra + degrau. Zero casts fora de teste no produto.

### Menores — segunda varredura (A8–A10 → D1–D8)

A lista original dos 10 menores viveu só na conversa; uma re-varredura achou
as sobras. Fechados (commit `9efcfeb`): **D1** status cru (RASCUNHO/ATIVO/
OPCAO_UNICA) → labels centralizados; **D2** preço de vestido fora do `brl()`;
**D3** data de casamento sem timeZone UTC (off-by-one) → `dataDia()`; **D4**
remover item de orçamento sem confirmação → AlertDialog; **D5** "não
encontrado" sem caminho de volta em orçamento/contrato/vestido.

Ficam como dívida baixa, conscientes: **D6** telas admin/equipe/configurações
sem estado de erro; **D7** textos em inglês em `components/ui/` não conectados
a nenhuma página; **D8** chaves de módulo cruas na lista de acessos do perfil.

Placar final: API **278**, frontend **123**, E2E **68**, typecheck verde nas
três camadas.

### Fecho de D6 e D8 (2026-07-18)

- ✅ **D6** — as quatro telas que ficavam em branco na falha de carregamento
  (admin, admin/perfis, equipe, configurações) ganharam estado de erro. O
  desenho que já vivia inline em ~10 páginas (`Alert destructive` +
  "Tentar novamente" via `refetch`) foi extraído para `EstadoErro`
  (`components/estado-erro.tsx`). Em configurações o erro é agregado por aba —
  a query de disponibilidade, na falha, chegava a mostrar "não configuradas",
  mascarando o erro; agora sai a saída com retry no topo da aba.
- ✅ **D8** — a lista de perfis da tela de Equipe mostrava os acessos por chave
  crua (`leads, agenda, financeiro`) e ainda com `.filter(([, v]) => v)`, que
  tratava o objeto `{ver,criar,editar}` como sempre-verdadeiro — um módulo sem
  nenhuma ação aparecia. Extraído para `resumoAcessos` em `lib/permissoes.ts`
  (fonte única `MODULOS_ROTULOS`, re-exportada pela matriz): rótulo humano,
  filtro por `moduloLiberado`, ordem canônica. (`permissoes.test.ts` +6)

**D7 fica em aberto (consciente):** são primitivos shadcn (`components/ui/`) que
nenhuma página importa — mexer é churn sem valor de usuário. Some quando/se um
tree-shake de componentes não usados for feito.

Placar após D6/D8: frontend **129**, typecheck verde.

### Notas dos importantes

Destaque para I1 (o `.parse()` na saída como 500 silencioso, que é a raiz que torna esta
classe de bug invisível) e I5 (validar `valorTotal` também no contrato manual,
sem orçamento — o caminho por orçamento já ficou coberto por C7).
