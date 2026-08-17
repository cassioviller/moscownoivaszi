import { cnpjFormatado, cnpjValido, cpfFormatado, cpfValido } from "@workspace/financeiro-core";

/**
 * **A recusa de CPF/CNPJ, num molde só para as seis portas** — E233.
 *
 * O CNPJ da loja entra por três (`PATCH /lojas/:id/dados`, `POST /admin/lojas`,
 * `PATCH /admin/lojas/:id`); o CPF da noiva por três (`POST /leads`,
 * `PATCH /leads/:id`, e o `PATCH /contratos/:id`, que grava `cpf` do corpo por
 * `...parsed.data` — a sexta porta, que o plano contava como cinco). Cada uma
 * chama a mesma função, com o mesmo `campos: [{ campo, motivo }]` que as
 * guardas do E218/E222 usam e que a tela sabe destacar.
 *
 * `undefined` é "não mexi" e passa; `null` e string vazia APAGAM e passam
 * (documento é opcional na ficha e no cadastro — o que não pode é entrar
 * ERRADO). Válido, volta NORMALIZADO na grafia única, para a porta gravar o
 * que este módulo devolveu e não o que veio no corpo.
 */
export type RecusaDeDocumento = {
  error: "CPF_INVALIDO" | "CNPJ_INVALIDO";
  detalhe: string;
  campos: { campo: string; motivo: string }[];
};

type Conferido =
  | { recusa: RecusaDeDocumento; valor?: undefined }
  | { recusa: null; valor: string | null | undefined };

function conferir(
  tipo: "CPF" | "CNPJ",
  campo: string,
  valor: string | null | undefined,
): Conferido {
  if (valor === undefined) return { recusa: null, valor: undefined };
  if (valor === null || valor.trim() === "") return { recusa: null, valor: null };
  const valido = tipo === "CPF" ? cpfValido(valor) : cnpjValido(valor);
  if (!valido) {
    return {
      recusa: {
        error: tipo === "CPF" ? "CPF_INVALIDO" : "CNPJ_INVALIDO",
        detalhe:
          // E262 — o número que a pessoa digitou está no campo, do lado, sem
          // aspa nenhuma. A aspa aqui é a mesma que a decisão da dona
          // (S-RM16) tirou do catálogo.
          `${tipo} ${valor.trim()} não é um ${tipo} válido: os dígitos verificadores não fecham. ` +
          `Confira o número antes de gravar — ele sai impresso no contrato. ` +
          `(O sistema confere a aritmética do número, não o cadastro na Receita.)`,
        campos: [{ campo, motivo: `${tipo} com dígitos verificadores errados` }],
      },
    };
  }
  return { recusa: null, valor: tipo === "CPF" ? cpfFormatado(valor) : cnpjFormatado(valor) };
}

export const cpfNaPorta = (valor: string | null | undefined, campo = "cpf") => conferir("CPF", campo, valor);
export const cnpjNaPorta = (valor: string | null | undefined, campo = "cnpj") => conferir("CNPJ", campo, valor);

/**
 * E234 — os campos de texto livre do cadastro da loja: string vazia APAGA
 * (vira `null`), como o telefone já fazia; `undefined` é "não mexi". Sem isto,
 * limpar o campo na tela gravaria `""` e o papel imprimiria uma linha em branco
 * onde deveria imprimir a lacuna do molde.
 */
export function vaziosViramNulo<T extends Record<string, unknown>, K extends keyof T & string>(
  dados: T,
  campos: readonly K[],
): Partial<Record<K, string | null>> {
  const out: Partial<Record<K, string | null>> = {};
  for (const c of campos) {
    const v = dados[c];
    if (v === undefined) continue;
    out[c] = typeof v === "string" && v.trim() === "" ? null : (v as string | null);
  }
  return out;
}
