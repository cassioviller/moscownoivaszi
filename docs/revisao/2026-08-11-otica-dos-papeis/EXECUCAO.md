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
| ~~**E158**~~ | ~~`contratos.ts`: toda guarda relê sob a tranca, e o duplicado morre no banco~~ | A | ✅ `HASH_E158` · [relatório](execucao/E158.md) |
| E159 | `reservas.ts`: as quatro portas sem tranca, e o estado terminal em todas | A | ⏳ próximo |
| E160 | orçamento e aceite: o CAS entra na tranca | A | ⏳ |
| E161 | agenda: o eixo da vendedora, e o PATCH que pula a recusa | A | ⏳ |
| E162 | o aceite ganha um caminho até o contrato (**o épico-bandeira**) | B | ⏳ |
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
| S-O3 | O orval **perde o `integer`** do spec ao gerar o zod: `openapi.yaml:6279` declara `type: integer` e o gerado é `zod.number().min(1).max(360)`. O `numParcelas` foi fechado na rota (P5), mas a CLASSE não foi varrida — e ela não é greppável pelo spec. Material para o E171 | 🟡 | E158 | aberta |

## O que herda das trilhas anteriores

Continuam abertas e **nenhum épico daqui as toca**:

- **S-M17** (revisão max) — espera um dump de instalação real. A contagem C2 da
  Fase 0 confirmou que `moscow_base` tem 0 contratos e 0 parcelas.
- **S-A2** e **S-A27** (arqueologia) — esperam gente: as fotos que faltam do
  caderno, e classificar as 132 peças do legado com a dona.

A **S-M10** (campo vazio = apague) deixou de ser sobra solta: ela está dentro do
**E169**.
