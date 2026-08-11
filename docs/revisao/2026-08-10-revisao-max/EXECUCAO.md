# Revisão max de 2026-08-10 — execução

**Base** `e624e4e` (`main`, limpo, em dia com o `origin`) · diagnóstico em
[`RELATORIO.md`](./RELATORIO.md)

**Fim do dia 2026-08-10: 14 das 18 fechadas em 14 commits de código, cada um
com o vermelho medido antes.** Réguas: API 1089 → **1105** · frontend 530 →
**534** · E2E **165** · typecheck verde em 5 projetos — e a régua do banco
virgem rodada duas vezes (S-M15, que a consertou; S-M8, que mexeu no schema).
O E2E completo rodou antes de CADA commit de código, e pegou um defeito real:
o spec 32 vivia no ponto cego da S-M4 (`fc8729d`).

## Como retomar

**2026-08-11: a rodada 2 executou a fila.** A S-M9 e a S-M18 fecharam pelos
épicos S-M21 (`bcbdf27`) e S-M22 (`d4bdc76`) — as enumerações que elas pediam
saíram dos ângulos 4 e 3 da segunda varredura, e os consertos foram junto
(ver `rodada-2-consolidado.md` e o fecho em `RODADA-2.md`). **Restam DUAS,
ambas 🟡:**

1. **S-M10** — campo vazio querendo dizer "apague": exige decidir o contrato
   (`null` explícito no PATCH de interesses) e tocar as duas pontas.
2. **S-M17** — espera dados de um banco de instalação real. Gente, não
   código.

A trilha não tem épicos: ela nasce **direto em sobras**. O diagnóstico já veio
consolidado do workflow — 6 localizadores, 59 candidatos, 59 verificadores
independentes, 15 defeitos relatados —, e o que falta é fechar cada um.

## O que esta trilha é

A primeira varredura de código **depois do zero**. Quando ela rodou, o backlog
de código do repositório era ZERO: rodada 6, rodada 7 (design) e arqueologia do
legado fechadas, e as duas sobras vivas — S-A2 e S-A27 — esperando gente, não
código. Achado daqui é achado **novo**.

## A conferência das 15 (regra 20)

**As 15 âncoras foram relidas contra o código antes de virarem trabalho, e as
15 são verdadeiras.** Nenhuma morta, nenhuma imprecisa no mecanismo — o que é
notícia: na conferência de 2026-08-05, das 48 sobras conferidas **4 estavam
mortas e 9 descreviam errado o defeito que apontavam** (regra 23).

A diferença é a origem. Aquelas 48 nasceram de passagem, no meio de outro
épico; estas 15 nasceram de um localizador com âncora obrigatória e passaram
por um verificador adversarial cada. **O preço de conferir continua sendo o
certo** — uma rodada de leitura sem commit de código —, mas a taxa de acerto de
um achado depende de como ele nasceu, e isto aqui é a medida disso.

Duas ganharam precisão na releitura, e ela está na linha de cada uma:

- **S-M4** — o relatório diz "o saldo de partida nunca é testado". Certo, e o
  mecanismo é mais estreito do que parece: `montarCurva` testa o negativo
  **dentro do `map` sobre os dias com evento**. Zero eventos, zero testes; e com
  eventos, uma entrada no primeiro dia que devolva o saldo ao positivo apaga o
  alerta de uma loja que está no vermelho HOJE.
- **S-M2** — `minimum: 0` recusa negativo, então a frase do comentário vizinho
  ("uma saída negativa entraria no caixa como dinheiro voltando") **não é o
  buraco**. O buraco é o R$ 0,00: a rota multi-conta quita conta com zero, e o
  comentário da porta irmã (`openapi.yaml:6383`) afirma que esta já tinha o
  piso de um centavo. A afirmação é falsa desde que foi escrita.

E a execução apertou uma terceira, que a releitura não tinha pegado:

- **S-M3** — o relatório dizia "a entrada perde o `numero 0` e deixa de ser
  rotulada". Medido no código de ontem: a entrada **não some do slot 0 — ela é
  EXPULSA dele** pela entrada do carnê fantasma, pelo deslocamento do S26. O
  contrato de R$ 5.000,00 termina com **9 parcelas somando R$ 10.000,00 e duas
  linhas chamadas "Entrada"**, e a que ocupa o `numero 0` é a que a noiva nunca
  combinou. Pior que o relatório, e só apareceu porque a medição rodou.

## O que a leitura acrescentou ao diagnóstico

**Três das quinze são a MESMA falta de guarda em portas diferentes**, e a
contagem importa para a ordem: S-M1 (cabine), S-M8 (confecção) e S-M12
(vestido do orçamento) são "o id entrou sem prova de que pode entrar" — a
família do E91/E107, que o repositório já fechou dezenas de vezes. A quarta
forma nova é a do S-M7: a prova é feita, mas **fora da transação que escreve**.

## Sobras

Regra 12: entram aqui no mesmo commit que as viu. Regra 21: saem riscadas, com
o hash e uma linha do que se fez.

**18 sobras: 14 fechadas.** **As duas 🔴 e as seis 🟠 fecharam — não resta
nenhuma linha acima de 🟡.** As quatro abertas são 🟡: duas do diagnóstico
(S-M9, S-M10), a varredura S-M18, e a S-M17 — que espera dados de um banco de
instalação real, não código.
A S-M16 e a S-M17 nasceram da execução das duas, no mesmo commit que as viu
(regra 12).

E a primeira já cobrou a regra 20 de um jeito novo: **a S-M1 estava certa no
defeito e errada numa referência.** O relatório dizia "também em
`vestidos.ts:850`, `comissao.ts:476`, `agenda.ts:796`" e eu registrei isso na
tabela como "o 409 que falta aqui EXISTE nesses três". Não existe — os três são
o mesmo delete cru. A frase do relatório era ambígua e a minha era falsa; quem
fosse copiar o modelo de lá não acharia modelo nenhum. **Conferir a âncora pega
o defeito; conferir as REFERÊNCIAS do achado é outro gesto, e este achado
mostra que ele também é preciso.**

| # | O quê | Peso | Origem |
|---|---|---|---|
| ~~S-M1~~ | ~~**O `DELETE` de cabine apaga a agenda inteira sem perguntar** (`routes/agenda.ts:243`). Cinco linhas: nenhuma checagem de existência (404 que todo irmão tem), nenhuma checagem de uso, nenhuma auditoria, nenhuma transação — e `atendimentos.cabine_id` é `ON DELETE CASCADE` (`schema/atendimentos.ts:82`). Apagar uma cabine leva junto a fila da costureira e o histórico de provas dela, irrecuperável e sem rastro de quem fez. ~~**O 409 que falta aqui existe em `vestidos.ts:850`, `comissao.ts:476` e `agenda.ts:796`** — ERRADO, e a leitura pegou: `vestidos.ts:850` (itens de estoque) e `agenda.ts:796` (ajustes) são o MESMO delete cru, não o modelo. O relatório os listava como "também em", e eu li como "existe em". Quem tem a guarda é o `DELETE /vestidos` da S-A25 (`vestidos.ts:531`).~~ **FECHADA em `3f21fa7`**, na forma do E115: 404 fora da loja, 409 `CABINE_COM_AGENDA` com a contagem, e o DELETE em transação com `CABINE_REMOVIDA` na trilha (nome no detalhe). A saída que o 409 oferece já existia — `cabines.ativo` —, e a tela de "Cabines & horário" nunca teve botão de apagar: **nenhum spec, script ou teste chama a rota**, ela era hazard sem usuário. Vermelho antes: `expected 409 "Conflict", got 204 "No Content"`, com as duas provas sumindo do banco. API 1089 → 1090 | ✅ | localizador de correção · `3f21fa7` |
| ~~S-M2~~ | ~~**A rota multi-conta quita conta com R$ 0,00** (`lib/api-spec/openapi.yaml:6399`): `PagamentoInput.valorPago` tem `minimum: 0`, e a porta irmã `PagarContaInput` tem `0.01` — com um comentário (`:6383`) que afirma "como a porta irmã `PagamentoInput` já tinha". Não tinha. O zod gerado é a única validação do servidor; o guard de um centavo existe só no navegador. Uma conta de R$ 3.200,00 vai a PAGA com saída de zero no caixa~~ **FECHADA em `5d062bd`**: `minimum: 0.01` no spec, codegen atravessado, e o comentário da porta irmã passou a contar a história em vez de mentir. Omitir `valorPago` continua valendo (a saída vale a soma das contas) — o piso só morde valor presente. Vermelho antes: `expected 400 "Bad Request", got 201 "Created"`, com a conta indo a PAGA. O teste prega as duas portas com o mesmo piso. API 1093 → 1094 | ✅ | localizador de correção · `5d062bd` |
| ~~S-M3~~ | ~~**`POST /contratos` grava parcela sem `origem`, e o carnê pode nascer duas vezes** (`routes/contratos.ts:535-547`). A coluna default é `AVULSA` (`schema/financeiro.ts:28`), então a guarda `jaTemCarne` (`:1275`, que pergunta `p.origem === "PLANO"`) nunca dispara sobre as parcelas do fechamento: uma venda de **R$ 5.000,00** parcelada no contrato aceita um carnê inteiro por cima e fica com **R$ 10.000,00** em parcelas. E a entrada perde o `numero 0`, que significa ENTRADA em seis pontos do sistema (o comentário do S26, `:1317`, enumera os seis)~~ **FECHADA em `ae4a8e7`**, numa linha: `origem: "PLANO"`. Os números do relatório conferiram na medição, e ela apertou o segundo: o contrato terminava com **9 parcelas somando R$ 10.000,00 e DUAS linhas chamadas "Entrada"** — a entrada não some do `numero 0`, ela é EXPULSA dele pela entrada do carnê fantasma, via o deslocamento do S26. Vermelho antes: `ORIGEM DAS 4: AVULSA,AVULSA,AVULSA,AVULSA` e `expected 409 "Conflict", got 201 "Created"`. Passivo no banco de dev: **0 AVULSA em 309 parcelas** — nada a corrigir aqui, e a pergunta do backfill virou a S-M17. API 1090 → 1091 | ✅ | localizador de correção · `ae4a8e7` |
| ~~S-M4~~ | ~~**O alerta de caixa não vê a loja que já está no vermelho** (`lib/financeiro-core/src/projecao.ts:44-52`). `diaNegativo` só é testado DENTRO do `map` sobre os dias COM evento — o saldo de partida não passa por teste nenhum. Loja **R$ 2.000,00 negativa hoje** e sem evento no horizonte: `diaNegativo: null`, cartão não aparece. Com evento, basta a primeira entrada devolver o saldo ao positivo para o alerta sumir igual~~ **FECHADA em `7d2a6cd`**: `projetarCaixa` — que é quem conhece o `hoje` — fixa `diaNegativo = hoje` quando o saldo de partida é negativo; `montarCurva` fica intocada e o campo segue sendo o PRIMEIRO dia negativo. A frase acompanhou: cartão e sino dizem "O caixa já está negativo" em vez de "fica negativo em <hoje>", que seria falsa sobre fato presente. Vermelho antes nos dois cenários: `expected null to be '2026-07-21'`. API 1094 → 1096 | ✅ | localizador de correção · `7d2a6cd` |
| ~~S-M5~~ | ~~**O delimitador do CSV de extrato é adivinhado LINHA A LINHA** (`lib/financeiro-core/src/extrato.ts:112`): `linha.split(linha.includes(";") ? ";" : ",")`. Num arquivo de vírgulas, uma linha que traga `;` no histórico é fatiada errada e o lançamento some sem erro nenhum — a conciliação acusa divergência falsa e manda lançar de novo: **R$ 1.500,00 contados duas vezes**. O delimitador é do ARQUIVO, e se decide uma vez~~ **FECHADA em `d9e4d59`**, exatamente como a linha propôs: o texto inteiro é lido com cada candidato (`;` e `,`) e fica o que produz mais transações — no empate ganha o `;`, padrão de banco brasileiro, onde a vírgula é o decimal. A contagem decide sem heurística de primeira linha: o arquivo de `;` lido por `,` racha as quantias no decimal e não produz quase nada. Vermelho antes: `expected [ … ] to have a length of 3 but got 2` — a linha `TED JOAO; REF PEDIDO 50` sumia sem erro. API 1091 → 1093 | ✅ | localizador de correção · `d9e4d59` |
| ~~S-M6~~ | ~~**O docstring promete janela aberta e o código fecha** (`api-server/src/lib/estoque.ts:51-52` × `:67`). O texto diz "retirada sem devolução deixa a janela ABERTA, como em `janelasDoBloqueio`"; o código só deixa aberta quando **não há data de casamento** — havendo, o fim é `casamento + usoDiasDepois` mesmo com a peça ainda na mão da noiva. A metade do VESTIDO, do mesmo ciclo, acerta: as duas discordam sobre o mesmo dia~~ **FECHADA em `b407710`**: retirada real sem devolução → `fim: null`, qualquer que seja o casamento — as metades alinhadas. Um teste antigo pregava o defeito de passagem (fixava o fim sem que o fim fosse o assunto dele); a âncora do início ficou. Vermelho antes: `expected '2026-09-21' to be null`. API 1101 → 1102 | ✅ | localizador de correção · `b407710` |
| ~~S-M7~~ | ~~**A guarda de reserva exclusiva é lida fora da transação que escreve** (`routes/contratos.ts:325-337` × `:514`, `:562`). `presosPorContratoAtivo` sai do pool global, sem row lock, e o `INSERT` em `contrato_bloqueios` acontece páginas depois; a PK é `(contratoId, bloqueioId)` (`schema/contratos.ts:111`), que **permite o mesmo bloqueio em dois contratos**. Duas vendedoras no mesmo segundo prometem o mesmo vestido a duas noivas. O repositório já consertou esta forma no `DELETE /admin/lojas`, com `.for("update")`~~ **FECHADA em `75882f0`**, na forma da S33: `FOR UPDATE` na linha do bloqueio dentro da transação (em ordem ordenada — deadlock vira fila) e a reconferência como statement novo; quem perde a corrida leva o mesmo 409 do caminho lento, e a guarda de cima fica, com os quatro erros na precedência pregada. O teste reproduz a corrida determinística (vínculo não commitado segurando a tranca, `Test` lazy disparado por `Promise.resolve`). Vermelho antes: `expected 201 to be 409`, com os dois pares em `contrato_bloqueios`. API 1096 → 1098 | ✅ | localizador de correção · `75882f0` |
| ~~S-M8~~ | ~~**A mesma confecção vira duas peças do acervo** (`routes/vestidos.ts:128-146`). `confeccaoPodeVirarPeca` prova a loja e prova que o trabalho está pronto — e não pergunta se ele **já virou peça**. `origem_ajuste_id` não tem unique (`schema/vestidos.ts:77`), então o invariante "uma vez só" vive só no cliente: dois cliques no botão criam dois vestidos do mesmo trabalho~~ **FECHADA em `f3a8b50`**, em duas camadas: veredicto `JA_VIROU_PECA` → 409 amigável, e o unique `vestidos_origem_ajuste_id_unique` como cinto do banco (NULL não colide — peça comprada fora da régua). Migração documentada e aplicada no dev (0 duplicatas em 494); snapshot regenerado para a sonda S-A20; **régua do banco virgem rodada antes do commit: 8 ✓**. Vermelho antes: `expected 409, got 201`. API 1102 → 1103 | ✅ | localizador de correção · `f3a8b50` |
| ~~S-M9~~ | ~~**A tela libera por `criar` e o servidor exige `editar`** (`pages/financeiro/pagar.tsx:621` × `routes/financeiro.ts:330`). O botão "Pagar" aparece para quem tem `criar`; a rota é `requireModulo("financeiro", "editar")`. A gerente que só tem `editar` não vê o botão que pode usar; a estagiária que só tem `criar` vê e leva 403. O localizador contou **mais 7 sítios** com o mesmo descasamento~~ **FECHADA em `bcbdf27` (rodada 2, épico S-M21).** O ângulo 4 da rodada 2 entregou a enumeração que faltava: **9 sítios além da âncora** (não 7), cada um com as duas pontas ancoradas — e o ângulo 8 achou três COMENTÁRIOS afirmando guardas erradas junto deles. Os dez consertados num commit; a varredura que fica é `sm21-gate-acao-da-tela-unit`, que pina os dez pares (gate esperado presente, gate errado proibido). O pior sítio não era o da âncora: os ajustes de costura liberavam ESCRITA por `agenda.ver` | ✅ | localizador de correção · rodada 2 · `bcbdf27` |
| S-M10 | **Apagar o teto de orçamento é ignorado em silêncio, com toast de sucesso** (`pages/noivas/[leadId]/interesses.tsx:161` × `routes/leads.ts:661-664`). Campo vazio vira `undefined`, some do JSON, e o `set: { ...insertData }` do `onConflictDoUpdate` preserva o valor antigo. Nem um `null` explícito resolveria pela tela: o contrato não o admite — o conserto é dos dois lados | 🟡 | localizador de correção |
| ~~S-M11~~ | ~~**Limpar o campo para redigitar ZERA o estoque da peça** (`pages/vestidos/estoque.tsx:133-137`). `Math.trunc(Number(""))` é `0`, que é finito e não é negativo: passa pelos dois guards e salva quantidade zero. Depois disso todo orçamento com aquela peça alarma falta que não existe~~ **FECHADA em `aa206ce`**: a régua virou `quantidadeContada` em `lib/estoque-aviso.ts`, com o vazio recusado como campo pela metade e o ZERO digitado continuando a valer (contar a arara e achar nenhum é uma contagem). Vermelho antes, medido: `Math.trunc(Number("")) = 0 | guard antigo barra? false`. Frontend 530 → 534 | ✅ | localizador de correção · `aa206ce` |
| ~~S-M12~~ | ~~**O item de orçamento não prova a loja do `vestidoId`** (`routes/orcamentos.ts:397-454`). O `itemEstoqueId` tem prova (`:417`) e o `ajusteId` tem prova dupla, de loja e de noiva (`:446`, com o comentário do E155 explicando por quê). O `vestidoId` não tem nenhuma. A venda vira beco sem saída: o item entra, e a reserva do E150 depois responde 422 apontando uma peça que aquela loja nunca poderá reservar~~ **FECHADA em `dd0644e`**: `vestidoNaLoja` (helper que já existia) no POST, 404 com campo, no molde dos irmãos. O `OrcamentoItemUpdate` não aceita `vestidoId` — o POST era a única porta. Vermelho antes: `expected 404, got 201`. API 1100 → 1101 | ✅ | localizador de correção · `dd0644e` |
| ~~S-M13~~ | ~~**`EXPEDIENTE_PADRAO` ficou em 19h quando o schema foi para 20h** (`lib/agenda-core/src/mover.ts:98` × `schema/loja.ts:48`). O docstring diz "espelha os defaults das colunas" e o S-A8 mudou o default para `20`; o espelho ficou em `19`. E ele não carrega `dias` nem `provaDuracao`. Loja recém-criada, antes da primeira linha de `regra_disponibilidade`, perde 19:00 e 19:30 da grade e trata a prova das 18:30 como se durasse 30 min. É a regra 30 pelo avesso: duas réguas com o mesmo nome, sem nada que prove a equivalência~~ **FECHADA em `865cc33`**: valor sincronizado (20h, sete dias, prova de 2 slots) e a equivalência pregada campo a campo contra `getTableConfig` no teste do E147, junto do `HORARIO_PADRAO` — as três cópias da régua quebram juntas agora. Vermelho antes: `expected 19 to be 20`. API 1098 → 1099 | ✅ | localizador de correção · `865cc33` |
| ~~S-M14~~ | ~~**A busca por noiva não escapa `%` nem `_`** (`api-server/src/lib/busca-lead.ts:15`, e o irmão em `routes/leads.ts:105`). `` `%${busca}%` `` entra cru no `ilike`: buscar `%` devolve o cadastro inteiro, e colar "50% entrada" de um orçamento busca outra coisa sem dizer que buscou~~ **FECHADA em `3a6aebf`**: o escape virou `padraoDeBusca` (régua única, contrabarra primeiro), importada pelos dois sítios. Vermelho antes: buscar `%` devolvia as duas noivas da fixture. **E o E2E desta rodada derrubou o spec 32 por causa da S-M4** — a loja da suíte estava GENUINAMENTE negativa (âncora de R$ 1.000 vencida por -R$ 1.211,05 de deriva do dia) e o spec vivia no ponto cego que a S-M4 fechou; a âncora subiu para R$ 100.000 em `fc8729d`, com a medição no comentário. API 1099 → 1100 | ✅ | localizador de correção · `3a6aebf` |
| ~~S-M18~~ | ~~**O relatório afirmou "mais três sítios com a mesma escrita" do S-M7 — e a enumeração se perdeu com a transcrição.**~~ **FECHADA em `d4bdc76` (rodada 2, épico S-M22).** A enumeração recuperada era MAIOR que a perdida: o ângulo 3 achou **sete** sítios, e o ângulo 11 achou **mais dois nos consertos do próprio dia 10** — a S-M1 e a S-M16 nasceram com a contagem no pool, a forma exata que a S-M7 fechou no mesmo dia. Os dez (9 check-then-write + 1 write+write) ganharam `FOR UPDATE` + reconferência como statement novo; `recusaDeMoverAtendimento` ganhou executor para reler pela transação. Corrida determinística nos dois piores em `sm22-corrida-check-then-write-api` (DELETE parcela × receber; DELETE cabine × POST atendimento), na mecânica do S33 | ✅ | execução da S-M7 · rodada 2 · `d4bdc76` |
| S-M17 | **O passivo da S-M3 num banco de instalação real não tem régua para ser separado.** No dev são **0 linhas `AVULSA` em 309 parcelas**, então não houve backfill a fazer. Num banco que já fechou vendas pela tela, cada contrato tem o carnê rotulado `AVULSA`, e ele está a um clique de dobrar. O problema é que a coluna não distingue: um reparo de avaria legítimo também é `AVULSA` desde o E110. O predicado candidato é "as linhas criadas no mesmo instante do contrato, cuja soma é o `valor_total` exato" — precisa ser conferido contra dados reais antes de virar migração, e é decisão da dona do repositório rodá-la ou não | 🟡 | execução da S-M3 |
| ~~S-M16~~ | ~~**Sobram TRÊS deletes crus da mesma família do S-M1, e eles vieram do erro de referência dela.** Lidos ao conferir a S-M1: `vestidos.ts:845` (item de estoque), `agenda.ts:796` (ajuste — o checklist desce por cascade) e `comissao.ts:476` (regra de comissão). Nenhum é do porte da cabine: nenhum leva atendimento. Mas a régua do E115 é "nada some sem 404, contagem e rastro", e três portas seguem fora dela~~ **FECHADA em `c4ee0ad`**: os três com 404 + rastro (três ações novas na trilha, espelhadas na tela), e um 409 novo no ajuste — o trabalho JÁ COBRADO não sai, porque o set null deixaria a cobrança do E155 apontando o nada em silêncio. Os set-nulls decididos (S-A14, E156) ficam. Vermelho antes: trilha vazia e `expected 409, got 204`. API 1103 → 1105 | ✅ | conferência da S-M1 · `c4ee0ad` |
| ~~S-M15~~ | ~~**A régua do banco virgem escreve no banco de DEV e declara sucesso** (`scripts/banco-virgem.ts:161-162`). O `import` do `global-setup` acontece **uma linha antes** da troca da `DATABASE_URL`, e o pool nasce na importação: o setup roda contra o dev. O ramo S-D38, que é a única coisa que esta régua existe para exercitar, **nunca foi executado** — e ela é a quarta régua do repositório, a que o `CLAUDE.md` manda rodar antes de mexer em seed, schema ou `global-setup`~~ **FECHADA em `050fa33`**, com dois gestos: a env trocada ANTES do import, e a afirmação que prova o ALVO — `e2e-vestido-1` tem de estar no descartável, por `psql` — para que a classe inteira reprove em vez de mentir (um import estático futuro bastaria para renascer o defeito). Vermelho antes, executado (regra 28): `✓ o setup do E2E terminou sem erro` seguido de `✗ o setup escreveu no banco descartável, não no de dev`. Com a ordem certa: EXIT=0, 8 ✓, e o passo S-D38 rodou contra o banco virgem **pela primeira vez desde que o script existe** | ✅ | localizador de correção · `050fa33` |

## O que ficou fora, e não volta

O relatório do workflow tinha teto: **18 achados de limpeza e 4 de correção
menor** ficaram fora dos 15, "recuperáveis sem repetir a rodada" pelo
`journal.jsonl` da transcrição.

**Não são.** A transcrição foi conferida em 2026-08-10 e não existe mais —
nem o `journal.jsonl`, nem o script, nem o diretório do run. Os 22 estão
perdidos; recuperá-los custa repetir a rodada inteira (68 agentes, 5,58 M
tokens, ~2 h).

Isso vira régua, e ela está na crítica do método: **relatório de workflow que
aponta para a própria transcrição não é registro — a transcrição é volátil e o
repositório não é.** O que não estiver no `git` no dia em que a rodada termina
não sobreviveu a ela.
