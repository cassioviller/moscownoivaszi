# Ambiente das capturas de 2026-07-30 (regra 6 do método)

**O que se sabe, medido dos próprios arquivos:**

- 27 rotas × 3 variantes = 81 PNGs, gerados 2026-07-30 entre 02:17 e 02:21
  (mtime), app de pé contra o banco de dev.
- `--claro` e `--escuro`: viewport **1280×800** (alguns arquivos 1280×958 —
  captura de página inteira quando a rota rola).
- `--390`: viewport **390×844** (alguns 390×1025, página inteira).
- Loja da sessão: `84e539bd-9199-4551-8ae5-7619868f62d3`; dados = seed do E2E
  mais resíduos de fixture (S18/S25 da rodada 6) — contagens e nomes "Loja
  Teste"/`AVA-*` nas telas são artefato do banco de dev, não defeito de UI.

**O que NÃO se sabe (o script que capturou se perdeu — sobra S-D1):**

- Navegador e versão (provável Chromium do Playwright do repo, não provado).
- **Locale da interface do navegador** — e o E92 provou que `<input
  type=date>` renderiza pela locale da INTERFACE, não pelo `lang` do
  documento. Formato de data visto nas capturas NÃO sustenta achado de
  plataforma sem contraprova com `--lang` fixado.
- Fonte do sistema, densidade de pixel, modo de contraste.

**Consequência para as trilhas:** achado puramente visual (espaçamento, cor,
hierarquia, corte de conteúdo) pode ancorar na captura + código. Achado que
depende de locale/navegador/fonte fica em 🟡 no máximo até contraprova.
