# scripts/repro — diagnósticos Playwright pontuais

Scripts de reprodução/verificação visual usados durante o desenvolvimento. Não
são parte da suíte (`vitest`) nem rodam em CI — são ferramentas de diagnóstico
manual, guardadas para reuso.

Pré-requisito: app rodando em `http://localhost:5000` e
`REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE` no ambiente. Rodar com `node <arquivo>`.
Login fixo de teste: `admin@moscownoivas.local` / `admin123`, loja `loja-moscow`.

| Script | O que investiga |
|---|---|
| `repro_prova.mjs` | Agendar prova: troca de noiva limpa/recarrega o seletor de Reserva. |
| `repro_prova2.mjs` | Deep-link "Agendar prova" a partir do detalhe da reserva; `bloqueioId` oculto ao trocar a noiva. |
| `repro_prova3.mjs` | Deep-link via `reservas/<id>` → segue o link de agendar e inspeciona o pré-preenchido. |
| `repro_prova4.mjs` | Deep-link por querystring (`?noiva=&tipo=PROVA&reserva=`); confere pré-seleção + hidden fields. |
| `verify_dia.mjs` | Verificação visual do "Dia do atelier": Início ("Hoje no atelier") e Calendário aba Mês (`?dia=`). |

Contexto: os `repro_prova*` cobrem a investigação da fusão Prova→Atendimento
(resolvida em `31ed9d2`/`e06a987`); `verify_dia` cobre a feature "Dia do atelier".
