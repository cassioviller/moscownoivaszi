import { destruirSessao } from "../src/lib/auth/sessao";
destruirSessao("krUaftlXeDVaMyfxK_DcSmnqbLuVUi7S48P0HoRnKWU")
  .then(() => console.log("sessão de smoke removida"))
  .catch((e) => console.log("(já removida)", e.message))
  .finally(() => process.exit(0));
