import * as zod from "zod";

/**
 * **S-C281 — `null` não é uma data, e a coerção do zod discordava.**
 *
 * O `orval.config.ts` liga a coerção de datas no corpo e na resposta
 * (`coerce: { body: ['bigint','date'], response: [...] }`), e o gerado sai com
 * `zod.coerce.date()` em **916 campos**. A coerção é `new Date(entrada)`, e
 * `new Date(null)` é **01/01/1970** — a época, silenciosa e válida.
 *
 * O preço medido, na porta, com dinheiro:
 *
 * - `POST /parcelas/:id/receber` com `recebidoEm: null` respondia **200** e
 *   gravava `parcelas.recebido_em = 1970-01-01T00:00:00Z` — e é por esse
 *   instante que o caixa realizado DATA a entrada. O campo é `required` no
 *   spec (`openapi.yaml:7694`): a coerção passava por cima da obrigatoriedade,
 *   porque quem produz a época roda ANTES de qualquer `.optional()`.
 * - `PATCH /contratos/:id` com `dataCasamento: null` num contrato sem reserva
 *   vinculada gravava o casamento em `1970-01-01T15:00:00Z` — a época ancorada
 *   ao meio-dia de São Paulo pelo E197, que é o detalhe que prova que ela
 *   atravessou o sistema inteiro como se fosse um dia de verdade.
 *
 * A S-C232 fechou UM sítio desta classe tornando dois campos `nullable` no
 * spec. Não dava para repetir o gesto 31 vezes: **nullable é para o campo em
 * que `null` é um GESTO** (apagar a data), e na maioria deles não é — quem não
 * tem a data OMITE o campo. O que faltava era a coerção recusar o que não é
 * data, e isso o spec não sabe dizer: nenhuma construção do OpenAPI se traduz
 * em *"aceite string, recuse nulo"* depois que a coerção está ligada.
 *
 * Por isso o dono mudou de lugar, como na S-C170 e no E221: a peneira desceu
 * para DENTRO da coerção, num helper só, e o codegen passa a escrever
 * `dataDoCorpo()` onde escrevia `zod.coerce.date()`
 * (`lib/api-spec/orval.config.ts`, hook `afterAllFilesWrite`). Campo de data
 * novo nasce peneirado sem ninguém lembrar.
 *
 * **As três formas continuam dizendo o que diziam**, medido antes de escrever:
 *
 * | grafia | `null` | `undefined` | ISO |
 * |---|---|---|---|
 * | `dataDoCorpo()` | **recusa** | recusa | `Date` |
 * | `dataDoCorpo().optional()` | **recusa** | passa | `Date` |
 * | `dataDoCorpo().nullish()` | **`null`** | passa | `Date` |
 *
 * A última linha é a que preserva a S-C232: onde `null` É o gesto, o campo é
 * `nullable` no spec, o `.nullish()` curto-circuita antes da peneira, e apagar
 * a data segue funcionando. A peneira só morde onde o spec já dizia que nulo
 * não era valor — e onde, até hoje, ele virava 1970 em silêncio.
 */
export function dataDoCorpo() {
  return zod
    .any()
    .refine((v) => v !== null, {
      message:
        "nulo não é uma data — omita o campo, ou declare-o nullable no spec se apagar for um gesto",
    })
    .pipe(zod.coerce.date());
}
