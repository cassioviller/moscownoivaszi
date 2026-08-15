# S-C75..S-C182 — as peneiras aprendem sobre si mesmas

**Trilha do contrato de papel, lote das azuis de 2026-08-15 (agente B, bloco 6)** · branch `agent-bloco6` · base `7650b480` (E219)
Fecha: **S-C75** 🔵 · **S-C76** 🔵 · **S-C78** 🔵 · **S-C79** 🔵 · **S-C182** 🔵 · **S-C56** 🔵 · **S-C181** 🔵
Suíte: API e frontend medidas no fecho (abaixo) · typecheck verde · **E2E obrigatório e NÃO rodado — worktree não isola porta**

Banco próprio `moscow_wt_bloco6` (criado, `push` + seed, descartado no fim).
O worktree nasceu em `cbcd8b30`, **48 commits atrás** da base mandada — o mesmo
degrau do lote de 14/08 —, e foi reposicionado para `7650b480` antes de
qualquer medição (`git merge-base --is-ancestor` confirmou o fast-forward).

## O que o enunciado dizia errado, medido antes do código

1. **"O repositório tem 14 varreduras" envelheceu: são 16.**
   `git ls-files '*varredura-*.test.ts'` devolve **16 arquivos** hoje — as 12
   de `artifacts/api-server/src/__tests__/` e as 4 de
   `artifacts/moscow-noivas/src/lib/` (`varredura-links-internos`,
   `varredura-manuais`, `varredura-manuais-prazos`, `varredura-manuais-textos`).
   E o glob da sobra nunca contou a SEGUNDA grafia: há mais **10** arquivos
   `*-varredura.test.ts` (`erros-regua-varredura` na API; `alvo-de-toque`,
   `css-variavel`, `datas`, `destrutivas`, `dinheiro-miudo`, `erro-cru`,
   `gesto-da-locacao`, `telas-que-rederivam`, `vendedora-da-venda` no
   frontend) que são varreduras pelo mesmo desenho. O julgamento
   retrato×população desta sessão cobriu as 16 da primeira grafia; as 10 da
   segunda viram sobra (S-C260).
2. **"Todas vivem em `artifacts/api-server/src/__tests__/`" não vale para a
   S-C181.** A ponte da paridade de enums mora em
   `artifacts/moscow-noivas/src/lib/enums-do-contrato.test.ts` — frontend. Por
   isso o fecho dela é um segundo commit, com escopo próprio.
3. **A população da varredura de portas não era 304, era 315** — e é a S-C79
   acontecendo ao vivo: a prosa da régua media 304 em 2026-08-13, onze
   arquivos entraram em dois dias, e o piso `> 200` não sentiu nenhum.
4. **A dívida da varredura de cabines não era 8, era 9.** O piso
   `comCriacao >= 8` foi medido em 2026-08-06; hoje **9 specs criam cabine**,
   e o nono entrou sem uma linha de explicação — o formato exato que a S-C46
   descreve (*piso não cobra remedida, e a prosa envelhece calada*), numa
   varredura que a S-C75 nem citava.
5. **A recomendação da S-C56 pedia exceção de REMOÇÃO; o que coube melhor é
   recorte de GRAFIA.** Exceção nomeada sem defeito medido é a lista curada
   nascendo pela outra ponta (frase da própria tabela); o que havia era o
   CRITÉRIO aceitando uma pergunta que ele não faz — o prazo. Os sufixos
   `ExpiraEm`/`VenceEm` saem ANTES da grafia do fato, com o motivo no código, e
   valem para o próximo prazo que nascer (`carneVenceEm` já cai), o que uma
   exceção por coluna não compraria.

## S-C75 + S-C79 — o critério da S-C46 passado pelas 16, e a população vira diferença

O julgamento, varredura por varredura (número = o que o arquivo afirma hoje):

| Varredura | Números com piso/desigualdade | Julgamento | Ação |
|---|---|---|---|
| `varredura-portas-sob-tranca` | população `> 200` (315 hoje) | população, mas o piso não sente recorte novo no enumerador — e o enumerador mora NOUTRO arquivo | **trocado pela diferença nomeada** contra `git ls-files` (S-C79) + prova do arquivo sintético (S-C182) |
| `varredura-fixture-do-e2e` | specs `>= 60` (65) · `comEscrita >= 8` (10) · grafo `>= 30` | população · **DÍVIDA** · guarda de parser | dívida virou **retrato nomeado** — os 10 specs, por nome; os outros dois ficam piso |
| `varredura-cabines-do-e2e` | specs `> 50` (65) · `comCriacao >= 8` (**9**) | população · **DÍVIDA** | dívida virou **retrato nomeado** — os 9 specs, por nome |
| `varredura-reguas` | população `> 200` | população; enumerador no MESMO arquivo | fica piso — a diferença compararia a expressão com ela mesma (§ abaixo) |
| `varredura-espaco-duro-literal` | população `> 800` | população | fica piso |
| `varredura-expurgo-lgpd` | população `>= 15` | população | fica piso |
| `varredura-fronteira-loja` | recursos `> 20` + 3 âncoras `toContain` | população derivada do código, com âncoras | fica — as âncoras já cobrem a direção da sonda cega |
| `varredura-enums-do-banco-no-spec` | `doBanco > 15` · `doSpec > 30` | populações derivadas (schema/spec) | ficam piso |
| `varredura-restricoes-do-spec` | tamanho do spec/zod `> 100_000` · inteiros `>= 100` | populações | ficam piso |
| `varredura-schemas-aninhados` | idem + schemas `>= 100` · operações `>= 150` · pares `>= 150` | populações | ficam piso |
| `varredura-codegen-em-dia` | sem piso numérico solto | — | nada |
| `varredura-data-de-negocio-em-fixture` | só `toEqual([])` | — | nada |
| `varredura-links-internos` (front) | rotas `> 40` · destinos `> 70` | populações, critério S-C46 já declarado no arquivo | ficam |
| `varredura-manuais` (front) | arquivos `>= 5` · itens `>= 15` · perfis `>= 5` | populações | ficam |
| `varredura-manuais-prazos` (front) | citadas `>= 69` | população, com a nota da S-C46 já escrita | fica |
| `varredura-manuais-textos` (front) | botões `>= 140` · recados `>= 35` | populações | ficam |

**Duas dívidas estavam vestidas de piso, e as duas ganharam retrato NOMEADO** —
não a contagem, a lista: o 11º spec que inserir direto no banco (ou o 10º que
criar cabine) fica vermelho com o próprio nome, e o parágrafo do porquê se
escreve no vermelho. É mais forte que travar o número: o diff diz QUEM entrou.

**A população da varredura de portas deixou de ser número mágico** (S-C79). O
teste declara, no próprio arquivo, as quatro pastas e os três recortes que
`arquivosVarridos()` promete aplicar, recomputa a referência por `git ls-files`
e cobra `diferencaNomeada(...) == { aMaisNaPopulacao: [], aMenosNaPopulacao: [] }`
— a cópia de cá prega a de lá, que é a mesma mecânica da `CURADO_ATE_2026_08_13`
da S-C55. Recorte não-declarado no enumerador aparece com os arquivos nomeados
(ver Verificação: o 4º recorte plantado derrubou o teste nomeando os 20 de
`routes/`, **com a população em 295 — o piso antigo `> 200` teria seguido
verde**). Onde NÃO coube: `varredura-reguas` e as demais enumeram no próprio
arquivo de teste — a referência duplicaria a expressão a dez linhas dela, e
diferença de uma coisa com ela mesma não prega nada; lá o piso continua sendo o
instrumento honesto.

## S-C182 — a encenação do arquivo plantado virou função, com o degrau dito

`comArquivoSintetico(raiz, relativo, conteudo, medir)` em
`populacao-da-varredura.ts` (o mesmo arquivo da `diferencaNomeada`): recusa
sobrescrever arquivo existente, escreve, **`git add -N`** (intent-to-add — entra
no `git ls-files` sem levar conteúdo ao staging), mede, e no **`finally`** tira
do index e apaga — também quando a medição estoura, que é quando o esquecimento
acontecia. Medido antes de escrever: `git ls-files` sobre o arquivo recém-criado
devolve **nada** antes do `add -N` e o caminho depois. O teste de ponta a ponta
na varredura de portas prova as duas metades: plantado e adicionado, o arquivo
aparece em `arquivosVarridos()`; desfeito, some — e com o `git add` removido da
utilitária o teste fica vermelho (Verificação), que é exatamente o silêncio que
a sobra descrevia.

## S-C76 — a peneira das escritas dinâmicas se viu achando

`escritasComTabelaDinamica()` devolvia `[]` desde o E171 e a única régua era
`toEqual([])` — `[]` de sonda cega e `[]` de repositório limpo são o mesmo
valor. O corpo virou `escritasDinamicasNaFonte` e ganhou a versão por texto
(`escritasComTabelaDinamicaNoTexto`), no molde exato do `sqlCruNoTexto` da
S-C55, com o par acha-o-plantado / ignora-o-que-não-é:

- **acha**: `db.update(schema.contratosTable)` e `tx.insert(tabelas[i])`;
- **ignora**: o identificador simples (assunto do enumerador de portas), o
  receptor fora de `EXECUTORES` (`consulta.update(...)`) e o `.delete(chave)`
  de um `Map`, que tem o mesmo verbo e nada a ver com banco.

A prova de que o autoteste separa o que antes era indistinguível: com a sonda
cegada de propósito (`return achados;` no topo), **a régua antiga
`toEqual([])` seguiu VERDE — 45 de 46 — e só o autoteste novo acusou.**

## S-C78 — a peneira de SQL cru: um sítio por achado, e a caixa dita

Os dois comportamentos que ninguém tinha escrito, agora escritos e pregados:

1. **A leniência de caixa é deliberada e declarada**: o Postgres normaliza
   identificador sem aspas para minúsculo, então `UPDATE Contratos` É
   `contratos` — recusar a maiúscula seria buraco, não rigor. Autoteste novo
   prega que `Contratos` casa.
2. **O achado duplo morreu em vez de ser documentado**: a forma antiga
   empurrava um achado por TABELA citada — medido: o template com `contratos` e
   `parcelas` devolvia **duas linhas idênticas com o mesmo `arquivo:linha`**.
   Agora o sítio é UM, com as tabelas citadas nomeadas juntas
   (`arquivo:linha [contratos, parcelas] …`), e contar linhas da saída é contar
   sítios. O formato novo custou atualizar os três autotestes da S-C55 que
   pregavam o antigo.

## S-C56 — o prazo sai do critério do estado

`ehColunaDeEstado` recusa os sufixos `ExpiraEm`/`VenceEm` ANTES da grafia do
fato, com o critério no comentário: o prazo responde *"até quando"*, não *"já
aconteceu"* — a linha nasce com a data no futuro e a presença dela não é ato
nenhum. `orcamentos.publicoExpiraEm` sai da lista derivada (era uma das seis
que a S-C33 anunciava; a prosa da régua foi corrigida junto), e **nenhuma
contagem se moveu**: 60 portas · 36 TRANCA · 11 CAS · 13 ABERTA nas duas
pontas, porque nenhuma porta de hoje toca a coluna — o RETRATO por igualdade é
quem afirma isso, e ele ficou verde. O que fechou foi o AFROUXAMENTO armado: a
escrita sintética que repete `publicoExpiraEm` no `where` media
`CAS cas=[publicoExpiraEm]` e agora mede `ABERTA` (Verificação). Autotestes
novos nos dois lados da fronteira: `publicoExpiraEm` e `carneVenceEm` fora,
`expiradaEm` (fato passado do mesmo radical) dentro.

## S-C181 — a ponte ganha a coluna da ENTRADA (commit próprio, frontend)

A `PONTE` da paridade declarava UMA família por campo — e misturava: `origem`
conferia contra a SAÍDA (`LeadOrigem`) e `estadoCivil` contra a ENTRADA
(`LeadInputEstadoCivil`). O contrato gera as duas famílias para os cinco campos
(`LeadOrigem`/`LeadInputOrigem`, `AtributoTipo`/`AtributoInputTipo`,
`AtendimentoTipo`/`AtendimentoInputTipo`,
`OrcamentoItemTipo`/`OrcamentoItemInputTipo`,
`LeadEstadoCivil`/`LeadInputEstadoCivil`), hoje com valores idênticos — e
**`CaptacaoLeadInputOrigem` prova que a igualdade não é lei**: 3 valores, sem
`LOJA`, num input de POST. Cada linha da ponte agora declara
`nome`/`doContrato` (saída) E `nomeEntrada`/`daEntrada` (entrada), a paridade
confere o `z.enum` da tela contra AS DUAS, e a conferência de três lados da
S-C130 roda nas duas colunas — mais duas novas: `nomeEntrada !== nome` (a
saída declarada duas vezes seria a coluna morta) e `Input` no nome da entrada.
Um teste registra a prova viva: a captação não aceita a `LOJA` que a saída tem.

## Verificação — os vermelhos, literais

Cada régua nova foi vista vermelha quebrando o código de propósito (regra 34),
e restaurada em seguida:

- **S-C79** (4º recorte plantado no enumerador — `routes/` some): o teste da
  diferença reprova nomeando os 20 arquivos —
  `- "aMenosNaPopulacao": []` / `+ "aMenosNaPopulacao": [ "artifacts/api-server/src/routes/admin.ts", "artifacts/api-server/src/routes/agenda.ts", … ]`
  — **com a população em 295, onde o piso antigo `> 200` seguiria verde**. (O
  RETRATO das portas também caiu, como a S-C46 previa; a diferença é a única
  que NOMEIA o recorte, e a única que sobrevive a uma peneira sem porta.)
- **S-C182** (utilitária sem o `git add`):
  `AssertionError: plantado e adicionado ao index, ele é visto: expected [ …(315) ] to include 'artifacts/api-server/src/zz-sintetico…'`.
- **S-C76** (sonda cegada com `return achados;`):
  `AssertionError: expected [] to deeply equal [ Array(1) ]` no caso
  *"acha a tabela atrás de expressão"* — **e a régua antiga `toEqual([])`
  permaneceu verde (45 de 46)**, que é a indistinguibilidade que a sobra
  denunciava.
- **S-C78** (peneira antiga reposta): o caso das duas quentes reprova com
  `expected [ …(2) ] to deeply equal [ Array(1) ]`, e o Received mostra a
  mesma linha DUAS vezes:
  `+ "sintetico.ts:1 \`UPDATE contratos SET x = (SELECT count(*) FROM parcelas)\`"` (×2).
- **S-C56** (exclusão do prazo removida): dois vermelhos —
  `AssertionError: expected true to be false` (`publicoExpiraEm` aceito como
  estado) e `AssertionError: expected [ 'publicoExpiraEm' ] to deeply equal []`
  (a porta sintética promovida a CAS pelo prazo no `where`).
- **S-C75** (o 11º escritor encenado — um nome retirado do retrato):
  `AssertionError: specs que escrevem direto no banco — a dívida, nomeada: expected [ …(10) ] to deeply equal [ …(9) ]`,
  com `+ "e2e/62-avaria-fecha.spec.ts"` no diff — o vermelho diz QUEM.
- **S-C181** (a entrada de `origem` apontada para `CaptacaoLeadInputOrigem`, o
  estreitamento que o spec já pratica):
  `AssertionError: pages/noivas/noiva-form.tsx#origem diverge da ENTRADA (CaptacaoLeadInputOrigem): expected [ 'INSTAGRAM', 'LOJA', 'SITE', …(1) ] to deeply equal [ 'INSTAGRAM', 'SITE', 'WHATSAPP' ]`
  — a tela oferecendo a `LOJA` que o POST recusa, que é a frase da sobra em
  forma de diff. A paridade antiga (contra a saída) seguia verde.

Verdes no fecho, no banco próprio: `varredura-portas-sob-tranca` **46**,
`varredura-fixture-do-e2e` + `varredura-cabines-do-e2e` **8**,
`enums-do-contrato` **22** — e as suítes completas na contagem do fim.

## O que eu errei

Usei `git checkout --` para desfazer a encenação do 11º escritor e ele levou
junto o MEU conserto no mesmo arquivo (o retrato ainda não estava commitado) —
reapliquei do zero. É a lição do E197 (`git stash push --include-untracked` ou
edição pontual; `checkout` desfaz tudo), paga em miniatura.

## Visto de passagem — sobras novas propostas (faixa S-C260–269)

- **S-C260** 🔵 — **as varreduras têm duas grafias de nome, e toda régua "para
  as varreduras" enumera só uma.** `git ls-files '*varredura-*.test.ts'` = 16;
  `git ls-files '*-varredura.test.ts'` = **10** (1 na API, 9 no frontend). O
  julgamento retrato×população desta sessão (S-C75) cobriu as 16 da primeira
  grafia; as 10 da segunda — `erros-regua-varredura.test.ts:206,227`
  (`> 100`/`> 400`), `alvo-de-toque`, `css-variavel`, `datas`, `destrutivas`,
  `dinheiro-miudo`, `erro-cru`, `gesto-da-locacao`, `telas-que-rederivam`,
  `vendedora-da-venda` — não foram julgadas número a número. Quem fechar passa
  o mesmo critério (dívida trava nomeada, população fica piso) pelas 10.
- **S-C261** 🔵 — **a utilitária da S-C182 mora num pacote só.**
  `comArquivoSintetico`/`diferencaNomeada` estão em
  `artifacts/api-server/src/__tests__/populacao-da-varredura.ts`; o frontend
  tem a própria cópia de `arquivos-versionados.ts` (decisão da S-D30) e as
  varreduras de lá (`enums-do-contrato`, futuras encenações da S-C130) teriam
  de copiar a utilitária para usá-la. É a mesma escolha da S-D30 — cópia por
  pacote em vez de dependência cruzada de teste — e fica dita aqui para a
  primeira encenação de frontend não reinventar o ritual.
