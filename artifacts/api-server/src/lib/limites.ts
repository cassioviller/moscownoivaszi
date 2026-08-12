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
 *
 * **S-O51/E180: os tetos de CORPO viraram um, e ele é conta.** Eram dois
 * literais de MB para a mesma foto; hoje há `CORPO_MAX_FOTO_BYTES`, derivado do
 * teto da foto, e a varredura recusa o literal de volta.
 */

/** 2 MiB por foto — de avaria e de vestido, a mesma régua. */
export const FOTO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * S-O51 — **o teto do CORPO é UM, e é CONTA, não literal.**
 *
 * Eram dois — `CORPO_MAX_FOTO_VESTIDO = "6mb"` e `CORPO_MAX_AVARIA = "4mb"` —,
 * protegendo a MESMA foto de 2 MiB pelas duas portas que a recebem. A diferença
 * era histórica: o da avaria nasceu com a conta escrita (V1/E167), o do vestido
 * é mais velho e nunca teve nenhuma. **Dois números para uma decisão é a marca
 * de que a decisão não foi tomada** — e a varredura do E178 pregava que cada um
 * cabe a foto, porque pregar que são iguais teria ficado vermelho.
 *
 * A conta é a que o E167 escreveu e agora o código executa: a foto viaja em
 * **base64, que custa 4/3 do binário**, então 2 MiB viram **2,67 MiB**, e sobre
 * isso vai **1 MiB de envelope** — o JSON em volta e a folga que faz o excesso
 * chegar. Chegar é o ponto: quem estoura AQUI recebe o **413 mudo do parser**,
 * e quem estoura no `FOTO_MAX_BYTES` recebe o **422 `FOTO_MUITO_GRANDE`, que
 * nomeia o teto e o gesto**. O teto que a pessoa lê tem de morder primeiro.
 *
 * Hoje dá **3.844.779 bytes (3,67 MiB)** — menor que os dois anteriores, e é o
 * primeiro que responde "por quê". Mudar `FOTO_MAX_BYTES` move este junto, que
 * é a única forma de os dois não voltarem a divergir.
 */
export const CORPO_MAX_FOTO_BYTES = Math.ceil((FOTO_MAX_BYTES * 4) / 3) + 1024 * 1024;
