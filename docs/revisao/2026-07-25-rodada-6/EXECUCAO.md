# Rodada 6 — Execução (E91–E104) e histórico de sessões

**Branch:** `rodada-6/execucao` · **Base:** `01729db` (main)
**Plano:** `docs/propostas/2026-07-25-rodada-6-backlog.md`
**Diagnóstico:** `docs/revisao/2026-07-25-rodada-6/` (trilhas A–G, 121 achados)

## Como retomar esta rodada

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
| E98 | As telas se alcançam (E3 🔴, +9) | G | 🟨 | parte 1 (E3, F1, F5, F9, F27, F29) em `22f14b6`; parte 2 (F12, F2, F3, F4) em `7920576`; parte 3 (F7, F10, F14, F40, F43) em `PENDENTE`; faltam E9 (vai com o E99), F28 e F13 · [notas](execucao/E98.md) |
| E99 | A camada de UI que falta (D7, E6, E8, +6) | G | 🟨 | parte 1 (A5, D7, E17, E18) em `c8ff967` · [notas](execucao/E99.md) |
| E100 | O portal responde as perguntas da noiva (F35–F39) | G | 🟨 | parte 1 (F36, A11) em `5ae20fb` · [notas](execucao/E100.md) |
| E101 | A permissão diz o que a rota faz (B5, B7, B9, F42) | M | 🟨 | B5+B7+B9 em `0e8b37e` + `7d0a0dd`; falta F42 · [notas](execucao/E101.md) |
| E102 | Decisões de domínio financeiro (C5, C7, C8) | M | ✅ | `7dd9d09` · [notas](execucao/E102.md) |
| E103 | Roteiro do mês e da loja nova (F30–F34, F41) | M | 🟨 | parte 1 (F30, F31, F41) em `210c533` · [notas](execucao/E103.md) |
| E104 | Higiene de repo, build e bundle (A4, D8, +5) | M | 🟨 | A4 em `13944da`; A7/A12/A13/B15/C10 em `97bf55b`; falta D8 · [notas](execucao/E104.md) |

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
| S1 | **`DELETE /admin/lojas/:lojaId` (`admin.ts:100`) não tem guarda nenhuma** e cascateia a loja inteira — leads, contratos, parcelas, pagamentos — sem confirmação e sem trilha. É o irmão maior do B2, que o E91 fechou com 409 `USUARIO_COM_HISTORICO`. **Nenhuma das seis trilhas o viu**; é a prova da crítica 2 do método. | 🔴 | [E91](execucao/E91.md) vp2 |
| S2 | **`POST /contratos` não valida `bloqueioVestidoIds` contra o lead**, só contra a loja: um contrato pode prender a reserva física de OUTRA noiva da mesma loja. Não é vazamento entre lojas — por isso ficou fora do E91 —, mas é da mesma família. | 🟠 | [E91](execucao/E91.md) vp4 |
| S3 | **Ato global de superadmin não deixa trilha.** `registrarAuditoria` exige `lojaId` (`audit_log.loja_id` é `notNull`) e `DELETE /admin/usuarios/:id` é global. Hoje sobra um `req.log.warn`. Registrar em cada loja da pessoa multiplica a mesma ação em N linhas; não registrar exige mudar o schema da trilha. Vale para S1 também. | 🟠 | [E91](execucao/E91.md) "ficou de fora" |
| S4 | **`DELETE /contas-pagar/:id` não grava auditoria.** Apagar uma conta prevista é sumir com uma obrigação sem rastro — mesma classe do B3, um degrau abaixo (não move caixa realizado). | 🟡 | [E94](execucao/E94.md) vp1 |
| S5 | **A parcela PARCIAL sob `destinoPago: "manter"` é ambígua.** Ela vira CANCELADA, o que tira do horizonte o saldo que falta (certo) mas também tira do caixa realizado o que já entrou — e sob "manter" a loja está dizendo que ficou com o dinheiro. Representar "cancelada, mas o recebido permanece no caixa" exige decidir se o motor passa a olhar `valorRecebido` em vez do status: mudança de régua com alcance grande. Sob "estornar" não há ambiguidade. | decisão de produto | [E94](execucao/E94.md) vp2 |
| S6 | **O estorno avulso de parcela tem a mesma leitura-fora-da-transação do B6**, mas o `SET` dele é absoluto (sempre PREVISTA/null): dois estornos simultâneos convergem. Pior caso é auditar duas vezes, não perder valor. | 🔵 | [E94](execucao/E94.md) vp3 |
| S7 | **`e2e/25-confirmar-presenca` colide consigo mesma entre execuções.** Ela cria o atendimento sempre na cabine fixa `e2e-cabine-1`, às `14:mm:ss` de HOJE, num banco que persiste — quanto mais vezes a suíte roda no mesmo dia, maior a chance de 409 `Registro duplicado ou conflito de dados`. Mesma classe que a sobra da rodada 5 resolveu noutro spec ("recurso próprio por execução"). Um vermelho desses se lê como regressão de dinheiro e não é. | 🟠 (infra de teste) | [E95](execucao/E95.md) |
| S8 | **`contratos.ts` mantém `cent`/`reais` locais**, idênticos aos do `financeiro-core`, com dezenas de call-sites — a mesma classe do `parseValor` quadruplicado que o E95 fechou, em volume maior. | 🟡 | [E95](execucao/E95.md) vp |
| S9 | **O teto de orçamento (E33) compara em reais.** `acimaDoTeto` faz `totais.liquido > teto` em float enquanto o excedente já saiu para centavos. Um centavo no limiar, sem consequência de dinheiro — mas é régua pela metade. | 🔵 | [E95](execucao/E95.md) vp |
| S10 | **A tela de contrato gera o carnê às cegas.** O `gerar-plano` de lá não tem prévia, e desde o E95 existe a função para mostrá-la — é o F16 aplicado à tela irmã. | 🟡 | [E95](execucao/E95.md) vp |
| S11 | **D5 não se faz como está escrito — veredito medido, item aberto.** Derivar os resolvers dos 12 formulários do `api-zod` esbarra em duas coisas: o schema gerado descreve o PAYLOAD e o formulário valida a SUPERFÍCIE DE ENTRADA (`entrada`/`numParcelas` não existem no corpo da API), e importar o barril de 261 KB / 539 schemas num bundle que já tem 1,1 MB sem code splitting troca dívida de duplicação por dívida de peso. A duplicação real medida é **um** enum de cada lado, não doze. Caminho barato: teste de paridade dos dois enums, ou reavaliar depois do code splitting do E104. | 🟠 | [E96](execucao/E96.md) |
| S15 | **O `vitest` do frontend só coleta testes dentro de `src/lib`.** Teste de componente não chega a ser executado — descoberto ao escrever o do `<Erro>` e ver "No test files found". Ampliar o `include` é infraestrutura de teste e mora no E104, que já vai ligar o typecheck dos testes do front. | 🟡 | [E99](execucao/E99.md) |
| S13 | **`useBlocker` do react-router não existe neste app.** Ele monta as rotas com `<BrowserRouter>` (`App.tsx:160`), e o `useBlocker` só funciona em data router (`createBrowserRouter` + `RouterProvider`) — fora dele, lança. Sem ele, o D14 protege só o fechar/recarregar a aba: clicar na sidebar com um formulário sujo continua descartando em silêncio. Migrar o roteador toca todas as rotas do app. | 🟡 | [E97](execucao/E97.md) |
| S14 | **As avarias antigas ficaram sem `parcela_id`.** Não há backfill possível: casar por texto ("Reparo de avaria — …") adivinharia, e duas avarias com a mesma descrição no mesmo contrato são indistinguíveis — que é justamente o caso do duplo clique. Elas seguem cobráveis de novo e removíveis; a guarda vale para o que nasce daqui. | 🔵 | [E97](execucao/E97.md) |
| S16 | **`leads.contrato_fechado_em` fica `null` em quem tem contrato, e um relatório conta por ela.** O carimbo só é gravado dentro do `if (etapaNova !== lead.etapa)` de `contratos.ts:335` — e `transicaoLeadValida` aceita pular no funil (`iPara > iDe`), então um lead levado de `NOVO` direto a `EM_PROVAS` fecha contrato sem que a etapa mude, e a coluna nunca é preenchida. O `comContrato` de `/leads/sazonalidade` (`leads.ts:397`) filtra por `contratoFechadoEm is not null`: aquela noiva não é contada como "já fechou" na curva que diz quando falta vestido. O conserto é gravar o carimbo mesmo quando a etapa não avança; o backfill pergunta à tabela de contratos, que é a fonte. | 🟡 | [E98](execucao/E98.md) parte 2 |
| S12 | **`classificarErro` põe frase no campo que virou contrato de CÓDIGO.** Os 409 de Postgres saem como `{ error: "Registro duplicado ou conflito de dados" }` — português, mas texto livre onde o E96 estabeleceu que vai código. Nenhuma tela consegue traduzir aquilo para algo específico, e foi exatamente o que apareceu no flake do E2E (S7) vestido de erro de dinheiro. Última fonte de texto livre em `error`. | 🟡 | [E96](execucao/E96.md) vp |

### Roteadas a um épico que ainda não rodou

O dono do épico **lê esta seção antes de começar** — foi a única forma de a
sugestão sair da nota de um épico alheio e chegar a ele.

| Épico | Item herdado | Origem |
|---|---|---|
| E96 | `selecionar-loja.tsx` faz `catch (error: any)` — resquício do padrão antigo, na tela que o E93 mexeu. | [E92](execucao/E92.md) vp |
| E99 | `/vestidos` renderiza **114 cards com foto** de uma vez (E19); a `<h2>` que o E92 pôs já diz o número, a paginação continua sendo daqui. | [E92](execucao/E92.md) vp |
| ~~E99~~ | ~~`chart.tsx` e `calendar.tsx` com `toLocaleString` sem locale.~~ **Resolvido pela metade e sem querer:** a poda do E99 apagou o `chart.tsx`, então metade da sobra deixou de existir. Sobra `calendar.tsx:40`, que tem consumidor e continua usando `toLocaleString("default", …)` — entra no D15 (item 10 do E99, parte 2). | [E92](execucao/E92.md) vp · [E99](execucao/E99.md) |
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
  3. **O sexto link não é um link, e por isso ficou de fora.** O F28 supõe uma
     parcela por linha, e a linha de `/cobranca` é por **noiva** — ela agrega N
     parcelas vencidas. "Receber" ali precisa responder *qual*, e a resposta
     menos arbitrária (a mais antiga) exige expor a parcela no `agingDeParcelas`,
     que é núcleo testado, além de extrair o diálogo da tela de dinheiro. Cinco
     links de navegação e uma refatoração da tela de receber não pertencem ao
     mesmo commit — é o cuidado (a) do próprio épico.
