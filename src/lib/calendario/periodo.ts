// src/lib/calendario/periodo.ts
// Matemática pura do período da timeline de vestidos (sem Prisma). A aba Vestidos
// mostra uma janela [início, fim] do acervo em movimento. Por padrão, hoje → +60
// dias; a pessoa pode escolher um intervalo livre via ?ini=&fim= — a mesma
// convenção do Financeiro, para não inventar um modelo mental novo. Tudo em UTC,
// na convenção do sistema (@/lib/tempo).
import { meiaNoiteUTC } from "@/lib/tempo";
import { diaValido, addDias } from "@/lib/disponibilidade/datas";

const DIA_MS = 86_400_000;
export const HORIZONTE_PADRAO = 60; // dias à frente quando não há ?fim=
const DIAS_MAX = 366; // teto da janela — uma timeline maior fica ilegível

export type PeriodoVestidos = {
  iniYMD: string; // para pré-preencher o input e remontar a URL
  fimYMD: string;
  inicio: Date; // meia-noite UTC do início (alimenta agenda e gantt)
  dias: number; // largura da janela em dias (sempre >= 1)
};

/**
 * Resolve ?ini=&fim= numa janela utilizável. Regras:
 *  - ini ausente/inválido → hoje;
 *  - fim ausente/inválido → ini + HORIZONTE_PADRAO;
 *  - fim antes de ini → ini + HORIZONTE_PADRAO (ignora o fim incoerente);
 *  - janela limitada a DIAS_MAX dias (teto de legibilidade);
 *  - dias sempre >= 1 (mesmo dia vira janela de 1 dia, nunca vazia).
 */
export function resolverPeriodoVestidos(
  iniRaw: string | undefined,
  fimRaw: string | undefined,
  hojeYMD: string,
): PeriodoVestidos {
  const iniYMD = iniRaw && diaValido(iniRaw) ? iniRaw : hojeYMD;
  const inicio = meiaNoiteUTC(iniYMD);

  let fim =
    fimRaw && diaValido(fimRaw) ? meiaNoiteUTC(fimRaw) : addDias(inicio, HORIZONTE_PADRAO);
  if (fim.getTime() < inicio.getTime()) fim = addDias(inicio, HORIZONTE_PADRAO);

  let dias = Math.round((fim.getTime() - inicio.getTime()) / DIA_MS);
  dias = Math.max(1, Math.min(DIAS_MAX, dias));
  fim = addDias(inicio, dias);

  return { iniYMD, fimYMD: fim.toISOString().slice(0, 10), inicio, dias };
}
