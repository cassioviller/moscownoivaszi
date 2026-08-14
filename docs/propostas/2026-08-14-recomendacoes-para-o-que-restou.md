# Recomendações para o que restou — as 4 🟡 e as 48 🔵

**Aberto em 14/08/2026**, depois de as oito amarelas de código fecharem
(E225–E227, S-C170, S-C180). Trilha:
[`2026-08-13-contrato-de-papel/`](../revisao/2026-08-13-contrato-de-papel/EXECUCAO.md)
— **a tabela de lá segue sendo a fila e a fonte da contagem** (52 abertas:
ZERO 🟠, 4 🟡, 48 🔵). Este documento é o que o nome diz: **recomendações**,
uma por amarela e por blocos nas azuis, cada uma com o custo dito. As que são
decisão da dona estão marcadas — recomendar não é decidir.

O formato segue o da Fase 0 da ótica dos papéis: pergunta curta, recomendação
na frente, e o motivo com o número junto.

---

## As quatro amarelas

### S-C60 — o bloqueio órfão · decisão de PRODUTO (da dona)

**Pergunta:** a loja pode segurar um vestido antes de saber de qual noiva é?

**Recomendo: SIM, com validade.** O gesto existe no balcão (a noiva "quase
fechou" e a vendedora quer segurar a peça), e proibi-lo empurraria para o
contorno — reservar em nome de noiva errada. O que falta não é proibição, é
**prazo**: bloqueio sem `leadId` e sem reserva ganha validade de N dias
(sugiro **7**, o mesmo do link público — uma constante nomeada, pela S-C95),
aparece com selo âmbar na tela de reservas, e a régua de disponibilidade o
solta quando vence. Custo: uma coluna nada (o prazo deriva de `created_at`),
um predicado no `buscarBloqueiosAtivos` (o E225 acabou de ensinar o caminho) e
o selo. **Se a dona disser "não pode"**: o `POST /bloqueios` passa a exigir
`leadId` ou `reservaId`, e o custo vira migração zero (população de órfãos
hoje: conferir antes com `SELECT`, não estimar).

### S-C51 (+S-C52, S-C53, S-C72 🔵) — a conciliação por ATO · decisão de MODELAGEM (da dona)

**Pergunta:** a conciliação precisa da tabela `recebimentos` que o E221
recusou?

**Recomendo: NÃO criar tabela — derivar dos atos que JÁ EXISTEM.** O achado
que muda a conversa: **o recibo do E221 é por RECEBIMENTO**
(`recibo-do-papel.ts:20`) e ele já *"lê os mesmos atos para datar cada
recebimento pelo dia dele"* (`:118`) — a trilha `PARCELA_RECEBIDA` guarda
valor e data de cada ato. A tabela que o E221 recusou nasceu recusada porque
já existia com outro nome. O conserto das quatro sobras é **um leitor
compartilhado** (`atosDeRecebimento(contratoId)`, no idioma do `moraDe`):

- **S-C51** — a conciliação monta um `MovimentoSistema` por ATO (R$ 300,00 em
  01/03 e R$ 700,00 em 15/03 casam com as duas linhas do extrato);
- **S-C52** — o carimbo da contadora seleciona pelo ato, não pelo
  `recebido_em` final;
- **S-C53** — as três leituras menores datam pelo ato;
- **S-C72** — a régua nova confere que a soma dos atos fecha com
  `valorRecebido`.

População que sustenta a calma: **0 parcelas com mais de um ato entre 1078** —
mas é a mesma calma da S-C110, que tinha relógio. O primeiro pagamento parcial
real começa a contá-lo. *Ressalva de medição: derivar de trilha append-only
exige que estorno também esteja lá (está: `PARCELA_ESTORNADA`) — o leitor
soma as duas direções, e a S-C72 prega isso.*

### S-C220 — as datas que a Recepção não vê · decisão de PERFIL (da dona)

**Pergunta:** a Recepção deve ver retirada e devolução, sendo que foi a dona
quem fechou `contratos` para ela no E172?

**Recomendo: SIM — leitura estreita, não reabertura.** Quem atende o telefone
responde *"quando retiro?"* dez vezes por semana; a alternativa é transferir
para a vendedora, que é o custo que a S-C91 mediu. O desenho que preserva o
E172: um payload estreito na FICHA (duas datas e nada de dinheiro — nem valor,
nem parcelas, nem status de pagamento), servido por leitura própria em vez de
abrir `contratosDaNoiva`. É o mesmo idioma do `VestidoDaNoiva` do portal: a
pessoa vê o RECORTE que o papel dela precisa. **Se a dona disser não**, o
manual da recepção ganha a frase "transfira para a vendedora" — e a sobra
fecha por decisão escrita, como a S-O39.

### S-C231 — os cartões da carteira × a mora · MEDIÇÃO DE CONVENÇÃO (código, depois de medir)

**Pergunta:** `aReceber` e `emAtraso` somam com ou sem a mora?

**Recomendo a convenção por FINALIDADE, e ela cabe numa frase: cobrança mostra
com mora, projeção mostra o principal.**

- **`emAtraso` é leitura de COBRANÇA** (o que a loja tem a receber de quem já
  deve) → passa a somar `moraDe(p)?.total ?? saldoAberto(p)`, o mesmo reduce
  do portal (E226). A fila de cobrança já faz isso desde o E213 — hoje o
  cartão diverge DELA, não só das linhas.
- **`aReceber` é leitura de PROJEÇÃO** (o que entra se tudo correr) → fica no
  principal, **com o rótulo dizendo** ("sem multas de atraso"). A mora é
  derivada, cresce por dia e é perdoável — projetá-la afirmaria receita que a
  dona perdoa com um clique.

Antes de escrever: **medir o dashboard e o sino** (`projecao.emAtraso`,
`alerta-caixa`) e aplicar a MESMA convenção nos três no mesmo commit — mudar
um sem os outros trocaria uma divergência dentro da tela por uma entre telas,
que é o motivo de a sobra ter nascido 🟡 e não ter fechado no E226.

---

## As azuis, em oito blocos

A ordem é de valor ÷ custo, e o primeiro item paga o resto.

### Bloco 1 — a régua do codegen (S-C152) · **fazer primeiro**

Re-rodar o codegen num teste e exigir árvore limpa (~10 linhas com
`git status --porcelain` sobre `generated/`). É a régua que teria pego a
**S-C150 🟠** — o 500 armado num `GET` inteiro — no commit em que nasceu, e
protege todo épico futuro que tocar o spec. Nenhuma outra azul compra tanto
por tão pouco. *(Custo real a medir: o codegen precisa rodar determinístico —
se carimbar timestamp, a régua pede normalização.)*

### Bloco 2 — o portal aprende as outras cláusulas (S-C92, S-C202, S-C112)

Um épico de tela, irmão do E226: **a devolução entra no `VestidoDaNoiva`**
(S-C92 — é a data de que a multa da 10ª e a conta da 16ª correm, e é a única
que a noiva não vê), **cada cláusula de dinheiro ganha a seção que o manual
já explica** (S-C202 — avaria, atraso, extravio, rescisão, exclusiva: o
manual da noiva ensinou e a tela dela cala), e **o 422 `AVARIA_SEM_DONA` vira
frase na tela** (S-C112 — o corpo já diz "ligue a reserva à noiva antes de
cobrar"; mostrar o que o servidor já escreve é o conserto de menor custo do
repositório).

### Bloco 3 — a peça física, os restos do E225 (S-C114, S-C115, S-C121, S-C111, S-C233, S-C94)

- **S-C114** — `semContrato` vira DUAS listas: *"nunca teve contrato"* (gesto
  de balcão) e *"o contrato caiu com a peça na rua"* (venda desfeita, pode
  ter atraso cobrável). O discriminador já existe: `contrato_bloqueios` +
  `contratos.status`.
- **S-C115** — desfazer a retirada com atraso já COBRADO leva 422 (*"estorne a
  parcela do atraso primeiro"*), o idioma exato de `DEVOLUCAO_SEM_RETIRADA` e
  `LAVAGEM_SEM_DEVOLUCAO` que moram três linhas acima na mesma rota.
- **S-C121** — a ficha mostra o REAL quando existe (`retiradaDataReal`, com
  selo "retirada em DD/MM") e o combinado quando não — a régua do portal,
  aplicada à ficha.
- **S-C111** — índice parcial
  (`WHERE retirada_data_real IS NOT NULL AND devolucao_data_real IS NULL`) +
  teto com `log` na varredura das órfãs. Ficou mais barato depois do E225: o
  predicado é o mesmo do braço "na rua".
- **S-C233** — **pergunta para a dona antes de predicado**: peça devolvida de
  contrato cancelado passa pela lavanderia da loja? Se sim, o braço "na rua"
  ganha a cauda de lavagem; se não, fecha por decisão escrita.
- **S-C94** — não é código: espera o dump real (é a S-M17 da trilha max, o
  mesmo bloqueio).

### Bloco 4 — a avaria fecha o ciclo (S-C1, S-C98, S-C99, S-C48, S-C81, S-C82)

- **S-C1** — a 5ª §3º pede `constatadaEm: ENTREGA | DEVOLUCAO` na avaria (uma
  coluna com default `DEVOLUCAO`, migração de uma linha) — o dano visto na
  entrega hoje não tem onde existir, e a cláusula manda a LOJA substituir a
  peça nesse caso: sem o registro, a noiva paga pelo dano que recebeu pronto.
- **S-C98** — o prazo dos 7 dias vira campo no diálogo de cobrar, preenchido
  com a constante (o molde do E218: sugere e avisa, quem decide é a loja).
- **S-C99** — o botão ganha texto visível. É uma linha.
- **S-C48** — o E2E *registrar → cobrar → corrigir → o carnê segue* estende o
  spec 62, que já monta a cena até "cobrar".
- **S-C81/S-C82** — **manter, dito**: população 0 avarias; o N+1 e a grafia do
  cadastro entram no épico que a primeira avaria real justificar.

### Bloco 5 — a família do `?? []` (S-C161, S-C160, S-C162, S-C163)

Uma varredura nova — *"frase de vazio sobre lista com `?? []`"* — no molde
textual da `enums-do-contrato` (grafia: fallback de lista + literal de vazio
no mesmo componente), e os três sítios conhecidos fecham como população
inicial dela. S-C160 e S-C162 são o conserto (`isError` antes da frase);
S-C163 é registro de que silêncio ali é o certo — vira exceção DITA no teste.

### Bloco 6 — as peneiras aprendem sobre si mesmas (S-C75, S-C76, S-C78, S-C79, S-C182, S-C56, S-C153, S-C181)

Fecham juntas porque são o MESMO gabarito aplicado a varreduras diferentes:

- **S-C75 + S-C79** — trocar piso solto por **diferença contra
  `git ls-files`** num helper compartilhado pelas 14 varreduras; o piso deixa
  de ser número mágico e vira "o que entrou desde a última medição, nomeado".
- **S-C76 + S-C78 + S-C182** — todo autoteste de peneira ganha o par
  *acha-o-plantado / ignora-o-que-não-é* (o molde que a S-C180 acabou de
  escrever), e o arquivo sintético do `git add` vira função utilitária
  documentada — terceira vez que um épico a reinventa.
- **S-C56** — a grafia da S-C33 exclui os terminados em `ExpiraEm`/`VenceEm`
  (prazo, não fato) — três linhas.
- **S-C153** — **manter, dito**: o ponto cego da forma da escrita está
  declarado na própria varredura e já custou a medição que ia custar; parser
  de verdade (TS AST) não paga o preço hoje.
- **S-C181** — a PONTE da paridade ganha a coluna do INPUT (`LeadInput` ao
  lado de `LeadOrigem`), e a varredura confere as DUAS famílias — é o buraco
  que `CaptacaoLeadInputOrigem` (3 valores, sem `LOJA`) prova possível.

### Bloco 7 — manuais e trilha (S-C222, S-C213, S-C102, S-C161-doc)

- **S-C222** — a quarta varredura: contradição INTERNA (o molde já existe em
  `varredura-manuais-textos`; a regra: célula pregada não pode contradizer
  prosa do mesmo documento — começar pelo par que o E196 sofreu).
- **S-C213** — os dois recados ganham `data-tela` e a contagem `toBe(9)` sobe
  para 11 (agora em série, sem o veto do paralelo).
- **S-C102** — `MORA_RECEBIDA` grava a `explicacao` junto: uma linha, e a
  trilha passa a contar a história que a tela contou no dia.

### Bloco 8 — decisões pequenas, cada uma numa frase (para a dona)

| Sobra | Pergunta | Recomendação |
|---|---|---|
| **S-C21** | O lookbook público mostra "peça exclusiva"? | **Sim** — é argumento de venda; um selo, texto da dona |
| **S-C22** | Filtro "exclusiva" no acervo? | **Sim, quando** a primeira busca real doer — hoje são poucas peças; anotar e esperar |
| **S-C87** | A fila de cobrança age (botão de registrar contato)? | **Sim** — o registro já existe na ficha; é o mesmo diálogo, aberto de outro lugar |
| **S-C89** | Teto para o custo do sino? | **Sim** — cache de 5 min por loja no servidor; a conta hoje é por TELA aberta |
| **S-C131** | Derivar o expurgo LGPD do schema? | **Não agora** — a régua do E215 já cobra a lista; derivação é a conversa da S-C33, adiada com registro |
| **S-C132** | PDF imprime a qualificação? | **É o E220** — destravar D4/D7 primeiro; imprimir qualificação sem as 21 cláusulas seria meio documento |
| **S-C133** | Reescrever os 735 contratos antigos? | **Não** — nasceram sob outra regra; decisão escrita de que o vazio é histórico, não dívida |
| **S-C171** | Manter o `.slice(0, 500)` do backup? | **Manter, escrito** — é log de erro, truncar é aceitável; a sobra pede o veredito no código, não outro código |
| **S-C221** | Costureira edita o expediente? | Perguntar à dona; **recomendo restringir** — expediente é cláusula 4ª, e quem o muda muda o que o contrato promete |
| **S-C232** | Apagar data/prazo pelo PATCH? | **Sim** — spec ganha `nullable`, codegen re-roda (a régua do Bloco 1 já estará cobrando), e a nota do E224 volta a ser verdade |
| **S-C61** | Régua contra estatística envelhecida em comentário? | **Não fazer régua** — convenção escrita: número de banco em comentário sempre com a data da medição. Régua textual aqui custaria mais que o defeito |
| **S-C62** | O "véu" (reserva-mãe) com população 0? | **Manter o mecanismo** — cinco portas o usam e o E185 provou que ele morde; população 0 é fato de dado, não de código |
| **S-C77** | Corrida `sm7` para a 29ª transação? | **Sim, barato** — o molde das outras corridas sm7 já existe; copiar a cena para o par `avarias`+`parcelas` |

---

## A ordem que eu seguiria

1. **Bloco 1** (S-C152) — meia hora que protege todos os épicos seguintes.
2. **As três perguntas da dona** (S-C60, S-C220, S-C233 + a tabela do Bloco 8)
   — numa sentada, como a Fase 0: cada uma tem recomendação, a dona marca
   sim/não, e o que virar "não" fecha por decisão escrita no mesmo dia.
3. **Bloco 2** (portal) e **Bloco 3** (peça física) — os dois com cara de
   épico, nessa ordem: o portal é tela pura; o físico mexe em porta e pede o
   E2E inteiro.
4. **S-C231** — depois de medir dashboard e sino, num commit só.
5. **Blocos 4–7** — em lotes, possivelmente em paralelo (são áreas disjuntas;
   a lição dos worktrees vale: base conferida, faixas de S-C reservadas).
6. **S-C51** por último entre as grandes — é a única que mexe em conciliação
   contábil, e o leitor de atos merece nascer com a contadora olhando.

**O que este documento não faz:** não decide o que é da dona, não estima horas
e não substitui a tabela — se uma recomendação virar trabalho, ela vira épico
na fila do `EXECUCAO.md`, com vermelho medido antes do verde, como as oito de
hoje.
