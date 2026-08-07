import { afterAll, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireSessaoComLoja } from "../middlewares/auth";
import { fecharPool } from "./helpers";

/**
 * S32 — o guard é montado SEM path por onze routers em série, e o Express
 * atravessa todos até casar a rota: a mesma request o executava até 11 vezes
 * (22 consultas sequenciais no GET /dashboard — conferência de 2026-08-05).
 * A memoização por request pula o banco quando as três marcas já foram
 * penduradas por uma execução anterior DESTE guard na mesma request.
 *
 * A prova de que o ramo memoizado não toca o banco é por construção: os reqs
 * abaixo NÃO têm cookie de sessão — sem a memoização, o guard responderia 401
 * NAO_AUTENTICADO antes de qualquer consulta. Se ele passa, é porque decidiu
 * pelas marcas, não pela sessão do banco.
 *
 * Medido no dev server, 20 requests após aquecimento: mediana do
 * GET /dashboard caiu de 15,3 ms para 5,3 ms (−65%).
 */
describe("S32 — requireSessaoComLoja memoizado por request", () => {
  afterAll(async () => {
    await fecharPool();
  });

  function reqAutenticado(originalUrl: string): Request {
    return {
      sessao: { lojaAtivaId: "loja-a" },
      usuario: { id: "u1" },
      lojaAtiva: { id: "loja-a" },
      params: {},
      originalUrl,
      cookies: {},
    } as unknown as Request;
  }

  function resFake() {
    const res = {
      statusCode: 0,
      corpo: undefined as unknown,
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: unknown) {
        this.corpo = b;
        return this;
      },
    };
    return res as unknown as Response & { statusCode: number; corpo: unknown };
  }

  it("a segunda passagem da MESMA request não volta ao banco — decide pelas marcas", async () => {
    const req = reqAutenticado("/api/lojas/loja-a/leads");
    const res = resFake();
    const next = vi.fn();
    await requireSessaoComLoja(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it("a checagem de loja da URL continua valendo no ramo memoizado", async () => {
    const req = reqAutenticado("/api/lojas/loja-b/leads");
    const res = resFake();
    const next = vi.fn();
    await requireSessaoComLoja(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.corpo).toEqual({ error: "LOJA_DIVERGE_DA_SESSAO" });
  });

  it("sem as três marcas, o caminho cheio continua: sem cookie é 401", async () => {
    const req = {
      params: {},
      originalUrl: "/api/lojas/loja-a/leads",
      cookies: {},
    } as unknown as Request;
    const res = resFake();
    const next = vi.fn();
    await requireSessaoComLoja(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.corpo).toEqual({ error: "NAO_AUTENTICADO" });
  });

  it("requireSessao sozinho não arma o ramo — lojaAtiva só nasce neste guard", async () => {
    // O guard irmão (requireSessao) pendura sessao+usuario mas NUNCA
    // lojaAtiva: uma request que passou só por ele não pode pular a
    // verificação de loja daqui.
    const req = {
      sessao: { lojaAtivaId: "loja-a" },
      usuario: { id: "u1" },
      params: {},
      originalUrl: "/api/lojas/loja-a/leads",
      cookies: {},
    } as unknown as Request;
    const res = resFake();
    const next = vi.fn();
    await requireSessaoComLoja(req, res, next);
    // Sem cookie, o caminho cheio recusa — prova de que NÃO memoizou.
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
