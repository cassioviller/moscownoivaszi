# Segunda varredura do aplicativo inteiro — 2026-08-10, tarde

**Base** `8b4dd28` (`main`, limpo, **publicado** — `origin/main` na mesma
ponta) · primeira rodada em [`RELATORIO.md`](./RELATORIO.md)

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
- [x] Rodada RELANÇADA — `wf_97ee70f8-68a`, mesma especificação, com a
      mudança que a queda ensinou: **cada ângulo grava seus achados
      verificados em `rodada-2-achados/NN-<angulo>.md` assim que o cético
      dele termina**, em vez de esperar os onze. A próxima queda custa um
      ângulo, não a rodada.
- [ ] Localizadores concluídos
- [ ] Verificação concluída
- [ ] Achados escritos em `rodada-2-achados/`, no git

**Enquanto estas caixas não estiverem marcadas, o que existe é esta página.**
Se a sessão cair, é daqui que se retoma — e não da transcrição, que a regra 32
diz não ser backup de nada. O handle do run está acima e serve para retomar
enquanto o disco o guardar; **a página não depende dele** — e agora os
achados também não dependem: eles pingam no repositório ângulo a ângulo.
