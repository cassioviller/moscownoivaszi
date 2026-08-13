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
| Épicos de código (E211–E222) | **12** | **8 executados** (E211, E212, E213, E214, E216, E218, E221, E222) — **as Ondas A e B fechadas**, menos o E219 · **1 bloqueado** (E219: a porta que ele guardaria não existe) |
| Sobras abertas | **13** | 1 da auditoria + 2 do E212 + 2 do E214 + 3 do E216 + 2 do E221 + 1 do E213 + 2 do E222 — **conte a tabela, não esta linha** |
| Pendências que **não são software** | **4** | abertas (a P4 nasceu no E213) |
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

## Os hashes desta tabela são os do `main`, e três não eram

Os épicos E214, E216 e E221 rodaram em **paralelo, um agente por worktree**, e
cada agente registrou aqui o hash que o `git commit` dele devolveu — `35cce35`,
`3dde7a3`, `6051592`. **Nenhum dos três existe no `main`**: o que entrou foi o
`cherry-pick` do integrador, com outro hash, e em dois casos com o conteúdo
mudado de propósito (a migração `0019` foi descartada e renasceu como `0020` e
`0021`, a terceira colisão da mesma sessão). Os três originais só vivem nos
branches `worktree-agent-*`, que somem quando o worktree é podado — e aí a
tabela apontaria para nada.

**Hash de worktree não é hash.** Quem integra troca os três pelos do `main`
antes de podar, e é o que está feito acima: só `eaa4e90` (E216) tem o mesmo
`patch-id` do original; os outros dois são o patch menos a migração colidida.

---

## A fila

### Onda A — a conta em cima do que já existe

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| ~~**E211**~~ | ~~a data que muda tem preço~~ | 17ª §2º e §3º | rodada e conferida | ✅ `0c8874a` · [relatório](execucao/E211.md) — o reajuste vira PARCELA (não engorda `valorTotal`, senão a base do próximo cresce sozinha) e o degrau vira COLUNA (não contagem da trilha). **O aviso aparece antes do clique**, porque o botão move na hora e a vendedora descobriria a cobrança depois de prometer a data. Duas lições caras: o `drizzle-kit push` **mentiu** ("Changes applied" sem aplicar nada), e a suíte cobrou **5 reprovações que eram todas régua certa** — inclusive a do snapshot, que enumera pelo VERSIONAMENTO e reprovou de novo depois do `generate` |
| ~~**E212**~~ | ~~o atraso na devolução tem preço~~ | 16ª e §§ | rodada e conferida (**origem + coluna**) | ✅ `a88d7ead` · [relatório](execucao/E212.md) — **a decisão da dona vale 6×, e a conta é que a fez**: "um dia de aluguel" é o aluguel **÷ os dias da janela** (R$ 3.000 / 6 = R$ 500), porque com a outra leitura nove dias custam R$ 27.250,00 e o décimo — que é EXTRAVIO, o pior caso do instrumento — custa R$ 12.000,00: **o décimo dia devolveria R$ 15.250,00 ao locatário**. As duas faixas são EXCLUSIVAS (o §1º só vale abaixo do caput) e **o extravio NÃO leva a multa**, que o caput não menciona. O §2º REPARTE: três peças atrasadas pagam três diárias e **uma** multa, numa parcela só — por isso o vínculo mora no CONTRATO. A peça que **nunca saiu** não atrasa; a que **ainda está fora** conta até hoje, e é o que torna esta a única cobrança cujo valor depende do dia do clique — daí a trilha obrigatória. Oito réguas cobraram, e **uma acusou código certo**: a varredura de trancas lia o CAS como porta ABERTA porque `atrasoParcelaId` não estava em `COLUNAS_DE_ESTADO` — a dívida fechou em 12, não 13 |
| ~~**E213**~~ | ~~a parcela vencida tem multa e juros~~ | 9ª | rodada e conferida (**enum + 2 colunas**) | ✅ `fa7d838` · [relatório](execucao/E213.md) — **a Onda A fecha.** A base é a PARCELA e a decisão da dona não é preferência: o **CDC art. 52 §1º** limita a multa a *"dois por cento do valor da prestação"*, e a leitura literal cobraria os 2% do CONTRATO **de novo a cada parcela atrasada** — dez em atraso dariam 20% do contrato numa cláusula que diz 2%. **O plano dizia que faltava a conta; faltava a conta E o teto da porta**: com a 9ª ligada, o `POST /receber` RECUSAVA os R$ 515,00 devidos por uma parcela de R$ 500,00 (`expected 200 "OK", got 422`), dizendo à vendedora que ela cobrava demais enquanto a fila, o carnê e o portal mostravam os R$ 515,00 — **quatro leituras do mesmo número, e a única que decide dizia não**. A imputação quita no principal e **cristaliza só o que entra a mais** (linha `MORA`, PAGA), porque conta DERIVADA não sobrevive ao pagamento do principal: a parcela ficava PARCIAL devendo R$ 15,00 que o sistema dizia não existir. Medido em `moscow_base`: **110 parcelas vencidas, R$ 1.476,00 de multa e R$ 538,25 de juros** que o instrumento manda cobrar. A varredura de trancas **acusou código certo pela segunda vez em dois épicos seguidos** (S-C33), e o relatório abre com o achado sobre si mesmo: **o épico chegou escrito e sem UMA medição** — os vermelhos são reprodução, não gravação |

### Onda B — as guardas e os limites

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| ~~**E222**~~ | ~~o ateliê tem DOIS expedientes e o sistema conhece um~~ | 4ª e 5ª | rodada e conferida (**4 colunas**) | ✅ `31422db` · [relatório](execucao/E222.md) — **a medição mudou o tamanho do épico antes de uma linha de código**: são **723 contratos, 1 com `dataRetirada` e ZERO com `dataDevolucao`**, e **nenhuma tela cita os dois campos** (`git ls-files`) — só se chega neles pela API, que é o formato do E197. Daí as datas continuarem OPCIONAIS e a migração não corrigir linha nenhuma. Não era contradição com o horário que existia — o de lá governa ATENDIMENTO (sete dias até as 20h, do caderno pela S-A8, e **certo para provas**); é ausência, e o modelo tinha um calendário onde o negócio tem dois. O vermelho: `expected 201 to be 422` — o contrato nascia com a peça saindo **num domingo às 23h**. **O PATCH entrou junto** (`expected 200 to be 422`), senão o caminho era fechar no sábado e corrigir para domingo depois. O sábado tem **coluna própria** porque um número só recusaria 18:30 numa quarta ou aceitaria no sábado; o fechamento é **inclusivo** aqui e exclusivo na agenda (prova tem duração, retirar é ato) |
| ~~**E214**~~ | ~~a taxa de limpeza e a de dano ganham faixa~~ | 14ª e 15ª | rodada e conferida | ✅ `0c15cda` + `6d1e860` (a migração renumerada) + `1c439d5` (a régua da moeda, que este épico deixou vermelha no `main`) · [relatório](execucao/E214.md) — as duas cláusulas viram réguas de **formas diferentes** (a da limpeza é absoluta, a do dano é 5× o aluguel DAQUELA peça), e é isso que obriga o `tipo`: sem ele, `custo_reparo` é um número sem régua. O teto sai de `contrato_itens.valor_unitario`, que o sistema tinha e não usava — **R$ 9.000,00 cabem no vestido de R$ 3.000,00 e não cabem no véu de R$ 400,00**. A régua não vira parede — o que VIOLA um número do papel entra com justificativa, gravada na avaria e na trilha. **Peça fora de contrato: a 15ª NÃO alcança o caso** — não barra, e diz que não conferiu (decisão que eu escrevi ao contrário primeiro; medir derrubou o argumento, e a conta está no relatório). **As duas portas conferem**, e a razão entra também na cobrança para não haver beco (apagar a avaria destruiria a foto-prova). Fora do escopo aparente: `listContratos` desce os `itens` no recorte por noiva, e a conta do `ENVELOPE_MAX_BYTES` foi **refeita para dois campos de texto**, não esticada |
| ~~**E218**~~ | ~~a entrada sugere 40% e o plano respeita os 20 dias~~ | 8ª §1º e § único | não | ✅ `f8ab561` · [relatório](execucao/E218.md) — **duas regras do mesmo contrato, tratamentos opostos, e a razão é MEDIDA**: dos 208 contratos ativos com entrada, **101 estão abaixo dos 40%** e a média é **67,6%** — recusar tornaria quase metade do que a loja já fez irreproduzível pela porta, e a entrada é onde a dona negocia. Então a 8ª §1º **avisa** (o placeholder mostra os 40%, a frase diz quanto falta e que dá para seguir) e o § único **recusa**, porque ele garante o dinheiro antes de a peça sair. **A cláusula não vale para toda parcela** — aplicá-la a qualquer vencimento recusaria a avaria (E214), o atraso (E212) e a mora (E213), que nascem depois da retirada; vale para o CARNÊ, e as **duas** portas que o montam conferem (`expected 201 to be 422` nas duas). **O teste achou um defeito meu antes do commit**: a régua misturava o INSTANTE da retirada (que o E222 criou três horas antes) com a data de negócio do vencimento, e as 23:59 de 15/08 em SP viravam 16/08 — a classe da S-O117, agora entre dois épicos da mesma sessão |
| **E219** | **a troca de traje tem prazo** — sem troca após 7 dias, nem às sextas e sábados | 17ª e §1º | não | **BLOQUEADO — a porta que ele guardaria não existe.** O plano diz *"é guarda na porta que edita itens do contrato"*, e essa porta é suposição: enumerado por `git ls-files`, `contratoItensTable` e `contratoBloqueiosTable` recebem escrita em **UM sítio** — o `INSERT` dentro do `POST /contratos` (`contratos.ts:904` e `:916`). Os outros três arquivos que as citam (`portal.ts`, `reservas.ts`, `vestidos.ts`) só LEEM. Não há `PATCH`, `PUT` nem `DELETE` de item: **hoje trocar de traje é cancelar o contrato e fazer outro**. Fechá-lo pede antes um épico de PORTA (trocar peça, libertar a reserva antiga, prender a nova, refazer o snapshot de preço) — decidido em 13/08 que ele espera |

### Onda C — o que o sistema não sabe

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| **E215** | **a ficha guarda quem assina** — os **9 campos** que faltam (estado civil, profissão, RG, nascimento, e-mail e o endereço inteiro). É o achado de maior alcance da auditoria | identificação | sim, grande | aberto |
| ~~**E216**~~ | ~~o vestido sabe que é exclusivo~~ | 12ª | rodada e conferida | ✅ `eaa4e90` · [relatório](execucao/E216.md) — a auditoria via **duas** ausências e elas não são do mesmo tipo: *exclusivo* é **marca** (coluna `vestidos.exclusiva`, e a decisão contra o atributo de catálogo é medida — os 9 atributos da loja são todos descritivos, e o catálogo **cascateia no DELETE**), *primeiro aluguel* é **estado** e **já era contável desde o E157** (`GET /vestidos/utilizacao`). Nasce uma coluna, não duas. A leitura da 12ª está declarada: a marca é permanente, o estado expira — a dona corrige em **uma linha**. O aviso nomeia a peça **dentro do diálogo do contrato**, no molde do E211 |
| **E217** | **a rescisão calcula** — reserva nunca volta, 60% de dedução, multa integral na peça exclusiva, devolução em 30 dias, e a **coluna do prazo da 18ª** (campo por contrato, D3) | 8ª §2º, 11ª, 12ª, 13ª, 18ª | sim | aberto · **o E216 entregou o predicado**. Três coisas para não errar estão em [`execucao/E216.md`](execucao/E216.md): descontar o PRÓPRIO contrato da contagem de saídas (senão a 12ª não dispara nunca), e escolher e DECLARAR a base do *"valor integral do aluguel"* — item ou contrato |

### Onda D — o documento

| Épico | Tese | Cláusula | Migração? | Estado |
|---|---|---|---|---|
| **E220** | **o PDF vira o INSTRUMENTO** — as 21 cláusulas, com os números vindos de constantes; e **nasce a validação de CNPJ**, que hoje não existe em lugar nenhum | 6ª, 21ª | não | aberto · trava em **D4**, **D7** e **E215** |
| ~~**E221**~~ | ~~recibo de pagamento~~ | 7ª | rodada e conferida (**índice**, não tabela) | ✅ `fcc24e9` + `dbd3da2` (a migração renumerada) · [relatório](execucao/E221.md) — **o recibo é por RECEBIMENTO, não por parcela**: a cláusula diz "pagamentos EFETUADOS" e uma parcela deste sistema recebe em pedaços, então quem pagou R$ 300,00 em 01/03 tem o papel DE 01/03. **Não nasce tabela**: o ato individual só existe na linha `PARCELA_RECEBIDA` da trilha, escrita na MESMA transação do dinheiro — e o papel **CONCILIA** com a parcela antes de sair (soma maior que o recebido = nenhum recibo, falha fechada). O estorno anula por CORTE, pelos DOIS caminhos (avulso e cancelamento com `destinoPago: estornar`). Achou de passagem que **a trilha não guardava o DIA do pagamento** — só o instante do lançamento. O plano errou duas vezes: o épico **não dependia de D4/D7** (elas são do documento) e a migração não era tabela. Quatro réguas cobraram, e a quarta era defeito DELA: a `e115-migracao-snapshot-unit` lia o COMENTÁRIO do script como DDL — a frase que justifica o `CONCURRENTLY` virou o índice `comum` |

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
| **S-C10** | **Os "61 das 63 avarias" envelheceram, e ainda sustentam decisões de desenho.** O número nasceu no E110 e é citado em **8 sítios versionados** — `e167-avaria-fecha-api.test.ts:27` e `:111`, `revisao-reserva-avaria-api.test.ts:21`, `so18-reserva-por-id-api.test.ts:59`, `routes/contratos.ts:538`, `routes/reservas.ts:1714`, `reservas/[bloqueioId].tsx:153` e `openapi.yaml:5934`. Medido em `moscow_base` no E214: **116 bloqueios, TODOS com `lead_id` próprio, nenhum sem dono, e ZERO avarias.** Os comentários argumentam com ele ("prova quando é provável"; o botão que a tela desenha), então não é troca de texto — é remedir e decidir se o argumento sobrevive | 🟡 | E214 | aberta |
| **S-C32** | **O atraso não tem FILA — só se descobre abrindo a ficha daquela reserva.** O E212 pôs a conta e o botão em `reservas/[bloqueioId].tsx`, e `ATRASO_DEVOLUCAO` **não aparece em tela nenhuma além dela** (medido: um único sítio em `moscow-noivas/src`, e é o comentário que o próprio E212 escreveu). A peça que não voltou soma uma diária por dia em silêncio: quem não abrir aquela ficha não sabe que ela existe, e o valor cresce sozinho. É o oposto do reajuste do E211, que nasce do gesto de mover a data — aqui o fato é a AUSÊNCIA de gesto, e ausência não notifica ninguém | 🟡 | E212 | aberta |
| **S-C33** | **`COLUNAS_DE_ESTADO` é lista curada à mão, e coluna de estado nova nasce invisível para a detecção de CAS.** A varredura de trancas leu a porta do E212 como ABERTA enquanto o `where` da escrita repetia exatamente a condição lida — só porque `contratos.atrasoParcelaId` não estava na lista. O E212 consertou POR COLUNA (acrescentou a dela), e **nada obriga a lista a ficar completa**: é a classe que a conferência de 2026-08-05 achou na S30 (*"trava a lista, não a contagem"*), agora do lado das colunas. A régua acusa código certo, que é a direção mais cara — quem for fechar troca a lista por um derivado do schema. **O E213 é a segunda evidência, em dois épicos seguidos**: `parcelas.moraPerdoadaEm` nasceu invisível igual, e as DUAS portas do perdão apareceram como abertas estando sob CAS de verdade (`"routes/contratos.ts": 1` virou `3` no vermelho reproduzido). Duas colunas, dois épicos, o mesmo ponto cego — a lista curada não é sustentável | 🔵 | E212 | aberta |
| **S-C35** | **A retirada e a devolução não têm onde ser preenchidas.** As duas colunas existem desde sempre, a API grava, o PDF do contrato imprime os dois rótulos — e **nenhuma tela oferece o campo** (0 sítios em `artifacts/moscow-noivas/src`, enumerado por `git ls-files`). Medido: **1 de 723 contratos** tem data de retirada, nenhum tem devolução. O E222 pôs a régua na porta; enquanto o gesto faltar, o expediente da 4ª só é exercido por quem chama a API — o formato do E197 | 🟡 | E222 | aberta |
| **S-C36** | **O PDF do contrato imprime "Retirada" e "Devolucao" sempre vazios.** `contrato-pdf.ts:128-129` desenha as duas linhas a partir de campos que ninguém preenche. Não é defeito de código: é a mesma ausência da S-C35 vista no papel que a noiva leva para casa, e fecha junto com ela | 🔵 | E222 | aberta |
| **S-C34** | **A mensagem de cobrança cobra a multa e não a NOMEIA.** `whatsapp.ts:78` imprime `brl(p.totalVencido)`, e o `totalVencido` passou a incluir multa e juros no E213 (`cobranca.ts:154`). A noiva recebe *"um valor em aberto: **R$ 515,00**, há 30 dias"* de uma parcela de **R$ 500,00** — confere o carnê, vê R$ 500,00, e liga para a loja. É o **oposto** do que o próprio E213 fez no portal, onde o acréscimo vem com a conta escrita ao lado, e pela razão declarada lá: número maior sem explicação é o que gera a ligação. Uma linha na mensagem | 🟡 | E213 | aberta |
| **S-C11** | **A avaria não tem porta de EDIÇÃO.** `custo_reparo`, `tipo` e `justificativa_da_taxa` só entram no `POST` de nascimento; não há `PATCH /avarias/:id`. Quem digitou R$ 1.500,00 onde eram R$ 150,00 só tem o caminho de apagar e refazer — e o E115 recusa apagar quando a avaria sustenta cobrança viva, além de a foto-prova sair junto. Não fecha buraco de régua (o E214 confere no nascimento e na cobrança), mas é gesto que falta a quem usa | 🟡 | E214 | aberta |

## Pendências que não são software

Nenhuma delas se fecha com código, e as três são da dona:

| # | O que | Por quê |
|---|---|---|
| **P1** | **Corrigir a página 6 do molde** — o CNPJ da assinatura (31.897.111/0001-76) sai; entra o 37.771.644/0001-93 | Decidido em D1. E não é erro de digitação: os **dois números passam na validação de CNPJ**, então a página 6 traz a inscrição de outra empresa |
| **P2** | **Olhar os contratos JÁ ASSINADOS** com a página 6 | Eles carregam o CNPJ errado. Quantos são, e o que fazer, é decisão jurídica |
| **P3** | **Preencher os dados reais da loja** em *Configurações → Dados da loja* | O banco ainda tem o exemplo (`12.345.678/0001-99`, "Rua das Noivas, 123"), e o real está no contrato: Rua Luis Jacinto 297, Centro, São José dos Campos, CEP 12243-260. **O lugar é a tela, não o código** — o seed é parametrizado por env de propósito |

| **P4** | **Escolher o índice da correção monetária** da cláusula 9ª | A cláusula manda corrigir e **não nomeia índice**, e IPCA, IGP-M e INPC dão três números para a mesma dívida — escolher um por conta própria seria inventar cláusula. O E213 cobra a multa e os juros e **declara** que não corrige, na tela e na trilha: *"Sem correção monetária — o contrato não nomeia índice."* Enquanto a decisão não vier, a ausência fica dita em vez de calada |

Uma quinta, menor: a frase de fecho do molde está truncada (*"em duas vias de
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

**Os itens 1 e 2 estão FEITOS, e com eles a Onda A inteira.** O que vem primeiro
agora é o **E222**, pela razão do item 3 — e o mecanismo que os três da Onda A
estabeleceram (*"uma cobrança nasce de um fato do contrato"*, com a conta
DERIVADA e o fato datado no banco) é o que a Onda B reusa. Ele já foi escrito
três vezes: reajuste (E211), atraso (E212) e mora (E213).

1. ~~**E211** — a data que muda tem preço.~~ ✅ `0c8874a`
2. ~~**E212** e **E213** — mesma natureza, mesma fonte de dado.~~ ✅ `a88d7ead`
   e `fa7d838`
3. ~~**E222** — a única cláusula em que o sistema **deixa acontecer** o que o
   contrato proíbe.~~ ✅ `31422db`
4. ~~O resto da Onda B: **E218**.~~ ✅ `f8ab561` — com ele **as Ondas A e B
   estão fechadas**, menos o **E219**, que segue **bloqueado**: a porta que ele
   guardaria não existe, e a linha dele na fila traz a enumeração que prova.

   **Três épicos seguidos ensinaram a mesma coisa, e ela vale para os que
   faltam: o plano deste contrato supõe portas que o sistema não tem.** No E213
   a régua faltava na porta AO LADO (o `POST /receber` recusava o dinheiro que
   as outras três leituras mostravam); no E222 o campo existia e **nenhuma tela
   o oferecia**; no E219 a porta **não existe**. A primeira pergunta de cada um
   dos que restam passa a ser *quantos passam por aqui hoje* — e ela se responde
   com `git ls-files` e um `SELECT`, antes de qualquer linha.
5. **E215** → **E216** → **E217**, nesta ordem (o E217 depende do E216).
6. **D4** e **D7** respondidas → **E220** e **E221**.
