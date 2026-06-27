// src/lib/calendario/periodo.ts
// Matemática pura do período das abas do calendário (sem Prisma). As abas Vestidos e
// Provas & ajustes mostram uma janela [início, fim] da operação. Por padrão, hoje →
// +60 dias; a pessoa pode escolher um intervalo livre via ?ini=&fim= — a mesma
// convenção do Financeiro, para não inventar um modelo mental novo. Tudo em UTC, na
// convenção do sistema (@/lib/tempo). O fim é INCLUSIVO (o dia escolhido em "Até");
// para queries Prisma use { gte: inicio, lt: fimExclusivo }.
import { meiaNoiteUTC } from "@/lib/tempo";
import { diaValido, addDias } from "@/lib/disponibilidade/datas";

const DIA_MS = 86_400_000;
export const HORIZONTE_PADRAO = 60; // dias à frente quando não há ?fim=
const DIAS_MAX = 366; // teto da janela — uma timeline maior fica ilegível

export type Periodo = {
  iniYMD: string; // para pré-preencher o input e remontar a URL
  fimYMD: string; // "Até" inclusivo (o dia escolhido)
  inicio: Date; // gte — meia-noite UTC do início (inclusivo)
  fimExclusivo: Date; // lt — primeiro instante já fora do intervalo (para queries)
  dias: number; // largura da janela em dias inclusivos (sempre >= 1) — gantt/eixo
};

/**
 * Resolve ?ini=&fim= numa janela utilizável. Regras:
 *  - ini ausente/inválido → hoje;
 *  - fim ausente/inválido → ini + HORIZONTE_PADRAO;
 *  - fim antes de ini → ini + HORIZONTE_PADRAO (ignora o fim incoerente);
 *  - janela limitada a DIAS_MAX dias (teto de legibilidade);
 *  - dias sempre >= 1 (mesmo dia vira janela de 1 dia, nunca vazia).
 */
export function resolverPeriodo(
  iniRaw: string | undefined,
  fimRaw: string | undefined,
  hojeYMD: string,
): Periodo {
  const iniYMD = iniRaw && diaValido(iniRaw) ? iniRaw : hojeYMD;
  const inicio = meiaNoiteUTC(iniYMD);

  let fim =
    fimRaw && diaValido(fimRaw) ? meiaNoiteUTC(fimRaw) : addDias(inicio, HORIZONTE_PADRAO);
  if (fim.getTime() < inicio.getTime()) fim = addDias(inicio, HORIZONTE_PADRAO);

  // Dias inclusivos (ini == fim → 1), com teto de legibilidade.
  const spanInclusivo = Math.round((fim.getTime() - inicio.getTime()) / DIA_MS) + 1;
  const dias = Math.max(1, Math.min(DIAS_MAX, spanInclusivo));
  fim = addDias(inicio, dias - 1); // re-clampa o fim ao teto

  return {
    iniYMD,
    fimYMD: fim.toISOString().slice(0, 10),
    inicio,
    fimExclusivo: addDias(inicio, dias), // fim inclusivo → exclusivo (+1 dia)
    dias,
  };
}
