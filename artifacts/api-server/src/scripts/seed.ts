/**
 * A configuração inicial de um ateliê, aplicada à mão.
 *
 *   pnpm --filter @workspace/api-server exec tsx src/scripts/seed.ts
 *
 * Idempotente e aditivo: roda quantas vezes for preciso, completa o que falta e
 * nunca sobrescreve o que a loja já configurou. O conteúdo — perfis, cabines,
 * horário, catálogo, escada de comissão e recorrências — mora em
 * `src/lib/configuracao-inicial.ts`, o mesmo módulo que a subida do servidor
 * usa quando o banco está vazio.
 *
 * O que ele NÃO cria, de propósito: vestido, noiva, orçamento, contrato,
 * parcela. Isso é o trabalho da loja, e é o que se cadastra na tela depois.
 *
 * Parametrização (tudo opcional; os defaults são os do desenvolvimento):
 *
 *   SEED_LOJA_ID SEED_LOJA_NOME SEED_LOJA_CNPJ SEED_LOJA_ENDERECO SEED_LOJA_TELEFONE
 *   SEED_DONA_ID SEED_DONA_NOME SEED_DONA_EMAIL SEED_DONA_SENHA SEED_DONA_SUPERADMIN
 *   SEED_EXEMPLOS_FINANCEIROS=false   (sem escada de comissão nem recorrências)
 */
import { pool } from "@workspace/db";
import {
  aplicarConfiguracaoInicial,
  configuracaoDoAmbiente,
  contarConfiguracao,
  DONA_PADRAO,
  ESCADA_PADRAO,
  RECORRENCIAS_PADRAO,
} from "../lib/configuracao-inicial";

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function main(): Promise<void> {
  const opcoes = configuracaoDoAmbiente();

  console.log(`\nConfigurando "${opcoes.loja.nome}"…\n`);

  const resumo = await aplicarConfiguracaoInicial(opcoes);
  const c = await contarConfiguracao(resumo.lojaId);
  const novo = resumo.criado;

  const linha = (rotulo: string, tem: number | string, criou: number | boolean): string => {
    const marca = (typeof criou === "boolean" ? criou : criou > 0) ? "+" : "·";
    return `  ${marca} ${rotulo.padEnd(24)} ${String(tem)}`;
  };

  console.log("O que a loja tem agora (+ = criado nesta execução):");
  console.log(linha("Loja", resumo.lojaNome, novo.loja));
  console.log(linha("Perfis de acesso", 4, novo.perfis));
  console.log(linha("Dona", resumo.donaEmail, novo.dona || novo.vinculo));
  console.log(linha("Cabines", c.cabines, novo.cabines));
  console.log(linha("Horário de funcionamento", c.temHorario ? "seg–sáb, 9h–19h" : "NÃO CONFIGURADO", novo.horario));
  console.log(linha("Atributos do catálogo", `${c.atributos} (${c.opcoes} opções)`, novo.atributos));
  console.log(
    linha(
      "Escada de comissão",
      c.escadasDeComissao > 0 ? `${ESCADA_PADRAO.length} faixas` : "nenhuma",
      novo.escadaDeComissao,
    ),
  );
  const totalMensal = RECORRENCIAS_PADRAO.reduce((s, r) => s + r.valor, 0);
  console.log(
    linha("Recorrências", c.recorrencias > 0 ? `${c.recorrencias} · ${reais(totalMensal)}/mês` : "nenhuma", novo.recorrencias),
  );

  console.log(`\nO que falta, e é trabalho da loja: cadastrar os primeiros vestidos.`);
  console.log(`Depois deles: noivas, provas e atendimentos entram pela tela.\n`);

  if (opcoes.dona.senha === DONA_PADRAO.senha) {
    console.log(`ATENÇÃO: a dona está com a senha padrão ("${DONA_PADRAO.senha}").`);
    console.log(`Defina SEED_DONA_SENHA antes de usar isto fora do desenvolvimento.\n`);
  }
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("A configuração inicial falhou:", err);
    await pool.end();
    process.exit(1);
  });
