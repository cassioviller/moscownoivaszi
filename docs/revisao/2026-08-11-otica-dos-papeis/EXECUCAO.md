# Execução — os 14 épicos da revisão pela ótica dos papéis

**Aberta em 2026-08-11**, base `f9a8d62` (`main`, publicado). O plano é
`docs/propostas/2026-08-11-otica-dos-papeis-plano.md`; os achados estão em
`CODE-REVIEW.md` (90, dos reviews) e `achados/01..08-*.md` (59, dos ângulos).

Suíte de partida: **API 1134 · frontend 536 · E2E 165 · typecheck verde em 5
projetos**. Com **as quatro faixas fechadas** a régua é **API 1238 · frontend
589 · E2E 171 · typecheck verde em 5 projetos** — e o E2E cobre, pela primeira
vez, o **caminho público** (E166) e a **avaria sem noiva própria** (E167).

## A fila

**Conte as linhas, não deduza.** A que não está riscada é a que está aberta.

| Épico | Tese | Faixa | Estado |
|---|---|---|---|
| ~~**E158**~~ | ~~`contratos.ts`: toda guarda relê sob a tranca, e o duplicado morre no banco~~ | A | ✅ `09d65d8` · [relatório](execucao/E158.md) |
| ~~**E159**~~ | ~~`reservas.ts`: as quatro portas sem tranca, e o estado terminal em todas~~ | A | ✅ `6eb4fda` · [relatório](execucao/E159.md) |
| ~~**E160**~~ | ~~orçamento e aceite: o CAS entra na tranca, e o que a noiva viu é o que se grava~~ | A | ✅ `b2f57ab` · [relatório](execucao/E160.md) |
| ~~**E161**~~ | ~~agenda: o eixo da vendedora, e o PATCH que pulava a recusa~~ | A | ✅ `747ae5e` · [relatório](execucao/E161.md) |
| ~~**E162**~~ | ~~o aceite ganha um caminho até o contrato (**o épico-bandeira**)~~ | B | ✅ `b39d292` · [relatório](execucao/E162.md) |
| ~~**E163**~~ | ~~as guardas que se desligam no nulo~~ | B | ✅ `d37fa3a` · [relatório](execucao/E163.md) |
| ~~**E164**~~ | ~~o escopo da noiva: loja E dona, em toda porta~~ | C | ✅ `0eeb297` · [relatório](execucao/E164.md) — encolhido pelo E161 (G2/A05.3 fecharam lá) |
| ~~**E165**~~ | ~~o PDF fala a verdade e cabe na página~~ | C | ✅ `784dd3c` · [relatório](execucao/E165.md) |
| ~~**E166**~~ | ~~o link público cumpre o que promete~~ | C | ✅ `3af3064` · [relatório](execucao/E166.md) — fecha a S-O7 junto; **o primeiro E2E do caminho público** (eram zero) |
| ~~**E167**~~ | ~~a avaria fecha~~ | C | ✅ `8b12b0d` · [relatório](execucao/E167.md) — **o V14 do plano pedia um conserto impossível** (não existe `GET /reservas/:id`) |
| ~~**E168**~~ | ~~a agenda diz a mesma coisa em todas as telas~~ | C | ✅ `4db042d` · [relatório](execucao/E168.md) — nove achados, **G8 são três cópias e não quatro** |
| ~~**E169**~~ | ~~a tela do contrato e o dinheiro miúdo~~ | C | ✅ `fe8afdd` · [relatório](execucao/E169.md) — dez itens, inclusive a **S-M10** herdada da revisão max; fecha a S-O14 por decisão |
| ~~**E170**~~ | ~~os testes que pregavam o defeito passam a pegá-lo~~ | D | ✅ `50a4043` · [relatório](execucao/E170.md) — **3 dos 5 já tinham fechado**; nasce a **regra 34** do METODO |
| ~~**E171**~~ | ~~a varredura que conta as portas~~ | D | ✅ `30a8377` · [relatório](execucao/E171.md) — **26 portas, não 14**; achou 4 abertas, e a 🟠 estava **dentro do E166 desta mesma sessão** — fechada em `7763ee3`, com a própria varredura cobrando a baixa da dívida |

A **Faixa A é serial** — os quatro mexem nas mesmas transações. A **Faixa C
paraleliza**. O `/code-review ultra` roda sobre a branch de cada faixa antes do
merge.

**A Faixa C paralelizou de verdade, e a medida ficou:** E167, E168 e E169
rodaram em três worktrees simultâneos, ~50 min de relógio, e os três
`cherry-pick` entraram no `main` **sem um único conflito** — inclusive no
`openapi.yaml`, que dois deles editaram em blocos diferentes (o codegen
re-rodado sobre o spec fundido deu **zero drift**). O que o paralelo cobrou foi
**numeração**: os três reservaram faixas de S-O que colidiram entre si e com as
do E166, e a reconciliação é do integrador, não dos agentes.

**O 🟠 que os três relataram não existia.** Os três mediram
`backup-download-api.test.ts` reprovando com `expected 200 "OK", got 500`
(`NotFoundError` do `send`) e o classificaram como vermelho pendente da regra
18 — um deles como 🟠. No `main` o arquivo passa (**7 passed**), e a causa é o
ambiente: `res.download` recusa caminho com **componente oculto**, e todo
worktree de agente vive sob `.claude/worktrees/`. Medido com uma sonda de duas
linhas — `limpo → 200`, `oculto → 404 NotFoundError`. Ficou como capacidade no
`replit.md` (regra 8) e como a sobra **S-O26**, que é o defeito real que a
investigação achou: a rota não trata o erro do `send`.

## Sobras

Vistas de passagem durante a execução, na regra 12: entram aqui **no mesmo
commit** do épico que as viu.

| # | Sobra | Sev | Vista em | Estado |
|---|---|---|---|---|
| S-O1 | `PARCELAS_RENUMERADAS` não entrou em `ACOES_FILTRAVEIS` (`moscow-noivas/src/lib/financeiro/auditoria.ts:66`) — o select da trilha não a oferece. A lista já era curada e incompleta (`RESERVA_CANCELADA` também está fora): é a mesma dívida com um item a mais, não regressão do E158 | 🔵 | E158 | aberta |
| S-O2 | O 23505 do `contratos_lead_ativo_unico` vindo de porta que não seja o `POST /contratos` sai como `REGISTRO_DUPLICADO` genérico — o K9 um nível acima: `erros.ts:181-185` não traduz índice por índice | 🔵 | E158 | aberta |
| S-O3 | O gerador de zod **perde restrições do spec**, e já custou dois achados: o `integer` de `numParcelas` (P5, `openapi.yaml:6279` → `zod.number().min(1).max(360)`) e a coerção de `null` em `zod.coerce.date()`, que devolve 1970 com `success: true` (V12). Os dois foram fechados na rota; a CLASSE não foi varrida, e ela não é greppável pelo spec. Material para o E171 | 🟡 | E158, E159 | aberta |
| S-O4 | **R6** — o PATCH de reserva propaga `casamentoData` sem perguntar aos contratos ATIVOS. O PDF e o portal seguem dizendo 10/05, a janela fica livre para outra noiva, e o `PATCH /contratos` responde "mude a reserva primeiro" — a reserva que já mudou. **Não está em épico nenhum do plano** | 🟡 | E159 | aberta |
| S-O5 | **R8** — o soft-cancel de bloqueio não toca em `atendimentos`: a prova segue AGENDADA apontando bloqueio cancelado, a peça é alugada para outra e sai na retirada, e a noiva chega para a prova sem vestido. Confirma o A05.2. **Não está em épico nenhum do plano** | 🟡 | E159 | aberta |
| S-O6 | `contarHistoria` e `cobrancaViva` recebem o executor como `typeof db` com cast — o tipo de transação do drizzle não é atribuível ao do pool. `DbExecutor` (`disponibilidade.ts`) resolveria os dois | 🔵 | E159 | aberta |
| S-O7 | ~~O aceite pelo PORTAL não manda `versao` (o C2 do E160)~~ — **FECHADA no E166**, e o argumento que a mantinha aberta estava errado de lado: não é preciso EXIBIR o número de versão, é preciso devolver o que a página LEU — e ela recebe `versaoNumero` desde sempre (o portal monta a proposta com a mesma `montarOrcamentoPublico`). Enquanto isso não valia, a mesma proposta tinha duas portas e só uma protegida | 🔵 | E160, E166 | **fechada (E166)** |
| S-O8 | ~~C2 descreve um mecanismo real sobre um gatilho que não existe~~ — **FECHADA no E162**: o desfazer-aceite volta a RASCUNHO e o relink congela versão nova; a guarda `versaoVista` foi conferida contra o gatilho REAL no teste A01.2/S-O8 | 🟡 | E160, E162 | **fechada (E162)** |
| ~~S-O10~~ | ~~A etapa **ACEITO** no funil é decisão de produto não perguntada~~ — **DECIDIDA em `82716c3`: o aceite é CARIMBO, não coluna.** A pergunta que o funil responde é *onde ela está*, e o aceite não muda isso — ela segue negociando até o contrato existir; o que muda é o que a LOJA tem de fazer. A etapa custaria enum do banco com migração, régua de transição, régua de conversão e uma **12ª coluna** num kanban que já se arrasta em 11 no celular — e **não mexeria na conversão**, que conta a partir de CONTRATO_FECHADO porque aceite não é venda enquanto o vestido pode sair para outra. Nasce `leads.aceiteEm` (migração 0016), irmão de `orcamentoAbertoEm` e `contratoFechadoEm`, e dele saem o selo **"Aceitou — falta o contrato"** no card e a medida agregada que faltava. **O carimbo é independente da ETAPA**, e essa é a metade que não era óbvia: criar o orçamento já leva a noiva a ORCAMENTO_ABERTO, então no caso comum a etapa não muda no aceite e o bloco que gravava rodava só quando ela mudava — o selo ficaria apagado justamente para quem ele existe. Vermelho medido: `expected null not to be null` | 🟡 | E162, decisão do Renato | **decidida e feita** |
| S-O11 | A reserva no lead **errado** segue sem troca de dona (a metade do A02.4 que não entrou): a ficha da reserva não edita `leadId`; a adoção só cobre a sem dona | 🟡 | E162 | aberta |
| ~~S-O12~~ | ~~`proximo-passo.ts` sem o ramo do aceite: a faixa da ficha ainda diz "Enviar a proposta" com proposta aceita~~ — **FECHADA em `710b254`**: `temAceiteSemContrato` entra na régua e a faixa passa a dizer **"Fechar o contrato — ela já disse sim"**. O dado já estava na ficha (a lista de orçamentos traz `aceitoEm`); faltava chegar à régua. Vermelho medido: `expected 'Enviar a proposta para ela' to be 'Fechar o contrato'`. **A etapa "ACEITO" do funil continua não existindo** — é a S-O10, decisão de produto, e o conserto foi feito sem depender dela | 🔵 | E162, manual da vendedora | **fechada** |
| S-O14 | ~~O botão "Baixar PDF" da tela de contrato não distingue vivo de cancelado~~ — **FECHADA POR DECISÃO no E169: o botão NÃO muda.** A tarja do E165 tirou o risco (o papel do cancelado diz que é cancelado), o cancelado é justamente o documento que a loja precisa imprimir **para provar o cancelamento**, e o estado já é dito duas vezes ao lado do botão (chip `destructive` + `Alert` com motivo e data) | 🔵 | E165, E169 | **fechada (E169, decisão)** |
| S-O13 | Os três sítios de tela que já liam `descontoTipo && descontoValor` (portal, página pública, orçamento) seguem com a expressão inline em vez de `temDesconto` — comportamento certo, régua não nomeada. Higiene | 🔵 | E163 | aberta |
| S-O15 | As **duas portas que congelam versão fazem metades diferentes do mesmo gesto**: o `POST /link` reabre a validade da proposta vencida (D3), o PATCH que marca ENVIADO não reabre nada. Hoje não produz defeito — a vendedora que reenvia passa pelo link —, mas é a forma exata que o C8 já teve uma vez (a pré-condição em dois lugares, divergindo). Material para o E171 | 🔵 | E166 | aberta |
| S-O16 | A página pública lê `dados!` com `!` em dezoito lugares (`orcamento-publico.tsx`). Padrão da tela desde o E13, sem defeito hoje (o ramo de erro retorna antes) — é a asserção que sobrevive a uma refatoração e vira `undefined` em produção | 🔵 | E166 | aberta |
| S-O9 | `trancarEixos` (E161) tranca a linha da vendedora em `usuarios`, tabela quente compartilhada com login/equipe. Contenção improvável (a tranca dura a transação do agendamento); se aparecer, a alternativa é advisory lock por `(lojaId, vendedoraId)` | 🔵 | E161 | aberta |
| S-O17 | `listBloqueios` não preenche `donoLeadId`, que o schema `BloqueioVestido` declara. Só `GET`/`PATCH` do bloqueio o trazem. Nenhuma tela pede hoje; quem pedir recebe `undefined` em silêncio | 🔵 | E167 | aberta |
| S-O18 | **Não existe `GET /reservas/:id`** — a única leitura de reserva é a listagem da loja inteira. Foi o que impediu o V14 de ser consertado só na tela (o plano pedia um conserto impossível), e é a mesma fresta em que o V5 esbarra | 🔵 | E167 | aberta |
| S-O19 | O teto de 2 MiB da foto de avaria é declarado **três vezes, independentes**: `AVARIA_FOTO_MAX_BYTES` (servidor), `arquivo.size > 2*1024*1024` (tela) e o `4mb` do parser em `app.ts`. Mudar uma deixa as outras mentindo — é a classe que produziu o V1 | 🔵 | E167 | aberta |
| S-O20 | `contratoAtivo` na ficha da reserva é o PRIMEIRO ATIVO da lista: com dois contratos ativos da mesma noiva, o reparo entra no que a tela escolheu, sem dizer qual | 🔵 | E167 | aberta |
| S-O21 | `jaContatadasNaJanela` (`mensagens-do-dia.ts:113`) re-deriva pela negativa a régua que virou `faltaProcurar` no G14 — os três fatos copiados de novo, no sítio que o épico não abriu | 🔵 | E168 | aberta |
| S-O22 | `atendimentos/config.tsx` baixa **toda a agenda futura da loja** para contar quantos atendimentos ficam na cabine que está sendo desativada: `GET /atendimentos` não tem filtro por `cabineId`. Com três anos de loja, é a lente 3 | 🟡 | E168 | aberta |
| S-O23 | A validação do G12 compara o par efetivo contra `expedienteDaRegra(null)` = `EXPEDIENTE_PADRAO`; o espelho dos defaults do schema é pregado pelo teste do E147, mas **nada liga o espelho a ESTA validação** — default de coluna mudado sem o espelho faz o PUT recusar (ou aceitar) a hora errada | 🔵 | E168 | aberta |
| S-O24 | **`POST /orcamentos/:id/desfazer-aceite` exige DUAS ações**: declara `requireModulo("leads","editar")` (`routes/orcamentos.ts:438-440`) e o guard de prefixo (`:168`) deriva `criar` antes, porque `POST_QUE_MUTA` (`lib/permissoes.ts:102-103`) não tem o verbo. A gerente com `{ver, editar}` e sem `criar` leva 403 numa ação que é dela — a história do `receber` que o comentário daquele arquivo conta, com outro nome. Um verbo na regex fecha | 🟡 | E169 | aberta |
| S-O25 | **O teto do desconto em VALOR (A07.3) não é reconferido quando ITENS SAEM.** Desconto de R$ 4.000,00 sobre R$ 5.000,00 em itens passa (e deve); remover o item de R$ 2.000,00 deixa bruto 300000c contra desconto 400000c e o líquido clampa em **R$ 0,00** de novo, pelo `DELETE /orcamentos/itens/:id` e pelo `PATCH` de item, que não perguntam nada sobre desconto. É a metade de baixo do A07.3, e não está em achado nenhum | 🟡 | E169 | aberta |
| S-O27 | **A ficha e a fila do ajuste usam limiares diferentes de urgência, e o comentário diz que são o mesmo.** `ajustes-da-semana.ts:naSemana` = casamento ≤7 dias; `ajustes/[ajusteId].tsx:78` = casamento ≤14 dias, sob o comentário *"A mesma régua de urgência da fila"*. Casamento em 10 dias: vermelho na ficha, fora de "Esta semana" na fila. É a quarta grafia da régua (regra 26) | 🟡 | E170 | aberta |
| S-O28 | **A confecção sem peça de acervo não tem onde nascer pela interface.** `reservas/[bloqueioId].tsx:377` é o único formulário de ajuste do repositório e vive dentro do bloco de provas de uma reserva; `POST /ajustes` (`agenda.ts:866`) a aceita sem bloqueio. O E170 fez o prazo dela aparecer na fila; ninguém consegue cadastrá-la sem passar pela API | 🟡 | E170 | aberta |
| S-O29 | **A07.4 🟡 viva: nenhum teste afirma o que o `aceiteHash` NÃO cobre.** O hash prende valor, desconto e descrição, e **não a IDENTIDADE da peça** — o `vestidoId` fica de fora. `contratos.ts:458-459` já registra a mesma descrição saindo para noivas diferentes. Um teste que troque o `vestidoId` mantendo o conteúdo e prove que o contrato passa é a régua que falta | 🟡 | E170 | aberta |
| S-O30 | **A A05.5 🟡 fechou no E170 e não tinha linha em rastreador nenhum** — ela só existia em `achados/05-costureira-provas-ajustes.md:277-337`. Fica registrada aqui para a contagem de achados fechados da trilha não sair um a menos | 🔵 | E170 | **fechada (E170)** |
| ~~S-O31~~ | ~~O `POST /orcamentos/:id/link` decide congelar a versão pelo `status` lido no POOL: dois cliques em "gerar link" no mesmo segundo congelam **DUAS versões da mesma proposta** — e é a versão congelada que o gate do E115 confere contra o contrato~~ — **FECHADA em `7763ee3`**, no mesmo dia em que nasceu. As três perguntas (existe nesta loja? RECUSADO? tem item?) e as duas decisões (marcar ENVIADO, congelar) foram para DENTRO da transação, sob `FOR UPDATE` — o padrão que as portas de item já usavam via `sobPaiTrancado`. Vermelho medido: `expected [ … ] to have a length of 1 but got 2`. **A varredura do E171 cobrou o fecho duas vezes**: primeiro acusando a porta, depois ficando VERMELHA quando a dívida caiu de 6 para 5 (`expected 5 to be 6`) — é a contagem travada, não a lista de nomes | 🟠 | E171, E166 | **fechada** |
| S-O32 | As três portas de `comissao.ts` que escrevem `contratos.comissao_estornada_em` **não trancam a linha do contrato**: `:1035` (reabrir fechamento — tranca a CONTA A PAGAR, não o contrato), `:1301` (fechar competência, sem tranca) e `:1407` (baixar estorno à mão, sem tranca). Reabrir × fechar no mesmo segundo decidem a mesma coluna em ordens diferentes: o estorno volta a PENDENTE e é recarimbado sem ter sido abatido. **`comissao.ts` não está em épico nenhum do plano** — é a única tabela quente que as Faixas A e B não abriram | 🟡 | E171 | aberta |
| S-O33 | A varredura conta a tranca e **não a ORDEM** (`lead → contrato → parcelas → bloqueios ORDENADOS → vestidos ORDENADOS`, `contratos.ts:586-594` e `reservas.ts:62-71`). Deadlock é o modo de falha que a ordem existe para evitar, e uma porta nova na ordem inversa passa verde. Resolver exige saber qual LINHA cada `FOR UPDATE` segura, não só qual tabela | 🔵 | E171 | aberta |
| S-O34 | `parcelas` não está entre as quatro tabelas quentes da D4, **e é a tabela onde o dinheiro mora** — o E158 já teve de trancá-la (`contratos.ts:1170-1174`). A quinta coluna da varredura é ela; o enumerador aceita a tabela nova em uma linha de `TABELAS_QUENTES` + `PAIS` + `COLUNAS_DE_ESTADO` | 🔵 | E171 | aberta |
| S-O35 | Duas referências `arquivo:linha` **dentro do código** envelheceram: `reservas.ts:64` aponta a ordem das trancas em `contratos.ts:521-532` (mora em `:586-594`) e `contratos.ts:1068` aponta o DELETE de parcela em `:1300-1304` (mora em `:1711`). O `docs/` tem régua para isso; o comentário de código não tem | 🔵 | E171 | aberta |
| S-O36 | **Não existe perfil para a COSTUREIRA, e dar-lhe acesso hoje custa a carteira de leads da loja.** A fila de ajustes pede `requireModulo("agenda")` (`agenda.ts:248`), e o perfil mais fechado que concede agenda é a **Recepção** (`configuracao-inicial.ts:105-109`), que traz `leads` ver+criar junto. Um perfil "Costureira" com `agenda` e nada mais é uma linha em `PERFIS_PADRAO` — mas mexe em SEED, então pede a régua do banco virgem e uma decisão da dona sobre o que ela enxerga da agenda. Visto ao levantar papéis × perfis para o plano dos manuais | 🟡 | plano dos manuais | aberta |
| S-O37 | **A Vendedora fecha CONTRATO, e isso nunca foi escrito em lugar nenhum.** `contratos.ts` e `orcamentos.ts` pedem `requireModulo("leads")`, e o perfil Vendedora tem `leads: TUDO` — quem lê os quatro perfis não descobre que "leads" inclui assinar um contrato de R$ 5.000,00. Pode estar certo (é ela quem vende), mas é decisão implícita: o módulo que separa dinheiro é `financeiro`, que ela não tem. O manual vai ter de declarar, e a declaração é o momento de confirmar com a dona | 🔵 | plano dos manuais | aberta |
| ~~S-O38~~ | ~~**O botão "Lookbook" leva a uma página que não existe**, em dois lugares: a barra "Atendendo…" e a linha do atendimento EM_ATENDIMENTO. Os dois apontam `/noivas/:leadId/lookbook`, e **não há essa rota** — o lookbook é um CARD da ficha. A vendedora lê "Não encontramos esta página" **no meio de um atendimento**~~ — **FECHADA em `710b254`**: os dois botões passam a apontar `#lookbook` na ficha, o card ganhou `id` e a ficha rola até ele (o mesmo gesto que `reservas/[bloqueioId]` já usava). E nasceu a **varredura de links internos** (`lib/varredura-links-internos.test.ts`), que confere os **113 destinos literais** do frontend contra as **63 rotas** declaradas e pega a CLASSE. Vermelho medido: os dois destinos nomeados com `arquivo → destino` | 🟡 | manual da vendedora | **fechada** |
| S-O39 | **O link da proposta morre em 7 dias e a proposta vale 30** — `CONVITE_TTL_MS` (`lib/auth.ts:11`) contra `VALIDADE_PADRAO_DIAS` (`orcamentos.ts:108`). A noiva que abre o WhatsApp no décimo dia lê "link expirado" numa proposta que ainda vale, e a vendedora precisa saber que o remédio é gerar o link de novo. Pode ser decisão (o link é chave, a validade é preço), mas **nunca foi escrita**, e o TTL do link é o do CONVITE DE EQUIPE reaproveitado — não uma escolha sobre propostas. Documentado no manual como está; a decisão é do Renato | 🟡 | manual da vendedora | aberta |
| S-O26 | `res.download` (`admin.ts:762`) **não trata erro**: o que vaza para o cliente é 500 com a stack do `send`, não uma mensagem. O `existsSync` acima cobre o caso comum, mas todo motivo restante de recusa do `send` (permissão, dotfile no caminho, corrida com a poda) sai como erro cru numa rota de administração | 🔵 | E167, E168, E169 (os três o viram) | aberta |

## O que herda das trilhas anteriores

Continuam abertas e **nenhum épico daqui as toca**:

- **S-M17** (revisão max) — espera um dump de instalação real. A contagem C2 da
  Fase 0 confirmou que `moscow_base` tem 0 contratos e 0 parcelas.
- **S-A2** e **S-A27** (arqueologia) — esperam gente: as fotos que faltam do
  caderno, e classificar as 132 peças do legado com a dona.

A **S-M10** (campo vazio = apague) deixou de ser sobra solta: ela está dentro do
**E169**.
