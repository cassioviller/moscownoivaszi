# Pesquisa — Núcleo Seleção → Reserva no Atendimento (UX bridal / aluguel)

> Data: 2026-06-15. Pesquisa + proposta de **redesign** (sem código) do núcleo
> **seleção → reserva** do atendimento da Moscow Noivas. Pedida pelo dono:
> "o atendimento está cru, precisa de UI/UX — filtro de vestido, busca,
> pré-selecionar, carrinho de reserva (vários vestidos + acessórios) antes de
> fechar a reserva."
>
> **Escopo travado** (via AskUserQuestion): entrega = *pesquisa + proposta de
> redesign*; largura = *só seleção + reserva* (filtro/busca/pré-seleção de
> vestido, carrinho multi-item vestido+acessórios, e o ato de fechar a reserva).
>
> ⚠️ **Status da pesquisa:** o harness `deep-research` (fan-out de buscas → fetch
> → verificação adversarial → síntese citada) foi **interrompido na fase de
> busca** por limite de crédito. O conteúdo abaixo é **síntese de conhecimento
> consolidado de UX de varejo bridal / formalwear rental**, com **nível de
> confiança marcado** — NÃO é o relatório com citações verificadas. Os pontos
> `[verificar]` valem checagem com fonte primária (ex.: Baymard Institute para
> faceted search; docs de POS de aluguel) antes de virarem requisito fixo.

---

## 1. Achados — best-practices

### 1.1 Filtro & busca do acervo
- **Disponibilidade na DATA do casamento é o filtro #1 do aluguel** — não um
  detalhe. O usuário não quer "todos os vestidos", quer "os livres para a minha
  data". Padrão: a **data entra como contexto global** (escolhida uma vez) e o
  acervo já aparece filtrado por disponibilidade. `[confiança alta]`
- **Filtros facetados específicos da categoria** > busca por texto livre. Para
  noiva, as facetas que importam: **silhueta/corte, decote, tecido/renda, cor
  (marfim/branco/off), tamanho, faixa de preço, coleção/estilista**.
  `[alta — taxonomia exata: verificar Baymard]`
- **Filtros aplicados sempre visíveis e removíveis** (chips) + contagem de
  resultados ao vivo; nunca "0 resultados" sem saída (oferecer afrouxar filtro).
  `[alta]`
- **Busca type-ahead** por **código do modelo** e nome — a vendedora muitas vezes
  já sabe o código. `[média]`
- **Base já existe no sistema:** catálogo `Atributo`/`AtributoOpcao` + motor de
  disponibilidade por bloco contínuo. **Falta expor disponibilidade-por-data como
  filtro de primeira classe** na seleção.

### 1.2 Pré-seleção durante o atendimento
- Padrão bridal = **"lista de prova" / try-on list / favoritos**, SEPARADA do
  carrinho. Noiva + vendedora montam curadoria de ~3–8 peças para provar; só
  depois isso vira reserva. `[alta]`
- **Comparação lado a lado** + **notas por peça** ("amou o decote, achou a cauda
  pesada") viram memória do atendimento. `[média]`
- **Wishlist/favoritos ≠ carrinho**: favoritar é leve/reversível; carrinho é
  compromisso. Misturar confunde. `[alta]`

### 1.3 Carrinho/sacola de reserva multi-item
- **Carrinho persistente, multi-item, heterogêneo** (vestido + acessórios: véu,
  tiara, sapato, joias). Cada item é uma **linha com estado próprio**. `[alta]`
- **Bundle/pacote ("look completo")** com **preço de pacote** e acessório como
  **upsell no fechamento**. `[alta]`
- No aluguel, **cada linha carrega período de bloqueio próprio** (o acessório
  também tem inventário e data) — não é só "quantidade × preço". `[alta]`
- **Save-for-later** dentro do carrinho. `[média]`

### 1.4 Fechar a reserva — os estados
Modelo consolidado de aluguel (onde o sistema está mais cru):

| Estado | O que é | Inventário |
|---|---|---|
| **Cotação/Sacola** | itens juntados, nada travado | não bloqueia |
| **Hold / pré-reserva** | trava temporária, **expira** (ex. 24–72h) | bloqueia com validade |
| **Reserva firme** | confirmada, geralmente com **sinal/depósito** (mercado ~30–50%) | bloqueia o período |
| **Contrato/Confirmada** | termos aceitos | bloqueia |
| **Retirada → Devolução** | ciclo físico | bloqueia até higienização |

- **Anti-double-booking por sobreposição de período** é obrigatório (atendimento
  já resolvido; a reserva precisa do equivalente **por intervalo**). `[alta]`
- **Sinal/depósito para segurar** é quase universal no aluguel. `[alta — % varia, verificar]`
- **Hold que expira** evita inventário preso por indecisão. `[média]`

---

## 2. Diagnóstico do fluxo atual
- `Atendimento` termina em desfecho **RESERVOU**, mas a reserva real é **1
  vestido por vez, no perfil da noiva**, via `BloqueioVestido`
  (RESERVA_CASAMENTO). **Sem carrinho, sem acessórios, sem estados intermediários**
  (é firme direto).
- O **motor de bloqueio contínuo** (preparação → uso → higienização) já é forte.
  Falta a **camada de composição (carrinho)** e a **camada de estados** por cima.

---

## 3. Proposta de redesign (sem código)

**3.1 Data como contexto do atendimento.** Na seleção, a data do casamento já
filtra o acervo por disponibilidade. Disponibilidade vira faceta de topo + chips
de silhueta/decote/tecido/tamanho/preço/coleção.

**3.2 Três camadas distintas** (hoje colapsadas):
- **Favoritos / lista de prova** (leve, por atendimento) — estende a `indicação`
  atual + um "favoritar".
- **Sacola da reserva** — nova entidade `Reserva` (cabeça) + `ReservaItem`
  (filhos). Multi-item: cada item é um vestido **ou** acessório, com seu período
  de bloqueio. O `BloqueioVestido` atual passa a ser o **item**, não a reserva.
- **Fechamento** — revisa a sacola, adiciona acessórios (upsell), aplica preço de
  pacote, registra **sinal**, fecha.

**3.3 Estados da reserva** (mínimo viável):
`SACOLA → HOLD(expira) → RESERVADA(sinal) → CONTRATO → RETIRADA → DEVOLVIDA`.
Começar por `SACOLA → RESERVADA → (ciclo já existente)`; HOLD/sinal entram depois.

**3.4 Acessórios como item de acervo** com inventário próprio (mesmo motor de
bloqueio, se peça única) **ou** estoque por quantidade (se múltiplos, ex.: sapato
por tamanho) — decidir por tipo de acessório.

**3.5 Anti-double-booking da reserva** por **sobreposição de período** (espelha o
fix do atendimento, mas por intervalo, não hora exata).

### 3.6 Sequência sugerida (fatias)
1. **Carrinho multi-item de vestidos** — `Reserva` + `ReservaItem`; fechar com
   vários vestidos. (precursora de tudo)
2. **Acessórios** no carrinho + preço de pacote.
3. **Filtro por disponibilidade-na-data** na seleção + favoritos/lista de prova.
4. **Estados HOLD + sinal/depósito.**

---

## 4. Limitações / o que falta verificar
- % de sinal/depósito padrão do mercado (`~30–50%` é estimativa). `[verificar]`
- Taxonomia exata de facetas de moda (Baymard u.a.). `[verificar]`
- Benchmark de softwares reais (POS bridal / formalwear rental / clienteling) —
  **não chegou a ser coletado** (harness interrompido). Reabrir a `deep-research`
  com este mesmo escopo quando houver crédito retoma daqui.

## 5. Próximo passo recomendado
Pegar a **Fatia 1 (carrinho multi-item de vestidos)** no ciclo
`/brainstorming → /writing-plans → /executing-plans`. Decisão-chave da fatia 1:
modelar `Reserva`/`ReservaItem` migrando `BloqueioVestido` para o papel de item
**sem** quebrar o motor de disponibilidade nem as telas atuais de reserva.
