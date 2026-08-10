# Segunda varredura do aplicativo inteiro — 2026-08-10, tarde

**Base** `8b4dd28` (`main`, limpo, **publicado** — `origin/main` na mesma
ponta) · primeira rodada em [`RELATORIO.md`](./RELATORIO.md)

Pedido literal: *"app inteiro ir anotando enquanto faz"*. Este arquivo é a
metade "anotando", e ele existe **antes** da rodada terminar — é a regra 32
sendo cumprida no dia em que nasceu, e ela nasceu porque a rodada da manhã
perdeu 22 achados que só existiam na transcrição.

## Por que uma segunda rodada no mesmo dia

A da manhã não foi repetida — ela foi **completada**. Três motivos:

1. **Os 22 perdidos.** A primeira rodada teve teto de relatório: 18 achados de
   limpeza e 4 de correção menor ficaram de fora e morreram com a transcrição.
   Esta rodada cobre justamente os ângulos que produziram aqueles — limpeza,
   duplicação de régua, passivo, eficiência — e não só os de correção.
2. **Duas sobras abertas SÃO varreduras.** A S-M9 (a tela libera por `criar`, o
   servidor exige `editar` — 8 sítios) e a S-M18 (check-then-write fora de
   transação — "mais três sítios", enumeração perdida) pedem exatamente o que
   uma rodada de leitura em paralelo faz. Elas entram como ângulos, e o que a
   rodada achar fecha a enumeração delas.
3. **O código mudou.** Catorze consertos entraram hoje, alguns em lugares
   sensíveis (transação do `POST /contratos`, união de auditoria, schema com
   unique novo). Código novo é código não revisado.

## O que NÃO é achado novo

O localizador é instruído a ignorar — e o verificador, a refutar como
duplicata:

| Já fechado hoje | Hash |
|---|---|
| S-M1 `DELETE` de cabine sem 404/409/rastro | `3f21fa7` |
| S-M3 carnê do fechamento nascia `AVULSA` | `ae4a8e7` |
| S-M5 delimitador de CSV por linha | `d9e4d59` |
| S-M2 `PagamentoInput.valorPago` com `minimum: 0` | `5d062bd` |
| S-M11 `Number("")` zerando estoque | `aa206ce` |
| S-M15 `banco-virgem` importando antes de trocar a env | `050fa33` |
| S-M4 alerta de caixa cego para saldo de partida negativo | `7d2a6cd` |
| S-M7 guarda de reserva exclusiva fora da transação | `75882f0` |
| S-M13 `EXPEDIENTE_PADRAO` 19h × schema 20h | `865cc33` |
| S-M14 `%`/`_` sem escape no ILIKE | `3a6aebf` |
| S-M12 `vestidoId` do item de orçamento sem prova de loja | `dd0644e` |
| S-M6 janela do estoque fechando com a peça na rua | `b407710` |
| S-M8 confecção virando duas peças | `f3a8b50` |
| S-M16 os três deletes crus restantes | `c4ee0ad` |

E as quatro abertas (S-M9, S-M10, S-M17, S-M18) não são achado: são fila.
Achado que as ENUMERA — "o nono sítio do criar×editar é este" — vale, e é
metade do ponto desta rodada.

## Escopo

**573 arquivos** versionados, fora `docs/**`, `*.md`, gerados, migrações,
locks e o mockup-sandbox: 237 do frontend, 220 da API, 66 de E2E, 20 do
schema, 16 dos núcleos puros (financeiro, agenda, funil), 3 de `scripts/`.

Réguas na abertura: **API 1105 · frontend 534 · E2E 165 · typecheck verde em
5 projetos**, mais a régua do banco virgem (8 ✓).

## Estado

- [ ] Rodada lançada
- [ ] Localizadores concluídos
- [ ] Verificação concluída
- [ ] Achados escritos AQUI, no git

**Enquanto estas caixas não estiverem marcadas, o que existe é esta página.**
Se a sessão cair, é daqui que se retoma — e não da transcrição, que a regra 32
diz não ser backup de nada.
