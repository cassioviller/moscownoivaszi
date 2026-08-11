# Execução — os 14 épicos da revisão pela ótica dos papéis

**Aberta em 2026-08-11**, base `f9a8d62` (`main`, publicado). O plano é
`docs/propostas/2026-08-11-otica-dos-papeis-plano.md`; os achados estão em
`CODE-REVIEW.md` (90, dos reviews) e `achados/01..08-*.md` (59, dos ângulos).

Suíte de partida: **API 1134 · frontend 536 · E2E 165 · typecheck verde em 5
projetos**. Com a **Faixa C fechada** (E164–E169) a régua é **API 1219 ·
frontend 584 · E2E 171** — e o E2E cobre, pela primeira vez, o **caminho
público** (E166) e a **avaria sem noiva própria** (E167).

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
| E170 | os testes que pregavam o defeito passam a pegá-lo | D | ⏳ próximo |
| E171 | a varredura que conta as portas | D | ⏳ |

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
| S-O10 | A etapa **ACEITO** no funil é decisão de produto não perguntada: o aceite avança até ORCAMENTO_ABERTO e a fila responde a visibilidade, mas `ETAPAS_CONVERTIDA` não enxerga o sim, e "do orçamento ao contrato leva quantos dias" segue sem medida agregada | 🟡 | E162 | aberta |
| S-O11 | A reserva no lead **errado** segue sem troca de dona (a metade do A02.4 que não entrou): a ficha da reserva não edita `leadId`; a adoção só cobre a sem dona | 🟡 | E162 | aberta |
| S-O12 | `proximo-passo.ts` sem o ramo do aceite: a faixa da ficha ainda diz "Enviar a proposta" com proposta aceita — `EntradaProximoPasso` não carrega orçamentos. A fila e o cartão cobrem o caso; o ramo fecharia o A01.5 por inteiro | 🔵 | E162 | aberta |
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
| S-O26 | `res.download` (`admin.ts:762`) **não trata erro**: o que vaza para o cliente é 500 com a stack do `send`, não uma mensagem. O `existsSync` acima cobre o caso comum, mas todo motivo restante de recusa do `send` (permissão, dotfile no caminho, corrida com a poda) sai como erro cru numa rota de administração | 🔵 | E167, E168, E169 (os três o viram) | aberta |

## O que herda das trilhas anteriores

Continuam abertas e **nenhum épico daqui as toca**:

- **S-M17** (revisão max) — espera um dump de instalação real. A contagem C2 da
  Fase 0 confirmou que `moscow_base` tem 0 contratos e 0 parcelas.
- **S-A2** e **S-A27** (arqueologia) — esperam gente: as fotos que faltam do
  caderno, e classificar as 132 peças do legado com a dona.

A **S-M10** (campo vazio = apague) deixou de ser sobra solta: ela está dentro do
**E169**.
