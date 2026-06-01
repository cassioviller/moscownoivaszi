// src/components/ui/botao-confirmar.tsx
// Botão de submit que pede confirmação antes de prosseguir — para ações
// destrutivas (cancelar reserva). Sem modal (anti-pattern): usa o confirm nativo,
// que é bloqueante, acessível e suficiente para uma ferramenta interna. Se o
// usuário recusar, o submit é cancelado e o Server Action nem roda.
"use client";

export function BotaoConfirmar({
  children,
  className,
  mensagem,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  mensagem: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="submit"
      aria-label={ariaLabel}
      className={className}
      onClick={(e) => {
        if (!window.confirm(mensagem)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
