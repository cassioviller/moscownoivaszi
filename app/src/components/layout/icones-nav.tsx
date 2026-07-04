// src/components/layout/icones-nav.tsx
// Mapa chave→ícone (line-art fino) para Sidebar e MobileNav. Puramente visual.
import type { ReactElement } from "react";

const svg = (children: ReactElement) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    strokeWidth={1.6}
    className="h-[17px] w-[17px] flex-none stroke-current"
  >
    {children}
  </svg>
);

export const ICONES_NAV: Record<string, ReactElement> = {
  painel: svg(
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  noivas: svg(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M17 8.5a3 3 0 0 1 0 5" />
      <path d="M18.5 20a5 5 0 0 0-3-4.6" />
    </>
  ),
  atendimentos: svg(
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 9h16M8 3v4M16 3v4" />
    </>
  ),
  agenda: svg(
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4M8 14h3M8 17h6" />
    </>
  ),
  // contratos (autorado): documento com linhas + assinatura
  contratos: svg(
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 12h5M9.5 15h5" />
      <path d="M9.5 18.5c.6-.7 1.3-.7 1.9 0s1.3.7 1.9 0" />
    </>
  ),
  // reservas (autorado): etiqueta/marcador
  reservas: svg(
    <>
      <path d="M11 3.5H5.5A2 2 0 0 0 3.5 5.5V11a2 2 0 0 0 .59 1.41l8 8a2 2 0 0 0 2.82 0l5.09-5.09a2 2 0 0 0 0-2.82l-8-8A2 2 0 0 0 11 3.5z" />
      <circle cx="8" cy="8" r="1.4" />
    </>
  ),
  provas: svg(
    <>
      <path d="M9 3l3 3 3-3M12 6v4M8 10h8l2.5 11H5.5L8 10z" />
    </>
  ),
  ajustes: svg(
    <>
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <path d="M8 7.5l12 9M8 16.5l12-9" />
    </>
  ),
  acervo: svg(
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  casamentos: svg(
    <>
      <circle cx="9" cy="15" r="4.5" />
      <circle cx="15.5" cy="9" r="4" />
    </>
  ),
  financeiro: svg(
    <>
      <path d="M12 2v20M8 6h6.5a2.5 2.5 0 0 1 0 5H9.5a2.5 2.5 0 0 0 0 5H16" />
    </>
  ),
  // equipe (autorado): grupo de pessoas
  equipe: svg(
    <>
      <circle cx="8.5" cy="8" r="2.8" />
      <circle cx="16.5" cy="9.5" r="2.2" />
      <path d="M3.5 20a5 5 0 0 1 10 0" />
      <path d="M14.2 20a4.2 4.2 0 0 1 6.3-3.6" />
    </>
  ),
  // permissoes (autorado): escudo
  permissoes: svg(
    <>
      <path d="M12 3l7 3v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V6z" />
      <path d="M9 12l2 2 4-4.5" />
    </>
  ),
  // admin (autorado): painel de controle
  admin: svg(
    <>
      <rect x="3.5" y="4" width="17" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
      <path d="M7 8.5h.01M11 8.5h.01" />
      <path d="M7 12h4" />
    </>
  ),
  // troca (autorado): setas de troca
  troca: svg(
    <>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </>
  ),
  config: svg(
    <>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L16.2 2h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2 1.2l.4 2.5h4l.4-2.5c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" />
    </>
  ),
};

export function iconeNav(chave: string): ReactElement | null {
  return ICONES_NAV[chave] ?? null;
}
