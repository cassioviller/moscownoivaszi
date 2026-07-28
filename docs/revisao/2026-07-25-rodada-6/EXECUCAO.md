# Rodada 6 — Execução (E91–E104) e histórico de sessões

**Branch:** `rodada-6/execucao` · **Base:** `01729db` (main)
**Plano:** `docs/propostas/2026-07-25-rodada-6-backlog.md`
**Diagnóstico:** `docs/revisao/2026-07-25-rodada-6/` (trilhas A–G, 121 achados)

## Como retomar esta rodada

> **O plano de fechamento está escrito.** Com onze épicos fechados e nenhum 🔴
> aberto, o que falta (três épicos 🟨 + 18 sobras) foi organizado em seis épicos
> ordenados em **`docs/propostas/2026-07-28-fechamento-rodada-6.md`**. Ele traz
> também as **quatro perguntas** que precisam de resposta do dono e que estão
> isoladas para não travarem nada.

> **E a revisão do branch inteiro mudou a ordem.** Em 2026-07-28, base `faa30c9`,
> uma revisão de `rodada-6/execucao` contra `main` achou **treze defeitos**, entre
> eles **um 🔴 confirmado por leitura** (a cobrança de avaria colide com a entrada
> do contrato) e **uma regressão do próprio E104 parte 3**. Os cinco épicos novos
> estão em **`docs/propostas/2026-07-28-revisao-do-branch-rodada-6.md`** e **passam
> na frente do E108 e do E109** — achado confirmado de dinheiro vem antes de
> consolidação de régua. Nove dos treze entram como **suspeita com âncora**: mapear
> é a primeira ação de cada épico.

1. Leia este arquivo — a tabela abaixo é a fonte da verdade do que já foi feito.
2. `git log --oneline main..rodada-6/execucao` — um commit por épico, na ordem.
3. Pegue o primeiro épico ⬜ da tabela e leia o épico correspondente no backlog
   (ele traz **A dor / Feito significa / Escopo técnico / Cuidados / Testes /
   Primeira ação**).
4. Leia **[Sobras](#sobras--visto-de-passagem-sem-épico)** — se o épico que você
   vai fazer tem item herdado lá, ele entra no escopo agora.
5. Ao terminar, atualize a linha na tabela, escreva o parágrafo no "Diário",
   mande as sobras novas para a tabela de Sobras e faça o commit do épico.

**O backlog erra.** Ele foi escrito lendo o código, não executando-o: o E92
derrubou o diagnóstico de um 🔴, o E94 contradisse o plano em cinco pontos e o
F33 prometia um dado que não existe. Mapeie antes de escrever, e registre a
correção — é ela que vale mais que o diff.

**Antes do commit, a régua é o E2E** (regra 11 do método): mudou o que a trilha
grava, ou o formato do que alguma tela lê, roda a suíte completa. Verde em
unidade + API + typecheck é o piso, não a régua — duas vezes nesta rodada o E2E
pegou o que 625 testes e o typecheck não pegavam.

**Nada é dado por feito sem commit.** Se a tabela diz ✅ e não há commit, o
trabalho não sobreviveu — refaça.

## Decisões de produto (respondidas pelo dono em 2026-07-25)

Estas destravam o E102 e valem como regra do sistema daqui para frente:

1. **Estorno de comissão maior que o mês → ABSORVER PROPORCIONALMENTE.** O mês
   abate `min(bruto, estornoPendente)` e o resto fica pendente para o mês
   seguinte. O comportamento de hoje (valor cheio voltando inteiro todo mês)
   é bug, e o teste que o blinda (`lote9-comissao-api.test.ts:317`) muda de
   asserção. **Vale daqui para frente; fechamentos passados NÃO são
   recalculados.**
2. **Vigência de comissão → ESCADA POR MÊS.** O sistema passa a recusar
   `vigenciaInicio` que não seja o primeiro dia de uma competência. Acaba a
   ambiguidade do meio do mês.
3. **DRE → renomear para "DRE de caixa" AGORA; o irmão por competência fica
   para épico separado.** Nesta rodada só o nome muda (tela + `replit.md`);
   o relatório por competência entra no backlog como E105.

## Decisão de design (respondida pelo dono em 2026-07-28)

Destrava o item 4 do E99 (E6/E8), que o cuidado (c) do épico manda decidir com
quem escolheu a paleta:

4. **Dinheiro é SERIF no degrau maior** — a fonte da marca continua nos valores
   grandes (contrato, totais), como já está hoje. Os três degraus da escala
   (`money-lg`/`money-md`/`money-sm`) usam **sempre `tabular-nums`**, que é o que
   faz coluna de número alinhar. A decisão fecha a divergência das quatro
   tipografias, mantendo a que a marca já tinha escolhido — não a que seria mais
   neutra.

## Estado dos épicos

| Épico | O que resolve | Esforço | Estado | Commit |
|---|---|---|---|---|
| E91 | Fronteira da loja: nenhum id entra sem prova (B1 🔴, B2 🔴, B4, B10, B12) | M | ✅ | `d67103d` · [notas](execucao/E91.md) |
| E92 | Consertos de uma linha (E1 🔴, E2 🔴, +15) | P | ✅ | `6cbd004` · [notas](execucao/E92.md) |
| E93 | O cliente para de brigar consigo mesmo (D1 🔴, +6) | M | ✅ | `1917f16` · [notas](execucao/E93.md) |
| E94 | Dinheiro que muda sem rastro (C4, B3, B6, B8, A2, F33) | M | ✅ | `ed62ac8` · [notas](execucao/E94.md) |
| E95 | A tela de orçamento para de calcular dinheiro (C1 🔴, +12) | G | ✅ | `c4d8609` · [notas](execucao/E95.md) |
| E96 | O erro do servidor chega ao campo (F17 🔴, B13, D6; D5 com veredito) | M | ✅ | `adfa90e` · [notas](execucao/E96.md) |
| E97 | Registro operacional: carimbo honesto e desfazer (F6 🔴, +6) | G | ✅ | `3656a8e` + `92094a8` · [notas](execucao/E97.md) |
| E98 | As telas se alcançam (E3 🔴, +9) | G | ✅ | parte 1 (E3, F1, F5, F9, F27, F29) em `22f14b6`; parte 2 (F12, F2, F3, F4) em `7920576`; parte 3 (F7, F10, F14, F40, F43) em `6cf3473`; parte 4 (F28) em `69511b4`; **E9 fechado nas 6 telas** no E99 partes 4 e 5 (`25a2904` + `fe6d9d4`); F13 em `d2d194d` · [notas](execucao/E98.md) · [F13](execucao/E98-f13.md) |
| E99 | A camada de UI que falta (D7, E6, E8, +6) | G | ✅ | parte 1 (A5, D7, E17, E18) em `c8ff967`; parte 2 (E12, E14, E21, D11) em `b093527`; parte 3 (D15, A9) em `365f56a` + `5c2d268`; parte 4 (E9 em 3 telas + Breadcrumb) em `25a2904`; parte 5 (E9 nas 6, D15 3ª grafia) em `fe6d9d4`; parte 6 (E6, E8) em `0aa07e6`; parte 7 (vazios; paginação recusada) em `faa07a3`; parte 8 (E10, a régua da destrutiva) em `b7c448c`; parte 9 (`<Table>` nas 5 telas) em `4605d27` · [notas](execucao/E99.md) |
| E100 | O portal responde as perguntas da noiva (F35–F39) | G | ✅ | parte 1 (F36, A11) em `5ae20fb`; parte 2 (F37) em `ad8ea38`; parte 3 (F35, F38; sino recusado com medida) em `f03ef0f`; parte 4 (F21, F39) em `6c7fa20` · [notas](execucao/E100.md) |
| E101 | A permissão diz o que a rota faz (B5, B7, B9, F42) | M | ✅ | B5+B7+B9 em `0e8b37e` + `7d0a0dd`; F42 em `d37fc72` · [notas](execucao/E101.md) · [F42](execucao/E101-f42.md) |
| E102 | Decisões de domínio financeiro (C5, C7, C8) | M | ✅ | `7dd9d09` · [notas](execucao/E102.md) |
| E103 | Roteiro do mês e da loja nova (F30–F34, F41) | M | ✅ | parte 1 (F30, F31, F41) em `210c533`; parte 2 (F32, servidor + migração) em `ea22940`; parte 3 (a tela do F32) em `ced6a29`; parte 4 (F34) em `8673784` · [notas](execucao/E103.md) · [F32](execucao/E103-f32.md) |
| E106 | Apagar uma loja deixa de ser um clique sem volta (S1 🔴) | P | ✅ | `d8e923c` · [notas](execucao/E106.md) |
| E107 | Nenhuma escrita sem prova, nenhum dinheiro sem rastro (S2, S4, S6, S12) | M | ✅ | `4623ec1` · [notas](execucao/E107.md) |
| E104 | Higiene de repo, build e bundle (A4, D8, +5) | M | 🟨 | A4 em `13944da`; A7/A12/A13/B15/C10 em `97bf55b`; **D8 em `0c41f7b`**; S19 em `5a3fca8`; parte 3 (A6, A8 + as 3 roteadas) em `4bc5a0b`; **parte 4 (desfaz a regressão do Canvas que a parte 3 criou) em `0910ab6`**; faltam **S15** (precisa de rede), **S18** e os três flakes · [notas](execucao/E104.md) |
| E110 | A cobrança de avaria não colide com a entrada (achados 1 🔴 e 8 da revisão) | P | ✅ | `<hash>` · [notas](execucao/E110.md) |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ feito e commitado · ⏭️ adiado (com motivo no diário)

**Antecipado para o dia 1:** item 1 do E104 (`.migration-backup/` fora do
versionamento) — envenena toda busca de quem executar os outros treze.

## Sobras — visto de passagem sem épico

Achado que a execução vê fora do próprio escopo não é consertado (disciplina de
commit), mas também não pode ficar preso na nota de um épico fechado: ninguém
abre a nota de um épico que já terminou. **Regra 12 do método:** a sobra entra
aqui no MESMO commit que a viu. A nota do épico continua sendo onde o raciocínio
mora; esta tabela é onde o trabalho é reclamado.

### Sem dono — precisam de decisão

| # | O quê | Peso | Origem |
|---|---|---|---|
| ~~S1~~ | ~~**`DELETE /admin/lojas/:lojaId` não tem guarda nenhuma** e cascateia a loja inteira.~~ **Fechada pelo E106** (`d8e923c`): virou 409 `LOJA_COM_HISTORICO`, com a régua contando também acervo e equipe, e o 404 cosmético consertado de brinde. Três correções ao diagnóstico nas notas — o gate existia, nenhuma tela chamava a rota, e a cascata é de **31 tabelas**, não quatro. **Nenhuma das seis trilhas a viu**: é a prova da crítica 2 do método, e ela só sobreviveu porque a regra 12 a tirou da nota do E91. | 🔴 | [E91](execucao/E91.md) vp2 · [E106](execucao/E106.md) |
| ~~S2~~ | **Fechada pelo E107** (`4623ec1`). **`POST /contratos` não valida `bloqueioVestidoIds` contra o lead**, só contra a loja: um contrato pode prender a reserva física de OUTRA noiva da mesma loja. Não é vazamento entre lojas — por isso ficou fora do E91 —, mas é da mesma família. | 🟠 | [E91](execucao/E91.md) vp4 |
| S3 | **Ato global de superadmin não deixa trilha.** `registrarAuditoria` exige `lojaId` (`audit_log.loja_id` é `notNull`) e `DELETE /admin/usuarios/:id` é global. Hoje sobra um `req.log.warn`. Registrar em cada loja da pessoa multiplica a mesma ação em N linhas; não registrar exige mudar o schema da trilha. Vale para S1 também. | 🟠 | [E91](execucao/E91.md) "ficou de fora" |
| ~~S4~~ | **Fechada pelo E107** (`4623ec1`). **`DELETE /contas-pagar/:id` não grava auditoria.** Apagar uma conta prevista é sumir com uma obrigação sem rastro — mesma classe do B3, um degrau abaixo (não move caixa realizado). | 🟡 | [E94](execucao/E94.md) vp1 |
| S5 | **A parcela PARCIAL sob `destinoPago: "manter"` é ambígua.** Ela vira CANCELADA, o que tira do horizonte o saldo que falta (certo) mas também tira do caixa realizado o que já entrou — e sob "manter" a loja está dizendo que ficou com o dinheiro. Representar "cancelada, mas o recebido permanece no caixa" exige decidir se o motor passa a olhar `valorRecebido` em vez do status: mudança de régua com alcance grande. Sob "estornar" não há ambiguidade. | decisão de produto | [E94](execucao/E94.md) vp2 |
| ~~S6~~ | **Fechada pelo E107** (`4623ec1`). **O estorno avulso de parcela tem a mesma leitura-fora-da-transação do B6**, mas o `SET` dele é absoluto (sempre PREVISTA/null): dois estornos simultâneos convergem. Pior caso é auditar duas vezes, não perder valor. | 🔵 | [E94](execucao/E94.md) vp3 |
| S7 | **`e2e/25-confirmar-presenca` colide consigo mesma entre execuções.** Ela cria o atendimento sempre na cabine fixa `e2e-cabine-1`, às `14:mm:ss` de HOJE, num banco que persiste — quanto mais vezes a suíte roda no mesmo dia, maior a chance de 409 `Registro duplicado ou conflito de dados`. Mesma classe que a sobra da rodada 5 resolveu noutro spec ("recurso próprio por execução"). Um vermelho desses se lê como regressão de dinheiro e não é. | 🟠 (infra de teste) | [E95](execucao/E95.md) |
| S8 | **`contratos.ts` mantém `cent`/`reais` locais**, idênticos aos do `financeiro-core`, com dezenas de call-sites — a mesma classe do `parseValor` quadruplicado que o E95 fechou, em volume maior. | 🟡 | [E95](execucao/E95.md) vp |
| S9 | **O teto de orçamento (E33) compara em reais.** `acimaDoTeto` faz `totais.liquido > teto` em float enquanto o excedente já saiu para centavos. Um centavo no limiar, sem consequência de dinheiro — mas é régua pela metade. | 🔵 | [E95](execucao/E95.md) vp |
| S10 | **A tela de contrato gera o carnê às cegas.** O `gerar-plano` de lá não tem prévia, e desde o E95 existe a função para mostrá-la — é o F16 aplicado à tela irmã. | 🟡 | [E95](execucao/E95.md) vp |
| S11 | **D5 não se faz como está escrito — veredito medido, item aberto.** Derivar os resolvers dos 12 formulários do `api-zod` esbarra em duas coisas: o schema gerado descreve o PAYLOAD e o formulário valida a SUPERFÍCIE DE ENTRADA (`entrada`/`numParcelas` não existem no corpo da API), e importar o barril de 261 KB / 539 schemas num bundle que já tem 1,1 MB sem code splitting troca dívida de duplicação por dívida de peso. A duplicação real medida é **um** enum de cada lado, não doze. Caminho barato: teste de paridade dos dois enums, ou reavaliar depois do code splitting do E104. | 🟠 | [E96](execucao/E96.md) |
| S15 | **O `vitest` do frontend só coleta testes dentro de `src/lib`.** Teste de componente não chega a ser executado — descoberto ao escrever o do `<Erro>` e ver "No test files found". Ampliar o `include` é infraestrutura de teste e mora no E104, que já vai ligar o typecheck dos testes do front. | 🟡 | [E99](execucao/E99.md) |
| S13 | **`useBlocker` do react-router não existe neste app.** Ele monta as rotas com `<BrowserRouter>` (`App.tsx:160`), e o `useBlocker` só funciona em data router (`createBrowserRouter` + `RouterProvider`) — fora dele, lança. Sem ele, o D14 protege só o fechar/recarregar a aba: clicar na sidebar com um formulário sujo continua descartando em silêncio. Migrar o roteador toca todas as rotas do app. | 🟡 | [E97](execucao/E97.md) |
| S14 | **As avarias antigas ficaram sem `parcela_id`.** Não há backfill possível: casar por texto ("Reparo de avaria — …") adivinharia, e duas avarias com a mesma descrição no mesmo contrato são indistinguíveis — que é justamente o caso do duplo clique. Elas seguem cobráveis de novo e removíveis; a guarda vale para o que nasce daqui. | 🔵 | [E97](execucao/E97.md) |
| S16 | **`leads.contrato_fechado_em` fica `null` em quem tem contrato, e um relatório conta por ela.** O carimbo só é gravado dentro do `if (etapaNova !== lead.etapa)` de `contratos.ts:357` (o carimbo em `:361`) — e `transicaoLeadValida` aceita pular no funil (`iPara > iDe`), então um lead levado de `NOVO` direto a `EM_PROVAS` fecha contrato sem que a etapa mude, e a coluna nunca é preenchida. O `comContrato` de `/leads/sazonalidade` (`leads.ts:397`) filtra por `contratoFechadoEm is not null`: aquela noiva não é contada como "já fechou" na curva que diz quando falta vestido. O conserto é gravar o carimbo mesmo quando a etapa não avança; o backfill pergunta à tabela de contratos, que é a fonte. | 🟡 | [E98](execucao/E98.md) parte 2 |
| S17 | **A dona da loja não consegue editar os dados da própria loja.** `endereco` e `telefone` de `lojas` só têm formulário no console de SUPERADMIN (`pages/admin/index.tsx:560`), que é rota top-level fora do `/loja/:lojaId` com gate próprio (`App.tsx:270`); `/configuracoes` tem backup, captação e privacidade, e nada da loja. **Corrigido pelo mapeamento da fase A:** são DUAS coisas, não três — o rodapé do portal (F35) e a linha "Endereço:" da confirmação (`msgConfirmacaoAtendimento`). O cabeçalho do PDF **não usa** nenhum dos dois: `contrato-pdf.ts` e `contrato-do-papel.ts` têm zero ocorrências de `endereco`/`telefone`, e o papel monta só `lojaNome`. E há um TERCEIRO dependente que ninguém tinha visto: `linkWhatsApp` devolve `null` para telefone fora de 10–13 dígitos, e o botão do portal simplesmente não é renderizado — telefone ERRADO degrada tão calado quanto telefone vazio. Trocar de telefone vira chamado para quem tem o console. | 🟠 | [E100](execucao/E100.md) parte 3 |
| S18 | **O seed do E2E elegia a loja por ordem física de linha, e isso QUEBROU.** Consertado dentro do E100 parte 3 porque a suíte não rodava. **A fase A mediu e o diagnóstico muda de ponta:** o risco da eleição JÁ NÃO EXISTE (o seed elege por `createdAt` desde `global-setup.ts:75`), e as quatro "Loja Teste" são 1,5% do passivo — são **613 usuários órfãos** (86% dos 714) e **723 sessões**. O mecanismo não é "fixture não limpa": `limparFixture` apaga usuário POR ID (`helpers.ts:114`) e 604 dos órfãos nascem da ROTA `POST /equipe`, cujo id nunca entra no `Fixture`. O custo hoje é medível: `GET /admin/usuarios` (`admin.ts:263`) não tem paginação e devolve as 714 linhas. Higiene de fixture em lugar COMPARTILHADO não é higiene: é uma bomba esperando a primeira escrita. Apagá-las continua sendo trabalho do E104. | 🟡 | [E100](execucao/E100.md) parte 3 |
| ~~S19~~ | **Fechada pelo E104/S19** (`5a3fca8`).  **Cinco lugares do `ui/` ainda têm CSS morto da migração Tailwind v3 → v4.** `max-h-[--var]` é sintaxe da v3; este repo está na **4.1.14**, onde a forma é `max-h-(--var)` — a antiga emite `max-height: --radix-…`, CSS inválido que o navegador descarta em silêncio. O F13 mediu um caso: `getComputedStyle(selectContent).maxHeight === "none"` com a variável valendo 378px ao lado, e um select de 389 opções renderizando **12.456px**. **Consertado só o `max-h` do `select.tsx`** (era o que a barra do F13 quebrou). **Medido na fase A: são 13 linhas em 6 arquivos, e o Tailwind instalado é 4.3.1** (não 4.1.14). O calendário está VISIVELMENTE ERRADO hoje, com prova no CSS entregue: `.h-\[--cell-size\]{height:--cell-size}` — nome de variável escrito como valor, que o navegador descarta —, com `--cell-size:2rem` definido ao lado e `min-width:8rem` compilando são. São CINCO classes (`h-`, `w-`, `min-w-`, `px-`, `size-`), e o `px-` de `calendar.tsx:69` era a reserva de espaço para as setas de mês. **O pior caso está FORA do `ui/`:** `combobox-noiva.tsx:171` passa `w-[--radix-popover-trigger-width]` a um popover cuja base é `w-72` — o `tailwind-merge` remove o `w-72` e sobra a classe morta, deixando a lista de noivas sem regra de largura nenhuma. Varrer `-\[--` em `src/` INTEIRO, não só no `ui/`. | 🟠 | [E98/F13](execucao/E98-f13.md) |
| S20 | **`lote17-agenda-concorrencia` é flake.** `expected [201, 500] to deeply equal [201, 409]` na suíte completa, verde sozinho e verde na execução seguinte — **a explicação que escrevi não fecha, e a fase A mostrou por quê:** se as duas serializarem, o pré-check da rota (`reservas.ts:316`) devolve 409 e o teste fica VERDE. O 500 só sai por dois caminhos (`erros.ts:159` ZodError de saída, ou `erros.ts:222` erro sem `code` de Postgres) — e **não dá para saber qual, porque o assert descarta `r.body`**. É a causa raiz do custo: o flake não se explica sozinho. Mesma família da **S7**: um vermelho desses se lê como regressão e custa uma investigação inteira (custou, no E107). | 🟠 (infra de teste) | [E107](execucao/E107.md) |
| ~~S12~~ | **Fechada pelo E107** (`4623ec1`). **`classificarErro` põe frase no campo que virou contrato de CÓDIGO.** Os 409 de Postgres saem como `{ error: "Registro duplicado ou conflito de dados" }` — português, mas texto livre onde o E96 estabeleceu que vai código. Nenhuma tela consegue traduzir aquilo para algo específico, e foi exatamente o que apareceu no flake do E2E (S7) vestido de erro de dinheiro. Última fonte de texto livre em `error`. | 🟡 | [E96](execucao/E96.md) vp |
| S21 | **O "UM pacote" do F34 não foi feito, e a medida diz por quê.** Os quatro exports do financeiro recortam por réguas DIFERENTES — o de parcelas por `vencimento`, o da folha por `data` de pagamento. Juntá-los num arquivo como estão produz um pacote em REGIME MISTO, que não fecha com o DRE nem com o fluxo. Fazer direito é derivá-lo de `GET /financeiro/fluxo`, que já entrega os dois lados com a régua única — é épico de exportação, não uma linha do F34. O que ficou único no F34 foi o CARIMBO. | 🟡 | [E103/F34](execucao/E103-f34.md) |
| S22 | **`e2e/24-dias-funcionamento` é flake.** Vermelho numa passada da suíte completa, verde sozinho e verde na execução seguinte. Mesma família da **S20** e da **S7**: um vermelho desses se lê como regressão e custa uma investigação. O spec mexe em `regra_disponibilidade.diasFuncionamento`, que é estado COMPARTILHADO da loja de seed — a suspeita é a mesma classe, e a saída também (configuração própria por execução). | 🟠 (infra de teste) | [E103/F34](execucao/E103-f34.md) |
| S23 | **O `mockup-sandbox` guarda 4 cópias divergentes de `ui/`, e uma delas nunca recebeu o conserto do S19.** O `calendar.tsx` de lá continua com as cinco classes `-[--cell-size]` que o Tailwind v4 descarta. Enquanto o pacote estiver fora do workspace (A6) ninguém as compila, então o custo hoje é ZERO — o risco é o dia em que ele voltar, ou em que alguém copiar dali para cá achando que é o primitivo vivo. Ou se apaga o pacote (`rm -rf`, e as 4 cópias vão junto), ou o `ui/` de lá vira um link para o de verdade. | 🔵 | [E104](execucao/E104.md) parte 3 |
| S26 | **Cobrado um reparo, o contrato não consegue mais gerar o carnê.** `contratos.ts:910` recusa `gerar-plano` por `contrato.parcelas.length > 0` — QUALQUER parcela, não "parcela de plano". Cobrar a avaria antes de montar o carnê deixa o contrato em `409 JA_TEM_PLANO` para sempre. Medido depois do E110: `numeroDaAvaria: 1`, `planoStatus: 409`. **O E110 não fechou isto de propósito, e a razão é de escopo:** consertar aquele guard sozinho MOVE a colisão, porque o plano insere `numero` 0..N e o 1 já está tomado pela avaria. Sair disso exige renumerar o carnê ou deslocar o plano — decisão sobre o que a noiva vê no boleto, não uma linha. A saída provável é o guard olhar só as parcelas SEM avaria vinculada (`avarias.parcela_id`), e o plano começar depois do maior número existente. | 🟠 | [E110](execucao/E110.md) |
| S27 | **61 `RESERVA_CASAMENTO` no banco de dev não têm `lead_id`** — uma reserva de casamento sem noiva. Descoberto ao desenhar a guarda do E110: `bloqueio_vestidos.lead_id` é nullable, e **61 das 63 avarias** vivem em bloqueio sem noiva, o que obrigou a guarda a "provar quando é provável" em vez de exigir sempre. Falta medir se a ROTA de criação permite `RESERVA_CASAMENTO` sem noiva ou se são resíduo de fixture de API (os helpers de teste aceitam `leadId` opcional) — a resposta muda o achado de "defeito de rota" para "mais um item da S18". Enquanto não se sabe, a guarda do E110 é mais fraca do que poderia ser. | 🟡 | [E110](execucao/E110.md) |
| S25 | **`e2e/48-avaria-vira-parcela` vaza a corrente do vestido a cada execução.** O `afterAll` (`e2e/48:67`) limpa parcelas → contrato → lead, e **não** limpa vestido, bloqueio nem avaria. Medido em duas execuções seguidas hoje: as avarias foram de **62 para 63**, e cada passada acrescenta um vestido `AVA-<stamp>` ao acervo — parte dos 533 vestidos e das 63 avarias do banco de dev sai daqui. Família da **S18**, e a mesma lição: higiene de fixture pela metade não é higiene. **Não é o caso da S7/S20:** não causa flake, porque cada execução usa `stamp` próprio — o custo é o acervo virar lixo e nenhuma tela de vestidos ser avaliável. | 🟡 (infra de teste) | [E104](execucao/E104.md) parte 4 |
| S24 | **A allowlist do `lote2` não cobra que cada perdão ainda tenha assunto** — foi assim que o `DELETE /ajustes/{ajusteId}` seguiu perdoado por tempo indeterminado depois de já estar no spec (`openapi.yaml:1767`). A guarda **não** foi escrita no E104 parte 3 porque o conjunto ficou VAZIO e ela não teria sujeito. Se a lista voltar a crescer, a guarda entra junto com a primeira entrada nova: toda entrada tem de estar no servidor **e** ausente do spec. | 🔵 | [E104](execucao/E104.md) parte 3 |

### Roteadas a um épico que ainda não rodou

O dono do épico **lê esta seção antes de começar** — foi a única forma de a
sugestão sair da nota de um épico alheio e chegar a ele.

| Épico | Item herdado | Origem |
|---|---|---|
| E96 | `selecionar-loja.tsx` faz `catch (error: any)` — resquício do padrão antigo, na tela que o E93 mexeu. | [E92](execucao/E92.md) vp |
| ~~E99~~ | ~~`/vestidos` renderiza 114 cards com foto de uma vez.~~ **Fechada com veredito medido na parte 7 (`faa07a3`):** o card já usa `variante: "thumb"` e `loading="lazy"`, então a metade cara — a rede — já estava resolvida; o navegador só baixa as miniaturas da viewport. Paginar de verdade mudaria o contrato de `listVestidos` e os quatro consumidores, **três dos quais precisam da lista completa**. | [E92](execucao/E92.md) vp · [E99](execucao/E99.md) parte 7 |
| ~~E99~~ | ~~`chart.tsx` e `calendar.tsx` com `toLocaleString` sem locale.~~ **Fechada na parte 3b do E99** (`5c2d268`): o `chart.tsx` morreu na poda e o `calendar.tsx:40` passou de `"default"` (a locale da INTERFACE do navegador) para `"pt-BR"`. | [E92](execucao/E92.md) vp · [E99](execucao/E99.md) |
| E104 | `index.html` ainda tem a boilerplate do Replit em inglês nas três metas `description`/`og:`/`twitter:` — *"built on Replit. Update this description…"*. É o texto que aparece quando alguém compartilha o link do sistema. Uma linha. | [E92](execucao/E92.md) vp |
| E104 | `artifacts/mockup-sandbox/index.html:6` tem `lang="en"` — e o pacote inteiro é candidato à poda, se for descartável. | [E92](execucao/E92.md) vp |
| E104 | **As "Lojas Teste" do E2E vivem no banco de dev** (`Loja Teste 214cda2c`, `b423b8db`, `3b9323fb`…). As fixtures da suíte não estão sendo limpas, ou não todas. Higiene de teste. | [E92](execucao/E92.md) vp |
| E104 | `listPagamentos` ainda é pedido sem janela em telas que mostram um mês — nenhuma apareceu nos quatro casos do D2, mas vale a varredura. | [E93](execucao/E93.md) vp |
| E104 | **O `.migration-backup/` saiu do versionamento e continua no DISCO.** O A4 resolveu o repo, não a busca: `find`/`grep` no workspace ainda devolvem dois resultados para cada arquivo vivo (aconteceu duas vezes na sessão 4, procurando `openapi.yaml` e `schema.ts`). Apagar é uma linha; o que falta é a decisão de apagar. | [E98](execucao/E98.md) parte 2 vp2 |

### Decisão consciente — não são sobras

Registradas para que ninguém as "conserte" numa rodada futura sem saber o porquê
(é o movimento "o que está BEM", aplicado ao que a execução decidiu):

- **O `persist` do zustand não escuta o evento `storage`** — as abas não se
  sincronizam sozinhas, de propósito: o veredicto `seguir-a-sessao` resolve a
  divergência com um redirect explícito e legível, em vez de uma sincronização
  implícita que reintroduziria a escrita cruzada que o E93 acabou de remover.
- **`recorrencias.usuario_id` continua `ON DELETE CASCADE`** — é a única FK de
  usuário que sobrou em cascade, e de propósito: é NULLABLE e não é histórico, é
  a CONFIGURAÇÃO do salário. A conta a pagar já gerada sobrevive. Anotado
  também no rodapé do DDL do E91.

## Depois da execução

Uma **rodada 7** de review sobre o código já corrigido, com foco no que a
rodada 6 não podia ver (o sistema mudou debaixo dela) e em ideias novas de
produto. Sai em `docs/revisao/2026-07-2X-rodada-7/`.

## Diário de sessões

### Sessão 1 — 2026-07-25

- Code review completo em 7 trilhas paralelas de diagnóstico (A–G): 121
  achados, 0 linha de código alterada. Commit `f8aa4b3`.
- Três decisões de produto do E102 respondidas pelo dono (acima).
- Branch `rodada-6/execucao` criada a partir de `01729db`.
- **E91 executado** (notas completas em `execucao/E91.md`). A frase que o épico
  inteiro persegue: `usuarios` é tabela GLOBAL e a FK do banco só garante que um
  id EXISTE, não a que loja pertence. `PATCH`/`DELETE /equipe/:usuarioId` passam
  a provar o vínculo `usuarios_lojas` ANTES de escrever (404 sem ele) — antes o
  `UPDATE` ia direto na tabela global pelo id do path e a conferência só
  acontecia depois do commit, então um admin da loja A inativava a dona da loja
  B por curl. As quatro rotas do B4 (contrato/orçamento/conta a pagar/salário
  recorrente) adotaram o `lib/escopo-loja.ts` que já existia e não era usado,
  com 422 `REFERENCIA_INVALIDA`. As cinco FKs de vendedora saíram de CASCADE
  para RESTRICT no DDL `docs/migracoes/2026-07-25-e91-fronteira-loja.sql`
  (aplicado no banco de dev), junto com os oito índices por `loja_id` do B10 —
  uma migração só, porque é DDL sobre as mesmas tabelas. `DELETE
  /admin/usuarios/:id` deixou de apagar contratos e parcelas PAGAS em silêncio e
  responde 409 `USUARIO_COM_HISTORICO` ensinando a inativar; resetar senha ou
  inativar pelo console agora derruba as sessões vivas na mesma transação (B12).
  Treze casos novos em `e91-fronteira-loja-api.test.ts`, todos vermelhos antes.
  Duas mudanças de infraestrutura de teste vieram junto e estão explicadas nas
  notas: a ORDEM de `limparFixture` (contratos → loja → usuários) e o superadmin
  da fixture passando a ter vínculo com a loja — os testes já o tratavam como
  gente da loja (fecha contrato, tem escada de comissão), o E91 só passou a
  cobrar a prova disso. Nenhuma asserção de teste pré-existente mudou.
- **E92 executado** (notas completas em `execucao/E92.md`). Dezessete achados,
  quase todos de uma linha, e uma descoberta que corrige o diagnóstico de um dos
  🔴. **E2:** onze pares de cor saíram da reprovação da WCAG AA sem que o rosa da
  marca mudasse um pixel — `--primary-foreground` deixou de ser branco (2,78 →
  4,58), `--muted-foreground` foi de 45% para 40% (4,16 → 5,03), e o vermelho
  destrutivo escureceu no claro (3,71 → 6,13) e clareou no escuro (2,93 → 5,84),
  que é o mesmo tratamento que `--positivo` já tinha. `lib/aparencia.test.ts` lê
  o `index.css` de verdade e roda a fórmula da WCAG sobre 16 pares, mais um caso
  que reproduz os números que a trilha E mediu no Chrome — a régua não deriva em
  silêncio, e um teste afirma que `--primary` claro continua `350 25% 65%`.
  **E1: o `lang` não era a causa.** Medi em dois builds de Chromium: o navegador
  desenha `<input type=date|month|time>` a partir da locale da INTERFACE, não do
  atributo `lang` — quatro `<div lang=...>` diferentes na mesma página renderizam
  idênticos, e o mesmo binário com `--lang=pt-BR` renderiza `31/07/2026`,
  "julho de 2026" e 24h. A trilha E navegou com o Chromium em inglês; a
  vendedora com o Chrome em português já via a data certa. A troca fica (é WCAG
  3.1.1 nível A, e o leitor de tela lia "noiva" com fonemas ingleses), mas a
  data invertida num filtro de dinheiro segue possível para quem opera em
  inglês — anotado para o E98/E99. O resto: `brl()` virou a régua única do
  dinheiro (105 chamadas perderam o `R$` escrito à mão, com espaço RÍGIDO, e o
  dashboard ficou certo de graça); `mensagemApi` subiu para `lib/erro-api.ts`
  com régua por faixa de status e a perna do `err.message` morta — o "HTTP 404
  Not Found" saiu do toast de login e de 20 telas; `rotuloCompetencia()`
  estava QUADRUPLICADA e virou uma, em minúscula, com `capitalizar()` no lugar
  dos nove `className="capitalize"` que produziam "Julho De 2026 — O Que Seria
  Pago"; alvos de toque de 44px no celular (Atendimentos 89 → 60, Equipe 8 →
  3); `Badge` virou `<span>` e o erro de HTML inválido sumiu do console. **Vi as
  telas**: 9 rotas em claro, escuro e 390px, com o app de pé e um proxy próprio
  na frente do Vite (o `E2E_API_PROXY` devolve 404 em POST, como a trilha E já
  havia registrado). Foi a tela que pegou o único bug real do épico: o C11
  escrito como `somaCentavos(…, (l) => centavos(l.valorTotal))` passava no
  typecheck e mostrava R$ 617.106,00 onde deviam ser R$ 6.171,06 — `somaCentavos`
  já converte por dentro. Um par de cor ficou aberto de propósito
  (`text-primary` sobre fundo claro, 2,78): fechá-lo exige dividir o token e
  decidir 61 call-sites, que é a decisão do E8 e mora no E99.

### Sessão 2 — 2026-07-25

- **E93 executado** (notas completas em `execucao/E93.md`). O épico anterior
  consertava coisas que uma asserção pega; o D1 não. O defeito era um **loop de
  render** — aba a 100% de CPU, tela em branco — e para isso não existe valor
  errado a comparar. Duas consequências de método. Primeira: a decisão saiu dos
  dois `useEffect` e virou **função pura** (`lib/loja-ativa.ts`), quatro
  entradas, quatro veredictos, legível sem simular o React na cabeça. Segunda:
  a prova de que o loop morreu é um **navegador**. O app não tem infra de
  render (sem jsdom, sem testing-library), mas tem 49 specs de Playwright — o
  backlog pedia um teste de render, entreguei o equivalente honesto um nível
  acima em `e2e/50-loja-da-url.spec.ts`, e ele foi **vermelho antes**: revertendo
  só `use-auth.tsx` e `app-layout.tsx`, os três casos falham e o console cospe
  literalmente `Maximum update depth exceeded` — o mesmo erro que a trilha D
  previu por leitura sem nunca ter reproduzido. **A resposta do "quem ganha" era
  obrigatória, não preferência:** `requireSessaoComLoja` responde 403 a toda
  request cujo `:lojaId` difira do da SESSÃO, então um bookmark para B com a
  sessão em A só funciona se alguém disser ao servidor "agora é B" — a URL
  ganha, e a divergência virou AÇÃO (`selecionarLoja`). Duas armadilhas só
  apareceram no navegador e estão comentadas no `app-layout.tsx` porque eu as
  errei primeiro: sem o veredicto `seguir-a-sessao`, duas abas trocariam o loop
  de render por um loop de REDE (pior: invisível no profiler e escrevendo na
  sessão a cada volta); e a marca de "já reivindiquei" precisa valer `null`
  enquanto a troca está EM VOO, senão a tela redireciona para a loja antiga no
  meio da própria troca. **A ordem D9 → D3 era o cuidado central e se provou
  sozinha:** `receber.tsx` invalidava só as parcelas, e o dano era invisível
  porque o `staleTime: 0` refazia tudo na navegação seguinte — o bug estava
  mascarado pela ineficiência que o D3 vinha remover, e na ordem trocada duas
  melhorias corretas produziriam um defeito que nenhuma das duas tinha (o
  alerta de caixa anunciando o furo na data antiga depois de receber R$ 5.000).
  Mesmo par no D13: `staleTime` não desliga `refetchOnWindowFocus`, e a tela do
  effect era justamente onde a pessoa fica parada digitando. O D2 recortou as
  janelas (`de`/`ate`/`status` em `listContasPagar`, novo no `openapi.yaml`) e
  trouxe uma coisa que o backlog não pedia: `conta.pagamento`, porque recortar
  `listPagamentos` pela janela de vencimentos NÃO era opção — a saída que quita
  uma conta de julho pode ter data de agosto, e perdê-la faria o botão de
  estorno sumir em silêncio numa tela de dinheiro. Na conciliação, `de`/`ate`
  seria o parâmetro errado (recorta por vencimento; a tela compara por
  `recebidoEm`, e apagaria justamente as pagas em atraso) — o certo é
  `recebidasDe`. Fixture E2E ganhou a segunda loja, sem a qual o cenário do D1
  é indizível.
- **Três regressões do E92 achadas ao rodar a suíte E2E completa** — que o E92
  não rodou, ele conferiu telas à mão. Nenhuma de comportamento, todas de
  expectativa que envelheceu junto com a cópia: `brl()` usa espaço RÍGIDO
  (U+00A0) e o Playwright normaliza espaço em seletor de **string** mas não em
  **regex** (por isso só `35-recebimento-parcial` quebrou, e não os outros dois
  specs com `R$`); o toast de login virou "Não consegui entrar"; e
  `rotuloCompetencia()` foi para minúscula com `capitalizar()` no call-site,
  contra um `toContainText` case-sensitive. **Regra nova: épico que mexe em
  cópia ou formatação compartilhada roda o E2E completo antes do commit** — "vi
  as telas" é régua forte para cor e alvo de toque, mas não cobre asserção de
  texto em 49 specs.
- Correção de rota registrada: os dois testes marcados "FALHA ESPERADA no main"
  em `02-selecionar-loja.spec.ts` passam — e passam **sem** o D1, conferido
  revertendo-o. Os consertos vieram da Onda 0 e do `fix/auditoria`; os
  comentários envelheceram e mandariam o próximo executor caçar bug morto.
- **E94 executado** (notas completas em `execucao/E94.md`). Quatro subagentes
  mapearam o terreno em paralelo antes de uma linha de código, e o mapa
  **contradisse o backlog em cinco pontos** — três deles mudavam o conserto: o
  C4 não usa `inArray` nem está na linha citada; o `financeiro-core` não tinha
  listas de status para "exportar", só predicados que rodam DEPOIS do SELECT; o
  B6 mora em `contratos.ts` e a rota TEM transação (o problema é a leitura fora
  dela); e o `origemComissaoFechamentoId` não é FK — quem zera é a FK inversa.
  Mais um achado que o diagnóstico não viu: `dashboard.ts:83` tem o MESMO bug do
  C4. **A régua estava escrita à mão em quatro lugares, duas certas e duas
  erradas** — que é o resultado esperado de quatro cópias, e por isso o conserto
  não podia ser trocar `eq` por `inArray` nas duas erradas: as listas saíram
  para o core e os predicados passaram a derivar delas. **A "primeira ação" do
  backlog partia de premissa errada:** ela mandava ver o caso PARCIAL falhar no
  teste de unidade, e ele passou de primeira — o motor sempre esteve certo, ele
  só nunca recebia a linha. Cada conserto foi medido vermelho antes pelo teste
  certo: C4 `expected 1000 to be 5000`, B6 `expected 400 to be 600` (R$ 200
  perdidos numa corrida de dois recebimentos), B8 `expected 204 to be 409`.
  **Errei um teste e o código estava certo:** meu primeiro assert do B6 foi
  "exatamente um vence", e ele falhou com três requests — quem lê o estado já
  commitado e soma em cima venceu legitimamente, e proibir isso seria testar o
  escalonador do Postgres. O invariante que ficou é "o gravado é a soma exata do
  que a API confirmou", que vale para N requests. Dentro do B3 apareceu a mesma
  omissão do C4 uma rota adiante: o cancelamento só tocava PREVISTA e PAGA, e a
  parcela PARCIAL sobrevivia cobrável num contrato que não existe mais, com o
  dinheiro dela nunca voltando no estorno.
- **O E2E pegou o que 625 testes de API e o typecheck não pegavam**, e desta vez
  não era expectativa velha: unificar as duas portas de pagar (A2) deixou a
  trilha uniforme e **menos legível** — "R$ 500,00 · Aluguel" virou "R$ 500,00 ·
  1 conta", porque o `resumoDetalhe` da tela lia `detalhe.descricao` e só sabia
  CONTAR o novo `detalhe.contas`. É a segunda vez na rodada que a suíte completa
  salva o commit, e ela **estreita a regra escrita no E93**: aqui não houve
  mudança de cópia nenhuma. A régua mais honesta é **mudou o que a trilha grava,
  ou o formato do que alguma tela lê, roda o E2E completo**.
- **Uma promessa do backlog não tinha lastro no dado (F33).** O item afirmava
  que o aviso "junho já foi enviado à contabilidade" só precisava usar
  `enviadoContabilidadeEm`. Essa coluna é de `pagamentos` — as SAÍDAS, a folha —
  e não há equivalente para entradas nem endpoint que responda pela competência
  delas. Entregue a metade que os dados sustentam (o diálogo passou a mostrar o
  que será desfeito, item a item, com datas e valores); a outra metade fica
  aberta como decisão de produto com custo de migração, não como "falta usar".
### Sessão 3 — 2026-07-27

- **Auditoria do sistema de anotação** antes de executar (commit `2c19a55`):
  quatro costuras entre camadas que já existiam. A regra do E2E subiu para o
  METODO (regra 11) junto com a crítica 8 que a prova; o achado do
  `E2E_API_PROXY` foi para o `replit.md`, como a regra 8 mandava desde que foi
  escrita a partir dele; esta tabela de **Sobras** nasceu (crítica 9 + regra 12),
  porque o `DELETE /admin/lojas` — o achado mais grave da rodada — estava escrito
  em três lugares e era trabalho em nenhum; e o repo ganhou `CLAUDE.md` na raiz,
  que é o que faz o método ser lido no começo de toda sessão em vez de por acaso.
- **E95 executado** (notas completas em `execucao/E95.md`). Duas decisões de
  produto foram tomadas antes do código, como a regra 5 manda: **carnê mensal
  por dia fixo, com `primeiroVencimento` sempre significando a parcela 1**, e
  **validade padrão de 30 dias**. O mapeamento prévio contradisse o backlog em
  quatro pontos — o pior deles: a semântica do servidor não era "a entrada", era
  CONDICIONAL (`offsetInicial = entrada > 0 ? 1 : 0`), o mesmo campo mudando de
  sentido conforme outro campo. E o comentário do `liquidoEmCentavos` afirmava,
  por escrito, o invariante que a função quebrava — *"calculado EXATAMENTE como
  o frontend"* —, o que é pior que comentário nenhum: desliga a suspeita de quem
  lê. Por isso ela saiu do arquivo em vez de o comentário ser corrigido.
- **Errei um mapeamento e o compilador me corrigiu.** Afirmei — inclusive ao
  dono, por escrito, como argumento para a decisão — que o `gerar-plano` não
  tinha um único consumidor no frontend. Tem: `contratos/[id].tsx` chama o hook
  gerado `useGerarPlanoParcelas`. Procurei pela string da ROTA, e num repo com
  codegen o frontend não fala esse vocabulário — ele fala o do símbolo gerado. A
  decisão de mérito não mudou, mas o alcance dela sim: o campo "A cada (dias)"
  daquela tela saiu, e isso precisou ser comunicado. **Regra candidata para a R7:
  "quem chama X" se prova pelo símbolo ou pelo compilador, nunca pela URL.**
- **O E2E completo passou (131), e a única falha da primeira execução não era do
  épico** — `25-confirmar-presenca` colide consigo mesma entre execuções (S7). O
  método pede a suíte completa antes do commit justamente para separar isso; o
  custo é que um flake de infraestrutura chega vestido de regressão de dinheiro.
- Um achado fora de qualquer trilha, encontrado ao rodar a suíte: **o typecheck
  do `api-server` estava VERMELHO no `main` desde o E94** — `quitarContas`
  declarava `data: string` enquanto os dois call-sites passam `Date` e a coluna é
  `Date`. As notas do E94 afirmam typecheck limpo. Consertado aqui (uma linha),
  porque não dá para medir o E95 sobre uma base vermelha.

- **E96 executado** (notas completas em `execucao/E96.md`). O 400 de validação
  parou de falar inglês: `erroDeValidacao` devolve `{error: "CORPO_INVALIDO",
  campos: [{campo, motivo}]}` nas **95** rotas, e o `campo` é o caminho do Zod
  (`parcelas.0.valorPrevisto`) — que é exatamente o formato de `path` do
  react-hook-form, e por isso serve de endereço no cliente sem tradução. Do lado
  da tela, `aplicarErroDoServidor` marca o campo e só cai no toast quando não há
  campo a marcar.
- **Três correções ao diagnóstico, e as três são sobre varredura declarada como
  completa.** (1) Os "95 lugares" não são 95 `parsed.error.message`: são 72
  `parsed`, 21 `params`, 1 `query` e 1 `q` — quem procurasse pelo nome que o
  backlog cita deixaria 23 rotas vazando, justamente as de id na URL. (2) O
  arquivo que o backlog aponta como REFERÊNCIA (`contratos/[id].tsx`) era o
  único desviante: tinha uma cópia local do `mensagemApi` com a perna que o E92
  matou, enquanto cinco outras telas já usavam a função compartilhada. (3) A
  tela de orçamento tinha NOVE `catch` com `err.message`, e as notas do E92
  afirmam que ele saiu "de 20 telas" — esta ficou inteira de fora.
- **A varredura virou teste**, e é o item de melhor relação valor/custo do
  épico: um unitário lê os fontes e reprova `error: <x>.error.message`. Sem ele
  a regressão volta na primeira rota nova, porque o sintoma é uma tela feia e
  não um vermelho.
- **Um item do backlog foi medido e recusado com evidência (D5 → sobra S11).**
  Derivar os resolvers do `api-zod` esbarra em duas coisas que o plano não viu:
  o schema gerado descreve o PAYLOAD e o formulário valida a SUPERFÍCIE DE
  ENTRADA — `entrada` e `numParcelas` nem existem no corpo da API —, e o barril
  gerado tem 261 KB e 539 schemas para um bundle que já é 1,1 MB num chunk só.
  A duplicação real medida é **um** enum de cada lado, não doze. O cuidado (a)
  autorizava exatamente isto: medir, registrar o veredito e parar.
- **E97 executado pela METADE, e o rastreador diz isso** (notas em
  `execucao/E97.md`). Fechados o F6 🔴 e o F26; abertos F11, F15, F22, F23, F24,
  F25 e D14. O épico é G e cada perna toca uma tela diferente — parar num ponto
  verificado e commitado vale mais que oito pernas pela metade, e a nota lista o
  que já foi apurado sobre cada uma das que faltam.
- **O cuidado (a) do backlog estava errado, e isso mudou a migração.** Ele diz
  que os `confirmadoEm` antigos são ambíguos por construção e que "não dá para
  separá-los retroativamente". Dá: toda confirmação pelo portal grava
  `audit_log.acao = 'PROVA_CONFIRMADA'` com o id do atendimento, e o clique da
  loja nunca gravou nada. O backfill perguntou à trilha em vez de chutar — 16
  linhas separadas por evidência. A premissa virou teste, para que a migração de
  quem vier depois não pare de valer em silêncio.
- **A coluna já tinha dono antes do E85.** O comentário do schema dizia "quando a
  recepção confirmou a presença por WhatsApp (E39)" e o `summary` do endpoint
  dizia "parar de repetir quem já foi CONTATADO". A rota sempre descreveu
  contato; só escrevia confirmação. O E85 sobrepôs o segundo sentido sem
  renomear nada — e é o segundo que merece o nome, porque é o único que
  corresponde a alguém ter respondido.
- **E97 fechado na parte 2**, com os seis itens restantes. Três coisas que a
  execução ensinou e o plano não previa:
  1. **A medição do F15 deu o resultado OPOSTO ao que o backlog supunha** — e o
     backlog merece crédito por ter mandado medir. O `PATCH` nunca limpou
     `atendidoEm`/`desfecho`: um atendimento AGENDADO guardava "começou às 14h"
     e um desfecho de uma vida passada, para sempre. Era dado fantasma, não
     confirmação faltando. Só depois de consertar isso é que inverter a
     confirmação da tela virou verdade — antes o aviso não teria o que prometer.
  2. **A ordem dentro da transação do F22 não era indiferente.** Marcar a avaria
     antes de inserir a parcela parece mais seguro e não roda: `parcela_id` é FK.
     A parcela vem primeiro, e quem perde a corrida derruba a transação inteira —
     a parcela dela some junto, que é a segunda cobrança que o épico impede.
  3. **O D14 não é implementável como escrito, e o E2E foi quem disse.** O item
     pedia `useConfirmarSaida` "sobre o `useBlocker` do react-router 7"; o app
     monta as rotas com `<BrowserRouter>`, e `useBlocker` só existe em data
     router. Typecheck limpo, 673 testes de API verdes, 223 de frontend verdes —
     e quatro specs E2E caíram porque as telas não renderizavam. **Terceira vez
     nesta rodada que a suíte completa pega o que nada mais pega.** Entregue o
     `beforeunload` (fechar/recarregar a aba), que funciona sem data router; a
     navegação interna virou sobra com o motivo.
- **E98 parte 1** (notas em `execucao/E98.md`): o núcleo que o cuidado (a) do
  próprio épico manda fazer primeiro. O **E3 🔴** é a terceira vez na rodada em
  que o dado já vinha na resposta e a tela não o lia — o `openapi.yaml` chega a
  documentar por que o `contrato.lead` existe ("para a cobrança juntar por
  aqui"), e `/financeiro/receber` mostrava quatro linhas idênticas com o nome da
  noiva só no CSV. Vale como sinal de onde procurar da próxima vez: antes de
  criar campo, conferir se ele já chega.
- **O F29 era mentira sobre dinheiro, não falta de link.** "Atrasadas" rodava
  sobre a janela do mês: quem clicava lia os atrasos de julho achando que lia a
  inadimplência inteira. Atraso não tem janela por definição, e a régua certa já
  existia em `/cobranca`. Os campos de data continuam na tela e deixam de valer
  nesse filtro — a tela diz isso, porque esconder seria mais limpo e pior.
- **O F9 mostrou um gate mais restritivo que a própria tela**: "Mensagens de
  hoje" é construída por partes, com os três blocos gateados separadamente lá
  dentro, mas o item de menu exigia `agenda` — quem cuida do financeiro nunca
  alcançava a tela que lista as noivas em atraso, embora o bloco dela fosse
  visível para essa pessoa.
- **E99 parte 1** (notas em `execucao/E99.md`): a poda, os componentes de estado
  e o D7. Três coisas para quem seguir:
  1. **A poda não paga em bytes.** 24 arquivos e 3.316 linhas apagados, 16
     dependências fora do `package.json` — e o bundle ficou **idêntico**
     (1.244,99 kB antes e depois, medido no mesmo código com `git stash`). Já
     eram tree-shaken. A poda vale por linhas para ler e por superfície de
     supply chain, não por peso: **quem for fazer o code splitting do E104
     precisa saber que este épico não adiantou nada daquele trabalho.**
  2. **O componente COMPARTILHADO de erro ainda tinha a perna que o E92 matou.**
     `EstadoErro` fazia `erro.message` — o caminho do "HTTP 404 Not Found" —
     escondido no lugar mais caro possível: as nove telas que o usavam
     continuavam mostrando texto de protocolo, embora o `mensagemApi` já
     estivesse certo. Consolidar achou o que a varredura do E92 não achou.
  3. **Cinco primitivos ficaram de fora da poda de propósito**: `avatar`,
     `breadcrumb`, `empty`, `pagination` e `progress` são os que o item 6 do
     MESMO épico manda adotar. O backlog não notou que os dois itens se
     contradiziam.
- **E100 parte 1** (notas em `execucao/E100.md`): a primeira ação do épico —
  as duas linhas de saldo no portal — e o teste do `lib/portal.ts`. Dois pontos:
  1. **A soma parecia trivial e tinha duas decisões dentro.** A parcela PARCIAL
     entra pelo SALDO e não pelo previsto: somar o cheio cobraria de novo, **na
     tela dela**, o dinheiro que ela já pagou — a pior forma possível de errar
     esse número. E sem contrato o resumo é `null`, porque "falta pagar R$ 0,00"
     afirmaria algo sobre um acordo que não existe (o zero é ambíguo entre
     "quitado" e "não há").
  2. **O `lib/portal.ts` decide se a mensagem sai com link vivo ou morto e não
     tinha teste** — embora o cabeçalho do próprio arquivo diga, desde o E84,
     que "link morto na mensagem é pior que nenhum". Nove casos agora, incluindo
     a fronteira do instante.
- **E101 parte 1** (notas em `execucao/E101.md`): o B5 fechado, e o épico para
  aí porque **o que resta são decisões, não trabalho** — o próprio backlog diz
  "decidir o que o dashboard é" e "decidir e ESCREVER onde mora o recebimento".
  As duas perguntas estão formuladas nas notas, com o efeito de cada resposta.
  1. **A inversão do default não é implementável, e agora sabemos por quê.**
     `POST /orcamentos/:id/itens` (cria um item) e `POST /orcamentos/:id/aprovar`
     (edita o orçamento) têm exatamente a mesma forma — nenhuma regra de caminho
     os separa, só o nome do verbo. A preferência do épico pela lista explícita
     estava certa, e passou de aceita a justificada.
  2. **A varredura pegou duas coisas escrevendo**: meu primeiro detector tratava
     `:lojaId` como id de recurso e acusou 14 rotas de coleção legítimas; e
     achou uma rota real fora da lista do backlog —
     `POST /equipe/convites/:id/reenviar`, que valia `criar`.
  3. Uma falha de suíte na primeira execução (`lote17-agenda-concorrencia`) não
     era minha: passou isolada e na re-execução completa. Teste de corrida sob
     carga, mesma classe do S7 agora no lado da API.
- **Duas decisões de produto respondidas pelo dono em 2026-07-27**, e valem como
  regra do sistema daqui para frente:
  1. **O dashboard é o painel de TODO MUNDO.** Os números de dinheiro só entram
     para quem tem `financeiro: ver`; ninguém perde a home. A alternativa
     (gate na rota inteira) faria a home de um perfil inteiro virar outra tela.
  2. **Receber pertence a quem vende.** As parcelas ficam sob `leads`, e a razão
     está escrita no código: a noiva paga na mão de quem a atendeu, e exigir
     alguém do financeiro disponível trocaria risco de permissão por atrito
     diário — com o dinheiro entrando no sistema atrasado, que é a forma mais
     cara de estar errado sobre caixa. O que apertou foi a AÇÃO (`editar`), não
     o módulo.
- **E101 parte 2**: as duas implementadas. Mais duas correções ao backlog, as
  duas achadas rodando: o contrato **não** marcava os campos de dinheiro do
  dashboard como opcionais (eram `required`, e o `.parse` reprovou o conserto);
  e o superadmin passa por fora do `podeNoModulo` — o `requireModulo` o libera
  antes de consultar permissão —, então a régua da rota tinha de repetir isso,
  senão o console da rede via um dashboard sem dinheiro.
- **E102 fechado** (notas em `execucao/E102.md`) — o único épico da rodada cuja
  primeira ação não era código: as três decisões foram respondidas no dia 1, e
  isto é a implementação delas.
  1. **O estorno deixou de ser cobrado duas e três vezes.** `min(bruto,
     pendente)`, com o resto carregando. Precisou de coluna nova, e o motivo é
     que a alternativa do backlog (reconciliação por contrato) NÃO implementa a
     decisão: absorção parcial não cabe em granularidade de contrato — abater
     metade de um cancelamento de R$ 20.000 não é "meio contrato reconciliado".
     O pendente virou uma conta DERIVADA, e por isso reabrir um fechamento
     parcial devolve o valor sem uma linha de código.
  2. **O caso do meio do mês nunca tinha sido exercitado** (C7) — o único teste
     usava virada de mês, que é por que ninguém tinha visto a escada criada dia
     20 reprecificar os 19 dias anteriores. E minha primeira régua comparava o
     INSTANTE: reprovou cinco testes existentes, porque `dia("2020-01-01")`
     ancora ao meio-dia e `limitesCompetencia` à meia-noite. Mesmo primeiro dia.
  3. **No C8 a tela já estava honesta** ("Resultado do mês" + badge "Regime de
     caixa"); quem mentia era o `replit.md`. Ele ganhou a entrada que faltava:
     `contas_pagar.competencia` existe, está preenchida e NÃO entra na conta —
     nenhuma comissão aparece no DRE da competência que a gerou. O nome era o
     sintoma; a informação que faltava era essa.
- **E103 parte 1** (notas em `execucao/E103.md`): o F30, o F31 e a regra do F41.
  O achado do épico é sobre a disciplina do silêncio, que esta rodada vinha
  aplicando bem e aplicou longe demais. O `AlertaCaixa` — o aviso mais grave do
  sistema — **não aparecia quando não havia saldo conferido**: sem âncora a curva
  não tem nível, `ancorado` era `false` e o componente devolvia `null`. Um alarme
  que se desliga sozinho quando a rotina diária não é feita, e não diz que está
  desligado. O docstring defendia o silêncio com um argumento certo ("um bloco
  verde permanente de 'tudo certo' vira paisagem em uma semana") e o estendia a um
  caso onde ele não vale: **a disciplina do silêncio é certa para "está tudo bem"
  e errada para "não sei"**. O F31 é da mesma família de alcance: Folha do mês, a
  tela que fecha o mês, só era alcançável por um botão secundário dentro de
  "Contas a pagar", e o link dizia "Folha do mês" enquanto o `<h1>` dizia
  "Recorrências do mês" — quem procurava "folha" não achava, e quem achava lia
  outro nome. Um nome só, na sidebar, e três specs E2E adotaram o nome novo. No
  F41 a regra saiu pura e testada antes da tela (`lib/primeiros-passos.ts`, seis
  casos), com duas decisões que o teste afirma: a ordem é a de **execução**, não a
  de importância (atributos antes de vestidos, porque montar vestido sem atributo
  obriga a voltar), e o item da escada de comissão precisa explicar o silêncio que
  a ausência dela causa — é o único cuja falta produz uma tela que não aparece,
  sem erro, e a pessoa conclui que o sistema não tem comissão. `lojaConfigurada()`
  existe para o cartão **sumir**, pela mesma razão do `AlertaCaixa`.
- **E104 parte 1** (notas em `execucao/E104.md`), em dois commits, com o A4
  isolado como o cuidado (a) pede: 1.611 arquivos e 22 MB de `.migration-backup/`
  fora do versionamento, com nomes idênticos aos dos arquivos vivos — cinco
  épicos desta rodada carregaram um `grep -v .migration-backup` que não deveria
  existir. Lá dentro estava a peça mais interessante do épico: a **memória do
  agente da migração**, versionada, afirmando que *"the live app is the Next.js
  app in root `app/`"* — o oposto do que vale hoje. Memória que contradiz o repo,
  versionada dentro dele, é pior que memória nenhuma. **O fiscal estava de olhos
  fechados onde era fiscal** (A7): o `tsconfig` do front excluía `**/*.test.ts`;
  removida a exclusão, **nada quebrou** — os 249 testes já eram tipados, e o valor
  é para a frente. O `strictFunctionTypes` (A13) acendeu a fila que o cuidado (b)
  previa, e **todos os erros eram contravariância de callback, nenhum era bug** —
  o mais instrutivo é o `aplicarErroDoServidor` do E96, que recebe `string` onde o
  react-hook-form quer `FieldPath<T>`: ela é genérica por natureza, porque recebe
  caminhos que vêm do SERVIDOR, e o servidor não conhece o tipo do formulário. E
  o B15 é o único que era exposição de verdade: `express.json({ limit: "6mb" })`
  da rota de foto era montado **antes de qualquer autenticação** — qualquer um
  fazia o processo montar 6 MB de JSON sem estar logado. O parser continua fora do
  router (o global de 100kb não pode vir primeiro, senão nenhuma foto real entra);
  o que mudou é que `requireSessaoComLoja` e `requireModulo("vestidos")` vêm antes
  dele no mesmo `app.use`.
- **Duas sobras roteadas ao E104 continuam abertas depois da parte 1**, e ficam
  nomeadas aqui para que a parte 2 não as perca: as três metas do `index.html`
  ainda dizem *"Moscow Noivas — built on Replit. Update this description…"*, que
  é o texto que aparece quando alguém compartilha o link do sistema; e o
  `include` do vitest do front continua `src/lib/**/*.test.ts` (S15) — teste de
  componente segue não sendo executado, e o A7 não cobre isso, porque tipar o
  teste e coletá-lo são fiscais diferentes.

### Sessão 4 — 2026-07-28

- **O diário registrou o E103 e o E104**, que estavam commitados e mudos: os
  hashes estavam na tabela e nenhum parágrafo existia. O passo 5 do "Como
  retomar" pede os dois, e o parágrafo é o que sobrevive — a tabela diz que foi
  feito, a nota diz o que se aprendeu. Commit `85d7c14`.
- **E98 parte 2** (notas em `execucao/E98.md`): F12, F2, F3 e F4. Os quatro
  andam juntos por um motivo que só apareceu ao fazer — **o F4 cria uma noiva, e
  criar noiva é exatamente o que o F2 acabou de proibir de fazer no escuro.**
  Na ordem trocada, o "Cadastrar «Maria»" teria caído no default da coluna e
  reintroduzido, na tela de maior frequência do app, o defeito que o F2 fecha.
  1. **O F12 não trocou um formulário por um link: apagou uma versão ERRADA da
     mesma tela.** O diálogo da agenda tinha 198 linhas e três defeitos que
     nenhuma tela mostra — o instante nascia no fuso do NAVEGADOR (`new
     Date(inicio)`) enquanto a tela de agendar usa `instanteDoSlot`, no fuso da
     loja; a vendedora logada virava a responsável sem ninguém perguntar, e a
     comissão lê esse campo; e `tipo: PROVA` era aceito **sem reserva**, que é a
     prova órfã que o E97 teve de consertar do outro lado. 15 linhas entraram,
     198 saíram. O cuidado (b) cobrou dois lados e não um: o `?dia=` preenche a
     data **e** a volta devolve a agenda do mesmo dia.
  2. **O backlog trava a origem no CONTRATO; a régua certa é a CONVERSÃO — e as
     duas divergem nos dois sentidos.** `/leads/conversao` conta por ETAPA
     (`ETAPAS_CONVERTIDA`), não por linha da tabela de contratos: cancelar o
     contrato não regride a etapa, então a noiva continua contada e a régua do
     backlog a devolveria para edição; e `transicaoLeadValida` aceita pular no
     funil, então existe lead com contrato que nunca passou por
     `CONTRATO_FECHADO`. A guarda ficou em `converteu(etapa)` — **a mesma função
     que o relatório usa para contar**, não uma cópia dela.
  3. **`origem` não virou obrigatória no contrato da API, e isso foi medido.**
     Fechar a porta no `LeadInput` custaria 16 chamadas de `POST /leads` em
     testes onde a origem não é o assunto, e a captação externa já tem corpo e
     default próprios (`SITE`). A cerca que importa é a do formulário, que é por
     onde gente passa. Decisão registrada, não esquecimento.
  4. **Um caso de teste que parece detalhe e não é:** reenviar a MESMA origem de
     uma noiva já convertida **passa**. A tela manda o formulário inteiro no
     PATCH — recusar o campo idêntico impediria de corrigir o NOME de uma
     convertida, com um 422 apontando para um campo que ninguém tentou mudar.
- **E98 parte 3**: cinco dos seis links do item 3 (F7, F10, F14, F40, F43).
  1. **O F7 parecia um link e virou régua compartilhada.** O dashboard promete
     "o que precisa da sua atenção agora" e não mencionava "Mensagens de hoje".
     Contar a fila de novo no painel era o caminho de duas linhas, e as duas
     contagens divergiriam **desde o primeiro dia**: o painel tinha a agenda de
     HOJE em mãos e a fila olha 48h. As regras saíram da tela para
     `lib/mensagens-do-dia.ts` (16 casos), e as duas telas passaram a derivar
     delas — um painel que promete três mensagens e entrega cinco é pior que um
     painel calado.
  2. **O cartão novo não custou request e ainda tirou um.** A janela de 48h
     CONTÉM a de hoje e o corte por hora já rodava no cliente: a janela abriu, a
     consulta antiga saiu, a chave virou a mesma de `/mensagens` (o react-query
     deduplica ao navegar) e o recorte de hoje ficou mais correto — com um dia
     só, um navegador em fuso adiantado podia perder o fim do dia da loja.
  3. **O sexto link não é um link, e por isso saiu num commit próprio.** O F28
     supõe uma parcela por linha, e a linha de `/cobranca` é por **noiva** — ela
     agrega N parcelas vencidas. Cinco links de navegação e uma refatoração da
     tela de receber não pertencem ao mesmo commit; é o cuidado (a) do épico.
- **E98 parte 4**: o F28, e com ele o item 3 fecha inteiro. Sobram só o E9 (vai
  com o `<Breadcrumb>` do E99) e o F13 (capacidade nova, cortável).
  1. **A escolha da parcela não era gosto.** "Receber" numa linha que agrega N
     parcelas precisa dizer *qual*, e é a **mais antiga**: é ela que define os
     dias e a faixa que a linha mostra, é por ela que a fila se ordena e é ela
     que a mensagem de cobrança cita. Receber outra deixaria a linha anunciando
     um atraso que não é o que acabou de ser pago. O `agingDeParcelas` passou a
     expor `parcelaMaisAntigaId` com **desempate pelo id** — sem ele a parcela
     oferecida dependeria da ordem em que o servidor devolveu a lista, e a mesma
     tela ofereceria parcelas diferentes entre dois carregamentos.
  2. **O diálogo saiu inteiro, não copiado**, porque uma cópia perderia três
     coisas que custam dinheiro: o valor sugerido é o SALDO (repetir o previsto
     cobra de novo o que já entrou), `recebidoEm` é um INSTANTE com meio-dia de
     SP para dia passado, e o `PARCELA_MUDOU` do B6/E94 tem frase própria — sem
     ela a vendedora leria "HTTP 409" numa tela de dinheiro.
  3. **Virar componente mudou uma coisa, e é a que eu erraria depois.** Na tela,
     o preenchimento acontecia na mesma função que escolhia a parcela; como
     componente, a parcela chega por prop e o preenchimento passou a seguir a
     prop. Sem isso, abrir a segunda noiva da fila mostraria o valor da
     primeira — a pior forma de errar um lançamento.
- **E99 parte 2** (notas em `execucao/E99.md`): E12, E14, E21 e D11 — os quatro
  que não dependiam de decisão. A decisão que faltava (item 4) foi respondida
  pelo dono nesta sessão e está acima.
  1. **O backlog dizia que as telas irmãs já tinham o card de "não encontrado".
     Não tinham.** Fui buscar e achei **três cópias de um parágrafo**, uma por
     tela de detalhe — e o `<NaoEncontrado>` que a parte 1 DESTE MESMO ÉPICO
     criou tinha **zero consumidores**. O E12 não era ligar um componente numa
     tela: era adotá-lo nas quatro. E a ficha da noiva tinha um defeito que as
     irmãs não têm: 404 caía no mesmo alerta destrutivo de um 500, **com
     "Tentar novamente"** — um botão que não pode dar certo.
  2. **No E21 a varredura vale mais que as treze correções**, e ela nomeou os
     treze sozinha. Cinco eram afirmados por spec E2E e mudaram junto, com o
     motivo — a lição do E93, que a rodada já pagou uma vez.
  3. **Errei e o próprio teste me pegou.** Para fazê-lo passar, pus `"Regras"` na
     lista de nomes próprios, o que faria "Disponibilidade e Regras" passar sem
     ser corrigido. Não é nome próprio: tirei da lista e corrigi o título. **Uma
     lista de exceções é onde uma varredura vai morrer, se deixarem.**
  4. **O D11 não é cosmético.** As faixas da escada de comissão eram keyadas por
     índice num editor que remove do MEIO: apagar a segunda de três faz o React
     reaproveitar o nó da terceira e o foco saltar de campo, no meio da digitação
     de uma escada de comissão. O id novo é local e não vaza para a API.
- **E99 parte 3**: D15 e A9. **A etiqueta 🔵 do D15 estava errada, e a medição
  mostra por quê**: não eram 25 formatadores, eram **36**; **17 eram cópias** de
  oito formas idênticas; e **7 omitiam `timeZone`, três deles formatando um
  INSTANTE** — a hora do atendimento e o início real medido eram desenhados no
  relógio de QUEM ABRE, não no da loja. É o irmão de código do E1 (E92): lá era o
  Chromium em inglês desenhando a data invertida, aqui é a hora mudando conforme
  onde está quem abriu. Saldo: **36 → 30 formatadores, 7 → 0 sem fuso**.
  1. **O teste escolhe os casos na FRONTEIRA**, que é a única forma de um sweep
     de formatação ser verificável: `2026-07-29T00:30:00Z` é 21h30 do dia **28**
     em São Paulo, e `"2026-01-01"` sem âncora vira 31/12/**2025** — o caso em
     que o erro troca o ANO. Um formatador sem `timeZone` passa nos casos do
     meio do dia e falha nesses.
  2. **Um comentário apontava para o lugar errado, e é o achado do épico.**
     `reservas/helpers.ts` justificava os três formatadores sem fuso dizendo
     "fuso local (**mesma convenção da página Agenda**)" — e a Agenda faz o
     oposto: `grade.tsx` sempre passou `America/Sao_Paulo`. O comentário citava
     como prova uma tela que discorda dele. **Pior que comentário nenhum:
     desliga a suspeita de quem lê** — a mesma classe do `liquidoEmCentavos` do
     E95.
  3. **O A9 já tinha custado uma cópia, nesta mesma sessão.** `useCaminhoDaLoja`
     morava em `pages/financeiro/helpers.tsx`; o `<SemWhatsApp>` do F3 precisou
     dele três commits atrás, não podia importar uma página a partir de um
     componente compartilhado, e reimplementou a montagem com `useParams`. Foi
     assim que uma régua virou duas. O hook subiu para `@/hooks` e a cópia
     morreu.
- **E99 parte 3b — declarei o D15 fechado e ele não estava.** A varredura da
  parte 3 procurou `new Intl.DateTimeFormat`, contou 36, consertou 7 e deu o item
  por pronto. O mesmo defeito se escreve `new Date(x).toLocaleDateString("pt-BR")`
  — **dez linhas do app faziam isso, seis sobre instantes**, e o
  `contratos/[id].tsx` mostrava "Fechado em" no relógio de quem abre: o defeito
  que o commit anterior tinha acabado de consertar três arquivos adiante.
  1. **A régua já estava escrita no arquivo em que eu estava escrevendo.** O
     comentário da `dataDia`, no MESMO `lib/formatos.ts`, documenta a armadilha
     desde antes. A varredura não leu o próprio arquivo.
  2. **Havia uma sobra ROTEADA a este épico que não conferi.** A tabela "Roteadas
     a um épico que ainda não rodou" diz `calendar.tsx:40 … entra no D15`, e o
     passo 4 do "Como retomar" manda lê-la antes de começar. Li a tabela no
     início da sessão e não a cruzei na hora de executar o item — a sobra
     sobreviveu ao épico que existia para fechá-la.
  3. **A lição, e ela é de método:** uma varredura que procura UMA grafia
     declara-se completa e não é. O teste novo olha as duas, com lista de
     perdoados de um item e o motivo escrito — mesmo formato do teste de
     `error.message` do E96, e nascido do mesmo jeito.
- **E99 parte 4**: o `<CabecalhoDetalhe>` (E9, do E98) nasce e três das seis
  telas de detalhe o adotam — contrato, vestido e ficha da noiva.
  1. **O caso do épico se confirma na tela**: no contrato, "Cancelar contrato"
     dividia a fileira com "Baixar PDF" e "Ver orçamento", os três do mesmo
     tamanho, e o elemento mais clicável dos quatro era o `Badge` rosa "Ativo" —
     cor cheia no meio de botões outline, e não clicável. O status virou chip de
     leitura ao lado do `<h1>`; a destrutiva foi para o `…`, em vermelho e atrás
     de um separador.
  2. **A poda foi cobrada e a promessa se sustentou.** O `dropdown-menu` era um
     dos 24 primitivos apagados na parte 1, com a nota "reintroduzir é um
     comando". Hoje foi o dia: a dependência ainda estava no store do pnpm e o
     arquivo veio **do próprio commit da poda**, não reescrito. Podar sabendo que
     reintroduzir é barato só vale se, no dia, for barato mesmo.
  3. **O E9 faz o nome do registro aparecer duas vezes, por desenho**, e um spec
     disse isso com `strict mode violation … resolved to 2 elements`. É o padrão
     certo (o último item do breadcrumb É o título da página, com
     `aria-current="page"`); quem envelheceu foi a expectativa. **Terceira vez
     nesta sessão** que o E2E completo pega uma expectativa velha — verde em
     unidade e typecheck não veria nenhuma das três.
  4. **O orçamento ficou de fora com motivo técnico:** "Recusar" e "Aprovar" são
     `AlertDialogTrigger` embrulhando botões, e um `DropdownMenuItem` que abre um
     `AlertDialog` não funciona direto — o menu fecha ao selecionar e desmonta o
     gatilho. Os dois diálogos precisam virar controlados, e isso é trabalho, não
     troca de marcação.
- **E99 parte 5**: o E9 fecha nas seis telas (o orçamento com os dois diálogos
  controlados, como previsto), **e o D15 foi dado por fechado pela TERCEIRA
  vez.** Primeira: varri `Intl.DateTimeFormat` — havia 10 `toLocaleDateString`.
  Segunda: somei `toLocale*String` e escrevi um teste chamado "nenhum arquivo do
  app formata data sem dizer o fuso" — havia **8 `format()` do date-fns**, que
  também lê o relógio do navegador, e só apareceram porque tropecei num ao mexer
  noutra tela.
  1. **O padrão do erro é o mesmo das três vezes: escrevi um teste que afirma
     mais do que verifica**, e o nome dele me deu confiança de que o item estava
     fechado. Um teste de varredura é uma promessa, e errá-la custa caro porque
     **desliga a suspeita de quem vem depois** — a mesma crítica que a nota do
     E99 fez ao comentário do `reservas/helpers.ts` duas partes antes. Fiz o que
     critiquei, no mesmo item, duas vezes. **Candidata a regra da R7: teste de
     varredura declara a GRAFIA que cobre, e o nome não promete mais que isso.**
  2. **Um dos oito era pior que formatação.** `vestidos/[id].tsx` usava
     `format(new Date(), "yyyy-MM-dd")` para saber que dia é HOJE e decidir a
     ocupação do vestido: depois das 21h de São Paulo, um navegador em UTC já
     está no dia seguinte. Passou a usar `hojeLocal()`, que é a régua da loja e
     já existia.
- **E99 parte 6** (E6, E8): a escala de dinheiro. **A medição é mais dura que o
  épico** — ele fala em "quatro tipografias para o mesmo valor"; são **92 lugares
  com 28 combinações**, **58 sem `tabular-nums`** (o que faz coluna de número
  desalinhar) e 29 sem classe tipográfica nenhuma.
  1. **A cor ficou FORA da escala, de propósito.** Ela é do estado (positivo,
     destrutivo), não do tamanho: um valor grande pode ser bom, ruim ou neutro, e
     amarrar cor a tamanho obrigaria a inventar um degrau por estado.
  2. **O E8 foi medido vermelho antes e o teste nomeou os quatro sozinho.** O
     valor do contrato é o caso do épico: ao lado do `text-destructive` da
     parcela em atraso, o rosa da marca lia-se como um segundo alerta. O que
     aquele número precisa não é cor, é TAMANHO.
  3. **O teste não persegue os 92, e isso é decisão** — o cuidado (a) proíbe
     virar reescrita. E **depois das três tentativas do D15, o nome do teste diz
     exatamente o que ele cobre**, não mais que isso.
- **E104/D8 — o code splitting**, o único item da rodada que muda o que a
  recepcionista baixa. O caminho crítico caiu de **1.270,80 kB para 613,10 kB**
  (354,99 → 182,34 em gzip): **−51,8%**. 50 das 54 rotas viraram `lazy`.
  1. **Metade do ganho veio de um import morto que EU deixei.** `dashboard.tsx`
     importava `format` do date-fns sem usar — resquício da parte 5 do E99, onde
     troquei a última chamada por `instanteHora`. Sendo o dashboard uma das
     quatro rotas ansiosas, aquele import prendia **103 kB no caminho crítico de
     todo mundo**, inclusive da noiva no portal, que não usa data nenhuma.
  2. **Isso INVERTE uma conclusão da própria rodada.** O E99 parte 1 mediu a poda
     de 24 primitivos, viu o bundle não mudar um byte e concluiu — corretamente
     na época — que import morto não custa. Com o corte por rota, **import morto
     em módulo ansioso passa a ter preço, e quem paga é quem nunca abre aquela
     tela**. Foi para os Gotchas do `replit.md`.
  3. **O que conta não é a soma dos 29 chunks**, é a entrada mais os
     `modulepreload` do `index.html` — junto com as duas variáveis que o build
     exige (`PORT`, `BASE_PATH`), foi para o `replit.md`: sem isso escrito, o
     próximo a medir soma 29 números e conclui que nada melhorou.
  4. **O cuidado (c) era concreto.** O `Suspense` fica DENTRO do `AppLayout`,
     em volta só do `<Outlet />`: em volta do layout, a sidebar, o header e o
     sino sumiriam e voltariam a cada navegação — o chrome piscando por causa do
     conteúdo.
- **E99 parte 7**: os vazios de beco, **e metade do E19 recusada com medida**.
  1. **A paginação vale menos do que o backlog supõe.** A sobra do E92 diz que
     "/vestidos renderiza 114 cards com FOTO de uma vez"; o card já usa
     `variante: "thumb"` e `loading="lazy"`, então a rede — a metade cara — já
     estava resolvida. As outras duas telas do item já pedem recorte ao servidor
     (E87, E79). E paginar de verdade mudaria o contrato de `listVestidos` e os
     quatro consumidores, **três dos quais precisam da lista completa**.
     Registrado como recusado COM MEDIDA, como o E96 fez com o D5.
  2. **A regra dos vazios é boa e não estava sendo cumprida.** Os quatro que uma
     loja NOVA encontra primeiro eram frase solta em caixa cinza. E a distinção
     que faz o texto valer: **"não há nada" e "seu filtro não achou nada" são
     estados diferentes** — o segundo precisa dizer que o primeiro é falso, senão
     a pessoa conclui que o acervo está vazio quando só marcou dois filtros
     incompatíveis.
- **E100 parte 2 — o F37**, o de maior valor operacional que restava: a noiva
  avisa que NÃO pode ir, e cabine, vendedora e vestido voltam para a loja com
  antecedência em vez de com a ausência. Migração
  `2026-07-28-e100-f37-pedido-de-remarcacao.sql`, aplicada no dev.
  1. **O cuidado (c) mandava alinhar com o E97, e a resposta estava lá:** a
     coluna nova é o **terceiro fato da mesma família** — `contatadoEm` (a loja
     procurou), `confirmadoEm` (ela disse que vem), `remarcacaoPedidaEm` (ela
     disse que não pode). Um valor a mais em `situacao` teria o mesmo defeito por
     outro caminho: misturaria onde o atendimento está com o que ela respondeu.
  2. **Duas decisões, e as duas são sobre NÃO fazer demais.** O pedido não
     cancela nada (o teste compara horário e cabine antes e depois) — cancelar
     sozinho deixaria a noiva sem horário nenhum por um clique num link. E quem
     já confirmou não desmarca por aqui: a loja separou a peça e escalou a
     costureira em cima daquele sim.
  3. **A régua que o F7 extraiu pagou aqui.** Quem pede remarcação sai da fila de
     "falta procurar", porque ela RESPONDEU — e como isso mora em
     `lib/mensagens-do-dia.ts`, foi **uma mudança e duas telas corretas**. Com a
     régua ainda dentro da tela de mensagens, o dashboard continuaria contando a
     noiva que acabou de avisar que não vem.
  4. **Errei um teste e o código estava certo, de novo:** sete provas na mesma
     cabine e horário, contra o `unique(cabine_id, inicio)` do banco — sete casos
     caíram com 23505 antes do primeiro assert.
- **E100 parte 3** (F35, F38): o portal deixa de ser um beco, e o prazo dele passa
  a contar INATIVIDADE. Cada `GET /portal` que responde 200 empurra `expiraEm`
  30 dias à frente — a decisão de segurança fica de pé porque o link de quem
  parou continua morrendo no mesmo prazo, e **renovar não ressuscita**: o 410 do
  vencido e o 404 do revogado rodam antes do `UPDATE`.
  1. **O "no mínimo" do épico foi recusado com medida.** O item 5 pede, no
     mínimo, um aviso no sino. O sino contaria um fato fora do momento em que
     ele importa e **não teria para onde levar** — não existe lista de portais
     vencidos, e "N noivas" sem destino é o beco que o E98/F3 passou a rodada
     fechando. O silêncio foi calado onde ele acontece: a linha de `/mensagens`
     cuja mensagem vai sair sem o link mostra "Portal vencido", no formato do
     `<SemWhatsApp>`. E não regenera dali — regenerar mata o link antigo.
  2. **O E2E não falhou num teste: falhou no SEED**, com `duplicate key …
     regra_disponibilidade_pkey`, minutos depois de a mesma suíte passar
     inteira. `global-setup.ts` elegia a loja com `limit(1)` **sem `order by`**,
     ou seja, por posição física no heap — e o spec novo grava telefone/endereço
     da loja para provar o rodapé. Duas escritas reelegeram outra loja no run
     seguinte, e a vencedora foi uma das quatro **"Loja Teste" abandonadas pelas
     fixtures de API** — a sobra do E104, que estava catalogada como higiene.
  3. **A lição, e ela é de método:** aquele item não era higiene, era uma bomba
     esperando a primeira escrita em `lojas`. Um achado tratado como sujeira e
     outro que nem existia (a eleição por ordem física) só viraram defeito
     quando se encontraram, e nenhuma das seis trilhas olharia para
     `global-setup.ts`. **Candidata a regra da R7: quando uma sobra de "higiene"
     descreve dado a mais num lugar COMPARTILHADO, pergunte quem ELEGE alguma
     coisa naquele lugar.**
  4. **Errei de novo pelo mesmo caminho, e desta vez o teste me pegou.** Usei
     `dataFutura(-1)` achando que era "ontem"; ela conta a partir de uma
     data-base de casamento em **2027**. Dois testes ficaram verdes sem tocar no
     que diziam cobrir. O assert da renovação virou faixa fechada (>29 e <31),
     porque "está longe" e "renovou" eram indistinguíveis.
- **E100 parte 4** (F21, F39): **o épico fecha.** O contrato assinado era o único
  artefato do sistema sem caminho até a noiva — o PDF só descia no computador da
  loja e o portal mostrava a PROPOSTA, nunca o contrato. Agora há "Seu contrato"
  (snapshot de itens, total e PDF pelo mesmo token) e "O seu vestido" (a peça
  reservada, a retirada e os ajustes como pronto/em andamento).
  1. **Duas correções ao diagnóstico, antes do código.** O F39 cita
     `ajuste.proximaProva`, coluna que **não existe** — mesma classe do F33. A
     pergunta já estava respondida pela seção de provas do E78, então o item
     encolheu por medição: sobraram a retirada e o andamento dos ajustes. E o
     "barato" do F21 (botão de WhatsApp na tela do contrato) foi **superado, não
     adiado**: com a seção no portal, o contrato tem caminho até ela e o link já
     viaja nas três filas do E84.
  2. **O papel virou régua** (`lib/contrato-do-papel.ts`). Dois chamadores é
     exatamente quando um bloco inline vira duas versões do mesmo documento — a
     loja arruma uma linha e a da noiva fica para trás, porque ninguém compara
     dois PDFs. O que ficou de fora da régua é o **escopo**: a rota da loja prova
     a loja da URL, a do portal prova o token, e passar a prova como parâmetro
     daria à função pública a chance de aceitar a errada.
  3. **A rota pública não tem `:contratoId`** — o contrato sai do `leadId` do
     token. O que não se pode adivinhar não precisa ser provado. Foi para os
     Gotchas do `replit.md`, junto com o cuidado (d) cumprido: 410 para vencido,
     404 para revogado.
  4. **O guarda de chaves da parte 3 cobrou, e funcionou.** Ele ficou vermelho
     antes de qualquer outro teste, apontando `contrato` e `vestido` — que é
     precisamente para o que existe: campo novo num link público com dinheiro
     dentro custa um vermelho e uma decisão. Um dia de vida e já pagou.
  5. **Repeti o tropeço da parte 2, na mesma sessão** — dois atendimentos no
     mesmo instante contra `unique(loja_id, vendedora_id, inicio)`. O detalhe que
     interessa: **passava sozinho e falhava no arquivo inteiro**. Rodar o teste
     isolado para "confirmar" teria dito que estava tudo bem.
- **E106 — o S1, o último 🔴 da rodada**, e o único achado que **nenhuma das seis
  trilhas viu**. Ele saiu do "visto de passagem" do E91, quando o executor
  consertava o irmão menor (`DELETE /admin/usuarios/:id`, o B2) e reparou que a
  loja tinha o mesmo defeito um andar acima. **Só sobreviveu porque a regra 12 o
  tirou da nota de um épico fechado** — é a prova da crítica 2 (o ponto cego do
  recorte por módulo: nenhuma trilha tinha "console de superadmin" como assunto)
  e da crítica 9 ao mesmo tempo.
  1. **Três correções ao diagnóstico, e as três importam.** A sobra diz "não tem
     guarda nenhuma": o **gate existe** (`requireSuperAdmin`, `admin.ts:53`) — o
     que falta é guarda de DESTRUIÇÃO, e a pergunta que ninguém fazia não era
     "quem pode?" e sim "isto deveria ser possível?". **Nenhuma tela chama a
     rota** (`deleteLoja` só existe no client gerado), o que a torna menos
     provável e mais perigosa — um defeito nela não seria notado por uso. E o
     estrago é maior: `pg_constraint` diz **31 FKs em CASCADE**, não as quatro
     citadas — inclusive `vestidos`, `usuarios_lojas` e a própria `audit_log`.
  2. **A régua não é só de dinheiro, e é decisão.** Uma loja sem contrato pode ter
     200 vestidos fotografados e seis pessoas na equipe. Contar só o financeiro
     deixaria passar exatamente o caso da loja nova que alguém "limpa" porque
     "ainda não vendeu nada". Dois testes existem só para isso.
  3. **O caminho que a mensagem ensina foi verificado, não suposto.** Um 409 que
     manda desativar sem que desativar faça algo é o beco do E98/F3 vestido de
     conselho. O teste desativa e confirma que a loja **sai do `/auth/me`** da
     vendedora, com a loja e o vínculo intactos no banco.
  4. **A trilha não é gravada, e o motivo É o defeito:** `audit_log.loja_id` é
     `notNull` + CASCADE, então registrar "loja X apagada" dentro da loja X apaga
     o registro junto. Ficou o `req.log.warn` — mesmo veredito do E91, mesma
     razão, e a **S3** segue sendo onde isso vira épico. O que mudou é a urgência:
     com a guarda, o que ainda se apaga é uma loja VAZIA.
  5. **O DDL ficou como está, e também é decisão.** Trocar as 31 CASCADE por
     `restrict` — a simetria com o E91 — obrigaria todo apagamento legítimo (o
     expurgo de LGPD, o `limparFixture`) a varrer 31 tabelas na ordem certa, que
     é a coisa que ninguém acerta na segunda vez.
  6. **A cascata de cinco falhas na medição do vermelho é a prova, não ruído.**
     Depois que a loja da fixture foi apagada, o teste seguinte recebeu 404 e o de
     permissão recebeu **403 — a sessão do próprio superadmin morreu**, porque
     `usuarios_lojas` cascateou. Um `DELETE` derrubou o fixture inteiro e expulsou
     quem o executou. É o que a rota fazia em produção.
- **E101/F42 — o épico fecha.** O caminho pior de trazer alguém para a equipe
  deixa de ser uma escolha no escuro.
  1. **Metade do item já estava feita, e há três rodadas.** O F42 pede que o
     convite vire a ação primária: `git log -L` sobre o bloco mostra o **E6**
     (`1ef8620`) já fazendo isso. O diagnóstico foi escrito lendo o código e leu
     um trecho consertado. Quem executasse sem conferir teria "consertado" um
     botão certo e declarado o item fechado **sem escrever a frase**, que era o
     que faltava de verdade.
  2. **O núcleo do achado é o que a pessoa não sabia:** a senha que o admin
     digita é jogada fora — `equipe.ts:128` grava `precisaTrocarSenha: true`.
     Quem escolhe esse caminho troca um link por uma senha que viaja num
     WhatsApp e **nem vai ser usada**. Ninguém escolheria isso sabendo, então o
     conserto não é esconder o caminho pior: é dar o contexto, e no lugar onde a
     decisão acontece — o diálogo, não o cabeçalho da tela.
  3. **O aviso leva ao caminho melhor, não só o nomeia.** "Convidar por link"
     dentro da frase é clicável e troca de diálogo. Um aviso que diz "há um
     caminho melhor" e obriga a fechar, procurar e clicar de novo é o beco do
     E98/F3 com outra roupa.
  4. **O vazio da equipe apontava para um botão inexistente** desde o E6 —
     "Cadastre a primeira vendedora em *Novo membro*" — e mandava a loja NOVA
     para o pior dos dois caminhos, na primeira vez que ela traz alguém.
  5. **Candidata a regra da R7:** item de UX que descreve uma tela declara o
     COMMIT em que foi lido; o executor confere o `git log -L` do bloco antes de
     escrever. É a terceira vez nesta rodada que o backlog descreve um estado que
     não é mais o do código.
- **E98/F13 — o épico fecha.** A barra do atendimento em curso: enquanto existir
  um `EM_ATENDIMENTO` da pessoa logada, toda tela diz de quem é e oferece
  interesses, lookbook e o caminho de volta. O buraco era entre dois épicos que
  já existiam — o E36 mediu o INÍCIO, o E61 encurtou o DEPOIS, e o durante não
  era de ninguém: `atendimentos/index.tsx` era o único lugar do app que conhecia
  aquele estado. Custo de rede zero: a janela é a mesma do sino, e o cache
  deduplica.
  1. **O E2E falhou duas vezes, e as duas valem mais que o diff.** Primeiro por
     ver a régua funcionando e ler como erro: o spec criava o atendimento para
     `equipe[0]`, que não é a pessoa logada, e a barra corretamente não aparece
     para quem não está conduzindo. Consertei o teste, não o código.
  2. **Depois, um spec alheio caiu — e a causa era minha, da família da S7.** O
     spec 22 inicia um atendimento e nunca o conclui; o banco de dev persiste, e
     a barra passava a aparecer em todos os specs seguintes do mesmo dia. Havia
     **53 linhas vazadas** quando fui olhar. O detalhe que vale: **o vazamento é
     o próprio achado do F13** — o teste da barra reproduziu o problema que a
     barra existe para resolver.
  3. **Limpar o vazamento não bastava, e verificar isso foi o que importou.** Um
     usuário real TEM a barra ao montar um orçamento. Forcei o estado e o spec
     caiu igual: era regressão de verdade. A medição levou a um **CSS morto desde
     a migração Tailwind v3 → v4**: `max-h-[--radix-select-content-available-height]`
     é sintaxe da v3 e emite CSS inválido na 4.1.14. Medido: `maxHeight: "none"`
     com a variável valendo 378px, e um select de **389 opções** renderizando
     **12.456px**, jogado para y = −12.073 quando o Radix flipou para cima.
     **A barra não criou o defeito: revelou.** Depois: 376px, y = 7. O resto do
     CSS morto foi para a **S19**.
  4. **Candidata a regra da R7:** mudança no chrome compartilhado (`AppLayout`,
     sidebar, header) roda a suíte E2E completa **com o elemento novo VISÍVEL** —
     um elemento que só aparece em certo estado precisa desse estado forçado,
     senão a suíte inteira testa a versão sem ele. A regra 11 não cobria este
     caso: não mudou o que a trilha grava nem o formato que uma tela lê, e o E2E
     foi a única coisa que pegou.
- **E107 — o rabo de integridade do E91/E94/E96** (S2, S4, S6, S12). Quatro
  escritas que não tinham terminado de aprender o que aqueles épicos ensinaram.
  1. **S2 🟠 era o que doía:** `POST /contratos` provava a LOJA e parava aí — o
     vestido que a noiva B reservou passava a responder pelo contrato de A, sem
     erro nenhum. Vermelho literal: `expected 422, got 201`. A guarda tem uma
     exceção que é o caso COMUM: reserva sem dona é legítima, e é o contrato que
     lhe dá dono.
  2. **O E2E entregou um achado maior que o épico.** `AuditoriaItem.acao` era
     **enum fechado** no openapi, e `ListAuditoriaResponse.parse()` estoura no
     primeiro registro desconhecido — morre a **lista inteira**, não a linha. Uma
     `CONTA_PAGAR_REMOVIDA` no banco de dev apagou a trilha da tela. E isso
     contradizia o projeto por escrito em dois lugares: o schema do banco ("trilha
     nova não pode exigir migration para existir") e o `ROTULO_ACAO` frouxo do
     front ("tela velha lendo trilha nova não pode quebrar"). **Só o openapi
     discordava, e era ele quem executava.**
  3. **Regra 11 se pagando pela quarta vez.** Os 740 testes de API não pegaram —
     usam fixture própria, e fixture não tem sujeira. O E2E roda contra o banco de
     dev, que tem, e é por isso que pega o que os outros não pegam.
  4. **O S12 estava congelado num teste.** O assert era
     `expect(c.body.error).toContain("vínculos")` — afirmava a PROSA no campo que
     o E96 definiu como código, e teria reprovado o conserto. **Candidata a regra
     da R7: quando um épico estabelece contrato novo, a varredura que o fecha
     inclui os TESTES, não só o código.**
  5. **Dois erros meus, os dois de raciocínio.** Copiei do E94/B6 um invariante
     que não transferia (`trilha.length === confirmados` é falso quando o
     perdedor recebe 200 sem auditar) — passava sozinho, falhava na suíte. E
     acusei o E107 de quebrar o `lote17` com amostra de UM: era flake, virou
     **S20**. Uma passada verde não prova ausência de flake, e uma vermelha não
     prova autoria.
- **E104/S19 — o CSS que o Tailwind v4 descartava em silêncio**, antecipado para
  primeiro porque é o único item do fechamento com defeito **visível na tela**.
  Na v3, `h-[--cell-size]` era atalho; na v4 (a instalada é **4.3.1**) a forma é
  `h-(--cell-size)`, e a antiga **continua compilando** — emite
  `height:--cell-size`, que é o NOME de uma variável escrito como valor, e o
  navegador descarta a declaração inteira.
  1. **Cinco classes, 100% do consumo de `--cell-size`, mortas** — e sem rede,
     porque ninguém importa o CSS do `react-day-picker`. As setas de mês ficavam
     com os 16px do chevron em vez de 32×32, e o `px-[--cell-size]` do rótulo era
     **a reserva de espaço para elas**: o mês ficava por baixo das setas.
  2. **A minha própria instrução deixaria passar o pior caso.** Escrevi "varrer
     no `ui/` inteiro"; `combobox-noiva.tsx:171` está fora dele, e ali a classe
     morta não só não faz nada — o `twMerge` vê dois `w-*`, **apaga o `w-72`** e
     a lista de noivas fica sem largura nenhuma. São **13 linhas em 6 arquivos**.
  3. **O teste virou a última fonte do defeito.** O scanner do Tailwind lê texto
     cru e encontrou o literal `h-[--cell-size]` escrito no assert: depois de
     consertar as 13 linhas, o bundle **ainda trazia uma** ocorrência, vinda do
     próprio teste. Os exemplos passaram a ser montados por concatenação. **O
     exemplo negativo de um teste de CSS é código que o compilador de CSS lê.**
  4. **A régua aqui é o `vite build`, não o typecheck** — que nunca vê CSS.
     Antes: `height:--cell-size`. Depois: `height:var(--cell-size)`, zero mortas.
  5. **Candidata a regra da R7:** atualização de major de ferramenta de build
     fecha com varredura das grafias removidas no CHANGELOG, e a prova é o
     **artefato compilado**. Aqui não houve erro de build, teste vermelho nem
     alerta: 13 declarações inválidas foram compiladas e entregues, e o que as
     denunciou foi uma barra de 41px empurrar um popper — um acidente.
- **E99 parte 8 — a régua da ação destrutiva (E10)**, e a régua como o backlog a
  escreveu **era impossível de cumprir**: ele pedia `variant="destructive"` no
  gatilho, e `DropdownMenuItem` **não tem essa prop** — a mesma regra mandava usar
  o `…` e uma grafia que o `…` não aceita. Medido: zero gatilhos usam a grafia; o
  único `<Button variant="destructive">` do app é o de CONFIRMAR. A régua escrita
  põe a cor onde o gesto acontece, e está no `replit.md`.
  1. **Das 31 destrutivas, oito não tinham confirmação nenhuma.** Fechei as
     quatro irreversíveis (revogar portal, revogar lookbook, restaurar padrão de
     permissões, e o estorno de `/receber`) e deixei os 10 que nomeiam o objeto
     mas não o valor como sobra — com a lista da fase A pronta.
  2. **"Desfazer" NÃO é destrutivo, e é decisão escrita.** As duas de
     `reservas/[bloqueioId].tsx` **são** a rede que o E97 criou para errar sair
     barato; embrulhá-las num diálogo devolve o custo que elas tiraram.
  3. **O meu plano endereçou o arquivo errado.** `contratos/[id].tsx` já nomeava
     objeto e valor desde antes da rodada; quem não nomeava é o `/receber`. E o
     valor certo é o **RECEBIDO**: numa PARCIAL de R$ 1.000,00 com R$ 300,00
     recebidos, o estorno tira R$ 300,00 — escrever mil seria a tela mentindo
     sobre dinheiro num clique sem volta.
  4. **Escrevi o assert da segunda cláusula e o desliguei.** "Nenhuma descrição é
     frase fixa" acusou **cinco**, e nenhuma era o defeito — uma delas nem é
     destrutiva (a confirmação de registrar devolução). O defeito real não se
     distingue delas **pela forma**, e sim pelo contexto (o diálogo abre de uma
     LINHA). **É o erro do D15 pelo avesso:** lá o teste prometia mais do que
     olhava, aqui acusaria mais do que a régua diz — e o custo é o mesmo, desligar
     a suspeita de quem vem depois, por ruído em vez de por silêncio. As cinco
     ficaram citadas no próprio arquivo, para ninguém tentar de novo às cegas.
- **E99 parte 9 — o `<Table>` nas cinco telas, e o épico fecha.** O primitivo
  existia com **um** consumidor em todo o repo; as cinco telas somavam 243 linhas
  de `<table>` cru.
  1. **O ganho é o wrapper, não a marcação — e quatro das cinco não mudam um
     pixel.** Elas já tinham `overflow-x-auto` no `CardContent`, que é o que o
     `<Table>` traz. Dizer isso é mais útil que fingir conserto: o que ganham é
     uniformidade e o próximo ajuste valer para todas.
  2. **A quinta é a única com dor medida:** a simulação de comissão vive num
     `DialogContent max-w-lg` **sem contêiner de rolagem nenhum** — cinco colunas
     de dinheiro cortadas sem saída. O E19 marcou o caso como "não confirmado"; a
     fase A confirmou por leitura.
  3. **Três cuidados que a fase A levantou, todos aplicados:** o `min-w-[56rem]`
     da agenda foi para o `<Table>` e não para o wrapper (no wrapper a rolagem
     nunca dispararia); os `overflow-x-auto` dos contêineres saíram (scroll dentro
     de scroll não rola — verificado depois: zero telas com os dois); e
     `TableRow` traz `hover:bg-muted/50`, que **duas telas não podem ter** porque
     as linhas não são clicáveis — é a crítica que a parte 4 fez ao `Badge` rosa,
     e a decisão está escrita em vez de acontecer por omissão.
  4. **Não há vermelho a citar, e digo por quê:** em quatro telas é marcação
     equivalente por marcação compartilhada. Na quinta o conserto se vê abrindo o
     diálogo, e o E19 já registrara que não conseguiu abri-lo (exige simulação
     submetida). **Eu também não abri, e digo isso** em vez de afirmar que
     verifiquei.
  5. **O E99 fecha com TRÊS recusas com medida em nove partes:** a paginação do
     E19 (parte 7), o assert da segunda cláusula do E10 (parte 8) e os 10 gatilhos
     que nomeiam o objeto e não o valor (viraram sobra, com inventário pronto).
- **E103 parte 2 — a conciliação ganha memória** (F32, o lado do servidor). Ela
  era uma FOTOGRAFIA: a tela não tinha uma única mutation, o resultado morria com
  a aba, e as divergências já perdoadas voltavam todo mês indistinguíveis das
  novas.
  1. **O meu plano subdimensionou a migração em 3×.** Escrevi "Migração: sim —
     `conciliadoEm`", no singular; são **duas colunas em duas tabelas** só para o
     F32, porque o que a tela chama de "movimento" vem de `parcelas` E de
     `pagamentos`. Ou são as duas, ou metade da conciliação continua amnésica.
  2. **"Um PATCH em lote" mirava um recurso que não existe.** Não há
     `/movimentos/:id`; os ids da tela são sintéticos (`parcela:<id>`). A rota
     recebe DUAS listas e devolve quantos mudaram de cada lado — inventar a
     entidade seria criar um recurso para caber numa frase.
  3. **A guarda que o plano não previa: o estorno LIMPA o carimbo.** Movimento
     que deixou de existir não pode continuar conferido — se ficasse, a
     conciliação seguinte pularia em silêncio uma linha que voltou a ser
     divergência. Vermelho medido: `expected 2026-07-28T16:56:17.333Z to be null`.
     **E os dois estornos não são simétricos:** o de parcela REVERTE (precisa da
     linha), o de pagamento APAGA (o carimbo vai junto). Escrever nos dois seria
     código morto num deles.
  4. **`conciliadoEm` não é `enviadoContabilidadeEm`**, e os dois vão conviver na
     mesma tabela — está escrito no `COMMENT ON COLUMN`, no schema, no spec e num
     teste, porque o cuidado (b) do épico é exatamente esse.
  5. **Sem backfill, e por quê:** a conciliação nunca escreveu, então nada sabe o
     que já foi conferido. Todo movimento antigo nasce não-conciliado, que é a
     verdade. Adivinhar é o que o E97 recusou com as avarias.
- **E103 parte 3 — a tela lembra, e o F32 fecha.** O botão marca as casadas que
  ainda não têm carimbo; o filtro esconde as divergências já perdoadas.
  1. **O carimbo mora num mapa ao lado, e não no `MovimentoSistema`** — foi a
     primeira coisa que tentei e desfiz. Aquele tipo é do motor de CASAMENTO do
     E70: pôr `conciliadoEm` nele faria o núcleo carregar um conceito do E103
     para sempre.
  2. **Duas decisões de tela, as duas sobre não mentir:** o botão SOME quando não
     há nada novo (dizer "marcar 0" é oferecer trabalho inexistente), e o filtro
     DIZ quantas escondeu (esconder calado faria a pessoa concluir que o mês
     bateu).
  3. **O F32 tornou visível um defeito latente no spec do E70.** O spec novo
     ficou vermelho porque havia **quatro parcelas vazadas** com valor e data
     idênticos aos que ele cria — e o casamento é por valor + data. Enquanto a
     conciliação era fotografia isso não importava: casar a parcela deste run ou
     a do anterior dava o mesmo placar. **Com memória, a identidade passa a
     importar.** Conserto: valor único por execução, a lição da S7.
  4. **E limpar o lixo deixou o teste ANTIGO vermelho.** Ele dizia "os três
     placares aparecem" e afirmava dois títulos de LISTA — o de "No sistema, mas
     não no banco" passava **porque o lixo o preenchia**, já que o spec não semeia
     divergência desse lado. Assert que depende de garbage é assert que mente
     sobre o que cobre.
  5. **Rodei o E2E completo DUAS vezes** — o spec passou a escrever carimbo no
     banco que persiste, e uma passada só não prova que a segunda execução do dia
     encontra o mundo como esperava. É o erro que o F13 cometeu.
- **E103 parte 4 — o mês fecha nos DOIS lados, e o épico fecha.**
  1. **O primeiro passo não foi a tela: foi desarmar uma mina.** `e2e/15`
     afirmava que TODO pagamento da loja de seed tem carimbo nulo — qualquer
     carimbo de qualquer origem o deixaria vermelho para sempre, num banco que
     persiste, e um vermelho desses se lê como regressão de dinheiro. Agora ele
     cria o pagamento e afirma sobre AQUELE. A intenção é sobre o verbo (GET não
     escreve), não sobre o estado global. Fiz isso **antes** de escrever a tela.
  2. **O lado das entradas não existia** — `parcelas.enviado_contabilidade_em`
     não era coluna. "Carimba os dois lados" não estava subdimensionado: era
     impossível. Vermelho: `expected +0 to be 1`.
  3. **A régua de cada lado é a do CAIXA.** Recortar a entrada por VENCIMENTO
     produziria um pacote em regime misto que não fecha com o DRE — tem teste: a
     parcela que vence em março e é recebida em abril **não** entra em março.
  4. **A ação passou a deixar rastro.** Era a segunda escrita mais irreversível
     do financeiro (o carimbo é de mão única) e a única sem autor — a tese do
     E107 onde ela ainda não valia. O `entidadeId` carrega a JANELA, porque o
     fato é o período; e clique que não carimbou nada **não grava**.
  5. **O defeito medido na folha:** dois estados de tempo independentes. Trocar a
     competência para junho e clicar carimbava **os pagamentos de julho**, com a
     tela toda falando de junho. Agora a competência leva as duas datas junto.
  6. **O "UM pacote" NÃO foi feito, com medida** — os quatro exports recortam por
     réguas diferentes, e juntá-los como estão dá regime misto. Virou a **S21**.
     O flake do `24-dias-funcionamento` virou a **S22**.
- **E104 parte 3 — o invariante fica total, e a razão do A6 era falsa.** Fecha o
  A6, o A8 e as três roteadas; o épico segue 🟨.
  1. **A fase A errou aqui, e só apareceu porque fui provar o ganho.** Ela mediu
     que `pnpm run build` da raiz quebra por causa do `mockup-sandbox`, e foi
     essa medida que decidiu o A6. Tirado o pacote, **a raiz continua
     quebrando** — agora no `moscow-noivas`, cujo `vite.config.ts:11` tem o
     `throw` idêntico: `Error: PORT environment variable is required but was not
     provided.` Com `PORT=5000 BASE_PATH=/` o build passa inteiro em 8,21 s.
     Exigir as duas variáveis é convenção do repo, não defeito do sandbox.
  2. **A lição é sobre a fase A inteira, não sobre este item.** Ela mediu por
     LEITURA e acertou trinta correções; aqui ela EXECUTOU pela metade e parou no
     primeiro vermelho. Um `pnpm -r` que aborta na primeira falha só prova quem
     falhou primeiro, nunca quem mais falha. A mentira foi corrigida nos três
     lugares onde morava (o `pnpm-workspace.yaml`, o `replit.md` e a tabela da
     fase A no plano), e o `replit.md` ganhou o que faltava: **como buildar a
     raiz fora do `run` do Replit**, que é capacidade (regra 8).
  3. **O A6 continua certo com outros números:** o typecheck cai de 4 para 3
     projetos (`Scope: 3 of 11`), o lock perde **971 linhas**, e o pacote tem 60
     devDependencies e **zero** dependencies — não entrega runtime nenhum.
  4. **A allowlist do `lote2` tinha duas entradas e as duas eram mentira.** A
     justificativa da primeira dizia "o spec só documenta a listagem geral", e o
     spec documenta o `post:` no MESMO path (`openapi.yaml:3034`). A segunda, o
     `DELETE /ajustes/{ajusteId}`, **já estava no spec** (`openapi.yaml:1767`) —
     perdão sem assunto. Com a rota morta removida, a lista fica **vazia** e o
     invariante **spec = servidor** passa a ser total.
  5. **Duas recusas escritas.** Não há vermelho a citar no A8, porque o conserto
     é uma REMOÇÃO — o que prova o item é a lista vazia com o `lote2` verde. E a
     guarda contra o próximo perdão morto não foi escrita porque hoje não teria
     sujeito: virou a **S24**. As 4 cópias de `ui/` do sandbox, uma com o
     `calendar.tsx` que nunca recebeu o S19, viraram a **S23**.
  6. **A roteada que mudava o que o mundo vê:** as três metas do `index.html`
     traziam *"Moscow Noivas — built on Replit. Update this description…"* — é o
     texto que aparece ao colar o link no WhatsApp.
- **E104 parte 4 — desfazer o que a parte 3 quebrou.** Uma revisão do branch
  inteiro, no mesmo dia, mediu que a parte 3 destruiu o ativo que ela dizia
  preservar.
  1. **Tirar do workspace É tirar do alcance do `--filter`.** O Canvas roda
     `pnpm --filter @workspace/mockup-sandbox run dev`
     (`.replit-artifact/artifact.toml:17`), e a resposta virou `No projects
     matched the filters`. A nota da parte 3 afirmava o contrário — **um texto
     meu dizendo que verifiquei o que não verifiquei**, que é pior que o defeito.
  2. **O conserto separa duas coisas que a parte 3 amarrou:** a PARTICIPAÇÃO no
     workspace (que é o que o Canvas usa) e o CUSTO (que sempre esteve nos
     scripts da raiz). O pacote volta ao `packages:` e sai do `typecheck` e do
     `build` por `--filter "!@workspace/mockup-sandbox"`.
  3. **Desta vez eu abri a porta.** Com as variáveis do próprio `artifact.toml`
     (`PORT=8081`, `BASE_PATH=/__mockup`): `VITE ready in 931 ms` e `curl` no
     `/__mockup/` devolvendo **200**. `Scope: 3 of 12` — o ganho do A6 intacto.
  4. **O `pnpm install` devolveu 1.610 linhas ao lock, e conferi que nenhuma
     versão do app mudou:** o único `importers:` acrescentado é o do sandbox, e
     os blocos dos pacotes do app estão byte a byte idênticos.
  5. **A lição não é sobre pnpm.** A parte 3 mediu três afirmações do A6 e
     derrubou uma; errou por não medir a QUARTA — a que ela mesma escreveu como
     benefício. **A afirmação que a gente inventa para justificar a decisão é a
     que ninguém verifica**, porque já chega parecendo conclusão.
- **E110 — a avaria entra depois da entrada, e no carnê da noiva dela.** Fecha o
  único 🔴 confirmado da revisão do branch, mais o achado 8.
  1. **Não é 500, é 409 — e o 409 é PIOR.** A revisão previu que a colisão de
     UNIQUE viraria 500; o `erros.ts` do E107 mapeia `23505` para
     `409 REGISTRO_DUPLICADO`, **"Já existe um registro com estes dados."** A
     vendedora clica "Cobrar reparo", lê isso e conclui que **já cobrou**. Para
     de tentar, o reparo nunca entra no carnê e nada parece quebrado. Um 500
     seria investigado; este 409 é lido como confirmação.
  2. **O comentário era a origem do defeito.** A rota dizia `numero: 0` com
     *"fora da numeração do carnê"*, e o 0 **é a entrada** — escrito em
     `plano.ts:27`, inserido em `plano.ts:91`, e o comentário da própria UNIQUE
     já anunciava o choque. A rota irmã do MESMO épico E71 sempre fez `max+1`.
  3. **759 testes e 137 specs não pegavam porque o HELPER decidia o cenário.**
     `criarContrato` insere a linha e nada mais, então os sete testes do E97 e o
     `e2e/48` herdam contrato sem carnê — e com o slot 0 livre tudo passa. O
     defeito mora no caso normal (contrato com entrada), que era justamente o
     que ninguém montava. O `e2e/48` agora gera entrada + 4 parcelas e afirma
     `numero === 5`.
  4. **A guarda do achado 8 não pôde ser a óbvia: 61 das 63 avarias a
     derrubariam.** `bloqueio_vestidos.lead_id` é nullable, e 61 bloqueios
     `RESERVA_CASAMENTO` não têm noiva. Exigir sempre o vínculo trocaria um
     defeito raro por uma parede diária. A guarda **prova quando é provável**, e
     o limite está no código. Virou a **S27**.
  5. **Consertar a numeração NÃO desfaz o beco do `gerar-plano`** — medido depois
     do conserto: `numeroDaAvaria: 1`, `planoStatus: 409 JA_TEM_PLANO`. Consertar
     aquele guard sozinho MOVERIA a colisão. Virou a **S26**, com o mecanismo
     escrito, em vez de conserto de contrabando.
  6. **Um conserto só apareceu porque o outro foi feito:** `comToast` usava
     `err.message` e não `mensagemApi`, então o `detalhe` do servidor morria na
     tela — a guarda nova recusaria a cobrança sem dizer por quê. É a tese do
     E96 que esta tela nunca recebeu, e vale para as seis ações do arquivo.
