import { contratoAtivoDaNoiva, type ContratoDaNoiva } from "./contrato-ativo-da-noiva";

/**
 * **S-C91 — a ficha da noiva mostrava a RESERVA e não mostrava a LOCAÇÃO.**
 *
 * O E222 pôs a régua do expediente na porta (cláusulas 4ª e 5ª) e o E224 pôs o
 * gesto na tela: o contrato passou a saber a que horas a peça sai e a que horas
 * volta. As duas datas ficaram na ficha do CONTRATO — e quem atende o telefone
 * abre a ficha da NOIVA. *"Que dia eu busco o vestido?"* custava abrir o
 * contrato para responder.
 *
 * Esta é a régua de o QUE a ficha mostra, e ela decide três coisas:
 *
 * 1. **A locação é a do contrato ATIVO**, e a escolha do contrato não é feita de
 *    novo aqui: `contratoAtivoDaNoiva` (S-O20/E181) é a régua única, e ela já
 *    sabe que o índice parcial `contratos_lead_ativo_unico` garante um só.
 * 2. **Contrato CANCELADO não empresta data nenhuma.** A peça voltou ao mercado
 *    no cancelamento (E111), e dizer na ficha *"retira 12/05 às 10:30"* de um
 *    contrato desfeito é prometer um vestido que a loja já liberou — o mesmo
 *    raciocínio com que `montarVestidoDaNoiva` corta o bloqueio cancelado.
 * 3. **Campo vazio não vira linha vazia.** Sem NENHUMA das duas datas não há o
 *    que mostrar, e é a esmagadora maioria: medido em `heliumdb` (o banco de
 *    `DATABASE_URL`, **não** o `moscow_base`) em 2026-08-13 — **733 contratos, 1
 *    com retirada, 0 com devolução, 311 ativos**. Uma linha *"Retirada: a
 *    informar"* em 310 das 311 fichas seria moldura, que é o que a régua do
 *    `<Dado>` da própria ficha já recusa.
 *
 * O que a régua NÃO faz é esconder a metade que falta quando a outra existe:
 * contrato com retirada e sem devolução é registro pela metade, e a 10ª cobra
 * multa pelo atraso na devolução que ninguém marcou. Aí a ficha diz que falta.
 */

export interface ContratoComLocacao extends ContratoDaNoiva {
  dataRetirada?: string | null;
  dataDevolucao?: string | null;
}

export interface LocacaoDaNoiva {
  /** De qual contrato saíram as datas — a ficha lista mais de um. */
  contratoId: string;
  /** Instantes ISO, para o relógio da LOJA formatar (`instanteCurto`). */
  retirada: string | null;
  devolucao: string | null;
}

export function locacaoDaNoiva(
  contratos: readonly ContratoComLocacao[] | null | undefined,
): LocacaoDaNoiva | null {
  const contrato = contratoAtivoDaNoiva(contratos);
  if (!contrato) return null;
  const retirada = contrato.dataRetirada ?? null;
  const devolucao = contrato.dataDevolucao ?? null;
  if (!retirada && !devolucao) return null;
  return { contratoId: contrato.id, retirada, devolucao };
}
