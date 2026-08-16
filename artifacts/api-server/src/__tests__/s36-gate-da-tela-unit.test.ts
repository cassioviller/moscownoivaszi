import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arquivosVersionados } from "./arquivos-versionados";

/**
 * S36 — a tela pede o MESMO módulo que o servidor guarda.
 *
 * O defeito do E111: `cobranca.tsx` e `receber.tsx` gateavam botões por
 * `financeiro.editar` enquanto o servidor guarda aquelas ações por `leads`.
 * Quem tinha o acesso certo via a tela sem o botão; quem não tinha via o botão e
 * levava 403. **Nenhuma das duas pessoas descobre o porquê** — para uma, o botão
 * nunca existiu; para a outra, o erro fala de um módulo que ela não pediu.
 *
 * Teste de componente não pega esta classe (ele prega o que a tela faz, não se
 * ela pede o módulo certo) e E2E só pega com perfil customizado, porque nos
 * quatro perfis padrão quem chega ao financeiro tem tudo. O que pega é cruzar as
 * duas pontas, e as duas são legíveis:
 *
 * 1. o servidor declara `router.use("<prefixo>", requireModulo("<módulo>"))`;
 * 2. o cliente gerado declara a URL de cada operação (`get<Op>Url`);
 * 3. a tela declara o que gateia (`podeNoModulo(…, "<módulo>", …)`).
 *
 * **VERMELHO ANTES: dois achados, e o primeiro era vivo num perfil PADRÃO.**
 * `atendimentos/novo.tsx` gateava por `agenda` e chamava `POST /bloqueios`, que
 * é `vestidos` — a Recepção (`agenda: TUDO`, `vestidos: SO_VER`) via o botão
 * "Criar reserva" e levava 403. E `comissoes/index.tsx` gateava por `admin` três
 * ações que o servidor guarda por `comissao`.
 */

const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");

/**
 * O que o SERVIDOR exige, por prefixo de caminho. A enumeração sai do
 * versionamento, não do disco (S-D30) — esta é a varredura que o METODO cita
 * como exemplar da regra 22, e ela enumerava as DUAS pontas pelo disco.
 */
function modulosPorPrefixo(): { caminho: string; modulo: string }[] {
  const achados: { caminho: string; modulo: string }[] = [];
  for (const arquivo of arquivosVersionados(RAIZ, ["artifacts/api-server/src/routes"])) {
    const src = readFileSync(join(RAIZ, arquivo), "utf8");
    for (const m of src.matchAll(/router\.use\(\s*"([^"]+)"[^)]*requireModulo\(\s*"(\w+)"/g)) {
      achados.push({ caminho: m[1], modulo: m[2] });
    }
  }
  // Mais específico primeiro: `/lojas/:id/financeiro/contas-pagar` antes de
  // `/lojas/:id/financeiro`.
  return achados.sort((a, b) => b.caminho.length - a.caminho.length);
}

/** Operação do cliente gerado → módulo que o servidor exige na URL dela. */
function moduloPorOperacao(): Map<string, string> {
  const cli = readFileSync(
    join(RAIZ, "lib", "api-client-react", "src", "generated", "api.ts"),
    "utf8",
  );
  const prefixos = modulosPorPrefixo();
  const mapa = new Map<string, string>();
  for (const m of cli.matchAll(/export const get(\w+)Url = [^}]*?return `([^`]+)`/gs)) {
    const operacao = m[1][0].toLowerCase() + m[1].slice(1);
    const caminho = m[2].replace(/\$\{[^}]+\}/g, ":p").replace(/^\/api/, "");
    const dono = prefixos.find((p) => caminho.startsWith(p.caminho.replace(/:\w+/g, ":p")));
    if (dono) mapa.set(operacao, dono.modulo);
  }
  return mapa;
}

/**
 * O que ESCREVE. Só as mutações interessam: uma tela lista o que a pessoa pode
 * ver por outros caminhos, e leitura sem gate é decisão de produto — o defeito
 * desta classe é oferecer um BOTÃO que o servidor recusa.
 */
const VERBOS_QUE_ESCREVEM =
  /^(create|update|delete|set|add|remove|gerar|pagar|receber|estornar|cancelar|marcar|reenviar|aceitar|desfazer|rotacionar|aplicar|fechar|reabrir|enviar|importar|anonimizar|cobrar|run|executar|baixar|gravar)/i;

/** A outra ponta, também pelo versionamento (S-D30). Caminhos absolutos. */
function telas(): string[] {
  return arquivosVersionados(RAIZ, ["artifacts/moscow-noivas/src/pages"])
    .filter((relativo) => relativo.endsWith(".tsx") && !relativo.includes(".test."))
    .map((relativo) => join(RAIZ, relativo));
}

describe("S36 — o gate da tela e o guard do servidor pedem o mesmo módulo", () => {
  it("nenhuma tela gateia por um módulo e chama mutação de outro", () => {
    const porOperacao = moduloPorOperacao();
    // Se este número desabar, o casamento URL↔prefixo quebrou (mudou o formato
    // do cliente gerado, por exemplo) e a varredura estaria passando por vazio.
    expect(porOperacao.size).toBeGreaterThan(100);

    const suspeitos: string[] = [];
    for (const arquivo of telas()) {
      const src = readFileSync(arquivo, "utf8");
      const gates = new Set(
        [...src.matchAll(/podeNoModulo\([^,]+,\s*"(\w+)"/g)].map((m) => m[1]),
      );
      // Tela sem gate nenhum não está afirmando nada — é outra conversa (e há
      // telas assim de propósito, abertas a qualquer sessão com loja).
      if (gates.size === 0) continue;

      const modulosQueEscreve = new Set<string>();
      for (const m of src.matchAll(/\buse([A-Z]\w+)\b/g)) {
        const operacao = m[1][0].toLowerCase() + m[1].slice(1);
        const modulo = porOperacao.get(operacao);
        if (modulo && VERBOS_QUE_ESCREVEM.test(operacao)) modulosQueEscreve.add(modulo);
      }

      for (const modulo of modulosQueEscreve) {
        if (!gates.has(modulo)) {
          suspeitos.push(
            `${arquivo.replace(RAIZ + "/", "")} — gateia por [${[...gates]}] e escreve em [${modulo}]`,
          );
        }
      }
    }

    // Se isto reprovar: a tela está pedindo um módulo e o servidor outro. O
    // conserto é quase sempre na TELA — o servidor é a autoridade —, e ele tem
    // duas formas: gatear também pelo módulo que falta, ou não oferecer o botão
    // a quem não pode. Mudar o servidor para caber na tela é a saída errada:
    // ela afrouxa a permissão para calar um teste.
    expect(suspeitos).toEqual([]);
  });

  it("o mapa liga as duas pontas de verdade — as âncoras conhecidas", () => {
    const porOperacao = moduloPorOperacao();
    // Uma de cada módulo, escolhidas por serem óbvias na leitura do roteador.
    expect(porOperacao.get("createBloqueio")).toBe("vestidos");
    expect(porOperacao.get("createAtendimento")).toBe("agenda");
    expect(porOperacao.get("baixarEstornoComissao")).toBe("comissao");
    expect(porOperacao.get("updateDadosDaLoja")).toBe("admin");
    // E a especificidade importa: contas-pagar é `financeiro`, não o prefixo
    // mais curto que casaria por acidente.
    expect(porOperacao.get("createContaPagar")).toBe("financeiro");
  });

  /**
   * S40 — a fresta do primeiro caso: tela sem gate NENHUM era "outra conversa"
   * (`gates.size === 0 → continue`), e foi exatamente onde a tela de dinheiro
   * SAINDO viveu com quatro mutações e zero gate, verde nesta varredura. Para
   * DINHEIRO a conversa acaba aqui: quem chama mutação de `financeiro` afirma
   * pelo menos um `podeNoModulo`, e aí o primeiro caso confere QUAL. A exceção
   * é dívida anotada com dono, não licença.
   */
  it("toda tela que ESCREVE em financeiro afirma um gate", () => {
    const porOperacao = moduloPorOperacao();
    // A exceção anotada (S42, conciliacao.tsx) fechou em seguida à S40 — a
    // lista vazia fica de molde para a próxima dívida COM DONO, não sem.
    const DIVIDA_ANOTADA = new Set<string>([]);

    const semGate: string[] = [];
    for (const arquivo of telas()) {
      const relativo = arquivo.replace(RAIZ + "/", "");
      if (DIVIDA_ANOTADA.has(relativo)) continue;
      const src = readFileSync(arquivo, "utf8");
      if (/podeNoModulo\(/.test(src)) continue;
      for (const m of src.matchAll(/\buse([A-Z]\w+)\b/g)) {
        const operacao = m[1][0].toLowerCase() + m[1].slice(1);
        if (porOperacao.get(operacao) === "financeiro" && VERBOS_QUE_ESCREVEM.test(operacao)) {
          semGate.push(`${relativo} — chama ${operacao} sem afirmar gate nenhum`);
          break;
        }
      }
    }
    expect(semGate).toEqual([]);
  });

  /**
   * Conjunto vazio aprova tudo em silêncio (S-D31), e esta varredura tem DUAS
   * pontas que podem esvaziar sem barulho. O piso é o medido em 2026-08-07 —
   * 22 prefixos com `requireModulo` e 66 telas `.tsx` em `pages/` — com folga
   * para baixo. (A terceira ponta, o cliente gerado, já tem o piso de 100
   * operações no primeiro caso.)
   */
  it("as duas pontas enumeradas têm população de verdade", () => {
    expect(modulosPorPrefixo().length).toBeGreaterThan(15);
    expect(telas().length).toBeGreaterThan(50);
  });
});
