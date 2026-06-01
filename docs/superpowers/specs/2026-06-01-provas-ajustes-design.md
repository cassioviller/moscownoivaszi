# Provas & Ajustes — decisão de regra de negócio + modelo

> Registrada em **2026-06-01**. Decisão tomada pelo dono do produto (Cássio).
> Esta fatia: **opção B — núcleo da noiva (provas/ajustes na reserva) + tela global de Ajustes**.

## 1. Decisão de regra de negócio (a registrar antes de codar)

### 1.1 Indisponibilidade do vestido = bloco contínuo, sem buracos

A indisponibilidade de um vestido para uma reserva é **um único bloco contínuo**, sem
buracos no meio. Conceitualmente o bloco se divide em três fases contíguas:

Exemplo — casamento em **30/06/2026**, vestido indisponível de **15/06** a **11/07**:

| Fase | Período (exemplo) | Significado |
|---|---|---|
| 1. Preparação / provas | 15/06 → 27/06 | Reservado para a noiva; pode passar por provas e ajustes. |
| 2. Semana do casamento / uso | 28/06 → 04/07 | Peça separada para o casamento. |
| 3. Higienização | 05/07 → 11/07 | Pós-casamento: a peça volta e é higienizada. |

As três fases são **encostadas** (sem dia livre entre elas). Nenhuma outra noiva pode
provar ou usar a peça dentro desse intervalo.

### 1.2 A prova real **não** abre disponibilidade

A **data real da prova não é um insumo do motor de disponibilidade**. A prova real é um
**registro operacional dentro da Reserva** — serve para registrar que a noiva compareceu,
faltou, remarcou ou realizou uma prova específica.

Quando o vestido começa a ser ajustado para aquela noiva, ele **já está preso à reserva
dela** (o bloco contínuo já a protege). Portanto, registrar uma prova (cedo ou tarde)
**não** move a janela de disponibilidade nem libera a peça para outra noiva.

## 2. Modelo de dados decidido

### Prova — pertence a uma Reserva (`BloqueioVestido` do tipo `RESERVA_CASAMENTO`)

- `data real`
- `tipo`: 1ª prova · intermediária · final
- `comparecimento`: agendada · compareceu · faltou · remarcada
- `observação`
- `responsável`

### Ajuste — pertence a uma Prova

- `descrição`
- `status`: pendente · feito
- `checklist de costura`

## 3. Consequências para o motor atual (`src/lib/disponibilidade/`)

A decisão **encosta no núcleo** — não é só somar tabelas. Dois comportamentos atuais
contrariam a decisão e precisam mudar:

1. **`motor.ts` ancora a prova em `provaDataReal` quando informada** (teste
   `motor.test.ts:52` — "usa provaDataReal no lugar da projeção"). Isso é justamente
   "a prova real mexendo na disponibilidade" — deve sair. A janela passa a ser
   **sempre projetada** a partir de `casamentoData`.

2. **`motor.ts` projeta 3 janelas com um buraco** entre prova-fim e uso-início
   (defaults: prova `[C-14, C-12)`, uso `[C-3, …)` → 9 dias livres). O bloco precisa
   ficar **contínuo**: a fase de preparação/prova vai até o início do uso, sem buraco.

> Distinção a preservar na implementação: **disponibilidade** (bloco contínuo, sem
> buracos) ≠ **agenda** (compromissos discretos: a prova marcada continua um evento
> curto). A Agenda derivada (`agenda.ts`) deve continuar mostrando a prova como
> compromisso pontual, mesmo que a *disponibilidade* a trate como parte do bloco.

O campo `BloqueioVestido.provaDataReal` deixa de alimentar o motor; provas reais passam
a viver na entidade `Prova`. Decidir na fatia se o campo é deprecado/removido.

## 4. Escopo desta fatia

- Registrar provas e ajustes ligados ao perfil da noiva / à reserva.
- Tela **global de Ajustes** para a costureira acompanhar os itens pendentes.
- Ajustar o motor para honrar a decisão (§3).

**Fora de escopo (fast-follow):** transformar toda prova real em evento completo da
Agenda. A integração com a Agenda fica para depois, para evitar duplicação e
complexidade nesta fatia.
