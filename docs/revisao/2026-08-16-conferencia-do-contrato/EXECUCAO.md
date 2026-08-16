# A conferência do contrato — a fila

A tabela de épicos é a **fila**; a de Sobras é a **fonte da verdade do que
continua aberto**. **Conte, não deduza** — a linha aberta é a que não está
riscada.

Plano: [`2026-08-16-conferencia-do-contrato-plano.md`](../../propostas/2026-08-16-conferencia-do-contrato-plano.md)
· Consolidado: [`G-consolidado.md`](G-consolidado.md)
· Lentes: [A](A-dinheiro.md) · [B](B-portas.md) · [C](C-telas.md) · [D](D-e2e-portatil.md) · [E](E-spec-codegen-datas.md) · [F](F-manuais.md) · [G](G-reguas.md)
· Base: `da5148e8`

## O que a conferência abriu

Contado em 16/08/2026: **0 🔴 · 7 🟠 · 17 🟡 · ~30 🔵**, em **8 épicos +
1 lote de higiene**. Duas decisões da dona (E241, E244), nenhuma trava.

## A fila

| Épico | Tese | Fecha | Estado |
|---|---|---|---|
| **E241** | a rescisão devolve UMA vez | A1=C1 🟠 | em execução |
| **E242** | o seed real não inventa índice | A2 🟠, C4, C7 | aberto |
| **E243** | a mora é do dia do FATO | A3 🟠, A4=C2, C3, C6 | aberto |
| **E244** | a 16ª cobra pelo que o papel manda | E1 🟠 (decisão da dona), C5, C10 | aberto |
| **E245** | as portas ao lado | B1, A5=B2, B3–B6, B8 | aberto |
| **E246** | o E2E para de depender do dev | D1–D4, D6–D9 | aberto |
| **E247** | as réguas veem a segunda forma | G1–G8, G10 | aberto |
| **E248** | os manuais dizem o que o sistema faz | F1–F8 | aberto |
| higiene 🔵 | lote | B7, C8, C9, C11, C12, E2–E4, G9, G11–G15, A6, A7 | aberto |

## Sobras

O que aparecer de passagem durante a execução entra aqui **no mesmo commit que
o viu** (regra 12) e sai riscada no commit que a fecha (regra 21).

| ID | Sev. | Onde | O que | Estado |
|---|---|---|---|---|
| ~~S-CF1~~ | 🟡 | `varredura-banco-virgem-cobre-as-migracoes.test.ts:153` | ~~A suíte de API estava vermelha no `main` desde `ec53e2d6` (S-A27): a migração `2026-08-16-s-a27-tipo-de-peca-do-legado.sql` backfilla `vestido_atributos` e não estava na lista travada — `expected [ …(10) ] to deeply equal [ …(9) ]`~~ | ✅ `c8dda201` — a lista sobe de 9 para 10; a tabela já era coberta pelo spec 04. Achada pela régua do E241 (regra 18) |

## Decisões da dona

| Épico | Pergunta | Recomendação | Estado |
|---|---|---|---|
| E241 | sob `estornar`, a conta a pagar `DEVOLUCAO` nasce? | não nasce — o dinheiro já voltou pelo estorno | executada na recomendação (16/08); corrigível numa linha |
| E244 | a 16ª cobra pelo `dataDevolucao` do papel ou pela janela? | o papel | aberta |
