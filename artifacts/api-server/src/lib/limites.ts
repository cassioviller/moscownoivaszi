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
 * S-O62/E186 — **a MINIATURA, que era a quarta declaração da mesma família.**
 *
 * `THUMB_MAX_BYTES = 512 * 1024` morava em `vestidos.ts:641`, literal, **três
 * linhas abaixo do comentário que anuncia a consolidação da S-O19** (*"o teto
 * mora em `lib/limites.ts` — eram três declarações independentes"*). Eram
 * quatro, e a quarta ficou onde estava: é a regra 26 exatamente na forma em que
 * ela morde, porque quem consolida olha o que a sobra nomeou.
 *
 * A tela gera DUAS variantes JPEG do arquivo escolhido (`vestidos/[id]/editar
 * .tsx:66`) — a cheia em ≤1600px e a miniatura em ≤480px — e manda as duas **no
 * mesmo corpo**. Sem este número em mãos, o teto do corpo não tem como ser
 * conta: a maior parte da folga dele é esta miniatura.
 */
export const THUMB_MAX_BYTES = 512 * 1024;

/**
 * Quantos bytes N bytes ocupam em base64.
 *
 * São `4 × ceil(N/3)`, e **não `ceil(N × 4/3)`** — a diferença é o padding, e
 * ela é de 1 byte para 2 MiB (2.796.204 contra 2.796.203). O E180 escreveu a
 * segunda forma; ela não mordeu porque a folga era de 349 KB, e morderia no dia
 * em que a folga passasse a ser a conta. É este dia.
 */
export function base64Bytes(bytes: number): number {
  return 4 * Math.ceil(bytes / 3);
}

/**
 * O envelope JSON em volta das fotos — **medido, não estimado.**
 *
 * `{"base64":"","thumbBase64":""}` tem **30 bytes**; o da avaria,
 * `{"descricao":"","custoReparo":1234.56,"fotoBase64":""}`, tem **54**. Os 4 KiB
 * declarados aqui são para a `descricao` da avaria, que é texto livre sem
 * `maxLength` no spec — os nomes dos campos custam menos de 1% disto.
 */
export const ENVELOPE_MAX_BYTES = 4 * 1024;

/**
 * S-O62 — **o quanto de excesso ainda CHEGA para ouvir o 422.**
 *
 * Sem esta parcela o teto do corpo ficaria colado no que a guarda aceita, e a
 * foto de 2 MiB + 1 KB pararia no **413 mudo do parser** em vez do **422
 * `FOTO_MUITO_GRANDE`, que nomeia o teto e o gesto**. Ela é um oitavo do teto da
 * foto — **256 KiB de binário, 349.528 em base64** —, e o número não foi
 * escolhido: é o que já existia. A folga real de hoje, medida, é de **349.493
 * bytes**, e ela era o resto de um `+ 1 MiB` que o comentário chamava de
 * envelope. **A medição não move o número; ela dá nome a cada parcela dele.**
 */
export const MARGEM_DO_422_BYTES = base64Bytes(FOTO_MAX_BYTES / 8);

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
 * **base64, que custa 4/3 do binário**, então 2 MiB viram **2,67 MiB**. Chegar é
 * o ponto: quem estoura AQUI recebe o **413 mudo do parser**, e quem estoura no
 * `FOTO_MAX_BYTES` recebe o **422 `FOTO_MUITO_GRANDE`, que nomeia o teto e o
 * gesto**. O teto que a pessoa lê tem de morder primeiro.
 *
 * **S-O62/E186: a folga de 1 MiB era a parte da conta que ninguém tinha
 * medido — e ela não é envelope, é a SEGUNDA FOTO.** O E180 fechou o teto com
 * `+ 1 MiB` sob o rótulo de *"o JSON em volta e a folga que faz o excesso
 * chegar"*, escrevendo na sobra que *"1 MiB é seguramente demais para o
 * envelope e seguramente pouco para uma segunda foto"*. Medido: a porta do
 * vestido manda **duas** imagens no mesmo corpo (`base64` + `thumbBase64`), a
 * miniatura vale até `THUMB_MAX_BYTES` = 512 KiB, e em base64 ela sozinha ocupa
 * **699.052 bytes — 67% daquele 1 MiB**. O envelope de verdade tem **30 bytes**.
 *
 * Então a conta passa a ter uma parcela por motivo:
 *
 * | Parcela | Bytes |
 * |---|---|
 * | a foto, em base64 | 2.796.204 |
 * | a MINIATURA, em base64 | 699.052 |
 * | o envelope JSON (a `descricao` livre da avaria) | 4.096 |
 * | a margem que faz o excesso chegar ao 422 | 349.528 |
 * | **total** | **3.848.880 (3,67 MiB)** |
 *
 * **O número quase não se move — 3.844.779 → 3.848.880, +4.101 bytes, 0,1%** — e
 * é esse o resultado da medição: o teto estava certo pelo motivo errado. O que
 * muda é que agora ele SABE da miniatura: subir `THUMB_MAX_BYTES` sozinho
 * deixaria o parser recusando um corpo que a guarda aceita, e hoje ele sobe
 * junto.
 */
export const CORPO_MAX_FOTO_BYTES =
  base64Bytes(FOTO_MAX_BYTES) + base64Bytes(THUMB_MAX_BYTES) + ENVELOPE_MAX_BYTES + MARGEM_DO_422_BYTES;
