import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";
import * as contratoDeApi from "@workspace/api-client-react";
import {
  LeadOrigem,
  LeadInputOrigem,
  LeadEstadoCivil,
  LeadInputEstadoCivil,
  AtributoTipo,
  AtributoInputTipo,
  AtendimentoTipo,
  AtendimentoInputTipo,
  OrcamentoItemTipo,
  OrcamentoItemInputTipo,
  CaptacaoLeadInputOrigem,
} from "@workspace/api-client-react";

/**
 * S11 — os `z.enum` dos formulários não podem divergir do contrato.
 *
 * O D5 propunha DERIVAR os resolvers dos 12 formulários do `api-zod`, e a
 * medição do E96 derrubou a proposta por dois motivos que continuam de pé: o
 * schema gerado descreve o PAYLOAD e o formulário valida a SUPERFÍCIE DE
 * ENTRADA (`entrada`/`numParcelas` não existem no corpo da API), e importar o
 * barril de 261 KB / 539 schemas trocaria dívida de duplicação por dívida de
 * peso. O caminho barato que a sobra deixou escrito é este: **teste de
 * paridade**.
 *
 * ## S-C130 — a lista deixou de ser curada, e é o que este arquivo comprou
 *
 * `PARES` era escrito à mão, então a varredura enumerava **o que alguém
 * lembrou de escrever**, não os `z.enum` do repositório. O `estadoCivil` do
 * E215 — enum de SEIS valores, num formulário que a vendedora usa em toda
 * noiva — passou verde por não ter sido olhado, e só entrou porque quem
 * escreveu o épico foi conferir à mão. É a S-C33 e a S-C55 numa terceira
 * lista.
 *
 * Hoje a POPULAÇÃO sai do versionamento (`git ls-files`) e a PONTE — qual tipo
 * do contrato responde por cada campo — continua explícita, pelo mesmo motivo
 * que `TABELAS_DO_SCHEMA` continua explícita na S-C33: o compilador confere um
 * identificador importado e não confere uma string indexando um barril. O que
 * mudou é a direção da cobrança. **Enum novo num formulário não precisa mais
 * ser lembrado: ele reprova sozinho**, dizendo `arquivo#campo`, até alguém
 * declarar de que tipo do contrato ele é.
 *
 * O que uma divergência custa: o formulário recusa no cliente um valor que a
 * API aceita (a opção some da tela e ninguém sabe por quê), ou aceita um que a
 * API recusa (a vendedora preenche, salva, e leva 400 na cara da noiva). No
 * `estadoCivil` o preço é maior que nos quatro de cima: um valor a menos na
 * tela e a noiva DIVORCIADA não tem como ser qualificada, então o contrato dela
 * **não fecha** — e a mensagem seria sobre campo vazio, não sobre opção que
 * falta no select.
 *
 * ## O critério, declarado
 *
 * Um par entra na varredura quando as DUAS peneiras casam:
 *
 * 1. **A população** — TODO arquivo `.ts`/`.tsx` versionado de `src/` que não
 *    seja de teste. O plano da S-C130 dizia `pages/**`, e é estreito demais:
 *    `noiva-form.tsx` está em `pages/` hoje e nada o obriga a ficar lá — um
 *    formulário compartilhado nasce em `components/`, e um schema extraído
 *    nasce em `lib/` ou `hooks/`, invisíveis para uma varredura de `pages`.
 *    Recorte de pasta é decisão que apodrece; o recorte aqui é UM.
 *    **Arquivo de teste sai de propósito** — os autotestes abaixo escrevem
 *    `z.enum` SINTÉTICO, e varrer-se a si mesma faria a sonda achar o que ela
 *    própria plantou (é o erro que a S-C55 registra em "o detalhe que quase
 *    deixou o autoteste tautológico").
 * 2. **A grafia** — `campo: z.enum([` contíguo, com valores entre aspas. É
 *    DECLARAÇÃO DE CAMPO, não menção: nome de campo, dois-pontos, `z.enum([`.
 *
 * As duas peneiras se cobrem, e o caso que prova isso é este arquivo. A linha
 * do docblock de `enumsNoTexto` abaixo carrega ``z.enum([...])`` em prosa, e
 * uma varredura ingênua a conta como um sexto par fantasma. Ela cai pelas
 * DUAS: o arquivo é `.test.ts` (fora da população) **e** o que vem antes do
 * `z.enum(` é uma crase, não `campo:` (fora da grafia). Recusar por mais de um
 * motivo, e não por sorte de caminho, é o que se quer de uma sonda — a mesma
 * frase da S-C33 sobre as colunas de configuração do E222.
 *
 * **Exceção nomeada: nenhuma.** Os cinco `z.enum` de formulário do repositório
 * cabem na grafia e todos têm par no contrato — não houve defeito medido que
 * pedisse uma, e exceção sem defeito medido é a lista curada nascendo pela
 * outra ponta (S-C56).
 *
 * ## O que esta varredura NÃO faz
 *
 * ✘ Não adivinha QUAL tipo do contrato responde por um campo. `tipo` é o nome
 *   de três enums diferentes (`AtributoTipo`, `AtendimentoTipo`,
 *   `OrcamentoItemTipo`) entre os 98 exportados pelo contrato, e o formulário
 *   não importa nada de `@workspace/api-client-react` — não há de onde derivar
 *   o par. A ponte é declarada, e é PREGADA por três lados em CADA uma das duas
 *   colunas (S-C181): o nome resolve no barril, resolve para o MESMO objeto que
 *   o import trouxe, e termina no nome do campo em PascalCase — mais a
 *   conferência de que a entrada é entrada (`Input` no nome) e não a saída
 *   declarada duas vezes.
 * ✘ Não lê o schema do formulário: a leitura é TEXTUAL de propósito. Importar o
 *   schema exigiria montar o módulo da tela inteira — React, rotas e query —
 *   para conferir uma lista de strings.
 */

const SRC = join(import.meta.dirname, "..");

/** Um `campo: z.enum([...])` achado no fonte, com os valores já sem aspas. */
type SitioDeEnum = { arquivo: string; campo: string; valores: string[] };

/**
 * A grafia da peneira 2: nome de campo, dois-pontos, `z.enum([` contíguo.
 *
 * O `campo:` obrigatório é o que separa DECLARAÇÃO de MENÇÃO — e é ele que
 * mantém fora a prosa que cita ``z.enum([...])``, como esta linha aqui mesmo.
 */
const GRAFIA = /([A-Za-z_$][\w$]*)\s*:\s*z\.enum\(\[([^\]]*)\]/g;

/**
 * Os `campo: z.enum([...])` de um TEXTO — exportada para que os autotestes
 * possam provar que a peneira enxerga, no molde do `sqlCruNoTexto` da S-C55.
 * Peneira derivada e cega devolve `[]`, que é o mesmo `[]` de fonte limpo.
 */
export function enumsNoTexto(texto: string): { campo: string; valores: string[] }[] {
  const achados: { campo: string; valores: string[] }[] = [];
  for (const m of texto.matchAll(GRAFIA)) {
    const cru = m[2]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Valor sem aspas não é valor de `z.enum` — é `z.enum(VALORES)` espalhado,
    // um spread ou uma menção. Falha alto em vez de devolver lista torta: um
    // leitor que aprova o que não entendeu cala a paridade inteira.
    const valores = cru.map((v) => {
      const aspas = v.match(/^(["'])(.*)\1$/);
      if (!aspas) {
        throw new Error(
          `\`${m[1]}: z.enum([…])\` tem um valor que não é string literal: ${v}. ` +
            `A varredura lê o fonte TEXTUALMENTE e não sabe resolver isso.`,
        );
      }
      return aspas[2];
    });
    if (valores.length > 0) achados.push({ campo: m[1], valores });
  }
  return achados;
}

/** A população da peneira 1: o fonte versionado de `src/`, sem os testes. */
function arquivosDeFormulario(): string[] {
  return arquivosVersionados(SRC, ["."]).filter(
    (r) => /\.tsx?$/.test(r) && !r.includes(".test.") && !r.includes("__tests__"),
  );
}

/** Todos os `campo: z.enum([...])` dos formulários — a lista que era curada. */
function varrerFormularios(): SitioDeEnum[] {
  return arquivosDeFormulario().flatMap((arquivo) =>
    enumsNoTexto(readFileSync(join(SRC, arquivo), "utf8")).map((e) => ({ arquivo, ...e })),
  );
}

/**
 * A ponte: de que tipo do contrato cada campo é. É a única coisa escrita à mão
 * neste arquivo, e ela é conferida dos dois lados — ponte sem sítio reprova
 * ("ponte morta"), sítio sem ponte reprova, e o par declarado é confrontado
 * com o barril.
 *
 * ## S-C181 — a ponte tem DUAS colunas, porque o contrato tem duas famílias
 *
 * O spec gera, para cada campo, o enum de SAÍDA (`LeadOrigem` — o que o `GET`
 * devolve) e o de ENTRADA (`LeadInputOrigem` — o que o `POST` aceita), e nada
 * obriga os dois a dizerem o mesmo: **`CaptacaoLeadInputOrigem` tem 3 valores,
 * sem `LOJA`**, e é a prova de que o spec sabe estreitar enum de entrada. Até
 * a S-C181 a ponte declarava UMA família por campo — e misturava: `origem`
 * conferia contra a saída, `estadoCivil` contra a entrada. No dia em que um
 * `*Input*` de formulário estreitasse, a paridade contra a saída aprovaria
 * uma tela oferecendo valor que o `POST` recusa — a vendedora preencheria,
 * salvaria, e levaria 400 na cara da noiva. Hoje cada linha declara as duas, e
 * a varredura confere as duas.
 */
const PONTE = [
  {
    o_que: "a origem da noiva",
    arquivo: "pages/noivas/noiva-form.tsx",
    campo: "origem",
    nome: "LeadOrigem",
    doContrato: LeadOrigem,
    nomeEntrada: "LeadInputOrigem",
    daEntrada: LeadInputOrigem,
  },
  {
    o_que: "o tipo do atributo do catálogo",
    arquivo: "pages/catalogo/novo.tsx",
    campo: "tipo",
    nome: "AtributoTipo",
    doContrato: AtributoTipo,
    nomeEntrada: "AtributoInputTipo",
    daEntrada: AtributoInputTipo,
  },
  {
    o_que: "o tipo do compromisso na agenda",
    arquivo: "pages/atendimentos/novo.tsx",
    campo: "tipo",
    nome: "AtendimentoTipo",
    doContrato: AtendimentoTipo,
    nomeEntrada: "AtendimentoInputTipo",
    daEntrada: AtendimentoInputTipo,
  },
  {
    o_que: "o tipo do item do orçamento",
    arquivo: "pages/orcamentos/[id].tsx",
    campo: "tipo",
    nome: "OrcamentoItemTipo",
    doContrato: OrcamentoItemTipo,
    nomeEntrada: "OrcamentoItemInputTipo",
    daEntrada: OrcamentoItemInputTipo,
  },
  {
    // E215 — o quinto par. Ele entrou à mão porque a lista era curada; hoje a
    // varredura o teria cobrado sozinha, e é isto que a S-C130 comprou. Até a
    // S-C181 ele declarava só `LeadInputEstadoCivil` — a ENTRADA no lugar da
    // família única, o inverso do `origem` logo acima.
    o_que: "o estado civil de quem assina o contrato",
    arquivo: "pages/noivas/noiva-form.tsx",
    campo: "estadoCivil",
    nome: "LeadEstadoCivil",
    doContrato: LeadEstadoCivil,
    nomeEntrada: "LeadInputEstadoCivil",
    daEntrada: LeadInputEstadoCivil,
  },
] as const;

const chave = (x: { arquivo: string; campo: string }) => `${x.arquivo}#${x.campo}`;

const SITIOS = varrerFormularios();
const PAREADOS = SITIOS.map((s) => ({ sitio: s, ponte: PONTE.find((p) => chave(p) === chave(s)) }));

/** `estadoCivil` → `EstadoCivil`, para conferir o fim do nome do tipo. */
const emPascal = (campo: string) => campo.charAt(0).toUpperCase() + campo.slice(1);

describe("S11 — os enums do formulário e os do contrato dizem a mesma coisa", () => {
  for (const { sitio, ponte } of PAREADOS) {
    const nome = ponte ? `${ponte.o_que} — ${sitio.arquivo}` : `${chave(sitio)} — SEM PAR`;
    it(nome, () => {
      // Ordenados: o que importa é o CONJUNTO. Um valor novo no contrato que a
      // tela não oferece é tão defeito quanto o contrário, e nas duas direções
      // a lista some ou sobra sem ninguém ser avisado.
      expect(ponte, `${chave(sitio)} não tem tipo do contrato declarado em PONTE`).toBeDefined();
      const daTela = sitio.valores.slice().sort();
      expect(daTela, `${chave(sitio)} diverge da SAÍDA (${ponte!.nome})`).toEqual(
        Object.values(ponte!.doContrato).sort(),
      );
      // S-C181 — e contra a ENTRADA, que é a família que o POST julga: valor
      // que a tela oferece e o input não tem é 400 na cara da noiva.
      expect(daTela, `${chave(sitio)} diverge da ENTRADA (${ponte!.nomeEntrada})`).toEqual(
        Object.values(ponte!.daEntrada).sort(),
      );
    });
  }
});

describe("S-C130 — a população dos pares sai do repositório, não da memória", () => {
  it("a varredura enumera pelo versionamento, e olha para os 193 fontes de tela", () => {
    // Piso de população: `git ls-files` devolvendo pouco faria toda a paridade
    // passar por não ter olhado nada. Medido em 2026-08-14: 193 arquivos.
    // Piso, e não retrato — arquivo nasce em `src/` toda semana por motivo que
    // nada tem a ver com `z.enum`, e travar 193 cobraria remedida de quem
    // criou um `helpers/formatar-cpf.ts` (é o critério da S-C46). Quem cobre
    // esta direção com igualdade é o retrato dos sítios, abaixo.
    expect(arquivosDeFormulario().length).toBeGreaterThan(140);
  });

  it("o retrato é 5 z.enum de formulário, e crescer é uma decisão que se escreve", () => {
    // Igualdade, pelo critério da S-C46: este número é o que a varredura existe
    // para medir. Enum novo fica VERMELHO aqui, e vermelho é o único lugar onde
    // alguém escreve por que ele nasceu.
    expect(SITIOS.map(chave).sort()).toEqual([
      "pages/atendimentos/novo.tsx#tipo",
      "pages/catalogo/novo.tsx#tipo",
      "pages/noivas/noiva-form.tsx#estadoCivil",
      "pages/noivas/noiva-form.tsx#origem",
      "pages/orcamentos/[id].tsx#tipo",
    ]);
  });

  it("nenhum z.enum de formulário fica sem tipo do contrato declarado", () => {
    // A direção que a S-C130 fecha: o sexto enum nasce VISTO.
    expect(PAREADOS.filter((p) => !p.ponte).map((p) => chave(p.sitio))).toEqual([]);
  });

  it("e toda ponte declarada corresponde a um z.enum que existe — ponte morta é a lista curada de volta", () => {
    // A outra direção, e é ela que pega a sonda cega: se a peneira parar de
    // achar (grafia quebrada, `git ls-files` errado, campo reescrito em duas
    // linhas), SITIOS esvazia e o caso de cima segue verde. Este fica vermelho.
    const vivos = new Set(SITIOS.map(chave));
    expect(PONTE.filter((p) => !vivos.has(chave(p))).map(chave)).toEqual([]);
  });

  it("a ponte aponta para o tipo certo — o nome resolve no contrato e termina no nome do campo", () => {
    // A armadilha da S-C55 uma camada acima: trocar `doContrato: LeadOrigem`
    // por `ParcelaOrigem` TYPECHECKA, e a paridade passaria a conferir o enum
    // de outro domínio. O nome declarado fecha as três frestas — e desde a
    // S-C181 as DUAS colunas passam pela mesma conferência.
    const barril = contratoDeApi as unknown as Record<string, unknown>;
    for (const p of PONTE) {
      for (const [nome, objeto] of [
        [p.nome, p.doContrato],
        [p.nomeEntrada, p.daEntrada],
      ] as const) {
        expect(barril[nome], `${nome} não é exportado pelo contrato de API`).toBeDefined();
        expect(barril[nome], `${chave(p)} declara ${nome} e usa outro objeto`).toBe(objeto);
        expect(nome.endsWith(emPascal(p.campo)), `${nome} não termina em ${emPascal(p.campo)}`).toBe(
          true,
        );
      }
      // As duas colunas são famílias DIFERENTES: declarar a saída duas vezes
      // seria a coluna da entrada morta — verde por conferir a coisa errada.
      expect(p.nomeEntrada, `${chave(p)} declara a mesma família duas vezes`).not.toBe(p.nome);
      expect(
        p.nomeEntrada.includes("Input"),
        `${p.nomeEntrada} não é um tipo de ENTRADA — a família do POST leva Input no nome`,
      ).toBe(true);
    }
  });

  /**
   * S-C181 — a prova de que a coluna da entrada não é redundância: o spec SABE
   * estreitar enum de ENTRADA, e já o faz. `CaptacaoLeadInputOrigem` — o corpo
   * do `POST /captacao/leads`, o formulário público — aceita 3 origens e a
   * saída `LeadOrigem` tem 4: `LOJA` existe no que o sistema devolve e não no
   * que a captação aceita, porque quem chega pelo site não chegou pela loja.
   * No dia em que um campo de FORMULÁRIO fizer o mesmo, a paridade contra a
   * entrada fica vermelha — a antiga, contra a saída, aprovaria a tela
   * oferecendo o valor que o POST recusa.
   */
  it("S-C181: o spec estreita enum de entrada — a captação não aceita LOJA que a saída tem", () => {
    expect(Object.values(CaptacaoLeadInputOrigem).sort()).toEqual(["INSTAGRAM", "SITE", "WHATSAPP"]);
    expect(Object.values(LeadOrigem)).toContain("LOJA");
    expect(Object.values(CaptacaoLeadInputOrigem)).not.toContain("LOJA");
  });
});

describe("S-C130 — a peneira prova que enxerga, e que não vê o que não é campo", () => {
  it("acha a declaração de campo — é este achado que a lista curada não fazia", () => {
    expect(enumsNoTexto(`  tipo: z.enum(["ATENDIMENTO", "PROVA"]),`)).toEqual([
      { campo: "tipo", valores: ["ATENDIMENTO", "PROVA"] },
    ]);
  });

  it("acha os dois campos do mesmo arquivo, e o segundo com opções depois do array", () => {
    const texto = [
      `  origem: z.enum(["LOJA", "WHATSAPP"], { message: "Escolha de onde ela veio" }),`,
      `  estadoCivil: z.enum(["SOLTEIRA", "CASADA"]).optional(),`,
    ].join("\n");
    expect(enumsNoTexto(texto).map((e) => e.campo)).toEqual(["origem", "estadoCivil"]);
  });

  it("acha o campo cujo array está quebrado em várias linhas", () => {
    expect(enumsNoTexto(`tipo: z.enum([\n  "A",\n  "B",\n])`)[0]?.valores).toEqual(["A", "B"]);
  });

  it("NÃO conta a menção em prosa — é a armadilha que este próprio arquivo carrega", () => {
    // A primeira linha é o docblock que este arquivo carregava até a S-C130, e
    // era a SEXTA ocorrência de `z.enum([` do repositório — as outras cinco são
    // os formulários. `git grep "z.enum(\[" -- artifacts/moscow-noivas/src`
    // devolvia 6 sítios, e uma varredura ingênua contaria este como sexto par.
    // A segunda é a prosa do critério, que carrega a mesma armadilha hoje.
    const antes = "/** Os valores do `z.enum([...])` de um campo, lidos do arquivo da tela. */";
    const hoje = " * mantém fora a prosa que cita ``z.enum([...])``, como esta linha aqui mesmo.";
    expect(enumsNoTexto(antes)).toEqual([]);
    expect(enumsNoTexto(hoje)).toEqual([]);
  });

  it("NÃO conta o z.enum sem nome de campo antes", () => {
    expect(enumsNoTexto(`const Tipo = z.enum(["A", "B"]);`)).toEqual([]);
    expect(enumsNoTexto(`z.enum(["A"])`)).toEqual([]);
  });

  it("NÃO acha o campo escrito em `z` e `.enum` separados — e é por isso que a ponte morta existe", () => {
    // A grafia exige `z.enum(` contíguo, e o `noiva-form.tsx` tem um comentário
    // dizendo isso desde o E215. Quebrado assim, o sítio some da população — e
    // quem grita é o caso da ponte morta, não este.
    expect(enumsNoTexto(`tipo: z\n  .enum(["A", "B"])`)).toEqual([]);
  });

  it("o leitor falha alto quando o valor não é string literal, em vez de aprovar torto", () => {
    expect(() => enumsNoTexto(`tipo: z.enum([...VALORES])`)).toThrow(/não é string literal/);
  });

  it("a varredura reprova de verdade quando o formulário fica para trás", () => {
    // Um valor a menos no formulário é o caso real: o contrato ganha `ESTOQUE`
    // (E154) e a tela continua oferecendo quatro tipos.
    const doFormulario = ["VESTIDO", "ACESSORIO", "SERVICO", "AJUSTE"];
    expect(doFormulario.sort()).not.toEqual(Object.values(OrcamentoItemTipo).sort());
  });
});

/**
 * S-C180 — **a paridade prega o `z.enum` e é a lista RENDERIZADA que decide o
 * que a vendedora escolhe.**
 *
 * O caso medido: `atendimentos/novo.tsx` tinha o `z.enum` na linha 82 e uma
 * SEGUNDA cópia literal dos mesmos dois valores **406 linhas abaixo** —
 * `(["ATENDIMENTO", "PROVA"] as const).map` desenhando os botões — mais uma
 * terceira na guarda do prefill. Divergência hoje: zero nas três. No dia em que
 * `AtendimentoTipo` ganhasse um terceiro valor, a paridade cobraria a linha 82,
 * ela seria corrigida, **e os botões continuariam dois, verdes** — o preço que
 * a S-C130 descreve (a noiva DIVORCIADA que não fecha contrato) mora do lado
 * que ninguém pregava.
 *
 * O conserto tem as duas metades de sempre: a tela passou a DERIVAR a lista do
 * próprio schema (`agendarSchema.innerType().shape.tipo.options` — uma grafia
 * só), e esta varredura passou a reprovar a segunda cópia: **num arquivo que
 * declara `campo: z.enum([...])`, nenhuma lista literal `as const` pode
 * repetir o mesmo conjunto de valores.** A cópia idêntica de hoje é a
 * divergência de amanhã, e só a idêntica é detectável — depois de divergir,
 * ela é indistinguível de uma lista qualquer.
 */

/** As listas literais `["A", "B"] as const` de um texto — a grafia da oferta copiada. */
export function listasConstNoTexto(texto: string): string[][] {
  const grafia = /\[\s*((?:"[^"]*"|'[^']*')(?:\s*,\s*(?:"[^"]*"|'[^']*'))*)\s*,?\s*\]\s*as\s+const/g;
  const achados: string[][] = [];
  for (const m of texto.matchAll(grafia)) {
    achados.push(
      m[1]!.split(",").map((s) => s.trim().replace(/^(["'])(.*)\1$/, "$2")).filter(Boolean),
    );
  }
  return achados;
}

describe("S-C180 — a oferta da tela não é segunda cópia do z.enum", () => {
  it("nenhum arquivo com z.enum carrega uma lista literal `as const` com os mesmos valores", () => {
    const denuncias: string[] = [];
    for (const arquivo of new Set(SITIOS.map((s) => s.arquivo))) {
      const texto = readFileSync(join(SRC, arquivo), "utf8");
      const listas = listasConstNoTexto(texto);
      for (const sitio of SITIOS.filter((s) => s.arquivo === arquivo)) {
        const conjunto = sitio.valores.slice().sort().join("|");
        for (const lista of listas) {
          if (lista.slice().sort().join("|") === conjunto) {
            denuncias.push(
              `${arquivo}: lista literal \`as const\` repete os valores de \`${sitio.campo}\` — ` +
                `derive-a do schema (\`.innerType().shape.${sitio.campo}.options\`), senão o ` +
                `valor novo chega ao z.enum e não chega aos botões.`,
            );
          }
        }
      }
    }
    expect(denuncias).toEqual([]);
  });

  it("a peneira da oferta enxerga — o exemplo plantado é achado", () => {
    // S-C55: peneira derivada e cega devolve `[]`, que é o mesmo `[]` de fonte
    // limpo. O exemplo é SINTÉTICO e mora num literal deste teste — o arquivo
    // está fora da população da varredura de cima por ser `.test.ts`.
    expect(listasConstNoTexto(`{(["ATENDIMENTO", "PROVA"] as const).map((t) => (`)).toEqual([
      ["ATENDIMENTO", "PROVA"],
    ]);
    expect(listasConstNoTexto(`const CANAIS = ['ZAP', 'FONE'] as const;`)).toEqual([
      ["ZAP", "FONE"],
    ]);
  });

  it("e NÃO conta o que não é lista literal de strings", () => {
    // `as const` sobre objeto, array de identificadores, array sem `as const`:
    // nenhum é a grafia da oferta copiada.
    expect(listasConstNoTexto(`const x = { a: 1 } as const;`)).toEqual([]);
    expect(listasConstNoTexto(`const y = [TIPO_A, TIPO_B] as const;`)).toEqual([]);
    expect(listasConstNoTexto(`const z = ["solta"];`)).toEqual([]);
  });
});
