/**
 * **CPF e CNPJ — os dois números que o instrumento imprime como identidade das
 * partes, conferidos pela aritmética dos dígitos verificadores** — E233.
 *
 * Até aqui os dois entravam como `string` livre (`openapi.yaml`, `Loja*` e
 * `Lead*`), e o único documento inválido do banco inteiro era o CNPJ da loja
 * semeada (`12.345.678/0001-99`), que desde o E220 sai impresso no cabeçalho
 * de todo contrato. Medido em 15/08: 47 de 47 CPFs em `contratos` e 50 de 50
 * em `leads` passam — as pessoas acertaram sem régua; a régua existe para o
 * dia em que não acertarem, e para o papel não sair com um número que a
 * Receita não reconhece.
 *
 * O que ESTE módulo confere é aritmética, não cadastro: `37.771.644/0001-93` e
 * `31.897.111/0001-76` (os dois CNPJs do papel, um deles de OUTRA empresa)
 * passam os dois — e é justamente por isso que a P1 do rastreador é grave. A
 * frase da recusa diz isso: "os dígitos verificadores não fecham", nunca "este
 * CNPJ não existe".
 *
 * Puro de propósito: a API recusa com ele e a tela avisa com ele — a MESMA
 * função, para a tela não copiar a régua e envelhecer sozinha (S-C180).
 */

const soDigitos = (s: string) => s.replace(/\D/g, "");
const todosIguais = (d: string) => /^(\d)\1+$/.test(d);

/** CPF válido pelos dois dígitos verificadores; aceita com ou sem pontuação. */
export function cpfValido(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const d = soDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return (resto === 10 ? 0 : resto) === Number(d[n]);
  };
  return dv(9) && dv(10);
}

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/** CNPJ válido pelos dois dígitos verificadores; aceita com ou sem pontuação. */
export function cnpjValido(valor: string | null | undefined): boolean {
  if (!valor) return false;
  const d = soDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;
  const dv = (pesos: number[]) => {
    let soma = 0;
    for (let i = 0; i < pesos.length; i++) soma += Number(d[i]) * pesos[i]!;
    const resto = soma % 11;
    return (resto < 2 ? 0 : 11 - resto) === Number(d[pesos.length]);
  };
  return dv(PESOS_CNPJ_1) && dv(PESOS_CNPJ_2);
}

/**
 * A grafia ÚNICA que o banco guarda — `000.000.000-00` e `00.000.000/0000-00`.
 * O telefone já pagou a lição da grafia dupla; aqui a porta normaliza antes de
 * gravar, e o papel imprime como está gravado. Só chame depois de validar: um
 * valor inválido volta como veio.
 */
export function cpfFormatado(valor: string): string {
  const d = soDigitos(valor);
  if (d.length !== 11) return valor;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function cnpjFormatado(valor: string): string {
  const d = soDigitos(valor);
  if (d.length !== 14) return valor;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/**
 * O CNPJ de EXEMPLO do seed — válido nos dígitos e reconhecível como exemplo
 * (é o canônico da documentação de CNPJ). O anterior (`12.345.678/0001-99`)
 * não fechava os dígitos e a régua desta porta o recusaria na primeira
 * instalação (`scripts/banco-virgem.ts` semeia pela porta).
 */
export const CNPJ_DE_EXEMPLO = "11.222.333/0001-81";
