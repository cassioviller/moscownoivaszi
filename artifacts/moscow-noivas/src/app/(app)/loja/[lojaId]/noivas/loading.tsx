// Noivas — grade de cards (2 colunas no desktop), espelhando a lista da jornada.
import { EsqueletoTela } from "@/components/EsqueletoTela";

export default function CarregandoNoivas() {
  return <EsqueletoTela largura="4xl" grade={{ classe: "grid-cols-1 sm:grid-cols-2", itens: 6, aspecto: "h-44" }} />;
}
