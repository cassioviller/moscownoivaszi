import { test, expect } from "@playwright/test";
import path from "node:path";
import { lerEstado, API_URL, criarAtendimentoLivre } from "./helpers";

const estado = lerEstado();

test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

/**
 * E38: a loja configura em que dias da semana abre; agendar num dia fechado é
 * barrado no servidor (LOJA_FECHADA). Teste de API que fecha o domingo, prova a
 * recusa e a aceitação, e restaura a loja aberta todo dia (o padrão do seed).
 */

// Instante às 14:00 no fuso da loja (-03:00) do próximo dia da semana `alvo`.
// Serve ao caso FECHADO (LOJA_FECHADA roda antes de qualquer ocupação); o caso
// ABERTO cria por `criarAtendimentoLivre`, que procura horário vago (E115).
function noProximo(alvo: number): string {
  const base = new Date();
  for (let i = 1; i <= 8; i++) {
    const ymd = new Date(base.getTime() + i * 86400_000).toISOString().slice(0, 10);
    if (new Date(`${ymd}T14:00:00-03:00`).getUTCDay() === alvo) {
      return `${ymd}T14:00:00-03:00`;
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

    // E115: cabine própria por execução (lição da S7). O POST passou a recusar
    // sobreposição de INTERVALO, e a `e2e-cabine-1` acumula sobras às 14:xx da
    // próxima segunda a cada run — a colisão deixou de ser rara para virar
    // determinística.
    const cab = await request.post(`${API_URL}/api/lojas/${estado.lojaId}/cabines`, {
      data: { nome: `e24-${Date.now()}` },
    });
    expect(cab.status(), await cab.text()).toBe(201);
    const cabineId = ((await cab.json()) as { id: string }).id;

    const criar = (inicio: string) =>
      request.post(`${API_URL}/api/lojas/${estado.lojaId}/atendimentos`, {
        data: { leadId: estado.leadId, cabineId, vendedoraId, tipo: "ATENDIMENTO", inicio },
      });
    const setDias = (diasFuncionamento: number[]) =>
      request.put(`${API_URL}/api/lojas/${estado.lojaId}/disponibilidade/regras`, { data: { diasFuncionamento } });

    try {
      // Fecha o domingo (0).
      expect((await setDias([1, 2, 3, 4, 5, 6])).status()).toBe(200);

      // Domingo → recusado com LOJA_FECHADA (a checagem é antes do insert).
      const fechado = await criar(noProximo(0));
      expect(fechado.status(), await fechado.text()).toBe(422);
      expect((await fechado.json()).error).toBe("LOJA_FECHADA");

      // Segunda (aberta) → criado em horário LIVRE (E115: o POST recusa
      // sobreposição de intervalo, e a vendedora compartilhada carrega sobras
      // de execuções passadas). E o spec APAGA o que criou, com o DELETE que
      // deixa trilha — sem isso cada execução alimentava a colisão seguinte
      // (a família da S18/S25).
      const criado = await criarAtendimentoLivre(request, estado.lojaId, {
        leadId: estado.leadId,
        cabineId,
        vendedoraId,
        ymd: noProximo(1).slice(0, 10),
      });
      const removido = await request.delete(
        `${API_URL}/api/lojas/${estado.lojaId}/atendimentos/${criado.id}`,
      );
      expect(removido.status()).toBe(204);
    } finally {
      // Restaura a loja aberta todo dia para não poluir os outros specs.
      await setDias([0, 1, 2, 3, 4, 5, 6]);
    }
  });
});
