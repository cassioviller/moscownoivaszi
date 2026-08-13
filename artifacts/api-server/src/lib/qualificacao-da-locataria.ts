/**
 * E215 — a qualificação da locatária: quem assina o instrumento de locação.
 *
 * O contrato de papel abre qualificando as duas partes. A LOCADORA está no
 * cadastro da loja; a LOCATÁRIA não estava em lugar nenhum — a ficha da noiva
 * tinha nome, WhatsApp e a data do casamento, e **nenhum dado civil**. O
 * sistema imprimia um contrato com os campos em branco e a vendedora
 * preenchia à mão.
 *
 * ## Por que este arquivo existe, em vez de três listas
 *
 * A mesma lista de campos é precisa em três lugares — a guarda que recusa o
 * fecho, o snapshot que congela a cópia e o expurgo da LGPD que a apaga. Três
 * cópias curadas à mão é a **S-C33**, que custou dois épicos seguidos com a
 * varredura acusando código certo, e é a **S-C55** ao lado. Aqui a lista é uma
 * só, e quem quiser uma quarta leitura deriva dela.
 *
 * ## Por que a régua é da PORTA e não da coluna
 *
 * As colunas são anuláveis. A dona decidiu (13/08/2026) que os campos são
 * obrigatórios **no fecho do contrato**, e não no cadastro: a noiva vira ficha
 * quando liga perguntando preço, muito antes de virar contrato. `NOT NULL`
 * puniria os 1413 leads que já existem e travaria o balcão.
 *
 * O CPF é a prova de que isso importa. Ele já existia — em `contratos` —, a
 * tela de fechar contrato já o oferecia, e era **opcional**: medido em
 * 13/08/2026, **0 de 735 contratos tinham CPF**. Campo que dá para pular é
 * campo vazio; acrescentar onze opcionais teria produzido onze colunas vazias.
 */
import type { Lead } from "@workspace/db";

/**
 * Os treze campos da qualificação, na ordem em que o papel os pede.
 *
 * `enderecoComplemento` é o único **opcional**, e não por indulgência: "apto
 * 42" não existe em casa térrea, e exigi-lo obrigaria a vendedora a inventar
 * um valor — que é como um campo obrigatório vira "-" em 100% das linhas.
 */
export const CAMPOS_DA_QUALIFICACAO = [
  { campo: "cpf", rotulo: "CPF", obrigatorio: true },
  { campo: "rg", rotulo: "RG", obrigatorio: true },
  { campo: "estadoCivil", rotulo: "Estado civil", obrigatorio: true },
  { campo: "profissao", rotulo: "Profissão", obrigatorio: true },
  { campo: "nascimento", rotulo: "Data de nascimento", obrigatorio: true },
  { campo: "email", rotulo: "E-mail", obrigatorio: true },
  { campo: "enderecoLogradouro", rotulo: "Logradouro", obrigatorio: true },
  { campo: "enderecoNumero", rotulo: "Número", obrigatorio: true },
  { campo: "enderecoComplemento", rotulo: "Complemento", obrigatorio: false },
  { campo: "enderecoBairro", rotulo: "Bairro", obrigatorio: true },
  { campo: "enderecoCep", rotulo: "CEP", obrigatorio: true },
  { campo: "enderecoCidade", rotulo: "Cidade", obrigatorio: true },
  { campo: "enderecoEstado", rotulo: "Estado", obrigatorio: true },
] as const;

export type CampoDaQualificacao = (typeof CAMPOS_DA_QUALIFICACAO)[number]["campo"];

/** Só os nomes — é o que o expurgo da LGPD e as varreduras consomem. */
export const NOMES_DA_QUALIFICACAO: readonly CampoDaQualificacao[] =
  CAMPOS_DA_QUALIFICACAO.map((c) => c.campo);

/**
 * O recorte de `leads` que a porta do contrato precisa ler. Existe para o
 * `select` do handler não repetir a lista — repetir é como o CPF ficou sozinho.
 */
export type QualificacaoDaFicha = Pick<Lead, CampoDaQualificacao>;

/**
 * Vazio é ausente. String em branco não é preenchimento — a vendedora que
 * aperta espaço para passar do campo não qualificou ninguém, e o papel sairia
 * com uma linha vazia onde vai o RG.
 */
function faltando(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return valor.trim() === "";
  return false;
}

/**
 * Os campos obrigatórios que a ficha ainda não tem, no molde
 * `campos: [{ campo, motivo }]` que as guardas do E218 e do E222 já usam — e
 * que a tela sabe destacar campo a campo.
 *
 * Devolve a lista INTEIRA, não o primeiro: quem está fechando contrato com a
 * noiva na frente precisa saber tudo o que falta de uma vez, senão a correção
 * vira doze idas e voltas. É a lição do E214 sobre a régua que não vira parede.
 */
export function faltasDaQualificacao(
  ficha: Partial<QualificacaoDaFicha>,
): { campo: string; motivo: string }[] {
  return CAMPOS_DA_QUALIFICACAO
    .filter((c) => c.obrigatorio && faltando(ficha[c.campo]))
    .map((c) => ({
      campo: c.campo,
      motivo: `${c.rotulo} não está na ficha da noiva`,
    }));
}

/**
 * A cópia que o contrato CONGELA no fecho.
 *
 * A ficha continua viva — a noiva muda de endereço, casa, troca de profissão —
 * e o papel tem de poder ser reimpresso anos depois dizendo o que dizia no dia
 * da assinatura. É a mesma razão de `vestidoDescricao` e do par
 * `descontoTipo`/`descontoValor`, que já eram congelados.
 */
export function congelarQualificacao(
  ficha: QualificacaoDaFicha,
): QualificacaoDaFicha {
  return {
    cpf: ficha.cpf,
    rg: ficha.rg,
    estadoCivil: ficha.estadoCivil,
    profissao: ficha.profissao,
    nascimento: ficha.nascimento,
    email: ficha.email,
    enderecoLogradouro: ficha.enderecoLogradouro,
    enderecoNumero: ficha.enderecoNumero,
    enderecoComplemento: ficha.enderecoComplemento,
    enderecoBairro: ficha.enderecoBairro,
    enderecoCep: ficha.enderecoCep,
    enderecoCidade: ficha.enderecoCidade,
    enderecoEstado: ficha.enderecoEstado,
  };
}
