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
      proprietario: resumo.proprietarioEmail,
      // S-O71: o log da SUBIDA também conta os perfis. Os dois caminhos aplicam
      // a mesma configuração e agora relatam a mesma lista de números.
      perfis: contagem.perfis,
      cabines: contagem.cabines,
      atributos: contagem.atributos,
      opcoesDeCatalogo: contagem.opcoes,
      escadasDeComissao: contagem.escadasDeComissao,
      recorrencias: contagem.recorrencias,
    },
    "Configuração inicial concluída — falta cadastrar os primeiros vestidos.",
  );

  if (opcoes.proprietario.senha === "admin123") {
    logger.warn(
      { email: resumo.proprietarioEmail },
      "O proprietário entrou com a SENHA PADRÃO. Defina SEED_PROPRIETARIO_SENHA antes de usar isto fora do desenvolvimento.",
    );
  }
}
