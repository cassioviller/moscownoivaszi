# Rodada 6 — Code review completo + UI/UX

## Como retomar

**A rodada 6 terminou. Ela é diagnóstico: nenhum arquivo de código foi alterado.**

- **Os 7 relatórios** estão em `docs/revisao/2026-07-25-rodada-6/`:
  `A-arquitetura.md` (13 achados), `B-backend.md` (15), `C-financeiro.md` (11),
  `D-frontend.md` (15), `E-ui.md` (23), `F-ux.md` (44) e **`G-consolidado.md`**,
  que é por onde se começa a ler: o estado do sistema em uma página, o placar,
  os 8 problemas que mais importam, os agrupamentos, e a rastreabilidade dos
  **121 achados** um a um (achado → épico, ou "fora" com o motivo).
- **O backlog executável** é
  `docs/propostas/2026-07-25-rodada-6-backlog.md` — **E91 a E104**, 14 épicos,
  no formato das rodadas anteriores (A dor / Feito significa / Escopo técnico /
  Cuidados / Testes / Primeira ação), com esforço P/M/G, dependências e ordem
  recomendada declarada com o porquê.
- **O primeiro épico a fazer é o E91** — "A fronteira da loja: nenhum id entra
  sem prova de pertencimento" (B1, B2, B4, B10, B12). É o único épico com
  vazamento entre lojas e perda irreversível de dado: um `curl` derruba o
  administrador da loja vizinha (B1) e excluir uma vendedora apaga contratos e
  parcelas PAGAS (B2). **Primeira ação:** escrever o teste cross-tenant de
  `PATCH /lojas/:lojaId/equipe/:usuarioId` e vê-lo falhar.
- **Duas antecipações valem a pena fora da ordem:** o item 1 do **E104**
  (`git rm -r --cached .migration-backup` — 22 MB e 1.611 arquivos versionados
  que envenenam toda busca no repo), no dia 1; e o **E92** inteiro, que fecha
  dois 🔴 em três linhas (`<html lang="pt-BR">` e dois tokens de contraste) e
  paga a rodada em horas.
- **O E102 começa por uma pergunta, não por código:** três decisões de domínio
  financeiro (residual do estorno de comissão, granularidade da vigência, DRE
  caixa × competência) precisam de resposta de produto antes de virar commit —
  vale disparar a pergunta no início da rodada de execução.

---

**Data:** 2026-07-25 · **Commit base:** `01729db` · **Branch:** `main`
**Escopo:** o app inteiro (`artifacts/moscow-noivas`, `artifacts/api-server`,
`lib/*`), ~59k linhas fora de `generated/`.

## Objetivo

Uma revisão de código de ponta a ponta, somada a um levantamento de melhorias
de **UI/UX e experiência do usuário**. Nada é aplicado em código nesta rodada:
o produto é o DIAGNÓSTICO escrito e priorizado. A rodada termina num backlog
(E91+) no formato das rodadas anteriores (`docs/propostas/`).

## Regra desta rodada: nada se perde

Cada trilha escreve o próprio arquivo **enquanto** trabalha, não no fim. Se a
sessão morrer no meio, o que já foi achado está em disco e a próxima sessão
retoma pela tabela de progresso abaixo — ela é a fonte da verdade do que
falta.

## Trilhas

| # | Trilha | Arquivo | Estado |
|---|---|---|---|
| A | Arquitetura, contrato e dívida estrutural | `A-arquitetura.md` | ✅ concluída |
| B | Backend: correção, segurança e dados | `B-backend.md` | ✅ concluída |
| C | Domínio financeiro: dinheiro, datas, comissão | `C-financeiro.md` | ✅ concluída |
| D | Frontend: qualidade de código e performance | `D-frontend.md` | ✅ concluída |
| E | UI: design, consistência e acessibilidade | `E-ui.md` | ✅ concluída |
| F | UX: jornadas, atrito e produto | `F-ux.md` | ✅ concluída |
| G | Consolidação e backlog priorizado | `G-consolidado.md` | ✅ concluída |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ concluída

## Ordem e porquê

A → B → C → D → E → F → G, em sequência. Estrutura antes de detalhe: A mapeia
as fronteiras e diz onde o resto deve olhar; B e C atacam o que quebra
dinheiro e permissão (o caro de errar); D é a ponte entre código e tela; E e F
olham a mesma tela por lentes diferentes (a forma e o fluxo) e por isso vêm
juntas no fim; G só existe depois que há o que priorizar.

## O que cada achado precisa ter

Achado sem endereço não vira trabalho. Todo item traz:

- **Onde** — `arquivo:linha`
- **O quê** — o defeito ou a oportunidade, em uma frase
- **Por que importa** — o cenário concreto de falha ou o custo para quem usa
- **Sugestão** — a direção do conserto, não o patch pronto
- **Severidade** — 🔴 crítico · 🟠 alto · 🟡 médio · 🔵 baixo/polimento

## Contexto herdado (não repetir o que já está resolvido)

O sistema já passou por cinco rodadas de melhoria (`docs/propostas/`,
E68–E90). Achado que já esteja endereçado por épico anterior não conta como
novo — mencionar só se a implementação ficou incompleta, e dizendo qual épico.

- Rodada 3–4: fim do "baixa a loja inteira" em poll e telas de chegada
- Rodada 5 (E87–E90): listagens de arquivo com recorte, poda de código morto,
  drill de restore do backup

## Registro de execução

_Atualizado ao fim de cada trilha._

- 2026-07-25 — plano criado, estrutura de documentos em disco.
- 2026-07-25 — Trilha A concluída: 13 achados (4 🟠, 7 🟡, 2 🔵) em
  `A-arquitetura.md`. Nenhum arquivo de código alterado.
- 2026-07-25 — Trilha B concluída: 15 achados (2 🔴, 6 🟠, 6 🟡, 1 🔵) em
  `B-backend.md`. Os dois críticos são de escopo de tenant/integridade de dados
  (escrita cross-loja em `usuarios` pelas rotas de equipe; `ON DELETE CASCADE` em
  `contratos.vendedoraId`). Nenhum arquivo de código alterado.
- 2026-07-25 — Trilha C concluída: 11 achados (1 🔴, 4 🟠, 4 🟡, 2 🔵) em
  `C-financeiro.md`, todos com exemplo numérico. O crítico é a divergência entre
  `liquidoEmCentavos` (centavos) e `round2` (float) no líquido do orçamento, que
  trava 1,32% das vendas com desconto percentual num 422 sem saída pela tela. O
  `financeiro-core` e o E79 saíram bem: não há motor SQL paralelo, o servidor
  recorta linhas e chama as mesmas funções puras — fluxo e DRE fecham por
  construção. Testes existentes rodados (`moscow-noivas`: 160 passam); nenhum
  arquivo de código nem de teste alterado.
- 2026-07-25 — Trilha D concluída: 15 achados (1 🔴, 7 🟠, 6 🟡, 1 🔵) em
  `D-frontend.md`. O crítico é um loop de render entre os dois `useEffect` que
  sincronizam a loja ativa em direções opostas (`use-auth.tsx:23` ×
  `app-layout.tsx:24`) — um bookmark para outra loja trava a página. Os
  estruturais: cache 100% default (nenhum `staleTime`/`gcTime` no app inteiro),
  o E79 inacabado no cliente (4 telas ainda baixam a tabela da loja inteira), e
  o `api-zod` gerado sem UM consumidor no frontend — os 12 formulários
  reescrevem o schema à mão, causa-raiz cliente do C1/C3. Bundle medido: 1,1 MB
  num único chunk, sem code splitting (`recharts` NÃO está nele — tree-shaken).
  Nenhum arquivo de código alterado.
- 2026-07-25 — Trilha E concluída: 23 achados (3 🔴, 10 🟠, 8 🟡, 2 🔵) em
  `E-ui.md`. **Feita com o app RODANDO** — API + Vite + um proxy próprio na
  frente, navegação por Playwright/Chromium logada como admin no banco que já
  existia, **sem escrever nada no banco**: 28 telas em 1280px, 18 em 390px, 7 em
  dark mode, contraste medido no navegador e varredura de alvo de toque / rótulo
  / nome acessível em 16 rotas. Os três críticos aparecem nas capturas:
  `<html lang="en">` faz o navegador desenhar toda data como `mm/dd/yyyy`,
  horário com AM/PM e a competência como "July 2026"; o texto de **todo botão
  primário** tem 2,79:1 de contraste (WCAG AA exige 4,5:1); e "Contas a receber"
  não mostra o nome da noiva em linha nenhuma — o comentário do próprio arquivo
  diz que o CSV o tem. O sistema de tokens saiu MUITO bem (1 cor cinza crua em
  `pages/` inteiro, dark mode íntegro, zero botão sem nome acessível, todo `alt`
  presente); o buraco é a falta de uma camada de UI entre os tokens e as telas —
  `<Table>` usado em 1 arquivo, `<Pagination>`/`<Empty>`/`<Breadcrumb>` em zero,
  98 cópias à mão de `R$ {brl()}`. Nenhum arquivo de código alterado.
- 2026-07-25 — Trilha F concluída: 44 achados (2 🔴, 24 🟠, 16 🟡, 2 🔵) em
  `F-ux.md`, percorrendo as **9 jornadas** do briefing tela a tela (leitura de
  `pages/` + rotas de `App.tsx` + os componentes compartilhados). Os dois
  críticos são de jornada, não de tela: o carimbo de `confirmadoEm` é dado ao
  ABRIR o wa.me (`mensagens/index.tsx:184-190`), com o mesmo campo que o portal
  usa quando a noiva confirma de verdade (E85) e sem nenhum desfazer; e o 422 do
  "Gerar contrato" (C1) chega como texto de servidor num diálogo sem saída,
  enquanto o arquivo irmão `contratos/[id].tsx:65-83` já tem o dicionário de
  erros que faltou. O padrão que se repete em 8 das 9 jornadas: **a tela onde a
  pessoa descobre o problema não é a tela onde ela pode resolvê-lo, e não há link
  entre as duas** — a ficha da noiva não agenda (F1), a fila do dia não deixa
  rastro de cobrança (F26), Configurações não linka para onde se configura (F40),
  Folha/Recorrências não está em menu nenhum (F31). Dois buracos de dado
  descobertos por jornada: uma PROVA **não pode ser concluída em tela nenhuma**
  (F11) e o orçamento criado pelos dois atalhos naturais nunca tem validade, o
  que desliga o lembrete do E69 para ele (F18). Cinco ideias NOVAS (barra de
  atendimento em curso, "não vou poder ir" no portal, conciliação com memória,
  "primeiros passos" da loja nova, contrato no portal). Nenhum arquivo de código
  alterado.
- 2026-07-25 — Trilha G concluída: os **121 achados** das seis trilhas foram
  cruzados, priorizados e sequenciados em **`G-consolidado.md`** (estado do
  sistema, placar 9 🔴 / 55 🟠 / 47 🟡 / 10 🔵, os 8 problemas que mais
  importam, os agrupamentos e a rastreabilidade achado-a-achado) e em
  **`docs/propostas/2026-07-25-rodada-6-backlog.md`** (**E91–E104**, 14 épicos:
  2 P, 8 M, 4 G). Todos os 121 estão endereçados: 119 dentro de um épico, B14
  distribuído como o teste que acompanha cada correção, e A10 explicitamente
  fora com o motivo. O tema que atravessa a rodada: **o miolo está certo e as
  bordas não o usam** — quase todo conserto é adotar a régua que já existe no
  repo. Os agrupamentos que só apareceram na consolidação: A1+A3+C1+C2+C3+C6+
  C9+D5+F16+F18+F19+F20 são UM épico (a tela de orçamento para de calcular
  dinheiro, o de maior retorno); B13→D6→E4→F17 é uma cadeia de quatro trilhas
  para um erro só; e A5+E17+E18+E19+D7+E6 são o mesmo diagnóstico (não falta
  biblioteca, falta decidir qual é a camada de UI deste app). Ordem recomendada
  E91 → E104, com duas antecipações (a poda do `.migration-backup` e o E92
  inteiro). Nenhum arquivo de código alterado — a rodada 6 termina como
  começou: diagnóstico escrito e priorizado.
