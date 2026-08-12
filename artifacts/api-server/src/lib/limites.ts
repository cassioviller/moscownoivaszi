/**
 * S-O19 — **os limites de tamanho, num lugar só do lado do servidor.**
 *
 * O teto da foto era declarado TRÊS vezes, independentes: `FOTO_MAX_BYTES`
 * (`vestidos.ts:638`), `AVARIA_FOTO_MAX_BYTES` (`reservas.ts:1147`) e o
 * `arquivo.size > 2 * 1024 * 1024` da tela. Três números iguais por
 * coincidência, e o `express.json({ limit })` do `app.ts` derivado deles de
 * cabeça — o comentário de lá conta o que aconteceu quando as duas declarações
 * mentiram: o corpo chegava com **2.000.080 bytes contra um limite de 1 MiB**, e
 * a foto do celular era recusada pelo parser, antes de qualquer guarda.
 *
 * Aqui ficam as do servidor. A da TELA não pode importar este arquivo (pacotes
 * diferentes), então ela tem a sua, nomeada, e a
 * `varredura-limites-de-upload` prega que as duas são o mesmo número — a mesma
 * forma do espelho da trilha de auditoria (S-O1).
 */

/** 2 MiB por foto — de avaria e de vestido, a mesma régua. */
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * O teto do CORPO da requisição, e por que são DOIS números — nenhum igual ao
 * da foto.
 *
 * A foto viaja em base64, que custa 4/3 do binário: 2 MiB viram 2,67 MiB. Os
 * dois cobrem isso; a diferença entre eles é histórica e está no comentário do
 * `app.ts` (V1/E167), que conta o 413 mudo que o parser global de 100 KB dava
 * na foto de avaria antes de a rota rodar uma linha.
 *
 * A folga é de propósito nos dois casos: quem estoura AQUI recebe um erro do
 * PARSER, sem a frase da guarda que sabe explicar o que fazer. O teto que a
 * pessoa lê é o de `FOTO_MAX_BYTES`, e ele tem de morder primeiro.
 */
export const CORPO_MAX_FOTO_VESTIDO = "6mb";
export const CORPO_MAX_AVARIA = "4mb";
