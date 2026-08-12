import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ACOES_AUDITORIA, ROTULO_ACAO, rotuloDaAcao } from "@workspace/financeiro-core";
import { ACOES_FILTRAVEIS, acaoFiltravel } from "./auditoria";

/**
 * S-O1 → **S-O52: o espelho virou uma coisa só, e a varredura mudou de
 * pergunta.**
 *
 * O E178 fez esta varredura porque havia DOIS mapas de rótulos — o do servidor,
 * que rotula o CSV da contadora, e o da tela — e nada no compilador os ligava.
 * Ela pregava as CHAVES nas três direções e pegou seis ações que a trilha
 * gravava sem rótulo na tela.
 *
 * **O que ela não pregava eram os VALORES, e três dos 43 divergiam.** Medido em
 * 2026-08-12, antes da consolidação:
 *
 * | Ação | CSV | Tela |
 * |---|---|---|
 * | `CARNE_COMPLETADO` | "Carnê completado (parcelas que faltavam)" | "Carnê completado" |
 * | `USUARIO_EXCLUIDO` | "Pessoa excluída do cadastro (ato global)" | "Usuário excluído do sistema" |
 * | `LOJA_EXCLUIDA` | "Loja excluída (ato global)" | "Loja excluída do sistema" |
 *
 * *"Chamar a mesma coisa pelo mesmo nome"* é o pacto que o E47 escreveu, e ele
 * estava quebrado em três linhas — a contadora procurando "Loja excluída do
 * sistema" na planilha não acha nada.
 *
 * Com o mapa em `@workspace/financeiro-core` (E186), a igualdade deixa de
 * precisar de régua: **é o mesmo objeto**. Esta varredura passa a guardar o que
 * ainda pode voltar a divergir — que ninguém escreva o SEGUNDO mapa —, e a
 * cobrar o resto do desenho: a lista de filtro derivada e a tolerância a ação
 * desconhecida, que é decisão e não descuido.
 *
 * **Enumera pelo versionamento**, a régua da casa.
 */

const RAIZ = path.resolve(__dirname, "..", "..", "..", "..", "..");

/** Os arquivos-fonte em que um segundo `ROTULO_ACAO` da trilha caberia. */
function fontesVersionadas(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "artifacts/api-server/src", "artifacts/moscow-noivas/src", "lib"],
    { cwd: RAIZ, encoding: "utf8" },
  )
    .split("\n")
    .filter((f) => /\.tsx?$/.test(f) && !f.includes("/generated/"));
}

describe("varredura — a trilha tem UMA lista de rótulos (S-O1, S-O52)", () => {
  it("olha para uma união de verdade — não para uma lista vazia", () => {
    expect(ACOES_AUDITORIA.length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(ROTULO_ACAO)).toHaveLength(ACOES_AUDITORIA.length);
  });

  /**
   * A pergunta nova. O mapa único não impede alguém de escrever o segundo — foi
   * exatamente assim que o primeiro nasceu, num arquivo de tela que precisava
   * do nome e não podia importar o servidor. Hoje pode: `financeiro-core` é
   * consumido pelos dois lados.
   */
  it("existe UM mapa de rótulos da trilha em todo o repositório", () => {
    const fontes = fontesVersionadas();
    expect(fontes.length, "a enumeração veio vazia").toBeGreaterThanOrEqual(200);

    const donos = fontes.filter((f) => {
      const texto = readFileSync(path.join(RAIZ, f), "utf8");
      // A assinatura de um mapa da TRILHA: declara `ROTULO_ACAO` e nomeia pelo
      // menos uma ação de auditoria dentro dele. O `ROTULO_ACAO` de
      // `tour-acesso.tsx` (ver/criar/editar) é outro assunto e não casa.
      return /(export )?const ROTULO_ACAO[^=]*=\s*\{/.test(texto) && texto.includes("PARCELA_RECEBIDA:");
    });
    expect(donos, "nasceu um segundo mapa de rótulos — a trilha volta a ter dois nomes").toEqual([
      "lib/financeiro-core/src/auditoria.ts",
    ]);
  });

  /**
   * A união e o mapa andam juntos pelo TypeScript (`Record<AcaoAuditoria,
   * string>`), então esta direção não pode falhar por construção. Ela fica
   * porque é o que a S-O1 mediu — seis ações gravadas sem rótulo — e porque é o
   * que se lê para saber que a garantia existe.
   */
  it("toda ação que o servidor GRAVA tem rótulo, e não há rótulo órfão", () => {
    expect(Object.keys(ROTULO_ACAO).sort()).toEqual([...ACOES_AUDITORIA].sort());
    for (const acao of ACOES_AUDITORIA) {
      expect(ROTULO_ACAO[acao].length, acao).toBeGreaterThan(3);
      // Rótulo é frase de gente, não o código cru com espaços.
      expect(ROTULO_ACAO[acao], acao).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it("e toda ação com rótulo é oferecida no filtro", () => {
    expect([...ACOES_FILTRAVEIS].sort()).toEqual(Object.keys(ROTULO_ACAO).sort());
  });

  /**
   * S-O52 — **a decisão que tinha de sobreviver à consolidação.**
   *
   * O mapa da tela era frouxo de propósito: *"ação nova nasce no servidor, e
   * tela velha lendo trilha nova não pode quebrar"*. O mapa ficou fechado, e a
   * tolerância mudou para `rotuloDaAcao` — que é onde o valor desconhecido de
   * verdade chega, porque o `acao` de uma linha do banco é `string`.
   */
  it("ação que a tela não conhece volta como o código cru, e não como vazio", () => {
    expect(rotuloDaAcao("ACAO_QUE_AINDA_NAO_EXISTE")).toBe("ACAO_QUE_AINDA_NAO_EXISTE");
    expect(rotuloDaAcao("PARCELA_RECEBIDA")).toBe("Parcela recebida");
    // E o filtro segue recusando o que o select não oferece: a URL é editável.
    expect(acaoFiltravel("ACAO_QUE_AINDA_NAO_EXISTE")).toBeUndefined();
    expect(acaoFiltravel("PARCELA_RECEBIDA")).toBe("PARCELA_RECEBIDA");
  });
});
