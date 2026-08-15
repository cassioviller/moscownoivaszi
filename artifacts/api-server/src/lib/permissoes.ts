/**
 * Permissões por MÓDULO × AÇÃO.
 *
 * O modelo antigo era plano — `{ leads: true }` — e respondia só "entra ou não
 * entra". Não dava para deixar alguém ver o financeiro sem poder mexer nele,
 * que é a pergunta que o atelier faz o tempo todo. Agora cada módulo tem
 * `{ ver, criar, editar }`.
 *
 * Duas regras que valem para sempre:
 *
 * 1. **A fonte da verdade do shape é o CÓDIGO, nunca o banco.** O jsonb aceita
 *    qualquer coisa; `normalizarAcessos` reconcilia o que veio contra
 *    MODULOS × ACOES. Chave desconhecida é descartada, ausente é `false`
 *    (fail-closed) — um módulo novo não nasce liberado para todo mundo porque
 *    ninguém lembrou de atualizar as linhas antigas.
 *
 * 2. **`criar` ou `editar` implica `ver`.** Poder criar um lead sem poder abrir
 *    a lista é um estado incoerente que a interface não sabe desenhar.
 */

/**
 * Os módulos, e por que `orcamentos` e `contratos` deixaram de morar dentro de
 * `leads` (E172).
 *
 * Até 2026-08-12 o módulo `leads` governava três itens de menu — o próprio
 * rótulo da tela dizia "Noivas, orçamentos e contratos" — e com isso **quem
 * cadastrava a noiva assinava o contrato dela**: `POST /contratos` não declara
 * ação, o guard de prefixo deriva `criar` do método, e a Recepção tinha
 * `leads: {ver, criar}`. O botão "Gerar contrato" da tela do orçamento aparecia
 * para ela e funcionava, num contrato de R$ 5.000,00 (S-O40).
 *
 * O conserto não cabia no eixo das AÇÕES: a Recepção precisa de `editar` para
 * corrigir o telefone que ela mesma digitou (S-O41), e `editar` em `leads`
 * traria o contrato junto de novo. **Módulo × ação não tem grão mais fino que
 * isto** — então o que precisa se separar vira MÓDULO, e é o que aconteceu
 * duas vezes no mesmo dia:
 *
 * - `contratos` levou o contrato e as PARCELAS dele (`contratos.ts:63,98`);
 * - `orcamentos` levou a proposta inteira (`orcamentos.ts:166`).
 *
 * O segundo é a lição mais cara do épico, e ela custou uma medição: fechar só
 * o contrato deixava a Recepção **aprovando o orçamento**, que é o passo
 * imediatamente anterior — `POST /orcamentos/:id/aprovar` pedia
 * `leads: editar`, a mesma ação que corrige um telefone. Medido em 2026-08-12
 * com o perfil novo: aprovar respondia **404**, não 403 — ela atravessava o
 * gate e só não achava o id. O aceite congela a versão que o gate do E115
 * confere contra o contrato: quem aprova decide o preço que o contrato cobra.
 *
 * A régua que fica: **fechar uma porta sem medir a porta ao lado dela é meio
 * conserto.** O contrato e o aceite eram a mesma decisão vista em dois pontos.
 *
 * O que ficou em `leads` é a FICHA DA NOIVA — cadastro, funil, interesse,
 * lookbook, histórico de contato e o acesso dela ao portal. É o que a Recepção
 * cuida, e agora `leads` quer dizer exatamente isso.
 */
export const MODULOS = [
  "leads",
  "orcamentos",
  "contratos",
  "agenda",
  "vestidos",
  "financeiro",
  "comissao",
  "admin",
] as const;
export const ACOES = ["ver", "criar", "editar"] as const;

export type Modulo = (typeof MODULOS)[number];
export type Acao = (typeof ACOES)[number];
export type AcessosModulos = Record<Modulo, Record<Acao, boolean>>;

/**
 * Reconcilia um `acessosModulos` cru contra o shape atual.
 *
 * Aceita o formato PLANO antigo (`{ leads: true }`) e o traduz: `true` valia
 * "acesso ao módulo inteiro", então vira ver+criar+editar. Não é um alargamento
 * de permissão — é o que aquele `true` já significava. A ponte fica porque uma
 * linha não migrada tem que continuar respondendo o mesmo, e porque um perfil
 * gravado antes da mudança não deve ser silenciosamente trancado para fora.
 */
export function normalizarAcessos(raw: unknown): AcessosModulos {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as AcessosModulos;

  for (const modulo of MODULOS) {
    const valor = src[modulo];

    if (valor === true) {
      out[modulo] = { ver: true, criar: true, editar: true };
      continue;
    }
    if (valor === false || valor == null || typeof valor !== "object") {
      out[modulo] = { ver: false, criar: false, editar: false };
      continue;
    }

    const mod = valor as Record<string, unknown>;
    const criar = mod.criar === true;
    const editar = mod.editar === true;
    out[modulo] = { ver: mod.ver === true || criar || editar, criar, editar };
  }

  return out;
}

/**
 * Os acessos que de fato valem. Havendo override para o perfil×loja, ele
 * SUBSTITUI o template — não se mistura com ele. Um override meio-aplicado
 * seria impossível de auditar ("de onde veio esse acesso?").
 */
export function resolverAcessosEfetivos(template: unknown, override: unknown | null): AcessosModulos {
  return normalizarAcessos(override != null ? override : template);
}

/** Pode a ação neste módulo? Fail-closed: o que não foi concedido, não pode. */
export function podeNoModulo(acessos: unknown, modulo: string, acao: Acao): boolean {
  if (!(MODULOS as readonly string[]).includes(modulo)) return false;
  return normalizarAcessos(acessos)[modulo as Modulo][acao] === true;
}

/**
 * A ação que um método HTTP exige. GET lê; POST cria; PATCH/PUT/DELETE alteram.
 * DELETE é `editar` e não uma ação própria: quem pode alterar a agenda pode
 * desmarcar dela — separar isso criaria uma quarta coluna que ninguém pediu.
 */
export function acaoDoMetodo(metodo: string): Acao {
  const m = metodo.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return "ver";
  if (m === "POST") return "criar";
  return "editar";
}

/**
 * Os POST que MUTAM um recurso existente em vez de criar um. O caminho termina
 * num verbo, e o verbo é quem diz a verdade sobre a ação — o método não.
 *
 * A lista tem de cobrir TODA rota que declara `requireModulo(mod, "editar")`
 * explicitamente, porque o guard de prefixo do router roda ANTES dela e deriva
 * a ação daqui. Faltando um verbo, a rota passa a exigir as DUAS ações: a
 * derivada (`criar`) e a declarada (`editar`) — e o perfil que tem só `editar`
 * leva 403 numa ação que ele pode fazer. Foi o que aconteceu com `receber`:
 * a gerente com `{ ver, criar: false, editar }` — estado válido e comum, quem
 * revisa noiva cadastrada por outra sem abrir lead novo — não conseguia
 * registrar o Pix de R$ 700 pago no balcão, e a mensagem culpava "criar".
 *
 * E172/S-O24: `desfazer-aceite` era o `receber` outra vez, com outro nome. A
 * rota declara `requireModulo("leads", "editar")` e o guard de prefixo derivava
 * `criar` — então ela exigia as DUAS ações, e a gerente com `{ver, editar}` e
 * sem `criar` levava 403 ao desfazer um aceite registrado por engano, que é
 * exatamente o trabalho dela. O hífen no meio do verbo é o motivo de a
 * varredura do E101 não a ter visto: ela procurava `/:id/<palavra>`.
 */
export const POST_QUE_MUTA =
  /\/(cancelar|estornar|receber|pagar|cobrar|aprovar|recusar|reenviar|expurgo|contato|link|baixa|confirmar|remarcar|marcar|enviar|desfazer-aceite|trocar-peca)$/;

/**
 * POSTs que mutam mas cujo caminho termina em SUBSTANTIVO, não em verbo — a
 * exceção, um caminho por linha, com o porquê:
 *
 * - `/financeiro/pagamentos` é a MESMA operação da porta irmã
 *   `/contas-pagar/:id/pagar` (quitarContas, e a irmã declara `editar` desde o
 *   E101): a saída multi-conta muta as contas que quita. Sem esta entrada, o
 *   perfil só-`criar` pagava as contas do mês e a gerente só-`editar` levava
 *   403 — na única porta que a tela de Pagar usa (E115).
 */
export const POST_QUE_MUTA_POR_CAMINHO = /\/financeiro\/pagamentos$/;

/**
 * Ação exigida a partir do método E do caminho. Cancelar/estornar/receber e os
 * outros verbos de `POST_QUE_MUTA` são POST mas alteram um recurso que já
 * existe — são `editar`, não `criar`. Sem isto, um perfil com `criar` e sem
 * `editar` (estado válido) cancelava contrato e estornava recebimento: o guard
 * derivava `criar` do método e a rota mentia sobre o que faz.
 *
 * E115: `marcar` e `enviar` entraram na lista — `conciliacao/marcar` e
 * `contabilidade/enviar` carimbam linhas EXISTENTES (a segunda é "a escrita
 * mais irreversível do financeiro" nas palavras do próprio código), e derivavam
 * `criar`: a estagiária com `{ver, criar}` fechava o mês à contadora, e a
 * gerente com `{ver, editar}` levava 403 numa ação dela. A varredura do E101
 * não via nenhuma das duas, porque só inspecionava POSTs na forma
 * `/:id/<verbo>` — estas duas são `<literal>/<verbo>`.
 */
export function acaoDoRequest(metodo: string, caminho: string): Acao {
  if (
    metodo.toUpperCase() === "POST" &&
    (POST_QUE_MUTA.test(caminho) || POST_QUE_MUTA_POR_CAMINHO.test(caminho))
  ) {
    return "editar";
  }
  return acaoDoMetodo(metodo);
}
