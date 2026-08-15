# S-C260/S-C261/S-C271 — o julgamento das réguas vira régua

**Trilha do contrato de papel, sessão de 2026-08-15 (segunda metade)** ·
base `1f6a8e5f` (S-C250/S-C251)
Fecha: S-C260 🔵 · S-C261 🔵 · S-C271 🔵
Suíte: API 1731 → **1737** (244 → 245 arquivos) · frontend 979 · typecheck verde

## O que o enunciado errou, ANTES do código

A sobra dizia: *"as 10 varreduras da grafia `*-varredura.test.ts` nunca
passaram pelo julgamento — o glob das contagens só via `varredura-*.test.ts`
(16)"*. Medido:

|  | `varredura-*` | `*-varredura` | |
|---|---|---|---|
| `api-server` | 13 | 1 | **14** |
| `moscow-noivas` | 5 | 10 | **15** |
| | **18** | **11** | **29** |

**São 29, e o julgamento cobriu uma célula.** O buraco tem **duas dimensões, e
a sobra só via uma**: além das 11 da segunda grafia, **as 5 da PRIMEIRA grafia
que moram no frontend também nunca foram julgadas** — e sobra nenhuma falava
delas.

Enumerar por uma grafia é a S-C79 acontecendo de novo (*"onze arquivos entraram
em dois dias sob um piso verde"*). Enumerar por um pacote é o mesmo defeito com
outro eixo. **O julgamento era um gesto humano, e gesto humano não se repete
igual duas vezes** — por isso ele virou régua.

## O que a régua achou, e nenhuma sobra citava

Aplicado o critério da S-C46 às 29, **duas estavam mudas — e uma delas era a
régua mais nova do repositório:**

1. **`varredura-codegen-em-dia`** (nascida na S-C152, dois dias antes).
   Ela fotografa `git diff` + `git status` dos dois `generated/`, re-roda o
   orval, fotografa de novo e exige igualdade. **Sem piso.** Se os dois
   diretórios sumissem — pasta renomeada, `clean: true` apagando sem regravar,
   caminho mudado no config —, `antes` e `depois` seriam a **mesma string
   vazia** e ela passaria verde, atestando que o codegen está em dia sobre um
   `generated/` que não existe.

   É verde por não ter olhado **dentro da régua que existe para não deixar
   passar despercebido**.

2. **`varredura-data-de-negocio-em-fixture`** (E198). Esta tem uma régua da
   régua — confere que os dois escritores diretos EXISTEM —, e a guarda parece
   piso sem ser: ela garante o ARQUIVO, não a POPULAÇÃO. Renomeie
   `casamentoData` nos dois e a varredura examina **zero sentenças**, com
   `semAncora` vazio e verde. A regra 34 olha o arquivo sumir; aqui quem some é
   o **campo**.

Os dois pisos entraram no mesmo commit. O primeiro é por diretório e **não é um
número redondo**: os dois `generated/` têm formas muito diferentes — o
`api-zod` sai em `mode: split` com 377 arquivos e o `api-client-react` sai com
**2** —, e um piso alto no segundo seria régua reprovando por desenho do
gerador. A primeira tentativa (`> 10` nos dois) reprovou exatamente assim,
e foi corrigida antes do commit: `expected 2 to be greater than 10`.

## O critério, agora executável

Uma varredura afirma *"não existe X no repositório"*. A afirmação só vale se o
conjunto varrido for grande. A régua cobra que **cada uma diga o tamanho do que
olhou**, numa das quatro formas que a casa usa: **piso**, **retrato** (lista
travada por igualdade), **âncora** (`toContain` do arquivo que tem de estar) ou
**contagem** (população travada em `.toBe(n)`).

Ela **não julga se o número está certo** — isso segue sendo leitura humana, e a
própria `varredura-portas-sob-tranca` provou na S-C79 que piso presente pode
estar contando a coisa errada. Ela cobra que o número EXISTA, que é o que
ninguém lembra de fazer duas vezes seguidas.

### A régua quase se enganou sozinha, e isso está pregado

A primeira versão aceitava `toEqual([` como prova de retrato. **Toda varredura
da casa termina em `expect(denuncias).toEqual([])`** — a lista vazia é o que ela
afirma não existir, não o tamanho do que olhou. Aceitá-la faria esta régua
aprovar as 29 sem olhar nenhuma: verde por não ter olhado, dentro da régua
contra o verde por não ter olhado. O `RETRATO` exige lista **não vazia**, e há
autoteste com esse nome.

## S-C261 — a sobra supunha um custo que não existia

Ela dizia que o `comArquivoSintetico` *"mora só no pacote da API"* e que uma
encenação de varredura de frontend *"precisará da cópia por pacote — a
registrar quando doer"*.

**Medido: não precisa.** A utilitária recebe a **raiz como argumento** e não
importa nada do servidor; o que ela exige é `git add -N`, que é do repositório e
não do pacote. E a varredura que mais precisa dela é justamente a que nasceu
aqui — mora na API e enumera os dois pacotes.

A prova não é prosa: a encenação **planta o arquivo sintético em
`artifacts/moscow-noivas/src/lib/`**, com a grafia da segunda família, e a régua
o acusa daqui (`expect(mudas).toEqual([relativo])`). O "quando doer" era um
custo imaginado.

## S-C271 — quatro cópias de uma coisa, duas de outra

A sobra dizia *"quatro varreduras de manual, quatro extrações próprias de
chips/enumeração"*. Medido, são **duas coisas com números diferentes**:

- **o enumerador: quatro cópias**, e é a que dói — é ele que carrega a regra da
  casa (enumerar pelo versionamento, nunca por disco) e o piso de população;
- **o leitor de chips: duas**, não quatro. As outras duas varreduras leem
  `<div class="colunas" data-perfil>` e `<th>O recado</th>` — estruturas sem
  parentesco, e fundi-las seria inventar família.

E as duas cópias do leitor de chips **divergiam sem que ninguém tivesse
decidido**: uma capturava os atributos do `<span>`, a outra não. Não era
desenho; era o segundo autor não ter visto o primeiro.

Nasce `manuais-do-repositorio.ts` — que **é** o helper de população que a sobra
dizia estar esperando chegar ao frontend. O piso desceu para dentro do
enumerador, e o ganho está medido: tirar UM manual do versionamento
(`git rm --cached docs/manuais/noiva.html`) agora **reprova as quatro
varreduras de uma vez**, com a frase nomeando os cinco que deviam estar:

```
Error: os manuais sumiram do versionamento: 4 achados, 5 esperados
(vendedora, costureira, noiva, recepcao, proprietario).
Varredura sobre conjunto vazio aprova tudo — S-C46/S-C260.
```

## Verificação

- **S-C260**: vermelho ao rodar a régua nova contra a árvore antes dos pisos —
  `expected [ Array(1) ] to deeply equal []`, nomeando
  `varredura-data-de-negocio-em-fixture.test.ts`. O da
  `varredura-codegen-em-dia` foi achado na mesma passada, depois do primeiro
  conserto.
- **S-C261**: o arquivo sintético plantado no frontend e acusado da API, com
  `finally` desfazendo — árvore limpa depois (`git status --short` sem o
  sintético).
- **S-C271**: as quatro verdes (20/20) depois da fusão, e o vermelho do piso
  central medido tirando um manual do index.

E2E não re-rodado neste bloco, e a razão está dita: ele toca **apenas réguas** e
o módulo que elas leem — nenhuma tela, rota, schema ou trilha mudou.
