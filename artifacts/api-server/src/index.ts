import { pool } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { seedInicial } from "./lib/seed";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * **O adeus do processo, que num contêiner é obrigatório.**
 *
 * Node não tem tratador de sinal por default, e no contêiner ele é o PID 1: sem
 * este bloco o `SIGTERM` de todo redeploy é IGNORADO, o orquestrador espera o
 * prazo dele e mata com `SIGKILL`. O que morre junto é a requisição que estava
 * em voo — e neste sistema uma requisição em voo é uma parcela sendo gravada.
 *
 * A ordem é a que importa: para de ACEITAR conexão (`server.close`), deixa
 * terminar o que já entrou, e só então devolve as conexões do banco. O prazo é
 * a rede de segurança para o pedido que não termina sozinho; sem ele, uma
 * conexão pendurada seguraria o processo até o `SIGKILL` de qualquer jeito.
 */
const PRAZO_DO_ADEUS_MS = 10_000;

seedInicial()
  .then(() => {
    const server = app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });

    let encerrando = false;
    const encerrar = (sinal: NodeJS.Signals): void => {
      if (encerrando) return;
      encerrando = true;
      logger.info({ sinal }, "Sinal recebido — parando de aceitar conexões");

      const prazo = setTimeout(() => {
        logger.error({ sinal }, "Conexões não terminaram no prazo — saindo assim mesmo");
        process.exit(1);
      }, PRAZO_DO_ADEUS_MS);
      prazo.unref();

      server.close(() => {
        pool
          .end()
          .then(() => {
            logger.info("Encerrado");
            process.exit(0);
          })
          .catch((err: unknown) => {
            logger.error({ err }, "Falha ao fechar o pool do banco");
            process.exit(1);
          });
      });
    };

    process.on("SIGTERM", encerrar);
    process.on("SIGINT", encerrar);
  })
  .catch((err) => {
    logger.error({ err }, "Falha no seed inicial — abortando");
    process.exit(1);
  });
