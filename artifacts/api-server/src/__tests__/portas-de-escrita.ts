import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * O ENUMERADOR das portas de escrita nas quatro tabelas quentes (E171).
 *
 * A varredura que consome este arquivo é `varredura-portas-sob-tranca.test.ts`;
 * aqui mora só a enumeração, que é o que decide a qualidade da régua. As quatro
 * varreduras anteriores de tranca — S-M7, S-M18, S-M22, S-M24 — **acertaram o
 * padrão e erraram o alcance**: a revisão da ótica dos papéis mediu 14 portas
 * abertas DEPOIS delas. Uma régua que não enxerga nasce verde, e verde por não
 * ter olhado é o pior resultado possível: ela AUTORIZA.
 *
 * Por isso a enumeração não é `grep`:
 *
 * - `grep -n "\.update(contratosTable"` acha a linha e **não sabe** se ela está
 *   dentro de `db.transaction`, se o receptor é o `tx` daquela transação ou o
 *   `db` do pool, se há `FOR UPDATE` antes, nem o que o `where` da escrita
 *   carrega. Todas as quatro perguntas são estruturais.
 * - A população sai de `git ls-files` (S38/S-D30). Em 2026-08-06 dois worktrees
 *   órfãos deixaram 1,04 GB no disco e uma varredura ingênua lia **4.791
 *   arquivos onde havia 1.681** — 65% do que o disco devolvia era cópia. Este
 *   agente roda dentro de `.claude/worktrees/`, que é exatamente o lugar.
 *
 * ## O que é uma porta
 *
 * Uma chamada `X.insert(T)`, `X.update(T)` ou `X.delete(T)` onde `T` é uma das
 * quatro tabelas quentes — `bloqueio_vestidos`, `reservas`, `contratos`,
 * `orcamentos`. São as quatro em que uma corrida perdida custa peça prometida
 * duas vezes ou dinheiro preso no caixa.
 *
 * ## As três disciplinas que a varredura aceita
 *
 * **TRANCA** — a escrita roda dentro de `db.transaction`, pelo executor DAQUELA
 * transação, existe `.for("update")` sobre a tabela alvo ou sobre uma linha-pai
 * declarada em `PAIS`, e a guarda é RELIDA depois da tranca (§ `releituraDaGuarda`).
 * É a forma do `aceite-orcamento.ts:68-79`.
 *
 * **CAS** — a escrita repete no próprio `where` a condição de estado que a
 * guarda leu (`eq(contratosTable.status, "ATIVO")`). O UPDATE é atômico por si:
 * zero linhas quer dizer "mudou no meio". É o idioma que o E158 nomeou a partir
 * do DELETE de parcela (`contratos.ts:1058-1071`) e que o `PATCH /contratos`
 * (`:1072`) usa hoje.
 *
 * **ABERTA** — nem uma nem outra. Toda porta ABERTA tem de estar na tabela de
 * dívida reconhecida da varredura, **com a contagem travada**.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * As pastas varridas. `artifacts/moscow-noivas/src` entra de propósito mesmo
 * sendo frontend: o dia em que um `contratosTable` aparecer lá, a varredura
 * fala. `scripts` e `lib` entram pelo mesmo motivo — seed e migração escrevem.
 */
const PASTAS = [
  "artifacts/api-server/src",
  "artifacts/moscow-noivas/src",
  "lib",
  "scripts",
] as const;

export const TABELAS_QUENTES = [
  "bloqueioVestidosTable",
  "reservasTable",
  "contratosTable",
  "orcamentosTable",
  "parcelasTable",
] as const;
export type TabelaQuente = (typeof TABELAS_QUENTES)[number];

/** Os nomes de tabela, como o Postgres os conhece — para a peneira de SQL cru. */
export const NOMES_NO_BANCO: Record<TabelaQuente, string> = {
  bloqueioVestidosTable: "bloqueio_vestidos",
  reservasTable: "reservas",
  contratosTable: "contratos",
  orcamentosTable: "orcamentos",
  parcelasTable: "parcelas",
};

/**
 * A cadeia de trancas, escrita uma vez.
 *
 * O E158 fixou a ordem do módulo de contratos em `contratos.ts:643`
 * (`lead → contrato → parcelas → bloqueios`) e o E159 a estendeu em
 * `reservas.ts:65` (`linha-pai da rota → contrato → parcelas → bloqueios
 * ORDENADOS → vestidos ORDENADOS`). Sem ordem comum, duas portas se matam em
 * deadlock em vez de fazer fila. **A ordem é conferida desde o E180** —
 * `DEGRAUS_DA_ORDEM`, abaixo.
 *
 * Para cada tabela quente, quais linhas servem de tranca. Trancar a linha-PAI é
 * legítimo e às vezes é a única opção: o `POST /contratos` tranca o LEAD porque
 * o invariante que ele defende ("um lead, um contrato ativo") fala do lead, e a
 * linha do lead existe mesmo quando não há contrato nenhum para trancar
 * (`contratos.ts:611-613`).
 */
export const PAIS: Record<TabelaQuente, readonly string[]> = {
  contratosTable: ["contratosTable", "leadsTable"],
  reservasTable: ["reservasTable", "leadsTable"],
  orcamentosTable: ["orcamentosTable", "leadsTable"],
  bloqueioVestidosTable: [
    "bloqueioVestidosTable",
    "vestidosTable",
    "reservasTable",
    "contratosTable",
    "leadsTable",
  ],
  parcelasTable: ["parcelasTable", "contratosTable", "leadsTable"],
};

/**
 * As colunas que decidem ESTADO em cada tabela — as que uma corrida muda embaixo
 * de quem já leu. São elas que a releitura tem de trazer e que o CAS tem de
 * repetir no `where`.
 */
export const COLUNAS_DE_ESTADO: Record<TabelaQuente, readonly string[]> = {
  contratosTable: ["status", "canceladoEm"],
  reservasTable: ["status"],
  orcamentosTable: ["status", "aceitoEm", "aprovadoEm", "publicoAbertoEm"],
  bloqueioVestidosTable: ["canceladoEm"],
  parcelasTable: ["status", "recebidoEm", "conciliadoEm", "enviadoContabilidadeEm"],
};

/**
 * A ORDEM em que as trancas se tomam, em degraus — S-O33, o ponto cego 4 do E171.
 *
 * As duas cadeias que o repositório já declarava em prosa dizem a MESMA coisa,
 * e é ela que está aqui:
 *
 * - `contratos.ts:643` (E158): `lead → contrato → parcelas → bloqueios`
 * - `reservas.ts:63` (E159): `linha-pai da rota (lead · reserva · avaria) →
 *   contrato → parcelas → bloqueios ORDENADOS → vestidos ORDENADOS`
 *
 * Ordem não é preferência: é o que impede DEADLOCK. Duas transações que tomam
 * as mesmas duas linhas em ordens contrárias — uma segurando o lead e esperando
 * o bloqueio, outra segurando o bloqueio e esperando o lead — se matam em ciclo
 * em vez de fazerem fila, e o Postgres derruba uma delas com 40P01. A varredura
 * do E171 contava a tranca e **não a ordem**: uma porta nova invertida passava
 * verde e travava a produção.
 *
 * Tabelas do MESMO degrau são intercambiáveis: `leads`, `reservas`, `avarias` e
 * `contas_pagar` são as quatro "linha-pai da rota", e nenhuma rota tranca duas
 * delas.
 *
 * `orcamentos` entra entre o lead e o contrato porque é onde a jornada o põe —
 * e a colocação é livre de consequência hoje, por medida: das 28 transações que
 * trancam, **nenhuma tranca `orcamentos` junto de outra tabela**. Ela está aqui
 * para que a primeira que o fizer seja conferida, não para reconstituir uma
 * ordem que alguém já tenha escolhido.
 *
 * **S-O60/E186 — `contas_pagar` entrou no primeiro degrau, e entrou porque a
 * S-O59 a obrigou.** Enquanto a conta da ordem não seguia o executor para
 * dentro de `trancarContratos`, as duas transações que trancam `contas_pagar`
 * (`comissao.ts:1046`, `financeiro.ts:435`) pareciam trancá-la SOZINHAS. Com o
 * helper visível, a de `comissao.ts` passa a tomar `contas_pagar` e depois
 * `contratos` na mesma transação — a ordem entre as duas existe desde o E176 e
 * ninguém a tinha declarado.
 *
 * Ela fica no degrau da **linha-pai da rota** porque é ali que ela é tomada nas
 * DUAS transações (o `DELETE /comissao/fechamentos/:id` reabre o fechamento
 * pela conta; o `DELETE /financeiro/contas/:id` apaga a própria conta), o mesmo
 * papel que `leads`, `reservas` e `avarias` já tinham. A régua daquele degrau
 * continua valendo, e foi remedida: **nenhuma rota tranca duas linhas dele.**
 *
 * **E os EIXOS DA AGENDA entraram junto, e a S-O60 não os previa.** Seguir o
 * executor não achou uma tabela sem degrau: achou TRÊS. `trancarEixos`
 * (`agenda.ts:98`, E161) tranca `cabines` e depois `usuarios`, e a transação que
 * conclui a prova segue para `bloqueio_vestidos` e `vestidos` — quatro tabelas
 * numa cadeia só, duas delas sem degrau declarado. **A ordem já estava escrita
 * em prosa no arquivo** (*"a ordem é cabine → vendedora, sempre, nas duas
 * portas"*, `agenda.ts:86`); o que faltava era ela ser executável. Elas ganham
 * degrau PRÓPRIO cada uma, e não um degrau compartilhado, justamente porque a
 * mesma transação toma as duas: tabelas do mesmo degrau são as que nenhuma rota
 * pede juntas.
 */
export const DEGRAUS_DA_ORDEM: readonly (readonly string[])[] = [
  ["cabinesTable"],
  ["usuariosTable"],
  ["leadsTable", "reservasTable", "avariasTable", "contasPagarTable"],
  ["orcamentosTable"],
  ["contratosTable"],
  ["parcelasTable"],
  ["bloqueioVestidosTable"],
  ["vestidosTable"],
];

/** O degrau de uma tabela na cadeia, ou `null` quando ela não está declarada. */
export function degrauDaTranca(tabela: string): number | null {
  const i = DEGRAUS_DA_ORDEM.findIndex((d) => d.includes(tabela));
  return i === -1 ? null : i;
}

/** Os identificadores por onde uma escrita sai para o banco. */
const EXECUTORES = new Set(["db", "tx", "executor", "exec"]);
const VERBOS = new Set(["insert", "update", "delete"]);

/**
 * ## S-O59/E186 — a conta SEGUE o executor para dentro do helper
 *
 * O ponto cego 2 do E171 dizia que a varredura "não entra no helper", e a S-O59
 * mediu o preço disso numa função só: `trancarContratos` (`comissao.ts:224`)
 * recebe o `tx` da transação, tranca contratos ORDENADO por id, e **nenhuma das
 * contas o via** — nem a da ordem, nem a do laço, nem a que decide a disciplina
 * das três portas que ele protege desde o E176. Eram **3 laços contados e 4
 * existentes**, e a dívida declarada de `comissao.ts` dizia 3 portas abertas
 * sobre 3 portas FECHADAS.
 *
 * O que fecha o buraco é seguir o argumento: quando uma chamada dentro da
 * transação passa o `tx` para uma função do MESMO módulo, o parâmetro que o
 * recebe vira o executor daquela função, e as trancas de lá contam como se
 * estivessem escritas no ponto da chamada.
 *
 * **O que continua de fora, e está declarado:** a resolução é de módulo, não de
 * projeto — helper importado de outro arquivo segue invisível. É a mesma
 * escolha da peneira de apelidos: o que se resolve é o que o arquivo diz por
 * inteiro, e o resto vira caso a decidir, não silêncio.
 */
type FuncaoLocal = { params: string[]; corpo: ts.Node };

/** As funções declaradas no módulo — as únicas em que o executor é seguível. */
function funcoesLocais(sf: ts.SourceFile): Map<string, FuncaoLocal> {
  const mapa = new Map<string, FuncaoLocal>();
  const guardar = (nome: string, fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression): void => {
    if (fn.body) mapa.set(nome, { params: fn.parameters.map((p) => p.name.getText(sf)), corpo: fn.body });
  };
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) guardar(stmt.name.text, stmt);
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          guardar(d.name.text, d.initializer);
        }
      }
    }
  }
  return mapa;
}

/** Uma tranca vista dentro de um corpo, com a posição que a ORDENA na transação. */
type TrancaBruta = {
  tabela: string;
  linha: number;
  laco: string | null;
  lacoOrdenado: boolean;
  /** A posição que decide a ordem: a da tranca, ou a da CHAMADA que a alcança. */
  posicao: number;
  /** O nome do helper por onde ela foi alcançada, quando não é direta. */
  viaHelper: string | null;
};

/** A expressão do laço que envolve a tranca, como texto — `null` sem laço. */
function textoDoLaco(sf: ts.SourceFile, chamada: ts.Node, corpo: ts.Node): string | null {
  const laco = lacoQueEnvolve(chamada, corpo);
  if (!laco) return null;
  return ts.isForOfStatement(laco) ? laco.expression.getText(sf) : laco.getText(sf).split("\n")[0]!.slice(0, 60);
}

/**
 * As trancas de um corpo, seguindo o executor para dentro das funções do módulo.
 *
 * `visitados` corta a recursão de uma função que chame a si mesma passando o
 * executor adiante — não há nenhuma hoje, e uma varredura que trava é pior que
 * uma que não vê.
 */
function trancasNoCorpo(
  sf: ts.SourceFile,
  corpo: ts.Node,
  executor: string,
  locais: Map<string, FuncaoLocal>,
  visitados: ReadonlySet<string> = new Set(),
): TrancaBruta[] {
  const out: TrancaBruta[] = [];

  for (const chamada of chamadasDe(corpo, "for")) {
    if (raizDoReceptor((chamada.expression as ts.PropertyAccessExpression).expression) !== executor) continue;
    const texto = textoDoLaco(sf, chamada, corpo);
    out.push({
      tabela: tabelaDoFrom(cadeiaCompleta(chamada)) ?? "?",
      linha: sf.getLineAndCharacterOfPosition(chamada.getStart(sf)).line + 1,
      laco: texto,
      lacoOrdenado: texto !== null && /\.sort\s*\(/.test(texto),
      posicao: chamada.getStart(sf),
      viaHelper: null,
    });
  }

  const v = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && !visitados.has(n.expression.text)) {
      const fn = locais.get(n.expression.text);
      if (fn) {
        const i = n.arguments.findIndex((a) => ts.isIdentifier(a) && a.text === executor);
        const param = i === -1 ? undefined : fn.params[i];
        if (param) {
          for (const t of trancasNoCorpo(sf, fn.corpo, param, locais, new Set([...visitados, n.expression.text]))) {
            out.push({ ...t, posicao: n.getStart(sf), viaHelper: t.viaHelper ?? n.expression.text });
          }
        }
      }
    }
    n.forEachChild(v);
  };
  v(corpo);

  return out.sort((a, b) => a.posicao - b.posicao);
}

export type Disciplina = "TRANCA" | "CAS" | "ABERTA";

export type Porta = {
  arquivo: string;
  linha: number;
  verbo: string;
  tabela: TabelaQuente;
  /** O identificador que executa a escrita: `tx` (transação) ou `db` (pool). */
  executor: string;
  /** O parâmetro da `db.transaction(...)` que envolve a escrita, se houver. */
  txNome: string | null;
  /** As tabelas que a transação trancou com `FOR UPDATE` ANTES desta escrita. */
  trancadas: string[];
  /** Alguma das trancas cobre a tabela alvo ou uma linha-pai declarada. */
  trancaNoAlvoOuPai: boolean;
  /** Como a guarda foi relida depois da tranca — null quando não foi. */
  releituraDaGuarda: string | null;
  /** As colunas de estado que o `where` da própria escrita repete. */
  casNoWhere: string[];
  disciplina: Disciplina;
};

function raizDoReceptor(no: ts.Node): string {
  let n: ts.Node = no;
  while (ts.isPropertyAccessExpression(n) || ts.isCallExpression(n)) n = n.expression;
  return ts.isIdentifier(n) ? n.text : `<${ts.SyntaxKind[n.kind]}>`;
}

/** Sobe do `.insert(T)` até o fim da cadeia `.set().where().returning()`. */
function cadeiaCompleta(no: ts.Node): ts.Node {
  let n: ts.Node = no;
  for (;;) {
    const p = n.parent;
    if (p && ts.isPropertyAccessExpression(p) && p.expression === n) {
      n = p;
      continue;
    }
    if (p && ts.isCallExpression(p) && p.expression === n) {
      n = p;
      continue;
    }
    if (p && ts.isAwaitExpression(p)) {
      n = p;
      continue;
    }
    return n;
  }
}

function chamadasDe(raiz: ts.Node, nome: string): ts.CallExpression[] {
  const out: ts.CallExpression[] = [];
  const v = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === nome) {
      out.push(n);
    }
    n.forEachChild(v);
  };
  v(raiz);
  return out;
}

/** O `.from(X)` da cadeia de um select — qual linha a tranca segura. */
function tabelaDoFrom(cadeia: ts.Node): string | null {
  const froms = chamadasDe(cadeia, "from");
  for (const f of froms) {
    const a = f.arguments[0];
    if (a && ts.isIdentifier(a)) return a.text;
  }
  return null;
}

/**
 * Os apelidos locais das tabelas quentes.
 *
 * `import { contratosTable as ct }` faria a busca por identificador perder a
 * porta inteira — é o buraco clássico de qualquer varredura por nome. Resolver
 * o apelido no `import` fecha o buraco de vez. O acesso por namespace
 * (`schema.contratosTable`) NÃO é resolvido aqui: ele cai na peneira de
 * `escritasComTabelaDinamica`, que a varredura exige em zero.
 */
function apelidosDasQuentes(sf: ts.SourceFile): Map<string, TabelaQuente> {
  const mapa = new Map<string, TabelaQuente>();
  for (const q of TABELAS_QUENTES) mapa.set(q, q);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const original = el.propertyName?.text;
      if (original && (TABELAS_QUENTES as readonly string[]).includes(original)) {
        mapa.set(el.name.text, original as TabelaQuente);
      }
    }
  }
  return mapa;
}

/**
 * Enumera as portas de UM texto-fonte. Exportada porque é ela que o autoteste
 * da varredura chama com fonte sintética: uma régua que nunca se viu vermelha é
 * decoração, e este é o vermelho que fica gravado.
 */
export function portasNoTexto(caminho: string, texto: string): Porta[] {
  return portasNaFonte(ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true));
}

function portasNaFonte(sf: ts.SourceFile): Porta[] {
  const apelidos = apelidosDasQuentes(sf);
  const locais = funcoesLocais(sf);
  const portas: Porta[] = [];

  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && VERBOS.has(no.expression.name.text)) {
      const arg = no.arguments[0];
      const tabela = arg && ts.isIdentifier(arg) ? apelidos.get(arg.text) : undefined;
      if (tabela) {
        portas.push(analisar(sf, no, no.expression.name.text, tabela, locais));
      }
    }
    no.forEachChild(visitar);
  };
  visitar(sf);
  return portas;
}

function analisar(
  sf: ts.SourceFile,
  escrita: ts.CallExpression,
  verbo: string,
  tabela: TabelaQuente,
  locais: Map<string, FuncaoLocal>,
): Porta {
  const inicio = escrita.getStart(sf);
  const linha = sf.getLineAndCharacterOfPosition(inicio).line + 1;
  const executor = raizDoReceptor((escrita.expression as ts.PropertyAccessExpression).expression);

  // 1. Transação presente: existe um `.transaction(cb)` acima, e o executor da
  //    escrita é o parâmetro DAQUELE callback (não o `db` do pool por dentro).
  let txNome: string | null = null;
  let corpoTx: ts.Node | null = null;
  for (let p: ts.Node | undefined = escrita.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === "transaction") {
      const cb = p.arguments[0];
      if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        txNome = cb.parameters[0]?.name.getText(sf) ?? null;
        corpoTx = cb.body;
      }
      break;
    }
  }

  const trancadas: string[] = [];
  let releituraDaGuarda: string | null = null;
  let posPrimeiraTranca = Number.POSITIVE_INFINITY;
  /**
   * S-O59/E186 — **uma chamada que TRANCA não é, por isso, uma chamada que
   * PERGUNTA.** A regra 3c abaixo aceita como releitura qualquer chamada que
   * receba o `tx` depois da tranca, e é uma aproximação boa: quem passa o
   * executor adiante costuma estar delegando a guarda. `trancarContratos` é o
   * contra-exemplo — ele só toma `FOR UPDATE`, com `select({ id })`, e não
   * relê estado nenhum. Enquanto a varredura não entrava no helper ela não
   * tinha como saber; agora tem, e as chamadas que ela já contou como TRANCA
   * saem da conta de releitura. Sem isto, seguir o executor promoveria a
   * `comissao.ts:1071` a TRANCA por um motivo falso.
   */
  const chamadasQueSoTrancam = new Set<number>();

  if (corpoTx && txNome) {
    // 2. `FOR UPDATE` na linha certa: um `.for(...)` do MESMO executor, ANTES
    //    da escrita. A tabela vem do `.from(X)` da mesma cadeia.
    for (const chamada of chamadasDe(corpoTx, "for")) {
      if (chamada.getStart(sf) >= inicio) continue;
      if (raizDoReceptor((chamada.expression as ts.PropertyAccessExpression).expression) !== txNome) continue;
      const cadeia = cadeiaCompleta(chamada);
      const alvo = tabelaDoFrom(cadeia) ?? "?";
      trancadas.push(alvo);
      posPrimeiraTranca = Math.min(posPrimeiraTranca, chamada.getStart(sf));

      // 3a. A releitura mais comum é o PRÓPRIO select da tranca, quando ele
      //     projeta a coluna de estado (`{ status: ... }`) ou tudo (`select()`).
      //     É a forma de `reservas.ts:200-206` e `contratos.ts:1159-1163`.
      const sel = chamadasDe(cadeia, "select")[0];
      if (sel && alvo === tabela) {
        const proj = sel.arguments[0];
        if (!proj) {
          releituraDaGuarda ??= `tranca com select() inteiro em ${alvo}`;
        } else if (ts.isObjectLiteralExpression(proj)) {
          const txt = proj.getText(sf);
          for (const col of COLUNAS_DE_ESTADO[tabela]) {
            if (txt.includes(`${tabela}.${col}`)) releituraDaGuarda ??= `tranca lê ${tabela}.${col}`;
          }
        }
      }
    }

    // 2b. S-O59/E186: e as trancas que o helper toma com o `tx` que recebeu. É
    //     a mesma tranca, escrita uma vez e chamada de três lugares — o que
    //     mudou é que a varredura passou a enxergá-la.
    for (const t of trancasNoCorpo(sf, corpoTx, txNome, locais)) {
      if (t.viaHelper === null || t.posicao >= inicio) continue;
      trancadas.push(t.tabela);
      posPrimeiraTranca = Math.min(posPrimeiraTranca, t.posicao);
      chamadasQueSoTrancam.add(t.posicao);
    }

    // 3b. Ou um select SEM `for` depois da tranca; 3c. ou um helper que recebe o
    //     executor da transação e faz a pergunta lá dentro
    //     (`verificarDisponibilidade({ executor: tx })`).
    const depoisDaTranca = (n: ts.Node): boolean => n.getStart(sf) > posPrimeiraTranca && n.getStart(sf) < inicio;
    const v = (n: ts.Node): void => {
      if (depoisDaTranca(n) && ts.isCallExpression(n)) {
        if (
          ts.isPropertyAccessExpression(n.expression) &&
          n.expression.name.text === "select" &&
          raizDoReceptor(n.expression.expression) === txNome &&
          chamadasDe(cadeiaCompleta(n), "for").length === 0
        ) {
          releituraDaGuarda ??= `releitura em ${tabelaDoFrom(cadeiaCompleta(n)) ?? "?"}`;
        }
        for (const a of n.arguments) {
          if (ts.isIdentifier(a) && a.text === txNome && !chamadasQueSoTrancam.has(n.getStart(sf))) {
            releituraDaGuarda ??= `guarda delegada a ${n.expression.getText(sf)}`;
          }
          if (ts.isObjectLiteralExpression(a)) {
            for (const pr of a.properties) {
              if (ts.isPropertyAssignment(pr) && ts.isIdentifier(pr.initializer) && pr.initializer.text === txNome) {
                releituraDaGuarda ??= `guarda delegada a ${n.expression.getText(sf)}`;
              }
            }
          }
        }
      }
      n.forEachChild(v);
    };
    v(corpoTx);
  }

  // 4. CAS: o `where` da própria escrita repete uma coluna de estado do alvo.
  const casNoWhere: string[] = [];
  for (const w of chamadasDe(cadeiaCompleta(escrita), "where")) {
    const txt = w.arguments.map((a) => a.getText(sf)).join(" ");
    for (const col of COLUNAS_DE_ESTADO[tabela]) {
      if (txt.includes(`${tabela}.${col}`) && !casNoWhere.includes(col)) casNoWhere.push(col);
    }
  }

  const trancaNoAlvoOuPai = trancadas.some((t) => PAIS[tabela].includes(t));
  const naTransacao = txNome !== null && executor === txNome;
  const disciplina: Disciplina =
    naTransacao && trancaNoAlvoOuPai && (releituraDaGuarda !== null || casNoWhere.length > 0)
      ? "TRANCA"
      : casNoWhere.length > 0
        ? "CAS"
        : "ABERTA";

  return {
    arquivo: sf.fileName,
    linha,
    verbo,
    tabela,
    executor,
    txNome,
    trancadas,
    trancaNoAlvoOuPai,
    releituraDaGuarda,
    casNoWhere,
    disciplina,
  };
}

/** Os arquivos-fonte versionados que a varredura lê. */
export function arquivosVarridos(): string[] {
  return arquivosVersionados(RAIZ, PASTAS).filter(
    (rel) =>
      /\.tsx?$/.test(rel) &&
      !rel.includes(".test.") &&
      !rel.split("/").includes("__tests__") &&
      !rel.split("/").includes("generated"),
  );
}

/**
 * As fontes já parseadas, uma vez só.
 *
 * As três peneiras do arquivo percorrem a MESMA população; sem o cache, o
 * `git ls-files` roda três vezes e os 266 arquivos são lidos e parseados três
 * vezes. A varredura inteira leva ~1 s com o cache.
 */
let cacheDasFontes: ts.SourceFile[] | null = null;
function fontesVarridas(): ts.SourceFile[] {
  cacheDasFontes ??= arquivosVarridos().map((rel) =>
    ts.createSourceFile(rel, readFileSync(join(RAIZ, rel), "utf8"), ts.ScriptTarget.Latest, true),
  );
  return cacheDasFontes;
}

export function enumerarPortas(): Porta[] {
  const portas: Porta[] = [];
  for (const sf of fontesVarridas()) portas.push(...portasNaFonte(sf));
  return portas;
}

/**
 * As escritas cuja tabela NÃO é um identificador simples —
 * `db.update(schema.contratosTable)`, `tx.insert(tabelas[i])`.
 *
 * A enumeração acima não as classifica, e uma delas escondendo uma tabela
 * quente seria a porta que a régua não vê. Hoje são **zero**, e a varredura
 * cobra que continue zero: no dia em que a primeira nascer, ela vira decisão —
 * ou a escrita volta ao identificador simples, ou o enumerador aprende a
 * resolvê-la. O que não pode é passar em silêncio.
 */
export function escritasComTabelaDinamica(): string[] {
  const achados: string[] = [];
  for (const sf of fontesVarridas()) {
    const rel = sf.fileName;
    const v = (no: ts.Node): void => {
      if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && VERBOS.has(no.expression.name.text)) {
        const arg = no.arguments[0];
        const receptor = raizDoReceptor(no.expression.expression);
        if (arg && !ts.isIdentifier(arg) && EXECUTORES.has(receptor)) {
          const linha = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
          achados.push(`${rel}:${linha} ${receptor}.${no.expression.name.text}(${arg.getText(sf).slice(0, 50)})`);
        }
      }
      no.forEachChild(v);
    };
    v(sf);
  }
  return achados;
}

/**
 * ## A ORDEM das trancas (S-O33)
 *
 * O E171 mediu a disciplina de cada porta e declarou, no ponto cego 4, que ela
 * conta a tranca e **não a ordem**. O que segue fecha essa metade — e fecha só
 * o que a AST pode saber, que é a razão de o E171 tê-la deixado de fora.
 *
 * A pergunta do deadlock tem duas metades, e elas se respondem com evidências
 * diferentes:
 *
 * 1. **ENTRE tabelas** — a sequência de `FOR UPDATE` de uma transação sobe os
 *    degraus de `DEGRAUS_DA_ORDEM` sem descer nenhum. A tabela de cada tranca
 *    sai do `.from(X)` da própria cadeia: isto a AST sabe, e sabe inteiro.
 * 2. **DENTRO da tabela** — os bloqueios e os vestidos vão ORDENADOS por id,
 *    porque duas transações que trancam b1 e b2 em ordens contrárias se matam
 *    igual, mesmo estando as duas no degrau certo. **Aqui a AST não sabe qual
 *    LINHA cada tranca segura** — o id é valor de tempo de execução —, e o que
 *    ela sabe é o laço: uma tranca dentro de um `for…of` percorre a coleção na
 *    ordem em que ela vem, então a coleção tem de estar ORDENADA na expressão
 *    do laço. É uma régua LÉXICA e está declarada como tal.
 */

/** Uma tranca tomada dentro de uma transação. */
export type Tranca = {
  arquivo: string;
  linha: number;
  /** A tabela do `.from(X)` da cadeia — `?` quando a cadeia não a declara. */
  tabela: string;
  /** O degrau dela em `DEGRAUS_DA_ORDEM`, ou `null` quando não está declarada. */
  degrau: number | null;
  /** A expressão do laço que envolve a tranca, quando há um. */
  laco: string | null;
  /** Com laço: a coleção percorrida está explicitamente ordenada. */
  lacoOrdenado: boolean;
  /**
   * S-O59 — o helper por onde a tranca foi alcançada, ou `null` quando ela está
   * escrita na própria transação. É o que separa "a varredura viu" de "a
   * varredura seguiu o executor".
   */
  viaHelper: string | null;
};

/** O `for`/`for…of`/`for…in` mais interno que envolve o nó, dentro do corpo dado. */
function lacoQueEnvolve(no: ts.Node, limite: ts.Node): ts.Node | null {
  for (let p: ts.Node | undefined = no.parent; p && p !== limite.parent; p = p.parent) {
    if (ts.isForOfStatement(p) || ts.isForStatement(p) || ts.isForInStatement(p)) return p;
  }
  return null;
}

/** As trancas de UM texto-fonte, agrupadas por transação. Exportada para o autoteste. */
export function trancasNoTexto(caminho: string, texto: string): Map<string, Tranca[]> {
  return trancasNaFonte(ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true));
}

function trancasNaFonte(sf: ts.SourceFile): Map<string, Tranca[]> {
  const mapa = new Map<string, Tranca[]>();
  const rel = sf.fileName;
  const locais = funcoesLocais(sf);
  const v = (no: ts.Node): void => {
    if (
      ts.isCallExpression(no) &&
      ts.isPropertyAccessExpression(no.expression) &&
      no.expression.name.text === "transaction"
    ) {
      const cb = no.arguments[0];
      const txNome =
        cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) ? (cb.parameters[0]?.name.getText(sf) ?? null) : null;
      if (cb && txNome) {
        const corpo = (cb as ts.ArrowFunction | ts.FunctionExpression).body;
        /**
         * A ORDEM é a da POSIÇÃO na transação, não a do número de linha: a
         * tranca alcançada por helper mora numa função declarada lá em cima
         * (`comissao.ts:229` para uma transação de `:1035`), e ordená-la por
         * linha a poria antes de trancas que ela sucede. `trancasNoCorpo` já
         * devolve ordenado pela posição da CHAMADA.
         */
        const trancas: Tranca[] = trancasNoCorpo(sf, corpo, txNome, locais).map((t) => ({
          arquivo: rel,
          linha: t.linha,
          tabela: t.tabela,
          degrau: degrauDaTranca(t.tabela),
          laco: t.laco,
          lacoOrdenado: t.lacoOrdenado,
          viaHelper: t.viaHelper,
        }));
        if (trancas.length > 0) {
          mapa.set(`${rel}:${sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1}`, trancas);
        }
      }
    }
    no.forEachChild(v);
  };
  v(sf);
  return mapa;
}

/**
 * Enumera as trancas de cada transação da população, em ORDEM DE POSIÇÃO.
 *
 * A chave do mapa é o `arquivo:linha` da chamada `.transaction(`, que é o que
 * identifica a transação para quem for ler o vermelho.
 */
export function trancasPorTransacao(): Map<string, Tranca[]> {
  const mapa = new Map<string, Tranca[]>();
  for (const sf of fontesVarridas()) {
    for (const [chave, trancas] of trancasNaFonte(sf)) mapa.set(chave, trancas);
  }
  return mapa;
}

/**
 * As trancas que DESCEM um degrau — a inversão que produz o deadlock.
 *
 * Só compara trancas de degrau declarado: o par com tabela fora de
 * `DEGRAUS_DA_ORDEM` sai pela peneira de `trancasSemDegrauDeclarado`, e uma
 * comparação inventada valeria menos que nenhuma.
 *
 * **O que ela não vê, e é o mesmo ponto cego 1 do E171:** a régua é LÉXICA. Duas
 * trancas em ramos EXCLUSIVOS de um `if/else` são lidas como sequência, e uma
 * tranca dentro de um `if` que não roda não é tomada. A leitura em ordem de
 * arquivo é a aproximação certa para o caso comum — o bloco linear de uma rota —
 * e erra para MAIS, nunca para menos: ela acusa ordem que talvez não aconteça,
 * jamais aprova inversão que aconteça.
 */
export function trancasForaDeOrdem(): string[] {
  const fora: string[] = [];
  for (const [transacao, trancas] of trancasPorTransacao()) {
    const comDegrau = trancas.filter((t) => t.degrau !== null);
    for (let i = 1; i < comDegrau.length; i += 1) {
      const antes = comDegrau[i - 1]!;
      const agora = comDegrau[i]!;
      if (agora.degrau! < antes.degrau!) {
        fora.push(
          `${agora.arquivo}:${agora.linha} tranca ${agora.tabela} (degrau ${agora.degrau}) DEPOIS de ` +
            `${antes.tabela} (degrau ${antes.degrau}), na transação de ${transacao}`,
        );
      }
    }
  }
  return fora;
}

/**
 * As trancas sobre tabela que a cadeia não declara.
 *
 * Não são erro: são DECISÃO adiada. Uma tabela sem degrau não pode ser ordenada
 * contra as outras, então a primeira transação que a trancar junto de uma tabela
 * da cadeia abre um ciclo que ninguém conferiu. A varredura trava a CONTAGEM
 * delas pelo mesmo motivo que trava a da dívida.
 */
export function trancasSemDegrauDeclarado(): string[] {
  const sem: string[] = [];
  for (const trancas of trancasPorTransacao().values()) {
    for (const t of trancas) {
      if (t.degrau === null) sem.push(`${t.arquivo}:${t.linha} tranca ${t.tabela}`);
    }
  }
  return sem;
}

/**
 * As trancas tomadas DENTRO de um laço sobre coleção que não está ordenada.
 *
 * É a metade "ORDENADOS por id" da cadeia. Duas transações que trancam os
 * mesmos dois bloqueios em ordens contrárias se matam em ciclo mesmo estando as
 * duas no degrau certo: o degrau ordena as TABELAS, o `.sort()` ordena as
 * LINHAS dentro de uma delas.
 *
 * **A régua é léxica e a limitação está declarada:** ela reconhece a ordenação
 * pelo `.sort(` na expressão do laço, que é a grafia das quatro que existem
 * (`contratos.ts:700`, `reservas.ts:253`, `:349`, `comissao.ts:229`). Uma
 * coleção que chegasse ordenada de um `ORDER BY` do SQL passaria por aqui como
 * não-ordenada; no dia em que a primeira nascer, a saída é ordenar no laço
 * também — custa uma chamada e dispensa quem lê de reconstituir a origem.
 */
export function trancasEmLacoNaoOrdenado(): string[] {
  const soltas: string[] = [];
  for (const trancas of trancasPorTransacao().values()) {
    for (const t of trancas) {
      if (t.laco !== null && !t.lacoOrdenado) soltas.push(`${t.arquivo}:${t.linha} tranca ${t.tabela} em \`${t.laco}\``);
    }
  }
  return soltas;
}

/**
 * SQL cru que escreve numa tabela quente.
 *
 * **Aqui a peneira é regex, e o motivo é que não existe AST para olhar:** o
 * conteúdo de uma template string `sql\`UPDATE contratos …\`` é texto para o
 * TypeScript — o parser entrega um `NoSubstitutionTemplateLiteral`, não uma
 * árvore de SQL. O que a AST dá, e é usado, é o recorte: só o texto de
 * templates com a tag `sql` entra na peneira, então um comentário ou uma string
 * de mensagem que cite "UPDATE contratos" não dispara.
 *
 * O que ela NÃO vê: SQL montado por concatenação (`sql.raw(alvo + " SET …")`) e
 * o nome da tabela vindo de variável. Hoje o repositório tem **zero** template
 * `sql` com verbo de escrita em qualquer tabela, quente ou fria.
 */
export function sqlCruEscrevendoEmTabelaQuente(): string[] {
  const achados: string[] = [];
  const verbo = /\b(insert\s+into|update|delete\s+from)\b/i;
  for (const sf of fontesVarridas()) {
    const rel = sf.fileName;
    const v = (no: ts.Node): void => {
      if (ts.isTaggedTemplateExpression(no) && raizDoReceptor(no.tag) === "sql") {
        const txt = no.template.getText(sf);
        if (verbo.test(txt)) {
          for (const q of TABELAS_QUENTES) {
            if (new RegExp(`\\b${NOMES_NO_BANCO[q]}\\b`, "i").test(txt)) {
              const linha = sf.getLineAndCharacterOfPosition(no.getStart(sf)).line + 1;
              achados.push(`${rel}:${linha} ${txt.replace(/\s+/g, " ").slice(0, 80)}`);
            }
          }
        }
      }
      no.forEachChild(v);
    };
    v(sf);
  }
  return achados;
}
