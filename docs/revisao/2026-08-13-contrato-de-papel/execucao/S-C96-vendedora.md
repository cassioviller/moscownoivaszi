# S-C96 (vendedora) — o manual aprende que o contrato cobra, e o arco deixa de parar no aceite

**Trilha do contrato de papel, leva 2 — os manuais** · agente da vendedora,
worktree próprio · base `d5733a96` (a fundação do lote: a régua dos manuais
aprende dinheiro)
Fecha, do lado da vendedora: **S-C96 🟡**, **S-C97 🔵** (o passo 10 que faltava),
**S-C45 🔵** (avaria), **S-C88 🔵** (a 16ª), **S-C113 🔵** (a peça fora sem
contrato), **S-C20 🔵** (peça exclusiva).
Abre: **S-C190 🟡**, **S-C191 🔵**.
Réguas: `varredura-manuais` · `varredura-manuais-prazos` ·
**`varredura-manuais-textos`** — **3 arquivos, 13 testes, verdes** ·
typecheck **verde nos 5 projetos**.
**Nenhuma linha de código de produto mudou.** O diff é um arquivo:
`docs/manuais/vendedora.html`, +268/−4.

---

## O que o plano errou, e as três correções são de MEDIÇÃO

### 1. Duas das treze constantes NÃO EXISTIAM quando o briefing foi escrito

A tabela do briefing listava `DEDUCAO_DA_RESCISAO_PCT` (60) e
`PRAZO_DEVOLUCAO_DA_LOJA_DIAS` (30) como se fossem constantes de
`lib/financeiro-core/src/rescisao.ts`. Medido antes da primeira linha:

```
$ grep -n "const [A-Z_]" lib/financeiro-core/src/rescisao.ts
(nada)
```

Os dois números eram **literais soltos**: o 60% era o `0.4` de
`rescisao.ts:191` (`Math.round(restanteComumC * 0.4)` — deduz 60, guarda 40),
e o prazo dos 30 dias era o `addDias(diaLocal(agora), 30)` de
`contratos.ts:1847`, dentro do `INSERT` da `contas_pagar`. **Nenhum dos dois
tinha nome, e portanto nenhum dos dois era citável por uma célula
`data-regua`.**

O briefing mandava conferir cada valor lendo a fonte, e foi essa conferência
que os achou. O integrador batizou os dois na fundação (`d5733a96`), e só
depois disso a citação passou a ser possível. **A instrução "confira cada valor
lendo a fonte — esta tabela pode ter envelhecido" pagou-se inteira na primeira
hora.**

### 2. O briefing conhecia duas réguas de manual, e são TRÊS

Ele mandava rodar `varredura-manuais` e `varredura-manuais-prazos`. Existe uma
terceira, e é a que mais restringe o que se pode escrever:
**`varredura-manuais-textos`** (E210), que exige que **todo** `<span class="btn">`
e **toda** primeira célula das tabelas `<th>O recado</th>` exista
**literalmente** no código — frontend, rotas e `lib/` numa corda só.

Ela tem uma trava que muda o desenho do trabalho:

```js
const moldes = todas().filter((c) => c.molde);
expect(moldes.length).toBe(9);
```

O escape declarado (`data-tela="pedaço"`, para o rótulo montado em tempo de
execução) está travado em **igualdade**, não em piso. Quatro agentes em
paralelo acrescentando moldes colidiriam nesse `toBe(9)` — então este manual
foi escrito com **zero moldes novos**: cada chip e cada recado citado é uma
string que existe contígua no código, conferida antes de ser escrita. Onde a
frase da tela é montada com dado dentro (a faixa da avaria, o aviso da entrada,
a recusa do prazo), ela entrou como **prosa em `<p>` ou bloco `.fala`**, que a
régua não prega — e não como citação literal que ela pregaria errado.

### 3. O briefing dizia "a peça fora **sem contrato** aparece na fila" e atribuía isso à S-C113

A capacidade existe e está descrita no manual, mas ela é da **S-C86**, fechada
em `b1a21d00` (`FilaDeAtrasos.semContrato`). A **S-C113** é a sobra que cobra o
manual por não contá-la — ela é o pedido, não a entrega. A distinção importa
porque é a S-C113 que este commit fecha, e não a S-C86.

---

## O que a vendedora passa a saber, e onde cada coisa foi lida

**Regra 22:** nada aqui foi deduzido. Cada afirmação sobre o que a tela mostra
tem `arquivo:linha` lido.

| O que o manual passou a dizer | Lido em |
|---|---|
| O cartão do atraso, o título que muda no extravio e o botão | `pages/reservas/[bloqueioId].tsx:903-937` |
| A peça atrasada fora do rol de itens | `pages/reservas/[bloqueioId].tsx:941-951` |
| "Registrar retirada" / "Registrar devolução" / "Desfazer …" / "Registrar volta" | `…/[bloqueioId].tsx:1099`, `:1062`, `:1070`, `:970`, `:1025` |
| "Enquanto a devolução não for registrada, o vestido fica indisponível" | `…/[bloqueioId].tsx:1041-1043` |
| O diálogo "O vestido voltou como saiu?", e o perfil sem `criar` | `…/[bloqueioId].tsx:1737-1771` |
| Os dois tipos de avaria como rótulo de tela | `…/[bloqueioId].tsx:1318-1319` |
| A faixa antes do clique, e a justificativa que habilita o botão | `…/[bloqueioId].tsx:1342-1373` |
| O lápis, o diálogo de correção e "Salvar correção" | `…/[bloqueioId].tsx:1218-1222`, `:1386-1471` |
| "Este reparo já recebeu dinheiro" trava a correção | `…/[bloqueioId].tsx:1445-1454` · `routes/reservas.ts:2983-2984` |
| "Cobrar reparo" / "Recobrar reparo" | `…/[bloqueioId].tsx:1206` |
| O reparo de peça sem dona é recusado | `routes/reservas.ts:1929-1933` |
| A fila no topo de Contratos, e "Cobrado" não tira a linha | `pages/contratos/index.tsx:150-260` |
| O bloco das órfãs, com a frase literal | `pages/contratos/index.tsx:229-260` |
| O sino: "N peças fora do prazo de devolução" | `lib/financeiro/fila-de-atrasos.ts:68` · `components/sino-notificacoes.tsx:157-170` |
| O aviso do reajuste da 17ª, antes do clique | `pages/noivas/[leadId]/index.tsx:673-680` |
| O placeholder dos 40% e o aviso da 8ª §1º | `pages/contratos/[id].tsx:896-918` · `financeiro-core/reserva.ts:92-96` |
| O aviso da peça exclusiva, dentro do "Gerar contrato" | `pages/orcamentos/[id].tsx:1779`, `:1792`, `:1853` · `lib/peca-exclusiva.ts:70-76` |
| O selo "Exclusiva" nos quatro lugares | `vestidos/[id].tsx:288-290` · `vestidos/index.tsx:729-736` · `orcamentos/[id].tsx:1592` · `orcamentos/[id].tsx:1853` |
| A prévia da rescisão no diálogo de cancelar | `pages/contratos/[id].tsx:1089-1120` |
| O alerta do estorno contra a cláusula, e o motivo que troca de pergunta | `pages/contratos/[id].tsx:1143-1157` |
| O recibo que diz "· inclui … de multa e juros" | `pages/contratos/[id].tsx:813` |
| A noiva lê a mora por extenso no portal dela | `pages/noiva-portal.tsx:689-703` |
| O bloco de cobrança é gateado por `financeiro` — e ela não tem | `pages/mensagens/index.tsx:75`, `:481` |

### Um erro MEU, achado relendo em vez de deduzir

Escrevi que a loja marca a peça como exclusiva em <span>“Editar dados”</span>,
por analogia com a ficha da noiva, onde esse é o rótulo. **Na ficha do vestido o
botão se chama "Editar vestido"** (`pages/vestidos/[id].tsx:300`). As duas
strings existem no código, então a `varredura-manuais-textos` teria passado
**verde sobre a frase errada** — a régua confere que o rótulo existe, não que
ele esteja no lugar certo. É a mesma lição que a entrega 4 dos manuais pagou
duas vezes ("a aba Administração é do proprietário", "o selo Portal vencido
aparece na Cobrança"): **deduzir por analogia produz exatamente a classe de
erro que nenhuma régua pega.**

---

## As decisões de escrita, e por que cada uma

**1. O passo 10 não é "a retirada"; é "a peça sai e volta".** A S-C97 pedia o
passo que falta, e a tentação era documentar só o gesto novo do E224. Mas o
gesto do E224 mora na ficha do **contrato** (o combinado) e o que faz o dinheiro
correr mora na ficha da **reserva** (o acontecido). Os dois campos têm nomes
quase iguais e significados diferentes, e confundi-los custa a diária da 16ª —
por isso a seção abre justamente separando os dois.

**2. As duas faixas da 16ª entraram numa tabela, não em prosa, porque elas NÃO
SE SOMAM.** O manual precisa que a vendedora leia "de 1 a 9 dias é diária +
multa; do 10º é 4× e a multa some". Escrito em prosa, o "e a multa some" é a
metade que se perde. A escada com números fecha isso: nove dias custam
**R$ 4.750,00** e o décimo custa **R$ 12.000,00**.

**3. O contraste entre AVISAR e RECUSAR virou uma tabela de três colunas, com o
número medido na coluna do porquê.** O briefing pedia explicitamente que o
manual explicasse por que duas regras do mesmo contrato recebem tratamentos
opostos. A resposta honesta não é jurídica, é medida: **101 dos 208 contratos
com entrada estão abaixo dos 40%, e a média é 67,6%** (E218). A vendedora que
lê isso entende que não está burlando nada ao digitar menos.

**4. As três frases MONTADAS ficaram fora das tabelas "O recado".** O aviso da
entrada, a recusa do prazo e a faixa da avaria são construídas com a
configuração da loja dentro, então não existem inteiras no código. Citá-las na
tabela exigiria `data-tela`, e o `toBe(9)` dos moldes é do integrador. Elas
entraram como prosa e como blocos `.fala`, com o conteúdo verdadeiro e sem
prometer literalidade que a régua não pode conferir.

**5. Os 13 números do contrato entraram em 16 células `data-regua`, e nenhum
número deles está escrito à mão em lugar nenhum.** Onde a prosa repete um valor,
ele está pregado numa célula da mesma seção. O rodapé do manual passou a dizer
isso à vendedora, que é a informação que a faz confiar no documento: *"se a dona
mudar um número, este manual reprova no mesmo dia em que ele mudar."*

**6. O manual DIZ o que o sistema não faz.** Três ausências entraram na letra,
porque a régua que esconde o próprio alcance é a que autoriza (E186):
a correção monetária não é calculada (a 9ª não nomeia índice); o diálogo de
cancelar não pergunta de quem partiu a rescisão (a 13ª, S-C151); e o carnê do
contrato ainda não mostra a multa e os juros (a S-C190, aberta abaixo).

---

## Verificação

### As três varreduras de manual — 13 testes, verdes

```
 ✓ varredura-manuais.test.ts > … > olha para manuais, itens e perfis — não para conjuntos vazios
 ✓ varredura-manuais.test.ts > … > todo perfil citado por um manual é um perfil que o sistema semeia
 ✓ varredura-manuais.test.ts > … > a lista do manual é a lista da tela — dos dois lados, inteira
 ✓ varredura-manuais.test.ts > … > os links entre manuais apontam arquivo que existe
 ✓ varredura-manuais.test.ts > … > todo item do índice leva a uma seção que existe na página
 ✓ varredura-manuais-prazos.test.ts > … > olha para citações de verdade — não para um conjunto vazio
 ✓ varredura-manuais-prazos.test.ts > … > toda régua citada por um manual existe no código
 ✓ varredura-manuais-prazos.test.ts > … > toda régua do registro resolve na fonte e vale um número
 ✓ varredura-manuais-prazos.test.ts > … > e o número que o manual escreve é o número que a constante vale
 ✓ varredura-manuais-prazos.test.ts > … > nenhum manual ressuscita o link de 7 dias (S-O39, fechada no E176)
 ✓ varredura-manuais-textos.test.ts > … > a varredura tem o que varrer — piso de população
 ✓ varredura-manuais-textos.test.ts > … > todo nome de botão e todo recado citados existem na tela
 ✓ varredura-manuais-textos.test.ts > … > molde é a exceção declarada, e continua sendo exceção

 Test Files  3 passed (3)
      Tests  13 passed (13)
```

Baseline antes de tocar no arquivo, para comparação: **3 passed · 12 passed** —
o 13º é o teste novo que a fundação trouxe (*"toda régua do registro resolve na
fonte e vale um número"*).

### As duas réguas MORDEM, medido quebrando de propósito (regra 34)

Verde sobre documento novo não prova nada: as duas réguas foram quebradas de
propósito antes de o commit ser aceito, uma célula de número e um chip de botão.

**A régua dos números**, com `R$ 250,00` trocado por `R$ 200,00` na célula de
`MULTA_DE_ATRASO`:

```
AssertionError: o manual promete um prazo que o código não pratica: expected [ Array(1) ] to deeply equal []
- []
+ [
+   "vendedora.html diz \"uma diária por dia de atraso + multa de R$ 200,00\" para MULTA_DE_ATRASO (vale 250 reais)",
+ ]
```

**A régua dos textos**, com o chip `Registrar retirada` trocado por
`Registrar a retiradaXX`:

```
 FAIL  src/lib/varredura-manuais-textos.test.ts > varredura — o manual cita a tela LITERALMENTE (E210) > todo nome de botão e todo recado citados existem na tela
AssertionError: o manual cita o que a tela não tem:
- []
+ [
+   "docs/manuais/vendedora.html · botão: «Registrar a retiradaXX»",
+ ]

 Test Files  2 failed (2)
      Tests  2 failed | 6 passed (8)
```

Desfeitos os dois: **13 passed (13)**.

### As 16 células, e as 13 réguas do contrato

```
$ grep -o 'data-regua="[A-Z_]*"' docs/manuais/vendedora.html | sort | uniq -c
      1 DEDUCAO_DA_RESCISAO_PCT              2 DIAS_PARA_EXTRAVIO
      1 JUROS_DE_MORA_MENSAL_PCT             1 MULTA_DA_PECA_EXCLUSIVA_PERCENTUAL
      1 MULTA_DE_ATRASO                      1 MULTA_DE_MORA_PCT
      1 MULTIPLICADOR_DE_EXTRAVIO            2 PRAZO_ANTES_DA_RETIRADA_DIAS
      2 PRAZO_DEVOLUCAO_DA_LOJA_DIAS         1 RESERVA_PCT
      1 TAXA_LIMPEZA_MAXIMA                  1 TAXA_LIMPEZA_MINIMA
      1 TETO_DO_DANO_EM_ALUGUEIS
      — e as 4 que já existiam: LOOKBOOK_TTL_MS, PORTAL_TTL_MS, SESSAO_TTL_MS, VALIDADE_PADRAO_DIAS
```

**16 células novas, cobrindo as 13 réguas do contrato — todas as 13.** As quatro
antigas ficaram como estavam. O manual saiu de **4 células e 4 réguas** para
**20 células e 17 réguas**.

### As contas escritas, conferidas uma a uma

| conta | de onde | confere |
|---|---|---|
| 9 dias × R$ 500,00 + R$ 250,00 = **R$ 4.750,00** | E212, tabela da escada | ✅ |
| 4 × R$ 3.000,00 = **R$ 12.000,00** no décimo dia | E212 | ✅ |
| diária = R$ 3.000,00 ÷ 6 dias = **R$ 500,00** | E212 (3 antes + o dia + 2 depois) | ✅ |
| R$ 500,00 vencidos há 30 dias = **R$ 515,00** (R$ 10,00 + R$ 5,00) | E213 | ✅ |
| multa na parcela = R$ 10,00 contra R$ 100,00 no contrato | E213, CDC art. 52 §1º | ✅ |
| teto do dano: **R$ 15.000,00** no vestido de R$ 3.000,00, **R$ 2.000,00** no véu de R$ 400,00 | E214 | ✅ |
| entrada sugerida de R$ 5.000,00 = **R$ 2.000,00** | 40% | ✅ |
| retirada 06/09/2028 → carnê fecha **17/08/2028** | 20 dias antes | ✅ |
| rescisão: R$ 1.200,00 + R$ 1.000,00 → retém **R$ 1.800,00**, devolve **R$ 400,00** | S-C140 | ✅ |
| exclusiva: R$ 857,14 retidos, R$ 142,86 sob a 11ª, **R$ 57,14** devolvidos | E217 | ✅ |

### Typecheck

```
lib/api-spec typecheck: Done
scripts typecheck: Done
artifacts/api-server typecheck: Done
artifacts/moscow-noivas typecheck: Done
+ typecheck:e2e
```

**Verde nos 5 projetos.**

### O que NÃO foi rodado, e por quê

**API e E2E não foram rodados, por instrução** — nenhuma linha de código de
produto mudou, e o diff é um `.html` de documentação. O E2E continua sendo do
integrador de qualquer modo: worktree isola arquivo e banco, **não isola PORTA**.

---

## Visto de passagem

As duas entram na tabela de Sobras do `EXECUCAO.md` pelas mãos do integrador
(faixa reservada **S-C190–S-C199**).

### S-C190 🟡 — o carnê do contrato não mostra a mora, e é a única tela de dinheiro que a vendedora abre

O E213 pôs a conta da 9ª em **quatro leituras** e consertou o teto da porta. A
quinta leitura ninguém mediu: **a ficha do contrato**, que é a única tela de
dinheiro que a Vendedora alcança — ela tem `financeiro: NADA` nos perfis
semeados (`configuracao-inicial.ts:147`), então `/financeiro/cobranca` e o bloco
*"Lembrar de um valor em aberto"* de Mensagens (gateado por `veFinanceiro`,
`pages/mensagens/index.tsx:75`, `:481`) **não existem para ela**.

Medido:

- o dado **chega**: `routes/contratos.ts:179` põe `mora: moraDe(completa)` em
  toda parcela que sai daquela rota, e `Parcela.mora` está no spec
  (`openapi.yaml:7492`, sob `Parcela:` na `:7450` — a `:7159` é a irmã
  `PortalParcela.mora`, que é a que a NOIVA lê);
- a tela **não o lê**: `pages/contratos/[id].tsx:748-750` imprime
  `brl(parcela.valorPrevisto)` e o selo `Atrasada` (`:543`), e o único
  `.mora` do arquivo é o do **recibo**, `:813` — isto é, depois que o
  dinheiro já entrou;
- o diálogo de receber **pré-preenche o principal**:
  `components/dialogo-receber-parcela.tsx:103` usa `saldoAberto(parcela)`.

Numa parcela de **R$ 500,00 vencida há 30 dias**: o portal da noiva mostra
**R$ 515,00** por extenso, o `POST /receber` **aceita** R$ 515,00 desde o E213,
e a tela da vendedora mostra R$ 500,00 e oferece receber R$ 500,00 — quem
clicar quita a parcela e **deixa os R$ 15,00 da cláusula no chão**, sem que
nada diga que eles existiram. É o formato do E213 invertido: lá as três
leituras mostravam 515 e a única que decidia dizia não; aqui a porta e a noiva
dizem 515 e a única que a vendedora vê diz 500.

O manual declara a ausência e ensina o contorno enquanto ela durar — o que a
regra do E184 admite como estado provisório, e o que a S-C190 existe para
apagar.

### S-C191 🔵 — o perdão da mora existe na API e em nenhuma tela

`POST /parcelas/:id/perdoar-mora` e `DELETE …/perdoar-mora` nasceram no E213
com CAS de verdade, motivo obrigatório, coluna própria (`mora_perdoada_em`) e
duas linhas de trilha (`MORA_PERDOADA` com o acréscimo dispensado do dia,
`MORA_RESTABELECIDA`). O cliente gerado tem o hook
(`lib/api-client-react/src/generated/api.ts:12230`).

Medido com `git grep`: **`PerdoarMora` aparece 0 vezes em
`artifacts/moscow-noivas/src/pages/**` e 0 vezes em `e2e/**`.** O único gesto
notável da cláusula 9ª — abrir mão da multa, que é a decisão que o contrato
manda registrar porque o padrão é cobrar — **não tem botão**. E `moraDaParcela`
devolve objeto em vez de `null` para a parcela perdoada justamente para a tela
poder dizer *"multa e juros PERDOADOS"*, o que hoje nenhuma tela da loja diz.

É a mesma forma da **S-C151** (a `iniciativa` da 13ª) e do **E222** (*o campo
existia e nenhuma tela o oferecia*), num terceiro sítio da mesma trilha — o que
já é padrão, não coincidência: **esta trilha entrega portas mais depressa do que
telas**, e o manual é quem descobre isso, porque escrever o manual obriga a
andar por onde a pessoa anda.
