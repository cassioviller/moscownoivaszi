# Motor de Disponibilidade — Manutenção em aberto + fail-safe (achados #1/#2 do code-review)

**Data:** 2026-05-27
**Origem:** `/code-review high b60f1a3..HEAD` sobre o Motor de Disponibilidade (Plano B).
**Escopo efetivo:** achados #1 e #2 do review. O #3 foi **dispensado** (ver §6).
**Tipo:** correção/endurecimento de um módulo puro já existente (`src/lib/disponibilidade/`).

## 1. Problema

O code-review apontou três achados. Após o brainstorming, dois entram no escopo:

- **#1 — Manutenção em aberto não é representável.** `calcularJanelas`, no branch `manutencao`, exige `retiradaDataReal` **e** `devolucaoDataReal`; falta qualquer uma → lança. Um vestido hoje no costureiro **sem data de volta definida** (estado real: "mandei pro conserto, não sei quando volta") não tem como ser registrado. Pior: como `vestidoDisponivel` chama `calcularJanelas` para cada bloqueio existente, esse `throw` derruba **toda** a consulta de disponibilidade do vestido em vez de bloquear o período.

- **#2 — Um único bloqueio malformado derruba a consulta inteira.** `vestidoDisponivel` propaga qualquer exceção de `calcularJanelas` vinda de um `bloqueioExistente`. Um dado ruim no banco torna o vestido impossível de avaliar até alguém corrigir a linha.

A causa raiz do #1 é uma **assimetria**: o branch `reserva_casamento` já trata "retirou e não devolveu" com a sentinela `FUTURO_DISTANTE` (Plano B, decisão #1 / Grill 2 — segurar um vestido único que não voltou é mais barato que liberá-lo cedo), mas o branch `manutencao` não recebeu o mesmo tratamento.

## 2. Decisão de negócio (que orienta o design)

Não está confirmado com o cliente se a manutenção **sempre** tem data de volta no momento da criação. A escolha de design é a que **não fecha porta**: tornar a manutenção em aberto representável é simétrico ao Grill 2 e não impede que, no futuro, o CRUD passe a exigir a data de devolução. Se o cliente confirmar "sempre tem data", a borda (plano futuro) pode endurecer; o motor, porém, nunca quebra por um estado que o negócio talvez precise.

## 3. Abordagem escolhida: Simetria + fail-safe conservador

Tudo dentro do motor puro (`src/lib/disponibilidade/`), sem depender de CRUD/validação de borda (que são planos futuros e hoje não têm chamador).

### 3.1 #1 — Manutenção em aberto (simetria com o Grill 2)

`calcularJanelas`, branch `manutencao`, passa a tratar três casos:

| `retiradaDataReal` | `devolucaoDataReal` | Janela resultante |
|---|---|---|
| ✓ | ✓ | `[retirada, devolução)` — inalterado |
| ✓ | `null` | `[retirada, FUTURO_DISTANTE)` — **novo**: bloqueia até a devolução real ser registrada |
| `null` | qualquer | **lança** (`exige retiradaDataReal`) — sem âncora de início não há manutenção |

Coerente com `pendenteDevolucao(bloqueio)`, que já hoje retorna `true` para "retirada sem devolução" independentemente do `tipo` — manutenção em aberto também é "pendente de devolução".

A janela continua passando por `validarJanela` (invariante `inicio <= fim`); como `retirada <= FUTURO_DISTANTE` sempre, o caso aberto nunca inverte.

### 3.2 #2 — `vestidoDisponivel` fail-safe (nunca silencia, nunca libera por erro)

Cada `calcularJanelas(bloqueioExistente)` entra num `try/catch`. Um bloqueio que **não** projeta:
- **não** é pulado em silêncio — isso violaria a decisão #6 do Plano B (janela "sumida" libera o vestido indevidamente, o erro mais caro);
- é registrado em `errosBloqueio`;
- e força o veredito a **indisponível** (fail-safe conservador: na dúvida, segura o vestido).

```ts
disponivel = conflitos.length === 0 && errosBloqueio.length === 0
```

O `calcularJanelas` do **candidato** fica **fora** do `try`: uma `casamentoDataCandidata` inválida é erro de uso do chamador (input, não dado armazenado) e deve continuar lançando.

Efeito colateral positivo: o caso de janela invertida por dados inconsistentes (ex.: devolução anterior ao início do uso) deixa de derrubar a consulta — vira `errosBloqueio` + vestido bloqueado, sem crash.

## 4. Mudanças de tipo

Em `tipos.ts`:

```ts
export interface ErroBloqueio {
  bloqueioId: string;
  motivo: string;          // mensagem do erro lançado por calcularJanelas
}

export interface Veredito {
  disponivel: boolean;
  conflitos: Conflito[];
  errosBloqueio: ErroBloqueio[];   // novo; SEMPRE presente ([] quando não há)
}
```

`index.ts` passa a reexportar o tipo `ErroBloqueio`.

A forma do `Veredito` muda (campo novo, sempre presente). **Não há consumidor externo** do motor hoje (verificado: a única referência fora de `src/lib/disponibilidade/` é `src/lib/__tests__/seed.test.ts`, não relacionada). Logo, nada quebra fora dos próprios testes do motor.

## 5. Testes (`src/lib/disponibilidade/__tests__/motor.test.ts`)

**Comportamento removido — sinalizado explicitamente:**
- O teste *"lança se faltar uma das datas reais da manutenção"* (m2: retirada ✓, devolução `null`) **muda**: passa a esperar uma única janela `manutencao` `[retirada, FUTURO_DISTANTE)` em vez de `throw`.

**Testes novos:**
- Manutenção **sem `retiradaDataReal`** ainda lança (`/manuten|retirada/i`).
- Manutenção em aberto **bloqueia** uma data candidata futura via `vestidoDisponivel` (análogo ao caso e5 das reservas pendentes).
- #2: `bloqueiosExistentes` contendo um bloqueio que lança (ex.: manutenção sem retirada, ou reserva sem `casamentoData`) → `disponivel: false`, `errosBloqueio` com 1 item apontando o `bloqueioId`, **sem** exceção propagada; e um bloqueio malformado **não** libera o vestido.
- #2 (candidato): `casamentoDataCandidata` inválida → `vestidoDisponivel` **lança** (não vira `errosBloqueio`).

**Ajuste:** asserções existentes que comparam o `Veredito` inteiro via `toEqual` ganham `errosBloqueio: []`. As que checam `r.disponivel` / `r.conflitos` isoladamente seguem válidas sem mudança.

## 6. Fora de escopo

- **Achado #3 — dispensado.** O review tratou "devolução registrada sem retirada" como estado impossível, mas o teste commitado `b3` o codifica de propósito: em `reserva_casamento`, `devolucaoDataReal` preenchida com `retiradaDataReal` `null` é **válido** — `uso.inicio` cai na projeção (`casamento − usoDiasAntes`), conforme a spec da Base §7.2 (cada data real sobrescreve sua âncora de forma independente). O único resíduo (devolução anterior ao início projetado → janela invertida) já é tratado pela guarda #6 (deve lançar) e agora é absorvido com elegância pelo fail-safe do #2 (vira `errosBloqueio`, sem crash). Adicionar uma guarda dura quebraria o `b3` e removeria comportamento intencional.
- **Validação na borda / CRUD** (plano futuro, sem chamador hoje).
- **`bufferDias`** (respiro entre noivas) — segue como item de plano futuro, nunca um `<=` escondido.

## 7. Docs a atualizar junto

- **Plano B** (`docs/superpowers/plans/2026-05-27-base-plano-b-motor-disponibilidade.md`):
  - Decisão #2 (manutenção): acrescentar o caso "manutenção em aberto = `[retirada, FUTURO_DISTANTE)`".
  - Decisão #5 (datas obrigatórias): manutenção exige **só** `retiradaDataReal`; `devolucaoDataReal` é opcional (ausente = em aberto).
- **`docs/workflow-skills.md`:** após o verde, registrar que o critério "code-review sem achados de correção abertos" foi atendido para esta fatia.

## 8. Critério de sucesso

1. Suíte cheia verde (`vitest`) + `tsc` limpo.
2. Manutenção em aberto (`retirada` ✓, `devolução` `null`) bloqueia datas candidatas futuras.
3. Um `bloqueioExistente` malformado nunca derruba `vestidoDisponivel` nem libera o vestido — fica indisponível e o erro é reportado em `errosBloqueio`.
4. Nenhuma regressão nos cenários do spec §10 já cobertos.
