// Configuração de navegação compartilhada entre Sidebar (desktop) e MobileNav (drawer).
// PURA: só monta href/label a partir do lojaId + flags já resolvidas NO SERVIDOR.
// Não decide autorização — apenas esconde links por UX. Os gates reais vivem em
// cada page/layout/Server Action e permanecem intactos.

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

/** Mesma cobertura da navegação antiga do dashboard (paridade verificada na Fatia 2). */
export function navItems(lojaId: string, flags: NavFlags): NavItem[] {
  const items: NavItem[] = [
    { href: `/loja/${lojaId}`, label: "Início", exact: true },
  ];
  if (flags.podeVerNoivas) {
    items.push({ href: `/loja/${lojaId}/noivas`, label: "Noivas" });
    items.push({ href: `/loja/${lojaId}/atendimentos/novo`, label: "Agendar" });
    // Agenda (compromissos por janela) e Reservas (livro por casamento) derivam das
    // reservas noiva↔vestido; acompanham o acesso a noivas.
    items.push({ href: `/loja/${lojaId}/agenda`, label: "Calendário" });
    items.push({ href: `/loja/${lojaId}/reservas`, label: "Reservas" });
    items.push({ href: `/loja/${lojaId}/contratos/novo`, label: "Contrato" });
  }
  items.push({ href: `/loja/${lojaId}/vestidos`, label: "Vestidos" });
  // Ajustes (provas/ajustes da costureira) — independente de noivas: é o lar de
  // quem só cuida da costura.
  if (flags.podeVerAjustes) {
    items.push({ href: `/loja/${lojaId}/ajustes`, label: "Ajustes" });
  }
  if (flags.podeVerCatalogo) {
    items.push({ href: `/loja/${lojaId}/catalogo`, label: "Catálogo" });
  }
  if (flags.podeGerenciarEquipe) {
    items.push({ href: "/equipe", label: "Equipe" });
    items.push({ href: `/loja/${lojaId}/permissoes`, label: "Permissões" });
  }
  if (flags.isSuperAdmin) {
    items.push({ href: "/admin", label: "Administração" });
  }
  if (flags.mostrarTroca) {
    items.push({ href: "/selecionar-loja", label: "Trocar loja" });
  }
  return items;
}

export function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
