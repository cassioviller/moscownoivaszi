# O contrato vira regra — a fila

A tabela de épicos é a **fila**; a de Sobras é a **fonte da verdade do que
continua aberto**. **Conte, não deduza** — a linha aberta é a que não está
riscada.

Plano: [`2026-08-13-o-contrato-vira-regra-plano.md`](../../propostas/2026-08-13-o-contrato-vira-regra-plano.md)
· Transcrição: [`A-transcricao.md`](A-transcricao.md)
· Auditoria: [`B-auditoria.md`](B-auditoria.md)
· Base: `f40129f`

## O que foi aberto quando o contrato apareceu

Contado em 13/08/2026:

| natureza | quantos | estado |
|---|---|---|
| Épicos de código (E211–E222) | **12** | **3 executados** (E211, E216, E221) |
| Sobras abertas | **6** | 1 da auditoria + 3 do E216 + 2 do E221 — **conte a tabela** |
| Pendências que **não são software** | **3** | abertas |
| Decisões da dona ainda abertas | **2** (D4, D7) | travam só o E220 |

**Nada trava o começo.** A Fase 0 fechou seis das sete perguntas; as duas que
restam (D4 e D7) são do documento, e o documento é a última onda.

## As quatro ondas, e a razão da ordem

A ordem não é por cláusula nem por valor: é por **de onde vem o dado**.

1. **Onda A — a conta em cima do fato que já existe.** Os três primeiros épicos
   não inventam dado nenhum: o sistema já grava a troca de data, já enxerga o
   atraso na devolução e já sabe qual parcela venceu. Falta a conta. É o
   trabalho mais barato e o único que devolve dinheiro imediatamente.
2. **Onda B — as guardas e os limites.** Regras que apertam gesto que já existe.
   Nenhuma depende das outras.
3. **Onda C — o que o sistema não sabe.** Coluna nova e migração. É a onda cara.
4. **Onda D — o documento.** Depende de tudo acima, porque o PDF tem de imprimir
   os números que o código passou a usar — senão nasce a doença dos manuais: o
   papel dizendo uma coisa e a constante outra.

---

## A fila

### Onda A — a conta em cima do que já existe

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| ~~**E211**~~ | ~~a data que muda tem preço~~ | 17ª §2º e §3º | rodada e conferida | ✅ `0c8874a` · [relatório](execucao/E211.md) — o reajuste vira PARCELA (não engorda `valorTotal`, senão a base do próximo cresce sozinha) e o degrau vira COLUNA (não contagem da trilha). **O aviso aparece antes do clique**, porque o botão move na hora e a vendedora descobriria a cobrança depois de prometer a data. Duas lições caras: o `drizzle-kit push` **mentiu** ("Changes applied" sem aplicar nada), e a suíte cobrou **5 reprovações que eram todas régua certa** — inclusive a do snapshot, que enumera pelo VERSIONAMENTO e reprovou de novo depois do `generate` |
| **E212** | **o atraso na devolução tem preço** — `ATRASO_DEVOLUCAO` já existe em `disponibilidade.ts:60`; falta cobrar (1 diária/dia + R$ 250; 10 dias = extravio, 4×) | 16ª e §§ | sim (origem) | aberto |
| **E213** | **a parcela vencida tem multa e juros** — `caixa.ts:239` já sabe que venceu; falta 2% + 1% ao mês | 9ª | provável (perdão registrado) | aberto |

### Onda B — as guardas e os limites

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| **E222** | **o ateliê tem DOIS expedientes e o sistema conhece um** — nasce o de retirada/devolução (ter–sex 10:30–19:00, sáb até 18:00), e `dataRetirada`/`dataDevolucao` passam a ser validadas. Hoje o sistema aceita retirada num domingo às 23h | 4ª e 5ª | sim | aberto |
| **E214** | **a taxa de limpeza e a de dano ganham faixa** — R$ 350 a R$ 2.500 na limpeza, teto de 5× o aluguel no dano; hoje `custoReparo` é campo livre | 14ª e 15ª | sim (separar limpeza de dano) | aberto |
| **E218** | **a entrada sugere 40% e o plano respeita os 20 dias** — nada compara `parcelas.vencimento` com `contratos.dataRetirada` | 8ª §1º e § único | não | aberto |
| **E219** | **a troca de traje tem prazo** — sem troca após 7 dias, nem às sextas e sábados | 17ª e §1º | não | aberto |

### Onda C — o que o sistema não sabe

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| **E215** | **a ficha guarda quem assina** — os **9 campos** que faltam (estado civil, profissão, RG, nascimento, e-mail e o endereço inteiro). É o achado de maior alcance da auditoria | identificação | sim, grande | aberto |
| ~~**E216**~~ | ~~o vestido sabe que é exclusivo~~ | 12ª | rodada e conferida | ✅ `3dde7a3` · [relatório](execucao/E216.md) — a auditoria via **duas** ausências e elas não são do mesmo tipo: *exclusivo* é **marca** (coluna `vestidos.exclusiva`, e a decisão contra o atributo de catálogo é medida — os 9 atributos da loja são todos descritivos, e o catálogo **cascateia no DELETE**), *primeiro aluguel* é **estado** e **já era contável desde o E157** (`GET /vestidos/utilizacao`). Nasce uma coluna, não duas. A leitura da 12ª está declarada: a marca é permanente, o estado expira — a dona corrige em **uma linha**. O aviso nomeia a peça **dentro do diálogo do contrato**, no molde do E211 |
| **E217** | **a rescisão calcula** — reserva nunca volta, 60% de dedução, multa integral na peça exclusiva, devolução em 30 dias, e a **coluna do prazo da 18ª** (campo por contrato, D3) | 8ª §2º, 11ª, 12ª, 13ª, 18ª | sim | aberto · **o E216 entregou o predicado**. Três coisas para não errar estão em [`execucao/E216.md`](execucao/E216.md): descontar o PRÓPRIO contrato da contagem de saídas (senão a 12ª não dispara nunca), e escolher e DECLARAR a base do *"valor integral do aluguel"* — item ou contrato |

### Onda D — o documento

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| **E220** | **o PDF vira o INSTRUMENTO** — as 21 cláusulas, com os números vindos de constantes; e **nasce a validação de CNPJ**, que hoje não existe em lugar nenhum | 6ª, 21ª | não | aberto · trava em **D4**, **D7** e **E215** |
| ~~**E221**~~ | ~~recibo de pagamento~~ | 7ª | rodada e conferida (**índice**, não tabela) | ✅ `6051592` · [relatório](execucao/E221.md) — **o recibo é por RECEBIMENTO, não por parcela**: a cláusula diz "pagamentos EFETUADOS" e uma parcela deste sistema recebe em pedaços, então quem pagou R$ 300,00 em 01/03 tem o papel DE 01/03. **Não nasce tabela**: o ato individual só existe na linha `PARCELA_RECEBIDA` da trilha, escrita na MESMA transação do dinheiro — e o papel **CONCILIA** com a parcela antes de sair (soma maior que o recebido = nenhum recibo, falha fechada). O estorno anula por CORTE, pelos DOIS caminhos (avulso e cancelamento com `destinoPago: estornar`). Achou de passagem que **a trilha não guardava o DIA do pagamento** — só o instante do lançamento. O plano errou duas vezes: o épico **não dependia de D4/D7** (elas são do documento) e a migração não era tabela. Quatro réguas cobraram, e a quarta era defeito DELA: a `e115-migracao-snapshot-unit` lia o COMENTÁRIO do script como DDL — a frase que justifica o `CONCURRENTLY` virou o índice `comum` |

---

## Sobras

| # | O que é | Sev. | Nasceu em | Estado |
|---|---|---|---|---|
| **S-C1** | **O dano constatado na ENTREGA não tem registro.** A 5ª §3º manda a locadora substituir a peça quando o dano é visto **no ato da locação**; o sistema só conhece avaria na **devolução** (`avarias.bloqueioId`). Não virou épico porque é caso raro e a dona não pediu — fica contável | 🔵 | auditoria do contrato | aberta |
| **S-C20** | **Nenhum manual conhece a peça exclusiva.** O E216 pôs o selo em quatro lugares (ficha, acervo, seletor do orçamento, diálogo do contrato) e os cinco manuais de `docs/manuais/` calam a cláusula 12ª inteira. É o achado do **E196** repetido: manual que CALA capacidade é invisível para quem lê — não há como estranhar o que não está escrito, e a `varredura-manuais` passa verde porque confere o MENU, não a prosa. **Não é conserto de passagem**: pela lição do próprio E196, manual se reescreve **depois da onda**, e a onda C ainda tem E215 e E217 | 🔵 | E216 | aberta |
| **S-C21** | **O lookbook público não sabe da marca.** `LookbookPublicoVestido` não traz `exclusiva`, e mostrá-la à noiva no lookbook **é decisão de negócio, não código**: é argumento de venda ("esta peça é só sua") ou é pressão indevida antes de a noiva saber que a rescisão custa o aluguel inteiro? Fica contável até a dona dizer | 🔵 | E216 | aberta |
| **S-C22** | **A peça exclusiva não é filtrável no acervo** — custo declarado da decisão 1 do E216. Os filtros de `vestidos/index.tsx` saem do catálogo (tamanho, coleção, atributos), e `exclusiva` é coluna de propósito. Hoje a conta não dói: são **132 peças em `moscow_base` e ZERO marcadas**. Vale um `Select` a mais no dia em que a loja marcar as primeiras | 🔵 | E216 | aberta |
| **S-C30** | **A régua do PDF carrega um caractere INVISÍVEL.** `e165-pdf-fala-a-verdade.test.ts:19` normaliza o espaço duro do `brl` com o NBSP **literal** dentro do `replace`. Um editor que normalize espaços desliga a normalização em silêncio e o golden test passa a comparar bytes de codificação em vez de texto. Custou dois testes ao E221, que já escreve ` ` escapado. Uma linha | 🔵 | E221 | aberta |
| **S-C31** | **O recebimento PARCIAL é datado pelo último pedaço no caixa.** `parcelas.recebidoEm` guarda só o último recebimento, e o extrato/conciliação datam por ele: R$ 300,00 que entraram em 01/03 são contados no caixa realizado de 15/03, quando os R$ 700,00 quitaram. Não é defeito do recibo — o E221 fez a trilha passar a saber o dia de CADA ato, e agora há de onde tirar a data certa | 🔵 | E221 | aberta |

## Pendências que não são software

Nenhuma delas se fecha com código, e as três são da dona:

| # | O que | Por quê |
|---|---|---|
| **P1** | **Corrigir a página 6 do molde** — o CNPJ da assinatura (31.897.111/0001-76) sai; entra o 37.771.644/0001-93 | Decidido em D1. E não é erro de digitação: os **dois números passam na validação de CNPJ**, então a página 6 traz a inscrição de outra empresa |
| **P2** | **Olhar os contratos JÁ ASSINADOS** com a página 6 | Eles carregam o CNPJ errado. Quantos são, e o que fazer, é decisão jurídica |
| **P3** | **Preencher os dados reais da loja** em *Configurações → Dados da loja* | O banco ainda tem o exemplo (`12.345.678/0001-99`, "Rua das Noivas, 123"), e o real está no contrato: Rua Luis Jacinto 297, Centro, São José dos Campos, CEP 12243-260. **O lugar é a tela, não o código** — o seed é parametrizado por env de propósito |

Uma quarta, menor: a frase de fecho do molde está truncada (*"em duas vias de
igual"*, faltando "teor e forma").

## Decisões ainda abertas

| # | Pergunta | Trava |
|---|---|---|
| **D4** | O PDF do sistema deve virar o instrumento com as 21 cláusulas? | **E220** |
| **D7** | Representante legal (Renato) e chave PIX (CPF de Karina) entram no cadastro da loja? | **E220** |

As duas são da Onda D, e travam **só o E220**. **Podem ser respondidas depois** —
as ondas A, B e C não esperam por elas, **e o E221 também não esperava**: a
ordem sugerida ("D4 e D7 respondidas → E220 e E221") agrupava o recibo com o
instrumento por os dois serem papel, e papel não é uma dependência. O recibo
imprime nome, CNPJ, endereço e telefone, que já estão no cadastro há muito.

---

## O que este plano custa, medido e não estimado

A sessão de hoje deu duas referências reais: o **E198**, o épico mais barato do
plano das sobras, levou **~50 minutos**; o **E199**, ~40. Os dois eram de régua,
sem migração e sem tela.

**Os 12 daqui são de outra natureza.** Nove pedem **migração**, quase todos
tocam **tela**, e sete mexem em **dinheiro** — que é a área onde este repositório
exige exemplo numérico em todo achado e E2E antes do commit (regra 11).

Não vou fingir uma estimativa em horas. O que dá para afirmar com o que foi
medido: **é um plano de dias, não de uma sessão**, e a Onda C sozinha (as três
com migração grande) pesa mais que as ondas A e B juntas.

## O outro plano continua aberto, e isso é uma escolha a fazer

Há **duas frentes abertas ao mesmo tempo**:

| frente | o que resta |
|---|---|
| **Zerar as sobras** (`2026-08-13-zerar-as-sobras-plano.md`) | **25 sobras**, épicos E200–E209 |
| **O contrato vira regra** (esta) | **12 épicos**, E211–E222 |

Elas não competem por código — quase não se cruzam —, mas competem por sessão.
**A recomendação é o contrato primeiro**, e a razão é que as duas frentes têm
naturezas diferentes: as 25 sobras são **dívida de medição** (25 das 26 são 🔵,
e a maioria é régua que mede menos do que anuncia); o contrato é **regra de
negócio que o ateliê já assinou e o sistema não cumpre** — inclusive dinheiro
que ele deixa de cobrar.

Dívida de medição não muda nada para quem usa o sistema hoje. O reajuste da 17ª
muda.

## A ordem sugerida

1. **E211** — a data que muda tem preço. Não depende de nada, usa dado que já
   existe, e é a única regra do contrato que o ateliê **perde dinheiro** por não
   ter.
2. **E212** e **E213** — mesma natureza, mesma fonte de dado. Os três juntos
   estabelecem o mecanismo *"uma cobrança nasce de um fato do contrato"*, que a
   Onda B reusa.
3. **E222** — sobe na frente da Onda B porque é a única cláusula em que o sistema
   hoje **deixa acontecer** o que o contrato proíbe.
4. O resto da Onda B (**E214**, **E218**, **E219**), em qualquer ordem.
5. **E215** → **E216** → **E217**, nesta ordem (o E217 depende do E216).
6. **D4** e **D7** respondidas → **E220** e **E221**.
