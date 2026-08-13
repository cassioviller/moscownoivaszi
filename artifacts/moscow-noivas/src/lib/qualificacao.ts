/**
 * E215 — a qualificação da locatária, do lado do cliente.
 *
 * O contrato de papel abre qualificando quem assina, e a ficha da noiva não
 * guardava um dado civil. Três telas precisam da mesma resposta — *o que falta
 * para o contrato poder fechar?* —, e sem este módulo elas seriam três cópias:
 * a ficha (que mostra), a edição (que coleta) e o fecho do orçamento (que
 * avisa antes do 422).
 *
 * A lista espelha `api-server/src/lib/qualificacao-da-locataria.ts`, e a régua
 * `qualificacao-espelha-servidor.test.ts` prega uma contra a outra lendo o
 * fonte do servidor. Duas cópias entre pacotes que não se importam são
 * inevitáveis; duas cópias soltas não são — foi o que a S-C33 e a S-C55
 * custaram.
 */

/**
 * Os campos que o `POST /contratos` exige, na ORDEM do papel — que é a mesma
 * em que a recusa do 422 os lista, para a tela destacar na sequência do erro.
 *
 * `enderecoComplemento` fica de fora porque é o único opcional no servidor
 * também: casa térrea não tem apto 42, e exigi-lo produziria "-" em toda ficha.
 */
export const CAMPOS_EXIGIDOS_NO_CONTRATO = [
  "cpf",
  "rg",
  "estadoCivil",
  "profissao",
  "nascimento",
  "email",
  "enderecoLogradouro",
  "enderecoNumero",
  "enderecoBairro",
  "enderecoCep",
  "enderecoCidade",
  "enderecoEstado",
] as const;

export type CampoExigido = (typeof CAMPOS_EXIGIDOS_NO_CONTRATO)[number];

/** O nome de cada campo em português, para a tela dizer o que falta. */
export const ROTULO_DA_QUALIFICACAO: Record<CampoExigido, string> = {
  cpf: "CPF",
  rg: "RG",
  estadoCivil: "estado civil",
  profissao: "profissão",
  nascimento: "data de nascimento",
  email: "e-mail",
  enderecoLogradouro: "logradouro",
  enderecoNumero: "número",
  enderecoBairro: "bairro",
  enderecoCep: "CEP",
  enderecoCidade: "cidade",
  enderecoEstado: "estado",
};

const ESTADO_CIVIL_LABELS: Record<string, string> = {
  SOLTEIRA: "Solteira",
  CASADA: "Casada",
  DIVORCIADA: "Divorciada",
  VIUVA: "Viúva",
  SEPARADA: "Separada",
  UNIAO_ESTAVEL: "União estável",
};

export function estadoCivilLabel(valor: string): string {
  return ESTADO_CIVIL_LABELS[valor] ?? valor;
}

/** O recorte de `Lead` que este módulo lê — nada além da qualificação. */
type FichaParcial = Partial<Record<CampoExigido | "enderecoComplemento", unknown>>;

/**
 * Vazio é ausente, e string em branco é vazio — a mesma régua do servidor
 * (`faltando` em `qualificacao-da-locataria.ts`). Sem isso a tela diria
 * "preenchido" sobre um campo com um espaço, e a porta recusaria mesmo assim.
 */
function faltando(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return valor.trim() === "";
  return false;
}

/**
 * Os rótulos do que falta para o contrato poder fechar. Lista vazia = a ficha
 * qualifica.
 */
export function faltasDaQualificacao(ficha: FichaParcial | null | undefined): string[] {
  if (!ficha) return [];
  return CAMPOS_EXIGIDOS_NO_CONTRATO.filter((campo) => faltando(ficha[campo])).map(
    (campo) => ROTULO_DA_QUALIFICACAO[campo],
  );
}

/**
 * O endereço numa linha, como o papel o imprime.
 *
 * Devolve `null` quando não há logradouro: sem ele, "— 123, Centro" seria uma
 * linha que não é endereço nenhum, e o `<Dado>` da ficha some com o vazio em
 * vez de desenhar rótulo órfão.
 */
export function enderecoDaNoiva(ficha: FichaParcial | null | undefined): string | null {
  if (!ficha || faltando(ficha.enderecoLogradouro)) return null;
  const numero = faltando(ficha.enderecoNumero) ? "s/n" : String(ficha.enderecoNumero);
  const complemento = faltando(ficha.enderecoComplemento)
    ? ""
    : `, ${String(ficha.enderecoComplemento)}`;
  const bairro = faltando(ficha.enderecoBairro) ? "" : ` — ${String(ficha.enderecoBairro)}`;
  const cidade = faltando(ficha.enderecoCidade) ? "" : `, ${String(ficha.enderecoCidade)}`;
  const uf = faltando(ficha.enderecoEstado) ? "" : `/${String(ficha.enderecoEstado)}`;
  const cep = faltando(ficha.enderecoCep) ? "" : ` · CEP ${String(ficha.enderecoCep)}`;
  return `${String(ficha.enderecoLogradouro)}, ${numero}${complemento}${bairro}${cidade}${uf}${cep}`;
}
