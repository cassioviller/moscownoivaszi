import {
  descricaoDoExpedienteDeRetirada,
  diaLocalYMD,
  expedienteDeRetirada,
  foraDoExpedienteDeRetirada,
  fraseDaRecusaDeRetirada,
  horaLocal,
  LOCACAO_FIM_PADRAO,
  LOCACAO_INICIO_PADRAO,
  minutosParaHHMM,
  proximoDiaDeExpedienteDeRetirada,
  type ExpedienteDeRetirada,
} from "@workspace/agenda-core";
import { addDias } from "@workspace/financeiro-core";

/**
 * **E224 — o gesto da retirada e da devolução.**
 *
 * O E222 pôs a régua das cláusulas 4ª e 5ª nas duas portas que gravam
 * `dataRetirada` e `dataDevolucao`, e mediu o que faltava: **1 de 723 contratos
 * tinha data de retirada, nenhum tinha devolução, e NENHUMA tela citava os dois
 * campos** — só se chegava neles pela API (S-C35). Este módulo é a régua da
 * tela que passou a oferecê-los.
 *
 * > **4ª** — terça a sexta, das **10:30 às 19:00**; sábado, das **10:30 às
 * > 18:00**.
 * > **5ª** — a locação começa às **10:30** do dia da retirada e termina às
 * > **18:00** do dia da devolução.
 *
 * ## As três decisões que este arquivo declara
 *
 * **1. Os dois campos continuam OPCIONAIS.** É a decisão medida do E222, e ela
 * não muda aqui: a 4ª diz a que horas a loja abre, não que toda locação declare
 * a hora. Uma régua que exigisse as datas recusaria o fecho de contrato que
 * sempre funcionou.
 *
 * **2. A HORA vem da 5ª; o DIA vem da janela de uso da reserva.** As constantes
 * `LOCACAO_INICIO_PADRAO`/`LOCACAO_FIM_PADRAO` (10:30/18:00) são importadas do
 * `@workspace/agenda-core`, onde o E222 as deixou — a conta não é reescrita
 * aqui. O dia é outra pergunta, e a resposta não é o dia do casamento: a
 * reserva já segura a peça de `casamento − usoDiasAntes` a `casamento +
 * usoDiasDepois` (`api-server/src/lib/disponibilidade.ts`), e é essa a janela em
 * que a peça pode sair e voltar sem atravessar outra noiva.
 *
 * **3. A sugestão anda até um dia de expediente — para a FRENTE.** Medido no
 * banco de `DATABASE_URL` (`heliumdb`), com a régua de fábrica (uso 3 antes ·
 * 2 depois): das **127 reservas com data de casamento, 67 (53%)** teriam pelo
 * menos uma das duas pontas caindo em domingo ou segunda, que a 4ª fecha — 31 na
 * retirada, 36 na devolução. Uma tela que sugerisse a janela crua entregaria à
 * vendedora um valor que a própria porta do E222 recusa com 422. Andar para a
 * frente é o gesto real: a peça não sai nem volta com a loja fechada, e quem
 * devolve devolve no primeiro dia em que ela abre. Andar para TRÁS na retirada
 * tiraria a peça antes do que a reserva segura, por cima da janela de prova.
 *
 * ## Por que a sugestão pode ser NENHUMA
 *
 * A janela de uso é configuração da loja (`GET /disponibilidade/regras`), e nem
 * todo perfil que fecha contrato tem o módulo `agenda`. Sem a régua carregada
 * esta função devolve `null` e os campos nascem **em branco** — que é
 * exatamente o estado de hoje, e portanto não regride nada. Inventar um "3 dias
 * antes" aqui seria a segunda grafia de `REGRA_PADRAO`, a classe de defeito que
 * o E187 fechou.
 */

/** O formato que o `<input type="datetime-local">` lê e escreve. */
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * `"YYYY-MM-DDTHH:MM"` digitado → o INSTANTE ISO, lido no relógio da LOJA.
 *
 * O `-03:00` é explícito e não é descuido: `new Date("2028-09-02T10:30")` sem
 * fuso vale o relógio de QUEM ABRE o navegador, e a hora é justamente o que a
 * 4ª decide. É a mesma âncora de `diaParaISO` em `lib/formatos.ts`, e a mesma
 * premissa de sempre (São Paulo é -03:00 fixo desde 2019).
 */
export function localParaISO(valor: string | null | undefined): string | null {
  if (!valor || !LOCAL.test(valor)) return null;
  const d = new Date(`${valor}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** O INSTANTE → `"YYYY-MM-DDTHH:MM"` no relógio da loja, para o input ler. */
export function isoParaLocal(instante: string | Date | null | undefined): string {
  if (instante === null || instante === undefined) return "";
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return "";
  const { hora, minuto } = horaLocal(d);
  return `${diaLocalYMD(d)}T${minutosParaHHMM(hora * 60 + minuto)}`;
}

/** A régua da loja, no formato que a tela recebe do `GET /disponibilidade/regras`. */
export type RegraDaLocacao = {
  usoDiasAntes?: number | null;
  usoDiasDepois?: number | null;
  retiradaDias?: number[] | null;
  retiradaAberturaMinutos?: number | null;
  retiradaFechamentoMinutos?: number | null;
  retiradaFechamentoSabadoMinutos?: number | null;
} | null | undefined;

export type SugestaoDaLocacao = {
  /** `"YYYY-MM-DDTHH:MM"` — pronto para o input. */
  retirada: string;
  devolucao: string;
  /**
   * Dito só quando alguma das duas pontas teve de andar por dia fechado. O
   * silêncio é a resposta certa no caso comum: aviso que aparece sempre não é
   * lido por ninguém.
   */
  aviso: string | null;
};

const ddmmaaaa = (ymd: string) => ymd.split("-").reverse().join("/");

/**
 * A sugestão da 5ª para um casamento, ou `null` quando não há o que sugerir.
 *
 * `casamentoDia` é o dia civil `YYYY-MM-DD` que o formulário mostra — nunca um
 * instante, porque `casamentoData` é data de NEGÓCIO (S-O117).
 */
export function sugestaoDaLocacao(
  casamentoDia: string | null | undefined,
  regra: RegraDaLocacao,
): SugestaoDaLocacao | null {
  if (!casamentoDia || !/^\d{4}-\d{2}-\d{2}$/.test(casamentoDia)) return null;
  const antes = regra?.usoDiasAntes;
  const depois = regra?.usoDiasDepois;
  // Sem a régua da loja não há janela, e sem janela não há dia a sugerir.
  if (antes === null || antes === undefined || depois === null || depois === undefined) return null;

  const exp = expedienteDeRetirada(regra);
  const inicioDaJanela = addDias(casamentoDia, -antes);
  const fimDaJanela = addDias(casamentoDia, depois);
  const diaRetirada = proximoDiaDeExpedienteDeRetirada(inicioDaJanela, exp);
  const diaDevolucao = proximoDiaDeExpedienteDeRetirada(fimDaJanela, exp);
  // Semana inteira fechada: a loja não retira em dia nenhum, e sugerir seria
  // entregar um 422. O campo em branco diz a verdade.
  if (!diaRetirada || !diaDevolucao) return null;

  const andou = diaRetirada !== inicioDaJanela || diaDevolucao !== fimDaJanela;
  return {
    retirada: `${diaRetirada}T${minutosParaHHMM(LOCACAO_INICIO_PADRAO)}`,
    devolucao: `${diaDevolucao}T${minutosParaHHMM(LOCACAO_FIM_PADRAO)}`,
    aviso: andou
      ? `A reserva segura a peça de ${ddmmaaaa(inicioDaJanela)} a ${ddmmaaaa(fimDaJanela)}, e a loja ` +
        `não abre em todos esses dias — sugerimos retirada em ${ddmmaaaa(diaRetirada)} e devolução em ` +
        `${ddmmaaaa(diaDevolucao)}. A loja retira e devolve ${descricaoDoExpedienteDeRetirada(exp)} ` +
        `(cláusula 4ª).`
      : null,
  };
}

/**
 * A recusa da 4ª para o que está digitado, **antes do clique** — ou `null`.
 *
 * A porta continua sendo a autoridade: isto é o mesmo motor
 * (`foraDoExpedienteDeRetirada`) e a mesma frase (`fraseDaRecusaDeRetirada`) que
 * o servidor usa, só que a vendedora a lê enquanto a conversa está aberta. É o
 * molde do E211 — o preço antes do clique.
 */
export function recusaDoExpediente(valorLocal: string | null | undefined, regra: RegraDaLocacao): string | null {
  const iso = localParaISO(valorLocal);
  if (!iso) return null;
  const exp = expedienteDeRetirada(regra);
  const fora = foraDoExpedienteDeRetirada(iso, exp);
  return fora ? fraseDaRecusaDeRetirada(fora, exp) : null;
}

/** O expediente por extenso, para a tela dizer o que a loja faz sem ninguém errar. */
export function expedienteEmFrase(regra: RegraDaLocacao): string {
  return descricaoDoExpedienteDeRetirada(expedienteDeRetirada(regra));
}

export type { ExpedienteDeRetirada };
