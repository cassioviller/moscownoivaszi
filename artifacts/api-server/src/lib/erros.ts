/**
 * Classificação de erro não tratado para o error handler do Express.
 *
 * Pura (sem Express, sem log): recebe o erro, devolve status + corpo + como
 * logar. Isso permite testar a decisão — em especial a distinção que motivou
 * este módulo: um `ZodError` que chega aqui veio do `.parse()` da RESPOSTA (a
 * entrada usa `safeParse` e responde 400 na própria rota), o que significa que
 * a linha do banco não bate com o contrato. Antes isso caía no 500 genérico,
 * indistinguível de um erro de infra — foi assim que o bug de cobrança esperou
 * por 227 testes. Agora rende um log próprio, com as `issues`, para aparecer.
 */

export type Classificacao = {
  status: number;
  /**
   * S12/E107 — `error` é CÓDIGO, `detalhe` é a frase.
   *
   * Esta era a última fonte de texto livre no campo que o E96 estabeleceu como
   * contrato de máquina. O `detalhe` opcional preserva a frase em português
   * para quem só a exibe, sem obrigar nenhuma tela a mudar hoje.
   */
  body: { error: string; detalhe?: string };
  logLevel: "warn" | "error";
  logMsg: string;
};

/**
 * Código de erro do Postgres, caminhando a cadeia de `cause` inteira: o driver
 * e o ORM embrulham o erro, e numa transação o código fica DOIS ou mais níveis
 * abaixo. Ler só um nível (o que havia) deixava um 23505 de transação escapar
 * para o 500 genérico em vez do 409.
 */
export function pgErrorCode(err: unknown): string | undefined {
  let atual: unknown = err;
  for (let i = 0; i < 8 && atual && typeof atual === "object"; i++) {
    const code = (atual as { code?: unknown }).code;
    if (typeof code === "string" && code) return code;
    atual = (atual as { cause?: unknown }).cause;
  }
  return undefined;
}

/** True se o erro (em qualquer nível da cadeia) é violação de unicidade. */
export function ehViolacaoUnica(err: unknown): boolean {
  return pgErrorCode(err) === "23505";
}

/**
 * O NOME da restrição violada, caminhando a mesma cadeia de `cause`.
 *
 * O `pg` põe o nome do índice em `err.constraint` — o dado que responde *qual*
 * regra o banco recusou. Ele estava chegando ao handler e sendo jogado fora:
 * `classificarErro` lia só o `code`, e por isso as 27 restrições únicas que não
 * são PK deste banco tinham uma resposta só.
 */
export function pgConstraint(err: unknown): string | undefined {
  let atual: unknown = err;
  for (let i = 0; i < 8 && atual && typeof atual === "object"; i++) {
    const nome = (atual as { constraint?: unknown }).constraint;
    if (typeof nome === "string" && nome) return nome;
    atual = (atual as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * S-O2 — **o 23505 traduzido ÍNDICE POR ÍNDICE.**
 *
 * O `REGISTRO_DUPLICADO` genérico foi um avanço sobre a frase solta que ele
 * substituiu (S12/E107), e parou no meio do caminho: ele diz que o BANCO
 * recusou, não *o quê*. Para quem vende, "Já existe um registro com estes
 * dados" no meio de um cadastro de peça não é informação — é um beco. Medido:
 * `POST /vestidos` com um código já usado respondia exatamente isso, sem dizer
 * qual peça, qual campo, nem que o conserto é trocar o código.
 *
 * A régua deste mapa, e é ela que decide o que entra:
 *
 * 1. **Perder a corrida dá a MESMA resposta da guarda.** É a régua do K3
 *    (`contratos.ts:917`): *"para a vendedora não existe diferença entre perder
 *    por um segundo e por um dia"*. Sete das ONZE linhas abaixo devolvem um
 *    código que ALGUMA rota já devolve pela porta da frente — a UNIQUE é a rede
 *    daquela guarda, e a rede passa a falar a língua dela.
 * 2. **Índice sem guarda ganha frase, não código novo por esporte.** As QUATRO
 *    restantes (`vestidos_loja_id_codigo_unique`, `usuarios_email_unique`,
 *    `itens_estoque_loja_nome_tamanho_unq` e
 *    `parcelas_contrato_id_numero_unique`) não têm guarda em rota nenhuma: o
 *    banco é a única palavra, e o que muda é a frase que a pessoa lê.
 * 3. **A chave é o nome do índice no BANCO, e há régua que o prega.** Um mapa
 *    de nomes que envelhece é pior que nenhum — ele reintroduz o genérico em
 *    silêncio, que é o defeito que esta linha existe para tirar.
 *    `e180-indice-por-indice-api.test.ts` confere cada chave contra
 *    `pg_indexes`.
 *
 * O que NÃO entra: índice que só uma corrida improvável alcança e cuja frase
 * genérica não engana ninguém (os `*_token_unq`, que colidem quando dois
 * `randomUUID` empatam). Silêncio ali é honesto; o mapa não é catálogo.
 */
export const DUPLICADO_POR_INDICE: Record<string, { error: string; detalhe: string }> = {
  // A guarda é `POST /contratos` (`contratos.ts:917`), relida sob a tranca do
  // lead desde o E158. O índice é parcial (`WHERE status = 'ATIVO'`) e fecha
  // por baixo o que a releitura fecha por cima.
  contratos_lead_ativo_unico: {
    error: "CONTRATO_ATIVO_DUPLICADO",
    detalhe: "Esta noiva já tem um contrato ativo — cancele o que existe antes de fechar outro.",
  },
  contratos_orcamento_id_unique: {
    error: "ORCAMENTO_JA_VINCULADO",
    detalhe: "Este orçamento já virou contrato — abra o contrato que existe em vez de fechar outro.",
  },
  // As duas UNIQUE de `atendimentos` são a rede das duas recusas que o
  // `agenda-core/mover.ts:38` já nomeia, com as frases dele.
  atendimentos_cabine_id_inicio_unique: {
    error: "CABINE_OCUPADA",
    detalhe: "Já há atendimento nessa cabine nesse horário — escolha outra cabine ou outro horário.",
  },
  atendimentos_loja_id_vendedora_id_inicio_unique: {
    error: "VENDEDORA_OCUPADA",
    detalhe: "A vendedora já tem atendimento nesse horário — escolha outra pessoa ou outro horário.",
  },
  // A guarda é o `JA_VIROU_PECA` de `vestidos.ts:153`, e o comentário de lá já
  // chama este índice de "o cinto do banco".
  vestidos_origem_ajuste_id_unique: {
    error: "CONFECCAO_JA_VIROU_PECA",
    detalhe: "Este trabalho já virou uma peça do acervo — a peça existe, não há o que criar de novo.",
  },
  comissao_fechamentos_loja_id_vendedora_id_competencia_unique: {
    error: "COMPETENCIA_JA_FECHADA",
    detalhe: "A comissão desta vendedora nesta competência já foi fechada.",
  },
  recorrencias_salario_ativo_unico: {
    error: "SALARIO_ATIVO_EXISTE",
    detalhe: "Esta pessoa já tem um salário ativo nesta loja — edite o que existe em vez de criar outro.",
  },
  // Sem guarda em rota nenhuma: o banco é a única palavra.
  vestidos_loja_id_codigo_unique: {
    error: "CODIGO_EM_USO",
    detalhe: "Já existe uma peça com este código no acervo — escolha outro código.",
  },
  usuarios_email_unique: {
    error: "EMAIL_EM_USO",
    detalhe: "Já existe uma pessoa cadastrada com este e-mail.",
  },
  itens_estoque_loja_nome_tamanho_unq: {
    error: "ITEM_DE_ESTOQUE_EM_USO",
    detalhe: "Esta loja já conta um item com este nome e tamanho — some à quantidade do que existe.",
  },
  // O K9 (`contratos.ts:1810`) tirou a colisão do caminho comum decidindo o
  // número sob a tranca do contrato; a UNIQUE continua sendo a rede do duplo
  // clique, e era ela que devolvia "já cobrei este reparo" para uma cobrança
  // legítima.
  parcelas_contrato_id_numero_unique: {
    error: "PARCELA_DUPLICADA",
    detalhe: "Este contrato já tem uma parcela com este número — recarregue o carnê e tente de novo.",
  },
};

/** Duck-typing em vez de `instanceof`: há dois zod no build (zod e zod/v4). */
export function ehZodError(err: unknown): boolean {
  const e = err as { name?: unknown; issues?: unknown };
  return e?.name === "ZodError" && Array.isArray(e?.issues);
}

/**
 * True se o erro (em qualquer nível da cadeia) é o `entity.too.large` do
 * body-parser — corpo maior que o limit do express.json. Sem isto, mandar uma
 * foto grande demais virava 500 genérico, indistinguível de bug.
 */
export function ehCorpoGrandeDemais(err: unknown): boolean {
  let atual: unknown = err;
  for (let i = 0; i < 8 && atual && typeof atual === "object"; i++) {
    if ((atual as { type?: unknown }).type === "entity.too.large") return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

/** Um campo que não passou, com o motivo já em português. */
export type CampoInvalido = { campo: string; motivo: string };

/** O corpo de um 400 de validação. `error` é o código que a tela traduz. */
export type CorpoInvalido = { error: "CORPO_INVALIDO"; campos: CampoInvalido[] };

type IssueZod = {
  path?: unknown[];
  code?: string;
  expected?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  type?: string;
  origin?: string;
};

/**
 * Motivo em português a partir do CÓDIGO da issue — nunca do `message` do Zod.
 *
 * A mensagem do Zod é escrita para quem programa e em inglês ("Expected string,
 * received number"); esta função é escrita para quem vende vestido. Traduzir a
 * frase seria adivinhação: o código é o dado estável.
 */
function motivoDaIssue(issue: IssueZod): string {
  const limite = (v: number | bigint | undefined) => (v === undefined ? "" : String(v));
  const ehTexto = issue.origin === "string" || issue.type === "string";

  switch (issue.code) {
    case "invalid_type":
      // Zod v4 diz `expected` e omite `received` quando o valor não veio.
      return issue.expected === "undefined" ? "Campo inválido" : "Campo obrigatório ou com tipo errado";
    case "too_small":
      if (ehTexto) return `Precisa ter pelo menos ${limite(issue.minimum)} caractere(s)`;
      return `Precisa ser pelo menos ${limite(issue.minimum)}`;
    case "too_big":
      if (ehTexto) return `Passa do limite de ${limite(issue.maximum)} caractere(s)`;
      return `Precisa ser no máximo ${limite(issue.maximum)}`;
    case "invalid_format":
      return "Formato inválido";
    case "invalid_value":
    case "invalid_enum_value":
      return "Valor não é um dos aceitos";
    case "unrecognized_keys":
      return "Campo desconhecido";
    case "not_multiple_of":
      return "Valor não é um múltiplo permitido";
    default:
      return "Valor inválido";
  }
}

/**
 * B13/E96 — o 400 de validação com código estável e endereço do erro.
 *
 * Noventa e cinco rotas devolviam `{ error: parsed.error.message }`, e o
 * `message` de um ZodError é o **JSON serializado do array de issues**: a tela
 * recebia `[{"code":"invalid_type","path":["valorTotal"],...}]` e não tinha o
 * que fazer com aquilo além de despejá-lo num toast vermelho. A vendedora lia
 * um array de objetos em inglês com a noiva do lado.
 *
 * O que sai agora é `{ error: "CORPO_INVALIDO", campos: [{campo, motivo}] }` —
 * o código a tela traduz, e `campo` é o caminho (`itens.0.valorUnitario`) que
 * ela usa para marcar o input em vez de abrir um toast.
 *
 * Aceita `unknown` de propósito: há dois zod no build (zod e zod/v4), então
 * `instanceof` mente — a checagem é a mesma duck-typing de `ehZodError`.
 */
export function erroDeValidacao(err: unknown): CorpoInvalido {
  if (!ehZodError(err)) {
    return { error: "CORPO_INVALIDO", campos: [] };
  }
  const issues = (err as { issues: IssueZod[] }).issues;
  const campos = issues.map((issue) => ({
    // Caminho vazio = o corpo inteiro (não é objeto, veio nulo). A tela sabe
    // que sem campo o recado é geral.
    campo: (issue.path ?? []).map(String).join("."),
    motivo: motivoDaIssue(issue),
  }));
  return { error: "CORPO_INVALIDO", campos };
}

export function classificarErro(err: unknown): Classificacao {
  if (ehCorpoGrandeDemais(err)) {
    return {
      status: 413,
      body: { error: "PAYLOAD_MUITO_GRANDE" },
      logLevel: "warn",
      logMsg: "Corpo da requisição acima do limite do parser",
    };
  }

  if (ehZodError(err)) {
    // O cliente não tem culpa nem conserto — segue 500 genérico para ele; o
    // recado vai para o LOG, com marcação greppável.
    return {
      status: 500,
      // S12/E107: código também aqui. O cliente continua sem ver schema
      // nenhum — o que muda é que `error` deixa de ser frase em TODOS os
      // caminhos deste módulo, e não em três dos quatro.
      body: { error: "ERRO_INTERNO", detalhe: "Erro interno do servidor" },
      logLevel: "error",
      logMsg: "RESPOSTA_FORA_DO_CONTRATO: ZodError na saída — a linha do banco não bate com o schema",
    };
  }

  /**
   * S12/E107 — os três 409 do Postgres passam a sair como CÓDIGO.
   *
   * Eles saíam como `{ error: "Registro duplicado ou conflito de dados" }`:
   * português correto, no campo que o E96 estabeleceu que carrega código. A
   * consequência prática é que **nenhuma tela consegue traduzir aquilo para
   * algo específico** — um `switch` no `error` não tem o que casar, e o toast
   * repete a frase genérica do banco.
   *
   * E há o caso concreto, que não é hipotético: o flake da S7 apareceu na
   * suíte como "Registro duplicado ou conflito de dados" no meio de um fluxo de
   * dinheiro, e foi lido como regressão financeira por dois minutos. O código
   * `REGISTRO_DUPLICADO` diria de cara que é a trava de unicidade do banco.
   *
   * A frase não se perde: vai para `detalhe`, que é onde a prosa mora desde o
   * E96 (e é o que `PARCELAS_NAO_BATEM`, `CONTA_JA_PAGA` e as outras já fazem).
   */
  const code = pgErrorCode(err);
  if (code === "23505") {
    /**
     * S-O2 — o índice nomeado responde por si; o genérico é o que sobra.
     *
     * O `REGISTRO_DUPLICADO` continua sendo a resposta de todo índice que o mapa
     * não conhece: fechar a classe não é a mesma coisa que prometer conhecer as 27
     * restrições únicas do banco, e prometer o que não se cumpre é o defeito
     * que este épico inteiro persegue.
     */
    const nome = pgConstraint(err);
    const especifico = nome ? DUPLICADO_POR_INDICE[nome] : undefined;
    if (especifico) {
      return {
        status: 409,
        body: { error: especifico.error, detalhe: especifico.detalhe },
        logLevel: "warn",
        logMsg: `Violação de unicidade (${nome})`,
      };
    }
    return {
      status: 409,
      body: { error: "REGISTRO_DUPLICADO", detalhe: "Já existe um registro com estes dados." },
      logLevel: "warn",
      logMsg: nome ? `Violação de unicidade (${nome}, sem tradução própria)` : "Violação de unicidade",
    };
  }
  if (code === "23503") {
    return {
      status: 409,
      body: {
        error: "VINCULO_EXISTENTE",
        detalhe: "Esta operação viola vínculos existentes — há registros dependendo deste.",
      },
      logLevel: "warn",
      logMsg: "Violação de integridade referencial",
    };
  }
  if (code === "23P01") {
    return {
      status: 409,
      body: {
        error: "CONFLITO_DE_DISPONIBILIDADE",
        detalhe: "Já existe uma reserva ocupando este período.",
      },
      logLevel: "warn",
      logMsg: "Violação de exclusão (sobreposição de disponibilidade)",
    };
  }

  /**
   * S-O3 — **o `integer` que o gerador de zod perde chega ao banco, e o banco
   * responde 500.**
   *
   * O spec declara `quantidade: { type: integer, minimum: 1 }` e o orval
   * traduz para `zod.number().min(1)`: **o `integer` some**. Medido em
   * 2026-08-12 — são **115 `type: integer` no spec e ZERO `.int()` no zod
   * gerado** (`varredura-restricoes-do-spec.test.ts`), e a tradução do
   * `integer` simplesmente não existe.
   *
   * O valor fracionário atravessa a borda inteira e morre no `INSERT`, com
   * **22P02** (*invalid input syntax for type integer*). Medido: `quantidade:
   * 2.5` num item de orçamento respondia **500 ERRO_INTERNO** — "quebrei"
   * onde a verdade é "você mandou um número que não é inteiro".
   *
   * Consertar campo a campo seriam 115 guardas, e o P5 já mostrou que se
   * conserta um por vez conforme dói. Esta linha fecha a CLASSE pela outra
   * ponta: o erro passa a ser **400 legível** em toda porta, e não um 500 numa.
   *
   * 22003 (`numeric_value_out_of_range`) é a irmã — o número cabe no tipo do
   * zod e não cabe no da coluna. Mesma família, mesma resposta.
   */
  if (code === "22P02" || code === "22003") {
    return {
      status: 400,
      body: {
        error: "VALOR_FORA_DO_FORMATO",
        detalhe:
          "Um dos valores enviados não tem o formato que este campo aceita — " +
          "confira se os números que deveriam ser inteiros não têm casas decimais.",
      },
      logLevel: "warn",
      logMsg: "Valor fora do formato da coluna (o zod gerado não traduz `integer` — S-O3)",
    };
  }

  /**
   * S-D19/E143 — a corrida que o mapa não conhecia.
   *
   * Dois INSERTs simultâneos contra o EXCLUDE gist de `bloqueio_vestidos` nem
   * sempre terminam em 23P01: quando ambos se cruzam na checagem especulativa
   * do índice, o Postgres resolve o impasse por DEADLOCK e o perdedor leva
   * 40P01 — que caía aqui embaixo, no 500 genérico. Medido na reprodução
   * (300 pares de INSERTs concorrentes no mesmo vestido×janela): 266× 23P01,
   * 34× 40P01 — 11% das corridas respondiam "quebrei" onde a verdade é "outra
   * pessoa chegou primeiro". Era o flake `[201, 500]` do lote17.
   *
   * 40001 (serialization_failure) é a mesma família: transação abortada por
   * concorrência, cujo remédio é tentar de novo — entra no mesmo mapa.
   */
  if (code === "40P01" || code === "40001") {
    return {
      status: 409,
      body: {
        error: "OPERACAO_CONCORRENTE",
        detalhe: "Outra operação mexeu nos mesmos dados neste instante. Tente de novo.",
      },
      logLevel: "warn",
      logMsg: "Transação abortada por concorrência (deadlock/serialização)",
    };
  }

  return {
    status: 500,
    body: { error: "ERRO_INTERNO", detalhe: "Erro interno do servidor" },
    logLevel: "error",
    logMsg: "Erro não tratado",
  };
}
