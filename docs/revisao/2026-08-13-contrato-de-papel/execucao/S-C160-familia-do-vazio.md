# S-C160–S-C163 — a família do `?? []`: a frase de vazio só depois de a consulta responder

**Trilha do contrato de papel, lote das azuis de 2026-08-15 (agente A, bloco 5)** · branch `agente-bloco5` (worktree) · base `7650b480` (E219 registrado)
Fecha: **S-C160** 🔵 · **S-C161** 🔵 · **S-C162** 🔵 (por medição — sem código) · **S-C163** 🔵 · **+1 sítio da mesma classe que sobra nenhuma listava**
Suíte: frontend **966 (102 arquivos)** — +10 testes e +1 arquivo desta sessão · API **1698 passed | 2 failed (1700, 237 arquivos)** no banco `moscow_wt_bloco5` — os 2 são o vermelho conhecido de worktree e um flake de corrida sob CPU disputada, remedidos na Verificação · typecheck verde em 5 projetos

**E2E obrigatório e NÃO rodado — worktree não isola porta.**

## O que a medição corrigiu no enunciado, antes do código

1. **A linha da S-C160 andou, como a própria sobra avisava.** A frase "Nenhuma
   avaria registrada — o vestido voltou como saiu." vive em
   `reservas/[bloqueioId].tsx:1288` (era :1114), gateada por
   `(avarias.data ?? []).length === 0` na :1286. O único `isError` da página
   era o de `bloqueios` (:836) — `avarias.isError` aparecia **0 vezes** no
   arquivo. Sem eixo de permissão, confirmado: a listagem vive sob o mesmo
   `vestidos` da página.

2. **A S-C162 não é o mesmo caminho — e é por isso que ela fecha sem uma linha
   de código.** As duas frases "Nenhuma parcela registrada." andaram para
   `contratos/[id].tsx:1048` e `:1126`, e a lista delas (`parcelas`, :215)
   deriva de `contrato?.parcelas ?? []` — **a mesma consulta
   `useGetContrato`, não uma segunda consulta silenciável**. A página inteira
   retorna num `if (isError)` na :381 (Alert "Não deu para carregar o
   contrato") e num `if (!contrato)` na :394 antes de qualquer frase; e o
   `GET /contratos/:id` entrega `parcelas` sempre
   (`api-server/src/routes/contratos.ts:1162` — `with: { parcelas: true }`).
   Um 500 ali produz o Alert, nunca a frase. O `?? []` é defensivo contra o
   tipo (`Contrato.parcelas?:` no contrato gerado), não um silenciador de
   erro. A medição está escrita na própria varredura, na seção "o que esta
   varredura NÃO faz".

3. **A família tinha um QUINTO sítio, e sobra nenhuma o listava:**
   `noivas/conversao.tsx:246` afirmava **"Nenhum casamento com data marcada
   nos próximos meses."** sobre `(sazonalidade.data ?? [])` — com o agravante
   de a página TER um `isError` (:149), só que da **outra** consulta (`q`),
   três cards acima. Quem lê por cima acha o arquivo coberto; é exatamente o
   caso que decidiu a forma da exigência da varredura (o estado conferido é o
   da consulta DENUNCIADA, por nome). O preço da frase: a dona lê "nenhum
   casamento nos próximos meses" numa oscilação de rede e decide arara e
   agenda sobre um mês que está cheio.

4. **A S-C163 já estava certa por construção, e agora está PREGADA.**
   `locacaoDaNoiva` devolve `null` para recorte ausente
   (`lib/locacao-da-noiva.ts:46`, testado em `locacao-da-noiva.test.ts:50`) e
   `reajustePrevisto` devolve `null` sem contrato ativo
   (`lib/reajuste-da-troca.ts:26`) — a lista silenciada da ficha
   (`contratosDaNoiva = contratos.data?.itens ?? []`,
   `noivas/[leadId]/index.tsx:239`) vira card que não desenha, não frase
   falsa. O que faltava era o silêncio ser DITO: virou o terceiro `describe`
   da varredura, com o porquê, para refactor bem-intencionado não trocar o
   silêncio por uma frase de fallback que nasceria mentindo.

## S-C160 (+ o quinto sítio) — o erro fala antes da frase

O conserto é o idioma da S-C120, nos dois sítios: `avarias.isError` /
`sazonalidade.isError` à frente do teste de vazio, desenhando o `Erro` de
`@/components/estado` (título + `mensagemApi` + "Tentar novamente" com
`refetch` da própria consulta). O `?? []` fica — ele é o fallback legítimo do
`map`; o que muda é que ele nunca mais é a ÚNICA leitura do estado.

- `reservas/[bloqueioId].tsx:1286` — "Não deu para carregar as avarias".
- `noivas/conversao.tsx:246` — "Não deu para carregar os casamentos".

## S-C161 — a varredura que impede o próximo card de nascer torto

`src/lib/vazio-silenciado-varredura.test.ts`, no molde textual da
`enums-do-contrato` (S-C130/S-C180):

- **População**: todo `.ts`/`.tsx` versionado de `src/` sem os testes, via
  `arquivosVersionados` — **196 arquivos** medidos, piso de 140.
- **Grafia da mentira**: `(consulta.data ?? []).length === 0`, com `?.campo`
  opcional — o teste de vazio montado direto sobre o fallback. É a comparação
  que transforma silêncio em afirmação.
- **Exigência**: o arquivo lê `consulta.isError`, ou passa a consulta a
  `estadoDoCard(...)`/`estadoDasConsultas(...)` — conferido pelo NOME da
  consulta denunciada, por causa do caso `conversao.tsx` (o `isError` de outra
  consulta não vale).
- **Retrato por igualdade**: 2 sítios
  (`conversao.tsx#sazonalidade`, `[bloqueioId].tsx#avarias`) — o sítio novo
  desta grafia fica vermelho mesmo nascendo com `isError` lido, e vermelho é
  onde se escreve por que ele nasceu.
- **Exceção DITA (S-C163)**: `.length > 0 &&` fica FORA da grafia — silêncio
  não é mentira (`conversao.tsx:275`, a tabela das vendedoras, cala num 500 e
  não afirma nada). E os autotestes acha-o-plantado / ignora-o-que-não-é:
  acha a grafia da S-C160 e a da S-C120 (`data?.itens`), ignora o silêncio,
  ignora a const derivada (data-flow não se finge com regex — o caso medido é
  a S-C162), e a exigência reconhece as três leituras de estado e reprova o
  `isError` da consulta errada.

## Verificação

- **Vermelho antes, literal — e é o vermelho REAL, não construído.** A
  varredura escrita sobre a base reprovou com as duas denúncias:

  ```
  FAIL src/lib/vazio-silenciado-varredura.test.ts
    AssertionError: expected [ …(2) ] to deeply equal []
    + "pages/noivas/conversao.tsx:246 testa o vazio de `(sazonalidade.data ?? [])`
       sem ler `sazonalidade.isError` — um 500 nessa consulta vira a frase categórica
       de vazio. …"
    + "pages/reservas/[bloqueioId].tsx:1286 testa o vazio de `(avarias.data ?? [])`
       sem ler `avarias.isError` — …"
  Tests  1 failed | 9 passed (10)
  ```

- **A prova de que a peneira enxerga de ponta a ponta** (molde da S-C180): um
  `pages/sintetico-plantado.tsx` com a grafia foi criado, `git add` (a
  população vem de `git ls-files`), e a varredura reprovou **pelas duas
  portas** — a denúncia (`pages/sintetico-plantado.tsx:3 testa o vazio de
  \`(pecas.data ?? [])\` sem ler \`pecas.isError\``) e o retrato
  (`+ "pages/sintetico-plantado.tsx#pecas"`), `2 failed | 8 passed`. O
  arquivo saiu do índice e do disco antes do commit.
- **Depois dos dois consertos: 10 passed (10).**
- Suíte de frontend inteira: **966 passed (966), 102 arquivos** — os 10 da
  varredura são o acréscimo desta sessão; nenhum teste existente mudou.
- Suíte de API inteira no banco próprio (`moscow_wt_bloco5`, com seed):
  **1698 passed | 2 failed (1700), 237 arquivos, zero skipped**, em 1017 s —
  rodada em PARALELO com a suíte de outro agente na mesma máquina (bancos
  distintos, como o `replit.md` autoriza; o relógio pagou a disputa de CPU).
  Os dois vermelhos, lidos e remedidos em isolamento:
  - `backup-download-api.test.ts` — `expected 200 "OK", got 410 "Gone"`
    (`BACKUP_SEM_ARQUIVO`): a assinatura CONHECIDA de todo worktree sob
    `.claude/` (`replit.md`), não é vermelho desta sessão.
  - `e94-recebimento-concorrencia-api.test.ts:119`
    (`expect(perdedor.body.detalhe).toMatch(/mudou|confira/i)`) — reprovou na
    rodada cheia e **passa isolado no mesmo banco (12 passed)**: teste de
    corrida sensível a tempo, medido sob a disputa de CPU das duas suítes. É
    a lição "escrever em paralelo, medir em série" aparecendo na rodada de um
    agente só; o integrador vê o verde na medição em série dele.
- `pnpm run typecheck`: verde nos 5 projetos.
- **E2E obrigatório e NÃO rodado** — worktree não isola porta; fica para o
  integrador. Risco baixo: nenhum formato gravado mudou, os dois consertos
  são ramos novos de erro em telas que o E2E não derruba por 500 fabricado.

## Visto de passagem (faixa S-C250–259 — propostas, tabela é do integrador)

- **S-C250** 🔵 — **a mesma classe na forma DERIVADA, dois sítios medidos.**
  A grafia da varredura não segue atribuição (decisão declarada), e a medição
  da forma `const X = …consulta.data… ?? []` + `X.length === 0` achou 10
  atribuições no repositório, **8 com o estado da consulta lido e 2 sem**:
  `ajustes/nova-confeccao.tsx:78→:169` — um 500 em `atendimentos` diz à
  costureira **"Esta noiva ainda não tem atendimento nenhum. A confecção
  nasce de um atendimento — marque um primeiro, na Agenda."** (o arquivo tem
  ZERO `isError`; `isLoading` é lido na :167) — e
  `noivas/[leadId]/lookbook.tsx:81→:231` — um 500 em `vestidos` diz "Nenhum
  vestido ativo encontrado." no seletor do lookbook (`isPending` lido,
  `isError` não). Conserto: o mesmo `isError` + `Erro` dos dois desta sessão.
- **S-C251** 🔵 — **decidir se a varredura ganha a segunda grafia** (a
  atribuição numa linha: `const X = …data… ?? []` casado com
  `X.length === 0` no mesmo arquivo). Hoje ela pegaria os dois sítios da
  S-C250 e nenhum falso positivo entre os 10 medidos — mas é meio data-flow
  fingido com regex, e a decisão de onde parar merece ser escrita, não
  embutida. Se a S-C250 fechar antes, o retrato nasce vazio e a grafia vira
  guarda pura.
- Nota, sem sobra: `dashboard.tsx:421` (`aceitosParados.length > 0 ?`) está
  na forma do SILÊNCIO — o card do aceite parado some num 500, coerente com o
  "some quando vazio" declarado no comentário. É a S-C163 aplicada; não há
  frase falsa ali.

## O que o plano errou, e o que eu errei

- O plano do bloco dizia "os sítios conhecidos como população inicial" — a
  população REAL da grafia tinha um sítio a mais (`sazonalidade`) que nenhuma
  das quatro sobras conhecia, e um a menos (S-C162 não pertence à classe:
  está guardada desde sempre). Conhecido ≠ medido, mais uma vez.
- Meu primeiro recorte da varredura era por COOCORRÊNCIA de arquivo
  (`?? []` em qualquer lugar + literal "Nenhum…" em qualquer lugar): **27
  arquivos denunciados, quase tudo falso positivo** (um select de equipe num
  formulário não afirma vazio nenhum). A grafia final — o teste de vazio
  montado SOBRE o fallback — denuncia exatamente os 2 defeitos e nada mais. O
  recorte largo está no relatório porque é o erro que o próximo autor desta
  família vai querer cometer.
- O worktree nasceu em `cbcd8b30`, **48 commits atrás da base** — o degrau da
  regra 29 pelo lado de dentro, de novo. Conferido no primeiro gesto e
  reposicionado (`git checkout -B agente-bloco5 7650b480`) antes de qualquer
  medição.
