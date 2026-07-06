# Estado por módulo — Moscow Noivas

> **O que é:** mapa de referência do app **módulo a módulo** — o que cada um faz, suas telas, fluxos de usuário, lógica, dados, permissões, dependências e arestas conhecidas. Serve para entrar em qualquer módulo com contexto completo **antes** de mexer.
>
> **Gerado em:** 2026-06-27 (auditoria de leitura do código real em `app/`). Complementa o `estado-atual.md` (que é um changelog cronológico).
>
> **Como ler:** comece por *Stack & invariantes globais* e *Mapa de dependências* — eles valem para todos os módulos. Depois pule direto pro módulo que vai tocar. A ordem das seções segue a jornada da noiva.

---

## Stack & invariantes globais

**Stack:** Next.js **16.2.6** (App Router + Server Actions), React 19.2.4, Prisma **7.8.0** com `@prisma/adapter-pg` (driver adapter obrigatório; client gerado em `@/generated/prisma/client`), Tailwind CSS 4, `bcryptjs`. Roda em `app/` na porta **25188**. Testes com Vitest (`src/lib/**/__tests__`).

Estes princípios valem para **todos** os módulos — não se repetem em cada seção:

- **Multi-tenant por construção:** toda leitura/escrita de dado de loja passa por `tenantPrisma(prisma, lojaId)` (`src/lib/tenant.ts`), que injeta `lojaId` no `where` e carimba no `data`. **Falha-fechada:** sem `lojaId`, lança. Linha de outra loja → `findUnique` retorna null, `update/delete` lançam P2025.
  - *Três fronteiras que exigem cuidado manual:* (1) `UsuarioLoja` não é escopado (lido direto por `usuarioId`); (2) tabelas-filha sem coluna `lojaId` (`VestidoFoto`, `LeadInteresse`, `AjusteChecklistItem`, `AtributoOpcao`, `VestidoAtributo`) só podem ser tocadas via o model-pai escopado; (3) `$queryRaw`/`$executeRaw` **não** passam pelo guard — proibidos em tabelas de tenant (scan estático no CI).
- **Permissões:** `podeNoModulo(usuarioId, lojaId, modulo, acao)` (`src/lib/permissoes/modulos.ts`) é a porta única. super-admin → sempre true; perfil-admin → true na loja; senão template do perfil + override da loja, **falha-fechada**. Coerência `criar||editar ⇒ ver`. Esconder link nunca é autorização — os gates reais vivem em cada page/action.
- **Dinheiro:** `Decimal(10,2)` no banco, string na borda, **aritmética sempre em centavos inteiros** (`@/lib/dinheiro`, sem float).
- **Datas:** o "dia-calendário" é **meia-noite UTC**; `parseDiaUTC` é o parser estrito (rejeita datas impossíveis como `2027-02-30`). `Atendimento.inicio` é wall-clock UTC em hora cheia. Tudo exibido com `timeZone: "UTC"` (ou `America/Sao_Paulo` na saudação).
- **Gates em camadas:** `(app)/layout` (sessão+loja) → `[lojaId]/layout` (espelha URL×loja + resolve flags de nav) → cada page/action (autorização real). Sessão = cookie `moscow_sessao`, tabela `Sessao`, TTL **absoluto de 8h sem rolling**.

---

## Mapa de dependências entre módulos

```
Fundações (auth · tenant · layout) ─── sustentam tudo
Permissões ─────────────────────────── gate de TODOS os módulos (importado em ~44 arquivos)

Catálogo ──atributos──▶ Vestidos
        └──atributos──▶ Noivas/Interesses ──┐
                                            ├─▶ Indicação (noiva × vestido)
Noivas/Leads ──▶ Atendimentos ──▶ Calendário
   │   ▲                │
   │   │ jornada        └──▶ Orçamentos ──▶ Contratos ──▶ Financeiro (parcelas/recebíveis)
   │   │ (derivada de                                          │
   │   │  todos os fatos)                           Comissões ◀┘ (vendedora + contratos fechados)
   │   │                                            Folha ◀── Equipe (colaboradores)
   ▼   │
Reservas (motor de disponibilidade) ──▶ Provas ──▶ Ajustes
   └──▶ Calendário/Agenda (derivada dos bloqueios)

Dashboard (Início) ◀── agrega: atendimentos · financeiro · reservas · jornada
```

**Leitura rápida das setas-chave:**
- **Catálogo** é a base do vocabulário compartilhado vestido×interesse → sem ele, não há indicação.
- **Reservas** (`BloqueioVestido` + motor de disponibilidade) é a fonte de verdade da agenda do atelier; Provas e Ajustes penduram nela.
- **Orçamento → Contrato → Parcelas → Comissão** é o trilho comercial-financeiro.
- **Jornada da noiva** é *derivada* dos fatos de quase todos os módulos (relação bidirecional com Noivas).

---

## Fundações (auth, multi-tenant, layout)

**Sessão & login:**
- Cookie `moscow_sessao` (`src/lib/auth/cookie.ts`): `httpOnly`, `sameSite: "lax"`, `secure` em produção, `path: "/"`, `expires = sessao.expiraEm`.
- Tabela `Sessao` (`src/lib/auth/sessao.ts`): `criarSessao` gera id `randomBytes(32).base64url`, **TTL absoluto de 8h sem rolling** (`SESSAO_TTL_MS`), com cleanup de sessões expiradas. `lerSessao` valida expiração e `usuario.ativo`. `destruirSessao` idempotente.
- Senha (`src/lib/auth/senha.ts`): `bcryptjs`. `gerarHash`/`verificarSenha` (protegido contra hash malformado).
- Login (`src/app/(public)/login/`): Server Action `loginAction`. Normaliza email (trim/lowercase), erro genérico "Credenciais inválidas" (nunca revela se o email existe), valida `ativo` + senha, cria sessão, seta cookie e `redirect` para `/admin` (super-admin) ou `/` (demais).
- Helpers: `getSessao`, `getSessaoComLoja`, `gateSessaoLojaAtiva` (`src/lib/auth/index.ts`).

**Isolamento multi-loja (tenant):** `tenantPrisma` (`src/lib/tenant.ts`) — client Prisma estendido que injeta/carimba `lojaId` para os `TENANT_MODELS`. Apoia-se no `extendedWhereUnique` do Prisma 7. Loja ativa / super-admin via `sessao.ts`: `listarLojasDoUsuario` (super-admin vê todas as ativas), `selecionarLojaPorPadrao` (auto-select se exatamente 1), `definirLojaAtiva` (valida acesso ANTES de gravar), `gateSessaoLojaAtivaPorId` (`sem-sessao | sem-loja-ativa | ok`). Client base em `src/lib/db.ts` (`PrismaClient` + `PrismaPg`, singleton em dev).

**Layout & navegação:**
- `(app)/layout.tsx`: gate global (`gateSessaoLojaAtiva` → `/login` ou `/selecionar-loja`).
- `loja/[lojaId]/layout.tsx` (`force-dynamic`): revalida sessão+loja, `resolverAcessoLoja` (URL × loja ativa, redirect canônico), resolve **flags de nav no servidor** via `Promise.all` (`podeVerNoivas/Catalogo/Ajustes/Financeiro`, `podeGerenciarEquipe`, `isSuperAdmin`, `mostrarTroca`). Renderiza Sidebar + Topbar + main.
- `src/components/layout/nav-items.ts` → `navSections(lojaId, flags)`: nav agrupada por seções na ordem da jornada — Início · Ateliê · Acervo · Financeiro · Gestão. Itens escondidos por flag; seções vazias filtradas.

**Arestas:** TTL absoluto de 8h (expira em uso contínuo). Flags de UI são só UX — nunca autorizam. Isolamento "de graça" via `tenantPrisma`, com as três fronteiras acima exigindo cuidado manual.

---

## Dashboard (Início)

**Propósito:** A "mesa principal do atelier" — visão única do dia: saudação, agenda de hoje, atenções/urgências, jornada das noivas ativas, próximos casamentos e indicadores. Prioriza operação sobre atmosfera (direção Concierge Atelier).

**Telas & rotas:** `src/app/(app)/loja/[lojaId]/page.tsx` (`force-dynamic`, `DashboardLoja`); `src/app/(app)/page.tsx` (hub que redireciona pra `/loja/${id}`); `error.tsx` (boundary). Largura central `max-w-[900px]`.

**Fluxos (na ordem em que aparecem):**
1. **Saudação** (`SaudacaoDia`): faixa horária (corte 12h/18h, `America/Sao_Paulo`) + nome + data + loja.
2. **Hoje no atelier** (`DiaDoAtelier`): Atendimentos, Provas, Casamentos, A receber, A pagar do dia — as duas últimas só com `financeiro:ver`.
3. **Atenções de financeiro** (`AvisoVencidas`): contas vencidas (só com `financeiro:ver` e quando há).
4. **Indicadores** (`IndicadorDia`): Noivas em acompanhamento, Acervo, Casamentos ≤30d, Em provas. Gated por `leads:ver`.
5. **Atenções imediatas** (`PainelAtencoes`): casamento ≤14d ainda em orçamento/provas.
6. **Jornada + Próximos casamentos** (`PainelJornada`/`PainelCasamentos`). Sem `leads:ver`, troca por bloco de Acervo.
7. **Destaque do atelier** (`DestaqueAtelier`): vestido ativo com foto.

**Lógica:** `src/lib/loja/painel.ts` → `carregarPainel(lojaId)` agrega via `tenantPrisma`; deriva estágio de cada lead com `estagioDaNoiva(fatosDeLead(l, hoje))`. Constantes: `JANELA_PROXIMOS_DIAS = 30`, `JANELA_URGENCIA_DIAS = 14`, `ESTAGIOS_ATENCAO = {orcamento_aberto, em_provas}`. Também `resumo.ts`, `acesso.ts`, `financeiro/vencidas.ts`, `calendario/dia.ts`, `leads/jornada.ts`.

**Dados:** `Lead` (+ `INCLUDE_JORNADA`), `Vestido` (+ `VestidoFoto` ordem 0), `Parcela`, `ContaPagar`, `Atendimento`, `BloqueioVestido`, `Cabine`.

**Permissões:** `leads:ver` (indicadores/atenções/jornada/casamentos); `financeiro:ver` (financeiro do dia + vencidas — `Promise.resolve(null)` quando negado).

**Dependências:** agrega Atendimentos (`calendario/dia`), Financeiro (`vencidas`), Reservas/Provas (bloqueios) e jornada derivada (`leads/*`). Componentes em `src/components/dashboard/`.

**Arestas:** `force-dynamic` (nunca cacheado). Jornada sempre derivada (nunca obsoleta). "Ausência é a calma": blocos só aparecem com conteúdo. Limiares 14d/30d são constantes.

---

## Noivas / Leads

**Propósito:** Cadastro e acompanhamento das noivas (`Lead`) ao longo da jornada — da 1ª visita ao casamento e devolução. É a âncora do funil: cada noiva amarra atendimentos, interesses, orçamentos, contratos e reservas. A jornada é **derivada** dos fatos reais, exibida como timeline de 11 estágios.

**Telas & rotas** (sob `noivas/`, `force-dynamic`):
- `/noivas` — lista em cards. Filtro por estado (Ativas/Concluídas/Desativadas/Todas), busca por nome (noiva ou noivo), filtro por etapa da jornada. Card: etapa, contagem regressiva (bordô ≤14d), WhatsApp, Detalhes, Desativar/Reativar. A "lente" propaga pro detalhe via `?de=`.
- `/noivas/nova` — cadastro (`NoivaForm` + `criarNoivaAction`). Gate `leads:criar`.
- `/noivas/[leadId]` — perfil "concierge": jornada (`PainelJornadaNoiva`), blocos de ação (Atendimentos/Interesses/Contratos), "O casamento", "Contato" (WhatsApp→`wa.me`), "Vestidos pré-escolhidos", "Vestido reservado" (reserva inline). Gate `leads:ver`.
- `/noivas/[leadId]/editar` — edição. Gate `leads:editar`.
- `/noivas/[leadId]/interesses` — desejos (atributos do catálogo + livres) + vestidos sugeridos. Gate `interesses:ver`.

**Fluxos:**
- *Cadastrar* → **redireciona pra `/atendimentos/novo?noiva={id}`** (emenda no agendamento).
- *Mudar etapa:* **não há mudança manual** — a jornada é derivada dos fatos. Único marco manual: "perdida".
- *Marcar perdida/reativar:* `marcarPerdidaAction` → `definirMarcoJornada(..., "perdidaEm", ...)` (encerra reversível).
- *Interesses:* `salvarInteresseAction` → `salvarInteresse` (upsert). *Indicação:* `indicarVestidos` ranqueia o acervo por afinidade.
- *Reservar pela noiva:* `ReservaLivreInline` → `reservarPelaNoivaAction`; exige data de casamento; gate `vestidos:editar`.

**Lógica:** `src/lib/leads/leads.ts` (`criarLead`, `editarLead`, `listarNoivasComEstagio`, `fatosDaNoiva`, `definirMarcoJornada`). `jornada.ts`: função **pura** `estagioDaNoiva(fatos)` — 11 estágios (`cadastrada → atendimento_agendado → atendida → prova_marcada → interesses → orcamento_aberto → contrato_fechado → em_provas → retirado → casamento → devolucao`); estágio = maior índice satisfeito; `perdidaEm` encerra. `houveAtendimento` é *sticky*. `contagem-casamento.ts` (`diasAteCasamento`, `casamentoUrgente` ≤14d). `interesses.ts` (upsert, sem `lojaId` → `exigirLeadDaLoja`). `indicacao/indicacao.ts` (`indicarVestidos`: afinidade = pares atributo×opção em comum; ordena dentro-do-teto → mais pontos → mais barato).

**Dados:** `Lead` (campos do casamento, `etapa` enum, marcos `orcamentoAbertoEm`/`contratoFechadoEm`/`perdidaEm`, `origem`), `LeadInteresse` (1:1, sem `lojaId`), `LeadInteresseAtributo` (join → catálogo).

**Permissões:** `leads:ver/criar/editar`; `interesses:ver/criar/editar`; `vestidos:editar` (reservar).

**Dependências:** *Depende de* Catálogo (atributos), Reservas, tempo/dinheiro. *Alimenta* Atendimentos, Orçamentos, Contratos. A jornada consome de volta orçamento/contrato/provas/devolução (bidirecional).

**Arestas:** `Lead.etapa` ainda no schema mas **não é mais fonte da verdade** (jornada é derivada; código nunca atualiza `etapa`) — resíduo a remover. Marcos `orcamentoAbertoEm`/`contratoFechadoEm` mantidos só por compat. Busca por nome é `includes` simples (sensível a acento). `naoQuerUsar` é só sinal visual.

---

## Atendimentos / Agenda

**Propósito:** Organiza o ato de receber a noiva. Dois eixos: **agendar** (grade de horários por cabine/vendedora) e **atender** (fila onde se inicia, conclui com desfecho ou marca falta). `/agenda` é legada → redireciona pro Calendário.

**Telas & rotas:** `/atendimentos` (fila Atrasados/Hoje/Próximos + histórico); `/atendimentos/novo` (Agendar com grade de slots, client `agendar-form.tsx`); `/atendimentos/config` (Cabines & horário); `/agenda` (redirect).

**Fluxos:**
- *Agendar atendimento:* escolhe Noiva/Cabine/Vendedora/Data → `gradeDoDiaAction` renderiza slots 1h livres/ocupados → clica horário → "Agendar". Botão dá dica da próxima pré-condição faltante.
- *Agendar prova:* Tipo=Prova → picker de reserva (`reservasDaNoivaAction`); sem reserva, bloqueia. Prova fica presa a `BloqueioVestido` RESERVA_CASAMENTO.
- *Fila:* particionada por **situação** (atrasado vencido não some). Filtros: noiva, vendedora, situação.
- *Iniciar/concluir/falta/reabrir:* AGENDADO→EM_ATENDIMENTO→CONCLUIDO (desfecho obrigatório) / FALTOU; reabrir volta a AGENDADO. Desfecho RESERVOU redireciona ao perfil na seção reserva.
- *Config:* adiciona/ativa/desativa cabine (toggle, sem delete), define abertura/fechamento.

**Lógica:** `src/lib/atendimentos/` — `slots.ts` puro (`gradeDeSlots`, **slots 1h, `DURACAO_MIN=60`**); `cabines.ts` (`obterHorarioLoja` default 9–19); `atendimentos.ts` (núcleo + transições). Validação ao agendar: tipo, data+hora inteira, lead da loja, cabine ativa, vendedora membro, **fora-funcionamento**, **sobreposição** (cabine OU vendedora). Dupla proteção: checagem em memória + unique constraints `[cabineId, inicio]` e `[lojaId, vendedoraId, inicio]` (P2002 → `indisponivel`). Desfechos: RESERVOU/VAI_PENSAR/NAO_SERVIU. Prova exige `bloqueioId` da própria noiva.

**Dados:** `Atendimento` (`tipo`, `bloqueioId?`, `inicio` UTC 60min, `situacao`, `atendidoEm?`, `desfecho?` + 2 uniques), `Cabine`, `RegraDisponibilidade` (horário de funcionamento), `BloqueioVestido`, `Ajuste`.

**Permissões:** ver fila/grade `leads:ver`; agendar/cancelar `leads:criar`; transições `leads:editar`; cabines/horário `config:ver/editar`.

**Dependências:** *Depende de* Noivas, Cabines, Equipe (vendedoras), Reservas (prova). *Alimenta* Calendário, jornada, Orçamentos (`criarOrcamentoAction`), Provas & ajustes.

**Arestas:** `/agenda` é só redirect. **Cancelar = delete** (sem histórico). `provaDuracao` existe na regra mas não afeta mais a grade (sempre 60min). A prova operacional (Atendimento/PROVA) **não** alimenta o motor de disponibilidade (decisão 2026-06-01) — "prova" do motor (janela) ≠ prova operacional.

---

## Calendário

**Propósito:** Toda a operação do atelier em 4 vistas da mesma agenda. Aba ativa na URL (`?aba=`). Substitui a antiga "Agenda".

**Telas & rotas:** rota única `/calendario` (Server Component, `force-dynamic`). Abas:
- **Mês** (`AbaMes`): grade 42 células; clicar dia abre "Dia do atelier" (`?dia=`). Navegação `?ref=YYYY-MM`.
- **Vestidos fora** (`AbaVestidos`): Gantt do acervo, janela `?ini=&fim=` (padrão hoje→+60d).
- **Atendimentos** (`AbaAtendimentos`): semana dia×hora, filtros `?q=&vendedora=&situacao=`.
- **Provas & ajustes** (`AbaProvasAjustes`): fila acionável de provas + fila de ajustes pendentes.

**Fluxos:** navegar mês (marcadores casamento/prova/atend., `R$` com `financeiro:ver`, anel bordô em dia passado com pendência); abrir dia do atelier; ver semana com filtros; ver Gantt (preparação→uso→lavagem→manutenção); agir em provas/ajustes (iniciar/falta/concluir prova, adicionar/togglar ajuste).

**Lógica:** `src/lib/calendario/` — `mes.ts` (`gradeDoMes`), `semana.ts` (`indexarPorCelula`), `periodo.ts` (`resolverPeriodo`, padrão 60d, teto 366), `gantt.ts` (`montarGantt`), `dia.ts` (`detalheDoDia`), `dados.ts` (`itensDoMes` com flags `temFinanceiro`/`atencao`), `abas.ts`. Mutations da aba provas&ajustes em `actions.ts` (`iniciarProvaAction`, `concluirProvaAction`, `adicionarAjusteProvaAction`, etc.).

**Dados:** `Atendimento`, `BloqueioVestido` (casamentos + Gantt), `Parcela`, `ContaPagar`, `Ajuste`.

**Permissões:** página `leads:ver`; `financeiro:ver` (sem ela, mês/dia não consultam Parcela/ContaPagar — não vaza); mutations `leads:editar` / `ajustes:criar`/`editar`.

**Dependências:** consome `atendimentos`, `atelier/ajustes`, `disponibilidade/agenda`, `leads/contagem-casamento`, `admin/usuarios` (filtro de vendedora).

**Arestas:** sem estado de cliente (tudo na URL). Tudo em UTC (mistura de fuso quebraria a grade). `atencao` só em dias **passados** com pendência. Provas abertas ignoram o filtro de período (sempre no topo). `resolverPeriodo` é defensivo (nunca janela vazia).

---

## Reservas

**Propósito:** Núcleo de disponibilidade do acervo. Registra qual vestido está comprometido com qual noiva, projeta o "bloco contínuo de indisponibilidade" (preparação→uso→higienização) e impede dupla-reserva. Cobre manutenção e movimentação física (retirada/devolução). É a fonte que alimenta Agenda, Provas e Ajustes.

**Telas & rotas:** `/reservas` (Livro de reservas, agrupado por mês do casamento, próximas/passadas, **read-only**, gate `leads:ver`); `/reservas/[bloqueioId]` (detalhe: bloco de indisponibilidade, movimentação, provas/ajustes embutidos). **A criação não acontece aqui** — vem do perfil da noiva, do detalhe do vestido ou do fechamento de orçamento (`ReservaLivreInline`).

**Fluxos:** reservar (consulta o motor ANTES de gravar; recusa se colide); ver conflito (`conflitaComDatas` → "já reservada para DD/MM"); cancelar (`removerBloqueio`); movimentação retirada→devolução (cada passo com "Desfazer", default = data do casamento); manutenção (tira a peça por um período).

**Lógica — motor de disponibilidade (`src/lib/disponibilidade/`):** motor **puro** (`motor.ts`, `tipos.ts`, `datas.ts`). `calcularJanelas`: reserva → `[preparacao, uso, lavagem]` (bloco contínuo); manutenção → janela única. `provaDataReal`/`provaDuracao` **deliberadamente ignorados** (decisão 2026-06-01). `vestidoDisponivel` checa sobreposição (`excluirBloqueioId` evita auto-colisão); bloqueio malformado **bloqueia** (fail-safe, nunca libera em silêncio). `movimentacao.ts` (`resolverMovimentacao` pura: devolução exige retirada, ≥ retirada, etc.). `reservas.ts` (ponte Prisma↔motor; `obterRegras` cai em `REGRAS_PADRAO`). `agenda.ts` (`agendaDoAtelier`: agenda derivada dos bloqueios, horizonte 60d).

**Dados:** `BloqueioVestido` (entidade única p/ reserva e manutenção via `tipo`; `casamentoData`, `retiradaDataReal?`, `devolucaoDataReal?`, `reservaId?`), `RegraDisponibilidade` (por loja: `provaDiasAntes=14, usoDiasAntes=3, usoDiasDepois=2, lavagemDiasDepois=7`).

**Permissões:** livro/detalhe `leads:ver` (detalhe aceita `ajustes:ver`); movimentação com gate **OR** `leads:editar` OU `ajustes:editar`. Criar/cancelar nas telas de noiva/vestido.

**Dependências:** lê `Vestido` e `Lead`; alimenta Calendário/Agenda, Provas (Atendimento preso a `bloqueioId`) e Ajustes.

**Arestas:** `provaDataReal` ignorado de propósito. `cancelarReserva` é alias **deprecado** de `removerBloqueio`. Sentinela `FUTURO_DISTANTE` (9999-12-31) p/ uso/manutenção em aberto. Bloqueio malformado bloqueia (não libera) e é omitido da agenda.

---

## Provas

**Propósito:** Registro operacional das provas. Uma prova é um `Atendimento{tipo:PROVA}` ancorado a uma reserva (`bloqueioId`) — onde a noiva veste a peça e de onde nascem os ajustes. Por design **não** move a disponibilidade.

**Telas & rotas:** `/provas` (agenda agrupada por mês, próximas/passadas, paginada, ≤7d = bordô, **read-only**). Leitura também embutida no detalhe da reserva. **Agendamento** vive em `/atendimentos/novo?tipo=PROVA&reserva=[bloqueioId]`; **ciclo** (iniciar/concluir) vive na aba "Provas & ajustes" do Calendário.

**Fluxos:** agenda de provas; agendar vinculada à reserva; ciclo AGENDADO→EM_ATENDIMENTO→CONCLUIDO (`concluirProva`, sem desfecho). `listarProvasAbertas` é a fila de trabalho.

**Lógica:** escrita mora em `@/lib/atendimentos/atendimentos.ts`. `src/lib/atelier/provas.ts` é **só leitura** (`listarProvasDaReserva` com ajustes+checklist aninhados; `listarProvasDaLoja` paginada).

**Dados:** `Atendimento` (`tipo:PROVA` + `bloqueioId`) — não há entidade "Prova" separada.

**Permissões:** ver `leads:ver` OU `ajustes:ver`; agendar `leads:editar`.

**Dependências:** depende de Reservas (prova presa a `bloqueioId`) e da infra de Atendimentos. Alimenta Ajustes.

**Arestas:** desacoplada do motor de disponibilidade. `concluirProva` valida `tipo===PROVA`. `/provas` é read-only.

---

## Ajustes

**Propósito:** Fila de costura. Cada ajuste é uma tarefa que nasce de uma prova ("bainha 3cm"), com checklist opcional. A tela global é a "fila da costureira", ordenada por urgência (casamento mais próximo).

**Telas & rotas:** `/ajustes` (fila global PENDENTES, paginada, prazo/bordô ≤14d, "Marcar feito"). Criação/edição fina no **detalhe da reserva** (por prova: adicionar ajuste, marcar feito/reabrir, remover, checklist).

**Fluxos:** fila por urgência (`listarAjustesPendentes` ordena no banco por `casamentoData` asc nulls-last); adicionar ajuste numa prova (valida atendimento é PROVA da loja); checklist (adicionar/alternar/remover); marcar feito/reabrir (`alternarStatusAjuste`).

**Lógica:** `src/lib/atelier/ajustes.ts`. Mutações retornam `{ok}` (distingue sucesso de no-op fail-closed). Checklist é filha pura (sem `lojaId`) → `exigirAjusteDaLoja` antes de tocar.

**Dados:** `Ajuste` (`lojaId`, `atendimentoId`, `status` PENDENTE/FEITO), `AjusteChecklistItem` (filha pura, cascade).

**Permissões:** `ajustes:ver/criar/editar`. Movimentação no detalhe da reserva aceita `ajustes:editar` no OR com `leads:editar`.

**Dependências:** depende de Provas (exige `atendimentoId` PROVA) e transitivamente de Reservas. É folha operacional.

**Arestas:** falha-fechada em toda mutação. Ordenação por urgência no banco (paginação estável). Filtro por `intervalo` exclui ajustes sem `casamentoData`.

---

## Vestidos

**Propósito:** Gerir o acervo como peças de coleção (não estoque): cadastro, fotos otimizadas, características do catálogo (que alimentam a indicação) e disponibilidade via reservas/manutenções.

**Telas & rotas** (`force-dynamic`, gate módulo `vestidos`): `/vestidos` (grade, capa = foto ordem 0, selo "fora do acervo"); `/vestidos/novo`; `/vestidos/[id]` (detalhe/lookbook: fotos, **Disponibilidade** livre/reservada + reservar/cancelar, **Manutenção**, **Características**); `/vestidos/[id]/editar` (form + gestão das 2 fotos); `/vestidos/[id]/foto/[ordem]` (route handler GET que serve bytes WebP, cache + ETag + `?v=<versao>`).

**Fluxos:** cadastrar (código único por loja, nome, preço, características); editar (substitui o conjunto de atributos); subir fotos (só na edição, 2 slots, Server Action sem JS); reservar/manutenção pela peça (reserva escolhe noiva com data de casamento). **Não há filtro por atributo na listagem** (só ordena por nome).

**Lógica:** `parsePreco` pt-BR (`"2.400,00"→2400`, recusa ≤0). `VestidoAtributo` (sem `lojaId`) escrito por escrita aninhada; edição = `deleteMany` + `create`; validado contra catálogo. **Pipeline de fotos** (`sharp`): `.rotate()` → `.resize(1400)` → `.webp(q80)`, limite 12MB, persistido como `Bytes` no Postgres, `versao = updatedAt` p/ cache-busting; `exigirVestidoDaLoja` antes de tocar a foto. Motor de reserva/conflito (ver Reservas).

**Dados:** `Vestido` (`@@unique [lojaId, codigo]`, `precoBase Decimal`, `status`), `VestidoFoto` (filha sem `lojaId`, ordem 0/1, `bytes`), `VestidoAtributo` (join), `BloqueioVestido`.

**Permissões:** `vestidos:ver/criar/editar`; reservar exige também `leads:ver`. Route de foto autoriza por sessão + `lojaId`.

**Dependências:** Catálogo (características), Disponibilidade/reservas, Leads (noivas p/ reservar).

**Arestas:** sem filtro/busca na grade (só ordem por nome). Limite rígido de 2 fotos. `next/image` não usado de propósito (route autenticado). P2002 no código → "Já existe um vestido com esse código".

---

## Catálogo

**Propósito:** Define o vocabulário de características (atributos + opções) **compartilhado entre VESTIDO e INTERESSE** — base da indicação noiva×vestido (casar = contar pares atributo×opção em comum).

**Telas & rotas** (`force-dynamic`, gate `config`): `/catalogo` (lista TODOS os atributos, inclui inativos); `/catalogo/novo`; `/catalogo/[atributoId]/editar`. Form compartilhado `atributo-form.tsx`.

**Fluxos:** criar atributo (nome único por loja, tipo `OPCAO_UNICA`/`ESCALA`, opções uma por linha); editar (renomear, ativar/desativar, adicionar opções); **opções nunca são apagadas** — só desativadas (FK de `VestidoAtributo`/`LeadInteresseAtributo`).

**Lógica:** `exigirNomeLivre` (único case-insensitive pt-BR); `parseLinhas` (dedup); edição = `update` + `create`, nunca `delete`. `listarCatalogo` retorna só ativos; `validarSelecoes` (integridade do join); `rotularSelecoes` (traduz, ignora o que sumiu).

**Dados:** `Atributo` (`lojaId`, `tipo`, `ordem`, `ativo`), `AtributoOpcao` (filha sem `lojaId`).

**Permissões:** módulo `config` (`config:ver/criar/editar`).

**Dependências:** base da indicação; consumido por Vestidos (`VestidoAtributo`) e Interesses (`LeadInteresseAtributo`). CRUD próprio.

**Arestas:** nunca DELETE (só ativar/desativar). Tipo `ESCALA` persistido mas sem tratamento de UI diferente de `OPCAO_UNICA`. `ordem` sempre max+1 (sem reordenar manual).

---

## Orçamentos

**Propósito:** Registrar a negociação comercial — vestidos/serviços escolhidos, valor combinado, descontos e ciclo de aprovação. O orçamento APROVADO é a base de valores do contrato.

**Telas & rotas:** `/orcamentos` (lista, filtros por status, **sem "novo"** — nasce do atendimento/perfil), gate `leads:ver`; `/orcamentos/[id]` (detalhe: "Vestidos escolhidos" editáveis em RASCUNHO/ENVIADO, "Vestidos indicados" por afinidade, barra de status/contrato), mutar `leads:editar`.

**Fluxos:** criar (de atendimento herda lead+vendedora; do perfil usa usuário atual); adicionar/editar/remover item (só RASCUNHO/ENVIADO); desconto PERCENTUAL/VALOR; status RASCUNHO→ENVIADO→APROVADO/RECUSADO (aprovar exige ≥1 item); gerar contrato (quando APROVADO); indicação por afinidade.

**Lógica:** `calcularTotais` (centavos, clamp `0 ≤ desconto ≤ subtotal`); `TRANSICOES` (APROVADO/RECUSADO terminais); `indicarVestidos` top-6. Actions: `criarOrcamentoAction`, `adicionarItemAction`, `editarItemAction`, `removerItemAction`, `definirDescontoAction`, `mudarStatusAction`.

**Dados:** `Orcamento` (`atendimentoId?`, `vendedoraId`, `status`, `descontoTipo/Valor`, `aprovadoEm?`, `contrato?` 1:1), `OrcamentoItem` (`tipo` VESTIDO/SERVICO/AJUSTE, `vestidoId?`, `valorUnitario`, `quantidade`).

**Permissões:** ver `leads:ver`; mutar `leads:editar`; gerar contrato `leads:criar`.

**Dependências:** vem de Atendimento/Lead; usa Indicação + dinheiro; gera Contrato (`orcamentoId @unique` 1:1); referencia Vestido.

**Arestas:** APROVADO/RECUSADO terminais (sem volta). "Vestidos pré-escolhidos" **não** deduplicado de propósito (é o histórico). `editarItem` existe na lib mas o detalhe não expõe form de desconto visível (lógica pronta). *Nota: este é o módulo onde o trilho `fechar-contrato` da versão Vite era mais forte — ver `estado-atual.md` e a pendência de portar de volta.*

---

## Contratos

**Propósito:** A VENDA persistida. Nasce pré-preenchida de um orçamento APROVADO (ou em branco da noiva), é conferida/ajustada, gera o PDF e é a base do financeiro (parcelas) e da comissão.

**Telas & rotas:** `/contratos` (lista por status Todos/Ativos/Cancelados), gate `leads:ver`; `/contratos/[id]` (detalhe: editável em ATIVO, **Plano de pagamento** com gerar/receber/estornar/remover parcela, `<details>` de cancelamento/distrato), editar/cancelar `leads:editar`; `/contratos/novo` (**aposentada**, redireciona); `/contratos/[id]/pdf` (route handler GET, baixa `contrato-<slug>.pdf`).

**Fluxos:** gerar de orçamento (`criarContratoDeOrcamento`, `orcamentoId @unique` barra duplicar); gerar em branco (`criarContratoDaNoiva`, valor 0); editar (CPF/vestido/valor/forma/datas, só ATIVO); plano de parcelas (entrada nº0 + N); registrar recebimento/estornar; **cancelar/distrato** (PREVISTA→CANCELADA; sobre PAGA escolhe manter vs estornar; transação); baixar PDF.

**Lógica:** `criarContratoDeOrcamento` (casa reserva por `vestidoId`, puxa `dataCasamento`); `diaParaData` (parser UTC estrito); **`pdf.ts`** gera PDF 1.4 válido **sem lib externa** (objetos/xref/trailer manuais, Helvetica WinAnsi, função pura testável); `planoDivergeDoTotal` (aviso). `editavel = status==="ATIVO"`.

**Dados:** `Contrato` (`orcamentoId? @unique`, `bloqueioVestidoId?`, `vendedoraId`, `status`, `valorTotal`, `formaPagamento?`, `fechadoEm` = competência da comissão, `comissaoEstornadaEm?`), `Parcela` (`numero` 0=entrada, `status` PREVISTA/PAGA/CANCELADA; ATRASADA é derivado).

**Permissões:** ver/PDF `leads:ver`; gerar `leads:criar`; editar/cancelar `leads:editar`. No `cancelarContrato`, o `where` inclui `lojaId` explícito (o `tx` do `$transaction` não passa pelo guard do tenant).

**Dependências:** Orçamento (origem 1:1), Reservas (vincular vestido/datas), Financeiro (parcelas + actions de `financeiro/receber`), `pdf.ts`. Alimenta Comissão (`fechadoEm`).

**Arestas:** cancelar é o único caminho fora de ATIVO (sem "reativar"). Reserva só anexada quando identificável. Parser de datas estrito. PDF: chars não-WinAnsi viram `?`. `/novo` é stub de redirect.

---

## Financeiro

**Propósito:** O maior módulo — central financeira do ateliê. Consolida recebíveis (das noivas, nascidos dos contratos) e saídas (despesas, fornecedores, salários, comissões). **Dinheiro em centavos**; **ATRASADA sempre derivado**; competência `"YYYY-MM"`; caixa por data do movimento (não do vencimento). Núcleos de cálculo são puros e testados.

**Submódulos (rota · o que faz):**
- **Fluxo de caixa** (`/financeiro`, `fluxo.ts`): resumo realizado do período, tendência 6 meses, timeline de movimentos, "horizonte em aberto". Leitura pura, filtro `?ini=&fim=`. Não é extrato bancário (sem saldo inicial/conciliação).
- **Contas a receber** (`/financeiro/receber`, `receber.ts`): parcelas com resumo + filtros (`abertas|atrasadas|recebidas|todas` + intervalo); gerar plano (entrada + N, última absorve resto, `createMany`); adicionar/editar/remover parcela (só PREVISTA); **dar baixa/registrar recebimento**; **estornar**.
- **Contas a pagar** (`/financeiro/pagar`, `pagar.ts`): tipos DESPESA/FORNECEDOR/SALARIO/COMISSAO; lançar/editar/remover; **pagar** (um `Pagamento` quita N contas via `PagamentoItem`, transacional); **estornar**; marcar enviado à contabilidade.
- **Folha** (`/financeiro/pagar/folha` + `exportar/route.ts`): salário recorrente (`@@unique [lojaId, colaboradorId]`); `gerarFolhaDoMes` (idempotente); pagar colaborador (quita salário+comissão); **exportar XLSX** (ExcelJS) e marcar período como enviado.
- **Comissões** (`/financeiro/comissoes` + `/regras`, `comissao.ts`): regras com **faixas/degraus** por vendedora/vigência (`validarFaixas`); `calcularComissao` (faixa do acumulado final rege o mês, retroativo); **ranking ao vivo** (`previewComissao`, já desconta estorno §6.4); **fechar competência** (`fecharCompetencia`, ≤ mês anterior, idempotente, gera `ContaPagar` COMISSAO).
- **DRE** (`/financeiro/dre`, `dre.ts`): regime de caixa por competência; receitas (parcelas PAGA) − despesas (PagamentoItem) por categoria.
- **Projeção** (`/financeiro/projecao`, `projecao.ts` + `saldo-referencia.ts`): saldo de hoje (âncora `SaldoReferencia` + realizado) + curva dia-a-dia 30/60/90d; reporta menor saldo e 1º dia negativo; vencidos fora da curva.
- **Cobrança** (`/financeiro/cobranca`, `cobranca.ts`): aging em faixas (`ate30|31-60|60+`) por noiva; `wa.me` (`linkWhatsApp`); registrar cobrança + histórico.

**Lógica:** funções-chave listadas por submódulo acima; helpers `datas.ts`, `intervalo.ts`/`intervalo-params.ts` (`vencimentoNaJanela`), `forma.ts`, `obrigacao.ts` (`ehAtrasada`), `plano.ts`, `vencidas.ts` (alimenta o Início), `contabilidade.ts`/`planilha-contabilidade.ts` (XLSX). Server Actions finas (gate → lib → redirect com `?ok/?erro`).

**Dados:** `Parcela`, `ContaPagar`, `Pagamento` + `PagamentoItem` (`contaPagarId @unique`), `ComissaoRegra`/`ComissaoFaixa`/`ComissaoFechamento` (`@@unique vendedora×competência`), `SalarioRecorrente`, `SaldoReferencia`, `RegistroCobranca`.

**Permissões:** só usa `financeiro:ver` e `financeiro:editar` (não usa `criar`). XLSX usa gate `ver`.

**Dependências:** parcelas nascem dos Contratos; comissão depende da vendedora (`Contrato.vendedoraId`) e contratos por `fechadoEm`; folha depende da Equipe; cobrança depende de Lead. DRE/fluxo/projeção são consumidores read-only.

**Arestas:** ATRASADA nunca persistida. Idempotência em folha/fechamento. Transações tudo-ou-nada. **Estorno §6.4** pode carregar saldo negativo entre competências. Preview por intervalo acumula sobre a janela (não o mês) — definitivo é mensal. Projeção sem âncora monta sobre 0.

---

## Permissões

**Propósito:** Define, por loja, o que cada perfil pode fazer em cada módulo (matriz perfil × módulo × ação). Duas camadas: *template global* (super-admin em `/admin/perfis`) e *override por loja* (admin em `/loja/[lojaId]/permissoes`). Único ponto de enforcement.

**Telas & rotas:** `/loja/[lojaId]/permissoes` (override da loja); `/admin/perfis` (templates globais). Componente `MatrizPermissoes`. Lógica em `src/lib/permissoes/{modulos,perfis}.ts`.

**Fluxos:** editar matriz (linhas = módulos `leads, interesses, vestidos, ajustes, config→"Catálogo", financeiro`; colunas = `ver/criar/editar`; `criar/editar` força `ver`, desmarcar `ver` cascateia); **restaurar padrão** (`removerOverride`, volta a herdar template). Perfil **Admin** é readonly.

**Lógica:** `normalizarAcessos` (reconcilia contra `MODULOS × ACOES` do CÓDIGO, fail-closed); `podeNoModulo` (porta única); `resolverAcessosEfetivos` (**override substitui o template inteiro**, snapshot não merge); `salvarOverride` (upsert manual). `MODULOS_VISIVEIS` + hidden inputs para módulos fora da grade.

**Dados:** `Perfil` (`acessosModulos` JSON; seeds `perfil-admin/vendedora/recepcao/costureira`), `PerfilOverrideLoja` (PK `[lojaId, perfilId]`, cascade).

**Gates:** override `ehAdminDaLoja`; template `isSuperAdmin`. Rejeita `perfilId` vazio ou `PERFIL_ADMIN_ID`.

**Dependências:** consumido por **TODOS** os módulos (`podeNoModulo` em ~44 arquivos).

**Arestas:** override é snapshot total (módulo novo → `false` até regravar). `salvarOverride` sem upsert atômico (corrida teórica). Sem UI para criar/excluir perfis customizados (só editar os seedados).

---

## Equipe

**Propósito:** Tela do admin da loja para ver membros e cadastrar vendedoras, com comissão do mês ao vivo (opcional).

**Telas & rotas:** `/equipe` (fora de `/loja/[lojaId]`, usa loja ativa da sessão). Form `vendedora-form.tsx`, action `actions.ts`, lógica `src/lib/admin/usuarios.ts`.

**Fluxos:** listar membros (`listarEquipe`); cadastrar vendedora (nome/email/senha ≥8); ver comissão do mês (`previewComissao`, só com `financeiro:ver`) + link pro ranking.

**Lógica:** `criarUsuarioComPerfil` (núcleo compartilhado com `criarAdmin`): valida, normaliza email, dedup lojas, email único, bcrypt, cria `Usuario` + `UsuarioLoja[]` em **transação**. `criarVendedora` → perfil `perfil-vendedora` em 1 loja.

**Dados:** `Usuario` (`email @unique`), `UsuarioLoja` (PK `[usuarioId, lojaId]`, um perfil por loja).

**Gates:** `ehAdminDaLoja` (página + action, defesa em profundidade); comissão gateada por `financeiro:ver`.

**Dependências:** `admin/usuarios`, `permissoes`, `financeiro/comissao`.

**Arestas:** **read + create only** (sem editar perfil, trocar perfil, remover membro, reset de senha). Só cria perfil Vendedora. Opera sobre a loja ativa (sem `lojaId` na URL).

---

## Admin (super-admin)

**Propósito:** Console da plataforma, fora do gate de loja, exclusivo do super-admin. Cadastra lojas, cria admins de loja e edita os perfis-modelo globais.

**Telas & rotas:** `/admin` (lojas + admins), `/admin/perfis` (templates). Forms `loja-form.tsx`/`admin-form.tsx`. Actions `admin/actions.ts` e `admin/perfis/actions.ts`. Layout `admin/layout.tsx`.

**Fluxos:** criar loja (`criarLoja`); criar admin com múltiplas lojas (`criarAdmin` → `criarUsuarioComPerfil(..., "perfil-admin")`, valida que todas as lojas existem); perfis globais (matriz, Admin readonly, `salvarTemplate`).

**Lógica:** `exigirSuperAdmin()` no topo de toda action (defesa em profundidade). `listarAdmins` filtra `isSuperAdmin: false` + `perfilId === "perfil-admin"`.

**Dados:** `Loja`, `Usuario` (`isSuperAdmin`), `Perfil`, `UsuarioLoja`. `isSuperAdmin` NÃO afeta scoping — isolamento segue no `tenantPrisma`; super-admin só vê todas as lojas no seletor.

**Gates:** `isSuperAdmin` no layout **e** em cada action.

**Dependências:** `admin/usuarios`, `auth`, `permissoes` (subrota perfis). Compartilha `criarUsuarioComPerfil` com Equipe.

**Arestas:** **create + list only** (sem editar/desativar loja, sem editar/excluir admin, sem trocar lojas, sem reset de senha). Admin só vinculável a lojas ativas no form, mas o servidor não revalida `ativo`. IDs de perfil são strings fixas do seed.

---

## Consolidado de arestas & dívidas conhecidas

Pontos a ter em mente **antes de mexer** (puxados de cada módulo):

| Módulo | Dívida / aresta |
|---|---|
| Noivas | `Lead.etapa` é resíduo (jornada é derivada); marcos `*Em` só por compat; busca por nome é `includes` sensível a acento |
| Atendimentos | cancelar = delete (sem histórico); `provaDuracao` não afeta mais a grade; `/agenda` é só redirect |
| Reservas | `cancelarReserva` é alias **deprecado**; `provaDataReal` ignorado de propósito |
| Vestidos | sem filtro/busca na grade; limite rígido de 2 fotos; fotos como `Bytes` no Postgres (sem object storage) |
| Catálogo | tipo `ESCALA` sem UI própria; sem reordenar opções; nunca DELETE |
| Orçamentos | **portar de volta o `fechar-contrato`** da versão Vite (gera contrato+parcelas+comissão+avança jornada num clique); form de desconto não exposto na UI |
| Contratos | `/novo` é stub; sem "reativar" após cancelar |
| Financeiro | preview de comissão por intervalo ≠ fechamento mensal; estorno §6.4 carrega saldo negativo; projeção sem âncora monta sobre 0 |
| Permissões | override é snapshot total (módulo novo → false); `salvarOverride` sem upsert atômico; sem CRUD de perfis customizados |
| Equipe / Admin | read+create only (sem editar/desativar/reset de senha pela UI); admin não revalida loja `ativo` |
| Multi-tenant | 3 fronteiras manuais: `UsuarioLoja`, tabelas-filha sem `lojaId`, raw SQL proibido em tabelas de tenant |
| Deploy | `[services.production]` do artifact ainda aponta pro Vite estático — virar `next build`/`start` (dev já está certo) |
