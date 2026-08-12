import { db, orcamentosTable, orcamentoVersoesTable, auditLogTable, leadsTable } from "@workspace/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { diaBR } from "@workspace/financeiro-core";
import { avancarEtapaLead } from "./estados";

/**
 * E74 — a rotina do aceite, num lugar só: grava instante, versão enviada e
 * hash (E75), avança para APROVADO e deixa a linha na auditoria com a noiva
 * como autora (sem sessão: o token é a capability). Nasceu na rota
 * /orcamentos/publico/aceite e virou função quando o portal (E78) passou a
 * aceitar TAMBÉM — dois caminhos, uma transação, um invariante.
 *
 * **É a única escrita de estado do sistema que acontece sem sessão, feita pela
 * pessoa que menos pode conferir o resultado.** 71 linhas produziram 10
 * defeitos na revisão da ótica dos papéis — a maior densidade de qualquer
 * arquivo do repositório —, e o E160 é o conserto dos sete de correção.
 */

/**
 * C8 — o retorno era `Promise<Date>` e escondia se a rotina GRAVOU ou perdeu a
 * corrida.
 *
 * Por causa disso as duas rotas chamadoras duplicavam a pré-condição de status
 * (`orcamentos-publico.ts:89` e `portal.ts:350`), e nenhuma das duas conseguia
 * distinguir os casos que importam: a linha sumiu, o status mudou, a versão
 * envelheceu. Agora o desfecho é explícito e quem chama traduz para HTTP.
 */
export type DesfechoAceite =
  | { ok: true; aceitoEm: Date; gravadoAgora: boolean }
  | { ok: false; motivo: "SUMIU" }
  | { ok: false; motivo: "NAO_ENVIADO"; status: string }
  | { ok: false; motivo: "VERSAO_MUDOU"; versaoAtual: number | null }
  | { ok: false; motivo: "VALIDADE_VENCIDA"; validade: Date };

/**
 * A frase da validade vencida mora com o desfecho, não com quem responde HTTP.
 *
 * As duas portas do aceite (`orcamentos-publico.ts` e `portal.ts`) nasceram
 * cada uma com sua cópia da frase e do formatador — a mesma divisão que o C8
 * já tinha desfeito na pré-condição de status. Uma cópia, uma frase: o
 * caminho de volta que ela lê é o mesmo pelas duas portas.
 */
export function mensagemValidadeVencida(validade: Date): string {
  return `Esta proposta venceu em ${diaBR(validade)} — peça uma atualização à sua vendedora para aceitar.`;
}

/**
 * @param versaoVista O número da versão que a NOIVA tinha na tela. Quando vem,
 *   o aceite recusa se a proposta mudou embaixo dela (C2). Ausente é o caso
 *   legado — aba aberta antes deste código, ou chamador que ainda não a manda.
 */
export async function aceitarOrcamentoEnviado(
  orcamento: { id: string; lojaId: string },
  noivaNome: string,
  versaoVista?: number | null,
): Promise<DesfechoAceite> {
  const agora = new Date();

  return await db.transaction(async (tx) => {
    /**
     * C1/C4 — o CAS não participava de tranca nenhuma, e o status não era
     * reconferido dentro da transação.
     *
     * O compare-and-swap guardava só `isNull(aceitoEm)` e gravava `APROVADO`
     * incondicionalmente. A pré-condição de status que o docstring delegava a
     * quem chama era conferida no POOL e nunca reestabelecida aqui — enquanto
     * `/recusar` e `/aprovar` escrevem a MESMA linha.
     *
     * **Medido:** orçamento de R$ 12.400,00 recusado às 14:00:00 volta a
     * APROVADO às 14:00:00,2 pelo aceite que leu o pool às 13:59:59,8.
     * RECUSADO é terminal (`estados.ts:49`), a vendedora lê "recusado" na tela,
     * e o `POST /contratos` fecha os R$ 12.400,00 sobre a proposta que a loja
     * negou. Na ordem inversa é o espelho: orçamento RECUSADO carregando o
     * comprovante do aceite, com o badge "Aceito pela noiva" na tela.
     *
     * A S-M22 escolheu `FOR UPDATE` + reconferência para serializar contra
     * este CAS e aplicou o padrão em dois lugares — mas o próprio CAS ficou de
     * fora. Agora ele entra: a linha do orçamento é a tranca, e as três portas
     * de item (`orcamentos.ts`) tomam a MESMA linha.
     */
    const [sobTranca] = await tx
      .select({
        status: orcamentosTable.status,
        aceitoEm: orcamentosTable.aceitoEm,
        validade: orcamentosTable.validade,
      })
      .from(orcamentosTable)
      .where(eq(orcamentosTable.id, orcamento.id))
      .for("update");
    if (!sobTranca) return { ok: false, motivo: "SUMIU" } as const;
    // Idempotência: o clique duplo devolve o aceite que JÁ existe, e agora ele
    // vem da linha trancada — não de uma leitura de pool que pode ter
    // envelhecido entre a guarda da rota e este ponto.
    if (sobTranca.aceitoEm) {
      return { ok: true, aceitoEm: sobTranca.aceitoEm, gravadoAgora: false } as const;
    }
    if (sobTranca.status !== "ENVIADO") {
      return { ok: false, motivo: "NAO_ENVIADO", status: sobTranca.status } as const;
    }

    /**
     * C2 — o aceite gravava a versão MAIS ALTA, não a que a noiva viu.
     *
     * `desc(numero)` era lido com `db`, fora da transação, e o cliente não
     * informava versão nem hash. **Medido:** ela vê e aceita R$ 5.000,00 na aba
     * antiga, a leitura pega a versão 2 nascida no meio, e o contrato sai
     * **R$ 5.500,00 — R$ 500,00 acima** — passando por baixo da guarda do E115,
     * porque o hash gravado é o da versão nova.
     *
     * Duas metades, e as duas são necessárias: a leitura veio para DENTRO da
     * transação (fecha a janela entre ler e gravar) e o chamador passa a
     * informar `versaoVista` — a comparação é contra o que ela VIU, não contra
     * o mais novo. Sem a segunda, a aba aberta há uma hora continuaria aceitando
     * uma proposta que ela nunca leu.
     */
    const [versao] = await tx
      .select({ numero: orcamentoVersoesTable.numero, hash: orcamentoVersoesTable.hash, validade: orcamentoVersoesTable.validade })
      .from(orcamentoVersoesTable)
      .where(eq(orcamentoVersoesTable.orcamentoId, orcamento.id))
      .orderBy(desc(orcamentoVersoesTable.numero))
      .limit(1);

    const numeroAtual = versao?.numero ?? null;
    if (versaoVista !== undefined && versaoVista !== null && versaoVista !== numeroAtual) {
      return { ok: false, motivo: "VERSAO_MUDOU", versaoAtual: numeroAtual } as const;
    }

    /**
     * C6/A03.4 (E166, decisão D3) — o aceite não conferia a validade em porta
     * NENHUMA: três lentes viram o mesmo furo. A proposta vencida em 10/07 era
     * aceita em 11/08 na mesma página que dizia "válida até 10/07/2026" — e o
     * contrato fechava em R$ 5.000,00 com a coleção já remarcada para
     * R$ 5.800,00: R$ 800,00 abaixo do preço vigente. Só o TTL do LINK era
     * conferido, e a expiração do link protege o token, não o preço.
     *
     * A régua é a validade que a PÁGINA DELA mostra: a congelada na versão
     * (E166), com a linha viva como fallback das versões antigas. O caminho de
     * volta é a D3: o relink re-abre a validade explicitamente e congela
     * versão nova.
     */
    const validadeEfetiva = versao?.validade ?? sobTranca.validade;
    if (validadeEfetiva && validadeEfetiva < agora) {
      return { ok: false, motivo: "VALIDADE_VENCIDA", validade: validadeEfetiva } as const;
    }

    // O CAS continua — ele é a rede do clique duplo simultâneo, que a tranca
    // acima serializa mas não elimina como classe.
    const [atualizado] = await tx
      .update(orcamentosTable)
      .set({
        aceitoEm: agora,
        aceiteVersao: numeroAtual,
        aceiteHash: versao?.hash ?? null,
        status: "APROVADO",
        aprovadoEm: agora,
        // C10: `updatedAt: agora` repetia à mão o que o `$onUpdate` do schema
        // já faz. Não era defeito de comportamento — era a dúvida plantada
        // ("então o $onUpdate não vale aqui?"), e ela já tinha sido copiada.
      })
      .where(and(eq(orcamentosTable.id, orcamento.id), isNull(orcamentosTable.aceitoEm)))
      .returning();
    /**
     * C3/O4 — o `?? agora` inventava um carimbo de aceite que não foi gravado.
     *
     * Perdida a corrida, `jaAceito?.aceitoEm ?? agora` não distinguia "outro já
     * aceitou" de "a linha não existe mais". Se o orçamento fosse apagado no
     * meio (um ENVIADO se apaga), o UPDATE casava zero linhas, a auditoria não
     * rodava, e a API respondia **200 com um `aceitoEm` inventado**: a noiva lia
     * "Aceito em 11/08/2026 14:02" e o ateliê não tinha registro nenhum.
     *
     * Aqui dentro da tranca o caso é impossível de confundir: ou o UPDATE casou
     * (e o carimbo é o que ficou gravado), ou a linha sumiu entre o `FOR UPDATE`
     * e agora — e aí a resposta é 404, nunca um instante inventado.
     */
    if (!atualizado?.aceitoEm) return { ok: false, motivo: "SUMIU" } as const;

    /**
     * A04.6 (E162) — o aceite passa a mexer no funil: avança a noiva até
     * ORCAMENTO_ABERTO se ela estava ATRÁS (o "sim" prova que a proposta
     * existiu). Uma etapa ACEITO não nasce aqui de propósito: criá-la mexeria
     * no enum do banco, no kanban e na régua de conversão inteira — é decisão
     * de produto, registrada como sobra. Quem responde "quantos aceites estão
     * parados" é a fila `/orcamentos/aceitos-sem-contrato`, que enxerga o
     * estado real em vez de um rótulo de funil.
     */
    const [lead] = await tx
      .select({
        id: leadsTable.id,
        etapa: leadsTable.etapa,
        orcamentoAbertoEm: leadsTable.orcamentoAbertoEm,
        aceiteEm: leadsTable.aceiteEm,
      })
      .from(leadsTable)
      .where(eq(leadsTable.id, atualizado.leadId));
    if (lead) {
      /**
       * S-O10 — **o carimbo do "sim" é independente da ETAPA**, e essa
       * separação é o miolo do conserto.
       *
       * O bloco inteiro rodava dentro de `if (etapaNova !== lead.etapa)`. Mas
       * criar o orçamento já leva a noiva a ORCAMENTO_ABERTO, então no caso
       * COMUM — ela aceita a proposta que a vendedora acabou de montar —
       * `avancarEtapaLead` devolve a mesma etapa e nada era gravado. Amarrar o
       * carimbo à mudança de etapa faria o selo do funil ficar apagado
       * justamente para quem ele existe.
       *
       * Por isso são duas decisões separadas: a etapa avança se estiver ATRÁS;
       * o carimbo grava o PRIMEIRO sim, aconteça o que acontecer com a etapa.
       */
      const etapaNova = avancarEtapaLead(lead.etapa, "ORCAMENTO_ABERTO");
      const mudouEtapa = etapaNova !== lead.etapa;
      const primeiroSim = !lead.aceiteEm;
      if (mudouEtapa || primeiroSim) {
        await tx.update(leadsTable)
          .set({
            ...(mudouEtapa ? { etapa: etapaNova, orcamentoAbertoEm: lead.orcamentoAbertoEm ?? agora } : {}),
            ...(primeiroSim ? { aceiteEm: agora } : {}),
            updatedAt: agora,
          })
          .where(eq(leadsTable.id, lead.id));
      }
    }

    // Direto na tabela, não pelo helper: o aceite não tem sessão — o autor é
    // a noiva, com usuarioId nulo e o nome desnormalizado, como o schema (E10)
    // sempre permitiu.
    await tx.insert(auditLogTable).values({
      id: randomUUID(),
      lojaId: orcamento.lojaId,
      usuarioId: null,
      usuarioNome: `${noivaNome} (link público)`,
      acao: "ORCAMENTO_ACEITO",
      entidade: "orcamento",
      entidadeId: orcamento.id,
      detalhe: { versao: numeroAtual, hash: versao?.hash ?? null },
    });
    return { ok: true, aceitoEm: atualizado.aceitoEm, gravadoAgora: true } as const;
  });
}
