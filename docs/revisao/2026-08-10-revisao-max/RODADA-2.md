# Segunda varredura do aplicativo inteiro — 2026-08-10, tarde

**Base** ~~`8b4dd28`~~ **`89b38c8`** (`main`, limpo; o `origin` ficou dois
commits atrás — ver abaixo) · primeira rodada em [`RELATORIO.md`](./RELATORIO.md)

**A base andou entre a segunda e a terceira tentativa, e o motivo é achado:**
o `f0a17d0` (agente do Replit, fora do método) pôs `APP_DATABASE_URL` com
precedência dentro de `@workspace/db` para o preview abrir o banco da loja —
e a precedência capturava todo filho que redireciona por `DATABASE_URL`:
medido, o filho pedia `/heliumdb` e o pool conectava em `/moscow_base`. É a
S-M15 uma camada acima, e a senha do banco ficou em texto no `.replit`. O
`89b38c8` conserta (a biblioteca volta a ler SÓ `DATABASE_URL`; o `run dev`
deriva a URL de `APP_DATABASE_NAME`; o E2E fixa o nome vazio), com a régua do
banco virgem passando INTEIRA sob `APP_DATABASE_NAME` exportada. **O ângulo 11
passa a cobrir 16 commits** — os 14 consertos da manhã mais estes dois.

Pedido literal: *"app inteiro ir anotando enquanto faz"*. Este arquivo é a
metade "anotando", e ele existe **antes** da rodada terminar — é a regra 32
sendo cumprida no dia em que nasceu, e ela nasceu porque a rodada da manhã
perdeu 22 achados que só existiam na transcrição.

## Por que uma segunda rodada no mesmo dia

A da manhã não foi repetida — ela foi **completada**. Três motivos:

1. **Os 22 perdidos.** A primeira rodada teve teto de relatório: 18 achados de
   limpeza e 4 de correção menor ficaram de fora e morreram com a transcrição.
   Esta rodada cobre justamente os ângulos que produziram aqueles — limpeza,
   duplicação de régua, passivo, eficiência — e não só os de correção.
2. **Duas sobras abertas SÃO varreduras.** A S-M9 (a tela libera por `criar`, o
   servidor exige `editar` — 8 sítios) e a S-M18 (check-then-write fora de
   transação — "mais três sítios", enumeração perdida) pedem exatamente o que
   uma rodada de leitura em paralelo faz. Elas entram como ângulos, e o que a
   rodada achar fecha a enumeração delas.
3. **O código mudou.** Catorze consertos entraram hoje, alguns em lugares
   sensíveis (transação do `POST /contratos`, união de auditoria, schema com
   unique novo). Código novo é código não revisado.

## O que NÃO é achado novo

O localizador é instruído a ignorar — e o verificador, a refutar como
duplicata:

| Já fechado hoje | Hash |
|---|---|
| S-M1 `DELETE` de cabine sem 404/409/rastro | `3f21fa7` |
| S-M3 carnê do fechamento nascia `AVULSA` | `ae4a8e7` |
| S-M5 delimitador de CSV por linha | `d9e4d59` |
| S-M2 `PagamentoInput.valorPago` com `minimum: 0` | `5d062bd` |
| S-M11 `Number("")` zerando estoque | `aa206ce` |
| S-M15 `banco-virgem` importando antes de trocar a env | `050fa33` |
| S-M4 alerta de caixa cego para saldo de partida negativo | `7d2a6cd` |
| S-M7 guarda de reserva exclusiva fora da transação | `75882f0` |
| S-M13 `EXPEDIENTE_PADRAO` 19h × schema 20h | `865cc33` |
| S-M14 `%`/`_` sem escape no ILIKE | `3a6aebf` |
| S-M12 `vestidoId` do item de orçamento sem prova de loja | `dd0644e` |
| S-M6 janela do estoque fechando com a peça na rua | `b407710` |
| S-M8 confecção virando duas peças | `f3a8b50` |
| S-M16 os três deletes crus restantes | `c4ee0ad` |
| Captura de `APP_DATABASE_URL` na biblioteca (defeito do `f0a17d0`) | `89b38c8` |

E as quatro abertas (S-M9, S-M10, S-M17, S-M18) não são achado: são fila.
Achado que as ENUMERA — "o nono sítio do criar×editar é este" — vale, e é
metade do ponto desta rodada.

## Escopo

**573 arquivos** versionados, fora `docs/**`, `*.md`, gerados, migrações,
locks e o mockup-sandbox: 237 do frontend, 220 da API, 66 de E2E, 20 do
schema, 16 dos núcleos puros (financeiro, agenda, funil), 3 de `scripts/`.

Réguas na abertura: **API 1105 · frontend 534 · E2E 165 · typecheck verde em
5 projetos**, mais a régua do banco virgem (8 ✓).

## Os onze ângulos

Sete de correção, três de limpeza (os que produziram os 22 perdidos), e um que
revisa o código de hoje — porque conserto novo é código não revisado.

| # | Ângulo | O que ele procura |
|---|---|---|
| 1 | dinheiro | float onde devia ser centavo, sinal trocado, desconto na base errada, total da tela ≠ total do servidor |
| 2 | fuso-data | `new Date("YYYY-MM-DD")`, instante comparado como dia, borda de janela, a mesma janela calculada de dois jeitos |
| 3 | transacao | **enumera a S-M18**: guarda lida no pool e escrita na transação sem relock; escrita multi-tabela solta; 23505 vazando |
| 4 | permissao | **enumera a S-M9**: `requireModulo` da rota × `podeNoModulo` da tela, ação por ação; e id que entra sem prova de loja (E91) |
| 5 | contrato-tela-servidor | a regra 22 pura: openapi × rota × tela, três declarações cruzadas |
| 6 | estados | transição permitida por uma porta e proibida por outra; estado terminal que aceita escrita; invariante que só existe em comentário |
| 7 | duplicacao | a regra 26: a mesma régua em N grafias — e qual das cópias DIVERGE |
| 8 | passivo | export sem importador, coluna que ninguém lê, e **comentário que mente sobre o código de hoje** |
| 9 | eficiencia | N+1, payload gordo, índice que falta, cache invalidado demais ou de menos |
| 10 | reguas-e-testes | teste vacuoso, teste que prega o defeito, `skip` escondendo vermelho, fixture que acopla ordem |
| 11 | consertos-de-hoje | os 14 commits de hoje, com olho adversarial: guarda nova recusando caso legítimo, tranca nova arriscando deadlock, 23505 cru do unique novo |

Cada achado passa por um **cético independente**, instruído a REFUTAR — a
procurar a guarda que já existe noutra camada, e a refutar na dúvida. Achado
que ninguém consegue derrubar é o único que sobrevive.

## Estado

- [x] ~~Rodada lançada — `wf_44b3f415-631`~~ **A sessão caiu com as três
      caixas de baixo desmarcadas, e o run morreu com ela** — a home foi
      reconstruída e o journal do workflow morava nela. Nada dos onze ângulos
      chegou ao disco. A página fez exatamente o que a última frase dela
      prometia: foi daqui que se retomou.
- [x] ~~Rodada RELANÇADA — `wf_97ee70f8-68a`~~ **A sessão morreu de novo, e
      desta vez a prova é a ausência**: `rodada-2-achados/` não existe no
      disco — nenhum ângulo chegou a pingar. A mudança de gravar por ângulo
      não foi testada por esse run; vale para o próximo.
- [x] Rodada RELANÇADA (3ª) — **`wf_4d6ca4ce-f18`**, base `89b38c8`, mesma
      especificação da 2ª: onze ângulos, cético por achado, e **cada ângulo
      grava `rodada-2-achados/NN-<angulo>.md` assim que a verificação dele
      termina** — o escritor grava, o fecho commita.
- [x] Localizadores concluídos — os onze, zero mortos
- [x] Verificação concluída — 55 achados julgados, um cético por achado
- [x] Achados escritos em `rodada-2-achados/`, no git — os onze arquivos
      pingaram no disco ÂNGULO A ÂNGULO enquanto a rodada corria, como a
      segunda queda ensinou

## O que a rodada devolveu

**Run `wf_4d6ca4ce-f18`: 77 agentes (11 localizadores + 55 céticos + 11
escritores), 3,76 M tokens, 100 minutos, zero erros.** Dos 55 achados que os
localizadores afirmaram, o cético derrubou 2. Sobreviveram **53 — nenhum 🔴,
2 🟠, 45 🟡, 6 🔵**:

| # | Ângulo | Vivos | O maior |
|---|---|---|---|
| 1 | dinheiro | 3 🟡 | quantidade negativa entra no criar de item (o editar recusa) |
| 2 | fuso-data | 4 🟡 | vigência de comissão: validação pelo DIA, dedup pelo INSTANTE |
| 3 | transacao | 7 🟡 + 1 🔵 | **a enumeração da S-M18**: 7 check-then-write sem tranca, um a um |
| 4 | permissao | 9 🟡 | **a enumeração da S-M9**: 9 sítios criar×editar, um a mais que os 8 estimados |
| 5 | contrato-tela-servidor | 1 🟠 + 5 🟡 | `parcela.origem` fora do spec — reparo cobrado antes do carnê trava o "Gerar plano" |
| 6 | estados | 5 🟡 | contrato aceita bloqueio soft-cancelado como reserva; CANCELADO só é terminal numa porta |
| 7 | duplicacao | 1 🟠 + 2 🟡 | o diálogo de receber parcela em duas grafias — a do contrato perde a data |
| 8 | passivo | 4 🟡 + 1 🔵 | três comentários que MENTEM sobre guardas de hoje |
| 9 | eficiencia | 3 🟡 + 1 🔵 | `registros_cobranca` sem índice em `lead_id` — o agregado mais chamado varre a tabela |
| 10 | reguas-e-testes | 1 🟡 + 2 🔵 | a régua S-D44 é cega para o `e2e/` |
| 11 | consertos-de-hoje | 2 🟡 + 1 🔵 | o conserto da S-M1 nasceu com a guarda fora da transação — a forma que a S-M7 fechou no MESMO dia |

**As duas varreduras da fila estão enumeradas.** A S-M9 pedia os sítios do
criar×editar: o ângulo 4 entregou **nove**, com âncora dupla (gate da tela ×
ação derivada da rota) em cada um. A S-M18 pedia os check-then-write: o
ângulo 3 entregou **sete**, e o ângulo 11 achou mais dois NOS CONSERTOS DE
HOJE — a S-M1 e a S-M16 nasceram na forma que a S-M7 tinha acabado de fechar.
Fechar as duas sobras agora é executar a lista, não procurá-la.

**Há sobreposição entre ângulos, ainda não consolidada** — o sítio do estoque
aparece no 4 e no 8; a quantidade negativa, no 1 e no 5. A consolidação (a
camada G do método) é o próximo passo antes de virar fila de execução.

**Enquanto estas caixas não estiverem marcadas, o que existe é esta página.**
Se a sessão cair, é daqui que se retoma — e não da transcrição, que a regra 32
diz não ser backup de nada. O handle do run está acima e serve para retomar
enquanto o disco o guardar; **a página não depende dele** — e agora os
achados também não dependem: eles pingam no repositório ângulo a ângulo.
