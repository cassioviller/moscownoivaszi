import type { DRE } from "./dre";
import type { RecebimentosPorForma } from "./forma";
import type { Movimento } from "./fluxo";
import { diaLocal } from "./datas";

/**
 * Exportação CSV no CLIENTE (E22): DRE e fluxo são calculados aqui no front
 * (dreDoIntervalo/resumoCaixa) — exportar do servidor exigiria reimplementar o
 * motor lá e criaria exatamente a divergência que a proposta do motor único
 * quer matar. O CSV nasce dos MESMOS números que a tela mostra.
 *
 * `escaparCsv`/`montarCsv` são ESPELHO de api-server/src/lib/csv.ts (RFC 4180
 * + neutralização de injeção de fórmula, C5). O teste exportar.test.ts fixa o
 * comportamento — mesma régua provada lá.
 */

const ABRE_COMO_FORMULA = /^[=+\-@\t\r]/;
const NUMERO_PURO = /^-?\d+(?:\.\d+)?$/;

export function escaparCsv(campo: string): string {
  const seguro = ABRE_COMO_FORMULA.test(campo) && !NUMERO_PURO.test(campo) ? `'${campo}` : campo;
  if (/[",\r\n]/.test(seguro)) return `"${seguro.replace(/"/g, '""')}"`;
  return seguro;
}

export function montarCsv(linhas: readonly (readonly string[])[]): string {
  return linhas.map((l) => l.map(escaparCsv).join(",")).join("\r\n") + "\r\n";
}

/** Dispara o download no navegador. BOM: sem ele o Excel lê "Salário" como "SalÃ¡rio". */
export function baixarCsv(nomeArquivo: string, linhas: readonly (readonly string[])[]): void {
  const blob = new Blob(["﻿" + montarCsv(linhas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

/** O DRE como a tela mostra: recebimentos, despesas (negativas) e resultado. */
export function linhasDre(
  dre: DRE,
  competencia: string,
  porForma?: RecebimentosPorForma,
): string[][] {
  const linhas: string[][] = [
    ["Competência", "Linha", "Valor"],
    [competencia, "Recebimentos", dre.receitas.toFixed(2)],
  ];
  // O recorte por meio entra logo abaixo do total que ele detalha (E50): é a
  // linha que a contadora usa para bater cartão e Pix contra o extrato, e ela
  // some do arquivo se ficar só na tela. As linhas SOMAM o mesmo que
  // "Recebimentos" — é o mesmo dinheiro, por outro corte.
  for (const f of porForma?.linhas ?? []) {
    linhas.push([competencia, `Recebimento — ${f.rotulo}`, f.total.toFixed(2)]);
  }
  for (const d of dre.despesas) {
    linhas.push([competencia, `Despesa — ${d.rotulo}`, (-d.total).toFixed(2)]);
  }
  linhas.push([competencia, "Total de despesas", (-dre.totalDespesas).toFixed(2)]);
  linhas.push([competencia, "Resultado", dre.resultado.toFixed(2)]);
  return linhas;
}

/** Um movimento por linha, saída com sinal negativo — importável sem retrabalho. */
export function linhasFluxo(movimentos: readonly Movimento[]): string[][] {
  const linhas: string[][] = [["Data", "Tipo", "Descrição", "Quem", "Valor"]];
  for (const m of movimentos) {
    linhas.push([
      diaLocal(m.data),
      m.tipo === "ENTRADA" ? "Entrada" : "Saída",
      m.descricao,
      m.rotulo ?? "",
      (m.tipo === "ENTRADA" ? m.valor : -m.valor).toFixed(2),
    ]);
  }
  return linhas;
}
