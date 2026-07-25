# Rodada 6 — As bordas (E91–E104)

Plano pós code-review completo, ancorado no código como está em `01729db`. As
seis trilhas de diagnóstico (`docs/revisao/2026-07-25-rodada-6/`) levantaram
**121 achados** — 9 🔴, 55 🟠, 47 🟡, 10 🔵 — e a conclusão que atravessa todas
elas é uma só: **o miolo está certo e as bordas não o usam.** O contrato bate
com a implementação em 177 × 178 operações, os três motores puros são
consumidos dos dois lados com teste, o E79 não duplicou agregação em SQL, os
tokens de design são usados de verdade e não há um botão sem nome acessível em
16 rotas. E, ao lado disso: a tela de orçamento reimplementa a aritmética do
servidor em float, o `alerta-caixa` reimplementa o motor esquecendo um status,
quatro rotas aceitam id do corpo sem passar pela régua de escopo que existe no
repo, o `api-zod` gerado tem zero consumidores no frontend, e em 8 das 9
jornadas a tela onde a pessoa descobre o problema não é a tela onde ela pode
resolvê-lo. Quase todo épico daqui é **adotar o que já existe**, não inventar.

Regra da casa mantida: nenhuma API externa, contrato OpenAPI como fonte da
verdade, cada épico com teste no commit.

**Ordem recomendada: E91 → E92 → E93 → E94 → E95 → E96 → E97 → E98 → E99 →
E100 → E101 → E102 → E103 → E104**, com o porquê:

- **E91 primeiro, sempre.** É o único épico com vazamento entre lojas e perda
  irreversível de dado. Um `curl` derruba o administrador da loja vizinha, e um
  clique em "excluir usuário" apaga contratos e parcelas PAGAS. Nada disso
  espera.
- **E92 logo em seguida porque paga a rodada em horas.** Dezesseis achados, dois
  deles 🔴, quase todos de uma linha: `<html lang="pt-BR">` conserta 27 campos
  de data em 14 telas; dois tokens tiram todo botão do sistema da reprovação de
  contraste. É o melhor retorno por hora do documento inteiro.
- **E93 antes de qualquer coisa de tela**, porque o loop de render do D1 deixa a
  página inutilizável e porque a ordem interna dele é obrigatória: **a
  invalidação do caixa (D9) vem antes do `staleTime` (D3)** — inverter converte
  um incômodo de rede em dado financeiro velho e persistente.
- **E94 antes do E95** porque o C4 é o único achado que faz dois números do
  sistema discordarem **em produção hoje**, e custa duas linhas de SQL. Dinheiro
  errado barulhento espera; dinheiro errado silencioso não.
- **E95 é o maior e o de maior retorno**: treze achados de cinco trilhas, um
  arquivo, uma direção. Vem depois do E94 porque compartilha a decisão sobre
  centavos e porque o E94 já terá exportado do core as listas de status.
- **E96 depois do E95** porque só então os códigos de erro do fluxo comercial
  estão estabilizados — traduzir antes é traduzir um alvo móvel. (A perna barata
  do E96, o dicionário em `orcamentos/[id].tsx`, pode ser antecipada: vale mesmo
  com o C1 vivo.)
- **E97 e E98 antes do E99** porque os dois definem *o que* as telas precisam
  mostrar; o E99 padroniza *como*. Fazer a camada de UI antes é padronizar
  telas que ainda vão mudar de conteúdo. Em particular, o cabeçalho de detalhe
  do E98 (E9) é o insumo do `<Breadcrumb>` do E99.
- **E100 a E103 são independentes entre si** e podem ser reordenados por
  prioridade de negócio. O E102 é o único que precisa de **resposta antes de
  código** (três decisões de produto) — vale disparar a pergunta no início da
  rodada e executar quando a resposta chegar.
- **E104 por último** porque é higiene: nenhuma dor de usuário depende dele. A
  exceção é a primeira ação (`.migration-backup/`), que vale antecipar para o
  dia 1 porque envenena toda busca de quem for executar os outros treze épicos.

---

## E91 — A fronteira da loja: nenhum id entra sem prova de pertencimento

**Esforço: M** · **Fecha: B1 🔴, B2 🔴, B4 🟠, B10 🟡, B12 🟡** (+ a parte
correspondente do B14)

**A dor.** `PATCH /lojas/:lojaId/equipe/:usuarioId` é gateado por
`requireModulo("admin")` na loja da sessão, e depois faz `UPDATE usuarios SET
nome, ativo WHERE id = <id do path>` — na tabela **global**, sem uma única
condição de loja. A conferência de pertencimento só acontece no SELECT final,
**depois** do commit: o 404 é cosmético. A dona da loja A obtém o id da dona da
loja B (ele aparece em qualquer resposta com `vendedora`/`criadoPorId`) e manda
`{"ativo": false}`: `buscarSessao` passa a devolver `null`, o login é recusado,
as sessões vivas caem, e a loja B fica sem administrador — com o registro de
auditoria na loja A, onde a vítima nunca olha. Ao lado disso, `lib/escopo-loja.ts`
existe, tem quatro funções prontas e um docstring que descreve exatamente este
ataque, e é usado em quatro rotas: contrato (`vendedoraId`), orçamento
(`leadId`), conta a pagar (`colaboradorId`) e recorrência (`usuarioId`) entram
sem conferência — o que devolve a ficha inteira de uma noiva de outra loja via
`with: { lead: true }` e gera comissão nominal a quem não é da loja. E
`contratos.vendedoraId` é `ON DELETE CASCADE`, contrariando a decisão escrita no
`replit.md`: excluir uma vendedora pelo console apaga os contratos dela, as
parcelas **PAGAS** com `recebidoEm`, o snapshot de itens, os orçamentos, os
atendimentos e os fechamentos de comissão — sem confirmação, sem trilha, e
mudando o caixa realizado retroativamente.

**Feito significa.** Nenhuma escrita do sistema aceita um id que não tenha sido
provado como pertencente à loja da URL; excluir uma pessoa com histórico é
recusado com uma mensagem que ensina o caminho certo (inativar); e toda tabela
quente tem índice pela coluna que abre 100% das queries.

**Escopo técnico.**
1. `routes/equipe.ts`: ler o vínculo `usuarios_lojas (lojaId, usuarioId)` ANTES
   de qualquer escrita e responder 404 quando não houver — `vendedoraNaLoja`
   (`lib/escopo-loja.ts:29`) serve sem uma linha nova. Vale para o UPDATE de
   `nome`/`ativo` (`:331-339`), para o `encerrarSessoesDoUsuario` (`:352`,
   `:421`) e para o DELETE, que hoje responde 204 mesmo sem ter removido nada.
2. As quatro rotas do B4 chamam a função de escopo antes de inserir, com 422
   `REFERENCIA_INVALIDA` — o padrão de `lookbooks.ts:196-199`:
   `contratos.ts:247` (`vendedoraId`), `orcamentos.ts:139-144` (`leadId`),
   `financeiro.ts:138-142` (`colaboradorId`), `financeiro.ts:571-581`
   (`usuarioId` da recorrência SALARIO).
3. DDL versionado em `docs/migracoes/` (um arquivo só, aplicado por `psql` e
   depois `push`, como manda o gotcha): `onDelete: "restrict"` em
   `contratos.vendedoraId`, `comissao_regras.vendedoraId`,
   `comissao_fechamentos.vendedoraId` e `orcamentos.vendedoraId`; e os índices
   compostos do B10 — `parcelas (loja_id, vencimento)`, `parcelas (loja_id,
   recebido_em)`, `contas_pagar (loja_id, vencimento)`, `pagamentos (loja_id,
   data)`, `contratos (loja_id, fechado_em)`, `leads (loja_id, etapa)`,
   `pagamento_itens (pagamento_id)`, `contrato_itens (contrato_id)`.
4. `DELETE /admin/usuarios/:id` traduz o 23503 no 409 que `classificarErro` já
   produz: *"esta pessoa tem contratos; inative em vez de excluir"*.
5. `admin.ts:248-259`: `encerrarSessoesDoUsuario(tx, usuarioId)` dentro da mesma
   transação sempre que vier `senha` ou `ativo: false` — a função já aceita
   executor de transação exatamente para isso.

**Cuidados.** (a) O índice e a FK moram na MESMA migração porque as duas são
DDL sobre as mesmas tabelas e uma segunda janela de aplicação é risco por nada;
(b) `restrict` em `orcamentos.vendedoraId` pode quebrar a exclusão de uma
vendedora que só fez orçamento e nunca contrato — é o comportamento desejado,
mas confira que a mensagem do 409 fala disso; (c) o `set null` NÃO é opção nas
FKs de vendedora porque as colunas são `notNull` — a saída é `restrict` +
inativar; (d) não alargar o escopo para "revisar todas as FKs": as de autoria já
estão `set null` e corretas.

**Testes.** No molde de `escopo-loja-api.test.ts` (duas fixtures, agente da A,
ids da B): `PATCH` e `DELETE /equipe/:usuarioId` com usuário de outra loja →
404 e nenhuma escrita; `POST /contratos` com `vendedoraId` de outra loja e
`POST /orcamentos` com `leadId` de outra loja → 422 (os dois passariam hoje);
`DELETE /admin/usuarios/:id` de quem tem contrato → 409 e o contrato continua
lá; reset de senha derruba a sessão viva.

**Primeira ação.** O teste cross-tenant do `PATCH /equipe/:usuarioId`, vendo-o
falhar. É o achado mais grave da rodada e a suíte inteira passa por cima dele
hoje.

---

## E92 — Os consertos de uma linha

**Esforço: P** · **Fecha: E1 🔴, E2 🔴, E4 🟠, E5 🟠, E7 🟠, E11 🟠, E13 🟠,
E15 🟡, E16 🟡, E20 🟡, E22 🔵, E23 🔵, C11 🔵, D12 🟡, F8 🟡, F31 (o link) 🟠,
F44 🔵**

**A dor.** A página se declara em inglês (`index.html:2`), então o navegador
desenha os 25 `type="date"`, o `type="month"` e o `type="time"` no formato
americano em 14 telas: o filtro de "Contas a receber" diz `De 07/01/2026 Até
07/31/2026` — que em português se lê "de 7 de janeiro a 31 de julho" —, o
seletor de competência da folha diz "July 2026", e o campo de horário do
casamento tem slot de **AM/PM**. Nenhum desses erros dá erro; dão número errado
com cara de certo, numa tela de dinheiro. Ao lado disso, o texto de **todo**
botão primário tem 2,79:1 de contraste contra os 4,5:1 da WCAG AA — medido no
navegador, com os tokens computados. E há mais uma dúzia de coisas do mesmo
tamanho: `brl()` que não traz o `R$` (98 cópias à mão, e o dashboard sem
símbolo nenhum), o toast que diz "HTTP 404 Not Found" para a vendedora, o
`capitalize` que produz "Julho De 2026 — O Que Seria Pago Se Fechasse Agora.",
o sino que aponta para a agenda quando a fila pronta é `/mensagens`, e "Trocar
de Loja" ocupando o topo da sidebar de quem tem uma loja só.

**Feito significa.** Cada item abaixo é uma linha, um atributo ou uma condição.
Nenhum exige decisão de design nova, e o épico inteiro cabe numa manhã.

**Escopo técnico.**
1. `index.html:2` → `<html lang="pt-BR">`. **(E1)** Toda formatação de leitura
   já passa por `Intl` com `pt-BR` explícito, então nada depende do formato
   americano.
2. `index.css`: `--primary-foreground` deixa de ser branco e passa a ser o
   `--foreground` escuro (~7:1); `--muted-foreground` de `45%` para `40%`; no
   escuro, `--destructive` clareia como `--positivo` já fez. **(E2)**
3. `lib/formatos.ts`: `brl()` passa a devolver `R$ 1.200,00` com **espaço
   rígido** e `tabular-nums`; as 98 ocorrências de `R$ {brl(...)}` perdem o
   prefixo. O dashboard fica certo de graça. **(E5, E7)**
4. `pages/financeiro/helpers.tsx:89`: a última perna do `mensagemApi` devolve o
   `fallback` da tela, **nunca** `err.message`; mais a régua por faixa (401 →
   "Sua sessão expirou…", 403 → "Seu acesso não permite isso…", 5xx → "Não
   consegui falar com o sistema…") e "E-mail ou senha não conferem" no login.
   **(E4)**
5. `button.tsx`: `size="icon"` vira 44×44 abaixo de `md`; `size="sm"` ganha
   `min-h-11` no mesmo breakpoint. O desktop não muda. **(E11)**
6. `comissoes/index.tsx`: um `<li>` de rodapé com o total no card "Como está o
   mês" — hoje o número só existe dentro do diálogo da ação irreversível
   **(E13)**; e `reduce((s, l) => s + l.valorTotal, 0)` vira
   `reais(somaCentavos(...))` **(C11)**.
7. `rotuloCompetencia()` sobe para `lib/financeiro/datas.ts` (está triplicada em
   `comissoes`, `dre` e `fluxo`), é usada na frase da folha ("A competência
   2026-07…") e o `className="capitalize"` sai das quatro legendas. **(E15,
   E16)** Junto: `MODULOS_ROTULOS.leads` vira "Noivas, orçamentos e contratos";
   "bloqueios" vira "reservas"; "540 min adiantado" vira "9h adiantado".
8. Teclado e autofill: `inputMode="decimal"` em `receber.tsx:399` e
   `contratos/[id].tsx:544,646`; `type="email"` + `autoComplete` no login;
   `type="tel"` no WhatsApp; fora `type="number"` de `vestidos`. **(E20)**
9. `reservas/[bloqueioId].tsx:557`: `brl(a.custoReparo)` no lugar do
   `toFixed(2).replace(".", ",")`. **(D12)**
10. `sino-notificacoes.tsx:171-178`: `href` do aviso de presenças vai para
    `/mensagens`. **(F8)** `sidebar.tsx:110-119`: "Trocar de Loja" só renderiza
    com `session.lojas.length > 1`. **(F44)** `fluxo.tsx:160-176`: a folha entra
    na barra de links do hub financeiro. **(F31, a metade barata)**
11. `comissoes/index.tsx:838-865`: o `<p>` que contém `<Badge>` vira `<div>` —
    ou, na raiz, `Badge` passa a renderizar `<span>`. **(E22)**
    `vestidos/index.tsx` ganha um `<h2>` de seção; `/noivas` garante que a `<h1>`
    sobrevive ao alternador lista/funil. **(E23)**

**Cuidados.** (a) O item 2 muda a aparência de **todo** botão do sistema — a
trilha E recomenda alinhar com quem escolheu a paleta antes, porque a correção
mais limpa (texto escuro sobre o rosa) é uma decisão de marca; se não houver
com quem alinhar, a alternativa (escurecer `--primary` para ~`350 30% 45%` nos
usos de texto) preserva a leitura atual; (b) o item 3 toca 98 arquivos — faça-o
como um commit próprio, para que o diff seja legível; (c) o item 1 muda o
formato dos `<input type="date">` de leitura E de escrita: confira uma tela de
filtro e uma de cadastro antes de seguir.

**Testes.** Um teste de render que afirme `lang="pt-BR"`; um teste de contraste
sobre os tokens (é aritmética pura sobre HSL, cabe num unitário); um unitário de
`brl()` com o espaço rígido; um de `rotuloCompetencia()` com "julho de 2026". O
resto é verificação visual — vale repetir as capturas de 1280px/390px da trilha
E nas quatro telas mais afetadas.

**Primeira ação.** `<html lang="pt-BR">` e as duas linhas de `index.css`. Três
linhas, dois 🔴 fechados, quinze minutos.

---

## E93 — O cliente para de brigar consigo mesmo

**Esforço: M** · **Fecha: D1 🔴, D2 🟠, D3 🟠, D4 🟠, D9 🟡, D10 🟡, D13 🟡**

**A dor.** Dois `useEffect` escrevem o mesmo valor — a loja ativa — a partir de
fontes opostas (`use-auth.tsx:23-27`, sessão → store; `app-layout.tsx:24-28`,
URL → store), ambos com `activeLojaId` nas dependências. Quando a loja da URL
diverge da loja da sessão, cada `set` reativa o outro até o React abortar com
"Maximum update depth exceeded": aba a 100% de CPU, tela em branco, e nada
dizendo à usuária o que fazer. Dois caminhos normais chegam lá — um bookmark
para `/loja/B/dashboard` com a sessão em A, e duas abas em lojas diferentes.
Embaixo disso, o cache é 100% default: `grep staleTime|gcTime|refetchOnWindowFocus`
no app inteiro não devolve **nada**, então cada alt-tab de volta refaz 8
requests no dashboard e 7 em `/comissoes` — e é esse mesmo refetch que arma a
segunda perna do loop e que apaga a hora de fechamento que a pessoa acabou de
digitar (D13). E quatro telas ainda baixam a tabela inteira da loja para mostrar
uma janela: a conciliação pede todas as parcelas e todos os pagamentos **no
mount**, antes de o arquivo ser escolhido, embora ela mesma derive a janela do
extrato depois.

**Feito significa.** Há UMA fonte de verdade para a loja ativa; um movimento de
caixa invalida tudo o que ele muda; existe um piso de `staleTime` no
`QueryClient`; e nenhuma tela pede o acervo para desenhar uma janela.

**Escopo técnico.**
1. **D1 primeiro.** O efeito de `use-auth.tsx:23-27` sai. A URL é a fonte
   (`use-auth.tsx:43` já a declara prioritária), e a divergência URL ≠ sessão
   vira uma AÇÃO explícita: chamar `selecionarLoja` para a loja da URL, ou
   redirecionar para a loja da sessão. É uma decisão de produto de uma frase —
   quem ganha? — e ela precisa ser tomada, não deixada para dois efeitos
   brigarem.
2. **D9 antes do D3.** Uma função `invalidarCaixa(queryClient, lojaId)` em
   `pages/financeiro/helpers.tsx` listando as chaves que qualquer movimento de
   caixa afeta (`fluxo`, `dre`, `alerta-caixa`, `pagamentos`, `parcelas`),
   chamada por receber, estornar, pagar e estornar-pagamento. O molde é
   `comissoes/index.tsx:340-348`, que invalida as cinco chaves e comenta o
   porquê.
3. **D3 depois.** `defaultOptions.queries.staleTime` de 30–60 s como piso
   global no `App.tsx:84-87`, e `staleTime: Infinity` nas listas de
   configuração (`listCabines`, `listAtributos`, `listPerfis`, `listEquipe`). O
   sino já força o próprio `refetchInterval: 5min`, então continua fresco.
4. `atendimentos/config.tsx:57-64`: o effect que copia `regra` para o `useState`
   vira `useForm` com `values: regra` — o react-hook-form reconcilia sem apagar
   campo sujo. É a última tela do app com esse padrão. **(D13)**
5. Over-fetch: `conciliacao.tsx` passa a buscar com `enabled: !!transacoes` e
   `{de, ate}` derivados do extrato (deixa de haver request no mount);
   `pagar.tsx` passa a janela ao `listPagamentos`; `listContasPagar` ganha
   `de`/`ate` no `openapi.yaml` (é o único caso que precisa de spec novo) e
   `projecao.tsx`/`folha.tsx` a usam. **(D2)** `orcamentos/[id].tsx` apaga a
   query `useListLeads` e lê o nome de `leadCompleto.data`. **(D4)**
6. `comissoes/index.tsx`: apagar a query `fechamentos` e derivar `jaFechada` de
   `historico.data?.some(...)` — um request a menos e uma piscada a menos na
   troca de competência. **(D10)**

**Cuidados.** (a) A ordem 2 → 3 é obrigatória e é o cuidado principal deste
épico: `staleTime` sem invalidação transforma um incômodo de rede em dado
financeiro velho e persistente na tela; (b) o `persist` do zustand não escuta o
evento `storage` — ao consertar o D1, decida se as abas passam a se sincronizar
ou se a divergência entre abas vira um redirect explícito; (c) o item 5 mexe no
`openapi.yaml`: rode o codegen e `npx tsc --build` na raiz, senão as rotas
continuam vendo o contrato antigo.

**Testes.** Um teste de render que monte `AppLayout` com URL=B e sessão=A e
afirme que não há loop (é o teste que a trilha D pediu antes do conserto, já que
o D1 foi achado por leitura e não reproduzido); um teste de que
`invalidarCaixa` lista as chaves que o receber muda; API: `listContasPagar` com
`de`/`ate` recorta.

**Primeira ação.** O teste de render do D1 com URL ≠ sessão. Ele documenta a
decisão de produto ("quem ganha?") antes de a decisão virar código.

---

## E94 — Dinheiro que muda sem deixar rastro

**Esforço: M** · **Fecha: C4 🟠, B6 🟠, B3 🟠, B8 🟠, A2 🟠, F33 🟠**

**A dor.** Cinco caminhos diferentes pelos quais o dinheiro do sistema muda sem
que alguém consiga reconstituir o que aconteceu — e um sexto em que dois
números do sistema já discordam hoje. O `alerta-caixa` esqueceu o status
`PARCIAL` nas **duas** pernas do SQL: uma parcela meio-recebida não chega ao
motor nem como dinheiro que entrou nem como dinheiro que vai entrar, e o sino
anuncia "o caixa fura em X" enquanto a tela de projeção, clicada no segundo
seguinte, mostra o caixa positivo — nenhum dos dois números explica o outro, e
alarme que toca sem motivo treina a loja a ignorá-lo. `POST /parcelas/:id/receber`
lê `valorRecebido` fora da transação e grava o total: a recepção lança R$ 300 e
a vendedora lança R$ 700 no mesmo segundo, e a parcela fica com 700 — R$ 300
entraram na gaveta e não existem no sistema. O cancelamento de contrato com
`destinoPago: "estornar"` zera `valorRecebido`/`recebidoEm` de todas as parcelas
PAGAS e a transação inteira não chama `registrarAuditoria` uma vez —
`CONTRATO_CANCELADO` nem existe na união de ações, e a ação irmã e MENOR
(estornar uma parcela) grava trilha. O `DELETE` de conta a pagar apaga a conta
de COMISSÃO gerada por um fechamento e a FK zera o vínculo em silêncio: a Ana
não recebe, `pendencias` não acusa (o fechamento existe), e reabrir não repara
porque `contaPagarId` já é nulo. E há duas rotas que gravam "conta paga" com
trilhas de auditoria **diferentes** — o histórico de quem pagou o quê depende de
por qual porta se entrou —, sendo que a suíte testa quase só a que a UI
abandonou.

**Feito significa.** Todo movimento que muda caixa realizado deixa trilha; a
mesma ação deixa a MESMA trilha independentemente da porta; o `alerta-caixa`
concorda com o `/financeiro/fluxo` por construção; e dois recebimentos
simultâneos não perdem nenhum.

**Escopo técnico.**
1. **C4 primeiro, porque são duas linhas.** `financeiro.ts:846-860`:
   `inArray(status, ["PAGA","PARCIAL"])` e `inArray(status,
   ["PREVISTA","PARCIAL"])`. Melhor ainda, e é o que impede a reincidência:
   exportar do `financeiro-core` as duas listas (`STATUS_ABERTOS`,
   `STATUS_COM_RECEBIMENTO`) para que o SQL e o motor não possam divergir de
   novo — é a mesma classe de bug que o E79 resolveu em `/financeiro/parcelas` e
   deixou passar aqui.
2. **B6.** UPDATE condicional ao valor lido — `.where(and(eq(id, …), status
   !== 'PAGA', valorRecebido IS NOT DISTINCT FROM <lido>))` — e 409 quando não
   retornar linha. É o vocabulário que o repo já usa em `portal.ts:255`,
   `orcamentos-publico.ts:49` e `convites.ts:111`, com comentário e tudo.
3. **B3.** `CONTRATO_CANCELADO` entra em `ACOES_AUDITORIA` e é registrado
   DENTRO da transação de `contratos.ts:481-542`, com `motivo`, `destinoPago`,
   `valorTotal` e a soma do que foi desfeito nas parcelas. O `detalhe` do
   estorno avulso (`:690-696`) é o molde.
4. **B8.** `DELETE /contas-pagar/:contaId` recusa quando
   `origemComissaoFechamentoId` não for nulo, com 409 dizendo que o caminho é
   reabrir o fechamento — a mesma régua do "estorne o pagamento antes de
   remover a conta" que já existe na linha 230.
5. **A2.** Decidir qual é a porta de "pagar conta". Se for a multi-conta (é a
   que a UI usa; `usePagarContaPagar` não aparece em arquivo nenhum do front), o
   single-conta vira wrapper fino sobre ela e os testes de caixa/auditoria
   migram — assim a trilha fica uniforme e a suíte passa a exercitar o caminho
   vivo.
6. **F33**, que é a face de tela do B3: o diálogo de cancelar lista o que vai
   ser estornado com as datas e um aviso a mais quando o período já foi enviado
   à contabilidade — *"R$ 2.000 recebidos em 12/06 — junho já foi enviado à
   contabilidade em 03/07"*. A informação existe (`recebidoEm` e
   `enviadoContabilidadeEm`); falta usá-la. Não trava nada: torna a decisão
   consciente.

**Cuidados.** (a) O item 1 muda números que a loja já viu — o alerta vai parar
de acusar furo em lojas que usam recebimento parcial; isso é o conserto, mas
merece uma linha no changelog; (b) o item 2 introduz um 409 novo num botão de
uso diário: a tela precisa traduzi-lo ("esta parcela mudou enquanto você
digitava — confira o valor"), senão troca-se perda de dinheiro por um "HTTP
409" na cara da vendedora (ver E96); (c) o item 5 é o único que mexe em rota
viva por motivo arquitetural — se o custo passar de meia tarde, mantenha as
duas portas e apenas migre os testes para a multi-conta, registrando o porquê.

**Testes.** `alerta-caixa-api.test.ts` e `alerta-caixa-unit.test.ts` ganham o
caso `PARCIAL` (a palavra não aparece em nenhum dos dois hoje, e é exatamente
onde o bug mora) e um assert cruzado de que o alerta e o `/financeiro/fluxo`
respondem o mesmo saldo para a mesma fixture; teste de corrida em
`POST /parcelas/:id/receber` no molde de `lote17-agenda-concorrencia`; o
cancelamento com `estornar` grava `CONTRATO_CANCELADO`; o DELETE da conta de
comissão responde 409.

**Primeira ação.** O caso `PARCIAL` no `alerta-caixa-unit.test.ts`, vendo-o
falhar. Duas linhas de SQL depois, o sino e a projeção voltam a contar a mesma
história.

---

## E95 — A tela de orçamento para de calcular dinheiro

**Esforço: G** · **Fecha: A1 🟠, A3 🟠, A11 (visao-noiva) 🟡, B11 🟡, C1 🔴,
C2 🟠, C3 🟠, C6 🟡, C9 🟡, F16 🟠, F18 🟠, F19 🟡, F20 🟡**

**A dor.** Treze achados de cinco trilhas apontam para o mesmo arquivo. A tela
monta o plano de parcelas sozinha, em reais float
(`Math.floor((restante / numParcelas) * 100) / 100`), enquanto o servidor tem
`ratearRestante` em centavos inteiros com prova de propriedade por `fast-check`:
medido, **1,77% dos planos divergem** — R$ 1.282,00 em 10x, que divide exato em
R$ 128,20, sai como `128,19 ×9 + 128,29`. E o erro é 100% silencioso, porque a
soma sempre fecha e a guarda `PARCELAS_NAO_BATEM` nunca dispara: a única
testemunha é o carnê impresso. A tela também recalcula o líquido com `round2`
em reais enquanto o `POST /contratos` calcula em centavos —
**1,32% das vendas com desconto percentual** batem num 422
`VALOR_TOTAL_NAO_BATE` que a vendedora não tem como destravar, e quando o
orçamento tem versão ENVIADA o `totalLiquido` congelado no snapshot **e no
hash** é o valor float: o número que a noiva aceitou é 950,47 e o único contrato
que o servidor aceita gerar é de 950,48. Ela lê "5.800" com `Number()` e cria um
item de R$ 5,80; lê a entrada "3.000,00" como `NaN || 0` e cria uma entrada
zero, sem aviso. E carimba o vencimento da entrada com `new Date()`, o que das
21h à meia-noite muda o dia — e no dia 31, o mês e a competência. Por cima
disso: o diálogo não mostra as parcelas que vai criar (a noiva pergunta "quanto
fica por mês?" e a vendedora calcula de cabeça), os dois atalhos naturais de
criar orçamento não passam `validade` — o que desliga o lembrete do E69 para
justamente as propostas feitas no calor da venda —, e "Aprovar" antes de a
noiva aceitar apaga o botão de aceite dela, matando o E74 por ordem de cliques.

**Feito significa.** Não existe aritmética de dinheiro em
`pages/orcamentos/[id].tsx`. Todo número que a tela mostra sai da mesma função
que o servidor vai validar, e o 422 de divergência deixa de ser alcançável.

**Escopo técnico.**
1. `liquidoEmCentavos(brutoC, tipo, valor)` sobe para
   `@workspace/financeiro-core` — **em centavos**, que é o ponto: unificar as
   três cópias no `round2` fecharia o 422 e deixaria a conta errada nos três
   lugares de forma consistente. Consumidores: `routes/contratos.ts:57`,
   `routes/orcamentos.ts:63`, `lib/visao-noiva.ts:65` e a tela. `round2` deixa
   de ser régua de dinheiro e vira formatação. **(C1, A3)**
2. `ratearRestante` sobe para o core do mesmo jeito, e a tela para de montar
   `parcelas[]`: ou `POST /contratos` sem parcelas + `POST
   /contratos/:id/parcelas/gerar-plano`, ou a tela importa a MESMA função. A
   segunda é o padrão já estabelecido no repo (E25/E27/E28). **(A1, C2, F20)**
3. **Decidir explicitamente o espaçamento e a semântica do
   `primeiroVencimento`** antes de escrever a linha: hoje o servidor espaça por
   30 dias corridos e a tela por mês (`addMonths`), e o mesmo campo significa "a
   parcela 1" na tela e "a entrada" no servidor. Unificar o valor **arrasta**
   essa mudança de datas para todo mundo; o carnê que a loja combina com a noiva
   é mensal por dia fixo, com o grampo de fim de mês que
   `vencimentoDaCompetencia` já sabe fazer. **(C9)**
4. `parseValor` nos três pontos de leitura de dinheiro (`:288`, `:325`, `:409`),
   distinguindo `null` de `NaN`. **(C3)** O `<CampoDinheiro>` compartilhado que
   a trilha C e a E pediram é do E99 — aqui basta a função certa.
5. `diaParaISO(hojeLocal())` no vencimento da entrada; e, ao mover o rateio para
   o core, levar junto a construção da data — quem faz a parcela faz a data
   dela. **(C6)**
6. Prévia ao vivo dentro do diálogo, a partir da mesma função:
   *"Entrada R$ 2.000,00 hoje · 6× de R$ 1.246,75 (a última de R$ 1.246,80), de
   10/08 a 10/01"*. Depois do item 2, é a mesma conta que o servidor vai
   validar. **(F16)**
7. Validade: default no **servidor** (hoje + N dias, configurável) quando o
   cliente não a manda, para que todo orçamento entre na fila do E69 por
   construção; e um campo de validade editável em `/orcamentos/:id`, ao lado do
   desconto. **(F18)**
8. `criarVersaoEnviada` entra na MESMA transação que marca ENVIADO, com o
   `numero` derivado dentro dela (ou `ON CONFLICT DO NOTHING`) — hoje um
   orçamento pode ficar ENVIADO sem versão congelada, e o portal cai no ramo de
   fallback que mostra o conteúdo VIVO, em silêncio. **(B11)**
9. O `AlertDialog` de "Aprovar" passa a dizer o que se perde quando
   `!orcamento.aceitoEm`, e a tela mostra o estado do aceite ao lado do status.
   **(F19)**

**Cuidados.** (a) O item 3 é o cuidado central: **o conserto do valor arrasta a
mudança da data**, e mudar o dia de vencimento de todos os carnês novos sem que
ninguém tenha pedido é o tipo de coisa que se descobre pelo WhatsApp da noiva —
decida antes, escreva no commit; (b) contratos JÁ existentes não são
recalculados: o épico muda o que nasce daqui para a frente, e as parcelas
antigas continuam como estão; (c) o snapshot e o hash do E74/E75 dependem do
número congelado — depois do item 1, os aceites antigos continuam válidos com o
valor float que congelaram, e o `montarOrcamentoPublico` precisa continuar
respeitando isso; (d) não aproveitar o épico para quebrar o arquivo inteiro
(A10): o diálogo "Gerar contrato" sai como componente porque é onde o trabalho
está, o resto fica.

**Testes.** Unitário de `liquidoEmCentavos` com desconto percentual de centavo
quebrado (R$ 1.000,50 com 5%, R$ 1.051,00 com 2,5% — os dois casos medidos pela
trilha C); unitário de `visao-noiva` com o mesmo (é o número que a NOIVA vê e
hoje não tem teste de arredondamento — **A11**); a prova de propriedade de
`ratearRestante` passa a valer para o caller da tela; API: `POST /contratos`
com os pares que hoje dão 422 responde 201; `POST /orcamentos` sem `validade`
nasce com a default; ENVIADO sempre tem versão.

**Primeira ação.** Escrever o unitário de `liquidoEmCentavos` em
`financeiro-core` com os dois exemplos numéricos da trilha C, e ver as duas
implementações atuais discordarem dele.

---

## E96 — O erro do servidor chega ao campo que o causou

**Esforço: M** · **Fecha: B13 🟡, D5 🟠, D6 🟠, F17 🔴**

**A dor.** Uma cadeia de quatro trilhas para um erro só. O servidor devolve
`res.status(400).json({ error: parsed.error.message })` em **95 lugares** — e
`error.message` num ZodError é o JSON serializado do array de `issues`, com
`path`, `code` e a mensagem em inglês. O cliente não tem um `setError` no app
inteiro: todo 400/422 vira toast destrutivo genérico, longe do campo que o
causou. E os 12 formulários reescrevem à mão o schema Zod que o `api-zod`
gerado já tem compilado — `grep api-zod` em `moscow-noivas/src` não devolve
**nada**, embora o servidor o use em 19 rotas; mudar um `min`/`max`/enum no
`openapi.yaml` regenera o Zod do servidor e não toca as 12 cópias, e o
compilador, que segundo a arquitetura deveria apontar cada call-site quebrado,
fica calado porque não há call-site. O desfecho está no clique que fecha a
venda: a vendedora, com a noiva do lado, lê *"Itens menos desconto (950.48)
difere do valor total (950.47)"* num diálogo que continua aberto e não tem
nenhum ajuste que resolva — enquanto o arquivo irmão (`contratos/[id].tsx:65-83`)
tem o dicionário de oito códigos traduzidos que faltou ali.

**Feito significa.** O erro de validação sai do servidor com código estável e
caminho de campo; o cliente o aplica no campo; e nenhuma tela mostra texto de
servidor para quem usa.

**Escopo técnico.**
1. Helper `erroDeValidacao(zodError)` no servidor devolvendo
   `{ error: "CORPO_INVALIDO", campos: [{campo, motivo}] }` a partir de
   `error.issues`, aplicado às ~95 chamadas. O código estável é o que a tela
   consegue traduzir para português; o formato `{error, detalhe}` das rotas que
   já fazem certo (`financeiro.ts:104`, `contratos.ts:79`) é a referência.
   **(B13)**
2. O 422 do `POST /contratos` passa a carregar o campo responsável
   (`{ campo: "entrada", erro: "…" }`) — hoje ele diz o número e não diz onde
   mexer. **(D6)**
3. Uma função única `aplicarErroDoServidor(form, err)` no cliente: `form.setError`
   quando há campo, toast só quando não há. É uma função no lugar de doze
   tratamentos inline. **(D6)**
4. Os resolvers dos 12 formulários passam a derivar do schema gerado (`XInput`
   do `api-zod`), estendido com `.extend()` só onde o formulário precisa de
   campo de UI (máscara de moeda) — e a divergência proposital vira explícita em
   vez de reescrita. **(D5)**
5. `orcamentos/[id].tsx` importa o `mensagemApi` que já existe e ganha o seu
   dicionário, com uma entrada específica para a divergência de total dizendo o
   que fazer. **(F17)** — esta perna pode e deve ser antecipada: vale mesmo com
   o C1 vivo, e depois do E95 vira rede de segurança para os outros 422 que
   ninguém mapeou.

**Cuidados.** (a) O item 4 é o que mais pode inchar — comece pelos três
formulários do fluxo comercial (orçamento, contrato, noiva) e meça; se os outros
nove não trouxerem divergência real, registre o veredito e pare; (b) não mudar o
formato de erro das rotas que já têm código estável (`INTERVALO_INVALIDO`,
`FILTRO_INVALIDO`) — elas são o padrão, não a exceção; (c) o `mensagemApi` já
foi consertado no E92 (a última perna deixa de repassar `err.message`) — aqui é
o dicionário, não o fallback.

**Testes.** API: `POST /contratos` com corpo inválido devolve `CORPO_INVALIDO`
com `campos[]` e nada em inglês; um teste que varra as rotas e reprove
`parsed.error.message` cru (é greppável e cabe num unitário). Front: o
formulário do contrato com 422 de campo marca o campo, não abre toast.

**Primeira ação.** O dicionário de erros em `orcamentos/[id].tsx`, copiado do
arquivo irmão. É meia hora e tira o clique mais caro do funil do escuro.

---

## E97 — O registro operacional: carimbo honesto e desfazer

**Esforço: G** · **Fecha: F6 🔴, F11 🟠, F22 🟠, F23 🟠, F26 🟠, F15 🟡,
F24 🟡, F25 🟡, D14 🟡**

**A dor.** O sistema carimba coisas que não aconteceram e não desfaz as que
aconteceram por engano. Abrir o `wa.me` em "Mensagens de hoje" dispara
`confirmarAtendimento` no `onClick` — antes de escrever, antes de enviar, antes
de a noiva ler — e usa o **mesmo campo** que o portal usa quando a noiva
confirma de verdade (E85): os dois sentidos ficam indistinguíveis depois de
gravados, a linha some da fila e da contagem do sino, e não há tela nenhuma que
desfaça. É o único número sobre o qual a loja toma uma decisão física. Na outra
ponta, o que de fato acontece não é registrado: a cobrança pela fila do dia (o
caminho rápido, o que a tela pede que se use) não grava nada, enquanto a mesma
cobrança por `/financeiro/cobranca` grava — então "essa noiva foi cobrada?" tem
resposta diferente conforme a porta, e o relógio de "parado há N dias" do funil
não zera, fazendo a noiva virar alerta de lead frio indevidamente. Uma PROVA
não pode ser concluída nem marcada como falta em **tela nenhuma** — toda prova
fica em `AGENDADO` para sempre, então prova esquecida não aparece em lugar
algum, o contador do sino degrada com o tempo e o `atendidoEm` do E36 nunca é
preenchido justamente para o atendimento mais demorado do ateliê. E as
confirmações estão invertidas: "Concluir" (reversível) pede `AlertDialog`,
"Voltar para agendado" (que apaga desfecho e `atendidoEm` medidos) não pede
nada; "Cobrar reparo" pode ser clicado duas vezes e cria duas parcelas no carnê
da noiva sem que a tela mude de estado; e a avaria — cuja **foto é a prova que
sustenta a cobrança** — é apagada por um toque num ícone de 28px, sem
confirmação, enquanto a parcela que ela gerou continua no carnê.

**Feito significa.** O que o sistema grava corresponde ao que aconteceu; toda
ação que destrói medição ou evidência pede confirmação nomeando o que se perde;
e toda fila tem lente para o estado oposto.

**Escopo técnico.**
1. **Separar os dois fatos.** `contatadoEm` (a loja mandou — carimbado no
   clique, e é isso que tira a linha da fila do dia) × `confirmadoEm` (a noiva
   respondeu/clicou no portal — e é isso que a agenda mostra como "confirmada").
   Coluna nova + DDL em `docs/migracoes/`. Enquanto a coluna não vier, o mínimo
   é um "desfazer" na linha recém-confirmada. E alinhar os três botões
   "Confirmar" que hoje fazem duas coisas diferentes. **(F6)**
2. `/atendimentos` deixa de filtrar `tipo: "ATENDIMENTO"` e ganha uma aba
   "Provas", reaproveitando o agrupamento Atrasados/Hoje/Próximos — é menos
   código do que replicar as ações de linha em `/provas`, e a API já aceita a
   mudança (é o mesmo `PATCH /atendimentos/:id`). **(F11)**
3. O clique no WhatsApp de `/mensagens` grava `registro-cobranca` automático
   (`canal: "WHATSAPP"`, observação "mensagem de cobrança enviada pela fila do
   dia") e a linha passa a mostrar "cobrada há 2 dias" para a fila não repetir
   cegamente. Aqui o carimbo é honesto: registra o ATO da loja, não uma resposta
   da noiva. **(F26)**
4. Inverter as confirmações de `/atendimentos`: "Concluir" vira ação direta com
   toast de desfazer; "Voltar para agendado" e "Reabrir" ganham a confirmação,
   dizendo o que se perde. Confirmar antes se o PATCH de fato limpa
   `atendidoEm`/`desfecho` — se não limpa, o problema é o oposto (dado fantasma)
   e o conserto muda de lado. **(F15)**
5. Avaria: ela guarda `parcelaId` (ou a rota recusa a segunda cobrança com 409
   idempotente); depois de cobrar, o botão vira "Cobrado — ver parcela" com
   link; e a remoção pede confirmação dizendo que a foto também sai, recusando
   quando há parcela vinculada. **(F22, F23)**
6. A fila da costureira ganha o terceiro recorte "Concluídos" com "Reabrir" na
   linha — é o padrão que `/atendimentos`, `/provas`, `/orcamentos` e `/receber`
   já têm, e o dado já vem na mesma query. **(F24)**
7. Ao registrar a devolução, um passo seguinte pergunta "O vestido voltou como
   saiu?" com duas saídas: "Sim, tudo certo" e "Registrar avaria" (rola até o
   formulário, já aberto). O E71 inteiro depende de alguém lembrar; este é o
   gatilho. **(F25)**
8. `useConfirmarSaida(form.formState.isDirty)` sobre o `useBlocker` do
   react-router 7, aplicado primeiro a `atendimentos/novo.tsx`, ao diálogo
   "Gerar contrato" e a `noiva-form.tsx`; nos diálogos,
   `onInteractOutside`/`onEscapeKeyDown` passam a confirmar quando sujo. **(D14)**

**Cuidados.** (a) O item 1 é migração de significado, não só de coluna: os
`confirmadoEm` já gravados são ambíguos por construção e **não** dá para
separá-los retroativamente — escreva isso no DDL e no `replit.md`, e considere
carimbar os antigos como `contatadoEm` (a leitura mais provável) ou deixá-los
como estão com uma data de corte; (b) o item 3 grava dado a cada clique numa
fila de uso intenso — confira que o `POST /registros-cobranca` é barato e que
duplo clique não gera duas linhas; (c) o item 8 não pode disparar em navegação
programática pós-sucesso (o formulário fica sujo até o `reset`).

**Testes.** API: `contatadoEm` e `confirmadoEm` são independentes, e o portal só
mexe no segundo; `PATCH` de prova para CONCLUIDO grava `atendidoEm`; a segunda
cobrança da mesma avaria responde 409. Front: o clique da fila registra
cobrança; a remoção de avaria com parcela é recusada. E2E: concluir uma prova
tira-a da contagem do sino.

**Primeira ação.** O DDL de `contatadoEm` e a troca do `onClick` de
`mensagens/index.tsx:184-190`. É o achado 🔴 com o maior efeito sobre uma
decisão física da loja.

---

## E98 — As telas se alcançam

**Esforço: G** · **Fecha: E3 🔴, E9 🟠, F1 🟠, F2 🟠, F3 🟠, F4 🟠, F7 🟠,
F9 🟠, F12 🟠, F13 🟠, F27 🟠, F29 🟠, F40 🟠, F5 🟡, F10 🟡, F14 🟡, F28 🟡,
F43 🟡**

**A dor.** É o padrão que se repete em oito das nove jornadas: **a tela onde a
pessoa descobre o problema não é a tela onde ela pode resolvê-lo, e não há link
entre as duas.** A ficha da noiva sabe o `leadId` e não agenda — embora o
deep-link `?noiva=` exista e `reservas/[bloqueioId].tsx:662` já o use —, então o
caminho mais percorrido do app custa uma navegação de sidebar mais uma busca
por nome, com a noiva do lado. "Contas a receber" mostra quatro linhas
visualmente idênticas ("Entrada · vence 16/07 · R$ 1.000,00") e o nome da noiva
só existe no CSV — o comentário do próprio arquivo o diz. A tela do contrato não
tem volta, e o `Badge` "Ativo", preenchido de rosa entre dois botões outline, é
o elemento mais clicável dos três. O dashboard promete "o que precisa da sua
atenção agora" e não linka para "Mensagens de hoje", que é a tela que de fato
responde isso — e essa tela, construída para funcionar por partes (três blocos
gateados separadamente), tem item de menu exigindo `agenda`, então quem cuida do
financeiro nunca a alcança. "Configurações" é a única tela do sistema que não
configura nada e não linka para quem configura. Existem dois "agendar" com
regras diferentes, e o mais acessível é o que cria prova órfã, sem reserva. E
"Atrasadas" em `/financeiro/receber` roda **sobre a janela do mês corrente**:
quem clica lê os atrasos de julho achando que leu a inadimplência inteira.

**Feito significa.** Toda tela que mostra um problema oferece o caminho para
resolvê-lo, e nenhuma jornada do briefing exige decorar um nome ou abrir uma
segunda aba.

**Escopo técnico.**
1. Um **cabeçalho de detalhe único** para as 6 telas de detalhe: breadcrumb
   curto ("Noivas › Ana Silva › Contrato"), `<h1>`, ações à direita em uma só
   hierarquia (uma primária, o resto em `…`), status como chip de leitura ao
   lado do `<h1>` e não na fileira de botões. "Cancelar contrato" sai da fileira.
   É o insumo do `<Breadcrumb>` do E99. **(E9)**
2. `/financeiro/receber`: o nome da noiva vira a linha 1 e `Entrada · vence
   16/07 · parcela 3 de 6` desce para a linha de apoio; o link vira o nome. O
   GET de parcelas já embute o lead (`cobranca.tsx:161-163` documenta isso).
   **(E3, F27)**
3. Os links que faltam, um por vez: "Agendar atendimento" na ficha
   (`/atendimentos/novo?noiva={leadId}` — zero código do lado do formulário)
   **(F1)**; o cartão "N mensagens prontas para enviar" no topo do dashboard,
   calado quando o total é zero, como o `AlertaCaixa` **(F7)**; o nome de "Hoje
   na loja" clicável e um botão "Iniciar" na linha **(F10)**; links diretos para
   Interesses/Lookbook na linha do atendimento em curso **(F14)**; "Editar →" em
   cada card de Configurações **(F40)**; `resumoAcessos()` do perfil na linha do
   membro em `/equipe`, com link para `/permissoes` — a função já existe e só é
   usada na lista do superadmin **(F43)**; "Receber" na linha da cobrança,
   abrindo o mesmo diálogo autocontido de `receber.tsx` **(F28)**.
4. `NavItem` aceita `modulos?: string[]` com semântica de OU (~5 linhas no
   `podeVer`), e "Mensagens de hoje" passa a exigir **um dos três**. **(F9)**
5. `CommandEmpty` do `<ComboboxNoiva>` oferece "Cadastrar «{o que foi
   digitado}»", criando o lead com nome + origem e devolvendo o id selecionado —
   o mesmo padrão do `criarReservaInline` que já vive no mesmo arquivo (E65).
   **(F4)**
6. O botão "Novo Agendamento" da agenda vira link para `/atendimentos/novo`
   (com `?dia=`). Mata ~110 linhas de formulário duplicado, uma classe inteira
   de prova órfã e a divergência de fuso (`new Date(values.inicio)` do navegador
   × `instanteDoSlot` da loja). Se o diálogo tiver de ficar, no mínimo remover a
   opção PROVA dele. **(F12)**
7. `/financeiro/receber`: quando o filtro for "Atrasadas", ignorar a janela — ou,
   no mínimo, mostrar "há R$ X em atraso fora desta janela · ver tudo". A régua
   certa já existe no produto: `/cobranca` pede `status: "abertas"` sem janela.
   **(F29)**
8. Cadastro da noiva: `origem` sem valor inicial, com placeholder "De onde ela
   veio?" (o `z.enum` já é obrigatório), e a origem passa a ser corrigível
   enquanto o lead não tem contrato — hoje o default silencioso envenena
   `/noivas/conversao` de forma irreversível. **(F2)** O badge "Sem WhatsApp"
   das três telas vira link (ou popover com um campo) para a edição. **(F3)**
9. A ficha ganha uma faixa de **próximo passo** derivada de `lead.etapa`: NOVO →
   "Agendar o primeiro atendimento"; EM_ATENDIMENTO → "Registrar interesses" /
   "Montar orçamento"; com contrato ativo → "Ver parcelas". É uma regra pura de
   ~15 linhas em `lib/`, testável, e substitui a leitura de oito cards vazios
   por uma decisão. **(F5)**
10. **Segunda metade, se o épico couber:** a **barra de atendimento em curso** no
    `AppLayout`, visível em toda tela enquanto houver um `EM_ATENDIMENTO` da
    vendedora logada — "Atendendo Marina desde 10:07 · Interesses · Lookbook ·
    Concluir". O dado já roda no dashboard e no sino, e o cache do react-query o
    deduplica; falta um componente que o leia fora da fila. Nenhum épico
    E68–E90 tratou do DURANTE do atendimento. **(F13)**

**Cuidados.** (a) Este é o épico mais fácil de inchar — os itens 1 a 4 são o
núcleo e pagam sozinhos; o item 10 é uma capacidade nova e deve ser a última
coisa, cortável sem culpa; (b) o item 6 remove um caminho que gente usa: confira
que o `?dia=` preserva o contexto, senão a agenda perde uma comodidade real; (c)
o item 8 mexe no `LeadUpdate` da API (o comentário de `noiva-form.tsx:63` diz que
a restrição vem do contrato, não de regra de negócio) — confirme se ela ainda é
intencional antes de mudar; (d) o item 7 pode precisar de uma linha de
`openapi.yaml` se `listParcelas` não aceitar `status` e janela ao mesmo tempo.

**Testes.** Unitário da regra de próximo passo por etapa (F5); front: o
combobox cria e seleciona o lead novo (F4); "Atrasadas" fora da janela aparece
(F29); E2E da jornada 1 completa contando os passos — cadastrar, agendar e
confirmar sem voltar à sidebar, que é a métrica que este épico existe para
mudar.

**Primeira ação.** O botão "Agendar atendimento" na ficha da noiva. Três linhas,
e é o caminho de maior frequência do app inteiro.

---

## E99 — A camada de UI que falta

**Esforço: G** · **Fecha: A5 🟡, A9 🟡, D7 🟠, D11 🟡, D15 🔵, E6 🟠, E8 🟠,
E10 🟠, E12 🟠, E14 🟡, E17 🟡, E18 🟡, E19 🟡, E21 🟡**

**A dor.** O problema não é falta de tokens — os tokens são usados de verdade,
com **uma** cor cinza crua em `pages/` inteiro e o dark mode íntegro. O problema
é que não existe nada **entre** os tokens e as telas. `<Table>` é importada por
um arquivo e cinco telas escrevem `<table>` à mão; `<Pagination>`, `<Empty>`,
`<Breadcrumb>`, `<Progress>` e `<Avatar>` têm zero consumidores — e ao mesmo
tempo `/vestidos` renderiza 114 cards com foto de uma vez, o avatar da sidebar é
um `<div>` redondo escrito à mão e a barra de custo de comissão é um `style={{width:
…%}}`. O resultado é que cada tela reinventa dinheiro (quatro tipografias
diferentes para o mesmo valor, duas delas sem `tabular-nums`), carregando
(quatro idiomas visuais, e as telas de dinheiro mostram `R$ 0,00` com a mesma
tipografia do número verdadeiro), erro (três desenhos vivos para a mesma coisa)
e vazio (30 frases soltas, quatro delas em sequência na ficha de uma noiva nova).
E as decisões divergiram onde custa: o valor da venda no contrato usa
`text-primary`, que lado a lado com o `destructive` do atraso lê-se como a mesma
cor; a ação destrutiva mora na mesma fileira da ação comum e com MENOS chrome; e
a ficha de uma noiva que não existe fica num esqueleto sem título nem saída e
depois vira "HTTP 404 Not Found", enquanto as três telas irmãs já têm o card
certo.

**Feito significa.** Existe `@/components/estado/` e uma escala de dinheiro;
nenhuma tela nova precisa decidir de novo como se desenha carregando, erro,
vazio, tabela e valor.

**Escopo técnico.**
1. **Poda primeiro.** Apagar os 27 primitivos shadcn sem consumidor e as ~25
   dependências `@radix-ui/*` que existem só para eles; `chart.tsx` leva
   `recharts` junto (confirmado fora do bundle). Reintroduzir por `shadcn add`
   no dia em que uma tela precisar é um comando. **(A5)**
2. `@/components/estado/`: `<Carregando forma="lista|cards|detalhe" />`,
   `<Erro />`, `<Vazio titulo acao />`. Substituem as sete variações de
   esqueleto e os três desenhos de erro (`EstadoErro` × `ErroListagem` × os
   `<Alert>` inline). Regra escrita uma vez: **toda mensagem de vazio diz por
   que está vazio e qual é o próximo passo, com o botão junto** — o app já sabe
   fazer isso em `dashboard.tsx` e no card de lookbook da ficha. **(E17, E18)**
3. `ResumoCard` aceita `carregando` e mostra esqueleto no lugar do número; o
   `AlertDialogAction` de fechar competência fica desabilitado enquanto
   `preview.isPending || fechamentos.isPending`, e a descrição diz "calculando…"
   em vez de afirmar "nenhuma comissão a lançar" antes de saber. **(D7)**
4. Uma escala de dinheiro em três degraus (`money-lg`/`money-md`/`money-sm`),
   sempre `tabular-nums`, sempre a mesma família — decidindo de uma vez se
   dinheiro é serif ou sans. **(E6)** O valor do contrato deixa de ser
   `text-primary` e vira `text-foreground` no degrau maior; `text-primary` fica
   para o que é interativo e `text-destructive` só para o que está errado.
   **(E8)**
5. Uma regra escrita uma vez: **ação destrutiva mora no menu `…`**, nunca na
   fileira principal; exposta só com `variant="destructive"` de verdade; e toda
   confirmação nomeia o objeto e o valor — como a de reabrir fechamento já faz,
   e o estorno de parcela não. **(E10)**
6. Adoção dirigida: `<Table>` nas 5 telas que escrevem `<table>`; `<Empty>` nos
   30 vazios; `<Breadcrumb>` no cabeçalho de detalhe que o E98 definiu;
   paginação (ou rolagem infinita) em `/vestidos`, `/atendimentos` e
   `/financeiro/receber`, as três maiores. **(E19)**
7. Sentence case em tudo, exceto nomes próprios; micro-caps só para rótulo de
   total dentro de lista. Vale o teste bobo que reprova `<CardTitle>` com duas
   iniciais maiúsculas seguidas. **(E21)**
8. `/financeiro/dre` inverte a ordem: o resultado é o herói no topo, grande,
   com `+`/`−`; recebimentos e despesas viram as duas metades que o explicam. O
   padrão certo já está em `fluxo.tsx:240-275`. **(E14)**
9. A ficha da noiva inexistente ganha o mesmo card de "não encontrado" das
   irmãs, e o esqueleto preserva `<h1>` e link de volta. **(E12)**
10. Higiene que mora na mesma camada: `useCaminhoDaLoja` e `mensagemApi` sobem
    de `pages/financeiro/helpers.tsx` para `@/lib`/`@/hooks`, e
    `contratos/[id].tsx` apaga a cópia byte a byte de `parseValor` **(A9)**; os
    25 `Intl.DateTimeFormat` à mão sobem para `lib/formatos.ts` com nomes
    semânticos e `timeZone` explícito em todos, inclusive nos que hoje omitem
    **(D15)**; as faixas da escada de comissão ganham id local em vez de
    `key={i}` **(D11)**.

**Cuidados.** (a) Este épico é o mais fácil de transformar numa reescrita — a
regra é: **poda + adoção onde a divergência já custou**, e nada mais (ver
"Conscientemente fora" no consolidado); (b) o item 1 apaga 3.701 linhas: o
typecheck é o fiscal, e o E104 (que liga o typecheck dos testes do front) ajuda
se vier antes; (c) o item 4 é decisão de design, não de código — decida serif ×
sans com quem escolheu a paleta, junto com o E92; (d) o item 6 depende do E98
ter fechado o cabeçalho de detalhe.

**Testes.** Unitário dos três componentes de estado; o lint/teste de
capitalização; front: `ResumoCard` com `carregando` não renderiza `R$ 0,00`; o
diálogo de fechar competência não afirma "nenhuma comissão" enquanto carrega
(é o caso concreto em que a tela mente sobre uma ação irreversível).

**Primeira ação.** A poda dos 27 primitivos e do `recharts`, com o veredito de
grep anotado no commit — no molde do E88.

---

## E100 — O portal responde as perguntas da noiva

**Esforço: G** · **Fecha: F35 🟠, F36 🟠, F37 🟠, F21 🟡, F38 🟡, F39 🔵,
A11 (portal.ts) 🟡**

**A dor.** O portal é bonito e correto, e responde menos perguntas do que
poderia com o dado que já tem na mão — e cada pergunta que ele não responde
volta como mensagem de WhatsApp para a vendedora, que é exatamente o custo que o
E78 existia para reduzir. Ele manda a noiva "falar com a sua vendedora" três
vezes e **não tem um link para falar com a vendedora** (o payload traz só
`lojaNome`, e o endereço da loja já existe na sessão do lado de dentro). O
extrato lista as parcelas e não diz "falta pagar R$ X" nem "a próxima vence em
DD/MM" — a pergunta número 1 dela, a uma soma de distância, num carnê de 8
linhas lido no celular. A única ação disponível é "confirmo que vou", quando
ninguém abre um link para dizer que vai: abre-se para dizer "não vou poder" —
e é justamente esse aviso que devolve à loja o recurso mais caro do ateliê
(cabine + vendedora + vestido reservado). O contrato, que é o documento que ela
mais vai querer rever, é o único artefato do sistema sem caminho até ela. E o
link morre em 30 dias sem que ninguém do lado de dentro saiba: quando o portal
expira, `portalUrls.get()` devolve `undefined` e a mensagem de cobrança do E84
sai **sem o link, em silêncio**.

**Feito significa.** O portal responde "quanto falta", "quando é a próxima" e
"como eu falo com vocês"; a noiva consegue dizer que não vai poder ir; e um
portal expirado não degrada nada em silêncio.

**Escopo técnico.**
1. Rodapé com nome da loja, endereço e "Falar no WhatsApp" (`wa.me` do telefone
   da loja, com texto inicial que já identifica a noiva). Se a loja não tem
   telefone, o rodapé some — mesma regra do `AlertaCaixa`. Custa um campo no
   payload de `routes/portal.ts`. **(F35)**
2. Duas linhas acima do extrato: "Falta pagar R$ X" e "Próxima: R$ Y em DD/MM".
   Uma soma e um `find`, com os utilitários de centavos do `financeiro-core`.
   Desarma parte do E84. **(F36)**
3. "Não vou poder ir" como segundo botão, criando um **pedido de remarcação**
   (não remarca sozinho): a prova é marcada como "a remarcar" e a vendedora
   recebe a linha na fila do dia. Um passo além, se valer: oferecer 3 horários
   livres na mesma semana com `agenda-core/slotsOferecidos` — o mesmo motor do
   E64 — e a vendedora só confirma. **(F37)**
4. Seção "Seu contrato": os itens contratados (o snapshot já existe em
   `contrato.itens`), o valor, e o PDF servido pelo mesmo token do portal. O
   barato enquanto isso: "Enviar por WhatsApp" na tela do contrato, com uma
   mensagem que já leva o link do portal — a régua `lib/portal.ts` e
   `linkWhatsApp` já existem e são usadas em quatro telas. **(F21)**
5. Renovar o TTL a cada acesso da noiva (`ultimoAcessoEm` já é gravado), o que
   mantém vivo o link de quem usa e deixa morrer o de quem parou; e/ou regenerar
   quando uma mensagem do E84 vai sair com o portal morto. No mínimo, um aviso
   no sino: "N noivas ativas com portal expirado". **(F38)**
6. **Último item, cortável:** seção "O seu vestido" — o vestido reservado, os
   ajustes em andamento (só descrição e pronto/em andamento, nunca o checklist
   interno) e a data prevista de retirada. **(F39)**
7. Teste unitário de `lib/portal.ts` (`portalVivo`, `linkDoPortal`,
   `urlsDePortalPorLead`) cobrindo expirado, revogado e a fronteira do instante
   — é a função que decide se a mensagem sai com link vivo ou morto, e "link
   morto na mensagem é pior que nenhum" está escrito no cabeçalho do próprio
   arquivo. **(A11)**

**Cuidados.** (a) O portal expõe dado financeiro num link: cada campo novo no
payload é superfície nova — o telefone da LOJA é público, o da vendedora não;
(b) o item 5 muda a política de TTL, que é decisão de segurança documentada no
`replit.md` (30 dias): renovar por acesso mantém o espírito (o link de quem
parou morre) e precisa ser escrito lá; (c) o item 3 cria um estado novo de prova
— alinhe com o E97, que já mexe no ciclo de vida do atendimento; (d) o item 4
serve um PDF por token público: confirme que a rota checa TTL **e** revogação
como as outras quatro.

**Testes.** API: "falta pagar" bate com a soma de saldos do contrato ATIVO; o
pedido de remarcação aparece na fila da vendedora; o PDF pelo token expirado é
404; o unitário do item 7. E2E: a noiva abre o portal, vê o saldo e avisa que
não vai.

**Primeira ação.** As duas linhas de saldo no extrato (F36) — uma soma que apaga
a mensagem de WhatsApp mais frequente do ateliê.

---

## E101 — A permissão diz o que a rota faz

**Esforço: M** · **Fecha: B5 🟠, B7 🟠, B9 🟡, F42 🟡**

**A dor.** `acaoDoRequest` deriva a ação do método HTTP e abriu exceção para
dois nomes (`/cancelar`, `/estornar`) porque "a rota mentia sobre o que faz" —
e a lista parou ali. O caso caro é o expurgo: um perfil com `leads: {ver,
criar}` e **sem** `editar` — estado válido e comum, "a estagiária cadastra
noiva mas não altera" — pode disparar `POST /leads/expurgo` com
`{"mesesInatividade": 0}` e anonimizar **todas** as noivas PERDIDAS da loja de
uma vez, numa operação que o próprio comentário chama de irreversível por
desenho. Aprovar, recusar, gerar link de orçamento, pagar conta e enviar à
contabilidade caem na mesma armadilha. Ao lado disso, `GET
/lojas/:lojaId/dashboard` é uma das duas únicas rotas de loja sem
`requireModulo`, e entrega `receberProximos30Dias` e `pagarProximos30Dias` da
loja inteira: a costureira com perfil só de `agenda: {ver}` abre a tela inicial e
recebe a previsão de caixa — a informação que o gate `financeiro` existe para
restringir, entregue pela porta ao lado. E receber/estornar dinheiro de parcela
está atrás do módulo `leads`: a vendedora que o teste de permissões cria
*justamente para provar que ela não entra no financeiro* pode escrever no caixa
realizado, embora não possa vê-lo.

**Feito significa.** A ação exigida por uma rota corresponde ao que ela faz com
o dado, e está escrita na rota — não inferida por sufixo.

**Escopo técnico.**
1. As rotas que mutam declaram a ação explicitamente:
   `requireModulo("leads", "editar")` no expurgo, no aprovar, no recusar e no
   link; o portal já faz isso (`portal.ts:381`). Alternativa mais ampla:
   inverter o default — POST em `:id/<verbo>` é `editar`, POST em coleção é
   `criar`. A explícita é menor e mais legível. **(B5)**
2. Avaliar uma quarta ação (`excluir`) só para o expurgo: hoje ele é a operação
   mais destrutiva do sistema atrás da permissão mais fraca que existe. **(B5)**
3. Decidir o que o dashboard é. Se é o painel de todo mundo, os campos de
   dinheiro só entram quando `podeNoModulo(permissoes, "financeiro", "ver")` — o
   contrato já os marca como opcionais e a tela já esconde o card. Se é painel
   de gestão, `requireModulo("financeiro","ver")` na rota e a home de quem não
   tem passa a ser outra. **(B7)**
4. Decidir e **escrever** onde mora o recebimento. Se pertence a quem vende, um
   comentário em `contratos.ts:46` dizendo isso (a linha hoje não explica nada);
   se não, as rotas de parcela vão para `requireModulo("financeiro")` e `leads`
   fica com a leitura, que `GET /contratos/:id` já entrega. **(B9)**
5. `/equipe`: o convite por link vira a ação primária e o cadastro com senha
   escolhida pelo admin vira a opção secundária, com a frase que diz quando
   serve. O caminho pior é o que expõe uma senha em conversa de WhatsApp, e hoje
   os dois estão lado a lado sem nada dizendo qual usar. **(F42)**

**Cuidados.** (a) O item 1 pode quebrar perfis reais que hoje conseguem aprovar
orçamento com `criar` — levante quem usa antes de apertar, e comunique;
(b) o item 3 muda a home de um perfil inteiro: se a decisão for "painel de
gestão", o E98 precisa saber, porque a home de quem não tem financeiro passa a
ser outra tela; (c) o item 4 é decisão de produto de uma frase, e o valor está
em ela existir escrita — não deixe "como está" sem comentário.

**Testes.** `lote7-permissoes-api.test.ts` ganha: expurgo com `{criar}` e sem
`{editar}` → 403 (hoje passaria); dashboard sem `financeiro:ver` não traz os
campos de dinheiro (ou responde 403, conforme a decisão); receber parcela com o
perfil que nega financeiro → o comportamento decidido, afirmado no teste.

**Primeira ação.** O teste do expurgo sob perfil com `criar` e sem `editar`. Ele
transforma uma decisão implícita numa afirmação.

---

## E102 — As decisões de domínio financeiro

**Esforço: M** (código) · **Fecha: C5 🟠, C7 🟡, C8 🟡**

**A dor.** Três lugares em que o código faz uma coisa defensável e o produto diz
outra — e nenhum deles é bug de aritmética, então nenhum vai ser descoberto por
teste. **(1)** O estorno §6.4 é tudo-ou-nada por fechamento: se o mês não
absorve o estorno inteiro, nada é reconciliado e o **valor cheio** volta a pesar
no mês seguinte — mas a base daquele mês já foi consumida. No exemplo medido, a
vendedora vende R$ 38.000 em três meses, devia R$ 20.000, e recebe R$ 500 em vez
de R$ 1.800: os R$ 20.000 foram descontados três vezes. É dinheiro de pessoa,
calculado errado a favor da loja, sem nenhuma linha na tela que denuncie — e
`minha-comissao` ainda mostra "Já com R$ 20.000,00 de estorno abatido" num mês
em que ela recebeu zero. Há teste blindando o comportamento
(`lote9-comissao-api.test.ts:317-367`, chamado "estorno maior que o mês
CARREGA"). **(2)** A vigência de comissão é resolvida por competência inteira:
uma escada criada dia 20 reprecifica os 19 dias anteriores, e o preview salta de
R$ 2.000 para R$ 6.400 no instante em que ela é salva — pode ser deliberado, mas
o docstring promete "a regra que valia naquele mês" e o único teste só usa
virada de mês. **(3)** O DRE é regime de CAIXA e o produto o chama de "por
competência" (no `replit.md` e no seletor da tela), e a coluna
`contas_pagar.competencia`, que existe e está preenchida, não entra na conta:
**nenhuma comissão aparece no DRE da competência que a gerou.**

**Feito significa.** As três perguntas foram respondidas por quem decide o
produto, a resposta está escrita no código ou no `replit.md`, e o teste afirma a
resposta e não o acidente.

**Escopo técnico.**
1. **Perguntar primeiro** — este épico começa por três perguntas, não por
   código: (a) o estorno de comissão maior que o mês deve consumir a base
   proporcionalmente ou carregar cheio? (b) uma escada criada no meio do mês
   vale para o mês inteiro ou só para as vendas seguintes? (c) o DRE deve ser
   caixa (e mudar de nome) ou ganhar um irmão por competência?
2. **C5**, se a resposta for "proporcional": coluna
   `comissao_fechamentos.estornoAbsorvidoC` + `estornoResidualC` (o mês absorve
   `min(brutoC, estornoPendente)` e carrega o resto), ou reconciliação por
   CONTRATO (os cancelados que couberem são carimbados; os que não couberem
   carregam) — a segunda é menos precisa e cabe no modelo atual sem coluna nova.
   O teste do lote9 muda de asserção junto, porque hoje ele afirma o
   comportamento a corrigir. E `minha-comissao/index.tsx:105-106` passa a
   distinguir "abatido" de "pendente".
3. **C7**: ou recusar `vigenciaInicio` que não seja o primeiro dia de uma
   competência (o modelo vira "escada por mês", sem ambiguidade — é a saída mais
   honesta com o nome do campo), ou manter e documentar em `lib/comissao.ts` que
   a vigência tem granularidade de MÊS, com um teste que fixe o caso do meio do
   mês, hoje nunca exercitado.
4. **C8**: ou renomear a tela e o `replit.md` para "DRE de caixa" (barato,
   honesto, e o fluxo continua batendo por construção), ou acrescentar
   `drePorCompetencia(contas, pagamentos, competencia)` ao lado — `dreDoIntervalo`
   já é puro e o irmão cabe no core. O que não pode seguir é o mesmo nome para as
   duas coisas.

**Cuidados.** (a) Nenhum destes três vira commit antes da resposta — código
escrito sobre uma decisão que ninguém tomou é a definição de retrabalho; (b) o
C5 muda valores de fechamentos futuros e **não** deve recalcular os passados: a
correção vale daqui para a frente, e o caso extremo (a vendedora que parou de
vender) continua sendo resolvido pela baixa manual do I10; (c) a diferença de
custo entre as duas saídas do C8 é grande — uma linha de `replit.md` contra um
endpoint novo —, o que torna a pergunta explícita mais valiosa do que a
implementação.

**Testes.** C5: o cenário de três meses da trilha C, com a asserção da decisão
tomada; C7: o caso do meio do mês, hoje inexistente; C8: se vier o irmão por
competência, um teste de que a comissão de junho aparece no DRE de junho.

**Primeira ação.** Escrever as três perguntas com os exemplos numéricos da
trilha C e mandá-las para quem decide. Este é o único épico da rodada cuja
primeira ação não é código.

---

## E103 — O roteiro do mês e o roteiro da loja nova

**Esforço: M** · **Fecha: F30 🟠, F31 🟠, F41 🟠, F32 🟡, F34 🟡**

**A dor.** O financeiro é um conjunto de lentes muito bem construídas, sem um
roteiro. Fechar o mês são oito telas, sem ordem declarada — e a mais crítica
delas, Folha/Recorrências, **não está na sidebar nem na barra de links do hub**:
chega-se a ela só por um botão secundário dentro de "Contas a pagar", e o link
que leva a ela diz "Folha do mês" enquanto o H1 diz "Recorrências do mês", então
quem procura "folha" não acha e quem acha lê outro nome. Fechar o **dia**
simplesmente não existe: a ação mais parecida é o diálogo "Conferir saldo",
escondido dentro de `/financeiro/projecao` — e é esse gesto que ancora TODA a
projeção, sem o qual o `AlertaCaixa` não aparece **em silêncio**. Ou seja: um
sistema de alarme que se desliga sozinho quando a rotina diária não é feita, sem
dizer que está desligado. O export contábil são três arquivos em três telas com
semânticas diferentes, e só um deles carimba — o desenho que produz "mandei o
mesmo mês duas vezes" ou "esqueci as entradas". A conciliação não guarda nada:
todo mês se refaz o mesmo trabalho e as divergências antigas reaparecem sem
marca. E uma loja nova não tem roteiro nenhum: a ordem real (cabines + horário →
atributos → vestidos → escada de comissão → recorrências → primeira noiva) não
está escrita em lugar algum, e pular a escada faz o cartão de comissão
simplesmente não aparecer, sem erro e sem explicação.

**Feito significa.** Há um caminho declarado para fechar o dia, fechar o mês e
começar uma loja — e o sistema avisa quando um deles não foi percorrido.

**Escopo técnico.**
1. Quando não há âncora de saldo, o `AlertaCaixa` **fala** em vez de calar: um
   aviso neutro no hub — "A projeção está sem nível: confira o saldo do caixa
   para o alerta voltar a valer" — com o link. A disciplina de "nada a dizer é
   nada na tela" é a certa para o alarme e errada para a ausência de dado.
   **(F30)**
2. "Fechar o dia" como rotina curta no hub financeiro: as entradas de hoje por
   meio (`porMeio` já existe), as saídas de hoje e o campo de saldo conferido —
   três números e um botão, uma vez por dia. **(F30)**
3. O sino ganha "competência N sem recorrências geradas", com a mesma régua da
   pendência de comissão que já existe; e o nome da tela se unifica (o link e o
   H1 passam a dizer a mesma coisa). O link no hub já entrou no E92. **(F31)**
4. "Fechar o mês" único, como seção da folha (que já tem o conceito de envio):
   escolhe a competência, mostra os dois lados com os totais, baixa UM pacote e
   carimba os dois. As duas ações separadas — baixar e declarar — são a decisão
   certa e ficam. **(F34)**
5. Conciliação com memória, primeira etapa: marcar o movimento do sistema como
   `conciliadoEm` quando ele casa (uma coluna, um PATCH em lote), o que já
   destrava o filtro "só o não conciliado" e faz a segunda passada custar quase
   nada. **(F32)**
6. Cartão "Primeiros passos" no dashboard, visível enquanto houver item
   pendente, com 5 linhas derivadas de contagens que o sistema já faz (cabines,
   atributos, vestidos, escadas de comissão, recorrências) e o link de cada uma.
   Some quando tudo estiver feito — a mesma disciplina do `AlertaCaixa`. É a
   irmã do tour do E24: o tour responde "o que você pode fazer", este responde "o
   que falta configurar". **(F41)**

**Cuidados.** (a) O item 6 é uma tela nova no lugar mais visível do sistema —
some quando termina, e não pode virar um banner permanente; (b) o item 5
adiciona coluna: DDL em `docs/migracoes/`, e o `conciliadoEm` não pode ser
confundido com `enviadoContabilidadeEm` (são fatos diferentes); (c) o item 4
não pode remover os exports parciais que alguém já usa — o pacote único é um
caminho a mais, não a substituição.

**Testes.** Unitário da regra de "primeiros passos" (contagens → itens
pendentes); API: o aviso de competência sem recorrências aparece e some;
`conciliadoEm` em lote é idempotente; front: o `AlertaCaixa` sem âncora mostra o
aviso neutro em vez de nada.

**Primeira ação.** O aviso neutro do `AlertaCaixa` sem âncora. Hoje o alarme
mais grave do sistema pode estar desligado sem que ninguém saiba.

---

## E104 — Higiene do repo, do build e do bundle

**Esforço: M** · **Fecha: A4 🟠, D8 🟠, A6 🟡, A7 🟡, A8 🟡, A12 🔵, A13 🔵
(parcial), B15 🔵, C10 🔵** (+ o flake e2e herdado do E90)

**A dor.** 1.611 arquivos e 22 MB de `.migration-backup/` estão **versionados**,
com nomes idênticos aos dos arquivos vivos e um `replit.md` desatualizado
dentro: é a maior fonte de falso positivo de qualquer busca no repo — nesta
rodada foi preciso filtrá-la de praticamente toda varredura. O `mockup-sandbox`
é um workspace inteiro sem nenhum import de `@workspace/*`, com a pasta de
mockups **vazia**, ~40 devDependencies próprias e cópias de `ui/sidebar.tsx` e
`ui/chart.tsx` — e entra no `typecheck` e no `build` de toda pipeline por zero
produto. O typecheck do front exclui `**/*.test.ts`, então "o fiscal está de
olhos fechados" exatamente onde o E88 dizia que ele era o fiscal. O bundle é um
único arquivo de 1,1 MB: a recepcionista que só abre a agenda baixa o console
superadmin, o parser OFX e o editor de foto antes de a tela de login pintar, e
qualquer deploy invalida o cache de tudo. E há quatro pontas soltas de tipo e
fronteira: uma rota fora do contrato, `financeiro-core` ausente das project
references (o que faz o gotcha do `dist` velho valer para uns pacotes e não para
outros — pior do que valer para todos), `addDias`/`inicioDoDia` do financeiro
importados de um módulo de disponibilidade de vestidos, e o parser de 6 MB
montado antes de qualquer autenticação.

**Feito significa.** Buscar no repo devolve só código vivo; o typecheck cobre o
que promete; e a primeira tela do dia não carrega o sistema inteiro.

**Escopo técnico.**
1. `git rm -r --cached .migration-backup` + entrada no `.gitignore` (o conteúdo
   permanece no histórico). Se algo ali ainda importa — skills, memória de
   agente —, promover para o lugar certo antes. **(A4)**
2. Decidir sobre `mockup-sandbox`: se não é ferramenta de design viva, remover o
   pacote; se é, tirá-lo do `pnpm-workspace.yaml` de produção ou do filtro de
   typecheck/build. **(A6)**
3. Remover `**/*.test.ts` do `exclude` de `moscow-noivas/tsconfig.json` — como o
   api-server já faz. Se algo quebrar, é justamente o que se quer descobrir.
   **(A7)**
4. `React.lazy` + `Suspense` por rota no `App.tsx`, começando por `admin/*`,
   `financeiro/conciliacao`, `comissoes` e `contratos/[id]` — nenhuma delas
   aberta no primeiro minuto de sessão de ninguém —, mais `manualChunks`
   separando o cliente gerado e o `date-fns` do código de aplicação, para que o
   deploy de uma tela não invalide o vendor. **(D8)**
5. `GET /contratos/{id}/parcelas`: confirmar que está morto (não há hook gerado
   nem tela que o chame) e remover; se houver consumidor externo, documentá-lo no
   spec e regerar. Fecha a única brecha no invariante spec = servidor. **(A8)**
6. `{"path": "../../lib/financeiro-core"}` nas references dos dois consumidores
   — uniformiza tudo no modelo "compilado" e faz o gotcha do `replit.md` passar
   a valer sempre **(A12)**; e então `routes/financeiro.ts` importa `addDias`/
   `inicioDoDia` de `@workspace/financeiro-core` em vez do módulo de
   disponibilidade **(C10)**.
7. `strictFunctionTypes: true` em `tsconfig.base.json`. **(A13, primeira
   metade)**
8. O `express.json({ limit: "6mb" })` da rota de foto vira middleware **da
   rota**, depois de `requireSessaoComLoja` e `requireModulo("vestidos")` — hoje
   é o único ponto do servidor onde trabalho não trivial acontece antes do gate.
   **(B15)**
9. **Herdado do E90:** o flake `26-prova-ocupa-intervalo` é estado ACUMULADO do
   banco e2e (o spec isola a cabine, mas compartilha a vendedora do seed).
   Vendedora própria por execução, como a cabine já é.

**Cuidados.** (a) O item 1 muda o `git status` de todo mundo — avise antes e
faça-o num commit isolado, sem nada mais junto; (b) o item 3 pode acender uma
fila de erros de tipo nos testes: se for grande, corrija num commit próprio, mas
não desligue a flag de novo; (c) o item 4 muda o carregamento de rota: confira
o fallback do `Suspense` dentro do `AppLayout` para não piscar a tela inteira;
(d) o item 6 mexe na ordem de build — rode `npx tsc --build` na raiz depois.

**Testes.** O typecheck é o fiscal dos itens 3, 6 e 7. Medir o bundle antes e
depois do item 4 e anotar no commit (a linha de base é 1,1 MB num chunk +
108 KB de CSS). API: a rota de foto continua aceitando 6 MB **depois** do login
e rejeitando antes. E2E: `26-prova-ocupa-intervalo` verde duas execuções
seguidas no mesmo dia.

**Primeira ação.** O `git rm -r --cached .migration-backup` + `.gitignore`.
Vale antecipar para o dia 1 da rodada, antes dos outros treze épicos: ele
envenena toda busca de quem for executá-los.

---

## Resumo executivo

| Épico | Natureza | Esforço | Achados | Depende de |
|---|---|---|---|---|
| E91 | Segurança de tenant e integridade de dado | M | B1, B2, B4, B10, B12 | — |
| E92 | Ganhos rápidos (UI, rótulo, teclado, link) | P | E1, E2, E4, E5, E7, E11, E13, E15, E16, E20, E22, E23, C11, D12, F8, F31, F44 | — |
| E93 | Correção e performance do cliente | M | D1, D2, D3, D4, D9, D10, D13 | ordem interna: D9 antes de D3 |
| E94 | Correção e auditabilidade do dinheiro | M | A2, B3, B6, B8, C4, F33 | — |
| E95 | Unificação da aritmética do orçamento | G | A1, A3, A11, B11, C1, C2, C3, C6, C9, F16, F18, F19, F20 | E94 (listas de status no core) |
| E96 | Contrato de erro até a borda | M | B13, D5, D6, F17 | E95 (códigos estáveis) |
| E97 | Registro operacional e reversibilidade | G | D14, F6, F11, F15, F22, F23, F24, F25, F26 | — |
| E98 | Jornadas: as telas se alcançam | G | E3, E9, F1–F5, F7, F9, F10, F12, F13, F14, F27, F28, F29, F40, F43 | E92 (tokens) |
| E99 | A camada de UI que falta | G | A5, A9, D7, D11, D15, E6, E8, E10, E12, E14, E17, E18, E19, E21 | E92, E98 (cabeçalho de detalhe) |
| E100 | O portal responde mais | G | A11, F21, F35, F36, F37, F38, F39 | E97 (ciclo de vida da prova) |
| E101 | Permissão explícita por rota | M | B5, B7, B9, F42 | — |
| E102 | Decisões de domínio financeiro | M | C5, C7, C8 | resposta de produto |
| E103 | Roteiro do dia, do mês e da loja nova | M | F30, F31, F32, F34, F41 | E92 (link da folha) |
| E104 | Higiene de repo, build, bundle e tipos | M | A4, A6, A7, A8, A12, A13, B15, C10, D8 | item 1 antecipado |

**Fora desta rodada, conscientemente:** A10 (quebrar as páginas de mil linhas
como épico próprio — as costuras são cortadas de dentro do E95/E98/E99), a
segunda metade do A13 (`noUncheckedIndexedAccess`), a reescrita do design system
por trás do E19, a segunda etapa do F32 (divergências perdoadas com motivo) e
tudo o que exige API externa. O detalhamento e o motivo de cada um estão em
`docs/revisao/2026-07-25-rodada-6/G-consolidado.md`, seção "Conscientemente fora
desta rodada".
