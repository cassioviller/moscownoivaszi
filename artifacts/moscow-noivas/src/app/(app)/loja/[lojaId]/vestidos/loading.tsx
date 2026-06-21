// Acervo — grade de peças com capa 3:4 (2→3→4 colunas), espelhando a vitrine.
import { EsqueletoTela } from "@/components/EsqueletoTela";

export default function CarregandoVestidos() {
  return (
    <EsqueletoTela
      largura="5xl"
      grade={{ classe: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4", itens: 8, aspecto: "aspect-[3/4]" }}
    />
  );
}
