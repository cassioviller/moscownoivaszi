import { test, expect } from "@playwright/test";
import { entrarNaLoja, LOJA } from "./helpers";
import { criarNoivaE2E } from "./fixtures";

// Suíte COM MUTAÇÃO na loja efêmera `loja-e2e`. Agenda um atendimento escolhendo um
// slot livre da grade PELA UI real e confirma que a noiva entra na fila.
//
// Pré-requisitos do globalSetup (scripts/e2e-db.ts → setup):
//   - Cabine "Cabine E2E"
//   - RegraDisponibilidade abertura 9h / fechamento 19h → slots de 1h (09..18)
//   - Admin "Admin E2E" vinculado à loja → aparece como Vendedora (listarEquipe)
//
// Form real: src/app/(app)/loja/[lojaId]/atendimentos/novo/agendar-form.tsx
//   - Noiva/Cabine/Vendedora/Data são <select>/<input> com aria-label → getByLabel casa.
//   - A grade de horários só RENDERIZA quando Cabine + Vendedora + Data estão preenchidos
//     (prontoParaGrade) e é carregada de forma assíncrona (useTransition + server action).
//     Por isso a ordem importa: preenche a tríade ANTES de procurar o slot.
//   - Slot é <button type="button"> com rótulo "09:00 – 10:00" (EN-DASH); disabled quando
//     ocupado. Em data futura vazia (2030) todos os slots ficam livres.
//   - Submit "Agendar" só habilita após escolher um slot livre (horaValida).
//   - Sucesso → redirect /atendimentos/novo?ok=1 (actions.ts agendarAtendimentoAction).
test("agendar atendimento: escolhe slot livre e ele entra na fila", async ({ page }) => {
  const nome = `Noiva Agenda ${Date.now()}`;
  await criarNoivaE2E(nome); // pré-condição via Prisma (subprocess), não via UI

  await entrarNaLoja(page);
  await page.goto(`/loja/${LOJA}/atendimentos/novo`);

  // Tríade que destrava a grade. Ordem: Noiva, Cabine, Vendedora, Data.
  await page.getByLabel("Noiva").selectOption({ label: nome });
  await page.getByLabel("Cabine").selectOption({ label: "Cabine E2E" });
  await page.getByLabel("Vendedora").selectOption({ label: "Admin E2E" });
  await page.getByLabel("Data").fill("2030-06-03"); // data futura fixa: grade sem ocupação

  // A grade carrega assíncrona; aguarda o slot das 09h aparecer e habilitado.
  const slot = page.getByRole("button", { name: /09:00/ });
  await expect(slot).toBeEnabled();
  await slot.click();

  const agendar = page.getByRole("button", { name: "Agendar" });
  await expect(agendar).toBeEnabled();
  await agendar.click();
  await page.waitForURL(/atendimentos\/novo\?ok=1/);

  // A fila lista a noiva pelo nome (o atendimento de 2030 cai em "Próximos").
  await page.goto(`/loja/${LOJA}/atendimentos`);
  await expect(page.getByText(nome)).toBeVisible();
});
