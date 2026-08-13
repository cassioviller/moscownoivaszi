import { describe, expect, it } from "vitest";
import {
  descricaoDoExpedienteDeRetirada,
  expedienteDeRetirada,
  foraDoExpedienteDeRetirada,
  EXPEDIENTE_DE_RETIRADA_PADRAO,
  LOCACAO_FIM_PADRAO,
  LOCACAO_INICIO_PADRAO,
  hhmmParaMinutos,
  minutosParaHHMM,
} from "@workspace/agenda-core";

/**
 * **E222 — o ateliê tem DOIS expedientes** (cláusulas 4ª e 5ª do instrumento).
 *
 * > **4ª** — funcionamento de **terça a sexta, 10:30–19:00**, e aos **sábados
 * > das 10:30 às 18:00**.
 *
 * A régua pura. O que as PORTAS fazem com ela está no arquivo irmão de API.
 *
 * Os instantes são escritos com offset `-03:00` de propósito: o expediente é do
 * ateliê, que fica em São José dos Campos, e a hora só existe num fuso. Lido em
 * UTC, um sábado às 18h vira 21h e cai fora do expediente sem que ninguém
 * entenda por quê — é a mesma nota que abre o `slots.ts`.
 */
describe("E222 — a régua do expediente de retirada (4ª)", () => {
  const exp = EXPEDIENTE_DE_RETIRADA_PADRAO;

  // 2026-08-11 é uma TERÇA; a semana inteira sai daqui.
  const terca = (hhmm: string) => `2026-08-11T${hhmm}:00-03:00`;
  const sabado = (hhmm: string) => `2026-08-15T${hhmm}:00-03:00`;
  const domingo = (hhmm: string) => `2026-08-16T${hhmm}:00-03:00`;
  const segunda = (hhmm: string) => `2026-08-17T${hhmm}:00-03:00`;

  describe("o dia", () => {
    it("terça a sexta a loja retira", () => {
      expect(foraDoExpedienteDeRetirada(terca("14:00"), exp)).toBeNull();
    });

    it("sábado também, e é o dia que fecha mais cedo", () => {
      expect(foraDoExpedienteDeRetirada(sabado("14:00"), exp)).toBeNull();
    });

    it("**domingo às 23h — o caso que o sistema aceitava calado**", () => {
      const r = foraDoExpedienteDeRetirada(domingo("23:00"), exp);
      expect(r?.motivo).toBe("DIA_FECHADO");
      expect(r?.detalhe).toContain("domingo");
    });

    it("segunda é fechado, e o recado diz o dia por extenso", () => {
      expect(foraDoExpedienteDeRetirada(segunda("14:00"), exp)?.detalhe).toContain("segunda");
    });
  });

  describe("a hora", () => {
    it("10:29 numa terça está fora — a cláusula abre 10:30", () => {
      const r = foraDoExpedienteDeRetirada(terca("10:29"), exp);
      expect(r?.motivo).toBe("FORA_DA_HORA");
      expect(r?.detalhe).toContain("10:29");
      expect(r?.detalhe).toContain("10:30 às 19:00");
    });

    it("10:30 em ponto entra — a abertura é inclusiva", () => {
      expect(foraDoExpedienteDeRetirada(terca("10:30"), exp)).toBeNull();
    });

    it("19:00 em ponto entra numa terça, e é a divergência declarada com a agenda", () => {
      // `slotsDoDia` recusa o fechamento porque PROVA tem duração; retirar é um
      // ato, e às 19:00 a loja ainda está aberta. Ver a nota do módulo.
      expect(foraDoExpedienteDeRetirada(terca("19:00"), exp)).toBeNull();
      expect(foraDoExpedienteDeRetirada(terca("19:01"), exp)?.motivo).toBe("FORA_DA_HORA");
    });

    it("**o sábado fecha às 18:00, e 18:30 é o caso que um número só erraria**", () => {
      // Meia hora que a quarta permite e o sábado não: é a razão de a coluna do
      // sábado existir.
      expect(foraDoExpedienteDeRetirada(terca("18:30"), exp)).toBeNull();
      const r = foraDoExpedienteDeRetirada(sabado("18:30"), exp);
      expect(r?.motivo).toBe("FORA_DA_HORA");
      expect(r?.detalhe).toContain("10:30 às 18:00");
    });
  });

  describe("o que NÃO é recusa", () => {
    it("data ausente passa — retirada e devolução são opcionais no contrato", () => {
      expect(foraDoExpedienteDeRetirada(null, exp)).toBeNull();
      expect(foraDoExpedienteDeRetirada(undefined, exp)).toBeNull();
    });

    it("data impossível de ler passa — a régua da 4ª não é a de formato", () => {
      expect(foraDoExpedienteDeRetirada("não é data", exp)).toBeNull();
    });
  });

  describe("o expediente EFETIVO", () => {
    it("loja sem regra recebe o do papel — régua ausente não vira régua que aceita tudo", () => {
      expect(expedienteDeRetirada(null)).toEqual(EXPEDIENTE_DE_RETIRADA_PADRAO);
      expect(expedienteDeRetirada(undefined)).toEqual(EXPEDIENTE_DE_RETIRADA_PADRAO);
    });

    it("a loja que edita manda, campo a campo", () => {
      const daLoja = expedienteDeRetirada({ retiradaDias: [1, 2, 3], retiradaAberturaMinutos: 480 });
      expect(daLoja.dias).toEqual([1, 2, 3]);
      expect(daLoja.aberturaMinutos).toBe(480);
      // O que ela não mandou continua sendo o do contrato.
      expect(daLoja.fechamentoMinutos).toBe(1140);
      expect(foraDoExpedienteDeRetirada("2026-08-17T09:00:00-03:00", daLoja)).toBeNull();
    });
  });

  describe("a descrição — é ela que o recado da recusa cita", () => {
    it("o expediente do contrato, por extenso", () => {
      expect(descricaoDoExpedienteDeRetirada(exp)).toBe(
        "terça a sexta, das 10:30 às 19:00; sábado, das 10:30 às 18:00",
      );
    });

    it("sem sábado, some a segunda metade — a frase não promete dia fechado", () => {
      expect(descricaoDoExpedienteDeRetirada({ ...exp, dias: [2, 3, 4, 5] })).toBe(
        "terça a sexta, das 10:30 às 19:00",
      );
    });

    it("dias soltos viram lista, não faixa", () => {
      expect(descricaoDoExpedienteDeRetirada({ ...exp, dias: [2, 5] })).toContain("terça, sexta");
    });
  });

  describe("a conversão que a TELA usa — uma grafia só", () => {
    it("minutos viram HH:MM com o zero à esquerda", () => {
      expect(minutosParaHHMM(630)).toBe("10:30");
      expect(minutosParaHHMM(1140)).toBe("19:00");
      expect(minutosParaHHMM(0)).toBe("00:00");
      expect(minutosParaHHMM(9 * 60)).toBe("09:00");
    });

    it("e voltam, que é o caminho do campo de hora do navegador", () => {
      expect(hhmmParaMinutos("10:30")).toBe(630);
      expect(hhmmParaMinutos(" 18:00 ")).toBe(1080);
      // O `<input type="time">` de alguns navegadores manda uma hora sem zero.
      expect(hhmmParaMinutos("9:05")).toBe(545);
    });

    it("o que não é hora devolve `null`, e a tela recusa antes de mandar", () => {
      expect(hhmmParaMinutos("")).toBeNull();
      expect(hhmmParaMinutos("24:00")).toBeNull();
      expect(hhmmParaMinutos("10:60")).toBeNull();
      expect(hhmmParaMinutos("10h30")).toBeNull();
    });

    it("ida e volta não perde nada nas quatro horas do contrato", () => {
      for (const m of [630, 1080, 1140, 0]) {
        expect(hhmmParaMinutos(minutosParaHHMM(m))).toBe(m);
      }
    });
  });

  describe("os defaults da 5ª", () => {
    it("a locação começa 10:30 e termina 18:00", () => {
      expect(LOCACAO_INICIO_PADRAO).toBe(10 * 60 + 30);
      expect(LOCACAO_FIM_PADRAO).toBe(18 * 60);
    });

    it("e os dois cabem no expediente da 4ª, inclusive no sábado", () => {
      expect(foraDoExpedienteDeRetirada(sabado("10:30"), exp)).toBeNull();
      expect(foraDoExpedienteDeRetirada(sabado("18:00"), exp)).toBeNull();
    });
  });
});
