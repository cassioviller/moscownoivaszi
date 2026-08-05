import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { linkWhatsApp } from "./whatsapp";

/**
 * S37 — quem monta deep-link de WhatsApp é `lib/whatsapp.ts`, e é só ele.
 *
 * A sobra falava em DUAS cópias da régua "que podem divergir um dia". As duas
 * concordam: varrido todo comprimento de 0 a 16 dígitos, com e sem prefixo 55,
 * **zero divergências** entre `lib/whatsapp.ts` e o `viraLinkDeWhatsApp` do
 * servidor (`api-server/src/routes/equipe.ts`).
 *
 * A que estava errada era uma TERCEIRA, que ninguém tinha anotado:
 * `whatsappDigits`, em `pages/noivas/helpers.ts`, devolvia qualquer quantidade
 * de dígitos — sem DDI e sem faixa — e a ficha da noiva montava
 * `https://wa.me/${digitos}` com ela. **As 3 noivas com WhatsApp no banco de dev
 * têm 10–11 dígitos e nenhuma tem 55**: a ficha mandava para
 * `wa.me/11988887777`, que o WhatsApp lê como DDI 1 (Estados Unidos), enquanto
 * `/mensagens` montava `wa.me/5511988887777` para o MESMO campo `lead.whatsapp`.
 * Dois botões do mesmo sistema, para a mesma noiva, apontando para números
 * diferentes.
 *
 * Este teste não persegue a instância — ela já morreu. Ele defende a CLASSE: um
 * quarto lugar que volte a escrever a URL à mão reprova aqui, que é o único
 * jeito de a régua continuar sendo uma só. É a regra 22 do método — o defeito
 * morava ENTRE dois arquivos, e a varredura que os casa custa uma tarde.
 *
 * Lê o arquivo INTEIRO, nunca linha a linha: a S-D7 mostrou que varredura por
 * linha some quando o prettier quebra a linha do ofensor.
 */

const SRC = join(import.meta.dirname, "..");

/** O único arquivo autorizado a construir a URL. */
const DONO_DA_REGUA = "lib/whatsapp.ts";

function arquivosDeCodigo(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosDeCodigo(caminho));
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) {
      achados.push(caminho);
    }
  }
  return achados;
}

/** Comentário citando `wa.me` é prosa, e há dezenas dela — só o código conta. */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("S37 — a régua do wa.me é uma só", () => {
  it("nenhum arquivo fora de lib/whatsapp.ts constrói a URL do wa.me", () => {
    const ofensores = arquivosDeCodigo(SRC)
      .filter((caminho) => relative(SRC, caminho) !== DONO_DA_REGUA)
      .filter((caminho) => semComentarios(readFileSync(caminho, "utf8")).includes("wa.me/"))
      .map((caminho) => relative(SRC, caminho));

    expect(ofensores).toEqual([]);
  });

  it("o DDI nacional é prefixado, e é o que a ficha da noiva perdia", () => {
    // O caso literal do banco de dev: 11 dígitos, sem 55.
    expect(linkWhatsApp("(11) 98888-7777", "")).toBe("https://wa.me/5511988887777?text=");
    // A régua morta devolveria "11988887777" cru — DDI 1, Estados Unidos.
    expect(linkWhatsApp("(11) 98888-7777", "")).not.toContain("wa.me/11988887777?");
  });

  it("número implausível vira null, e a tela não renderiza link quebrado", () => {
    // 8 dígitos: fixo antigo sem DDD. A régua morta montava link mesmo assim.
    expect(linkWhatsApp("3333-4444", "")).toBeNull();
    expect(linkWhatsApp("", "")).toBeNull();
    expect(linkWhatsApp(null, "")).toBeNull();
  });

  it("quem já vem com DDI não ganha um segundo 55", () => {
    expect(linkWhatsApp("5511988887777", "")).toBe("https://wa.me/5511988887777?text=");
  });
});
