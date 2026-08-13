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
| Sobras abertas | **16** | 1 da auditoria + 2 do E212 + **1** do E214 (a S-C10 fechou) + 3 do E216 + 2 do E221 + 1 do E213 + 2 do E222 + **4 da S-C10** — **conte a tabela, não esta linha** |
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
| ~~**E213**~~ | ~~a parcela vencida tem multa e juros~~ | 9ª | rodada e conferida (**enum + 2 colunas**) | ✅ `fa7d838` · [relatório](execucao/E213.md) — **a Onda A fecha.** A base é a PARCELA e a decisão da dona não é preferência: o **CDC art. 52 §1º** limita a multa a *"dois por cento do valor da prestação"*, e a leitura literal cobraria os 2% do CONTRATO **de novo a cada parcela atrasada** — dez em atraso dariam 20% do contrato numa cláusula que diz 2%. **O plano dizia que faltava a conta; faltava a conta E o teto da porta**: com a 9ª ligada, o `POST /receber` RECUSAVA os R$ 515,00 devidos por uma parcela de R$ 500,00 (`expected 200 "OK", got 422`), dizendo à vendedora que ela cobrava demais enquanto a fila, o carnê e o portal mostravam os R$ 515,00 — **quatro leituras do mesmo número, e a única que decide dizia não**. A imputação quita no principal e **cristaliza só o que entra a mais** (linha `MORA`, PAGA), porque conta DERIVADA não sobrevive ao pagamento do principal: a parcela ficava PARCIAL devendo R$ 15,00 que o sistema dizia não existir. Medido em `heliumdb`, o banco de `DATABASE_URL`: **110 parcelas vencidas, R$ 1.476,00 de multa e R$ 538,25 de juros** que o instrumento manda cobrar. A varredura de trancas **acusou código certo pela segunda vez em dois épicos seguidos** (S-C33), e o relatório abre com o achado sobre si mesmo: **o épico chegou escrito e sem UMA medição** — os vermelhos são reprodução, não gravação |

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
| **E215** | **a ficha guarda quem assina** — os **9 campos** que faltam (estado civil, profissão, RG, nascimento, e-mail e o endereço inteiro). É o achado de maior alcance da auditoria | identificação | sim, grande | **aberto — fase 0 FEITA (13/08), e ela mudou o desenho.** Medido: **0 de 723 contratos têm CPF**, e não é falta de campo — a tela de fechar contrato **oferece** o CPF (`orcamentos/[id].tsx:1772`) e ele é **opcional** (`z.string().optional()`). São **1397 leads**, e a ficha não tem UM dado civil. Ou seja: o único campo de identificação que já existe está **100% vazio porque dá para pular**, e acrescentar 11 opcionais produziria 11 colunas vazias — a auditoria dizia que a vendedora preenche à mão no papel, e os dados confirmam. **Decisão da dona (13/08): OBRIGATÓRIOS no fecho** — a porta recusa o que falta, nomeando o campo; contratos existentes não são tocados. Ordem obrigatória dentro do épico, senão trava a loja: (1) colunas, (2) a ficha ganha os campos, (3) o contrato congela a cópia, (4) **só então** a obrigatoriedade. E o expurgo LGPD (`routes/leads.ts:390`) é `set({…})` de **lista curada à mão** — a classe da S-C33: campo pessoal novo nasce invisível para ele, e o plano já avisa que *dado pessoal novo entra nas duas pontas ou nasce fora da lei* |
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
| ~~**S-C31**~~ | ~~O recebimento PARCIAL é datado pelo último pedaço no caixa~~ | 🔵 | E221 | ✅ `HASH_S_C31` · [relatório](execucao/S-C31.md) — **fluxo, CSV do fluxo e DRE datam cada recebimento pelo dia DELE**, lendo os mesmos atos que o recibo do E221 lê. **A população é ZERO nos dois bancos** (`moscow_base` não tem UMA parcela; das 301 vivas com trilha em dev, todas têm **um ato só**, e `dia_difere = 0`): o que estava aberto era o mecanismo, e por isso **não há migração**. Três decisões declaradas: o **total nunca muda** (a parcela só se divide quando a soma dos atos fecha com o `valorRecebido` — senão entra como entrava, porque sumir com dinheiro é pior que datá-lo errado), **um ato só não se divide** (o `recebidoEm` da parcela É o dia dele, e é melhor que a trilha para os atos anteriores ao E221) e **data que não existe não se inventa**. O conserto precisou do que não estava na sobra: **a janela do SQL** — a parcela paga em 28/02 e 15/03 tem `recebido_em` em março e **não entrava** na consulta de fevereiro, então o mês continuaria R$ 300,00 a menos por mais que o motor dividisse. **O fechamento de comissão não corre risco, e isso foi medido**: ele data por `contratos.fechadoEm` (`comissao.ts:442`). **A conciliação ficou FORA por decisão** — `parcelas.conciliado_em` é uma coluna por linha, marcar um pedaço marcaria o outro e **esconderia divergência**, e carimbo por ato pede a tabela que o E221 recusou (S-C51/S-C52) |
| ~~**S-C10**~~ | ~~**Os "61 das 63 avarias" envelheceram, e ainda sustentam decisões de desenho.** O número nasceu no E110 e é citado em **8 sítios versionados**. Medido em `moscow_base` no E214: **116 bloqueios, TODOS com `lead_id` próprio, nenhum sem dono, e ZERO avarias.** Os comentários argumentam com ele, então não é troca de texto — é remedir e decidir se o argumento sobrevive.~~ **FECHADA — e eram 19 ocorrências em 17 arquivos, não 8 sítios** (enumerado por `git ls-files`; três dos que faltavam são justamente os que ARGUMENTAM: `escopo-loja.ts`, `agenda.ts`, `orcamentos.ts`). **O número nunca foi asserção** — as 19 são prosa, nenhuma dentro de um `expect`: não havia teste fingindo 63, havia onze argumentos de pé sobre estatística morta, que é pior, porque prosa não reprova quando envelhece. Remedido nos DOIS bancos: `moscow_base` **116 bloqueios, 116 com dona, 0 sem, 0 avarias**; `heliumdb` **127 `RESERVA_CASAMENTO` (125 com dona, 2 sem) + 100 `MANUTENCAO`, 0 reservas, 0 avarias**. O caso era 97% e é **0 de 116 na loja, 2 de 127 no dev** — e os 2 nasceram em 12/08 às 05:47 e 05:50, resíduo de fixture. **O argumento tinha duas metades e só uma caiu:** a estatística ("parede diária") morreu; a lógica ("sem dona não há o que comparar") é hoje sozinha quem segura o desenho, porque `lead_id` é NULLABLE e a porta de criação aceita o nulo. **Nenhum `if` foi desenhado sobre a metade que caiu** — o que caiu foi a razão de NÃO apertar a porta, e virou a S-C60. As 63 eram vazamento do spec 48, varrido em `3b71a43` (06/08): **o número estava morto havia sete dias quando o E167 o citou**, e a nota dele (`E167.md:60`) diz *"não é remedível nesta árvore, e não precisa ser"* depois de medir o zero e descartá-lo | 🟡 | E214 | ✅ [relatório](execucao/S-C10.md) |
| **S-C60** | **A porta que cria bloqueio órfão, e o argumento que a protegia caiu.** `routes/reservas.ts:929` — o `POST /bloqueios` prova vestido, lead e reserva contra a loja, os dois um contra o outro (R5/V4) e a mãe contra o cancelamento (R7), e **nunca exige que uma das duas âncoras de dona exista**: `RESERVA_CASAMENTO` sem `leadId` **e** sem `reservaId` é **201 hoje**, com `donoDoBloqueio` nulo para sempre — 2 dos 127 do dev nasceram assim. Já foi olhado e arquivado uma vez (metade da S27 da rodada 6, conferência de 05/08), e o que o mantinha fechado era o número: recusar seria *"trocar um defeito raro por uma parede diária"*, medida em 97%. **Remedido, a parede tem largura ZERO em `moscow_base`** (0 de 116). Exigir dona passou de caro a barato, e virou decisão de produto — a loja segura a peça antes de saber de quem será? Se não, a coluna vira `NOT NULL` por migração | 🟡 | S-C10 | aberta |
| **S-C61** | **Não há régua contra estatística de banco que envelhece em comentário.** Onze argumentos repetiram por **sete dias e três épicos** um número que um commit do próprio repositório (`3b71a43`) havia zerado, com a suíte verde o tempo todo — porque o número é **prosa**. É a classe que o E184 pegou nos manuais e fechou com a `varredura-manuais-prazos` (9 células, 5 constantes), mas aqui não há constante contra o que pregar: contagem de população não vira `const`. O caminho barato não é conferir o número — é **proibir o formato**: comentário que cite contagem de banco sem **data** e sem apontar o sítio canônico reprova. A S-C10 deixou a árvore no formato certo (todo sítio datado, o canônico em `lib/dono-do-bloqueio.ts`); nada obriga o próximo a manter | 🔵 | S-C10 | aberta |
| **S-C62** | **O "véu" tem população ZERO nos dois bancos, e é mecanismo de cinco portas.** A derivação de dono pela reserva-mãe (V3/E163 · V14/E167 · S-O17/E179 · S-O56/E185) é um módulo de 6 funções, 5 chamadas em `reservas.ts`, 10 operações que serializam `BloqueioVestido` aninhado, um campo do contrato de API e um spec de E2E. **A população que ela serve é zero nos dois bancos**: em `moscow_base`, 115 dos 116 bloqueios estão pendurados numa reserva-mãe **e todos têm `lead_id` próprio** (a derivação devolve o mesmo com ou sem ela); em `heliumdb` a tabela `reservas` está **vazia** e nenhum bloqueio tem `reserva_id`. Não é pedido de remoção — o mecanismo está certo e o `e2e/62` o exercita. É para ficar contável que o único lugar do mundo onde ele roda é uma fixture | 🔵 | S-C10 | aberta |
| **S-C63** | **`moscow_base` não recebeu a migração do E214, e é o banco do preview.** Medido em `information_schema.columns`: `avarias.tipo` e `avarias.justificativa_da_taxa` **não existem** na loja, enquanto `contratos.atraso_parcela_id` (E212), `parcelas.mora_perdoada_em` (E213) e `vestidos.exclusiva` (E216) existem. **Quatro das cinco colunas do dia chegaram e a do E214 ficou** — `docs/migracoes/2026-08-13-e214-taxa-de-limpeza-e-de-dano.sql` foi escrito e não foi rodado ali. O preview roda no banco da loja por `APP_DATABASE_NAME` e o `POST /avarias` do `main` escreve `tipo`: registrar uma avaria em `moscow_base` bate numa coluna que não existe. Sem perda de dado (a loja tem ZERO avarias), por isso 🟠 e não 🔴 — mas é a lição do E172 na mesma semana em que foi escrita: **a migração foi RODADA, não só escrita.** O `.sql` é idempotente (`IF NOT EXISTS`); quem fechar confere as duas linhas depois | 🟠 | S-C10 | aberta |
| **S-C32** | **O atraso não tem FILA — só se descobre abrindo a ficha daquela reserva.** O E212 pôs a conta e o botão em `reservas/[bloqueioId].tsx`, e `ATRASO_DEVOLUCAO` **não aparece em tela nenhuma além dela** (medido: um único sítio em `moscow-noivas/src`, e é o comentário que o próprio E212 escreveu). A peça que não voltou soma uma diária por dia em silêncio: quem não abrir aquela ficha não sabe que ela existe, e o valor cresce sozinho. É o oposto do reajuste do E211, que nasce do gesto de mover a data — aqui o fato é a AUSÊNCIA de gesto, e ausência não notifica ninguém | 🟡 | E212 | aberta |
| **S-C33** | **`COLUNAS_DE_ESTADO` é lista curada à mão, e coluna de estado nova nasce invisível para a detecção de CAS.** A varredura de trancas leu a porta do E212 como ABERTA enquanto o `where` da escrita repetia exatamente a condição lida — só porque `contratos.atrasoParcelaId` não estava na lista. O E212 consertou POR COLUNA (acrescentou a dela), e **nada obriga a lista a ficar completa**: é a classe que a conferência de 2026-08-05 achou na S30 (*"trava a lista, não a contagem"*), agora do lado das colunas. A régua acusa código certo, que é a direção mais cara — quem for fechar troca a lista por um derivado do schema. **O E213 é a segunda evidência, em dois épicos seguidos**: `parcelas.moraPerdoadaEm` nasceu invisível igual, e as DUAS portas do perdão apareceram como abertas estando sob CAS de verdade (`"routes/contratos.ts": 1` virou `3` no vermelho reproduzido). Duas colunas, dois épicos, o mesmo ponto cego — a lista curada não é sustentável | 🔵 | E212 | aberta |
| **S-C35** | **A retirada e a devolução não têm onde ser preenchidas.** As duas colunas existem desde sempre, a API grava, o PDF do contrato imprime os dois rótulos — e **nenhuma tela oferece o campo** (0 sítios em `artifacts/moscow-noivas/src`, enumerado por `git ls-files`). Medido: **1 de 723 contratos** tem data de retirada, nenhum tem devolução. O E222 pôs a régua na porta; enquanto o gesto faltar, o expediente da 4ª só é exercido por quem chama a API — o formato do E197 | 🟡 | E222 | aberta |
| **S-C36** | **O PDF do contrato imprime "Retirada" e "Devolucao" sempre vazios.** `contrato-pdf.ts:128-129` desenha as duas linhas a partir de campos que ninguém preenche. Não é defeito de código: é a mesma ausência da S-C35 vista no papel que a noiva leva para casa, e fecha junto com ela | 🔵 | E222 | aberta |
| **S-C34** | **A mensagem de cobrança cobra a multa e não a NOMEIA.** `whatsapp.ts:78` imprime `brl(p.totalVencido)`, e o `totalVencido` passou a incluir multa e juros no E213 (`cobranca.ts:154`). A noiva recebe *"um valor em aberto: **R$ 515,00**, há 30 dias"* de uma parcela de **R$ 500,00** — confere o carnê, vê R$ 500,00, e liga para a loja. É o **oposto** do que o próprio E213 fez no portal, onde o acréscimo vem com a conta escrita ao lado, e pela razão declarada lá: número maior sem explicação é o que gera a ligação. Uma linha na mensagem | 🟡 | E213 | aberta |
| **S-C50** | **A multa da cláusula 9ª é paga e não gera recibo.** A parcela `MORA` do E213 nasce PAGA na mesma transação do recebimento (`contratos.ts:1833`), mas a linha de trilha dela é **`MORA_RECEBIDA`** (`contratos.ts:1850`) e o recibo só conhece `PARCELA_RECEBIDA` (`recibo-do-papel.ts:67`). A soma dos atos dá **R$ 0,00 contra os R$ 15,00 recebidos**, `confere` é `false` e **nenhum papel sai** — a falha FECHADA do E221 funcionando como projetada sobre um caso que ela não previu. A cláusula 7ª manda fornecer *"todos os recibos de pagamentos efetuados"*, e este é um pagamento efetuado. Achado lendo o E213 contra o E221: nenhum dos dois olhou o outro | 🟡 | S-C31 | aberta |
| **S-C51** | **A conciliação continua um movimento por PARCELA.** `conciliacao.tsx:147-158` monta um `MovimentoSistema` por parcela, datado pelo `recebidoEm`. Contra um extrato que traz as DUAS linhas do banco (R$ 300,00 em 01/03 e R$ 700,00 em 15/03) a tela produz **três divergências falsas** — duas "só no banco" e uma "só no sistema" — de um pagamento perfeitamente correto. Dividi-la exige carimbo por ATO, e `parcelas.conciliado_em` (`financeiro.ts:617`) é coluna por linha: **marcar um pedaço marcaria o outro**, escondendo divergência, que é o oposto do que a conciliação existe para fazer. Carimbo por ato pede a tabela `recebimentos` que o E221 **recusou por escrito** — é decisão de modelagem, não linha de código | 🟡 | S-C31 | aberta |
| **S-C52** | **O carimbo da contadora ficou meio passo atrás do CSV.** `contabilidade/enviar` (`financeiro.ts:1491`) seleciona por `parcelas.recebido_em`, então a parcela cujos R$ 300,00 saem no CSV de **fevereiro** só é carimbada quando **março** fechar. O carimbo é operacional (é o `isNull` dele que decide o próximo envio) e não histórico — a história mora na trilha —, mas o descompasso **nasceu com a S-C31** e tem de ser contado. Fecha junto com a S-C51: é o mesmo carimbo sem casa por ato | 🔵 | S-C31 | aberta |
| **S-C53** | **Três leituras menores ainda datam pelo último pedaço.** `GET /financeiro/alerta-caixa` (`financeiro.ts:1184`, o saldo desde a âncora), `GET /financeiro/parcelas/exportar` (`financeiro.ts:1437`, a coluna "Recebido Em" do CSV) e o consolidado da rede (`admin.ts:688`, `recebido_em >= inicioMes`). As três ficaram fora do escopo de propósito — as duas primeiras respondem *"a parcela"*, não *"o movimento"*, e a terceira é de outro módulo —, mas as três somam dinheiro por data | 🔵 | S-C31 | aberta |
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
