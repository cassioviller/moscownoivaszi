import type { ContaPagarTipo } from "@workspace/api-client-react";
import { ROTULO_TIPO } from "@workspace/financeiro-core";

/**
 * E79: o DRE mora no motor único (@workspace/financeiro-core) — o MESMO
 * `dreDoIntervalo` que o api-server roda em GET /financeiro/dre. Desde o E88
 * a porta re-exporta só o TIPO (a tela consome o endpoint; quem prova o motor
 * é dre.test.ts, direto no core).
 */
export { type DRE } from "@workspace/financeiro-core";

/**
 * Tipado pelo enum gerado: se o backend ganhar um tipo de conta novo, o
 * openapi regenera e este check quebra o typecheck — o rótulo PT-BR não pode
 * nascer depois do dado. (O core fala `Record<string, string>` de propósito:
 * ele não conhece o contrato.)
 */
const _cobreTodosOsTipos: Record<ContaPagarTipo, string> = ROTULO_TIPO;
void _cobreTodosOsTipos;
