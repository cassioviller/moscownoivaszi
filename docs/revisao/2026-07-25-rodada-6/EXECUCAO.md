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
4. Ao terminar, atualize a linha na tabela, escreva o parágrafo no "Diário" e
   faça o commit do épico.

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
| E92 | Consertos de uma linha (E1 🔴, E2 🔴, +15) | P | ✅ | `PENDENTE` · [notas](execucao/E92.md) |
| E93 | O cliente para de brigar consigo mesmo (D1 🔴, +6) | M | ⬜ | — |
| E94 | Dinheiro que muda sem rastro (C4, B3, B6, B8, A2, F33) | M | ⬜ | — |
| E95 | A tela de orçamento para de calcular dinheiro (C1 🔴, +12) | G | ⬜ | — |
| E96 | O erro do servidor chega ao campo (F17 🔴, B13, D5, D6) | M | ⬜ | — |
| E97 | Registro operacional: carimbo honesto e desfazer (F6 🔴, +6) | G | ⬜ | — |
| E98 | As telas se alcançam (E3 🔴, +9) | G | ⬜ | — |
| E99 | A camada de UI que falta (D7, E6, E8, +6) | G | ⬜ | — |
| E100 | O portal responde as perguntas da noiva (F35–F39) | G | ⬜ | — |
| E101 | A permissão diz o que a rota faz (B5, B7, B9, F42) | M | ⬜ | — |
| E102 | Decisões de domínio financeiro (C5, C7, C8) | M | ⬜ | — |
| E103 | Roteiro do mês e da loja nova (F30–F34, F41) | M | ⬜ | — |
| E104 | Higiene de repo, build e bundle (A4, D8, +5) | M | ⬜ | — |

Legenda: ⬜ pendente · 🟨 em andamento · ✅ feito e commitado · ⏭️ adiado (com motivo no diário)

**Antecipado para o dia 1:** item 1 do E104 (`.migration-backup/` fora do
versionamento) — envenena toda busca de quem executar os outros treze.

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
