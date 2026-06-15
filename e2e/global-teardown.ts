import { limparLojaE2E } from "./fixtures";

export default function globalTeardown(): void {
  limparLojaE2E();
}
