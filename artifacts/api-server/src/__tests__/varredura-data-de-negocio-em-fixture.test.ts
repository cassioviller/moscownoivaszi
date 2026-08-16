import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ancoraDeNegocio, diaDeNegocio, reancorarDataDeNegocio } from "@workspace/financeiro-core";

/**
 * **S-O119 — fixture que grava direto no banco imita a porta, ou mente sobre
 * ela.**
 *
 * A S-O117 (E197) fez toda porta ancorar `casamentoData` ao meio-dia de São
 * Paulo, e por isso o dia UTC e o dia da loja passaram a ser o mesmo. Quem
 * escreve **direto no banco** não passa por porta nenhuma: fixture de teste e
 * `global-setup` do E2E gravam o que quiserem, e o instante que fabricam carrega
 * a HORA em que a suíte rodou.
 *
 * O sintoma medido: entre 00:00 e 03:00 UTC — 21h à meia-noite em SP — o dia UTC
 * já virou e `hojeLocal()` não, então toda data fabricada "a N dias de hoje" é
 * lida como `N+1`. A suíte do frontend reprovava três horas por noite e passava
 * nas outras 21.
 *
 * ## Por que esta varredura é ESTREITA de propósito
 *
 * A tentação é varrer a fabricação: *"teste que faz `new Date()` e chama
 * `.toISOString()`"*. **Medido, isso dá 32 arquivos e ~55 sítios**, e quase
 * todos são carimbo de tempo LEGÍTIMO — a hora de um pagamento, a linha de uma
 * trilha, o `createdAt` de uma auditoria. Ali o instante é o certo, e listá-los
 * seria a doença da S-O83: errar para mais pede julgamento a mais e nunca
 * dispensa o julgamento devido.
 *
 * O que separa o defeito do carimbo não é a fabricação — **é o campo que
 * recebe**. `casamentoData` e `dataCasamento` são data de NEGÓCIO: o servidor as
 * lê com `diaDeNegocio`, e o dia delas é o dia UTC do que foi gravado. Então a
 * régua pergunta uma coisa só: *alguma escrita DIRETA (fora de porta) põe um
 * instante não ancorado num campo de data de negócio?*
 */

const RAIZ = execSync("git rev-parse --show-toplevel").toString().trim();

/** Os campos que o servidor lê como DIA, não como instante. */
const CAMPOS_DE_NEGOCIO = ["casamentoData", "dataCasamento"] as const;

/**
 * Os arquivos que escrevem no banco sem passar por porta: os helpers de fixture
 * da suíte de API e o `global-setup` do E2E. Um spec que chame `POST` está
 * coberto pela âncora do E197 e não entra aqui.
 *
 * **E247 (G5 da conferência) — a lista era CURADA (dois arquivos), e o
 * `e2e/52` fazia `db.insert(leadsTable)` com `casamentoData` fora dela.** A
 * lista passa a ser DERIVADA do versionamento: todo teste ou fixture que
 * insere direto numa tabela com data de negócio entra, e os dois curados são o
 * piso (a régua da régua abaixo continua conferindo que existem). O que se
 * examina em cada arquivo é só a SENTENÇA de escrita direta (`.insert(` na
 * vizinhança acima), porque um payload de `POST` no mesmo arquivo é coberto
 * pela âncora da porta (E197) — e o `lote3` tem dezenas deles.
 */
const CURADOS = ["artifacts/api-server/src/__tests__/helpers.ts", "e2e/global-setup.ts"];
const TABELAS_COM_DATA_DE_NEGOCIO = /\.insert\((leadsTable|reservasTable|bloqueioVestidosTable)\)/;
function escritoresDiretos(): string[] {
  // O recorte é o das FIXTURES de teste (E2E e suíte de API). `scripts/` fica
  // fora de propósito: a demo (`loja-de-demonstracao.ts`) escreve às 16:00 SP
  // por `emDias(n, 16, 0)` — mesmo dia em SP e em UTC, ancorada de fato e fora
  // da gramática desta régua; ela tem as próprias réguas (S-C75, trancas).
  const versionados = execSync("git ls-files -- e2e artifacts/api-server/src/__tests__", { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter((r) => r.endsWith(".ts") && !r.endsWith(".d.ts"));
  const derivados = versionados.filter((rel) => TABELAS_COM_DATA_DE_NEGOCIO.test(readFileSync(join(RAIZ, rel), "utf8")));
  return [...new Set([...CURADOS, ...derivados])].sort();
}
const ESCRITORES_DIRETOS = escritoresDiretos();

function linhas(rel: string): { n: number; texto: string }[] {
  return readFileSync(join(RAIZ, rel), "utf8")
    .split("\n")
    .map((texto, i) => ({ n: i + 1, texto }));
}

describe("varredura — data de negócio escrita direto no banco (S-O119)", () => {
  it("os escritores diretos existem, e a lista não envelheceu em silêncio", () => {
    // Régua da régua: se um destes arquivos for renomeado, a varredura passa a
    // não varrer nada e ficaria verde por vacuidade — que é a regra 34.
    for (const rel of CURADOS) {
      expect(() => readFileSync(join(RAIZ, rel), "utf8"), `${rel} sumiu`).not.toThrow();
    }
    // E247 (G5): a lista derivada contém os curados e alcança quem insere direto
    // fora deles — o `e2e/52` é o que a lente achou; se ele parar de inserir
    // direto, esta linha muda com ele.
    for (const rel of CURADOS) expect(ESCRITORES_DIRETOS).toContain(rel);
    expect(ESCRITORES_DIRETOS).toContain("e2e/52-orcamento-vira-contrato.spec.ts");
    expect(ESCRITORES_DIRETOS.length).toBeGreaterThan(CURADOS.length);
  });

  it("toda escrita direta de data de negócio passa por âncora", () => {
    const semAncora: string[] = [];
    /**
     * S-C260 — **o piso, que a guarda acima parecia dar e não dava.**
     *
     * A régua da régua confere que os dois arquivos EXISTEM; não confere que a
     * varredura ache algo dentro deles. Renomeie `casamentoData` para
     * `dataDoCasamento` nos dois e esta varredura passa a examinar zero
     * sentenças, com `semAncora` vazio e verde — os arquivos estão lá, e ela
     * não olhou para nada. É a S-C46 um degrau abaixo de onde a regra 34 olha:
     * lá o risco é o arquivo sumir, aqui é o CAMPO sumir.
     *
     * O piso é sobre o que ela examinou, não sobre o que denunciou.
     */
    let sentencasExaminadas = 0;

    for (const rel of ESCRITORES_DIRETOS) {
      const todas = linhas(rel);
      for (const { n, texto } of todas) {
        const campo = CAMPOS_DE_NEGOCIO.find((c) => new RegExp(`\\b${c}\\s*:`).test(texto));
        if (!campo) continue;
        // Declaração de tipo (`casamentoData: Date`) não é escrita.
        if (/:\s*(Date|string)\b/.test(texto)) continue;
        // E247 (G5): só a ESCRITA DIRETA — o `.insert(` tem de estar na
        // vizinhança acima (até 12 linhas). Payload de `POST` no mesmo arquivo
        // é coberto pela âncora da porta (E197), e nos curados TODA sentença
        // continua sendo examinada (eles só escrevem direto).
        if (!CURADOS.includes(rel)) {
          const acima = todas.slice(Math.max(0, n - 13), n - 1).map((l) => l.texto).join(" ");
          if (!/\.insert\(/.test(acima)) continue;
        }
        sentencasExaminadas++;
        /**
         * A SENTENÇA, não a linha. O valor pode ser um ternário quebrado em
         * quatro linhas — foi o que aconteceu ao abrir a saída
         * `ancorarCasamento: false`, e a varredura acusou o próprio conserto
         * (mesma forma do E194). Ler só a linha do campo mediria a formatação,
         * não a conta.
         */
        const sentenca = todas
          .slice(n - 1, n + 3)
          .map((l) => l.texto)
          .join(" ");
        // A âncora pode vir na sentença, ou de uma variável já ancorada — que é
        // o caso do `global-setup`, onde `casamento` é ancorado acima.
        const ancorado = /reancorarDataDeNegocio|ancoraDeNegocio|T12:00:00-03:00/.test(sentenca);
        const viaVariavelAncorada = /casamentoData:\s*(casamento|candidato\.casamentoData)\b/.test(sentenca);
        if (!ancorado && !viaVariavelAncorada) semAncora.push(`${rel}:${n} — ${texto.trim()}`);
      }
    }

    expect(
      sentencasExaminadas,
      "a varredura não achou uma única escrita de data de negócio nos escritores diretos — " +
        "o campo foi renomeado, ou o recorte de `CAMPOS_DE_NEGOCIO` envelheceu. " +
        "Verde aqui seria verde por não ter olhado (S-C46/S-C260).",
    ).toBeGreaterThan(3);

    expect(semAncora, `escrita direta de data de NEGÓCIO sem âncora:\n${semAncora.join("\n")}`)
      .toEqual([]);
  });

  it("a âncora é a mesma dos dois lados — a do E2E é escrita à mão e tem de bater", () => {
    // O `global-setup` não pode importar `@workspace/financeiro-core` (roda
    // antes de qualquer build de workspace), então repete a conta. Aqui ela é
    // conferida contra a original, para as duas não divergirem em silêncio.
    const dia = "2028-09-05";
    const daCasa = ancoraDeNegocio(dia);
    const doE2E = new Date(`${dia}T12:00:00-03:00`);
    expect(doE2E.toISOString()).toBe(daCasa.toISOString());
    expect(daCasa.toISOString()).toBe("2028-09-05T15:00:00.000Z");
  });

  it("ancorada, a data lê o MESMO dia pelas duas réguas — a qualquer hora", () => {
    // O defeito em uma linha: sem âncora, estas duas leituras discordam durante
    // três horas por noite. Com âncora, nunca.
    const naVirada = new Date("2026-08-13T02:30:00.000Z"); // 23:30 de 12/08 em SP
    const diaDaLoja = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
      .format(naVirada);

    expect(diaDeNegocio(naVirada)).toBe("2026-08-13");
    expect(diaDaLoja).toBe("2026-08-12");

    const ancorada = reancorarDataDeNegocio(ancoraDeNegocio(diaDaLoja));
    expect(diaDeNegocio(ancorada)).toBe(diaDaLoja);
    expect(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(ancorada))
      .toBe(diaDaLoja);
  });
});
