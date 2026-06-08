// scripts/dev.mjs
// Sobe `next dev` (HMR intacto, stdout/stderr herdados) e dispara o warmup em paralelo.
// O warmup se vira sozinho: espera o servidor responder e então aquece as rotas, sem
// interferir no compilador. Encerrar (Ctrl-C) derruba os dois.
//
// Use via `npm run dev:warm`. O `npm run dev` puro continua existindo, sem warmup.
import { spawn } from "node:child_process";

// Args repassados ao next dev (ex.: no Replit, `-p 5000`). Extraímos porta/host daqui
// para o warmup mirar a URL certa — a porta vem do flag, não de $PORT.
const args = process.argv.slice(2);
function flag(...nomes) {
  for (const n of nomes) {
    const i = args.indexOf(n);
    if (i >= 0 && args[i + 1]) return args[i + 1];
  }
  return undefined;
}
const porta = flag("-p", "--port") || process.env.PORT || "3000";
const host = flag("-H", "--hostname") || "localhost";
const warmupUrl = process.env.WARMUP_URL || `http://${host}:${porta}`;

// Spawn via node + bin do next (evita depender do shim de .bin / permissões).
const nextBin = new URL("../node_modules/next/dist/bin/next", import.meta.url).pathname;

const next = spawn(process.execPath, [nextBin, "dev", ...args], {
  stdio: "inherit",
  env: process.env,
});

const warmupScript = new URL("./warmup.mjs", import.meta.url).pathname;
const warmup = spawn(process.execPath, [warmupScript], {
  stdio: "inherit",
  env: { ...process.env, WARMUP_URL: warmupUrl },
});

function encerrar(sinal) {
  for (const p of [next, warmup]) {
    if (!p.killed) p.kill(sinal);
  }
}
process.on("SIGINT", () => encerrar("SIGINT"));
process.on("SIGTERM", () => encerrar("SIGTERM"));

// O ciclo de vida segue o next dev: quando ele sai, o processo todo sai.
next.on("exit", (code, signal) => {
  if (!warmup.killed) warmup.kill("SIGTERM");
  process.exit(code ?? (signal ? 1 : 0));
});
