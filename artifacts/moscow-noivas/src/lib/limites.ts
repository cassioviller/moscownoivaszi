/**
 * S-O19 — o teto da foto, do lado da TELA.
 *
 * Ele existe aqui porque a tela não importa o api-server (pacotes diferentes), e
 * a recusa tem de acontecer ANTES do upload: mandar 5 MiB pela rede para o
 * servidor dizer não é a régua do E27 invertida — quem está com o celular na
 * mão, na ficha da reserva, com a peça avariada na frente, não deve esperar a
 * viagem para descobrir.
 *
 * O par com `api-server/src/lib/limites.ts` é pregado pela
 * `limites-de-upload.test.ts`: os dois arquivos, o mesmo número, e a varredura
 * fica vermelha se um mudar sozinho. É a mesma forma do espelho da trilha de
 * auditoria (S-O1) — não dá para compartilhar a constante, então prega-se a
 * igualdade.
 */

/** 2 MiB por foto — a mesma régua do servidor. */
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;

/** A frase da recusa, para as telas não a escreverem de novo cada uma. */
export const FOTO_ACIMA_DO_TETO = "Foto acima de 2MB";

/**
 * S-O81 — **quantos caracteres a descrição da avaria aceita.**
 *
 * O campo não tinha `maxLength` no spec, e o único teto do texto era o do
 * parser: **3,8 MiB de descrição** entravam numa avaria. Quem manda o número é o
 * `AvariaInput` do `openapi.yaml`, que é onde ele foi derivado do
 * `ENVELOPE_MAX_BYTES` da conta do corpo; aqui ele existe pelo mesmo motivo que
 * `FOTO_MAX_BYTES`: a tela não importa o api-zod, e a recusa tem de acontecer
 * ANTES da viagem — o `maxLength` do campo simplesmente não deixa digitar o
 * 1.001º caractere, em vez de o servidor devolver 400 sobre um texto que a
 * pessoa levou dez minutos colando.
 *
 * A `limites-de-upload.test.ts` prega os dois lados contra o SPEC.
 */
export const AVARIA_DESCRICAO_MAX_CHARS = 1000;

/**
 * E214 — **quantos caracteres cabem na razão de uma taxa fora da faixa.**
 *
 * Mesmo raciocínio e mesma conta do vizinho: os dois são texto livre no corpo
 * que carrega a foto, e o `ENVELOPE_MAX_BYTES` de 4.096 tem de comportar os
 * dois. 1.000 × 3 + 300 × 3 + 79 do envelope medido = 3.979, com 117 de folga.
 * Quem manda o número é o `AvariaInput` do `openapi.yaml`; a
 * `limites-de-upload.test.ts` prega os dois lados contra o spec.
 */
export const AVARIA_JUSTIFICATIVA_MAX_CHARS = 300;
