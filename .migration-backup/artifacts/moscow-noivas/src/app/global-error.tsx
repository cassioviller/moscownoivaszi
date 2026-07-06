"use client";
// Último anteparo: erro no próprio root layout. Substitui o documento inteiro, então NÃO
// herda globals.css — estilos inline mínimos, na paleta marfim/bordô, p/ não cair no
// overlay cru do Next nem numa tela branca. Casos normais são tratados por loja/error.tsx.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fbf7f1",
          color: "#2d2523",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontWeight: 300, fontSize: 24, margin: "0 0 8px" }}>Algo saiu do lugar</h1>
          <p style={{ fontSize: 14, color: "#7f7068", margin: "0 0 20px", lineHeight: 1.5 }}>
            Tivemos um problema inesperado. Tente novamente em instantes.
          </p>
          <button
            onClick={() => reset()}
            style={{
              minHeight: 44,
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#7a1836",
              color: "#fffdf9",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
