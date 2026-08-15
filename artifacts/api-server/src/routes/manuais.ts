import { Router, type IRouter } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { ListManuaisResponse } from "@workspace/api-zod";
import { requireSessao } from "../middlewares/auth";
import { caminhoDoManual, listarManuais } from "../lib/manuais";

/**
 * E236 — os manuais de uso, para baixar dentro do sistema.
 *
 * Só sessão, sem loja: o manual é o mesmo para toda loja, e é de quem está
 * logado — a vendedora baixa o dela e o da noiva, a dona baixa os cinco. Não é
 * público: o manual descreve a operação da loja por dentro.
 */
const router: IRouter = Router();

router.get("/manuais", requireSessao, (_req, res): void => {
  res.json(ListManuaisResponse.parse(listarManuais()));
});

router.get("/manuais/:qual.pdf", requireSessao, (req, res): void => {
  const caminho = caminhoDoManual(req.params.qual as string);
  if (!caminho) {
    res.status(404).json({ error: "MANUAL_DESCONHECIDO" });
    return;
  }
  if (!existsSync(caminho)) {
    // A instalação subiu sem os PDFs versionados — dizemos isso, em vez de 500.
    res.status(410).json({ error: "MANUAL_SEM_ARQUIVO", detalhe: "O PDF deste manual não está no servidor." });
    return;
  }
  res.setHeader("Cache-Control", "private, max-age=300");
  // A mesma guarda do download do backup (S-O26): o `send` recusa por mais
  // motivos que o `existsSync` cobre, e a recusa tem de sair como JSON, não
  // como stack rotulada de PDF.
  res.download(caminho, path.basename(caminho), (err) => {
    if (!err) return;
    req.log.warn({ err, caminho }, "manual_download_recusado_pelo_send");
    if (res.headersSent) {
      res.end();
      return;
    }
    res.removeHeader("Content-Type");
    res.removeHeader("Content-Disposition");
    res.status(410).json({ error: "MANUAL_SEM_ARQUIVO", detalhe: "O PDF deste manual não está acessível no servidor." });
  });
});

export default router;
