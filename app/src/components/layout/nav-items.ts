// Configuração de navegação compartilhada entre Sidebar (desktop) e MobileNav (drawer).
// PURA: só monta href/label a partir do lojaId + flags já resolvidas NO SERVIDOR.
// Não decide autorização — apenas esconde links por UX. Os gates reais vivem em
// cada page/layout/Server Action e permanecem intactos.
//
// Ordem = jornada da noiva (ver docs/MAPA_DE_TELAS.md). Itens agrupados em seções:
// Início · Ateliê (a jornada) · Acervo · Financeiro · Gestão.

export type NavFlags = {
  /** podeNoModulo(leads, ver) — resolvido no servidor */
  podeVerNoivas: boolean;
  /** podeNoModulo(config, ver) — gerência do catálogo */
  podeVerCatalogo: boolean;
  /** podeNoModulo(ajustes, ver) — tela da costureira (provas/ajustes) */
  podeVerAjustes: boolean;
  /** podeNoModulo(financeiro, ver) — receber/pagar/comissões (dado sensível) */
  podeVerFinanceiro: boolean;
  /** ehAdminDaLoja(usuario, loja) — resolvido no servidor */
  podeGerenciarEquipe: boolean;
  /** usuario.isSuperAdmin */
  isSuperAdmin: boolean;
  /** mostrarTrocaLoja(qtdLojas) — true só com >1 loja */
  mostrarTroca: boolean;
};

export type NavItem = {
  href: string;
  label: string;
  icone: string; // chave em ICONES_NAV (icones-nav.tsx)
  /** match exato (ex.: "Início" não deve acender em sub-rotas) */
  exact?: boolean;
};

export type NavSection = {
  /** rótulo da seção; null = grupo sem cabeçalho (Início) */
  titulo: string | null;
  itens: NavItem[];
};

/**
 * Navegação agrupada na ordem da jornada. Seções vazias (sem permissão) são
 * removidas no fim, então a barra nunca mostra um cabeçalho órfão.
 */
export function navSections(lojaId: string, flags: NavFlags): NavSection[] {
  const loja = (sufixo: string) => `/loja/${lojaId}${sufixo}`;

  // ATELIÊ — a jornada, em ordem. Atendimentos e Orçamentos não têm link próprio
  // na barra: vivem dentro do fluxo da noiva (Agendar → perfil → atendimento).
  const atelie: NavItem[] = [];
  if (flags.podeVerNoivas) {
    atelie.push(
      { href: loja("/noivas"), label: "Noivas", icone: "noivas" },
      { href: loja("/atendimentos/novo"), label: "Agendar", icone: "atendimentos" },
      { href: loja("/calendario"), label: "Calendário", icone: "agenda" },
      { href: loja("/contratos"), label: "Contratos", icone: "contratos" },
      { href: loja("/reservas"), label: "Reservas", icone: "reservas" },
    );
  }
  // Provas e Ajustes são operação de atelier: visíveis a quem vê noivas OU à costureira
  // (gate próprio). Espelha o guard da página /provas (leads:ver OU ajustes:ver).
  if (flags.podeVerNoivas || flags.podeVerAjustes) {
    atelie.push({ href: loja("/provas"), label: "Provas", icone: "provas" });
  }
  if (flags.podeVerAjustes) {
    atelie.push({ href: loja("/ajustes"), label: "Ajustes", icone: "ajustes" });
  }

  // ACERVO — Vestidos sempre; Catálogo só com gestão do catálogo.
  const acervo: NavItem[] = [{ href: loja("/vestidos"), label: "Vestidos", icone: "acervo" }];
  if (flags.podeVerCatalogo) {
    acervo.push({ href: loja("/catalogo"), label: "Catálogo", icone: "acervo" });
  }

  // FINANCEIRO — módulo próprio (dado sensível): receber, pagar, comissões e fluxo de caixa.
  const financeiro: NavItem[] = [];
  if (flags.podeVerFinanceiro) {
    financeiro.push(
      { href: loja("/financeiro/receber"), label: "Contas a receber", icone: "financeiro" },
      { href: loja("/financeiro/pagar"), label: "Contas a pagar", icone: "financeiro" },
      { href: loja("/financeiro/comissoes"), label: "Comissões", icone: "financeiro" },
      // Fluxo de caixa é a raiz /financeiro; exact p/ não acender em /receber e /pagar.
      { href: loja("/financeiro"), label: "Fluxo de caixa", icone: "financeiro", exact: true },
    );
  }

  // GESTÃO — só admin. Equipe e Trocar loja não são escopadas por loja.
  const gestao: NavItem[] = [];
  if (flags.podeGerenciarEquipe) {
    gestao.push(
      { href: "/equipe", label: "Equipe", icone: "equipe" },
      { href: loja("/permissoes"), label: "Permissões", icone: "permissoes" },
    );
  }
  if (flags.isSuperAdmin) {
    gestao.push({ href: "/admin", label: "Administração", icone: "admin" });
  }
  if (flags.mostrarTroca) {
    gestao.push({ href: "/selecionar-loja", label: "Trocar loja", icone: "troca" });
  }

  const sections: NavSection[] = [
    { titulo: null, itens: [{ href: `/loja/${lojaId}`, label: "Início", icone: "painel", exact: true }] },
    { titulo: "Ateliê", itens: atelie },
    { titulo: "Acervo", itens: acervo },
    { titulo: "Financeiro", itens: financeiro },
    { titulo: "Gestão", itens: gestao },
  ];

  return sections.filter((s) => s.itens.length > 0);
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
