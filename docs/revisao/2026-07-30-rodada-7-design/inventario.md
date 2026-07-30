# Inventário do frontend — o mapa que as trilhas leem

Levantado em 2026-07-30, base `307912b`, por varredura de código (sem
julgamento de qualidade — julgar é trabalho das trilhas). Caminhos relativos a
`artifacts/moscow-noivas/` salvo indicação.

## Stack

- Vite + React 19 + TypeScript, SPA sem SSR; rotas logadas em `React.lazy`
  (`src/App.tsx`, `BrowserRouter` + `Routes`, react-router v7).
- TanStack Query (`src/lib/cache.ts` — `staleTime` piso, 401 derruba sessão);
  zustand para loja ativa (`src/lib/store.ts`).
- shadcn/ui estilo `new-york` sobre Radix (33 primitivos em
  `src/components/ui/`); Tailwind **v4** sem `tailwind.config` — tema inteiro
  em `src/index.css` (425 linhas, tokens HSL, light + `.dark`).
- Dark mode por `next-themes` (`attribute="class"`, default `system`).
- Tipografia: Playfair Display (serif, títulos e dinheiro grande) + DM Sans +
  Inter, via Google Fonts (`index.html`).
- Formulários: react-hook-form + zod; ícones lucide; framer-motion; dnd-kit
  (kanban do funil, grade da agenda); cmdk só dentro de `command.tsx`.
- `lang="pt-BR"` no HTML; 25 `input[type=date]` nativos.
- E2E: Playwright, 52 specs em `e2e/`.

## As 54 telas

**Públicas (6):** `login.tsx` (/login) · `convite.tsx` (/convite/:token) ·
`orcamento-publico.tsx` (/orcamento/:token) · `lookbook-publico.tsx`
(/lookbook/:token) · `noiva-portal.tsx` (/noiva/:token — proposta com aceite,
lookbook, provas, extrato) · `not-found.tsx` (*).

**Logadas fora de loja (4):** `trocar-senha.tsx` · `selecionar-loja.tsx` (com
busca client-side) · `admin/index.tsx` (console da rede, tabela por loja) ·
`admin/perfis.tsx` (perfis globais).

**Sob `/loja/:lojaId/` (44):**

| Grupo | Telas (arquivo em `src/pages/`) |
|---|---|
| Seu dia | `dashboard.tsx` — KPIs por persona, fila de mensagens, agenda do dia |
| Relacionamento | `noivas/index.tsx` (cards, busca/etapa/página server-side, alternador lista↔funil) · `noivas/funil.tsx` (kanban dnd) · `noivas/nova.tsx` · `noivas/conversao.tsx` (relatório origem×perda) · `noivas/[leadId]/index.tsx` (ficha concierge) · `.../editar.tsx` · `.../interesses.tsx` · `.../lookbook.tsx` (busca client-side) · `.../portal.tsx` · `agenda/index.tsx` + `agenda/grade.tsx` (cabine×slot 30min, dnd) · `agenda/semana.tsx` (só leitura) · `atendimentos/index.tsx` (fila, 3 filtros + busca) · `atendimentos/novo.tsx` (form longo, aviso de saída) · `atendimentos/config.tsx` · `mensagens/index.tsx` (fila de WhatsApp do dia, SEM filtro) |
| Ateliê | `provas/index.tsx` (por mês, toggle passadas) · `ajustes/index.tsx` (fila da costureira, `recorte` na URL) · `reservas/index.tsx` (livro, toggle passadas) · `reservas/[bloqueioId].tsx` (detalhe: ocupação, retirada/devolução, checklist) · `vestidos/index.tsx` (cards, busca + 6 filtros client-side) · `vestidos/novo.tsx` · `vestidos/[id].tsx` · `vestidos/[id]/editar.tsx` (upload com 2 variantes JPEG no cliente) · `vestidos/utilizacao.tsx` (relatório, `periodo` na URL) · `catalogo/index.tsx` (SEM filtro) · `catalogo/novo.tsx` · `catalogo/[atributoId]/editar.tsx` |
| Comercial/financeiro | `orcamentos/index.tsx` (filtro situação em memória) · `orcamentos/[id].tsx` (editor: itens, desconto, plano, envio, fechar em contrato — **1.222 linhas, a maior tela**) · `contratos/index.tsx` · `contratos/[id].tsx` (financeiro, plano, PDF, cancelamento) · `financeiro/fluxo.tsx` (hub /financeiro, `ini`/`fim` na URL) · `financeiro/dre.tsx` (`comp`) · `financeiro/projecao.tsx` (`h`) · `financeiro/cobranca.tsx` (`faixa`) · `financeiro/receber.tsx` (`filtro`/`ini`/`fim`) · `financeiro/pagar.tsx` (idem; seleção múltipla → pagamento rateado) · `financeiro/folha.tsx` (competência, fechar período) · `financeiro/auditoria.tsx` (`acao`/`autor`/`de`/`ate`, CSV) · `financeiro/conciliacao.tsx` (OFX/CSV no navegador) · `comissoes/index.tsx` (escada, ranking, fechamento — 1.215 linhas) · `minha-comissao/index.tsx` |
| Administração | `equipe/index.tsx` (convites, membros, perfis — 797 linhas) · `equipe/atividade.tsx` · `permissoes/index.tsx` (matriz módulo×ação) · `configuracoes/index.tsx` (abas Loja/Administração) · `configuracoes/captacao.tsx` · `configuracoes/privacidade.tsx` (LGPD, irreversível) · `configuracoes/backup.tsx` |

Redirects: `leads*` → `noivas*`; rota plana → `/loja/:activeLojaId/…`
(`LegacyRedirect`); `*` na loja → NotFound.

Não-telas em `pages/`: `noivas/helpers.ts`, `noivas/noiva-form.tsx`,
`reservas/helpers.ts`, `financeiro/helpers.tsx` (`ErroListagem`, `ResumoCard`,
`invalidarCaixa`), `vestidos/vestido-form.tsx`.

**Sem captura de tela** (cobrir por código): admin, admin/perfis, catálogo (3),
ajustes, comissões, convite, lookbook-publico, orcamento-publico,
selecionar-loja, trocar-senha, noivas/nova, noivas/editar, interesses,
atendimentos/novo, atendimentos/config, vestidos/novo, vestidos/editar,
vestidos/utilizacao, projeção, permissões, equipe/atividade, telas de
configurações (3), not-found, funil, conversão.

## Componentes compartilhados

**Layout/navegação:** `components/layout/app-layout.tsx` (chrome: sidebar ≥md,
header mobile + Sheet, BarraAtendimento, Suspense com `Carregando`) ·
`layout/sidebar.tsx` (**5 grupos, 18 itens** filtrados por permissão; Trocar de
loja; card do usuário; ThemeToggle) · `layout/admin-shell.tsx` ·
`cabecalho-detalhe.tsx` (breadcrumb + h1 + chip status + ação primária +
dropdown de secundárias) · `barra-atendimento.tsx` · `sino-notificacoes.tsx`
(poll 5 min) · `tour-acesso.tsx`.

**Estados (camada canônica):** `components/estado/index.tsx` — `Carregando`
(lista/cards/detalhe, `aria-busy`), `Erro` (+ Tentar novamente), `Vazio`
(porquê + próximo passo + ação), `NaoEncontrado` — usado em 16 arquivos.
`ErroListagem` de `pages/financeiro/helpers.tsx` ainda vive em 6 telas.
`ui/empty.tsx` tem **0 usos**. `lib/erro-api.ts` traduz erro em frase.

**Toasts:** `ui/toast.tsx` + `use-toast.ts`, consumidos por **45 arquivos**.

**Formulários:** `ui/form.tsx` (RHF), `combobox-noiva.tsx` (busca `?q=` +
cadastro no clique), `catalogo/catalogo-campos.tsx`,
`hooks/use-confirmar-saida.ts`.

**Diálogos:** `dialog` 14 usos, `alert-dialog` 16 (destrutivas), `sheet`
(mobile), `dialogo-receber-parcela.tsx`.

**Tabela:** `ui/table.tsx` em só **6 arquivos** (admin, agenda/semana,
comissões, conversão, utilização, matriz-permissões) — o resto das listagens é
card/div.

**Uso dos 33 primitivos:** button 74 · card 52 · badge 37 · alert 33 · input 33
· select 20 · skeleton 20 · alert-dialog 16 · dialog 14 · form 11 · checkbox 9
· textarea 7 · table 6 · popover/switch/tooltip 3 · breadcrumb/calendar/
collapsible/command/dropdown-menu/radio-group/sheet/tabs/toggle/toggle-group 1
· **avatar, empty, pagination, progress: 0**.

**Hooks:** `use-auth.tsx` · `use-toast.ts` · `use-mobile.tsx` ·
`use-caminho-da-loja.ts` · `use-confirmar-saida.ts` (327 linhas ao todo).

**Varreduras que policiam a UI (testes):** `lib/aparencia.test.ts` (WCAG dos
tokens) · `css-variavel-varredura.test.ts` · `datas-varredura.test.ts` ·
`destrutivas-varredura.test.ts` · `escala-dinheiro.test.ts`.

## Busca, filtros e listagens (o mapa da trilha D)

**8 campos de busca, todos `<Input>` livres — não há palette global:**
selecionar-loja:93 (client) · noivas/index:130 (**server**: `q`/`etapa`/
`pagina`) · vestidos/index:432 (client) · atendimentos/index:524 (client) ·
lookbook:213 (client) · combobox-noiva:174 (**server** `?q=`, 20/página) ·
funil:236 (server por coluna).

**Filtro só em memória (morre no F5):** noivas (busca/etapa/página),
vestidos (busca + 5 filtros; só a DATA vai à URL), orcamentos:62 (situação),
contratos:28 (situação), reservas:31 e provas:38 (toggle passadas),
atendimentos:112-118 (busca, vendedora, situação, janela, aba),
conciliacao:169 (`soNaoConciliado`).

**Filtro na URL (linkável):** receber:94 · pagar:123 · fluxo:64 ·
auditoria:59 · cobranca:184 · dre:56 · projecao:61 · comissoes:159 ·
utilizacao:62 · ajustes:67 · agenda/semana:45 · agenda:42. (folha:89 usa
state.)

**Paginação:** só noivas (botões próprios, `{total} noivas · página X de Y`) e
funil (`+ N — refine a busca`). `ui/pagination.tsx`: 0 usos. **Sem filtro nem
busca:** mensagens, equipe, conversão, catálogo, minha-comissão, admin.

## Números

`src/` = 186 arquivos, 35.220 linhas (produção ~31.770; testes 3.454).
`pages/` 66/23.529 · `components/` 51/5.099 (ui 33/2.678) · `lib/` 28/2.098 ·
`hooks/` 5/327 · `index.css` 425.

**10 telas mais longas:** orcamentos/[id] 1.222 · comissoes 1.215 ·
reservas/[bloqueioId] 997 · folha 855 · pagar 823 · equipe 797 ·
contratos/[id] 786 · atendimentos/novo 785 · admin 750 · atendimentos/index
682.
