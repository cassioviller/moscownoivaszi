import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // S-D34/E137 — o piso de 44px do alvo de toque, a MESMA grafia do
          // `button.tsx:39` e do `select.tsx` (S-D18): campo de texto também é
          // alvo de dedo, e a medição do E137 contava alvos por PAPEL clicável.
          // `min-h-11 md:min-h-9`, e não `md:h-9`: `min-h-11` sem prefixo vale
          // em toda largura e `min-height` limita a altura usada — a outra
          // forma deixaria o DESKTOP em 44px. Sem `h-`, o desktop fica no
          // mesmo 36px de antes (`min-h-9`). A varredura de
          // `lib/alvo-de-toque-varredura.test.ts` cobra esta linha.
          "flex min-h-11 md:min-h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
