# Roteiro de jornada — Orçamentos · Contratos

## Propósito (1-2 linhas)
Registrar e fechar a venda de cada noiva: o **orçamento** é a negociação viva (vestidos/serviços escolhidos, valor combinado, desconto e ciclo de aprovação); o **contrato** é essa venda persistida, com plano de parcelas, PDF e distrato. O orçamento APROVADO é a base de valores do contrato (trilho `Orçamento → Contrato → Parcelas → Comissão`).

## Personas e permissões (gates: leads:ver/criar/editar)
A jornada comercial vive sob o módulo **`leads`** (não há módulo "orçamentos"/"contratos" próprio):
- **Vendedora / atendente** — abre e negocia o orçamento, fecha o contrato. Precisa de `leads:editar` para mutar orçamento (itens/desconto/status) e editar/cancelar contrato; `leads:criar` para **gerar** o contrato.
- **Gestor / dono** — cancela/distrata, decide destino do que já foi pago.
- **Leitor** (`leads:ver`) — vê listas e detalhes, baixa PDF, mas não muta.

Mapa real dos gates:
- Ver lista/detalhe de orçamento e contrato, e baixar PDF: `leads:ver` (`exigirAcesso("leads")` em `orcamentos/page.tsx:37` e `contratos/page.tsx:29`; `podeNoModulo(...,"leads","ver")` nos detalhes e em `pdf/route.ts:25`).
- Mutar orçamento (criar, item, desconto, status): `acaoAutorizada("leads","editar")` (`orcamentos/actions.ts:30,54,67,78,85,96`).
- **Gerar** contrato: `acaoAutorizada("leads","criar")` (`contratos/actions.ts:21,29`).
- Editar/cancelar contrato: `acaoAutorizada("leads","editar")` (`contratos/actions.ts:37,53`).
- **Atrito de modelo de permissão:** as ações de **parcela** (gerar plano, receber, estornar, remover) são autorizadas por **outro** módulo — `acaoAutorizada("financeiro","editar")` (`financeiro/receber/actions.ts:18,31,43,50,61`) — mesmo quando disparadas de dentro do contrato. Logo `leads:editar` sozinho monta o contrato mas **não** mexe no plano; quem só tem `leads` vê os botões "Receber/Remover/Estornar" (a página gateia por `podeEditar`/`podeMexer` de `leads`, `contratos/[contratoId]/page.tsx:244,265`) e leva erro de permissão ao submeter. Dois gates desalinhados na mesma tela.

## Rotas/telas envolvidas (rota → arquivo)
- `/loja/[lojaId]/orcamentos` → `app/src/app/(app)/loja/[lojaId]/orcamentos/page.tsx` (lista por status; **sem "novo"** — nasce do atendimento/perfil).
- `/loja/[lojaId]/orcamentos/[orcamentoId]` → `app/src/app/(app)/loja/[lojaId]/orcamentos/[orcamentoId]/page.tsx` (detalhe/negociação: itens, indicados, status, gerar contrato).
- Server Actions de orçamento → `app/src/app/(app)/loja/[lojaId]/orcamentos/actions.ts`.
- `/loja/[lojaId]/contratos` → `app/src/app/(app)/loja/[lojaId]/contratos/page.tsx` (lista Todos/Ativos/Cancelados).
- `/loja/[lojaId]/contratos/[contratoId]` → `app/src/app/(app)/loja/[lojaId]/contratos/[contratoId]/page.tsx` (detalhe editável + plano de pagamento + distrato).
- `/loja/[lojaId]/contratos/[contratoId]/pdf` → `app/src/app/(app)/loja/[lojaId]/contratos/[contratoId]/pdf/route.ts` (GET, baixa `contrato-<slug>.pdf`).
- `/loja/[lojaId]/contratos/novo` → `app/src/app/(app)/loja/[lojaId]/contratos/novo/page.tsx` (**aposentada** — só `redirect` para a lista).
- Server Actions de contrato → `app/src/app/(app)/loja/[lojaId]/contratos/actions.ts`; de parcela → `app/src/app/(app)/loja/[lojaId]/financeiro/receber/actions.ts`.
- Libs: `app/src/lib/orcamentos/orcamentos.ts`, `app/src/lib/contratos/contratos.ts`, `app/src/lib/contratos/pdf.ts`, `app/src/lib/financeiro/receber.ts`, `app/src/lib/financeiro/plano.ts`, `app/src/lib/financeiro/forma.ts`.

## Jornada(s) principal(is)

### Jornada A — Negociar e aprovar um orçamento · Vendedora · transformar interesses em valor combinado
1. **[atendimento ou /noivas/[leadId]]** A vendedora dispara "abrir orçamento" → `criarOrcamentoAction` (`orcamentos/actions.ts:30`). Se vem com `atendimentoId`, **herda** `leadId` + `vendedoraId` do atendimento (a vendedora que negociou, `actions.ts:36-44`); do perfil da noiva, usa o `leadId` do form e o **usuário atual** como vendedora (`actions.ts:33-34`). `criarOrcamento` valida lead/atendimento/vínculo da vendedora (`orcamentos.ts:42-68`) e redireciona para o detalhe. Status inicial: **RASCUNHO**.
2. **[/orcamentos/[id]]** O detalhe abre com cabeçalho "Atendimento de {noiva}" + vendedora (`[orcamentoId]/page.tsx:104-111`). A seção "Vestidos escolhidos" começa vazia.
3. **[/orcamentos/[id]]** Em "Vestidos indicados" (curadoria top-6 por afinidade via `indicarVestidos`, `[orcamentoId]/page.tsx:81,194`), a vendedora escolhe uma peça e digita o **valor orçado** (default = `precoBase`) → `adicionarItemAction` → `adicionarItem` cria um `OrcamentoItem` tipo VESTIDO (`orcamentos.ts:76-115`). Itens já adicionados mostram "✓ Já escolhido" (`page.tsx:207`).
   - **ATRITO:** só dá para adicionar VESTIDO pela UI. Os tipos **SERVICO** e **AJUSTE** existem na lib (`TIPOS_ITEM`, `orcamentos.ts:12`) e na action (`tipo` vem do form, `actions.ts:59`), mas **nenhum formulário** os oferece — a vendedora não consegue lançar um serviço/ajuste sem manipular o form à mão.
4. **[/orcamentos/[id]]** Ajustar valor de um item: expande o `<details>` da linha e salva → `editarItemAction` → `editarItem` (só patch de descrição/valor/quantidade, `orcamentos.ts:130-160`). Remover: `removerItemAction` com `BotaoConfirmar` (`page.tsx:160-164`). Ambos só funcionam em **RASCUNHO/ENVIADO** (`EDITAVEIS`, `orcamentos.ts:11`); fora disso retornam `nao_editavel`.
   - **ATRITO:** não há campo de **quantidade** na UI — sempre 1 (`adicionarItemAction` lê `quantidade` do form, mas a tela não tem input; `actions.ts:62`).
5. **[/orcamentos/[id]]** **Desconto PERCENTUAL/VALOR:** a lib `definirDesconto` está pronta (0–100% para percentual, clamp `0 ≤ desconto ≤ subtotal` em `calcularTotais`, `orcamentos.ts:23-28,173-201`) e a `definirDescontoAction` existe (`actions.ts:85`), **mas o detalhe não renderiza nenhum formulário de desconto** — funcionalidade pronta e invisível.
   - **ATRITO:** desconto é uma regra de negócio central da negociação e está **inacessível pela tela**. O total mostrado (`calcularTotais`) nunca reflete um desconto que a vendedora consiga aplicar.
6. **[/orcamentos/[id]]** Avançar status na barra de ações (`page.tsx:231-278`): RASCUNHO → "Marcar como enviado" (ENVIADO); ENVIADO → "Voltar para rascunho"; ambos → "Aprovar"/"Recusado". `mudarStatus` valida contra `TRANSICOES` (`orcamentos.ts:206-211`) e exige **≥1 item** para APROVAR (`orcamentos.ts:225`, erro `orcamento_vazio`). Aprovar grava `aprovadoEm` (`orcamentos.ts:229`).

### Jornada B — Gerar o contrato de um orçamento aprovado · Vendedora · firmar a venda
1. **[/orcamentos/[id]]** Com status **APROVADO**, a barra mostra "Aprovado — pronto para virar contrato" e o botão **"Gerar contrato"** (`page.tsx:233-244`) → `gerarContratoDeOrcamentoAction` (`contratos/actions.ts:21`, gate `leads:criar`).
2. **[lib]** `criarContratoDeOrcamento` (`contratos.ts:43-81`): exige `status === "APROVADO"` (senão `nao_aprovado`); calcula `valorTotal` = total do orçamento; tenta casar a **reserva** pelo `vestidoId` do item VESTIDO (ou, sem item identificável, só anexa se houver **uma** reserva, `contratos.ts:57-61`); puxa `dataCasamento` do lead/reserva; herda `vendedoraId`/`observacoes`. `orcamentoId @unique` no schema barra duplicar — P2002 vira `ja_tem_contrato` (`contratos.ts:30-32,78`). Redireciona ao detalhe do contrato (status inicial **ATIVO**).
3. **[/orcamentos/[id]]** Se o orçamento já tem contrato, o botão vira **"Ver contrato"** (link 1:1, `page.tsx:236-237`), via `orc.contratoId` (`orcamentos.ts:421`).
   - **ATRITO (dívida principal):** gerar contrato **não** monta o plano de parcelas nem a comissão — é só o cabeçalho da venda. A vendedora precisa de uma 2ª e 3ª etapa manual (gerar plano, depois receber). Ver "Pontos de fricção".

### Jornada C — Conferir/editar o contrato e montar o plano de pagamento · Vendedora · preparar recebimentos
1. **[/contratos/[id]]** Detalhe abre com dados pré-preenchidos. Em **ATIVO** (`editavel`, `contratos.ts:296`), formulário edita CPF, vestido, valorTotal, forma de pagamento (`select` de `FORMAS`), datas (casamento/retirada/devolução) e observações → `editarContratoAction` → `editarContrato` (`contratos.ts:125-164`). Datas passam pelo parser estrito `diaParaData`/`parseDiaUTC` (`contratos.ts:20-28`).
2. **[/contratos/[id]]** "Plano de pagamento": sem parcelas, mostra o form **Gerar plano** (entrada, nº parcelas, 1º vencimento, periodicidade em dias) → `gerarPlanoAction` → `gerarPlanoDePagamento` (`receber.ts:24-86`). Entrada vira parcela **nº0 "Entrada"**; o restante divide em N parcelas iguais com a **última absorvendo o resto** (sem drift, `receber.ts:61-71`); `createMany` atômico. Validações: `nao_ativo`, `ja_tem_plano`, `num_invalido` (1–360), `entrada_maior` (entrada > total).
3. **[/contratos/[id]]** Por parcela PREVISTA: **Receber** (valor + forma) → `registrarRecebimentoAction`; **Remover** → `removerParcelaAction`. Parcela PAGA: **Estornar** → `estornarRecebimentoAction` (`page.tsx:244-271`). O rodapé soma "Total do plano" e alerta **"difere do total do contrato"** quando `planoDivergeDoTotal` (`plano.ts:13-16`, `page.tsx:99,277`).
   - **ATRITO:** o aviso de divergência é só visual — nada impede salvar um contrato com plano que não bate com o `valorTotal`; reconciliar é manual.
4. **[/contratos/[id]/pdf]** "Baixar contrato em PDF" (link `prefetch={false}`, `page.tsx:126`) → GET `pdf/route.ts` → `dadosParaPdf` (monta dados, entrada+parcelas vêm do plano como fonte única, ignora CANCELADAS, `contratos.ts:304-334`) → `gerarContratoPdf` (`pdf.ts:103`) devolve `application/pdf` como anexo `contrato-<slug>.pdf`.

### Jornada D — Cancelar / distrato · Gestor · encerrar uma venda desfeita
1. **[/contratos/[id]]** `<details>` "Cancelar contrato" (só ATIVO + `leads:editar`, `page.tsx:287-303`). Escolhe destino do já pago: **"perdeu o sinal — mantém no caixa"** vs **"devolvi — estorna do caixa"** + motivo opcional → `cancelarContratoAction` → `cancelarContrato` (`contratos.ts:177-204`).
2. **[lib]** Numa transação: contrato → CANCELADO; toda parcela PREVISTA → CANCELADA (some de recebíveis/cobrança/projeção); se "estornar", parcela PAGA também → CANCELADA com `valorRecebido/recebidoEm/formaRecebimento` zerados (`contratos.ts:187-202`). O `where` carrega `lojaId` explícito porque o `tx` do `$transaction` não passa pelo guard do tenant (`contratos.ts:189-200`).
3. **[/contratos/[id]]** Pós-cancelamento o contrato fica **read-only** (`<dl>`, `page.tsx:176-185`); não há "reativar".
   - **ATRITO:** cancelamento é **terminal** — um distrato por engano não tem desfazer; só restaria gerar tudo de novo.

## Ramificações e estados de borda
- **APROVADO/RECUSADO são terminais** no orçamento: `TRANSICOES["APROVADO"] = []` e `["RECUSADO"] = []` (`orcamentos.ts:209-210`). Não há volta nem reabertura; um orçamento recusado por engano é perdido.
- **ENVIADO → RASCUNHO** é permitido (única transição "para trás", `orcamentos.ts:208`); APROVAR/RECUSAR sai tanto de RASCUNHO quanto de ENVIADO.
- **Aprovar exige ≥1 item** (`orcamentos_vazio`, `orcamentos.ts:225`).
- **`orcamentoId @unique` → contrato 1:1**: P2002 captura a tentativa de duplicar e retorna `ja_tem_contrato` (`contratos.ts:30-32,78`); a UI então oferece "Ver contrato".
- **Parser de datas estrito**: `diaParaData`/`parseDiaUTC` rejeita datas impossíveis tipo `2027-02-30` que o antigo `isNaN` deixava "rolar" para o mês seguinte (`contratos.ts:17-28`); vale para contrato e para vencimentos do plano (`receber.ts:43`). String vazia → `null`.
- **Reserva ambígua**: sem item-vestido identificável, contrato só anexa reserva se houver **exatamente uma** (`contratos.ts:57-61`; idem no fallback da noiva, `contratos.ts:95`) — múltiplas reservas ficam sem vínculo.
- **Contrato em branco (fallback)**: `criarContratoDaNoiva` cria com `valorTotal = "0.00"` (`contratos.ts:84-108`), disparado por `gerarContratoDaNoivaAction` a partir do perfil da noiva. O cabeçalho aceita total 0 e o plano partiria de 0.
- **`/contratos/novo` aposentada**: só `redirect` para a lista (`novo/page.tsx`).
- **Parcelas CANCELADAS** somem de recebíveis/projeção e do PDF (`dadosParaPdf` filtra, `contratos.ts:311-312`); **ATRASADA é derivada** (vencida + PREVISTA), nunca gravada (`receber.ts:2-3`).
- **PDF e WinAnsi**: `pdfStr` troca qualquer caractere > 255 por `"?"` (`pdf.ts:27-40`) — acentos no WinAnsi passam, mas símbolos fora do Latin-1 (emoji, traços longos) viram `?` no documento.

## Pontos de fricção observados no código real
1. **Dívida "portar fechar-contrato da versão Vite".** O commit `3dc75e6` ("Add orçamentos (cart) feature with contract closing", 2026-06-27) entregou o **fechar-contrato atômico** — gera contrato + parcelas + comissão da vendedora **numa transação, em um clique** — **apenas nos artefatos Vite** (`artifacts/api-server/src/routes/orcamentos.ts`, `artifacts/moscow-noivas/src/pages/loja/OrcamentoPage.tsx`); **nada disso entrou no app Next.js**. No Next, o fluxo continua fatiado: APROVAR → "Gerar contrato" (`gerarContratoDeOrcamentoAction`) → ir ao contrato → "Gerar plano" (`gerarPlanoDePagamento`) → receber parcela a parcela; a **comissão** não é criada no ato. É exatamente a pendência registrada em `estado-por-modulo.md:298,419` ("portar de volta o `fechar-contrato` da versão Vite — gera contrato+parcelas+comissão+avança jornada num clique").
2. **Desconto pronto e invisível.** `definirDesconto` + `definirDescontoAction` + clamp em `calcularTotais` existem e são testados, mas **nenhum formulário de desconto é renderizado** no detalhe do orçamento — a alavanca comercial mais óbvia não tem UI (`estado-por-modulo.md:298`).
3. **Itens só de VESTIDO, sem quantidade.** A lib aceita SERVICO/AJUSTE e `quantidade`, mas a tela só permite adicionar vestidos com quantidade fixa 1 — ajustes e serviços (parte real do ticket de uma noiva) não cabem no orçamento pela interface.
4. **Gates cruzados leads × financeiro na mesma tela.** O contrato é montado com `leads:editar`, mas as parcelas exigem `financeiro:editar`; a página decide a visibilidade por `leads`, então um usuário com `leads` mas sem `financeiro` vê botões de parcela que falham ao submeter.
5. **Divergência plano × total é só um aviso**; **cancelamento é terminal** (sem reativar); **recusar/aprovar orçamento sem desfazer.**

## Sementes de melhoria (ideias para brainstorming — NÃO implementar)
- **Portar o fechar-contrato atômico para o Next** ("Fechar venda" num clique a partir do orçamento APROVADO: contrato + plano + comissão + avanço da jornada em uma transação), como já existe nos artefatos Vite — eliminaria 3 telas de fricção.
- **Expor o desconto na UI** (toggle PERCENTUAL/VALOR + preview do total recalculado em tempo real), reaproveitando a lib já pronta e testada.
- **Adicionar itens de SERVICO/AJUSTE e quantidade** no orçamento, com um seletor de tipo e curadoria separada (ex.: catálogo de ajustes/serviços do ateliê).
- **Reconciliar plano × total** com um CTA "ajustar última parcela para bater o total" quando `planoDivergeDoTotal`, em vez de só sinalizar em bordô.
- **Reverter estados terminais com cuidado**: "reabrir orçamento recusado" e "reativar contrato cancelado" (com trilha de auditoria), para erros operacionais comuns no balcão.
- **Atalho orçamento→PDF de proposta**: hoje só o contrato vira PDF; uma "proposta" em PDF do orçamento ENVIADO ajudaria a noiva a decidir (mesma `pdf.ts`, layout de proposta).
