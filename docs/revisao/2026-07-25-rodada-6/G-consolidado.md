# Trilha G — Consolidação da Rodada 6

**Rodada 6** · commit `01729db` · 2026-07-25

## O estado do sistema em uma página

Este review não encontrou um sistema frágil. Encontrou um sistema com **miolo
sólido e bordas soltas**, e essa distinção é a coisa mais importante que a
rodada 6 tem a dizer.

O miolo: o contrato OpenAPI bate com a implementação em 177 × 178 operações,
com **zero** endpoints do spec sem rota e uma única sobra (A8). Não há um `as
any` em código de produção. Os três motores puros (`financeiro-core`,
`funil-core`, `agenda-core`) são consumidos pelos dois lados, com teste de
propriedade onde importa. O E79 **não** criou um motor SQL paralelo — o
servidor recorta linhas e chama as mesmas funções, então fluxo e DRE fecham por
construção. O sistema de permissão é fail-closed, o padrão "sub-recurso confere
o PAI" está aplicado com disciplina, as três idempotências que importam têm
constraint de banco embaixo, e o portal público checa TTL **e** revogação nas
quatro rotas sem exceção. Do lado visual, os tokens são usados de verdade (1
cor cinza crua em `pages/` inteiro), o dark mode é íntegro, **nenhum** botão
ficou sem nome acessível em 16 rotas auditadas e todo `alt` está presente. Nada
disso deve ser mexido.

O que falha é sempre **onde duas coisas se encostam**:

- **O front reimplementa a aritmética do servidor.** A tela de orçamento monta
  o plano de parcelas em float, calcula o líquido com outra fórmula e lê
  dinheiro com `Number()` — três divergências medidas, uma delas travando 1,32%
  das vendas com desconto percentual num 422 sem saída (A1, A3, C1, C2, C3).
- **O SQL reimplementa o motor.** O `alerta-caixa` esqueceu o status `PARCIAL`
  nas duas pernas e por isso discorda do `/financeiro/fluxo` sobre o mesmo
  caixa (C4).
- **O id que vem do corpo não passa pela régua de escopo.** `lib/escopo-loja.ts`
  existe, tem quatro funções prontas e é usado em quatro rotas de dezenas; as
  rotas de equipe escrevem na tabela global `usuarios` pelo id do path e
  derrubam o administrador da loja vizinha (B1, B4).
- **O cliente não consome o contrato.** O `api-zod` gerado tem **zero**
  consumidores no frontend; os 12 formulários reescrevem o schema à mão (D5) —
  a causa-raiz, do lado de cá, do C1 e do C3.
- **A tela não conhece a tela vizinha.** Em 8 das 9 jornadas, a tela onde a
  pessoa descobre o problema não é a tela onde ela pode resolvê-lo, e não há
  link entre as duas (F1, F7, F27, F31, F40).
- **Falta uma camada de UI entre os tokens e as telas.** `<Table>` usada em 1
  arquivo, `<Pagination>`/`<Empty>`/`<Breadcrumb>` em zero, 98 cópias à mão de
  `R$ {brl()}`, quatro idiomas de "carregando" e quatro de "erro" (A5, E5, E17,
  E18, E19).

O TEMA, então, é um só: **o sistema tem réguas boas e não as aplica nas
bordas.** Quase todo achado desta rodada é "existe a função certa, no lugar
certo, com o comentário certo — e este caller não a chama". Isso é uma boa
notícia disfarçada: significa que a maioria dos consertos é *adotar o que já
existe*, não inventar nada. Dois achados fogem dessa forma e por isso são os
mais caros: o carimbo de `confirmadoEm` medindo a coisa errada (F6) e o estorno
de comissão sem residual (C5) — esses precisam de decisão de produto antes de
código.

## Placar

| Trilha | 🔴 | 🟠 | 🟡 | 🔵 | Total |
|---|---|---|---|---|---|
| A — Arquitetura, contrato e dívida estrutural | 0 | 4 | 7 | 2 | **13** |
| B — Backend: correção, segurança e dados | 2 | 6 | 6 | 1 | **15** |
| C — Domínio financeiro | 1 | 4 | 4 | 2 | **11** |
| D — Frontend: qualidade e performance | 1 | 7 | 6 | 1 | **15** |
| E — UI: design, consistência, acessibilidade | 3 | 10 | 8 | 2 | **23** |
| F — UX: jornadas, atrito e produto | 2 | 24 | 16 | 2 | **44** |
| **Total** | **9** | **55** | **47** | **10** | **121** |

Os nove 🔴: **B1** (escrita cross-loja em `usuarios`), **B2** (`ON DELETE
CASCADE` em `contratos.vendedoraId`), **C1** (líquido em float × centavos),
**D1** (loop de render da loja ativa), **E1** (`<html lang="en">`), **E2**
(contraste 2,79:1 em todo botão primário), **E3** ("Contas a receber" sem o
nome da noiva), **F6** (o carimbo de "confirmado" mente), **F17** (o 422 do
"Gerar contrato" num beco).

## Os 8 problemas que mais importam

**1. A tela de orçamento calcula dinheiro por conta própria — e já erra.**
`A1+A3+C1+C2+C3+C6+C9+D5+F16+F18+F19+F20`. É o achado mais atravessado da
rodada: cinco trilhas viram o mesmo arquivo (`pages/orcamentos/[id].tsx`) de
ângulos diferentes. Ele monta o plano de parcelas em float (`Math.floor((r/n)*100)/100`)
enquanto o servidor tem `ratearRestante` com prova de propriedade — 1,77% dos
carnês saem diferentes, em silêncio, porque a soma sempre fecha e a guarda
nunca dispara. Ele calcula o líquido com `round2` em reais enquanto o
`POST /contratos` calcula em centavos inteiros — 1,32% das vendas com desconto
percentual batem num 422 que a vendedora não tem como destravar pela tela, e
quando há versão ENVIADA o hash do aceite aponta para o número que o servidor
recusa. Ele lê "5.800" com `Number()` e cria um item de R$ 5,80. E ele carimba
o vencimento da entrada com `new Date()`, o que das 21h à meia-noite muda o dia
— e, no dia 31, o mês. Um épico, um arquivo, uma direção: a aritmética sobe
para `@workspace/financeiro-core` e a tela passa a chamá-la.

**2. A fronteira da loja tem furos, e um deles não precisa de nada além de um
`curl`.** `B1+B4+B2+B10+B12`. `PATCH /lojas/:lojaId/equipe/:usuarioId` atualiza
`nome`/`ativo` na tabela **global** `usuarios` pelo id do path, sem cruzar com
a loja: a dona da loja A desativa a dona da loja B, derruba as sessões dela e a
auditoria fica na loja A, onde a vítima nunca olha. Ao lado disso, quatro rotas
de escrita aceitam id do corpo sem conferência (contrato/`vendedoraId`,
orçamento/`leadId`, conta a pagar/`colaboradorId`, recorrência/`usuarioId`) — o
efeito é vazamento de ficha de noiva entre lojas via `with: { lead: true }` e
comissão nominal a alguém de fora. E `contratos.vendedoraId` é `ON DELETE
CASCADE`, contrariando a decisão escrita no `replit.md`: excluir uma vendedora
apaga os contratos, as parcelas **PAGAS**, os itens e os fechamentos dela, sem
confirmação e sem trilha.

**3. Dinheiro muda sem deixar rastro — e dois números do sistema já discordam
hoje.** `A2+B3+B6+B8+C4+F33`. `POST /parcelas/:id/receber` é check-then-set: dois
lançamentos simultâneos (ou um clique duplo) e R$ 300 entram na gaveta e não
existem no sistema. O cancelamento de contrato com `destinoPago: "estornar"`
zera `valorRecebido`/`recebidoEm` de parcelas PAGAS — muda o caixa realizado de
um mês que pode já ter sido enviado ao contador — e a transação inteira não
chama `registrarAuditoria` uma vez (`CONTRATO_CANCELADO` nem existe na união de
ações). O `DELETE` de conta a pagar apaga a conta de COMISSÃO gerada por um
fechamento e a FK zera o vínculo em silêncio: a vendedora não recebe e nada
aponta para isso. Duas rotas diferentes gravam "conta paga" com trilhas de
auditoria **diferentes**, e a suíte testa justamente a que a UI não usa. E o
`alerta-caixa` esqueceu `PARCIAL` nas duas pernas do SQL: o sino anuncia que o
caixa fura enquanto a tela de projeção, clicada no segundo seguinte, mostra o
caixa positivo.

**4. A página se declara em inglês, e por isso toda data do sistema é
`mm/dd/yyyy`.** `E1`. Uma palavra em `index.html:2` (`<html lang="en">`) faz o
navegador desenhar os 25 `type="date"`, o `type="month"` e o `type="time"` no
formato americano, em 14 telas. O filtro de "Contas a receber" diz `De
07/01/2026 Até 07/31/2026` — que em português se lê "de 7 de janeiro a 31 de
julho". O seletor de competência da folha diz literalmente "July 2026". O campo
de horário do casamento tem slot de **AM/PM**. Nenhum desses erros dá erro: dão
número errado com cara de certo, numa tela de dinheiro. É também violação de
WCAG 3.1.1 nível A. Conserto: uma palavra.

**5. O texto de todo botão primário do sistema reprova em contraste.** `E2`.
Medido no navegador com os tokens computados: `--primary-foreground` branco
sobre `--primary` rosa dá **2,79:1**, contra os 4,5:1 que a WCAG AA exige.
"Entrar", "Agendar", "Fechar competência", "Gerar link" — todos. E
`text-muted-foreground`, que carrega quase toda a informação secundária do app,
falha fora do card (4,45:1 e 4,15:1). A marca é o rosa e deve ficar; o que muda
é o que vai em cima dele. São duas linhas em `index.css`.

**6. O carimbo de "confirmado" mede a coisa errada, e não tem desfazer.**
`F6+F11+F15+F26`. Abrir o `wa.me` em "Mensagens de hoje" dispara
`confirmarAtendimento` no `onClick` — antes de escrever, antes de enviar, antes
de a noiva ler. E é o **mesmo campo** que o portal usa quando a noiva confirma
de verdade (E85), então os dois sentidos ficam indistinguíveis depois de
gravados. É o único número sobre o qual a loja toma uma decisão física (segurar
a cabine, escalar a vendedora), e não há tela nenhuma que o desfaça. Na mesma
família: uma PROVA não pode ser concluída nem marcada como falta em tela alguma
do sistema — toda prova fica em `AGENDADO` para sempre, degradando o contador
do sino; e a cobrança pelo caminho rápido (a fila do dia) não deixa rastro
enquanto a mesma cobrança pelo caminho lento deixa.

**7. As telas não se alcançam: o padrão que se repete em 8 das 9 jornadas.**
`E3+E9+F1+F4+F7+F9+F10+F12+F14+F27+F28+F29+F40+F43`. A ficha da noiva sabe o
`leadId` e não agenda, embora o deep-link `?noiva=` exista e outra tela já o
use. "Contas a receber" mostra quatro linhas visualmente idênticas e o nome da
noiva só existe no CSV — o comentário do próprio arquivo o diz. A tela do
contrato não tem volta, e o `Badge` "Ativo" preenchido de rosa entre dois
botões é o elemento mais clicável dos três. O dashboard promete "o que precisa
da sua atenção agora" e não linka para "Mensagens de hoje", a tela que de fato
responde isso. "Mensagens de hoje" está gateada por `agenda` no menu, embora a
tela funcione por partes — quem cuida do financeiro nunca a alcança.
"Configurações" é a única tela do sistema que não configura nada e não linka
para quem configura. Em todos esses casos a informação existe, a ação existe, e
o que falta é um `<Link>`.

**8. O cliente briga consigo mesmo: um loop, cache 100% default e over-fetch.**
`D1+D2+D3+D4+D9+D10+D13`. Dois `useEffect` sincronizam a loja ativa em direções
opostas (`use-auth.tsx:23` × `app-layout.tsx:24`); um bookmark para outra loja
trava a página em "Maximum update depth exceeded", com a aba a 100% de CPU e a
tela em branco. `grep staleTime|gcTime|refetchOnWindowFocus` no app inteiro:
**nenhum resultado** — cada alt-tab de volta refaz 8 requests no dashboard e 7
em `/comissoes`, e é esse mesmo refetch que apaga o que a pessoa digitou na
configuração de horário (D13) e que arma a perna (b) do loop. Ao mesmo tempo,
quatro telas ainda baixam a tabela inteira da loja para mostrar uma janela — a
conciliação pede todas as parcelas e todos os pagamentos **no mount**, antes de
o arquivo ser escolhido. E há uma ordem obrigatória aqui: pôr `staleTime` sem
consertar a invalidação do caixa (D9) converte um incômodo de rede em dado
financeiro velho na tela.

## Agrupamentos: os achados que são o mesmo problema

| Tema | Achados que ele cobre | Épico |
|---|---|---|
| A tela de orçamento calcula dinheiro sozinha | A1, A3, A11(visao-noiva), B11, C1, C2, C3, C6, C9, F16, F18, F19, F20 | **E95** |
| O id do corpo entra sem prova de pertencimento (+ o cascade e os índices que moram na mesma migração) | B1, B2, B4, B10, B12 | **E91** |
| Dinheiro muda sem rastro, e o alerta discorda do fluxo | A2, B3, B6, B8, C4, F33 | **E94** |
| O erro do servidor não chega ao campo que o causou | B13, D5, D6, F17 | **E96** |
| O cliente briga consigo mesmo (loop, cache, over-fetch) | D1, D2, D3, D4, D9, D10, D13 | **E93** |
| O que o sistema carimba, conclui e desfaz nas telas operacionais | D14, F6, F11, F15, F22, F23, F24, F25, F26 | **E97** |
| A tela onde se descobre não é a tela onde se resolve | E3, E9, F1–F5, F7, F9, F10, F12, F13, F14, F27, F28, F29, F40, F43 | **E98** |
| Falta uma camada de UI entre os tokens e as telas | A5, A9, D7, D11, D15, E6, E8, E10, E12, E14, E17, E18, E19, E21 | **E99** |
| Consertos de uma linha, alto impacto | C11, D12, E1, E2, E4, E5, E7, E11, E13, E15, E16, E20, E22, E23, F8, F31(link), F44 | **E92** |
| O portal responde menos perguntas do que poderia | A11(portal.ts), F21, F35, F36, F37, F38, F39 | **E100** |
| A permissão não diz o que a rota faz | B5, B7, B9, F42 | **E101** |
| Decisões de domínio que precisam de resposta antes de código | C5, C7, C8 | **E102** |
| O mês e a loja nova não têm roteiro | F30, F31, F32, F34, F41 | **E103** |
| Higiene de repo, build, bundle e tipos | A4, A6, A7, A8, A12, A13, B15, C10, D8 | **E104** |

Três cruzamentos merecem destaque porque só aparecem no consolidado:

- **A1+C2+F20 são o mesmo bug visto três vezes** (arquitetura: "duas
  implementações"; financeiro: "1,77% dos carnês divergem"; UX: "o gerador bom
  é o menos alcançável"). Consertar um conserta os três, e a correção **arrasta
  uma mudança de datas** (C9: o servidor espaça por 30 dias, a tela por mês) que
  ninguém pediu — por isso o C9 tem de entrar no mesmo épico, decidido de
  propósito, e não descoberto durante.
- **B13 → D6 → E4 → F17 é uma cadeia de quatro trilhas para um erro só.** O
  servidor devolve `parsed.error.message` cru do Zod (B13); o cliente não tem um
  `setError` no app inteiro (D6); a última perna do `mensagemApi` repassa
  `err.message` (E4, confirmado em captura: *"Erro ao fazer login / HTTP 404 Not
  Found"*); e a vendedora, no clique que fecha a venda, lê *"Itens menos
  desconto (950.48) difere do valor total (950.47)"* num diálogo sem saída (F17).
- **A5 não é código morto por acaso.** Os 27 primitivos shadcn sem consumidor
  (A5) são o mesmo diagnóstico que E19 (`<Table>` em 1 arquivo, `<Empty>` em
  zero), E17 (quatro idiomas de carregando), E18 (30 vazios mudos) e D7 (`R$
  0,00` enquanto carrega): não falta biblioteca, falta **decidir** o que é a
  camada de UI deste app.

## Rastreabilidade dos 121 achados

Todos os 121 estão numa linha abaixo. `E9x` = épico que o resolve; `fora` =
conscientemente não feito nesta rodada, com o motivo na última seção.

### Trilha A (13)

| Achado | Sev | Épico | Nota |
|---|---|---|---|
| A1 — plano de parcelas calculado duas vezes | 🟠 | E95 | núcleo do épico |
| A2 — duas rotas de "pagar conta", trilhas diferentes | 🟠 | E94 | uniformiza a auditoria |
| A3 — `round2` e o desconto em três lugares | 🟠 | E95 | o E88 ficou pela metade |
| A4 — `.migration-backup/` versionado (22 MB) | 🟠 | E104 | primeira ação do épico |
| A5 — 27 shadcn sem consumidor | 🟡 | E99 | a poda que precede a adoção |
| A6 — `mockup-sandbox` no typecheck/build | 🟡 | E104 | |
| A7 — testes do front fora do typecheck | 🟡 | E104 | |
| A8 — `GET /contratos/{id}/parcelas` fora do contrato | 🟡 | E104 | fecha o invariante spec=servidor |
| A9 — `pages/financeiro/helpers.tsx` virou a lib do app | 🟡 | E99 | sobe para `@/lib` junto com a camada de UI |
| A10 — toda página grande é um componente só | 🟡 | **fora** | ver "Conscientemente fora" |
| A11 — sem teste: `visao-noiva` e `lib/portal.ts` | 🟡 | E95 + E100 | um teste em cada épico |
| A12 — `financeiro-core` fora das project references | 🔵 | E104 | pré-requisito do C10 |
| A13 — `strictFunctionTypes: false` | 🔵 | E104 (parcial) | `noUncheckedIndexedAccess` fica fora |

### Trilha B (15)

| Achado | Sev | Épico | Nota |
|---|---|---|---|
| B1 — equipe escreve na tabela global `usuarios` | 🔴 | E91 | primeira ação da rodada |
| B2 — `contratos.vendedoraId` ON DELETE CASCADE | 🔴 | E91 | DDL em `docs/migracoes/` |
| B3 — cancelar com "estornar" sem trilha | 🟠 | E94 | com F33, que é a face de tela |
| B4 — ids do corpo sem escopo em 4 rotas | 🟠 | E91 | `escopo-loja.ts` já resolve |
| B5 — `acaoDoRequest` só conhece cancelar/estornar | 🟠 | E101 | o expurgo é o caso caro |
| B6 — `receber` é check-then-set (lost update) | 🟠 | E94 | única forma de dinheiro sumir por uso normal |
| B7 — dashboard sem gate de módulo | 🟠 | E101 | |
| B8 — DELETE apaga a conta de COMISSÃO | 🟠 | E94 | |
| B9 — receber/estornar atrás do módulo `leads` | 🟡 | E101 | decidir e escrever |
| B10 — nenhum índice em `loja_id` | 🟡 | E91 | mesma migração do B2 |
| B11 — `criarVersaoEnviada` fora da transação | 🟡 | E95 | o snapshot congela o líquido do C1 |
| B12 — reset de senha não derruba sessões | 🟡 | E91 | |
| B13 — 400 devolve `parsed.error.message` cru | 🟡 | E96 | origem da cadeia de erro |
| B14 — buracos de teste | 🟡 | distribuído | um teste por achado em E91, E94, E95, E101 |
| B15 — parser de 6 MB antes da autenticação | 🔵 | E104 | |

### Trilha C (11)

| Achado | Sev | Épico | Nota |
|---|---|---|---|
| C1 — líquido em float × centavos (422 em 1,32%) | 🔴 | E95 | |
| C2 — rateio do front erra por `Math.floor` de float | 🟠 | E95 | |
| C3 — `Number()` no lugar de `parseValor` | 🟠 | E95 | |
| C4 — `alerta-caixa` esqueceu `PARCIAL` | 🟠 | E94 | duas linhas de SQL, vai primeiro |
| C5 — estorno de comissão sem residual | 🟠 | E102 | precisa de decisão de produto |
| C6 — `vencimento` da entrada nasce instante | 🟡 | E95 | |
| C7 — vigência de comissão por competência inteira | 🟡 | E102 | decidir e escrever |
| C8 — DRE é caixa e o produto o chama de competência | 🟡 | E102 | decidir e escrever |
| C9 — `gerar-plano` espaça 30 dias; a tela, por mês | 🟡 | E95 | a correção do C2 arrasta esta decisão |
| C10 — `addDias`/`inicioDoDia` duplicados | 🔵 | E104 | depende do A12 |
| C11 — soma em float em `comissoes/index.tsx:191` | 🔵 | E92 | uma linha |

### Trilha D (15)

| Achado | Sev | Épico | Nota |
|---|---|---|---|
| D1 — loop de render da loja ativa | 🔴 | E93 | primeira ação do épico |
| D2 — 4 telas baixam a tabela inteira | 🟠 | E93 | arrasta `openapi.yaml` |
| D3 — nenhum `staleTime` no app | 🟠 | E93 | **só depois** do D9 |
| D4 — orçamento baixa todos os leads | 🟠 | E93 | uma linha |
| D5 — `api-zod` com zero consumidores | 🟠 | E96 | causa-raiz cliente do C1/C3 |
| D6 — `setError` não existe no app | 🟠 | E96 | |
| D7 — `R$ 0,00` enquanto carrega | 🟠 | E99 | com E17 |
| D8 — zero code splitting (1,1 MB num chunk) | 🟠 | E104 | `recharts` cai com o A5 |
| D9 — receber/estornar invalidam só as parcelas | 🟡 | E93 | **antes** do D3 |
| D10 — `/comissoes` com 7 queries, duas iguais | 🟡 | E93 | |
| D11 — faixas de comissão com `key={i}` | 🟡 | E99 | |
| D12 — custo de reparo formatado à mão | 🟡 | E92 | uma linha |
| D13 — effect sobrescreve a digitação | 🟡 | E93 | sintoma do D3 |
| D14 — formulário sujo sai sem aviso | 🟡 | E97 | |
| D15 — store sem seletor, 25 `Intl` à mão | 🔵 | E99 | |

### Trilha E (23)

| Achado | Sev | Épico | Nota |
|---|---|---|---|
| E1 — `<html lang="en">` | 🔴 | E92 | uma palavra |
| E2 — contraste 2,79:1 em todo botão primário | 🔴 | E92 | duas linhas de token |
| E3 — "Contas a receber" sem o nome da noiva | 🔴 | E98 | o dado já está no CSV |
| E4 — erro da API vira "HTTP 404 Not Found" | 🟠 | E92 | uma linha; o resto no E96 |
| E5 — `R$` se descola do número no celular | 🟠 | E92 | `brl()` passa a trazer o símbolo |
| E6 — dinheiro em quatro tipografias | 🟠 | E99 | escala de dinheiro |
| E7 — dashboard mostra dinheiro sem `R$` | 🟠 | E92 | de graça com o E5 |
| E8 — valor da venda com a cor do atraso | 🟠 | E99 | |
| E9 — contrato sem volta; status parece botão | 🟠 | E98 | define o cabeçalho de detalhe |
| E10 — destrutivas encostadas nas comuns | 🟠 | E99 | uma regra escrita uma vez |
| E11 — alvos de toque < 44px no celular | 🟠 | E92 | uma linha em `button.tsx` |
| E12 — noiva inexistente vira esqueleto + HTTP 404 | 🟠 | E99 | as telas irmãs já acertam |
| E13 — total do mês só dentro do diálogo | 🟠 | E92 | um `<li>` |
| E14 — DRE esconde o resultado no fim | 🟡 | E99 | |
| E15 — `capitalize` sobre a frase inteira | 🟡 | E92 | |
| E16 — termo interno vazando ("2026-07", "Leads") | 🟡 | E92 | |
| E17 — quatro idiomas de carregando e de erro | 🟡 | E99 | |
| E18 — 30 estados vazios mudos | 🟡 | E99 | |
| E19 — não há camada de UI própria | 🟡 | E99 | causa-raiz de E5/E6/E15/E17/E18 |
| E20 — três teclados para dinheiro, e o mais usado sem nenhum | 🟡 | E92 | cinco atributos |
| E21 — duas convenções de capitalização | 🟡 | E99 | |
| E22 — `<Badge>` dentro de `<p>` | 🔵 | E92 | |
| E23 — funil sem `<h1>`; `/vestidos` H1→H3×114 | 🔵 | E92 | |

### Trilha F (44)

| Achado | Sev | Épico | Nota |
|---|---|---|---|
| F1 — a ficha não agenda | 🟠 | E98 | o deep-link já existe |
| F2 — origem nasce "Loja" e é imutável | 🟠 | E98 | envenena `/noivas/conversao` |
| F3 — WhatsApp opcional e a falta aparece longe | 🟠 | E98 | badge vira link |
| F4 — não dá para cadastrar noiva dentro de agendar | 🟠 | E98 | o padrão do E65 no mesmo arquivo |
| F5 — ficha nova são oito cards vazios | 🟡 | E98 | faixa de próximo passo |
| F6 — "confirmado" carimbado ao abrir o wa.me | 🔴 | E97 | núcleo do épico |
| F7 — dashboard não linka para "Mensagens de hoje" | 🟠 | E98 | |
| F8 — o sino manda para a agenda | 🟡 | E92 | uma linha |
| F9 — "Mensagens de hoje" gateada só por `agenda` | 🟠 | E98 | ~5 linhas no `podeVer` |
| F10 — "Hoje na loja" é lista sem ações | 🟡 | E98 | |
| F11 — uma PROVA não pode ser concluída | 🟠 | E97 | dado que degrada em silêncio |
| F12 — dois "agendar", e o mais acessível é o pior | 🟠 | E98 | remove ~110 linhas |
| F13 — nada sabe do atendimento em curso | 🟠 | E98 | ideia NOVA; segunda metade do épico |
| F14 — interesses/lookbook fora do atendimento | 🟡 | E98 | |
| F15 — confirmação na ação segura, não na destrutiva | 🟡 | E97 | |
| F16 — o diálogo não mostra as parcelas que vai criar | 🟠 | E95 | mata o 422 antes do clique |
| F17 — o 422 do contrato num beco | 🔴 | E96 | curto prazo: dicionário |
| F18 — orçamento dos atalhos nunca tem validade | 🟠 | E95 | desliga o E69 para ele |
| F19 — "Aprovar" antes apaga o aceite da noiva | 🟡 | E95 | o E74 se perde por ordem de cliques |
| F20 — dois geradores de plano de parcelas | 🟡 | E95 | |
| F21 — não há como mandar o contrato para a noiva | 🟡 | E100 | |
| F22 — "Cobrar reparo" cria duas parcelas | 🟠 | E97 | |
| F23 — avaria apagada sem confirmação | 🟠 | E97 | a foto é a prova da cobrança |
| F24 — "Marcar feito" sem lente de concluídos | 🟡 | E97 | |
| F25 — a devolução não pergunta pelas avarias | 🟡 | E97 | o E71 depende de alguém lembrar |
| F26 — cobrança rápida não deixa rastro | 🟠 | E97 | |
| F27 — da cobrança não se chega à noiva | 🟠 | E98 | com E3+E9 |
| F28 — a tela que cobra não recebe | 🟡 | E98 | |
| F29 — "Atrasadas" mente dentro da janela | 🟠 | E98 | número errado com cara de certo |
| F30 — não existe "fechar o caixa do dia" | 🟠 | E103 | o alerta se desliga em silêncio |
| F31 — Folha/Recorrências não está em menu nenhum | 🟠 | E92 (link) + E103 (aviso e nome) | |
| F32 — a conciliação não guarda nada | 🟡 | E103 | 1ª etapa só |
| F33 — cancelar reescreve mês já enviado | 🟠 | E94 | face de tela do B3 |
| F34 — export contábil em duas telas | 🟡 | E103 | |
| F35 — o portal manda falar e não tem link | 🟠 | E100 | |
| F36 — o extrato não diz quanto falta | 🟠 | E100 | uma soma e um `find` |
| F37 — a noiva não pode dizer "não vou poder ir" | 🟠 | E100 | ideia NOVA, estende E85 |
| F38 — o portal expira e ninguém sabe | 🟡 | E100 | |
| F39 — contrato e datas fora do portal | 🔵 | E100 | último item, cortável |
| F40 — "Configurações" não linka para quem configura | 🟠 | E98 | |
| F41 — loja nova não tem roteiro | 🟠 | E103 | ideia NOVA |
| F42 — duas formas de trazer alguém para a equipe | 🟡 | E101 | o pior caminho é o padrão |
| F43 — "o que essa pessoa pode fazer?" cruza duas telas | 🟡 | E98 | `resumoAcessos()` já existe |
| F44 — "Trocar de Loja" para quem tem uma loja | 🔵 | E92 | uma condição |

**Conferência:** 13 (A) + 15 (B) + 11 (C) + 15 (D) + 23 (E) + 44 (F) = **121**.
Endereçados em épico: 119. Distribuído (não é épico próprio): B14.
Explicitamente fora: A10.

## Conscientemente fora desta rodada

- **A10 — quebrar as páginas de mil linhas como épico próprio.** É o achado
  mais tentador e o de pior retorno isolado: uma refatoração de 8 arquivos sem
  nenhum cliente esperando por ela, com risco de regressão em telas que hoje
  funcionam. As costuras que o A10 mapeou são boas e serão cortadas **de
  dentro** dos épicos que já vão mexer nesses arquivos: o diálogo "Gerar
  contrato" sai de `orcamentos/[id].tsx` no E95, o card de escada sai de
  `comissoes/index.tsx` no E99, o cabeçalho de detalhe vira componente no E98.
  Quebrar por quebrar, não. A divisão de `routes/comissao.ts` e
  `routes/financeiro.ts` fica fora inclusive dessa regra: a própria trilha A
  registra que os dois são grandes mas coesos e bem seccionados.
- **A13, segunda metade — `noUncheckedIndexedAccess`.** `strictFunctionTypes`
  entra no E104 porque é quase indolor. A outra flag gera centenas de erros de
  uma vez em código que está correto por construção; é projeto próprio, não
  mudança de passagem. A própria trilha A diz que não viu bug causado por isso.
- **A reescrita do design system (a ambição por trás do E19).** O E99 faz
  **duas** coisas: podar o que não se usa e adotar dirigidamente onde a
  divergência já custou (`<Table>` nas 5 telas que escrevem `<table>`,
  `<Empty>` nos 30 vazios, `<Breadcrumb>` no cabeçalho de detalhe). Reescrever a
  camada inteira, migrar as 50 telas ou introduzir um Storybook fica fora — não
  há evidência nesta rodada de que o custo se pague.
- **A segunda etapa do F32 (conciliação com memória de divergências
  perdoadas).** O E103 entrega só o `conciliadoEm` em lote, que já faz a segunda
  passada custar quase nada. Registrar divergência perdoada com motivo é um
  modelo de dado novo para um problema que ainda não foi medido em uso real.
- **F39 (o vestido, os ajustes e a retirada no portal).** É 🔵 e é o último
  item do E100 justamente para ser cortado se o épico apertar. O portal ganha
  primeiro o que responde pergunta de dinheiro e de agenda (F35, F36, F37).
- **Reintroduzir os primitivos shadcn podados (A5).** Não é dívida: `shadcn add`
  é um comando, e reintroduzir no dia em que uma tela precisar é mais barato do
  que manter 3.701 linhas e ~25 dependências `@radix-ui/*` que nunca rodaram
  neste app.
- **Tudo que muda a categoria do produto.** A regra da casa continua: nenhuma
  API externa. WhatsApp Business API, PIX automático e NF-e resolveriam F26,
  F35 e F34 de forma muito melhor do que qualquer épico daqui — e continuam
  sendo decisão de negócio, não de code review.
