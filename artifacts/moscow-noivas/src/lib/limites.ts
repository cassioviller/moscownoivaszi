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
