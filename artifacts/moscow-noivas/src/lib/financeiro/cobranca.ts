import type { Parcela } from "@workspace/api-client-react";
import { estaAberta, saldoAberto } from "@workspace/financeiro-core";
import { centavos, reais } from "./dinheiro";
import { diaDeNegocio, diasEntre, hojeLocal } from "./datas";
import { instanteCurto } from "../formatos";

/**
 * Cobrança/inadimplência: aging por faixa de atraso, agrupado por noiva.
 * `vencimento` é data de negócio; o atraso conta em dias-calendário contra
 * hoje no fuso da loja (não em horas — uma parcela não vence "às 14h").
 */

export type Faixa = "ate30" | "d31a60" | "mais60";

export const ROTULO_FAIXA: Record<Faixa, string> = {
  ate30: "Até 30 dias",
  d31a60: "31 a 60 dias",
  mais60: "Mais de 60 dias",
};

/** Classifica dias de atraso (≥1) em faixa. Vencendo hoje (0) não é atraso. */
export function faixaDeAtraso(diasDeAtraso: number): Faixa {
  if (diasDeAtraso <= 30) return "ate30";
  if (diasDeAtraso <= 60) return "d31a60";
  return "mais60";
}

// O deep-link wa.me virou módulo neutro quando a agenda passou a usá-lo (E8);
// re-export mantém os consumidores do financeiro sem mexer. `msgCobranca` (E29)
// mora lá pelo mesmo motivo — ao lado da mensagem de confirmação da agenda.
export { linkWhatsApp, msgCobranca, type Cobranca } from "../whatsapp";

// ── Registro de contato (o histórico por noiva) ──

export const CANAIS = ["WHATSAPP", "TELEFONE", "PRESENCIAL", "OUTRO"] as const;
export type Canal = (typeof CANAIS)[number];

export const ROTULO_CANAL: Record<Canal, string> = {
  WHATSAPP: "WhatsApp",
  TELEFONE: "Telefone",
  PRESENCIAL: "Presencial",
  OUTRO: "Outro",
};

/**
 * `data` do registro é um INSTANTE — o momento em que se falou com a noiva.
 * A hora importa aqui ("liguei hoje de manhã"), então mostramos dia E hora no
 * fuso da loja; lido em UTC, um contato das 21h apareceria no dia seguinte.
 *
 * S30: havia aqui um `Intl.DateTimeFormat` opção a opção idêntico ao de
 * `instanteCurto` — a régua responde "28/07/2026, 14:30" e só a vírgula vira
 * "às", que é voz desta tela, não formato.
 */
export function rotuloContato(instante: Date | string): string {
  return instanteCurto(instante).replace(", ", " às ");
}

export type NoivaInadimplente = {
  leadId: string;
  noivaNome: string | null;
  whatsapp: string | null;
  contratoId: string;
  /** O que a noiva deve HOJE — com a multa e os juros da 9ª (E213). */
  totalVencido: number;
  /**
   * S-C34 — quanto de `totalVencido` é multa e juros da cláusula 9ª, em reais.
   *
   * Somado em centavos junto com o total, na mesma passada: a mensagem de
   * cobrança precisa NOMEAR o acréscimo (a noiva confere o carnê e vê o
   * principal), e derivá-lo lá por subtração seria a segunda grafia de uma
   * conta que já existe. Zero quando não há mora, ou quando ela foi perdoada.
   */
  acrescimoVencido: number;
  qtdParcelas: number;
  diasMaisAntigo: number;
  faixaMaisAntiga: Faixa;
  /**
   * F28/E98 — a parcela que a linha recebe.
   *
   * A linha é por NOIVA e agrega N parcelas vencidas, então "Receber" nela
   * precisa dizer qual. É a **mais antiga**: é por ela que a fila se ordena, é
   * ela que define a faixa e os dias mostrados na própria linha, e é ela que a
   * mensagem de cobrança cita ("desde N dias"). Receber qualquer outra primeiro
   * deixaria a linha dizendo um atraso que não é o que acabou de ser pago.
   *
   * Empate de vencimento se desfaz pelo id — sem isso a escolha dependeria da
   * ordem em que o servidor devolveu as parcelas, e a mesma tela ofereceria
   * parcelas diferentes entre dois carregamentos.
   */
  parcelaMaisAntigaId: string;
  /**
   * S-D13 — o instante do contato mais recente com a noiva (qualquer canal),
   * vindo do agregado que a parcela embute. É a metade persistente da marca
   * de "cobrada hoje": a sessão de tela sabe o que ELA registrou; isto sabe o
   * que sobreviveu ao F5.
   */
  ultimoContatoEm: string | null;
};
export type FaixaResumo = { total: number; qtdNoivas: number };
export type Aging = {
  faixas: Record<Faixa, FaixaResumo>;
  /** Mais atrasada primeiro — a fila de quem ligar antes. */
  noivas: NoivaInadimplente[];
};

/** Dados que a parcela precisa carregar para virar linha de cobrança. */
export type ParcelaComNoiva = Parcela & {
  contrato?: {
    leadId?: string;
    lead?: {
      noivaNome?: string;
      whatsapp?: string | null;
      ultimoContatoEm?: string | Date | null;
    } | null;
  } | null;
};

/** Parcelas ABERTAS já vencidas, por faixa de atraso e por noiva. */
export function agingDeParcelas(
  parcelas: readonly ParcelaComNoiva[],
  hoje: string = hojeLocal(),
): Aging {
  const faixaTotC: Record<Faixa, number> = { ate30: 0, d31a60: 0, mais60: 0 };
  const faixaNoivas: Record<Faixa, Set<string>> = { ate30: new Set(), d31a60: new Set(), mais60: new Set() };
  const porNoiva = new Map<
    string,
    {
      noivaNome: string | null;
      whatsapp: string | null;
      contratoId: string;
      totalC: number;
      acrescimoC: number;
      qtd: number;
      vencMaisAntigo: string;
      parcelaMaisAntigaId: string;
      ultimoContatoEm: string | null;
    }
  >();

  for (const p of parcelas) {
    // Aberta é PREVISTA ou PARCIAL (E49): quem pagou metade continua devendo a
    // outra metade, e sumir da fila seria perdoar a diferença em silêncio.
    if (!estaAberta(p)) continue;
    const venc = diaDeNegocio(p.vencimento);
    const dias = diasEntre(venc, hoje);
    if (dias < 1) continue; // vence hoje ou no futuro: não é atraso

    const leadId = p.contrato?.leadId;
    if (!leadId) continue; // sem noiva não há quem cobrar
    const f = faixaDeAtraso(dias);
    /**
     * O que FALTA, não o previsto: cobrar de novo o que já foi pago é o erro
     * que a noiva percebe primeiro.
     *
     * **E213 — e o que falta inclui a multa e os juros da cláusula 9ª.** O
     * total desta fila é o que a vendedora vai dizer à noiva no WhatsApp
     * (`msgCobranca` o imprime), e o portal da noiva já mostra o valor com
     * acréscimo desde este épico: cobrar o principal aqui e o total lá seriam
     * duas verdades para a mesma dívida, com a noiva lendo a maior.
     *
     * A conta vem do SERVIDOR (`p.mora`), calculada pelo `financeiro-core` — a
     * tela não a refaz. É a lição do E187, que achou cinco grafias da mesma
     * conta de desconto, três acertando por cópia e duas errando.
     */
    const moraViva = p.mora && !p.mora.perdoada ? p.mora : null;
    const valorC = centavos(moraViva ? moraViva.total : saldoAberto(p));
    // S-C34 — a metade que é multa e juros anda junto com o total, e é o que
    // deixa a mensagem de cobrança dizer de onde veio a diferença.
    const acrescimoC = moraViva ? centavos(moraViva.acrescimo) : 0;
    faixaTotC[f] += valorC;
    faixaNoivas[f].add(leadId);

    let n = porNoiva.get(leadId);
    if (!n) {
      const contato = p.contrato?.lead?.ultimoContatoEm;
      n = {
        noivaNome: p.contrato?.lead?.noivaNome ?? null,
        whatsapp: p.contrato?.lead?.whatsapp ?? null,
        contratoId: p.contratoId,
        totalC: 0,
        acrescimoC: 0,
        qtd: 0,
        vencMaisAntigo: venc,
        parcelaMaisAntigaId: p.id,
        ultimoContatoEm: contato ? new Date(contato).toISOString() : null,
      };
      porNoiva.set(leadId, n);
    }
    n.totalC += valorC;
    n.acrescimoC += acrescimoC;
    n.qtd += 1;
    // Empate de vencimento desempata pelo id: sem isso a parcela oferecida
    // dependeria da ordem em que o servidor devolveu a lista.
    if (venc < n.vencMaisAntigo || (venc === n.vencMaisAntigo && p.id < n.parcelaMaisAntigaId)) {
      n.vencMaisAntigo = venc;
      n.parcelaMaisAntigaId = p.id;
    }
  }

  const noivas: NoivaInadimplente[] = [...porNoiva.entries()]
    .map(([leadId, n]) => {
      const diasMaisAntigo = diasEntre(n.vencMaisAntigo, hoje);
      return {
        leadId,
        noivaNome: n.noivaNome,
        whatsapp: n.whatsapp,
        contratoId: n.contratoId,
        totalVencido: reais(n.totalC),
        acrescimoVencido: reais(n.acrescimoC),
        qtdParcelas: n.qtd,
        diasMaisAntigo,
        faixaMaisAntiga: faixaDeAtraso(diasMaisAntigo),
        parcelaMaisAntigaId: n.parcelaMaisAntigaId,
        ultimoContatoEm: n.ultimoContatoEm,
      };
    })
    .sort((a, b) => b.diasMaisAntigo - a.diasMaisAntigo);

  const resumo = (f: Faixa): FaixaResumo => ({ total: reais(faixaTotC[f]), qtdNoivas: faixaNoivas[f].size });
  return {
    faixas: { ate30: resumo("ate30"), d31a60: resumo("d31a60"), mais60: resumo("mais60") },
    noivas,
  };
}
