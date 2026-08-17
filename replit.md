# Moscow Noivas

O sistema interno de um atelier de noivas: acompanha a noiva do primeiro contato
ao casamento — atendimentos, provas do vestido, ajustes, orçamento, contrato,
parcelas — e fecha o caixa, a comissão da vendedora e a folha em cima disso.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — sobe a API (porta 5000)
- `pnpm --filter @workspace/moscow-noivas run dev` — sobe o frontend (Vite)
- `pnpm run typecheck` — typecheck de todos os pacotes
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-server test` — testes da API (tocam o banco de `DATABASE_URL`)
  - **Para rodar UM arquivo, entre no pacote:** `cd artifacts/api-server && ./node_modules/.bin/vitest run lote17`
    (6 s). `pnpm --filter … test -- lote17` NÃO filtra — o `--` chega ao vitest
    como argumento posicional ignorado e a suíte inteira roda (6 min). Medido no E143.
- `pnpm --filter @workspace/moscow-noivas test` — testes da lógica pura do frontend
- `pnpm run test:e2e` — Playwright (sobe API + frontend; ver `playwright.config.ts`)
- `pnpm --filter @workspace/api-spec run codegen` — regenera cliente e Zod do OpenAPI
- `pnpm --filter @workspace/db run push` — aplica o schema no banco (dev)
- **Configurar um ateliê do zero** (E147): `cd artifacts/api-server &&
  ./node_modules/.bin/tsx src/scripts/seed.ts`. Cria só o que NÃO é trabalho da
  loja — **5 perfis** (a Costureira nasceu no E172), a dona, 3 cabines,
  horário, 9 atributos de catálogo (66
  opções, com **Tipo de peça** e **Cor** desde o E149), a escada de comissão e
  4 recorrências —, é **idempotente e nunca
  sobrescreve** (ids derivados da loja + `onConflictDoNothing`), e imprime o que
  criou e o que já existia. Depois dele, o único primeiro passo pendente é
  "cadastrar os primeiros vestidos". A mesma configuração roda sozinha na
  SUBIDA quando o banco não tem nenhum usuário (`lib/seed.ts`), então um banco
  provisionado do zero e um configurado à mão terminam idênticos.
  Parametrização por env (branco = default): `SEED_LOJA_ID|NOME|CNPJ|ENDERECO|
  TELEFONE`, `SEED_DONA_ID|NOME|EMAIL|SENHA|SUPERADMIN`,
  `SEED_EXEMPLOS_FINANCEIROS=false` (sem escada nem recorrências),
  `SEED_IPCA_EXEMPLO=true` (**E242** — os 12 meses de IPCA DE EXEMPLO da P4/E237;
  **default false**: a instalação real nasce sem índice, porque a mora trata
  qualquer linha de `indices_monetarios` como IPCA publicado e imprimia
  "Correção pelo IPCA de 04/2026 a 07/2026 (1,58%)" como fato — R$ 78,96
  numa parcela de R$ 5.000,00 vencida em 10/03/2026 com números que ninguém
  publicou. O E2E é a instalação de teste e liga a env no `playwright.config.ts`
  e no seed do `global-setup`; a demo tem os seus em `loja-de-demonstracao.ts`).
  **Ele não cadastra noiva, vestido, contrato nem parcela** — isso é trabalho da
  loja, e entra pela tela.
  **O expediente padrão é o DESTE ateliê, e não uma premissa** (S-A8): abre os
  **sete dias** e fecha às **20h**. Os dois números vieram do papel — 7
  compromissos em 5 domingos, e 6 provas às 18:30 que o fechamento anterior
  (19h, com prova de 60 min) recusava. Domingo aberto é a resposta da dona
  (*"com hora marcada"*) traduzida na única alavanca que o sistema tem: ele sabe
  abrir ou recusar o dia, não sabe dizer "só sob demanda". **O default do schema
  e o `HORARIO_PADRAO` do seed são comparados campo a campo por teste** — a
  mesma régua morava em três lugares e podia divergir em três.
  **O resumo que ele imprime sai do DADO** (S-D41): a linha do horário era a
  frase `"seg–sáb, 9h–19h"` cravada no script, e as duas metades estavam erradas
  desde a S-A8. Hoje ela é `descreverHorario` sobre a linha gravada, e as
  contagens dizem o **total e, entre parênteses, o que aquela execução criou**
  (`Cabines 122 (+3)`) — antes era um `+` na frente do total, e criar 3 numa loja
  com 122 imprimia `+ Cabines 122` (S-A12). **A linha dos PERFIS era a última
  com o total cravado** (`4`, escrito antes de a Costureira nascer): num banco
  virgem ela saía `Perfis de acesso 4 (+5)`, total menor que o que a própria
  execução criou. Hoje ela vem de `contarConfiguracao`, como as outras, e a
  régua do banco virgem a confere contra `select count(*) from perfis` (S-O71).
- **`pnpm --filter <pkg> test -- <padrão>` NÃO filtra — ele roda a suíte
  inteira** (E262, 17/08/2026). Os padrões viram argumento do *script*
  (`vitest run -- s31-… …`), não filtro do corredor, e o comando parece um
  filtro: **874,94 s onde se esperavam ~15**. A forma que filtra de verdade é
  `pnpm --filter <pkg> exec vitest run <caminho>` — medida em **7,60 s** para
  um arquivo, e em **10,3 s** para dois. Quem roda um arquivo de API para
  conferir um conserto perde uma sessão inteira com a forma errada.
- **A régua do banco VIRGEM** (S-D43): `cd artifacts/api-server &&
  ./node_modules/.bin/tsx ../../scripts/banco-virgem.ts`. Cria um banco
  descartável, aplica o schema com `push`, roda o seed, **confere que o resumo
  impresso descreve o que o banco guarda** (inclusive o total de PERFIS, S-O71),
  sobe o `global-setup` do E2E inteiro, **roda TRÊS specs de verdade contra o
  banco descartável** (S-O73/S-O90), roda o seed de novo para provar a
  idempotência, e apaga o banco — inclusive se algum passo estourar. Leva
  **1 min 1 s a 1 min 12 s** (eram ~40 s antes dos specs), e os **16 testes**
  dos três saem numa chamada só do Playwright, que paga a subida dos servidores
  uma vez. **Rode-a antes de publicar e depois de mexer no seed, no schema ou no
  `global-setup`.**
  **Os três specs são escolhidos pela ÁREA que veio de migração antiga**
  (S-O90), nunca pelo alfabeto — cada um exercita uma configuração que o seed
  cria e que no dev chegou por backfill: `04-vestidos` (catálogo de atributos,
  E149), `12-permissoes` (perfis × módulo·ação, E172 — o spec que reprovou no
  E172 justamente por o dev ter os perfis semeados antes dos módulos) e
  `52-orcamento-vira-contrato` (a jornada aceite → contrato, que **constrói** o
  próprio contrato). **A fixture de contrato fica FORA do seed por decisão**: o
  seed não cadastra contrato porque isso é trabalho da loja (E147), e a jornada
  do papel se prova criando um, não semeando um.
  **Os specs sobem servidores PRÓPRIOS, em portas próprias** (5199/5273, por
  `E2E_API_PORT`/`E2E_WEB_PORT`), e é o único jeito de a régua não medir o banco
  do vizinho: com as portas de sempre o `reuseExistingServer` do
  `playwright.config.ts` pegaria um servidor vivo apontado para outro banco.
  Eles existem porque **setup que sobe não é tela que abre**: até o E188 a régua
  parava no `global-setup` e por essa fresta o E2E inteiro reprovava em
  instalação nova enquanto ela dizia verde. As três suítes rodam contra o banco
  de `DATABASE_URL`, que existe desde antes do E147: o caminho da PRIMEIRA
  execução — o único que um ateliê novo percorre — não é exercitado por nenhuma
  delas, e foi ali que a S-D38 viveu (o setup morria com 23505
  `regra_disponibilidade_loja_id_unique` antes do primeiro spec). Ela guarda e
  devolve **os dois arquivos que o E2E deixa no disco** — `e2e/.state.json` e
  `e2e/.auth/admin.json` (S-O91) —, então pode rodar no meio de outra coisa:
  sem o segundo, o `storageState` ficava com o cookie de uma sessão do banco que
  a régua acabou de apagar. Sobrepor o nome do banco: `BANCO_VIRGEM=...`.
- **A suíte de API tem um teste que só passa no working tree PRINCIPAL**, e
  três agentes já o relataram como defeito. `backup-download-api.test.ts`
  ("baixa o dump de um backup ok") reprova em **todo worktree** — porque
  `res.download` **recusa caminho que tenha componente oculto**, e todo worktree
  de agente vive sob `.claude/worktrees/`. Medido com uma sonda de duas linhas:
  caminho limpo → **200**, o mesmo arquivo sob `.claude/` → **404
  NotFoundError**. Não é regressão e não afeta produção (o servidor não roda sob
  dotfile). **Quem trabalha em worktree confere este arquivo no `main` antes de
  chamá-lo de vermelho** — a regra 18 manda parar por vermelho de verdade, e
  este não é um.
  **O número mudou no E178 (S-O26), e quem decorou o antigo vai se assustar:**
  era `expected 200 "OK", got 500` com a stack crua do `send`; hoje é
  `expected 200 "OK", got 410` com `BACKUP_SEM_ARQUIVO`, porque a rota passou a
  tratar o erro do `download`. O sintoma de worktree é o MESMO defeito de
  ambiente de sempre — só que agora ele chega nomeado.
- **DOIS agentes PODEM medir a suíte de API ao mesmo tempo — cada um no seu
  banco** (2026-08-12). A suíte roda com `fileParallelism: false` porque *"testes
  de integração compartilham o mesmo banco"*, e foi isso que fez duas suítes
  simultâneas deadlockarem na Faixa C (13 s de CPU em 8 min de relógio). O que
  não estava medido é que a restrição é do BANCO, não da suíte: `@workspace/db`
  lê só `DATABASE_URL`, então um banco por worktree resolve. A receita, do jeito
  que o `banco-virgem.ts` já fazia — e **o seed não é opcional**:

      createdb moscow_wt_<nome>
      URL="$(node -e "const u=new URL(process.env.DATABASE_URL); u.pathname='/moscow_wt_<nome>'; console.log(u.toString())")"
      cd lib/db && DATABASE_URL="$URL" pnpm run push
      cd artifacts/api-server && DATABASE_URL="$URL" ./node_modules/.bin/tsx src/scripts/seed.ts
      DATABASE_URL="$URL" pnpm run test      # ao terminar: dropdb moscow_wt_<nome>

  **E o `$URL` mora na variável, não num arquivo do scratchpad** (E239,
  2026-08-15): dois agentes disparados na mesma sessão COMPARTILHAM o diretório
  de scratchpad. Um gravou o URL do seu banco em `scratchpad/url.txt`, o vizinho
  gravou o dele no MESMO arquivo, e quando o vizinho terminou e fez `dropdb`, a
  suíte do primeiro — que lia o arquivo — morreu no meio com `3D000 database
  "moscow_wt_loteA" does not exist`: **87 arquivos reprovados e 315 testes
  pulados** numa árvore que estava verde. Crave o nome do banco no comando (ou
  num arquivo com o nome do lote), nunca num `url.txt` genérico.

  Medido: **185 arquivos, 1299 testes, tudo verde** no banco próprio, e duas
  suítes disparadas no mesmo segundo (`Start at 13:10:52` nas duas) terminando
  em ~7 s cada. **Só com `push`, uma reprova** — a que exige os 4 perfis do
  seed, com `expect(linhas.length).toBeGreaterThanOrEqual(4)`: ela existe para
  que conjunto vazio não aprove tudo em silêncio, e num banco sem seed é
  exatamente isso que ela pega.
  **A suíte de E2E É portátil para banco virgem desde o E188** (S-O73). Ela não
  era: em banco próprio dava **166 passed · 1 failed · 4 skipped**, e a que
  falhava era `04-vestidos.spec.ts` ("a cor entre as características"), medida
  por TRÊS agentes no mesmo dia por três caminhos. A causa era **uma linha** —
  o `global-setup` gravava `cor: "Marfim"` na COLUNA legada e a ficha lê o
  **atributo de catálogo** desde o E149; no dev o vestido tem o atributo porque
  o script de migração daquele épico rodou lá, e num banco de hoje
  `vestido_atributos` nascia vazio para ele. Hoje a fixture semeia o
  **atributo** (a coluna fica, como legado lido), e o banco novo dá o mesmo que
  o dev. **O E2E completo continua sendo medido EM SÉRIE e no banco de dev** —
  não pela portabilidade, e sim pela PORTA, que worktree não isola (a entrada
  abaixo).
- **O primeiro gesto num worktree novo é `pnpm install`, e esquecê-lo falha em
  SILÊNCIO** (2026-08-12): sem ele o `drizzle-kit` não existe, e
  `pnpm --filter @workspace/db run push` **sai com código 0 sem aplicar nada**.
  Quem só olha o código de saída acredita que o schema subiu; o defeito aparece
  bem depois, no primeiro teste de API, como `relation "lojas" does not exist` —
  e a essa altura parece defeito de banco, não de instalação. Medido por um
  agente que perdeu a passada inteira nisso.
- **Worktree isola arquivo e banco, NÃO isola PORTA** (2026-08-12): o
  `playwright.config.ts` usa `5099`/`5173` com `reuseExistingServer: true`
  (as duas sobreponíveis por env desde o E188 — ver o gotcha do E179),
  então **dois E2E na mesma máquina se atropelam** mesmo em worktrees
  diferentes. Medido: uma execução deu `46 passed · 22 failed · 35 did not run`
  com o código idêntico ao de uma execução verde, e **33 artefatos de falha
  diziam `net::ERR_CONNECTION_REFUSED`** — o vizinho derrubou o servidor que
  esta reusava. A terceira execução, depois de esperar o vizinho soltar,
  repetiu a primeira na vírgula. *Escrever em paralelo, medir em série* vale
  para dois E2E na mesma máquina, não só para duas suítes de API no mesmo banco.
  **E a porta chega ao CLIENTE HTTP dos specs desde o E190** (S-O90): 51 dos 64
  arquivos chamam a API direto por `API_URL` (`e2e/helpers.ts`), que era a
  constante `http://localhost:5099` cravada — o E188 moveu os servidores por env
  e não passou por ali. Medido ao pôr `12-permissoes` na régua do banco virgem:
  `apiRequestContext.post: connect EAFNOSUPPORT ::1:5099` em três testes, com o
  navegador falando com o banco descartável na porta certa. O modo de falha
  silencioso é o pior: com um E2E de vizinho vivo na 5099, o spec logaria no
  banco DELE enquanto a tela lê o outro. Hoje `API_URL` deriva de
  `E2E_API_PORT`, com o mesmo default.
  **E o terceiro recurso, medido em 2026-08-16 (S-O93): dois E2E ao mesmo
  tempo precisam de banco próprio, portas próprias E CHECKOUT próprio.** Dois
  `playwright test` no mesmo checkout, cada um com `createdb` + `push` + seed
  e portas próprias (5199/5273 e 5299/5373): o A fez 175 verdes · 1 vermelho
  · 4 skipped em 6,0 min; o B quebrou em massa a partir do spec 03. O motivo:
  `auth.setup` grava `e2e/.auth/admin.json` DENTRO do checkout, e o cookie que
  ficou lá existia em `sessoes` do banco A (1) e não do B (0) — todo spec do B
  que herda o `storageState` chegou ao servidor B deslogado. O
  `e2e/.state.json` não colidiu porque o seed usa ids fixos e os dois eram
  idênticos. **Em worktree, cada run tem o seu `e2e/`; no mesmo checkout,
  nunca dois** — e o dev, com a suíte de sempre, continua em série.
- **A varredura das PORTAS DE ESCRITA sob tranca** (E171, ampliada no E180):
  `cd artifacts/api-server && npx vitest run src/__tests__/varredura-portas-sob-tranca.test.ts`
  (**~2 s, não toca no banco**). Ela enumera por `git ls-files` + AST **toda
  escrita** (`insert`/`update`/`delete`) nas **cinco tabelas quentes** —
  `bloqueio_vestidos`, `reservas`, `contratos`, `orcamentos` e **`parcelas`
  (S-O34, a tabela onde o dinheiro mora)** — e classifica cada porta em
  **TRANCA**, **CAS** ou **ABERTA**. Hoje, **remedido em 2026-08-13 depois do
  lote das 🟠 e 🟡 de dinheiro: 57 portas · 33 TRANCA · 11 CAS · 13 na dívida
  declarada** (6 de nascimento ou serialização implícita, 7 do gerador da loja
  de demonstração) — **a porta nova é a guarda do § único no `PATCH` (S-C90), e
  ela nasceu TRANCA**. O parágrafo dizia *56 · 32* por meio dia, medido pela
  S-C46; **e a diferença é que desta vez a régua cobrou** — o retrato trava por
  igualdade desde ela, então a porta nova reprovou a varredura e obrigou a
  recontagem no mesmo commit, que é exatamente o que a S-C46 existia para fazer —
  **desde o E191 nenhuma porta ABERTA é porta de ROTA**. Este parágrafo dizia
  *48 · 31 · 8 · 9* e envelheceu em silêncio porque os pisos do teste eram `>=`:
  as portas que E212, E213, E216 e E221 acrescentaram nunca cobraram a
  recontagem. **A S-C46 fechou isso, e o critério é o que passou a valer: o que
  é RETRATO trava por igualdade — as três disciplinas, o total, as 29 transações
  e as 40 trancas —, e piso `>=` só onde o número é genuinamente um mínimo,
  que neste arquivo é UM caso, a população de arquivos-fonte.** Porta nova passa
  a custar um número remedido e o parágrafo que o explica; o vermelho compara os
  objetos inteiros, então ele diz QUAL conta se mexeu. Desde o
  E180 ela também confere a **ORDEM**
  das trancas (S-O33): a sequência de `FOR UPDATE` de cada transação sobe os
  degraus de `DEGRAUS_DA_ORDEM` sem descer nenhum, e toda tranca dentro de laço
  percorre coleção `.sort()`ada — deadlock é o modo de falha que a ordem existe
  para evitar.
  **Desde o E186 (S-O59) ela SEGUE O EXECUTOR para dentro dos helpers do
  módulo** — a função que recebe o `tx` e toma `FOR UPDATE` lá dentro conta na
  posição da CHAMADA, não na linha em que foi escrita. Os números subiram: **28
  transações e 38 trancas** (eram 25 e 31), sendo **7 alcançadas por helper**
  (`trancarContratos` ×3, `trancarEixos` ×4), e os **laços contados foram de 3
  para 6**. A cadeia ganhou três degraus, os três achados por esse gesto:
  `cabines → usuarios → lead · reserva · avaria · contas_pagar → orçamento →
  contrato → parcelas → bloqueios → vestidos`, e as trancas sobre tabela sem
  degrau caíram de **5 para 2** (loja em `admin.ts:177`, ajuste em
  `agenda.ts:1156`). **A dívida de `comissao.ts` era 3 e virou ZERO no E191**
  (S-O79): as três trancavam o contrato desde o E176 e não reliam a guarda
  depois da tranca — hoje as três chamam `relerEstornosSobATranca` logo depois
  de `trancarContratos`, e o reabrir troca a lista lida no pool pelo
  `returning()` do próprio DELETE. **O E191 não criou tranca nenhuma**: as 28
  transações, as 38 trancas, as 7 via helper e os 6 laços não se mexeram; o que
  mudou é que as trancas passaram a decidir alguma coisa. **Os dois números
  acima são história: hoje são 30 transações e 42 trancas** — a S-C11
  (`9fa70a5`) abriu a transação do `PATCH /avarias/:id` (29/40), e o **E223**
  abriu a da troca de peça do contrato, que tranca o contrato (degrau 5) e o
  bloqueio antigo (degrau 7) e delega o vestido novo à transação ANINHADA de
  `criarReservaDeVestido` — que agora aceita `executor` e roda como savepoint,
  a régua única das TRÊS portas que criam reserva. O retrato corrente
  (2026-08-14, E223): **60 portas · 36 TRANCA · 11 CAS · 13 ABERTA**. E uma
  lição de FORMA que o E223 pagou: extrair o corpo de `db.transaction` para
  uma variável (`db.transaction(corpo)`) cega o motor, que lê o callback
  LITERAL — a porta da lib caiu para ABERTA até a forma voltar. As 7 via
  helper e os 6 laços continuam onde estavam.
  **Quando ela fica
  vermelha**, ou nasceu porta sem
  disciplina, ou uma porta fechada reabriu, ou uma porta da dívida foi FECHADA —
  e neste caso o conserto é baixar o número na tabela `SEM_DISCIPLINA` do teste.
  A dívida trava a CONTAGEM por arquivo, não a lista de nomes. Os pontos cegos
  conhecidos estão listados no topo do arquivo e em `portas-de-escrita.ts`.
  **Nada dentro dela é mais lista curada** (S-C55): as colunas de estado saem de
  `getTableColumns` (S-C33) e os nomes de tabela no Postgres, de
  `getTableConfig` — o mapa à mão que a peneira de SQL cru usava podia estar
  errado e a peneira devolveria `[]` sem uma linha vermelha, que é o mesmo `[]`
  que ela devolve por não haver o que achar. **A peneira agora PROVA que
  enxerga**: um `sql\`UPDATE contratos …\`` sintético tem de ser achado, e a
  ponte `nome quente ↔ tabela do drizzle` é conferida contra a chave do mapa.
- **O relógio das portas que decidem por DATA** (E219): `lib/relogio.ts` —
  `relogio.agora()` no lugar de `new Date()` em toda rota cuja regra depende do
  calendário (a primeira é a troca de peça, 17ª: 7 dias do fecho, sextas e
  sábados vedados). É objeto de propósito: o teste de API o fixa com
  `vi.spyOn(relogio, "agora")`, e sem isso a suíte da 17ª ficaria verde cinco
  dias por semana e vermelha dois (S-O119 do lado do calendário — medido numa
  sexta real). A régua pura (`financeiro-core/src/troca.ts`) recebe `hoje` por
  parâmetro, como toda conta da trilha desde o E211.
- **A fila de atrasos responde do CACHE por 5 min, por loja** (S-C89):
  `lib/fila-de-atrasos-cache.ts` — o sino refazia a conta inteira (2 consultas
  fixas + 3 por contrato atrasado, +1 se cobrado, +1 pelas órfãs) a cada 5 min
  em TODA tela aberta. As **10 portas que mudam a fila** derrubam o cache da
  loja e estão enumeradas no próprio arquivo; a conta de consultas tem régua de
  IGUALDADE (cache desligado de propósito: `expected 7 to be +0`). O cache é
  por PROCESSO, e isso é **decisão escrita no módulo** (S-C282): o teto de dano
  é o TTL, que é o mesmo ciclo do poll do sino, e a fila é aviso e não decisão —
  quem cobra passa pela porta que lê o banco. A conta caiu de 9 para 7 na
  S-C280: `pecasAtrasadasDoContrato` rebuscava a regra da loja POR CONTRATO.
- **Os manuais moram DENTRO do sistema, e os cinco têm prints** (E236, 15/08):
  `Manuais`, no rodapé do menu, lista os cinco com o PDF para baixar
  (`GET /manuais` · `GET /manuais/:qual.pdf`, só sessão; catálogo em
  `api-server/src/lib/manuais.ts`). Os PDFs são **versionados** em
  `docs/manuais/pdf/*.pdf` — o servidor serve o que está no git e não fabrica
  nada; instalação sem o PDF responde 410 `MANUAL_SEM_ARQUIVO`, e a página diz
  isso. Para republicar:
  1. `pnpm --filter @workspace/api-server exec tsx ../../scripts/loja-de-demonstracao.ts`
     — a loja de demonstração **renasce** (datas relativas a hoje), com a dona,
     a vendedora, a recepção e a costureira (senha `demo-dos-manuais`);
  2. com o app de pé: `BASE_URL=http://localhost:5173 pnpm --filter @workspace/api-server exec tsx ../../scripts/prints-dos-manuais.ts todos`
     (ou um só: `vendedora`) — 75 capturas em ~5 min, uma página do navegador
     por captura, realces desenhados DEPOIS da rolagem final (o `main` rola
     por dentro; `window.scrollY` é sempre 0), `altura` por captura para
     formulário alto;
  3. só reescreveu texto? `… prints-dos-manuais.ts todos --so-injetar`
     reconstrói `docs/manuais/pdf/<qual>.{html,pdf}` sobre as capturas
     versionadas, **sem app**, em ~10 s — o `.html` é derivado e ignorado no
     git; o `.pdf` é o que se commita.
  A `varredura-manuais-prints` (frontend) cobra: toda âncora `data-print` tem
  captura versionada, nenhuma captura é órfã, o manifesto `<qual>.json` bate
  com as âncoras (rodou depois da última âncora) e todo manual tem PDF no git.
- **Três varreduras novas de 15/08**, todas com o par acha-o-plantado /
  ignora-o-que-não-é (molde S-C180): a do **vazio silenciado**
  (`moscow-noivas/src/lib/vazio-silenciado-varredura.test.ts` — frase de vazio
  sobre `?? []` sem `isError` do MESMO recurso; achou um quinto sítio fora de
  sobra ao nascer), a da **contradição interna dos manuais**
  (`varredura-manuais-contradicao.test.ts` — célula pregada não pode negar
  prosa do mesmo documento, e toda negação de UI é dívida declarada com ID; é
  ela que segura a S-C270), e o helper de **população por diferença**
  (`api-server/src/__tests__/populacao-da-varredura.ts` — a saída não é "o
  piso caiu", é a lista NOMEADA do que entrou/saiu contra `git ls-files`; o
  piso `> 200` seguia verde sobre 295 com um recorte inteiro faltando).
- **A varredura de QUEM SERIALIZA o schema aninhado** (E192, S-O76):
  `cd artifacts/api-server && npx vitest run src/__tests__/varredura-schemas-aninhados.test.ts`
  (**~1,5 s a parte de papel; o último caso toca o banco**). Ela é a **primeira
  do repositório que resolve `$ref`** — a `varredura-restricoes-do-spec` (E177)
  lê o `openapi.yaml` como TEXTO, e por isso *"quem preenche este objeto três
  níveis abaixo?"* nunca teve resposta de máquina: a conta foi feita à mão três
  vezes (E167, E179, E185) e **saiu errada as três**. O motor
  (`__tests__/schemas-aninhados.ts`) cruza as **operações do spec**, com `$ref`
  transitivo, contra o **`with` da consulta relacional** que monta a resposta,
  e só pergunta pela FRONTEIRA — o filho de um pai que chegou. Hoje, **medido em
  2026-08-14 (E223): 211 operações · 152 com schema de resposta · 75 com
  relação** (o resto das contas não se mexeu com o E223 — `TrocarPecaResponse`
  é raso de propósito e não põe par na fronteira). (Este parágrafo dizia *200 · 143 · 70 ·
  250 · 144 · 106 · 31*, de antes do E199 — as contas do TESTE estão travadas em
  igualdade e cobraram a cada épico; a prosa daqui não tem quem a cobre.) Os 99
  não são 99 defeitos, e as duas tabelas separam o que é o
  quê: **7 arestas que porta nenhuma entrega** (cada uma com o endereço do
  serializador escrito à mão, em `MONTADO_FORA_DO_HANDLER`) e **16 entregues
  por umas portas e não por outras** (schema compartilhado — `Lead.interesse`
  viaja em 27 respostas e 4 a carregam). **Quando ela fica vermelha**, ou
  nasceu objeto aninhado sem quem o preencha, ou uma porta passou a entregar o
  que não entregava — e nos dois casos a decisão é escrita numa das tabelas.
  Ela também cobra que **toda operação do spec tenha porta no roteador**.
- **A varredura dos ÍNDICES ALCANÇÁVEIS por HTTP** (E186, S-O61):
  `cd artifacts/api-server && npx vitest run src/__tests__/e186-indices-alcancaveis-api.test.ts`
  (toca o banco — lê `pg_indexes`). Ela cruza as **restrições únicas que não são
  PK** com as tabelas em que alguma ROTA escreve **sem `onConflict`**, e cobra
  que cada índice alcançável tenha frase em `DUPLICADO_POR_INDICE` **ou** o
  motivo do silêncio em `SEM_FRASE_POR_DECISAO` (`lib/erros.ts`). Hoje: **27
  restrições · 23 alcançáveis · 15 com frase · 8 com julgamento escrito**. As 4
  que ficam de fora são as de tabela cuja única escrita de rota é `upsert` — o
  23505 nunca chega ao `classificarErro`. A régua irmã (`e180-indice-por-indice`)
  confere que toda chave do mapa EXISTE no banco; as duas juntas impedem o mapa
  de apontar para índice morto e a lista de índices mudos de crescer calada.
- **Capturar as telas para revisão visual** (S-D1/S-D2): com o app de pé,
  `BASE_URL=http://localhost:5173 CAPTURAS_DIR=<destino absoluto>
  ./artifacts/api-server/node_modules/.bin/tsx scripts/capturar-telas.ts` —
  27 rotas × claro/escuro/390px, locale **pt-BR fixada**, e o manifest de saída
  declara o ambiente inteiro (navegador, timezone, viewport, tema, data). As
  env obrigatórias falham alto: o destino das 81 capturas da rodada 7 nasceu
  `undefined/` por env ausente, e o script se perdeu com o scratchpad — este é
  versionado. **A locale do manifest é MEDIDA antes da primeira captura** (E182):
  o script abre o formulário de noiva nova, lê o placeholder do
  `<input type=date>` e **para** se não for `dd/mm/aaaa`. Medido em 2026-08-12:
  78 capturas em 2 min 1 s. Detalhes: `scripts/README.md`.
- `pnpm --filter @workspace/api-server run backup` — dump do banco inteiro (E30); é o
  comando que o Scheduled Deployment do Replit chama para a rotina agendada. O status
  aparece em Configurações → Administração; dumps caem em `artifacts/api-server/backups/`.
  A tela baixa o dump (E59) e cada backup bom poda os dumps além dos 10 mais
  recentes e as sessões expiradas — o registro fica, o arquivo sai do disco.
- Env obrigatória: `DATABASE_URL` (Postgres)
- **O preview roda no banco da LOJA por `APP_DATABASE_NAME`** (2026-08-10): o
  workspace tem DOIS bancos na mesma instância — `heliumdb` (dev, fixtures das
  suítes) e `moscow_base` (o ateliê de verdade, legado do papel carregado). O
  `run dev` do api-server deriva `DATABASE_URL` trocando só o nome quando
  `APP_DATABASE_NAME` está no ambiente (o `[userenv.shared]` do `.replit` o
  define), então o preview abre a loja sem tocar na env global. **A biblioteca
  `@workspace/db` lê SÓ `DATABASE_URL`** — um segundo nome com precedência
  (f0a17d0) capturava banco-virgem, seed e suítes, que redirecionam filhos
  trocando `DATABASE_URL`; medido: o filho pedia `/heliumdb` e o pool conectava
  em `/moscow_base`. O E2E fixa `APP_DATABASE_NAME=` vazio no
  `playwright.config.ts` e segue no banco de `DATABASE_URL`. Login da loja:
  `dona@moscownoivas.com.br` (banco `moscow_base`); o de dev continua
  `admin@moscownoivas.com` (banco `heliumdb`).
- **Para MEDIR o bundle do frontend**, o build do Vite exige duas variáveis e
  falha antes de compilar sem elas (o `vite.config.ts` lança de propósito):
  `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/moscow-noivas run build`.
  O tamanho de cada chunk sai no relatório; **o que importa para o primeiro
  desenho não é a soma deles**, e sim a entrada mais os `modulepreload` do
  `dist/public/index.html` — o resto só desce quando alguém abre a rota.

- **A instalação de PRODUÇÃO é uma imagem Docker, e ela existe desde 17/08/2026**
  (E270): `docker build -t moscow-app .` na raiz produz **369 MB** com UM
  processo servindo a tela e a API na porta **5002**. O guia inteiro — variáveis
  do EasyPanel, volume, health check, o que conferir antes de implantar — está
  em [`docs/deploy/easypanel.md`](docs/deploy/easypanel.md). O que se precisa
  saber para operar:
  - **o contêiner aplica as migrações antes de abrir a porta** (`dist/migrar.mjs`,
    o migrador do drizzle sobre `lib/db/migrations` + os extras de SQL). É
    idempotente e não destrói nada; `MIGRAR_NA_SUBIDA=false` desliga. **O
    schema que ele produz é IDÊNTICO ao do `push`** — medido nos dois caminhos
    em bancos virgens: 506 colunas, 120 índices, 174 constraints, 22 enums;
  - **a tela sai do Express quando `FRONTEND_DIR` aponta para o `dist` do
    Vite**, e o servidor RECUSA subir se não houver `index.html` ali. Sem a
    variável (dev, E2E) nada muda: quem serve a tela é o Vite;
  - **`/app/backups` é o único volume**, porque é o único lugar em que o
    sistema escreve (o `pg_dump` do botão de administração, que roda dentro do
    contêiner — daí o `postgresql-client-17` na imagem);
  - **o adeus é tratado**: `SIGTERM` fecha a porta, espera o que está em voo e
    devolve o pool — `docker stop` em **316 ms**, contra os 10 s de prazo que um
    Node sem tratador leva até o `SIGKILL`;
  - a base é **Debian**, e não Alpine, porque o `pnpm-workspace.yaml` remove dos
    overrides os binários musl do rollup, do lightningcss e do oxide — em Alpine
    o `vite build` não teria o que carregar.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Frontend: Vite + React 19 + react-router + TanStack Query + shadcn/ui
- DB: PostgreSQL + Drizzle ORM
- Validação: Zod (`zod/v4`), `drizzle-zod`
- Codegen: Orval (a partir do OpenAPI)
- Build: esbuild (bundle CJS)

## Where things live

O contrato é o centro: **o OpenAPI é a fonte da verdade da API**, e cliente e
schemas Zod são GERADOS dele. Não edite nada em `generated/` — edite o spec e
rode o codegen.

| O quê | Onde |
|---|---|
| Contrato da API (fonte da verdade) | `lib/api-spec/openapi.yaml` |
| Schema do banco (fonte da verdade) | `lib/db/src/schema/*.ts` |
| Cliente + hooks React (gerado) | `lib/api-client-react/src/generated/` |
| Schemas Zod de request/response (gerado) | `lib/api-zod/src/generated/` |
| Rotas da API | `artifacts/api-server/src/routes/` |
| Regra de negócio pura (API) | `artifacts/api-server/src/lib/` |
| Guard de permissão | `artifacts/api-server/src/middlewares/auth.ts` |
| Telas | `artifacts/moscow-noivas/src/pages/` |
| Regra de negócio pura (frontend) | `artifacts/moscow-noivas/src/lib/` |
| E2E | `e2e/` + `e2e/global-setup.ts` (seed) |
| Histórico das decisões de unificação | `docs/auditoria/` |

## Architecture decisions

- **O contrato gera o cliente.** Mudou a API? Edite `openapi.yaml`, rode o
  codegen, e o typecheck aponta cada tela que quebrou. É de propósito: o
  compilador é quem encontra os call-sites, não a memória de quem mexeu.
- **A regra de negócio mora em função pura, longe do banco e da tela.** Cálculo
  de comissão, agregação do caixa, projeção, folha e o gerador de PDF são
  módulos sem I/O, com teste unitário. As rotas e as telas só buscam, chamam e
  desenham. É o que permite testar "estorno maior que o mês" sem subir Postgres.
- **Dinheiro soma em CENTAVOS INTEIROS.** A API fala reais (`decimal` com
  `mode: "number"`); converta na borda, some inteiro, volte para reais só ao
  exibir. Um DRE que fecha com um centavo de diferença do fluxo não tem conserto
  depois: a divergência vira desconfiança no número. **E o dinheiro tem piso na
  borda** (E115): `valorRecebido`/`valorPago` têm `minimum: 0.01` no spec — um
  `-700` passava pelo único guard do servidor (o teto) e gravava −R$ 700,00 no
  caixa realizado, com o saldo aberto da parcela subindo para MAIS que o
  previsto.
- **O recebimento é `recebidoEm + valorRecebido`, não uma lista de status**
  (E115/S5). `teveRecebimento` no `financeiro-core` é a régua única: cancelar
  um contrato com `destinoPago: "manter"` vira a PARCIAL em CANCELADA
  preservando o que entrou — "o valor fica no caixa" é o contrato documentado
  do `manter` —, e a lista `["PAGA","PARCIAL"]` tirava esses reais do fluxo,
  do DRE e da tendência retroativamente. Quem filtra recebimento no SQL usa
  `recebido_em IS NOT NULL` (superconjunto; o motor recorta). O estorno —
  avulso E em massa — zera `valorRecebido`/`recebidoEm` e limpa os DOIS
  carimbos (`conciliadoEm`, `enviadoContabilidadeEm`): o carimbo da contadora é
  operacional (alimenta o `isNull` do próximo envio), não histórico — a
  história mora na trilha.
- **Data de negócio ≠ instante.** `vencimento`/`dataReferencia` são dias
  (ancorados ao meio-dia de São Paulo — o dia UTC já é o dia certo).
  `recebidoEm`/`pagamento.data` são INSTANTES, e o dia deles só existe num fuso:
  lidos em UTC, todo movimento das 21h à meia-noite cai no dia seguinte e o
  caixa do dia fecha errado. Ver `artifacts/moscow-noivas/src/lib/financeiro/datas.ts`.
  **"Hoje" nunca sai de `new Date()` + `setHours(0,0,0,0)`**: isso é a meia-noite
  do relógio do PROCESSO, que no container é UTC — o E111 achou quatro desses
  (dashboard, consolidado da rede, relatório de acervo, expurgo LGPD), um deles
  no MESMO handler em que o número ao lado já usava `hojeLocal()`. A régua é
  `hojeLocal()`/`inicioDoDia()`/`addDias()`/`addMeses()` do `financeiro-core`, e
  `addMeses` existe porque `setMonth` **transborda para o futuro** quando o dia
  de hoje não existe no mês alvo (31/03 −1 mês = 03/03).
- **Autoria vem da SESSÃO, não do corpo da request.** Quem registrou um contato
  de cobrança sai de `req.usuario`, e `RegistroCobrancaInput` não aceita
  `vendedorId` de propósito — um cliente que declara o próprio autor pode
  atribuir a ação a outra pessoa. Mesma lógica de sempre: a autoridade é o
  servidor. **A vendedora da VENDA não é autoria** (E120, decisão P1 do dono):
  `ContratoInput.vendedoraId` vem do corpo de propósito — a dona fecha de manhã
  a venda que a Ana montou ontem, e é esse campo que decide a comissão. O que
  protege é o rastro, não a trava: quando o contrato nasce de um orçamento e a
  vendedora diverge de `orcamento.vendedoraId`, a transação grava
  `CONTRATO_VENDEDORA_DIVERGENTE` na trilha com os dois lados nomeados; quem
  clicou continua saindo da sessão. Corolário: campos de autoria são ON DELETE SET NULL, porque perder
  quem fez é recuperável e perder o registro do que aconteceu não é. Onde a
  coluna é `notNull` e `set null` não existe — `contratos`, `orcamentos`,
  `atendimentos`, `comissao_regras` e `comissao_fechamentos`, todas por
  `vendedora_id` — a regra vira ON DELETE **RESTRICT** (E91): o banco RECUSA a
  exclusão em vez de apagar o histórico junto com a pessoa. Quem sai do ateliê é
  INATIVADO (`usuarios.ativo`), e `DELETE /admin/usuarios/:id` responde 409
  `USUARIO_COM_HISTORICO` dizendo isso.
- **Apagar uma LOJA segue a mesma régua, um andar acima** (E106/S1). `lojas` é
  referenciada por **31 FKs em CASCADE** — entre elas `parcelas` (com
  `recebido_em`), `pagamentos`, `vestidos`, `usuarios_lojas` e a própria
  `audit_log` —, então um `DELETE` numa linha levava 31 tabelas junto.
  `DELETE /admin/lojas/:id` responde 409 `LOJA_COM_HISTORICO` sempre que houver
  parcela, pagamento, contrato, noiva, **vestido no acervo ou pessoa na equipe**
  — a régua não é só de dinheiro, porque acervo e equipe também são trabalho que
  some. Loja que sai de operação é DESATIVADA (`lojas.ativo`): ela some dos
  seletores (`buscarLojasUsuario` filtra `ativo = true`) e nenhuma sessão entra
  nela (`buscarSessao` recusa), sem perder nada. **O cascade continua de
  propósito** — é o que faz o expurgo de LGPD e a limpeza de fixture caberem num
  comando; a guarda é de aplicação, e recusa só o caso perigoso. E a exclusão de
  uma loja NÃO deixa trilha, porque não há onde: `audit_log.loja_id` é `notNull`
  + CASCADE, e o registro morreria com a loja (sobra S3). Fica o `req.log.warn`
  `loja_excluida`.
- **Nenhum id entra sem prova de loja** (E91). `usuarios` é tabela GLOBAL e a FK
  do banco só garante que um id EXISTE, não a que loja pertence. Toda escrita
  que recebe id de outra entidade — do CORPO ou do PATH — passa por
  `api-server/src/lib/escopo-loja.ts` (`leadNaLoja`, `cabineNaLoja`,
  `usuarioNaLoja`/`vendedoraNaLoja`, `reservaNaLoja`, `vestidoNaLoja`,
  `atributosDaLoja`) ANTES de escrever: id do corpo que não é da loja vira 422
  `REFERENCIA_INVALIDA`, id do path vira 404. Régua única — quem precisar de uma
  pergunta nova a acrescenta lá, não escreve a checagem à mão na rota.
- **A loja da URL é conferida contra a da sessão em TODA rota de loja** (E111),
  e a conferência lê o CAMINHO CRU (`lojaIdDaUrl`, em `middlewares/auth.ts`), não
  `req.params`. O motivo é uma pegadinha do Express que custou caro: `router.use(fn)`
  **sem path** roda com `req.params` vazio, e os dez routers de domínio montam
  assim — a comparação nunca falhava porque nunca rodava, e uma vendedora da loja
  A lia, editava e apagava noiva da loja B com 200/200/204. `requireModulo` não
  protege disso: ele consulta as permissões de `lojaAtivaId` e aprova. Middleware
  que precisa de um param **tem** de ser montado com o path, ou ler a URL.
- **Ação destrutiva responde 404, conta o que vai junto e deixa rastro** — a
  régua que o E91 (usuário), o E106 (loja), o E111 (noiva, parcela, perfil) e o
  E115 (reserva, bloqueio, atendimento, orçamento, avaria) aplicam igual: 404
  antes de qualquer escrita, 409 LEGÍVEL dizendo o que segura o registro
  (`LEAD_COM_CONTRATO`, `PERFIL_EM_USO`, `USUARIO_COM_HISTORICO`,
  `LOJA_COM_HISTORICO`, `RESERVA_COM_HISTORICO`, `ATENDIMENTO_CONCLUIDO`,
  `ORCAMENTO_APROVADO`) em vez do 23503 genérico do banco, e
  `registrarAuditoria` DENTRO da transação e ANTES do delete — depois dele não
  há linha de onde reconstituir. A guarda de `DELETE /admin/usuarios/:id` conta
  as **seis** FKs que apontam para `usuarios`, contando `recorrencias`
  (CASCADE: apagava o salário em silêncio) e `comissao_regras` (restrict).
  A cascata mais funda é a da RESERVA (E115): `bloqueio_vestidos.reserva_id` é
  CASCADE e de cada bloqueio caem avarias (foto-prova de parcela já cobrada),
  provas e vínculos de contratos ATIVOS — por isso reserva e bloqueio com
  história recusam o DELETE e ensinam o soft-cancel.
- **Todo dinheiro na tela sai de `brl()`, e ele já traz o `R$`** (E92).
  `moscow-noivas/src/lib/formatos.ts` é a régua única: `Intl.NumberFormat` com
  `style: "currency"`, o que põe um espaço RÍGIDO (U+00A0) entre o símbolo e o
  número — sem ele o navegador quebra a linha ali e o card de dinheiro dobra de
  altura em 390px. Nenhuma tela escreve `R$` à mão (eram 98 cópias, e a única
  que esquecia era o dashboard). Negativo sai `-R$ 500,00`, não `R$ -500,00`.
- **O erro da API vira frase de gente em `lib/erro-api.ts`** (E92), nunca
  `err.message` — a mensagem que o cliente gerado monta é `HTTP 404 Not Found`,
  e era isso que a vendedora lia no toast. A ordem é: código que a tela conhece
  → `detalhe` do servidor → régua por faixa (401 sessão, 403 permissão, 5xx e
  rede "não consegui falar com o sistema") → o `fallback` da TELA. Desde o
  E122: o builder (`lib/api-client-react/src/custom-fetch.ts`) também lê
  `detalhe` (a grafia da casa) ao montar `err.message`; **o título da falha é
  UM — "Não deu para <verbo>"** (exceções: "Não consegui entrar" no login e
  "Essa mudança não é possível agora" nas recusas de transição); e
  `lib/erro-cru-varredura.test.ts` reprova `err.message` em tela e título
  começando em "Erro", varrendo o arquivo inteiro.
  **E o 23505 do banco é traduzido ÍNDICE POR ÍNDICE** (S-O2/E180):
  `classificarErro` lê o `constraint` do erro do `pg` — que chegava ao handler e
  era jogado fora — e `DUPLICADO_POR_INDICE` (`api-server/src/lib/erros.ts`)
  traduz **11 dos 27 índices únicos que não são PK**. Sete devolvem o código que
  a guarda da porta da frente já devolve (`CONTRATO_ATIVO_DUPLICADO`,
  `CABINE_OCUPADA`, `VENDEDORA_OCUPADA`, …), pela régua do K3: *para a vendedora
  não existe diferença entre perder por um segundo e por um dia*. Índice que o
  mapa não conhece **continua saindo `REGISTRO_DUPLICADO`**, e o LOG passa a
  dizer o nome dele — é por onde a próxima tradução entra. Nenhuma tela precisou
  mudar: a segunda perna de `erro-api.ts` já é o `detalhe` do servidor.
  `e180-indice-por-indice-api.test.ts` confere cada chave do mapa contra
  `pg_indexes` — o nome do índice mora no BANCO, e nada no compilador liga os
  dois.
- **A cor da marca é `--primary: 350 25% 65%` e não muda para consertar
  contraste** (E92) — quem muda é o que vai EM CIMA dela. `index.css` traz a
  razão WCAG ao lado de cada token, e `lib/aparencia.test.ts` lê o arquivo de
  verdade e reprova qualquer par de texto abaixo de 4,5:1, nos dois modos. No
  ESCURO os preenchimentos (`--primary`, `--destructive`) são mais CLAROS com
  texto escuro em cima, pelo mesmo motivo que `--positivo` já era.
- **Competência vira frase por `rotuloCompetencia()`** (`lib/financeiro/datas.ts`,
  E92), em minúscula ("julho de 2026"); quem abre frase com ela usa
  `capitalizar()` de `lib/formatos.ts`. **Nunca `className="capitalize"` sobre
  uma frase**: o CSS sobe a inicial de toda palavra e produz "Julho De 2026 — O
  Que Seria Pago Se Fechasse Agora."
- **Permissão é MÓDULO × AÇÃO** (`{leads: {ver, criar, editar}}`), com o shape
  vindo do CÓDIGO e nunca do banco (`api-server/src/lib/permissoes.ts`): chave
  desconhecida é descartada, ausente é `false`. O guard deriva a ação do método
  HTTP. O cliente espelha o gate (`moscow-noivas/src/lib/permissoes.ts`) só para
  não OFERECER o que o servidor vai negar — a autoridade é sempre o servidor.
  **A ação vem do método E do caminho** (`acaoDoRequest`): POST que termina em
  verbo de mutação (`receber`, `pagar`, `cobrar`, `aprovar`, `cancelar`,
  `estornar`, `marcar`, `enviar`, …) é `editar`, não `criar`. A lista é uma só,
  e a varredura de `e101-acao-da-rota-api.test.ts` a IMPORTA — verbo novo sem
  classificação reprova o teste (e desde o E115 ela também vê POSTs
  `<literal>/<verbo>`, a forma por onde `conciliacao/marcar` e
  `contabilidade/enviar` escaparam). POST que muta com caminho de SUBSTANTIVO
  entra em `POST_QUE_MUTA_POR_CAMINHO` (hoje só `/financeiro/pagamentos`, a
  mesma operação da porta irmã que declara `editar`). E o guard deriva a ação
  de `req.baseUrl + req.path`, nunca de `req.path` sozinho: dentro de um
  `router.use(prefixo, fn)` o Express DESMONTA o prefixo casado — a mesma
  pegadinha do `req.params` vazio do E111, na dimensão do caminho. Sem isso, o
  guard de prefixo do router e o guard da rota exigem ações DIFERENTES e a
  pessoa leva 403 numa ação que ela pode fazer.
- **Uma reserva de vestido é de um contrato ATIVO só** (E111). `POST /contratos`
  recusa com 409 `RESERVA_JA_CONTRATADA` o bloqueio já preso por outro contrato
  ativo, **e grava `bloqueio_vestidos.lead_id`** — o contrato é quem dá dona à
  reserva que nasceu sem. Cancelar o contrato solta a peça (soft-cancel), e ela
  volta ao mercado. A seção "O seu vestido" do portal resolve pelo vínculo VIVO
  `contrato_bloqueios`; `contratos.bloqueio_vestido_id` é legado lido, nunca
  escrito — decidir por ele deixava a seção morta em produção.

- **As réguas de UI da rodada 7 (E120–E142) valem e têm varredura.** O rosa da
  marca nunca é TEXTO pequeno (`--primary-texto`, 6,24:1+) nem cor de dinheiro
  (`escala-dinheiro.test.ts` varre por VIZINHANÇA de 3 linhas — o prettier
  separa atributo de expressão, e foi assim que o preço do portal viveu meses a
  2,68:1); o aviso tem token (`--aviso`), os dois testados nos dois modos em
  `aparencia.test.ts`. O badge de status vem da tabela semântica de
  `lib/status-badge.ts` (decisão P6) — mapeamento inline nas 7 telas reprova
  varredura. Dinheiro nunca é `type="number"` (varredura) e o degrau maior é
  `money-lg`; a confirmação de estorno cita o RECEBIDO
  (`lib/financeiro/confirmacoes.ts`, com o caso 1.000/300 em teste). Filtro de
  tela mora na URL pela gramática de `lib/filtro-url.ts` (default FORA da
  URL; `useBuscaNaUrl` debounce+replace). Alvo tocável no mobile tem 44px
  (`default` é `min-h-11 md:min-h-9`; override de tamanho só de `md` para
  cima). **⌘K/Ctrl+K** abre a busca de noivas de qualquer tela
  (`components/busca-global.tsx`, chunk lazy de 1,6 kB, gate `leads.ver`) —
  e cmdk sobre busca de SERVIDOR é sempre `shouldFilter={false}`. A grade da
  agenda solta o card onde o PONTEIRO está (`pointerWithin` — a colisão por
  retângulo soltava na cabine vizinha no fio do meio).

## Product

- **Jornada da noiva** — leads/noivas, agenda, atendimentos, provas, ajustes,
  reservas de vestido (com motor de disponibilidade), catálogo e acervo.
  Avarias da devolução viram parcela cobrável (E71); LGPD interna com
  consentimento carimbado e expurgo que preserva números (E77).
- **As duas naturezas de peça (E150, E154)** — o que decide se uma peça está
  disponível não é o que ela é, é como se pergunta. A peça ÚNICA (vestido,
  bolero, mantilha) mora no acervo, tem código e **se reserva**: o contrato que
  a vende sem reserva no mesmo contrato leva 422 (E150). A peça de ESTOQUE
  (saiote, crinol, anágua) mora em `itens_estoque`, tem `quantidade` e **se
  conta**: `GET /lojas/:id/itens-estoque/comprometimento?data=` soma o que os
  contratos ATIVOS comprometeram no dia (janela de uso, a mesma régua do
  vestido) e a tela de orçamento **avisa sem bloquear** — *"3 × Saiote 2 aros
  para 19/09/2026 — a loja tem 2"* e deixa fechar. Saiote é substituível;
  recusar uma venda de R$ 4.000 por causa de uma anágua seria um defeito, não
  uma proteção. A dona conta a arara em **Vestidos → Estoque**.
- **A peça é precificada pela VEZ em que sai (E157)** — `vestidos` ganha
  `precoRealuguel` (**nulo = não tem preço de segunda saída**, e o orçamento
  segue com o `precoBase` — o comportamento de sempre). A contagem que decide
  qual preço vale **já existia**: `GET /vestidos/utilizacao` sem recorte
  `de`/`ate` conta a vida inteira da peça. Ao escolher uma peça já alugada, o
  item de orçamento **sugere** o preço de realuguel e diz por quê ("3ª saída
  desta peça"); o campo segue editável, porque preço é conversa. O papel
  registra a contagem 7 vezes em 14 semanas.
- **O ciclo da peça tem três datas reais (E152)** — retirada, devolução e agora
  **`lavagemConcluidaEm`**: a lavagem era a única etapa calculada só por soma, e
  a peça voltava da lavanderia na quarta presa até domingo. A régua de 7 dias
  continua valendo (é lavanderia externa); o que existe é o caminho de dizer que
  ela chegou — em **Reserva → Movimentação**, depois da devolução. Encurtar a
  janela só REDUZ ocupação, nunca cria conflito, e a peça não volta da
  lavanderia sem ter voltado da noiva (400 `LAVAGEM_SEM_DEVOLUCAO` nos dois
  sentidos). **O que ele NÃO resolve, e é decisão da dona, não limitação a
  consertar** (P6, 2026-08-05): a mesma peça alugada de novo em **7 dias** segue
  recusada, e não pela lavagem — é a janela de PROVA de 11 dias da segunda noiva
  que invade o USO da primeira (medido: `PROVA[02-24..03-06]` × `USO[02-28..
  03-05]`). O ateliê trata o caso como exceção fora do sistema; o caderno o
  mostra uma vez em 14 semanas. E **toda reserva guarda ao menos um dia de
  prova** (P7): nem no realuguel se dispensa conferir a peça antes de ela sair.
- **A ausência da equipe (E151)** — `ausencias` (loja, pessoa, `inicio`/`fim`
  em DIAS locais **inclusivos**, motivo) é o primeiro fato de indisponibilidade
  de GENTE que o sistema guarda. A recusa mora na mesma régua que já recusa dia
  fechado (`agenda-core/mover.ts`, motivo `VENDEDORA_AUSENTE`), então a grade e
  o formulário de agendamento **apagam o dia antes do clique** e o servidor
  recusa com uma frase que diz quem e até quando. **Ela só impede o novo**: o
  que já estava agendado não é cancelado nem remarcado. Cadastro em
  **Cabines & horário**, gate `agenda`.
- **A peça sob medida (E155)** — a terceira natureza, e a única que ainda não
  existe quando é vendida: `ajustes` guarda `tipo` (`AJUSTE` | `CONFECCAO`) e
  `custo`, então a **fila da costureira é uma só** — prazo (a próxima prova),
  status e checklist já eram os mesmos. O item de orçamento `AJUSTE` aponta a
  confecção (`ajuste_id`), e a prova é da NOIVA, não só da loja: cobrar o
  trabalho que a costureira faz para outra dá 404. Registrar em **Reserva →
  prova**; a fila mostra o selo *Confecção* e o custo. **Em aberto:** depois do
  casamento a peça confeccionada vira item do acervo? **Respondido no E156.**
- **A confecção vira peça do acervo (E156)** — `vestidos.origemAjusteId` guarda
  de onde a peça veio quando ela não veio do fornecedor. É **gesto, não
  gatilho**: na fila da costureira, no trabalho `CONFECCAO` já `FEITO`, o botão
  *"Virou peça do acervo"* abre o cadastro de vestido com nome e observação
  preenchidos — e o **preço é digitado**, porque `ajustes.custo` é o que a
  costureira cobrou e `precoBase` é o que a noiva paga. A peça nasce **ativa e
  sem reserva nenhuma**; o contrato antigo segue apontando a confecção pelo
  `ajusteId` do item, e nada é reescrito para trás. Feita uma vez, a linha da
  fila mostra *"no acervo · CÓDIGO"* no lugar do botão — a mesma confecção não
  vira duas peças. O servidor recusa com 422 o que a tela já não oferece:
  trabalho de outra loja (`REFERENCIA_INVALIDA`), ajuste comum ou confecção
  ainda pendente (`CONFECCAO_INVALIDA`). Apagar o trabalho da fila **não** apaga
  a peça: perde-se a proveniência, não o acervo.
- **A avaria fecha (E167).** A foto de avaria tem parser próprio de 4 MB em
  `app.ts`, montado como o da foto de vestido (gate antes do parser, parser
  antes do global): a foto de celular de 1,5 MB **entra**, e o teto de 2 MiB
  passa a ser cobrado pelo 422 `FOTO_MUITO_GRANDE` em vez do 413 do parser — o
  limite anterior era 19,5× menor que uma foto real. O `GET` e o `PATCH` de um
  bloqueio devolvem **`donoLeadId`** (o `lead_id` próprio, ou o da reserva-mãe
  quando ele é nulo), que é a mesma régua com que `POST /avarias/:id/cobrar`
  decide de quem é o reparo: a ficha da reserva acha o contrato por ele e passa
  a oferecer a cobrança nos bloqueios sem noiva própria. O payload da avaria
  carrega **`parcelaStatus`** — "cobrado" é cobrança VIVA, e com o contrato
  cancelado a ficha volta a oferecer "Recobrar reparo" e a remoção, como o
  servidor sempre aceitou. O diálogo de conferência da devolução só oferece
  "Registrar avaria" a quem tem `vestidos.criar`; os demais leem qual permissão
  falta, em vez de um botão que não faz nada.
- **A rescisão se lê ANTES do clique, e a conta vem do servidor (S-C140).**
  `GET /lojas/:lojaId/contratos/:contratoId` devolve `rescisao` **preenchida**
  em contrato ATIVO — o que as cláusulas 8ª §2º/11ª/12ª/18ª mandam reter e
  devolver **se a noiva rescindir hoje**, linha a linha —, e `null` em contrato
  CANCELADO, que é registro morto e não se recalcula. O diálogo "Cancelar
  contrato" mostra essas linhas antes do gesto. **Ela não é recalculada na
  tela**, e a razão é estrutural: o predicado da 12ª cruza `vestidos.exclusiva`
  com a contagem de saídas ATIVAS, e o `ContratoItem` do spec não carrega
  nenhuma das duas metades — o front adivinharia a linha mais cara. **O `hoje` é
  INJETADO e a conta é DERIVADA** (a 18ª muda de resposta à meia-noite), como
  toda conta desta trilha desde o E211. A escolha `destinoPago` continua na
  tela: ela é o caso em que a dona decide contra a régua, e a divergência é
  DITA nas duas pontas pela mesma função (`estornoContraARescisao`) — alerta na
  tela e linha `estornoContraARescisao` no `CONTRATO_CANCELADO` da trilha, no
  molde do `AVARIA_FORA_DA_FAIXA` do E214. **A leitura não ficou mais cara:** o
  handler faz as MESMAS 2 queries, porque as duas metades da 12ª entram na
  consulta relacional que já existia (a marca por `with: { vestido }`, a
  contagem por `extras` correlacionado) — e `sc140-rescisao-no-get-api.test.ts`
  prega o número com `vi.spyOn(pool, "query")`, no formato do "exatamente 2
  queries" do `verificarDisponibilidade`. **A contagem da 12ª exclui ESTE
  contrato** (`c_outros.id <> $`), coisa que o `POST /cancelar` não precisa
  fazer porque lá ela roda depois do `UPDATE` para CANCELADO.
  **A devolução da rescisão sai por UM caminho (E241).** Sob `destinoPago:
  "manter"` o que a cláusula manda devolver nasce como `contas_pagar` tipo
  `DEVOLUCAO` vencendo em 30 dias (13ª §3º); sob `"estornar"` o caixa já
  devolveu 100% do recebido — que é sempre ≥ a devolução da cláusula — e a
  conta **não nasce**. Antes as duas coisas aconteciam juntas: R$ 1.200,00 de
  reserva + R$ 1.000,00 de carnê, noiva desiste, "estornar" → estorno de
  R$ 2.200,00 **e** conta de R$ 400,00 (R$ 2.600,00 sobre R$ 2.200,00);
  pela loja, 100% mais 100%. A trilha `CONTRATO_CANCELADO` diz por onde saiu
  (`devolucaoPorContaAPagar`: 0 sob estornar, `rescisaoDevolucaoTotal` sob
  manter), e o diálogo de cancelar troca a frase "nasce como conta a pagar"
  por "sai do caixa agora — não nasce conta a pagar" quando o rádio do estorno
  está marcado.
- **A taxa de avaria tem FAIXA, e ela vem do contrato de papel (E214).** A
  avaria passa a dizer de qual cláusula a taxa saiu: **LIMPEZA** é a 14ª (faixa
  absoluta, **R$ 350,00 a R$ 2.500,00**) e **DANO** é a 15ª (teto de **5× o
  aluguel daquela peça**, lido de `contrato_itens.valor_unitario`). O mesmo
  número tem dois desfechos — R$ 9.000,00 cabem no vestido de R$ 3.000,00 e não
  cabem no véu de R$ 400,00 —, e é por isso que o teto não é constante. **Peça
  fora de contrato não tem teto calculável**, e nesse caso a régua pede a razão
  escrita em vez de aceitar em silêncio. **A régua não impede a dona de decidir:
  obriga a dizer por quê** — `justificativaDaTaxa` é gravada na avaria, aparece
  em vermelho na ficha e vai para a trilha como `AVARIA_FORA_DA_FAIXA`, com
  tipo, cláusula, valor, piso, teto e motivo. As **duas** portas conferem (o
  registro, contra o contrato ATIVO da dona; a cobrança, contra o contrato
  ESCOLHIDO), e a justificativa também entra no corpo da cobrança para não haver
  beco — sem ela, a única saída de uma avaria que estoura o teto do contrato
  novo seria apagá-la, destruindo a foto-prova. A conta mora em
  `financeiro-core/avaria.ts`, **inclusive a frase**, e a tela chama a mesma:
  quem digita R$ 50,00 de limpeza lê os R$ 350,00 no ato, não no 422.
- **A avaria se CORRIGE, e a cobrança viva segue o número (S-C11).**
  `PATCH /lojas/:lojaId/avarias/:avariaId` edita descrição, tipo, custo e
  justificativa — **a foto não**, porque trocar a prova não é corrigir um
  número. Antes disso o zero a mais (**R$ 1.500,00 onde eram R$ 150,00**) só
  tinha a saída de apagar a linha, que o E115 recusa sob cobrança viva e que
  leva a foto-prova junto. Três coisas valem: a **régua do E214 é reconferida
  na edição** (senão bastaria nascer com R$ 400,00 e corrigir para R$ 9.000,00);
  havendo cobrança viva o teto sai do contrato que **cobra**, e
  `parcelas.valor_previsto` **acompanha** o novo valor na mesma transação — a
  ficha e o carnê não podem dizer números diferentes; e **dinheiro que entrou
  congela a linha** (409 `AVARIA_COM_RECEBIMENTO`), com o caminho de volta dito
  na resposta e na tela: estornar a parcela e então corrigir. A assimetria com o
  `DELETE` é a decisão do épico — apagar recusa em QUALQUER cobrança viva
  (a foto sustenta a parcela), corrigir recusa só onde houve recebimento. Toda
  edição deixa `AVARIA_EDITADA` na trilha com o **de** e o **para** de cada
  campo, e a parcela que seguiu.
- **A reserva se lê sozinha, e o dono do bloqueio é dito em toda porta de
  `reservas.ts` (E179).** `GET /lojas/:lojaId/reservas/:reservaId` existe — até
  aqui a única leitura de reserva era a listagem da loja INTEIRA, e foi ela que
  tornou o V14 impossível de consertar só na tela. A forma é a do
  `GET /bloqueios/:id` (E79): a noiva e os bloqueios com vestido, e **404
  quando o id não é da loja** — a fronteira do E111 não alcança este caso,
  porque a URL diz a loja certa e quem vem de fora é o ID. **`donoLeadId`
  deixou de ser exclusividade do `GET`/`PATCH` do bloqueio**: as cinco portas de
  `reservas.ts` que declaravam o campo e devolviam `undefined` passaram a
  preenchê-lo (a listagem de bloqueios, o `POST /bloqueios` e as três de
  reserva). Herdar o dono **não** é ser da noiva: o recorte `?leadId=` continua
  filtrando pelo `lead_id` PRÓPRIO, e há teste pregando isso. Fora de
  `reservas.ts` restam 11 operações com `BloqueioVestido` aninhado ainda mudas
  (agenda, fila da costureira, orçamentos) — é a S-O56.
- **A agenda fala uma língua só (E168).** O expediente da loja é traduzido em
  UM lugar — `expedienteDaRegra`, no `@workspace/agenda-core` —, e **uma
  varredura reprova quem montar a segunda cópia**. Quem segura a cabine também
  é decisão do núcleo: `seguraOIntervalo` diz que CONCLUIDO e FALTOU **não**
  bloqueiam sobreposição (a noiva já saiu, ou não veio) e **bloqueiam o
  instante exato**, porque as duas UNIQUE de `atendimentos` o bloqueiam. A
  cabine desativada **continua desenhada** na grade e na semana enquanto tiver
  atendimento, marcada "desativada", e não recebe nada novo; desativar avisa
  quantos ficam. **Mover o horário derruba `confirmadoEm`, `contatadoEm` e
  `remarcacaoPedidaEm`** e devolve a noiva à fila "Falta procurar" — trocar
  cabine ou vendedora não derruba nada, porque a mensagem que ela recebeu não
  fala de cabine. O `PUT /disponibilidade/regras` recusa expediente impossível
  (422 `HORARIO_INVALIDO`, 422 `SEM_DIA_DE_FUNCIONAMENTO`) conferindo o valor
  EFETIVO do upsert, não o corpo: antes um par invertido zerava a grade e a
  loja recusava as 24 horas do dia sem dizer por quê. E a semana nasce do dia da
  LOJA (`diaLocal`), como a tela do dia, não do relógio do navegador.
- **O carnê que perdeu uma parcela se completa (E169).** `DELETE /parcelas/:id`
  sempre aceitou uma parcela PREVISTA do próprio carnê, e o
  `POST /contratos/:id/parcelas/gerar-plano` recusava com 409 `JA_TEM_PLANO`
  para sempre: um contrato de R$ 5.000,00 que perdesse a parcela 10 ficava
  somando R$ 4.500,00 **sem gesto de volta**. A guarda passou a ser "o carnê
  FECHA?" em vez de "existe carnê?": faltando, a rota gera as parcelas do
  FALTANTE, numeradas depois das que existem, sem renumerar nada, com
  `CARNE_COMPLETADO` na auditoria — e a entrada é recusada ali com 422
  `ENTRADA_NO_COMPLEMENTO`, porque `numero === 0` significa ENTRADA em seis
  pontos do sistema. Na tela, o formulário reabre dizendo quanto falta e o botão
  vira "Completar carnê".
- **O teto do desconto vale para os dois tipos (E169).** `recusaDeDesconto`, no
  `financeiro-core`, recusa percentual acima de 100 (S-M23) **e** desconto em
  reais maior que o bruto dos itens — 422 `DESCONTO_INVALIDO` no
  `PATCH /orcamentos`, com a mesma frase na tela antes do clique. O
  `POST /orcamentos` não cobra o teto do VALOR por construção: o corpo de
  criação não aceita itens, então não há bruto contra o qual comparar.
- **`PUT /leads/:id/interesse`: `null` APAGA, ausente é "não mexi"** (S-M10, a
  sobra 🟡 herdada da revisão max). `LeadInteresseInput` admite `null` em
  `algoAMais`, `naoQuerUsar` e `tetoOrcamento`, e a tela manda `null` quando o
  campo fica vazio. Limpar o teto de R$ 8.000,00 e salvar **apaga** o teto —
  antes o campo ausente sumia do `set` do `onConflictDoUpdate`, o valor velho
  ficava, e o toast dizia sucesso.
- **Portal da noiva (E78)** — UM link público por noiva (`/noiva/:token`,
  `portal_tokens`, 30 dias **de inatividade**): proposta com aceite (E74),
  lookbook, próximas provas e extrato de parcelas só-leitura, com "falta pagar"
  e "próxima em" somados (E100/F36). A vendedora gera/revoga no card da ficha;
  os links antigos de orçamento/lookbook seguem valendo (compat).
  A noiva CONFIRMA a presença da prova por ele (E85 — o mesmo `confirmadoEm`
  do E39, com rastro "link público" na trilha) ou avisa que **não pode ir**
  (E100/F37 — `remarcacaoPedidaEm`, que não cancela nada e devolve a linha à
  fila de remarcação da loja), e as mensagens de wa.me
  (cobrança/confirmação/orçamento) fecham com o link quando o portal está
  vivo (E84, `GET /portais` em lote + `lib/portal.ts` como régua única).
  O rodapé traz nome, endereço e "Falar no WhatsApp" da LOJA, com o nome dela
  já na mensagem (E100/F35). Depois do contrato ele mostra **"Seu contrato"**
  (o snapshot de itens, o total e o PDF pelo mesmo token — E100/F21) e **"O seu
  vestido"** (a peça reservada, a retirada e os ajustes como pronto/em
  andamento — E100/F39). O papel do contrato é montado por
  `lib/contrato-do-papel.ts`, a mesma régua dos dois lados: a loja e a noiva
  baixam byte por byte o mesmo documento.
  E desde o E221 ele mostra **"Seus recibos"** — a cláusula 7ª do instrumento
  de papel manda a locadora *"fornecer todos os recibos de pagamentos
  efetuados"*, e o recibo é por **RECEBIMENTO**, não por parcela: uma parcela
  recebe em pedaços (E49), e quem pagou R$ 300,00 em 01/03 tem o papel de
  01/03. Não há tabela de recibos — o ato individual existe na linha
  `PARCELA_RECEBIDA` da trilha, escrita na MESMA transação do dinheiro, e o
  papel **concilia** com o `valorRecebido` da parcela antes de sair (soma maior
  que o recebido = nenhum recibo). Estorno anula os anteriores pelos dois
  caminhos (avulso e cancelamento com `destinoPago: estornar`), e o link morre
  junto. Montagem em `lib/recibo-do-papel.ts`, bytes em `lib/pdf-desenhista.ts`
  (o motor que saiu de dentro do `contrato-pdf.ts` quando nasceu o segundo
  papel); a loja emite por `GET /contratos/:id/recibos[/:id/pdf]`.
- **Comercial** — orçamento → contrato (com snapshot dos itens) → plano de
  parcelas → PDF do contrato. A noiva vê a última versão ENVIADA (E75) e
  aceita pelo link com rastro (instante, versão, hash — E74).
- **O PDF do contrato É o instrumento** (E220, 15/08): as 21 cláusulas do
  molde de papel, a identificação das partes (a loja do cadastro; a locatária
  da qualificação congelada no E215), a tabela do objeto e o fecho. Texto em
  `lib/contrato-clausulas.ts` (puro), com **os números lidos das réguas** do
  `financeiro-core` — a 14ª imprime `TAXA_LIMPEZA_MINIMA`, a 16ª
  `DIAS_PARA_EXTRAVIO`, e por aí; mudou a constante, mudou o papel. A 4ª
  imprime o expediente EFETIVO da loja (`expedienteDeRetiradaPorExtenso`, a
  mesma leitura da guarda do E222). Onde o papel é omisso o texto declara: 5ª
  sem instante sai com a lacuna do molde, 18ª sem prazo diz "NÃO PACTUADO",
  21ª sem cidade remete à sede. `e220-instrumento.test.ts` é a régua de
  EFEITO: mocka cada constante e cobra que o texto troque junto. **O que ainda
  sai em branco é o que `lojas` não guarda** — representante, PIX, cidade
  (D7). Para ver o papel: `pdftotext -layout <arquivo> -` lê o texto de volta.
- **CPF e CNPJ entram conferidos pelos dígitos verificadores** (E233):
  `financeiro-core/src/documentos.ts` (`cpfValido`, `cnpjValido`, formatadores
  da grafia única, `CNPJ_DE_EXEMPLO`), a mesma função na API
  (`lib/documento-na-porta.ts` → 422 `CPF_INVALIDO`/`CNPJ_INVALIDO`, valor
  gravado normalizado) e nas telas. Seis portas: `PATCH /lojas/:id/dados`,
  `POST/PATCH /admin/lojas`, `POST/PATCH /leads`, `PATCH /contratos/:id`; e o
  fecho recusa ficha com CPF que não fecha. Aritmética, não cadastro: os dois
  CNPJs do papel passam. O seed usa `11.222.333/0001-81`.
- **Financeiro** — `/financeiro` é o fluxo de caixa (realizado), com recortes
  (**DRE de CAIXA**, projeção de saldo) e telas de ação (receber, pagar com
  saída multi-conta, cobrança por faixa de atraso). Conciliação por extrato
  OFX/CSV no navegador (E70). E79: os agregados rodam no BANCO
  (`GET /financeiro/fluxo`, `/financeiro/dre`, recortes de parcelas,
  `/leads/parados`) — os mesmos motores do `financeiro-core`, sobre linhas já
  filtradas no SQL.
- **Comissão** — escada por vendedora, versionada por vigência, com bônus,
  preview ao vivo do mês e fechamento idempotente que gera a conta a pagar.
- **Recorrências** — o que se repete todo mês (salário, aluguel, assinatura,
  fornecedor fixo) vira conta a pagar por geração idempotente por competência,
  e o período fecha com a contabilidade (export CSV). **Sair da equipe DESATIVA
  a recorrência da pessoa naquela loja** (E111): a geração lê as ativas da loja
  sem junção com `usuarios_lojas`, então sem isso a conta de quem já não
  trabalha ali renascia todo mês, na tela de Pagar e no DRE previsto. Desativa,
  não apaga — a recorrência é a régua que explica os salários já pagos.
- **Avisos sem cron** — o sino (E68) reúne caixa furando, comissão esquecida,
  noivas esfriando e presenças por confirmar; "Mensagens de hoje" (E69) é a
  fila de wa.me pronta (confirmação carimba `confirmadoEm`). E83: o poll e as
  telas do dia pedem `GET /atendimentos?de=&ate=` (janela por dia local), não
  a agenda inteira; a fila usa parcelas ABERTAS e orçamentos ENVIADOS.
- **Permissão é MÓDULO × AÇÃO, e são oito módulos** (E172):
  `leads · orcamentos · contratos · agenda · vestidos · financeiro · comissao ·
  admin`, cada um com `{ver, criar, editar}`. Até 2026-08-12 eram seis, e
  `leads` governava sozinho a ficha da noiva, o orçamento E o contrato — quem
  cadastrava a noiva assinava o contrato de R$ 5.000,00 dela. **Módulo × ação
  não tem grão mais fino que isto: o que precisa se separar vira módulo.**
  Chave ausente é fail-closed (`normalizarAcessos`), então **módulo novo exige
  migração** para as bases que já existem — o seed é idempotente e não reescreve
  perfil que já está lá. Os cinco perfis semeados estão em
  `configuracao-inicial.ts:110`; a régua que os exercita como PESSOA (login de
  verdade, resposta HTTP real) é `e172-perfis-por-papel-api.test.ts`.
- **Multi-loja** — tudo é escopado por loja; superadmin tem bypass e o console
  consolidado da rede (E76). O perfil Admin é flag `perfis.sistema` (E80) —
  o servidor recusa PATCH/DELETE dele. Gerir equipe é ato sobre a tabela GLOBAL
  `usuarios`: `PATCH`/`DELETE /lojas/:lojaId/equipe/:usuarioId` provam o vínculo
  `usuarios_lojas` antes de escrever e respondem 404 sem ele (E91) — sem essa
  prova, um admin inativava a dona da loja vizinha por curl.

## Gotchas

- **O `Test` do supertest é LAZY: a request só sai no `.then()`.** `agent.delete(...)`
  devolve um *thenable* que ainda não falou com o servidor — guardar a variável
  não dispara nada. Num teste comum isso é invisível (o `await` vem na linha
  seguinte); num teste de CONCORRÊNCIA é a diferença entre provar e não provar.
  O teste da corrida da S33 (`s33-corrida-delete-loja-api.test.ts`) precisa da
  rota pendurada numa tranca do Postgres ENQUANTO outra conexão commita: a
  primeira versão guardava o `Test` numa variável, dormia 300 ms e commitava —
  com a request ainda no papel. Ela passava verde inclusive contra o código
  SEM o conserto. `Promise.resolve(agent.delete(...))` assimila o thenable e
  dispara agora; com isso o vermelho apareceu, literal: `expected 204 to be 409`.
- **Em `e2e/`, `await import(...)` não sobrevive à transpilação do Playwright.**
  O import dinâmico chega ao `.ts` cru como ESM e estoura
  `ReferenceError: exports is not defined in ES module scope`; o import
  ESTÁTICO passa pelo transform normalmente. Medido no épico da S-D25: a régua
  de limpeza nasceu com `await import("../lib/db/src/index")` — para não abrir o
  Pool do banco nos ~50 specs que não o tocam — e derrubou **7 specs**. A
  cautela era desnecessária por medida: todo spec que usa o banco já o importava
  estático. **E o estrago do crash não fica no run:** os sete `afterAll`
  morreram no meio da limpeza, e o rastro que ficou derrubou OUTRO spec no run
  seguinte (o gotcha logo abaixo).
- **O E2E é de PORTA ÚNICA na máquina, e worktree não isola porta** (E179). O
  `playwright.config.ts` crava `5099` (API) e `5173` (Vite) com
  `reuseExistingServer: true`: dois agentes rodando o E2E ao mesmo tempo — cada
  um no seu worktree e no seu banco — compartilham os dois servidores, e quando
  o primeiro termina e derruba os processos, o segundo passa a colher
  `net::ERR_CONNECTION_REFUSED at http://localhost:5173/...`. **Medido em
  2026-08-12**: um run que tinha acabado de fazer `166 passed · 1 failed ·
  4 skipped` repetiu como **46 passed · 22 failed · 35 did not run**, com
  **33 dos artefatos de falha acusando conexão recusada** — e o `ps` mostrava
  um `vite` de OUTRO worktree (`agent-ac2104…`) subido no meio. **Desde o E188
  HÁ env para trocar as portas** (`E2E_API_PORT`/`E2E_WEB_PORT`, que também
  desligam o reuso), e ela nasceu para a régua do banco virgem — mas dois E2E
  simultâneos com portas próprias **não foram medidos**, e o BANCO de dev
  continua sendo recurso único entre eles (é a S-O93). **Desde o E190 a env
  alcança também o `API_URL` de `e2e/helpers.ts`** — por onde 51 dos 64 arquivos
  falam com a API —, que era `http://localhost:5099` cravado: até aqui mover a
  porta movia só a TELA, e o cliente HTTP dos specs continuava batendo na 5099.
  **A régua é a mesma do banco — medir em série —, e ela vale
  para o E2E entre AGENTES, não só entre suítes:** confira `ps aux | grep vite`
  antes de disparar, e se um vermelho em massa vier com "connection refused",
  procure o vizinho antes do próprio código.
- **O banco do E2E PERSISTE entre execuções: rastro de spec vira vermelho em
  outro arquivo, um run depois — e se lê como flake.** As três suítes rodam
  contra o `DATABASE_URL` de sempre; um `afterAll` que não roda (ou que morre no
  meio) não perde nada hoje, perde amanhã. Medido na sessão de 2026-08-06/07: o
  `afterAll` do `55-ficha-responde-o-telefone` morreu antes de apagar o contrato
  que ele cria, e no run SEGUINTE o `37-projecao-comissao` reprovou com
  `expected 1550 to be 4340` — o contrato vazado de R$ 8.400 (com 3 parcelas de
  840 recebidas no dia) deu projeção de comissão a uma SEGUNDA vendedora, e o
  spec pega a primeira linha com projeção. Não há retry no `playwright.config`
  (`retries: 0`, de propósito): **vermelho é achado**, e quando ele não bate com
  o que você mexeu, procure o rastro do run anterior antes de suspeitar do
  próprio código. A limpeza segue a ordem dos FKs — parcelas → contratos →
  leads → cabines.

- **Import morto num módulo ANSIOSO custa caro desde o E104/D8.** Enquanto o app
  era um chunk só, um `import` sem uso não pesava nada — o E99 mediu a poda de 24
  primitivos e o bundle não mudou um byte, porque tudo já era tree-shaken. Com o
  corte por rota isso deixou de valer: `dashboard.tsx` importava `format` do
  date-fns sem usar, e como o dashboard é uma das quatro rotas ansiosas, aquele
  import prendia **103 kB de date-fns no caminho crítico de todo mundo** — até da
  noiva abrindo o portal no celular, que não usa data nenhuma. Ao mexer nos
  quatro módulos ansiosos (`App.tsx`, `app-layout`, `login`, `dashboard`),
  confira o que eles importam de verdade.

- **`drizzle-kit push` trava sem TTY** quando há coluna a dropar/renomear: ele
  pergunta "renomeou ou removeu?" e não há terminal interativo aqui. Aplique o
  DDL equivalente por `psql "$DATABASE_URL"` (em transação, com uma guarda que
  aborta se a tabela não estiver no estado esperado) e rode o push depois — ele
  confirma com "Changes applied", sem prompt. Esse DDL fica versionado em
  `docs/migracoes/`: um banco NOVO nasce certo do schema, mas um banco que já
  existe só chega lá por esse script — e `push` não sabe fazê-lo sozinho.
- **Migração aplicada à mão vai no banco de `DATABASE_URL`, não no que você
  decorou** (E211/E214, 2026-08-13). São dois bancos na mesma instância, e a
  suíte lê só o primeiro: um `psql -d moscow_base` que aplica o DDL deixa
  `heliumdb` para trás, e o preço aparece épicos depois — `column "exclusiva" of
  relation "vestidos" does not exist` em **vinte arquivos** de teste ao mesmo
  tempo. O conserto foi um `pnpm run push`. Vale também para CONFERIR: antes de
  concluir que o `push` engoliu um `ALTER TYPE`, veja em qual banco você está
  olhando — `psql "$DATABASE_URL"`, nunca `psql -d <nome>`. O E211 acusou a
  ferramenta de mentir por causa disso, e a acusação viajou para o briefing do
  E214 como se fosse fato.
- **O que os scripts de `docs/migracoes/` criam tem de existir no schema
  drizzle, com o MESMO NOME** (S-A20). O drizzle nunca lê aqueles scripts: são
  duas descrições do mesmo banco, e quando divergem, um banco novo e um banco
  antigo deixam de ser o mesmo banco. Divergiram em quatro pontos, e só um
  gritou — o E154 batizou a unique de `itens_estoque_loja_nome_tamanho_unq` e o
  drizzle gera `itens_estoque_loja_id_nome_tamanho_unique`, então o `push`
  tentava criar a duplicata e morria num prompt sem TTY. Os outros três eram
  índices (`itens_estoque_loja_idx`, `avarias_parcela_id_idx`,
  `atendimentos_loja_contato_idx`) que existiam nos bancos antigos e em nenhum
  banco novo: ninguém tropeça num índice que falta. **A varredura de
  `e115-migracao-snapshot-unit.test.ts` agora reprova nome novo que o snapshot
  não conheça** — e a pergunta, quando ela reprovar, é qual das duas pontas está
  certa, nunca como calá-la. Nome divergente conserta-se do lado do SCHEMA
  enquanto nenhum banco consumir o `migrate` (`__drizzle_migrations` não existe),
  porque assim o conserto custa zero DDL em banco de verdade.
- **`drizzle-kit generate` tem o MESMO defeito sem-TTY** (E115): com snapshot
  anterior ele pergunta "criada ou renomeada?" e morre sem terminal. O segundo
  defeito — `out` ABSOLUTO no `drizzle.config.ts`, que o kit relia como
  `.//home/...` e matava com ENOENT — **foi consertado no E154**: `out` é
  relativo (`"./migrations"`) e `pnpm --filter @workspace/db run generate`
  funciona direto. A saída é incremental: o E154 gerou
  `0001_tired_power_man.sql`. **A baseline é regenerável
  enquanto nenhum banco consumir o `migrate`** (o dev usa `push` e não tem
  `__drizzle_migrations` — conferido no E115), e
  `e115-migracao-snapshot-unit.test.ts` reprova schema com coluna fora do
  snapshot: foi assim que o 0000 ficou SEIS migrações para trás e um banco
  provisionado por `migrate` nascia sem `conciliado_em`, com o portal da noiva
  respondendo 500 em toda abertura.
- **`lib/api-zod` é consumido COMPILADO.** Depois do codegen, rode
  `npx tsc --build` na raiz, senão as rotas continuam vendo o contrato antigo e
  o erro de tipo aponta para o lugar errado.
- **Colisão de nomes no codegen**: o Orval gera o schema Zod e o tipo de query
  params com o mesmo nome. `lib/api-zod/src/index.ts` desambigua com re-export
  explícito — se um `Params` novo colidir, some à lista de lá.
- **Param no nível do path vaza para todos os métodos** do OpenAPI. Um
  `competencia` em query que só o GET usa vai dentro do `get:`, senão o POST
  também o ganha e o codegen colide.
- **Os testes de API tocam o banco de verdade** (`DATABASE_URL`). Eles usam
  fixtures isoladas por loja (`criarFixture`/`limparFixture`); competências dos
  testes são datas PASSADAS de propósito — o fechamento recusa mês corrente. A
  ORDEM da limpeza é significativa desde o E91: contratos → loja → usuários →
  perfil. Com as FKs de vendedora em `restrict`, apagar a pessoa primeiro passa
  a falhar em toda fixture que fechou contrato.
- **O navegador desenha `<input type="date|month|time">` na locale da INTERFACE
  dele, NÃO no `lang` do documento** (medido no E92, em dois builds de
  Chromium). `<html lang="pt-BR">` está lá porque é WCAG 3.1.1 nível A e porque
  o leitor de tela lia "noiva" com fonemas ingleses — mas ele NÃO garante
  DD/MM/AAAA. Quem opera com o navegador em inglês continua vendo `07/31/2026`
  num filtro de dinheiro. Teste de UI que dependa do formato desses campos
  precisa fixar `--lang` no browser; a captura sem isso mede o navegador, não o
  app.
- **E `--lang` SOZINHO não fixa nada neste Chromium** (E182, medido em
  2026-08-12 no `/nix/store/…ungoogled-chromium-138`). São **três lugares**, e
  os três precisam estar no `launch`: o `locale` do contexto, os args
  `--lang=pt-BR --accept-lang=pt-BR,pt` e **`LANG=pt_BR.UTF-8` +
  `LANGUAGE=pt_BR:pt` no `env` do processo**. Com os dois primeiros e sem o
  terceiro, `/financeiro/receber` desenha o mesmo `2026-08-01` do DOM como
  **`08/01/2026`** — que um leitor brasileiro lê como 8 de janeiro — e o campo
  vazio sai `mm/dd/yyyy`. Com os três: `01/08/2026` e `dd/mm/aaaa`.
- **`navigator.languages` e `Intl` MENTEM sobre isso, e é a armadilha da
  medição**: os dois respondem o `locale` do CONTEXTO do Playwright — no
  navegador quebrado acima, os dois diziam `pt-BR` enquanto o campo desenhava
  `mm/dd/yyyy`. A única leitura que enxerga o defeito é o **shadow DOM da UA**
  do próprio campo, que nem `getAttribute("placeholder")` nem `innerText`
  alcançam. O caminho medido, em ~15 linhas: `contexto.newCDPSession(page)` →
  `DOM.getDocument` → `DOM.querySelector('input[type="date"]')` →
  `DOM.describeNode` com **`pierce: true`**, juntando os nós de texto na ordem
  (`dd`,`/`,`mm`,`/`,`aaaa`). Está escrito em `scripts/capturar-telas.ts`
  (`placeholderDeData`), e é reusável para qualquer conferência de locale de
  interface.
- **O navegador do E2E fala português e mora em São Paulo desde o E188**
  (S-O70). Ele era **en-US** nos 171 specs — o `playwright.config.ts` montava
  `launchOptions: { executablePath }` e nada mais —, e o filtro de
  `/financeiro/receber` desenhava `08/01/2026 · 08/31/2026` onde a loja lê
  `01/08/2026 · 31/08/2026`, do mesmo `value="2026-08-01"` do DOM; todo
  screenshot e trace de falha saía nessa interface. Hoje o `use` do config traz
  os **três lugares** da entrada acima mais `timezoneId: "America/Sao_Paulo"` —
  o `diaLocalSP` de `e2e/helpers.ts:300` já montava as fixtures em SP, e o
  navegador em UTC era a única ponta fora. Quem for pregar formato de data em
  E2E não precisa mais fixar nada: já está fixo no config.
- **Para navegar o app à mão, o `E2E_API_PROXY` do Vite NÃO serve.** Ele existe
  só para o Playwright (`vite.config.ts:69`, ligado em `playwright.config.ts:59`)
  e devolve **404 em POST** — ou seja, o login não passa por ele e não há como
  chegar a tela nenhuma. O que funciona (medido na trilha E e reusado no E92):
  subir `api-server` na 5000, o Vite na 5173, e um **proxy próprio na frente dos
  dois** (ex.: 5174 → `/api` para a 5000, resto para a 5173); daí logar normal.
  Vale para conferência visual, captura de tela e medição de contraste — e
  lembre que fazer login **escreve** (uma linha em `sessions` e o carimbo de
  `ultimoLoginEm`), o que é aceitável, mas não é "não toquei no banco".
- **Rotas planas (`/financeiro`, `/contratos/:id`) são compatibilidade
  transitória**: caem no `LegacyRedirect` do `App.tsx`. Código novo linka com
  escopo de loja (`/loja/:lojaId/...`); a sidebar e `useCaminhoDaLoja` mostram o
  padrão.
- **A poda do backup roda DENTRO do backup** (E59): cada dump bom apaga os
  além dos 10 mais recentes e as sessões expiradas. Teste que conta dumps ou
  sessões precisa de fixture própria — o estado global muda sob os pés.
- **Orçamento versiona no ENVIO** (E75): a noiva vê a última versão enviada,
  nunca o rascunho vivo; o aceite congela versão+hash. Editar depois de
  enviado NÃO muda o que ela está vendo — crie/envie nova versão. **APROVADO
  congela de vez** (E115): item e desconto respondem 422 `ORCAMENTO_APROVADO`
  (renegociar é criar novo orçamento), e o `POST /contratos` de um orçamento
  com aceite reconstrói o conteúdo vivo pela MESMA régua do congelamento
  (`conteudoEnviado`) e compara com o `aceiteHash` — divergiu, 422
  `ORCAMENTO_DIVERGE_DO_ACEITE`: o contrato nasce do que a noiva viu, nunca de
  um valor que ela não aceitou. **A versão não congela VAZIA** (E166): as duas
  portas que congelam (`POST /link` e o PATCH que marca ENVIADO) exigem ≥1
  item — 422 `ORCAMENTO_VAZIO` —, porque o aceite de R$ 0,00 leva o orçamento a
  APROVADO terminal e mata a venda. E o snapshot cobre **tudo o que a página
  dela mostra**: `observacoes` e `validade` congelam junto dos itens, e não
  mais da linha viva.
- **A validade barra o aceite, e reenviar É reabrir a negociação** (E166,
  decisão D3 da dona). Proposta vencida responde 422 `VALIDADE_VENCIDA` com a
  data e o caminho ("peça uma atualização à sua vendedora") — pelas DUAS portas
  do aceite (link público e portal), que agora **também conferem a versão que a
  página leu**. O `POST /link` de uma proposta vencida reabre a validade (30
  dias) e congela versão NOVA com ela: a noiva aceita o que está vendo, prazo
  incluído. Só o TTL do LINK era conferido antes, e a expiração do link protege
  o token, não o preço.
- **A régua da ação destrutiva** (E10/E99). Toda ação que apaga, desfaz dinheiro
  ou tira acesso **pede confirmação**; a confirmação **nomeia o objeto** ("o
  portal de Marina", "Parcela 3") **e o que se perde** — o valor em dinheiro
  quando houver, o que deixa de funcionar quando não houver; e a ação de
  **confirmar** é vermelha (o gatilho, numa fileira, não precisa ser).
  Duas coisas que a régua NÃO diz, e o porquê: **não** exige
  `variant="destructive"` no gatilho, porque `DropdownMenuItem` não tem essa
  prop — pedir uma grafia que o componente não aceita é escrever regra que
  ninguém pode seguir; e **desfazer não é destrutivo** ("Desfazer retirada",
  "Desfazer devolução"), porque o desfazer É a rede que o E97 criou para errar
  sair barato. `src/lib/destrutivas-varredura.test.ts` cobra a **ausência** de
  confirmação, e só isso — a segunda cláusula é prosa e mora na revisão, com o
  motivo escrito no próprio teste.
- **O portal expõe dados financeiros num link** (E78): TTL 30d, revogação a um
  clique, token em QUERY (o logger corta a query), e o extrato sai só do
  contrato ATIVO da própria noiva. Revogado responde 404 como desconhecido —
  o link morto não conta que um dia valeu. **Nenhuma rota pública aceita id de
  recurso na URL** (E100/F21): o PDF do contrato sai do `leadId` do token, não
  de um `:contratoId` — o que não se pode adivinhar não precisa ser provado.
  A raiz do payload de `GET /portal` tem **lista fechada de chaves**, com teste:
  acrescentar campo naquele link é decisão, não efeito colateral de um `select`
  que cresceu.
- **O TTL do portal conta INATIVIDADE, não idade** (E100/F38): cada `GET
  /portal` bem-sucedido empurra `expiraEm` para 30 dias à frente, junto com o
  `ultimoAcessoEm`. A decisão de segurança dos 30 dias fica de pé — o link de
  quem parou de usar continua morrendo sozinho, no mesmo prazo —, e some o
  absurdo de o link de uma noiva ATIVA vencer no meio de um noivado de um ano.
  **Renovar não ressuscita:** o 410 do vencido e o 404 do revogado rodam ANTES
  do `UPDATE`, então só o acesso vivo estica o prazo. Do lado de dentro, o que
  vencer para de vencer em silêncio: a fila de `/mensagens` marca a linha cuja
  mensagem vai sair sem o link (`leadsComPortalVencido`, mesma régua do selo
  "Expirado" da ficha).
- **O DRE é de CAIXA, e só existe um** (E102/C8). Ele soma o dinheiro que se
  MOVEU dentro da competência — parcela recebida menos pagamento feito —, e por
  isso fecha com o fluxo por construção. A coluna `contas_pagar.competencia`
  existe, está preenchida e **não entra na conta**: nenhuma comissão aparece no
  DRE da competência que a gerou, e sim no mês em que foi paga. O irmão por
  competência foi decidido como épico SEPARADO (E105) em 2026-07-25 — o que não
  podia seguir era o mesmo nome para as duas coisas.
- **Se `.migration-backup/` reaparecer no disco, apague** (A4 + E104). Ele saiu
  do versionamento no A4, mas continuava ocupando 22 MB e **1.563 arquivos** com
  nomes idênticos aos dos vivos — e o custo não é disco, é busca: `find` por
  `*.ts`/`*.tsx` devolvia **2.317 resultados contra 1.528**, ou seja **789
  fantasmas, 34% do total**, e `openapi.yaml` aparecia duas vezes. Duas sessões
  desta rodada perderam tempo abrindo o arquivo errado. Não é commit — o repo já
  está limpo; é higiene de ambiente, e o `.gitignore` já o cobre.
- **`pnpm run build` na raiz exige `PORT` e `BASE_PATH` no ambiente** (A6/E104).
  Sem elas o build morre em `Error: PORT environment variable is required but was
  not provided.`, lançado pelo `vite.config.ts:11` do **`moscow-noivas`** — as
  variáveis só existem no bloco de `run` do Replit. Com `PORT=5000 BASE_PATH=/`
  ele passa inteiro em 8,21 s. Não é defeito de um pacote: é convenção do repo, e
  vale para qualquer build fora do `run`.
- **`artifacts/mockup-sandbox` está no workspace, e sai do typecheck e do build
  pelo FILTRO** (A6/E104), não pelo `pnpm-workspace.yaml`: os dois scripts da raiz
  levam `--filter "!@workspace/mockup-sandbox"`. Medido: o typecheck roda **3 dos
  12 projetos** (`Scope: 3 of 12`), que é onde o custo do pacote morava — 60
  devDependencies, zero dependencies, e nada dele importa `@workspace/*`.
  **Tirá-lo do workspace quebra o Canvas**, e isso já aconteceu uma vez: o
  `[[services]]` roda `pnpm --filter @workspace/mockup-sandbox run dev`
  (`.replit-artifact/artifact.toml:17`), e fora do workspace o filtro responde
  "No projects matched the filters". Ele não foi tirado por quebrar o build da
  raiz — essa razão foi medida e é falsa, veja o item acima.
- **O drill do restore PROVA o dump, não restaura nada** (E89):
  `pnpm --filter api-server run restore-drill` pega o dump mais recente,
  restaura num database EFÊMERO `drill_<timestamp>` na mesma instância e
  confere contra a origem (contagem por tabela, FKs sem órfãs, soma de
  parcelas) — o efêmero morre no `finally`, sucesso OU falha. Ele NUNCA toca o
  database de origem (aborta se o alvo não começar com `drill_`, e a leitura
  da origem é read-only por sessão) e NÃO substitui a guarda de retenção dos
  dumps — se a poda dos 10 apagar o único dump bom, o drill só conta que o
  último que sobrou confere. O resultado fica em `restore_drill_log` e aparece
  em Configurações → Administração ao lado do status do backup.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `docs/auditoria/2026-07-15-unificacao-mapa-e-plano.md` — por que o sistema é
  assim: a unificação `main` × `feat/orcamentos`, onda a onda, com os desvios
  conscientes e o que segue em aberto.
