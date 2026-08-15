import { existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * **E236 — os manuais de uso, DENTRO do sistema.**
 *
 * Os cinco manuais (`docs/manuais/*.html`) eram publicados como página fora do
 * sistema e o PDF com prints (`scripts/prints-dos-manuais.ts`) só existia no
 * disco de quem rodou o script. Ninguém dentro da loja tinha onde baixá-los.
 * Desde o E236 os PDFs são VERSIONADOS em `docs/manuais/pdf/` — o custo de
 * existirem sem Playwright em produção — e servidos por `GET /manuais/:qual.pdf`
 * a qualquer pessoa com sessão; a página *Manuais* (rodapé do menu) os lista.
 *
 * O catálogo é curado à mão porque é semântica (para quem é cada um), não
 * enumeração — a `varredura-manuais-prints` (frontend) confere que cada
 * entrada aqui tem o HTML versionado, o PDF versionado e as capturas que o
 * HTML declara.
 */
export type ManualDeUso = {
  /** A chave: o nome do arquivo sem extensão, e o argumento do script de prints. */
  qual: string;
  titulo: string;
  /** Para quem ele foi escrito, na língua da loja. */
  paraQuem: string;
  descricao: string;
};

export const MANUAIS_DE_USO: readonly ManualDeUso[] = [
  {
    qual: "proprietario",
    titulo: "Manual do Proprietário",
    paraQuem: "quem manda na loja",
    descricao: "O financeiro, o que o contrato cobra, fechar o mês, comissões, equipe e os dados da loja que saem no papel.",
  },
  {
    qual: "vendedora",
    titulo: "Manual da Vendedora",
    paraQuem: "quem atende a noiva",
    descricao: "Da noiva que chega ao contrato fechado: a ficha, os interesses, a prova, a proposta, o aceite e o carnê.",
  },
  {
    qual: "recepcao",
    titulo: "Manual da Recepção",
    paraQuem: "quem cuida da agenda e do telefone",
    descricao: "A agenda do dia, marcar e remarcar, a fila do atendimento, as mensagens de hoje e a noiva que ligou.",
  },
  {
    qual: "costureira",
    titulo: "Manual da Costureira",
    paraQuem: "quem faz o ajuste e a confecção",
    descricao: "A fila, o prazo, marcar o que ficou pronto, de onde nasce o trabalho e o dano que você vê primeiro.",
  },
  {
    qual: "noiva",
    titulo: "Guia da Noiva",
    paraQuem: "a equipe, sobre o que a noiva vê",
    descricao: "Os três links, o portal seção a seção, o que ela faz sozinha e as frases que ela lê quando algo dá errado.",
  },
];

/**
 * A pasta dos PDFs. `process.cwd()` é `artifacts/api-server` quando o servidor
 * sobe pelo pnpm (a mesma convenção do `lib/backup.ts`); sobreponível por
 * `MANUAIS_PDF_DIR` para quem sobe de outro lugar.
 */
export function pastaDosManuais(): string {
  return process.env.MANUAIS_PDF_DIR ?? path.resolve(process.cwd(), "../../docs/manuais/pdf");
}

export function caminhoDoManual(qual: string): string | null {
  if (!MANUAIS_DE_USO.some((m) => m.qual === qual)) return null;
  return path.join(pastaDosManuais(), `${qual}.pdf`);
}

export type ManualListado = ManualDeUso & {
  /** O PDF está no servidor. `false` = a instalação subiu sem os PDFs versionados. */
  disponivel: boolean;
  bytes: number | null;
  atualizadoEm: string | null;
};

export function listarManuais(): ManualListado[] {
  return MANUAIS_DE_USO.map((m) => {
    const caminho = caminhoDoManual(m.qual)!;
    if (!existsSync(caminho)) return { ...m, disponivel: false, bytes: null, atualizadoEm: null };
    const st = statSync(caminho);
    return { ...m, disponivel: true, bytes: st.size, atualizadoEm: st.mtime.toISOString() };
  });
}
