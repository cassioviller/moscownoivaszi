# Bloco 8 — as decisões pequenas que viraram fila (S-C21 · S-C87 · S-C89 · S-C221 · S-C232 · S-C77)

**Trilha do contrato de papel, lote das azuis (2026-08-15)** · agente D · worktree
`.claude/worktrees/agent-a8319ff2dc5f7d2b8` · branch `agente-d-bloco8` · base `7650b480` (docs do E219)
Banco próprio: `moscow_wt_bloco8` (criado com `push` + seed; conferido com `SELECT current_database()`).

**E2E obrigatório e NÃO rodado — worktree não isola porta.**

## Correções ao diagnóstico, antes do código

- **O worktree NÃO nasceu na base mandada.** Ele nasceu em `cbcd8b30` — **48 commits atrás**
  de `7650b480` — e o primeiro gesto foi o reposicionamento (`git checkout -B agente-d-bloco8
  7650b480`, árvore limpa conferida antes). É a mesma armadilha do lote de 14/08, pelo mesmo
  caminho: quem medisse em `cbcd8b30` descreveria sobras de um repositório três épicos mais velho.
- As demais correções estão na seção de cada sobra; o resumo: a S-C21 estava exata (um montador,
  duas portas); a S-C232 está **errada no mecanismo** (o spec de hoje não recusa o `null` — ele o
  **converte em 01/01/1970**, que é pior); a S-C89 conta "2 por contrato atrasado" e são **3**;
  a S-C87 pede o diálogo "da ficha" e o componente certo já existe extraído
  (`historico-contato.tsx`, E32); a S-C221 diz "a Costureira" e a permissão de hoje também alcança
  a **Recepção**; a S-C77 aponta `reservas.ts:2340` e a transação mora em `reservas.ts:2919`
  (PATCH `/avarias/:id`, S-C11).

---

## S-C21 — o lookbook público sabe da marca

**Decisão da dona (14/08/2026): SIM, mostrar — é argumento de venda.**

**Medição de quem monta o payload:** o montador é **UM** — `montarVestidosLookbook`
(`artifacts/api-server/src/lib/visao-noiva.ts:114`) — e serve **DUAS portas**: o link público
(`routes/lookbooks.ts:76`) e o portal da noiva (`routes/portal.ts:259`, o mesmo shape via
`$ref` no `PortalNoiva`). Nenhum outro sítio monta `LookbookPublicoVestido` (enumerado por
`git grep montarVestidosLookbook` e pelos `$ref` do spec: 2 usos). Por isso o campo entrou
**required** no spec: o único montador sempre o tem, e `optional()` seria o caminho do
0-de-735 que o E215 mediu.

**O que mudou:**

- `lib/api-spec/openapi.yaml` — `LookbookPublicoVestido` ganha `exclusiva: boolean`,
  **required**; codegen re-rodado (`api.ts`, `api.schemas.ts`, `lookbookPublicoVestido.ts`).
- `visao-noiva.ts` — o SELECT traz `vestidosTable.exclusiva` e o tipo
  `VestidoLookbookPublico` a declara, com o comentário distinguindo TRAÇO de ESTADO
  (a distinção da 12ª está em `schema/vestidos.ts:105`).
- As duas telas gêmeas da noiva ganham o selo, **o mesmo texto nos dois**: "Peça exclusiva",
  num `<span>` de borda com cor de texto padrão (`lookbook-publico.tsx` e `noiva-portal.tsx`) —
  o rosa da marca ficou fora de propósito, pela medição do E127/E4 (2,68:1 nesta mesma página).

**Vermelho antes (literal):** com o spec exigindo o campo e o montador ainda sem ele,
`lote28-lookbook-api.test.ts` reprovou com
`Error: expected 200 "OK", got 500 "Internal Server Error"` — **2 failed | 2 passed**: o
`GetLookbookPublicoResponse.parse` derruba a resposta inteira, que é a guarda da S-C150
fazendo o serviço do lado bom. Depois do montador: **4 passed**. A suíte `portal` (6 arquivos,
29 testes) verde com o campo obrigatório — a segunda porta entrega.

---

## S-C232 — o `null` que apaga a data, e o mecanismo que a sobra descreveu errado

**Decisão da dona (14/08/2026): SIM, aceitar `null`.**

**Correção ao diagnóstico — a sobra dizia "o `ContratoUpdate` do spec nem aceita `null`", e o
estado real era PIOR:** o Zod gerado é `zod.coerce.date()`, e `new Date(null)` é época —
medido com o schema gerado: `UpdateContratoBody.safeParse({ dataRetirada: null })` devolvia
`{"dataRetirada":"1970-01-01T00:00:00.000Z"}`. O `PATCH { dataRetirada: null }` de hoje não
era recusado: era convertido numa retirada em **31/12/1969 21:00 (São Paulo)** e recusado por
ACIDENTE pelo expediente da 4ª (`RETIRADA_FORA_DO_EXPEDIENTE`). Já
`prazoDevolucaoReservaDias: null` levava 400 de validação. Três respostas diferentes para o
mesmo gesto, nenhuma delas a certa.

**O que mudou:**

- `lib/api-spec/openapi.yaml` — `ContratoUpdate.dataRetirada`, `.dataDevolucao` (datas da
  locação, E224) e `.prazoDevolucaoReservaDias` (o prazo da 18ª, E227, que herdou o limite)
  viram `nullable`; codegen re-rodado. O gerado agora é `zod.coerce.date().nullish()`, e o
  `ZodNullable` decide ANTES da coerção — `null` atravessa como `null`.
- **O handler não precisou de uma linha**: o `PATCH` já espalha `...parsed.data` no `.set()`
  (`contratos.ts:1631`), então `null` grava `null`; a guarda do carnê (`if
  (parsed.data.dataRetirada)`) e a do expediente (`expediente-de-retirada.ts:41` trata
  `null`/`undefined`) não rodam sobre data apagada — apagar não pode violar prazo nenhum.
- Teste novo: `s-c232-apagar-datas-da-locacao-api.test.ts` — apaga cada campo, prova que o
  ausente continua sendo "não mexi" (gramática do S-M10) e que a data não vira 1970.

**Vermelho antes (literal):**
- `dataRetirada: null` → `Error: expected 200 "OK", got 422 "Unprocessable Entity"`;
- `dataDevolucao: null, prazoDevolucaoReservaDias: null` → `Error: expected 200 "OK", got 400
  "Bad Request"`.
Depois: **3 passed**, e os 8 arquivos vizinhos que exercitam o `PATCH /contratos` (e158, e163,
e222, revisao-lote2, so111/so113, sc70, sm24) seguem verdes — **83 passed**.

**A METADE DA TELA ESTÁ BLOQUEADA PARA ESTE AGENTE, de propósito:** o `?? undefined` mora em
`contratos/[id].tsx:475-482` (`onSalvarLocacao`), arquivo reservado ao agente A/C neste lote.
O conserto que falta é de três linhas, e fica aqui para quem tem o arquivo:
`dataRetirada: localParaISO(retiradaEditada) ?? undefined` → `?? null`; o mesmo na devolução;
e o prazo vira `prazoEditado.trim() === "" ? null : Number(prazoEditado)` (o comentário
S-C211 dali já dizia que apagar o prazo "pede spec" — o spec agora aceita). O cliente gerado
já tipa `Date | null`, então a edição compila no dia em que for feita. Sem ela, a porta
aceita o gesto que o diálogo ainda não manda — a sobra fecha DE VERDADE com essas três linhas.

---

## S-C77 — a corrida do par avarias+parcelas, exercitada de verdade

**Decisão da dona (14/08/2026): SIM, barato — o molde das corridas sm7.**

**Correção de âncora:** a sobra aponta `reservas.ts:2340` e a transação que tranca o par mora
no **PATCH `/avarias/:id`** (S-C11), hoje em `reservas.ts:2919` — o primeiro `FOR UPDATE` na
avaria (`:2932`) e o segundo, **condicional a `avaria.parcelaId`**, na parcela (`:2948`). A
linha 2340 de hoje é um comentário da prévia da cobrança de atraso; a transação andou.

**A cena** (`sc77-corrida-avaria-parcela-api.test.ts`, molde do sm7 — determinística, nada de
sleep-e-reza): avaria de **R$ 250,00 cobrada** (parcela viva pelo vínculo do E97); a segunda
conexão segura um **recebimento não commitado** na parcela (o UPDATE tranca a linha); o PATCH
da correção para **R$ 150,00** dispara (o `Test` do supertest é lazy — S33) e fica pendurado
no `FOR UPDATE` condicional; 300 ms; COMMIT. A rota acorda, relê a linha fresca, vê o
dinheiro e recusa: **409 `AVARIA_COM_RECEBIMENTO`**, e o invariante é medido no banco —
avaria R$ 250,00 · parcela R$ 250,00 PAGA, o par intacto. O segundo `it` prova o caminho sem
corrida: 200 e a parcela viva segue o número (150/150).

**Vermelho antes (regra 34, código quebrado de propósito — o `.for("update")` da parcela
removido e depois restaurado):** `AssertionError: expected 200 to be 409` — o SELECT sem
tranca lê o retrato de ANTES do recebimento (MVCC), o CAS `isNull(recebidoEm)` do repasse
vira zero linhas em silêncio, e o par diverge: **ficha R$ 150,00 · carnê PAGO de R$ 250,00**,
exatamente os "dois números para uma decisão só" do E186, agora com dinheiro no meio.
Restaurada a tranca: **sc77 2 passed · sc11 17 passed**.

---

## S-C221 — o expediente da cláusula 4ª fecha pela permissão de contrato

**Decisão da dona (14/08/2026): restringir — quem muda o expediente muda o que o contrato
promete.**

**Medição de QUAL permissão dá o acesso hoje:** o `PUT /disponibilidade/regras` inteiro vivia
sob o `requireModulo("agenda")` do prefixo (`agenda.ts:258` na base; a rota em `:1319`), e PUT
deriva `editar` (`permissoes.ts:acaoDoMetodo`). **A sobra citava a Costureira; a Recepção
passava pela mesma porta** — os dois perfis do seed têm `agenda: TUDO, contratos: NADA`
(`configuracao-inicial.ts:153` e `:159`).

**O fecho, pela permissão e não por perfil:** o corpo que traz qualquer campo da 4ª
(`retiradaAberturaMinutos/FechamentoMinutos/FechamentoSabadoMinutos/retiradaDias`) exige
TAMBÉM `contratos.editar`, perguntado com as mesmas funções do middleware
(`getPermissoes` + `podeNoModulo`), ANTES de validar ou gravar qualquer campo — corpo misto
recusa inteiro. O gate por prefixo não tem grão de CAMPO, e mover o PUT inteiro para
`contratos` tiraria da Recepção o expediente de ATENDIMENTO, que é trabalho dela.
**Nenhuma migração de perfil**: os perfis ficam como estão; a porta é que passa a perguntar
a coisa certa — por isso não há SQL para rodar (a lição do E172 não se aplica: nada mudou no
seed).

**A tela acompanhou** (`atendimentos/config.tsx`): os quatro campos da 4ª aparecem
desabilitados sem `contratos.editar`, com a frase dizendo por quê
(`data-testid="clausula-4a-so-leitura"`), e o `salvarHorario` **não os manda** — o PUT é
upsert parcial e campo ausente preserva. A `s36-gate-da-tela-unit` segue verde: a tela agora
gateia por `[agenda, contratos]` e escreve em `agenda`.

**O manual:** o da costureira **não cita** o expediente (zero ocorrências, medido) — nada a
mudar. O da RECEPÇÃO cita (`recepcao.html:308` e a seção 8), e ganhou duas frases dizendo que
o bloco de retirada é só-leitura para ela. **ATENÇÃO DO INTEGRADOR: `recepcao.html` é área do
agente C neste lote** — a edição é de duas frases na seção 8; se houver conflito de
cherry-pick, a minha metade é a menor.

**Vermelho antes (literal):** `Error: expected 403 "Forbidden", got 200 "OK"` — a
costureira-fixture (perfil na letra do seed) gravava `retiradaFechamentoMinutos` — e no corpo
misto `expected 403 "Forbidden", got 422` (a parede de horário respondia antes da permissão).
Depois: **s-c221 4 passed**, e o lote s-c221 + e222-expediente + varredura-manuais (3
arquivos, 15) + s36-gate: **42 + 15 passed**, typecheck verde nos 5 projetos.

---

## S-C89 — o custo da fila medido, o cache de 5 min por loja, e a régua que trava a conta

**Decisão da dona (14/08/2026): cache de 5 min por loja no SERVIDOR, Map com TTL, sem
dependência nova.**

**Medição do custo atual — e a sobra contava errado:** ela dizia *"1 consulta larga + 2 por
contrato atrasado"*. Medido com um contador em cima de `pool.query` (filtrado pelas tabelas
da fila — o middleware de sessão também consulta o banco, e contá-lo mediria autenticação):
são **2 fixas** (a regra da loja + a varredura larga) **+ 3 por contrato atrasado**
(`buscarRegra` DE NOVO dentro de `pecasAtrasadasDoContrato`, os bloqueios do contrato, o
aluguel de cada peça no rol) **+ 1 pelas órfãs** — e **4 por contrato** quando o atraso já
virou parcela (a `cobrancaViva`). Com 2 contratos de 1 peça: **9 consultas por GET**, pagas
de novo a cada poll de 5 min do sino, em CADA tela aberta.

**O que mudou:**

- `lib/fila-de-atrasos-cache.ts` (novo) — Map por loja, TTL de 5 min (o MESMO poll do sino:
  o pior atraso de aviso que o cache adiciona é um ciclo que o sino já tinha), com
  `lerFilaDeAtrasos`/`guardarFilaDeAtrasos`/`derrubarFilaDeAtrasos`.
- O `GET /contratos-com-atraso` responde do cache; o `.parse` do contrato de resposta roda
  nas DUAS vias.
- **As portas que derrubam o cache da loja — enumeradas pelas TABELAS que a fila lê, não
  pelo palpite** (a sobra sugeria "receber, perdoar, cobrar"; **receber não muda a fila** —
  cobrança viva é `status !== CANCELADA`, e PAGA segue viva — e **perdoar mora é da carteira
  da 9ª, não desta fila**):
  1. `POST .../cobranca-de-atraso` (reservas.ts) — o `jaCobrada`;
  2. `PATCH /bloqueios/:id` — retirada/devolução real e datas;
  3. `DELETE /bloqueios/:id` — a linha some;
  4. `PATCH /reservas/:id` — mover a data move a janela de uso;
  5. `DELETE /reservas/:id` — cancela os bloqueios;
  6. `POST /contratos` (contratos.ts) — a órfã adotada vira item;
  7. `POST /contratos/:id/cancelar` — o item vira órfã e a parcela do atraso morre;
  8. `POST /contratos/:id/trocar-peca` — troca o bloqueio apontado;
  9. `POST /parcelas/:id/estornar` e `DELETE /parcelas/:id` — a cobrança viva muda;
  10. `PUT /disponibilidade/regras` (agenda.ts) — `usoDiasDepois` é o divisor da janela.
- **A régua** (`s-c89-cache-da-fila-api.test.ts`): pino de IGUALDADE no custo (9 no cenário
  de 2 contratos — a lição da S-C46: piso `>=` deixa a prosa envelhecer), **ZERO consultas
  de fila no GET seguinte**, e dois casos provando a invalidação POR PORTA (cobrar → o
  próximo GET diz `jaCobrada`; devolução registrada no prazo → a linha sai).
- **Fixture direta não passa por porta**: os três arquivos que medem a fila depois de
  `db.insert` cru (`s-c32`, `s-c80`, `e231`) derrubam o cache no próprio helper `fila()`,
  com o porquê escrito — eles pregam a CONTA; o cache tem régua própria.

**Vermelho antes (regra 34, cache desligado de propósito na rota e religado):**
`AssertionError: expected 9 to be +0` — sem o cache, o segundo GET paga as 9 consultas de
novo. E um vermelho MEU que virou nota no próprio teste: o primeiro desenho esperava a linha
sumir com a devolução registrada HOJE de uma peça atrasada — `expected true to be false` —
e a fila está CERTA em mantê-la: devolvida fora do prazo, a cobrança continua devida; o que
sai da fila é a devolução DENTRO do prazo (backdatada para o dia real da volta).
Depois: **s-c89 3 · s-c32 12 · s-c80 · e231 · e212 — 46 passed nos 5 arquivos**, typecheck
verde.

**Correção que fica para o rastreador:** o custo real é `2 + 3·atrasados (+1 se cobrado) + 1`,
não `1 + 2·atrasados`. E o `buscarRegra` duplicado (uma vez na fila, uma vez POR CONTRATO
dentro de `pecasAtrasadasDoContrato`) é 1 consulta evitável por contrato — fica como sobra
proposta (S-C280), não como conserto daqui: mexer na assinatura de
`pecasAtrasadasDoContrato` toca a prévia e o POST do E212, e o cache já paga o grosso.

---

## S-C87 — a fila age: o registro de contato abre de cada linha

**Decisão da dona (14/08/2026): SIM, agir — é o MESMO diálogo da ficha, aberto da fila.**

**Medição do componente certo:** o "registro de contato da ficha" já existe EXTRAÍDO —
`components/historico-contato.tsx` (E27, extraído no E32 exatamente para a ficha e a
Cobrança usarem o MESMO widget). O POST dele (`useCreateRegistroCobranca`, gate
`leads.criar` no endpoint) é o que zera o relógio do "parado há N dias" do funil. Nenhuma
segunda grafia nasceu (regra 26): o novo `pages/contratos/contato-da-fila.tsx` é um
Collapsible de 50 linhas que MONTA o widget compartilhado, lazy como na Cobrança
(`enabled: aberto` + montagem sob `jaAbriu` — a fila não paga uma request por linha).

**Onde ele entra** (`contratos/index.tsx`): nas DUAS listas — cada linha cobrável
(`i.leadId`, sempre presente) e a órfã COM dona (`o.leadId ? … : null`; a sem dona é gesto
de balcão sem noiva — não há a quem ligar nem ficha onde carimbar). O gesto de COBRAR (a
parcela da 16ª) continua na ficha da reserva, onde o E212 o pôs — o que a fila ganhou foi o
telefonema, que era o ida-e-volta da sobra.

**Vermelho (regra 34, literal):** o teste do componente sozinho é verde mesmo com a fila sem
gesto — que é exatamente o defeito da sobra —, então o arquivo tem uma varredura de FIAÇÃO
que lê `index.tsx` e cobra as duas âncoras. Com o `<ContatoDaFila>` removido de propósito
das duas listas (e recolocado): `AssertionError: expected false to be true`. E o caso jsdom
prova o lazy e o leadId entregue ao widget mockado. **contato-da-fila 2 passed**, typecheck
verde.

**O que o E2E cobraria e este worktree não pode rodar:** o clique real na fila com o
formulário do histórico gravando — fica dito para o integrador.
