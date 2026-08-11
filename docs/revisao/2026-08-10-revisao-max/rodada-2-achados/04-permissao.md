# Ângulo 4 — permissao
**Rodada 2, base 89b38c8** · localizador + cético por achado

Nove sobreviventes, todos 🟡, e os nove são a mesma família: a S-M9 falava em
"mais 7 sítios" além do `pagar.tsx:621`; esta varredura achou **9**, cada um com
as duas pontas ancoradas — o gate da tela e a ação que o servidor deriva. A
forma do conserto continua sendo a da S36: **uma varredura cruzando
requireModulo/ação derivada × podeNoModulo, que fica de guarda** — os nove são
sítios dela, não nove consertos à mão. Todos marcam `enumeraSobra: S-M9`.

## Sobreviventes

### 1. 🟡 Conciliação: tela libera "Marcar como conferidas" por criar, servidor exige editar — e o comentário afirma o guard errado
`artifacts/moscow-noivas/src/pages/financeiro/conciliacao.tsx:58` · enumera S-M9

**Evidência.** `conciliacao.tsx:54-58` diz "o que ESCREVE é só o 'Marcar como
conferidas' (POST /financeiro/conciliacao/marcar, guardado por financeiro/criar
via o prefixo de financeiro.ts:111)" → `const podeMarcar =
podeNoModulo(acessosModulos, "financeiro", "criar")`. Mas `permissoes.ts:103`
tem `marcar` em `POST_QUE_MUTA` (entrou no E115), e a rota (`financeiro.ts:570`)
não declara ação — o prefixo deriva por `acaoDoRequest`, que devolve **editar**.

**Mecanismo.** O guard de prefixo `financeiro.ts:111` deriva a ação de
`acaoDoRequest(POST, .../conciliacao/marcar)`; o caminho termina em `marcar`,
que está em `POST_QUE_MUTA` → o servidor exige `financeiro.editar`. A tela
gateia o botão (linhas 326-335) por `financeiro.criar`. O comentário do S42 na
tela descreve o estado ANTERIOR ao E115 e afirma como fato o guard que já não é
o guard.

**Consequência.** A estagiária com financeiro {ver, criar} sobe o extrato, casa
as linhas, clica "Marcar como conferidas" e leva 403 `ACESSO_NEGADO_MODULO`
culpando editar; a gerente com {ver, editar} — que PODE marcar — não vê o botão
e conclui que a conciliação é só leitura. O trabalho de conferência do mês é
refeito ou fica sem carimbo.

**Cético.** Confirmado âncora por âncora: `conciliacao.tsx:58` gateia o botão
por financeiro.criar e o comentário S42 (linhas 54-57) afirma esse guard como
fato; mas o servidor (`financeiro.ts:111` → requireModulo sem ação →
`auth.ts:143` acaoDoRequest → `permissoes.ts:103`, `marcar` em POST_QUE_MUTA
desde o E115) exige financeiro.editar, e a rota (`financeiro.ts:570`) não
declara ação. Nenhuma outra camada corrige: o teste
`e115-permissao-rastro-api.test.ts:88-118` prega o contrário da tela ({ver,
criar} → 403 acao editar; {ver, editar} → 200), e o E2E 47 roda com permissão
total. Não é duplicata dos fechos de hoje (E115 só mudou o servidor); é sítio
legítimo da S-M9 (criar×editar). Severidade confirmada: 🟡.

### 2. 🟡 Estoque: formulário de cadastrar peça gateado por vestidos.editar, POST /itens-estoque deriva criar
`artifacts/moscow-noivas/src/pages/vestidos/estoque.tsx:78` · enumera S-M9

**Evidência.** `estoque.tsx:78` `const podeGerir =
podeNoModulo(acessosModulos, "vestidos", "editar")`; linha 181 `{podeGerir && (`
envolve o form de `onCriar` → `criar.mutateAsync` (useCreateItemEstoque).
Servidor: `vestidos.ts:745` `router.post("/lojas/:lojaId/itens-estoque",
async` — sem requireModulo explícito; o prefixo `vestidos.ts:72` deriva
**criar** do POST.

**Mecanismo.** criar e editar são independentes em `normalizarAcessos` (só ver
é implicado). A tela usa uma régua única (editar) para três operações de ações
distintas: cadastrar (POST→criar), salvar quantidade (PATCH→editar) e remover
(DELETE→editar). O cadastro é o descasado.

**Consequência.** A gerente com vestidos {ver, editar, criar: false} vê o
formulário "Peça / Quantidade / Preço", preenche "Saiote 2 aros" e leva 403
acao criar; quem tem {ver, criar} não vê formulário nenhum e a tela ainda manda
"Peça à administração para cadastrar o estoque" — para alguém que pode
cadastrar.

**Cético.** Confirmado em todas as camadas lidas neste run: `estoque.tsx:78`
gateia por "editar" e a linha 181 envolve o form de POST (useCreateItemEstoque);
o servidor não tem requireModulo explícito no POST de `vestidos.ts:745` — só o
prefixo da linha 72 sem acao, e acaoDoRequest
(`api-server/src/lib/permissoes.ts:133-141`) deriva "criar" de POST em caminho
que termina em substantivo. criar e editar são independentes em
normalizarAcessos (linha 56: só ver é implicado), igual no espelho do cliente
(`moscow-noivas/src/lib/permissoes.ts:31-40`). Não é duplicata (S-M11 no mesmo
arquivo fechou outro defeito) e é sítio legítimo da S-M9. Gatilho raro (perfil
com editar sem criar em vestidos) e custo baixo (403/form escondido): 🟡
confirmado.

### 3. 🟡 Registrar avaria gateado por vestidos.editar, POST /bloqueios/:id/avarias deriva criar
`artifacts/moscow-noivas/src/pages/reservas/[bloqueioId].tsx:786` · enumera S-M9

**Evidência.** `[bloqueioId].tsx:231` `const podeMovimentar =
podeNoModulo(acessosModulos, "vestidos", "editar")`; linha 786
`{podeMovimentar && (` abre o bloco `id="registrar-avaria"` com o botão
"Registrar avaria" (linhas 813-816, createAvaria). Servidor: `reservas.ts:658`
`router.post("/lojas/:lojaId/bloqueios/:bloqueioId/avarias", async` — sem ação
explícita; prefixo `reservas.ts:46` requireModulo("vestidos") deriva **criar**
("avarias" é substantivo, fora de POST_QUE_MUTA).

**Mecanismo.** O mesmo `podeMovimentar` (editar) gateia a movimentação do
vestido (PATCH bloqueio → editar, correto) E o registro de avaria (POST →
criar, descasado). O bloco herda a régua do vizinho.

**Consequência.** Quem tem vestidos {ver, editar} devolve o vestido, vê barra
rasgada, descreve a avaria, anexa a foto e leva 403 acao criar — a avaria com
custo de reparo (ex.: R$ 350,00 que a rota /cobrar transformaria em conta) fica
sem registro; quem tem só criar não vê o formulário.

**Cético.** Conferido ponta a ponta: `[bloqueioId].tsx:231` gateia o bloco
registrar-avaria (linha 786) com vestidos.editar; o botão chama useCreateAvaria,
que faz POST /api/lojas/:lojaId/bloqueios/:bloqueioId/avarias (api.ts gerado,
linha 8614); no servidor, `reservas.ts:46` monta requireModulo("vestidos") sem
ação, `auth.ts:143` deriva por acaoDoRequest, e "avarias" é substantivo fora de
POST_QUE_MUTA e de POST_QUE_MUTA_POR_CAMINHO (`permissoes.ts:102-115`) — deriva
criar. Nenhuma guarda noutra camada: o único teste de permissão de avarias
(`revisao-permissao-folha-api.test.ts:91`) prega `avarias/:id/cobrar` (verbo →
editar), não o POST cru. Não é duplicata de nenhum fecho de hoje; é sítio
legítimo da varredura criar×editar aberta. Perfil {ver, editar} vê o formulário
e leva 403 acao criar; perfil só-criar não vê o formulário. 🟡 confirmado.

### 4. 🟡 Adicionar ajuste de costura gateado por agenda.VER — o servidor exige criar (e o checklist, editar)
`artifacts/moscow-noivas/src/pages/reservas/[bloqueioId].tsx:232` · enumera S-M9

**Evidência.** `[bloqueioId].tsx:232` `const podeAjustes =
podeNoModulo(acessosModulos, "agenda", "ver")`; linha 987 `{podeAjustes && (`
envolve o form "Adicionar" (createAjuste, linha 1038); linha 921 o toggle de
item de checklist é `disabled={!podeAjustes || updateItem.isPending}`.
Servidor: `agenda.ts:789` POST /ajustes sem ação explícita → prefixo
`agenda.ts:188` deriva **criar**; `agenda.ts:930` PATCH
/ajustes/checklist/:itemId → **editar**.

**Mecanismo.** É o descasamento mais largo dos nove: a tela libera escrita por
VER. Todo perfil que enxerga a agenda (o piso de quase toda função) vê
formulário de novo trabalho de costureira e checkboxes de peça — e toda
interação escreve com ação que ele pode não ter.

**Consequência.** A recepcionista com agenda só-ver abre a prova da noiva,
digita "bainha 3cm", clica Adicionar → 403 acao criar; marca uma peça do
checklist como feita → 403 acao editar. Cada gesto oferecido é um gesto negado,
e a fila da costureira parece "quebrada" para o perfil mais comum da loja.

**Cético.** Todas as âncoras conferem lidas neste run: `[bloqueioId].tsx:232`
gateia por agenda.VER os seis pontos de escrita (888, 921, 935, 953, 987/1038);
podeNoModulo do cliente (`permissoes.ts:39`) faz VER ser o piso de qualquer
perfil que enxerga a agenda; no servidor, `agenda.ts:188` monta
requireModulo("agenda") sem ação e acaoDoRequest
(`api-server/src/lib/permissoes.ts:132-140`) deriva POST /ajustes → criar
(caminho termina em substantivo, fora das listas POST_QUE_MUTA) e PATCH/DELETE →
editar — logo o perfil só-ver recebe 403 em cada gesto que a tela oferece. Não
há guarda noutra camada que salve o caso, não é duplicata de nada fechado hoje,
e é enumeração válida de sítio da S-M9 (forma da S36, com descasamento ainda
mais largo: VER liberando escrita). 🟡 confirmado.

### 5. 🟡 Folha: "Definir salário" e "Adicionar despesa" gateados por financeiro.editar, POST /recorrencias deriva criar
`artifacts/moscow-noivas/src/pages/financeiro/folha.tsx:148` · enumera S-M9

**Evidência.** `folha.tsx:148` `const podeEditar =
podeNoModulo(acessosModulos, "financeiro", "editar")`; blocos `{podeEditar && (`
nas linhas 626 e 721 contêm "Definir salário" (663) e "Adicionar despesa" (773),
ambos criarRecorrencia. Servidor: `financeiro.ts:762`
`router.post("/lojas/:lojaId/financeiro/recorrencias", async` — sem ação
explícita; prefixo `financeiro.ts:111` deriva **criar**.

**Mecanismo.** A tela usa editar como régua única da página; Editar/Desativar
(PATCH → editar) casam, mas as duas criações (POST → criar) não. Mesma forma da
S-M9 original que mora nesta mesma pasta (`pagar.tsx:621`).

**Consequência.** A gerente com financeiro {ver, editar} cadastra o salário de
R$ 2.400,00 da colaboradora nova e leva 403 acao criar — a competência seguinte
nasce sem a conta da folha; a estagiária com {ver, criar}, que o servidor
aceitaria, não vê os formulários.

**Cético.** Confirmado em todas as âncoras lidas neste run: `folha.tsx:148`
gateia a página inteira por "editar" e os blocos 626/721 escondem os dois
formulários de criação ("Definir salário" e "Adicionar despesa", ambos
criarRecorrencia → POST); o servidor não tem guarda que salve —
`financeiro.ts:762` é POST sem ação explícita sob o prefixo
requireModulo("financeiro") da linha 111, e acaoDoRequest
(`permissoes.ts:132-140`) deriva "criar" porque "recorrencias" não casa com
POST_QUE_MUTA nem POST_QUE_MUTA_POR_CAMINHO. O comentário da própria tela
(`folha.tsx:146-147`, "o servidor recusa de qualquer jeito") assume um
alinhamento que não existe. Não é duplicata de nenhum dos 15 fechos de hoje; o
teste `revisao-permissao-folha-api.test.ts` não prega a ação do POST
/recorrencias. Enumera um sítio novo da S-M9 (a linha do rastreador,
`EXECUCAO.md:113`, cita só `pagar.tsx:621` e diz "mais 7 sítios" sem listá-los),
na direção inversa da original. 🟡 confirmado.

### 6. 🟡 Comissões: "Salvar regra" e remover versão NÃO têm gate nenhum — quem só vê comissão recebe a UI inteira de edição
`artifacts/moscow-noivas/src/pages/comissoes/index.tsx:1079` · enumera S-M9

**Evidência.** O único gate da página é `comissoes/index.tsx:167`
`podeMexerNaComissao = podeNoModulo(..., "comissao", "editar")`, usado só nas
linhas 663 e 799 (baixa de estorno e Reabrir). A seção "— Nova regra —"
(979-1085) com "Salvar regra" (1079, criarRegra) e o lixo de remover versão
(955, removerRegra) rendem sem condição. Servidor: `comissao.ts:341` POST
/comissao/regras → prefixo `comissao.ts:60` deriva **criar**; `comissao.ts:484`
DELETE regra → **editar**.

**Mecanismo.** A página é alcançável por comissao.ver. O form de escada
(vendedora, faixas, %, bônus) e o botão de apagar versão aparecem para qualquer
ver-only; cada submit morre no guard derivado do servidor (criar para salvar,
editar para remover). É o sítio da família onde a tela não declara régua
NENHUMA.

**Consequência.** A vendedora com comissao só-ver monta a escada inteira (faixa
até R$ 20.000,00 a 5%), clica "Salvar regra" → 403 acao criar; o mesmo Trash2 de
versão vigente responde 403 editar. E quem tem {ver, criar} salva regra mas não
vê "Reabrir" — que exige editar e ele de fato não pode, por sorte, não por
desenho.

**Cético.** Confirmado com âncoras lidas neste run: o único gate da página é
`index.tsx:167` (podeMexerNaComissao, ação "editar"), usado só nas linhas 663 e
799; a seção "Nova regra" (979-1085) com "Salvar regra" (1079) e o Trash2 de
remover versão (951-961 → AlertDialogAction 1220) rendem sem condição nenhuma.
A rota (`App.tsx:335`) não tem gate de módulo, então comissao só-ver alcança a
página; o servidor (`routes/comissao.ts:60` + `middlewares/auth.ts:125-150`)
deriva POST→criar e DELETE→editar e devolve 403. Não há guarda em Zod, rota ou
teste. Não é duplicata dos 15 fechos de hoje; é sítio legítimo da S-M9. **Única
correção do cético à consequência:** no 403 o form NÃO se perde — o catch
(365-373) só mostra toast e o estado limpa apenas no sucesso (361-363); o
defeito é a tela não declarar régua, não perda de trabalho digitado. 🟡
confirmado.

### 7. 🟡 Config de atendimentos: "Adicionar" cabine gateado por agenda.editar, POST /cabines deriva criar
`artifacts/moscow-noivas/src/pages/atendimentos/config.tsx:495` · enumera S-M9

**Evidência.** `config.tsx:82` `const podeEditar =
podeNoModulo(acessosModulos, "agenda", "editar")`; linha 495 `{podeEditar && (`
envolve o form `adicionarCabine` (createCabine, botão nas linhas 513-515).
Servidor: `agenda.ts:200` `router.post("/lojas/:lojaId/cabines", async` — sem
ação explícita; prefixo `agenda.ts:186` requireModulo("agenda") deriva
**criar**.

**Mecanismo.** O Switch de ativar/desativar cabine (PATCH → editar, linha 477)
casa com o gate; o formulário de cabine nova (POST → criar) não. Vale notar: é
a rota irmã do DELETE de cabine da S-M1 — a família inteira de cabines já rendeu
um 🔴 e agora rende um sítio de gate.

**Consequência.** Quem tem agenda {ver, editar} monta a loja nova, digita o
nome da terceira cabine, clica "Adicionar" → 403 acao criar; quem tem {ver,
criar} nem vê o formulário — e a config de expediente ao lado (PUT → editar)
responde só para o primeiro.

**Cético.** O achado fica de pé, com todas as âncoras conferidas neste run:
`config.tsx:82` gateia por agenda/editar e a linha 495 envolve o form que chama
createCabine (linha 296, POST cabines); no servidor, `agenda.ts:186` monta
requireModulo("agenda") sem ação e `auth.ts:143` deriva via acaoDoRequest —
`permissoes.ts:132-140` não tem exceção para "/cabines" (POST_QUE_MUTA é lista
de verbos, POST_QUE_MUTA_POR_CAMINHO é só /financeiro/pagamentos), então POST →
criar. Quem tem {ver, editar} vê o form e leva 403 acao criar (`auth.ts:146`);
quem tem {ver, criar} nem vê o form. Nenhuma guarda noutra camada: o teste
s36-gate-da-tela cruza módulo×módulo, não ação×ação. Não é duplicata — S-M1 era
o DELETE da cabine, e os "mais 7 sítios" da S-M9 nunca foram itemizados no
rastreador (`EXECUCAO.md:113`). 🟡 confere: as duas pontas do defeito são
alcançáveis, mas é tela de config raramente tocada após a montagem da loja, sem
perda de dinheiro ou dado.

### 8. 🟡 Ficha da noiva: "Agendar atendimento" aparece por agenda.editar, mas agendar é agenda.criar
`artifacts/moscow-noivas/src/pages/noivas/[leadId]/index.tsx:305` · enumera S-M9

**Evidência.** `noivas/[leadId]/index.tsx:141` `const podeAgendar =
podeNoModulo(acessosModulos, "agenda", "editar")`; linha 305 `podeAgendar &&
lead.etapa !== "PERDIDO"` mostra o botão que navega a /atendimentos/novo?noiva=.
O destino gateia certo: `novo.tsx:151` `podeCriar = podeNoModulo(..., "agenda",
"criar")`, e o servidor (`agenda.ts:324` POST /atendimentos) deriva **criar**.

**Mecanismo.** O botão do "caminho mais percorrido do app" (comentário F1/E98
na própria linha) usa editar como proxy de "pode agendar", mas agendar é
criação: novo.tsx e o servidor concordam em criar. O gate do atalho contradiz o
gate do destino.

**Consequência.** A atendente com agenda {ver, criar} — o perfil de quem
agenda — abre a ficha com a noiva do lado e o botão não existe: volta ao caminho
de sidebar+busca que o F1 mediu como o custo a eliminar. E quem tem {ver,
editar, criar: false} vê o botão, navega e é barrada na página seguinte.

**Cético.** Confirmado nas três camadas lidas neste run:
`noivas/[leadId]/index.tsx:141` gateia o botão da linha 305 por agenda.editar;
`atendimentos/novo.tsx:151` gateia por agenda.criar (e em 467-468 mostra "Você
não tem permissão para agendar"); o servidor deriva criar para POST
/atendimentos (`api-server/src/lib/permissoes.ts:132-139` — o caminho não
termina em verbo de POST_QUE_MUTA nem é /financeiro/pagamentos). E não há
hierarquia que salve: em `moscow-noivas/src/lib/permissoes.ts:37-39` criar e
editar são flags independentes (só ver é implicado). Logo o perfil {ver, criar}
— quem agenda — não vê o atalho do F1/E98, e {ver, editar, criar:false} vê,
navega e é barrado na página seguinte. Não é duplicata de nenhum fecho de hoje;
é um sítio legítimo da varredura S-M9 (a própria `novo.tsx:153-164` documenta a
forma). 🟡 correto: o servidor segura, o custo é o atalho invisível/enganoso.

### 9. 🟡 Catálogo: "Novo atributo" aparece por vestidos.editar, POST /atributos deriva criar — e a página de criação não tem gate
`artifacts/moscow-noivas/src/pages/catalogo/index.tsx:40` · enumera S-M9

**Evidência.** `catalogo/index.tsx:20` `const podeGerir =
podeNoModulo(acessosModulos, "vestidos", "editar")`; linha 40 `{podeGerir && (`
mostra "Novo atributo" → /catalogo/novo. `catalogo/novo.tsx` não contém
podeNoModulo nenhum (linhas 44-45 só criam as mutations). Servidor:
`catalogo.ts:42` `router.post("/lojas/:lojaId/atributos", async` — sem ação
explícita; prefixo `catalogo.ts:27` requireModulo("vestidos") deriva **criar**.

**Mecanismo.** Dupla face: o atalho exige editar onde o servidor pede criar, e
a página de destino aceita qualquer um que digite a URL — o form renderiza para
vestidos ver-only e cada submit (POST atributo → criar, POST opção → criar)
morre no 403 do servidor.

**Consequência.** Quem tem vestidos {ver, criar} não vê "Novo atributo" embora
possa criá-lo; quem tem {ver, editar} vê, abre, preenche "Cor" com dez opções e
leva 403 acao criar no salvar — o cadastro digitado se perde.

**Cético.** Conferido no código: `index.tsx:20/40` gateia "Novo atributo" por
vestidos.editar; `catalogo.ts:27` + acaoDoRequest (`permissoes.ts:132`, POST não
casa POST_QUE_MUTA) exige criar no POST /atributos; `novo.tsx` e `App.tsx:320`
não têm gate nenhum. Nenhuma guarda noutra camada (criar/editar independentes em
normalizarAcessos; s36-gate-da-tela-unit não cobre catálogo), não é duplicata
dos 15 fechados, e o comentário "gate flat por módulo" do index.tsx está
obsoleto desde o E101 — reforça, não refuta. Enumera legitimamente um sítio não
nomeado da S-M9. 🟡 confirmado.

## Refutados

O cético não derrubou nenhum dos nove reportados. Um candidato foi derrubado
pelo próprio localizador ANTES de virar achado:

| Título | Âncora | A refutação em uma frase |
|---|---|---|
| POST /lojas/:lojaId/leads/:leadId/portal declara editar mas pareceria exigir criar+editar pela regra do comentário de permissoes.ts:93 (caminho termina em "portal", fora de POST_QUE_MUTA) | `api-server/src/routes/portal.ts:694` | `routes/index.ts` monta o portalRouter (linha 31) ANTES do leadsRouter (linha 38), então o guard de prefixo de leads nunca roda para essa rota — a declaração explícita de editar é a única que vale, e ela está certa. |

## Cobertura

**Teto atingido: não.**

Notas do localizador:

- **Nove sítios, todos enumeração da S-M9.** O rastreador falava em "mais 7";
  a varredura achou 9 além do `pagar.tsx:621` já ancorado na sobra. A forma do
  conserto continua sendo a da S36: uma varredura cruzando requireModulo/ação
  derivada × podeNoModulo, que ficaria de guarda — os 9 são sítios dela, não 9
  consertos à mão.
- **Segunda metade do ângulo (id de corpo em escrita sem prova de loja, régua
  E91): NADA aberto.** Lidos: POST /bloqueios (vestido/lead/reserva provados,
  `reservas.ts:344-360`), POST /lookbooks (lead + todos os vestidoIds,
  `lookbooks.ts:191-199`), POST /comissao/regras (vínculo usuarios_lojas
  inline, `comissao.ts:350-357`), POST /contratos (leadId inline + orçamento e
  bloqueios cruzados, `contratos.ts:167/212/370`), POST /financeiro/pagamentos
  (contaIds contados contra WHERE lojaId, `financeiro.ts:480-484`),
  conciliacao/marcar (lojaId no WHERE), fechamentos (vendedoraIds derivados das
  vendas da loja, não do corpo), ausências e folha (usuarioNaLoja).
- **Telas conferidas e CASADAS (sem achado):** cobrança (criar↔criar), receber
  (editar↔receber), projeção (criar↔POST saldos-referencia), portal da noiva
  (editar↔editar explícito), dashboard Iniciar (editar↔PATCH),
  histórico-contato (criar↔POST cobrancas), mensagens, combobox-noiva,
  lookbook, orçamentos, noivas nova/editar/interesses, vestidos
  novo/[id]/editar, agenda, atendimentos/index, equipe, permissões, expurgo
  LGPD (editar↔editar explícito nos dois GET/POST).
