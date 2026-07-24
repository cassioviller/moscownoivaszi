import { executarBackup } from "../lib/backup";

/**
 * Entrada da rotina agendada de backup (E30). É o que o Scheduled Deployment do
 * Replit (ou um cron externo) chama:
 *
 *   pnpm --filter @workspace/api-server backup
 *
 * O botão manual da tela chama a mesma `executarBackup`; aqui o gatilho é
 * "agendado" e não há autor.
 */
async function main() {
  console.log("[backup] iniciando dump do banco...");
  const registro = await executarBackup({ gatilho: "agendado" });
  if (registro.status === "ok") {
    const mb = ((registro.tamanhoBytes ?? 0) / 1_048_576).toFixed(1);
    console.log(`[backup] concluído: ${registro.arquivo} (${mb} MB)`);
    process.exit(0);
  }
  console.error(`[backup] falhou: ${registro.erro}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("[backup] erro inesperado:", err);
  process.exit(1);
});
