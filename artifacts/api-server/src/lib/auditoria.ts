import { auditLogTable } from "@workspace/db";
import type { AcaoAuditoria } from "@workspace/financeiro-core";
import { randomUUID } from "node:crypto";
import type { DbExecutor } from "./disponibilidade";

/**
 * Trilha de auditoria (E10). Registrar SEMPRE dentro da transação da ação: se o
 * log falhar, a ação não acontece — ação sensível sem rastro é pior que um 500.
 *
 * **S-O52/E186 — a união das ações e os rótulos delas mudaram de casa.**
 *
 * Eram DUAS listas, esta e a de `moscow-noivas/src/lib/financeiro/auditoria.ts`,
 * e o comentário que ficava aqui declarava o pacto desde o E47: *"a planilha da
 * contadora e a tela têm de chamar a mesma coisa pelo mesmo nome"*. O que o
 * cumpria, desde o E178, era uma varredura de CHAVES — e as duas divergiam em
 * **três dos 43 rótulos**, no TEXTO, que é justamente o que ela não olhava.
 *
 * Hoje é uma cópia com dois consumidores (regra 26), em
 * `@workspace/financeiro-core` — a mesma saída que o E176 deu à régua dos
 * dígitos do WhatsApp. Este arquivo continua sendo a porta do SERVIDOR para a
 * trilha (é ele que escreve a linha); o que ele perdeu foi a segunda grafia.
 */
export {
  ACOES_AUDITORIA,
  acaoValida,
  ROTULO_ACAO,
  rotuloDaAcao,
  type AcaoAuditoria,
} from "@workspace/financeiro-core";

const quandoFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "21/07/2026 14:32" no fuso da loja. A trilha é INSTANTE, e a hora importa
 * tanto quanto o dia: "quem estornou às 23h50" é metade da pergunta.
 */
export function quandoLocalSP(instante: Date): string {
  return quandoFmt.format(instante).replace(", ", " ");
}

export interface RegistroAuditoria {
  /**
   * S3 — **`null` é o ato GLOBAL**, o que não pertence a loja nenhuma: apagar
   * uma pessoa (tabela global) ou apagar uma loja. No segundo caso o nulo é o
   * que faz o registro existir: com o id da loja, o CASCADE o apagaria junto
   * com ela.
   */
  lojaId: string | null;
  /** Autor da sessão (req.usuario) — id + nome desnormalizado. */
  usuario: { id: string; nome: string };
  acao: AcaoAuditoria;
  entidade:
    | "parcela"
    | "conta_pagar"
    | "pagamento"
    | "contrato"
    | "comissao_fechamento"
    | "usuario"
    | "convite"
    | "perfil"
    | "lead"
    // E115 — os DELETEs que ganharam trilha, e o carimbo de conciliação.
    | "reserva"
    | "bloqueio"
    | "atendimento"
    | "orcamento"
    | "avaria"
    | "conciliacao"
    // S-M1 — a cabine, pelo mesmo motivo das cinco acima.
    | "cabine"
    // S-M16 — os três deletes que a conferência da S-M1 achou crus.
    | "item_estoque"
    | "ajuste"
    | "comissao_regra"
    // E123 — o desfazer do registro de cobrança.
    | "registro_cobranca"
    // S3 — a loja como ENTIDADE, e não como escopo: é o que ela é quando o
    // que aconteceu foi ela ter sido apagada.
    | "loja";
  entidadeId: string;
  detalhe?: Record<string, unknown>;
}

export async function registrarAuditoria(
  executor: DbExecutor,
  registro: RegistroAuditoria,
): Promise<void> {
  await executor.insert(auditLogTable).values({
    id: randomUUID(),
    lojaId: registro.lojaId,
    usuarioId: registro.usuario.id,
    usuarioNome: registro.usuario.nome,
    acao: registro.acao,
    entidade: registro.entidade,
    entidadeId: registro.entidadeId,
    detalhe: registro.detalhe ?? null,
  });
}
