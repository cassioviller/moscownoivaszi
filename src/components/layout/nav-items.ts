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

  // ATELIÊ — a jornada, em ordem. Telas ainda não construídas (Atendimentos,
  // Orçamentos, Provas) já entram como link; vão dar 404 até serem feitas.
  const atelie: NavItem[] = [];
  if (flags.podeVerNoivas) {
    atelie.push(
      { href: loja("/noivas"), label: "Noivas" },
      { href: loja("/atendimentos/novo"), label: "Agendar" },
      { href: loja("/agenda"), label: "Calendário" },
      { href: loja("/atendimentos"), label: "Atendimentos" },
      { href: loja("/orcamentos"), label: "Orçamentos" },
      { href: loja("/contratos/novo"), label: "Contratos" },
      { href: loja("/reservas"), label: "Reservas" },
      { href: loja("/provas"), label: "Provas" },
    );
  }
  // Ajustes tem gate próprio: é o lar de quem só cuida da costura. Entra no Ateliê
  // mesmo sem acesso a noivas.
  if (flags.podeVerAjustes) {
    atelie.push({ href: loja("/ajustes"), label: "Ajustes" });
  }

  // ACERVO — Vestidos sempre; Catálogo só com gestão do catálogo.
  const acervo: NavItem[] = [{ href: loja("/vestidos"), label: "Vestidos" }];
  if (flags.podeVerCatalogo) {
    acervo.push({ href: loja("/catalogo"), label: "Catálogo" });
  }

  // FINANCEIRO — telas ainda não construídas. Gate PROVISÓRIO = podeVerNoivas (papel
  // comercial). TODO: trocar por permissão própria de financeiro quando as telas
  // existirem (contas a receber/pagar são dados sensíveis).
  const financeiro: NavItem[] = [];
  if (flags.podeVerNoivas) {
    financeiro.push(
      { href: loja("/financeiro/receber"), label: "Contas a receber" },
      { href: loja("/financeiro/pagar"), label: "Contas a pagar" },
      // Fluxo de caixa é a raiz /financeiro; exact p/ não acender em /receber e /pagar.
      { href: loja("/financeiro"), label: "Fluxo de caixa", exact: true },
    );
  }

  // GESTÃO — só admin. Equipe e Trocar loja não são escopadas por loja.
  const gestao: NavItem[] = [];
  if (flags.podeGerenciarEquipe) {
    gestao.push(
      { href: "/equipe", label: "Equipe" },
      { href: loja("/permissoes"), label: "Permissões" },
    );
  }
  if (flags.isSuperAdmin) {
    gestao.push({ href: "/admin", label: "Administração" });
  }
  if (flags.mostrarTroca) {
    gestao.push({ href: "/selecionar-loja", label: "Trocar loja" });
  }

  const sections: NavSection[] = [
    { titulo: null, itens: [{ href: `/loja/${lojaId}`, label: "Início", exact: true }] },
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
