import { addDias, diaLocal } from "./datas";

/**
 * **E219 — a troca de traje tem prazo** (cláusula 17ª caput e §1º do
 * instrumento de locação, `docs/revisao/2026-08-13-contrato-de-papel/`).
 *
 * > **17ª** — Não será permitida a troca de trajes e/ou acessórios, **após 07
 * > (sete) dias da data da locação**.
 * >
 * > **§1º** — Não será permitido troca de modelos as **sextas-feiras e aos
 * > sábados**.
 *
 * A porta que esta guarda mora é a do E223 (`POST /contratos/:id/trocar-peca`)
 * — o E219 ficou BLOQUEADO enquanto ela não existia, porque guarda sem porta é
 * régua sem gesto.
 *
 * ## "Da data da locação" — a leitura, DECLARADA
 *
 * O instrumento não define "data da locação". As duas leituras possíveis são o
 * **fecho do contrato** e a **retirada da peça** — e a segunda não se sustenta:
 * a troca de modelo é vedada DEPOIS da retirada por construção (a peça já
 * saiu; o E223 recusa com `TROCA_APOS_RETIRADA`), então contar o prazo de um
 * evento que encerra a troca faria a janela nunca existir. **O sistema conta
 * do fecho (`contratos.fechado_em`)**, a leitura coerente que o plano
 * registrou, e a frase da recusa DIZ a convenção — quem discordar lê de onde o
 * número veio. A pendência P5 do rastreador pede a confirmação da dona.
 *
 * ## O §1º é do DIA DO GESTO, não da data do casamento
 *
 * Sexta e sábado são os dias de retirada e devolução do ateliê — a cláusula
 * protege o balcão nos dias de movimento. O que se veda é TROCAR nesses dias:
 * o dia avaliado é o `hoje` de quem clica, no fuso da loja.
 *
 * `hoje` é INJETADO, como em toda régua desta trilha desde o E211 — a conta é
 * derivada e muda de resposta à meia-noite (e às sextas). A rota o injeta de
 * `relogio.agora()`, que o teste de API consegue fixar.
 */
export const PRAZO_DA_TROCA_DIAS = 7;

/** Dias da semana vedados pelo §1º — 5 = sexta, 6 = sábado. */
const DIAS_VEDADOS = new Set([5, 6]);

const NOME_DO_DIA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

/** O dia da semana de um dia local (YYYY-MM-DD), 0 = domingo … 6 = sábado. */
export function diaDaSemana(dia: string): number {
  // O meio-dia UTC do MESMO dia calendário: `getUTCDay` responde o dia da
  // semana daquela data sem fuso no meio — a string já É o dia local.
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

export type VetoDaTroca = {
  error: "TROCA_FORA_DO_PRAZO" | "TROCA_EM_DIA_VEDADO";
  detalhe: string;
};

/**
 * O veto da 17ª sobre a troca de peça — `null` é "pode trocar".
 *
 * A ordem dos vetos não é estilo: o prazo vem primeiro para a recusa de um
 * contrato velho ser SEMPRE a mesma, caia o clique numa sexta ou numa terça —
 * régua cuja frase muda com o dia da semana em que roda é meia régua.
 */
export function vetoDaTroca17a(params: { fechadoEm: Date | string; hoje: Date | string }): VetoDaTroca | null {
  const fecho = diaLocal(params.fechadoEm);
  const hoje = diaLocal(params.hoje);
  const limite = addDias(fecho, PRAZO_DA_TROCA_DIAS);
  if (hoje > limite) {
    return {
      error: "TROCA_FORA_DO_PRAZO",
      detalhe:
        `A cláusula 17ª não permite troca de traje após ${PRAZO_DA_TROCA_DIAS} dias da locação — ` +
        `este contrato fechou em ${diaBRDe(fecho)} e o prazo terminou em ${diaBRDe(limite)}. ` +
        "O sistema conta do fecho do contrato.",
    };
  }
  const dow = diaDaSemana(hoje);
  if (DIAS_VEDADOS.has(dow)) {
    return {
      error: "TROCA_EM_DIA_VEDADO",
      detalhe:
        `A cláusula 17ª §1º não permite troca de modelos às sextas-feiras e aos sábados — ` +
        `hoje é ${NOME_DO_DIA[dow]}. Registre a troca em outro dia da semana.`,
    };
  }
  return null;
}

function diaBRDe(dia: string): string {
  return dia.split("-").reverse().join("/");
}
