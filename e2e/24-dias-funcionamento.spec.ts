import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E38: a loja configura em que dias da semana abre; agendar num dia fechado é
 * barrado no servidor (LOJA_FECHADA). Teste de API que fecha o domingo, prova a
 * recusa e a aceitação, e restaura a loja aberta todo dia (o padrão do seed).
 */

// Instante às 14:MM:SS no fuso da loja (-03:00) do próximo dia da semana `alvo`.
// `unico` espalha minutos/segundos para não bater na trava anti-corrida.
function noProximo(alvo: number, unico: boolean): string {
  const base = new Date();
  for (let i = 1; i <= 8; i++) {
    const ymd = new Date(base.getTime() + i * 86400_000).toISOString().slice(0, 10);
    if (new Date(`${ymd}T14:00:00-03:00`).getUTCDay() === alvo) {
      const mm = unico ? String(Math.floor(Date.now() / 1000) % 60).padStart(2, "0") : "00";
      const ss = unico ? String(Date.now() % 60).padStart(2, "0") : "00";
      return `${ymd}T14:${mm}:${ss}-03:00`;
    }
  }
  throw new Error("dia não encontrado");
}

test.describe("Dias de funcionamento (E38)", () => {
  test("agendar em dia fechado é barrado, em dia aberto passa", async ({ request }) => {
    await request.post(`${API_URL}/api/auth/login`, {
      data: { email: estado.adminEmail, senha: estado.senha },
    });
    await request.post(`${API_URL}/api/auth/selecionar-loja`, { data: { lojaId: estado.lojaId } });

    const equipe = await request.get(`${API_URL}/api/lojas/${estado.lojaId}/equipe`);
    const vendedoras = (await equipe.json()) as { usuarioId: string }[];
    const vendedoraId = vendedoras[0]!.usuarioId;

    const criar = (inicio: string) =>
      request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
        data: { leadId: estado.leadId, cabineId: "e2e-cabine-1", vendedoraId, tipo: "ATENDIMENTO", inicio },
      });
    const setDias = (diasFuncionamento: number[]) =>
      request.put(`${API_URL}/api/lojas/${estado.lojaId}/disponibilidade/regras`, { data: { diasFuncionamento } });

    try {
      // Fecha o domingo (0).
      expect((await setDias([1, 2, 3, 4, 5, 6])).status()).toBe(200);

      // Domingo → recusado com LOJA_FECHADA (a checagem é antes do insert).
      const fechado = await criar(noProximo(0, false));
      expect(fechado.status(), await fechado.text()).toBe(422);
      expect((await fechado.json()).error).toBe("LOJA_FECHADA");

      // Segunda (aberta) → criado.
      const aberto = await criar(noProximo(1, true));
      expect(aberto.status(), await aberto.text()).toBe(201);
    } finally {
      // Restaura a loja aberta todo dia para não poluir os outros specs.
      await setDias([0, 1, 2, 3, 4, 5, 6]);
    }
  });
});
