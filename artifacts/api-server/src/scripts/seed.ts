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
  descreverHorario,
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

  /**
   * O TOTAL da loja, e entre parênteses o que ESTA execução criou.
   *
   * S-A12: a marca era um `+` na frente da linha, e o número ao lado era o
   * total. Numa loja com 122 cabines de lixo de teste, criar 3 imprimia
   * `+ Cabines 122` — quem lê entende que o seed criou 122. As duas contagens
   * sempre estiveram aqui; o que faltava era separá-las.
   */
  const linha = (rotulo: string, tem: number | string, criou: number | boolean): string => {
    const marca = typeof criou === "boolean" ? (criou ? " (novo)" : "") : criou > 0 ? ` (+${criou})` : "";
    return `  ${rotulo.padEnd(24)} ${String(tem)}${marca}`;
  };

  console.log("O que a loja tem agora — o total, e entre parênteses o que esta execução criou");
  console.log("(os perfis são do SISTEMA, compartilhados por todas as lojas):");
  console.log(linha("Loja", resumo.lojaNome, novo.loja));
  // S-O71: este era o único total CRAVADO do resumo — `4`, escrito à mão antes
  // de a Costureira nascer (E172). Num banco virgem a linha saía
  // `Perfis de acesso 4 (+5)`: o total menor do que o que a própria execução
  // acabara de criar, no único lugar em que esse número se lê. Vem do banco,
  // como as outras (S-D41).
  // S-O92/E239: a linha diz DO SISTEMA porque é o que ela conta — `perfis`
  // não tem `lojaId`; numa rede, a loja B lê aqui os perfis da rede inteira,
  // e o cabeçalho acima diz "a loja". As outras linhas são da loja mesmo.
  console.log(linha("Perfis do sistema", c.perfis, novo.perfis));
  console.log(linha("Dona", resumo.donaEmail, novo.dona || novo.vinculo));
  console.log(linha("Cabines", c.cabines, novo.cabines));
  // S-D41: o horário sai do que o banco guarda. A frase cravada dizia
  // "seg–sáb, 9h–19h" e as duas metades estavam erradas desde a S-A8.
  console.log(linha("Horário de funcionamento", c.horario ? descreverHorario(c.horario) : "NÃO CONFIGURADO", novo.horario));
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
