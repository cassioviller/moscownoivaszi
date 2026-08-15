# 2026-08-15, segunda metade — a fila inteira, e as duas que não são código

A sessão pegou **as 22 sobras abertas da trilha do contrato** e executou tudo
que era executável. **Restaram duas, e nenhuma é código**: a S-C51 espera a
contadora (decisão de modelagem) e a S-C132 é o E220, travado em D4 e D7.

Depois, os cinco manuais foram reescritos contra a onda e republicados.

## Os commits

| O quê | Hash |
|---|---|
| A linha-resumo das pendências dizia 4 sobre uma tabela de cinco | `0dfa8b95` |
| **S-C281** — nulo não é data, e a coerção discordava em 113 campos | `0ac71d2c` |
| **S-C250/S-C251** — a lista silenciada que troca de nome antes de mentir | `1f6a8e5f` |
| **S-C260/S-C261/S-C271** — o julgamento das réguas vira régua | `ef2a62d8` |
| **S-C240/S-C241/S-C242** — o que a porta de troca deixou aberto | `ac6c399b` |
| **S-C280/S-C282/S-C243/S-C22** — a consulta por contrato, e três decisões escritas | `5baadfd1` |
| **S-C52/S-C53/S-C72** — o dinheiro datado pelo último pedaço | `835c779c` |
| **S-C81/S-C82/S-C93** — o invariante, o N+1 e a régua que ninguém chamava | `74e56d61` |
| **S-C290/S-C94** — o desempate prefere a reserva viva | `f8f62d68` |
| Os cinco manuais alcançam a onda, e a régua ganha a segunda negação | `2fa87dda` |

Régua no fecho: **API 1755 (251 arquivos) · frontend 998 (108) · E2E 177 ·
typecheck verde nos 5 projetos**. A suíte de API rodou inteira **seis vezes**
na sessão; o E2E, **quatro**.

E a primeira coisa do dia foi publicar: o `main` estava **69 commits à frente**
do `origin/main`, com a onda inteira de 14 e 15/08 parada. `cbcd8b30..0dfa8b95`,
fast-forward — e `cbcd8b30` era exatamente onde os worktrees dos agentes
nasciam, que é por que eles nasciam 48 commits atrás.

## O que a sessão ensinou

### 1. Sete das nove sobras estavam erradas sobre si mesmas — e todas para MENOS

Não é coincidência: a sobra é escrita **no fim de um épico**, por quem acabou de
olhar dois arquivos, e a medição olha o repositório.

| sobra | dizia | media |
|---|---|---|
| **S-C281** | 22 campos (`coerce.date().optional()`) | **113** — a grafia era o grep, não a causa |
| **S-C250** | 10 atribuições, 2 sem estado | **20 e 5** |
| **S-C260** | 10 varreduras não julgadas | **duas dimensões**: grafia E pacote |
| **S-C240** | "zero ocorrências de reserva" | **nove**, e nenhuma é a peça |
| **S-C82** | dói "quando listarem por loja" | dói já: **6 consultas** para 4 avarias |
| **S-C93** | os `min`/`max` são absolutos | **não existem** — nenhum dos 7 `datetime-local` os tem |
| **S-C94** | `moscow_base`, 0 contratos | `heliumdb`, **776** — o banco errado, quarta vez |

As duas que estavam **certas** e a que estava **errada para mais**:

- **S-C242** supunha que a corrida estava fechada, e a cena **achou defeito**;
- **S-C52** dizia que o carimbo alimentava o próximo envio — verdade para
  `pagamentos`, e a sobra generalizou: `parcelas.enviado_contabilidade_em`
  **não tem leitor nenhum**;
- **S-C81** propunha um conserto de 9 rotas para eliminar risco que **um índice
  único do banco já impede**.

### 2. O que a cena de corrida achou

A S-C242 pedia uma cena `sm7` "para exercitar a disciplina de tranca". A
disciplina estava lá; **faltava a transação repetir a condição lida no pool**.
Duas trocas do mesmo contrato no mesmo segundo passavam as duas, e **o contrato
terminava com duas reservas vivas e dois vestidos presos** — de um gesto que era
para trocar uma peça por outra. `expected 2 to be 1`.

É a K8 do `PATCH` e a S-O31 do `POST /link`, **terceira vez nesta trilha**.

### 3. E o primeiro conserto dela foi longe demais

Junto com a reconferência do vínculo eu vetei também trocar a partir de reserva
já cancelada — cinto e suspensório, **por raciocínio e não por medição**. O E223
tem cena dizendo o contrário (*"a troca ainda funciona e religa o contrato numa
reserva viva"*), e ela reprovou no mesmo minuto. **O que fecha a corrida é o
VÍNCULO, e só ele.**

A guarda saiu e o porquê ficou escrito no lugar dela — é a página mais útil do
commit, pela mesma razão que o E94 registrou um assert escrito errado sobre
código certo.

### 4. A medição obrigou a DESDIZER duas afirmações minhas

Nos dois casos eu já tinha escrito a frase antes de conseguir prová-la:

- **S-C241**: afirmei que o portal passava a mostrar duas peças depois da troca.
  Não passa, e a cena não é construível — dois leitores filtram `canceladoEm` e
  o terceiro é salvo pelo `TROCA_APOS_RETIRADA`, que impede a reserva abandonada
  de ter datas reais. Reescrito: **o dano é latente, e duas coisas independentes
  teriam de mudar**. A segunda ganhou cena própria.
- **S-C53**: comecei a consertar o alerta-caixa e a leitura mostrou que **era
  constraint, não omissão** — a consulta serve dois motores com uma lista só, e
  dividir faria a curva somar o previsto N vezes. O erro criado seria maior que
  o corrigido.

### 5. Três réguas mordiam a própria autora

- **A S-C182 me pegou duas vezes.** A `varredura-das-varreduras` nasceu com
  retrato **29** porque foi medida enquanto o próprio arquivo ainda não tinha
  passado por `git add` — ela enumera pelo `git ls-files` e **não se
  enxergava**. Verde na rodada do arquivo, vermelho na suíte inteira do commit
  seguinte. Aconteceu de novo com a varredura do dinheiro.
- **A régua nova quase se enganou sozinha**: aceitar `toEqual([])` como prova de
  população faria a `varredura-das-varreduras` aprovar as 31 sem olhar nenhuma,
  porque **toda varredura da casa termina nessa linha**. O `RETRATO` exige lista
  não vazia, e há autoteste com esse nome.
- **O `--so-injetar` começou apagando o que ia reusar**: a limpeza de PNGs
  antigos roda no topo do módulo, então o modo que existe para NÃO recapturar
  destruía as 24 capturas versionadas antes de lê-las — 90 KB e 24 figuras
  vazias em vez de 5 MB.

### 6. Onde a medição achou defeito que sobra nenhuma citava

- **`varredura-codegen-em-dia`** (nascida dois dias antes) comparava duas
  fotografias **sem piso**: com os `generated/` vazios, `antes` e `depois` são a
  mesma string vazia e ela passa verde. Verde por não ter olhado, dentro da
  régua contra o verde por não ter olhado.
- **`varredura-data-de-negocio-em-fixture`** conferia que os arquivos existem
  sem conferir que achou algo dentro: renomeie `casamentoData` e ela examina
  zero sentenças.
- **`ReceberParcelaBody.recebidoEm`** — `required` no spec — aceitava `null` e
  gravava um pagamento de R$ 1.000,00 datado de **01/01/1970**, com 200 OK.
- **Os dois de `atendimentos/novo.tsx`**: um 500 mandava **cadastrar uma cabine**
  numa loja que pode ter cinco, e o outro **oferecia criar a reserva** de uma
  noiva que já tem a peça presa.
- **A data dos cinco manuais**: 14/08 na capa, 15/08 no pé.
- **Duas frases do guia da noiva** que negam o DADO — a régua de contradição só
  conhecia negação de TELA.

### 7. Quando a população zero decide o tamanho do conserto

Cinco medições de banco ordenaram cinco decisões, e nas cinco a resposta foi
**pregar em vez de refatorar**:

| o quê | população |
|---|---|
| parcelas recebidas em pedaços | **0** em 1193 atos |
| `contratos.bloqueio_vestido_id` preenchido | **0** de 772 |
| contratos ativos com reserva cancelada vinculada | **0** |
| peças exclusivas no acervo | **0** de 514 |
| contratos com data de retirada | **1** de 776, e é linha de seed |

O caso mais claro é o do dinheiro datado pelo último pedaço: o conserto certo
muda a assinatura de um motor de caixa, e do outro lado da balança está um
cenário que o banco **nunca produziu**. Entrou régua que enumera quem soma por
`recebido_em` e exige lado — divisão ou dívida **com motivo**.

## A sobra que a sessão abriu, e fechou

**S-C290** nasceu ao medir a S-C241 e fechou no mesmo dia. Ela é a assimetria
entre três leitores da mesma união — e a medição mostrou que a assimetria é
**decisão**: dois respondem *"qual vestido é o seu"* (promessa) e o terceiro
*"a peça saiu e voltou?"* (fato físico). O errado era o **desempate**: com
`asc(createdAt)` sozinho vence a mais velha, e depois de uma troca a mais velha
é a abandonada — a ficha dizia *"não retirada"* sobre uma noiva com a peça nova
em casa.

## As duas que ficaram

| # | O quê | Espera |
|---|---|---|
| **S-C51** 🟡 | a conciliação é um movimento por PARCELA | a contadora — carimbo por ATO pede a tabela que o E221 recusou por escrito |
| **S-C132** 🔵 | o PDF não imprime a qualificação | é o **E220**, travado em **D4** e **D7** |

A S-C51 ganhou o número que dimensiona a urgência: enquanto **1193 atos forem
1193 parcelas**, a conciliação por parcela e a por ato dão a mesma resposta.

## Os manuais, e a terceira régua que faltava

Reescritos contra a onda e **republicados nos cinco endereços** — os quatro sem
prints direto do repo, e o da vendedora pelo `--so-injetar`.

A reescrita achou o que as quatro varreduras não viam, e as duas entraram como
régua: a **data que se contradiz** (topo × rodapé) e a **negação do DADO**
(*"não mostra"*), que é a mesma mentira que negar a tela — quem lê não vai
procurar. A segunda distingue negar o **dado** de negar o **valor**: a frase que
ficou no lugar diz que o portal não mostra o valor do caso dela, e isso é
verdade.
