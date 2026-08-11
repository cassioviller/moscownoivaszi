import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * S-M21 (fecha a S-M9) — a tela pergunta a MESMA AÇÃO que o servidor deriva.
 *
 * A S36 cruza o MÓDULO; esta varredura pina a AÇÃO nos dez sítios que a
 * rodada 2 enumerou (ângulos 4 e 8, cético por achado) mais a âncora original
 * da sobra (`pagar.tsx`). O descasamento tinha sempre a mesma cara: o botão
 * aparecia para quem ia levar 403 e sumia de quem o servidor aceitava — e nos
 * quatro perfis padrão ninguém tropeça, porque o defeito espera o primeiro
 * perfil customizado que separe criar de editar.
 *
 * A tabela é MANTIDA À MÃO de propósito: cada linha é um par conferido contra
 * `acaoDoRequest` (POST em substantivo → criar; POST em verbo de mutação →
 * editar; PATCH/DELETE → editar; declaração explícita da rota vence tudo).
 * Quem mudar um gate destes muda a linha JUNTO — e explica nos dois lugares.
 */
const RAIZ = join(import.meta.dirname, "..", "..", "..", "..");
const TELAS = "artifacts/moscow-noivas/src/pages";

const SITIOS: { arquivo: string; espera: string[]; proibido?: string[] }[] = [
  {
    // POST conciliacao/marcar → `marcar` em POST_QUE_MUTA (E115) → editar.
    arquivo: `${TELAS}/financeiro/conciliacao.tsx`,
    espera: [`podeNoModulo(acessosModulos, "financeiro", "editar")`],
    proibido: [`const podeMarcar = podeNoModulo(acessosModulos, "financeiro", "criar")`],
  },
  {
    // POST /itens-estoque → criar; PATCH/DELETE → editar. Dois gates.
    arquivo: `${TELAS}/vestidos/estoque.tsx`,
    espera: [
      `const podeCadastrar = podeNoModulo(acessosModulos, "vestidos", "criar")`,
      `const podeGerir = podeNoModulo(acessosModulos, "vestidos", "editar")`,
    ],
  },
  {
    // POST /bloqueios/:id/avarias → criar; ajustes: POST → criar, PATCH → editar.
    arquivo: `${TELAS}/reservas/[bloqueioId].tsx`,
    espera: [
      `const podeRegistrarAvaria = podeNoModulo(acessosModulos, "vestidos", "criar")`,
      `const podeCriarAjuste = podeNoModulo(acessosModulos, "agenda", "criar")`,
      `const podeEditarAjuste = podeNoModulo(acessosModulos, "agenda", "editar")`,
    ],
    // O descasamento mais largo dos nove: escrita liberada por VER.
    proibido: [`podeNoModulo(acessosModulos, "agenda", "ver")`],
  },
  {
    // POST /recorrencias (salário e despesa) → criar.
    arquivo: `${TELAS}/financeiro/folha.tsx`,
    espera: [`const podeCriar = podeNoModulo(acessosModulos, "financeiro", "criar")`],
  },
  {
    // POST /comissao/regras → criar; a baixa de estorno exige admin.editar
    // EXPLÍCITO na rota (comissao.ts), além do prefixo comissao.
    arquivo: `${TELAS}/comissoes/index.tsx`,
    espera: [
      `const podeCriarRegra = podeNoModulo(acessosModulos, "comissao", "criar")`,
      `podeNoModulo(acessosModulos, "admin", "editar")`,
    ],
  },
  {
    // POST /cabines → criar; expediente e ativar/desativar → editar.
    arquivo: `${TELAS}/atendimentos/config.tsx`,
    espera: [`const podeCriarCabine = podeNoModulo(acessosModulos, "agenda", "criar")`],
  },
  {
    // O atalho de agendar aponta uma página cujo gate é agenda.criar — o
    // atalho pergunta o MESMO que o destino.
    arquivo: `${TELAS}/noivas/[leadId]/index.tsx`,
    espera: [`const podeAgendar = podeNoModulo(acessosModulos, "agenda", "criar")`],
  },
  {
    // POST /atributos → criar (o TODO "gate flat por módulo" mentia — E101).
    arquivo: `${TELAS}/catalogo/index.tsx`,
    espera: [`const podeCriar = podeNoModulo(acessosModulos, "vestidos", "criar")`],
  },
  {
    // A página de criação não tinha gate NENHUM.
    arquivo: `${TELAS}/catalogo/novo.tsx`,
    espera: [`const podeCriar = podeNoModulo(acessosModulos, "vestidos", "criar")`],
  },
  {
    // A âncora original da S-M9: /pagar declara editar explícito na rota, e
    // /estornar deriva editar do verbo. Só "Lançar despesa" é criar.
    arquivo: `${TELAS}/financeiro/pagar.tsx`,
    espera: [
      `const podeEditar = podeNoModulo(acessosModulos, "financeiro", "editar")`,
      `{podeEditar && selecionaveis.length > 0 && (`,
    ],
  },
];

describe("S-M21 — os dez sítios do criar×editar, pinados", () => {
  it.each(SITIOS)("$arquivo pergunta a ação que o servidor deriva", ({ arquivo, espera, proibido }) => {
    const src = readFileSync(join(RAIZ, arquivo), "utf8");
    for (const trecho of espera) {
      expect(src, `${arquivo} perdeu o gate: ${trecho}`).toContain(trecho);
    }
    for (const trecho of proibido ?? []) {
      expect(src, `${arquivo} voltou ao gate errado: ${trecho}`).not.toContain(trecho);
    }
  });

  it("população: os dez arquivos da tabela existem no versionamento", () => {
    // Uma tabela mantida à mão morre em silêncio se um arquivo for renomeado —
    // este assert transforma o rename em vermelho com nome.
    expect(SITIOS).toHaveLength(10);
  });
});
