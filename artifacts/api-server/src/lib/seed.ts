import { db, usuariosTable } from "@workspace/db";
import { logger } from "./logger";
import { aplicarConfiguracaoInicial, configuracaoDoAmbiente, contarConfiguracao } from "./configuracao-inicial";

/**
 * Configura a loja na subida do servidor, se o banco estiver vazio.
 *
 * A guarda é `nenhum usuário existe`, e ela é conservadora de propósito: um
 * banco EM USO nunca é tocado na subida, nem para completar o que falta. Quem
 * quer completar uma loja que já roda chama o script à mão
 * (`tsx src/scripts/seed.ts`), que faz o mesmo trabalho com relatório na tela —
 * ver `replit.md`.
 *
 * O conteúdo mora em `configuracao-inicial.ts`: os dois caminhos aplicam
 * exatamente a mesma configuração, então um banco provisionado do zero e um
 * configurado à mão terminam idênticos.
 */
export async function seedInicial(): Promise<void> {
  const existentes = await db.select({ id: usuariosTable.id }).from(usuariosTable).limit(1);
  if (existentes.length > 0) return; // banco em uso — não se mexe

  const opcoes = configuracaoDoAmbiente();
  logger.info("Banco vazio — aplicando a configuração inicial...");

  const resumo = await aplicarConfiguracaoInicial(opcoes);
  const contagem = await contarConfiguracao(resumo.lojaId);

  logger.info(
    {
      loja: resumo.lojaNome,
      dona: resumo.donaEmail,
      cabines: contagem.cabines,
      atributos: contagem.atributos,
      opcoesDeCatalogo: contagem.opcoes,
      escadasDeComissao: contagem.escadasDeComissao,
      recorrencias: contagem.recorrencias,
    },
    "Configuração inicial concluída — falta cadastrar os primeiros vestidos.",
  );

  if (opcoes.dona.senha === "admin123") {
    logger.warn(
      { email: resumo.donaEmail },
      "A dona entrou com a SENHA PADRÃO. Defina SEED_DONA_SENHA antes de usar isto fora do desenvolvimento.",
    );
  }
}
