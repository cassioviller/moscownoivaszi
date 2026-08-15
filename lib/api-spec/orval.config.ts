import { defineConfig, InputTransformerFn } from "orval";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..", "..");
const apiClientReactSrc = path.resolve(root, "lib", "api-client-react", "src");
const apiZodSrc = path.resolve(root, "lib", "api-zod", "src");

/**
 * **S-C281 — a coerção de data passa a recusar `null`.**
 *
 * `coerce: { body: ['date'], response: ['date'] }`, logo abaixo, faz o orval
 * escrever `zod.coerce.date()` em **916 campos**. A coerção é `new Date(v)`, e
 * `new Date(null)` é a época: um `null` no corpo virava `01/01/1970` com 200 OK
 * — medido gravando um pagamento de R$ 1.000,00 em `parcelas.recebido_em` e um
 * casamento em `contratos.data_casamento`. O porquê inteiro, com a tabela das
 * três grafias, está em `lib/api-zod/src/data-do-corpo.ts`.
 *
 * A troca não cabia no spec (nenhuma construção do OpenAPI diz *"aceite
 * string, recuse nulo"* depois da coerção ligada) e não cabia em 139 portas
 * (cada rota faz seu próprio `safeParse`). Cabia num lugar só: **aqui**, entre
 * o orval escrever e o arquivo existir.
 *
 * O gesto é textual de propósito — uma troca de chamada por chamada, sem tocar
 * na forma de nada. Ele roda dentro do `orval`, e não dentro do script
 * `codegen`, porque a `varredura-codegen-em-dia` (S-C152) invoca o **orval
 * direto**: pendurar a peneira no script npm a faria acusar drift em toda
 * rodada. O `injectGeneratedDirsAndFiles: false` é o que permite receber a
 * função sem os argumentos de diretório, que não usamos.
 */
const CHAMADA_CRUA = "zod.coerce.date()";
const CHAMADA_PENEIRADA = "dataDoCorpo()";
const IMPORT_DA_PENEIRA = `import { dataDoCorpo } from '../data-do-corpo';`;

function peneirarDatasDoGerado() {
  const alvo = path.join(apiZodSrc, "generated", "api.ts");
  const antes = fs.readFileSync(alvo, "utf8");
  if (!antes.includes(CHAMADA_CRUA)) return;

  const depois = antes
    .replace(/^import \* as zod from 'zod';$/m, (linha) => `${linha}\n${IMPORT_DA_PENEIRA}`)
    .split(CHAMADA_CRUA)
    .join(CHAMADA_PENEIRADA);

  fs.writeFileSync(alvo, depois);
}

// Our exports make assumptions about the title of the API being "Api" (i.e. generated output is `api.ts`).
const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";

  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiClientReactSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      // S-D44: aqui vivia `prettier: true`, opção que o orval 8 não conhece —
      // o runtime lê só `formatter` e ignorava a linha em silêncio. Os
      // `generated/` commitados são o produto SEM formatação (o codegen de
      // 2026-08-07 os reproduz byte a byte), então a config passou a dizer a
      // verdade em vez de ligar o que estava desligado: `formatter:
      // "prettier"` reformataria 232 arquivos (+27.888/−21.341) que as
      // varreduras do repositório leem (regra 13). Ligar é decisão — S-D48.
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
        },
        mutator: {
          path: path.resolve(apiClientReactSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
  zod: {
    input: {
      target: "./openapi.yaml",
      override: {
        transformer: titleTransformer,
      },
    },
    output: {
      workspace: apiZodSrc,
      client: "zod",
      target: "generated",
      schemas: { path: "generated/types", type: "typescript" },
      mode: "split",
      clean: true,
      // S-D44: mesma história do bloco acima — `prettier: true` morto, e
      // ligar `formatter` é a decisão da S-D48, não um default recuperado.
      override: {
        zod: {
          coerce: {
            query: ['boolean', 'number', 'string'],
            param: ['boolean', 'number', 'string'],
            body: ['bigint', 'date'],
            response: ['bigint', 'date'],
          },
        },
        useDates: true,
        useBigInt: true,
      },
    },
    // S-C281 — a peneira do `null` que virava 1970, aplicada ao gerado.
    hooks: {
      afterAllFilesWrite: {
        command: peneirarDatasDoGerado,
        injectGeneratedDirsAndFiles: false,
      },
    },
  },
});
