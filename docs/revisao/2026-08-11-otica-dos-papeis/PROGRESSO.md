# Revisão pela ótica dos papéis — agendar, orçar, aceitar, e o gate da reserva

**Aberta em 2026-08-11**, base `980fce5` (`main`, publicado). Alvo: **o código de
HOJE**, não um diff — o diff contra `origin/main` está vazio, e foi por isso que
o `/ultrareview` recusou três vezes.

## O pedido, na letra de quem pediu

> "quero que use a ótica do gerente/dono da loja/Renato, Vendedoras,
> costureiras, clientes, em relação ao sistema, em questão de agendar,
> orçamento, aceite de orçamento e principalmente **o gate que tem entre ao
> aceitar o orçamento o vestido não ficar reservado e isso ser impecílio para
> orçamento virar contrato**. quero que vá anotando tudo que vá fazendo porque
> as sessões estão caindo, caiu duas vezes no início do verify já."

## Por que este arquivo existe

**Duas sessões morreram no início do verify, e as duas não deixaram nada.** Foi
conferido em 2026-08-11 04:11: o container foi recriado entre 04:04 e 04:10, e
`~/.claude/projects/` tinha uma sessão só — a nova. Árvore limpa, sem stash, sem
worktree, sem commit depois de `980fce5` (02:17). **Quase duas horas de revisão
viraram zero** porque nada tinha sido escrito em arquivo.

É a mesma conta que a rodada 2 já pagou duas vezes (`RODADA-2.md`), e a lição
dela vale aqui, agora escrita como regra de operação:

> **Cada agente grava o SEU arquivo antes de devolver qualquer coisa.** O
> retorno estruturado é conveniência; o arquivo é o registro. Se a sessão cair
> no meio, o que já está em `achados/` e `verificacao/` continua valendo, e a
> revisão recomeça de onde parou — não do começo.

## O gate, como ele é hoje (lido antes de abrir os agentes)

O caminho do aceite até o contrato, com âncora:

1. **A noiva aceita** — `artifacts/api-server/src/lib/aceite-orcamento.ts:16-71`.
   Grava `aceitoEm`, `aceiteVersao`, `aceiteHash`, vira `APROVADO`, deixa
   auditoria. **Não encosta em reserva nenhuma.** Nenhuma linha do arquivo cita
   vestido, bloqueio ou disponibilidade.
2. **O contrato cobra reserva** — `artifacts/api-server/src/routes/contratos.ts:448`
   (E150, "o contrato não vende peça que não reservou"): item que aponta peça do
   acervo exige um bloqueio correspondente em `bloqueioVestidoIds`.
3. **A tela oferece só as reservas que já existem** —
   `artifacts/moscow-noivas/src/pages/orcamentos/[id].tsx:281-284`: a lista é
   `tipo === "RESERVA_CASAMENTO" && !canceladoEm` daquele lead.

**Logo: entre 1 e 2 existe um vão.** O aceite não cria reserva; o contrato exige
reserva. Se ninguém reservou a peça no meio, o orçamento aceito **não vira
contrato** — e o que a vendedora lê é o erro do E150. Essa é a tese que a
revisão vai atacar de oito ângulos.

## Etapas — o que já rodou

| # | Etapa | Estado | Registro |
|---|---|---|---|
| 0 | Perícia da sessão caída | ✅ feito 04:12 | nada sobreviveu; ver seção acima |
| 1 | Mapa do fluxo (leitura direta) | ✅ feito 04:15 | as 3 âncoras do gate, acima |
| 2 | Abertura desta gravação | ✅ feito | este arquivo |
| 2b | Este arquivo COMMITADO | ✅ feito | `0deabdd` — a terceira sessão caiu com ele ainda untracked |
| 3 | 8 ângulos de achado | ✅ os 8 gravaram — 59 achados, 3.926 linhas | `achados/01..08-*.md` |
| 4 | Verificação âncora por âncora | ⏳ aguarda | `verificacao/*.md` |
| 5 | Consolidado | ⏳ aguarda | `CONSOLIDADO.md` |

## Os oito ângulos

Cada um grava o seu arquivo em `achados/`. Um ângulo que caiu é um arquivo que
não existe — é assim que se sabe o que refazer.

| Arquivo | Ótica | Pergunta que ele responde |
|---|---|---|
| `01-o-gate-aceite-sem-reserva.md` | **o gate** | O que quebra entre o aceite e o contrato |
| `02-vendedora-fecha-a-venda.md` | vendedora | Onde ela trava para transformar aceite em venda |
| `03-noiva-link-publico.md` | cliente/noiva | O que o link promete e o que o sistema cumpre |
| `04-renato-dono-gerente.md` | Renato | O que ele NÃO enxerga da fila e do dinheiro |
| `05-costureira-provas-ajustes.md` | costureira | O que chega até ela, e quando |
| `06-agendamento-e-agenda.md` | agenda | Agendar prova, conflito, e a peça no dia |
| `07-orcamento-conteudo-e-preco.md` | orçamento | Preço, desconto, versão, hash, validade |
| `08-corridas-e-concorrencia.md` | corrida | Duas noivas, duas abas, dois caminhos |

## Regras que valem para todo agente desta revisão

Herdadas do `METODO.md`, repetidas aqui porque é este arquivo que sobrevive:

- **Sem `arquivo:linha` que você LEU, não é achado — é impressão** (regra 19).
- **Achado de dinheiro sem exemplo numérico não entra** (regra 19).
- **A âncora é conferida antes de virar trabalho** (regra 20): a verificação
  reabre o arquivo e confirma que a linha diz o que o achado afirma.
- Enumeração de arquivo é por `git ls-files`, nunca por `find`/`grep -r`
  (regra 29) — 65% do que o disco devolve é worktree órfão.

## Se a sessão cair de novo

1. Leia este arquivo — ele diz a base, o alvo e a etapa.
2. Conte o que existe em `achados/` e em `verificacao/`. **Conte, não deduza.**
3. Refaça só os ângulos cujo arquivo não existe.
4. O que já está gravado NÃO se refaz — ele já custou o que tinha que custar.
