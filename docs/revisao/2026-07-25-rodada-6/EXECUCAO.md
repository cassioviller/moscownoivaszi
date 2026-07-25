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
| E91 | Fronteira da loja: nenhum id entra sem prova (B1 🔴, B2 🔴, B4, B10, B12) | M | ✅ | `9f0f39d` · [notas](execucao/E91.md) |
| E92 | Consertos de uma linha (E1 🔴, E2 🔴, +14) | P | ⬜ | — |
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
