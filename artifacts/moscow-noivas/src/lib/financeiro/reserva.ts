/**
 * E218 — a reserva de 40% (cláusula 8ª §1º) e o prazo dos 20 dias antes da
 * retirada (§ único do objeto), reexportados do motor único.
 *
 * Mesma forma dos irmãos deste diretório (`dinheiro`, `plano`, `forma`): a
 * conta mora em `@workspace/financeiro-core` e a tela a consome por aqui, para
 * a régua ter uma grafia só nos dois lados da borda — é a lição do E187, onde
 * cinco grafias da mesma conta de desconto davam três acertos por cópia e dois
 * erros.
 */
export {
  RESERVA_PCT,
  PRAZO_ANTES_DA_RETIRADA_DIAS,
  entradaDaReserva,
  avisoDeEntradaAbaixoDaReserva,
  foraDoPrazoDaRetirada,
  type AvisoDeEntrada,
} from "@workspace/financeiro-core";
