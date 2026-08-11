# Execução — os 14 épicos da revisão pela ótica dos papéis

**Aberta em 2026-08-11**, base `f9a8d62` (`main`, publicado). O plano é
`docs/propostas/2026-08-11-otica-dos-papeis-plano.md`; os achados estão em
`CODE-REVIEW.md` (90, dos reviews) e `achados/01..08-*.md` (59, dos ângulos).

Suíte de partida: **API 1134 · frontend 536 · E2E 165 · typecheck verde em 5
projetos**.

## A fila

**Conte as linhas, não deduza.** A que não está riscada é a que está aberta.

| Épico | Tese | Faixa | Estado |
|---|---|---|---|
| ~~**E158**~~ | ~~`contratos.ts`: toda guarda relê sob a tranca, e o duplicado morre no banco~~ | A | ✅ `09d65d8` · [relatório](execucao/E158.md) |
| ~~**E159**~~ | ~~`reservas.ts`: as quatro portas sem tranca, e o estado terminal em todas~~ | A | ✅ `6eb4fda` · [relatório](execucao/E159.md) |
| ~~**E160**~~ | ~~orçamento e aceite: o CAS entra na tranca, e o que a noiva viu é o que se grava~~ | A | ✅ `b2f57ab` · [relatório](execucao/E160.md) |
| ~~**E161**~~ | ~~agenda: o eixo da vendedora, e o PATCH que pulava a recusa~~ | A | ✅ `747ae5e` · [relatório](execucao/E161.md) |
| E162 | o aceite ganha um caminho até o contrato (**o épico-bandeira**) | B | ⏳ próximo |
| E163 | as guardas que se desligam no nulo | B | ⏳ |
| E164 | o escopo da noiva: loja E dona, em toda porta | C | ⏳ |
| E165 | o PDF fala a verdade e cabe na página | C | ⏳ |
| E166 | o link público cumpre o que promete | C | ⏳ |
| E167 | a avaria fecha | C | ⏳ |
| E168 | a agenda diz a mesma coisa em todas as telas | C | ⏳ |
| E169 | a tela do contrato e o dinheiro miúdo | C | ⏳ |
| E170 | os testes que pregavam o defeito passam a pegá-lo | D | ⏳ |
| E171 | a varredura que conta as portas | D | ⏳ |

A **Faixa A é serial** — os quatro mexem nas mesmas transações. A **Faixa C
paraleliza**. O `/code-review ultra` roda sobre a branch de cada faixa antes do
merge.

## Sobras

Vistas de passagem durante a execução, na regra 12: entram aqui **no mesmo
commit** do épico que as viu.

| # | Sobra | Sev | Vista em | Estado |
|---|---|---|---|---|
| S-O1 | `PARCELAS_RENUMERADAS` não entrou em `ACOES_FILTRAVEIS` (`moscow-noivas/src/lib/financeiro/auditoria.ts:66`) — o select da trilha não a oferece. A lista já era curada e incompleta (`RESERVA_CANCELADA` também está fora): é a mesma dívida com um item a mais, não regressão do E158 | 🔵 | E158 | aberta |
| S-O2 | O 23505 do `contratos_lead_ativo_unico` vindo de porta que não seja o `POST /contratos` sai como `REGISTRO_DUPLICADO` genérico — o K9 um nível acima: `erros.ts:181-185` não traduz índice por índice | 🔵 | E158 | aberta |
| S-O3 | O gerador de zod **perde restrições do spec**, e já custou dois achados: o `integer` de `numParcelas` (P5, `openapi.yaml:6279` → `zod.number().min(1).max(360)`) e a coerção de `null` em `zod.coerce.date()`, que devolve 1970 com `success: true` (V12). Os dois foram fechados na rota; a CLASSE não foi varrida, e ela não é greppável pelo spec. Material para o E171 | 🟡 | E158, E159 | aberta |
| S-O4 | **R6** — o PATCH de reserva propaga `casamentoData` sem perguntar aos contratos ATIVOS. O PDF e o portal seguem dizendo 10/05, a janela fica livre para outra noiva, e o `PATCH /contratos` responde "mude a reserva primeiro" — a reserva que já mudou. **Não está em épico nenhum do plano** | 🟡 | E159 | aberta |
| S-O5 | **R8** — o soft-cancel de bloqueio não toca em `atendimentos`: a prova segue AGENDADA apontando bloqueio cancelado, a peça é alugada para outra e sai na retirada, e a noiva chega para a prova sem vestido. Confirma o A05.2. **Não está em épico nenhum do plano** | 🟡 | E159 | aberta |
| S-O6 | `contarHistoria` e `cobrancaViva` recebem o executor como `typeof db` com cast — o tipo de transação do drizzle não é atribuível ao do pool. `DbExecutor` (`disponibilidade.ts`) resolveria os dois | 🔵 | E159 | aberta |
| S-O7 | O aceite pelo PORTAL não manda `versao` (o C2 do E160): a página dele não exibe número de versão, então não há o que comparar. A proteção que ele tem é a leitura sob tranca. Fecha junto do **E166**, que mexe na página da noiva | 🔵 | E160 | aberta |
| S-O8 | **C2 descreve um mecanismo real sobre um gatilho que não existe hoje**: `criarVersaoEnviada` só roda ao ENTRAR em ENVIADO e a máquina de estados não volta de ENVIADO para RASCUNHO — um orçamento tem UMA versão, sempre. A guarda `versaoVista` entrou porque o **E166/O1** vai abrir o reenvio; **quando abrir, confira que ela continua de pé** | 🟡 | E160 | aberta |
| S-O9 | `trancarEixos` (E161) tranca a linha da vendedora em `usuarios`, tabela quente compartilhada com login/equipe. Contenção improvável (a tranca dura a transação do agendamento); se aparecer, a alternativa é advisory lock por `(lojaId, vendedoraId)` | 🔵 | E161 | aberta |

## O que herda das trilhas anteriores

Continuam abertas e **nenhum épico daqui as toca**:

- **S-M17** (revisão max) — espera um dump de instalação real. A contagem C2 da
  Fase 0 confirmou que `moscow_base` tem 0 contratos e 0 parcelas.
- **S-A2** e **S-A27** (arqueologia) — esperam gente: as fotos que faltam do
  caderno, e classificar as 132 peças do legado com a dona.

A **S-M10** (campo vazio = apague) deixou de ser sobra solta: ela está dentro do
**E169**.
